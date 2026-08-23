import { useVirtualizer } from "@tanstack/react-virtual";
import { Activity, Archive, CheckCircle2, FileText, Film, Layers3, MessageSquare, Play, Search, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { ActivityRunDetail } from "../../../electron/media/types";
import type { ActivityDto } from "../../../electron/ralphy/types";
import { AiBrandIcon } from "../../components/AiBrandIcon";
import { RalphyMascot } from "../../components/RalphyMascot";
import { SelectMenu, type SelectMenuOption } from "../../components/ui/SelectMenu";
import { defineInstrumentScreenStates, InstrumentScreenRoot, type InstrumentScenarioState } from "../../instrument/screen-state-registry";
import { InstrumentRightRailPortal, useOptionalInstrumentRightRail, useOptionalInstrumentScroll } from "../../instrument/InstrumentShell";
import type { DomainPage } from "../../state/project-domain";
import type { ProjectScreenController } from "../../state/project-screen-controller";
import { ActivityInspector } from "./ActivityInspector";
import { activitySearchText, activitySource, humanizeActivity, summarizeActivityRun, type ActivitySource } from "./activity-presentation";
import { AutoCursorTail } from "./AutoCursorTail";
import { useRememberedScroll } from "./scroll-memory";

/* These two filters state the whole skin the sheet used to carry for
   `.activity-toolbar .select-menu-trigger`, so SelectMenu stands down (`tone="caller"`) and
   surface and ink land here as one pair. The plate is `--instrument-widget-dark-raised` in both
   themes (work-surfaces.css flips the legacy set for `.select-menu-trigger`), so the ring is the
   on-instrument one: `outline-ink` would be #141414 on #1E1E1E in the light theme. The
   narrow-desk hide is a variant, not an authored `display: none`, which any display utility on
   the trigger would beat. */
const ACTIVITY_SELECT = "h-8 max-w-47.5 rounded-control bg-instrument-raised px-3 text-on-instrument-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-on-instrument @max-activity-filters/project-domain:hidden";

/* The table's three forms. All three ranges are mutually exclusive, so a cell never carries two
   `grid-cols` utilities and lets the generated sheet decide which wins. The wide template used to
   sit on the base row rule in the sheet; it is the `@min-activity-columns` band here. */
const ROW = "grid items-center gap-x-3";
const ROW_COLUMNS = "@min-activity-columns/project-domain:grid-cols-(--activity-row-columns) @min-activity-filters/project-domain:@max-activity-columns/project-domain:grid-cols-(--activity-row-columns-medium) @max-activity-filters/project-domain:grid-cols-(--activity-row-columns-narrow)";
/* The model column goes first, then source and entity. Both hides are utilities on the cell:
   an authored `display: none` loses to any display utility on the same element. */
const HIDE_MEDIUM = "@max-activity-columns/project-domain:hidden";
const HIDE_NARROW = "@max-activity-filters/project-domain:hidden";
const CELL = "min-w-0 truncate";
const CELL_MUTED = `${CELL} type-sm text-muted`;
/* Every tone the timeline knows collapses to one of two inks on the icon's black chip: the
   legacy accent/warn/ok families all resolve to the on-dark set there, so `document`, `run`,
   `composition`, `feedback` and `archive` were painting the same #A4A4A0 as `neutral`. A unit and
   a milestone read at full ink, and a milestone also gets the one raised plate. */
const ICON_TONE: Record<ActivityTone, string> = {
  document: "bg-instrument text-on-instrument-muted",
  run: "bg-instrument text-on-instrument-muted",
  composition: "bg-instrument text-on-instrument-muted",
  feedback: "bg-instrument text-on-instrument-muted",
  archive: "bg-instrument text-on-instrument-muted",
  neutral: "bg-instrument text-on-instrument-muted",
  unit: "bg-instrument text-on-instrument",
  success: "bg-instrument-raised text-on-instrument",
};

const dateValue = (value: number) => new Date(value < 1_000_000_000_000 ? value * 1000 : value);
const isMilestone = (action: string) => /(?:completed|archived|selected|sealed|resolved)$/i.test(action);
type ActivityTone = "document" | "run" | "composition" | "unit" | "feedback" | "success" | "archive" | "neutral";
type TimelineRow = { type: "day"; key: string; label: string } | { type: "event"; key: string; value: ActivityDto };
const sourceOptions: Array<SelectMenuOption<"all" | ActivitySource>> = [
  { value: "all", label: "All sources" },
  { value: "ralphy", label: "Ralphy" },
  { value: "generation", label: "Generations" },
  { value: "production", label: "Production" },
];

export const activityInstrumentStates = defineInstrumentScreenStates({
  routeKey: "project.activity",
  states: ["loading", "ready", "empty", "partial", "error", "selected"],
  rootMarker: "project-activity",
  landmarks: ["Project activity", "Activity events"],
} as const);

export function activityInstrumentState(page: DomainPage, selected: boolean): InstrumentScenarioState {
  if (selected) return "selected";
  if (page.status === "loading" && page.items.length === 0) return "loading";
  if (page.status === "error" && page.items.length === 0) return "error";
  if (page.items.length === 0) return "empty";
  return page.status === "loading" || page.status === "error" ? "partial" : "ready";
}

function appearance(value: Pick<ActivityDto, "action" | "entityType">): { tone: ActivityTone; Icon: LucideIcon } {
  const kind = `${value.action} ${value.entityType}`.toLowerCase();
  if (kind.includes("archiv")) return { tone: "archive", Icon: Archive };
  if (isMilestone(value.action)) return { tone: "success", Icon: CheckCircle2 };
  if (kind.includes("document")) return { tone: "document", Icon: FileText };
  if (kind.includes("composition")) return { tone: "composition", Icon: Film };
  if (kind.includes("unit")) return { tone: "unit", Icon: Layers3 };
  if (kind.includes("feedback")) return { tone: "feedback", Icon: MessageSquare };
  if (kind.includes("run") || kind.includes("generation")) return { tone: "run", Icon: Play };
  return { tone: "neutral", Icon: Activity };
}

export function ActivityTimeline({ page, controller, scrollMemory, resetToken }: {
  page: DomainPage;
  controller: ProjectScreenController;
  scrollMemory: Map<string, number>;
  resetToken: string;
}) {
  const instrumentScroll = useOptionalInstrumentScroll();
  const instrumentRail = useOptionalInstrumentRightRail();
  const ownerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<number, HTMLButtonElement>());
  const detailRef = useRef<Record<string, ActivityRunDetail>>({});
  const inflight = useRef(new Set<string>());
  const [owner, setOwner] = useState<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"all" | ActivitySource>("all");
  const [model, setModel] = useState("all");
  const [selected, setSelected] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<string, ActivityRunDetail>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const remembered = useRememberedScroll(scrollMemory, "activity", resetToken);
  const attachOwner = useCallback((node: HTMLDivElement | null) => {
    ownerRef.current = node;
    remembered.ref(instrumentScroll ? null : node);
    setOwner((current) => current === node ? current : node);
  }, [instrumentScroll, remembered.ref]);
  const scrollRoot = instrumentScroll?.element ?? owner;
  const [scrollMargin, setScrollMargin] = useState(0);
  const items = useMemo(() => [...page.items as ActivityDto[]].sort((left, right) => left.sequence - right.sequence), [page.items]);
  const availableModels = useMemo(() => [...new Set(Object.values(details).flatMap((detail) => summarizeActivityRun(detail).models))].sort(), [details]);
  const modelOptions = useMemo<Array<SelectMenuOption<string>>>(() => [{ value: "all", label: "All models" }, ...availableModels.map((value) => ({ value, label: value }))], [availableModels]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items.filter((event) => {
      const detail = details[event.entityId];
      if (source !== "all" && activitySource(event) !== source) return false;
      if (model !== "all" && (!detail || !summarizeActivityRun(detail).models.includes(model))) return false;
      return !needle || activitySearchText(event, detail).includes(needle);
    });
  }, [details, items, model, query, source]);
  const rows = useMemo(() => {
    const result: TimelineRow[] = [];
    let previousDay = "";
    for (const event of filtered) {
      const date = dateValue(event.createdAt);
      const day = date.toDateString();
      if (day !== previousDay) {
        result.push({ type: "day", key: `day:${day}:${event.sequence}`, label: new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date) });
        previousDay = day;
      }
      result.push({ type: "event", key: `event:${event.sequence}`, value: event });
    }
    return result;
  }, [filtered]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRoot,
    getItemKey: (index) => rows[index]?.key ?? index,
    estimateSize: (index) => rows[index]?.type === "day" ? 34 : 48,
    initialOffset: () => instrumentScroll ? 0 : scrollMemory.get("activity") ?? 0,
    initialRect: { width: 800, height: 600 },
    overscan: 8,
    scrollMargin,
  });
  const virtualRows = virtualizer.getVirtualItems();

  useLayoutEffect(() => {
    if (!ownerRef.current || !instrumentScroll?.element) {
      setScrollMargin(0);
      return;
    }
    const measure = () => {
      const ownerBounds = ownerRef.current!.getBoundingClientRect();
      const deskBounds = instrumentScroll.element!.getBoundingClientRect();
      setScrollMargin(ownerBounds.top - deskBounds.top + instrumentScroll.element!.scrollTop);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(ownerRef.current);
    return () => observer.disconnect();
  }, [instrumentScroll]);

  const loadDetail = useCallback(async (event: ActivityDto) => {
    if (event.entityType.toLocaleLowerCase() !== "run" || detailRef.current[event.entityId] || inflight.current.has(event.entityId)) return;
    inflight.current.add(event.entityId);
    setLoadingIds((current) => new Set(current).add(event.entityId));
    setErrors((current) => { const next = { ...current }; delete next[event.entityId]; return next; });
    try {
      const detail = await controller.loadActivityRun(event.entityId);
      detailRef.current = { ...detailRef.current, [event.entityId]: detail };
      setDetails(detailRef.current);
    } catch (error) {
      setErrors((current) => ({ ...current, [event.entityId]: error instanceof Error ? error.message : "Details unavailable" }));
    } finally {
      inflight.current.delete(event.entityId);
      setLoadingIds((current) => { const next = new Set(current); next.delete(event.entityId); return next; });
    }
  }, [controller]);

  useEffect(() => {
    for (const row of virtualRows) {
      const item = rows[row.index];
      if (item?.type === "event") void loadDetail(item.value);
    }
  }, [loadDetail, rows, virtualRows]);

  const open = (event: ActivityDto) => {
    setSelected(event.sequence);
    void loadDetail(event);
  };
  const moveSelection = (event: ActivityDto, delta: number) => {
    const index = filtered.findIndex(({ sequence }) => sequence === event.sequence);
    const next = filtered[Math.max(0, Math.min(filtered.length - 1, index + delta))];
    if (!next) return;
    open(next);
    queueMicrotask(() => rowRefs.current.get(next.sequence)?.focus());
  };
  const selectedEvent = items.find(({ sequence }) => sequence === selected) ?? null;

  return <InstrumentScreenRoot descriptor={activityInstrumentStates} state={activityInstrumentState(page, selectedEvent !== null)}><div className={`activity-log grid h-full min-h-0 w-full min-w-0 bg-transparent${selectedEvent ? " has-inspector gap-4 @min-activity-columns/project-domain:grid-cols-(--activity-log-columns) @max-activity-columns/project-domain:grid-cols-1" : ""}`}>
    <div className="activity-log-main flex min-h-0 min-w-0 flex-col gap-2">
      <div className="activity-toolbar m-0 flex min-h-11 min-w-0 flex-wrap items-center gap-2 bg-transparent p-0">
        <label className="activity-search flex h-9 min-w-56 flex-1 items-center gap-2 rounded-control bg-surface px-3 text-muted focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ink"><Search size={14} /><input className="min-w-0 flex-1 bg-transparent type-base text-ink outline-none placeholder:text-muted" aria-label="Search activity" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events" /></label>
        <SelectMenu<"all" | ActivitySource> className={ACTIVITY_SELECT} tone="caller" overlayOwner="project.activity" value={source} options={sourceOptions} ariaLabel="Filter activity source" onValueChange={setSource} />
        <SelectMenu className={ACTIVITY_SELECT} tone="caller" overlayOwner="project.activity" value={model} options={modelOptions} ariaLabel="Filter activity model" onValueChange={setModel} />
      </div>
      <div className="activity-table flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-table bg-transparent" role="table" aria-label="Project activity">
        <div className={`activity-table-head h-9 flex-none rounded-panel bg-surface px-3 type-meta uppercase tracking-mono text-muted ${ROW} ${ROW_COLUMNS}`} role="row"><span>Time</span><span className={HIDE_NARROW}>Source</span><span>Event</span><span className={HIDE_NARROW}>Entity</span><span className={HIDE_MEDIUM}>Model</span><span>Cost</span></div>
        <div className="activity-scroll min-h-0 min-w-0 flex-1 overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink" role="region" aria-label="Activity events" tabIndex={0} ref={attachOwner} onScroll={instrumentScroll ? undefined : remembered.onScroll}>
          <div className="activity-virtual-list relative w-full" role="rowgroup" style={{ height: virtualizer.getTotalSize() }}>
            {virtualRows.map((row) => {
              const item = rows[row.index];
              if (item.type === "day") return <div className="activity-row activity-day absolute top-0 left-0 flex w-full items-center gap-2.5 px-3 type-sm text-muted" role="row" key={row.key} style={{ height: row.size, transform: `translateY(${row.start - scrollMargin}px)` }}><span className="flex-none">{item.label}</span></div>;
              const value = item.value;
              const date = dateValue(value.createdAt);
              const milestone = isMilestone(value.action);
              const { tone, Icon } = appearance(value);
              // Read out of the map before the class string: the style audit scans class attributes for
              // arbitrary values, and a `${MAP[key]}` interpolation reads as one.
              const iconTone = ICON_TONE[tone];
              const eventSource = activitySource(value);
              const detail = details[value.entityId];
              const summary = detail ? summarizeActivityRun(detail) : null;
              const eventModel = summary?.models[0] ?? null;
              return <button type="button" role="row" className={`activity-row activity-event absolute top-0 left-0 w-full rounded-control px-2 text-left type-sm ${ROW} ${ROW_COLUMNS} ${selected === value.sequence ? "bg-instrument text-on-instrument [&_*]:text-inherit [box-shadow:var(--activity-selected-mark)]" : "bg-transparent text-ink hover:bg-surface"}${milestone ? " is-milestone" : ""}`} aria-selected={selected === value.sequence} data-action={value.action} data-tone={tone} key={row.key} ref={(node) => { if (node) rowRefs.current.set(value.sequence, node); else rowRefs.current.delete(value.sequence); }} style={{ height: row.size - 4, transform: `translateY(${row.start - scrollMargin + 2}px)` }} onClick={() => open(value)} onKeyDown={(keyboardEvent) => {
                if (keyboardEvent.key === "ArrowDown" || keyboardEvent.key === "ArrowUp") { keyboardEvent.preventDefault(); moveSelection(value, keyboardEvent.key === "ArrowDown" ? 1 : -1); }
                if (keyboardEvent.key === "Escape") setSelected(null);
              }}>
                <time className={`${CELL_MUTED} font-code`} role="cell" dateTime={date.toISOString()}>{new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date)}</time>
                <span className={`activity-source relative flex items-center gap-2 ${CELL_MUTED} ${HIDE_NARROW}`} role="cell"><span className={`activity-icon relative z-base grid size-6 flex-none place-items-center rounded-full ${iconTone}`} aria-hidden="true">{eventSource === "ralphy" ? <RalphyMascot size={17} /> : eventSource === "generation" && eventModel ? <AiBrandIcon provider="openrouter" model={eventModel} size={16} /> : <Icon size={14} strokeWidth={1.8} />}</span>{humanizeActivity(eventSource)}</span>
                <strong className={CELL} role="cell">{humanizeActivity(value.action)}</strong>
                <span className={`${CELL_MUTED} ${HIDE_NARROW}`} role="cell">{humanizeActivity(value.entityType)} · {value.entityId}</span>
                <span className={`${CELL_MUTED} ${HIDE_MEDIUM}`} role="cell">{eventModel ?? "—"}</span>
                <span className={`${CELL_MUTED} font-code`} role="cell">{summary?.costUsd === null || summary === null ? "—" : `$${summary.costUsd.toFixed(4)}`}</span>
              </button>;
            })}
          </div>
          <AutoCursorTail root={scrollRoot} hasMore={page.nextCursor !== null} loading={page.status === "loading" && page.items.length > 0} error={page.status === "error" && page.items.length > 0 ? page.error : null} onLoadMore={() => { void controller.loadMore("activity"); }} onRetry={() => { void controller.retryPage("activity"); }} />
        </div>
      </div>
    </div>
    {selectedEvent ? instrumentRail && instrumentRail.mode !== "closed"
      ? <InstrumentRightRailPortal owner="activity-inspector" label="Run inspector"><ActivityInspector event={selectedEvent} detail={details[selectedEvent.entityId] ?? null} loading={loadingIds.has(selectedEvent.entityId)} error={errors[selectedEvent.entityId] ?? null} onRetry={() => { void loadDetail(selectedEvent); }} onClose={() => setSelected(null)} /></InstrumentRightRailPortal>
      : <ActivityInspector event={selectedEvent} detail={details[selectedEvent.entityId] ?? null} loading={loadingIds.has(selectedEvent.entityId)} error={errors[selectedEvent.entityId] ?? null} onRetry={() => { void loadDetail(selectedEvent); }} onClose={() => setSelected(null)} />
      : null}
  </div></InstrumentScreenRoot>;
}
