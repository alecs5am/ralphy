// Reference-pack lint + contact-sheet generator (#449).
//
// Bad refs poison paid generation: a stale /tmp screenshot, a 64×64 thumbnail
// mistaken for a master, two copies of the same image under different names, a
// brand logo with no provenance, or a missing product master for a mode that
// requires one. This module catches all of those DETERMINISTICALLY — before a
// single dollar of generation — and renders a compact visual summary grouped by
// ref type so the agent can eyeball the pack.
//
// It does NOT fork a parallel pipeline. It composes on the existing surface:
//   • `readRefPack` / `RefPack` / `RefType` (#426) — the pack is the input.
//   • `reportMissingForMode` (#426) — REUSED verbatim for the "missing required
//     ref types for the mode" finding; never re-derived.
//   • the `Finding` shape + `score()`/`Verdict` from eval/findings.ts — same
//     machinery every other gate (#422/#439/#443) uses.
//   • `image-size` — the SAME header reader `cli/commands/unit.ts` +
//     `eval/platform.ts` use for image dimensions (no new image lib).
//   • `node:crypto` sha256 — for the duplicate-hash check (no new dep).
//   • the EXISTING `contactSheet` ffmpeg recipe (#049) — for the montage. No
//     ad-hoc ffmpeg (AGENTS.md #2).
//
// The file PROBE is INJECTABLE (default = read bytes once → sha256 + dimensions)
// so fixtures run with NO filesystem / image-size / ffmpeg. Likewise the
// contact-sheet RUNNER is injectable so tests never spawn ffmpeg on tiny inputs.

import path from "node:path";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { imageSize } from "image-size";
import { resolveProjectPath } from "./path-resolution.js";
import { readRefPack, reportMissingForMode } from "./ref-pack.js";
import { type RefPack, type RefPackEntry, type RefType } from "./schemas/ref-pack.js";
import { contactSheet, type ContactSheetInput } from "./ffmpeg-recipes.js";
import { score } from "./eval/findings.js";
import type { Finding, Verdict } from "./eval/types.js";

// ─── Lint thresholds + tables ────────────────────────────────────────────────────

/** Image extensions we can read dimensions for (the tiny-resolution check). */
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".bmp", ".tiff"]);

/** Ref media we accept. Anything else is flagged `ref.unsupported-format`. */
const SUPPORTED_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif",
  ".mp4", ".mov", ".webm", ".m4v",
  ".mp3", ".wav", ".m4a", ".aac", ".ogg",
]);

/** Below this on the shorter side, an image ref is too small to anchor a gen. */
const TINY_RESOLUTION_PX = 256;

/**
 * Path markers that suggest a non-durable reference: OS temp dirs, the user's
 * Downloads folder, and scratch / version markers (`.v2`, `/tmp-`, `scratch`).
 * A ref under one of these is likely to vanish or be the wrong revision.
 */
const TEMP_PATH_RE =
  /(^|\/)(tmp|temp|var\/folders|downloads|\.trash|scratch)(\/|$)|[/.]tmp[-/]|\.v\d+\.|(^|\/)~/i;

// ─── Probe seam (injectable, default = read bytes once) ────────────────────────────

/** What the lint needs to know about one ref file on disk. */
export interface RefProbeResult {
  /** False when the file is absent at the resolved path. */
  exists: boolean;
  /** File size in bytes (0 when absent). */
  sizeBytes: number;
  /** Image dimensions when readable (null for video / audio / unreadable). */
  width: number | null;
  height: number | null;
  /** sha256 over the raw file bytes (null when absent / unreadable). The dedup key. */
  sha256: string | null;
}

/**
 * The injectable file probe: resolve + read ONE ref entry's path. Default reads
 * the bytes a single time → sha256 + (for images) `image-size` dimensions. Tests
 * pass a fake keyed on the entry path so fixtures never touch disk.
 */
export type RefProbe = (entry: RefPackEntry) => RefProbeResult;

/** Build the default probe bound to a project (for path resolution). */
export function defaultRefProbe(projectId: string): RefProbe {
  return (entry) => {
    const abs = resolveProjectPath(entry.path, projectId);
    if (!existsSync(abs)) return { exists: false, sizeBytes: 0, width: null, height: null, sha256: null };
    let buf: Buffer;
    try {
      buf = readFileSync(abs);
    } catch {
      return { exists: false, sizeBytes: 0, width: null, height: null, sha256: null };
    }
    const sha256 = createHash("sha256").update(buf).digest("hex");
    let width: number | null = null;
    let height: number | null = null;
    if (IMAGE_EXT.has(path.extname(entry.path).toLowerCase())) {
      try {
        const dim = imageSize(buf);
        width = dim.width ?? null;
        height = dim.height ?? null;
      } catch {
        // Unreadable image header — leave dims null (no tiny-resolution finding).
      }
    }
    return { exists: true, sizeBytes: buf.length, width, height, sha256 };
  };
}

// ─── Report shape ──────────────────────────────────────────────────────────────

/** Project-relative location the lint report is persisted to (when the CLI writes it). */
export const REF_PACK_LINT_ARTIFACT = "ref-pack-lint.json" as const;

export interface RefPackLintReport {
  schemaVersion: "1.0";
  projectId: string;
  /** The content mode the required-type check ran against (null = not requested). */
  mode: string | null;
  /** Number of ref entries linted. */
  total: number;
  /** pass | warn | fail (from the eval `score()` over the collected findings). */
  verdict: Verdict;
  /** True when the verdict is pass | warn — no hard blocker. (A `fail` blocks paid gen.) */
  ok: boolean;
  /** One-line reason for the verdict. */
  reason: string;
  /** Every finding, in discovery order. The fixer / reference-gate consumes these. */
  findings: Finding[];
}

// ─── The lint ──────────────────────────────────────────────────────────────────

/**
 * Lint a project's reference pack. Pure read — never mutates. Findings are
 * DETERMINISTIC (no model, no network):
 *   • `ref.missing-file`        — entry path doesn't exist (fail).
 *   • `ref.unsupported-format`  — extension not an image/video/audio (fail).
 *   • `ref.tiny-resolution`     — image shorter side < 256px (warn).
 *   • `ref.duplicate-hash`      — two entries share a sha256 over file bytes (warn).
 *   • `ref.suspicious-temp-path`— path under /tmp, /var/folders, Downloads, or a
 *                                  `.vN`/scratch marker (warn).
 *   • `ref.missing-provenance`  — neither `source` nor `note` set (warn).
 *   • `ref.missing-required-type`— a ref type the mode requires is absent (fail).
 *                                  REUSES `reportMissingForMode` (#426).
 *
 * `pack` wins over `projectId` when both are passed (tests inject a pack). The
 * file `probe` is injectable (default = read bytes once). A `fail` blocks paid
 * generation; `warn` / `pass` do not.
 */
export function lintRefPack(input: {
  projectId?: string;
  pack?: RefPack;
  mode?: string | null;
  probe?: RefProbe;
}): RefPackLintReport {
  const pack = input.pack ?? (input.projectId ? readRefPack(input.projectId) : null);
  const projectId = pack?.projectId || input.projectId || "";
  const mode = input.mode ?? null;
  const probe = input.probe ?? defaultRefProbe(projectId);

  const findings: Finding[] = [];
  let nextId = 1;
  const add = (x: Omit<Finding, "id">): void => {
    findings.push({ id: `REF${nextId++}`, ...x });
  };
  const base = { sceneIndex: null, timestampSec: null } as const;

  const entries = pack?.entries ?? [];

  // sha256 → the entry paths sharing it (dedup detection across the whole pack).
  const byHash = new Map<string, string[]>();

  for (const e of entries) {
    const ext = path.extname(e.path).toLowerCase();
    const where = `${e.type} ref \`${e.path}\``;

    // — Unsupported format (cheap, path-only — flag before probing).
    if (!SUPPORTED_EXT.has(ext)) {
      add({
        ...base,
        category: "ref.unsupported-format",
        severity: "fail",
        message: `${where}: extension "${ext || "(none)"}" is not a supported image/video/audio ref format.`,
        fixHint: `Convert it to a supported format (image: png/jpg/webp; video: mp4/mov/webm; audio: mp3/wav/m4a), or drop the entry.`,
        fixCommand: null,
      });
    }

    // — Suspicious temp / scratch path.
    if (TEMP_PATH_RE.test(e.path) || TEMP_PATH_RE.test(e.source ?? "")) {
      add({
        ...base,
        category: "ref.suspicious-temp-path",
        severity: "warn",
        message: `${where}: path looks temporary / scratch (under tmp, Downloads, or a .vN / scratch marker) — it may vanish or be the wrong revision.`,
        fixHint: `Copy the ref into the project's artifacts/refs/ (or the workspace shared/refs/) and re-point the entry, then \`ralphy ref pack ${projectId || "<project>"} --add <stable-path> --type ${e.type}\`.`,
        fixCommand: null,
      });
    }

    // — Missing provenance (no source AND no note).
    if (!(e.source && e.source.trim()) && !(e.note && e.note.trim())) {
      add({
        ...base,
        category: "ref.missing-provenance",
        severity: "warn",
        message: `${where}: no provenance (neither source nor note set) — its origin is unknown.`,
        fixHint: `Record where it came from (a URL, "user upload", a gen-log slot) via \`ralphy ref pack ${projectId || "<project>"} --add ${e.path} --type ${e.type} --note "<provenance>"\`.`,
        fixCommand: null,
      });
    }

    // — Probe-dependent checks.
    const p = probe(e);
    if (!p.exists) {
      add({
        ...base,
        category: "ref.missing-file",
        severity: "fail",
        message: `${where}: file not found on disk at the resolved path.`,
        fixHint: `Re-pull / re-add the ref so the path resolves, or remove the stale entry from the pack.`,
        fixCommand: null,
      });
      continue; // no further file-content checks when the file is absent
    }

    if (p.sha256) {
      const group = byHash.get(p.sha256) ?? [];
      group.push(e.path);
      byHash.set(p.sha256, group);
    }

    // — Tiny resolution (images only — shorter side below the floor).
    if (p.width !== null && p.height !== null) {
      const shorter = Math.min(p.width, p.height);
      if (shorter > 0 && shorter < TINY_RESOLUTION_PX) {
        add({
          ...base,
          category: "ref.tiny-resolution",
          severity: "warn",
          message: `${where}: ${p.width}x${p.height} — shorter side ${shorter}px is below the ${TINY_RESOLUTION_PX}px floor; too small to anchor a generation.`,
          fixHint: `Replace it with a full-resolution version (≥ ${TINY_RESOLUTION_PX}px on the short side). A thumbnail makes the model drift.`,
          fixCommand: null,
        });
      }
    }
  }

  // — Duplicate hashes: any sha256 shared by ≥ 2 entries.
  for (const [hash, paths] of byHash) {
    if (paths.length > 1) {
      add({
        ...base,
        category: "ref.duplicate-hash",
        severity: "warn",
        message: `${paths.length} refs are byte-identical (sha256 ${hash.slice(0, 12)}…): ${paths.join(", ")}.`,
        fixHint: `Keep one copy and drop the duplicates — duplicate refs waste \`--ref\` slots and skew the prompt weighting.`,
        fixCommand: null,
      });
    }
  }

  // — Missing required ref types for the mode (REUSE #426 reportMissingForMode).
  if (mode && pack) {
    const report = reportMissingForMode(pack, mode);
    for (const t of report.missing) {
      add({
        ...base,
        category: "ref.missing-required-type",
        severity: "fail",
        message: `mode "${mode}" requires a ${t} ref, but the pack has none.`,
        fixHint: `Add a ${t} reference: \`ralphy ref pack ${projectId || "<project>"} --add <path> --type ${t} --lock\`.`,
        fixCommand: null,
      });
    }
  }

  const { verdict } = score(findings);
  const ok = verdict !== "fail";
  const failCount = findings.filter((f) => f.severity === "fail").length;
  const warnCount = findings.filter((f) => f.severity === "warn").length;

  return {
    schemaVersion: "1.0",
    projectId,
    mode,
    total: entries.length,
    verdict,
    ok,
    reason: !pack
      ? "no reference pack found — run `ralphy ref pack <project-id>` first."
      : entries.length === 0
        ? "reference pack is empty — nothing to lint (gather refs into artifacts/refs/ first)."
        : failCount > 0
          ? `${failCount} blocking ref problem(s) — missing files / unsupported formats / missing required ref types. Fix before paid generation.`
          : warnCount > 0
            ? `${warnCount} ref warning(s) — tiny resolution / duplicate / temp path / missing provenance. Review before generating.`
            : "reference pack is healthy — every ref resolves, is a supported format, and carries provenance.",
    findings,
  };
}

// ─── Contact sheet ──────────────────────────────────────────────────────────────

/** Project-relative location the contact-sheet montage is written to. */
export const REF_PACK_CONTACT_SHEET_ARTIFACT = "artifacts/refs/contact-sheet.png" as const;

/**
 * The injectable contact-sheet runner. Default = the EXISTING #049 `contactSheet`
 * ffmpeg recipe. Tests pass a fake so fixtures never spawn ffmpeg on (missing) files.
 */
export type ContactSheetRunner = (input: ContactSheetInput) => Promise<string>;

/** One group of refs in the contact-sheet plan — one section/row per ref type. */
export interface ContactSheetGroup {
  type: RefType;
  /** Absolute paths of the renderable image refs in this group, in pack order. */
  srcs: string[];
}

/**
 * Plan the contact sheet: group the pack's IMAGE refs by `RefType` (one section
 * per type, in pack order) and resolve each to an absolute path. Videos / audio /
 * missing files are excluded — `contactSheet` (xstack) only stacks stills.
 * `cols` is the widest group so every type gets its own row, left-aligned.
 *
 * Pure planning (resolution only — no read, no ffmpeg). Exported so tests can
 * assert the grouping + column math without rendering.
 */
export function planContactSheet(
  pack: RefPack,
  resolve: (entry: RefPackEntry) => string,
): { groups: ContactSheetGroup[]; srcs: string[]; cols: number } {
  const byType = new Map<RefType, string[]>();
  for (const e of pack.entries) {
    if (!IMAGE_EXT.has(path.extname(e.path).toLowerCase())) continue;
    const g = byType.get(e.type) ?? [];
    g.push(resolve(e));
    byType.set(e.type, g);
  }
  const groups: ContactSheetGroup[] = [...byType.entries()].map(([type, srcs]) => ({ type, srcs }));
  const cols = groups.reduce((m, g) => Math.max(m, g.srcs.length), 0);
  // Row-major, padded per group so each type starts a fresh row. The existing
  // contactSheet recipe pads ragged trailing cells with black tiles itself.
  const srcs: string[] = [];
  for (const g of groups) {
    srcs.push(...g.srcs);
    // Pad this group's row out to `cols` so the next type begins on a new row.
    for (let i = g.srcs.length; i < cols; i++) srcs.push(g.srcs[g.srcs.length - 1]!);
  }
  return { groups, srcs, cols };
}

/**
 * Build a contact-sheet montage of the pack's image refs, grouped by type (one
 * row per type). Returns `{ path, groups }` on success, or `{ path: null }` when
 * there is nothing renderable (no image refs). Reuses the #049 `contactSheet`
 * recipe — NEVER ad-hoc ffmpeg. `resolve` + `run` are injectable for offline tests.
 */
export async function buildRefPackContactSheet(input: {
  pack: RefPack;
  dst: string;
  resolve: (entry: RefPackEntry) => string;
  run?: ContactSheetRunner;
  forceOverwrite?: boolean;
  projectId?: string;
}): Promise<{ path: string | null; groups: ContactSheetGroup[]; cols: number }> {
  const run = input.run ?? contactSheet;
  const { groups, srcs, cols } = planContactSheet(input.pack, input.resolve);
  if (srcs.length === 0) return { path: null, groups, cols };
  const out = await run({
    srcs,
    dst: input.dst,
    cols: Math.max(1, cols),
    forceOverwrite: input.forceOverwrite,
    projectId: input.projectId,
  });
  return { path: out, groups, cols };
}
