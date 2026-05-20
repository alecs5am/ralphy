// Legacy output helper. Most CLI commands call `out(data)` — depending on the
// pretty/json mode this either dumps JSON (machine-friendly, for piping / agents)
// or renders a styled table / key-value tree (human-friendly, for terminal use).
//
// The actual UI primitives live in `cli/lib/ui.ts`. This file is a thin
// compat layer that detects the mode via setPretty() OR auto-TTY and routes to
// ui.ts when in pretty mode.

import { c, icons, table as uiTable, kv as uiKv, isPrettyMode } from "./ui.js";

let _pretty = false;

export function setPretty(v: boolean) {
  _pretty = v;
}

/** Returns true when commands should render pretty. Honors --pretty / --json / TTY auto-detect. */
export function isPretty() {
  // Legacy setPretty() callers (e.g. --pretty flag) take priority; otherwise
  // defer to ui.ts mode resolution (which handles --json + TTY auto-detect).
  return _pretty || isPrettyMode();
}

export function out(data: unknown) {
  if (!isPretty()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (Array.isArray(data)) {
    printArray(data);
  } else if (typeof data === "object" && data !== null) {
    printObject(data as Record<string, unknown>);
  } else {
    console.log(c.value(String(data)));
  }
}

export function ok(message: string) {
  if (isPretty()) {
    console.log(`${icons.ok} ${message}`);
  }
}

export function err(message: string): never {
  // Legacy free-form err() path. New code should call `raiseError(code, ctx)`
  // from cli/lib/errors/index.ts (01.02.04 / 01.06.01) — the lint script
  // scripts/lint-error-codes.ts greps for raiseError calls and verifies the
  // code is in the catalog.
  //
  // Off-TTY/--json: emit { error: { code: "E_INTERNAL", message } } so the
  // shape matches the catalog-driven path and agents can parse it.
  if (isPretty()) {
    console.error(`${icons.fail} ${c.err(message)}`);
  } else {
    process.stderr.write(JSON.stringify({ error: { code: "E_INTERNAL", message } }) + "\n");
  }
  process.exit(1);
}

// ─── Internals ───────────────────────────────────────────────────────────────

function printArray(rows: unknown[]) {
  if (rows.length === 0) {
    console.log(`  ${c.muted("(empty)")}`);
    return;
  }
  // Heterogeneous arrays or scalar arrays → just list them
  const allObjects = rows.every((r) => r && typeof r === "object" && !Array.isArray(r));
  if (!allObjects) {
    for (const r of rows) {
      console.log(`  ${icons.bullet} ${typeof r === "object" ? c.muted(JSON.stringify(r)) : c.value(String(r))}`);
    }
    return;
  }

  const records = rows as Record<string, unknown>[];
  // Build column set as union of keys, but preserve first-row order for stability.
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const r of records) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); keys.push(k); }

  uiTable(records, keys.map((k) => ({
    key: k,
    header: k,
    format: formatGenericCell,
  })));
  console.log(`  ${c.muted(`${records.length} row${records.length === 1 ? "" : "s"}`)}`);
}

/**
 * Heuristic formatter for arbitrary cell values. Status-like strings get colored,
 * booleans get checks, nulls get dashes, long strings get truncated.
 */
function formatGenericCell(value: unknown): string {
  if (value === null || value === undefined) return c.muted("—");
  if (typeof value === "boolean") return value ? icons.ok : icons.fail;
  if (Array.isArray(value)) {
    if (value.length === 0) return c.muted("[]");
    const joined = value.map((v) => String(v)).join(", ");
    return joined.length > 60 ? c.value(joined.slice(0, 57)) + c.muted("…") : c.value(joined);
  }
  if (typeof value === "object") return c.muted(JSON.stringify(value).slice(0, 80));
  const s = String(value);
  // Status heuristic
  if (/^(done|ok|success|completed|✓)$/i.test(s)) return c.ok(s);
  if (/^(failed|error|fail|✗|✖)$/i.test(s)) return c.err(s);
  if (/^(pending|running|in.progress|assets|render|prompts)$/i.test(s)) return c.warn(s);
  if (/^(draft|new|scenario)$/i.test(s)) return c.info(s);
  return s.length > 80 ? c.value(s.slice(0, 77)) + c.muted("…") : c.value(s);
}

function printObject(obj: Record<string, unknown>, indent = 2) {
  const pad = " ".repeat(indent);
  // Build kv-compatible entries, recursing into nested objects with extra indent.
  const flat: Array<[string, unknown]> = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      // Print parent key + indented child
      flat.push([k, c.muted("(see below)")]);
    } else {
      flat.push([k, v]);
    }
  }
  if (indent === 2) {
    uiKv(flat, { indent: 2 });
    // Then recurse into nested objects with header lines
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        console.log(`\n${pad}${c.label(k + ":")}`);
        printObject(v as Record<string, unknown>, indent + 2);
      }
    }
  } else {
    // Deeper levels: simpler, no nested handling
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === undefined) {
        console.log(`${pad}${c.label(k + ":")} ${c.muted("—")}`);
      } else if (Array.isArray(v)) {
        console.log(`${pad}${c.label(k + ":")} ${c.value(v.join(", "))}`);
      } else if (typeof v === "object") {
        console.log(`${pad}${c.label(k + ":")}`);
        printObject(v as Record<string, unknown>, indent + 2);
      } else {
        console.log(`${pad}${c.label(k + ":")} ${c.value(String(v))}`);
      }
    }
  }
}
