// Workspace-scoped content-calendar state (#504): recurring slots + dated
// entries under `<workspace>/calendar.json`, with an APPEND-ONLY event log at
// `<workspace>/calendar-events.jsonl`. Mirrors cli/lib/ingestion/store.ts:
// every function takes the ABSOLUTE workspace dir (executors pass
// ctx.workspaceDir, CLI verbs pass workspaceDir(slug)), keeping this module
// decoupled from the paths-root singleton and trivially testable.
//
// calendar.json is engine STATE (like cursor.json / registry.json) — rewriting
// it does not touch invariant #14. calendar-events.jsonl is only ever appended
// to; it is the durable history behind entry updates and lifecycle moves.
//
// Both doors write through here: the CLI verbs (cli/commands/calendar.ts) and
// the `calendar-slot` node executor (cli/lib/workflow/executors/calendar.ts).

import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  parseCalendar,
  canTransition,
  ENTRY_STATUSES,
  WEEKDAYS,
  type Calendar,
  type CalendarSlot,
  type CalendarEntry,
  type EntryStatus,
  type Weekday,
  type Platform,
} from "../schemas/calendar.js";

export function calendarPath(workspaceDir: string): string {
  return path.join(workspaceDir, "calendar.json");
}

/** `<workspace>/calendar-events.jsonl` — append-only, one line per calendar event. */
export function calendarEventsPath(workspaceDir: string): string {
  return path.join(workspaceDir, "calendar-events.jsonl");
}

// ─── Document I/O ────────────────────────────────────────────────────────────

export function readCalendar(workspaceDir: string): Calendar {
  try {
    return parseCalendar(JSON.parse(fs.readFileSync(calendarPath(workspaceDir), "utf8")));
  } catch {
    return parseCalendar({});
  }
}

function writeCalendar(workspaceDir: string, cal: Calendar): void {
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.writeFileSync(calendarPath(workspaceDir), JSON.stringify(cal, null, 2) + "\n");
}

export interface CalendarEvent {
  ts: string;
  type: "slot-added" | "entry-created" | "entry-updated" | "entry-transition";
  id: string;
  from?: EntryStatus;
  to?: EntryStatus;
  data?: unknown;
}

function appendEvent(workspaceDir: string, event: CalendarEvent): void {
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.appendFileSync(calendarEventsPath(workspaceDir), JSON.stringify(event) + "\n");
}

const nowIso = () => new Date().toISOString();

// ─── Slots ───────────────────────────────────────────────────────────────────

/** Add a recurring slot. Duplicate id throws (slots are hand-curated, not versioned). */
export function addSlot(workspaceDir: string, slot: unknown): CalendarSlot {
  const cal = readCalendar(workspaceDir);
  const parsed = parseCalendar({ slots: [slot] }).slots[0]!;
  if (cal.slots.some((s) => s.id === parsed.id)) {
    throw new Error(`calendar slot "${parsed.id}" already exists — pass a distinct --id`);
  }
  cal.slots.push(parsed);
  writeCalendar(workspaceDir, cal);
  appendEvent(workspaceDir, { ts: nowIso(), type: "slot-added", id: parsed.id, data: parsed });
  return parsed;
}

// ─── Entries ─────────────────────────────────────────────────────────────────

export function newEntryId(): string {
  return `e-${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * Create or update an entry by id. Status CHANGES on an existing entry are
 * rejected — the lifecycle is owned by transitionEntry() so every move is
 * legality-checked and logged. Each call appends one event.
 */
export function upsertEntry(
  workspaceDir: string,
  entry: Partial<CalendarEntry> & { unitType?: string },
): { entry: CalendarEntry; created: boolean } {
  const cal = readCalendar(workspaceDir);
  const id = entry.id ?? newEntryId();
  const existing = cal.entries.find((e) => e.id === id);
  if (existing && entry.status !== undefined && entry.status !== existing.status) {
    throw new Error(
      `entry "${id}" status changes go through transitionEntry(), not upsert (${existing.status} → ${entry.status})`,
    );
  }
  const merged = parseCalendar({ entries: [{ ...existing, ...entry, id }] }).entries[0]!;
  if (existing) {
    cal.entries[cal.entries.indexOf(existing)] = merged;
  } else {
    cal.entries.push(merged);
  }
  writeCalendar(workspaceDir, cal);
  appendEvent(workspaceDir, {
    ts: nowIso(),
    type: existing ? "entry-updated" : "entry-created",
    id,
    data: merged,
  });
  return { entry: merged, created: !existing };
}

/** Move an entry's lifecycle status. Forward-only (canTransition); logs the move. */
export function transitionEntry(
  workspaceDir: string,
  entryId: string,
  to: EntryStatus,
): CalendarEntry {
  const cal = readCalendar(workspaceDir);
  const entry = cal.entries.find((e) => e.id === entryId);
  if (!entry) throw new Error(`calendar entry "${entryId}" not found`);
  if (!(ENTRY_STATUSES as readonly string[]).includes(to)) {
    throw new Error(`unknown status "${to}" (${ENTRY_STATUSES.join(" → ")})`);
  }
  if (!canTransition(entry.status, to)) {
    throw new Error(
      `illegal transition ${entry.status} → ${to} (lifecycle is forward-only: ${ENTRY_STATUSES.join(" → ")})`,
    );
  }
  const from = entry.status;
  entry.status = to;
  writeCalendar(workspaceDir, cal);
  appendEvent(workspaceDir, { ts: nowIso(), type: "entry-transition", id: entryId, from, to });
  return entry;
}

// ─── Timezone math (built-in Intl only — no deps) ────────────────────────────
//
// DST behavior: zonedTimeToUtc uses the standard two-pass Intl offset probe.
// A local time that does not exist (spring-forward gap) resolves to the
// equivalent instant after the jump; an ambiguous local time (fall-back
// overlap) resolves deterministically to the offset Intl reports for the
// initial guess (the pre-transition offset in practice).

// Exported for the #525 cadence sampler: it re-samples a slot time inside a
// jitter window in the slot's LOCAL wall-clock, so it needs the same
// timezone-aware local-parts / zoned-to-UTC pair (no duplicate tz math).
const dtfCache = new Map<string, Intl.DateTimeFormat>();

function dtf(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

export type LocalParts = { y: number; mo: number; d: number; h: number; mi: number; s: number; weekday: Weekday };

/** Wall-clock parts of a UTC instant in a timezone (weekday as mon..sun). */
export function localParts(ts: number, timeZone: string): LocalParts {
  const p: Record<string, string> = {};
  for (const part of dtf(timeZone).formatToParts(new Date(ts))) p[part.type] = part.value;
  return {
    y: +p.year!,
    mo: +p.month!,
    d: +p.day!,
    h: +p.hour! % 24, // Intl may emit "24" at midnight
    mi: +p.minute!,
    s: +p.second!,
    weekday: p.weekday!.toLowerCase() as Weekday,
  };
}

/** UTC-offset of a timezone at an instant, in ms (positive = east of UTC). */
function tzOffsetMs(ts: number, timeZone: string): number {
  const p = localParts(ts, timeZone);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ts / 1000) * 1000;
}

/** The UTC instant (ms) of local `y-mo-d hh:mi` in `timeZone`. */
export function zonedTimeToUtc(y: number, mo: number, d: number, h: number, mi: number, timeZone: string): number {
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const guess = wall - tzOffsetMs(wall, timeZone);
  return wall - tzOffsetMs(guess, timeZone);
}

/**
 * Ascending occurrences of a recurring slot strictly within
 * (afterMs, afterMs + horizonWeeks weeks], computed in the slot's timezone.
 */
function* slotOccurrences(slot: CalendarSlot, afterMs: number, horizonWeeks: number): Generator<number> {
  if (!(WEEKDAYS as readonly string[]).includes(slot.weekday)) return;
  const [h, mi] = slot.time.split(":").map(Number) as [number, number];
  const seenDays = new Set<string>();
  // Step in ~day increments and read the LOCAL date per step; the dedup set
  // absorbs the 23/25-hour DST days.
  for (let k = 0; k <= horizonWeeks * 7; k++) {
    const p = localParts(afterMs + k * 86_400_000, slot.timezone);
    const ymd = `${p.y}-${p.mo}-${p.d}`;
    if (seenDays.has(ymd)) continue;
    seenDays.add(ymd);
    if (p.weekday !== slot.weekday) continue;
    const t = zonedTimeToUtc(p.y, p.mo, p.d, h, mi, slot.timezone);
    if (t > afterMs) yield t;
  }
}

// ─── Slot resolution ─────────────────────────────────────────────────────────

export interface NextFreeSlotOpts {
  unitType?: string;
  platform?: Platform | string;
  /** ISO datetime / epoch-ms; only occurrences strictly after this count. Default now. */
  after?: string | number;
  /** Search horizon in weeks. Default 8. */
  horizonWeeks?: number;
}

export type SlotResolution =
  | { free: true; slotId: string; at: string }
  | {
      /** No datable slot — the caller QUEUES the item (nothing is dropped). */
      free: false;
      reason: "no-matching-slot" | "no-free-slot";
      horizonWeeks: number;
      matchedSlots: number;
    };

/**
 * Next occurrence of a matching recurring slot with NO entry already
 * scheduled at that (slotId, instant). Timezone-aware; skip-if-filled.
 */
export function nextFreeSlot(workspaceDir: string, opts: NextFreeSlotOpts = {}): SlotResolution {
  const cal = readCalendar(workspaceDir);
  const afterMs = opts.after !== undefined ? new Date(opts.after).getTime() : Date.now();
  const horizonWeeks = opts.horizonWeeks ?? 8;
  const slots = cal.slots.filter(
    (s) =>
      (!opts.unitType || s.unitType === opts.unitType) &&
      (!opts.platform || s.targetPlatforms.includes(opts.platform as Platform)),
  );
  if (slots.length === 0) return { free: false, reason: "no-matching-slot", horizonWeeks, matchedSlots: 0 };

  const filled = new Set(
    cal.entries.filter((e) => e.slotId && e.at).map((e) => `${e.slotId}@${Date.parse(e.at!)}`),
  );
  let best: { slotId: string; at: number } | null = null;
  for (const slot of slots) {
    for (const t of slotOccurrences(slot, afterMs, horizonWeeks)) {
      if (filled.has(`${slot.id}@${t}`)) continue;
      if (!best || t < best.at) best = { slotId: slot.id, at: t };
      break; // occurrences ascend per slot — first free one is that slot's best
    }
  }
  return best
    ? { free: true, slotId: best.slotId, at: new Date(best.at).toISOString() }
    : { free: false, reason: "no-free-slot", horizonWeeks, matchedSlots: slots.length };
}

// ─── Auto-fill ───────────────────────────────────────────────────────────────

export interface FillResult {
  created: CalendarEntry[];
  skipped: number;
}

/**
 * Create QUEUED entries for every slot occurrence in the next `weeks` weeks
 * that is not already filled. Idempotent: a second run creates nothing.
 */
export function fillCalendar(
  workspaceDir: string,
  opts: { weeks?: number; after?: string | number } = {},
): FillResult {
  const weeks = opts.weeks ?? 1;
  const afterMs = opts.after !== undefined ? new Date(opts.after).getTime() : Date.now();
  const cal = readCalendar(workspaceDir);
  const filled = new Set(
    cal.entries.filter((e) => e.slotId && e.at).map((e) => `${e.slotId}@${Date.parse(e.at!)}`),
  );
  const created: CalendarEntry[] = [];
  let skipped = 0;
  for (const slot of cal.slots) {
    for (const t of slotOccurrences(slot, afterMs, weeks)) {
      if (filled.has(`${slot.id}@${t}`)) {
        skipped++;
        continue;
      }
      const { entry } = upsertEntry(workspaceDir, {
        at: new Date(t).toISOString(),
        slotId: slot.id,
        unitType: slot.unitType,
        platforms: slot.targetPlatforms,
        status: "queued",
      });
      created.push(entry);
    }
  }
  return { created, skipped };
}
