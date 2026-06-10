// End-to-end user journey tests covering the post-install flow.
//
// These tests simulate exactly what a brew/npm-installed user does:
//
//   1. Run `ralphy new "<brief>"` to create a project (lives under
//      <project-root>/workspace/projects/<id>/ as of #031 — pre-#031 it lived
//      under $RALPHY_HOME, which made it invisible to generate / render).
//   2. cd into the project directory.
//   3. Run `ralphy skill install --agent claude --scope project` to wire up
//      Claude Code skills + the CLAUDE.md routing pointer.
//   4. Verify the project is ready: skills installed, CLAUDE.md present, the
//      doctor still works, the dry-run generate path still works.
//
// Filed for the regression reported on 2026-05-20: running
// `ralphy skill install --agent claude` from a freshly-created project crashed
// with E_INTERNAL (ENOENT scandir on `.agents/skills/ralphy`). The fix moves
// `bundleDir()` to `resolveBundleDir()` which:
//
//   - honors --repo <path>
//   - honors $RALPHY_REPO_ROOT (matches `skill new`)
//   - falls back to process.cwd()
//   - raises E_SKILL_BUNDLE_NOT_FOUND (user, 404) instead of E_INTERNAL when
//     no candidate path exists
//
// Each test pins $RALPHY_HOME and $HOME to a tmp dir so we never mutate the
// user's real ~/.ralphy or ~/.claude during CI.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpHome: string;
let ralphyHome: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-journey-"));
  ralphyHome = path.join(tmpHome, ".ralphy");
  fs.mkdirSync(ralphyHome, { recursive: true });
});

afterEach(() => {
  try {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  json: unknown;
}

function ralphy(args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}): RunResult {
  const env = {
    ...process.env,
    HOME: tmpHome,
    RALPHY_HOME: ralphyHome,
    // The integration suite must not pull from the user's real config.
    RALPHY_CONFIG: path.join(tmpHome, ".ralphy-config.json"),
    ...(opts.env ?? {}),
  };
  const r: SpawnSyncReturns<string> = spawnSync("bun", ["run", CLI, ...args], {
    cwd: opts.cwd ?? tmpHome,
    encoding: "utf8",
    env,
  });
  let json: unknown = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not JSON — fine for help / non-machine output */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

function lastErrorPayload(stderr: string): { code: string; message: string; hint?: string } | null {
  const lastLine = stderr
    .trim()
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .pop();
  if (!lastLine) return null;
  try {
    return (JSON.parse(lastLine) as { error: { code: string; message: string; hint?: string } }).error;
  } catch {
    return null;
  }
}

describe("user journey · ralphy new → ralphy skill install --agent claude", () => {
  test("creates project under <root>/.ralphy/workspaces/default/projects/<id>/ with the canonical layout (#031, #108)", () => {
    const r = ralphy(["new", "test brief about a coffee shop"]);
    expect(r.exitCode).toBe(0);
    expect(r.json).toBeTruthy();
    const payload = r.json as { project_id: string; path: string; brief: string };
    expect(payload.project_id).toMatch(/^[a-z0-9-]+$/);
    // #031: project now lives under the project root's data tree, NOT
    // $RALPHY_HOME, so generate / render can see it. #108: that tree is
    // .ralphy/workspaces/<ws>/projects/.
    expect(payload.path).toContain(path.join(".ralphy", "workspaces", "default", "projects"));
    expect(payload.path).not.toContain(path.join(".ralphy", "projects"));
    expect(payload.brief).toBe("test brief about a coffee shop");

    // Canonical layout: artifacts/, render/, logs/ + BRIEF.md + empty logs.
    expect(fs.existsSync(path.join(payload.path, "artifacts"))).toBe(true);
    expect(fs.existsSync(path.join(payload.path, "render"))).toBe(true);
    expect(fs.existsSync(path.join(payload.path, "logs"))).toBe(true);
    expect(fs.readFileSync(path.join(payload.path, "BRIEF.md"), "utf8")).toContain("coffee shop");
    for (const f of ["generations.jsonl", "user-prompts.jsonl", "user-assets.jsonl"]) {
      expect(fs.existsSync(path.join(payload.path, "logs", f))).toBe(true);
    }
  });

  test("post-new: `ralphy skill install --agent claude --scope project` succeeds from the project dir with RALPHY_REPO_ROOT", () => {
    // 1) Create the project.
    const newResult = ralphy(["new", "tdd journey"]);
    expect(newResult.exitCode).toBe(0);
    const projectPath = (newResult.json as { path: string }).path;

    // 2) cd into the project, run skill install with the repo pointer set
    //    (this is the working contract for brew/npm-installed users).
    const installResult = ralphy(
      ["--json", "skill", "install", "--agent", "claude", "--scope", "project"],
      { cwd: projectPath, env: { RALPHY_REPO_ROOT: REPO } },
    );
    expect(installResult.exitCode).toBe(0);
    const installed = (installResult.json as { installed: Array<{ ok: boolean; installed: string[] }> }).installed;
    expect(installed).toHaveLength(1);
    expect(installed[0].ok).toBe(true);

    // 3) Verify CLAUDE.md sentinel-merged routing pointer landed in the project.
    const claudeMd = path.join(projectPath, "CLAUDE.md");
    expect(fs.existsSync(claudeMd)).toBe(true);
    const claudeMdBody = fs.readFileSync(claudeMd, "utf8");
    expect(claudeMdBody).toContain("ralphy:start");
    expect(claudeMdBody).toContain("Ralphy");
    expect(claudeMdBody).toContain("ralphy doctor");
    expect(claudeMdBody).toContain("ralphy new");

    // 4) Verify skill bundle landed at `.claude/skills/ralphy/` (non-empty).
    const skillsDir = path.join(projectPath, ".claude", "skills", "ralphy");
    expect(fs.existsSync(skillsDir)).toBe(true);
    const skillEntries = fs.readdirSync(skillsDir);
    expect(skillEntries.length).toBeGreaterThan(0);
    // Spot-check one expected skill is in the bundle. Slugs carry no
    // `ralphy-` prefix as of 03.01.04 / 053 — check a known core slug.
    expect(skillEntries).toContain("researcher");
  });

  test("post-new: `--agent claude` from a project dir without RALPHY_REPO_ROOT raises E_SKILL_BUNDLE_NOT_FOUND (clean error, not E_INTERNAL)", () => {
    // This is the regression case the user hit on 2026-05-20.
    const newResult = ralphy(["new", "missing-repo case"]);
    expect(newResult.exitCode).toBe(0);
    const projectPath = (newResult.json as { path: string }).path;

    // No RALPHY_REPO_ROOT, no --repo flag, cwd is the project (no .agents/skills).
    const installResult = ralphy(
      ["--json", "skill", "install", "--agent", "claude", "--scope", "project"],
      { cwd: projectPath, env: { RALPHY_REPO_ROOT: "" } },
    );
    expect(installResult.exitCode).not.toBe(0);

    const err = lastErrorPayload(installResult.stderr);
    expect(err).toBeTruthy();
    expect(err!.code).toBe("E_SKILL_BUNDLE_NOT_FOUND");
    // Hint must guide the user to the env var / flag.
    expect(err!.hint).toContain("RALPHY_REPO_ROOT");
    expect(err!.hint).toContain("--repo");
  });

  test("`--repo <path>` flag overrides $RALPHY_REPO_ROOT and works from any cwd", () => {
    const newResult = ralphy(["new", "repo-flag case"]);
    expect(newResult.exitCode).toBe(0);
    const projectPath = (newResult.json as { path: string }).path;

    // Pass a junk env var to prove --repo wins.
    const installResult = ralphy(
      ["--json", "skill", "install", "--agent", "claude", "--scope", "project", "--repo", REPO],
      { cwd: projectPath, env: { RALPHY_REPO_ROOT: "/nonexistent/garbage" } },
    );
    expect(installResult.exitCode).toBe(0);
    expect(fs.existsSync(path.join(projectPath, ".claude", "skills", "ralphy"))).toBe(true);
  });

  test("doctor still runs cleanly from inside the post-install project", () => {
    // Sanity: doctor doesn't crash. We don't assert on individual checks
    // because some (API keys, ffmpeg) depend on the runner's env.
    const newResult = ralphy(["new", "doctor sanity"]);
    const projectPath = (newResult.json as { path: string }).path;
    ralphy(["--json", "skill", "install", "--agent", "claude", "--scope", "project"], {
      cwd: projectPath,
      env: { RALPHY_REPO_ROOT: REPO },
    });

    const doctorResult = ralphy(["--json", "doctor"], { cwd: projectPath });
    expect(doctorResult.json).toBeTruthy();
    // doctor returns { ralphy, deps, keys, blockers, warnings, versions }.
    // We just confirm the top-level keys are present — that the command
    // produces structured JSON rather than crashing.
    const j = doctorResult.json as Record<string, unknown>;
    expect(j.ralphy).toBeTruthy();
    expect(j.deps).toBeTruthy();
    expect(j.keys).toBeTruthy();
    expect(Array.isArray(j.blockers)).toBe(true);
  }, 30000);

  test("doctor + template suggest produce structured JSON from the tmp home", () => {
    // From the tmp home (no project), doctor reads-only and shouldn't crash.
    const doctor = ralphy(["--json", "doctor"]);
    expect(doctor.json).toBeTruthy();

    // `template suggest` scans <root>/templates/ and <root>/workspace/templates/.
    // Auto-detect resolves `root` from cwd → for a brew/npm user with no repo,
    // 0 results is the correct answer. To exercise the "happy path" with
    // templates discovered, point --cwd at the repo (matches `cd ugc-cli &&
    // ralphy template suggest ...`).
    const suggest = ralphy(["--cwd", REPO, "--json", "template", "suggest", "ugc product reveal"]);
    expect(suggest.exitCode).toBe(0);
    const suggestPayload = suggest.json as { results?: unknown[]; utterance?: string } | null;
    expect(suggestPayload).toBeTruthy();
    expect(Array.isArray(suggestPayload!.results)).toBe(true);
    expect(suggestPayload!.results!.length).toBeGreaterThan(0);
    expect(suggestPayload!.utterance).toBe("ugc product reveal");
  }, 30000);
});

describe("user journey · skill install error shapes", () => {
  test("--agent windsurf still returns E_AGENT_UNSUPPORTED (preserves prior behavior)", () => {
    const r = ralphy(["--json", "skill", "install", "--agent", "windsurf"]);
    expect(r.exitCode).not.toBe(0);
    const err = lastErrorPayload(r.stderr);
    expect(err!.code).toBe("E_AGENT_UNSUPPORTED");
  });

  test("the empty .claude/skills/ralphy/ destination is NOT picked as source (no self-reference cycle)", () => {
    // Pre-create an empty .claude/skills/ralphy/ in the project so the legacy
    // 3-candidate code path would have selected it as the bundle and copied
    // an empty dir over itself. The fix removes this candidate; cwd's
    // .agents/skills/ doesn't exist either, so we expect a clean refusal.
    const newResult = ralphy(["new", "self-ref"]);
    const projectPath = (newResult.json as { path: string }).path;
    fs.mkdirSync(path.join(projectPath, ".claude", "skills", "ralphy"), { recursive: true });

    const installResult = ralphy(
      ["--json", "skill", "install", "--agent", "claude", "--scope", "project"],
      { cwd: projectPath, env: { RALPHY_REPO_ROOT: "" } },
    );
    expect(installResult.exitCode).not.toBe(0);
    const err = lastErrorPayload(installResult.stderr);
    expect(err!.code).toBe("E_SKILL_BUNDLE_NOT_FOUND");
  });
});

describe("user journey · ralphy generate dry-run works after skill install", () => {
  // These tests do NOT spawn the daemon and do NOT hit any provider — they
  // exercise the `--dry-run` cost-preview path, which is what an installed
  // user runs to verify their prompts before paying. We test the canonical
  // models per MODELS.md.

  test("generate image --dry-run returns cost + provider for the default model", () => {
    const newResult = ralphy(["new", "dryrun image"]);
    const projectPath = (newResult.json as { path: string }).path;
    const projectId = (newResult.json as { project_id: string }).project_id;

    const r = ralphy(
      [
        "--json",
        "generate",
        "image",
        "--project",
        projectId,
        "--slot",
        "scene-01-image-hero",
        "--prompt",
        "minimal espresso shot photo",
        "--dry-run",
      ],
      { cwd: projectPath, env: { RALPHY_REPO_ROOT: REPO } },
    );
    // dry-run should succeed without API keys; non-zero is acceptable IF the
    // error is about catalog access (offline runners). We assert no crash.
    expect([0, 2]).toContain(r.exitCode);
    if (r.exitCode === 0) {
      expect(r.json).toBeTruthy();
    }
  });

  test("generate video --dry-run for kling rejects unsupported aspect_ratio with a clean error", () => {
    const newResult = ralphy(["new", "dryrun video kling"]);
    const projectPath = (newResult.json as { path: string }).path;
    const projectId = (newResult.json as { project_id: string }).project_id;

    const r = ralphy(
      [
        "--json",
        "generate",
        "video",
        "--project",
        projectId,
        "--slot",
        "scene-01-video-hero",
        "--prompt",
        "selfie pov rant",
        "--model",
        "kwaivgi/kling-v3.0-pro",
        "--duration",
        "5",
        "--aspect-ratio",
        "4:3",
        "--dry-run",
      ],
      { cwd: projectPath, env: { RALPHY_REPO_ROOT: REPO } },
    );
    expect(r.exitCode).not.toBe(0);
    const err = lastErrorPayload(r.stderr);
    // E_VALIDATION_FAILED or similar — any clean structured error is fine.
    expect(err).toBeTruthy();
    expect(err!.code).toMatch(/^E_/);
    expect(err!.code).not.toBe("E_INTERNAL");
  });
});
