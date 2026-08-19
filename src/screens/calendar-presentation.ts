import type { CalendarEventDto, CalendarEventStatus } from "../../electron/ralphy/types";

export type CalendarView = "month" | "week" | "agenda";
export type CalendarDay = { key: string; date: Date; inMonth: boolean };
export type CalendarFilters = { projectIds: string[]; platforms: string[]; statuses: CalendarEventStatus[] };

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);
}

function monday(date: Date): Date {
  const day = date.getDay() || 7;
  return addDays(date, 1 - day);
}

export function monthDays(anchor: Date): CalendarDay[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  const start = monday(first);
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index);
    return { key: dateKey(date), date, inMonth: date.getMonth() === anchor.getMonth() };
  });
}

export function weekDays(anchor: Date): CalendarDay[] {
  const start = monday(anchor);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    return { key: dateKey(date), date, inMonth: date.getMonth() === anchor.getMonth() };
  });
}

export function calendarRange(view: CalendarView, anchor: Date): { from: string; to: string } {
  const days = view === "week" ? weekDays(anchor) : monthDays(anchor);
  const from = days[0]!.date;
  const after = addDays(days.at(-1)!.date, 1);
  return {
    from: new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())).toISOString(),
    to: new Date(Date.UTC(after.getFullYear(), after.getMonth(), after.getDate())).toISOString(),
  };
}

export function calendarDayKey(at: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function formatCalendarTime(at: number | null, timezone: string): string {
  return at === null ? "No time" : new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(at);
}

export function zonedDateTimeToEpoch(date: string, time: string, timezone: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(`${date} ${time}`);
  if (!match) throw new Error("Choose a valid date and time");
  const values = match.slice(1).map(Number);
  const desired = Date.UTC(values[0]!, values[1]! - 1, values[2]!, values[3]!, values[4]!);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const wallClock = (at: number) => {
    const parts = formatter.formatToParts(at);
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)!.value);
    return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"));
  };
  let result = desired - (wallClock(desired) - desired);
  result -= wallClock(result) - desired;
  if (wallClock(result) !== desired) throw new Error("That local time does not exist in this timezone");
  return result;
}

export function filterCalendarEvents(events: CalendarEventDto[], filters: CalendarFilters): CalendarEventDto[] {
  return events.filter((event) =>
    (filters.projectIds.length === 0 || (event.projectId !== null && filters.projectIds.includes(event.projectId)))
    && (filters.platforms.length === 0 || event.channels.some((channel) => filters.platforms.includes(channel.platform)))
    && (filters.statuses.length === 0 || filters.statuses.includes(event.status))
  );
}

export function groupAgenda(events: CalendarEventDto[], timezone: string): Array<{ key: string; events: CalendarEventDto[] }> {
  const groups = new Map<string, CalendarEventDto[]>();
  for (const event of [...events].sort((a, b) => (a.at ?? a.draftAt ?? Number.MAX_SAFE_INTEGER) - (b.at ?? b.draftAt ?? Number.MAX_SAFE_INTEGER))) {
    const key = calendarDayKey(event.at ?? event.draftAt ?? Date.now(), timezone);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  return [...groups].map(([key, items]) => ({ key, events: items }));
}

export function eventStatusSummary(event: CalendarEventDto): "attention" | "draft" | "normal" {
  if (event.status === "draft") return "draft";
  return event.status === "failed" || event.status === "partial" || event.channels.some((channel) => channel.status === "disconnected")
    ? "attention" : "normal";
}
