// Reference-pack builder (#426).
//
// `buildRefPack(projectId)` scans the project READ-ONLY and assembles a typed,
// best-effort reference pack (schema: `cli/lib/schemas/ref-pack.ts`):
//   1. Gathers ref files already under `<project>/artifacts/refs/`.
//   2. Pulls benchmark / source-video / model hints from the research-facts
//      artifact (`artifacts/refs/research-facts.json`, #416) when present.
//   3. Resolves workspace `shared/refs/` masters into the pack too.
// Every input is BEST-EFFORT: a missing dir / malformed file simply omits its
// entries — the builder NEVER throws and NEVER mutates the project.
//
// `mergeRefPack` is the append-only persistence helper: it unions a freshly
// built pack with any existing `ref-pack.json`, keyed by `path`, preserving
// user-set `locked` / `type` / `source` overrides on existing entries (so a
// re-run never clobbers a manual `--add ... --lock`). It returns the merged
// object; the command writes it.
//
// Classification is a deterministic filename heuristic (no LLM, no network) —
// it intentionally errs toward `style` (the safe craft default) for unknown
// names rather than guessing a real-entity type. The agent / `--type` override
// refines it.

import path from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { projectDir, projectRefsDir, projectWorkspace, sharedDir } from "./paths.js";
import {
  RefPackSchema,
  type RefPack,
  type RefPackEntry,
  type RefType,
  isRefType,
  missingRequiredRefTypes,
} from "./schemas/ref-pack.js";
import { getContentMode } from "./content-modes.js";

// Image / video extensions we treat as ref media. Non-media files in
// artifacts/refs/ (research-facts.json, blueprint.md, transcripts) are skipped.
const MEDIA_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg",
  ".mp4", ".mov", ".webm", ".m4v",
  ".mp3", ".wav", ".m4a", ".aac", ".ogg",
]);

const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);

/**
 * Classify a ref by its filename (lowercased basename, no extension). Keyword
 * heuristic ordered most-specific → least; audio/video extension is a strong
 * signal that overrides name keywords for music / source-video.
 *
 * Unknown names fall back to `style` — the safe craft default (never a
 * real-entity type, which would falsely imply the reference-required gate is
 * satisfied).
 */
export function classifyRefByName(filename: string): RefType {
  const ext = path.extname(filename).toLowerCase();
  const stem = path.basename(filename, ext).toLowerCase();

  if (AUDIO_EXT.has(ext)) return "music";

  // Pipeline outputs first — most intentional naming.
  if (/\b(prototype|approved|locked-style|style-frame|anchor)\b|prototype/.test(stem)) return "selected-prototype";
  if (/\b(master|super-?original|hero-master)\b|master/.test(stem)) return "generated-master";

  // Real-entity types.
  if (/\b(logo|brandmark|wordmark|brand)\b|logo|brand/.test(stem)) return "brand";
  if (/\b(product|packshot|packaging|bottle|can|box|device)\b|product|packshot/.test(stem)) return "product";
  if (/\b(model|person|cast|actor|face|talent|persona)\b|model|persona/.test(stem)) return "model-person";

  // Craft refs.
  if (/\b(benchmark|reference|competitor|best-?in-?class)\b|benchmark/.test(stem)) return "benchmark";
  if (VIDEO_EXT.has(ext) || /\b(source|reel|tiktok|short|creator|clip)\b|source/.test(stem)) return "source-video";
  if (/\b(style|look|aesthetic|moodboard|mood)\b|style|mood/.test(stem)) return "style";

  return "style";
}

/** Read + JSON.parse a project-relative file, or null on any failure. */
function safeReadJson(dir: string, rel: string): unknown {
  try {
    const abs = path.join(dir, rel);
    if (!existsSync(abs)) return null;
    return JSON.parse(readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
}

/** List media files (recursively shallow — top level only) in a dir. Never throws. */
function listMedia(dir: string): string[] {
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => {
        try {
          return statSync(path.join(dir, f)).isFile() && MEDIA_EXT.has(path.extname(f).toLowerCase());
        } catch {
          return false;
        }
      })
      .sort();
  } catch {
    return [];
  }
}

/**
 * Build a best-effort ref pack for a project. Pure read — never mutates, never
 * throws. Returns a validated RefPack (entries may be empty for a bare project).
 */
export function buildRefPack(projectId: string): RefPack {
  const projRoot = projectDir(projectId);
  const entries: RefPackEntry[] = [];
  const seen = new Set<string>();

  const add = (e: RefPackEntry) => {
    if (seen.has(e.path)) return;
    seen.add(e.path);
    entries.push(e);
  };

  // 1. Project artifacts/refs/ media.
  const refsDir = projectRefsDir(projectId);
  for (const f of listMedia(refsDir)) {
    add({
      type: classifyRefByName(f),
      path: path.join("artifacts/refs", f),
      source: "project artifacts/refs",
      locked: false,
    });
  }

  // 2. Research-facts hints (#416): each visualReference is a benchmark; a
  //    refSlug that points at a pulled artifact carries through as the source.
  const facts = safeReadJson(projRoot, "artifacts/refs/research-facts.json") as
    | { visualReferences?: Array<{ url?: string; note?: string; refSlug?: string }> }
    | null;
  if (facts && Array.isArray(facts.visualReferences)) {
    for (const vr of facts.visualReferences) {
      const ref = vr?.refSlug;
      if (!ref) continue; // only entries with a pulled artifact get a path
      // refSlug points at a pulled-ref dir; reference its source.mp4/source.png
      // is left to the agent — we record the slug dir as the path.
      const p = path.join("artifacts/refs", ref);
      add({
        type: "benchmark",
        path: p,
        source: vr.url ? `research-facts: ${vr.url}` : "research-facts",
        locked: false,
        ...(vr.note ? { note: vr.note } : {}),
      });
    }
  }

  // 3. Workspace shared/refs/ masters — resolvable across the workspace's
  //    projects. Recorded with the explicit `shared/refs/<file>` form so the
  //    path resolves through the workspace tier (#108).
  const sharedRefsDir = path.join(sharedDir(projectWorkspace(projectId)), "refs");
  for (const f of listMedia(sharedRefsDir)) {
    add({
      type: classifyRefByName(f),
      path: path.join("shared/refs", f),
      source: "workspace shared/refs",
      locked: false,
    });
  }

  return RefPackSchema.parse({ projectId, entries });
}

/**
 * Merge a freshly-built pack with the existing on-disk pack (append-only). Keyed
 * by `path`: existing entries keep their user-set `type` / `source` / `locked` /
 * `note` (a re-run must never clobber a manual `--add ... --lock`); new paths are
 * appended. Returns the merged + re-validated pack with a fresh `generatedAt`.
 */
export function mergeRefPack(existing: RefPack | null, built: RefPack): RefPack {
  const byPath = new Map<string, RefPackEntry>();
  // Built entries first (the auto-classification baseline)…
  for (const e of built.entries) byPath.set(e.path, e);
  // …then existing entries overwrite, preserving manual overrides.
  if (existing) for (const e of existing.entries) byPath.set(e.path, e);
  return RefPackSchema.parse({
    projectId: built.projectId || existing?.projectId || "",
    generatedAt: new Date().toISOString(),
    entries: [...byPath.values()],
  });
}

/**
 * Apply a manual `--add <path> --type <t> [--lock] [--note ...]` to a pack.
 * Append-only: an existing path is updated in place (type/lock/note overridden),
 * a new path is appended. Returns a new pack object (does not mutate the input).
 */
export function addManualEntry(
  pack: RefPack,
  opts: { path: string; type: string; lock?: boolean; source?: string; note?: string },
): RefPack {
  if (!isRefType(opts.type)) {
    throw new Error(`invalid ref type "${opts.type}" — expected one of: brand, product, model-person, style, benchmark, source-video, music, generated-master, selected-prototype`);
  }
  const next: RefPackEntry = {
    type: opts.type,
    path: opts.path,
    source: opts.source ?? "manual --add",
    locked: opts.lock === true,
    ...(opts.note ? { note: opts.note } : {}),
  };
  const entries = pack.entries.filter((e) => e.path !== opts.path);
  entries.push(next);
  return RefPackSchema.parse({ ...pack, generatedAt: new Date().toISOString(), entries });
}

/** Read + parse the on-disk ref-pack.json for a project, or null when absent / malformed. */
export function readRefPack(projectId: string): RefPack | null {
  const raw = safeReadJson(projectDir(projectId), "ref-pack.json");
  if (!raw) return null;
  const r = RefPackSchema.safeParse(raw);
  return r.success ? r.data : null;
}

// ─── REF_PACK.md rendering ─────────────────────────────────────────────────────────

/** Render a readable Markdown view of the pack (grouped by type, locks flagged). */
export function renderRefPackMd(pack: RefPack): string {
  const lines: string[] = [];
  lines.push(`# Reference pack`);
  lines.push("");
  lines.push(`> Project: \`${pack.projectId || "(unknown)"}\` · ${pack.entries.length} ref${pack.entries.length === 1 ? "" : "s"} · generated ${pack.generatedAt}`);
  lines.push("");
  if (pack.entries.length === 0) {
    lines.push("_No references gathered yet._");
    lines.push("");
    return lines.join("\n");
  }
  // Group by type, in taxonomy order.
  const byType = new Map<string, RefPackEntry[]>();
  for (const e of pack.entries) {
    const g = byType.get(e.type) ?? [];
    g.push(e);
    byType.set(e.type, g);
  }
  for (const [type, group] of byType) {
    lines.push(`## ${type}`);
    lines.push("");
    for (const e of group) {
      const lock = e.locked ? " **[locked]**" : "";
      const src = e.source ? ` — ${e.source}` : "";
      const note = e.note ? ` (${e.note})` : "";
      lines.push(`- \`${e.path}\`${lock}${src}${note}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Project-relative location the Markdown view is persisted to. */
export const REF_PACK_MD_ARTIFACT = "REF_PACK.md" as const;

// ─── Required-ref-by-mode report (#426) ────────────────────────────────────────────

/** Result of `reportMissingForMode`. */
export interface ModeRefReport {
  /** The content mode the report was run against. */
  mode: string;
  /** The ref types the mode declares it requires (empty when the mode declares none). */
  required: RefType[];
  /** The required types NOT present in the pack — the actionable gap. */
  missing: RefType[];
  /** True when nothing is missing (vacuously true when the mode requires none). */
  satisfied: boolean;
}

/**
 * Report which of a content mode's `requiredRefTypes` (#426) are absent from a
 * pack. Pure registry + pack read; does NOT block — enforcement is the fidelity
 * gate (#422). An unknown mode (or a mode that declares no required types) yields
 * `required: []` and `satisfied: true`.
 *
 * ponytail: this is the SEAM the fidelity gate (#422) consumes — it calls this
 * with the project's resolved content mode and refuses generation when
 * `satisfied` is false. The plan grader / contact-sheet lint (#449) reads the
 * same pack via `readRefPack`. Neither is built here (separate issues).
 */
export function reportMissingForMode(pack: RefPack, mode: string): ModeRefReport {
  const entry = getContentMode(mode);
  const required = entry?.requiredRefTypes ?? [];
  const missing = missingRequiredRefTypes(pack, required);
  return { mode, required, missing, satisfied: missing.length === 0 };
}
