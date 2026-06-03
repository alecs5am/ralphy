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
import { projectsDir } from "../lib/paths.js";
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
 * Read every prompt file under `prompts/` verbatim, tag each with a `stage`
 * inferred from its filename, and note any `{{slots}}` it carries.
 */
function buildPrompts(
  projectDir: string,
  warnings: string[],
): Blueprint["prompts"] {
  const promptsDir = path.join(projectDir, "prompts");
  if (!existsSync(promptsDir)) {
    warnings.push("no prompts/: prompts axis is empty");
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
  prompts.sort((a, b) => (a.slot ?? "").localeCompare(b.slot ?? ""));
  return prompts;
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
    let recordedPath = srcPath;
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
          warnings.push(`could not copy hard asset for slot '${slot}'; recorded by ref`);
        }
      } else if (bytes != null) {
        warnings.push(
          `hard asset for slot '${slot}' is ${bytes} bytes (> copy ceiling); recorded by ref only`,
        );
      }
    } else {
      warnings.push(`hard asset path for slot '${slot}' does not exist; recorded by ref`);
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

  cmd.addHelpText(
    "after",
    `
Examples:
  ralphy blueprint create choose-silenthill-001 --unit choose-silenthill
  ralphy blueprint list choose-silenthill-001
  ralphy blueprint show choose-silenthill-001 --unit choose-silenthill
`,
  );

  return cmd;
}
