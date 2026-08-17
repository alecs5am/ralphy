import { afterEach, describe, expect, test } from "vitest";
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  CodexSession,
  readCodexAuthStatus,
  type AgentChatEvent,
} from "../electron/agent/codex-session";
import { makeLibraryFixture } from "./fixtures";

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((path) => (
    rm(path, { recursive: true, force: true })
  )));
});

async function fakeCodex(): Promise<{ binary: string; capture: string }> {
  const directory = await mkdtemp(join(tmpdir(), "ralphy-codex-test-"));
  cleanupPaths.push(directory);
  const binary = join(directory, "codex");
  const capture = join(directory, "capture.json");
  await writeFile(binary, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "login" && args[1] === "status") {
  process.stderr.write(process.env.CODEX_THREAD_ID ? "Not logged in\\n" : "Logged in using ChatGPT\\n");
  process.exit(0);
}
fs.writeFileSync(process.env.RALPHY_TEST_CAPTURE, JSON.stringify({
  args,
  cwd: process.cwd(),
  openrouterKey: process.env.OPENROUTER_API_KEY ?? null,
  openaiKey: process.env.OPENAI_API_KEY ?? null,
  codexKey: process.env.CODEX_API_KEY ?? null,
}));
process.stdout.write("not json\\n");
const events = [
  { type: "thread.started", thread_id: "0199a213-81c0-7800-8aa1-bbab2a035a53" },
  { type: "turn.started" },
  { type: "item.started", item: { id: "item-1", type: "command_execution", command: "bash -lc pwd", status: "in_progress" } },
  { type: "item.completed", item: { id: "item-1", type: "command_execution", command: "bash -lc pwd", status: "completed", exit_code: Number(process.env.RALPHY_TEST_EXIT_CODE ?? 0) } },
  { type: "item.completed", item: { id: "item-2", type: "agent_message", text: "The project is ready." } },
  { type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5 } },
];
for (const event of events) process.stdout.write(JSON.stringify(event) + "\\n");
`, "utf8");
  await chmod(binary, 0o755);
  return { binary, capture };
}

describe("CodexSession", () => {
  test("runs and resumes a ChatGPT-authenticated Codex thread", async () => {
    const fixture = await makeLibraryFixture();
    cleanupPaths.push(fixture.parentPath);
    const fake = await fakeCodex();
    const events: AgentChatEvent[] = [];
    const session = new CodexSession({
      binary: fake.binary,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        RALPHY_TEST_CAPTURE: fake.capture,
        OPENAI_API_KEY: "must-not-leak",
        CODEX_API_KEY: "must-not-leak",
        OPENROUTER_API_KEY: "must-not-leak",
      },
      emit: (event) => events.push(event),
    });

    await session.run({
      rootPath: fixture.rootPath,
      projectPath: fixture.alphaPath,
      prompt: "Review it",
      provider: "codex",
      model: "gpt-5.5",
      permissionMode: "full",
      resumeSessionId: "0199a213-81c0-7800-8aa1-bbab2a035a54",
    });

    const capture = JSON.parse(await readFile(fake.capture, "utf8")) as {
      args: string[];
      cwd: string;
      openrouterKey: string | null;
      openaiKey: string | null;
      codexKey: string | null;
    };
    expect(capture.cwd).toBe(await realpath(dirname(fixture.rootPath)));
    expect(capture.openrouterKey).toBeNull();
    expect(capture.openaiKey).toBeNull();
    expect(capture.codexKey).toBeNull();
    expect(capture.args).toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(capture.args).toContain("gpt-5.5");
    expect(capture.args).toContain("resume");
    expect(capture.args).toContain("0199a213-81c0-7800-8aa1-bbab2a035a54");
    expect(capture.args.at(-1)).toContain("Review it");
    expect(capture.args.at(-1)).toContain(fixture.alphaPath);
    expect(events).toEqual([
      {
        type: "session",
        sessionId: "0199a213-81c0-7800-8aa1-bbab2a035a53",
        tools: [],
      },
      {
        type: "tool-start",
        id: "item-1",
        name: "Bash",
        summary: "bash -lc pwd",
      },
      { type: "tool-result", id: "item-1", ok: true },
      { type: "text-delta", text: "The project is ready." },
      {
        type: "result",
        ok: true,
        cancelled: false,
        costUsd: 0,
        durationMs: expect.any(Number),
        sessionId: "0199a213-81c0-7800-8aa1-bbab2a035a53",
      },
    ]);
  });

  test("routes OpenRouter through Codex without changing user config", async () => {
    const fixture = await makeLibraryFixture();
    cleanupPaths.push(fixture.parentPath);
    const fake = await fakeCodex();
    const session = new CodexSession({
      binary: fake.binary,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        RALPHY_TEST_CAPTURE: fake.capture,
      },
      emit: () => undefined,
    });

    await session.run({
      rootPath: fixture.rootPath,
      prompt: "Inspect it",
      provider: "openrouter",
      model: "openai/gpt-5.5",
      openRouterApiKey: "sk-or-v1-test-key-123456789", // gitleaks:allow
      permissionMode: "plan",
    });

    const capture = JSON.parse(await readFile(fake.capture, "utf8")) as {
      args: string[];
      openrouterKey: string | null;
    };
    expect(capture.openrouterKey).toBe("sk-or-v1-test-key-123456789");
    expect(capture.args).toContain('model_provider="openrouter"');
    expect(capture.args).toContain('model_providers.openrouter.base_url="https://openrouter.ai/api/v1"');
    expect(capture.args).toContain('model_providers.openrouter.wire_api="responses"');
    expect(capture.args).toContain("openai/gpt-5.5");
    expect(capture.args).toContain("read-only");
  });

  test("marks every nonzero command exit as failed", async () => {
    const fixture = await makeLibraryFixture();
    cleanupPaths.push(fixture.parentPath);
    const fake = await fakeCodex();
    const events: AgentChatEvent[] = [];
    const session = new CodexSession({
      binary: fake.binary,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        RALPHY_TEST_CAPTURE: fake.capture,
        RALPHY_TEST_EXIT_CODE: "7",
      },
      emit: (event) => events.push(event),
    });

    await session.run({
      rootPath: fixture.rootPath,
      prompt: "Inspect it",
      provider: "codex",
      model: "default",
      permissionMode: "full",
    });

    expect(events).toContainEqual({ type: "tool-result", id: "item-1", ok: false });
  });

  test("reports the saved Codex login", async () => {
    const fake = await fakeCodex();
    await expect(readCodexAuthStatus(fake.binary, {
      ...process.env,
      CODEX_THREAD_ID: "parent-thread",
      CODEX_CI: "1",
    })).resolves.toEqual({
      loggedIn: true,
      detail: "Logged in using ChatGPT",
    });
  });
});
