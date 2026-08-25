import { ChevronDown } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";

import type { ContextBlockDto, ContextRail } from "../../../electron/agent/context-document";
import { MarkdownView } from "../../components/MarkdownView";

/**
 * The prompt, as a document: one scroll of blocks in the order the turn carries them, each with a
 * rail beside it saying how it gets there.
 *
 * The rail is the grammar. A solid bar rides every turn and the order on the page is the order in
 * the prompt. A dashed bar may be pulled in -- a playbook an instruction names, a document the agent
 * can ask for -- and its cost lands on the turn that asks. The provider's own prompt has no block:
 * it is unreadable and unchangeable, so it gets the one line above the scroll and nothing more.
 *
 * The filter dims rather than hides, and a collapsed block still shows its header, because the one
 * thing this page must never do is imply that something is not being sent. Nothing is removed from
 * the scroll; order never lies.
 */

const MONO = "font-code tracking-caps";
const META = `${MONO} type-mono-2xs text-muted`;
const TITLE = `${MONO} type-mono-sm text-ink select-text`;
const NUMBER = "font-display font-extrabold tracking-normal text-ink";
const SEGMENT = "inline-flex h-6 items-center rounded-control px-2.5 type-label";
const CONTROL = "inline-flex h-6.5 flex-none items-center gap-1.5 rounded-control bg-card px-2.75 type-label text-ink hover:bg-chip";

/* Solid: guaranteed. Dashed: may load. */
const RAIL: Record<ContextRail, string> = {
  solid: "w-0.75 bg-ink",
  dashed: "w-0.75 bg-[repeating-linear-gradient(180deg,var(--color-muted-decorative)_0_5px,transparent_5px_9px)]",
};

export type ContextFilter = "all" | "always" | "demand";

function bytes(value: number | null): string {
  if (value === null) return "—";
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  return kb < 100 ? `${kb.toFixed(1)} KB` : `${Math.round(kb)} KB`;
}

/** Raw mode draws the text itself, so the places it names can be buttons inside it. */
function decorated(text: string, paths: readonly string[], onPath: (path: string) => void): ReactNode {
  const ordered = [...paths].sort((first, second) => second.length - first.length);
  if (ordered.length === 0) return text;
  const out: ReactNode[] = [];
  let cursor = 0;
  let index = 0;
  for (;;) {
    const hit = ordered
      .map((path) => ({ path, at: text.indexOf(path, cursor) }))
      .filter(({ at }) => at >= 0)
      .sort((first, second) => first.at - second.at || second.path.length - first.path.length)[0];
    if (!hit) break;
    if (hit.at > cursor) out.push(<Fragment key={`t${index}`}>{text.slice(cursor, hit.at)}</Fragment>);
    out.push(
      <button
        className="context-path rounded-chip px-0.25 text-ink underline decoration-dotted decoration-muted-decorative underline-offset-2 hover:bg-field"
        type="button"
        key={`p${index}`}
        onClick={() => onPath(hit.path)}
      >{hit.path}</button>,
    );
    cursor = hit.at + hit.path.length;
    index += 1;
  }
  if (out.length === 0) return text;
  if (cursor < text.length) out.push(<Fragment key={`t${index}`}>{text.slice(cursor)}</Fragment>);
  return out;
}

/**
 * A placeholder an instruction file writes as `<repo>` is markup to a markdown renderer, which
 * drops the tag and with it the whole point: that the instruction names something unresolvable.
 * Wrapping it in a code span keeps the literal text and marks it as the placeholder it is.
 */
function literalPlaceholders(text: string): string {
  return text.replace(/(?<!`)<([a-z][\w-]{0,30})>(?!`)/gi, "`<$1>`");
}

/* An instruction file is hundreds of lines and there are nine blocks, so an open block shows its
   head and says how much more there is. The whole text is here either way -- the second step is
   about how much of it is on screen, never about what was sent. */
const PEEK_LINES = 16;

function Block({ block, open, dim, flash, rendered, first, onToggle, onPath }: {
  first: boolean;
  block: ContextBlockDto;
  open: boolean;
  dim: boolean;
  flash: boolean;
  rendered: boolean;
  onToggle(): void;
  onPath(path: string): void;
}) {
  const [whole, setWhole] = useState(false);
  const child = block.linkedFrom !== null && block.onDemand;
  const readable = block.body !== null;
  const lines = readable ? block.body!.split("\n") : [];
  const hidden = whole ? 0 : Math.max(0, lines.length - PEEK_LINES);
  const shown = hidden > 0 ? lines.slice(0, PEEK_LINES).join("\n") : block.body!;
  return <div
    /* A hairline between blocks, now that a body is no longer a card of its own.
       Flat text needs one mark to say where a block ends; nesting was doing that
       job and charging three surfaces for it. */
    className={`context-block grid grid-cols-(--context-block-columns) gap-4.5 rounded-row px-3 py-3 transition-colors duration-slow ease-instrument ${first ? "" : "border-t border-divider"} ${flash ? "bg-field" : "bg-transparent"} ${dim ? "opacity-26" : ""}`}
    data-block={block.id}
  >
    {/* No indent for a child. Depth was drawn twice -- a dashed left border and a
        left margin -- and a routed file three levels down sat a hand's width in
        from the prompt it belongs to. The tag already says which block named
        this one, which is the only thing the indent was carrying. */}
    <div className="flex min-w-0 flex-col">
      <button
        className="flex min-h-7 items-center gap-2.25 text-left"
        type="button"
        aria-expanded={readable ? open : undefined}
        disabled={!readable}
        onClick={onToggle}
      >
        {readable
          ? <ChevronDown
            size={12}
            strokeWidth={2}
            className={`flex-none text-muted transition-transform duration-state ease-instrument ${open ? "" : "-rotate-90"}`}
            aria-hidden="true"
          />
          : <span className="size-3 flex-none" aria-hidden="true" />}
        <span className={`min-w-0 truncate ${child ? `${MONO} type-mono-sm text-secondary` : TITLE}`}>{block.title}</span>
        <span className={`${META} min-w-0 truncate`}>{block.tag}</span>
        <span className="min-w-0 flex-1" aria-hidden="true" />
        <span className={`${MONO} type-mono-sm flex-none text-secondary`}>
          {block.onDemand && block.bytes !== null ? `≈${bytes(block.bytes)} IF PULLED` : bytes(block.bytes)}
        </span>
      </button>
      {/* The chain, where it can be read: an instruction names a place in prose, not as a markdown
          link, so the names are gathered on their own line rather than hunted inside 400 lines. */}
      {block.links.length > 0 && <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
        <span className={META}>NAMES</span>
        {/* A name with a block of its own is a button that jumps to it. A name
            without one -- what a routed file routes onward to -- is stated and
            marked, but there is nothing on this page to jump to. */}
        {block.links.map((link) => (link.blockId
          ? <button
            className={`context-path rounded-chip px-1 py-0.25 ${MONO} type-mono-2xs ${link.note === "not there" ? "text-failure-ink" : "text-secondary"} hover:bg-field hover:text-ink`}
            type="button"
            key={link.text}
            onClick={() => onPath(link.text)}
          >{link.text}</button>
          : <span
            className={`rounded-chip px-1 py-0.25 ${MONO} type-mono-2xs ${link.note === "not there" ? "text-failure-ink" : "text-muted"}`}
            key={link.text}
          >{link.text}</span>))}
      </span>}
      {/* Title, then the prompt. The body used to sit in a card of its own inside
          the page's card inside the page's panel -- three surfaces deep, for text
          that is the whole reason the page exists. It reads on the page now. */}
      {open && readable && <div className="flex flex-col gap-1.5 py-1.5">
        {rendered && block.format === "markdown"
          ? <div className="context-body"><MarkdownView markdown={literalPlaceholders(shown)} /></div>
          : <pre className="m-0 overflow-x-auto font-code type-mono-sm leading-document whitespace-pre-wrap text-ink select-text">
            {decorated(shown, block.links.map((link) => link.text), onPath)}
          </pre>}
        <span className="flex flex-wrap items-center gap-2.5">
          <span className={META}>
            {hidden > 0
              ? `… ${hidden} MORE LINES · SENT IN FULL`
              : block.more < 0 ? "… THE FILE CONTINUES PAST WHAT THIS PAGE READ · IT IS STILL SENT IN FULL"
              : block.more > 0 ? `… ${block.more} MORE LINES · SENT IN FULL` : "SENT IN FULL"}
          </span>
          {(hidden > 0 || whole) && <button
            className={`${MONO} type-mono-2xs rounded-chip px-1.5 py-0.5 text-secondary hover:bg-field hover:text-ink`}
            type="button"
            onClick={() => setWhole((value) => !value)}
          >{whole ? "SHOW LESS" : "SHOW ALL"}</button>}
        </span>
      </div>}
      {!readable && block.note && <p className="m-0 py-1 type-sm text-muted">{block.note}</p>}
      {readable && open && block.note && <p className="m-0 type-sm text-muted">{block.note}</p>}
      {block.defect && <p className="m-0 mt-1 rounded-row bg-failure px-3.5 py-2.5 type-sm text-failure-ink">{block.defect}</p>}
    </div>
    <div className="flex gap-2.5">
      <span className={`min-h-6 flex-none self-stretch rounded-control ${RAIL[block.rail.kind]}`} aria-hidden="true" />
      <span className="flex min-w-0 flex-col gap-0.75 pt-0.5">
        <span className={`type-sm ${block.rail.kind === "solid" ? "text-ink" : "text-secondary"}`}>{block.rail.label}</span>
        <span className={META}>{block.rail.note}</span>
      </span>
    </div>
  </div>;
}

export function ContextDocument({ blocks, provider, total, window: modelWindow, onOpenInventory }: {
  blocks: readonly ContextBlockDto[];
  provider: string;
  total: number | null;
  window: number | null;
  onOpenInventory(): void;
}) {
  const [filter, setFilter] = useState<ContextFilter>("all");
  const [rendered, setRendered] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  /* Every block with a body starts open: the point of this page is to read the prompt, not to open
     nine disclosures before it becomes one. */
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const readable = useMemo(() => blocks.filter((block) => block.body !== null), [blocks]);
  const allClosed = readable.length > 0 && readable.every((block) => closed[block.id]);

  const jump = (path: string) => {
    const target = blocks.find((block) => block.title === path || block.id.endsWith(`>${path}`));
    if (!target) return;
    setClosed((current) => ({ ...current, [target.id]: false }));
    setFlash(target.id);
    document.querySelector(`[data-block="${CSS.escape(target.id)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    globalThis.setTimeout(() => setFlash((current) => (current === target.id ? null : current)), 900);
  };

  return <div className="context-document mx-auto flex w-full max-w-context-column flex-col rounded-panel bg-panel p-0.5">
    <div className="flex min-h-10 flex-wrap items-center gap-2.5 px-3 py-1.5">
      <span className={`${MONO} type-mono-sm text-muted`}>WHAT THE AGENT SEES</span>
      <span className={META}>{`${provider.toLocaleUpperCase()} · NEXT TURN`}</span>
      <span className="min-w-0 flex-1" aria-hidden="true" />
      <span className="flex flex-none gap-0.75 rounded-control bg-card p-0.75">
        {([["all", "Everything"], ["always", "Every turn"], ["demand", "On demand"]] as const).map(([value, label]) => <button
          className={`${SEGMENT} ${filter === value ? "bg-desk-primary text-desk-primary-ink" : "bg-transparent text-secondary hover:text-ink"}`}
          type="button"
          aria-pressed={filter === value}
          key={value}
          onClick={() => setFilter(value)}
        >{label}</button>)}
      </span>
      {/* Rendered is the default; raw is for reading the exact bytes, and for anyone who would
          rather see the markdown than its result. */}
      <button className={CONTROL} type="button" aria-pressed={!rendered} onClick={() => setRendered((value) => !value)}>
        {rendered ? "Raw" : "Rendered"}
      </button>
      <button
        className={CONTROL}
        type="button"
        onClick={() => setClosed(allClosed ? {} : Object.fromEntries(readable.map((block) => [block.id, true])))}
      >{allClosed ? "Expand all" : "Collapse all"}</button>
      <button className={CONTROL} type="button" onClick={onOpenInventory}>Inventory</button>
      <span className={`${NUMBER} type-lg flex-none`}>{total === null ? "—" : total < 1000 ? total : `${(total / 1000).toFixed(1)}K`}</span>
      {modelWindow !== null && <span className={`${MONO} type-mono-sm flex-none text-muted`}>{`/ ${Math.round(modelWindow / 1000)}K`}</span>}
    </div>
    <div className="flex flex-col rounded-inner bg-card px-2.5 pt-3 pb-4">
      {/* One line, not two. The provider's own prompt is named here -- it rides
          above everything below and nobody outside the provider can read it --
          and the reading rule follows it in the same breath. */}
      <span className={`${META} px-3 pb-2.5`}>
        {`BEFORE ALL OF THIS · ${provider.toLocaleUpperCase()}'S OWN SYSTEM PROMPT, NOT EXPOSED · THEN, IN ORDER: A DIMMED OR COLLAPSED BLOCK STILL RIDES`}
      </span>
      {blocks.map((block, index) => <Block
        first={index === 0}
        block={block}
        open={!closed[block.id]}
        dim={filter !== "all" && (filter === "demand" ? !block.onDemand : block.onDemand)}
        flash={flash === block.id}
        rendered={rendered}
        onToggle={() => setClosed((current) => ({ ...current, [block.id]: !current[block.id] }))}
        onPath={jump}
        key={block.id}
      />)}
      <span className={`${META} pt-3 text-center`}>END OF CONTEXT · WHAT IS NOT HERE, THE AGENT DOES NOT KNOW</span>
    </div>
  </div>;
}
