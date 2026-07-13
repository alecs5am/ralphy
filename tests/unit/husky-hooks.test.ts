import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "../..");

describe("Husky hooks", () => {
  test("pre-push invokes only package scripts that still exist", () => {
    const hook = fs.readFileSync(path.join(REPO, ".husky", "pre-push"), "utf8");
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const invoked = [...hook.matchAll(/\bbun run ([a-z0-9:-]+)/giu)].map((match) => match[1]!);
    const missing = invoked.filter((script) => !(script in (pkg.scripts ?? {})));

    expect(missing).toEqual([]);
  });
});
