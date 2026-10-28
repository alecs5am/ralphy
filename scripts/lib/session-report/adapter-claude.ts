// scripts/lib/session-report/adapter-claude.ts — #562
//
// Claude Code transcript adapter (`~/.claude/projects/<cwd-slug>/*.jsonl` and
// `<session>/subagents/agent-*.jsonl`). Schema notes, learned from real files:
//
// - One API response is split into several `assistant` records (one per
//   content block) that share `message.id` and repeat the same `usage`. Usage
//   is therefore de-duplicated per `message.id`.
// - `usage.input_tokens` is uncached input; cache reads / writes are separate
//   (`cache_read_input_tokens`, `cache_creation_input_tokens`).
// - Tool results arrive as `user` records whose content holds `tool_result`
//   blocks (`tool_use_id`, `is_error`). A non-zero shell exit is `is_error`.
// - Human prompts carry `origin.kind: "human"`; other agents' messages carry
//   `"peer"`; background job completions carry `"task-notification"` with a
//   `<tool-use-id>` tag. Older records have no `origin`: a plain string user
//   message that is not `isMeta` is then treated as a prompt.
// - `isMeta` user records include "Base directory for this skill: <dir>" when
//   a skill is loaded (Skill tool or slash command).
// - `cost-state` records carry the harness's own cumulative cost.

import path from "node:path";
import type { CallEvent, ModelEvent, NormEvent, NormSession, Op, RecordParser, TranscriptAdapter, TokenUsage } from "./types.js";
import { extractReads, extractWrites, resolvePath, shellReadRange, skillFromPath } from "./shell.js";

const MAX_COMMAND = 8000;
const MAX_HEAD = 4000;

type Json = Record<string, any>;

function parseTs(v: unknown): number | undefined {
  if (typeof v !== "string") return undefined;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : undefined;
}

function usageFrom(u: Json | undefined): TokenUsage | undefined {
  if (!u || typeof u !== "object") return undefined;
  return {
    input: Number(u.input_tokens ?? 0) || 0,
    output: Number(u.output_tokens ?? 0) || 0,
    cacheRead: Number(u.cache_read_input_tokens ?? 0) || 0,
    cacheWrite: Number(u.cache_creation_input_tokens ?? 0) || 0,
  };
}

function textOfResult(content: unknown): { text: string; images: number } {
  if (typeof content === "string") return { text: content, images: 0 };
  let text = "";
  let images = 0;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      if (block.type === "text" && typeof block.text === "string") text += (text ? "\n" : "") + block.text;
      else if (block.type === "image") images++;
    }
  }
  return { text, images };
}

function promptText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const first = content.find((b) => b && typeof b === "object" && b.type === "text");
    return typeof first?.text === "string" ? first.text : "";
  }
  return "";
}

/** Derive the single op a Claude Code tool call performs. */
export function claudeOp(name: string, input: Json, cwd: string | undefined, ts: number): Op {
  const base = { tool: name, cwd, startTs: ts };
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  switch (name) {
    case "Bash": {
      const command = str(input.command).slice(0, MAX_COMMAND);
      const reads = extractReads(command, cwd);
      const writes = extractWrites(command, cwd);
      const skillRead = reads.map(skillFromPath).find((s) => s?.isSkillMd);
      return {
        ...base,
        kind: "shell",
        command,
        reads: reads.length ? reads : undefined,
        readRange: reads.length ? shellReadRange(command) : undefined,
        writes: writes.length ? writes : undefined,
        skill: skillRead?.slug,
        background: input.run_in_background === true,
        signature: `Bash ${command.replace(/\s+/g, " ").trim().slice(0, 400)}`,
      };
    }
    case "Read": {
      const file = resolvePath(str(input.file_path), cwd);
      const info = skillFromPath(file);
      const range = `${input.offset ?? 0}:${input.limit ?? "all"}`;
      return {
        ...base,
        kind: "read",
        reads: [file],
        readRange: range,
        skill: info?.isSkillMd ? info.slug : undefined,
        skillRef: info && !info.isSkillMd ? info.slug : undefined,
        unbounded: input.limit === undefined,
        signature: `Read ${file} ${range}`,
      };
    }
    case "Edit":
    case "MultiEdit":
    case "Write":
    case "NotebookEdit": {
      const file = resolvePath(str(input.file_path ?? input.notebook_path), cwd);
      const detail = name === "Write" ? "" : str(input.old_string).slice(0, 200);
      return { ...base, kind: "edit", writes: [file], signature: `${name} ${file} ${detail}` };
    }
    case "Grep":
    case "Glob":
      return { ...base, kind: "search", signature: `${name} ${str(input.pattern)} ${str(input.path)}` };
    case "Skill": {
      const raw = str(input.skill);
      const slug = (raw.includes(":") ? raw.split(":").pop()! : raw).toLowerCase();
      return { ...base, kind: "skill", skill: slug || undefined, signature: `Skill ${raw}` };
    }
    case "Agent":
    case "Task":
      return { ...base, kind: "agent", signature: `${name} ${str(input.description)}` };
    case "WebFetch":
    case "WebSearch":
      return { ...base, kind: "web", signature: `${name} ${str(input.url ?? input.query)}` };
    case "TaskOutput":
    case "BashOutput":
    case "Monitor":
      return { ...base, kind: "wait", signature: `${name} ${JSON.stringify(input).slice(0, 200)}` };
    default:
      if (name.startsWith("mcp__")) {
        return { ...base, kind: "mcp", signature: `${name} ${JSON.stringify(input ?? {}).slice(0, 300)}` };
      }
      return { ...base, kind: "other", signature: `${name} ${JSON.stringify(input ?? {}).slice(0, 300)}` };
  }
}

class ClaudeParser implements RecordParser {
  private events: NormEvent[] = [];
  private models = new Map<string, ModelEvent>();
  private calls = new Map<string, CallEvent>();
  private lastCall: CallEvent | undefined;
  private sessionId = "";
  private agentId: string | undefined;
  private sidechain = false;
  private cwd: string | undefined;
  private cost: number | undefined;
  private compactions = 0;
  badLines = 0;

  constructor(private file: string) {}

  push(record: unknown): void {
    if (!record || typeof record !== "object") return;
    const r = record as Json;
    if (typeof r.sessionId === "string" && !this.sessionId) this.sessionId = r.sessionId;
    if (typeof r.agentId === "string" && !this.agentId) this.agentId = r.agentId;
    if (r.isSidechain === true) this.sidechain = true;
    if (typeof r.cwd === "string" && r.cwd) this.cwd = r.cwd;
    const ts = parseTs(r.timestamp);
    switch (r.type) {
      case "assistant":
        if (ts !== undefined) this.onAssistant(r, ts);
        return;
      case "user":
        if (ts !== undefined) this.onUser(r, ts);
        return;
      case "system":
        if (r.subtype === "compact_boundary") this.compactions++;
        return;
      case "cost-state":
        if (typeof r.totalCostUSD === "number") this.cost = r.totalCostUSD;
        return;
      default:
        return;
    }
  }

  private onAssistant(r: Json, ts: number): void {
    const msg = r.message as Json | undefined;
    if (!msg) return;
    const id = typeof msg.id === "string" ? msg.id : `${r.requestId ?? r.uuid ?? ts}`;
    let model = this.models.get(id);
    if (!model) {
      model = { kind: "model", ts, id, callIds: [], timeline: true };
      this.models.set(id, model);
      this.events.push(model);
    }
    if (msg.model !== "<synthetic>") {
      const usage = usageFrom(msg.usage);
      if (usage) model.usage = usage;
    }
    const content = Array.isArray(msg.content) ? msg.content : [];
    for (const block of content) {
      if (!block || typeof block !== "object" || block.type !== "tool_use") continue;
      const callId = String(block.id ?? `${id}:${model.callIds.length}`);
      if (this.calls.has(callId)) continue;
      const name = String(block.name ?? "unknown");
      const input = (block.input && typeof block.input === "object" ? block.input : {}) as Json;
      const op = claudeOp(name, input, this.cwd, ts);
      const call: CallEvent = { kind: "call", ts, id: callId, name, ops: [op], background: op.background };
      this.calls.set(callId, call);
      model.callIds.push(callId);
      this.events.push(call);
      this.lastCall = call;
    }
  }

  private onUser(r: Json, ts: number): void {
    const msg = r.message as Json | undefined;
    const content = msg?.content;
    if (Array.isArray(content) && content.some((b) => b && typeof b === "object" && b.type === "tool_result")) {
      for (const block of content) {
        if (!block || typeof block !== "object" || block.type !== "tool_result") continue;
        const call = this.calls.get(String(block.tool_use_id));
        if (!call) continue;
        const { text, images } = textOfResult(block.content);
        call.endTs = ts;
        call.isError = block.is_error === true;
        call.outputChars = text.length;
        call.outputImages = images;
        if (/^(Command running in background with ID|Async agent launched)/.test(text)) call.background = true;
        const op = call.ops[0]!;
        op.endTs = ts;
        op.isError = call.isError;
        op.outputChars = text.length;
        op.outputHead = text.slice(0, MAX_HEAD);
        op.background = call.background;
        if (op.kind === "shell") {
          const m = /^Exit code (\d+)/.exec(text);
          op.exitCode = m ? Number(m[1]) : call.isError ? 1 : 0;
        }
      }
      return;
    }
    const text = promptText(content);
    if (r.isMeta === true) {
      const m = /^Base directory for this skill:\s*(\S+)/.exec(text);
      if (m) this.onSkillLoaded(m[1]!.replace(/\/$/, ""), ts);
      return;
    }
    if (r.isCompactSummary === true) return;
    const kind = r.origin?.kind as string | undefined;
    if (kind === "task-notification" || text.startsWith("<task-notification>")) {
      const tid = /<tool-use-id>([^<]+)<\/tool-use-id>/.exec(text)?.[1];
      const launched = tid ? this.calls.get(tid) : undefined;
      if (launched) {
        launched.backgroundEndTs = ts;
        launched.ops[0]!.backgroundEndTs = ts;
      }
      this.events.push({ kind: "notification", ts, callId: launched?.id });
      return;
    }
    if (text.startsWith("[Request interrupted")) {
      this.events.push({ kind: "interrupt", ts });
      return;
    }
    if (kind === "peer") {
      this.events.push({ kind: "prompt", ts, from: "peer" });
      return;
    }
    const isFirstPrompt = !this.events.some((e) => e.kind === "prompt");
    this.events.push({ kind: "prompt", ts, from: this.sidechain && isFirstPrompt ? "task" : "human" });
  }

  private onSkillLoaded(dir: string, ts: number): void {
    const slug = path.posix.basename(dir).toLowerCase();
    const last = this.lastCall;
    if (last && last.ops[0]?.kind === "skill" && ts - last.ts < 60_000) return; // already counted via the Skill tool
    const op: Op = { kind: "skill", tool: "slash-command", skill: slug, startTs: ts, endTs: ts, signature: `Skill ${slug}` };
    const call: CallEvent = { kind: "call", ts, endTs: ts, id: `slash:${ts}:${slug}`, name: "Skill", ops: [op], synthetic: true };
    this.events.push(call);
    this.lastCall = call;
  }

  finish(): NormSession {
    const base = path.basename(this.file, ".jsonl");
    const isSubagent = this.sidechain || base.startsWith("agent-");
    const parent = isSubagent ? this.sessionId || undefined : undefined;
    const ownId = isSubagent ? `${this.sessionId || "unknown"}:${this.agentId ?? base}` : this.sessionId || base;
    return {
      source: "claude",
      file: this.file,
      sessionId: ownId,
      parentSessionId: parent,
      isSubagent,
      cwd: this.cwd,
      events: this.events,
      reportedCostUsd: this.cost,
      compactions: this.compactions,
      badLines: this.badLines,
    };
  }
}

const CLAUDE_TYPES = new Set(["user", "assistant", "attachment", "system", "summary", "file-history-snapshot", "queue-operation", "custom-title", "last-prompt", "api-request", "cost-state", "agent-name"]);

export const claudeAdapter: TranscriptAdapter = {
  source: "claude",
  detect(records) {
    return records.some((r) => {
      if (!r || typeof r !== "object") return false;
      const o = r as Json;
      return (typeof o.sessionId === "string" || typeof o.uuid === "string") && CLAUDE_TYPES.has(String(o.type)) && o.payload === undefined;
    });
  },
  createParser(file) {
    return new ClaudeParser(file);
  },
};
