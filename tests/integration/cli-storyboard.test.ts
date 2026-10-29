// `ralphy storyboard` + the generate gate end-to-end through the CLI (#570).
// No provider is ever reached: the gate refuses before any provider call, and
// the approved case runs as a --dry-run.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let fixtureRoot: string;

type CliResult = { exitCode: number; stdout: string; stderr: string; json: any };

async function runCli(args: string[]): Promise<CliResult> {
  const env: Record<string, string | undefined> = { ...process.env, NO_COLOR: "1" };
  // Pin provider keys empty: nothing here may reach a provider.
  env.OPENROUTER_API_KEY = "";
  env.FAL_KEY = "";
  const child = Bun.spawn(["bun", "run", CLI, "--json", "--cwd", fixtureRoot, ...args], {
    cwd: fixtureRoot,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  let json: any = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    // error cases print to stderr only
  }
  return { exitCode, stdout, stderr, json };
}

function ok(result: CliResult): any {
  expect(result.exitCode, result.stderr).toBe(0);
  return result.json;
}

beforeEach(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-storyboard-cli-"));
  fs.mkdirSync(path.join(fixtureRoot, ".ralphy"));
});

afterEach(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("ralphy storyboard", () => {
  test("show, approve, reject, comment, html, the generate gate and status --contract", async () => {
    ok(await runCli(["workspace", "create", "Demo", "--as", "demo"]));
    ok(await runCli(["project", "create", "Spot", "--as", "spot-001", "--workspace", "demo"]));
    const dir = path.join(fixtureRoot, ".ralphy", "workspaces", "demo", "projects", "spot-001");
    fs.mkdirSync(path.join(dir, "storyboard"), { recursive: true });
    fs.writeFileSync(path.join(dir, "scenario.json"), JSON.stringify({
      project_id: "spot-001",
      target_duration_s: 6,
      scenes: {
        "scene-01": { id: "scene-01", role: "hook", vo_text: "Stop scrolling.", target_duration_s: 3, camera: "selfie 35mm" },
        "scene-02": { id: "scene-02", role: "cta", vo_text: "Grab one.", target_duration_s: 3, camera: "static wide" },
      },
    }));
    fs.writeFileSync(path.join(dir, "storyboard", "scene-01.png"), "\x89PNG frame");

    const shown = ok(await runCli(["storyboard", "show", "spot-001"]));
    expect(shown.aiProduction).toBe(true);
    expect(shown.scenes.map((scene: any) => [scene.id, scene.state, scene.durationSec, scene.camera])).toEqual([
      ["scene-01", "pending", 3, "selfie 35mm"],
      ["scene-02", "pending", 3, "static wide"],
    ]);
    expect(shown.scenes[0].frame.source).toBe("file");

    // Unapproved scene slot: warn + refuse before any provider call.
    const refused = await runCli(["generate", "image", "--project", "spot-001", "--slot", "scene-01-bg", "--prompt", "a bottle"]);
    expect(refused.exitCode).toBe(5);
    expect(refused.stderr).toContain("[warn] storyboard gate: scene-01 is pending");
    expect(refused.stderr).toContain("E_GATE_STORYBOARD");
    const refusedVideo = await runCli(["generate", "video", "--project", "spot-001", "--slot", "scene-02-vid", "--prompt", "push in", "--duration", "3"]);
    expect(refusedVideo.exitCode).toBe(5);
    expect(refusedVideo.stderr).toContain("E_GATE_STORYBOARD");
    // A storyboard frame slot is the cheap review still: never gated.
    const frame = ok(await runCli(["generate", "image", "--project", "spot-001", "--slot", "storyboard-scene-02", "--prompt", "sketch", "--dry-run"]));
    expect(frame.dryRun).toBe(true);

    const approved = ok(await runCli(["storyboard", "approve", "spot-001", "--scene", "scene-01", "--comment", "hook is right"]));
    expect(approved.touched).toEqual(["scene-01"]);
    expect(approved.storyboard.scenes[0].state).toBe("approved");
    const rejected = ok(await runCli(["storyboard", "reject", "spot-001", "--scene", "scene-02", "--comment", "wrong product"]));
    expect(rejected.storyboard.totals).toMatchObject({ approved: 1, rejected: 1, pending: 0 });
    const commented = ok(await runCli(["storyboard", "comment", "spot-001", "--scene", "scene-02", "--comment", "try a warmer grade"]));
    expect(commented.storyboard.scenes[1].comments).toHaveLength(2);

    const unknown = await runCli(["storyboard", "approve", "spot-001", "--scene", "scene-09"]);
    expect(unknown.exitCode).toBe(2);
    expect(unknown.stderr).toContain("unknown storyboard scene");
    const missing = await runCli(["storyboard", "approve", "spot-001"]);
    expect(missing.exitCode).toBe(2);

    const dry = ok(await runCli(["generate", "image", "--project", "spot-001", "--slot", "scene-01-bg", "--prompt", "a bottle", "--dry-run"]));
    expect(dry.would_call[0].slot).toBe("scene-01-bg");
    const stillRefused = await runCli(["generate", "image", "--project", "spot-001", "--slot", "scene-02-bg", "--prompt", "a bottle"]);
    expect(stillRefused.exitCode).toBe(5);
    expect(stillRefused.stderr).toContain("scene-02 is rejected");

    const first = ok(await runCli(["storyboard", "html", "spot-001"]));
    const second = ok(await runCli(["storyboard", "html", "spot-001"]));
    expect(path.basename(first.path)).toBe("storyboard.html");
    expect(path.basename(second.path)).toBe("storyboard.v2.html");
    expect(fs.readFileSync(first.path, "utf8")).toContain("data:image/png;base64,");

    const ledger = ok(await runCli(["project", "status", "spot-001", "--contract"]));
    expect(ledger.storyboard.perScene).toEqual([
      { id: "scene-01", state: "approved", comment: "hook is right" },
      { id: "scene-02", state: "rejected", comment: "wrong product" },
    ]);
    expect(ledger.stopConditions.map((stop: any) => stop.id)).toContain("storyboard-approval-needed");

    const all = ok(await runCli(["storyboard", "approve", "spot-001", "--all"]));
    expect(all.storyboard.approvedAll).toBe(true);

    const stages = fs.readFileSync(path.join(dir, "logs", "user-prompts.jsonl"), "utf8")
      .split("\n").filter(Boolean).map((line) => JSON.parse(line).stage);
    expect(stages).toEqual([
      "storyboard-approval",
      "storyboard-rejection",
      "storyboard-comment",
      "storyboard-approval",
    ]);
  }, 120_000);
});
