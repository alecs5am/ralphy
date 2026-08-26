import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity, Archive, ArrowDownUp, ArrowLeft, Box, Building2, Check, ChevronRight,
  CircleSlash, Cpu, Eye, FileClock, Globe2, History, Inbox, Layers3, Palette, PencilLine,
  PenTool, Plus, Search, TriangleAlert, UserRound, Wrench, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { MemoryDetailDto, MemoryTier, MemoryType } from "../../electron/ralphy/types";
import type { MemoryMutation } from "../../electron/ralphy/memory-reader";
import { entityDragProps } from "../chat/attachments";
import { bridge } from "../lib/ipc";
import { SelectMenu } from "../components/ui/SelectMenu";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "../instrument/screen-state-registry";
import { Modal, MODAL_ACTION_DANGER, MODAL_ACTION_GHOST, MODAL_ACTION_PRIMARY } from "../components/ui/Modal";
import {
  ACTION, INSTRUMENT_ACTION_COMPACT, INSTRUMENT_ACTION_PRIMARY_COMPACT, OVERLAY_FIELD_RING,
  OVERLAY_RING, QUIET_TEXT, STATE_LINE,
} from "./calendar-memory-chrome";

export const memoryInstrumentStates = defineInstrumentScreenStates({
  routeKey: "workspace.memory",
  states: ["loading", "ready", "empty", "unavailable", "selected"],
  rootMarker: "workspace-memory",
  landmarks: ["Memory", "Durable context agents reuse across future work"],
} as const);

const TYPES: MemoryType[] = ["style", "craft", "client", "model", "tooling", "user", "legacy"];
const FILTER_TYPES = TYPES.filter((type): type is Exclude<MemoryType, "legacy"> => type !== "legacy");
const TYPE_LABEL: Record<MemoryType, string> = {
  model: "Model", craft: "Craft", tooling: "Tooling", client: "Client",
  style: "Style", user: "User", legacy: "Legacy",
};
const TYPE_ICON = {
  style: Palette, craft: PenTool, client: Building2, model: Cpu,
  tooling: Wrench, user: UserRound, legacy: Layers3,
} satisfies Record<MemoryType, typeof Palette>;
const SORTS = ["revised", "filed", "name"] as const;
const SORT_LABEL = { revised: "RECENTLY REVISED", filed: "RECENTLY FILED", name: "NAME" } as const;

/* Icon sizes are stated on the mark itself rather than through a `[&_svg]:` blanket on a region: a
   descendant variant is (0,1,1) and beats every per-element `size-*` at (0,1,0), so a mark that
   states its own size would silently lose. */
const ICON_SM = "size-2.5";    /* 10px -- a tier mark inside a rule's meta line */
const ICON_MD = "size-2.75";   /* 11px -- a warning mark beside it */
const ICON_LG = "size-3";      /* 12px -- a type glyph in a group header */
const ICON = "size-3.25";      /* 13px -- the route's control icon */
const ICON_XL = "size-3.5";    /* 14px -- the mark that leads a strip, a plate or a dialog row */

/* Vocabulary the rulebook repeats. Each string is complete: a surface never arrives without the
   ink it pairs with. */
const TYPE_CHIP = `${ACTION} min-h-8 px-2.5 type-xs`;
const RULE_ACTION = `${ACTION} h-7 px-2.5 type-label bg-surface-sunken text-ink hover:bg-surface-hover`;
const RULE_ACTION_PRIMARY = `${ACTION} h-7 px-2.5 type-label bg-brand text-brand-ink hover:opacity-88`;
const RULE_LABEL = "font-code type-meta tracking-block text-muted";
const RULE_PLATE = "rounded-field bg-surface-sunken px-2.75 py-2.5 type-sm text-ink";

const DIALOG_LABEL = `grid gap-1.5 type-label text-ink ${OVERLAY_FIELD_RING}`;
const DIALOG_FIELD = `w-full min-h-7.5 rounded-control bg-surface-sunken px-2.25 py-1.75 font-app type-sm text-ink outline-none ${OVERLAY_RING}`;
const DIALOG_AREA = `w-full min-h-17 resize-y rounded-field bg-surface-sunken px-2.25 py-1.75 font-app type-sm leading-compact text-ink outline-none ${OVERLAY_RING}`;
const DIALOG_HINT = "font-code type-mono-xs text-muted";

export function MemoryScreen({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const [active, setActive] = useState<MemoryDetailDto[]>([]);
  const [proposed, setProposed] = useState<MemoryDetailDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("effective");
  const [type, setType] = useState<MemoryType | null>(null);
  const [order, setOrder] = useState<(typeof SORTS)[number]>("revised");
  const [reviewing, setReviewing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [recallOpen, setRecallOpen] = useState(false);
  const [recall, setRecall] = useState<Awaited<ReturnType<typeof bridge.recallMemory>> | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [history, setHistory] = useState<MemoryDetailDto[] | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const initialExpansionSet = useRef(false);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    void Promise.all([
      bridge.loadMemory(workspaceId, { scope, status: "active", order: "slug" }),
      bridge.loadMemory(workspaceId, { scope, status: "proposed", order: "slug" }),
    ]).then(([nextActive, nextProposed]) => {
      if (!current) return;
      setActive(nextActive.items);
      setProposed(nextProposed.items);
    }).catch((cause: unknown) => {
      if (current) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [refresh, scope, workspaceId]);

  const visibleActive = useMemo(() => filterMemory(active, query, type, order), [active, order, query, type]);
  const visibleProposed = useMemo(() => filterMemory(proposed, query, type, order), [order, proposed, query, type]);
  const items = reviewing ? visibleProposed : visibleActive;
  const selectedVisible = expanded !== null && items.some((entry) => entry.id === expanded);
  const groups = useMemo(() => {
    const order = reviewing ? ["workspace", "global"] : TYPES;
    return order.map((group) => [group, items.filter((entry) => (reviewing ? entry.tier : entry.type) === group)] as const)
      .filter(([, entries]) => entries.length > 0);
  }, [items, reviewing]);
  const chipSource = reviewing ? proposed : active;
  const dirty = query.trim() !== "" || scope !== "effective" || type !== null;
  const workspaceCount = active.filter((entry) => entry.tier === "workspace").length;
  const firstActiveDisplayed = TYPES.map((value) => visibleActive.find((entry) => entry.type === value)).find(Boolean);

  useEffect(() => {
    const firstDisplayed = groups[0]?.[1][0];
    if (!loading && !reviewing && !initialExpansionSet.current && firstDisplayed) {
      initialExpansionSet.current = true;
      setExpanded(firstDisplayed.id);
    }
  }, [groups, loading, reviewing]);

  useEffect(() => {
    if (expanded !== null && !selectedVisible) setExpanded(null);
  }, [expanded, selectedVisible]);

  const reload = useCallback((message: string) => {
    setNotice(message);
    setRefresh((value) => value + 1);
  }, []);

  const openRecall = () => {
    setRecallOpen(true);
    setRecall(null);
    void bridge.recallMemory(workspaceId).then(setRecall).catch((cause: unknown) => {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    });
  };

  const openHistory = (entry: MemoryDetailDto) => {
    setHistory([]);
    void bridge.loadMemoryHistory(workspaceId, entry.id).then((result) => setHistory(result.items)).catch((cause: unknown) => {
      setHistory(null);
      setNotice(cause instanceof Error ? cause.message : String(cause));
    });
  };

  const runConfirmed = async () => {
    if (!confirm) return;
    await bridge.mutateMemory(workspaceId, {
      action: confirm.action,
      memoryEntryId: confirm.entry.id,
      expectedRevisionId: confirm.entry.revisionId,
    });
    const action = confirm.action;
    setConfirm(null);
    reload(action === "approve" ? "Proposal approved." : action === "reject" ? "Proposal rejected." : "Memory retired.");
  };

  const reviewHealth = async () => {
    try {
      const health = await bridge.loadMemoryHealth(workspaceId);
      setNotice(health.findings.length
        ? `${health.findings.length} ${health.findings.length === 1 ? "memory needs" : "memories need"} review.`
        : `All ${health.scanned} effective memories are healthy.`);
      if (health.findings[0]) setExpanded(health.findings[0].memoryEntryId);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const instrumentState = error
    ? "unavailable"
    : loading
      ? "loading"
      : items.length === 0
        ? "empty"
        : selectedVisible
          ? "selected"
          : "ready";

  return (
    <InstrumentScreenRoot descriptor={memoryInstrumentStates} state={instrumentState}>
    <main className="main-region memory-region @container/main-region flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-auto bg-transparent p-2 pb-6 type-base text-ink">
      <div className="overflow-hidden rounded-panel bg-instrument text-on-instrument">
      <div className="memory-topbar flex h-11.5 items-center justify-between gap-3 px-5 pt-3 type-xs uppercase tracking-mono text-on-instrument-muted">
        <span className="truncate">{workspaceName}</span>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <button type="button" className={INSTRUMENT_ACTION_COMPACT} onClick={() => void reviewHealth()}><Activity className={ICON} />Review memory health</button>
          <button type="button" className={INSTRUMENT_ACTION_COMPACT} onClick={openRecall}><Eye className={ICON} />Preview agent context</button>
          <button type="button" className={`memory-primary ${INSTRUMENT_ACTION_PRIMARY_COMPACT}`} onClick={() => setEditor({})}><Plus className={ICON} />Add memory</button>
        </div>
      </div>

      <header className="memory-header m-0 flex min-h-0 w-full max-w-none flex-wrap items-end justify-between gap-4 bg-transparent px-5 pb-4 pt-2 text-on-instrument">
        <div><h1 className="mx-0 mb-1.25 mt-0 type-hero font-semibold leading-none tracking-tight text-on-instrument">Memory</h1><p className="mx-0 mb-0 mt-1 type-base text-on-instrument-muted">Durable context agents reuse across future work</p></div>
        <div className="memory-counts ml-auto grid justify-items-end gap-1.25 text-right font-code type-meta font-normal text-on-instrument-muted"><strong className="block type-xs text-on-instrument">{reviewing ? `${proposed.length} PROPOSED · NOT IN RECALL` : `${active.length} ACTIVE · ${workspaceCount} WORKSPACE · ${active.length - workspaceCount} INHERITED`}</strong><span className="type-mono-md text-on-instrument-muted">{reviewing ? "PROPOSALS ARE NOT PART OF THE ACTIVE CAP" : `${workspaceCount} / 100 IN THIS TIER`}</span></div>
      </header>
      </div>

      <div className="memory-filters m-0 flex w-full max-w-none flex-wrap items-center gap-2 rounded-panel bg-surface p-2">
        <label className="memory-search flex h-9 min-w-memory-search flex-1 items-center gap-2 rounded-control bg-surface-sunken px-3"><Search className={`${ICON_XL} flex-none text-muted`} /><input className="h-full min-w-0 flex-1 bg-transparent p-0 font-app type-base text-ink outline-none placeholder:text-muted" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search rules and bodies" />{query && <button type="button" className="grid size-4.5 flex-none place-items-center rounded-control text-muted transition-colors duration-fast ease-instrument hover:bg-surface hover:text-ink motion-reduce:transition-none motion-reduce:duration-0" aria-label="Clear search" onClick={() => setQuery("")}><X className={ICON_SM} /></button>}</label>
        <div className="memory-segments flex h-9 items-center rounded-control bg-surface-sunken p-1" aria-label="Memory scope">
          {(["effective", "workspace", "global"] as Scope[]).map((value) => <button type="button" className={`${ACTION} h-7 px-2.5 type-xs ${scope === value ? "is-active bg-instrument text-on-instrument" : "bg-transparent text-muted hover:text-ink"}`} key={value} onClick={() => setScope(value)}>{value[0]!.toUpperCase() + value.slice(1)}</button>)}
        </div>
        <i className="hidden" />
        <div className="memory-type-chips flex min-w-0 flex-wrap items-center gap-1 overflow-hidden @max-memory-row/main-region:hidden">
          <button type="button" className={`${TYPE_CHIP} ${type === null ? "is-active bg-instrument text-on-instrument" : "bg-surface-sunken text-muted hover:bg-surface-hover hover:text-ink"}`} onClick={() => setType(null)}>All <span className={`font-code type-mono-md ${type === null ? "text-on-instrument-muted" : "text-muted"}`}>{chipSource.length}</span></button>
          {FILTER_TYPES.map((value) => <button type="button" key={value} className={`${TYPE_CHIP} ${type === value ? "is-active bg-instrument text-on-instrument" : "bg-surface-sunken text-muted hover:bg-surface-hover hover:text-ink"}`} onClick={() => setType(value)}>{TYPE_LABEL[value]} <span className={`font-code type-mono-md ${type === value ? "text-on-instrument-muted" : "text-muted"}`}>{chipSource.filter((entry) => entry.type === value).length}</span></button>)}
        </div>
        {dirty && <button type="button" className={`memory-clear ${QUIET_TEXT}`} onClick={() => { setQuery(""); setScope("effective"); setType(null); }}>Clear filters</button>}
        <button type="button" className={`memory-sort ${ACTION} ml-auto h-6 px-2 font-code type-mono-md text-muted hover:bg-surface-sunken hover:text-ink`} onClick={() => setOrder((value) => SORTS[(SORTS.indexOf(value) + 1) % SORTS.length]!)}><ArrowDownUp className={ICON_MD} />{SORT_LABEL[order]}</button>
      </div>

      <div className={`memory-review-strip m-0 flex min-h-10 items-center gap-2 rounded-control bg-surface-sunken px-3 py-2 type-sm text-muted${reviewing ? " is-reviewing" : ""}`}>
        {reviewing ? <ArrowLeft className={`${ICON_XL} flex-none`} /> : proposed.length > 0 ? <Inbox className={`${ICON_XL} flex-none`} /> : <Check className={`${ICON_XL} flex-none`} />}
        <span>{proposed.length > 0 ? reviewing ? `Reviewing ${proposed.length} proposals · nothing here reaches agents until you approve it` : `${proposed.length} ${proposed.length === 1 ? "proposal is" : "proposals are"} waiting for review — they do not reach agents yet` : "Memory is up to date"}</span>
        <button type="button" className={`${ACTION} ml-auto h-6.5 px-2.75 type-label bg-surface text-ink hover:bg-surface-hover`} onClick={() => { setReviewing((value) => { const next = !value; setExpanded(next ? null : firstActiveDisplayed?.id ?? null); return next; }); }}>{reviewing ? "Back to active memory" : "Review now"}</button>
      </div>

      <section className="memory-rulebook m-0 flex min-h-0 w-full max-w-none flex-1 flex-col gap-8.5 overflow-visible bg-transparent p-0" aria-busy={loading}>
        {error && <div className={`memory-state ${STATE_LINE}`}><TriangleAlert className={`${ICON_XL} flex-none text-alert`} />{error}<button type="button" className="text-ink underline" onClick={() => setRefresh((value) => value + 1)}>Retry</button></div>}
        {!error && loading && <div className={`memory-state ${STATE_LINE}`}>Loading memory…</div>}
        {!error && !loading && items.length === 0 && <div className={`memory-state ${STATE_LINE}`}>{query || type ? "No memory matches these filters." : reviewing ? "No proposals are waiting for review." : "No active memory yet."}</div>}
        {!error && !loading && groups.map(([group, entries]) => (
          <div className="memory-group min-w-0" key={group}>
            <MemoryGroupHeader group={group} reviewing={reviewing} count={entries.length} workspaceName={workspaceName} />
            <div className="grid gap-0.75">{entries.map((entry) => <MemoryRule key={`${entry.id}:${entry.revisionId}`} entry={entry} workspaceName={workspaceName} open={expanded === entry.id} reviewing={reviewing} onToggle={() => setExpanded((value) => value === entry.id ? null : entry.id)} onRevise={() => setEditor({ entry })} onHistory={() => openHistory(entry)} onConfirm={(action) => setConfirm({ action, entry })} />)}</div>
          </div>
        ))}
      </section>
      <div className="memory-live sr-only" aria-live="polite">{notice}</div>

      <RecallDialog open={recallOpen} onOpenChange={setRecallOpen} recall={recall} />
      <EditorDialog key={editor?.entry?.revisionId ?? (editor ? "new" : "closed")} open={editor !== null} entry={editor?.entry} onOpenChange={(open) => { if (!open) setEditor(null); }} onSave={async (mutation) => { await bridge.mutateMemory(workspaceId, mutation); setEditor(null); reload(editor?.entry ? "New memory version saved." : "Memory added."); }} />
      <HistoryDialog history={history} onOpenChange={(open) => { if (!open) setHistory(null); }} />
      <ConfirmDialog state={confirm} onOpenChange={(open) => { if (!open) setConfirm(null); }} onConfirm={() => void runConfirmed().catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : String(cause)))} />
    </main>
    </InstrumentScreenRoot>
  );
}

type Scope = "effective" | MemoryTier;
type EditorState = { entry?: MemoryDetailDto } | null;
type ConfirmState = { action: "approve" | "reject" | "retire"; entry: MemoryDetailDto } | null;

function filterMemory(entries: MemoryDetailDto[], query: string, type: MemoryType | null, order: (typeof SORTS)[number]): MemoryDetailDto[] {
  const needle = query.trim().toLocaleLowerCase();
  return entries.filter((entry) => (!type || entry.type === type) && (!needle || [entry.name, entry.slug, entry.body.rule, entry.body.why, ...entry.body.howToApply, ...entry.body.doesNotApplyTo].join(" ").toLocaleLowerCase().includes(needle)))
    .sort(order === "name" ? (a, b) => a.name.localeCompare(b.name) : order === "filed" ? (a, b) => Date.parse(b.filed) - Date.parse(a.filed) : (a, b) => b.version - a.version || Date.parse(b.filed) - Date.parse(a.filed));
}

function MemoryGroupHeader({ group, reviewing, count, workspaceName }: { group: string; reviewing: boolean; count: number; workspaceName: string }) {
  const Icon = reviewing ? group === "global" ? Globe2 : Box : TYPE_ICON[group as MemoryType];
  const label = reviewing ? group === "global" ? "GLOBAL · EVERY WORKSPACE" : `WORKSPACE · ${workspaceName.toUpperCase()}` : TYPE_LABEL[group as MemoryType].toUpperCase();
  return <header className="flex min-h-8 items-center gap-2 px-1 font-code type-meta uppercase tracking-mono text-muted"><Icon className={ICON_LG} /><span>{label}</span><b className="font-medium tracking-normal text-ink">{count}</b><i className="hidden" /></header>;
}

function MemoryRule({ entry, workspaceName, open, reviewing, onToggle, onRevise, onHistory, onConfirm }: {
  entry: MemoryDetailDto; workspaceName: string; open: boolean; reviewing: boolean; onToggle(): void; onRevise(): void;
  onHistory(): void; onConfirm(action: "approve" | "reject" | "retire"): void;
}) {
  const panelId = `memory-rule-${entry.id}`;
  const filed = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(entry.filed));
  return <article
    {...entityDragProps({ kind: "memory", ref: entry.slug, label: entry.body.rule || entry.name })}
    className={`memory-rule my-1 overflow-hidden rounded-cell bg-surface-sunken transition-colors duration-fast ease-instrument hover:bg-surface motion-reduce:transition-none motion-reduce:duration-0 ${open ? "is-open" : ""}${reviewing ? " is-proposal" : ""}`}
  >
    <button type="button" className="memory-rule-head flex min-h-14 w-full items-center gap-2 bg-transparent px-3 py-2 text-left type-base text-ink focus-visible:-outline-offset-2" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
      <ChevronRight className={`${ICON} flex-none text-muted transition-transform duration-fast ease-instrument motion-reduce:transition-none motion-reduce:duration-0 ${open ? "rotate-90" : ""}`} />
      <span className="grid min-w-0 flex-1 gap-1.75"><strong className="truncate type-base font-normal text-ink">{entry.body.rule || entry.name}</strong><small className="flex items-center gap-2 font-code type-meta text-muted"><em className={`is-${entry.tier} inline-flex items-center gap-1.25 font-app type-label not-italic text-muted`}>{entry.tier === "global" ? <Globe2 className={ICON_SM} /> : <Box className={ICON_SM} />}{entry.tier === "global" ? "Global" : `Workspace · ${workspaceName}`}</em>{entry.overridesGlobal && <em className="memory-tag inline-flex h-4.25 items-center rounded-control bg-surface px-1.5 font-code type-meta not-italic tracking-label text-ink">OVERRIDES</em>}<i className="not-italic">v{entry.version} · {entry.version > 1 ? "Revised" : "Filed"} {filed}</i>{entry.qualityFlags.length > 0 && <b className="inline-flex items-center gap-1 font-app type-mono-md text-muted"><TriangleAlert className={ICON_MD} />No negative scope</b>}</small></span>
      <i className="max-w-45 truncate font-code type-meta not-italic text-muted">{entry.name}</i>
    </button>
    {open && <div className="memory-rule-body grid gap-4.75 bg-surface px-4 pb-4 pt-3 type-base leading-5 text-ink" id={panelId}>
      <section className="grid gap-1.5"><label className={RULE_LABEL}>WHY</label><p className="m-0 type-sm leading-prose text-muted">{entry.body.why || "Why has not been captured yet."}</p></section>
      <div className="memory-rule-columns grid grid-cols-(--memory-rule-columns) gap-7.5 @max-memory-row/main-region:grid-cols-1">
        <section className="grid gap-1.5"><label className={RULE_LABEL}>HOW TO APPLY</label>{entry.body.howToApply.length ? <ul className="m-0 grid gap-1.5 pl-4.5 type-sm leading-row text-muted">{entry.body.howToApply.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="is-muted m-0 type-sm leading-prose text-muted">Application guidance is missing.</p>}</section>
        <section className="grid gap-1.5"><label className={RULE_LABEL}>DOES NOT APPLY TO</label>{entry.body.doesNotApplyTo.length ? <ul className="is-negative m-0 grid list-none gap-1.5 pl-0 type-sm leading-row text-muted">{entry.body.doesNotApplyTo.map((item) => <li className="flex gap-2 text-muted" key={item}><CircleSlash className={`${ICON_LG} mt-0.5 flex-none`} />{item}</li>)}</ul> : <div className={`memory-quality grid grid-cols-(--memory-glyph-columns) gap-1.75 leading-row ${RULE_PLATE}`}><TriangleAlert className={`${ICON_LG} mt-0.5`} /><span>Negative scope is missing. This memory may be applied too broadly.</span><button type="button" className={`col-start-2 justify-self-start ${ACTION} h-6.5 px-2.25 type-sm bg-surface text-ink hover:bg-surface-hover`} onClick={onRevise}>Revise and complete</button></div>}</section>
      </div>
      {entry.overridesGlobal && <div className={`memory-override flex items-center gap-2.25 ${RULE_PLATE}`}><Layers3 className={`${ICON} flex-none`} />This workspace memory overrides a global memory with the same ID — the global text is not sent.</div>}
      <footer className="flex items-center gap-1.75 pt-0.5">{reviewing ? <><button type="button" className={`memory-primary ${RULE_ACTION_PRIMARY}`} onClick={() => onConfirm("approve")}><Check className={ICON} />Approve</button><button type="button" className={RULE_ACTION} onClick={() => onConfirm("reject")}><X className={ICON} />Reject</button></> : <button type="button" className={`memory-primary ${RULE_ACTION_PRIMARY}`} onClick={onRevise}><PencilLine className={ICON} />Revise</button>}<button type="button" className={RULE_ACTION} onClick={onHistory}><History className={ICON} />History ({entry.version})</button><span className="ml-0.75 font-code type-meta text-muted">{entry.source} · filed {entry.filed}</span>{!reviewing && <button type="button" className={`memory-retire ml-auto ${RULE_ACTION}`} onClick={() => onConfirm("retire")}><Archive className={ICON} />Retire</button>}</footer>
    </div>}
  </article>;
}

/**
 * A rulebook dialog. Every one of these is portalled to the document body, outside
 * `.app-mode-work`, where the legacy `--fg*`/`--field-surface` family resolves to the on-dark
 * set -- so the surfaces and inks are stated here outright rather than inherited.
 */
function MemoryModal({ open, onOpenChange, overlay, title, description, sheet = false, children }: { open: boolean; onOpenChange(open: boolean): void; overlay: "memory-recall" | "memory-editor" | "memory-history" | "memory-confirm"; title: string; description: string; sheet?: boolean; children: React.ReactNode }) {
  /* Recall is the wide one -- it lists what an agent would receive -- and used to be a sheet
     pinned to the right edge. Nothing in the app slides in from an edge any more, so it is the
     same centred window at a wider measure. */
  return <Modal
    id={overlay}
    open={open}
    onOpenChange={onOpenChange}
    title={title}
    description={description}
    closeLabel={`Close ${title}`}
    size={sheet ? "h-fit max-h-memory-modal-height w-memory-recall" : "h-fit max-h-memory-modal-height w-memory-modal-width"}
    className={`memory-modal${sheet ? " memory-recall" : ""}`}
    titleClassName="m-0 min-w-0 flex-none truncate type-title font-normal text-ink"
    descriptionClassName="m-0 min-w-0 flex-1 truncate type-label text-muted"
    bodyClassName="memory-modal-card overflow-y-auto"
  >{children}</Modal>;
}

function RecallDialog({ open, onOpenChange, recall }: { open: boolean; onOpenChange(open: boolean): void; recall: Awaited<ReturnType<typeof bridge.recallMemory>> | null }) {
  return <MemoryModal open={open} onOpenChange={onOpenChange} overlay="memory-recall" title="Agent context preview" description="The exact effective memory sent as background context" sheet>
    {!recall ? <div className={`memory-state ${STATE_LINE}`}>Loading context…</div> : <><div className="memory-recall-counts flex gap-1.75 px-4.5 pt-4">{[`${recall.workspaceCount} workspace`, `${recall.globalCount} global`].map((label) => <span className="rounded-control bg-surface-sunken px-1.75 py-1 font-code type-meta text-ink" key={label}>{label}</span>)}</div><p className="memory-recall-note mx-4.5 my-3.5 rounded-field bg-surface-sunken p-2.5 type-label leading-row text-ink">{recall.note}</p><div className="memory-recall-list grid gap-0.75 px-3 pb-5">{recall.entries.map((entry) => <article className="grid gap-1.25 rounded-field bg-surface-sunken p-3" key={entry.id}><small className="font-code type-mono-sm text-muted">{entry.tier} · {entry.slug}</small><strong className="type-ui font-normal text-ink">{entry.body.rule}</strong><p className="m-0 type-label leading-compact text-muted">{entry.description}</p></article>)}</div></>}
  </MemoryModal>;
}

function EditorDialog({ open, entry, onOpenChange, onSave }: { open: boolean; entry?: MemoryDetailDto; onOpenChange(open: boolean): void; onSave(input: MemoryMutation): Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [tier, setTier] = useState<MemoryTier>(entry?.tier ?? "workspace");
  const [type, setType] = useState<Exclude<MemoryType, "legacy">>(entry?.type === "legacy" ? "user" : entry?.type ?? "user");
  const [status, setStatus] = useState<"active" | "proposed">(entry ? "proposed" : "active");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const lines = (name: string) => String(data.get(name) ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
    const common = {
      status,
      name: String(data.get("name")), description: String(data.get("description")),
      type,
      body: { rule: String(data.get("rule")), why: String(data.get("why")), howToApply: lines("how"), doesNotApplyTo: lines("not") },
      source: "Desktop",
    };
    const mutation: MemoryMutation = entry
      ? { action: "revise", memoryEntryId: entry.id, expectedRevisionId: entry.revisionId, ...common }
      : { action: "create", tier, slug: String(data.get("slug")), ...common };
    setSaving(true); setFormError("");
    try { await onSave(mutation); } catch (cause) { setFormError(cause instanceof Error ? cause.message : String(cause)); setSaving(false); }
  };
  return <MemoryModal open={open} onOpenChange={onOpenChange} overlay="memory-editor" title={entry ? "Revise memory" : "Add memory"} description={entry ? `Save as immutable version ${entry.version + 1}` : "Create a durable rule for future work"}>
    <form className="memory-editor grid gap-3.5 px-5 pb-5 pt-4.5" onSubmit={(event) => void submit(event)}>
      <label className={DIALOG_LABEL}>Rule<textarea className={DIALOG_AREA} name="rule" required defaultValue={entry?.body.rule} autoFocus /></label>
      <div className="grid grid-cols-3 gap-2.5"><label className={DIALOG_LABEL}>Scope{entry ? <span className={`memory-static-field flex w-full min-h-7.5 items-center rounded-control bg-surface-sunken px-2.25 type-sm text-ink`}>{tier === "workspace" ? "Workspace" : "Global"}</span> : <SelectMenu<MemoryTier> className="w-full" overlayOwner="memory.editor" value={tier} options={[{ value: "workspace", label: "Workspace" }, { value: "global", label: "Global" }]} ariaLabel="Memory scope" onValueChange={setTier} />}</label><label className={DIALOG_LABEL}>Type<SelectMenu<Exclude<MemoryType, "legacy">> className="w-full" overlayOwner="memory.editor" value={type} options={TYPES.filter((value): value is Exclude<MemoryType, "legacy"> => value !== "legacy").map((value) => ({ value, label: TYPE_LABEL[value] }))} ariaLabel="Memory type" onValueChange={setType} /></label><label className={DIALOG_LABEL}>State<SelectMenu<"active" | "proposed"> className="w-full" overlayOwner="memory.editor" value={status} options={[{ value: "active", label: "Active" }, { value: "proposed", label: "Proposal" }]} ariaLabel="Memory state" onValueChange={setStatus} /></label></div>
      <label className={DIALOG_LABEL}>Why<textarea className={DIALOG_AREA} name="why" defaultValue={entry?.body.why} /></label>
      <div className="grid grid-cols-2 gap-2.5"><label className={DIALOG_LABEL}>How to apply <small className={DIALOG_HINT}>one item per line</small><textarea className={DIALOG_AREA} name="how" defaultValue={entry?.body.howToApply.join("\n")} /></label><label className={DIALOG_LABEL}>Does not apply to <small className={DIALOG_HINT}>one item per line</small><textarea className={DIALOG_AREA} name="not" defaultValue={entry?.body.doesNotApplyTo.join("\n")} /></label></div>
      <details className="type-label text-muted"><summary className="cursor-pointer">Advanced fields</summary><div className="grid grid-cols-2 gap-2.5 pt-3"><label className={DIALOG_LABEL}>Name<input className={DIALOG_FIELD} name="name" required defaultValue={entry?.name ?? "Memory rule"} /></label>{!entry && <label className={DIALOG_LABEL}>Slug<input className={DIALOG_FIELD} name="slug" required pattern="[a-z0-9][a-z0-9-]*" placeholder="memory-rule" /></label>}<label className={`col-span-full ${DIALOG_LABEL}`}>Description<input className={DIALOG_FIELD} name="description" required defaultValue={entry?.description ?? "Durable workspace guidance."} /></label></div></details>
      {formError && <p className="memory-form-error m-0 rounded-field bg-alert px-2 py-1 type-label text-alert-ink">{formError}</p>}
      <footer className="flex justify-end gap-2 pt-0.75"><Dialog.Close asChild><button type="button" className={MODAL_ACTION_GHOST}>Cancel</button></Dialog.Close><button className={`memory-primary ${MODAL_ACTION_PRIMARY} disabled:cursor-not-allowed disabled:opacity-35`} type="submit" disabled={saving}>{saving ? "Saving…" : entry ? `Save as version ${entry.version + 1}` : "Add memory"}</button></footer>
    </form>
  </MemoryModal>;
}

function HistoryDialog({ history, onOpenChange }: { history: MemoryDetailDto[] | null; onOpenChange(open: boolean): void }) {
  return <MemoryModal open={history !== null} onOpenChange={onOpenChange} overlay="memory-history" title="Version history" description="Immutable revisions, newest first"><div className="memory-history grid gap-0.75 p-3.5">{history?.length === 0 && <div className={`memory-state ${STATE_LINE}`}>Loading history…</div>}{history?.map((entry) => <article className="grid grid-cols-(--memory-glyph-columns) gap-2.5 rounded-field bg-surface-sunken p-2.75" key={entry.revisionId}><FileClock className={`${ICON_XL} text-muted`} /><span className="grid gap-1"><strong className="font-code type-xs text-ink">Version {entry.version}</strong><small className="font-code type-mono-sm text-muted">{entry.status} · {entry.filed} · {entry.source}</small><p className="mx-0 mb-0 mt-0.5 type-sm text-muted">{entry.body.rule}</p></span></article>)}</div></MemoryModal>;
}

function ConfirmDialog({ state, onOpenChange, onConfirm }: { state: ConfirmState; onOpenChange(open: boolean): void; onConfirm(): void }) {
  const verb = state?.action ?? "retire";
  return <MemoryModal open={state !== null} onOpenChange={onOpenChange} overlay="memory-confirm" title={`${verb[0]!.toUpperCase()}${verb.slice(1)} memory?`} description={verb === "retire" ? "The rule leaves recall but remains in immutable history." : verb === "approve" ? "The proposal becomes the active revision." : "The proposal is preserved as rejected provenance."}><div className="memory-confirm px-5 pb-5 pt-4.5"><p className="mx-0 mb-5 mt-0 leading-prose text-muted">{state?.entry.body.rule}</p><footer className="flex justify-end gap-2 pt-0.75"><Dialog.Close asChild><button type="button" className={MODAL_ACTION_GHOST}>Cancel</button></Dialog.Close><button type="button" className={verb === "approve" ? `memory-primary ${MODAL_ACTION_PRIMARY}` : `memory-danger ${MODAL_ACTION_DANGER}`} onClick={onConfirm}>{verb[0]!.toUpperCase() + verb.slice(1)}</button></footer></div></MemoryModal>;
}
