// Workspace content calendar (#504) — the posting-cadence entity the account
// plans against ("shorts Mon/Wed/Fri, carousel Tue, longform Sunday").
//
// Storage: `.ralphy/workspaces/<ws>/calendar.json` (engine STATE like
// cursor.json — rewriting it does not touch invariant #14) plus the sibling
// APPEND-ONLY event log `calendar-events.jsonl` (every slot add, entry
// create/update, and lifecycle transition lands there as one JSONL line).
// I/O + slot resolution live in cli/lib/calendar/store.ts; this module owns
// SHAPE only.
//
import { z } from "zod";

// ─── Recurring slots ─────────────────────────────────────────────────────────

/** Weekday tokens: lowercase three-letter, `mon`..`sun` (not 0-6 numerics). */
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const PLATFORMS = ["youtube", "tiktok", "instagram", "x", "telegram"] as const;
export type Platform = (typeof PLATFORMS)[number];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const CalendarSlotSchema = z.object({
  /** Stable slot id, unique within the calendar (e.g. "slot-mon-0900"). */
  id: z.string().min(1),
  weekday: z.enum(WEEKDAYS),
  /** Local wall-clock time in the slot's timezone, 24h "HH:MM". */
  time: z.string().regex(TIME_RE, { message: "time must be HH:MM (24h)" }),
  /**
   * IANA timezone the slot's weekday+time are interpreted in. Defaults to the
   * SYSTEM timezone at parse time (Intl resolvedOptions).
   */
  timezone: z.string().default(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  /** Format-taxonomy string (free-form; `ralphy template suggest --help` enumerates). */
  unitType: z.string().min(1),
  targetPlatforms: z.array(z.enum(PLATFORMS)).default([]),
});
export type CalendarSlot = z.infer<typeof CalendarSlotSchema>;

// ─── Dated entries ───────────────────────────────────────────────────────────

/** Lifecycle, strictly ordered. Transitions are FORWARD-ONLY (see canTransition). */
export const ENTRY_STATUSES = [
  "idea",
  "queued",
  "produced",
  "gated",
  "scheduled",
  "published",
] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const CalendarEntrySchema = z.object({
  /** Stable entry id, unique within the calendar. */
  id: z.string().min(1),
  /**
   * ISO datetime of the planned post. Absent = the entry is queued waiting
   * for a slot (the "queue, don't drop" no-free-slot outcome).
   */
  at: z.string().datetime({ offset: true }).optional(),
  /** The recurring slot this entry fills, when slot-resolved. */
  slotId: z.string().optional(),
  unitType: z.string().min(1),
  platforms: z.array(z.enum(PLATFORMS)).default([]),
  status: z.enum(ENTRY_STATUSES).default("idea"),
  // Links back into the production graph.
  runId: z.string().optional(),
  projectId: z.string().optional(),
  unitSlug: z.string().optional(),
  // #525 cadence provenance: set when the humanizer moved `at` off the exact
  // slot time; the basis/offset explain the move.
  sampled: z.boolean().optional(),
  cadenceBasis: z.string().optional(),
  cadenceOffsetMinutes: z.number().optional(),
});
export type CalendarEntry = z.infer<typeof CalendarEntrySchema>;

// ─── The calendar document ───────────────────────────────────────────────────

export const CalendarSchema = z.object({
  version: z.string().default("1.0"),
  slots: z.array(CalendarSlotSchema).default([]),
  entries: z.array(CalendarEntrySchema).default([]),
});
export type Calendar = z.infer<typeof CalendarSchema>;

/** Parse + validate an unknown value into a Calendar (throws ZodError). */
export function parseCalendar(raw: unknown): Calendar {
  return CalendarSchema.parse(raw);
}

// ─── Lifecycle transitions ───────────────────────────────────────────────────

/**
 * Legal = strictly FORWARD along ENTRY_STATUSES (skips allowed: queued →
 * scheduled is fine); backward and same-state are illegal, so published can
 * never rewind to idea.
 */
// ponytail: forward-only, no demote path — add an explicit `calendar demote`
// verb (with its own event type) if a repair flow ever needs to rewind.
export function canTransition(from: EntryStatus, to: EntryStatus): boolean {
  return ENTRY_STATUSES.indexOf(to) > ENTRY_STATUSES.indexOf(from);
}
