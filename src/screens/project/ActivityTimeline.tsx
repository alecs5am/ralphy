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

  return <InstrumentScreenRoot descriptor={activityInstrumentStates} state={activityInstrumentState(page, selectedEvent !== null)}><div className={`activity-log${selectedEvent ? " has-inspector" : ""}`}>
    <div className="activity-log-main">
      <div className="activity-toolbar">
        <label className="activity-search"><Search size={14} /><input aria-label="Search activity" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events" /></label>
        <SelectMenu<"all" | ActivitySource> overlayOwner="project.activity" value={source} options={sourceOptions} ariaLabel="Filter activity source" onValueChange={setSource} />
        <SelectMenu overlayOwner="project.activity" value={model} options={modelOptions} ariaLabel="Filter activity model" onValueChange={setModel} />
      </div>
      <div className="activity-table" role="table" aria-label="Project activity">
        <div className="activity-table-head" role="row"><span>Time</span><span>Source</span><span>Event</span><span>Entity</span><span>Model</span><span>Cost</span></div>
        <div className="activity-scroll" role="region" aria-label="Activity events" tabIndex={0} ref={attachOwner} onScroll={instrumentScroll ? undefined : remembered.onScroll}>
          <div className="activity-virtual-list" role="rowgroup" style={{ height: virtualizer.getTotalSize() }}>
            {virtualRows.map((row) => {
              const item = rows[row.index];
              if (item.type === "day") return <div className="activity-row activity-day" role="row" key={row.key} style={{ height: row.size, transform: `translateY(${row.start - scrollMargin}px)` }}><span>{item.label}</span></div>;
              const value = item.value;
              const date = dateValue(value.createdAt);
              const milestone = isMilestone(value.action);
              const { tone, Icon } = appearance(value);
              const eventSource = activitySource(value);
              const detail = details[value.entityId];
              const summary = detail ? summarizeActivityRun(detail) : null;
              const eventModel = summary?.models[0] ?? null;
              return <button type="button" role="row" className={`activity-row activity-event${milestone ? " is-milestone" : ""}`} aria-selected={selected === value.sequence} data-action={value.action} data-tone={tone} key={row.key} ref={(node) => { if (node) rowRefs.current.set(value.sequence, node); else rowRefs.current.delete(value.sequence); }} style={{ height: row.size - 4, transform: `translateY(${row.start - scrollMargin + 2}px)` }} onClick={() => open(value)} onKeyDown={(keyboardEvent) => {
                if (keyboardEvent.key === "ArrowDown" || keyboardEvent.key === "ArrowUp") { keyboardEvent.preventDefault(); moveSelection(value, keyboardEvent.key === "ArrowDown" ? 1 : -1); }
                if (keyboardEvent.key === "Escape") setSelected(null);
              }}>
                <time role="cell" dateTime={date.toISOString()}>{new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date)}</time>
                <span className="activity-source" role="cell"><span className="activity-icon" aria-hidden="true">{eventSource === "ralphy" ? <RalphyMascot size={17} /> : eventSource === "generation" && eventModel ? <AiBrandIcon provider="openrouter" model={eventModel} size={16} /> : <Icon size={14} strokeWidth={1.8} />}</span>{humanizeActivity(eventSource)}</span>
                <strong role="cell">{humanizeActivity(value.action)}</strong>
                <span role="cell">{humanizeActivity(value.entityType)} · {value.entityId}</span>
                <span role="cell">{eventModel ?? "—"}</span>
                <span role="cell">{summary?.costUsd === null || summary === null ? "—" : `$${summary.costUsd.toFixed(4)}`}</span>
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
