import {
  execFile,
  spawn,
  type ChildProcess,
} from "node:child_process";
import { constants } from "node:fs";
import { access, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import type {
  ClaudeAuthMethod,
  ClaudeChatEvent,
  ClaudePermissionMode,
} from "../media/types";
import { agentPreamble, type AgentMemoryDigest } from "../agent/context";
import { validateAnthropicApiKey } from "./credentials";

export type {
  ClaudeAuthMethod,
  ClaudeChatEvent,
  ClaudePermissionMode,
} from "../media/types";

const execFileAsync = promisify(execFile);
const MAX_PROMPT_BYTES = 128 * 1024;
const MAX_LINE_BYTES = 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ClaudeRunRequest {
  rootPath: string;
  projectPath?: string;
  prompt: string;
  model?: string;
  authMethod: ClaudeAuthMethod;
  apiKey?: string;
  permissionMode: ClaudePermissionMode;
  resumeSessionId?: string | null;
  /** The absolute path of the CLI this app runs; the bare name resolves elsewhere. */
  ralphyCli?: string | null;
  memory?: AgentMemoryDigest | null;
}

export interface ClaudeAuthStatus {
  loggedIn: boolean;
  authMethod: string;
  apiProvider: string;
}

interface ClaudeSessionOptions {
  binary: string;
  env?: NodeJS.ProcessEnv;
  emit(event: ClaudeChatEvent): void;
}

interface ContentBlock {
  type?: unknown;
  text?: unknown;
  id?: unknown;
  name?: unknown;
  input?: unknown;
  tool_use_id?: unknown;
  is_error?: unknown;
}

function boundedString(value: unknown, maxBytes = 512): string {
  if (typeof value !== "string") return "";
  if (Buffer.byteLength(value) <= maxBytes) return value;
  return Buffer.from(value).subarray(0, maxBytes).toString("utf8");
}

function summarize(block: ContentBlock): string {
  if (!block.input || typeof block.input !== "object" || Array.isArray(block.input)) return "";
  const input = block.input as Record<string, unknown>;
  return boundedString(
    input.command ?? input.file_path ?? input.pattern ?? input.query ?? "",
  );
}

function normalizedEvents(line: string): ClaudeChatEvent[] {
  if (!line.trim() || Buffer.byteLength(line) > MAX_LINE_BYTES) return [];
  let message: Record<string, unknown>;
  try {
    const value = JSON.parse(line) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    message = value as Record<string, unknown>;
  } catch {
    return [];
  }

  if (message.type === "system" && message.subtype === "init") {
    const sessionId = boundedString(message.session_id, 128);
    if (!sessionId) return [];
    const tools = Array.isArray(message.tools)
      ? message.tools.filter((tool): tool is string => typeof tool === "string").slice(0, 128)
      : [];
    return [{ type: "session", sessionId, tools }];
  }

  if (message.type === "stream_event") {
    const event = message.event;
    if (!event || typeof event !== "object" || Array.isArray(event)) return [];
    const raw = event as Record<string, unknown>;
    const delta = raw.delta;
    if (
      raw.type === "content_block_delta"
      && delta
      && typeof delta === "object"
      && !Array.isArray(delta)
      && (delta as Record<string, unknown>).type === "text_delta"
    ) {
      const text = boundedString((delta as Record<string, unknown>).text, MAX_LINE_BYTES);
      return text ? [{ type: "text-delta", text }] : [];
    }
    return [];
  }

  if (message.type === "assistant") {
    const rawMessage = message.message;
    if (!rawMessage || typeof rawMessage !== "object" || Array.isArray(rawMessage)) return [];
    const content = (rawMessage as Record<string, unknown>).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((rawBlock): ClaudeChatEvent[] => {
      if (!rawBlock || typeof rawBlock !== "object" || Array.isArray(rawBlock)) return [];
      const block = rawBlock as ContentBlock;
      if (block.type !== "tool_use") return [];
      const id = boundedString(block.id, 128);
      if (!id) return [];
      return [{
        type: "tool-start",
        id,
        name: boundedString(block.name, 128) || "Tool",
        summary: summarize(block),
      }];
    });
  }

  if (message.type === "user") {
    const rawMessage = message.message;
    if (!rawMessage || typeof rawMessage !== "object" || Array.isArray(rawMessage)) return [];
    const content = (rawMessage as Record<string, unknown>).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((rawBlock): ClaudeChatEvent[] => {
      if (!rawBlock || typeof rawBlock !== "object" || Array.isArray(rawBlock)) return [];
      const block = rawBlock as ContentBlock;
      if (block.type !== "tool_result") return [];
      const id = boundedString(block.tool_use_id, 128);
      return id ? [{ type: "tool-result", id, ok: block.is_error !== true }] : [];
    });
  }

  if (message.type === "result") {
    const sessionId = boundedString(message.session_id, 128) || null;
    /* Claude reports the turn's usage on the result and never names the model's window, so the
       page gets a real total with no denominator rather than a denominator we made up. */
    const usage = message.usage as Record<string, unknown> | undefined;
    const input = Number(usage?.input_tokens) + Number(usage?.cache_read_input_tokens ?? 0);
    const output = Number(usage?.output_tokens);
    return [
      ...(Number.isFinite(input) ? [{
        type: "usage" as const,
        inputTokens: Math.max(0, Math.trunc(input)),
        totalTokens: Math.max(0, Math.trunc(input + (Number.isFinite(output) ? output : 0))),
        contextWindow: null,
      }] : []),
      {
        type: "result",
        ok: message.subtype === "success",
        cancelled: false,
        costUsd: Number.isFinite(message.total_cost_usd) ? Number(message.total_cost_usd) : 0,
        durationMs: Number.isFinite(message.duration_ms) ? Number(message.duration_ms) : 0,
        sessionId,
      },
    ];
  }

  return [];
}

function validatePrompt(prompt: string): string {
  const normalized = prompt.trim();
  if (!normalized || Buffer.byteLength(normalized) > MAX_PROMPT_BYTES) {
    throw new Error("Claude prompt must be between 1 byte and 128 KiB");
  }
  return normalized;
}

function permissionMode(mode: ClaudePermissionMode): string {
  if (mode === "auto" || mode === "plan") return mode;
  if (mode === "full") return "bypassPermissions";
  throw new Error("Invalid Claude permission mode");
}

async function canonicalContext(request: ClaudeRunRequest): Promise<{
  rootPath: string;
  cwd: string;
  prompt: string;
  system: string;
}> {
  const rootPath = await realpath(request.rootPath);
  if (!rootPath.endsWith(`${sep}.ralphy`) && rootPath !== `${sep}.ralphy`) {
    throw new Error("Claude requires a canonical .ralphy library");
  }
  const cwd = await realpath(dirname(rootPath));
  let projectPath: string | null = null;
  if (request.projectPath) {
    projectPath = await realpath(request.projectPath);
    if (!projectPath.startsWith(`${rootPath}${sep}`)) {
      throw new Error("Claude project must be inside the active .ralphy library");
    }
  }
  /* The preamble is the same list the Context panel shows, built from the files that are really
     there: the working directory is the operator's home, so nothing relative reaches Ralphy's own
     guides and naming them would be a wish rather than an instruction.

     Claude takes it as a *system* instruction rather than as a prefix on the operator's sentence:
     `--append-system-prompt` is where a harness's own context belongs, and it keeps the message
     the operator wrote the message the model is answering. Codex has no equivalent on `exec`, so
     there the preamble is still a prefix. */
  const preamble = await agentPreamble({
    provider: "claude",
    rootPath,
    projectPath,
    cwd,
    cli: request.ralphyCli,
    memory: request.memory,
  });
  return { rootPath, cwd, prompt: validatePrompt(request.prompt), system: preamble };
}

export async function readClaudeAuthStatus(
  binary: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ClaudeAuthStatus> {
  const { stdout } = await execFileAsync(binary, ["auth", "status", "--json"], {
    env,
    timeout: 10_000,
    maxBuffer: 64 * 1024,
  });
  const value = JSON.parse(stdout) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Claude authentication status");
  }
  const row = value as Record<string, unknown>;
  return {
    loggedIn: row.loggedIn === true,
    authMethod: boundedString(row.authMethod, 128) || "none",
    apiProvider: boundedString(row.apiProvider, 128) || "unknown",
  };
}

export function claudeSubscriptionEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const isolated = { ...env };
  delete isolated.ANTHROPIC_API_KEY;
  delete isolated.ANTHROPIC_AUTH_TOKEN;
  delete isolated.CLAUDE_CODE_USE_BEDROCK;
  delete isolated.CLAUDE_CODE_USE_VERTEX;
  delete isolated.CLAUDE_CODE_USE_FOUNDRY;
  return isolated;
}

export async function loginClaudeSubscription(
  binary: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await execFileAsync(binary, ["auth", "login", "--claudeai"], {
    env: claudeSubscriptionEnvironment(env),
    timeout: 10 * 60_000,
    maxBuffer: 1024 * 1024,
  });
}

export async function resolveClaudeBinary(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): Promise<string | null> {
  const candidates = [
    env.RALPHY_CLAUDE_PATH,
    join(home, ".local", "bin", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    ...(env.PATH ?? "").split(":").filter(Boolean).map((part) => join(part, "claude")),
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

export class ClaudeSession {
  readonly #binary: string;
  readonly #env: NodeJS.ProcessEnv;
  readonly #emit: (event: ClaudeChatEvent) => void;
  #process: ChildProcess | null = null;
  #stopping = false;
  #sessionId: string | null = null;

  constructor(options: ClaudeSessionOptions) {
    this.#binary = options.binary;
    this.#env = { ...(options.env ?? process.env) };
    this.#emit = options.emit;
  }

  get running(): boolean {
    return this.#process !== null;
  }

  async run(request: ClaudeRunRequest): Promise<void> {
    if (this.#process) throw new Error("Claude is already running");
    const context = await canonicalContext(request);
    if (request.resumeSessionId && !SESSION_ID.test(request.resumeSessionId)) {
      throw new Error("Invalid Claude session id");
    }
    const env = claudeSubscriptionEnvironment(this.#env);
    if (request.authMethod === "subscription") {
      delete env.ANTHROPIC_API_KEY;
    } else if (request.authMethod === "api-key") {
      env.ANTHROPIC_API_KEY = validateAnthropicApiKey(request.apiKey ?? "");
    } else {
      throw new Error("Invalid Claude authentication method");
    }

    const args = [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--setting-sources", "user,project,local",
      "--append-system-prompt", context.system,
      "--permission-mode", permissionMode(request.permissionMode),
      "--no-chrome",
      ...(request.model ? ["--model", request.model] : []),
      ...(request.resumeSessionId ? ["--resume", request.resumeSessionId] : []),
      context.prompt,
    ];
    const child = spawn(this.#binary, args, {
      cwd: context.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.#process = child;
    this.#stopping = false;
    this.#sessionId = request.resumeSessionId ?? null;
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
      const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
      for await (const line of lines) {
        for (const event of normalizedEvents(line)) {
          if (event.type === "session") this.#sessionId = event.sessionId;
          if (event.type === "result") sawResult = true;
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
            durationMs: 0,
            sessionId: this.#sessionId,
          });
        } else {
          this.#emit({
            type: "error",
            code: "claude-exit",
            message: stderr.trim() || `Claude exited with code ${exitCode ?? "unknown"}`,
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
