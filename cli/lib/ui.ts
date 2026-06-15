// CLI UI primitives — colors, icons, tables, boxes, progress bars, spinners.
//
// `ralphy` is talked to in two contexts:
//   1. Human in a terminal — wants color, layout, icons, progress
//   2. Agent / CI / script piping output — wants plain text or JSON
//
// We auto-detect TTY: if stdout is interactive, render pretty by default. The
// agent can still read pretty output fine (it's just text), but explicit
// `--json` forces machine output for shell pipelines.

import chalk, { Chalk } from "chalk";
import ora, { type Ora, type Options as OraOptions } from "ora";
// cli-table3 ships CJS — TS default-import complains under esModuleInterop strict.
// `require` works at runtime via bun's CJS shim; types are loaded via `Table.HorizontalTable` pattern below.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Table = require("cli-table3") as typeof import("cli-table3");

// ─── Color palette ───────────────────────────────────────────────────────────

/** A color function: wraps text in ANSI (or returns it plain when color is
 * disabled). Chalk builders satisfy this; so do the level-0 rebuilds in
 * disableColor(). Typed loosely so the palette can be swapped at runtime. */
type Colorizer = (text: string) => string;

export const c: Record<
  | "brand"
  | "accent"
  | "ok"
  | "warn"
  | "err"
  | "info"
  | "muted"
  | "bold"
  | "underline"
  | "label"
  | "value"
  | "cmd"
  | "path",
  Colorizer
> = {
  brand: chalk.hex("#FF7A1A"),
  accent: chalk.hex("#E87BA1"),

  ok: chalk.green,
  warn: chalk.yellow,
  err: chalk.red,
  info: chalk.cyan,
  muted: chalk.dim,
  bold: chalk.bold,
  underline: chalk.underline,

  label: chalk.dim,
  value: chalk.white,
  cmd: chalk.cyan,
  path: chalk.dim,
};

// ─── Icons ───────────────────────────────────────────────────────────────────

const ICON_GLYPHS = {
  ok: ["ok", "✓"],
  fail: ["err", "✖"],
  warn: ["warn", "⚠"],
  info: ["info", "ℹ"],
  bullet: ["muted", "•"],
  arrow: ["muted", "▸"],
  star: ["brand", "★"],
  spark: ["accent", "✦"],
  empty: ["muted", "◯"],
  pending: ["muted", "⠿"],
  diamond: ["brand", "◆"],
} as const;

function buildIcons(): Record<keyof typeof ICON_GLYPHS, string> {
  const out = {} as Record<keyof typeof ICON_GLYPHS, string>;
  for (const [name, [color, glyph]] of Object.entries(ICON_GLYPHS)) {
    out[name as keyof typeof ICON_GLYPHS] = c[color as keyof typeof c](glyph);
  }
  return out;
}

export const icons = buildIcons();

/**
 * Force all color OFF at runtime, regardless of chalk's import-time level
 * resolution (issue #001 §D). chalk v5 binds each `c.green` / `c.dim` builder
 * to the level snapshot at the time the property was first accessed — so if
 * the palette was built while FORCE_COLOR resolved level 3, a later
 * `chalk.level = 0` does NOT recolor those cached builders. This rebuilds the
 * `c` palette (and the baked `icons` strings) on a fresh level-0 Chalk
 * instance so NO_COLOR / --no-color is authoritative even when FORCE_COLOR was
 * also set. Called from the preAction hook in cli/index.ts. Idempotent.
 */
export function disableColor(): void {
  const plain = new Chalk({ level: 0 });
  for (const key of Object.keys(c) as Array<keyof typeof c>) {
    // c.brand / c.accent were chalk.hex(...) builders; reproduce them on the
    // level-0 instance. All other keys map to a named chalk style.
    if (key === "brand") c[key] = plain.hex("#FF7A1A");
    else if (key === "accent") c[key] = plain.hex("#E87BA1");
    else c[key] = plain[C_STYLE_NAMES[key]];
  }
  // Re-bake the icon strings with the now-uncolored palette.
  const fresh = buildIcons();
  for (const key of Object.keys(fresh) as Array<keyof typeof fresh>) {
    icons[key] = fresh[key];
  }
}

// Maps each `c` palette key (other than the two hex brand colors) to its chalk
// style name, so disableColor() can rebuild it on a level-0 instance.
const C_STYLE_NAMES: Record<
  Exclude<keyof typeof c, "brand" | "accent">,
  "green" | "yellow" | "red" | "cyan" | "dim" | "bold" | "underline" | "white"
> = {
  ok: "green",
  warn: "yellow",
  err: "red",
  info: "cyan",
  muted: "dim",
  bold: "bold",
  underline: "underline",
  label: "dim",
  value: "white",
  cmd: "cyan",
  path: "dim",
};

// ─── TTY + format-mode plumbing ──────────────────────────────────────────────

type Mode = "pretty" | "json" | "auto";
let _mode: Mode = "auto";
let _quiet = false;

export function setMode(m: Mode) {
  _mode = m;
}

export function isPrettyMode(): boolean {
  if (_mode === "pretty") return true;
  if (_mode === "json") return false;
  return Boolean(process.stdout.isTTY);
}

/**
 * Suppresses progress, spinners, and conversational output (ok/info/warn).
 * The final result (JSON object on pipe, table on TTY) still prints, and
 * errors on stderr still print. Threaded through the top-level `--quiet`
 * flag in cli/index.ts (01.05.03).
 */
export function setQuiet(v: boolean): void {
  _quiet = v;
}

export function isQuietMode(): boolean {
  return _quiet;
}

// ─── Sections + key-value blocks ─────────────────────────────────────────────

export function section(title: string, body?: string | string[]): void {
  console.log(`\n${icons.arrow} ${c.bold(title)}`);
  if (body !== undefined) {
    const lines = Array.isArray(body) ? body : body.split("\n");
    for (const line of lines) console.log(`  ${line}`);
  }
}

export function kv(
  pairs: Record<string, unknown> | Array<[string, unknown]>,
  opts: { indent?: number; maxKeyWidth?: number } = {},
): void {
  const indent = opts.indent ?? 2;
  const pad = " ".repeat(indent);
  const entries = Array.isArray(pairs) ? pairs : Object.entries(pairs);
  if (entries.length === 0) return;
  const maxKey = opts.maxKeyWidth ?? Math.max(...entries.map(([k]) => k.length));
  for (const [k, v] of entries) {
    const keyPart = c.label(k.padEnd(maxKey));
    const valPart = renderValue(v);
    console.log(`${pad}${keyPart}  ${valPart}`);
  }
}

// NULL POLICY (issue #001 §C): null / undefined renders as the em-dash `—`,
// NEVER the literal "null" / "undefined" — both for a standalone value AND for
// each element of an array value. Mirror of formatGenericCell() in
// cli/lib/output.ts; keep the two in lockstep.
function renderValue(v: unknown): string {
  if (v === null || v === undefined) return c.muted("—");
  if (typeof v === "boolean") return v ? icons.ok : icons.fail;
  if (Array.isArray(v)) {
    if (v.length === 0) return c.muted("[]");
    return v
      .map((x) => (x === null || x === undefined ? c.muted("—") : c.value(String(x))))
      .join(c.muted(", "));
  }
  if (typeof v === "object") return c.muted(JSON.stringify(v));
  return c.value(String(v));
}

// ─── Tables ──────────────────────────────────────────────────────────────────

export type TableColumn<T> = {
  key: keyof T | ((row: T) => unknown);
  header: string;
  format?: (value: unknown, row: T) => string;
  width?: number;
};

export function table<T>(rows: T[], cols: TableColumn<T>[]): void {
  if (rows.length === 0) {
    console.log(`  ${c.muted("(empty)")}`);
    return;
  }
  const t = new Table({
    head: cols.map((col) => c.bold(c.info(col.header))),
    colWidths: cols.map((col) => col.width ?? null) as number[],
    style: { head: [], border: ["grey"] },
    wordWrap: true,
  });
  for (const row of rows) {
    const cells = cols.map((col) => {
      const raw = typeof col.key === "function" ? col.key(row) : (row as Record<string, unknown>)[col.key as string];
      const rendered = col.format ? col.format(raw, row) : renderValue(raw);
      return rendered;
    });
    t.push(cells);
  }
  console.log(t.toString());
}

// ─── Boxes ───────────────────────────────────────────────────────────────────

export function box(content: string, opts: { title?: string; width?: number } = {}): void {
  const t = new Table({
    style: { border: ["grey"] },
    colWidths: opts.width ? [opts.width] : undefined,
    wordWrap: false,
  });
  if (opts.title) {
    t.push([{ content: c.bold(opts.title), hAlign: "left" as const }]);
    t.push([{ content: c.muted("─".repeat((opts.width ?? 60) - 2)), hAlign: "left" as const }]);
  }
  t.push([content]);
  console.log(t.toString());
}

// ─── Progress bars ───────────────────────────────────────────────────────────

export function bar(
  current: number,
  max: number,
  opts: { width?: number; filled?: string; empty?: string; color?: (s: string) => string } = {},
): string {
  const width = opts.width ?? 24;
  const filledChar = opts.filled ?? "█";
  const emptyChar = opts.empty ?? "░";
  const colorFn = opts.color ?? c.brand;
  const ratio = max === 0 ? 0 : Math.max(0, Math.min(1, current / max));
  const fillN = Math.round(ratio * width);
  return colorFn(filledChar.repeat(fillN)) + c.muted(emptyChar.repeat(width - fillN));
}

export function skillPath(currentBand: string): string {
  const bands = ["novice", "learning", "intermediate", "comfortable", "experienced", "expert"];
  return bands
    .map((b) => {
      if (b === currentBand) return c.brand("▸" + c.bold(b));
      return c.muted(b);
    })
    .join(c.muted(" → "));
}

// ─── Spinners ────────────────────────────────────────────────────────────────

export type Spinner = Ora;

export function spinner(label: string, opts: OraOptions = {}): Spinner {
  return ora({
    text: label,
    spinner: "dots",
    color: "cyan",
    ...opts,
  }).start();
}

export async function withSpinner<T>(
  label: string,
  fn: () => Promise<T>,
  opts: { successText?: string | ((result: T) => string); failText?: string | ((err: unknown) => string) } = {},
): Promise<T> {
  if (!isPrettyMode()) return fn();
  const s = spinner(label);
  try {
    const result = await fn();
    const ok = typeof opts.successText === "function" ? opts.successText(result) : (opts.successText ?? label);
    s.succeed(ok);
    return result;
  } catch (e) {
    const f = typeof opts.failText === "function" ? opts.failText(e) : (opts.failText ?? (e instanceof Error ? e.message : String(e)));
    s.fail(f);
    throw e;
  }
}

// ─── Banner ──────────────────────────────────────────────────────────────────

export function banner(): void {
  console.log(c.brand(`
   ____        __      __
  / __ \\____ _/ /___  / /_  __  __
 / /_/ / __ \`/ / __ \\/ __ \\/ / / /
/ _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\\__,_/_/\\.___/_/ /_/\\__, /
                          /____/`));
  console.log(c.muted("            UGC video pipeline · ralphy.dev\n"));
}

// ─── Convenience output helpers ──────────────────────────────────────────────

export function ok(message: string): void {
  if (_quiet) return;
  console.log(`${icons.ok} ${message}`);
}
export function warn(message: string): void {
  if (_quiet) return;
  console.log(`${icons.warn} ${c.warn(message)}`);
}
export function info(message: string): void {
  if (_quiet) return;
  console.log(`${icons.info} ${message}`);
}
export function fail(message: string): never {
  console.error(`${icons.fail} ${c.err(message)}`);
  process.exit(1);
}
