import { afterEach, describe, expect, test } from "vitest";
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  ClaudeSession,
  loginClaudeSubscription,
  readClaudeAuthStatus,
  type ClaudeChatEvent,
} from "../electron/claude/session";
import { makeLibraryFixture } from "./fixtures";

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((path) => (
    rm(path, { recursive: true, force: true })
  )));
});

async function fakeClaude(): Promise<{ binary: string; capture: string; directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), "ralphy-claude-test-"));
  cleanupPaths.push(directory);
  const binary = join(directory, "claude");
  const capture = join(directory, "capture.json");
  await writeFile(binary, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "auth" && args[1] === "status") {
  process.stdout.write(JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty" }));
  process.exit(0);
}
if (args[0] === "auth" && args[1] === "login") {
  fs.writeFileSync(process.env.CLAUDE_TEST_CAPTURE, JSON.stringify({
    args,
    apiKey: process.env.ANTHROPIC_API_KEY ?? null,
    authToken: process.env.ANTHROPIC_AUTH_TOKEN ?? null,
    bedrock: process.env.CLAUDE_CODE_USE_BEDROCK ?? null,
  }));
  process.exit(0);
}
fs.writeFileSync(process.env.CLAUDE_TEST_CAPTURE, JSON.stringify({
  args,
  cwd: process.cwd(),
  apiKey: process.env.ANTHROPIC_API_KEY ?? null,
  authToken: process.env.ANTHROPIC_AUTH_TOKEN ?? null,
  bedrock: process.env.CLAUDE_CODE_USE_BEDROCK ?? null,
}));
const init = { type: "system", subtype: "init", session_id: "123e4567-e89b-12d3-a456-426614174000", tools: ["Read", "Bash"] };
process.stdout.write(JSON.stringify(init) + "\\n");
if (process.env.CLAUDE_TEST_HANG === "1") {
  setInterval(() => {}, 1000);
  return;
}
const lines = [
  { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Howdy" } } },
  { type: "assistant", message: { content: [
    { type: "text", text: "Howdy" },
    { type: "tool_use", id: "tool-1", name: "Bash", input: { command: "pwd" } },
  ] } },
  { type: "user", message: { content: [
    { type: "tool_result", tool_use_id: "tool-1", is_error: false },
  ] } },
  { type: "result", subtype: "success", session_id: "123e4567-e89b-12d3-a456-426614174000", total_cost_usd: 0.12, duration_ms: 321 },
];
process.stdout.write("not json\\n");
for (const line of lines) process.stdout.write(JSON.stringify(line) + "\\n");
`, "utf8");
  await chmod(binary, 0o755);
  return { binary, capture, directory };
}

describe("ClaudeSession", () => {
  test("streams one normalized turn with subscription credentials isolated", async () => {
    const fixture = await makeLibraryFixture();
    cleanupPaths.push(fixture.parentPath);
    const fake = await fakeClaude();
    const events: ClaudeChatEvent[] = [];
    const session = new ClaudeSession({
      binary: fake.binary,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        CLAUDE_TEST_CAPTURE: fake.capture,
        ANTHROPIC_API_KEY: "must-not-leak",
        ANTHROPIC_AUTH_TOKEN: "must-not-leak",
        CLAUDE_CODE_USE_BEDROCK: "1",
      },
      emit: (event) => events.push(event),
    });
    const canonicalRoot = await realpath(fixture.rootPath);
    const projectPath = await realpath(fixture.alphaPath);

    await session.run({
      rootPath: canonicalRoot,
      prompt: "Review the current render",
      projectPath,
      authMethod: "subscription",
      permissionMode: "auto",
      resumeSessionId: "123e4567-e89b-12d3-a456-426614174001",
    });

    const capture = JSON.parse(await readFile(fake.capture, "utf8")) as {
      args: string[];
      cwd: string;
      apiKey: string | null;
      authToken: string | null;
      bedrock: string | null;
    };
    expect(capture.cwd).toBe(await realpath(dirname(canonicalRoot)));
    expect(capture.apiKey).toBeNull();
    expect(capture.authToken).toBeNull();
    expect(capture.bedrock).toBeNull();
    expect(capture.args).toContain("--include-partial-messages");
    expect(capture.args).toContain("auto");
    expect(capture.args).toContain("123e4567-e89b-12d3-a456-426614174001");
    /* The message is the operator's sentence and nothing else; the harness's own context is a
       system instruction beside it, which is where the active project is named. */
    expect(capture.args.at(-1)).toBe("Review the current render");
    const system = capture.args[capture.args.indexOf("--append-system-prompt") + 1]!;
    expect(system).toContain(projectPath);
    expect(system).toContain("[Ralphy Media context]");
    expect(events).toEqual([
      {
        type: "session",
        sessionId: "123e4567-e89b-12d3-a456-426614174000",
        tools: ["Read", "Bash"],
      },
      { type: "text-delta", text: "Howdy" },
      { type: "tool-start", id: "tool-1", name: "Bash", summary: "pwd" },
      { type: "tool-result", id: "tool-1", ok: true },
      {
        type: "result",
        ok: true,
        cancelled: false,
        costUsd: 0.12,
        durationMs: 321,
        sessionId: "123e4567-e89b-12d3-a456-426614174000",
      },
    ]);
  });

  test("uses the selected API key and maps full access to bypassPermissions", async () => {
    const fixture = await makeLibraryFixture();
    cleanupPaths.push(fixture.parentPath);
    const fake = await fakeClaude();
    const session = new ClaudeSession({
      binary: fake.binary,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        CLAUDE_TEST_CAPTURE: fake.capture,
      },
      emit: () => undefined,
    });

    await session.run({
      rootPath: fixture.rootPath,
      prompt: "List the workspace",
      authMethod: "api-key",
      apiKey: "sk-ant-test-key-1234567890",
      permissionMode: "full",
    });

    const capture = JSON.parse(await readFile(fake.capture, "utf8")) as {
      args: string[];
      apiKey: string | null;
    };
    expect(capture.apiKey).toBe("sk-ant-test-key-1234567890");
    expect(capture.args).toContain("bypassPermissions");
  });

  test("reports local subscription authentication", async () => {
    const fake = await fakeClaude();
    await expect(readClaudeAuthStatus(fake.binary, process.env)).resolves.toEqual({
      loggedIn: true,
      authMethod: "claude.ai",
      apiProvider: "firstParty",
    });
  });

  test("starts the local subscription login without API credentials", async () => {
    const fake = await fakeClaude();

    await loginClaudeSubscription(fake.binary, {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      CLAUDE_TEST_CAPTURE: fake.capture,
      ANTHROPIC_API_KEY: "must-not-leak",
      ANTHROPIC_AUTH_TOKEN: "must-not-leak",
      CLAUDE_CODE_USE_BEDROCK: "1",
    });

    expect(JSON.parse(await readFile(fake.capture, "utf8"))).toEqual({
      args: ["auth", "login", "--claudeai"],
      apiKey: null,
      authToken: null,
      bedrock: null,
    });
  });

  test("stops an active turn without waiting for the child", async () => {
    const fixture = await makeLibraryFixture();
    cleanupPaths.push(fixture.parentPath);
    const fake = await fakeClaude();
    const events: ClaudeChatEvent[] = [];
    let initialized!: () => void;
    const initializedPromise = new Promise<void>((resolve) => {
      initialized = resolve;
    });
    const session = new ClaudeSession({
      binary: fake.binary,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        CLAUDE_TEST_CAPTURE: fake.capture,
        CLAUDE_TEST_HANG: "1",
      },
      emit: (event) => {
        events.push(event);
        if (event.type === "session") initialized();
      },
    });

    const running = session.run({
      rootPath: fixture.rootPath,
      prompt: "Wait",
      authMethod: "subscription",
      permissionMode: "plan",
    });
    await initializedPromise;
    session.stop();
    await running;

    expect(events.at(-1)).toMatchObject({
      type: "result",
      ok: false,
      cancelled: true,
    });
  });

  test("releases the session when the Claude process cannot start", async () => {
    const fixture = await makeLibraryFixture();
    cleanupPaths.push(fixture.parentPath);
    const session = new ClaudeSession({
      binary: join(fixture.parentPath, "missing-claude"),
      emit: () => undefined,
    });

    await expect(session.run({
      rootPath: fixture.rootPath,
      prompt: "Hello",
      authMethod: "subscription",
      permissionMode: "auto",
    })).rejects.toThrow();

    expect(session.running).toBe(false);
  });
});
