// Pretty-mode regression tests for cli/lib/output.ts.
//
// Background: a `ralphy skill install --agent claude` print landed as
// `installed  [object Object]` in pretty mode, because printObject pushed the
// raw array into uiKv which stringified it. The fix renders array-of-object
// values in a "(N items — see below)" section that lands a real table.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { out, setPretty } from "../../cli/lib/output.js";
import { setMode } from "../../cli/lib/ui.js";

let captured: string[] = [];
const originalLog = console.log;

beforeEach(() => {
  captured = [];
  console.log = (...args: unknown[]) => {
    captured.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
});

afterEach(() => {
  console.log = originalLog;
  setPretty(false);
  setMode("auto");
});

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const rendered = () => captured.map(stripAnsi).join("\n");

describe("pretty mode rendering — arrays of objects", () => {
  test("array-of-objects under a key does not render as [object Object] (regression)", () => {
    setPretty(true);
    setMode("pretty");

    out({
      installed: [
        { ok: true, agent: "claude", scope: "user", installed: ["/a/path", "/b/path"] },
      ],
    });

    const joined = captured.map(stripAnsi).join("\n");
    expect(joined).not.toContain("[object Object]");
    // Header kv hint
    expect(joined).toMatch(/installed\s+\(1 item — see below\)/);
    // Section header for the array
    expect(joined).toMatch(/installed:/);
    // Inner table column headers
    expect(joined).toContain("agent");
    expect(joined).toContain("scope");
    // Inner values
    expect(joined).toContain("claude");
  });

  test("multiple-item array uses plural label", () => {
    setPretty(true);
    setMode("pretty");

    out({
      results: [
        { id: "a", status: "ok" },
        { id: "b", status: "ok" },
        { id: "c", status: "failed" },
      ],
    });

    const joined = captured.map(stripAnsi).join("\n");
    expect(joined).toMatch(/results\s+\(3 items — see below\)/);
    expect(joined).not.toContain("[object Object]");
  });

  test("empty array renders inline without a (see below) section", () => {
    setPretty(true);
    setMode("pretty");

    out({ pulled: [], template: "noski" });

    const joined = captured.map(stripAnsi).join("\n");
    expect(joined).not.toContain("see below");
    expect(joined).not.toContain("[object Object]");
  });

  test("scalar arrays still render inline (no see-below recursion)", () => {
    setPretty(true);
    setMode("pretty");

    // Arrays of strings are not "array of objects", so they keep the legacy
    // inline rendering through uiKv → formatGenericCell.
    out({ tags: ["a", "b", "c"], project: "spring-001" });

    const joined = captured.map(stripAnsi).join("\n");
    expect(joined).not.toContain("see below");
    expect(joined).not.toContain("[object Object]");
  });

  test("nested object under a key still hints with (see below)", () => {
    setPretty(true);
    setMode("pretty");

    out({
      meta: { version: "0.1.0", channel: "stable" },
      project: "demo",
    });

    const joined = captured.map(stripAnsi).join("\n");
    expect(joined).toMatch(/meta\s+\(see below\)/);
    expect(joined).toContain("version");
    expect(joined).toContain("0.1.0");
    expect(joined).not.toContain("[object Object]");
  });
});

describe("null / undefined rendering policy (#001 §C)", () => {
  // POLICY: null / undefined renders as the em-dash `—`, NEVER the literal
  // "null" / "undefined" — at every level (standalone cell, nested value, and
  // each element of an array value). Encoded in formatGenericCell()/output.ts
  // + renderValue()/ui.ts, documented in docs/developing-ralphy.md.
  const EM_DASH = "—";

  test("top-level null value renders as em-dash, not the literal 'null'", () => {
    setPretty(true);
    setMode("pretty");

    out({ error: null, status: "ok" });

    const joined = rendered();
    expect(joined).toContain(EM_DASH);
    expect(joined).not.toMatch(/[\s,││|]null[\s,││|]/);
    expect(joined).not.toMatch(/[\s,││|]undefined[\s,││|]/);
  });

  test("top-level undefined value renders as em-dash", () => {
    setPretty(true);
    setMode("pretty");

    out({ note: undefined, project: "demo-001" });

    const joined = rendered();
    expect(joined).toContain(EM_DASH);
    expect(joined).not.toMatch(/[\s,││|]undefined[\s,││|]/);
  });

  test("null inside an array cell renders as em-dash, not literal 'null'", () => {
    setPretty(true);
    setMode("pretty");

    out({ tags: ["a", null, "b"], project: "demo-001" });

    const joined = rendered();
    // The array should render `a, —, b` — never `a, null, b`.
    expect(joined).toMatch(/a,\s*—,\s*b/);
    expect(joined).not.toContain("null");
  });

  test("null in a deeply-nested array renders as em-dash", () => {
    setPretty(true);
    setMode("pretty");

    out({ root: { mid: { leaf_arr: ["x", null, undefined] } } });

    const joined = rendered();
    expect(joined).toMatch(/x,\s*—,\s*—/);
    expect(joined).not.toContain("null");
    expect(joined).not.toMatch(/[\s,││|]undefined[\s,││|]/);
  });

  test("null in a table cell (array-of-objects) renders as em-dash", () => {
    setPretty(true);
    setMode("pretty");

    out({
      results: [
        { id: "a", error: null },
        { id: "b", error: "boom" },
      ],
    });

    const joined = rendered();
    expect(joined).toContain(EM_DASH);
    // The `error` column for row `a` is null -> em-dash, never literal null.
    expect(joined).not.toMatch(/[\s,││|]null[\s,││|]/);
  });
});

describe("JSON mode rendering — arrays of objects", () => {
  test("JSON mode emits the raw array, not the pretty hint", () => {
    setPretty(false);
    setMode("json");

    out({ installed: [{ ok: true, agent: "claude" }] });

    const joined = captured.join("\n");
    // Should be parseable JSON
    const parsed = JSON.parse(joined);
    expect(parsed.installed).toBeInstanceOf(Array);
    expect(parsed.installed[0]).toEqual({ ok: true, agent: "claude" });
    expect(joined).not.toContain("see below");
    expect(joined).not.toContain("[object Object]");
  });
});
