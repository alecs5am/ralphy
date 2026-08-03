import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI_ENTRY =
  process.env.RALPHY_TEST_CLI_ENTRY ?? path.join(REPO, "cli", "index.ts");
const PROJECT_KEY = "task-2b-project-a-dotenv-secret";
const STARTUP_KEY = "task-2b-explicit-startup-secret";

let target: TmpRoot | null = null;
let source: string | null = null;

afterEach(() => {
  closeDomainDb();
  target?.cleanup();
  target = null;
  if (source) fs.rmSync(source, { recursive: true, force: true });
  source = null;
});

describe("credential startup environment", () => {
  test("a process-cwd Project A dotenv credential cannot satisfy explicit Workspace B", () => {
    const fixture = setup();
    const result = runFromProjectA(fixture, {});

    expect(result.status).toBe(0);
    expect(result.error).toBeUndefined();
    expect(JSON.parse(result.stdout)).toEqual({
      provider: "openrouter",
      configured: false,
      source: "missing",
      relinkRequired: false,
    });
    expect(result.stdout).not.toContain(PROJECT_KEY);
    expect(result.stderr).not.toContain(PROJECT_KEY);
  });

  test("an explicit startup credential remains available without loading Project A dotenv", () => {
    const fixture = setup();
    const result = runFromProjectA(fixture, {
      OPENROUTER_API_KEY: STARTUP_KEY,
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      provider: "openrouter",
      configured: true,
      source: "environment",
      relinkRequired: false,
    });
    expect(result.stdout).not.toContain(STARTUP_KEY);
    expect(result.stderr).not.toContain(STARTUP_KEY);
    expect(result.stdout).not.toContain(PROJECT_KEY);
    expect(result.stderr).not.toContain(PROJECT_KEY);
  });

  test("explicit scope loads noncredential project settings without trusting its credential", () => {
    const fixture = setup();
    const doctor = runFromProjectA(fixture, {}, ["doctor"]);
    const status = runFromProjectA(fixture, {});

    expect({
      status: doctor.status,
      stderr: doctor.stderr.replaceAll(PROJECT_KEY, "[redacted]"),
    }).toEqual({ status: 1, stderr: "" });
    expect(JSON.parse(doctor.stdout).ralphy.home).toBe(fixture.projectHome);
    expect(status.status).toBe(0);
    expect(JSON.parse(status.stdout)).toEqual({
      provider: "openrouter",
      configured: false,
      source: "missing",
      relinkRequired: false,
    });
    expect(doctor.stdout + doctor.stderr + status.stdout + status.stderr).not.toContain(
      PROJECT_KEY,
    );
  });
});

function setup(): {
  dataRoot: string;
  workspaceId: string;
  projectHome: string;
} {
  target = makeTmpRoot("ralphy-credential-target-b");
  const workspace = createWorkspace({ slug: "target-b", name: "Target B" });
  closeDomainDb();
  source = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-credential-source-a-"));
  const projectHome = path.join(source, "project-home");
  fs.writeFileSync(
    path.join(source, ".env"),
    `OPENROUTER_API_KEY=${PROJECT_KEY}\nRALPHY_HOME=${projectHome}\n`,
  );
  return {
    dataRoot: path.join(target.dir, ".ralphy"),
    workspaceId: workspace.id,
    projectHome,
  };
}

function runFromProjectA(
  fixture: { dataRoot: string; workspaceId: string },
  extraEnvironment: NodeJS.ProcessEnv,
  command = ["provider", "auth", "status", "openrouter"],
) {
  const environment = { ...process.env, ...extraEnvironment, NO_COLOR: "1" };
  if (!("OPENROUTER_API_KEY" in extraEnvironment)) {
    delete environment.OPENROUTER_API_KEY;
  }
  delete environment.RALPHY_HOME;
  environment.RALPHY_DOCTOR_NO_UPDATE_CHECK = "1";
  return spawnSync(
    CLI_ENTRY,
    [
      "--root",
      fixture.dataRoot,
      "--cwd",
      source!,
      "--workspace",
      fixture.workspaceId,
      "--json",
      ...command,
    ],
    { cwd: source!, env: environment, encoding: "utf8" },
  );
}
