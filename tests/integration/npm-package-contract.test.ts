import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let temporaries: string[] = [];

afterEach(() => {
  for (const dir of temporaries) fs.rmSync(dir, { recursive: true, force: true });
  temporaries = [];
});

describe("published npm package", () => {
  test("does not publish the superseded Farm identity contract", () => {
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-pack-"));
    temporaries.push(staging);
    const pack = spawnSync("bun", ["pm", "pack", "--destination", staging], {
      cwd: path.resolve("npm"),
      encoding: "utf8",
    });
    expect(pack.status, pack.stderr).toBe(0);
    const tarball = fs.readdirSync(staging).find((entry) => entry.endsWith(".tgz"));
    expect(tarball).toBeDefined();
    const listed = spawnSync("tar", ["-tf", path.join(staging, tarball!)], {
      encoding: "utf8",
    });
    expect(listed.status).toBe(0);
    expect(listed.stdout).not.toContain("farm-identity");

    const manifest = JSON.parse(fs.readFileSync("npm/package.json", "utf8")) as {
      exports: Record<string, string>;
    };
    expect(manifest.exports["./contracts/farm-identity-v1.golden.json"]).toBeUndefined();
    expect(manifest.exports["./package.json"]).toBe("./package.json");
  });
});
