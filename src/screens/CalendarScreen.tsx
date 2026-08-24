import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle, ArrowLeft, ArrowUpRight, CalendarClock, Check, CheckCheck, ChevronDown, ChevronLeft,
  ChevronRight, CircleAlert, Clock3, FilePenLine, GitCommitHorizontal, Globe2, GripVertical,
  Instagram, ListFilter, Music2, PanelRight, Plus, RefreshCw, SlidersHorizontal,
  Repeat, Twitter, X, Youtube,
} from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent } from "react";
import type {
  CalendarChannelInput, CalendarEventDto, CalendarEventStatus, CalendarReadyUnitDto, CalendarWorkspaceDto, JsonValue,
} from "../../electron/ralphy/types";
import { entityDragProps, RALPHY_ENTITY_DRAG, type Attachment } from "../chat/attachments";
import { bridge } from "../lib/ipc";
import { projectGlyphVars } from "../lib/project-glyph";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "../instrument/screen-state-registry";
import { InstrumentRightRailPortal, useOptionalInstrumentRightRail } from "../instrument/InstrumentShell";
import type { WorkspaceCalendarNavigationContext } from "../state/workbench";
import {
  ACTION, BLOCK_LABEL, CHECK_BOX, CHECK_MARK_ON_INSTRUMENT, CHECK_MARK_ON_SURFACE, DOT, dotTone,
  INSTRUMENT_ACTION, INSTRUMENT_ACTION_PRIMARY, INSTRUMENT_ICON, INSTRUMENT_TAB, OVERLAY_ACTION,
  OVERLAY_ACTION_PRIMARY, OVERLAY_FIELD_RING, OVERLAY_RING, OVERLAY_SCRIM, QUIET_TEXT, STATE_LINE,
  STATE_PLATE,
} from "./calendar-memory-chrome";
import {
  calendarDayKey, calendarRange, eventStatusSummary, filterCalendarEvents, formatCalendarTime,
  groupAgenda, monthDays, weekDays, zonedDateTimeToEpoch, type CalendarFilters, type CalendarView,
} from "./calendar-presentation";

const DOW = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const STATUS_LABEL: Record<CalendarEventStatus, string> = {
  draft: "Draft", scheduled: "Scheduled", uploading: "Uploading", published: "Published",
  partial: "Partially published", failed: "Failed",
};
const PLATFORM_ICON = { instagram: Instagram, youtube: Youtube, tiktok: Music2, x: Twitter } as const;
const EMPTY_FILTERS: CalendarFilters = { projectIds: [], platforms: [], statuses: [] };
const CALENDAR_UNIT_DRAG = "application/x-ralphy-calendar-unit";
const CalendarWorkspaceContext = createContext("");
const timestampMs = (value: number) => value < 1_000_000_000_000 ? value * 1000 : value;

/* Icon sizes are stated on the mark itself rather than through a `[&_svg]:` blanket on a region:
   a descendant variant is (0,1,1) and beats every per-element `size-*` at (0,1,0), so a mark that
   states its own size would silently lose. */
const ICON_XS = "size-2.25";   /*  9px -- the dismiss inside a filter chip */
const ICON_SM = "size-2.5";    /* 10px -- a platform mark inside a dense cell */
const ICON_MD = "size-2.75";   /* 11px -- a platform or metadata mark in a row */
const ICON_LG = "size-3";      /* 12px -- a leading glyph beside a row title */
const ICON = "size-3.25";      /* 13px -- the route's control icon */
const ICON_XL = "size-3.75";   /* 15px -- the glyph that leads a card */
const ICON_STATE = "size-6";   /* 24px -- the mark on an empty or error plate */

/* Vocabulary the Calendar repeats. Each string is complete: a surface never arrives without the
   ink it pairs with. */
const OVERLAY_PANEL = "absolute inset-y-0 right-0 z-header flex flex-col overflow-hidden rounded-panel bg-surface text-ink animate-calendar-panel-in motion-reduce:animate-none";
const PANEL_HEADER_ACTION = `flex h-6.5 shrink-0 items-center gap-1.5 rounded-control px-2.25 type-sm transition-colors duration-fast ease-instrument motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`;
const PANEL_CARD = "flex items-center gap-2.75 rounded-field bg-surface-sunken px-3 py-2.75";
const CHIP = "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control bg-surface-sunken px-2.25 font-code type-mono-md text-ink";
const MODAL_FIELD_LABEL = "font-code type-mono-md tracking-block text-muted";
const MODAL_INPUT = `h-8.5 min-w-0 rounded-control bg-surface-sunken px-2.75 type-sm text-ink placeholder:text-muted ${OVERLAY_RING}`;
const MODAL_ROW = `flex min-h-11.5 items-center gap-2.5 rounded-control px-2.5 py-2 text-left transition-colors duration-fast ease-instrument motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`;
const MODAL_ROW_COPY = "flex min-w-0 flex-1 flex-col gap-0.75";
const SEGMENT_BUTTON = `${ACTION} h-6 px-2.75 type-label ${OVERLAY_RING}`;
const PICKER_CELL = `${ACTION} h-7 flex-none font-code type-label ${OVERLAY_RING}`;
const PICKER_DAY = `grid h-7.75 place-items-center rounded-control font-code type-label transition-colors duration-fast ease-instrument motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`;

export const calendarInstrumentStates = defineInstrumentScreenStates({
  routeKey: "workspace.calendar",
  states: ["loading", "ready", "empty", "partial", "error", "selected", "scheduling"],
  rootMarker: "workspace-calendar",
  landmarks: ["Calendar", "Calendar view", "Schedule content"],
} as const);

export function CalendarScreen({
  workspaceId, workspaceName, initialDate = new Date(), navigationContext, onOpenProject = () => undefined,
}: { workspaceId: string; workspaceName: string; initialDate?: Date; navigationContext?: WorkspaceCalendarNavigationContext; onOpenProject?: (projectId: string, unitId: string) => void }) {
  const instrumentRail = useOptionalInstrumentRightRail();
  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(initialDate);
  const [data, setData] = useState<CalendarWorkspaceDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [filters, setFilters] = useState<CalendarFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<"inspector" | "drawer" | null>(null);
  const [agendaTab, setAgendaTab] = useState<"all" | "attention" | "drafts">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalUnit, setModalUnit] = useState<CalendarReadyUnitDto | null>(null);
  const [modalStep, setModalStep] = useState<"content" | "settings">("content");
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [reconnectAccount, setReconnectAccount] = useState<CalendarWorkspaceDto["accounts"][number] | null>(null);
  const [reconnectCredential, setReconnectCredential] = useState("");
  const [reconnecting, setReconnecting] = useState(false);
  const timezone = data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  useEffect(() => {
    let current = true;
    setLoading(true); setError(null);
    const range = calendarRange(view, anchor);
    void bridge.loadCalendar(workspaceId, { ...range, timezone }).then((next) => {
      if (!current) return;
      setData(next);
      setSelectedEventId((id) => {
        const contextual = navigationContext?.unitId
          ? next.events.find((event) => event.unitId === navigationContext.unitId && (
            navigationContext.date === undefined || (
              event.at !== null || event.draftAt !== null
            ) && timestampMs((event.at ?? event.draftAt)!) === timestampMs(navigationContext.date)
          ))
          : undefined;
        if (navigationContext?.unitId) {
          setRightPanel(contextual ? "inspector" : null);
          return contextual?.id ?? null;
        }
        return id && next.events.some((event) => event.id === id) ? id : null;
      });
    }).catch((cause: unknown) => {
      if (current) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [anchor, navigationContext, refresh, view, workspaceId]); // timezone intentionally follows the loaded workspace

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (filtersOpen) setFiltersOpen(false);
      else if (rightPanel) setRightPanel(null);
      else if (modalOpen) setModalOpen(false);
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [filtersOpen, modalOpen, rightPanel]);

  const visible = useMemo(() => filterCalendarEvents(data?.events ?? [], filters), [data, filters]);
  const selected = data?.events.find((event) => event.id === selectedEventId) ?? null;
  const dirty = filters.projectIds.length + filters.platforms.length + filters.statuses.length > 0;
  const days = view === "week" ? weekDays(anchor) : monthDays(anchor);
  const title = periodTitle(view, anchor);
  const openEvent = (event: CalendarEventDto) => { setSelectedEventId(event.id); setRightPanel("inspector"); };
  const openSchedule = (unit: CalendarReadyUnitDto | null = null, date: string | null = null) => {
    setModalUnit(unit ?? data?.readyUnits[0] ?? null); setModalDate(date ?? calendarDayKey(anchor.getTime(), timezone)); setModalStep("content"); setModalOpen(true); setRightPanel(null);
  };
  const openReconnect = (accountId: string | null) => {
    const account = data?.accounts.find((item) => item.id === accountId) ?? null;
    if (account) { setReconnectAccount(account); setReconnectCredential(""); }
  };
  const mutate = useCallback(async (input: Parameters<typeof bridge.mutateCalendar>[1]) => {
    try {
      await bridge.mutateCalendar(workspaceId, input);
      setNotice("Calendar updated."); setRightPanel(null); setRefresh((value) => value + 1);
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : String(cause)); }
  }, [workspaceId]);

  const instrumentState = modalOpen
    ? "scheduling"
    : rightPanel === "inspector" && selected
      ? "selected"
      : error
        ? "error"
        : loading && !data
          ? "loading"
          : data && !data.postiz.available
            ? "partial"
            : visible.length === 0
              ? "empty"
              : "ready";

  return <CalendarWorkspaceContext.Provider value={workspaceId}><InstrumentScreenRoot descriptor={calendarInstrumentStates} state={instrumentState}><main className="main-region calendar-region @container/main-region flex min-h-0 min-w-0 flex-1 flex-col overflow-auto bg-transparent p-2 pb-6 type-base text-ink">
    <section className="calendar-shell relative m-0 flex min-h-0 w-full min-w-0 max-w-none flex-1 flex-col gap-2 overflow-visible bg-transparent p-0" aria-busy={loading} aria-label={`${workspaceName} calendar`}>
      <header className="calendar-toolbar m-0 flex min-h-0 w-full min-w-0 max-w-none flex-none flex-wrap items-center gap-2 rounded-panel bg-instrument px-4 py-3 text-on-instrument">
        <h1 className="mr-1 type-section font-semibold leading-none tracking-tight text-on-instrument">Calendar</h1>
        <button type="button" className={INSTRUMENT_ACTION} onClick={() => setAnchor(new Date())}>Today</button>
        <span className="calendar-arrows flex flex-none gap-0.75">
          <button type="button" className={INSTRUMENT_ICON} aria-label={`Previous ${view}`} onClick={() => setAnchor(shiftAnchor(anchor, view, -1))}><ChevronLeft className={ICON} /></button>
          <button type="button" className={INSTRUMENT_ICON} aria-label={`Next ${view}`} onClick={() => setAnchor(shiftAnchor(anchor, view, 1))}><ChevronRight className={ICON} /></button>
        </span>
        <strong className="min-w-32 whitespace-nowrap pl-0.5 font-code type-base font-medium text-on-instrument @max-calendar-toolbar/main-region:hidden">{title}</strong><i className="flex-1" />
        <span className="calendar-view-tabs flex flex-none items-center rounded-control bg-instrument-raised p-1" aria-label="Calendar view">
          {(["month", "week", "agenda"] as CalendarView[]).map((item) => <button type="button" key={item} className={`${INSTRUMENT_TAB} ${view === item ? "is-active bg-surface text-ink hover:bg-surface-hover" : "bg-transparent text-on-instrument-muted hover:bg-ghost hover:text-on-instrument"}`} onClick={() => setView(item)}>{capitalize(item)}</button>)}
        </span>
        <span className="calendar-filter-wrap relative flex flex-none">
          <button type="button" className={INSTRUMENT_ACTION} onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal className={`${ICON} @max-calendar-toolbar/main-region:hidden`} />Filters</button>
          {filtersOpen && <FilterPopover data={data} filters={filters} onChange={setFilters} onClose={() => setFiltersOpen(false)} />}
        </span>
        <button type="button" className={rightPanel === "drawer" ? INSTRUMENT_ACTION_PRIMARY : INSTRUMENT_ACTION} onClick={() => setRightPanel((panel) => panel === "drawer" ? null : "drawer")}><PanelRight className={`${ICON} @max-calendar-toolbar/main-region:hidden`} />Ready to schedule <small className={`inline-flex h-4.25 items-center rounded-control px-1.5 font-code type-mono-md ${rightPanel === "drawer" ? "bg-surface-sunken text-ink" : "bg-instrument text-on-instrument-muted"}`}>{data?.readyUnits.length ?? 0}</small></button>
        <button type="button" className={`calendar-primary ${INSTRUMENT_ACTION_PRIMARY}`} onClick={() => openSchedule()}><Plus className={`${ICON} @max-calendar-toolbar/main-region:hidden`} />Schedule content</button>
      </header>

      <div className="calendar-subbar m-0 flex min-h-10 w-full min-w-0 flex-none flex-wrap items-center gap-2 rounded-panel bg-surface px-3 py-2 type-xs text-muted">
        <span className={`calendar-timezone ${CHIP}`}><Globe2 className={`${ICON_MD} text-muted`} />{timezoneLabel(timezone)} · {timezone}</span>
        {filters.projectIds.map((id) => <FilterChip key={id} label="Project" value={data?.projects.find((project) => project.id === id)?.name ?? id} onRemove={() => setFilters({ ...filters, projectIds: filters.projectIds.filter((value) => value !== id) })} />)}
        {filters.platforms.map((platform) => <FilterChip key={platform} label="Platform" value={capitalize(platform)} onRemove={() => setFilters({ ...filters, platforms: filters.platforms.filter((value) => value !== platform) })} />)}
        {filters.statuses.map((status) => <FilterChip key={status} label="Status" value={STATUS_LABEL[status]} onRemove={() => setFilters({ ...filters, statuses: filters.statuses.filter((value) => value !== status) })} />)}
        {dirty && <button type="button" className={`calendar-clear ${QUIET_TEXT}`} onClick={() => setFilters(EMPTY_FILTERS)}>Clear all</button>}
        <i className="flex-1" />
        <small className="font-code type-mono-md text-muted">{visible.length} publications · {rangeNote(days)}</small>
      </div>

      {!data?.postiz.available && data && <div className="calendar-readonly m-0 flex min-h-10 min-w-0 flex-none items-center gap-2 rounded-control bg-surface-sunken px-3 py-2 type-sm text-muted"><CircleAlert className={`${ICON} shrink-0`} /><span className="flex-1">Postiz is unavailable. Your local calendar and drafts are still available.</span><button type="button" className={`${ACTION} ml-auto px-2.25 py-1.25 type-sm bg-desk-primary text-desk-primary-ink`} onClick={() => setRefresh((value) => value + 1)}>Try again</button></div>}
      <div className="calendar-content relative m-0 flex min-h-0 w-full max-w-none flex-1 overflow-visible bg-transparent p-0">
        {error ? <CalendarError error={error} onRetry={() => setRefresh((value) => value + 1)} />
          : loading && !data ? <CalendarLoading />
            : view === "month" ? <MonthView days={days} events={visible} timezone={timezone} selectedEventId={selectedEventId} onOpen={openEvent} onDropUnit={(unitId, date) => openSchedule(data?.readyUnits.find((unit) => unit.unitId === unitId) ?? null, date)} />
              : view === "week" ? <WeekView days={days} events={visible} timezone={timezone} selectedEventId={selectedEventId} onOpen={openEvent} />
                : <AgendaView events={visible} timezone={timezone} selectedEventId={selectedEventId} tab={agendaTab} onTab={setAgendaTab} onOpen={openEvent}
                  onRetry={(event) => mutate({ action: "retry", eventId: event.id, expectedRowVersion: event.rowVersion })} onReconnect={openReconnect} />}
        {rightPanel === "inspector" && selected && (instrumentRail && instrumentRail.mode !== "closed"
          ? <InstrumentRightRailPortal owner="calendar-inspector" label="Calendar inspector"><EventInspector event={selected} postizAvailable={data?.postiz.available ?? false} onClose={() => setRightPanel(null)} onOpenUnit={() => selected.projectId && onOpenProject(selected.projectId, selected.unitId)} onMutate={mutate} /></InstrumentRightRailPortal>
          : <EventInspector event={selected} postizAvailable={data?.postiz.available ?? false} onClose={() => setRightPanel(null)} onOpenUnit={() => selected.projectId && onOpenProject(selected.projectId, selected.unitId)} onMutate={mutate} />)}
        {rightPanel === "drawer" && <ReadyDrawer units={data?.readyUnits ?? []} onClose={() => setRightPanel(null)} onSchedule={openSchedule} />}
      </div>
      <span className="calendar-live sr-only" aria-live="polite">{notice}</span>
    </section>
    <ScheduleDialog open={modalOpen} unit={modalUnit} step={modalStep} initialDate={modalDate} timezone={timezone} postizAvailable={data?.postiz.available ?? false} saving={saving}
      accounts={data?.accounts ?? []}
      onReconnect={openReconnect}
      onOpenUnit={() => modalUnit?.projectId && onOpenProject(modalUnit.projectId, modalUnit.unitId)}
      onOpenChange={setModalOpen} onSelect={setModalUnit} onStep={setModalStep} units={data?.readyUnits ?? []}
      onSave={async (submit, at, channels, unitRevisionId) => {
        if (!unitRevisionId || channels.length === 0) return;
        setSaving(true);
        try {
          const draft = await bridge.mutateCalendar(workspaceId, {
            action: "create", unitRevisionId, at: null, draftAt: at, timezone,
            channels,
          });
          if (submit) await bridge.mutateCalendar(workspaceId, { action: "submit", eventId: draft.id, expectedRowVersion: draft.rowVersion, at });
          setModalOpen(false); setNotice(submit ? "Content scheduled." : "Draft saved."); setRefresh((value) => value + 1);
        } catch (cause) { setNotice(cause instanceof Error ? cause.message : String(cause)); }
        finally { setSaving(false); }
      }} />
    <ReconnectDialog account={reconnectAccount} credential={reconnectCredential} saving={reconnecting} onCredential={setReconnectCredential} onOpenChange={(open) => { if (!open) setReconnectAccount(null); }} onSave={async () => {
      if (!reconnectAccount) return;
      setReconnecting(true);
      try {
        await bridge.reconnectCalendarAccount(workspaceId, { accountId: reconnectAccount.id, expectedRowVersion: reconnectAccount.rowVersion, credential: reconnectCredential });
        setReconnectAccount(null); setNotice(`${reconnectAccount.handle} reconnected.`); setRefresh((value) => value + 1);
      } catch (cause) { setNotice(cause instanceof Error ? cause.message : String(cause)); }
      finally { setReconnecting(false); }
    }} />
  </main></InstrumentScreenRoot></CalendarWorkspaceContext.Provider>;
}

function FilterPopover({ data, filters, onChange, onClose }: { data: CalendarWorkspaceDto | null; filters: CalendarFilters; onChange(value: CalendarFilters): void; onClose(): void }) {
  const platforms = [...new Set([...(data?.accounts.map((account) => account.platform) ?? []), ...(data?.events.flatMap((event) => event.channels.map((channel) => channel.platform)) ?? [])])];
  return <div className="calendar-filter-popover absolute right-0 top-8.5 z-agent-popover w-calendar-filter rounded-cell bg-surface p-2.5 text-ink" data-instrument-overlay="calendar-filter">
    <header className="flex items-center px-0.5 pb-2 pt-0.5 type-base"><span className="flex-1">Filters</span><button type="button" className="grid size-6 place-items-center rounded-control text-muted transition-colors duration-fast ease-instrument hover:bg-surface-hover hover:text-ink motion-reduce:transition-none motion-reduce:duration-0" aria-label="Close filters" onClick={onClose}><X className={ICON} /></button></header>
    <FilterOptions title="PROJECT" values={data?.projects.map((item) => [item.id, item.name]) ?? []} selected={filters.projectIds} onChange={(projectIds) => onChange({ ...filters, projectIds })} />
    <FilterOptions title="PLATFORM" values={platforms.map((value) => [value, capitalize(value)])} selected={filters.platforms} onChange={(platforms) => onChange({ ...filters, platforms })} />
    <FilterOptions title="STATUS" values={(Object.keys(STATUS_LABEL) as CalendarEventStatus[]).map((value) => [value, STATUS_LABEL[value]])} selected={filters.statuses} onChange={(statuses) => onChange({ ...filters, statuses: statuses as CalendarEventStatus[] })} />
  </div>;
}

function FilterOptions({ title, values, selected, onChange }: { title: string; values: string[][]; selected: string[]; onChange(values: string[]): void }) {
  return <section className="flex flex-col gap-0.5 py-2"><small className="px-1.75 pb-1.25 font-code type-mono-sm tracking-block text-muted">{title}</small>{values.map(([value, label]) => <button type="button" key={value} className={`flex min-h-7 items-center rounded-control px-2 text-left type-sm transition-colors duration-fast ease-instrument motion-reduce:transition-none motion-reduce:duration-0 ${selected.includes(value!) ? " is-selected bg-instrument text-on-instrument" : "bg-transparent text-muted hover:bg-surface-sunken hover:text-ink"}`} onClick={() => onChange(selected.includes(value!) ? selected.filter((item) => item !== value) : [...selected, value!])}><span className="flex-1">{label}</span>{selected.includes(value!) && <Check className={ICON} />}</button>)}</section>;
}

function FilterChip({ label, value, onRemove }: { label: string; value: string; onRemove(): void }) {
  return <span className="calendar-filter-chip inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control bg-surface-sunken py-0 pl-2.25 pr-1 type-label text-ink"><small className="type-label text-muted">{label}</small>{value}<button type="button" className="grid size-4.25 place-items-center rounded-control text-muted transition-colors duration-fast ease-instrument hover:bg-surface-hover hover:text-ink motion-reduce:transition-none motion-reduce:duration-0" aria-label={`Remove ${label} filter`} onClick={onRemove}><X className={ICON_XS} strokeWidth={2.4} /></button></span>;
}

/* A publication is a place in time, so its reference names both: the unit it publishes and the
   day it is due. Nothing in the library resolves an event id, and a date is what the operator
   would have written anyway. */
export function scheduledAttachment(event: CalendarEventDto, timezone: string): Attachment {
  const when = event.at ?? event.draftAt;
  const day = when === null ? "unscheduled" : calendarDayKey(when, timezone);
  return { kind: "scheduled", ref: `${event.title}@${day}`, label: `${event.title} · ${day}` };
}

function MonthView({ days, events, timezone, selectedEventId, onOpen, onDropUnit }: { days: ReturnType<typeof monthDays>; events: CalendarEventDto[]; timezone: string; selectedEventId: string | null; onOpen(event: CalendarEventDto): void; onDropUnit(unitId: string, date: string): void }) {
  const today = localDateKey(new Date());
  return <div className="calendar-month flex min-h-0 w-full min-w-0 flex-1 flex-col gap-1.25 overflow-hidden bg-transparent">
    <div className="calendar-weekdays grid flex-none grid-cols-7 gap-1.5 bg-transparent text-center font-code type-mono-sm uppercase tracking-mono text-muted">{DOW.map((day) => <span className="py-1.5 pl-0" key={day}>{day}</span>)}</div>
    <div className="calendar-month-grid grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1.5 bg-transparent">{days.map((day) => {
      const items = events.filter((event) => event.at !== null && calendarDayKey(event.at, timezone) === day.key);
      return <div className={`calendar-month-cell flex min-h-24 min-w-0 flex-col gap-1 overflow-hidden rounded-cell p-1.75 type-xs text-ink outline-0 transition-colors duration-fast ease-instrument motion-reduce:transition-none motion-reduce:duration-0 ${day.inMonth ? " bg-surface hover:bg-surface-hover" : " is-outside bg-transparent opacity-34"}${day.key === today ? " is-today bg-surface-hover" : ""}`} key={day.key} tabIndex={0} onDragOver={(event) => { if (event.dataTransfer.types.includes(CALENDAR_UNIT_DRAG)) event.preventDefault(); }} onDrop={(event) => { const unitId = event.dataTransfer.getData(CALENDAR_UNIT_DRAG); if (unitId) onDropUnit(unitId, day.key); }}>
        <header className="flex h-4.5 flex-none items-center font-code type-mono-md text-muted"><span className={`flex h-4.5 min-w-4.5 items-center justify-center rounded-control ${day.key === today ? "bg-desk-primary text-desk-primary-ink" : ""}`}>{day.date.getDate()}</span>{items.length > 3 && <small className="ml-auto rounded-control bg-surface-sunken px-1.75 py-0.5 type-mono-md text-ink">+{items.length - 3}</small>}</header>
        {items.slice(0, 3).map((event, index) => <CalendarEventButton key={event.id} event={event} timezone={timezone} lead={index === 0} selected={event.id === selectedEventId} onClick={() => onOpen(event)} />)}
      </div>;
    })}</div>
  </div>;
}

function WeekView({ days, events, timezone, selectedEventId, onOpen }: { days: ReturnType<typeof weekDays>; events: CalendarEventDto[]; timezone: string; selectedEventId: string | null; onOpen(event: CalendarEventDto): void }) {
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const noTime = events.filter((event) => event.at === null);
  const today = localDateKey(new Date());
  return <div className="calendar-week flex min-h-0 w-full flex-1 flex-col gap-2 overflow-hidden rounded-cell bg-surface-sunken type-sm text-ink">
    <div className="calendar-week-head grid flex-none grid-cols-(--calendar-week-columns) gap-1.5"><span />{days.map((day, index) => <span className="flex items-center gap-1.5 pl-2" key={day.key}><small className="font-code type-mono-sm tracking-mono text-muted">{DOW[index]}</small><b className={`flex h-4.5 min-w-4.5 items-center justify-center rounded-control px-1.25 font-code type-mono-md font-normal ${day.key === today ? "is-today bg-desk-primary text-desk-primary-ink" : "text-ink"}`}>{day.date.getDate()}</b></span>)}</div>
    <div className="calendar-no-time flex flex-none gap-2"><label className="flex w-calendar-gutter items-center justify-end pr-2 font-code type-mono-sm tracking-caps text-muted">NO TIME</label><div className="grid flex-1 grid-cols-7 gap-1.5">{days.map((day) => <span className="block min-h-7.5 rounded-chip bg-transparent p-0.75" key={day.key}>{noTime.filter((event) => event.draftAt !== null && calendarDayKey(event.draftAt, timezone) === day.key).map((event) => <button type="button" className="calendar-no-time-event flex h-6 w-full items-center gap-1.5 rounded-control bg-surface px-1.75 text-left transition-colors duration-fast ease-instrument hover:bg-surface-hover motion-reduce:transition-none motion-reduce:duration-0" key={event.id} onClick={() => onOpen(event)}><i className={`calendar-event-dot is-${event.status} ${DOT} ${dotTone(event.status)}`} /><b className="min-w-0 flex-1 truncate type-mono-md font-normal text-ink">{event.title}</b><span className="flex gap-0.75 text-muted">{event.channels.slice(0, 3).map((channel) => { const Icon = platformIcon(channel.platform); return <Icon className={ICON_SM} key={`${channel.id}:${channel.platform}`} />; })}</span></button>)}</span>)}</div></div>
    <div className="calendar-week-scroll flex min-h-0 flex-1 gap-2 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><aside className="flex w-calendar-gutter flex-none flex-col">{hours.map((hour) => <span className="h-calendar-hour pr-2 pt-0.5 text-right font-code type-mono-sm text-muted" key={hour}>{String(hour).padStart(2, "0")}:00</span>)}</aside><div className="calendar-week-columns grid min-w-0 flex-1 grid-cols-7 gap-1.5">{days.map((day) => <div className="relative h-calendar-day overflow-hidden rounded-cell bg-surface" key={day.key}>{hours.map((hour) => <span className="calendar-hour-line block h-calendar-hour" key={hour} />)}{events.filter((event) => event.at !== null && calendarDayKey(event.at, timezone) === day.key).map((event) => { const chosen = event.id === selectedEventId; return <button type="button" className={`calendar-week-event absolute inset-x-1 z-raised flex h-11 items-center gap-1.75 overflow-hidden rounded-control py-1 pl-1 pr-1.5 text-left transition-colors duration-fast ease-instrument motion-reduce:transition-none motion-reduce:duration-0 is-${event.status}${chosen ? " is-selected bg-instrument text-on-instrument hover:bg-instrument-hover" : " bg-surface-sunken text-ink hover:bg-surface-hover"}`} style={{ top: `${weekEventTop(event, timezone)}px` }} key={event.id} onClick={() => onOpen(event)}><CalendarThumb event={event} className="h-9 w-6.75 rounded-chip" /><span className="calendar-week-event-copy flex min-w-0 flex-1 flex-col gap-0.75"><b className={`truncate type-label font-normal ${chosen ? "text-on-instrument" : "text-ink"}`}>{event.title}</b><span className="calendar-week-event-meta flex min-w-0 items-center gap-1.25"><i className={`calendar-event-dot is-${event.status} ${DOT} ${dotTone(event.status, chosen)}`} /><small className={`font-code type-mono-sm ${chosen ? "text-on-instrument-muted" : "text-muted"}`}>{formatCalendarTime(event.at, timezone)}</small><span className={`calendar-week-platforms flex gap-0.75 ${chosen ? "text-on-instrument-muted" : "text-muted"}`}>{event.channels.slice(0, 3).map((channel) => { const Icon = platformIcon(channel.platform); return <Icon className={ICON_SM} key={`${channel.id}:${channel.platform}`} />; })}</span>{eventStatusSummary(event) === "attention" && <AlertTriangle className={`${ICON_SM} flex-none text-alert`} />}</span></span></button>; })}{day.key === today && <span className="calendar-now-line pointer-events-none absolute inset-x-0 z-3 h-0.5 bg-ink" style={{ top: `${currentWeekTop(timezone)}px` }}><i className="absolute -top-0.75 left-0 size-1.75 rounded-control bg-ink" /></span>}</div>)}</div></div>
  </div>;
}

function AgendaView({ events, timezone, selectedEventId, tab, onTab, onOpen, onRetry, onReconnect }: { events: CalendarEventDto[]; timezone: string; selectedEventId: string | null; tab: "all" | "attention" | "drafts"; onTab(tab: "all" | "attention" | "drafts"): void; onOpen(event: CalendarEventDto): void; onRetry(event: CalendarEventDto): void; onReconnect(accountId: string | null): void }) {
  const filtered = events.filter((event) => tab === "all" || eventStatusSummary(event) === (tab === "drafts" ? "draft" : "attention"));
  const counts = { all: events.length, attention: events.filter((event) => eventStatusSummary(event) === "attention").length, drafts: events.filter((event) => event.status === "draft").length };
  return <div className="calendar-agenda flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2.75 overflow-hidden rounded-cell bg-surface-sunken p-2 type-base text-ink">
    <div className="calendar-agenda-head flex items-center"><div className="calendar-agenda-tabs flex rounded-field bg-surface p-0.75">{(["all", "attention", "drafts"] as const).map((item) => <button type="button" key={item} className={`flex h-6 items-center gap-1.25 rounded-control px-2.75 type-label transition-colors duration-fast ease-instrument motion-reduce:transition-none motion-reduce:duration-0 ${tab === item ? "is-active bg-instrument text-on-instrument" : "bg-transparent text-muted hover:text-ink"}`} onClick={() => onTab(item)}>{item === "attention" ? "Needs attention" : capitalize(item)} <small className={`font-code type-mono-sm ${tab === item ? "text-on-instrument-muted" : "text-muted"}`}>{counts[item]}</small></button>)}</div><small className="ml-auto font-code type-mono-md text-muted">{filtered.length} of {events.length} publications</small></div>
    {filtered.length === 0 ? <div className={`calendar-good-empty ${STATE_PLATE}`}><CheckCheck className={ICON_STATE} /><strong className="type-md font-normal text-ink">Nothing needs attention</strong><span className="type-sm text-muted">Your scheduled content is in good shape.</span><button type="button" className={`${ACTION} mt-0.75 h-7 px-2.75 type-sm bg-surface text-ink hover:bg-surface-hover`} onClick={() => onTab("all")}>Show all</button></div> : <div className="calendar-agenda-list flex min-h-0 flex-col gap-3.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{groupAgenda(filtered, timezone).map((group) => { const date = agendaDateParts(group.key); return <section className="flex flex-col gap-1.25" key={group.key}><header className="flex items-center gap-2.25 px-1 pb-0.5"><b className={date.today ? "is-today flex h-5 items-center rounded-control bg-desk-primary px-1.75 pl-1.75 font-code type-label font-normal text-desk-primary-ink" : "pl-0.5 font-code type-label font-normal text-ink"}>{date.day}</b><span className="font-code type-mono-md tracking-caps text-muted">{date.label}</span><i className="calendar-agenda-day-line hidden" /><small className="font-code type-mono-md tracking-normal text-muted">{group.events.length} {group.events.length === 1 ? "publication" : "publications"}</small></header>{group.events.map((event) => { const bad = event.channels.find((channel) => channel.status === "failed" || channel.status === "disconnected"); const chosen = event.id === selectedEventId; return <div className={`calendar-agenda-row flex min-h-15.5 items-center rounded-control transition-colors duration-fast ease-instrument motion-reduce:transition-none motion-reduce:duration-0 ${chosen ? " is-selected bg-instrument text-on-instrument" : "bg-transparent text-ink hover:bg-surface"}`} key={event.id}><button type="button" className="calendar-agenda-event flex min-w-0 flex-1 items-center gap-3 rounded-control px-2.5 py-2 text-left" onClick={() => onOpen(event)}><b className={`calendar-agenda-time w-10.5 flex-none font-code type-sm font-normal ${chosen ? "text-on-instrument-muted" : "text-ink"}`}>{event.at === null ? "—" : formatCalendarTime(event.at, timezone)}</b><CalendarThumb event={event} className="h-11.5 w-8.5 rounded-chip" /><span className="calendar-agenda-copy flex min-w-0 flex-1 flex-col gap-1"><strong className={`flex min-w-0 items-center gap-1.75 truncate type-base font-normal ${chosen ? "text-on-instrument" : "text-ink"}`}><i className={`calendar-event-dot is-${event.status} ${DOT} ${dotTone(event.status, chosen)}`} />{event.title}</strong><small className={`truncate font-code type-mono-sm ${chosen ? "text-on-instrument-muted" : "text-muted"}`}>{event.project} · R{event.pinnedRevision} · {event.kind}</small></span><span className="calendar-agenda-channels flex flex-none flex-col items-end gap-1">{event.channels.map((channel) => { const Icon = platformIcon(channel.platform); return <span className={`calendar-agenda-channel is-${channel.status} flex items-center gap-1.5 ${chosen ? "text-on-instrument-muted" : "text-muted"}`} key={`${channel.id}:${channel.platform}`}><b className="font-code type-mono-md font-normal">{channel.account} · {agendaChannelNote(channel, event.at, timezone)}</b><Icon className={ICON_MD} /></span>; })}</span></button>{bad && <button type="button" className={`calendar-agenda-action ${ACTION} mr-2.5 h-6.5 px-2.75 type-label bg-surface text-ink hover:bg-surface-hover`} onClick={() => bad.status === "failed" ? onRetry(event) : onReconnect(bad.accountId)}>{bad.status === "disconnected" ? "Reconnect" : "Retry"}</button>}</div>; })}</section>; })}</div>}
  </div>;
}

function CalendarEventButton({ event, timezone, lead = false, selected = false, onClick }: { event: CalendarEventDto; timezone: string; lead?: boolean; selected?: boolean; onClick(): void }) {
  return <button {...entityDragProps(scheduledAttachment(event, timezone))} type="button" className={`calendar-event flex w-full min-w-0 items-center gap-1 overflow-hidden rounded-full px-1.5 py-1 text-left type-xs leading-4 transition-colors duration-fast ease-instrument motion-reduce:transition-none motion-reduce:duration-0${lead ? " is-lead h-10.75" : ""}${selected ? " is-selected bg-instrument text-on-instrument hover:bg-instrument-hover" : lead ? " bg-surface text-ink hover:bg-surface-hover" : " bg-surface text-ink hover:bg-surface-sunken"} is-${event.status}`} onClick={onClick}>{lead && <CalendarThumb event={event} className="h-9 w-7.5 rounded-full" />}<span className="flex min-w-0 flex-1 flex-col gap-0.25"><b className={`block truncate font-medium ${lead ? "type-xs" : "type-mono-md"} ${selected ? "text-on-instrument" : "text-ink"}`}>{event.title}</b><small className={`block truncate font-code type-mono-xs ${selected ? "text-on-instrument-muted" : "text-muted"}`}>{formatCalendarTime(event.at, timezone)} · {event.channels.length} {event.channels.length === 1 ? "publication" : "publications"}</small></span>{eventStatusSummary(event) === "attention" && <AlertTriangle className={`${ICON_SM} flex-none text-alert`} />}</button>;
}

/**
 * The poster placeholder for a publication. One flat identity tone taken from the Unit's own name,
 * the same ramp every other identity mark in the instrument reads -- not the two stacked gradients
 * and blend-mode grain it used to draw.
 */
function CalendarThumb({ event, className = "" }: { event: { id?: string; unitId?: string; projectId?: string | null; title: string; thumbnail?: { type: "artifact-revision"; id: string } | null }; className?: string }) {
  const workspaceId = useContext(CalendarWorkspaceContext);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    setUrl(null); setFailed(false);
    if (!workspaceId || !event.thumbnail) return () => { current = false; };
    void bridge.resolveCalendarPreview(workspaceId, event.projectId ?? null, event.thumbnail)
      .then((preview) => { if (current) setUrl(preview.url); })
      .catch(() => undefined);
    return () => { current = false; };
  }, [event.projectId, event.thumbnail?.id, workspaceId]);
  const identity = event.id ?? event.unitId ?? event.title;
  return <span className={`calendar-thumb relative flex flex-none items-center justify-center overflow-hidden text-(--glyph-color) [background:color-mix(in_srgb,var(--glyph-color)_18%,var(--instrument-widget-light-sunken))] [&_img]:size-full [&_img]:object-cover ${className}`} style={projectGlyphVars(identity)} aria-hidden="true">{url && !failed ? <img src={url} alt="" onError={() => setFailed(true)} /> : <i className="font-code type-sm not-italic">{event.title.slice(0, 1)}</i>}</span>;
}

function AccountMark({ identity }: { identity: string }) {
  const value = hash(identity);
  return <span className="calendar-account-mark grid size-7 flex-none place-items-center rounded-identity [background:color-mix(in_oklab,var(--glyph-color)_15%,var(--instrument-widget-light-sunken))]" style={{ ...projectGlyphVars(identity), "--calendar-account-mask": `url('../assets/dither/g${value % 8 + 1}.png')` } as CSSProperties}><i className="block size-5 bg-(--glyph-color) [mask-image:var(--calendar-account-mask)] [mask-repeat:no-repeat] [mask-size:100%_100%]" /></span>;
}

function EventInspector({ event, postizAvailable, onClose, onOpenUnit, onMutate }: { event: CalendarEventDto; postizAvailable: boolean; onClose(): void; onOpenUnit(): void; onMutate(input: Parameters<typeof bridge.mutateCalendar>[1]): void }) {
  return <aside className={`calendar-inspector w-calendar-inspector ${OVERLAY_PANEL}`} data-instrument-overlay="calendar-inspector">
    <header className="flex flex-none items-center gap-1.5 px-2.75 pt-2.75"><small className="pl-0.75 font-code type-mono-md tracking-block text-muted">PUBLICATION</small><i className="flex-1" /><button type="button" className={`${PANEL_HEADER_ACTION} bg-surface-sunken text-ink hover:bg-surface-hover disabled:opacity-35`} disabled={event.projectId === null} onClick={onOpenUnit}><ArrowUpRight className={ICON} />Open Unit</button><button type="button" className={`${PANEL_HEADER_ACTION} bg-transparent text-muted hover:bg-surface-sunken hover:text-ink`} aria-label="Close inspector" onClick={onClose}><X className={ICON} /></button></header>
    <div className="calendar-inspector-scroll flex min-h-0 flex-col gap-3.75 overflow-y-auto px-3.5 pb-4 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <section className="calendar-event-summary flex gap-3"><CalendarThumb event={event} className="h-20.5 w-14.5 rounded-field" /><span className="flex min-w-0 flex-col gap-1.5 pt-0.5"><strong className="type-lg font-normal leading-headline text-ink">{event.title}</strong><small className="font-code type-mono-md text-muted">{event.project} · {event.kind}</small><b className={`calendar-status is-${event.status} inline-flex w-max items-center rounded-control type-mono-md font-normal ${event.status === "published" ? "text-ink" : "text-muted"}`}>{STATUS_LABEL[event.status]}</b></span></section>
      <section className={`calendar-date-card ${PANEL_CARD}`}><CalendarClock className={`${ICON_XL} text-muted`} /><span className="flex min-w-0 flex-1 flex-col gap-0.5"><strong className="type-base font-normal text-ink">{event.at === null ? "No time · Draft" : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: event.timezone }).format(event.at)}</strong><small className="font-code type-mono-md text-muted">{event.timezone}</small></span></section>
      <label className={BLOCK_LABEL}>PINNED REVISION</label><section className={`calendar-revision-card ${PANEL_CARD} flex-col items-stretch gap-2.25`}><span className="flex items-center gap-2 type-ui text-ink"><GitCommitHorizontal className={ICON} />Scheduled with <b>R{event.pinnedRevision}</b></span>{event.unitSelectedRevision !== null && event.unitSelectedRevision !== event.pinnedRevision && <p className="m-0 flex gap-2 type-sm leading-row text-muted"><AlertTriangle className={`${ICON} flex-none`} />A newer revision R{event.unitSelectedRevision} is selected in Units.</p>}</section>
      <label className={BLOCK_LABEL}>{event.channels.length} CHANNELS</label><section className="calendar-channel-list flex flex-col gap-1.25">{event.channels.map((channel) => { const Icon = platformIcon(channel.platform); return <div className="flex items-center gap-2.5 rounded-field bg-surface-sunken px-2.25 py-2" key={`${channel.id}:${channel.platform}`}><AccountMark identity={`${channel.platform}:${channel.account}`} /><span className="flex min-w-0 flex-1 flex-col gap-0.75"><strong className="flex items-center gap-1.5 type-ui font-normal text-ink"><Icon className={`${ICON} text-muted`} />{channel.account}</strong><small className={`is-${channel.status} type-mono-md ${channel.status === "failed" || channel.status === "disconnected" ? "text-ink" : "text-muted"}`}>{capitalize(channel.status)}{channel.error ? ` · ${channel.error}` : ""}</small></span>{channel.status === "failed" && <button type="button" className={`grid h-6.5 min-w-6.5 place-items-center rounded-control bg-surface px-2 type-xs text-ink transition-colors duration-fast ease-instrument hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`} disabled={!postizAvailable} onClick={() => onMutate({ action: "retry", eventId: event.id, expectedRowVersion: event.rowVersion })}>Retry</button>}{channel.postUrl && <button type="button" className={`grid size-6.5 place-items-center rounded-control bg-surface text-ink transition-colors duration-fast ease-instrument hover:bg-surface-hover motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`} aria-label="Open published post" onClick={() => window.open(channel.postUrl!, "_blank", "noopener,noreferrer")}><ArrowUpRight className={ICON} /></button>}</div>; })}</section>
      {event.metrics && <><label className={BLOCK_LABEL}>PERFORMANCE</label><section className="calendar-metrics grid grid-cols-4 gap-0.5 rounded-field bg-surface-sunken px-1 py-3">{[[event.metrics.views, "VIEWS"], [event.metrics.likes, "LIKES"], [event.metrics.comments, "COMMENTS"], [event.metrics.shares, "SHARES"]].map(([value, label]) => <span className="flex flex-col items-center gap-1" key={label}><strong className="font-code type-md font-normal text-ink">{value ?? "—"}</strong><small className="font-code type-mono-sm tracking-label text-muted">{label}</small></span>)}</section><small className="calendar-synced flex items-center gap-1.5 text-muted"><RefreshCw className={ICON_MD} />Last synced {new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(event.metrics.syncedAt)}</small></>}
      {event.status !== "draft" && <section className="calendar-inspector-actions flex flex-col gap-1.5"><button type="button" className={`${ACTION} h-7.5 w-full gap-1.75 type-sm bg-surface-sunken text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-35 ${OVERLAY_RING}`} onClick={() => onMutate({ action: "remove", eventId: event.id, expectedRowVersion: event.rowVersion })}><FilePenLine className={ICON} />Move to draft</button></section>}
    </div>
  </aside>;
}

function ReadyDrawer({ units, onClose, onSchedule }: { units: CalendarReadyUnitDto[]; onClose(): void; onSchedule(unit: CalendarReadyUnitDto): void }) {
  const [tab, setTab] = useState<"all" | "ready" | "review" | "blocked">("all");
  const visible = units.filter((unit) => tab === "all" || unit.readiness === tab || (tab === "blocked" && unit.readiness === "draft"));
  return <aside className={`calendar-ready-drawer w-calendar-drawer ${OVERLAY_PANEL}`} data-instrument-overlay="calendar-drawer"><header className="flex flex-none items-center gap-1.5 px-3 pb-2.5 pt-3"><span className="pl-0.5 type-md">Ready to schedule</span><small className="flex h-4.75 items-center rounded-control bg-surface-sunken px-1.75 font-code type-mono-md text-ink">{units.length}</small><i className="flex-1" /><button type="button" className={`${PANEL_HEADER_ACTION} bg-transparent text-muted hover:bg-surface-sunken hover:text-ink`} aria-label="Close ready drawer" onClick={onClose}><X className={ICON} /></button></header><nav className="mx-3 mb-2.5 flex rounded-field bg-surface-sunken p-0.75">{(["all", "ready", "review", "blocked"] as const).map((item) => <button type="button" key={item} className={`flex h-6 flex-1 items-center justify-center gap-1 rounded-control px-1.5 type-xs transition-colors duration-fast ease-instrument motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING} ${tab === item ? "is-active bg-instrument text-on-instrument" : "bg-transparent text-muted hover:text-ink"}`} onClick={() => setTab(item)}>{capitalize(item)} <small className={`font-code type-mono-sm ${tab === item ? "text-on-instrument-muted" : "text-muted"}`}>{units.filter((unit) => item === "all" || unit.readiness === item || (item === "blocked" && unit.readiness === "draft")).length}</small></button>)}</nav><div className="flex min-h-0 flex-col gap-1 overflow-y-auto px-2.5 pb-2">{visible.map((unit) => <button type="button" className={`calendar-ready-row flex w-full items-center gap-2.5 rounded-control p-2 text-left transition-colors duration-fast ease-instrument hover:bg-surface-sunken motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING} ${unit.unitRevisionId !== null ? "cursor-grab" : ""}`} key={unit.unitId} draggable={unit.unitRevisionId !== null} onDragStart={(event: ReactDragEvent<HTMLButtonElement>) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData(CALENDAR_UNIT_DRAG, unit.unitId); event.dataTransfer.setData(RALPHY_ENTITY_DRAG, JSON.stringify({ kind: "unit", ref: unit.title, label: unit.title })); }} onClick={() => onSchedule(unit)}><CalendarThumb event={unit} className="h-11.75 w-8.5 rounded-chip" /><span className="flex min-w-0 flex-1 flex-col gap-1"><strong className="truncate type-ui font-normal text-ink">{unit.title}</strong><small className="truncate font-code type-mono-md text-muted">{unit.project} · R{unit.revision ?? "—"} · {unit.kind}</small><b className={`type-mono-md font-normal ${unit.readiness === "ready" ? "text-ink" : "text-muted"}`}>{unit.note ?? (unit.readiness === "ready" ? "Ready to schedule" : capitalize(unit.readiness))}</b></span><GripVertical className={`${ICON} text-muted`} /></button>)}{visible.length === 0 && <div className={`calendar-drawer-empty ${STATE_LINE}`}><Check className={ICON_MD} />Nothing in this queue</div>}</div><footer className="mx-2.5 mb-2.5 rounded-field bg-surface-sunken px-2.75 py-2.5 type-xs leading-prose text-muted">Drag a unit onto a date — the drop opens the scheduling form with that date filled in. Nothing publishes on drop.</footer></aside>;
}

type CalendarPublicationSettings = Record<string, Record<string, JsonValue>>;

function ScheduleDialog({ open, unit, units, accounts, step, initialDate, timezone, postizAvailable, saving, onOpenChange, onSelect, onStep, onSave, onReconnect, onOpenUnit }: { open: boolean; unit: CalendarReadyUnitDto | null; units: CalendarReadyUnitDto[]; accounts: CalendarWorkspaceDto["accounts"]; step: "content" | "settings"; initialDate: string | null; timezone: string; postizAvailable: boolean; saving: boolean; onOpenChange(open: boolean): void; onSelect(unit: CalendarReadyUnitDto): void; onStep(step: "content" | "settings"): void; onSave(submit: boolean, at: number, channels: CalendarChannelInput[], unitRevisionId: string): void; onReconnect(accountId: string | null): void; onOpenUnit(): void }) {
  const [date, setDate] = useState(() => initialDate ?? calendarDayKey(Date.now(), timezone));
  const [time, setTime] = useState("10:00");
  const [caption, setCaption] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [schedulePicker, setSchedulePicker] = useState<"date" | "time" | null>(null);
  const [revisionSelection, setRevisionSelection] = useState<{ unitId: string; revisionId: string } | null>(null);
  const [selection, setSelection] = useState<{ revisionId: string; ids: string[] } | null>(null);
  const [settings, setSettings] = useState<CalendarPublicationSettings>({});
  const [editedIds, setEditedIds] = useState<Set<string>>(() => new Set());
  const [platformTab, setPlatformTab] = useState<string | null>(null);
  const disconnectedIds = useMemo(() => new Set(accounts.filter((account) => account.disconnected).map((account) => account.id)), [accounts]);
  const revisionId = revisionSelection && revisionSelection.unitId === unit?.unitId ? revisionSelection.revisionId : unit?.unitRevisionId ?? "";
  const activeRevision = unit?.revisions.find((revision) => revision.unitRevisionId === revisionId) ?? null;
  const channels = activeRevision?.channels ?? unit?.channels ?? [];
  const defaultSelectedIds = channels.filter((channel) => !disconnectedIds.has(channel.socialAccountId)).map(channelKey);
  const selectedIds = selection?.revisionId === revisionId ? selection.ids : defaultSelectedIds;

  useEffect(() => {
    if (!open) return;
    setDate(initialDate ?? calendarDayKey(Date.now(), timezone)); setTime("10:00"); setPickerOpen(false); setSchedulePicker(null);
    if (!unit && units[0]) onSelect(units[0]);
  }, [open, timezone, initialDate]);

  useEffect(() => {
    if (!open || !unit) return;
    setRevisionSelection({ unitId: unit.unitId, revisionId: unit.unitRevisionId ?? unit.revisions.at(-1)?.unitRevisionId ?? "" });
  }, [open, unit?.unitId]);

  useEffect(() => {
    if (!open || !unit || !revisionId) return;
    const selectable = channels.filter((channel) => !disconnectedIds.has(channel.socialAccountId));
    setSelection({ revisionId, ids: selectable.map(channelKey) });
    setSettings(settingsForChannels(channels));
    setEditedIds(new Set());
    setPlatformTab((current) => channels.some((channel) => channelKey(channel) === current) ? current : channels[0] ? channelKey(channels[0]) : null);
    setCaption(`${unit.title} — ready for the next drop.`);
  }, [open, revisionId, disconnectedIds]);

  const selectedChannels = channels.filter((channel) => selectedIds.includes(channelKey(channel)));
  const toggleChannel = (id: string) => setSelection({ revisionId, ids: selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id] });
  const updateSetting = (presentationId: string, key: string, value: JsonValue) => {
    setSettings((current) => ({ ...current, [presentationId]: { ...(current[presentationId] ?? {}), [key]: value } }));
    setEditedIds((current) => new Set(current).add(presentationId));
  };
  const payload = (): CalendarChannelInput[] => selectedChannels.map((channel) => ({ presentationId: channel.presentationId, socialAccountId: channel.socialAccountId, settings: { ...(settings[channelKey(channel)] ?? {}), caption } }));
  const at = () => zonedDateTimeToEpoch(date, time, timezone);
  const revisions = unit?.revisions ?? [];
  const latestRevision = revisions.at(-1)?.revision ?? unit?.revision ?? null;
  const poster = unit ? { ...unit, thumbnail: activeRevision?.thumbnail ?? unit.thumbnail } : null;

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>{open && <><Dialog.Overlay forceMount className={`calendar-modal-overlay ${OVERLAY_SCRIM} animate-calendar-fade motion-reduce:animate-none`} data-instrument-overlay-backdrop="" /><Dialog.Content forceMount className="calendar-modal fixed inset-0 z-scrim-content m-auto flex h-calendar-modal-height w-calendar-modal-width flex-col overflow-hidden rounded-panel bg-surface p-0 text-ink animate-calendar-modal-in motion-reduce:animate-none" data-instrument-overlay="calendar-schedule">
    <header className="flex flex-none items-center gap-4 bg-surface-sunken px-6 pb-3.5 pt-4.5"><div className="flex min-w-0 flex-1 flex-col gap-1.5"><small className={MODAL_FIELD_LABEL}>{step === "content" ? "SCHEDULE CONTENT" : "PLATFORM SETTINGS"}</small><Dialog.Title className="m-0 truncate type-heading font-normal tracking-normal text-ink">{unit?.title ?? "Schedule content"}</Dialog.Title><Dialog.Description className="calendar-modal-description sr-only">Choose a Unit, publishing accounts, time, and publication-specific platform settings.</Dialog.Description></div><button type="button" className={`calendar-open-unit ${ACTION} h-7 px-2.75 type-sm bg-surface text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-35 ${OVERLAY_RING}`} disabled={!unit?.projectId} onClick={onOpenUnit}><ArrowUpRight className={ICON} />Open Unit</button><Dialog.Close asChild><button type="button" className={`grid size-7 flex-none place-items-center rounded-control text-muted transition-colors duration-fast ease-instrument hover:bg-surface hover:text-ink motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`} aria-label="Close schedule content"><X className={ICON} /></button></Dialog.Close></header>
    <div className="calendar-modal-layout grid min-h-0 flex-1 grid-cols-(--calendar-modal-columns) gap-5.5 px-6 pb-5 pt-1">
      <aside className="calendar-modal-unit relative flex w-75 flex-col gap-3">
        <div className="calendar-modal-poster-wrap relative h-100 w-75 flex-none">{poster ? <CalendarThumb event={poster} className="calendar-modal-poster h-100 w-75 rounded-poster [&_i]:type-poster-glyph" /> : <span className="calendar-modal-poster is-empty block h-100 w-75 rounded-poster bg-surface-sunken" />}<span className="absolute left-2.5 top-2.5 flex h-5 items-center rounded-chip bg-media-plate px-2 font-code type-mono-md text-on-instrument">{unit?.kind ?? "No unit"}</span></div>
        <section className="flex flex-col gap-1.75"><label className={MODAL_FIELD_LABEL}>REVISION TO PUBLISH</label><div className="calendar-revision-picker flex gap-1.25">{revisions.map((revision) => <button type="button" className={`${ACTION} h-6.5 px-2.5 font-code type-label ${revision.unitRevisionId === revisionId ? "is-active bg-instrument text-on-instrument" : "bg-surface-sunken text-muted hover:bg-surface hover:text-ink"} ${OVERLAY_RING}`} key={revision.unitRevisionId} onClick={() => setRevisionSelection({ unitId: unit!.unitId, revisionId: revision.unitRevisionId })}>R{revision.revision}</button>)}</div>{activeRevision && latestRevision !== null && activeRevision.revision < latestRevision ? <small className="is-warning flex items-start gap-1.25 font-code type-mono-sm leading-prose text-muted"><AlertTriangle className={`${ICON_MD} mt-0.5 flex-none`} />R{activeRevision.revision} is older than the latest R{latestRevision}. This publication will stay pinned to R{activeRevision.revision}.</small> : <small className="font-code type-mono-sm leading-prose text-muted">R{activeRevision?.revision ?? unit?.revision ?? "—"} is pinned to this publication. Calendar keeps it when the Unit selection changes.</small>}</section>
        <button type="button" className={`calendar-pick-unit ${ACTION} h-7.5 gap-1.75 px-2.75 type-sm bg-surface-sunken text-ink hover:bg-surface ${OVERLAY_RING}`} onClick={() => setPickerOpen((value) => !value)}><Repeat className={ICON_LG} />Pick another unit</button>
        {pickerOpen && <div className="calendar-unit-popover absolute inset-x-0 bottom-10 z-4 flex max-h-75 flex-col gap-0.75 overflow-y-auto rounded-cell bg-surface-sunken p-1.5" data-instrument-overlay="calendar-unit-picker">{units.map((item) => { const chosen = item.unitId === unit?.unitId; return <button type="button" key={item.unitId} className={`flex min-h-13.5 items-center gap-2.5 rounded-control px-1.75 py-1.5 text-left transition-colors duration-fast ease-instrument motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING} ${chosen ? " is-selected bg-instrument text-on-instrument" : "bg-transparent text-ink hover:bg-surface"}`} onClick={() => { onSelect(item); setPickerOpen(false); }}><CalendarThumb event={item} className="h-11.5 w-8.5 rounded-chip" /><span className="flex min-w-0 flex-1 flex-col gap-1"><strong className={`truncate type-sm font-normal ${chosen ? "text-on-instrument" : "text-ink"}`}>{item.title}</strong><small className={`font-code type-mono-sm ${chosen ? "text-on-instrument-muted" : "text-muted"}`}>{item.project} · R{item.revision ?? "—"} · {item.kind}</small></span>{chosen && <Check className={ICON} />}</button>; })}</div>}
      </aside>
      {step === "content" ? <section className="calendar-schedule-form flex min-w-0 flex-col gap-4">
        <div className="calendar-date-fields grid grid-cols-(--calendar-date-columns) gap-2.5"><div className="flex min-w-0 flex-col gap-1.75"><span className={MODAL_FIELD_LABEL}>DATE</span><span className="calendar-picker-wrap relative block min-w-0"><button type="button" className={`calendar-picker-trigger flex h-8.5 w-full items-center gap-2.25 rounded-control bg-surface-sunken px-2.75 text-left transition-colors duration-fast ease-instrument hover:bg-surface aria-expanded:bg-surface motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`} aria-label="Choose publication date" aria-expanded={schedulePicker === "date"} onClick={() => setSchedulePicker((value) => value === "date" ? null : "date")}><CalendarClock className={`${ICON} flex-none text-muted`} /><b className="min-w-0 flex-1 truncate font-code type-sm font-normal text-ink">{formatInputDate(date)}</b><ChevronDown className={`${ICON} flex-none text-muted`} /></button>{schedulePicker === "date" && <CalendarDatePicker value={date} onChange={(value) => { setDate(value); setSchedulePicker(null); }} onClose={() => setSchedulePicker(null)} />}</span></div><div className="flex min-w-0 flex-col gap-1.75"><span className={MODAL_FIELD_LABEL}>TIME</span><span className="calendar-picker-wrap relative block min-w-0"><button type="button" className={`calendar-picker-trigger flex h-8.5 w-full items-center gap-2.25 rounded-control bg-surface-sunken px-2.75 text-left transition-colors duration-fast ease-instrument hover:bg-surface aria-expanded:bg-surface motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`} aria-label="Choose publication time" aria-expanded={schedulePicker === "time"} onClick={() => setSchedulePicker((value) => value === "time" ? null : "time")}><Clock3 className={`${ICON} flex-none text-muted`} /><b className="min-w-0 flex-1 truncate font-code type-sm font-normal text-ink">{time}</b><ChevronDown className={`${ICON} flex-none text-muted`} /></button>{schedulePicker === "time" && <CalendarTimePicker value={time} onChange={setTime} onClose={() => setSchedulePicker(null)} />}</span></div><div className="flex min-w-0 flex-col gap-1.75"><span className={MODAL_FIELD_LABEL}>TIMEZONE</span><span className="calendar-timezone-field flex h-8.5 items-center gap-2.25 truncate whitespace-nowrap rounded-control bg-surface-sunken px-2.75 font-code type-sm text-ink"><Globe2 className={`${ICON} flex-none text-muted`} />{timezoneLabel(timezone)} · {timezone.split("/").at(-1)}</span></div></div>
        <section className="calendar-channel-section flex flex-col gap-1.75"><header className="flex items-center gap-2.25"><span className={MODAL_FIELD_LABEL}>CHANNELS</span><small className="font-code type-mono-md text-muted">{selectedChannels.length} of {channels.filter((channel) => !disconnectedIds.has(channel.socialAccountId)).length} available selected{channels.some((channel) => disconnectedIds.has(channel.socialAccountId)) ? ` · ${channels.filter((channel) => disconnectedIds.has(channel.socialAccountId)).length} needs reconnect` : ""}</small><i className="flex-1" /><button type="button" className={`${ACTION} h-6 px-2.25 type-label bg-surface-sunken text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-35 ${OVERLAY_RING}`} disabled={!unit} onClick={() => onStep("settings")}><SlidersHorizontal className={ICON_MD} />Platform settings</button></header><div className="calendar-modal-channels grid grid-cols-2 gap-1.5">{channels.map((channel) => { const id = channelKey(channel); const Icon = platformIcon(channel.platform); const disconnected = disconnectedIds.has(channel.socialAccountId); const chosen = selectedIds.includes(id); const content = <><AccountMark identity={`${channel.platform}:${channel.account}`} /><span className={MODAL_ROW_COPY}><strong className={`flex items-center gap-1.5 truncate type-ui font-normal ${chosen ? "text-on-instrument" : "text-ink"}`}><Icon className={`${ICON_LG} flex-none ${chosen ? "text-on-instrument-muted" : "text-muted"}`} />{channel.account}</strong><small className={`truncate font-code type-mono-sm ${chosen ? "text-on-instrument-muted" : "text-muted"}`}>{disconnected ? "Token expired — reconnect to publish" : `${capitalize(channel.platform)} · ready`}</small></span>{disconnected ? <button type="button" className={`${ACTION} h-5.5 px-2.25 type-xs bg-surface text-ink hover:bg-surface-hover ${OVERLAY_RING}`} onClick={() => onReconnect(channel.socialAccountId)}>Reconnect</button> : <i className={`calendar-check-box ${CHECK_BOX} ${chosen ? "bg-on-instrument" : "bg-surface"}`}>{chosen && <Check className={`${ICON_MD} ${CHECK_MARK_ON_INSTRUMENT}`} strokeWidth={2.6} />}</i>}</>; return disconnected ? <div className={`calendar-channel-option is-disconnected ${MODAL_ROW} bg-surface-sunken text-ink`} key={id}>{content}</div> : <button type="button" className={`calendar-channel-option ${MODAL_ROW} ${chosen ? " is-selected bg-instrument text-on-instrument" : " bg-surface-sunken text-ink hover:bg-surface"}`} key={id} onClick={() => toggleChannel(id)}>{content}</button>; })}</div></section>
        <label className={`calendar-caption-field flex min-w-0 flex-col gap-1.75 ${OVERLAY_FIELD_RING}`}><span className={MODAL_FIELD_LABEL}>CAPTION</span><div className="flex flex-col gap-2 rounded-field bg-surface-sunken px-3 py-2.5"><textarea className="h-9.5 resize-none bg-transparent p-0 type-ui leading-prose text-ink outline-none" value={caption} onChange={(event) => setCaption(event.target.value)} /><footer className="flex items-center gap-2"><b className="flex h-5.5 items-center rounded-control bg-surface px-2 font-code type-mono-md font-normal text-ink">#ralphy</b><b className="flex h-5.5 items-center rounded-control bg-surface px-2 font-code type-mono-md font-normal text-ink">#content</b><small className="ml-auto font-code type-mono-sm text-muted">1 caption for all channels</small></footer></div></label>
      </section> : <PlatformSettings unit={unit} channels={channels} accounts={accounts} activeId={platformTab} editedIds={editedIds} settings={settings} onActive={setPlatformTab} onChange={updateSetting} onReconnect={onReconnect} />}
    </div>
    <footer className="flex flex-none items-center gap-4.5 bg-surface-sunken px-6 pb-4.25 pt-3.25"><small className="max-w-calendar-note font-code type-mono-sm leading-row text-muted">{step === "content" ? "Published through Postiz — selected accounts leave as one publication. Channel staggering lives in Platform settings." : "Settings belong to this publication, not the account. The next publication starts from platform defaults."}</small><span className="ml-auto flex gap-2">{step === "content" ? <><button type="button" className={`${OVERLAY_ACTION} disabled:cursor-not-allowed disabled:opacity-35`} disabled={!unit || saving || selectedChannels.length === 0} onClick={() => onSave(false, at(), payload(), revisionId)}>Save as draft</button><button type="button" className={`calendar-primary ${OVERLAY_ACTION_PRIMARY} disabled:cursor-not-allowed disabled:opacity-35`} disabled={!unit || !postizAvailable || saving || selectedChannels.length === 0} onClick={() => onSave(true, at(), payload(), revisionId)}>{saving ? "Saving…" : `Schedule ${selectedChannels.length} ${selectedChannels.length === 1 ? "publication" : "publications"}`}</button></> : <><button type="button" className={OVERLAY_ACTION} onClick={() => { setSettings(settingsForChannels(channels)); setEditedIds(new Set()); }}>Reset to defaults</button><button type="button" className={`calendar-primary ${OVERLAY_ACTION_PRIMARY}`} onClick={() => onStep("content")}><ArrowLeft className={ICON_LG} />Back to schedule</button></>}</span></footer>
  </Dialog.Content></>}</Dialog.Root>;
}

function CalendarDatePicker({ value, onChange, onClose }: { value: string; onChange(value: string): void; onClose(): void }) {
  const selected = new Date(`${value}T12:00:00`);
  const [anchor, setAnchor] = useState(() => selected);
  const ref = usePickerDismiss(onClose);
  const days = monthDays(anchor);
  const title = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(anchor);
  const today = localDateKey(new Date());
  return <div className="calendar-date-popover absolute left-0 top-[calc(100%+7px)] z-12 w-calendar-date-popover rounded-cell bg-surface p-2.5 text-ink outline-0" data-instrument-overlay="calendar-date-popover" role="dialog" aria-label="Publication date" ref={ref} tabIndex={-1} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <header className="flex h-7.5 items-center px-0.75"><strong className="type-sm font-normal text-ink">{title}</strong><span className="ml-auto flex gap-0.5"><button type="button" className={`grid size-6.75 place-items-center rounded-control text-muted transition-colors duration-fast ease-instrument hover:bg-surface-hover hover:text-ink motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`} aria-label="Previous month" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}><ChevronLeft className={ICON} /></button><button type="button" className={`grid size-6.75 place-items-center rounded-control text-muted transition-colors duration-fast ease-instrument hover:bg-surface-hover hover:text-ink motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`} aria-label="Next month" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}><ChevronRight className={ICON} /></button></span></header>
    <div className="calendar-picker-weekdays grid grid-cols-7 gap-0.5 pb-0.75 pt-1.25">{DOW.map((day) => <small className="grid h-5.5 place-items-center font-code type-mono-sm text-muted" key={day}>{day.slice(0, 1)}</small>)}</div>
    <div className="calendar-picker-days grid grid-cols-7 gap-0.5">{days.map((day) => <button type="button" className={`${PICKER_DAY} ${day.key === value ? " is-selected bg-desk-primary text-desk-primary-ink" : day.key === today ? " is-today bg-transparent text-ink [box-shadow:inset_0_0_0_1px_var(--instrument-text-primary)]" : day.inMonth ? "bg-transparent text-ink hover:bg-surface-hover" : "is-outside bg-transparent text-muted hover:bg-surface-hover"}`} aria-label={`Choose ${new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(day.date)}`} key={day.key} onClick={() => onChange(day.key)}>{day.date.getDate()}</button>)}</div>
    <footer className="flex justify-end px-0.5 pt-1.75"><button type="button" className={`flex h-6.25 items-center rounded-control bg-surface-sunken px-2.25 type-xs text-ink transition-colors duration-fast ease-instrument hover:bg-surface-hover motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`} onClick={() => { const key = localDateKey(new Date()); onChange(key); }}>Today</button></footer>
  </div>;
}

function CalendarTimePicker({ value, onChange, onClose }: { value: string; onChange(value: string): void; onClose(): void }) {
  const [hour, minute] = value.split(":").map(Number);
  const ref = usePickerDismiss(onClose);
  const selectedHour = useRef<HTMLButtonElement>(null);
  useEffect(() => { selectedHour.current?.scrollIntoView?.({ block: "center" }); }, []);
  const setHour = (next: number) => onChange(`${String(next).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  const setMinute = (next: number) => { onChange(`${String(hour).padStart(2, "0")}:${String(next).padStart(2, "0")}`); onClose(); };
  const cell = (active: boolean) => `${PICKER_CELL} ${active ? " is-selected bg-desk-primary text-desk-primary-ink" : "bg-transparent text-muted hover:bg-surface-hover hover:text-ink"}`;
  return <div className="calendar-time-popover absolute left-0 top-[calc(100%+7px)] z-12 w-calendar-time-popover rounded-cell bg-surface p-2.5 text-ink outline-0" data-instrument-overlay="calendar-time-popover" role="dialog" aria-label="Publication time" ref={ref} tabIndex={-1} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <header className="flex h-7.5 items-center px-0.5 pb-1.75"><strong className="type-sm font-normal text-ink">TIME</strong><small className="ml-auto font-code type-mono-sm text-muted">24 HOUR</small></header>
    <div className="grid grid-cols-2 gap-1.5"><section className="flex max-h-63 flex-col gap-0.5 overflow-y-auto rounded-field bg-surface-sunken p-0.75 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Hours">{Array.from({ length: 24 }, (_, item) => <button type="button" className={cell(item === hour)} aria-label={`Set hour ${String(item).padStart(2, "0")}`} ref={item === hour ? selectedHour : undefined} key={item} onClick={() => setHour(item)}>{String(item).padStart(2, "0")}</button>)}</section><section className="flex max-h-63 flex-col gap-0.5 overflow-y-auto rounded-field bg-surface-sunken p-0.75 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Minutes">{Array.from({ length: 12 }, (_, item) => item * 5).map((item) => <button type="button" className={cell(item === minute)} aria-label={`Set minute ${String(item).padStart(2, "0")}`} key={item} onClick={() => setMinute(item)}>{String(item).padStart(2, "0")}</button>)}</section></div>
  </div>;
}

function usePickerDismiss(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => { if (!ref.current?.parentElement?.contains(event.target as Node)) onClose(); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [onClose]);
  return ref;
}

function ReconnectDialog({ account, credential, saving, onCredential, onOpenChange, onSave }: { account: CalendarWorkspaceDto["accounts"][number] | null; credential: string; saving: boolean; onCredential(value: string): void; onOpenChange(open: boolean): void; onSave(): void }) {
  return <Dialog.Root open={account !== null} onOpenChange={onOpenChange}>{account && <><Dialog.Overlay forceMount className="calendar-reconnect-overlay fixed inset-0 z-inspector" data-instrument-overlay-backdrop="" /><Dialog.Content forceMount className="calendar-reconnect-dialog fixed inset-0 z-inspector-float m-auto flex h-fit w-calendar-reconnect flex-col gap-4 rounded-widget bg-surface p-5 text-ink" data-instrument-overlay="calendar-reconnect">
    <header className="flex items-start gap-4"><span className="flex min-w-0 flex-1 flex-col gap-1.25"><Dialog.Title className="m-0 type-heading font-normal text-ink">Reconnect {account.handle}</Dialog.Title><Dialog.Description className="type-sm leading-row text-muted">Replace the expired Postiz credential for this {capitalize(account.platform)} account.</Dialog.Description></span><Dialog.Close asChild><button type="button" className={`grid size-7 flex-none place-items-center rounded-control text-muted transition-colors duration-fast ease-instrument hover:bg-surface-sunken hover:text-ink motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`} aria-label="Close reconnect"><X className={ICON} /></button></Dialog.Close></header>
    <label className={`flex flex-col gap-1.75 ${OVERLAY_FIELD_RING}`}><span className={MODAL_FIELD_LABEL}>POSTIZ API KEY</span><input className={`${MODAL_INPUT} h-9`} type="password" autoComplete="off" value={credential} placeholder="Paste the scoped Postiz key" onChange={(event) => onCredential(event.target.value)} /></label>
    <small className="font-code type-mono-sm leading-prose text-muted">The key is sent only to Ralphy Core and stored in its encrypted credential store. It is never written to the calendar database.</small>
    <footer className="flex justify-end gap-2"><Dialog.Close asChild><button type="button" className={OVERLAY_ACTION}>Cancel</button></Dialog.Close><button type="button" className={`calendar-primary ${OVERLAY_ACTION_PRIMARY} disabled:cursor-not-allowed disabled:opacity-35`} disabled={saving || credential.trim().length < 8} onClick={onSave}>{saving ? "Reconnecting…" : "Save and reconnect"}</button></footer>
  </Dialog.Content></>}</Dialog.Root>;
}

function PlatformSettings({ unit, channels, accounts, activeId, editedIds, settings, onActive, onChange, onReconnect }: { unit: CalendarReadyUnitDto | null; channels: CalendarReadyUnitDto["channels"]; accounts: CalendarWorkspaceDto["accounts"]; activeId: string | null; editedIds: Set<string>; settings: CalendarPublicationSettings; onActive(id: string): void; onChange(presentationId: string, key: string, value: JsonValue): void; onReconnect(accountId: string | null): void }) {
  const channel = channels.find((item) => channelKey(item) === activeId) ?? channels[0] ?? null;
  const disconnected = channel ? accounts.some((account) => account.id === channel.socialAccountId && account.disconnected) : false;
  const activeKey = channel ? channelKey(channel) : "";
  return <section className="calendar-platform-settings flex min-w-0 gap-3.5" data-instrument-overlay="calendar-platform-settings"><nav className="calendar-platform-tabs flex w-calendar-platform-tabs flex-none flex-col gap-1">{channels.map((item) => { const id = channelKey(item); const Icon = platformIcon(item.platform); const broken = accounts.some((account) => account.id === item.socialAccountId && account.disconnected); const chosen = id === activeKey; return <button type="button" className={`${MODAL_ROW} ${chosen ? "is-active bg-instrument text-on-instrument" : "bg-transparent text-ink hover:bg-surface-sunken"}`} key={id} onClick={() => onActive(id)}><AccountMark identity={`${item.platform}:${item.account}`} /><span className={MODAL_ROW_COPY}><strong className={`flex items-center gap-1.5 truncate type-ui font-normal ${chosen ? "text-on-instrument" : "text-ink"}`}><Icon className={`${ICON_LG} flex-none ${chosen ? "text-on-instrument-muted" : "text-muted"}`} />{item.account}</strong><small className={`font-code type-mono-sm ${chosen ? "text-on-instrument-muted" : "text-muted"}`}>{broken ? "Needs reconnect" : editedIds.has(id) ? "Edited" : `${capitalize(item.platform)} defaults`}</small></span>{broken && <AlertTriangle className={`${ICON_LG} flex-none ${chosen ? "text-on-instrument-muted" : "text-muted"}`} />}</button>; })}</nav><div className="calendar-platform-fields flex h-100 min-w-0 flex-1 flex-col gap-3.5 overflow-y-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{channel ? <>{disconnected && <div className="calendar-reconnect-banner flex items-center gap-2.75 rounded-cell bg-surface-sunken px-3 py-2.75"><Repeat className={`${ICON_XL} flex-none text-muted`} /><span className="flex min-w-0 flex-1 flex-col gap-0.75"><strong className="type-ui font-normal text-ink">{capitalize(channel.platform)} {channel.account} needs reconnecting</strong><small className="font-code type-mono-sm text-muted">Settings save, but publishing will not start until the account is connected.</small></span><button type="button" className={`${ACTION} h-7 px-3 type-sm bg-surface text-ink hover:bg-surface-hover ${OVERLAY_RING}`} onClick={() => onReconnect(channel.socialAccountId)}>Reconnect</button></div>}<PlatformFields platform={channel.platform} title={unit?.title ?? ""} values={settings[activeKey] ?? {}} onChange={(key, value) => onChange(activeKey, key, value)} /></> : <p className="m-0 type-sm text-muted">Select content first.</p>}</div></section>;
}

function PlatformFields({ platform, title, values, onChange }: { platform: string; title: string; values: Record<string, JsonValue>; onChange(key: string, value: JsonValue): void }) {
  const value = <T extends JsonValue>(key: string, fallback: T) => (values[key] as T | undefined) ?? fallback;
  if (platform === "instagram") return <><SettingsSegment label="PUBLISH AS" options={["Reel", "Post", "Story"]} value={value("publishAs", "Reel")} onChange={(next) => onChange("publishAs", next)} /><SettingsCheck label="Share to feed" checked={value("shareToFeed", true)} onChange={(next) => onChange("shareToFeed", next)} /><SettingsText label="COLLABORATOR" value={value("collaborator", "")} placeholder="@username" onChange={(next) => onChange("collaborator", next)} /><SettingsText label="LOCATION" value={value("location", "")} placeholder="Add location" onChange={(next) => onChange("location", next)} /></>;
  if (platform === "youtube") return <><SettingsText label="TITLE" maxLength={100} value={value("title", title)} onChange={(next) => onChange("title", next)} /><SettingsArea label="DESCRIPTION" maxLength={5000} value={value("description", "")} onChange={(next) => onChange("description", next)} /><SettingsSegment label="VISIBILITY" options={["Public", "Unlisted", "Private"]} value={value("visibility", "Public")} onChange={(next) => onChange("visibility", next)} /><SettingsCheck label="Made for kids" checked={value("madeForKids", false)} onChange={(next) => onChange("madeForKids", next)} /><SettingsText label="PLAYLIST" value={value("playlist", "")} placeholder="Choose playlist" onChange={(next) => onChange("playlist", next)} /></>;
  if (platform === "tiktok") return <><SettingsSegment label="WHO CAN VIEW" options={["Public", "Friends", "Private"]} value={value("visibility", "Public")} onChange={(next) => onChange("visibility", next)} /><SettingsCheck label="Allow comments" checked={value("comments", true)} onChange={(next) => onChange("comments", next)} /><SettingsCheck label="Allow duet" checked={value("duet", true)} onChange={(next) => onChange("duet", next)} /><SettingsCheck label="Allow stitch" checked={value("stitch", false)} onChange={(next) => onChange("stitch", next)} /><SettingsCheck label="Disclose branded content" hint="Required for paid partnerships" checked={value("brandedContent", false)} onChange={(next) => onChange("brandedContent", next)} /><SettingsCheck label="Add trending audio" hint="Picked from the Unit soundtrack" checked={value("trendingAudio", true)} onChange={(next) => onChange("trendingAudio", next)} /></>;
  return <><SettingsSegment label="WHO CAN REPLY" options={["Everyone", "Following", "Mentioned"]} value={value("replyAudience", "Everyone")} onChange={(next) => onChange("replyAudience", next)} /><SettingsCheck label="Post as thread" checked={value("thread", true)} onChange={(next) => onChange("thread", next)} /><SettingsCheck label="Copy alt text from Unit" checked={value("copyAltText", true)} onChange={(next) => onChange("copyAltText", next)} /></>;
}

function SettingsSegment({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange(value: string): void }) { return <div className="calendar-settings-field flex min-w-0 flex-col gap-1.75"><span className={MODAL_FIELD_LABEL}>{label}</span><span className="calendar-settings-segment flex self-start rounded-control bg-surface-sunken p-0.75">{options.map((option) => <button type="button" className={`${SEGMENT_BUTTON} ${value === option ? "is-active bg-instrument text-on-instrument" : " bg-transparent text-muted hover:text-ink"}`} key={option} onClick={() => onChange(option)}>{option}</button>)}</span></div>; }
function SettingsCheck({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange(value: boolean): void }) { return <button type="button" className={`calendar-settings-check flex min-h-9.5 items-center gap-3 rounded-control bg-surface-sunken px-2.5 py-2 text-left transition-colors duration-fast ease-instrument hover:bg-surface motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`} onClick={() => onChange(!checked)}><span className="flex min-w-0 flex-1 flex-col gap-0.5"><strong className="type-ui font-normal text-ink">{label}</strong>{hint && <small className="font-code type-mono-sm text-muted">{hint}</small>}</span><i className={`calendar-check-box ${CHECK_BOX} ${checked ? "bg-desk-primary" : "bg-surface"}`}>{checked && <Check className={`${ICON_MD} ${CHECK_MARK_ON_SURFACE}`} strokeWidth={2.6} />}</i></button>; }
function SettingsText({ label, value, placeholder, maxLength, onChange }: { label: string; value: string; placeholder?: string; maxLength?: number; onChange(value: string): void }) { return <label className={`calendar-settings-field flex min-w-0 flex-col gap-1.75 ${OVERLAY_FIELD_RING}`}><span className={`calendar-settings-label flex items-center ${MODAL_FIELD_LABEL}`}>{label}{maxLength && <small className="ml-auto type-mono-sm tracking-normal text-muted">{value.length}/{maxLength}</small>}</span><input className={MODAL_INPUT} value={value} placeholder={placeholder} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} /></label>; }
function SettingsArea({ label, value, maxLength, onChange }: { label: string; value: string; maxLength?: number; onChange(value: string): void }) { return <label className={`calendar-settings-field flex min-w-0 flex-col gap-1.75 ${OVERLAY_FIELD_RING}`}><span className={`calendar-settings-label flex items-center ${MODAL_FIELD_LABEL}`}>{label}{maxLength && <small className="ml-auto type-mono-sm tracking-normal text-muted">{value.length}/{maxLength}</small>}</span><textarea className="h-17.5 min-w-0 resize-none rounded-field bg-surface-sunken px-2.75 pt-2.5 type-sm text-ink outline-none placeholder:text-muted" value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} /></label>; }

function settingsForChannels(channels: CalendarReadyUnitDto["channels"]): CalendarPublicationSettings { return Object.fromEntries(channels.map((channel) => [channelKey(channel), isJsonRecord(channel.settings) ? { ...channel.settings } : {}])); }
function isJsonRecord(value: JsonValue): value is Record<string, JsonValue> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function channelKey(channel: Pick<CalendarChannelInput, "presentationId" | "socialAccountId">) { return `${channel.presentationId}:${channel.socialAccountId}`; }
function CalendarLoading() { return <div className="calendar-loading grid flex-1 grid-cols-7 grid-rows-6 gap-1.5">{["col-start-1 col-end-3", "col-start-3 col-end-6", "col-start-6 col-end-8"].map((span) => <span className={`row-start-1 row-end-7 ${span} animate-pulse rounded-cell bg-surface-sunken motion-reduce:animate-none`} key={span} />)}</div>; }
function CalendarError({ error, onRetry }: { error: string; onRetry(): void }) { return <div className={`calendar-error ${STATE_PLATE}`}><AlertTriangle className={`${ICON_STATE} text-alert`} /><strong className="type-md font-normal text-ink">Calendar could not be loaded</strong><span className="type-sm text-muted">{error}</span><small className="font-code type-mono-sm text-muted">{new Date().toISOString()}</small><button type="button" className={`${ACTION} mt-1.25 h-7 px-3 type-sm bg-surface text-ink hover:bg-surface-hover`} onClick={onRetry}>Try again</button></div>; }

function platformIcon(platform: string) { return PLATFORM_ICON[platform as keyof typeof PLATFORM_ICON] ?? ListFilter; }
function capitalize(value: string) { return value[0]!.toUpperCase() + value.slice(1); }
function hash(value: string) { return [...value].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7); }
function localDateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function agendaDateParts(key: string) { if (key === "no-time") return { day: "—", label: "NO TIME · DRAFTS", today: false }; const date = new Date(`${key}T12:00:00`); return { day: String(date.getDate()), label: new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(date).replace(",", " ·").toUpperCase(), today: key === localDateKey(new Date()) }; }
function agendaChannelNote(channel: CalendarEventDto["channels"][number], eventAt: number | null, timezone: string) { if (channel.status === "published") return "published"; if (channel.status === "draft") return formatCalendarTime(channel.at ?? eventAt, timezone); if (channel.status === "disconnected") return "reconnect"; if (channel.status === "failed") return "failed"; if (channel.status === "uploading") return "uploading"; return formatCalendarTime(channel.at ?? eventAt, timezone); }
function weekEventTop(event: CalendarEventDto, timezone: string) { const [hour, minute] = formatCalendarTime(event.at, timezone).split(":").map(Number); return Math.max(2, hour! * 46 + minute! / 60 * 46 + 2); }
function currentWeekTop(timezone: string) { const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).split(":").map(Number); return Math.max(2, Math.min(1102, (parts[0]! % 24) * 46 + parts[1]! / 60 * 46)); }
function shiftAnchor(date: Date, view: CalendarView, direction: number) { const next = new Date(date); view === "month" ? next.setMonth(next.getMonth() + direction) : next.setDate(next.getDate() + direction * (view === "week" ? 7 : 21)); return next; }
function periodTitle(view: CalendarView, anchor: Date) { if (view === "month") return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(anchor); const days = weekDays(anchor); return view === "week" ? `${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(days[0]!.date)} — ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(days[6]!.date)}` : `${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(days[0]!.date)} → ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 6))}`; }
function rangeNote(days: ReturnType<typeof monthDays>) { return `${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(days[0]!.date)} — ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(days.at(-1)!.date)}`; }
function timezoneLabel(timezone: string) { const part = new Intl.DateTimeFormat("en", { timeZone: timezone, timeZoneName: "shortOffset" }).formatToParts().find((item) => item.type === "timeZoneName")?.value ?? "GMT"; return part.replace("GMT", "GMT"); }
function formatInputDate(value: string) { const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(date); }
