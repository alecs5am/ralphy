import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("bridge bootstraps pristine libraries and refuses incomplete legacy content", () => {
  for (const state of ["empty", "workspaces", "legacy"] as const) {
    const home = mkdtempSync(join(tmpdir(), "ralphy-first-launch-"));
    const root = join(home, ".ralphy");
    try {
      mkdirSync(root);
      if (state !== "empty") mkdirSync(join(root, "workspaces"));
      if (state === "legacy") writeFileSync(join(root, "workspaces", "existing.json"), "{}");
      const result = spawnSync(process.execPath, [resolve("cli/index.ts"), "bridge", "--stdio", "--root", root], {
        cwd: home, encoding: "utf8", input: '{"v":1,"id":"hello","method":"system.hello"}\n', timeout: 15_000,
      });
      if (state === "legacy") {
        expect(result.status).not.toBe(0);
        expect(existsSync(join(root, "ralphy.db"))).toBe(false);
      } else {
        expect(result.status, result.stderr).toBe(0);
        expect(JSON.parse(result.stdout.trim())).toMatchObject({ ok: true, result: { startup: { state: "ready" } } });
      }
    } finally { rmSync(home, { recursive: true, force: true }); }
  }
});
