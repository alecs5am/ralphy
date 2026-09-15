import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { RalphySession } from "../electron/ralphy/session";
import { ralphyPreamble } from "../electron/agent/context";

// Relocate the complete app and run its CLI without the developer's HOME, PATH or cwd.
const scratch = await mkdtemp(join(tmpdir(), "ralphy-portable-"));
const desktop = process.cwd();
const app = join(scratch, "Applications", "Ralphy Media.app");
const home = join(scratch, "home");
const root = join(home, ".ralphy");
const bin = join(app, "Contents/Resources/bin/ralphy");
const env = { HOME: home, PATH: "/usr/bin:/bin", TMPDIR: scratch, NO_COLOR: "1" };
const session = new RalphySession({ bin, env });
try {
  execFileSync("/usr/bin/ditto", [resolve(process.argv[2] ?? "release/Ralphy Media.app"), app]);
  await mkdir(join(root, "workspaces"), { recursive: true });
  process.chdir(home);
  const hello = await session.open(root);
  assert.ok(hello.storeId);
  await session.close();
  const run = (args: string[]) => execFileSync(bin, ["--root", root, "--json", ...args], { cwd: home, env, encoding: "utf8", timeout: 30_000 });
  const created = JSON.parse(run(["workspace", "create", "portability-check", "--name", "Portability check"]));
  assert.ok(created);
  assert.match(run(["workspace", "list"]), /Portability check/);
  assert.match(run(["unit", "source", "--help"]), /--revision/);
  const prompt = ralphyPreamble({ rootPath: root, cwd: home, instructions: [], cli: bin });
  const helpCommand = prompt.match(/`([^`]+ --help)`/)?.[1];
  assert.ok(helpCommand);
  assert.match(execFileSync("/bin/sh", ["-c", helpCommand], { cwd: home, env, encoding: "utf8" }), /Usage: ralphy/);
  execFileSync(process.execPath, [join(desktop, "scripts/smoke-electron.mjs")], {
    cwd: home, env: { ...env, RALPHY_PACKAGED_APP: app }, stdio: "inherit", timeout: 45_000,
  });
  console.log("PORTABLE_OK: relocated app, fresh library, bridge, workspace CRUD, quoted chat command; no repository runtime, Bun or Node on PATH.");
} finally {
  await session.close();
  process.chdir(desktop);
  await rm(scratch, { recursive: true, force: true });
}
