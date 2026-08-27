import { ChevronDown } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import type { ContextBlockDto, ContextRail } from "../../../../electron/agent/context-document";
import { MarkdownView } from "@/shared/ui/MarkdownView";
import { Window } from "@/shared/ui/Window";

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

/* Solid: in the prompt, every turn. Dashed: may load. */
const RAIL: Record<ContextRail, string> = {
  solid: "w-0.75 bg-ink",
  dashed: "w-0.75 bg-[repeating-linear-gradient(180deg,var(--color-muted-decorative)_0_5px,transparent_5px_9px)]",
};

export type ContextFilter = "all" | "always" | "demand";

/**
 * Wrap every path the text names in a code run, unless it is in one already.
 *
 * An instruction file names places in plain prose as often as in backticks -- Ralphy's own block
 * writes ~/.ralphy/prompts/AGENTS.md bare, mid-sentence. Marking those after rendering would mean
 * splitting text nodes the markdown renderer owns; turning them into code runs first means the
 * renderer produces the element, and the marks land on it like any other path.
 *
 * The first alternative swallows anything already inside backticks, so an existing code run is
 * never wrapped twice.
 */
export function linkPaths(text: string, links: ContextBlockDto["links"]): string {
  const names = links.map((link) => link.text).filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (names.length === 0) return text;
  return text.replace(
    new RegExp("(`{1,3}[^`]*`{1,3})|(" + names.join("|") + ")", "g"),
    (whole, code: string | undefined, name: string | undefined) => (code ? whole : "`" + name + "`"),
  );
}

/**
 * Mark every path the prose names, in place. These surfaces are dense with code runs -- a router
 * draws thirty in a paragraph -- so a path that opens has to be a different object, not the same
 * grey chip with different letters: it takes the app's file tint as its plate and its ink.
 *
 * Both are set inline, and important. The shared markdown renderer paints every code run with a
 * utility, this app compiles Tailwind in important mode, and an important declaration inside a
 * cascade layer outranks an important one outside every layer -- so no authored rule can win, and
 * the page cannot put a class on nodes it did not create.
 */
export function markPaths(host: HTMLElement | null, links: ContextBlockDto["links"]): void {
  if (!host) return;
  const named = new Map(links.map((link) => [link.text, link]));
  for (const code of host.querySelectorAll("code")) {
    const link = named.get(code.textContent?.trim() ?? "");
    if (!link) continue;
    const opens = link.path !== null;
    code.setAttribute("data-context-path", link.path ?? "");
    code.setAttribute("data-context-opens", opens ? "" : "false");
    code.setAttribute("title", opens ? `Read ${link.path}` : `${link.text} is not on this machine`);
    const ink = opens ? "--instrument-tag-file" : "--instrument-failure-ink";
    const plate = opens
      ? "color-mix(in srgb, var(--instrument-tag-file) 15%, transparent)"
      : "color-mix(in srgb, var(--instrument-failure-ink) 12%, transparent)";
    code.style.setProperty("color", `var(${ink})`, "important");
    code.style.setProperty("background-color", plate, "important");
  }
}

/** One handler above the marks: they are attributes on nodes the markdown renderer owns. */
export function followPath(onRead: (path: string) => void) {
  return (event: MouseEvent<HTMLElement>) => {
    const mark = (event.target as HTMLElement).closest?.("[data-context-path][data-context-opens='']");
    const path = mark?.getAttribute("data-context-path");
    if (path) onRead(path);
  };
}

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

function Block({ block, open, dim, flash, rendered, onToggle, onPath, onRead }: {
  onRead(path: string): void;
  block: ContextBlockDto;
  open: boolean;
  dim: boolean;
  flash: boolean;
  rendered: boolean;
  onToggle(): void;
  onPath(path: string): void;
}) {
  const [whole, setWhole] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const child = block.linkedFrom !== null && block.onDemand;
  const lines = block.body!.split("\n");
  const hidden = whole ? 0 : Math.max(0, lines.length - PEEK_LINES);
  const shown = hidden > 0 ? lines.slice(0, PEEK_LINES).join("\n") : block.body!;

  /* A path named in the prose is the link. There used to be a NAMES strip above
     the body repeating every path the text mentions, which on a 19-target routing
     table was a wall of names with no sentence around them -- the router already
     says what each one is for, in the line that names it.
     The marks are applied to the rendered output rather than threaded through the
     markdown renderer: this page is the only surface that wants them, and the
     renderer is shared with the chat. */
  useEffect(() => markPaths(body.current, block.links), [block.links, shown, open, rendered]);

  const follow = followPath(onRead);
  return <div
    /* No radius. A rounded plate under a straight rule drew its own corners
       curling away from a block that has no visible edge -- the rule belongs to
       the gap between blocks, not to the block, so it is a row of its own below. */
    className={`context-block grid grid-cols-(--context-block-columns) gap-4.5 pr-3 pl-6 py-3 transition-colors duration-slow ease-instrument ${flash ? "bg-field" : "bg-transparent"} ${dim ? "opacity-26" : ""}`}
    data-block={block.id}
  >
    {/* No indent for a child. Depth was drawn twice -- a dashed left border and a
        left margin -- and a routed file three levels down sat a hand's width in
        from the prompt it belongs to. The tag already says which block named
        this one, which is the only thing the indent was carrying. */}
    <div className="flex min-w-0 flex-col">
      <button
        className="relative flex min-h-7 items-center gap-2.25 text-left"
        type="button"
        aria-expanded={open}
        onClick={onToggle}
      >
        {/* In the gutter, not in the line. A chevron in the flow pushed the title one
            glyph right of the body it belongs to, so a title never sat over its own
            first line. */}
        <ChevronDown
          size={12}
          strokeWidth={2}
          className={`absolute top-2 -left-4 text-muted transition-transform duration-state ease-instrument ${open ? "" : "-rotate-90"}`}
          aria-hidden="true"
        />
        <span className={`min-w-0 truncate ${child ? `${MONO} type-mono-sm text-secondary` : TITLE}`}>{block.title}</span>
        <span className={`${META} min-w-0 truncate`}>{block.tag}</span>
        <span className="min-w-0 flex-1" aria-hidden="true" />
        <span className={`${MONO} type-mono-sm flex-none text-secondary`}>
          {block.onDemand && block.bytes !== null ? `≈${bytes(block.bytes)} IF PULLED` : bytes(block.bytes)}
        </span>
      </button>
      {/* Title, then the prompt. The body used to sit in a card of its own inside
          the page's card inside the page's panel -- three surfaces deep, for text
          that is the whole reason the page exists. It reads on the page now, with
          one hairline saying where the app stops describing and the prompt starts. */}
      {open && <span className="mt-2 h-px w-full flex-none bg-divider" aria-hidden="true" />}
      {open && <div className="flex flex-col gap-1.5 pt-2.5">
        {rendered && block.format === "markdown"
          ? <div className="context-body" ref={body} onClick={follow}>
            <MarkdownView markdown={linkPaths(literalPlaceholders(shown), block.links)} />
          </div>
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
      {open && block.note && <p className="m-0 type-sm text-muted">{block.note}</p>}
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

export function ContextDocument({ blocks, provider, total, window: modelWindow, onOpenInventory, onRead }: {
  onRead(path: string): void;
  blocks: readonly ContextBlockDto[];
  provider: string;
  total: number | null;
  window: number | null;
  onOpenInventory(): void;
}) {
  const [filter, setFilter] = useState<ContextFilter>("all");
  const [rendered, setRendered] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  /* Everything starts closed. Nine open bodies is 10,000 px of prose, and the shape of the turn --
     what is in it, in what order, at what size -- is the thing the page has to answer first. Titles
     and sizes are always visible, so nothing is hidden by being closed. */
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const allOpen = blocks.length > 0 && blocks.every((block) => opened[block.id]);

  const jump = (path: string) => {
    const target = blocks.find((block) => block.title === path || block.id.endsWith(`>${path}`));
    if (!target) return;
    setOpened((current) => ({ ...current, [target.id]: true }));
    setFlash(target.id);
    document.querySelector(`[data-block="${CSS.escape(target.id)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    globalThis.setTimeout(() => setFlash((current) => (current === target.id ? null : current)), 900);
  };

  /* The same frame as the sidebar, the chat and the chat's utility panel: a panel plate at the
     window radius, one 2px gutter, and the content on a card at the frame radius. */
  return <Window className="context-document mx-auto w-full max-w-context-column">
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
        onClick={() => setOpened(allOpen ? {} : Object.fromEntries(blocks.map((block) => [block.id, true])))}
      >{allOpen ? "Collapse all" : "Expand all"}</button>
      <button className={CONTROL} type="button" onClick={onOpenInventory}>Inventory</button>
      <span className={`${NUMBER} type-lg flex-none`}>{total === null ? "—" : total < 1000 ? total : `${(total / 1000).toFixed(1)}K`}</span>
      {modelWindow !== null && <span className={`${MONO} type-mono-sm flex-none text-muted`}>{`/ ${Math.round(modelWindow / 1000)}K`}</span>}
    </div>
    <div className="flex flex-col rounded-frame bg-card px-2.5 pt-3 pb-4">
      {/* One line, not two. The provider's own prompt is named here -- it rides
          above everything below and nobody outside the provider can read it --
          and the reading rule follows it in the same breath. */}
      <span className={`${META} px-3 pb-2.5`}>
        {`BEFORE ALL OF THIS · ${provider.toLocaleUpperCase()}'S OWN SYSTEM PROMPT, NOT EXPOSED · THEN, IN ORDER: A DIMMED OR COLLAPSED BLOCK STILL RIDES`}
      </span>
      {blocks.map((block, index) => <Fragment key={block.id}>
        {index > 0 && <span className="mr-3 ml-6 h-px flex-none bg-divider" aria-hidden="true" />}
        <Block
          block={block}
          open={opened[block.id] === true}
          dim={filter !== "all" && (filter === "demand" ? !block.onDemand : block.onDemand)}
          flash={flash === block.id}
          rendered={rendered}
          onToggle={() => setOpened((current) => ({ ...current, [block.id]: !current[block.id] }))}
          onPath={jump}
          onRead={onRead}
        />
      </Fragment>)}
      <span className={`${META} pt-3 text-center`}>END OF CONTEXT · WHAT IS NOT HERE, THE AGENT DOES NOT KNOW</span>
    </div>
  </Window>;
}
