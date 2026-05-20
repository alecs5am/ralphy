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
