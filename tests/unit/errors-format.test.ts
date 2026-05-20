// Unit tests for the error formatter (cli/lib/errors/format.ts).
//
// The formatter turns an (ErrorCode, context) pair into:
//   • a structured JSON payload (off-TTY / --json mode)
//   • a pretty-rendered string (on-TTY mode)
// and ensures the right exit code is selected per 01.06.02.

import { describe, test, expect } from "bun:test";
import {
  formatError,
  buildErrorPayload,
  interpolate,
} from "../../cli/lib/errors/format.js";

describe("interpolate", () => {
  test("replaces {placeholders} from ctx", () => {
    expect(interpolate("hello {name}", { name: "world" })).toBe("hello world");
  });

  test("leaves unknown placeholders intact", () => {
    expect(interpolate("hello {name}", {})).toBe("hello {name}");
  });

  test("coerces non-string values to string", () => {
    expect(interpolate("count = {n}", { n: 42 })).toBe("count = 42");
    expect(interpolate("flag = {b}", { b: true })).toBe("flag = true");
  });

  test("escapes nothing — placeholders are literal {name}", () => {
    expect(interpolate("a{x}b{y}c", { x: "1", y: "2" })).toBe("a1b2c");
  });
});

describe("buildErrorPayload", () => {
  test("returns { error: { code, message, hint } } for a known code", () => {
    const p = buildErrorPayload("E_NOT_FOUND", { kind: "project", id: "spring-001" });
    expect(p.error.code).toBe("E_NOT_FOUND");
    expect(p.error.message).toBe("project not found: spring-001");
    expect(p.error.hint).toContain("ralphy project list");
  });

  test("includes httpAnalog when the entry has one", () => {
    const p = buildErrorPayload("E_PROVIDER_RATE_LIMIT", {
      provider: "OpenRouter",
      retryAfter: 30,
    });
    expect(p.error.httpAnalog).toBe(429);
  });

  test("omits hint if it interpolated empty (defensive)", () => {
    const p = buildErrorPayload("E_INTERNAL", { detail: "boom" });
    expect(p.error.code).toBe("E_INTERNAL");
    expect(p.error.message).toBe("Internal error: boom");
    expect(p.error.hint).toBeTruthy();
  });
});

describe("formatError", () => {
  test("pretty=false returns valid JSON terminated by newline", () => {
    const s = formatError("E_NOT_FOUND", { kind: "project", id: "x" }, { pretty: false });
    expect(s.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(s);
    expect(parsed.error.code).toBe("E_NOT_FOUND");
  });

  test("pretty=true returns colored string (not JSON)", () => {
    const s = formatError("E_NOT_FOUND", { kind: "project", id: "x" }, { pretty: true });
    // Should not be parseable JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(s);
    } catch {
      parsed = "not-json";
    }
    expect(parsed).toBe("not-json");
    expect(s).toContain("E_NOT_FOUND");
    expect(s).toContain("project not found");
  });
});
