import { PageHeader, PageHeaderMore, PAGE_HEADER_BUTTON, PAGE_HEADER_PRIMARY } from "@/shared/ui/PageHeader";
/**
 * The Calendar route: one period of one workspace, and every panel that period can open.
 *
 * The route owns the range, the filters and the selection; the views, panels and dialogs beside
 * this file are given what they draw. That is why switching a view never refetches and why a
 * mutation has one writer.
 */
import {
  CalendarDays, Columns3, List, ChevronLeft, ChevronRight, CircleAlert, Globe2, PanelRight, Plus, SlidersHorizontal,
} from "@/shared/ui/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CalendarEventDto, CalendarReadyUnitDto, CalendarWorkspaceDto,
} from "../../../../electron/ralphy/types";
import { bridge } from "@/shared/api/ipc";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "@/shared/instrument/screen-state-registry";
import type { WorkspaceCalendarNavigationContext } from "@/shared/model/workbench";
import {
  ACTION,
  QUIET_TEXT,
} from "@/shared/ui/overlay-chrome";
import {
  calendarDayKey, calendarRange, filterCalendarEvents, monthDays, weekDays,
  type CalendarFilters, type CalendarView,
} from "../lib/presentation";
import { CHIP, CalendarError, CalendarLoading, CalendarWorkspaceContext, EMPTY_FILTERS, ICON, ICON_MD, STATUS_LABEL, capitalize, timestampMs, timezoneLabel } from "./calendar-chrome";
import { AgendaView, MonthView, WeekView } from "./calendar-views";
import { EventInspector, FilterChip, FilterPopover, ReadyDrawer } from "./calendar-panels";
import { ReconnectDialog, ScheduleDialog } from "./calendar-schedule";

export const calendarInstrumentStates = defineInstrumentScreenStates({
  routeKey: "workspace.calendar",
  states: ["loading", "ready", "empty", "partial", "error", "selected", "scheduling"],
  rootMarker: "workspace-calendar",
  landmarks: ["Calendar", "Calendar view", "Schedule content"],
} as const);

export function CalendarScreen({
  workspaceId, workspaceName, initialDate = new Date(), navigationContext, onOpenProject = () => undefined,
}: { workspaceId: string; workspaceName: string; initialDate?: Date; navigationContext?: WorkspaceCalendarNavigationContext; onOpenProject?: (projectId: string, unitId: string) => void }) {
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

  return <CalendarWorkspaceContext.Provider value={workspaceId}><InstrumentScreenRoot descriptor={calendarInstrumentStates} state={instrumentState}><main className="main-region calendar-region @container/main-region flex min-h-0 min-w-0 flex-1 flex-col overflow-auto bg-transparent p-2 type-base text-ink">
    <section className="calendar-shell relative m-0 flex min-h-0 w-full min-w-0 max-w-none flex-1 flex-col gap-2 overflow-visible bg-transparent p-0" aria-busy={loading} aria-label={`${workspaceName} calendar`}>
      <PageHeader title="Calendar" icon={CalendarDays} meta={workspaceName}>
        <div className="flex min-w-0 items-center gap-0.5"><button type="button" className={PAGE_HEADER_BUTTON} aria-label={`Previous ${view}`} title={`Previous ${view}`} onClick={() => setAnchor(shiftAnchor(anchor, view, -1))}><ChevronLeft size={14} /></button><strong className="page-header-period truncate font-code type-xs font-medium" title={title}>{title}</strong><button type="button" className={PAGE_HEADER_BUTTON} aria-label={`Next ${view}`} title={`Next ${view}`} onClick={() => setAnchor(shiftAnchor(anchor, view, 1))}><ChevronRight size={14} /></button></div>
        <span className="page-header-segments flex shrink-0 items-center gap-0.5 rounded-full bg-panel p-0.5" aria-label="Calendar view">{([['month', CalendarDays], ['week', Columns3], ['agenda', List]] as const).map(([item, Icon]) => <button type="button" key={item} className={PAGE_HEADER_BUTTON} aria-pressed={view === item} aria-label={capitalize(item)} title={capitalize(item)} onClick={() => setView(item)}><Icon size={14} /><span className="page-header-action-label">{capitalize(item)}</span></button>)}</span>
        <span className="relative flex shrink-0"><button type="button" className={PAGE_HEADER_BUTTON} aria-label="Filters" title="Calendar filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={14} /><span className="sr-only">Filters</span></button>{filtersOpen && <FilterPopover data={data} filters={filters} onChange={setFilters} onClose={() => setFiltersOpen(false)} />}</span>
        <PageHeaderMore label="Calendar actions"><button type="button" className={PAGE_HEADER_BUTTON} onClick={() => setAnchor(new Date())}>Today</button><button type="button" className={PAGE_HEADER_BUTTON} onClick={() => setRightPanel((panel) => panel === "drawer" ? null : "drawer")}><PanelRight size={14} />Ready to schedule <small>{data?.readyUnits.length ?? 0}</small></button></PageHeaderMore>
        <button type="button" className={PAGE_HEADER_PRIMARY} aria-label="Schedule content" title="Schedule content" onClick={() => openSchedule()}><Plus size={14} /><span className="page-header-action-label">Schedule content</span></button>
      </PageHeader>

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
        {rightPanel === "inspector" && selected && <EventInspector event={selected} postizAvailable={data?.postiz.available ?? false} onClose={() => setRightPanel(null)} onOpenUnit={() => selected.projectId && onOpenProject(selected.projectId, selected.unitId)} onMutate={mutate} />}
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

export function shiftAnchor(date: Date, view: CalendarView, direction: number) { const next = new Date(date); view === "month" ? next.setMonth(next.getMonth() + direction) : next.setDate(next.getDate() + direction * (view === "week" ? 7 : 21)); return next; }
export function periodTitle(view: CalendarView, anchor: Date) { if (view === "month") return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(anchor); const days = weekDays(anchor); return view === "week" ? `${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(days[0]!.date)} — ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(days[6]!.date)}` : `${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(days[0]!.date)} → ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 6))}`; }
export function rangeNote(days: ReturnType<typeof monthDays>) { return `${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(days[0]!.date)} — ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(days.at(-1)!.date)}`; }
