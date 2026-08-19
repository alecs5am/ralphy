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
import { bridge } from "../lib/ipc";
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

export function CalendarScreen({
  workspaceId, workspaceName, initialDate = new Date(), onOpenProject = () => undefined,
}: { workspaceId: string; workspaceName: string; initialDate?: Date; onOpenProject?: (projectId: string, unitId: string) => void }) {
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
      setSelectedEventId((id) => id && next.events.some((event) => event.id === id) ? id : null);
    }).catch((cause: unknown) => {
      if (current) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [anchor, refresh, view, workspaceId]); // timezone intentionally follows the loaded workspace

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
    setModalUnit(unit ?? data?.readyUnits[0] ?? null); setModalDate(date); setModalStep("content"); setModalOpen(true); setRightPanel(null);
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

  return <CalendarWorkspaceContext.Provider value={workspaceId}><main className="main-region calendar-region">
    <section className="calendar-shell" aria-busy={loading} aria-label={`${workspaceName} calendar`}>
      <header className="calendar-toolbar">
        <h1>Calendar</h1>
        <button type="button" onClick={() => setAnchor(new Date())}>Today</button>
        <span className="calendar-arrows">
          <button type="button" aria-label={`Previous ${view}`} onClick={() => setAnchor(shiftAnchor(anchor, view, -1))}><ChevronLeft /></button>
          <button type="button" aria-label={`Next ${view}`} onClick={() => setAnchor(shiftAnchor(anchor, view, 1))}><ChevronRight /></button>
        </span>
        <strong>{title}</strong><i />
        <span className="calendar-view-tabs" aria-label="Calendar view">
          {(["month", "week", "agenda"] as CalendarView[]).map((item) => <button type="button" key={item} className={view === item ? "is-active" : ""} onClick={() => setView(item)}>{capitalize(item)}</button>)}
        </span>
        <span className="calendar-filter-wrap">
          <button type="button" onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal />Filters</button>
          {filtersOpen && <FilterPopover data={data} filters={filters} onChange={setFilters} onClose={() => setFiltersOpen(false)} />}
        </span>
        <button type="button" className={rightPanel === "drawer" ? "is-active" : ""} onClick={() => setRightPanel((panel) => panel === "drawer" ? null : "drawer")}><PanelRight />Ready to schedule <small>{data?.readyUnits.length ?? 0}</small></button>
        <button type="button" className="calendar-primary" onClick={() => openSchedule()}><Plus />Schedule content</button>
      </header>

      <div className="calendar-subbar">
        <span className="calendar-timezone"><Globe2 />{timezoneLabel(timezone)} · {timezone}</span>
        {filters.projectIds.map((id) => <FilterChip key={id} label="Project" value={data?.projects.find((project) => project.id === id)?.name ?? id} onRemove={() => setFilters({ ...filters, projectIds: filters.projectIds.filter((value) => value !== id) })} />)}
        {filters.platforms.map((platform) => <FilterChip key={platform} label="Platform" value={capitalize(platform)} onRemove={() => setFilters({ ...filters, platforms: filters.platforms.filter((value) => value !== platform) })} />)}
        {filters.statuses.map((status) => <FilterChip key={status} label="Status" value={STATUS_LABEL[status]} onRemove={() => setFilters({ ...filters, statuses: filters.statuses.filter((value) => value !== status) })} />)}
        {dirty && <button type="button" className="calendar-clear" onClick={() => setFilters(EMPTY_FILTERS)}>Clear all</button>}
        <i />
        <small>{visible.length} publications · {rangeNote(days)}</small>
      </div>

      {!data?.postiz.available && data && <div className="calendar-readonly"><CircleAlert />Postiz is unavailable. Your local calendar and drafts are still available.<button type="button" onClick={() => setRefresh((value) => value + 1)}>Try again</button></div>}
      <div className="calendar-content">
        {error ? <CalendarError error={error} onRetry={() => setRefresh((value) => value + 1)} />
          : loading && !data ? <CalendarLoading />
            : view === "month" ? <MonthView days={days} events={visible} timezone={timezone} selectedEventId={selectedEventId} onOpen={openEvent} onDropUnit={(unitId, date) => openSchedule(data?.readyUnits.find((unit) => unit.unitId === unitId) ?? null, date)} />
              : view === "week" ? <WeekView days={days} events={visible} timezone={timezone} selectedEventId={selectedEventId} onOpen={openEvent} />
                : <AgendaView events={visible} timezone={timezone} selectedEventId={selectedEventId} tab={agendaTab} onTab={setAgendaTab} onOpen={openEvent}
                  onRetry={(event) => mutate({ action: "retry", eventId: event.id, expectedRowVersion: event.rowVersion })} onReconnect={openReconnect} />}
        {rightPanel === "inspector" && selected && <EventInspector event={selected} postizAvailable={data?.postiz.available ?? false} onClose={() => setRightPanel(null)} onOpenUnit={() => selected.projectId && onOpenProject(selected.projectId, selected.unitId)} onMutate={mutate} />}
        {rightPanel === "drawer" && <ReadyDrawer units={data?.readyUnits ?? []} onClose={() => setRightPanel(null)} onSchedule={openSchedule} />}
      </div>
      <span className="calendar-live" aria-live="polite">{notice}</span>
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
  </main></CalendarWorkspaceContext.Provider>;
}

function FilterPopover({ data, filters, onChange, onClose }: { data: CalendarWorkspaceDto | null; filters: CalendarFilters; onChange(value: CalendarFilters): void; onClose(): void }) {
  const platforms = [...new Set([...(data?.accounts.map((account) => account.platform) ?? []), ...(data?.events.flatMap((event) => event.channels.map((channel) => channel.platform)) ?? [])])];
  return <div className="calendar-filter-popover">
    <header><span>Filters</span><button type="button" aria-label="Close filters" onClick={onClose}><X /></button></header>
    <FilterOptions title="PROJECT" values={data?.projects.map((item) => [item.id, item.name]) ?? []} selected={filters.projectIds} onChange={(projectIds) => onChange({ ...filters, projectIds })} />
    <FilterOptions title="PLATFORM" values={platforms.map((value) => [value, capitalize(value)])} selected={filters.platforms} onChange={(platforms) => onChange({ ...filters, platforms })} />
    <FilterOptions title="STATUS" values={(Object.keys(STATUS_LABEL) as CalendarEventStatus[]).map((value) => [value, STATUS_LABEL[value]])} selected={filters.statuses} onChange={(statuses) => onChange({ ...filters, statuses: statuses as CalendarEventStatus[] })} />
  </div>;
}

function FilterOptions({ title, values, selected, onChange }: { title: string; values: string[][]; selected: string[]; onChange(values: string[]): void }) {
  return <section><small>{title}</small>{values.map(([value, label]) => <button type="button" key={value} className={selected.includes(value!) ? "is-selected" : ""} onClick={() => onChange(selected.includes(value!) ? selected.filter((item) => item !== value) : [...selected, value!])}><span>{label}</span>{selected.includes(value!) && <Check />}</button>)}</section>;
}

function FilterChip({ label, value, onRemove }: { label: string; value: string; onRemove(): void }) {
  return <span className="calendar-filter-chip"><small>{label}</small>{value}<button type="button" aria-label={`Remove ${label} filter`} onClick={onRemove}><X /></button></span>;
}

function MonthView({ days, events, timezone, selectedEventId, onOpen, onDropUnit }: { days: ReturnType<typeof monthDays>; events: CalendarEventDto[]; timezone: string; selectedEventId: string | null; onOpen(event: CalendarEventDto): void; onDropUnit(unitId: string, date: string): void }) {
  const today = localDateKey(new Date());
  return <div className="calendar-month">
    <div className="calendar-weekdays">{DOW.map((day) => <span key={day}>{day}</span>)}</div>
    <div className="calendar-month-grid">{days.map((day) => {
      const items = events.filter((event) => event.at !== null && calendarDayKey(event.at, timezone) === day.key);
      return <div className={`calendar-month-cell${day.inMonth ? "" : " is-outside"}${day.key === today ? " is-today" : ""}`} key={day.key} tabIndex={0} onDragOver={(event) => { if (event.dataTransfer.types.includes(CALENDAR_UNIT_DRAG)) event.preventDefault(); }} onDrop={(event) => { const unitId = event.dataTransfer.getData(CALENDAR_UNIT_DRAG); if (unitId) onDropUnit(unitId, day.key); }}>
        <header><span>{day.date.getDate()}</span>{items.length > 3 && <small>+{items.length - 3}</small>}</header>
        {items.slice(0, 3).map((event, index) => <CalendarEventButton key={event.id} event={event} timezone={timezone} lead={index === 0} selected={event.id === selectedEventId} onClick={() => onOpen(event)} />)}
      </div>;
    })}</div>
  </div>;
}

function WeekView({ days, events, timezone, selectedEventId, onOpen }: { days: ReturnType<typeof weekDays>; events: CalendarEventDto[]; timezone: string; selectedEventId: string | null; onOpen(event: CalendarEventDto): void }) {
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const noTime = events.filter((event) => event.at === null);
  const today = localDateKey(new Date());
  return <div className="calendar-week">
    <div className="calendar-week-head"><span />{days.map((day, index) => <span key={day.key}><small>{DOW[index]}</small><b className={day.key === today ? "is-today" : ""}>{day.date.getDate()}</b></span>)}</div>
    <div className="calendar-no-time"><label>NO TIME</label><div>{days.map((day) => <span key={day.key}>{noTime.filter((event) => event.draftAt !== null && calendarDayKey(event.draftAt, timezone) === day.key).map((event) => <button type="button" className="calendar-no-time-event" key={event.id} onClick={() => onOpen(event)}><i className={`calendar-event-dot is-${event.status}`} /><b>{event.title}</b><span>{event.channels.slice(0, 3).map((channel) => { const Icon = platformIcon(channel.platform); return <Icon key={`${channel.id}:${channel.platform}`} />; })}</span></button>)}</span>)}</div></div>
    <div className="calendar-week-scroll"><aside>{hours.map((hour) => <span key={hour}>{String(hour).padStart(2, "0")}:00</span>)}</aside><div className="calendar-week-columns">{days.map((day) => <div key={day.key}>{hours.map((hour, index) => <span className={`calendar-hour-line is-${index % 2 === 0 ? "even" : "odd"}`} key={hour} />)}{events.filter((event) => event.at !== null && calendarDayKey(event.at, timezone) === day.key).map((event) => <button type="button" className={`calendar-week-event is-${event.status}${event.id === selectedEventId ? " is-selected" : ""}`} style={{ top: `${weekEventTop(event, timezone)}px` }} key={event.id} onClick={() => onOpen(event)}><CalendarThumb event={event} /><span className="calendar-week-event-copy"><b>{event.title}</b><span className="calendar-week-event-meta"><i className={`calendar-event-dot is-${event.status}`} /><small>{formatCalendarTime(event.at, timezone)}</small><span className="calendar-week-platforms">{event.channels.slice(0, 3).map((channel) => { const Icon = platformIcon(channel.platform); return <Icon key={`${channel.id}:${channel.platform}`} />; })}</span>{eventStatusSummary(event) === "attention" && <AlertTriangle />}</span></span></button>)}{day.key === today && <span className="calendar-now-line" style={{ top: `${currentWeekTop(timezone)}px` }}><i /></span>}</div>)}</div></div>
  </div>;
}

function AgendaView({ events, timezone, selectedEventId, tab, onTab, onOpen, onRetry, onReconnect }: { events: CalendarEventDto[]; timezone: string; selectedEventId: string | null; tab: "all" | "attention" | "drafts"; onTab(tab: "all" | "attention" | "drafts"): void; onOpen(event: CalendarEventDto): void; onRetry(event: CalendarEventDto): void; onReconnect(accountId: string | null): void }) {
  const filtered = events.filter((event) => tab === "all" || eventStatusSummary(event) === (tab === "drafts" ? "draft" : "attention"));
  const counts = { all: events.length, attention: events.filter((event) => eventStatusSummary(event) === "attention").length, drafts: events.filter((event) => event.status === "draft").length };
  return <div className="calendar-agenda">
    <div className="calendar-agenda-head"><div className="calendar-agenda-tabs">{(["all", "attention", "drafts"] as const).map((item) => <button type="button" key={item} className={tab === item ? "is-active" : ""} onClick={() => onTab(item)}>{item === "attention" ? "Needs attention" : capitalize(item)} <small>{counts[item]}</small></button>)}</div><small>{filtered.length} of {events.length} publications</small></div>
    {filtered.length === 0 ? <div className="calendar-good-empty"><CheckCheck /><strong>Nothing needs attention</strong><span>Your scheduled content is in good shape.</span><button type="button" onClick={() => onTab("all")}>Show all</button></div> : <div className="calendar-agenda-list">{groupAgenda(filtered, timezone).map((group) => { const date = agendaDateParts(group.key); return <section key={group.key}><header><b className={date.today ? "is-today" : ""}>{date.day}</b><span>{date.label}</span><i className="calendar-agenda-day-line" /><small>{group.events.length} {group.events.length === 1 ? "publication" : "publications"}</small></header>{group.events.map((event) => { const bad = event.channels.find((channel) => channel.status === "failed" || channel.status === "disconnected"); return <div className={`calendar-agenda-row${event.id === selectedEventId ? " is-selected" : ""}`} key={event.id}><button type="button" className="calendar-agenda-event" onClick={() => onOpen(event)}><b className="calendar-agenda-time">{event.at === null ? "—" : formatCalendarTime(event.at, timezone)}</b><CalendarThumb event={event} /><span className="calendar-agenda-copy"><strong><i className={`calendar-event-dot is-${event.status}`} />{event.title}</strong><small>{event.project} · R{event.pinnedRevision} · {event.kind}</small></span><span className="calendar-agenda-channels">{event.channels.map((channel) => { const Icon = platformIcon(channel.platform); return <span className={`calendar-agenda-channel is-${channel.status}`} key={`${channel.id}:${channel.platform}`}><b>{channel.account} · {agendaChannelNote(channel, event.at, timezone)}</b><Icon /></span>; })}</span></button>{bad && <button type="button" className="calendar-agenda-action" onClick={() => bad.status === "failed" ? onRetry(event) : onReconnect(bad.accountId)}>{bad.status === "disconnected" ? "Reconnect" : "Retry"}</button>}</div>; })}</section>; })}</div>}
  </div>;
}

function CalendarEventButton({ event, timezone, lead = false, selected = false, onClick }: { event: CalendarEventDto; timezone: string; lead?: boolean; selected?: boolean; onClick(): void }) {
  return <button type="button" className={`calendar-event${lead ? " is-lead" : ""}${selected ? " is-selected" : ""} is-${event.status}`} onClick={onClick}>{lead && <CalendarThumb event={event} />}<span><b>{event.title}</b><small><i />{formatCalendarTime(event.at, timezone)} · {event.channels.length} {event.channels.length === 1 ? "publication" : "publications"}</small></span>{eventStatusSummary(event) === "attention" && <AlertTriangle />}</button>;
}

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
  return <span className={`calendar-thumb ${className}`} style={{ "--calendar-hue": String(hash(identity) % 360) } as CSSProperties} aria-hidden="true">{url && !failed ? <img src={url} alt="" onError={() => setFailed(true)} /> : <i>{event.title.slice(0, 1)}</i>}</span>;
}

function AccountMark({ identity, size = 28 }: { identity: string; size?: number }) {
  const value = hash(identity);
  return <span className="calendar-account-mark" style={{ "--calendar-account-size": `${size}px`, "--calendar-account-hue": String(value % 360), "--calendar-account-mask": `url('../assets/dither/g${value % 8 + 1}.png')` } as CSSProperties}><i /></span>;
}

function EventInspector({ event, postizAvailable, onClose, onOpenUnit, onMutate }: { event: CalendarEventDto; postizAvailable: boolean; onClose(): void; onOpenUnit(): void; onMutate(input: Parameters<typeof bridge.mutateCalendar>[1]): void }) {
  return <aside className="calendar-inspector">
    <header><small>PUBLICATION</small><i /><button type="button" disabled={event.projectId === null} onClick={onOpenUnit}><ArrowUpRight />Open Unit</button><button type="button" aria-label="Close inspector" onClick={onClose}><X /></button></header>
    <div className="calendar-inspector-scroll">
      <section className="calendar-event-summary"><CalendarThumb event={event} /><span><strong>{event.title}</strong><small>{event.project} · {event.kind}</small><b className={`calendar-status is-${event.status}`}>{STATUS_LABEL[event.status]}</b></span></section>
      <section className="calendar-date-card"><CalendarClock /><span><strong>{event.at === null ? "No time · Draft" : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: event.timezone }).format(event.at)}</strong><small>{event.timezone}</small></span></section>
      <label>PINNED REVISION</label><section className="calendar-revision-card"><span><GitCommitHorizontal />Scheduled with <b>R{event.pinnedRevision}</b></span>{event.unitSelectedRevision !== null && event.unitSelectedRevision !== event.pinnedRevision && <p><AlertTriangle />A newer revision R{event.unitSelectedRevision} is selected in Units.</p>}</section>
      <label>{event.channels.length} CHANNELS</label><section className="calendar-channel-list">{event.channels.map((channel) => { const Icon = platformIcon(channel.platform); return <div key={`${channel.id}:${channel.platform}`}><AccountMark identity={`${channel.platform}:${channel.account}`} /><span><strong><Icon />{channel.account}</strong><small className={`is-${channel.status}`}>{capitalize(channel.status)}{channel.error ? ` · ${channel.error}` : ""}</small></span>{channel.status === "failed" && <button type="button" disabled={!postizAvailable} onClick={() => onMutate({ action: "retry", eventId: event.id, expectedRowVersion: event.rowVersion })}>Retry</button>}{channel.postUrl && <button type="button" aria-label="Open published post" onClick={() => window.open(channel.postUrl!, "_blank", "noopener,noreferrer")}><ArrowUpRight /></button>}</div>; })}</section>
      {event.metrics && <><label>PERFORMANCE</label><section className="calendar-metrics">{[[event.metrics.views, "VIEWS"], [event.metrics.likes, "LIKES"], [event.metrics.comments, "COMMENTS"], [event.metrics.shares, "SHARES"]].map(([value, label]) => <span key={label}><strong>{value ?? "—"}</strong><small>{label}</small></span>)}</section><small className="calendar-synced"><RefreshCw />Last synced {new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(event.metrics.syncedAt)}</small></>}
      {event.status !== "draft" && <section className="calendar-inspector-actions"><button type="button" onClick={() => onMutate({ action: "remove", eventId: event.id, expectedRowVersion: event.rowVersion })}><FilePenLine />Move to draft</button></section>}
    </div>
  </aside>;
}

function ReadyDrawer({ units, onClose, onSchedule }: { units: CalendarReadyUnitDto[]; onClose(): void; onSchedule(unit: CalendarReadyUnitDto): void }) {
  const [tab, setTab] = useState<"all" | "ready" | "review" | "blocked">("all");
  const visible = units.filter((unit) => tab === "all" || unit.readiness === tab || (tab === "blocked" && unit.readiness === "draft"));
  return <aside className="calendar-ready-drawer"><header><span>Ready to schedule</span><small>{units.length}</small><i /><button type="button" aria-label="Close ready drawer" onClick={onClose}><X /></button></header><nav>{(["all", "ready", "review", "blocked"] as const).map((item) => <button type="button" key={item} className={tab === item ? "is-active" : ""} onClick={() => setTab(item)}>{capitalize(item)} <small>{units.filter((unit) => item === "all" || unit.readiness === item || (item === "blocked" && unit.readiness === "draft")).length}</small></button>)}</nav><div>{visible.map((unit) => <button type="button" className="calendar-ready-row" key={unit.unitId} draggable={unit.unitRevisionId !== null} onDragStart={(event: ReactDragEvent<HTMLButtonElement>) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData(CALENDAR_UNIT_DRAG, unit.unitId); }} onClick={() => onSchedule(unit)}><CalendarThumb event={unit} /><span><strong>{unit.title}</strong><small>{unit.project} · R{unit.revision ?? "—"} · {unit.kind}</small><b className={`is-${unit.readiness}`}>{unit.note ?? (unit.readiness === "ready" ? "Ready to schedule" : capitalize(unit.readiness))}</b></span><GripVertical /></button>)}{visible.length === 0 && <div className="calendar-drawer-empty"><Check />Nothing in this queue</div>}</div><footer>Drag a unit onto a date — the drop opens the scheduling form with that date filled in. Nothing publishes on drop.</footer></aside>;
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

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>{open && <><Dialog.Overlay forceMount className="calendar-modal-overlay" /><Dialog.Content forceMount className="calendar-modal">
    <header><div><small>{step === "content" ? "SCHEDULE CONTENT" : "PLATFORM SETTINGS"}</small><Dialog.Title>{unit?.title ?? "Schedule content"}</Dialog.Title><Dialog.Description className="calendar-modal-description">Choose a Unit, publishing accounts, time, and publication-specific platform settings.</Dialog.Description></div><button type="button" className="calendar-open-unit" disabled={!unit?.projectId} onClick={onOpenUnit}><ArrowUpRight />Open Unit</button><Dialog.Close asChild><button type="button" aria-label="Close schedule content"><X /></button></Dialog.Close></header>
    <div className="calendar-modal-layout">
      <aside className="calendar-modal-unit">
        <div className="calendar-modal-poster-wrap">{poster ? <CalendarThumb event={poster} className="calendar-modal-poster" /> : <span className="calendar-modal-poster is-empty" />}<span>{unit?.kind ?? "No unit"}</span></div>
        <section><label>REVISION TO PUBLISH</label><div className="calendar-revision-picker">{revisions.map((revision) => <button type="button" className={revision.unitRevisionId === revisionId ? "is-active" : ""} key={revision.unitRevisionId} onClick={() => setRevisionSelection({ unitId: unit!.unitId, revisionId: revision.unitRevisionId })}>R{revision.revision}</button>)}</div>{activeRevision && latestRevision !== null && activeRevision.revision < latestRevision ? <small className="is-warning"><AlertTriangle />R{activeRevision.revision} is older than the latest R{latestRevision}. This publication will stay pinned to R{activeRevision.revision}.</small> : <small>R{activeRevision?.revision ?? unit?.revision ?? "—"} is pinned to this publication. Calendar keeps it when the Unit selection changes.</small>}</section>
        <button type="button" className="calendar-pick-unit" onClick={() => setPickerOpen((value) => !value)}><Repeat />Pick another unit</button>
        {pickerOpen && <div className="calendar-unit-popover">{units.map((item) => <button type="button" key={item.unitId} className={item.unitId === unit?.unitId ? "is-selected" : ""} onClick={() => { onSelect(item); setPickerOpen(false); }}><CalendarThumb event={item} /><span><strong>{item.title}</strong><small>{item.project} · R{item.revision ?? "—"} · {item.kind}</small></span>{item.unitId === unit?.unitId && <Check />}</button>)}</div>}
      </aside>
      {step === "content" ? <section className="calendar-schedule-form">
        <div className="calendar-date-fields"><label><span>DATE</span><span className="calendar-picker-wrap"><button type="button" className="calendar-picker-trigger" aria-label="Choose publication date" aria-expanded={schedulePicker === "date"} onClick={() => setSchedulePicker((value) => value === "date" ? null : "date")}><CalendarClock /><b>{formatInputDate(date)}</b><ChevronDown /></button>{schedulePicker === "date" && <CalendarDatePicker value={date} onChange={(value) => { setDate(value); setSchedulePicker(null); }} onClose={() => setSchedulePicker(null)} />}</span></label><label><span>TIME</span><span className="calendar-picker-wrap"><button type="button" className="calendar-picker-trigger" aria-label="Choose publication time" aria-expanded={schedulePicker === "time"} onClick={() => setSchedulePicker((value) => value === "time" ? null : "time")}><Clock3 /><b>{time}</b><ChevronDown /></button>{schedulePicker === "time" && <CalendarTimePicker value={time} onChange={setTime} onClose={() => setSchedulePicker(null)} />}</span></label><label><span>TIMEZONE</span><span className="calendar-timezone-field"><Globe2 />{timezoneLabel(timezone)} · {timezone.split("/").at(-1)}</span></label></div>
        <section className="calendar-channel-section"><header><span>CHANNELS</span><small>{selectedChannels.length} of {channels.filter((channel) => !disconnectedIds.has(channel.socialAccountId)).length} available selected{channels.some((channel) => disconnectedIds.has(channel.socialAccountId)) ? ` · ${channels.filter((channel) => disconnectedIds.has(channel.socialAccountId)).length} needs reconnect` : ""}</small><i /><button type="button" disabled={!unit} onClick={() => onStep("settings")}><SlidersHorizontal />Platform settings</button></header><div className="calendar-modal-channels">{channels.map((channel) => { const id = channelKey(channel); const Icon = platformIcon(channel.platform); const disconnected = disconnectedIds.has(channel.socialAccountId); const selected = selectedIds.includes(id); const content = <><AccountMark identity={`${channel.platform}:${channel.account}`} /><span><strong><Icon />{channel.account}</strong><small>{disconnected ? "Token expired — reconnect to publish" : `${capitalize(channel.platform)} · ready`}</small></span>{disconnected ? <button type="button" onClick={() => onReconnect(channel.socialAccountId)}>Reconnect</button> : <i className="calendar-check-box">{selected && <Check />}</i>}</>; return disconnected ? <div className="calendar-channel-option is-disconnected" key={id}>{content}</div> : <button type="button" className={`calendar-channel-option${selected ? " is-selected" : ""}`} key={id} onClick={() => toggleChannel(id)}>{content}</button>; })}</div></section>
        <label className="calendar-caption-field"><span>CAPTION</span><div><textarea value={caption} onChange={(event) => setCaption(event.target.value)} /><footer><b>#ralphy</b><b>#content</b><small>1 caption for all channels</small></footer></div></label>
      </section> : <PlatformSettings unit={unit} channels={channels} accounts={accounts} activeId={platformTab} editedIds={editedIds} settings={settings} onActive={setPlatformTab} onChange={updateSetting} onReconnect={onReconnect} />}
    </div>
    <footer><small>{step === "content" ? "Published through Postiz — selected accounts leave as one publication. Channel staggering lives in Platform settings." : "Settings belong to this publication, not the account. The next publication starts from platform defaults."}</small><span>{step === "content" ? <><button type="button" disabled={!unit || saving || selectedChannels.length === 0} onClick={() => onSave(false, at(), payload(), revisionId)}>Save as draft</button><button type="button" className="calendar-primary" disabled={!unit || !postizAvailable || saving || selectedChannels.length === 0} onClick={() => onSave(true, at(), payload(), revisionId)}>{saving ? "Saving…" : `Schedule ${selectedChannels.length} ${selectedChannels.length === 1 ? "publication" : "publications"}`}</button></> : <><button type="button" onClick={() => { setSettings(settingsForChannels(channels)); setEditedIds(new Set()); }}>Reset to defaults</button><button type="button" className="calendar-primary" onClick={() => onStep("content")}><ArrowLeft />Back to schedule</button></>}</span></footer>
  </Dialog.Content></>}</Dialog.Root>;
}

function CalendarDatePicker({ value, onChange, onClose }: { value: string; onChange(value: string): void; onClose(): void }) {
  const selected = new Date(`${value}T12:00:00`);
  const [anchor, setAnchor] = useState(() => selected);
  const ref = usePickerDismiss(onClose);
  const days = monthDays(anchor);
  const title = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(anchor);
  const today = localDateKey(new Date());
  return <div className="calendar-date-popover" role="dialog" aria-label="Publication date" ref={ref} tabIndex={-1} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <header><strong>{title}</strong><span><button type="button" aria-label="Previous month" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}><ChevronLeft /></button><button type="button" aria-label="Next month" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}><ChevronRight /></button></span></header>
    <div className="calendar-picker-weekdays">{DOW.map((day) => <small key={day}>{day.slice(0, 1)}</small>)}</div>
    <div className="calendar-picker-days">{days.map((day) => <button type="button" className={`${day.inMonth ? "" : "is-outside"}${day.key === value ? " is-selected" : ""}${day.key === today ? " is-today" : ""}`} aria-label={`Choose ${new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(day.date)}`} key={day.key} onClick={() => onChange(day.key)}>{day.date.getDate()}</button>)}</div>
    <footer><button type="button" onClick={() => { const key = localDateKey(new Date()); onChange(key); }}>Today</button></footer>
  </div>;
}

function CalendarTimePicker({ value, onChange, onClose }: { value: string; onChange(value: string): void; onClose(): void }) {
  const [hour, minute] = value.split(":").map(Number);
  const ref = usePickerDismiss(onClose);
  const selectedHour = useRef<HTMLButtonElement>(null);
  useEffect(() => { selectedHour.current?.scrollIntoView?.({ block: "center" }); }, []);
  const setHour = (next: number) => onChange(`${String(next).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  const setMinute = (next: number) => { onChange(`${String(hour).padStart(2, "0")}:${String(next).padStart(2, "0")}`); onClose(); };
  return <div className="calendar-time-popover" role="dialog" aria-label="Publication time" ref={ref} tabIndex={-1} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <header><strong>TIME</strong><small>24 HOUR</small></header>
    <div><section aria-label="Hours">{Array.from({ length: 24 }, (_, item) => <button type="button" className={item === hour ? "is-selected" : ""} aria-label={`Set hour ${String(item).padStart(2, "0")}`} ref={item === hour ? selectedHour : undefined} key={item} onClick={() => setHour(item)}>{String(item).padStart(2, "0")}</button>)}</section><section aria-label="Minutes">{Array.from({ length: 12 }, (_, item) => item * 5).map((item) => <button type="button" className={item === minute ? "is-selected" : ""} aria-label={`Set minute ${String(item).padStart(2, "0")}`} key={item} onClick={() => setMinute(item)}>{String(item).padStart(2, "0")}</button>)}</section></div>
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
  return <Dialog.Root open={account !== null} onOpenChange={onOpenChange}>{account && <><Dialog.Overlay forceMount className="calendar-reconnect-overlay" /><Dialog.Content forceMount className="calendar-reconnect-dialog">
    <header><span><Dialog.Title>Reconnect {account.handle}</Dialog.Title><Dialog.Description>Replace the expired Postiz credential for this {capitalize(account.platform)} account.</Dialog.Description></span><Dialog.Close asChild><button type="button" aria-label="Close reconnect"><X /></button></Dialog.Close></header>
    <label><span>POSTIZ API KEY</span><input type="password" autoComplete="off" value={credential} placeholder="Paste the scoped Postiz key" onChange={(event) => onCredential(event.target.value)} /></label>
    <small>The key is sent only to Ralphy Core and stored in its encrypted credential store. It is never written to the calendar database.</small>
    <footer><Dialog.Close asChild><button type="button">Cancel</button></Dialog.Close><button type="button" className="calendar-primary" disabled={saving || credential.trim().length < 8} onClick={onSave}>{saving ? "Reconnecting…" : "Save and reconnect"}</button></footer>
  </Dialog.Content></>}</Dialog.Root>;
}

function PlatformSettings({ unit, channels, accounts, activeId, editedIds, settings, onActive, onChange, onReconnect }: { unit: CalendarReadyUnitDto | null; channels: CalendarReadyUnitDto["channels"]; accounts: CalendarWorkspaceDto["accounts"]; activeId: string | null; editedIds: Set<string>; settings: CalendarPublicationSettings; onActive(id: string): void; onChange(presentationId: string, key: string, value: JsonValue): void; onReconnect(accountId: string | null): void }) {
  const channel = channels.find((item) => channelKey(item) === activeId) ?? channels[0] ?? null;
  const disconnected = channel ? accounts.some((account) => account.id === channel.socialAccountId && account.disconnected) : false;
  const activeKey = channel ? channelKey(channel) : "";
  return <section className="calendar-platform-settings"><nav className="calendar-platform-tabs">{channels.map((item) => { const id = channelKey(item); const Icon = platformIcon(item.platform); const broken = accounts.some((account) => account.id === item.socialAccountId && account.disconnected); return <button type="button" className={id === activeKey ? "is-active" : ""} key={id} onClick={() => onActive(id)}><AccountMark identity={`${item.platform}:${item.account}`} /><span><strong><Icon />{item.account}</strong><small className={broken ? "is-warning" : ""}>{broken ? "Needs reconnect" : editedIds.has(id) ? "Edited" : `${capitalize(item.platform)} defaults`}</small></span>{broken && <AlertTriangle />}</button>; })}</nav><div className="calendar-platform-fields">{channel ? <>{disconnected && <div className="calendar-reconnect-banner"><Repeat /><span><strong>{capitalize(channel.platform)} {channel.account} needs reconnecting</strong><small>Settings save, but publishing will not start until the account is connected.</small></span><button type="button" onClick={() => onReconnect(channel.socialAccountId)}>Reconnect</button></div>}<PlatformFields platform={channel.platform} title={unit?.title ?? ""} values={settings[activeKey] ?? {}} onChange={(key, value) => onChange(activeKey, key, value)} /></> : <p>Select content first.</p>}</div></section>;
}

function PlatformFields({ platform, title, values, onChange }: { platform: string; title: string; values: Record<string, JsonValue>; onChange(key: string, value: JsonValue): void }) {
  const value = <T extends JsonValue>(key: string, fallback: T) => (values[key] as T | undefined) ?? fallback;
  if (platform === "instagram") return <><SettingsSegment label="PUBLISH AS" options={["Reel", "Post", "Story"]} value={value("publishAs", "Reel")} onChange={(next) => onChange("publishAs", next)} /><SettingsCheck label="Share to feed" checked={value("shareToFeed", true)} onChange={(next) => onChange("shareToFeed", next)} /><SettingsText label="COLLABORATOR" value={value("collaborator", "")} placeholder="@username" onChange={(next) => onChange("collaborator", next)} /><SettingsText label="LOCATION" value={value("location", "")} placeholder="Add location" onChange={(next) => onChange("location", next)} /></>;
  if (platform === "youtube") return <><SettingsText label="TITLE" maxLength={100} value={value("title", title)} onChange={(next) => onChange("title", next)} /><SettingsArea label="DESCRIPTION" maxLength={5000} value={value("description", "")} onChange={(next) => onChange("description", next)} /><SettingsSegment label="VISIBILITY" options={["Public", "Unlisted", "Private"]} value={value("visibility", "Public")} onChange={(next) => onChange("visibility", next)} /><SettingsCheck label="Made for kids" checked={value("madeForKids", false)} onChange={(next) => onChange("madeForKids", next)} /><SettingsText label="PLAYLIST" value={value("playlist", "")} placeholder="Choose playlist" onChange={(next) => onChange("playlist", next)} /></>;
  if (platform === "tiktok") return <><SettingsSegment label="WHO CAN VIEW" options={["Public", "Friends", "Private"]} value={value("visibility", "Public")} onChange={(next) => onChange("visibility", next)} /><SettingsCheck label="Allow comments" checked={value("comments", true)} onChange={(next) => onChange("comments", next)} /><SettingsCheck label="Allow duet" checked={value("duet", true)} onChange={(next) => onChange("duet", next)} /><SettingsCheck label="Allow stitch" checked={value("stitch", false)} onChange={(next) => onChange("stitch", next)} /><SettingsCheck label="Disclose branded content" hint="Required for paid partnerships" checked={value("brandedContent", false)} onChange={(next) => onChange("brandedContent", next)} /><SettingsCheck label="Add trending audio" hint="Picked from the Unit soundtrack" checked={value("trendingAudio", true)} onChange={(next) => onChange("trendingAudio", next)} /></>;
  return <><SettingsSegment label="WHO CAN REPLY" options={["Everyone", "Following", "Mentioned"]} value={value("replyAudience", "Everyone")} onChange={(next) => onChange("replyAudience", next)} /><SettingsCheck label="Post as thread" checked={value("thread", true)} onChange={(next) => onChange("thread", next)} /><SettingsCheck label="Copy alt text from Unit" checked={value("copyAltText", true)} onChange={(next) => onChange("copyAltText", next)} /></>;
}

function SettingsSegment({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange(value: string): void }) { return <label className="calendar-settings-field"><span>{label}</span><span className="calendar-settings-segment">{options.map((option) => <button type="button" className={value === option ? "is-active" : ""} key={option} onClick={() => onChange(option)}>{option}</button>)}</span></label>; }
function SettingsCheck({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange(value: boolean): void }) { return <button type="button" className="calendar-settings-check" onClick={() => onChange(!checked)}><span><strong>{label}</strong>{hint && <small>{hint}</small>}</span><i className="calendar-check-box">{checked && <Check />}</i></button>; }
function SettingsText({ label, value, placeholder, maxLength, onChange }: { label: string; value: string; placeholder?: string; maxLength?: number; onChange(value: string): void }) { return <label className="calendar-settings-field"><span className="calendar-settings-label">{label}{maxLength && <small>{value.length}/{maxLength}</small>}</span><input value={value} placeholder={placeholder} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} /></label>; }
function SettingsArea({ label, value, maxLength, onChange }: { label: string; value: string; maxLength?: number; onChange(value: string): void }) { return <label className="calendar-settings-field"><span className="calendar-settings-label">{label}{maxLength && <small>{value.length}/{maxLength}</small>}</span><textarea value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} /></label>; }

function settingsForChannels(channels: CalendarReadyUnitDto["channels"]): CalendarPublicationSettings { return Object.fromEntries(channels.map((channel) => [channelKey(channel), isJsonRecord(channel.settings) ? { ...channel.settings } : {}])); }
function isJsonRecord(value: JsonValue): value is Record<string, JsonValue> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function channelKey(channel: Pick<CalendarChannelInput, "presentationId" | "socialAccountId">) { return `${channel.presentationId}:${channel.socialAccountId}`; }
function CalendarLoading() { return <div className="calendar-loading"><span /><span /><span /></div>; }
function CalendarError({ error, onRetry }: { error: string; onRetry(): void }) { return <div className="calendar-error"><AlertTriangle /><strong>Calendar could not be loaded</strong><span>{error}</span><small>{new Date().toISOString()}</small><button type="button" onClick={onRetry}>Try again</button></div>; }

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
