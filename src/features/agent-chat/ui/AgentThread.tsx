import { useEffect, useState } from "react";
import { Copy, Pencil, RotateCcw, TriangleAlert } from "lucide-react";
import { bridge } from "@/shared/api/ipc";
import { AgentTaggedText } from "./agent-tags";
import { AgentMark } from "@/shared/ui/AgentMark";
import { MarkdownView } from "@/shared/ui/MarkdownView";
import type { AgentChatEntry } from "../model/chat-state";
import { BLOCK, LINE_ACTION, META } from "./agent-thread-chrome";
import { Chevron, elapsedLabel, FAMILIES, family, ToolGroup, ToolRow } from "./agent-tool-rows";

/**
 * Handoff 17's transcript. Two levels of collapse, and the rule that drives both: fifty bash
 * commands must never render as fifty blocks. A turn's work folds behind one "worked for" row,
 * and inside it homogeneous calls fold into one group that only then opens into rows.
 *
 * The chat is a light surface now -- a white card inside the zone's frame -- so every ink here is
 * the theme family and every surface is a step off the card, never the on-dark pair the rail used
 * to carry.
 *
 * Not built, for want of anything to render: thinking blocks and compaction markers (the harness
 * emits neither), a command's folded output (`tool-result` reports `ok`, not stdout), and the
 * approval and choice renders (there is no approval protocol on the wire -- the mode pill is the
 * whole of what the app can promise today).
 */

export function AgentFailure({ title, text, onRetry }: { title?: string; text: string; onRetry?: () => void }) {
  return <div className="agent-failure flex min-w-0 flex-col rounded-row bg-failure" role="alert">
    <div className="flex h-8 min-w-0 items-center gap-2 pr-1 pl-2.5">
      <TriangleAlert size={12} strokeWidth={2} className="flex-none text-failure-ink" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate type-ui text-ink">{title ?? "The run did not finish"}</span>
      {onRetry && <button
        className="inline-flex h-6 flex-none items-center rounded-full bg-desk-primary px-2.5 type-label text-desk-primary-ink hover:bg-instrument-hover"
        type="button"
        onClick={onRetry}
      >Retry</button>}
    </div>
    <p className="m-0 mx-0.5 mb-0.5 rounded-md bg-card px-2.5 py-1.75 font-code type-mono-sm tracking-mono whitespace-pre-wrap text-failure-ink [overflow-wrap:anywhere]">
      {text} · REPORTED BY PROVIDER
    </p>
  </div>;
}

/* The operator's own turn: a bubble that stops short of the far edge, with its clock and its
   three actions in a row underneath that the pointer reveals. */
function UserTurn({
  entry,
  busy,
  onEdit,
  onRerun,
}: {
  entry: AgentChatEntry;
  busy: boolean;
  onEdit(text: string): void;
  onRerun(text: string): void;
}) {
  const text = entry.text ?? "";
  return <div className="agent-message is-user group flex min-w-0 flex-col items-end gap-0.75">
    {/* The tags the operator attached come back as tags, not as `@unit:hero-cut`: the bubble is the
        same contract the composer wrote, read the other way. */}
    <p className="m-0 max-w-(--agent-bubble-measure) rounded-window bg-desk-primary px-3.5 py-2.5 type-md leading-copy whitespace-pre-wrap text-desk-primary-ink [overflow-wrap:anywhere]">
      <AgentTaggedText text={text} />
    </p>
    {/* Always in the same place, and always the same three: a row that appeared on hover in a
        different position each time would be three different rows. */}
    <div className="agent-message-actions flex flex-none items-center gap-px opacity-0 transition-opacity duration-fast ease-instrument group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none">
      {entry.at > 0 && <time className={`${META} pr-1.25`} dateTime={new Date(entry.at).toISOString()}>
        {new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </time>}
      <button className={LINE_ACTION} type="button" title="Copy" aria-label="Copy message" onClick={() => void bridge.copyText(text)}>
        <Copy size={11} strokeWidth={2} aria-hidden="true" />
      </button>
      <button className={LINE_ACTION} type="button" title="Edit & resend" aria-label="Edit and resend" onClick={() => onEdit(text)}>
        <Pencil size={11} strokeWidth={2} aria-hidden="true" />
      </button>
      <button className={LINE_ACTION} type="button" title="Re-run from here" aria-label="Re-run from here" disabled={busy} onClick={() => onRerun(text)}>
        <RotateCcw size={11} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  </div>;
}

/* A line the agent is on right now: the mark at work, the line shimmering, and the clock. One per
   turn and always last -- everything above it has finished. */
function StreamingRow({ since, tool }: { since: number; tool: AgentChatEntry | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const step = tool ? FAMILIES[family(tool.tool?.name ?? "")]! : null;
  return <div className="agent-streaming flex min-w-0 items-center gap-2.25" aria-live="polite">
    <AgentMark mode="working" size={15} className="text-ink" />
    <span className="agent-streaming-line min-w-0 flex-1 truncate type-base text-secondary">
      {step
        ? <>{step.live} <b className="font-code type-xs font-normal text-ink">{tool!.tool?.summary || tool!.tool?.name}</b></>
        : "Working"}
    </span>
    {since > 0 && <span className={META}>{elapsedLabel(now - since).toLocaleUpperCase()}</span>}
  </div>;
}

/* A turn: the prompt, the work, and the reading the provider closed it with. */
export interface Turn {
  id: number;
  prompt: AgentChatEntry | null;
  work: AgentChatEntry[];
  result: AgentChatEntry | null;
}

export function agentTurns(entries: readonly AgentChatEntry[]): Turn[] {
  const turns: Turn[] = [];
  for (const entry of entries) {
    if (entry.kind === "user" || turns.length === 0) {
      turns.push({ id: entry.id, prompt: entry.kind === "user" ? entry : null, work: [], result: null });
      if (entry.kind === "user") continue;
    }
    const turn = turns.at(-1)!;
    if (entry.kind === "result") turn.result = entry;
    else turn.work.push(entry);
  }
  return turns;
}

/* Consecutive tool calls are one group; anything else stands on its own. This is where the fifty
   commands stop being fifty blocks -- before a single one of them is rendered. */
export type Block =
  | { kind: "prose"; entry: AgentChatEntry }
  | { kind: "error"; entry: AgentChatEntry }
  | { kind: "tools"; entries: AgentChatEntry[] };

export function agentBlocks(work: readonly AgentChatEntry[]): Block[] {
  const out: Block[] = [];
  for (const entry of work) {
    const last = out.at(-1);
    if (entry.kind === "tool") {
      if (last?.kind === "tools") last.entries.push(entry);
      else out.push({ kind: "tools", entries: [entry] });
      continue;
    }
    out.push({ kind: entry.kind === "error" ? "error" : "prose", entry });
  }
  return out;
}

function TurnView({
  turn,
  busy,
  streamingTool,
  onEdit,
  onRerun,
}: {
  turn: Turn;
  busy: boolean;
  streamingTool: AgentChatEntry | null | undefined;
  onEdit(text: string): void;
  onRerun(text: string): void;
}) {
  const [open, setOpen] = useState(true);
  const parts = agentBlocks(turn.work);
  const worked = parts.filter((block) => block.kind !== "prose");
  return <div className={`agent-turn ${BLOCK}`}>
    {turn.prompt && <UserTurn entry={turn.prompt} busy={busy} onEdit={onEdit} onRerun={onRerun} />}
    {/* The first level. It folds the work and not the answer: an operator who collapses a turn is
        putting the tool trail away, and hiding the reply with it would be a different control. */}
    {(worked.length > 0 || turn.result) && <button
      className="agent-turn-summary flex min-w-0 items-center gap-1.75 bg-transparent text-left text-secondary hover:text-ink"
      type="button"
      aria-expanded={open}
      disabled={worked.length === 0}
      onClick={() => setOpen((value) => !value)}
    >
      <span className="min-w-0 truncate type-base">
        {turn.result ? `Worked for ${elapsedLabel(turn.result.run?.durationMs ?? 0)}` : "Working"}
      </span>
      {worked.length > 0 && <Chevron open={open} />}
      <span className="min-w-0 flex-1" aria-hidden="true" />
      {turn.result && turn.result.run!.costUsd > 0 && <span className={META}>
        ${turn.result.run!.costUsd.toFixed(2)} REPORTED BY PROVIDER
      </span>}
    </button>}
    {parts.map((block, index) => {
      if (block.kind === "prose") {
        return <MarkdownView markdown={block.entry.text ?? ""} tone="chat" key={block.entry.id} />;
      }
      if (!open) return null;
      if (block.kind === "error") {
        return <AgentFailure
          text={block.entry.text ?? ""}
          onRetry={turn.prompt && !busy ? () => onRerun(turn.prompt!.text ?? "") : undefined}
          key={block.entry.id}
        />;
      }
      return block.entries.length === 1
        ? <ToolRow entry={block.entries[0]!} key={`tools-${index}`} />
        : <ToolGroup entries={block.entries} key={`tools-${index}`} />;
    })}
    {streamingTool !== undefined && <StreamingRow since={turn.prompt?.at ?? 0} tool={streamingTool} />}
  </div>;
}

export function AgentThread({
  entries,
  busy,
  streamingTool,
  onEdit,
  onRerun,
}: {
  entries: readonly AgentChatEntry[];
  busy: boolean;
  /* The newest tool call while a run is live, or null when the harness has reported none yet. The
     streaming row is absent altogether when nothing is running. */
  streamingTool: AgentChatEntry | null;
  onEdit(text: string): void;
  onRerun(text: string): void;
}) {
  const turns = agentTurns(entries);
  /* The transcript keeps a reading measure however wide the zone is: with the view panel closed the
     chat takes the window, and a 1200px line of prose is not a line. */
  /* The thread states the chat's own type step rather than inheriting the app's 13px base: the
     assistant's copy is markdown, and markdown inherits its size, so this is the one place that
     decides how the transcript reads. */
  return <div className="agent-thread mx-auto flex w-full min-w-0 max-w-agent-thread flex-col gap-4.5 type-md">
    {turns.map((turn, index) => <TurnView
      turn={turn}
      busy={busy}
      streamingTool={busy && index === turns.length - 1 ? streamingTool : undefined}
      onEdit={onEdit}
      onRerun={onRerun}
      key={turn.id}
    />)}
  </div>;
}
