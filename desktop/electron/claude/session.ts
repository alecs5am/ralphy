/**
 * Claude Code session driver.
 *
 * We spawn the user's locally-installed `claude` binary in headless stream-json
 * mode rather than the npm Agent SDK. Rationale (see notes/ideas/009): it is the
 * same Claude Code the user runs in their terminal — same version, same ~/.claude
 * config and MCP servers, and already logged in via their subscription, so usage
 * is covered by the plan's Agent SDK credit with no API key.
 *
 * Protocol: with --output-format stream-json --verbose, each stdout line is a JSON
 * object. We normalize the subset we render (system init, assistant text/tool_use,
 * tool_result, final result) into AgentEvent.
 */
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline";

const pexecFile = promisify(execFile);

export type AgentEvent =
  | { type: "system"; sessionId: string; tools: string[] }
  | { type: "assistant-text"; text: string }
  | { type: "tool-use"; id: string; name: string; summary: string }
  | { type: "tool-result"; id: string; ok: boolean }
  | { type: "result"; ok: boolean; costUsd: number };

export interface SessionOptions {
  projectDir: string;
  /** When true (subscription auth), strip ANTHROPIC_API_KEY so the binary uses
   *  the subscription login instead of silently billing pay-per-token. */
  preferSubscription: boolean;
  onEvent: (e: AgentEvent) => void;
}

export async function detectClaude(): Promise<{ ready: boolean; version?: string; apiKeyInEnv: boolean }> {
  const apiKeyInEnv = Boolean(process.env.ANTHROPIC_API_KEY);
  try {
    const { stdout } = await pexecFile("claude", ["--version"]);
    return { ready: true, version: stdout.trim(), apiKeyInEnv };
  } catch {
    return { ready: false, apiKeyInEnv };
  }
}

export class ClaudeSession {
  private proc: ChildProcess | null = null;
  private sessionId: string | null = null;

  constructor(private opts: SessionOptions) {}

  /** Send one user turn. Resumes the prior session so context carries over. */
  async send(prompt: string): Promise<void> {
    const args = [
      "-p", prompt,
      "--output-format", "stream-json",
      "--verbose",
      // default: read-only tools run, anything risky (Bash/Edit/Write) is denied
      // in headless mode — so no paid `ralphy generate` fires during a basic test.
      "--permission-mode", "default",
      ...(this.sessionId ? ["--resume", this.sessionId] : []),
    ];

    const env = { ...process.env };
    if (this.opts.preferSubscription) delete env.ANTHROPIC_API_KEY;

    const proc = spawn("claude", args, { cwd: this.opts.projectDir, env });
    this.proc = proc;

    proc.stderr?.on("data", (b: Buffer) => console.error("[claude]", b.toString()));
    proc.on("error", (err) => {
      this.opts.onEvent({ type: "assistant-text", text: `Failed to launch \`claude\`: ${err.message}` });
      this.opts.onEvent({ type: "result", ok: false, costUsd: 0 });
    });

    if (!proc.stdout) return;
    const rl = createInterface({ input: proc.stdout });
    for await (const line of rl) {
      if (line.trim()) this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(line); } catch { return; }

    if (msg.type === "system" && msg.subtype === "init") {
      this.sessionId = String(msg.session_id ?? "");
      this.opts.onEvent({ type: "system", sessionId: this.sessionId, tools: (msg.tools as string[]) ?? [] });
      return;
    }

    if (msg.type === "assistant") {
      const content = (msg.message as { content?: ContentBlock[] })?.content ?? [];
      for (const block of content) {
        if (block.type === "text" && block.text) {
          this.opts.onEvent({ type: "assistant-text", text: block.text });
        } else if (block.type === "tool_use") {
          this.opts.onEvent({ type: "tool-use", id: String(block.id ?? ""), name: block.name ?? "tool", summary: summarize(block) });
        }
      }
      return;
    }

    if (msg.type === "user") {
      const content = (msg.message as { content?: ContentBlock[] })?.content ?? [];
      for (const block of content) {
        if (block.type === "tool_result") {
          this.opts.onEvent({ type: "tool-result", id: String(block.tool_use_id ?? ""), ok: !block.is_error });
        }
      }
      return;
    }

    if (msg.type === "result") {
      this.opts.onEvent({ type: "result", ok: msg.subtype === "success", costUsd: Number(msg.total_cost_usd ?? 0) });
    }
  }

  stop(): void {
    this.proc?.kill();
    this.proc = null;
  }
}

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: { command?: string; file_path?: string; pattern?: string };
  tool_use_id?: string;
  is_error?: boolean;
}

function summarize(block: ContentBlock): string {
  const i = block.input ?? {};
  return i.command ?? i.file_path ?? i.pattern ?? "";
}
