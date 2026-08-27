import { useEffect, useState } from "react";
import {
  Copy,
  FilePen,
  FileText,
  Globe,
  ListChecks,
  Pencil,
  RotateCcw,
  Search,
  Terminal,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { bridge } from "@/shared/api/ipc";
import { AgentTaggedText } from "./AgentComposer";
import { AgentMark } from "@/shared/ui/AgentMark";
import { MarkdownView } from "@/shared/ui/MarkdownView";
import type { AgentChatEntry } from "../model/useAgentChat";

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

/* Air between blocks, and the two indents the transcript uses. */
const BLOCK = "flex min-w-0 flex-col gap-3.25";
/* A mono meta run: a counter, a scope, an account line. The design's muted grey is #9A9A96, which
   measures 2.6:1 on the card -- fine for a dot, not for a 9px run of text that says how many calls
   failed. Informational meta takes the secondary step instead, which is the same one place in the
   hierarchy and passes at 5:1 in both themes. */
const META = "flex-none font-code type-mono-xs tracking-mono text-secondary";
/* An instrument beside a line of copy: 22 square, quiet until the line is hovered. */
const LINE_ACTION = "grid size-5.5 flex-none place-items-center rounded-sm bg-transparent text-muted-decorative hover:bg-chat-field hover:text-ink";

/* What a tool call is, as far as the transcript can tell: the harness reports a name and a
   one-line summary, so the family comes from the name and the argument is the summary. */
interface ToolFamily {
  icon: LucideIcon;
  /* The verb a detail row leads with -- it takes the argument directly, as in "Searched <pattern>". */
  verb: string;
  /* The noun a group counts, and the verb that counts it where the row's own verb cannot: a group
     says "ran a search", a row says "Searched heartbeat|watchdog". */
  noun: string;
  countVerb?: string;
  /* The streaming row is about a call that has not finished, so it takes the present participle:
     a live line reading "Ran" is a line about the past. */
  live: string;
}
const FAMILIES: Record<string, ToolFamily> = {
  command: { icon: Terminal, verb: "Ran", noun: "command", live: "Running" },
  read: { icon: FileText, verb: "Read", noun: "file", live: "Reading" },
  edit: { icon: FilePen, verb: "Edited", noun: "file", live: "Editing" },
  search: { icon: Search, verb: "Searched", noun: "search", countVerb: "Ran", live: "Searching" },
  web: { icon: Globe, verb: "Fetched", noun: "page", live: "Fetching" },
  plan: { icon: ListChecks, verb: "Updated", noun: "plan", live: "Updating" },
  tool: { icon: Wrench, verb: "Called", noun: "tool", live: "Calling" },
};

function family(name: string): keyof typeof FAMILIES {
  const id = name.toLocaleLowerCase();
  if (/^(?:bash|shell|run|exec|terminal)/.test(id)) return "command";
  if (/^(?:read|view|open|cat|notebookread)/.test(id)) return "read";
  if (/^(?:write|edit|multiedit|apply|patch|notebookedit)/.test(id)) return "edit";
  if (/^(?:grep|glob|search|find|ls)/.test(id)) return "search";
  if (/^(?:web|fetch|browse|curl)/.test(id)) return "web";
  if (/^(?:todo|plan)/.test(id)) return "plan";
  return "tool";
}

/* One call's reading. Where the handoff prints an exit code or a line count there is nothing on the
   wire to print, so the status is what the row can honestly say. */
function rowMeta(entry: AgentChatEntry): string {
  return (entry.tool?.status === "failed" ? "failed" : entry.tool?.status === "running" ? "running" : "done")
    .toLocaleUpperCase();
}

/* `48 DONE · 2 FAILED`, and nothing the harness does not report: there is no exit code and no
   per-call duration on the wire, so the group's meta counts statuses instead of inventing them. */
export function groupMeta(entries: readonly AgentChatEntry[]): string {
  const failed = entries.filter(({ tool }) => tool?.status === "failed").length;
  const running = entries.filter(({ tool }) => tool?.status === "running").length;
  const done = entries.length - failed - running;
  return [
    done > 0 ? `${done} DONE` : null,
    failed > 0 ? `${failed} FAILED` : null,
    running > 0 ? `${running} RUNNING` : null,
  ].filter(Boolean).join(" · ");
}

/* "Ran 50 commands", "Read 4 files, ran a command" -- the handoff's own copy, built from what the
   group actually holds rather than from a fixed string. */
export function groupLabel(entries: readonly AgentChatEntry[]): string {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = family(entry.tool?.name ?? "");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const phrases = [...counts].sort((left, right) => right[1] - left[1]).map(([key, count]) => {
    const step = FAMILIES[key]!;
    const noun = count === 1 ? `a ${step.noun}` : `${count} ${step.noun}s`;
    return `${(step.countVerb ?? step.verb).toLocaleLowerCase()} ${noun}`;
  });
  const label = phrases.join(", ");
  return label.charAt(0).toLocaleUpperCase() + label.slice(1);
}

export function elapsedLabel(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/* One tool call, on its own: the window row -- a 32 container, its family's glyph, the argument in
   mono, and the status where an exit code would be. */
function ToolRow({ entry }: { entry: AgentChatEntry }) {
  const step = FAMILIES[family(entry.tool?.name ?? "")]!;
  const Icon = step.icon;
  const failed = entry.tool?.status === "failed";
  return <div className={`agent-tool-row is-${entry.tool?.status ?? "complete"} flex h-8 min-w-0 items-center gap-2 rounded-row px-2.5 ${failed ? "bg-failure" : "bg-chat-field"}`}>
    <Icon size={12} strokeWidth={1.9} className={`flex-none ${failed ? "text-failure-ink" : "text-secondary"}`} aria-hidden="true" />
    <span className="min-w-0 flex-1 truncate font-code type-xs text-ink" title={entry.tool?.summary || entry.tool?.name}>
      {entry.tool?.summary || entry.tool?.name}
    </span>
    <span className={`${META} ${failed ? "text-failure-ink" : ""}`}>{rowMeta(entry)}</span>
  </div>;
}

/* Many calls, folded: the second level. The group row is the only thing on screen until it is
   opened, and what it opens into is rows -- never a block per call. */
function ToolGroup({ entries }: { entries: readonly AgentChatEntry[] }) {
  const [open, setOpen] = useState(false);
  const step = FAMILIES[family(entries[0]?.tool?.name ?? "")]!;
  const Icon = step.icon;
  return <div className="agent-tool-group flex min-w-0 flex-col gap-1.25">
    <button
      className="agent-tool-group-row flex min-w-0 items-center gap-2 bg-transparent text-left text-ink"
      type="button"
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
    >
      <Icon size={13} strokeWidth={1.8} className="flex-none text-secondary" aria-hidden="true" />
      <span className="min-w-0 truncate type-ui">{groupLabel(entries)}</span>
      <Chevron open={open} />
      <span className={META}>{groupMeta(entries)}</span>
    </button>
    {open && <div className="agent-tool-detail flex min-w-0 flex-col gap-px pl-5.25">
      {entries.map((entry) => {
        const detail = FAMILIES[family(entry.tool?.name ?? "")]!;
        const DetailIcon = detail.icon;
        return <span
          className="grid h-6 min-w-0 grid-cols-(--agent-detail-columns) items-center gap-2 rounded-sm px-1.5 hover:bg-row-hover"
          key={entry.id}
        >
          <DetailIcon size={13} strokeWidth={1.8} className="text-muted-decorative" aria-hidden="true" />
          <span className="min-w-0 truncate type-sm text-muted">
            {detail.verb}{" "}
            <b className="font-code type-xs font-normal text-ink">{entry.tool?.summary || entry.tool?.name}</b>
          </span>
          <span className={META}>{rowMeta(entry)}</span>
        </span>;
      })}
    </div>}
  </div>;
}

/* Down is expanded, right is collapsed -- one glyph rotated rather than two icons, so the two
   states cannot drift apart. */
function Chevron({ open }: { open: boolean }) {
  return <svg
    className={`agent-chevron flex-none text-muted-decorative transition-transform duration-fast ease-instrument motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
    width={11}
    height={11}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m9 6 6 6-6 6" />
  </svg>;
}

/* The failure window: the one render in 2c the wire can fill. The title is primary ink on the
   tint and the provider's own words go in the white inset, because "reported by provider" is the
   difference between our error and theirs. */
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
