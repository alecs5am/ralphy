// Unit tests for --quiet mode plumbing (01.05.03).
//
// The CLI's quiet state lives in cli/lib/ui.ts so every command can check it
// uniformly. The top-level commander preAction hook flips it on when --quiet
// is passed.

import { describe, test, expect, beforeEach } from "bun:test";
import { isQuietMode, setQuiet, ok, info, warn } from "../../cli/lib/ui.js";

beforeEach(() => {
  setQuiet(false);
});

describe("isQuietMode + setQuiet", () => {
  test("defaults to false", () => {
    expect(isQuietMode()).toBe(false);
  });

  test("setQuiet(true) flips the global", () => {
    setQuiet(true);
    expect(isQuietMode()).toBe(true);
  });

  test("setQuiet(false) resets to default", () => {
    setQuiet(true);
    setQuiet(false);
    expect(isQuietMode()).toBe(false);
  });
});

describe("ok/info/warn under --quiet", () => {
  test("suppress stdout when quiet=true", () => {
    setQuiet(true);
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map((a) => String(a)).join(" "));
    };
    try {
      ok("done");
      info("running");
      warn("careful");
    } finally {
      console.log = origLog;
    }
    expect(logs.length).toBe(0);
  });

  test("emit normally when quiet=false", () => {
    setQuiet(false);
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map((a) => String(a)).join(" "));
    };
    try {
      ok("done");
      info("running");
    } finally {
      console.log = origLog;
    }
    expect(logs.length).toBe(2);
  });
});
