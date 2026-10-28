// #574 — `ralphy ref paths` prints a compact view by default: the directory
// once, file names relative to it, and which files exist. `--verbose` keeps the
// pre-#574 absolute-path shape. (`ref pull` compaction — truncated title, bulk
// rows only for URLs that did not download — is covered by the bulk-pull
// integration test, which asserts the error row still comes back.)

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compactRefPaths } from "../../cli/commands/ref.js";
import { refPaths } from "../../cli/lib/research.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ref-compact-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("compactRefPaths (#574)", () => {
  test("prints the dir once, relative file names, and the files that exist", () => {
    const dir = path.join(tmp, "refs", "youtube-abc");
    const full = { ...refPaths("youtube-abc"), dir } as ReturnType<typeof refPaths>;
    for (const [key, abs] of Object.entries(full)) {
      if (key === "dir") continue;
      (full as Record<string, string>)[key] = path.join(dir, path.basename(abs));
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(full.meta, "{}");

    const view = compactRefPaths("youtube-abc", full);
    expect(view.dir).toBe(dir);
    expect(view.files.meta).toBe("meta.info.json");
    expect(view.files.sourceMp4).toBe("source.mp4");
    expect(view.present).toEqual(["meta"]);
    // No absolute paths besides `dir`.
    for (const name of Object.values(view.files)) expect(path.isAbsolute(name)).toBe(false);
    // Every key of the full shape is still named.
    expect(Object.keys(view.files).sort()).toEqual(Object.keys(full).filter((k) => k !== "dir").sort());
  });

  test("the compact view is smaller than the absolute-path view", () => {
    const full = refPaths("instagram-DbN1FvLv6wk");
    const compact = JSON.stringify(compactRefPaths("instagram-DbN1FvLv6wk", full));
    expect(compact.length).toBeLessThan(JSON.stringify(full).length);
  });
});
