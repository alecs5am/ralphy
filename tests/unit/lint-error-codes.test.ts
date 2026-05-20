// Unit test for the error-code lint script (scripts/lint-error-codes.ts).
//
// The script scans cli/ for raiseError(<code>, ...) call sites and verifies
// each <code> literal is in the catalog. Per 01.06.01 acceptance, new errors
// must be added to the catalog before being thrown — this is the lint that
// enforces it.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lintFiles } from "../../scripts/lint-error-codes.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-errors-"));
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function writeFile(name: string, body: string): string {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, body);
  return p;
}

describe("lintFiles", () => {
  test("returns empty array when all codes are in the catalog", () => {
    const f = writeFile(
      "good.ts",
      `
        import { raiseError } from "../lib/errors/index.js";
        raiseError("E_NOT_FOUND", { kind: "Project", id: "x" });
        raiseError("E_INPUT_INVALID", { field: "foo", detail: "bar" });
      `,
    );
    const violations = lintFiles([f]);
    expect(violations).toEqual([]);
  });

  test("flags unknown codes with file:line", () => {
    const f = writeFile(
      "bad.ts",
      `
        import { raiseError } from "../lib/errors/index.js";
        raiseError("E_TOTALLY_FAKE_CODE", {});
      `,
    );
    const violations = lintFiles([f]);
    expect(violations.length).toBe(1);
    expect(violations[0]!.code).toBe("E_TOTALLY_FAKE_CODE");
    expect(violations[0]!.file).toBe(f);
    expect(violations[0]!.line).toBeGreaterThan(0);
  });

  test("ignores non-literal first args (e.g. variables)", () => {
    // We can't statically verify dynamic codes; the lint should skip them
    // silently rather than false-positive.
    const f = writeFile(
      "dynamic.ts",
      `
        const code = "E_NOT_FOUND";
        raiseError(code, {});
      `,
    );
    const violations = lintFiles([f]);
    expect(violations).toEqual([]);
  });

  test("ignores commented-out lines", () => {
    const f = writeFile(
      "commented.ts",
      `
        // raiseError("E_TOTALLY_FAKE_CODE", {});
        /* raiseError("E_ALSO_FAKE", {}); */
      `,
    );
    const violations = lintFiles([f]);
    expect(violations).toEqual([]);
  });

  test("supports multiple violations across multiple files", () => {
    const a = writeFile(
      "a.ts",
      `raiseError("E_FAKE_A", {});`,
    );
    const b = writeFile(
      "b.ts",
      `raiseError("E_FAKE_B", {});`,
    );
    const violations = lintFiles([a, b]);
    expect(violations.length).toBe(2);
    expect(violations.map((v) => v.code).sort()).toEqual(["E_FAKE_A", "E_FAKE_B"]);
  });

  test("treats double and single quoted codes equally", () => {
    const f = writeFile(
      "quotes.ts",
      `
        raiseError('E_NOT_FOUND', {});
        raiseError("E_INPUT_INVALID", {});
      `,
    );
    const violations = lintFiles([f]);
    expect(violations).toEqual([]);
  });
});
