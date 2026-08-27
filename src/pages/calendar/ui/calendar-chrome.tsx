/**
 * The vocabulary the Calendar route repeats: its labels, its icon sizes, its overlay chrome and
 * the two state plates.
 *
 * These strings live apart from the views that use them because a surface must never arrive
 * without the ink it pairs with -- a class list assembled at three call sites drifts at two of
 * them.
 */
import { AlertTriangle, Instagram, ListFilter, Music2, Twitter, Youtube } from "lucide-react";
import { createContext } from "react";
import type { CalendarEventStatus } from "../../../../electron/ralphy/types";
import { WINDOW } from "@/shared/ui/Window";
import { ACTION, OVERLAY_RING, STATE_PLATE } from "@/shared/ui/overlay-chrome";
import type { CalendarFilters } from "../lib/presentation";

export const DOW = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
export const STATUS_LABEL: Record<CalendarEventStatus, string> = {
  draft: "Draft", scheduled: "Scheduled", uploading: "Uploading", published: "Published",
  partial: "Partially published", failed: "Failed",
};
export const PLATFORM_ICON = { instagram: Instagram, youtube: Youtube, tiktok: Music2, x: Twitter } as const;
export const EMPTY_FILTERS: CalendarFilters = { projectIds: [], platforms: [], statuses: [] };
export const CALENDAR_UNIT_DRAG = "application/x-ralphy-calendar-unit";
export const CalendarWorkspaceContext = createContext("");
export const timestampMs = (value: number) => value < 1_000_000_000_000 ? value * 1000 : value;

/* Icon sizes are stated on the mark itself rather than through a `[&_svg]:` blanket on a region:
   a descendant variant is (0,1,1) and beats every per-element `size-*` at (0,1,0), so a mark that
   states its own size would silently lose. */
export const ICON_XS = "size-2.25";   /*  9px -- the dismiss inside a filter chip */
export const ICON_SM = "size-2.5";    /* 10px -- a platform mark inside a dense cell */
export const ICON_MD = "size-2.75";   /* 11px -- a platform or metadata mark in a row */
export const ICON_LG = "size-3";      /* 12px -- a leading glyph beside a row title */
export const ICON = "size-3.25";      /* 13px -- the route's control icon */
export const ICON_XL = "size-3.75";   /* 15px -- the glyph that leads a card */
export const ICON_STATE = "size-6";   /* 24px -- the mark on an empty or error plate */

/* Vocabulary the Calendar repeats. Each string is complete: a surface never arrives without the
   ink it pairs with. */
/* `h-fit` because `inset-0` is what centres it: top and bottom both 0 make the height definite,
   so without it a short publication would stand in a 720px window of mostly empty card. */
export const OVERLAY_PANEL = `fixed inset-0 z-scrim-content m-auto h-fit max-h-calendar-panel-height w-calendar-panel-width text-ink animate-calendar-modal-in motion-reduce:animate-none ${WINDOW}`;
/* Both panels are modal now, so both stand over the same scrim every other overlay in the app
   uses; `[data-instrument-overlay-backdrop]` owns its fill for all of them. */
export function OverlayScrim({ onClose }: { onClose(): void }) {
  return <div className="calendar-panel-overlay fixed inset-0 z-scrim" data-instrument-overlay-backdrop="" onClick={onClose} />;
}
export const PANEL_HEADER_ACTION = `flex h-6.5 shrink-0 items-center gap-1.5 rounded-control px-2.25 type-sm transition-colors duration-fast ease-instrument motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`;
export const PANEL_CARD = "flex items-center gap-2.75 rounded-field bg-surface-sunken px-3 py-2.75";
export const CHIP = "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control bg-surface-sunken px-2.25 font-code type-mono-md text-ink";
export const MODAL_FIELD_LABEL = "font-code type-mono-md tracking-block text-muted";
export const MODAL_INPUT = `h-8.5 min-w-0 rounded-control bg-surface-sunken px-2.75 type-sm text-ink placeholder:text-muted ${OVERLAY_RING}`;
export const MODAL_ROW = `flex min-h-11.5 items-center gap-2.5 rounded-control px-2.5 py-2 text-left transition-colors duration-fast ease-instrument motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`;
export const MODAL_ROW_COPY = "flex min-w-0 flex-1 flex-col gap-0.75";
export const SEGMENT_BUTTON = `${ACTION} h-6 px-2.75 type-label ${OVERLAY_RING}`;
export const PICKER_CELL = `${ACTION} h-7 flex-none font-code type-label ${OVERLAY_RING}`;
export const PICKER_DAY = `grid h-7.75 place-items-center rounded-control font-code type-label transition-colors duration-fast ease-instrument motion-reduce:transition-none motion-reduce:duration-0 ${OVERLAY_RING}`;

export function CalendarLoading() { return <div className="calendar-loading grid flex-1 grid-cols-7 grid-rows-6 gap-1.5">{["col-start-1 col-end-3", "col-start-3 col-end-6", "col-start-6 col-end-8"].map((span) => <span className={`row-start-1 row-end-7 ${span} animate-pulse rounded-cell bg-surface-sunken motion-reduce:animate-none`} key={span} />)}</div>; }
export function CalendarError({ error, onRetry }: { error: string; onRetry(): void }) { return <div className={`calendar-error ${STATE_PLATE}`}><AlertTriangle className={`${ICON_STATE} text-alert`} /><strong className="type-md font-normal text-ink">Calendar could not be loaded</strong><span className="type-sm text-muted">{error}</span><small className="font-code type-mono-sm text-muted">{new Date().toISOString()}</small><button type="button" className={`${ACTION} mt-1.25 h-7 px-3 type-sm bg-surface text-ink hover:bg-surface-hover`} onClick={onRetry}>Try again</button></div>; }

export function platformIcon(platform: string) { return PLATFORM_ICON[platform as keyof typeof PLATFORM_ICON] ?? ListFilter; }
export function capitalize(value: string) { return value[0]!.toUpperCase() + value.slice(1); }
export function hash(value: string) { return [...value].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7); }
export function localDateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function timezoneLabel(timezone: string) { const part = new Intl.DateTimeFormat("en", { timeZone: timezone, timeZoneName: "shortOffset" }).formatToParts().find((item) => item.type === "timeZoneName")?.value ?? "GMT"; return part.replace("GMT", "GMT"); }
