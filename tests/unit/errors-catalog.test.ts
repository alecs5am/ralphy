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

  test("stays below the migration-era budget of 56 entries", () => {
    // Original budget was <30; raised as new stable domain boundaries landed.
    // If this trips, audit the catalog before raising — every code is a
    // public surface, append-only after v1.0.
    expect(codes.length).toBeLessThan(56);
  });

  test("includes the six stable domain boundary codes", () => {
    expect(ERROR_CODES.E_CONFLICT.httpAnalog).toBe(409);
    expect(ERROR_CODES.E_OBJECT_MISSING.httpAnalog).toBe(424);
    expect(ERROR_CODES.E_MIGRATION_INCOMPLETE.httpAnalog).toBe(409);
    expect(ERROR_CODES.E_PROTOCOL_UNSUPPORTED.httpAnalog).toBe(426);
    expect(ERROR_CODES.E_PROTOCOL_INVALID.httpAnalog).toBe(400);
    expect(ERROR_CODES.E_SECRET_STORE.class).toBe("env");
  });

  test("includes the five stable migration refusal codes", () => {
    expect({
      E_MIGRATION_LOCKED: ERROR_CODES.E_MIGRATION_LOCKED.class,
      E_MIGRATION_SPACE: ERROR_CODES.E_MIGRATION_SPACE.class,
      E_MIGRATION_COVERAGE: ERROR_CODES.E_MIGRATION_COVERAGE.class,
      E_MIGRATION_VERIFY: ERROR_CODES.E_MIGRATION_VERIFY.class,
      E_MIGRATION_CUTOVER: ERROR_CODES.E_MIGRATION_CUTOVER.class,
    }).toEqual({
      E_MIGRATION_LOCKED: "user",
      E_MIGRATION_SPACE: "user",
      E_MIGRATION_COVERAGE: "gate",
      E_MIGRATION_VERIFY: "gate",
      E_MIGRATION_CUTOVER: "gate",
    });
  });

  test("gives each domain boundary its exact class and actionable hint", () => {
    expect({
      class: ERROR_CODES.E_CONFLICT.class,
      hint: ERROR_CODES.E_CONFLICT.hint,
    }).toEqual({
      class: "user",
      hint: "Reload the exact {kind} {id}, apply the change against its current version or state, and retry.",
    });
    expect({
      class: ERROR_CODES.E_OBJECT_MISSING.class,
      hint: ERROR_CODES.E_OBJECT_MISSING.hint,
    }).toEqual({
      class: "env",
      hint: "Run `ralphy doctor --storage` to identify missing bucket objects before retrying.",
    });
    expect({
      class: ERROR_CODES.E_MIGRATION_INCOMPLETE.class,
      hint: ERROR_CODES.E_MIGRATION_INCOMPLETE.hint,
    }).toEqual({
      class: "user",
      hint: "Run `ralphy migrate domain verify` and complete or recover the reported migration.",
    });
    expect({
      class: ERROR_CODES.E_PROTOCOL_UNSUPPORTED.class,
      hint: ERROR_CODES.E_PROTOCOL_UNSUPPORTED.hint,
    }).toEqual({
      class: "user",
      hint: "Upgrade Ralphy Desktop and core to compatible versions, then reconnect.",
    });
    expect({
      class: ERROR_CODES.E_PROTOCOL_INVALID.class,
      hint: ERROR_CODES.E_PROTOCOL_INVALID.hint,
    }).toEqual({
      class: "user",
      hint: "Upgrade Ralphy Desktop and core to compatible versions, then reconnect.",
    });
    expect({
      class: ERROR_CODES.E_SECRET_STORE.class,
      hint: ERROR_CODES.E_SECRET_STORE.hint,
      hasHttpAnalog: "httpAnalog" in ERROR_CODES.E_SECRET_STORE,
    }).toEqual({
      class: "env",
      hint: "Run `ralphy provider auth status` and repair the reported credential-store issue.",
      hasHttpAnalog: false,
    });
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
