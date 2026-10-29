// SFX pack harvest (#563).
//
// Scans every project's `artifacts/sfx/` tree under the data root, COPIES each
// unique sound into the shared pack at `.ralphy/catalog/sfx/<tag>/<id>.mp3`,
// and records `.ralphy/catalog/sfx/manifest.json`.
//
// Append-only (AGENTS.md invariant 14): source project files are only read,
// never moved, renamed, or rewritten. A normalized copy that already exists in
// the pack is kept as is (re-runs only add new sounds).
//
// Dedupe runs in two passes: exact byte identity (sha256), then a coarse RMS
// envelope fingerprint that catches the same sound re-encoded (wav vs mp3,
// different bitrate). Loudness normalization goes through the existing
// `loudnorm` recipe in cli/lib/ffmpeg-recipes.ts; before/after levels come from
// the `audioStats` recipe.

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { audioStats, decodeMonoPcm, loudnorm } from "../ffmpeg-recipes.js";
import { workspace } from "../paths.js";
import { catalogSfxDir, catalogSfxManifestPath } from "./paths.js";
import { SfxManifestSchema, type SfxEntry, type SfxManifest, type SfxTag } from "./schema.js";

export const SFX_AUDIO_EXTS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"]);
export const SFX_LOUDNESS_TARGET = -16;
export const SFX_TRUE_PEAK = -1.5;

export type SfxSource = { workspace: string; project: string; file: string; abs: string };

/**
 * Keyword tagger. Order matters: the first rule whose keyword occurs in the
 * file stem wins, so motion-design tags (glitch, riser, whoosh, ...) beat the
 * broad buckets (vocal, ambience, foley).
 */
const TAG_RULES: Array<[SfxTag, string[]]> = [
  ["glitch", ["glitch", "zap", "static", "tv-off", "scratch", "noclip", "stutter", "bitcrush", "error"]],
  ["riser", ["riser", "tension", "build", "swell", "reveal", "uplift"]],
  ["whoosh", ["whoosh", "swish", "-rush", "pass", "-air-", "launch", "fly", "wing"]],
  ["swoosh", ["swoosh", "swipe", "snap", "sweep", "slide", "zip"]],
  ["impact", ["impact", "boom", "thud", "slam", "stomp", "sub-", "landing", "punch", "crash", "burst", "drop"]],
  ["hit", ["hit", "clang", "clank", "thunk", "bell", "dun-dun", "stab", "knock", "ding", "fanfare"]],
  ["pop", ["pop", "bubble", "pluck", "confirm", "plop", "blip"]],
  ["click", ["click", "tick", "beep", "ping", "tap", "touch", "select", "pen-paper"]],
  ["vocal", ["giggle", "laugh", "scream", "shriek", "groan", "-ow-", "gasp", "inhale", "-ah", "-oh", "huh", "hmm", "-mm", "meow", "howl", "cackle", "yep", "purr", "snuffle", "crowd"]],
  ["ambience", ["amb", "room-tone", "wind", "hum", "buzz", "drone", "birds", "tone", "bed", "loop", "siren", "vent", "steam", "tinnitus", "otherworld", "magic", "dawn", "relief", "release"]],
  ["foley", ["step", "door", "knife", "gun", "blade", "sabre", "drip", "splash", "fire", "crackle", "creak", "glass", "mud", "crawl", "chest", "cig", "heel", "claw", "pipe", "water", "wave", "car-", "train", "airlock", "grind", "jam", "climb", "scrape", "poltergeist", "aim", "torch", "conveyor", "eject"]],
];

export function tagForSfxName(file: string): SfxTag {
  const stem = path.basename(file).toLowerCase().replace(/\.[a-z0-9]+$/, "");
  const padded = `-${stem}-`;
  for (const [tag, words] of TAG_RULES) {
    if (words.some((w) => padded.includes(w))) return tag;
  }
  return "misc";
}

/** `<stem>.raw.<ext>` is an untrimmed intermediate of `<stem>.<ext>`; skip it when the sibling exists. */
export function isRawIntermediate(file: string, siblings: Set<string>): boolean {
  const base = path.basename(file);
  const m = base.match(/^(.*)\.raw\.([a-z0-9]+)$/i);
  if (!m) return false;
  return siblings.has(`${m[1]}.${m[2]}`);
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let ents: import("node:fs").Dirent[];
  try {
    ents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(abs)));
    else if (e.isFile() && SFX_AUDIO_EXTS.has(path.extname(e.name).toLowerCase())) out.push(abs);
  }
  return out;
}

/** Every audio file under `.ralphy/workspaces/<ws>/projects/<id>/artifacts/sfx/`, sorted for determinism. */
export async function scanSfxSources(dataRoot: string = workspace()): Promise<{ sources: SfxSource[]; skippedRaw: number }> {
  const wsRoot = path.join(dataRoot, "workspaces");
  const sources: SfxSource[] = [];
  let skippedRaw = 0;
  let workspaces: string[] = [];
  try {
    workspaces = (await fs.readdir(wsRoot, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return { sources, skippedRaw };
  }
  for (const ws of workspaces) {
    let projects: string[] = [];
    try {
      projects = (await fs.readdir(path.join(wsRoot, ws, "projects"), { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    } catch {
      continue;
    }
    for (const project of projects) {
      const sfxDir = path.join(wsRoot, ws, "projects", project, "artifacts", "sfx");
      const files = (await walk(sfxDir)).sort();
      const byDir = new Map<string, Set<string>>();
      for (const f of files) {
        const d = path.dirname(f);
        if (!byDir.has(d)) byDir.set(d, new Set());
        byDir.get(d)!.add(path.basename(f));
      }
      for (const abs of files) {
        if (isRawIntermediate(abs, byDir.get(path.dirname(abs))!)) {
          skippedRaw += 1;
          continue;
        }
        sources.push({ workspace: ws, project, file: path.relative(sfxDir, abs), abs });
      }
    }
  }
  return { sources, skippedRaw };
}

export const FINGERPRINT_BINS = 32;

/**
 * Coarse audio fingerprint, two 32-bin lanes (one hex char per bin):
 * - lane 1: RMS per 20 ms frame, resampled to 32 bins, normalized to the
 *   loudest bin, quantized to 4 bits (gain-invariant loudness envelope);
 * - lane 2: zero-crossing rate per bin, quantized to 4 bits (a cheap
 *   brightness proxy, so two different sounds with the same attack/decay
 *   shape and length do not collapse).
 * Codec-invariant enough to collapse re-encodes of the same sound (decode is
 * 8 kHz mono, below any mp3 low-pass); deliberately too coarse to be a
 * perceptual-similarity search.
 */
export function envelopeFingerprint(samples: Int16Array, sampleRate = 8000): { hex: string; durationSec: number } {
  const frame = Math.max(1, Math.round(sampleRate * 0.02));
  const rms: number[] = [];
  const zcr: number[] = [];
  for (let i = 0; i < samples.length; i += frame) {
    let sum = 0;
    let crossings = 0;
    const end = Math.min(samples.length, i + frame);
    for (let j = i; j < end; j++) {
      sum += samples[j]! * samples[j]!;
      if (j > i && (samples[j]! >= 0) !== (samples[j - 1]! >= 0)) crossings += 1;
    }
    rms.push(Math.sqrt(sum / Math.max(1, end - i)));
    zcr.push(crossings / Math.max(1, end - i - 1));
  }
  const binned = (lane: number[]): number[] => {
    const out: number[] = [];
    for (let b = 0; b < FINGERPRINT_BINS; b++) {
      const from = Math.floor((b * lane.length) / FINGERPRINT_BINS);
      const to = Math.max(from + 1, Math.floor(((b + 1) * lane.length) / FINGERPRINT_BINS));
      let acc = 0;
      let n = 0;
      for (let k = from; k < to && k < lane.length; k++) {
        acc += lane[k]!;
        n += 1;
      }
      out.push(n ? acc / n : 0);
    }
    return out;
  };
  const r = binned(rms);
  const z = binned(zcr);
  const max = Math.max(...r, 1e-9);
  const q = (v: number) => Math.min(15, Math.max(0, Math.round(v * 15))).toString(16);
  const hex = r.map((v) => q(v / max)).join("") + z.map((v) => q(v * 2)).join("");
  return { hex, durationSec: samples.length / sampleRate };
}

/**
 * Two fingerprints describe the same sound: durations within 3 %, mean
 * envelope-bin delta at most 0.75 and mean brightness-bin delta at most 0.75.
 */
export function fingerprintsMatch(a: { hex: string; durationSec: number }, b: { hex: string; durationSec: number }): boolean {
  if (a.hex.length !== b.hex.length || a.hex.length !== FINGERPRINT_BINS * 2) return false;
  const longer = Math.max(a.durationSec, b.durationSec, 1e-6);
  if (Math.abs(a.durationSec - b.durationSec) / longer > 0.03) return false;
  const laneDelta = (from: number) => {
    let delta = 0;
    for (let i = from; i < from + FINGERPRINT_BINS; i++) delta += Math.abs(parseInt(a.hex[i]!, 16) - parseInt(b.hex[i]!, 16));
    return delta / FINGERPRINT_BINS;
  };
  return laneDelta(0) <= 0.75 && laneDelta(FINGERPRINT_BINS) <= 0.75;
}

export function sfxId(tag: SfxTag, sha256: string): string {
  return `sfx-${tag}-${sha256.slice(0, 8)}`;
}

async function sha256File(abs: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(abs)).digest("hex");
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

export type HarvestOptions = { dryRun?: boolean; concurrency?: number; dataRoot?: string };

export type HarvestResult = {
  dryRun: boolean;
  packDir: string;
  manifest: string;
  scanned: number;
  skippedRaw: number;
  unique: number;
  sha256Duplicates: number;
  fingerprintDuplicates: number;
  normalized: number;
  reused: number;
  failed: Array<{ file: string; error: string }>;
  byTag: Record<string, number>;
};

/** Lossless sources win as canonical copies; ties fall back to scan order. */
function sourceRank(s: SfxSource): number {
  const ext = path.extname(s.file).toLowerCase();
  return ext === ".wav" || ext === ".flac" ? 0 : 1;
}

export async function harvestSfx(opts: HarvestOptions = {}): Promise<HarvestResult> {
  const dataRoot = opts.dataRoot ?? workspace();
  const packDir = opts.dataRoot ? path.join(opts.dataRoot, "catalog", "sfx") : catalogSfxDir();
  const manifestPath = opts.dataRoot ? path.join(packDir, "manifest.json") : catalogSfxManifestPath();
  const concurrency = opts.concurrency ?? 6;
  const { sources, skippedRaw } = await scanSfxSources(dataRoot);
  const failed: Array<{ file: string; error: string }> = [];

  // Pass 1: hash + fingerprint every source (read-only).
  const probed = await mapLimit(sources, concurrency, async (s) => {
    try {
      const sha = await sha256File(s.abs);
      const fp = envelopeFingerprint(await decodeMonoPcm({ src: s.abs }));
      return { s, sha, fp };
    } catch (e) {
      failed.push({ file: path.relative(dataRoot, s.abs), error: String((e as Error)?.message ?? e).slice(0, 200) });
      return null;
    }
  });

  // Pass 2: group by sha256, then fold fingerprint matches into earlier groups.
  type Group = { canonical: { s: SfxSource; sha: string; fp: { hex: string; durationSec: number } }; dupes: Array<{ s: SfxSource; match: "sha256" | "fingerprint" }> };
  const groups: Group[] = [];
  const bySha = new Map<string, Group>();
  let shaDupes = 0;
  let fpDupes = 0;
  for (const p of probed) {
    if (!p) continue;
    const hit = bySha.get(p.sha);
    if (hit) {
      hit.dupes.push({ s: p.s, match: "sha256" });
      shaDupes += 1;
      continue;
    }
    const fpHit = groups.find((g) => fingerprintsMatch(g.canonical.fp, p.fp));
    if (fpHit) {
      fpDupes += 1;
      if (sourceRank(p.s) < sourceRank(fpHit.canonical.s)) {
        fpHit.dupes.push({ s: fpHit.canonical.s, match: "fingerprint" });
        fpHit.canonical = p;
      } else {
        fpHit.dupes.push({ s: p.s, match: "fingerprint" });
      }
      bySha.set(p.sha, fpHit);
      continue;
    }
    const g: Group = { canonical: p, dupes: [] };
    groups.push(g);
    bySha.set(p.sha, g);
  }

  const byTag: Record<string, number> = {};
  let normalized = 0;
  let reused = 0;
  const entries: SfxEntry[] = [];
  const built = await mapLimit(groups, concurrency, async (g) => {
    const tag = tagForSfxName(g.canonical.s.file);
    const id = sfxId(tag, g.canonical.sha);
    const rel = `${tag}/${id}.mp3`;
    const dst = path.join(packDir, rel);
    type Levels = { meanDb: number | null; peakDb: number | null; lufs: number | null };
    const empty: Levels = { meanDb: null, peakDb: null, lufs: null };
    let before: Levels = empty;
    let after: Levels = empty;
    if (!opts.dryRun) {
      try {
        const b = await audioStats({ src: g.canonical.s.abs });
        before = { meanDb: b.mean_volume_db, peakDb: b.max_volume_db, lufs: b.integrated_lufs };
        if (await exists(dst)) {
          reused += 1;
        } else {
          await loudnorm({ src: g.canonical.s.abs, dst, target: SFX_LOUDNESS_TARGET, truePeak: SFX_TRUE_PEAK });
          normalized += 1;
        }
        const a = await audioStats({ src: dst });
        after = { meanDb: a.mean_volume_db, peakDb: a.max_volume_db, lufs: a.integrated_lufs };
      } catch (e) {
        failed.push({ file: path.relative(dataRoot, g.canonical.s.abs), error: String((e as Error)?.message ?? e).slice(0, 200) });
        return null;
      }
    }
    const entry: SfxEntry = {
      id,
      tag,
      file: rel,
      sha256: g.canonical.sha,
      fingerprint: g.canonical.fp.hex,
      durationSec: Math.round(g.canonical.fp.durationSec * 1000) / 1000,
      source: { workspace: g.canonical.s.workspace, project: g.canonical.s.project, file: g.canonical.s.file },
      duplicates: g.dupes.map((d) => ({ workspace: d.s.workspace, project: d.s.project, file: d.s.file, match: d.match })),
      loudness: { target: SFX_LOUDNESS_TARGET, truePeak: SFX_TRUE_PEAK, before, after },
    };
    return entry;
  });
  for (const e of built) {
    if (!e) continue;
    entries.push(e);
    byTag[e.tag] = (byTag[e.tag] ?? 0) + 1;
  }
  entries.sort((a, b) => a.tag.localeCompare(b.tag) || a.id.localeCompare(b.id));

  const manifest: SfxManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    stats: {
      scanned: sources.length,
      skippedRaw,
      unique: entries.length,
      sha256Duplicates: shaDupes,
      fingerprintDuplicates: fpDupes,
      failed: failed.length,
      byTag,
    },
    entries,
  };
  if (!opts.dryRun) {
    await fs.mkdir(packDir, { recursive: true });
    await fs.writeFile(manifestPath, JSON.stringify(SfxManifestSchema.parse(manifest), null, 2) + "\n");
  }
  return {
    dryRun: Boolean(opts.dryRun),
    packDir,
    manifest: manifestPath,
    scanned: sources.length,
    skippedRaw,
    unique: entries.length,
    sha256Duplicates: shaDupes,
    fingerprintDuplicates: fpDupes,
    normalized,
    reused,
    failed,
    byTag,
  };
}

export async function loadSfxManifest(manifestPath: string = catalogSfxManifestPath()): Promise<SfxManifest | null> {
  try {
    return SfxManifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, "utf-8")));
  } catch {
    return null;
  }
}
