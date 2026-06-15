// Per-verb pretty-render assertions (issue #001 §B).
//
// For every canonical verb shape in tests/fixtures/verb-shapes.ts, render it
// through `out()` in pretty mode and assert the #001 invariants. This is an
// *invariant-based* snapshot, not a brittle full-string snapshot: it asserts
// the render is well-formed (no `[object Object]`, no standalone `undefined`,
// no literal `null`/`undefined`, a readable layout that surfaces the verb's
// keys) without locking the exact column widths / colors. That keeps it
// resilient to cosmetic UI tweaks while still tripping a real printer
// regression.
//
// The same VERB_SHAPES registry is the source of truth the
// scripts/lint-out-coverage.ts lint cross-references, so adding a verb's
// canonical shape here both closes the lint and earns a render assertion.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { out, setPretty } from "../../cli/lib/output.js";
import { setMode } from "../../cli/lib/ui.js";
import { VERB_SHAPES, type VerbShape } from "../fixtures/verb-shapes.js";

let captured: string[] = [];
const originalLog = console.log;

beforeEach(() => {
  captured = [];
  console.log = (...args: unknown[]) => {
    captured.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  setPretty(true);
  setMode("pretty");
});

afterEach(() => {
  console.log = originalLog;
  setPretty(false);
  setMode("auto");
});

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const rendered = () => captured.map(stripAnsi).join("\n");

/** Collect every primitive leaf key + scalar value from a shape, for the
 * "readable layout surfaces the data" assertion. */
function collectVisibleKeys(value: unknown, keys: Set<string>) {
  if (Array.isArray(value)) {
    for (const v of value) collectVisibleKeys(v, keys);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      keys.add(k);
      collectVisibleKeys(v, keys);
    }
  }
}

function assertSnapshotInvariants(label: string, shape: unknown) {
  const text = rendered();

  // 1. No [object Object] — the original bug class.
  expect(text, `[${label}] contains [object Object]`).not.toContain("[object Object]");

  // 2. No standalone `undefined` cell (a bare token surrounded by whitespace /
  //    table borders). `undefined` inside a longer word is fine.
  expect(text, `[${label}] contains a standalone 'undefined' cell`).not.toMatch(/[\s││|]undefined[\s││|]/);

  // 3. Null policy (#001 §C): never the literal "null" / "undefined" token.
  //    null/undefined must render as the em-dash `—`.
  expect(text, `[${label}] leaks a literal 'null' token`).not.toMatch(/[\s,││|]null[\s,││|]/);

  // 4. No JSON-escape leakage (e.g. `\"key\":`).
  expect(text, `[${label}] contains JSON-escape leakage`).not.toMatch(/\\"[a-z_]+\\":/);

  // 5. Readable layout: the render is non-empty and surfaces at least the
  //    top-level keys of the shape (so the printer didn't silently drop the
  //    structure). For array-of-objects shapes this is the row keys.
  expect(text.trim().length, `[${label}] rendered empty`).toBeGreaterThan(0);
  const keys = new Set<string>();
  collectVisibleKeys(shape, keys);
  // Assert at least one real key appears verbatim — a sanity check that the
  // table/kv tree actually printed the data rather than a placeholder.
  if (keys.size > 0) {
    const anyKeyPresent = [...keys].some((k) => text.includes(k));
    expect(anyKeyPresent, `[${label}] render does not surface any of its keys: ${[...keys].join(", ")}`).toBe(true);
  }
}

describe("output pretty snapshot — per-verb canonical shapes", () => {
  for (const [command, shapes] of Object.entries(VERB_SHAPES)) {
    describe(command, () => {
      for (const { label, shape } of shapes as VerbShape[]) {
        test(`renders ${label} cleanly`, () => {
          out(shape);
          assertSnapshotInvariants(label, shape);
        });
      }
    });
  }
});

describe("output pretty snapshot — coverage breadth", () => {
  test("covers 30+ verbs", () => {
    // The issue calls for 30+ verbs with visible output. Lock the floor so a
    // future trim is deliberate.
    expect(Object.keys(VERB_SHAPES).length).toBeGreaterThanOrEqual(30);
  });

  test("every shape is a structured (object/array) value", () => {
    for (const [command, shapes] of Object.entries(VERB_SHAPES)) {
      for (const { label, shape } of shapes as VerbShape[]) {
        const structured = shape !== null && typeof shape === "object";
        expect(structured, `${command}/${label} is not a structured shape`).toBe(true);
      }
    }
  });
});
