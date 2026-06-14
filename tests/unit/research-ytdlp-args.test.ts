// `cli/lib/research.ts` — yt-dlp base-arg builder used by `ralphy ref pull`.
//
// YouTube now requires a JS runtime for signature deciphering; without it
// yt-dlp returns a 403 "no JS runtime available". The wrapper must pin
// `--js-runtimes node` on every yt-dlp invocation (issue #119). These tests
// lock that flag into the arg list so a refactor can't silently drop it.

import { describe, test, expect } from "bun:test";
import { ytDlpBaseArgs } from "../../cli/lib/research.js";

describe("ytDlpBaseArgs", () => {
  test("pins the node JS runtime for signature deciphering", () => {
    const args = ytDlpBaseArgs();
    const idx = args.indexOf("--js-runtimes");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe("node");
  });

  test("returns a fresh array each call (no shared mutable state)", () => {
    const a = ytDlpBaseArgs();
    const b = ytDlpBaseArgs();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
