// Non-interactive `ralphy setup` — agent / CI path. Spawns the CLI as a
// child so we exercise the real argv parsing, stdin, exit codes, and JSON
// output contract that an AI agent in a terminal will actually see.
//
// We pass --project-dir and --no-verify on every invocation so the test
// stays offline and never touches OpenRouter / ElevenLabs. We also point
// HOME at a tmp dir so the global config write at ~/.config/ralphy/
// doesn't pollute the developer's machine.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpRoot: string;
let tmpHome: string;
let projectDir: string;

function ralphy(
  args: string[],
  opts: { stdin?: string; env?: Record<string, string> } = {},
): { exitCode: number; stdout: string; stderr: string; json: any } {
  const r = spawnSync("bun", ["run", CLI, ...args], {
    cwd: tmpRoot,
    encoding: "utf8",
    input: opts.stdin,
    env: {
      ...process.env,
      HOME: tmpHome,
      // Strip OPENROUTER / ELEVENLABS keys from the parent so --keys-from-env
      // tests can set them deterministically.
      OPENROUTER_API_KEY: opts.env?.OPENROUTER_API_KEY ?? "",
      ELEVENLABS_API_KEY: opts.env?.ELEVENLABS_API_KEY ?? "",
      ...(opts.env ?? {}),
    },
  });
  let json: any = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not JSON — that's fine for some assertions */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-setup-"));
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-home-"));

  // Minimal "project" — name must match PROJECT_NAME constant.
  projectDir = path.join(tmpRoot, "ugc-cli");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, "package.json"),
    JSON.stringify({ name: "ugc-cli", version: "0.0.0", private: true }),
  );
});

afterEach(() => {
  for (const d of [tmpRoot, tmpHome]) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

describe("ralphy setup --non-interactive", () => {
  test("writes both keys via flags and emits a structured JSON summary", () => {
    const r = ralphy([
      "setup",
      "-y",
      "--project-dir",
      projectDir,
      "--no-verify",
      "--openrouter-key",
      "sk-or-flag-test",
      "--elevenlabs-key",
      "xi-flag-test",
    ]);
    expect(r.exitCode).toBe(0);
    expect(r.json).toBeTruthy();
    expect(r.json.mode).toBe("non-interactive");
    expect(r.json.project_dir).toBe(projectDir);
    expect(r.json.project_link_changed).toBe(true);
    const orRow = r.json.keys.find((k: any) => k.envVar === "OPENROUTER_API_KEY");
    const elRow = r.json.keys.find((k: any) => k.envVar === "ELEVENLABS_API_KEY");
    expect(orRow.saved).toBe(true);
    expect(orRow.verified).toBeNull();
    expect(elRow.saved).toBe(true);

    const env = fs.readFileSync(path.join(projectDir, ".env"), "utf8");
    expect(env).toContain("OPENROUTER_API_KEY=sk-or-flag-test");
    expect(env).toContain("ELEVENLABS_API_KEY=xi-flag-test");
  });

  test("reads OPENROUTER_API_KEY from stdin when --openrouter-key=`-`", () => {
    const r = ralphy(
      [
        "setup",
        "-y",
        "--project-dir",
        projectDir,
        "--no-verify",
        "--openrouter-key",
        "-",
      ],
      { stdin: "sk-or-from-stdin\n" },
    );
    expect(r.exitCode).toBe(0);
    const env = fs.readFileSync(path.join(projectDir, ".env"), "utf8");
    expect(env).toContain("OPENROUTER_API_KEY=sk-or-from-stdin");
    // ELEVENLABS untouched
    expect(env).not.toContain("ELEVENLABS_API_KEY=");
  });

  test("--keys-from-env picks up env vars and persists them", () => {
    const r = ralphy(
      ["setup", "-y", "--project-dir", projectDir, "--no-verify", "--keys-from-env"],
      {
        env: {
          OPENROUTER_API_KEY: "sk-or-from-env",
          ELEVENLABS_API_KEY: "xi-from-env",
        },
      },
    );
    expect(r.exitCode).toBe(0);
    const env = fs.readFileSync(path.join(projectDir, ".env"), "utf8");
    expect(env).toContain("OPENROUTER_API_KEY=sk-or-from-env");
    expect(env).toContain("ELEVENLABS_API_KEY=xi-from-env");
  });

  test("explicit flag wins over --keys-from-env collision", () => {
    const r = ralphy(
      [
        "setup",
        "-y",
        "--project-dir",
        projectDir,
        "--no-verify",
        "--keys-from-env",
        "--openrouter-key",
        "sk-or-from-flag",
      ],
      { env: { OPENROUTER_API_KEY: "sk-or-from-env-LOSER" } },
    );
    expect(r.exitCode).toBe(0);
    const env = fs.readFileSync(path.join(projectDir, ".env"), "utf8");
    expect(env).toContain("OPENROUTER_API_KEY=sk-or-from-flag");
    expect(env).not.toContain("LOSER");
  });

  test("rejects non-project --project-dir with a clear error and exit 1", () => {
    const bogus = path.join(tmpRoot, "not-a-project");
    fs.mkdirSync(bogus, { recursive: true });
    const r = ralphy([
      "setup",
      "-y",
      "--project-dir",
      bogus,
      "--no-verify",
      "--openrouter-key",
      "sk-x",
    ]);
    expect(r.exitCode).toBe(1);
    expect(r.json.errors[0]).toContain("not a valid project");
    expect(r.json.project_dir).toBeNull();
  });

  test("exits 1 with a useful error when no project root is resolvable", () => {
    // No --project-dir, no global link (HOME is fresh), cwd is not a project.
    const r = ralphy([
      "setup",
      "-y",
      "--no-verify",
      "--openrouter-key",
      "sk-x",
    ]);
    expect(r.exitCode).toBe(1);
    expect(r.json.errors[0]).toContain("no project root resolvable");
    expect(r.json.keys).toEqual([]);
  });

  test("--non-interactive alone with no keys is a read-only summary (exit 0)", () => {
    const r = ralphy([
      "setup",
      "--non-interactive",
      "--project-dir",
      projectDir,
      "--no-verify",
    ]);
    expect(r.exitCode).toBe(0);
    expect(r.json.keys).toEqual([]);
    expect(r.json.project_dir).toBe(projectDir);
    expect(fs.existsSync(path.join(projectDir, ".env"))).toBe(false);
  });

  test("preserves unrelated .env entries when adding a new key", () => {
    fs.writeFileSync(
      path.join(projectDir, ".env"),
      "OTHER_VAR=keepme\nOPENROUTER_API_KEY=old-value\n",
    );
    const r = ralphy([
      "setup",
      "-y",
      "--project-dir",
      projectDir,
      "--no-verify",
      "--openrouter-key",
      "sk-or-new",
    ]);
    expect(r.exitCode).toBe(0);
    const env = fs.readFileSync(path.join(projectDir, ".env"), "utf8");
    expect(env).toContain("OTHER_VAR=keepme");
    expect(env).toContain("OPENROUTER_API_KEY=sk-or-new");
    expect(env).not.toContain("old-value");
  });

  test("--status path still works and is unaffected by the new flags", () => {
    const r = ralphy(["setup", "--status", "--project-dir", projectDir]);
    // --status short-circuits before non-interactive routing, so it ignores
    // --project-dir but still emits a JSON snapshot.
    expect(r.exitCode).toBe(0);
    expect(Array.isArray(r.json.capabilities)).toBe(true);
  });
});
