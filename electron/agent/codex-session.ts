import {
  execFile,
  spawn,
  type ChildProcess,
} from "node:child_process";
import { constants } from "node:fs";
import { access, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

import { readAgentContext } from "./context";
import type {
  AgentChatEvent,
  AgentPermissionMode,
} from "../media/types";

export type { AgentChatEvent } from "../media/types";

const execFileAsync = promisify(execFile);
const MAX_PROMPT_BYTES = 128 * 1024;
const MAX_LINE_BYTES = 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function codexEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (key.startsWith("CODEX_") && key !== "CODEX_HOME") delete env[key];
  }
  delete env.OPENAI_API_KEY;
  delete env.OPENROUTER_API_KEY;
  return env;
}

export interface CodexRunRequest {
  rootPath: string;
  projectPath?: string;
  prompt: string;
  provider: "codex" | "openrouter";
  model: string;
  openRouterApiKey?: string;
  permissionMode: AgentPermissionMode;
  resumeSessionId?: string | null;
}

export interface CodexAuthStatus {
  loggedIn: boolean;
  detail: string;
}

interface CodexSessionOptions {
  binary: string;
  env?: NodeJS.ProcessEnv;
  emit(event: AgentChatEvent): void;
}

function boundedString(value: unknown, maxBytes = 512): string {
  if (typeof value !== "string") return "";
  if (Buffer.byteLength(value) <= maxBytes) return value;
  return Buffer.from(value).subarray(0, maxBytes).toString("utf8");
}

function parseLine(line: string): Record<string, unknown> | null {
  if (!line.trim() || Buffer.byteLength(line) > MAX_LINE_BYTES) return null;
  try {
    const value = JSON.parse(line) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function itemFrom(message: Record<string, unknown>): Record<string, unknown> | null {
  const value = message.item;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function toolName(type: string): string {
  if (type === "command_execution") return "Bash";
  if (type === "file_change") return "Edit";
  if (type === "mcp_tool_call") return "MCP";
  if (type === "web_search") return "Web search";
  return "Tool";
}

function toolSummary(item: Record<string, unknown>): string {
  return boundedString(
    item.command ?? item.path ?? item.name ?? item.query ?? "",
    1024,
  );
}

/* How much of each streaming message has already been sent, by item id. `codex exec --json`
   reports an assistant message as it grows: every `item.updated` carries the whole text so far,
   and the transcript's reducer appends what it receives -- so what goes on the wire is the part
   that is new. Without this the only text event was `item.completed`, and the answer landed in one
   piece after the whole turn: streaming looked dead because nothing streamed. */
type SentLengths = Map<string, number>;

function suffix(sent: SentLengths, id: string, text: string, done: boolean): AgentChatEvent[] {
  const already = sent.get(id) ?? 0;
  if (done) sent.delete(id);
  else sent.set(id, Math.max(already, text.length));
  const tail = text.slice(already);
  return tail ? [{ type: "text-delta", text: tail }] : [];
}

function normalizedEvents(line: string, sent: SentLengths): AgentChatEvent[] {
  const message = parseLine(line);
  if (!message) return [];
  if (message.type === "thread.started") {
    const sessionId = boundedString(message.thread_id, 128);
    return SESSION_ID.test(sessionId)
      ? [{ type: "session", sessionId, tools: [] }]
      : [];
  }

  if (message.type === "item.started") {
    const item = itemFrom(message);
    if (!item || item.type === "agent_message" || item.type === "reasoning") return [];
    const id = boundedString(item.id, 128);
    const type = boundedString(item.type, 128);
    return id ? [{
      type: "tool-start",
      id,
      name: toolName(type),
      summary: toolSummary(item),
    }] : [];
  }

  if (message.type === "item.updated") {
    const item = itemFrom(message);
    if (!item || item.type !== "agent_message") return [];
    const id = boundedString(item.id, 128);
    const text = boundedString(item.text, MAX_LINE_BYTES);
    return id && text ? suffix(sent, id, text, false) : [];
  }

  if (message.type === "item.completed") {
    const item = itemFrom(message);
    if (!item) return [];
    if (item.type === "agent_message") {
      const text = boundedString(item.text, MAX_LINE_BYTES);
      const id = boundedString(item.id, 128);
      if (!text) return [];
      /* Without an id there is nothing to have streamed against, so the whole message is new. */
      return id ? suffix(sent, id, text, true) : [{ type: "text-delta", text }];
    }
    if (item.type === "reasoning") return [];
    const id = boundedString(item.id, 128);
    if (!id) return [];
    return [{
      type: "tool-result",
      id,
      ok: item.status !== "failed"
        && item.exit_code !== false
        && (typeof item.exit_code !== "number" || item.exit_code === 0),
    }];
  }

  if (message.type === "turn.failed") {
    const error = message.error;
    const detail = error && typeof error === "object" && !Array.isArray(error)
      ? boundedString((error as Record<string, unknown>).message, MAX_STDERR_BYTES)
      : "";
    return [{ type: "error", code: "codex-turn", message: detail || "Codex turn failed" }];
  }
  if (message.type === "error") {
    return [{
      type: "error",
      code: "codex-error",
      message: boundedString(message.message, MAX_STDERR_BYTES) || "Codex failed",
    }];
  }
  return [];
}

function validatePrompt(value: string): string {
  const prompt = value.trim();
  if (!prompt || Buffer.byteLength(prompt) > MAX_PROMPT_BYTES) {
    throw new Error("Codex prompt must be between 1 byte and 128 KiB");
  }
  return prompt;
}

async function canonicalContext(request: CodexRunRequest): Promise<{
  rootPath: string;
  cwd: string;
  prompt: string;
}> {
  const rootPath = await realpath(request.rootPath);
  if (!rootPath.endsWith(`${sep}.ralphy`) && rootPath !== `${sep}.ralphy`) {
    throw new Error("Codex requires a canonical .ralphy library");
  }
  const cwd = await realpath(dirname(rootPath));
  let projectPath: string | null = null;
  if (request.projectPath) {
    projectPath = await realpath(request.projectPath);
    if (!projectPath.startsWith(`${rootPath}${sep}`)) {
      throw new Error("Codex project must be inside the active .ralphy library");
    }
  }
  /* The preamble is the same list the Context panel shows, built from the files that are really
     there: the working directory is the operator's home, so nothing relative reaches Ralphy's own
     guides and naming them would be a wish rather than an instruction. */
  const { preamble } = await readAgentContext({ provider: request.provider, rootPath, projectPath, cwd });
  const prompt = [preamble, "", validatePrompt(request.prompt)].join("\n");
  return { rootPath, cwd, prompt };
}

/* `--skip-git-repo-check` is not a permission: the harness runs in the library's parent, which is
   the operator's home and not a git repository, and without it `codex exec` refuses to start with
   "Not inside a trusted directory". A `full` turn never hit it because bypassing the sandbox also
   bypasses the trust check -- which is why Plan and Auto looked like they worked and did not. What
   a turn may touch is still decided entirely by the sandbox flags below. */
function permissionArgs(mode: AgentPermissionMode): string[] {
  if (mode === "full") return ["--dangerously-bypass-approvals-and-sandbox"];
  if (mode === "plan") return ["--sandbox", "read-only"];
  if (mode === "auto") return ["--sandbox", "workspace-write"];
  throw new Error("Invalid Codex permission mode");
}

function openRouterArgs(): string[] {
  return [
    "-c", 'model_provider="openrouter"',
    "-c", 'model_providers.openrouter.name="OpenRouter"',
    "-c", 'model_providers.openrouter.base_url="https://openrouter.ai/api/v1"',
    "-c", 'model_providers.openrouter.env_key="OPENROUTER_API_KEY"',
    "-c", 'model_providers.openrouter.wire_api="responses"',
  ];
}

function validateOpenRouterApiKey(value: string): string {
  const key = value.trim();
  if (!key.startsWith("sk-or-") || key.length < 20 || key.length > 512 || /[\r\n]/.test(key)) {
    throw new Error("Invalid OpenRouter API key");
  }
  return key;
}

export async function readCodexAuthStatus(
  binary: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CodexAuthStatus> {
  const { stdout, stderr } = await execFileAsync(binary, ["login", "status"], {
    env: codexEnvironment(env),
    timeout: 10_000,
    maxBuffer: 64 * 1024,
  });
  const detail = boundedString((stdout || stderr).trim(), 512) || "Not logged in";
  return { loggedIn: /^Logged in\b/i.test(detail), detail };
}

/* The catalogue this binary ships. `--bundled` skips the refresh, so it neither reaches the
   network nor rewrites the shared cache file -- and what it prints is exactly the set of models
   the CLI itself knows how to send. */
export async function readCodexBundledCatalog(
  binary: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<unknown | null> {
  try {
    const { stdout } = await execFileAsync(binary, ["debug", "models", "--bundled"], {
      env: codexEnvironment(env),
      timeout: 15_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return JSON.parse(stdout) as unknown;
  } catch {
    return null;
  }
}

/* The model a bare `codex` would use. Read, never written: it is the operator's file. A top-level
   `model = "..."` is the whole contract here, so it is a line match rather than a TOML dependency;
   a profile override or a nested key is not what "Codex default" means in this menu. */
export async function readCodexConfiguredModel(home = homedir()): Promise<string | null> {
  const source = await readFile(join(home, ".codex", "config.toml"), "utf8").catch(() => null);
  if (source === null) return null;
  for (const line of source.split("\n")) {
    if (/^\s*\[/.test(line)) break;
    const match = /^\s*model\s*=\s*["']([^"']{1,256})["']\s*(?:#.*)?$/.exec(line);
    if (match) return match[1]!;
  }
  return null;
}

/** The CLI's own version, so a stale install is visible rather than a mystery 400 mid-turn. */
export async function readCodexVersion(
  binary: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(binary, ["--version"], {
      env: codexEnvironment(env),
      timeout: 10_000,
      maxBuffer: 64 * 1024,
    });
    return /(\d+\.\d+\.\d+)/.exec(stdout)?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function loginCodex(
  binary: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await execFileAsync(binary, ["login"], {
    env: codexEnvironment(env),
    timeout: 10 * 60_000,
    maxBuffer: 1024 * 1024,
  });
}

export async function resolveCodexBinary(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): Promise<string | null> {
  const candidates = [
    env.RALPHY_CODEX_PATH,
    /* What Codex itself calls the installed version. Its own updater repoints this symlink, while
       `~/.local/bin/codex` can stay pinned to the release it was installed with -- on this machine
       that left the app on 0.142.4 while 0.149.1 was installed, and the server refuses a 5.6 model
       to an old client with "requires a newer version of Codex". The app must run the Codex the
       operator has, not the one their shell PATH happens to point at. */
    join(home, ".codex", "packages", "standalone", "current", "bin", "codex"),
    join(home, ".local", "bin", "codex"),
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
    ...(env.PATH ?? "").split(":").filter(Boolean).map((part) => join(part, "codex")),
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of [...new Set(candidates)]) {
    try {
      await access(candidate, constants.X_OK);
      return await realpath(candidate);
    } catch {
      // Try the next normal installation location.
    }
  }
  return null;
}

export class CodexSession {
  readonly #binary: string;
  readonly #env: NodeJS.ProcessEnv;
  readonly #emit: (event: AgentChatEvent) => void;
  #process: ChildProcess | null = null;
  #stopping = false;
  #sessionId: string | null = null;

  constructor(options: CodexSessionOptions) {
    this.#binary = options.binary;
    this.#env = { ...(options.env ?? process.env) };
    this.#emit = options.emit;
  }

  get running(): boolean {
    return this.#process !== null;
  }

  async run(request: CodexRunRequest): Promise<void> {
    if (this.#process) throw new Error("Codex is already running");
    if (request.resumeSessionId && !SESSION_ID.test(request.resumeSessionId)) {
      throw new Error("Invalid Codex session id");
    }
    const context = await canonicalContext(request);
    const env = codexEnvironment(this.#env);
    if (request.provider === "openrouter") {
      env.OPENROUTER_API_KEY = validateOpenRouterApiKey(request.openRouterApiKey ?? "");
    } else if (request.provider !== "codex") {
      throw new Error("Invalid Codex provider");
    }

    const args = [
      ...(request.provider === "openrouter" ? openRouterArgs() : []),
      ...(request.model === "default" ? [] : ["--model", request.model]),
      "--cd", context.cwd,
      ...permissionArgs(request.permissionMode),
      "exec",
      ...(request.resumeSessionId
        ? ["resume", "--skip-git-repo-check", "--json", request.resumeSessionId, context.prompt]
        : ["--skip-git-repo-check", "--json", context.prompt]),
    ];
    const child = spawn(this.#binary, args, {
      cwd: context.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.#process = child;
    this.#stopping = false;
    this.#sessionId = request.resumeSessionId ?? null;
    const startedAt = Date.now();
    let stderr = "";
    let sawResult = false;

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      if (Buffer.byteLength(stderr) < MAX_STDERR_BYTES) {
        stderr = boundedString(`${stderr}${chunk}`, MAX_STDERR_BYTES);
      }
    });

    const output = (async () => {
      if (!child.stdout) return;
      const sent: SentLengths = new Map();
      const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
      for await (const line of lines) {
        const message = parseLine(line);
        if (message?.type === "turn.completed") {
          sawResult = true;
          this.#emit({
            type: "result",
            ok: true,
            cancelled: false,
            costUsd: 0,
            durationMs: Date.now() - startedAt,
            sessionId: this.#sessionId,
          });
          continue;
        }
        for (const event of normalizedEvents(line, sent)) {
          if (event.type === "session") this.#sessionId = event.sessionId;
          if (event.type === "error") sawResult = true;
          this.#emit(event);
        }
      }
    })();

    try {
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
      });
      await output;
      if (!sawResult) {
        if (this.#stopping) {
          this.#emit({
            type: "result",
            ok: false,
            cancelled: true,
            costUsd: 0,
            durationMs: Date.now() - startedAt,
            sessionId: this.#sessionId,
          });
        } else {
          this.#emit({
            type: "error",
            code: "codex-exit",
            message: stderr.trim() || `Codex exited with code ${exitCode ?? "unknown"}`,
          });
        }
      }
    } finally {
      if (this.#process === child) this.#process = null;
      this.#stopping = false;
    }
  }

  stop(): void {
    if (!this.#process) return;
    this.#stopping = true;
    this.#process.kill("SIGTERM");
  }
}
