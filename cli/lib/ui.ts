// CLI UI primitives — colors, icons, tables, boxes, progress bars, spinners.
//
// `ralphy` is talked to in two contexts:
//   1. Human in a terminal — wants color, layout, icons, progress
//   2. Agent / CI / script piping output — wants plain text or JSON
//
// We auto-detect TTY: if stdout is interactive, render pretty by default. The
// agent can still read pretty output fine (it's just text), but explicit
// `--json` forces machine output for shell pipelines.

import chalk from "chalk";
import ora, { type Ora, type Options as OraOptions } from "ora";
// cli-table3 ships CJS — TS default-import complains under esModuleInterop strict.
// `require` works at runtime via bun's CJS shim; types are loaded explicitly.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Table = require("cli-table3") as typeof import("cli-table3").default;

// ─── Color palette ───────────────────────────────────────────────────────────

export const c = {
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

export const icons = {
  ok: c.ok("✓"),
  fail: c.err("✖"),
  warn: c.warn("⚠"),
  info: c.info("ℹ"),
  bullet: c.muted("•"),
  arrow: c.muted("▸"),
  star: c.brand("★"),
  spark: c.accent("✦"),
  empty: c.muted("◯"),
  pending: c.muted("⠿"),
  diamond: c.brand("◆"),
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

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return c.muted("—");
  if (typeof v === "boolean") return v ? icons.ok : icons.fail;
  if (Array.isArray(v)) {
    if (v.length === 0) return c.muted("[]");
    return v.map((x) => c.value(String(x))).join(c.muted(", "));
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
