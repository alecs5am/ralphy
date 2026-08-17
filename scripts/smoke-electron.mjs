import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { sha256File, validateCoreSource } from "./bundled-core.mjs";

const root = resolve(import.meta.dirname, "..");
const secretHandoffSmoke = process.argv.includes("--secret-handoff");
const packagedApp = process.env.RALPHY_PACKAGED_APP
  ? resolve(root, process.env.RALPHY_PACKAGED_APP)
  : undefined;

if (secretHandoffSmoke && !packagedApp) {
  throw new Error("Secret handoff smoke requires RALPHY_PACKAGED_APP");
}

let executable = join(root, "node_modules/.bin/electron");
let appArguments = ["."];
if (packagedApp) {
  const resources = join(packagedApp, "Contents/Resources");
  const core = join(resources, "bin/ralphy");
  await validateCoreSource(core);
  const manifest = JSON.parse(await readFile(join(resources, "ralphy-core.json"), "utf8"));
  if (
    typeof manifest.version !== "string"
    || typeof manifest.sha256 !== "string"
    || await sha256File(core) !== manifest.sha256
    || execFileSync(core, ["--version"], { encoding: "utf8" }).trim()
      !== manifest.version
  ) {
    throw new Error("Packaged Ralphy core does not match its manifest");
  }
  executable = join(packagedApp, "Contents/MacOS/Ralphy Media");
  appArguments = [];
}
const userData = await realpath(await mkdtemp(join(tmpdir(), "ralphy-media-smoke-")));
const runId = "mig_11111111-1111-4111-8111-111111111111";
const workspaceId = "ws_33333333-3333-4333-8333-333333333333";
const stagedRoot = join(userData, ".ralphy-staging", runId, ".ralphy");
if (secretHandoffSmoke) {
  await mkdir(join(userData, ".ralphy"));
  await mkdir(stagedRoot, { recursive: true });
}
const handoffRequest = {
  v: 1,
  authorizationNonce: "55555555-5555-4555-8555-555555555555",
  runId,
  stagedRoot,
  sourceEntryId: "mentry_22222222-2222-4222-8222-222222222222",
  ref: `provider/anthropic/workspace/${workspaceId}/workspace/${workspaceId}`,
  kind: "text",
};
const child = spawn(
  executable,
  [
    ...appArguments,
    ...(secretHandoffSmoke ? ["--migration-secret-handoff"] : []),
    "--smoke-test",
    `--user-data-dir=${userData}`,
  ],
  {
    cwd: root,
    env: secretHandoffSmoke
      ? process.env
      : { ...process.env, RALPHY_SMOKE_TEST: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  },
);

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});
child.stdin.end(secretHandoffSmoke ? `${JSON.stringify(handoffRequest)}\n` : undefined);

const timeout = setTimeout(() => child.kill("SIGTERM"), 15_000);
const outcome = await new Promise((resolveExit) => child.once(
  "close",
  (code, signal) => resolveExit({ code, signal }),
));
clearTimeout(timeout);
await rm(userData, { recursive: true, force: true });

if (secretHandoffSmoke) {
  if (outcome.code !== 0 || outcome.signal !== null || stdout !== "" || stderr !== "") {
    console.error(stdout + stderr);
    process.exit(1);
  }
  console.log("Packaged secret handoff smoke passed");
  process.exit(0);
}

const output = stdout + stderr;
if (
  outcome.code !== 0
  || outcome.signal !== null
  || !output.includes("RALPHY_SMOKE_READY")
  || !output.includes("RALPHY_TERMINAL_BRIDGE_READY")
) {
  console.error(output);
  process.exit(1);
}
console.log(packagedApp ? "Packaged Electron smoke passed" : "Electron smoke passed");
