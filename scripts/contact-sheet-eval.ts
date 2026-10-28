#!/usr/bin/env bun
// scripts/contact-sheet-eval.ts — #557 contact-sheet quality/cost eval runner.
//
// The dataset (videos, labels, question set, variants) lives in
// cli/lib/eval/calibration-datasets/contact-sheet-digest.json. Videos are
// referenced by path relative to `.ralphy/workspaces/` and are READ-ONLY:
// every digest this script builds goes to `.ralphy/cache/digest-eval/`.
//
// Subcommands:
//   build  --variants A1,A2 [--videos v01,v02]
//          Build one digest per (variant, video) with the library entry point
//          (cli/lib/ref-digest.ts → buildDigest) and write an answer PACKET per
//          variant at blind/<variant>/packet.json: sheet copies + tile ->
//          timestamp map + duration/resolution. The blind folder deliberately
//          omits digest.json (the detector's cut list) and any transcript, so
//          an analyzer answers from the sheets alone.
//   score  [--out docs/research/contact-sheet-eval-results.json]
//          Read every `blind/<variant>/answers.json`, score it against the labels
//          (cli/lib/eval/digest-eval.ts), and write the results JSON plus a
//          markdown table on stdout.
//
// No provider or network calls. The analyzer is the agent's own vision: a
// blind session per variant reads the packet's sheets and writes answers.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDigest, type DigestMode } from "../cli/lib/ref-digest.js";
import {
  QUESTION_KEYS,
  aggregateScores,
  paretoFront,
  scoreAnswer,
  type DigestEvalAnswer,
  type DigestEvalLabels,
  type QuestionScores,
} from "../cli/lib/eval/digest-eval.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const DATASET = path.join(REPO, "cli", "lib", "eval", "calibration-datasets", "contact-sheet-digest.json");
const WORKSPACES = path.join(REPO, ".ralphy", "workspaces");
const EVAL_ROOT = path.join(REPO, ".ralphy", "cache", "digest-eval");

interface Variant {
  id: string;
  phase: string;
  mode: DigestMode;
  everySec: number;
  tilesPerSheet: number;
  tileWidth?: number;
  maxSheets: number;
}

interface DatasetVideo {
  id: string;
  path: string;
  durationSec: number;
  labels: DigestEvalLabels | null;
}

interface Dataset {
  variants: Variant[];
  videos: DatasetVideo[];
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function loadDataset(): Dataset {
  return JSON.parse(fs.readFileSync(DATASET, "utf8")) as Dataset;
}

async function build(): Promise<void> {
  const ds = loadDataset();
  const variantIds = arg("variants")?.split(",");
  const videoIds = arg("videos")?.split(",");
  const variants = ds.variants.filter((v) => !variantIds || variantIds.includes(v.id));
  const videos = ds.videos.filter((v) => !videoIds || videoIds.includes(v.id));
  for (const variant of variants) {
    const vdir = path.join(EVAL_ROOT, variant.id);
    fs.mkdirSync(vdir, { recursive: true });
    const packet: { variant: string; videos: unknown[] } = { variant: variant.id, videos: [] };
    const stats: Record<string, unknown> = {};
    for (const video of videos) {
      const bundle = path.join(vdir, video.id);
      const digestPath = path.join(bundle, "digest.json");
      if (!fs.existsSync(digestPath)) {
        await buildDigest({
          videoPath: path.join(WORKSPACES, video.path),
          bundleDir: bundle,
          input: video.path,
          mode: variant.mode,
          everySec: variant.everySec,
          tilesPerSheet: variant.tilesPerSheet,
          tileWidth: variant.tileWidth,
          maxSheets: variant.maxSheets,
          transcript: { skipped: "eval: sheets-only analyzer" },
        });
      }
      const d = JSON.parse(fs.readFileSync(digestPath, "utf8"));
      stats[video.id] = {
        buildMs: d.cost.buildMs,
        visionTokens: d.cost.visionTokens,
        sheets: d.sheets.length,
        frames: d.sampling.frameCount,
        tileWidth: d.layout.tileWidth,
        durationSec: d.video.durationSec,
      };
      // Blind copies: the analyzer gets sheets in a folder WITHOUT digest.json,
      // so the detector's cut list cannot leak into a sheets-only answer.
      const blind = path.join(EVAL_ROOT, "blind", variant.id, video.id);
      fs.mkdirSync(blind, { recursive: true });
      for (const s of d.sheets) {
        const dst = path.join(blind, s.file);
        if (!fs.existsSync(dst)) fs.copyFileSync(path.join(bundle, s.file), dst);
      }
      packet.videos.push({
        id: video.id,
        durationSec: d.video.durationSec,
        width: d.video.width,
        height: d.video.height,
        sheets: d.sheets.map((s: any) => ({
          path: path.join(blind, s.file),
          tiles: s.frames.map((f: any) => ({ tile: f.tile, t: f.t })),
        })),
      });
      process.stderr.write(`${variant.id} ${video.id} sheets=${d.sheets.length} tokens=${d.cost.visionTokens}\n`);
    }
    fs.writeFileSync(path.join(EVAL_ROOT, "blind", variant.id, "packet.json"), JSON.stringify(packet, null, 1));
    fs.writeFileSync(path.join(vdir, "build.json"), JSON.stringify(stats, null, 1));
  }
}

function score(): void {
  const ds = loadDataset();
  const outPath = arg("out") ?? path.join(REPO, "docs", "research", "contact-sheet-eval-results.json");
  const results: Record<string, unknown>[] = [];
  for (const variant of ds.variants) {
    const answersPath = path.join(EVAL_ROOT, "blind", variant.id, "answers.json");
    const buildPath = path.join(EVAL_ROOT, variant.id, "build.json");
    if (!fs.existsSync(answersPath) || !fs.existsSync(buildPath)) continue;
    const answers = JSON.parse(fs.readFileSync(answersPath, "utf8")) as Record<string, DigestEvalAnswer>;
    const stats = JSON.parse(fs.readFileSync(buildPath, "utf8")) as Record<string, any>;
    const perVideo: Record<string, QuestionScores> = {};
    for (const video of ds.videos) {
      const a = answers[video.id];
      if (!a || !video.labels) continue;
      perVideo[video.id] = scoreAnswer(a, video.labels);
    }
    const ids = Object.keys(perVideo);
    const totalTokens = ids.reduce((s, id) => s + (stats[id]?.visionTokens ?? 0), 0);
    const totalSec = ids.reduce((s, id) => s + (stats[id]?.durationSec ?? 0), 0);
    const totalBuildMs = ids.reduce((s, id) => s + (stats[id]?.buildMs ?? 0), 0);
    results.push({
      variant: variant.id,
      phase: variant.phase,
      mode: variant.mode,
      everySec: variant.everySec,
      tilesPerSheet: variant.tilesPerSheet,
      tileWidth: variant.tileWidth ?? "fit",
      videos: ids.length,
      scores: aggregateScores(Object.values(perVideo)),
      tokensPerMinute: totalSec > 0 ? Math.round((totalTokens / totalSec) * 60) : null,
      meanTokensPerVideo: ids.length ? Math.round(totalTokens / ids.length) : null,
      buildMsPerMinute: totalSec > 0 ? Math.round((totalBuildMs / totalSec) * 60) : null,
      perVideo,
      // Stored answers keep the repo English-only: non-Latin words are removed
      // AFTER scoring (the scorer's tokenizer ignores them anyway).
      answers: stripNonLatin(answers),
    });
  }
  const front = paretoFront(
    results.map((r: any) => ({ variant: r.variant, quality: r.scores.overall ?? 0, cost: r.tokensPerMinute ?? 0 })),
  );
  fs.writeFileSync(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), dataset: path.relative(REPO, DATASET), pareto: front, results }, null, 1) + "\n",
  );
  const head = ["variant", ...QUESTION_KEYS, "overall", "tok/min", "build ms/min"];
  const lines = [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`];
  for (const r of results as any[]) {
    const cells = [r.variant, ...QUESTION_KEYS.map((k) => fmt(r.scores[k])), fmt(r.scores.overall), r.tokensPerMinute, r.buildMsPerMinute];
    lines.push(`| ${cells.join(" | ")} |`);
  }
  console.log(lines.join("\n"));
  console.log(`\nPareto front (overall vs tokens/min): ${front.map((p) => p.variant).join(", ")}`);
}

function stripNonLatin<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) =>
      typeof v === "string" ? v.replace(/\p{Script=Cyrillic}+/gu, "").replace(/[ \t]{2,}/g, " ").trim() : v,
    ),
  ) as T;
}

function fmt(n: number | null): string {
  return n === null || n === undefined ? "—" : n.toFixed(2);
}

const sub = process.argv[2];
if (sub === "build") await build();
else if (sub === "score") score();
else {
  console.error("usage: bun run scripts/contact-sheet-eval.ts build|score [--variants ids] [--videos ids] [--out path]");
  process.exit(1);
}
