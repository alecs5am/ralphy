// Pure-unit tests for `normalizeSlot` in cli/commands/generate.ts.
//
// The slot-id validator is one of the highest-frequency papercuts agents hit
// (issues/022): underscore / uppercase input gets auto-normalized with a
// stderr warning; otherwise the hard reject must list the valid char set AND
// suggest the sanitized form ("did you mean ...").
//
// `raiseError` writes to process.stderr and calls process.exit — we stub both
// the same way provider-registry.test.ts does it.

import { describe, test, expect, spyOn, beforeEach, afterEach } from "bun:test";
import { normalizeSlot } from "../../cli/commands/generate.js";

let stderrBuf: string;
let consoleErrSpy: ReturnType<typeof spyOn> | null = null;
let stderrSpy: ReturnType<typeof spyOn> | null = null;

beforeEach(() => {
  stderrBuf = "";
  stderrSpy = spyOn(process.stderr, "write").mockImplementation(((chunk: string | Uint8Array) => {
    stderrBuf += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as never);
  consoleErrSpy = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    stderrBuf += args.map((a) => (typeof a === "string" ? a : String(a))).join(" ") + "\n";
  });
});

afterEach(() => {
  stderrSpy?.mockRestore();
  consoleErrSpy?.mockRestore();
});

/** Run `fn` under a stubbed `process.exit` (raiseError calls it). */
function expectRefusal(fn: () => unknown): void {
  const exitSpy = spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`__exit__:${code ?? 0}`);
  }) as never);
  try {
    fn();
    throw new Error("expected a refusal, got none");
  } catch (e) {
    const msg = (e as Error).message;
    if (!/^__exit__:\d+$/.test(msg)) throw e;
  } finally {
    exitSpy.mockRestore();
  }
}

describe("normalizeSlot — soft normalization (warn on stderr, return canonical)", () => {
  test("underscore → hyphen, with stderr warning", () => {
    const got = normalizeSlot("smoke_test");
    expect(got).toBe("smoke-test");
    expect(stderrBuf).toContain("normalized");
    expect(stderrBuf).toContain("smoke_test");
    expect(stderrBuf).toContain("smoke-test");
  });

  test("uppercase → lowercase, with stderr warning", () => {
    const got = normalizeSlot("SceneOne");
    expect(got).toBe("sceneone");
    expect(stderrBuf).toContain("normalized");
  });

  test("mixed case + underscore (real postmortem case: MASTER_VENOM)", () => {
    const got = normalizeSlot("MASTER_VENOM");
    expect(got).toBe("master-venom");
    expect(stderrBuf).toContain("normalized");
    expect(stderrBuf).toContain("MASTER_VENOM");
    expect(stderrBuf).toContain("master-venom");
  });

  test("already-canonical slot passes silently (no warning)", () => {
    const got = normalizeSlot("scene-01-bg-image");
    expect(got).toBe("scene-01-bg-image");
    expect(stderrBuf).toBe("");
  });

  test("real postmortem case: scene-01-A-firstframe", () => {
    const got = normalizeSlot("scene-01-A-firstframe");
    expect(got).toBe("scene-01-a-firstframe");
    expect(stderrBuf).toContain("normalized");
  });

  test("real postmortem case: top-down-wide-reveal-A", () => {
    const got = normalizeSlot("top-down-wide-reveal-A");
    expect(got).toBe("top-down-wide-reveal-a");
    expect(stderrBuf).toContain("normalized");
  });

  test("real postmortem case: music-A-orchestral", () => {
    const got = normalizeSlot("music-A-orchestral");
    expect(got).toBe("music-a-orchestral");
    expect(stderrBuf).toContain("normalized");
  });
});

describe("normalizeSlot — hard reject (list valid chars + suggest sanitized form)", () => {
  test("space → hard reject with 'did you mean' suggestion", () => {
    expectRefusal(() => normalizeSlot("hello world"));
    expect(stderrBuf).toContain("hello world");
    expect(stderrBuf).toContain("did you mean");
    expect(stderrBuf).toContain("hello-world");
  });

  test("emoji → hard reject with suggestion stripping the emoji", () => {
    expectRefusal(() => normalizeSlot("scene-01-🔥-hero"));
    expect(stderrBuf).toContain("did you mean");
    expect(stderrBuf).toContain("scene-01-hero");
  });

  test("'..' → hard reject; suggestion empty after sanitization so omitted", () => {
    expectRefusal(() => normalizeSlot(".."));
    expect(stderrBuf).toContain("contains characters outside");
    expect(stderrBuf).not.toContain("did you mean");
  });

  test("slash (path-style input) → hard reject with suggestion", () => {
    expectRefusal(() => normalizeSlot("scene/01"));
    expect(stderrBuf).toContain("did you mean");
    // leading digit cluster is stripped by suggestSlot → suggestion is "scene"
    expect(stderrBuf).toContain("scene");
  });

  test("hard-reject error lists the valid character set", () => {
    expectRefusal(() => normalizeSlot("a b"));
    expect(stderrBuf).toContain("[a-z0-9-]");
  });

  test("unicode (accented chars) → hard reject with ASCII-folded suggestion", () => {
    expectRefusal(() => normalizeSlot("café-scène"));
    expect(stderrBuf).toContain("did you mean");
    expect(stderrBuf).toContain("cafe-scene");
  });
});

describe("normalizeSlot — edge cases inside the relaxed set", () => {
  test("'_smoke-test' (leading underscore) is in the relaxed set, normalizes to '-smoke-test' " +
    "which is canonical-legal — documents that the canonical regex does not enforce a leading-letter rule", () => {
    const got = normalizeSlot("_smoke-test");
    expect(got).toBe("-smoke-test");
  });

  test("digit-only input '123' passes through (canonical regex permits)", () => {
    const got = normalizeSlot("123");
    expect(got).toBe("123");
  });
});
