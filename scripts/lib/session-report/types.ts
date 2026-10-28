// scripts/lib/session-report/types.ts — #562
//
// Normalized session model shared by the transcript adapters (Claude Code,
// Codex) and the analyzers. Adapters translate their native JSONL schema into
// `NormSession`; everything downstream (phase attribution, waste detectors,
// formatting) only ever sees this shape.
//
// Privacy rule: adapters never keep the text of user prompts or assistant
// messages. A prompt is a timestamped boundary, nothing more. Tool inputs keep
// only what the classifiers need (command text, file paths, a short output
// head for error matching), and nothing is written to disk by this tool.

export type TranscriptSource = "claude" | "codex";

/** Normalized token usage. `input` is UNCACHED input, so the four parts sum to processed tokens. */
export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export type OpKind =
  | "shell"
  | "read"
  | "edit"
  | "skill"
  | "search"
  | "web"
  | "mcp"
  | "agent"
  | "wait"
  | "other";

/**
 * One concrete operation. For Claude Code a tool call is exactly one op; for
 * Codex a model-level `exec` cell can run several commands / patches, each of
 * which becomes an op attached to that call.
 */
export interface Op {
  kind: OpKind;
  /** Native tool name (Bash, Read, exec_command, apply_patch, server.tool, ...). */
  tool: string;
  /** Shell command text (truncated) when kind is shell. */
  command?: string;
  /** Files this op read (Read tool, cat/sed/head of a file, Codex parsed reads). */
  reads?: string[];
  /** Files this op wrote (Edit/Write, apply_patch, shell redirection). */
  writes?: string[];
  /** Read window for the Read tool, e.g. "0:all" or "200:100". */
  readRange?: string;
  /** Skill slug when the op loaded a skill (Skill tool or a SKILL.md read). */
  skill?: string;
  /** Skill slug when the op read a file inside a skill directory other than SKILL.md. */
  skillRef?: string;
  /** Working directory the op ran in, when known. */
  cwd?: string;
  exitCode?: number;
  isError?: boolean;
  startTs?: number;
  endTs?: number;
  /** True when the op was launched as a background job (run_in_background, yielded exec cell, async agent). */
  background?: boolean;
  /** Completion time of a background job (task notification), when known. */
  backgroundEndTs?: number;
  /** Model-visible output size in characters (text only; images counted separately). */
  outputChars?: number;
  /** First characters of the output, kept in memory only for error-pattern matching. */
  outputHead?: string;
  /** Short normalized signature used to detect near-identical retries. */
  signature: string;
  /** True when a Read-like op had no explicit limit (used by the large-output heuristic). */
  unbounded?: boolean;
}

export interface PromptEvent {
  kind: "prompt";
  ts: number;
  /** human: typed by the user; peer: another agent's message; task: a subagent's initial task. */
  from: "human" | "peer" | "task";
}

export interface InterruptEvent {
  kind: "interrupt";
  ts: number;
}

export interface ModelEvent {
  kind: "model";
  ts: number;
  id: string;
  usage?: TokenUsage;
  /** Tool calls issued by this response (Claude). Empty for Codex. */
  callIds: string[];
  /** Whether `ts` is a meaningful point on the timeline (Codex token records are not). */
  timeline: boolean;
}

export interface CallEvent {
  kind: "call";
  ts: number;
  endTs?: number;
  id: string;
  name: string;
  ops: Op[];
  isError?: boolean;
  background?: boolean;
  backgroundEndTs?: number;
  outputChars?: number;
  outputImages?: number;
  /** Synthetic calls (e.g. a skill loaded by a slash command) are not counted as tool calls. */
  synthetic?: boolean;
}

export interface NotificationEvent {
  kind: "notification";
  ts: number;
  /** Id of the call whose background job finished, when the transcript says so. */
  callId?: string;
}

/** A timeline-only point (e.g. a Codex agent message completed). */
export interface MarkEvent {
  kind: "mark";
  ts: number;
}

export type NormEvent =
  | PromptEvent
  | InterruptEvent
  | ModelEvent
  | CallEvent
  | NotificationEvent
  | MarkEvent;

export interface NormSession {
  source: TranscriptSource;
  file: string;
  sessionId: string;
  parentSessionId?: string;
  isSubagent: boolean;
  cwd?: string;
  /** Events in transcript order (analyzers sort timeline points themselves). */
  events: NormEvent[];
  /** Cost the harness itself recorded (Claude Code `cost-state`), when present. */
  reportedCostUsd?: number;
  compactions: number;
  /** Lines that failed to parse (truncated trailing writes are common). */
  badLines: number;
}

/** Streaming parser contract every adapter implements. */
export interface RecordParser {
  push(record: unknown): void;
  finish(): NormSession;
}

export interface TranscriptAdapter {
  source: TranscriptSource;
  /** Returns true when the first records of a file look like this adapter's schema. */
  detect(records: unknown[]): boolean;
  createParser(file: string): RecordParser;
}
