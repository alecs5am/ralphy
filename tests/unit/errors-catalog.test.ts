// Unit tests for the CLI error catalog (cli/lib/errors/catalog.ts).
//
// The catalog is the single source of truth for every error code the CLI
// can emit. It is append-only post-v1.0 (per 01-D-07), so these tests are
// the lint that keeps drift out: shape, naming, uniqueness, total budget.

import { describe, test, expect } from "bun:test";
import {
  ERROR_CODES,
  ERROR_CLASSES,
  classifyExitCode,
  isKnownErrorCode,
  type ErrorCode,
} from "../../cli/lib/errors/catalog.js";

const codes = Object.keys(ERROR_CODES) as ErrorCode[];

describe("ERROR_CODES catalog", () => {
  test("has at least one entry", () => {
    expect(codes.length).toBeGreaterThan(0);
  });

  test("has fewer than 30 entries (v1.0 budget per 01.06.01)", () => {
    expect(codes.length).toBeLessThan(30);
  });

  test("every code matches /^E_[A-Z][A-Z0-9_]+$/", () => {
    for (const code of codes) {
      expect(code).toMatch(/^E_[A-Z][A-Z0-9_]+$/);
    }
  });

  test("every code carries the required entry shape", () => {
    for (const code of codes) {
      const entry = ERROR_CODES[code];
      expect(typeof entry.class).toBe("string");
      expect(ERROR_CLASSES).toContain(entry.class);
      expect(typeof entry.message).toBe("string");
      expect(entry.message.length).toBeGreaterThan(0);
      expect(typeof entry.hint).toBe("string");
      expect(entry.hint.length).toBeGreaterThan(0);
      expect(typeof entry.relatedDocs).toBe("string");
    }
  });

  test("hints never restate the message verbatim (01.06.03)", () => {
    for (const code of codes) {
      const entry = ERROR_CODES[code];
      expect(entry.hint.toLowerCase()).not.toBe(entry.message.toLowerCase());
    }
  });

  test("hints end with punctuation (full sentence)", () => {
    for (const code of codes) {
      const entry = ERROR_CODES[code];
      expect(entry.hint).toMatch(/[.!?]$/);
    }
  });

  test("deprecated entries name a replacement code", () => {
    for (const code of codes) {
      const entry = ERROR_CODES[code];
      if (entry.deprecated) {
        expect(entry.replacedBy).toBeTruthy();
        expect(isKnownErrorCode(entry.replacedBy!)).toBe(true);
      }
    }
  });

  test("template placeholders are well-formed {name}", () => {
    const placeholder = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
    for (const code of codes) {
      const entry = ERROR_CODES[code];
      for (const tmpl of [entry.message, entry.hint]) {
        // Walk the string; every '{' must open a placeholder and every '}'
        // must close one. Mismatched braces are a typo we want to catch.
        const opens = (tmpl.match(/\{/g) || []).length;
        const closes = (tmpl.match(/\}/g) || []).length;
        expect(opens).toBe(closes);
        // Each captured name must be a valid identifier.
        const matches = tmpl.matchAll(placeholder);
        for (const m of matches) {
          expect(m[1]).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*$/);
        }
      }
    }
  });

  test("isKnownErrorCode rejects garbage and accepts catalog codes", () => {
    expect(isKnownErrorCode("E_INPUT_INVALID")).toBe(true);
    expect(isKnownErrorCode("E_NOT_A_REAL_CODE_XYZ")).toBe(false);
    expect(isKnownErrorCode("")).toBe(false);
  });
});

describe("classifyExitCode", () => {
  test("user-class codes return exit 2", () => {
    expect(classifyExitCode("E_INPUT_INVALID")).toBe(2);
    expect(classifyExitCode("E_NOT_FOUND")).toBe(2);
  });

  test("provider-class codes return exit 3", () => {
    expect(classifyExitCode("E_PROVIDER_HTTP")).toBe(3);
    expect(classifyExitCode("E_PROVIDER_RATE_LIMIT")).toBe(3);
  });

  test("env-class codes return exit 4", () => {
    expect(classifyExitCode("E_ENV_KEY_MISSING")).toBe(4);
    expect(classifyExitCode("E_DEP_MISSING")).toBe(4);
  });

  test("quality-gate codes return exit 5", () => {
    expect(classifyExitCode("E_GATE_SCENARIO")).toBe(5);
    expect(classifyExitCode("E_REF_REQUIRED")).toBe(5);
  });

  test("internal / runtime codes return exit 1", () => {
    expect(classifyExitCode("E_INTERNAL")).toBe(1);
  });

  test("cancelled returns exit 130", () => {
    expect(classifyExitCode("E_CANCELLED")).toBe(130);
  });

  test("every catalog code maps to a known exit class", () => {
    for (const code of codes) {
      const exit = classifyExitCode(code);
      expect([0, 1, 2, 3, 4, 5, 130]).toContain(exit);
    }
  });
});
