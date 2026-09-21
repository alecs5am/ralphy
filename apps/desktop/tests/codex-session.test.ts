import { afterEach, describe, expect, test } from "vitest";
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  CodexSession,
  normalizedEvents,
  readCodexAuthStatus,
  type AgentChatEvent,
} from "../electron/agent/codex-session";
import { makeLibraryFixture } from "./fixtures";

const cleanupPaths: string[] = [];
const THREAD = "0199a213-81c0-7800-8aa1-bbab2a035a53";
const TURN = "0199a213-81c0-7800-8aa1-bbab2a035a99";
const CHILD = "0199a213-81c0-7800-8aa1-bbab2a035a55";

interface Capture {
  args: string[];
  cwd: string;
  openrouterKey: string | null;
  openaiKey: string | null;
  codexKey: string | null;
  falKey: string | null;
  elevenlabsKey: string | null;
  requests: { method: string; params: Record<string, unknown> }[];
}

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((path) => (
    rm(path, { recursive: true, force: true })
  )));
});

/**
 * A Codex app server, as far as one turn is concerned: it answers the handshake, opens or rejoins
 * a thread, and then narrates one command and one assistant message. The message arrives as deltas
 * and then as a finished item carrying the whole text, which is what the real server does -- so a
 * parser that forwards the completed text wholesale writes the answer twice.
 */
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
const state = {
  args,
  cwd: process.cwd(),
  openrouterKey: process.env.OPENROUTER_API_KEY ?? null,
  openaiKey: process.env.OPENAI_API_KEY ?? null,
  codexKey: process.env.CODEX_API_KEY ?? null,
  falKey: process.env.FAL_KEY ?? null,
  elevenlabsKey: process.env.ELEVENLABS_API_KEY ?? null,
  requests: [],
};
const save = () => fs.writeFileSync(process.env.RALPHY_TEST_CAPTURE, JSON.stringify(state));
save();
const write = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
const notify = (method, params) => write({ method, params });
const failed = process.env.RALPHY_TEST_FAILED_COMMAND === "1";
const childThreads = process.env.RALPHY_TEST_CHILD_THREADS === "1";
process.stdout.write("not json\\n");
let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    if (message.method === undefined) continue;
    state.requests.push({ method: message.method, params: message.params ?? {} });
    save();
    if (message.method === "initialize") { write({ id: message.id, result: { codexHome: "/tmp" } }); continue; }
    if (message.method === "thread/start" || message.method === "thread/resume") {
      if (childThreads) {
        notify("thread/started", { thread: { id: ${JSON.stringify(CHILD)} } });
        notify("thread/started", { thread: { id: ${JSON.stringify(THREAD)} } });
      }
      write({ id: message.id, result: { thread: { id: ${JSON.stringify(THREAD)} } } });
      if (!childThreads) notify("thread/started", { threadId: ${JSON.stringify(THREAD)} });
      continue;
    }
    if (message.method === "turn/start") {
      write({ id: message.id, result: { turn: { id: ${JSON.stringify(TURN)}, status: "inProgress" } } });
      notify("turn/started", { threadId: ${JSON.stringify(THREAD)}, turnId: ${JSON.stringify(TURN)} });
      notify("item/started", { item: { id: "item-1", type: "commandExecution", command: "bash -lc pwd", status: "inProgress" } });
      notify("item/completed", { item: { id: "item-1", type: "commandExecution", command: "bash -lc pwd", status: failed ? "failed" : "completed" } });
      notify("item/started", { item: { id: "item-2", type: "agentMessage", text: "" } });
      notify("item/agentMessage/delta", { itemId: "item-2", delta: "The project" });
      if (childThreads) {
        const threadId = ${JSON.stringify(CHILD)};
        notify("thread/started", { threadId });
        notify("thread/started", { thread: { id: threadId } });
        notify("turn/started", { threadId, turnId: "child-turn" });
        notify("item/started", { threadId, item: { id: "child-tool", type: "commandExecution", command: "helper command" } });
        notify("item/completed", { threadId, item: { id: "child-tool", type: "commandExecution", status: "completed" } });
        notify("item/agentMessage/delta", { threadId, itemId: "item-2", delta: "Helper answer" });
        notify("item/completed", { threadId, item: { id: "item-2", type: "agentMessage", text: "Helper answer" } });
        notify("thread/tokenUsage/updated", { threadId, tokenUsage: { last: { inputTokens: 99, totalTokens: 100 } } });
        notify("error", { threadId, error: { message: "Helper failed" }, willRetry: false });
        notify("turn/completed", { threadId, turn: { id: "child-turn", status: "completed", error: null } });
      }
      notify("item/agentMessage/delta", { itemId: "item-2", delta: " is" });
      notify("item/completed", { item: { id: "item-2", type: "agentMessage", text: "The project is ready." } });
      notify("turn/completed", { threadId: ${JSON.stringify(THREAD)}, turn: { id: ${JSON.stringify(TURN)}, status: "completed", error: null } });
    }
  }
});
`, "utf8");
  await chmod(binary, 0o755);
  return { binary, capture };
}

async function read(path: string): Promise<Capture> {
  return JSON.parse(await readFile(path, "utf8")) as Capture;
}

describe("CodexSession", () => {
  test("keeps helper notifications out of the parent transcript and waits for its completion", async () => {
    const fixture = await makeLibraryFixture();
    cleanupPaths.push(fixture.parentPath);
    const fake = await fakeCodex();
    const events: AgentChatEvent[] = [];
    const session = new CodexSession({
      binary: fake.binary,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", RALPHY_TEST_CAPTURE: fake.capture, RALPHY_TEST_CHILD_THREADS: "1" },
      emit: (event) => events.push(event),
    });
    await session.run({ rootPath: fixture.rootPath, prompt: "Inspect it", provider: "codex", model: "default", permissionMode: "plan" });
    expect(events.filter((event) => event.type === "session")).toEqual([{ type: "session", sessionId: THREAD, tools: [] }]);
    expect(events.filter((event) => event.type === "text-delta").map((event) => event.text).join("")).toBe("The project is ready.");
    expect(events.filter((event) => event.type === "tool-start").map((event) => event.id)).toEqual(["item-1"]);
    expect(events.filter((event) => event.type === "tool-result").map((event) => event.id)).toEqual(["item-1"]);
    expect(events.some((event) => event.type === "error" || event.type === "usage")).toBe(false);
    expect(events.filter((event) => event.type === "result")).toEqual([{ type: "result", ok: true, cancelled: false, costUsd: 0, durationMs: expect.any(Number), sessionId: THREAD }]);
    expect(events.at(-1)?.type).toBe("result");
  });

  test("does not turn reasoning or helper lifecycle items into running tools", () => {
    for (const type of ["reasoning", "subAgentActivity"]) {
      for (const method of ["item/started", "item/completed"]) {
        expect(normalizedEvents(method, { item: { id: "lifecycle", type } }, new Map())).toEqual([]);
      }
    }
  });

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

    const capture = await read(fake.capture);
    expect(capture.cwd).toBe(await realpath(dirname(fixture.rootPath)));
    expect(capture.openrouterKey).toBeNull();
    expect(capture.openaiKey).toBeNull();
    expect(capture.codexKey).toBeNull();
    // The transport is the app server, and the turn's settings travel as parameters, not as flags.
    expect(capture.args).toEqual(["app-server"]);
    const resume = capture.requests.find(({ method }) => method === "thread/resume");
    expect(resume?.params).toMatchObject({
      threadId: "0199a213-81c0-7800-8aa1-bbab2a035a54",
      excludeTurns: true,
      model: "gpt-5.5",
      sandbox: "danger-full-access",
      approvalPolicy: "never",
      cwd: await realpath(dirname(fixture.rootPath)),
    });
    const turn = capture.requests.find(({ method }) => method === "turn/start");
    expect(JSON.stringify(turn?.params)).toContain("Review it");
    expect(JSON.stringify(turn?.params)).toContain(fixture.alphaPath);
    expect(events).toEqual([
      { type: "session", sessionId: THREAD, tools: [] },
      { type: "tool-start", id: "item-1", name: "Bash", summary: "bash -lc pwd" },
      { type: "tool-result", id: "item-1", ok: true },
      { type: "text-delta", text: "The project", messageId: "item-2" },
      { type: "text-delta", text: " is", messageId: "item-2" },
      { type: "text-delta", text: " ready.", messageId: "item-2" },
      {
        type: "result",
        ok: true,
        cancelled: false,
        costUsd: 0,
        durationMs: expect.any(Number),
        sessionId: THREAD,
      },
    ]);
  });

  test("routes OpenRouter through Codex without changing user config", async () => {
    const fixture = await makeLibraryFixture();
    cleanupPaths.push(fixture.parentPath);
    const fake = await fakeCodex();
    const session = new CodexSession({
      binary: fake.binary,
      generationCredentials: { FAL_KEY: "fal-nonfunctional-test-key", ELEVENLABS_API_KEY: "elevenlabs-nonfunctional-test-key" },
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

    const capture = await read(fake.capture);
    expect(capture.openrouterKey).toBe("sk-or-v1-test-key-123456789");
    expect(capture.falKey).toBe("fal-nonfunctional-test-key");
    expect(capture.elevenlabsKey).toBe("elevenlabs-nonfunctional-test-key");
    expect(capture.args).toContain("shell_environment_policy.ignore_default_excludes=true");
    expect(capture.args.find((arg) => arg.startsWith("shell_environment_policy.include_only="))).toContain("FAL_KEY");
    expect(JSON.stringify([capture.args, capture.requests])).not.toContain("fal-nonfunctional-test-key");
    expect(capture.args).toContain('model_provider="openrouter"');
    expect(capture.args).toContain('model_providers.openrouter.base_url="https://openrouter.ai/api/v1"');
    expect(capture.args).toContain('model_providers.openrouter.wire_api="responses"');
    expect(capture.args.at(-1)).toBe("app-server");
    expect(capture.requests.find(({ method }) => method === "thread/start")?.params).toMatchObject({
      model: "openai/gpt-5.5",
      sandbox: "read-only",
    });
  });

  test("sends only what is new when a message streams", async () => {
    /* The server streams the message as deltas and then repeats the whole text as a finished
       item. The transcript's reducer appends what it is handed, so the turn's text has to be the
       concatenation of what went on the wire and nothing more -- forwarding the finished text
       wholesale would write "The project is" twice. */
    const fixture = await makeLibraryFixture();
    cleanupPaths.push(fixture.parentPath);
    const fake = await fakeCodex();
    const events: AgentChatEvent[] = [];
    const session = new CodexSession({
      binary: fake.binary,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        RALPHY_TEST_CAPTURE: fake.capture,
      },
      emit: (event) => events.push(event),
    });

    await session.run({
      rootPath: fixture.rootPath,
      projectPath: null,
      prompt: "Review it",
      provider: "codex",
      model: "gpt-5.5",
      permissionMode: "full",
      resumeSessionId: null,
    });

    const deltas = events.filter((event) => event.type === "text-delta") as { text: string }[];
    expect(deltas.map(({ text }) => text)).toEqual(["The project", " is", " ready."]);
    expect(deltas.map(({ text }) => text).join("")).toBe("The project is ready.");
  });

  test("marks a refused or failed command as failed", async () => {
    const fixture = await makeLibraryFixture();
    cleanupPaths.push(fixture.parentPath);
    const fake = await fakeCodex();
    const events: AgentChatEvent[] = [];
    const session = new CodexSession({
      binary: fake.binary,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        RALPHY_TEST_CAPTURE: fake.capture,
        RALPHY_TEST_FAILED_COMMAND: "1",
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
    // "default" is the operator's own configured model, so the thread asks for no model at all.
    const start = (await read(fake.capture)).requests.find(({ method }) => method === "thread/start");
    expect(start?.params).not.toHaveProperty("model");
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
