// Pre-render lint for HyperFrames compositions (#047).
//
// Upstream `hyperframes` ships its own lint pass invoked by `bunx hyperframes
// lint <dir>` and again implicitly at render time. Two edge cases historically
// only surfaced AT RENDER, after a silent freeze:
//
//   1. `<video>` element missing `id` or `data-start` on the element itself —
//      authors often hang those attrs on a wrapper `<div>` which is invisible
//      to the capture engine's media scheduler. Upstream lint flags this as
//      `media_missing_id` / `media_missing_data_start` but only late in the
//      render pipeline, after the user has already eaten the latency.
//   2. A montage of many short same-track `<video>` clips back-to-back —
//      the runtime cannot reliably switch between them during capture, only
//      the first plays, the rest render as static frames. There is no
//      upstream lint for this pattern at all.
//
// This module is the in-repo author-time gate that fires BEFORE we shell out
// to upstream render. It is intentionally narrow: HTML-regex-driven (matches
// the music-prompt-lint discipline), no jsdom, no DOM tree. Two outputs:
//
//   - `errors[]` — render is blocked (wrapper-on-video, missing id/data-start).
//   - `warnings[]` — render proceeds but caller should echo the suggestion
//     (many-short-same-track montage).
//
// The many-short-same-track heuristic is intentionally conservative: it fires
// when more than 4 `<video>` elements share the same `data-track-index` AND
// every one of them has `data-duration < 3` seconds. Authors who genuinely
// know what they're doing can override with `data-allow-short-stack="true"`
// on any of the affected video elements.
//
// Origin: `ralphy-vs-higgsfield-001` postmortem (workflow-fixes #2, #3).
// Issue: notes/issues/done/047-hyperframes-edge-case-rules.md.

import { readFile } from "node:fs/promises";

export type HyperframesLintError = {
  code: "media_missing_id" | "media_missing_data_start" | "media_attrs_on_wrapper";
  message: string;
  /** The offending snippet (truncated) for context. */
  snippet: string;
};

export type HyperframesLintWarning = {
  code: "many_short_same_track_video";
  message: string;
  /** Concat-fix suggestion the caller can echo verbatim. */
  suggestion: string;
  /** Which track triggered the warning. */
  trackIndex: number;
  /** How many short clips were on that track. */
  count: number;
};

export type HyperframesLintResult = {
  /** True when there are no errors. Warnings do not flip this. */
  ok: boolean;
  errors: HyperframesLintError[];
  warnings: HyperframesLintWarning[];
};

const MIN_SHORT_STACK_COUNT = 5; // > 4 clips on the same track
const MAX_SHORT_CLIP_DURATION_S = 3; // each under 3 seconds

/**
 * Lint a HyperFrames composition HTML string.
 *
 * Pure function — easy to test, no I/O. See `lintHyperframesProject()` for the
 * filesystem wrapper used by `ralphy render`.
 */
export function lintHyperframesHtml(html: string): HyperframesLintResult {
  const errors: HyperframesLintError[] = [];
  const warnings: HyperframesLintWarning[] = [];

  const videoTags = extractTags(html, "video");

  // Rule 1: every <video> must carry `id` + `data-start` ON THE ELEMENT.
  for (const tag of videoTags) {
    if (!hasAttr(tag.openTag, "id")) {
      errors.push({
        code: "media_missing_id",
        message:
          "<video> element is missing `id`. HyperFrames timed media carries `id` on the element itself, never on a wrapper.",
        snippet: snippet(tag.openTag),
      });
    }
    if (!hasAttr(tag.openTag, "data-start")) {
      errors.push({
        code: "media_missing_data_start",
        message:
          "<video> element is missing `data-start`. HyperFrames timed media carries `data-start` on the element itself, never on a wrapper.",
        snippet: snippet(tag.openTag),
      });
    }
  }

  // Rule 1b: detect the wrapper anti-pattern explicitly. A <div> that owns
  // `data-start` / `data-track-index` and wraps a single <video> is the
  // canonical mis-author from `ugc-ad-test`. We catch it even when the inner
  // <video> happens to also have those attrs (still confusing for the runtime).
  const wrapperRe =
    /<(div|section|article)\b([^>]*?\bdata-(?:start|track-index|duration)\b[^>]*?)>\s*(<video\b[^>]*>[\s\S]*?<\/video>)\s*<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = wrapperRe.exec(html)) !== null) {
    const wrapperAttrs = m[2] ?? "";
    if (
      /\bdata-start\b/.test(wrapperAttrs) ||
      /\bdata-track-index\b/.test(wrapperAttrs) ||
      /\bdata-duration\b/.test(wrapperAttrs)
    ) {
      errors.push({
        code: "media_attrs_on_wrapper",
        message:
          "Found `data-start` / `data-track-index` / `data-duration` on a wrapper element around a <video>. " +
          "Move these attributes onto the <video> tag itself — the HyperFrames capture engine only reads timing from the media element directly.",
        snippet: snippet(m[0] ?? ""),
      });
    }
  }

  // Rule 2: many-short-same-track montage warning.
  // Group <video> tags by data-track-index, count short ones, warn over threshold.
  const byTrack = new Map<number, { count: number; allowOverride: boolean }>();
  for (const tag of videoTags) {
    const track = numAttr(tag.openTag, "data-track-index");
    const duration = numAttr(tag.openTag, "data-duration");
    if (track === undefined || duration === undefined) continue;
    if (!(duration > 0 && duration < MAX_SHORT_CLIP_DURATION_S)) continue;
    const override = boolAttr(tag.openTag, "data-allow-short-stack");
    const entry = byTrack.get(track) ?? { count: 0, allowOverride: false };
    entry.count += 1;
    if (override) entry.allowOverride = true;
    byTrack.set(track, entry);
  }
  for (const [trackIndex, info] of byTrack.entries()) {
    if (info.count >= MIN_SHORT_STACK_COUNT && !info.allowOverride) {
      warnings.push({
        code: "many_short_same_track_video",
        trackIndex,
        count: info.count,
        message: `Found ${info.count} short (<${MAX_SHORT_CLIP_DURATION_S}s) <video> clips on data-track-index=${trackIndex}. The HyperFrames runtime cannot reliably switch between many short same-track video clips during capture — typically only the first plays.`,
        suggestion:
          `Concat the ${info.count} clips into a single video and reference it with one <video> element on this track. ` +
          `If you have already verified this composition renders correctly, add data-allow-short-stack="true" to any of the affected <video> tags to suppress this warning.`,
      });
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Read a HyperFrames project on disk and lint its `index.html` (or a
 * caller-provided composition path).
 */
export async function lintHyperframesProject(
  projectDir: string,
  composition?: string,
): Promise<HyperframesLintResult> {
  const path = await import("node:path");
  const file = composition
    ? path.resolve(projectDir, composition)
    : path.join(projectDir, "index.html");
  const html = await readFile(file, "utf8");
  return lintHyperframesHtml(html);
}

/**
 * Format a lint result for human-friendly stderr output. Returns `null` if
 * the result is clean (no errors, no warnings).
 */
export function formatHyperframesLintReport(result: HyperframesLintResult): string | null {
  if (result.ok && result.warnings.length === 0) return null;
  const lines: string[] = [];
  if (result.errors.length > 0) {
    lines.push(`HyperFrames lint — ${result.errors.length} error(s):`);
    for (const e of result.errors) {
      lines.push(`  · [${e.code}] ${e.message}`);
      lines.push(`      ${e.snippet}`);
    }
  }
  if (result.warnings.length > 0) {
    lines.push(`HyperFrames lint — ${result.warnings.length} warning(s):`);
    for (const w of result.warnings) {
      lines.push(`  · [${w.code}] ${w.message}`);
      lines.push(`      fix: ${w.suggestion}`);
    }
  }
  return lines.join("\n");
}

// ---------- helpers (HTML regex parsing, intentionally narrow) ----------

type Tag = { openTag: string };

function extractTags(html: string, name: string): Tag[] {
  // Match both `<video ...></video>` and self-closed `<video ... />` and
  // bare `<video ...>` opening tags (we only need the opening tag for attrs).
  const re = new RegExp(`<${name}\\b([^>]*?)\\/?>`, "gi");
  const out: Tag[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push({ openTag: m[0] });
  }
  return out;
}

function hasAttr(openTag: string, attr: string): boolean {
  const re = new RegExp(`\\s${escapeRe(attr)}(\\s*=|\\s|>|/)`, "i");
  return re.test(openTag);
}

function getAttr(openTag: string, attr: string): string | undefined {
  const re = new RegExp(`\\s${escapeRe(attr)}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = re.exec(openTag);
  if (!m) return undefined;
  return m[2] ?? m[3] ?? m[4];
}

function numAttr(openTag: string, attr: string): number | undefined {
  const raw = getAttr(openTag, attr);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function boolAttr(openTag: string, attr: string): boolean {
  if (!hasAttr(openTag, attr)) return false;
  const raw = getAttr(openTag, attr);
  if (raw === undefined) return true; // bare attr present
  return raw !== "false" && raw !== "0";
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function snippet(s: string, max = 160): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
