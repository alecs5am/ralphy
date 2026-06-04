// `ralphy blueprint` — assemble a reproduction-grade Blueprint (#074/#076) from a
// finished `workspace/projects/<id>/`.
//
// A *blueprint* is the per-unit capture step: it pulls the six reproduction axes
// (scenario, prompts, composition, hard assets, model stack, recipes) out of the
// scattered (gitignored) project files into one self-contained
// `units/<slug>/blueprint/` payload (blueprint.json + copied index.html / prompt
// files / hard-asset files), validated against `BlueprintSchema`.
//
// Hard rules (AGENTS.md invariant #14 — append-only; mirrors `unit.ts`):
//   • COPY, never move — the source project files are left untouched.
//   • Append-only — a re-`create` on a slug that already has a `blueprint/`
//     writes `blueprint.v2/` (then `.v3`…), never overwrites the prior capture.
//   • Degrade gracefully — a missing scenario / prompts dir / index.html /
//     manifest yields a VALID blueprint with that axis null/empty and a `notes`
//     line, never a crash.

import { Command } from "commander";
import fs from "node:fs/promises";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { projectsDir, root } from "../lib/paths.js";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { UnitManifestSchema, type UnitManifest } from "../lib/schemas/unit.js";
import {
  BlueprintSchema,
  type Blueprint,
  type BlueprintStage,
  type BlueprintAssetKind,
  type BlueprintRecipeKind,
} from "../lib/schemas/blueprint.js";

const UNITS_DIRNAME = "units";
const BLUEPRINT_DIRNAME = "blueprint";
const SCHEMA_VERSION = 1;

/** A hard-asset copy larger than this is referenced by path only (not copied). */
const MAX_COPY_BYTES = 64 * 1024 * 1024; // 64 MiB — #077 owns the real size strategy.

// ── project / dir resolution (mirrors unit.ts) ───────────────────────────────

function resolveProjectDir(projectId: string): string {
  const dir = path.join(projectsDir(), projectId);
  if (!existsSync(dir)) {
    raiseError("E_NOT_FOUND", { kind: "Project", id: projectId });
  }
  return dir;
}

function unitsRoot(projectDir: string): string {
  return path.join(projectDir, UNITS_DIRNAME);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve the append-only blueprint dir name inside a unit dir. If
 * `blueprint/` is free, returns `blueprint`. Otherwise mirrors unit.ts's `.vN`
 * rule: scans for `blueprint.vN` and returns the next free `blueprint.v<max+1>`.
 */
function resolveNewBlueprintDirName(unitDir: string): string {
  if (!existsSync(path.join(unitDir, BLUEPRINT_DIRNAME))) return BLUEPRINT_DIRNAME;
  let max = 1;
  const re = new RegExp(`^${escapeRe(BLUEPRINT_DIRNAME)}\\.v(\\d+)$`);
  for (const entry of readdirSync(unitDir)) {
    const m = re.exec(entry);
    if (m) {
      const n = parseInt(m[1]!, 10);
      if (n > max) max = n;
    }
  }
  return `${BLUEPRINT_DIRNAME}.v${max + 1}`;
}

/** Latest existing `blueprint` / `blueprint.vN` dir name, or null if none. */
function latestBlueprintDirName(unitDir: string): string | null {
  if (!existsSync(unitDir)) return null;
  let best: string | null = null;
  let bestN = -1;
  const re = new RegExp(`^${escapeRe(BLUEPRINT_DIRNAME)}(?:\\.v(\\d+))?$`);
  for (const entry of readdirSync(unitDir)) {
    const m = re.exec(entry);
    if (!m) continue;
    const n = m[1] ? parseInt(m[1], 10) : 1;
    if (n > bestN) {
      bestN = n;
      best = entry;
    }
  }
  return best;
}

/** All blueprint version dir names for a unit, sorted ascending. */
function listBlueprintDirNames(unitDir: string): string[] {
  if (!existsSync(unitDir)) return [];
  const re = new RegExp(`^${escapeRe(BLUEPRINT_DIRNAME)}(?:\\.v\\d+)?$`);
  return readdirSync(unitDir)
    .filter((e) => re.test(e))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function readUnitManifest(unitDir: string): Promise<UnitManifest | null> {
  const fp = path.join(unitDir, "unit.json");
  if (!existsSync(fp)) return null;
  try {
    return UnitManifestSchema.parse(JSON.parse(await fs.readFile(fp, "utf8")));
  } catch {
    return null;
  }
}

// ── axis 1: scenario ─────────────────────────────────────────────────────────

/**
 * Build the scenario axis. Order of preference (#062 graceful degrade):
 *   1. parse the scene `*.jsonl` rows into a scene table (beats/durations/vo/…);
 *   2. else capture `STORYBOARD.md` raw into `scenario.storyboardMd`;
 *   3. else `null` (scenario-less still project).
 * (There is intentionally NO `scenario.json` in real choose-* projects.)
 */
function buildScenario(
  projectDir: string,
  warnings: string[],
): Blueprint["scenario"] {
  const sceneFiles = findSceneJsonl(projectDir);
  const scenes = sceneFiles.flatMap((f) => parseSceneJsonl(path.join(projectDir, f)));
  const storyboardPath = path.join(projectDir, "STORYBOARD.md");
  const storyboardMd = existsSync(storyboardPath)
    ? safeReadText(storyboardPath)
    : undefined;

  if (scenes.length > 0) {
    return { scenes, ...(storyboardMd ? { storyboardMd } : {}) };
  }
  if (storyboardMd) {
    // No parseable scene table — degrade to the raw storyboard with an empty
    // scene array (still a valid scenario object).
    return { scenes: [], storyboardMd };
  }
  warnings.push("no scenario: neither scene *.jsonl rows nor STORYBOARD.md found");
  return null;
}

/** Top-level scene jsonl files (e.g. scenes-sam.jsonl, scenes2.jsonl). */
function findSceneJsonl(projectDir: string): string[] {
  try {
    return readdirSync(projectDir)
      .filter((f) => /scenes?.*\.jsonl$/i.test(f))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/** Parse a scene jsonl into BlueprintScene rows, tolerating free-form keys. */
function parseSceneJsonl(absPath: string): NonNullable<Blueprint["scenario"]>["scenes"] {
  const text = safeReadText(absPath);
  if (!text) return [];
  const rows: NonNullable<Blueprint["scenario"]>["scenes"] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const id = String(o.id ?? o.scene ?? o.slot ?? `scene-${rows.length + 1}`);
    const label = strOrUndef(o.label ?? o.title ?? o.name ?? o.beat);
    const durationSec = numOrUndef(o.durationSec ?? o.duration_sec ?? o.duration ?? o.sec);
    const vo = strOrUndef(o.vo ?? o.voiceover ?? o.line ?? o.narration);
    const sfx = arrOrUndef(o.sfx);
    const fork = parseFork(o.fork);
    const notes = strOrUndef(o.notes ?? o.note);
    rows.push({
      id,
      ...(label ? { label } : {}),
      ...(durationSec != null ? { durationSec } : {}),
      ...(vo ? { vo } : {}),
      ...(sfx ? { sfx } : {}),
      ...(fork ? { fork } : {}),
      ...(notes ? { notes } : {}),
    });
  }
  return rows;
}

function parseFork(v: unknown): { label: string; options?: string[] } | undefined {
  if (!v || typeof v !== "object") return undefined;
  const f = v as Record<string, unknown>;
  const label = strOrUndef(f.label ?? f.prompt ?? f.question);
  if (!label) return undefined;
  const options = arrOrUndef(f.options ?? f.choices ?? f.branches);
  return { label, ...(options ? { options } : {}) };
}

// ── axis 2: prompts ──────────────────────────────────────────────────────────

/**
 * Build the prompts axis from BOTH sources, merged + deduped:
 *   1. the sparse `prompts/**` dir (filename-tagged, may carry `{{slots}}`);
 *   2. the VERBATIM per-slot prompts harvested from `logs/generations.jsonl`
 *      (the real strings that produced each asset — far denser, #074/#081).
 *
 * The gen-log is the reproduction-grade source: `prompts/**` on a 37-scene
 * choose-* project holds ~5 files, while the gen-log holds the ~2200-char image
 * prompt + ~400-char i2v prompt for every slot. Merge keeps both, dedupes by
 * `(slot, stage, text)`, and orders deterministically by `(slot, stage)`.
 */
function buildPrompts(
  projectDir: string,
  warnings: string[],
): Blueprint["prompts"] {
  const fromDir = buildPromptsFromDir(projectDir, warnings);
  const fromLog = buildPromptsFromGenLog(projectDir, warnings);

  // Merge + dedupe by (slot, stage, text). The dir source comes first so a
  // hand-authored prompt with `{{slots}}` survives over a gen-log duplicate.
  const merged: Blueprint["prompts"] = [];
  const seen = new Set<string>();
  for (const p of [...fromDir, ...fromLog]) {
    const key = `${p.slot ?? ""} ${p.stage} ${p.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(p);
  }

  // Deterministic order: by slot, then stage (re-runs are byte-stable).
  merged.sort(
    (a, b) =>
      (a.slot ?? "").localeCompare(b.slot ?? "") || a.stage.localeCompare(b.stage),
  );
  return merged;
}

/**
 * Read every prompt file under `prompts/` verbatim, tag each with a `stage`
 * inferred from its filename, and note any `{{slots}}` it carries.
 */
function buildPromptsFromDir(
  projectDir: string,
  warnings: string[],
): Blueprint["prompts"] {
  const promptsDir = path.join(projectDir, "prompts");
  if (!existsSync(promptsDir)) {
    warnings.push("no prompts/: prompts axis falls back to the gen-log harvest");
    return [];
  }
  const prompts: Blueprint["prompts"] = [];
  for (const rel of walkFiles(promptsDir)) {
    const abs = path.join(promptsDir, rel);
    const ext = path.extname(rel).toLowerCase();
    if (![".txt", ".json", ".md", ".prompt"].includes(ext)) continue;
    const text = safeReadText(abs);
    if (text == null) continue;
    const slot = rel.replace(/\.[^.]+$/, "");
    const slots = extractSlots(text);
    prompts.push({
      stage: inferStage(rel),
      slot,
      text,
      ...(slots.length ? { slots } : {}),
    });
  }
  return prompts;
}

/**
 * Harvest the VERBATIM per-slot prompts out of `logs/generations.jsonl` (#081).
 *
 * Procedure:
 *   • Keep only rows that carry a non-empty `input.prompt` (string).
 *   • Map kind → stage: `image`→`image`; `video` WITH a first-frame anchor
 *     (`input.preprocess.first_frame` or `input.first_frame`)→`i2v`, else
 *     `video`; `audio`→`music` when the slot/endpoint reads music, else `vo`;
 *     `captions`→`captions`; `sfx`→`sfx`.
 *   • Group by `(slot, stage)`; within a group prefer the LATEST `status:"ok"`
 *     row (the winning re-roll). If none is ok, take the latest row. This
 *     collapses the raw re-roll/version rows to ~one verbatim prompt per slot.
 *   • Emit a BlueprintPromptSchema entry carrying model + any `{{slots}}`.
 *
 * Degrades to `[]` (no warning beyond the dir's) when the log is absent.
 */
function buildPromptsFromGenLog(
  projectDir: string,
  warnings: string[],
): Blueprint["prompts"] {
  const logPath = path.join(projectDir, "logs", "generations.jsonl");
  if (!existsSync(logPath)) return [];
  const text = safeReadText(logPath) ?? "";

  // Group by (slot, stage). Each group tracks the chosen row (latest ok, else
  // latest) by line index so a later re-roll wins.
  type Picked = { idx: number; ok: boolean; stage: BlueprintStage; slot: string; model?: string; prompt: string };
  const groups = new Map<string, Picked>();

  let idx = 0;
  for (const line of text.split("\n")) {
    idx++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const input = (o.input ?? {}) as Record<string, unknown>;
    const prompt = strOrUndef(input.prompt);
    if (!prompt) continue;

    const slot = strOrUndef(input.slot) ?? "";
    const stage = mapGenKindToPromptStage(strOrUndef(o.kind), input, strOrUndef(o.endpoint));
    const model = strOrUndef(o.model ?? o.endpoint);
    const ok = strOrUndef(o.status) === "ok";

    const key = `${slot} ${stage}`;
    const prev = groups.get(key);
    // Prefer ok over non-ok; among same ok-ness, prefer the later line.
    const better =
      !prev ||
      (ok && !prev.ok) ||
      (ok === prev.ok && idx > prev.idx);
    if (better) {
      groups.set(key, { idx, ok, stage, slot, ...(model ? { model } : {}), prompt });
    }
  }

  const prompts: Blueprint["prompts"] = [];
  for (const g of groups.values()) {
    const slots = extractSlots(g.prompt);
    prompts.push({
      stage: g.stage,
      ...(g.slot ? { slot: g.slot } : {}),
      ...(g.model ? { model: g.model } : {}),
      text: g.prompt,
      ...(slots.length ? { slots } : {}),
    });
  }
  return prompts;
}

/**
 * Map a gen-log row to the prompt STAGE it produced. Same intent as
 * `mapGenKindToStage` (the model-stack axis), but here `audio` splits into
 * `vo` / `music` on a slot / endpoint hint, since a prompt's stage matters for
 * reproduction. Falls back: image kind→`image`, video-with-first-frame→`i2v`,
 * other video→`video`, audio→`vo`.
 */
function mapGenKindToPromptStage(
  kind: string | undefined,
  input: Record<string, unknown>,
  endpoint: string | undefined,
): BlueprintStage {
  const k = (kind ?? "").toLowerCase();
  if (k === "image") return "image";
  if (k === "captions") return "captions";
  if (k === "sfx") return "sfx";
  if (k === "video") {
    const pre = input.preprocess as Record<string, unknown> | undefined;
    if ((pre && pre.first_frame) || input.first_frame) return "i2v";
    return "video";
  }
  if (k === "voiceover") return "vo";
  if (k === "music") return "music";
  if (k === "audio") {
    const hint = `${strOrUndef(input.slot) ?? ""} ${endpoint ?? ""}`.toLowerCase();
    if (/(music|track|soundtrack|score|song|bed)/.test(hint)) return "music";
    return "vo";
  }
  return "image";
}

/** Infer the pipeline stage from a prompt filename / path. */
function inferStage(rel: string): BlueprintStage {
  const s = rel.toLowerCase();
  if (/(^|[-_/])(vo|voice|voiceover|narration|narrator)/.test(s)) return "vo";
  if (/(^|[-_/])(music|track|soundtrack|score)/.test(s)) return "music";
  if (/(^|[-_/])(sfx|sound)/.test(s)) return "sfx";
  if (/(^|[-_/])(caption|subtitle|srt)/.test(s)) return "captions";
  if (/(^|[-_/])(i2v|anim|motion|video|vid|seedance|kling|veo)/.test(s)) return "i2v";
  // Default: a still / character / scene prompt is an image prompt.
  return "image";
}

/** Pull `{{slot}}` template tokens out of a prompt body, de-duped. */
function extractSlots(text: string): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) found.add(m[1]!);
  return Array.from(found).sort();
}

// ── axis 3: composition (index.html parse) ───────────────────────────────────

/**
 * Parse the project's `index.html` for the timing arrays + the components /
 * registry blocks / overlay fns it references. COPYING the file itself is done
 * by the caller; this only reads it. Returns `null` when there is no index.html
 * (non-HyperFrames output, #062).
 *
 * Parsing is intentionally regex-based and forgiving:
 *   • `A` / `SEG`: tolerate `const A = [...]`, `A = [...]`, `window.A = [...]`.
 *   • components: union of CSS class names, `data-composition*` ids, GSAP
 *     timeline keys (`__timelines["…"]`), and top-level `function name(` decls.
 * Anything it cannot find is simply omitted — never throws.
 */
function buildComposition(
  projectDir: string,
  warnings: string[],
): { composition: Blueprint["composition"]; indexHtmlAbs: string | null } {
  const indexHtmlAbs = path.join(projectDir, "index.html");
  if (!existsSync(indexHtmlAbs)) {
    warnings.push("no index.html: composition axis is null (non-HyperFrames output)");
    return { composition: null, indexHtmlAbs: null };
  }
  const html = safeReadText(indexHtmlAbs) ?? "";
  const A = parseNumberArray(html, "A");
  const SEG = parseNumberArray(html, "SEG");
  const components = parseComponents(html);

  const timing =
    A || SEG ? { ...(A ? { A } : {}), ...(SEG ? { SEG } : {}) } : undefined;

  return {
    composition: {
      file: "index.html",
      ...(timing ? { timing } : {}),
      ...(components.length ? { components } : {}),
    },
    indexHtmlAbs,
  };
}

/**
 * Extract a numeric JS array assigned to `name` (e.g. `A` or `SEG`). Tolerates
 * `const `/`let `/`var `/bare/`window.` prefixes and arbitrary whitespace.
 */
function parseNumberArray(html: string, name: string): number[] | undefined {
  const re = new RegExp(
    `(?:const|let|var)?\\s*(?:window\\.)?${escapeRe(name)}\\s*=\\s*\\[([^\\]]*)\\]`,
  );
  const m = re.exec(html);
  if (!m) return undefined;
  const nums = m[1]!
    .split(",")
    .map((t) => Number(t.trim()))
    .filter((n) => Number.isFinite(n));
  return nums.length ? nums : undefined;
}

/** Enumerate the HyperFrames components / blocks / overlays an index.html uses. */
function parseComponents(html: string): string[] {
  const set = new Set<string>();
  // CSS class names on elements (e.g. "tint", "scan", "cd-ring", "grain").
  for (const m of html.matchAll(/class="([^"]+)"/g)) {
    for (const cls of m[1]!.split(/\s+/)) {
      if (cls) set.add(cls);
    }
  }
  // data-composition ids / registry block markers.
  for (const m of html.matchAll(/data-composition(?:-id)?="([^"]+)"/g)) {
    set.add(m[1]!);
  }
  // GSAP timeline registry keys: window.__timelines["key"].
  for (const m of html.matchAll(/__timelines\[["']([^"']+)["']\]/g)) {
    set.add(m[1]!);
  }
  // Overlay / draw function declarations (drawCaptions, applyChromaSplit, …).
  for (const m of html.matchAll(/function\s+([a-zA-Z_$][\w$]*)\s*\(/g)) {
    set.add(m[1]!);
  }
  // Registered components on window.__hf* registries.
  for (const m of html.matchAll(/__hf[A-Za-z]*\[["']([^"']+)["']\]/g)) {
    set.add(m[1]!);
  }
  return Array.from(set).sort();
}

// ── axis 4: hard assets (asset-manifest.json) ────────────────────────────────

/**
 * Read `asset-manifest.json` and pin each slot as a hard asset. Optionally COPY
 * the actual file into `blueprint/assets/` (and re-point `path` at the copy)
 * when it exists, is local, and is under the copy ceiling. Records `bytes`.
 */
async function buildAssets(
  projectDir: string,
  blueprintDir: string,
  warnings: string[],
): Promise<Blueprint["assets"]> {
  const manifestPath = path.join(projectDir, "asset-manifest.json");
  if (!existsSync(manifestPath)) {
    warnings.push("no asset-manifest.json: assets axis is empty");
    return [];
  }
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(safeReadText(manifestPath) ?? "{}");
  } catch {
    warnings.push("asset-manifest.json is not valid JSON: assets axis is empty");
    return [];
  }
  const slots = (manifest.slots ?? manifest) as Record<string, Record<string, unknown>>;
  if (!slots || typeof slots !== "object") return [];

  const assetsCopyDir = path.join(blueprintDir, "assets");
  const out: Blueprint["assets"] = [];
  for (const [slot, raw] of Object.entries(slots)) {
    if (!raw || typeof raw !== "object") continue;
    const srcPath = strOrUndef(raw.path);
    if (!srcPath) continue;
    const kind = mapAssetKind(slot, strOrUndef(raw.kind));
    // SECURITY (#056 leak root-cause): NEVER record the absolute manifest path.
    // When we copy the file into blueprint/assets/, record the relative copy
    // (`assets/<name>`). When we cannot copy (missing / oversize / copy-failed),
    // record the bare basename + keep the by-ref note. The absolute `srcPath`
    // never lands in blueprint.json (which is published verbatim by #056).
    let recordedPath = path.basename(srcPath);
    let bytes: number | undefined;

    if (existsSync(srcPath)) {
      try {
        bytes = statSync(srcPath).size;
      } catch {
        /* unreadable */
      }
      if (bytes != null && bytes <= MAX_COPY_BYTES) {
        await fs.mkdir(assetsCopyDir, { recursive: true });
        const dest = uniqueDest(assetsCopyDir, `${slot}${path.extname(srcPath)}`);
        try {
          await fs.copyFile(srcPath, dest);
          recordedPath = path.posix.join("assets", path.basename(dest));
        } catch {
          warnings.push(`could not copy hard asset for slot '${slot}'; recorded by basename (by-ref)`);
        }
      } else if (bytes != null) {
        warnings.push(
          `hard asset for slot '${slot}' is ${bytes} bytes (> copy ceiling); recorded by basename (by-ref) only`,
        );
      }
    } else {
      warnings.push(`hard asset path for slot '${slot}' does not exist; recorded by basename (by-ref)`);
    }

    out.push({
      slot,
      path: recordedPath,
      kind,
      ...(bytes != null ? { bytes } : {}),
    });
  }
  out.sort((a, b) => (a.slot ?? "").localeCompare(b.slot ?? ""));
  return out;
}

/** Choose a free filename in `dir` (suffix -2, -3 on collision). */
function uniqueDest(dir: string, base: string): string {
  let dest = path.join(dir, base);
  if (!existsSync(dest)) return dest;
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  let n = 2;
  while (existsSync(path.join(dir, `${stem}-${n}${ext}`))) n++;
  return path.join(dir, `${stem}-${n}${ext}`);
}

/** Map a manifest slot's kind/name to a BlueprintAssetKind. */
function mapAssetKind(slot: string, manifestKind: string | undefined): BlueprintAssetKind {
  const s = `${slot} ${manifestKind ?? ""}`.toLowerCase();
  if (/(music|track|soundtrack|score|song|audio)/.test(s)) return "music";
  if (/(char|nurse|person|figure|model|mascot)/.test(s)) return "character";
  if (/(loc|bg|background|env|scene|hub|street|room)/.test(s)) return "location";
  if (/(prop|item|object)/.test(s)) return "prop";
  if (/(master|hero|key|final)/.test(s)) return "master";
  return "ref";
}

// ── axis 5: model stack + cost (generations.jsonl) ───────────────────────────

/**
 * Aggregate `logs/generations.jsonl` into a per-stage model stack and sum the
 * cost rollup. One entry per (stage, model) pair, carrying representative params
 * (size / duration / resolution / aspect) and any voice id, plus summed cost.
 */
function buildModelStack(
  projectDir: string,
  warnings: string[],
): { modelStack: Blueprint["modelStack"]; costRollupUsd: number | undefined } {
  const logPath = path.join(projectDir, "logs", "generations.jsonl");
  if (!existsSync(logPath)) {
    warnings.push("no logs/generations.jsonl: model stack + cost rollup unavailable");
    return { modelStack: [], costRollupUsd: undefined };
  }
  const text = safeReadText(logPath) ?? "";
  const acc = new Map<
    string,
    { stage: string; model: string; params: Record<string, unknown>; voiceId?: string; costUsd: number }
  >();
  let totalCost = 0;
  let sawCost = false;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const model = strOrUndef(o.model ?? o.endpoint);
    if (!model) continue;
    const stage = mapGenKindToStage(strOrUndef(o.kind), o.input);
    const cost = numOrUndef((o as Record<string, unknown>).cost_usd ?? (o as Record<string, unknown>).costUsd);
    if (cost != null) {
      totalCost += cost;
      sawCost = true;
    }
    const key = `${stage}::${model}`;
    let entry = acc.get(key);
    if (!entry) {
      entry = { stage, model, params: {}, costUsd: 0 };
      acc.set(key, entry);
    }
    if (cost != null) entry.costUsd += cost;
    const input = (o.input ?? {}) as Record<string, unknown>;
    for (const k of ["size", "duration_sec", "resolution", "aspect_ratio", "n"]) {
      if (input[k] != null && entry.params[k] == null) entry.params[k] = input[k];
    }
    const voiceId = strOrUndef(input.voiceId ?? input.voice_id);
    if (voiceId && !entry.voiceId) entry.voiceId = voiceId;
  }

  const modelStack: Blueprint["modelStack"] = Array.from(acc.values())
    .map((e) => ({
      stage: e.stage,
      model: e.model,
      ...(Object.keys(e.params).length ? { params: e.params } : {}),
      ...(e.voiceId ? { voiceId: e.voiceId } : {}),
      ...(e.costUsd > 0 ? { costUsd: round4(e.costUsd) } : {}),
    }))
    .sort((a, b) => `${a.stage}${a.model}`.localeCompare(`${b.stage}${b.model}`));

  return {
    modelStack,
    costRollupUsd: sawCost ? round4(totalCost) : undefined,
  };
}

/** Map a gen-log `kind` (image/video/voiceover/music/sfx/…) to a Blueprint stage. */
function mapGenKindToStage(kind: string | undefined, input: unknown): BlueprintStage {
  const k = (kind ?? "").toLowerCase();
  if (k === "image") return "image";
  if (k === "voiceover" || k === "audio") return "vo";
  if (k === "music") return "music";
  if (k === "sfx") return "sfx";
  if (k === "video") {
    // A video gen seeded by a first-frame is an i2v step; otherwise plain video.
    const inp = (input ?? {}) as Record<string, unknown>;
    const pre = inp.preprocess as Record<string, unknown> | undefined;
    if (pre && (pre.first_frame || pre.last_frame)) return "i2v";
    return "video";
  }
  return "image";
}

// ── axis 6: recipes ──────────────────────────────────────────────────────────

/**
 * Build the recipe axis from the unit's provenance `recipes[]` (the named
 * bake/encode/overlay treatments). Each named recipe becomes a row with its
 * inferred kind; concrete ffmpeg commands / param values are #079's deeper job —
 * here we capture the named recipe + its kind so the set is reproducible.
 */
function buildRecipes(manifest: UnitManifest | null): Blueprint["recipes"] {
  const names = manifest?.provenance?.recipes ?? [];
  return names.map((name) => ({
    name,
    kind: inferRecipeKind(name),
  }));
}

function inferRecipeKind(name: string): BlueprintRecipeKind {
  const s = name.toLowerCase();
  if (/(encode|crf|tune|grain|x264|h264|hevc)/.test(s)) return "encode";
  if (/(xfade|bake|stitch|concat|master)/.test(s)) return "bake";
  if (/(overlay|chroma|split|caption|vhs|smpte|vignette|dither|burn)/.test(s)) return "overlay";
  return "ffmpeg";
}

// ── small helpers ────────────────────────────────────────────────────────────

function safeReadText(absPath: string): string | undefined {
  try {
    return readFileSync(absPath, "utf8");
  } catch {
    return undefined;
  }
}

function strOrUndef(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function numOrUndef(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function arrOrUndef(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const arr = v.map((x) => String(x)).filter((x) => x.length > 0);
  return arr.length ? arr : undefined;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Recursively list files relative to `root`. */
function walkFiles(root: string, rel = "", out: string[] = []): string[] {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(path.join(root, rel), { withFileTypes: true }) as import("node:fs").Dirent[];
  } catch {
    return out;
  }
  for (const e of entries) {
    const childRel = rel ? path.posix.join(rel, e.name) : e.name;
    if (e.isDirectory()) walkFiles(root, childRel, out);
    else if (e.isFile()) out.push(childRel);
  }
  return out;
}

// ── `use` — scaffold a reproducible project from a PUBLISHED Blueprint (#079) ──

/**
 * Resolve a published Blueprint by its `unitId`, OFFLINE, from the committed
 * mirror (`landing/lib/library-v2/published.ts`). The CLI has NO Supabase creds
 * (AGENTS.md invariant #1), so the committed mirror is the only source.
 *
 * Order:
 *   1. In-tree committed mirror (PRIMARY): import `PUBLISHED_BLUEPRINTS` from the
 *      published.ts sibling of the repo's `templates/` and find `unitId`.
 *   2. Graceful failure: if the mirror file is absent (global binary, no
 *      `landing/` dir) OR the unitId isn't in it → return null + a reason.
 *
 * Never attempts a Supabase / authed fetch — there are no creds for one.
 */
async function resolvePublishedBlueprint(
  unitId: string,
): Promise<{ blueprint: Blueprint | null; reason: string | null }> {
  // The published mirror is a sibling of the repo's `templates/` dir (both anchor
  // off `root()` — same anchor `repoTemplatesDir()` uses).
  const mirrorPath = path.join(root(), "landing", "lib", "library-v2", "published.ts");
  if (!existsSync(mirrorPath)) {
    return {
      blueprint: null,
      reason: `committed mirror not found at ${path.relative(root(), mirrorPath)} (a global binary has no landing/ dir)`,
    };
  }
  let mod: { PUBLISHED_BLUEPRINTS?: unknown };
  try {
    // Bun runs TS directly; the mirror imports only `./types` (pure types).
    mod = (await import(mirrorPath)) as { PUBLISHED_BLUEPRINTS?: unknown };
  } catch (e) {
    return {
      blueprint: null,
      reason: `could not import the committed mirror: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const list = mod.PUBLISHED_BLUEPRINTS;
  if (!Array.isArray(list)) {
    return { blueprint: null, reason: "PUBLISHED_BLUEPRINTS is not an array in the mirror" };
  }
  const raw = (list as Array<Record<string, unknown>>).find((b) => b?.unitId === unitId);
  if (!raw) {
    return { blueprint: null, reason: `no published blueprint with unitId '${unitId}' in the mirror` };
  }
  // TODO(#079): public HTTPS fetch of the published blueprint for global-binary users.
  const parsed = BlueprintSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      blueprint: null,
      reason: `published blueprint '${unitId}' failed schema validation: ${parsed.error.message}`,
    };
  }
  return { blueprint: parsed.data, reason: null };
}

/** Download a public URL to a destination path (no sha256 — Storage URLs carry none). */
async function downloadPublic(url: string, destPath: string): Promise<void> {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  const res = await fetch(url, { headers: { "User-Agent": "ralphy-cli/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!res.body) throw new Error("empty body");
  const tmp = `${destPath}.partial`;
  const sink = createWriteStream(tmp);
  const stream = Readable.fromWeb(res.body as any);
  stream.pipe(sink);
  await finished(sink);
  await fs.rename(tmp, destPath);
}

/** Map a hard-asset kind to the project assets/ subdir it belongs in. */
function assetSubdirForKind(kind: BlueprintAssetKind): string {
  if (kind === "music") return path.join("assets", "music");
  // character / location / prop / ref / master are all still images by default.
  return path.join("assets", "images");
}

/** Best-effort file extension for a downloaded asset URL. */
function extFromUrl(url: string, fallback: string): string {
  try {
    const p = new URL(url).pathname;
    const ext = path.extname(p);
    return ext || fallback;
  } catch {
    return path.extname(url) || fallback;
  }
}

/** Whether a dir exists and contains at least one entry. */
function dirIsNonEmpty(dir: string): boolean {
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

// ── command ──────────────────────────────────────────────────────────────────

export function blueprintCmd() {
  const cmd = new Command("blueprint").description(
    "Assemble / inspect a reproduction-grade Blueprint for a project's unit (#074/#076)",
  );

  // ── create ────────────────────────────────────────────────────────────────
  cmd
    .command("create <project>")
    .description(
      "Capture a self-contained Blueprint for a unit into units/<slug>/blueprint/ (append-only)",
    )
    .requiredOption("--unit <slug>", "Unit slug whose blueprint to assemble")
    .action(async (project: string, opts: { unit: string }) => {
      const slug = String(opts.unit);
      const projectDir = resolveProjectDir(project);
      const unitDir = path.join(unitsRoot(projectDir), slug);
      if (!existsSync(unitDir)) {
        raiseError("E_NOT_FOUND", { kind: "Unit", id: slug });
      }
      const manifest = await readUnitManifest(unitDir);

      // Append-only: never overwrite an existing blueprint/ — version it.
      const blueprintDirName = resolveNewBlueprintDirName(unitDir);
      const blueprintDir = path.join(unitDir, blueprintDirName);
      await fs.mkdir(blueprintDir, { recursive: true });

      const warnings: string[] = [];

      // unitId: the unit's slug (mirrors the library-v2 Unit.id). Documented:
      // the project-scoped form is `<project>/<slug>`; we use the bare unit slug
      // so it lines up 1→1 with Unit.id (the provenance blocks are the back-link).
      const unitId = manifest?.slug ?? slug;

      // Axes.
      const scenario = buildScenario(projectDir, warnings);
      const prompts = buildPrompts(projectDir, warnings);
      const { composition, indexHtmlAbs } = buildComposition(projectDir, warnings);
      const assets = await buildAssets(projectDir, blueprintDir, warnings);
      const { modelStack, costRollupUsd } = buildModelStack(projectDir, warnings);
      const recipes = buildRecipes(manifest);

      // COPY the composition payload (index.html) verbatim.
      if (indexHtmlAbs) {
        try {
          await fs.copyFile(indexHtmlAbs, path.join(blueprintDir, "index.html"));
        } catch {
          warnings.push("could not copy index.html into the blueprint payload");
        }
      }
      // COPY the prompt files verbatim under blueprint/prompts/.
      const promptsSrc = path.join(projectDir, "prompts");
      if (existsSync(promptsSrc)) {
        const dstPrompts = path.join(blueprintDir, "prompts");
        for (const rel of walkFiles(promptsSrc)) {
          const dst = path.join(dstPrompts, rel);
          try {
            await fs.mkdir(path.dirname(dst), { recursive: true });
            await fs.copyFile(path.join(promptsSrc, rel), dst);
          } catch {
            warnings.push(`could not copy prompt file '${rel}'`);
          }
        }
      }

      const blueprint: Blueprint = {
        unitId,
        schemaVersion: SCHEMA_VERSION,
        scenario,
        prompts,
        composition,
        assets,
        modelStack,
        recipes,
        ...(costRollupUsd != null ? { costRollupUsd } : {}),
        createdAt: new Date().toISOString(),
        ...(warnings.length ? { notes: warnings.join("; ") } : {}),
      };

      // Fail loudly if the assembled object does not validate.
      const parsed = BlueprintSchema.parse(blueprint);
      await fs.writeFile(
        path.join(blueprintDir, "blueprint.json"),
        JSON.stringify(parsed, null, 2) + "\n",
        "utf8",
      );

      ok(`Blueprint captured: ${slug}/${blueprintDirName}`);
      out({
        unitId,
        slug,
        dir: path.posix.join(slug, blueprintDirName),
        versioned: blueprintDirName !== BLUEPRINT_DIRNAME,
        scenes: parsed.scenario?.scenes.length ?? 0,
        prompts: parsed.prompts.length,
        assets: parsed.assets.length,
        modelStack: parsed.modelStack.length,
        recipes: parsed.recipes.length,
        costRollupUsd: parsed.costRollupUsd,
        warnings,
        path: path.relative(projectDir, blueprintDir),
      });
    });

  // ── list ────────────────────────────────────────────────────────────────
  cmd
    .command("list <project>")
    .description("List units that have a captured blueprint/ + which versions exist")
    .action(async (project: string) => {
      const projectDir = resolveProjectDir(project);
      const unitsDir = unitsRoot(projectDir);
      const rows: Array<Record<string, unknown>> = [];
      if (existsSync(unitsDir)) {
        const unitDirs = readdirSync(unitsDir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort((a, b) => a.localeCompare(b));
        for (const name of unitDirs) {
          const unitDir = path.join(unitsDir, name);
          const versions = listBlueprintDirNames(unitDir);
          if (versions.length === 0) continue;
          rows.push({
            slug: name,
            versions,
            latest: latestBlueprintDirName(unitDir),
          });
        }
      }
      out(rows);
    });

  // ── show ────────────────────────────────────────────────────────────────
  cmd
    .command("show <project>")
    .description("Print a unit's latest blueprint.json")
    .requiredOption("--unit <slug>", "Unit slug whose blueprint to show")
    .action(async (project: string, opts: { unit: string }) => {
      const slug = String(opts.unit);
      const projectDir = resolveProjectDir(project);
      const unitDir = path.join(unitsRoot(projectDir), slug);
      const latest = latestBlueprintDirName(unitDir);
      if (!latest) raiseError("E_NOT_FOUND", { kind: "Blueprint", id: slug });
      const fp = path.join(unitDir, latest!, "blueprint.json");
      const text = safeReadText(fp);
      if (text == null) raiseError("E_NOT_FOUND", { kind: "Blueprint", id: slug });
      out(BlueprintSchema.parse(JSON.parse(text!)));
    });

  // ── use ─────────────────────────────────────────────────────────────────
  cmd
    .command("use <unit-id>")
    .description(
      "Scaffold a ready-to-run project from a PUBLISHED Blueprint (offline; #079)",
    )
    .requiredOption("--project <project-id>", "New project ID to scaffold")
    .action(async (unitId: string, opts: { project: string }) => {
      const projectId = String(opts.project);

      // Source resolution (graceful degrade): committed mirror only — no creds.
      const { blueprint, reason } = await resolvePublishedBlueprint(unitId);
      if (!blueprint) {
        raiseError("E_NOT_FOUND", {
          kind: "Blueprint",
          id: `${unitId} — not found offline (${reason}). The committed mirror (landing/lib/library-v2/published.ts) is the only offline source; a public-fetch path for globally-installed binaries is a known follow-up (#079)`,
        });
      }

      // Append-only / no-clobber: never overwrite an existing project (#14).
      const projDir = path.join(projectsDir(), projectId);
      if (dirIsNonEmpty(projDir)) {
        raiseError("E_ALREADY_EXISTS", { kind: "Project", id: projectId });
      }

      const warnings: string[] = [];

      // Standard project tree (mirrors `template use`).
      await fs.mkdir(path.join(projDir, "assets", "images"), { recursive: true });
      await fs.mkdir(path.join(projDir, "assets", "videos"), { recursive: true });
      await fs.mkdir(path.join(projDir, "assets", "voiceover"), { recursive: true });
      await fs.mkdir(path.join(projDir, "assets", "music"), { recursive: true });
      await fs.mkdir(path.join(projDir, "assets", "captions"), { recursive: true });
      await fs.mkdir(path.join(projDir, "render"), { recursive: true });
      await fs.mkdir(path.join(projDir, "logs"), { recursive: true });
      await fs.mkdir(path.join(projDir, "scripts"), { recursive: true });
      await fs.mkdir(path.join(projDir, "prompts"), { recursive: true });

      const written: string[] = [];

      // ── Prompts → prompts/<slot|stage-N>.<ext> verbatim ────────────────────
      for (let i = 0; i < blueprint.prompts.length; i++) {
        const p = blueprint.prompts[i]!;
        const base = (p.slot ?? `${p.stage}-${String(i + 1).padStart(2, "0")}`)
          .replace(/[^a-zA-Z0-9._/-]/g, "-");
        const ext = base.includes(".") ? "" : ".txt";
        const rel = path.join("prompts", `${base}${ext}`);
        const dst = path.join(projDir, rel);
        await fs.mkdir(path.dirname(dst), { recursive: true });
        await fs.writeFile(dst, p.text, "utf8");
        written.push(rel);
      }

      // ── Scenario → STORYBOARD.md + scenario.json ───────────────────────────
      if (blueprint.scenario) {
        if (blueprint.scenario.storyboardMd) {
          await fs.writeFile(
            path.join(projDir, "STORYBOARD.md"),
            blueprint.scenario.storyboardMd,
            "utf8",
          );
          written.push("STORYBOARD.md");
        }
        if (blueprint.scenario.scenes.length > 0) {
          await fs.writeFile(
            path.join(projDir, "scenario.json"),
            JSON.stringify({ scenes: blueprint.scenario.scenes }, null, 2) + "\n",
            "utf8",
          );
          written.push("scenario.json");
        }
      } else {
        warnings.push("blueprint has no scenario (scenario-less still project)");
      }

      // ── Composition → index.html ───────────────────────────────────────────
      const comp = blueprint.composition;
      const compFile = comp?.file;
      const compStorageUrl = comp?.storageUrl;
      const compInline = comp?.html;
      if (comp) {
        const indexDst = path.join(projDir, "index.html");
        if (compStorageUrl) {
          try {
            await downloadPublic(compStorageUrl, indexDst);
            written.push("index.html (downloaded from storageUrl)");
          } catch (e) {
            warnings.push(
              `could not download composition from storageUrl: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        } else if (typeof compInline === "string" && compInline.length > 0) {
          await fs.writeFile(indexDst, compInline, "utf8");
          written.push("index.html (inline)");
        } else {
          // Only a path recorded — no fetchable content. Placeholder + note.
          await fs.writeFile(
            indexDst,
            [
              "<!doctype html>",
              "<!--",
              "  PLACEHOLDER index.html — the published blueprint recorded the",
              `  composition by path only (${compFile ?? "index.html"}), with no`,
              "  fetchable content. Re-author the HyperFrames composition from the",
              "  timing + components recorded in BLUEPRINT_ORIGIN.md, then render.",
              "-->",
              '<html><head><meta charset="utf-8"></head><body></body></html>',
              "",
            ].join("\n"),
            "utf8",
          );
          written.push("index.html (placeholder — composition not fetchable)");
          warnings.push(
            "composition recorded by path only — index.html is a placeholder; re-author from BLUEPRINT_ORIGIN.md",
          );
        }
      } else {
        warnings.push("blueprint has no composition (non-HyperFrames output)");
      }

      // ── Hard assets → assets/<subdir>/ (download when a storageUrl exists) ──
      const manualFetch: Array<{ slot?: string; path: string; kind: string; note: string }> = [];
      const downloaded: string[] = [];
      for (const a of blueprint.assets) {
        if (a.storageUrl) {
          const sub = assetSubdirForKind(a.kind);
          const baseName =
            (a.slot ? a.slot.replace(/[^a-zA-Z0-9._-]/g, "-") : path.basename(new URL(a.storageUrl).pathname)) ;
          const ext = path.extname(baseName) ? "" : extFromUrl(a.storageUrl, ".bin");
          const rel = path.join(sub, `${baseName}${ext}`);
          const dst = path.join(projDir, rel);
          try {
            await downloadPublic(a.storageUrl, dst);
            downloaded.push(rel);
          } catch (e) {
            manualFetch.push({
              slot: a.slot,
              path: a.path,
              kind: a.kind,
              note: `download failed (${e instanceof Error ? e.message : String(e)}) — fetch manually from the source project`,
            });
          }
        } else {
          // No public URL (oversizeSkipped / unpublished) — record for manual fetch.
          manualFetch.push({
            slot: a.slot,
            path: a.path,
            kind: a.kind,
            note: "no storageUrl — fetch manually from the source project",
          });
        }
      }
      if (manualFetch.length > 0) {
        warnings.push(
          `${manualFetch.length} hard asset(s) need manual fetch — see BLUEPRINT_ORIGIN.md`,
        );
      }

      // ── BLUEPRINT_ORIGIN.md (provenance + model stack + recipes + next steps) ─
      const lines: string[] = [];
      lines.push(`# Blueprint origin`);
      lines.push(``);
      lines.push(`This project was scaffolded from the PUBLISHED blueprint \`${unitId}\`.`);
      lines.push(`Source: committed mirror \`landing/lib/library-v2/published.ts\` (offline).`);
      if (blueprint.costRollupUsd != null) {
        lines.push(``);
        lines.push(`Original cost rollup: **$${blueprint.costRollupUsd}**.`);
      }

      lines.push(``, `## Model stack`, ``);
      if (blueprint.modelStack.length === 0) {
        lines.push(`_(none recorded)_`);
      } else {
        lines.push(`| Stage | Model | Voice | Cost (USD) | Params |`);
        lines.push(`|---|---|---|---|---|`);
        for (const m of blueprint.modelStack) {
          const params = m.params ? JSON.stringify(m.params) : "";
          lines.push(
            `| ${m.stage} | \`${m.model}\` | ${m.voiceId ?? ""} | ${m.costUsd ?? ""} | ${params.replace(/\|/g, "\\|")} |`,
          );
        }
      }

      lines.push(``, `## Recipes`, ``);
      if (blueprint.recipes.length === 0) {
        lines.push(`_(none recorded)_`);
      } else {
        for (const r of blueprint.recipes) {
          lines.push(`- **${r.name}** (${r.kind})${r.command ? `: \`${r.command}\`` : ""}`);
        }
      }

      if (comp?.timing || (comp?.components && comp.components.length > 0)) {
        lines.push(``, `## Composition`, ``);
        if (comp.timing?.A) lines.push(`- \`A[]\` (scene-start offsets): ${JSON.stringify(comp.timing.A)}`);
        if (comp.timing?.SEG) lines.push(`- \`SEG[]\` (segment durations): ${JSON.stringify(comp.timing.SEG)}`);
        if (comp.components && comp.components.length > 0) {
          lines.push(`- components / blocks: ${comp.components.join(", ")}`);
        }
      }

      if (manualFetch.length > 0) {
        lines.push(``, `## Hard assets — fetch manually`, ``);
        lines.push(`These assets were not downloadable offline. ${"Fetch them from the source project and drop them in the right assets/ subdir."}`);
        lines.push(``);
        for (const m of manualFetch) {
          lines.push(`- [${m.kind}] ${m.slot ? `\`${m.slot}\` → ` : ""}\`${m.path}\` — ${m.note}`);
        }
      }
      if (downloaded.length > 0) {
        lines.push(``, `## Hard assets — downloaded`, ``);
        for (const d of downloaded) lines.push(`- \`${d}\``);
      }

      lines.push(``, `## Next steps`, ``);
      lines.push(`1. Run the per-stage generations: \`ralphy generate {image|video|voiceover|music}\` using the prompts in \`prompts/\` and the model stack above.`);
      lines.push(`2. Bake / stitch per the recipes above (ffmpeg xfade master, overlays, encode).`);
      lines.push(`3. Render the composition: \`ralphy render ${projectId}\`.`);
      lines.push(``);
      await fs.writeFile(path.join(projDir, "BLUEPRINT_ORIGIN.md"), lines.join("\n"), "utf8");
      written.push("BLUEPRINT_ORIGIN.md");

      ok(`Scaffolded project '${projectId}' from blueprint '${unitId}'`);
      out({
        unitId,
        project: projectId,
        dir: path.relative(root(), projDir),
        prompts: blueprint.prompts.length,
        scenes: blueprint.scenario?.scenes.length ?? 0,
        composition: comp ? (compStorageUrl ? "downloaded" : compInline ? "inline" : "placeholder") : null,
        assetsDownloaded: downloaded.length,
        assetsNeedingManualFetch: manualFetch.length,
        modelStack: blueprint.modelStack.length,
        recipes: blueprint.recipes.length,
        written,
        warnings,
      });
    });

  cmd.addHelpText(
    "after",
    `
Examples:
  ralphy blueprint create choose-silenthill-001 --unit choose-silenthill
  ralphy blueprint list choose-silenthill-001
  ralphy blueprint show choose-silenthill-001 --unit choose-silenthill
  ralphy blueprint use choose-silenthill --project choose-silenthill-repro-001
`,
  );

  return cmd;
}
