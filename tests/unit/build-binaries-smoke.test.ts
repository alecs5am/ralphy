// Unit tests for the post-build smoke verdict in scripts/build-binaries.ts (#002).
//
// The build step reports success even when `bun build --compile` emits a binary
// that crashes at startup (the bytecode-crash class). evaluateSmokeResult is the
// pass/fail gate that closes that gap: a binary passes only when it exits 0 AND
// prints a semver-ish version to stdout.

import { describe, test, expect } from "bun:test";
import { evaluateSmokeResult } from "../../scripts/build-binaries.js";

describe("evaluateSmokeResult", () => {
  test("passes on exit 0 with a semver version on stdout", () => {
    const r = evaluateSmokeResult({ error: null, status: 0, stdout: "0.3.0\n", stderr: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.version).toBe("0.3.0");
  });

  test("fails when the binary cannot be exec'd", () => {
    const r = evaluateSmokeResult({
      error: new Error("ENOENT"),
      status: null,
      stdout: "",
      stderr: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("failed to exec");
  });

  test("fails on a non-zero exit (crashed binary)", () => {
    // The #002 repro: TypeError thrown to stderr, non-zero exit.
    const r = evaluateSmokeResult({
      error: null,
      status: 1,
      stdout: "",
      stderr: "TypeError: Expected CommonJS module to have a function wrapper.",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("exited 1");
      expect(r.reason).toContain("function wrapper");
    }
  });

  test("fails when exit is 0 but stdout has no version (crash before print)", () => {
    const r = evaluateSmokeResult({ error: null, status: 0, stdout: "\n", stderr: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("printed no version");
  });

  test("fails when stdout is non-numeric noise", () => {
    const r = evaluateSmokeResult({ error: null, status: 0, stdout: "ralphy", stderr: "" });
    expect(r.ok).toBe(false);
  });

  test("tolerates a null stdout", () => {
    const r = evaluateSmokeResult({ error: null, status: 0, stdout: null, stderr: null });
    expect(r.ok).toBe(false);
  });
});
