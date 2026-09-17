import { expect, test } from "bun:test";
import { assertSupportedBun, supportedBunVersion } from "../../cli/lib/bun-runtime.ts";

test("rejects runtimes before the descriptor ownership fix with an actionable prerequisite", () => {
  for (const version of [undefined, "1.3.14", "1.4.1", "1.4.2-canary", "invalid"]) {
    expect(supportedBunVersion(version)).toBe(false);
  }
  expect(() => assertSupportedBun("1.3.14")).toThrow("mise exec bun@1.4.2");
  for (const version of ["1.4.2", "1.4.3", "1.5.0", "2.0.0"]) {
    expect(() => assertSupportedBun(version)).not.toThrow();
  }
});
