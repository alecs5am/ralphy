import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveCompositionVersion } from "../../cli/lib/render/save-version.js";

test("the retired path snapshot helper cannot write compositions/vN.html", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-retired-save-version-"));
  try {
    fs.writeFileSync(path.join(root, "index.html"), "<!doctype html>");
    await expect(saveCompositionVersion(root)).rejects.toThrow(/composition revise/i);
    expect(fs.existsSync(path.join(root, "compositions"))).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
