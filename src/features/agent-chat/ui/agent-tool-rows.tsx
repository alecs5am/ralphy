/**
 * A turn's work, as rows: what a tool call is called, what it touched, and how a run of them
 * collapses into one line the reader can open.
 *
 * The families are the vocabulary -- read, write, search, run, agent -- and every provider's own
 * tool names map onto them, so the thread never prints a name only that provider uses. A group
 * states its own duration and count while it is closed, which is what makes it safe to close by
 * default: nothing is hidden that the reader has not been told the size of.
 */
import { useState } from "react";
import {
  FilePen,
  FileText,
  Globe,
  ListChecks,
  Search,
  Terminal,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { AgentChatEntry } from "../model/chat-state";
import { META } from "./agent-thread-chrome";

/* An instrument beside a line of copy: 22 square, quiet until the line is hovered. */

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
export const FAMILIES: Record<string, ToolFamily> = {
  command: { icon: Terminal, verb: "Ran", noun: "command", live: "Running" },
  read: { icon: FileText, verb: "Read", noun: "file", live: "Reading" },
  edit: { icon: FilePen, verb: "Edited", noun: "file", live: "Editing" },
  search: { icon: Search, verb: "Searched", noun: "search", countVerb: "Ran", live: "Searching" },
  web: { icon: Globe, verb: "Fetched", noun: "page", live: "Fetching" },
  plan: { icon: ListChecks, verb: "Updated", noun: "plan", live: "Updating" },
  tool: { icon: Wrench, verb: "Called", noun: "tool", live: "Calling" },
};

export function family(name: string): keyof typeof FAMILIES {
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
export function rowMeta(entry: AgentChatEntry): string {
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
export function ToolRow({ entry }: { entry: AgentChatEntry }) {
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
export function ToolGroup({ entries }: { entries: readonly AgentChatEntry[] }) {
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
export function Chevron({ open }: { open: boolean }) {
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
