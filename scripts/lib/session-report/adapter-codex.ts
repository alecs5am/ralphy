// scripts/lib/session-report/adapter-codex.ts — #562
//
// Codex rollout adapter (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`).
// Every record is `{ timestamp, type, payload }`. Schema notes, learned from
// real files:
//
// - `session_meta` carries the session id, cwd and `thread_source`
//   ("subagent" sessions name their parent in `source.subagent.thread_spawn`).
// - Model-level tool calls are `response_item` `custom_tool_call` (the `exec`
//   JavaScript cell) and `function_call` (wait, sleep, spawn_agent, MCP, ...),
//   each closed by a `*_output` record with the same `call_id`.
// - The concrete operations inside a call arrive as `event_msg`
//   `item_completed` items: CommandExecution (command, parsed reads, exit
//   code, start/end ms), FileChange (patched paths), McpToolCall, Extension
//   (web search), ImageView, SubAgentActivity. They are attached as ops to the
//   call with the same id, else to the most recent open call.
// - `token_usage_record.usage` is per response: `input_tokens` INCLUDES
//   `cached_input_tokens`, so uncached input is the difference.
//   `event_msg.token_count` (cumulative) is the fallback when no usage record
//   exists.
// - Human prompts are `item_completed` UserMessage items.

import type { CallEvent, NormEvent, NormSession, Op, RecordParser, TranscriptAdapter, TokenUsage } from "./types.js";
import { extractReads, extractWrites, resolvePath, shellReadRange, skillFromPath } from "./shell.js";

const MAX_COMMAND = 8000;
const MAX_HEAD = 4000;
/** Codex functions that block the turn until something else finishes. */
const WAIT_CALLS = new Set(["wait", "sleep", "wait_agent"]);

type Json = Record<string, any>;

function parseTs(v: unknown): number | undefined {
  if (typeof v !== "string") return undefined;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : undefined;
}

export function codexUsage(u: Json | undefined): TokenUsage | undefined {
  if (!u || typeof u !== "object") return undefined;
  const input = Number(u.input_tokens ?? 0) || 0;
  const cached = Number(u.cached_input_tokens ?? 0) || 0;
  return {
    input: Math.max(0, input - cached),
    output: Number(u.output_tokens ?? 0) || 0,
    cacheRead: cached,
    cacheWrite: Number(u.cache_write_input_tokens ?? 0) || 0,
  };
}

function outputText(output: unknown): { text: string; images: number } {
  if (typeof output === "string") return { text: output, images: 0 };
  let text = "";
  let images = 0;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      if (typeof item.text === "string") text += (text ? "\n" : "") + item.text;
      else if (item.type === "input_image" || item.type === "image") images++;
    }
  } else if (output && typeof output === "object") {
    const o = output as Json;
    if (typeof o.content === "string") text = o.content;
    else if (typeof o.output === "string") text = o.output;
  }
  return { text, images };
}

function stripFileUrl(v: unknown): string | undefined {
  return typeof v === "string" && v ? v.replace(/^file:\/\//, "") : undefined;
}

class CodexParser implements RecordParser {
  private events: NormEvent[] = [];
  private calls = new Map<string, CallEvent>();
  private open: CallEvent[] = [];
  private seenResponses = new Set<string>();
  private sessionId = "";
  private parent: string | undefined;
  private subagent = false;
  private cwd: string | undefined;
  private compactions = 0;
  private sawUserMessage = false;
  private fallbackPrompts: number[] = [];
  private fallbackUsage: { ts: number; usage: TokenUsage }[] = [];
  private lastTotal = "";
  private spawnByThread = new Map<string, string>();
  private argsById = new Map<string, string>();
  private lastYielded: CallEvent | undefined;
  private seq = 0;

  constructor(private file: string) {}

  push(record: unknown): void {
    if (!record || typeof record !== "object") return;
    const r = record as Json;
    const ts = parseTs(r.timestamp);
    const p = (r.payload ?? {}) as Json;
    if (ts === undefined) return;
    switch (r.type) {
      case "session_meta":
        this.onMeta(p);
        return;
      case "turn_context":
        if (typeof p.cwd === "string") this.cwd = p.cwd;
        return;
      case "token_usage_record": {
        const id = String(p.response_id ?? `usage-${this.seq++}`);
        if (this.seenResponses.has(id)) return;
        this.seenResponses.add(id);
        this.events.push({ kind: "model", ts, id, usage: codexUsage(p.usage), callIds: [], timeline: false });
        return;
      }
      case "compacted":
        this.compactions++;
        return;
      case "response_item":
        this.onResponseItem(p, ts);
        return;
      case "event_msg":
        this.onEventMsg(p, ts);
        return;
      default:
        return;
    }
  }

  private onMeta(p: Json): void {
    if (typeof p.id === "string") this.sessionId = p.id;
    if (typeof p.cwd === "string") this.cwd = p.cwd;
    if (p.thread_source === "subagent") this.subagent = true;
    const spawn = p.source?.subagent?.thread_spawn;
    if (spawn && typeof spawn.parent_thread_id === "string") {
      this.subagent = true;
      this.parent = spawn.parent_thread_id;
    }
  }

  private newCall(id: string, name: string, ts: number): CallEvent {
    const call: CallEvent = { kind: "call", ts, id, name, ops: [] };
    this.calls.set(id, call);
    this.open.push(call);
    this.events.push(call);
    return call;
  }

  private closeCall(id: string, ts: number, output: unknown, failed: boolean): void {
    const call = this.calls.get(id);
    if (!call) return;
    const { text, images } = outputText(output);
    call.endTs = ts;
    call.outputChars = text.length;
    call.outputImages = images;
    if (failed || /^Script failed/.test(text)) call.isError = true;
    if (/^Script running with cell ID/.test(text)) {
      call.background = true;
      this.lastYielded = call;
    }
    this.open = this.open.filter((c) => c !== call);
    for (const op of call.ops) {
      if (op.kind !== "wait" || op.endTs !== undefined) continue;
      op.endTs = ts;
      op.outputChars = text.length;
    }
    // Calls without inner ops (spawn_agent, send_message, an exec cell that only yielded, ...) get one op.
    if (call.ops.length === 0) {
      call.ops.push({
        kind: call.name.includes("spawn_agent") ? "agent" : "other",
        tool: call.name,
        startTs: call.ts,
        endTs: ts,
        isError: call.isError,
        outputChars: text.length,
        outputHead: text.slice(0, MAX_HEAD),
        signature: `${call.name} ${this.argsById.get(call.id) ?? ""}`.slice(0, 400),
      });
    }
  }

  private onResponseItem(p: Json, ts: number): void {
    switch (p.type) {
      case "custom_tool_call": {
        const id = String(p.call_id ?? p.id ?? `ctc-${this.seq++}`);
        if (!this.calls.has(id)) this.newCall(id, String(p.name ?? "custom"), ts);
        return;
      }
      case "function_call": {
        const id = String(p.call_id ?? p.id ?? `fc-${this.seq++}`);
        if (this.calls.has(id)) return;
        const name = p.namespace && !String(p.namespace).startsWith("mcp__") ? `${p.namespace}.${p.name}` : String(p.name ?? "function");
        const call = this.newCall(id, name, ts);
        const argText = typeof p.arguments === "string" ? p.arguments.slice(0, 300) : "";
        this.argsById.set(id, argText);
        if (WAIT_CALLS.has(String(p.name))) {
          call.ops.push({ kind: "wait", tool: String(p.name), startTs: ts, signature: `${p.name} ${argText}` });
        }
        // Legacy schema: shell commands issued directly as function calls.
        if (["shell", "exec_command", "local_shell", "container.exec"].includes(String(p.name))) {
          let args: Json = {};
          try {
            args = JSON.parse(String(p.arguments ?? "{}"));
          } catch {
            args = {};
          }
          const raw = args.cmd ?? args.command;
          const command = Array.isArray(raw) ? String(raw[raw.length - 1] ?? "") : String(raw ?? "");
          if (command) call.ops.push(this.shellOp(command, args.workdir ?? this.cwd, ts, undefined, undefined));
        }
        return;
      }
      case "local_shell_call": {
        const id = String(p.call_id ?? p.id ?? `lsc-${this.seq++}`);
        const call = this.newCall(id, "local_shell", ts);
        const raw = p.action?.command;
        const command = Array.isArray(raw) ? String(raw[raw.length - 1] ?? "") : String(raw ?? "");
        if (command) call.ops.push(this.shellOp(command, p.action?.working_directory ?? this.cwd, ts, undefined, undefined));
        return;
      }
      case "custom_tool_call_output":
      case "function_call_output":
      case "local_shell_call_output":
        this.closeCall(String(p.call_id ?? ""), ts, p.output, p.success === false);
        return;
      case "message":
        if (p.role === "user") {
          const first = Array.isArray(p.content) ? p.content.find((c: Json) => typeof c?.text === "string")?.text : undefined;
          if (typeof first === "string" && !first.trimStart().startsWith("<")) this.fallbackPrompts.push(ts);
        }
        return;
      case "agent_message":
        // A message from another agent thread (e.g. a subagent reporting back).
        this.events.push({ kind: "notification", ts });
        return;
      default:
        return;
    }
  }

  private shellOp(command: string, cwd: string | undefined, ts: number, endTs: number | undefined, item: Json | undefined): Op {
    const cmd = command.slice(0, MAX_COMMAND);
    const dir = stripFileUrl(cwd) ?? this.cwd;
    const parsedReads: string[] = [];
    if (item && Array.isArray(item.parsed_cmd)) {
      for (const pc of item.parsed_cmd) {
        if (pc?.type === "read" && typeof pc.path === "string") parsedReads.push(resolvePath(pc.path, dir));
      }
    }
    const reads = parsedReads.length ? parsedReads : extractReads(cmd, dir);
    const writes = extractWrites(cmd, dir);
    const skill = reads.map(skillFromPath).find((s) => s?.isSkillMd)?.slug;
    const skillRef = skill ? undefined : reads.map(skillFromPath).find((s) => s && !s.isSkillMd)?.slug;
    const output = typeof item?.aggregated_output === "string" ? item.aggregated_output : "";
    const exit = typeof item?.exit_code === "number" ? item.exit_code : undefined;
    return {
      kind: "shell",
      tool: "exec_command",
      command: cmd,
      reads: reads.length ? reads : undefined,
      readRange: reads.length ? shellReadRange(cmd) : undefined,
      writes: writes.length ? writes : undefined,
      skill,
      skillRef,
      cwd: dir,
      exitCode: exit,
      isError: (exit !== undefined && exit !== 0) || item?.status === "failed" || item?.status === "declined",
      startTs: ts,
      endTs,
      outputChars: output.length,
      outputHead: output.slice(0, MAX_HEAD),
      signature: `Bash ${cmd.replace(/\s+/g, " ").trim().slice(0, 400)}`,
    };
  }

  private attach(op: Op, itemId: string | undefined, ts: number, standaloneName: string): void {
    let call = itemId ? this.calls.get(itemId) : undefined;
    if (!call) call = this.open[this.open.length - 1];
    // A command that outlived its yielded exec cell completes while no call is open.
    if (!call && op.kind === "shell") call = this.lastYielded;
    if (!call) {
      call = this.newCall(itemId ?? `op-${this.seq++}`, standaloneName, op.startTs ?? ts);
      call.endTs = op.endTs ?? ts;
      this.open = this.open.filter((c) => c !== call);
    }
    call.ops.push(op);
  }

  private onEventMsg(p: Json, ts: number): void {
    switch (p.type) {
      case "item_completed":
        this.onItem(p.item ?? {}, p, ts);
        return;
      case "task_complete":
        this.events.push({ kind: "mark", ts });
        return;
      case "turn_aborted":
        this.events.push({ kind: "interrupt", ts });
        return;
      case "token_count": {
        const last = p.info?.last_token_usage;
        const total = JSON.stringify(p.info?.total_token_usage ?? null);
        if (last && total !== this.lastTotal) {
          this.lastTotal = total;
          const usage = codexUsage(last);
          if (usage) this.fallbackUsage.push({ ts, usage });
        }
        return;
      }
      default:
        return;
    }
  }

  private onItem(item: Json, p: Json, ts: number): void {
    const start = typeof p.started_at_ms === "number" ? p.started_at_ms : ts;
    const end = typeof p.completed_at_ms === "number" ? p.completed_at_ms : ts;
    const id = typeof item.id === "string" ? item.id : undefined;
    switch (item.type) {
      case "UserMessage":
        this.sawUserMessage = true;
        this.events.push({ kind: "prompt", ts: start, from: "human" });
        return;
      case "AgentMessage":
        this.events.push({ kind: "mark", ts: end });
        return;
      case "CommandExecution": {
        const raw = item.command;
        const command = Array.isArray(raw) ? String(raw[raw.length - 1] ?? "") : String(raw ?? "");
        this.attach(this.shellOp(command, item.cwd, start, end, item), id, ts, "exec_command");
        return;
      }
      case "FileChange": {
        const writes = Object.keys(item.changes ?? {}).map((f) => resolvePath(f, this.cwd));
        this.attach(
          {
            kind: "edit",
            tool: "apply_patch",
            writes,
            startTs: start,
            endTs: end,
            isError: item.status === "failed",
            signature: `apply_patch ${writes.join(" ")}`,
          },
          id,
          ts,
          "apply_patch",
        );
        return;
      }
      case "McpToolCall": {
        const name = `${item.server ?? "mcp"}.${item.tool ?? "tool"}`;
        const res = outputText(item.result?.content);
        this.attach(
          {
            kind: "mcp",
            tool: name,
            startTs: start,
            endTs: end,
            isError: item.result?.isError === true || item.status === "failed",
            outputChars: res.text.length,
            signature: `${name} ${JSON.stringify(item.arguments ?? {}).slice(0, 300)}`,
          },
          id,
          ts,
          name,
        );
        return;
      }
      case "Extension":
      case "WebSearch": {
        const name = String(item.kind ?? "web.search");
        this.attach({ kind: "web", tool: name, startTs: start, endTs: end, signature: `${name} ${String(item.query ?? "").slice(0, 200)}` }, id, ts, name);
        return;
      }
      case "ImageView": {
        const file = stripFileUrl(item.path);
        this.attach(
          { kind: "read", tool: "view_image", reads: file ? [file] : undefined, startTs: start, endTs: end, signature: `view_image ${file ?? ""}` },
          id,
          ts,
          "view_image",
        );
        return;
      }
      case "SubAgentActivity": {
        const thread = typeof item.agent_thread_id === "string" ? item.agent_thread_id : undefined;
        if (item.kind === "started") {
          const call = id ? this.calls.get(id) : undefined;
          if (call) call.background = true;
          if (thread && call) this.spawnByThread.set(thread, call.id);
        } else if (item.kind === "completed") {
          const callId = thread ? this.spawnByThread.get(thread) : undefined;
          const call = callId ? this.calls.get(callId) : undefined;
          if (call) call.backgroundEndTs = end;
          this.events.push({ kind: "notification", ts: end, callId });
        }
        return;
      }
      case "ContextCompaction":
        this.compactions++;
        return;
      default:
        return;
    }
  }

  finish(): NormSession {
    if (!this.sawUserMessage) {
      for (const ts of this.fallbackPrompts) this.events.push({ kind: "prompt", ts, from: "human" });
    }
    if (!this.events.some((e) => e.kind === "model")) {
      for (const { ts, usage } of this.fallbackUsage) this.events.push({ kind: "model", ts, id: `tc-${ts}`, usage, callIds: [], timeline: false });
    }
    if (this.subagent) {
      const first = this.events.find((e) => e.kind === "prompt");
      if (first && first.kind === "prompt") first.from = "task";
    }
    for (const call of this.calls.values()) {
      if (call.ops.some((o) => o.isError)) call.isError = call.isError ?? true;
      if (call.background) for (const o of call.ops) o.background = true;
      if (call.backgroundEndTs) for (const o of call.ops) o.backgroundEndTs = o.backgroundEndTs ?? call.backgroundEndTs;
    }
    // A forked thread's file is named `<parent-id>_<fork-id>.jsonl` and its session_meta
    // repeats the parent id; the fork id keeps the two sessions distinct.
    const fork = /_([0-9a-f]{8}-[0-9a-f-]{27,})\.jsonl$/.exec(this.file)?.[1];
    return {
      source: "codex",
      file: this.file,
      sessionId: fork ?? (this.sessionId || this.file),
      parentSessionId: this.parent,
      isSubagent: this.subagent,
      cwd: this.cwd,
      events: this.events,
      compactions: this.compactions,
      badLines: 0,
    };
  }
}

const CODEX_TYPES = new Set(["session_meta", "response_item", "event_msg", "turn_context", "token_usage_record", "compacted", "world_state"]);

export const codexAdapter: TranscriptAdapter = {
  source: "codex",
  detect(records) {
    return records.some((r) => r && typeof r === "object" && CODEX_TYPES.has(String((r as Json).type)) && (r as Json).payload !== undefined);
  },
  createParser(file) {
    return new CodexParser(file);
  },
};
