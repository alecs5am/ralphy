/**
 * Putting a unit in the calendar: the two-step schedule dialog, its date and time pickers, the
 * per-platform settings and the reconnect prompt.
 *
 * Nothing here is saved until the dialog reports it: the settings are edited against a local copy
 * so a cancelled dialog leaves the channel exactly as the source described it.
 */
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle, ArrowLeft, ArrowUpRight, CalendarClock, Check, ChevronDown, ChevronLeft,
  ChevronRight, Clock3, Globe2, Repeat, SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CalendarChannelInput, CalendarReadyUnitDto, CalendarWorkspaceDto, JsonValue,
} from "../../../../electron/ralphy/types";
import { IconButton } from "@/shared/ui/IconButton";
import { Modal } from "@/shared/ui/Modal";
import {
  ACTION, CHECK_BOX, CHECK_MARK_ON_INSTRUMENT, CHECK_MARK_ON_SURFACE, OVERLAY_ACTION,
  OVERLAY_ACTION_PRIMARY, OVERLAY_FIELD_RING, OVERLAY_RING,
} from "@/shared/ui/overlay-chrome";
import { calendarDayKey, monthDays, zonedDateTimeToEpoch } from "../lib/presentation";
import { DOW, ICON, ICON_LG, ICON_MD, ICON_XL, MODAL_FIELD_LABEL, MODAL_INPUT, MODAL_ROW, MODAL_ROW_COPY, PICKER_CELL, PICKER_DAY, SEGMENT_BUTTON, capitalize, localDateKey, platformIcon, timezoneLabel } from "./calendar-chrome";
import { AccountMark, CalendarThumb } from "./calendar-views";

export type CalendarPublicationSettings = Record<string, Record<string, JsonValue>>;

export function ScheduleDialog({ open, unit, units, accounts, step, initialDate, timezone, postizAvailable, saving, onOpenChange, onSelect, onStep, onSave, onReconnect, onOpenUnit }: { open: boolean; unit: CalendarReadyUnitDto | null; units: CalendarReadyUnitDto[]; accounts: CalendarWorkspaceDto["accounts"]; step: "content" | "settings"; initialDate: string | null; timezone: string; postizAvailable: boolean; saving: boolean; onOpenChange(open: boolean): void; onSelect(unit: CalendarReadyUnitDto): void; onStep(step: "content" | "settings"): void; onSave(submit: boolean, at: number, channels: CalendarChannelInput[], unitRevisionId: string): void; onReconnect(accountId: string | null): void; onOpenUnit(): void }) {
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

  return <Modal
    id="calendar-schedule"
    open={open}
    onOpenChange={onOpenChange}
    size="h-calendar-modal-height w-calendar-modal-width"
    className="calendar-modal animate-calendar-modal-in motion-reduce:animate-none"
    scrimClassName="calendar-modal-overlay"
    eyebrow={<small className={MODAL_FIELD_LABEL}>{step === "content" ? "SCHEDULE CONTENT" : "PLATFORM SETTINGS"}</small>}
    title={unit?.title ?? "Schedule content"}
    titleClassName="m-0 min-w-0 flex-1 truncate type-heading font-normal tracking-normal text-ink"
    description="Choose a Unit, publishing accounts, time, and publication-specific platform settings."
    descriptionClassName="calendar-modal-description sr-only"
    closeLabel="Close schedule content"
    actions={<button type="button" className={`calendar-open-unit ${ACTION} h-7 px-2.75 type-sm bg-surface text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-35 ${OVERLAY_RING}`} disabled={!unit?.projectId} onClick={onOpenUnit}><ArrowUpRight className={ICON} />Open Unit</button>}
  >
    <div className="calendar-modal-layout grid min-h-0 flex-1 grid-cols-(--calendar-modal-columns) gap-5.5 overflow-y-auto px-6 pb-5 pt-4">
      <aside className="calendar-modal-unit relative flex w-75 flex-col gap-3">
        <div className="calendar-modal-poster-wrap relative h-100 w-75 flex-none">{poster ? <CalendarThumb event={poster} className="calendar-modal-poster h-100 w-75 rounded-poster [&_i]:type-poster-glyph" /> : <span className="calendar-modal-poster is-empty block h-100 w-75 rounded-poster bg-surface-sunken" />}<span className="absolute left-2.5 top-2.5 flex h-5 items-center rounded-chip bg-media-plate px-2 font-code type-mono-md text-on-instrument">{unit?.kind ?? "No unit"}</span></div>
        <section className="flex flex-col gap-1.75"><label className={MODAL_FIELD_LABEL}>REVISION TO PUBLISH</label><div className="calendar-revision-picker flex gap-1.25">{revisions.map((revision) => <button type="button" className={`${ACTION} h-6.5 px-2.5 font-code type-label ${revision.unitRevisionId === revisionId ? "is-active bg-instrument text-on-instrument" : "bg-surface-sunken text-muted hover:bg-surface hover:text-ink"} ${OVERLAY_RING}`} key={revision.unitRevisionId} onClick={() => setRevisionSelection({ unitId: unit!.unitId, revisionId: revision.unitRevisionId })}>R{revision.revision}</button>)}</div>{activeRevision && latestRevision !== null && activeRevision.revision < latestRevision ? <small className="is-warning flex items-start gap-1.25 font-code type-mono-sm leading-prose text-muted"><AlertTriangle className={`${ICON_MD} mt-0.5 flex-none`} />R{activeRevision.revision} is older than the latest R{latestRevision}. This publication will stay pinned to R{activeRevision.revision}.</small> : <small className="font-code type-mono-sm leading-prose text-muted">R{activeRevision?.revision ?? unit?.revision ?? "—"} is pinned to this publication. Calendar keeps it when the Unit selection changes.</small>}</section>
        <button type="button" className={`calendar-pick-unit ${ACTION} h-7.5 gap-1.75 px-2.75 type-sm bg-surface-sunken text-ink hover:bg-surface ${OVERLAY_RING}`} onClick={() => setPickerOpen((value) => !value)}><Repeat className={ICON_LG} />Pick another unit</button>
        {pickerOpen && <div className="calendar-unit-popover absolute inset-x-0 bottom-10 z-surface-overlay flex max-h-75 flex-col gap-0.75 overflow-y-auto rounded-cell bg-surface-sunken p-1.5" data-instrument-overlay="calendar-unit-picker">{units.map((item) => { const chosen = item.unitId === unit?.unitId; return <button type="button" key={item.unitId} className={`flex min-h-13.5 items-center gap-2.5 rounded-control px-1.75 py-1.5 text-left transition-colors duration-fast ease-instrument motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING} ${chosen ? " is-selected bg-instrument text-on-instrument" : "bg-transparent text-ink hover:bg-surface"}`} onClick={() => { onSelect(item); setPickerOpen(false); }}><CalendarThumb event={item} className="h-11.5 w-8.5 rounded-chip" /><span className="flex min-w-0 flex-1 flex-col gap-1"><strong className={`truncate type-sm font-normal ${chosen ? "text-on-instrument" : "text-ink"}`}>{item.title}</strong><small className={`font-code type-mono-sm ${chosen ? "text-on-instrument-muted" : "text-muted"}`}>{item.project} · R{item.revision ?? "—"} · {item.kind}</small></span>{chosen && <Check className={ICON} />}</button>; })}</div>}
      </aside>
      {step === "content" ? <section className="calendar-schedule-form flex min-w-0 flex-col gap-4">
        <div className="calendar-date-fields grid grid-cols-(--calendar-date-columns) gap-2.5"><div className="flex min-w-0 flex-col gap-1.75"><span className={MODAL_FIELD_LABEL}>DATE</span><span className="calendar-picker-wrap relative block min-w-0"><button type="button" className={`calendar-picker-trigger flex h-8.5 w-full items-center gap-2.25 rounded-control bg-surface-sunken px-2.75 text-left transition-colors duration-fast ease-instrument hover:bg-surface aria-expanded:bg-surface motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`} aria-label="Choose publication date" aria-expanded={schedulePicker === "date"} onClick={() => setSchedulePicker((value) => value === "date" ? null : "date")}><CalendarClock className={`${ICON} flex-none text-muted`} /><b className="min-w-0 flex-1 truncate font-code type-sm font-normal text-ink">{formatInputDate(date)}</b><ChevronDown className={`${ICON} flex-none text-muted`} /></button>{schedulePicker === "date" && <CalendarDatePicker value={date} onChange={(value) => { setDate(value); setSchedulePicker(null); }} onClose={() => setSchedulePicker(null)} />}</span></div><div className="flex min-w-0 flex-col gap-1.75"><span className={MODAL_FIELD_LABEL}>TIME</span><span className="calendar-picker-wrap relative block min-w-0"><button type="button" className={`calendar-picker-trigger flex h-8.5 w-full items-center gap-2.25 rounded-control bg-surface-sunken px-2.75 text-left transition-colors duration-fast ease-instrument hover:bg-surface aria-expanded:bg-surface motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`} aria-label="Choose publication time" aria-expanded={schedulePicker === "time"} onClick={() => setSchedulePicker((value) => value === "time" ? null : "time")}><Clock3 className={`${ICON} flex-none text-muted`} /><b className="min-w-0 flex-1 truncate font-code type-sm font-normal text-ink">{time}</b><ChevronDown className={`${ICON} flex-none text-muted`} /></button>{schedulePicker === "time" && <CalendarTimePicker value={time} onChange={setTime} onClose={() => setSchedulePicker(null)} />}</span></div><div className="flex min-w-0 flex-col gap-1.75"><span className={MODAL_FIELD_LABEL}>TIMEZONE</span><span className="calendar-timezone-field flex h-8.5 items-center gap-2.25 truncate whitespace-nowrap rounded-control bg-surface-sunken px-2.75 font-code type-sm text-ink"><Globe2 className={`${ICON} flex-none text-muted`} />{timezoneLabel(timezone)} · {timezone.split("/").at(-1)}</span></div></div>
        <section className="calendar-channel-section flex flex-col gap-1.75"><header className="flex items-center gap-2.25"><span className={MODAL_FIELD_LABEL}>CHANNELS</span><small className="font-code type-mono-md text-muted">{selectedChannels.length} of {channels.filter((channel) => !disconnectedIds.has(channel.socialAccountId)).length} available selected{channels.some((channel) => disconnectedIds.has(channel.socialAccountId)) ? ` · ${channels.filter((channel) => disconnectedIds.has(channel.socialAccountId)).length} needs reconnect` : ""}</small><i className="flex-1" /><button type="button" className={`${ACTION} h-6 px-2.25 type-label bg-surface-sunken text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-35 ${OVERLAY_RING}`} disabled={!unit} onClick={() => onStep("settings")}><SlidersHorizontal className={ICON_MD} />Platform settings</button></header><div className="calendar-modal-channels grid grid-cols-2 gap-1.5">{channels.map((channel) => { const id = channelKey(channel); const Icon = platformIcon(channel.platform); const disconnected = disconnectedIds.has(channel.socialAccountId); const chosen = selectedIds.includes(id); const content = <><AccountMark identity={`${channel.platform}:${channel.account}`} /><span className={MODAL_ROW_COPY}><strong className={`flex items-center gap-1.5 truncate type-ui font-normal ${chosen ? "text-on-instrument" : "text-ink"}`}><Icon className={`${ICON_LG} flex-none ${chosen ? "text-on-instrument-muted" : "text-muted"}`} />{channel.account}</strong><small className={`truncate font-code type-mono-sm ${chosen ? "text-on-instrument-muted" : "text-muted"}`}>{disconnected ? "Token expired — reconnect to publish" : `${capitalize(channel.platform)} · ready`}</small></span>{disconnected ? <button type="button" className={`${ACTION} h-5.5 px-2.25 type-xs bg-surface text-ink hover:bg-surface-hover ${OVERLAY_RING}`} onClick={() => onReconnect(channel.socialAccountId)}>Reconnect</button> : <i className={`calendar-check-box ${CHECK_BOX} ${chosen ? "bg-on-instrument" : "bg-surface"}`}>{chosen && <Check className={`${ICON_MD} ${CHECK_MARK_ON_INSTRUMENT}`} strokeWidth={2.6} />}</i>}</>; return disconnected ? <div className={`calendar-channel-option is-disconnected ${MODAL_ROW} bg-surface-sunken text-ink`} key={id}>{content}</div> : <button type="button" className={`calendar-channel-option ${MODAL_ROW} ${chosen ? " is-selected bg-instrument text-on-instrument" : " bg-surface-sunken text-ink hover:bg-surface"}`} key={id} onClick={() => toggleChannel(id)}>{content}</button>; })}</div></section>
        <label className={`calendar-caption-field flex min-w-0 flex-col gap-1.75 ${OVERLAY_FIELD_RING}`}><span className={MODAL_FIELD_LABEL}>CAPTION</span><div className="flex flex-col gap-2 rounded-field bg-surface-sunken px-3 py-2.5"><textarea className="h-9.5 resize-none bg-transparent p-0 type-ui leading-prose text-ink outline-none" value={caption} onChange={(event) => setCaption(event.target.value)} /><footer className="flex items-center gap-2"><b className="flex h-5.5 items-center rounded-control bg-surface px-2 font-code type-mono-md font-normal text-ink">#ralphy</b><b className="flex h-5.5 items-center rounded-control bg-surface px-2 font-code type-mono-md font-normal text-ink">#content</b><small className="ml-auto font-code type-mono-sm text-muted">1 caption for all channels</small></footer></div></label>
      </section> : <PlatformSettings unit={unit} channels={channels} accounts={accounts} activeId={platformTab} editedIds={editedIds} settings={settings} onActive={setPlatformTab} onChange={updateSetting} onReconnect={onReconnect} />}
    </div>
    <i className="mx-6 h-px flex-none bg-divider" aria-hidden="true" />
    <footer className="flex flex-none items-center gap-4.5 px-6 pb-4.25 pt-3.25"><small className="max-w-calendar-note font-code type-mono-sm leading-row text-muted">{step === "content" ? "Published through Postiz — selected accounts leave as one publication. Channel staggering lives in Platform settings." : "Settings belong to this publication, not the account. The next publication starts from platform defaults."}</small><span className="ml-auto flex gap-2">{step === "content" ? <><button type="button" className={`${OVERLAY_ACTION} disabled:cursor-not-allowed disabled:opacity-35`} disabled={!unit || saving || selectedChannels.length === 0} onClick={() => onSave(false, at(), payload(), revisionId)}>Save as draft</button><button type="button" className={`calendar-primary ${OVERLAY_ACTION_PRIMARY} disabled:cursor-not-allowed disabled:opacity-35`} disabled={!unit || !postizAvailable || saving || selectedChannels.length === 0} onClick={() => onSave(true, at(), payload(), revisionId)}>{saving ? "Saving…" : `Schedule ${selectedChannels.length} ${selectedChannels.length === 1 ? "publication" : "publications"}`}</button></> : <><button type="button" className={OVERLAY_ACTION} onClick={() => { setSettings(settingsForChannels(channels)); setEditedIds(new Set()); }}>Reset to defaults</button><button type="button" className={`calendar-primary ${OVERLAY_ACTION_PRIMARY}`} onClick={() => onStep("content")}><ArrowLeft className={ICON_LG} />Back to schedule</button></>}</span></footer>
  </Modal>;
}

export function CalendarDatePicker({ value, onChange, onClose }: { value: string; onChange(value: string): void; onClose(): void }) {
  const selected = new Date(`${value}T12:00:00`);
  const [anchor, setAnchor] = useState(() => selected);
  const ref = usePickerDismiss(onClose);
  const days = monthDays(anchor);
  const title = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(anchor);
  const today = localDateKey(new Date());
  return <div className="calendar-date-popover absolute left-0 top-full z-surface-overlay mt-1.75 w-calendar-date-popover rounded-cell bg-surface p-2.5 text-ink outline-0" data-instrument-overlay="calendar-date-popover" role="dialog" aria-label="Publication date" ref={ref} tabIndex={-1} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <header className="flex h-7.5 items-center px-0.75"><strong className="type-sm font-normal text-ink">{title}</strong><span className="ml-auto flex gap-0.5"><IconButton className="size-6.75 rounded-control hover:bg-surface-hover" label="Previous month" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}><ChevronLeft className={ICON} /></IconButton><IconButton className="size-6.75 rounded-control hover:bg-surface-hover" label="Next month" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}><ChevronRight className={ICON} /></IconButton></span></header>
    <div className="calendar-picker-weekdays grid grid-cols-7 gap-0.5 pb-0.75 pt-1.25">{DOW.map((day) => <small className="grid h-5.5 place-items-center font-code type-mono-sm text-muted" key={day}>{day.slice(0, 1)}</small>)}</div>
    <div className="calendar-picker-days grid grid-cols-7 gap-0.5">{days.map((day) => <button type="button" className={`${PICKER_DAY} ${day.key === value ? " is-selected bg-desk-primary text-desk-primary-ink" : day.key === today ? " is-today bg-transparent text-ink [box-shadow:inset_0_0_0_1px_var(--instrument-text-primary)]" : day.inMonth ? "bg-transparent text-ink hover:bg-surface-hover" : "is-outside bg-transparent text-muted hover:bg-surface-hover"}`} aria-label={`Choose ${new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(day.date)}`} key={day.key} onClick={() => onChange(day.key)}>{day.date.getDate()}</button>)}</div>
    <footer className="flex justify-end px-0.5 pt-1.75"><button type="button" className={`flex h-6.25 items-center rounded-control bg-surface-sunken px-2.25 type-xs text-ink transition-colors duration-fast ease-instrument hover:bg-surface-hover motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`} onClick={() => { const key = localDateKey(new Date()); onChange(key); }}>Today</button></footer>
  </div>;
}

export function CalendarTimePicker({ value, onChange, onClose }: { value: string; onChange(value: string): void; onClose(): void }) {
  const [hour, minute] = value.split(":").map(Number);
  const ref = usePickerDismiss(onClose);
  const selectedHour = useRef<HTMLButtonElement>(null);
  useEffect(() => { selectedHour.current?.scrollIntoView?.({ block: "center" }); }, []);
  const setHour = (next: number) => onChange(`${String(next).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  const setMinute = (next: number) => { onChange(`${String(hour).padStart(2, "0")}:${String(next).padStart(2, "0")}`); onClose(); };
  const cell = (active: boolean) => `${PICKER_CELL} ${active ? " is-selected bg-desk-primary text-desk-primary-ink" : "bg-transparent text-muted hover:bg-surface-hover hover:text-ink"}`;
  return <div className="calendar-time-popover absolute left-0 top-full z-surface-overlay mt-1.75 w-calendar-time-popover rounded-cell bg-surface p-2.5 text-ink outline-0" data-instrument-overlay="calendar-time-popover" role="dialog" aria-label="Publication time" ref={ref} tabIndex={-1} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <header className="flex h-7.5 items-center px-0.5 pb-1.75"><strong className="type-sm font-normal text-ink">TIME</strong><small className="ml-auto font-code type-mono-sm text-muted">24 HOUR</small></header>
    <div className="grid grid-cols-2 gap-1.5"><section className="flex max-h-63 flex-col gap-0.5 overflow-y-auto rounded-field bg-surface-sunken p-0.75 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Hours">{Array.from({ length: 24 }, (_, item) => <button type="button" className={cell(item === hour)} aria-label={`Set hour ${String(item).padStart(2, "0")}`} ref={item === hour ? selectedHour : undefined} key={item} onClick={() => setHour(item)}>{String(item).padStart(2, "0")}</button>)}</section><section className="flex max-h-63 flex-col gap-0.5 overflow-y-auto rounded-field bg-surface-sunken p-0.75 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Minutes">{Array.from({ length: 12 }, (_, item) => item * 5).map((item) => <button type="button" className={cell(item === minute)} aria-label={`Set minute ${String(item).padStart(2, "0")}`} key={item} onClick={() => setMinute(item)}>{String(item).padStart(2, "0")}</button>)}</section></div>
  </div>;
}

export function usePickerDismiss(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => { if (!ref.current?.parentElement?.contains(event.target as Node)) onClose(); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [onClose]);
  return ref;
}

export function ReconnectDialog({ account, credential, saving, onCredential, onOpenChange, onSave }: { account: CalendarWorkspaceDto["accounts"][number] | null; credential: string; saving: boolean; onCredential(value: string): void; onOpenChange(open: boolean): void; onSave(): void }) {
  return <Modal
    id="calendar-reconnect"
    open={account !== null}
    onOpenChange={onOpenChange}
    size="h-fit w-calendar-reconnect"
    className="calendar-reconnect-dialog"
    title={account ? `Reconnect ${account.handle}` : "Reconnect"}
    titleClassName="m-0 min-w-0 flex-1 truncate type-heading font-normal text-ink"
    description={account ? `Replace the expired Postiz credential for this ${capitalize(account.platform)} account.` : ""}
    descriptionClassName="sr-only"
    closeLabel="Close reconnect"
    bodyClassName="calendar-reconnect-card gap-4 p-5"
  >{account && <>
    <p className="m-0 type-sm leading-row text-muted">Replace the expired Postiz credential for this {capitalize(account.platform)} account.</p>
    <label className={`flex flex-col gap-1.75 ${OVERLAY_FIELD_RING}`}><span className={MODAL_FIELD_LABEL}>POSTIZ API KEY</span><input className={`${MODAL_INPUT} h-9`} type="password" autoComplete="off" value={credential} placeholder="Paste the scoped Postiz key" onChange={(event) => onCredential(event.target.value)} /></label>
    <small className="font-code type-mono-sm leading-prose text-muted">The key is sent only to Ralphy Core and stored in its encrypted credential store. It is never written to the calendar database.</small>
    <footer className="flex justify-end gap-2"><Dialog.Close asChild><button type="button" className={OVERLAY_ACTION}>Cancel</button></Dialog.Close><button type="button" className={`calendar-primary ${OVERLAY_ACTION_PRIMARY} disabled:cursor-not-allowed disabled:opacity-35`} disabled={saving || credential.trim().length < 8} onClick={onSave}>{saving ? "Reconnecting…" : "Save and reconnect"}</button></footer>
  </>}</Modal>;
}

export function PlatformSettings({ unit, channels, accounts, activeId, editedIds, settings, onActive, onChange, onReconnect }: { unit: CalendarReadyUnitDto | null; channels: CalendarReadyUnitDto["channels"]; accounts: CalendarWorkspaceDto["accounts"]; activeId: string | null; editedIds: Set<string>; settings: CalendarPublicationSettings; onActive(id: string): void; onChange(presentationId: string, key: string, value: JsonValue): void; onReconnect(accountId: string | null): void }) {
  const channel = channels.find((item) => channelKey(item) === activeId) ?? channels[0] ?? null;
  const disconnected = channel ? accounts.some((account) => account.id === channel.socialAccountId && account.disconnected) : false;
  const activeKey = channel ? channelKey(channel) : "";
  return <section className="calendar-platform-settings flex min-w-0 gap-3.5" data-instrument-overlay="calendar-platform-settings"><nav className="calendar-platform-tabs flex w-calendar-platform-tabs flex-none flex-col gap-1">{channels.map((item) => { const id = channelKey(item); const Icon = platformIcon(item.platform); const broken = accounts.some((account) => account.id === item.socialAccountId && account.disconnected); const chosen = id === activeKey; return <button type="button" className={`${MODAL_ROW} ${chosen ? "is-active bg-instrument text-on-instrument" : "bg-transparent text-ink hover:bg-surface-sunken"}`} key={id} onClick={() => onActive(id)}><AccountMark identity={`${item.platform}:${item.account}`} /><span className={MODAL_ROW_COPY}><strong className={`flex items-center gap-1.5 truncate type-ui font-normal ${chosen ? "text-on-instrument" : "text-ink"}`}><Icon className={`${ICON_LG} flex-none ${chosen ? "text-on-instrument-muted" : "text-muted"}`} />{item.account}</strong><small className={`font-code type-mono-sm ${chosen ? "text-on-instrument-muted" : "text-muted"}`}>{broken ? "Needs reconnect" : editedIds.has(id) ? "Edited" : `${capitalize(item.platform)} defaults`}</small></span>{broken && <AlertTriangle className={`${ICON_LG} flex-none ${chosen ? "text-on-instrument-muted" : "text-muted"}`} />}</button>; })}</nav><div className="calendar-platform-fields flex h-100 min-w-0 flex-1 flex-col gap-3.5 overflow-y-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{channel ? <>{disconnected && <div className="calendar-reconnect-banner flex items-center gap-2.75 rounded-cell bg-surface-sunken px-3 py-2.75"><Repeat className={`${ICON_XL} flex-none text-muted`} /><span className="flex min-w-0 flex-1 flex-col gap-0.75"><strong className="type-ui font-normal text-ink">{capitalize(channel.platform)} {channel.account} needs reconnecting</strong><small className="font-code type-mono-sm text-muted">Settings save, but publishing will not start until the account is connected.</small></span><button type="button" className={`${ACTION} h-7 px-3 type-sm bg-surface text-ink hover:bg-surface-hover ${OVERLAY_RING}`} onClick={() => onReconnect(channel.socialAccountId)}>Reconnect</button></div>}<PlatformFields platform={channel.platform} title={unit?.title ?? ""} values={settings[activeKey] ?? {}} onChange={(key, value) => onChange(activeKey, key, value)} /></> : <p className="m-0 type-sm text-muted">Select content first.</p>}</div></section>;
}

export function PlatformFields({ platform, title, values, onChange }: { platform: string; title: string; values: Record<string, JsonValue>; onChange(key: string, value: JsonValue): void }) {
  const value = <T extends JsonValue>(key: string, fallback: T) => (values[key] as T | undefined) ?? fallback;
  if (platform === "instagram") return <><SettingsSegment label="PUBLISH AS" options={["Reel", "Post", "Story"]} value={value("publishAs", "Reel")} onChange={(next) => onChange("publishAs", next)} /><SettingsCheck label="Share to feed" checked={value("shareToFeed", true)} onChange={(next) => onChange("shareToFeed", next)} /><SettingsText label="COLLABORATOR" value={value("collaborator", "")} placeholder="@username" onChange={(next) => onChange("collaborator", next)} /><SettingsText label="LOCATION" value={value("location", "")} placeholder="Add location" onChange={(next) => onChange("location", next)} /></>;
  if (platform === "youtube") return <><SettingsText label="TITLE" maxLength={100} value={value("title", title)} onChange={(next) => onChange("title", next)} /><SettingsArea label="DESCRIPTION" maxLength={5000} value={value("description", "")} onChange={(next) => onChange("description", next)} /><SettingsSegment label="VISIBILITY" options={["Public", "Unlisted", "Private"]} value={value("visibility", "Public")} onChange={(next) => onChange("visibility", next)} /><SettingsCheck label="Made for kids" checked={value("madeForKids", false)} onChange={(next) => onChange("madeForKids", next)} /><SettingsText label="PLAYLIST" value={value("playlist", "")} placeholder="Choose playlist" onChange={(next) => onChange("playlist", next)} /></>;
  if (platform === "tiktok") return <><SettingsSegment label="WHO CAN VIEW" options={["Public", "Friends", "Private"]} value={value("visibility", "Public")} onChange={(next) => onChange("visibility", next)} /><SettingsCheck label="Allow comments" checked={value("comments", true)} onChange={(next) => onChange("comments", next)} /><SettingsCheck label="Allow duet" checked={value("duet", true)} onChange={(next) => onChange("duet", next)} /><SettingsCheck label="Allow stitch" checked={value("stitch", false)} onChange={(next) => onChange("stitch", next)} /><SettingsCheck label="Disclose branded content" hint="Required for paid partnerships" checked={value("brandedContent", false)} onChange={(next) => onChange("brandedContent", next)} /><SettingsCheck label="Add trending audio" hint="Picked from the Unit soundtrack" checked={value("trendingAudio", true)} onChange={(next) => onChange("trendingAudio", next)} /></>;
  return <><SettingsSegment label="WHO CAN REPLY" options={["Everyone", "Following", "Mentioned"]} value={value("replyAudience", "Everyone")} onChange={(next) => onChange("replyAudience", next)} /><SettingsCheck label="Post as thread" checked={value("thread", true)} onChange={(next) => onChange("thread", next)} /><SettingsCheck label="Copy alt text from Unit" checked={value("copyAltText", true)} onChange={(next) => onChange("copyAltText", next)} /></>;
}

export function SettingsSegment({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange(value: string): void }) { return <div className="calendar-settings-field flex min-w-0 flex-col gap-1.75"><span className={MODAL_FIELD_LABEL}>{label}</span><span className="calendar-settings-segment flex self-start rounded-control bg-surface-sunken p-0.75">{options.map((option) => <button type="button" className={`${SEGMENT_BUTTON} ${value === option ? "is-active bg-instrument text-on-instrument" : " bg-transparent text-muted hover:text-ink"}`} key={option} onClick={() => onChange(option)}>{option}</button>)}</span></div>; }
export function SettingsCheck({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange(value: boolean): void }) { return <button type="button" className={`calendar-settings-check flex min-h-9.5 items-center gap-3 rounded-control bg-surface-sunken px-2.5 py-2 text-left transition-colors duration-fast ease-instrument hover:bg-surface motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`} onClick={() => onChange(!checked)}><span className="flex min-w-0 flex-1 flex-col gap-0.5"><strong className="type-ui font-normal text-ink">{label}</strong>{hint && <small className="font-code type-mono-sm text-muted">{hint}</small>}</span><i className={`calendar-check-box ${CHECK_BOX} ${checked ? "bg-desk-primary" : "bg-surface"}`}>{checked && <Check className={`${ICON_MD} ${CHECK_MARK_ON_SURFACE}`} strokeWidth={2.6} />}</i></button>; }
export function SettingsText({ label, value, placeholder, maxLength, onChange }: { label: string; value: string; placeholder?: string; maxLength?: number; onChange(value: string): void }) { return <label className={`calendar-settings-field flex min-w-0 flex-col gap-1.75 ${OVERLAY_FIELD_RING}`}><span className={`calendar-settings-label flex items-center ${MODAL_FIELD_LABEL}`}>{label}{maxLength && <small className="ml-auto type-mono-sm tracking-normal text-muted">{value.length}/{maxLength}</small>}</span><input className={MODAL_INPUT} value={value} placeholder={placeholder} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} /></label>; }
export function SettingsArea({ label, value, maxLength, onChange }: { label: string; value: string; maxLength?: number; onChange(value: string): void }) { return <label className={`calendar-settings-field flex min-w-0 flex-col gap-1.75 ${OVERLAY_FIELD_RING}`}><span className={`calendar-settings-label flex items-center ${MODAL_FIELD_LABEL}`}>{label}{maxLength && <small className="ml-auto type-mono-sm tracking-normal text-muted">{value.length}/{maxLength}</small>}</span><textarea className="h-17.5 min-w-0 resize-none rounded-field bg-surface-sunken px-2.75 pt-2.5 type-sm text-ink outline-none placeholder:text-muted" value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} /></label>; }

export function settingsForChannels(channels: CalendarReadyUnitDto["channels"]): CalendarPublicationSettings { return Object.fromEntries(channels.map((channel) => [channelKey(channel), isJsonRecord(channel.settings) ? { ...channel.settings } : {}])); }
export function isJsonRecord(value: JsonValue): value is Record<string, JsonValue> { return value !== null && typeof value === "object" && !Array.isArray(value); }
export function channelKey(channel: Pick<CalendarChannelInput, "presentationId" | "socialAccountId">) { return `${channel.presentationId}:${channel.socialAccountId}`; }

export function formatInputDate(value: string) { const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(date); }
