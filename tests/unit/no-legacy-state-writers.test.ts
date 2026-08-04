import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findLegacyStateViolations } from "../../scripts/lint-no-legacy-state.js";

describe("legacy state boundary", () => {
  test("finds banned state and accepts the explicit export seam", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-legacy-lint-"));
    try {
      fs.mkdirSync(path.join(root, "cli/lib/bridge"), { recursive: true });
      fs.mkdirSync(path.join(root, "cli/lib/store"), { recursive: true });
      fs.writeFileSync(path.join(root, "cli/lib/bridge/bad.ts"), 'writeFile("unit.json", "{}");');
      fs.writeFileSync(path.join(root, "cli/lib/store/portable.ts"), 'const file = "workspace.json";');
      expect(findLegacyStateViolations(root)).toEqual(["cli/lib/bridge/bad.ts: unit.json"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
