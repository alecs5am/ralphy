// Path intake helpers for `--ref` / `--first-frame` / `--last-frame` / `--audio`
// / `--image` / `--prompt-file` style flags on the generate / ref commands.
//
// Issue #025 caught two recurring papercuts:
//
//   1. cwd-anchored resolution. `path.resolve(opts.ref)` resolves against the
//      shell's cwd; when the user runs `ralphy generate image --project X
//      --ref scene-01-master.png` from outside the project dir the file is
//      ENOENT'd even though it lives at `workspace/projects/X/refs/...`. Four
//      separate postmortems (free-air-vpn-stickerpack, noski-people-001,
//      choose-your-guide-001, appstore-takeaminute-001) called this out as
//      "20 min of debug per project."
//
//   2. macOS screenshot paths contain a U+202F NARROW NO-BREAK SPACE between
//      the date and the time (e.g. "Screenshot 2026-05-29 at 10.42.11 AM.png"
//      — the visual space between "29" and "at" is U+202F). `ls` and shell
//      tab-completion find the file fine; Node's `fs.readFile` raises ENOENT
//      because the C-level syscall sees the raw bytes. The whole class of
//      non-ASCII whitespace (U+00A0 NO-BREAK SPACE, U+200B ZERO-WIDTH SPACE,
//      U+FEFF BOM) hits the same wall. The fix is to normalize at intake.
//
// Both helpers are intake-boundary code — they run once per flag, fail soft,
// and warn on stderr so the user learns what was normalized.

import path from "node:path";
import { existsSync } from "node:fs";
import { projectsDir } from "./paths.js";

/**
 * Set of unicode whitespace / invisible code-points known to slip into shell
 * paths via macOS screenshot filenames, copy-paste from chat clients, or
 * pasted-from-PDF. We replace each with an ASCII space (U+0020) so the
 * resulting path matches what `ls` displays.
 *
 * - U+00A0 NO-BREAK SPACE
 * - U+202F NARROW NO-BREAK SPACE (the macOS screenshot offender)
 * - U+2007 FIGURE SPACE
 * - U+200B ZERO-WIDTH SPACE
 * - U+200C ZERO-WIDTH NON-JOINER
 * - U+200D ZERO-WIDTH JOINER
 * - U+FEFF ZERO-WIDTH NO-BREAK SPACE (BOM)
 */
const INVISIBLE_WHITESPACE_RE = /[   ​‌‍﻿]/g;

/**
 * Replace U+202F / U+00A0 / zero-width-space variants with an ASCII space.
 * Returns the cleaned string AND a flag indicating whether any normalization
 * happened — the caller decides whether to warn on stderr. Pure / no IO.
 */
export function normalizePathChars(p: string): { path: string; normalized: boolean } {
  if (!INVISIBLE_WHITESPACE_RE.test(p)) return { path: p, normalized: false };
  // Reset state on the regex literal (g-flag carries `.lastIndex`).
  INVISIBLE_WHITESPACE_RE.lastIndex = 0;
  return { path: p.replace(INVISIBLE_WHITESPACE_RE, " "), normalized: true };
}

/**
 * Intake-boundary wrapper: normalize invisible whitespace AND warn on stderr
 * when normalization happened. Returns the cleaned path. The warn is one-shot
 * per call so a batch loop logs each offender. Callers should use this once
 * per flag in the action() handler, before they hand off to a provider.
 */
export function normalizePathCharsWithWarn(p: string, label = "path"): string {
  const r = normalizePathChars(p);
  if (r.normalized) {
    // eslint-disable-next-line no-console
    console.error(
      `ralphy: ${label} contained invisible whitespace (U+202F / U+00A0 / zero-width); normalized to ASCII space.`,
    );
  }
  return r.path;
}

/**
 * Resolve a user-supplied path against a project, with cwd-relative as the
 * happy path and project-relative as the fallback. URLs / data: URIs pass
 * through unchanged.
 *
 * Resolution order (first hit wins):
 *   1. http(s):// or data: URI → return verbatim
 *   2. cwd/p (the legacy behavior) → return absolute
 *   3. workspace/projects/<id>/p → return absolute (the new fallback)
 *   4. workspace/projects/<id>/refs/p → return absolute (convenience for
 *      `--ref scene-01-master.png` when refs live in the project's refs/)
 *   5. give up and return the cwd-relative absolute path (existing ENOENT
 *      behavior downstream — we don't silently invent a path that doesn't
 *      exist)
 *
 * The cwd-first ordering preserves the existing behavior for everyone who
 * already had a working setup — the project-relative path is purely additive
 * for the "I ran from outside the project dir" case.
 */
export function resolveProjectPath(p: string, projectId?: string): string {
  if (!p) return p;
  if (/^https?:\/\//i.test(p) || p.startsWith("data:")) return p;
  const cleaned = normalizePathChars(p).path;

  // Anything already-absolute → trust it. The fallback chain only fires for
  // relative-input that didn't pan out against cwd.
  if (path.isAbsolute(cleaned)) return cleaned;

  const cwdAbs = path.resolve(cleaned);
  if (existsSync(cwdAbs)) return cwdAbs;

  if (projectId) {
    const projectAbs = path.join(projectsDir(), projectId, cleaned);
    if (existsSync(projectAbs)) return projectAbs;

    const refsAbs = path.join(projectsDir(), projectId, "refs", cleaned);
    if (existsSync(refsAbs)) return refsAbs;
  }

  // Nothing matched — return the cwd-relative absolute so the existing ENOENT
  // path carries the user's literal intent (and the error names the path they
  // typed, not an invented one).
  return cwdAbs;
}

/**
 * Combined intake: normalize invisible whitespace (with a stderr warn) + run
 * project-relative resolution. Use this on every `--ref` / `--first-frame` /
 * `--last-frame` / `--audio` / `--image` flag in commands/generate.ts. URLs
 * and data: URIs pass through unchanged.
 *
 * Returns the resolved absolute path (or the verbatim URL / data: URI).
 */
export function intakePath(
  p: string,
  projectId: string | undefined,
  label = "path",
): string {
  if (!p) return p;
  if (/^https?:\/\//i.test(p) || p.startsWith("data:")) return p;
  const cleaned = normalizePathCharsWithWarn(p, label);
  return resolveProjectPath(cleaned, projectId);
}

/**
 * Intake for an array of paths (the `--ref <ref...>` repeating flag). Each
 * element runs through `intakePath` independently. Pass-through if undefined /
 * empty so the caller can still feed an `opts.ref` that wasn't supplied.
 */
export function intakePathList(
  refs: string[] | undefined,
  projectId: string | undefined,
  label = "ref",
): string[] | undefined {
  if (!refs || refs.length === 0) return refs;
  return refs.map((r, i) => intakePath(r, projectId, `${label}[${i}]`));
}

/**
 * Helper for the symmetric `--prompt` / `--prompt-file` story: returns the
 * prompt string (read from the file when only --prompt-file is set, the
 * inline --prompt when only that is set, --prompt when both are set since
 * inline beats file). When `requireOne` is true and neither is set, returns
 * null so the caller can raise a typed error. When `requireOne` is false the
 * caller may want neither to be a no-op.
 *
 * NOT async-defaulted to keep the signature identical to other helpers; the
 * `fs.readFile` import is inlined to avoid pulling fs/promises into every
 * command. (Callers already import `fs` so this is moot — but the explicit
 * import keeps the helper self-contained for testing.)
 */
export async function readPromptOrFile(opts: {
  prompt?: string;
  promptFile?: string;
  projectId?: string;
}): Promise<string | null> {
  if (opts.prompt && opts.prompt.length > 0) return opts.prompt;
  if (opts.promptFile && opts.promptFile.length > 0) {
    const fs = await import("node:fs/promises");
    const resolved = intakePath(opts.promptFile, opts.projectId, "prompt-file");
    return fs.readFile(resolved, "utf-8");
  }
  return null;
}

/**
 * Helper for the symmetric `--ref` / `--ref-file` story: returns the merged
 * list of refs, where the file is a newline-separated list of paths (blank
 * lines and `#` comments ignored). Both inline `--ref ...` and `--ref-file
 * <path>` may be passed; the result is the concatenation, in argv order. Each
 * resulting ref runs through `intakePath` so cwd-relative + project-relative
 * + NBSP normalization all apply uniformly.
 */
export async function readRefsOrFile(opts: {
  refs?: string[];
  refFile?: string;
  projectId?: string;
}): Promise<string[] | undefined> {
  const inline = opts.refs && opts.refs.length > 0 ? opts.refs.slice() : [];
  let fileLines: string[] = [];
  if (opts.refFile && opts.refFile.length > 0) {
    const fs = await import("node:fs/promises");
    const resolved = intakePath(opts.refFile, opts.projectId, "ref-file");
    const raw = await fs.readFile(resolved, "utf-8");
    fileLines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
  }
  const merged = [...inline, ...fileLines];
  if (merged.length === 0) return undefined;
  return merged.map((r, i) => intakePath(r, opts.projectId, `ref[${i}]`));
}
