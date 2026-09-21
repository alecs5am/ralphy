import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

test("development uses the packaged app profile before resolving userData", () => {
  const source = readFileSync("electron/main.ts", "utf8");
  expect(source.indexOf('app.setName("ralphy-media")')).toBeGreaterThanOrEqual(0);
  expect(source.indexOf('app.setName("ralphy-media")')).toBeLessThan(
    source.indexOf('getSwitchValue("user-data-dir")'),
  );
});
