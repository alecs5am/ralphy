import {
  execFile,
  spawn,
  type ChildProcess,
} from "node:child_process";
import { agentErrorMessage as codexErrorMessage } from "../../shared/agent-error";
export { codexErrorMessage };
import { constants } from "node:fs";
import { access, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

import { agentPreamble, type AgentMemoryDigest } from "./context";
import { appCredentialEnvironment } from "../canvas/app-credentials";
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
/* A handshake that never answers must fail rather than leave the chat on "Working". The bound is
   generous because the daemon starts MCP servers and loads plugins before it replies. */
const HANDSHAKE_TIMEOUT_MS = 60_000;

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
  workspaceId?: string | null;
  projectId?: string | null;
  projectPath?: string;
  prompt: string;
  provider: "codex" | "openrouter";
  model: string;
  openRouterApiKey?: string;
  permissionMode: AgentPermissionMode;
  resumeSessionId?: string | null;
  /** The absolute path of the CLI this app runs; the bare name resolves elsewhere. */
  ralphyCli?: string | null;
  memory?: AgentMemoryDigest | null;
}

export interface CodexAuthStatus {
  loggedIn: boolean;
  detail: string;
}

interface CodexSessionOptions {
  binary: string;
  env?: NodeJS.ProcessEnv;
  generationCredentials?: Partial<Record<"OPENROUTER_API_KEY" | "ELEVENLABS_API_KEY" | "FAL_KEY", string>>;
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

function objectFrom(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function toolName(type: string): string {
  if (type === "commandExecution") return "Bash";
  if (type === "fileChange") return "Edit";
  if (type === "mcpToolCall" || type === "dynamicToolCall") return "MCP";
  if (type === "webSearch") return "Web search";
  if (type === "imageGeneration") return "Image";
  return "Tool";
}

function toolSummary(item: Record<string, unknown>): string {
  return boundedString(
    item.command ?? item.path ?? item.name ?? item.query ?? item.text ?? "",
    1024,
  );
}

/* An item the transcript draws as neither prose nor a tool: the model thinking out loud, the
   operator's own message echoed back, a plan. Ignored rather than rendered twice. */
const SILENT_ITEMS = new Set([
  "agentMessage",
  "reasoning",
  "subAgentActivity",
  "userMessage",
  "plan",
  "hookPrompt",
  "contextCompaction",
  "enteredReviewMode",
  "exitedReviewMode",
]);

/**
 * How many characters of each assistant message have already been sent, by item id.
 *
 * `item/agentMessage/delta` carries only what is new, and the transcript's reducer appends what it
 * receives, so a delta goes straight out. The count exists for the end of the message: the
 * completed item carries the whole text, and without knowing what the deltas already covered the
 * answer would be appended a second time in full.
 */
type SentLengths = Map<string, number>;



export function normalizedEvents(
  method: string,
  params: Record<string, unknown>,
  sent: SentLengths,
): AgentChatEvent[] {
  if (method === "thread/started") {
    const sessionId = boundedString(params.threadId, 128);
    return SESSION_ID.test(sessionId) ? [{ type: "session", sessionId, tools: [] }] : [];
  }

  if (method === "item/agentMessage/delta") {
    const id = boundedString(params.itemId, 128);
    const text = boundedString(params.delta, MAX_LINE_BYTES);
    if (!id || !text) return [];
    sent.set(id, (sent.get(id) ?? 0) + text.length);
    return [{ type: "text-delta", text, messageId: id }];
  }

  /* The app-server reports usage per turn, with the model's own window beside it. This is the
     only number the Context page is allowed to show, so it is carried verbatim: `last` is what the
     turn just sent, which is what "the next turn carries" is measured from. */
  if (method === "thread/tokenUsage/updated") {
    const usage = objectFrom(params.tokenUsage);
    const last = objectFrom(usage?.last);
    if (!last) return [];
    const input = Number(last.inputTokens);
    const total = Number(last.totalTokens);
    if (!Number.isFinite(input) || !Number.isFinite(total)) return [];
    const window = Number(usage?.modelContextWindow);
    return [{
      type: "usage",
      inputTokens: Math.max(0, Math.trunc(input)),
      totalTokens: Math.max(0, Math.trunc(total)),
      contextWindow: Number.isFinite(window) && window > 0 ? Math.trunc(window) : null,
    }];
  }

  if (method === "item/started") {
    const item = objectFrom(params.item);
    if (!item) return [];
    const type = boundedString(item.type, 128);
    if (SILENT_ITEMS.has(type)) return [];
    const id = boundedString(item.id, 128);
    return id ? [{ type: "tool-start", id, name: toolName(type), summary: toolSummary(item) }] : [];
  }

  if (method === "item/completed") {
    const item = objectFrom(params.item);
    if (!item) return [];
    const type = boundedString(item.type, 128);
    if (type === "agentMessage") {
      const id = boundedString(item.id, 128);
      const text = boundedString(item.text, MAX_LINE_BYTES);
      if (!text) return [];
      /* Whatever the deltas did not cover. With no id there is nothing to have streamed against,
         so the whole message is new. */
      const already = id ? sent.get(id) ?? 0 : 0;
      if (id) sent.delete(id);
      const tail = text.slice(already);
      return tail ? [{ type: "text-delta", text: tail, ...(id ? { messageId: id } : {}) }] : [];
    }
    if (SILENT_ITEMS.has(type)) return [];
    const id = boundedString(item.id, 128);
    if (!id) return [];
    return [{ type: "tool-result", id, ok: item.status !== "failed" && item.status !== "declined" }];
  }

  if (method === "error") {
    const error = objectFrom(params.error);
    const message = codexErrorMessage(error?.message);
    /* A retry is Codex's own business and not a failed turn. */
    return params.willRetry === true
      ? []
      : [{ type: "error", code: "codex-error", message: message || "Codex failed" }];
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
  const preamble = await agentPreamble({
    provider: request.provider,
    permissionMode: request.permissionMode,
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    rootPath,
    projectPath,
    cwd,
    cli: request.ralphyCli,
    memory: request.memory,
  });
  const prompt = [preamble, "", validatePrompt(request.prompt)].join("\n");
  return { rootPath, cwd, prompt };
}

/* What a turn may touch. The app server takes the sandbox as a thread setting rather than a
   command-line flag, and the three modes map onto its three sandbox values exactly. Approvals are
   never routed to this client: there is no approval surface in the chat, and a turn that stops to
   ask a question nobody can see is a turn that hangs. */
function sandboxMode(mode: AgentPermissionMode): "read-only" | "workspace-write" | "danger-full-access" {
  if (mode === "full") return "danger-full-access";
  if (mode === "plan") return "read-only";
  if (mode === "auto") return "workspace-write";
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

/* An offline fallback, read from the chosen CLI itself rather than the app's shared cache. */
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

const codexCatalogCache = new Map<string, { expiresAt: number; result: Promise<unknown | null> }>();
/** The selected CLI refreshes account availability using its own version and authentication. */
export function readCodexCatalog(binary: string, env: NodeJS.ProcessEnv = process.env): Promise<unknown | null> {
  const key = JSON.stringify([binary, env.CODEX_HOME || join(env.HOME || homedir(), ".codex")]);
  const cached = codexCatalogCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  const result = (async () => {
    try {
      const { stdout } = await execFileAsync(binary, ["debug", "models"], {
        env: codexEnvironment(env), timeout: 8000, maxBuffer: 8 * 1024 * 1024,
      });
      const catalog = JSON.parse(stdout) as { models?: unknown[] };
      if (!Array.isArray(catalog?.models) || !catalog.models.length) throw new Error("Empty Codex catalog");
      return catalog;
    } catch { return readCodexBundledCatalog(binary, env); }
  })();
  if (codexCatalogCache.size >= 16) codexCatalogCache.delete(codexCatalogCache.keys().next().value!);
  codexCatalogCache.set(key, { expiresAt: Date.now() + 5 * 60_000, result });
  return result;
}

/* The model a bare `codex` would use. Read, never written: it is the operator's file. A top-level
   `model = "..."` is the whole contract here, so it is a line match rather than a TOML dependency;
   a profile override or a nested key is not what "Codex default" means in this menu. */
export async function readCodexConfiguredModel(home = homedir(), env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const source = await readFile(join(env.CODEX_HOME || join(home, ".codex"), "config.toml"), "utf8").catch(() => null);
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
  timeout = 10_000,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(binary, ["--version"], {
      env: codexEnvironment(env),
      timeout,
      maxBuffer: 64 * 1024,
    });
    return /(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/.exec(stdout)?.[1] ?? null;
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
  codexCatalogCache.clear();
}

export async function resolveCodexBinary(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): Promise<string | null> {
  const executable = async (candidate: string) => {
    try { await access(candidate, constants.X_OK); return await realpath(candidate); }
    catch { return null; }
  };
  if (env.RALPHY_CODEX_PATH) {
    const explicit = await executable(env.RALPHY_CODEX_PATH);
    if (explicit) return explicit;
  }
  const candidates = [
    ...["/Applications", join(home, "Applications")].flatMap((directory) => ["ChatGPT.app", "Codex.app"].map((name) => join(directory, name, "Contents", "Resources", "codex"))),
    join(env.CODEX_HOME || join(home, ".codex"), "packages", "standalone", "current", "bin", "codex"),
    join(home, ".local", "bin", "codex"),
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
    ...(env.PATH ?? "").split(":").filter(Boolean).map((part) => join(part, "codex")),
  ];
  const paths = [...new Set((await Promise.all(candidates.map(executable))).filter((value): value is string => value !== null))];
  const versions = await Promise.all(paths.map(async (path) => ({ path, version: await readCodexVersion(path, env, 1500) })));
  // Prefer a newer installed app binary without modifying any CLI installation or PATH.
  versions.sort((a, b) => {
    const left = a.version?.split(/[.-]/).slice(0, 3).map(Number) ?? [0, 0, 0];
    const right = b.version?.split(/[.-]/).slice(0, 3).map(Number) ?? [0, 0, 0];
    for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return right[index]! - left[index]!;
    return Number(Boolean(a.version?.includes("-"))) - Number(Boolean(b.version?.includes("-")));
  });
  return versions[0]?.path ?? null;
}

export class CodexSession {
  readonly #binary: string;
  readonly #env: NodeJS.ProcessEnv;
  readonly #generationCredentials: CodexSessionOptions["generationCredentials"];
  readonly #emit: (event: AgentChatEvent) => void;
  #process: ChildProcess | null = null;
  #stopping = false;
  #sessionId: string | null = null;
  #turnId: string | null = null;

  constructor(options: CodexSessionOptions) {
    this.#binary = options.binary;
    this.#env = { ...(options.env ?? process.env) };
    this.#generationCredentials = options.generationCredentials;
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
    const env = appCredentialEnvironment(codexEnvironment(this.#env), this.#generationCredentials ?? {});
    if (request.provider === "openrouter") {
      env.OPENROUTER_API_KEY = validateOpenRouterApiKey(request.openRouterApiKey ?? "");
    } else if (request.provider !== "codex") {
      throw new Error("Invalid Codex provider");
    }

    /* `app-server` rather than `exec`: `codex exec --json` reports an assistant message only once,
       as a finished item, so an answer of any length landed in the transcript in one piece after
       the whole turn -- there was nothing to stream. The app server is the transport Codex's own
       desktop client uses, and it emits `item/agentMessage/delta` as the model writes. */
    const child = spawn(this.#binary, [
      ...(request.provider === "openrouter" ? openRouterArgs() : []),
      // Codex normally filters KEY/SECRET/TOKEN from shell tools. Admit only the selected
      // generation keys; values stay in the native environment, never argv or the prompt.
      ...(this.#generationCredentials ? [
        "-c", "shell_environment_policy.ignore_default_excludes=true",
        "-c", 'shell_environment_policy.set={}',
        "-c", `shell_environment_policy.include_only=${JSON.stringify(Object.keys(env).filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && (!/key|secret|token/i.test(name) || ["OPENROUTER_API_KEY", "ELEVENLABS_API_KEY", "FAL_KEY"].includes(name.replace(/^RALPHY_APP_/, "")) && Object.hasOwn(this.#generationCredentials!, name.replace(/^RALPHY_APP_/, "")))))}`,
      ] : []),
      "app-server",
    ], { cwd: context.cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    this.#process = child;
    this.#stopping = false;
    this.#sessionId = request.resumeSessionId ?? null;
    this.#turnId = null;
    const startedAt = Date.now();
    let stderr = "";
    let settled = false;

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      if (Buffer.byteLength(stderr) < MAX_STDERR_BYTES) {
        stderr = boundedString(`${stderr}${chunk}`, MAX_STDERR_BYTES);
      }
    });

    let nextId = 0;
    const pending = new Map<number, { resolve(value: Record<string, unknown>): void; reject(error: Error): void }>();
    const call = (method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const id = (nextId += 1);
      child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        setTimeout(() => {
          if (!pending.delete(id)) return;
          reject(new Error(`Codex did not answer ${method}`));
        }, HANDSHAKE_TIMEOUT_MS);
      });
    };

    const finish = (event: AgentChatEvent): void => {
      if (settled) return;
      settled = true;
      this.#emit(event);
    };

    const output = (async () => {
      if (!child.stdout) return;
      const sent: SentLengths = new Map();
      const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
      for await (const line of lines) {
        const message = parseLine(line);
        if (!message) continue;
        if (typeof message.id === "number" && message.method === undefined) {
          const slot = pending.get(message.id);
          if (!slot) continue;
          pending.delete(message.id);
          const error = objectFrom(message.error);
          if (error) slot.reject(new Error(boundedString(error.message, 512) || "Codex refused"));
          else slot.resolve(objectFrom(message.result) ?? {});
          continue;
        }
        const method = boundedString(message.method, 128);
        if (!method) continue;
        /* A request from the server, not a notification: something wants an answer this chat has
           no surface for. Refusing keeps the turn moving -- an unanswered request never returns. */
        if (message.id !== undefined) {
          child.stdin?.write(`${JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32601, message: "Ralphy cannot answer this request" },
          })}\n`);
          continue;
        }
        const params = objectFrom(message.params) ?? {};
        // The daemon also reports helper threads. Only the requested thread's response owns this session.
        if (method === "thread/started") continue;
        const eventThreadId = boundedString(params.threadId, 128);
        if (eventThreadId && eventThreadId !== this.#sessionId) continue;
        if (method === "turn/started") {
          this.#turnId = boundedString(params.turnId, 128) || this.#turnId;
          continue;
        }
        if (method === "turn/completed") {
          const turn = objectFrom(params.turn);
          const status = boundedString(turn?.status, 64);
          const failure = objectFrom(turn?.error);
          if (status === "failed") {
            finish({
              type: "error",
              code: "codex-turn",
              message: codexErrorMessage(failure?.message, "Codex turn failed"),
            });
          } else {
            finish({
              type: "result",
              ok: status === "completed",
              cancelled: status === "interrupted",
              costUsd: 0,
              durationMs: Date.now() - startedAt,
              sessionId: this.#sessionId,
            });
          }
          break;
        }
        for (const event of normalizedEvents(method, params, sent)) {
          if (event.type === "error") finish(event);
          else this.#emit(event);
        }
      }
    })();

    try {
      await call("initialize", { clientInfo: { name: "ralphy-desktop", title: "Ralphy", version: "1" } });
      child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", method: "initialized", params: {} })}\n`);
      const settings = {
        cwd: context.cwd,
        sandbox: sandboxMode(request.permissionMode),
        approvalPolicy: "never",
        ...(request.model === "default" ? {} : { model: request.model }),
      };
      // The renderer owns its transcript; a full media history can exceed the JSON line limit.
      const thread = request.resumeSessionId
        ? await call("thread/resume", { threadId: request.resumeSessionId, excludeTurns: true, ...settings })
        : await call("thread/start", settings);
      const threadId = boundedString(objectFrom(thread.thread)?.id, 128);
      if (!SESSION_ID.test(threadId)) throw new Error("Codex did not open a thread");
      this.#sessionId = threadId;
      this.#emit({ type: "session", sessionId: threadId, tools: [] });
      await call("turn/start", {
        threadId,
        input: [{ type: "text", text: context.prompt, text_elements: [] }],
      });
      await output;
      if (!settled) {
        finish(this.#stopping
          ? {
            type: "result",
            ok: false,
            cancelled: true,
            costUsd: 0,
            durationMs: Date.now() - startedAt,
            sessionId: this.#sessionId,
          }
          : {
            type: "error",
            code: "codex-exit",
            message: codexErrorMessage(stderr, "Codex stopped without finishing the turn"),
          });
      }
    } catch (error) {
      finish({
        type: "error",
        code: "codex-exit",
        message: codexErrorMessage(error instanceof Error ? error.message : stderr, "Codex failed to start"),
      });
    } finally {
      for (const slot of pending.values()) slot.reject(new Error("Codex stopped"));
      pending.clear();
      child.kill("SIGTERM");
      if (this.#process === child) this.#process = null;
      this.#stopping = false;
      this.#turnId = null;
    }
  }

  stop(): void {
    const child = this.#process;
    if (!child) return;
    this.#stopping = true;
    /* Ask the turn to stop before killing the daemon: an interrupted turn reports itself, so the
       transcript ends on a cancelled result rather than on a process that vanished. */
    if (this.#sessionId && this.#turnId) {
      child.stdin?.write(`${JSON.stringify({
        jsonrpc: "2.0",
        id: 0,
        method: "turn/interrupt",
        params: { threadId: this.#sessionId, turnId: this.#turnId },
      })}\n`);
      return;
    }
    child.kill("SIGTERM");
  }
}
