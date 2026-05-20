// Unit tests for cooperative cancellation (01.07.02).
//
// CancellationToken is a tiny abort-style primitive: long-running verbs
// observe `token.cancelled` and bail cleanly, emitting an `E_CANCELLED`
// payload + exit 130 at the top level.

import { describe, test, expect } from "bun:test";
import { CancellationToken, installSigintHandler } from "../../cli/lib/cancel.js";

describe("CancellationToken", () => {
  test("starts uncancelled", () => {
    const t = new CancellationToken();
    expect(t.cancelled).toBe(false);
  });

  test("cancel() flips state and fires listeners exactly once", () => {
    const t = new CancellationToken();
    let count = 0;
    t.onCancel(() => count++);
    t.cancel();
    t.cancel();
    expect(t.cancelled).toBe(true);
    expect(count).toBe(1);
  });

  test("listeners attached after cancel() fire synchronously", () => {
    const t = new CancellationToken();
    t.cancel();
    let fired = false;
    t.onCancel(() => {
      fired = true;
    });
    expect(fired).toBe(true);
  });

  test("throwIfCancelled() throws after cancel()", () => {
    const t = new CancellationToken();
    expect(() => t.throwIfCancelled()).not.toThrow();
    t.cancel();
    expect(() => t.throwIfCancelled()).toThrow();
  });

  test("installSigintHandler returns the global token", () => {
    const t1 = installSigintHandler();
    const t2 = installSigintHandler();
    expect(t1).toBe(t2);
  });
});
