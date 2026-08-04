// Workspace-scoped content-calendar state (#504): recurring slots + dated
// entries under `<workspace>/calendar.json`, with an APPEND-ONLY event log at
// `<workspace>/calendar-events.jsonl`. Every function takes the ABSOLUTE
// workspace dir, keeping this module
// decoupled from the paths-root singleton and trivially testable.
//
// calendar.json is engine STATE (like cursor.json / registry.json) — rewriting
// it does not touch invariant #14. calendar-events.jsonl is only ever appended
// to; it is the durable history behind entry updates and lifecycle moves.
//
// The CLI verbs in cli/commands/calendar.ts write through this module.

import path from "node:path";
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
import { getCommandContext } from "../context-state.js";
import { appendActivity } from "../store/activity.js";
import { openDomainDb, withImmediateTransaction } from "../store/db.js";
import { newDomainId } from "../store/ids.js";

export function calendarPath(workspaceDir: string): string {
  return path.join(workspaceDir, "calendar.json");
}

/** `<workspace>/calendar-events.jsonl` — append-only, one line per calendar event. */
export function calendarEventsPath(workspaceDir: string): string {
  return path.join(workspaceDir, "calendar-events.jsonl");
}

// ─── Document I/O ────────────────────────────────────────────────────────────

export function readCalendar(workspaceDir: string): Calendar {
  const rows = openDomainDb()
    .query<CalendarRow, [string]>(
      "SELECT * FROM calendar_entries WHERE workspace_id = ? ORDER BY created_at, id",
    )
    .all(calendarWorkspaceId(workspaceDir));
  const slotIds = new Map(
    rows
      .filter((row) => row.kind === "slot")
      .map((row) => [row.id, calendarMetadata(row).legacyId ?? row.id]),
  );
  return parseCalendar({
    slots: rows.filter((row) => row.kind === "slot").map(slotFromRow),
    entries: rows
      .filter((row) => row.kind === "entry")
      .map((row) => entryFromRow(row, slotIds)),
  });
}

export interface CalendarEvent {
  ts: string;
  type: "slot-added" | "entry-created" | "entry-updated" | "entry-transition";
  id: string;
  from?: EntryStatus;
  to?: EntryStatus;
  data?: unknown;
}

// ─── Slots ───────────────────────────────────────────────────────────────────

/** Add a recurring slot. Duplicate id throws (slots are hand-curated, not versioned). */
export function addSlot(workspaceDir: string, slot: unknown): CalendarSlot {
  const cal = readCalendar(workspaceDir);
  const parsed = parseCalendar({ slots: [slot] }).slots[0]!;
  if (cal.slots.some((s) => s.id === parsed.id)) {
    throw new Error(`calendar slot "${parsed.id}" already exists — pass a distinct --id`);
  }
  const workspaceId = calendarWorkspaceId(workspaceDir);
  withImmediateTransaction((db) => {
    const id = newDomainId("calendar");
    const now = Date.now();
    db.prepare(
      `INSERT INTO calendar_entries
       (id, workspace_id, kind, weekday, local_time, timezone, unit_type,
        platforms_json, state, metadata_json, created_at, updated_at)
       VALUES (?, ?, 'slot', ?, ?, ?, ?, ?, 'idea', ?, ?, ?)`,
    ).run(
      id,
      workspaceId,
      parsed.weekday,
      parsed.time,
      parsed.timezone,
      parsed.unitType,
      JSON.stringify(parsed.targetPlatforms),
      JSON.stringify({ legacyId: parsed.id }),
      now,
      now,
    );
    appendActivity(db, {
      workspaceId,
      entityType: "calendar_entry",
      entityId: id,
      action: "calendar.slot.created",
      payload: { slot: parsed.id },
      createdAt: now,
    });
  });
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
  const workspaceId = calendarWorkspaceId(workspaceDir);
  withImmediateTransaction((db) => {
    const row = existing ? requireCalendarRow(db, workspaceId, id, "entry") : null;
    const slotRow = merged.slotId
      ? requireCalendarRow(db, workspaceId, merged.slotId, "slot")
      : null;
    const metadata = {
      legacyId: id,
      ...(merged.runId ? { runId: merged.runId } : {}),
      ...(merged.projectId ? { projectId: merged.projectId } : {}),
      ...(merged.unitSlug ? { unitSlug: merged.unitSlug } : {}),
      ...(merged.sampled !== undefined ? { sampled: merged.sampled } : {}),
      ...(merged.cadenceBasis ? { cadenceBasis: merged.cadenceBasis } : {}),
      ...(merged.cadenceOffsetMinutes !== undefined
        ? { cadenceOffsetMinutes: merged.cadenceOffsetMinutes }
        : {}),
    };
    const now = Date.now();
    const domainId = row?.id ?? newDomainId("calendar");
    if (row) {
      db.prepare(
        `UPDATE calendar_entries
         SET slot_id = ?, scheduled_at = ?, unit_type = ?, platforms_json = ?,
             metadata_json = ?, row_version = row_version + 1, updated_at = ?
         WHERE id = ? AND workspace_id = ?`,
      ).run(
        slotRow?.id ?? null,
        merged.at ? Date.parse(merged.at) : null,
        merged.unitType,
        JSON.stringify(merged.platforms),
        JSON.stringify(metadata),
        now,
        domainId,
        workspaceId,
      );
    } else {
      db.prepare(
        `INSERT INTO calendar_entries
         (id, workspace_id, kind, slot_id, scheduled_at, unit_type,
          platforms_json, state, metadata_json, created_at, updated_at)
         VALUES (?, ?, 'entry', ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        domainId,
        workspaceId,
        slotRow?.id ?? null,
        merged.at ? Date.parse(merged.at) : null,
        merged.unitType,
        JSON.stringify(merged.platforms),
        merged.status,
        JSON.stringify(metadata),
        now,
        now,
      );
    }
    appendActivity(db, {
      workspaceId,
      entityType: "calendar_entry",
      entityId: domainId,
      action: existing ? "calendar.entry.updated" : "calendar.entry.created",
      payload: { state: merged.status },
      createdAt: now,
    });
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
  const workspaceId = calendarWorkspaceId(workspaceDir);
  withImmediateTransaction((db) => {
    const row = requireCalendarRow(db, workspaceId, entryId, "entry");
    const now = Date.now();
    const result = db.prepare(
      `UPDATE calendar_entries
       SET state = ?, row_version = row_version + 1, updated_at = ?
       WHERE id = ? AND workspace_id = ? AND row_version = ?`,
    ).run(to, now, row.id, workspaceId, row.row_version);
    if (!result.changes) throw new Error("Calendar Entry row-version conflict");
    appendActivity(db, {
      workspaceId,
      entityType: "calendar_entry",
      entityId: row.id,
      action: "calendar.entry.transitioned",
      payload: { from, to },
      createdAt: now,
    });
  });
  return readCalendar(workspaceDir).entries.find((candidate) => candidate.id === entryId)!;
}

type CalendarRow = {
  id: string;
  workspace_id: string;
  kind: "slot" | "entry";
  slot_id: string | null;
  scheduled_at: number | null;
  weekday: Weekday | null;
  local_time: string | null;
  timezone: string | null;
  unit_type: string;
  platforms_json: string;
  state: EntryStatus;
  row_version: number;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
};

type CalendarMetadata = {
  legacyId?: string;
  runId?: string;
  projectId?: string;
  unitSlug?: string;
  sampled?: boolean;
  cadenceBasis?: string;
  cadenceOffsetMinutes?: number;
};

function calendarWorkspaceId(_workspaceDir: string): string {
  const workspaceId = getCommandContext()?.workspaceId;
  if (!workspaceId) throw new Error("Calendar operations require an explicit Workspace scope");
  return workspaceId;
}

function calendarMetadata(row: CalendarRow): CalendarMetadata {
  return JSON.parse(row.metadata_json ?? "{}") as CalendarMetadata;
}

function slotFromRow(row: CalendarRow): CalendarSlot {
  const metadata = calendarMetadata(row);
  return {
    id: metadata.legacyId ?? row.id,
    weekday: row.weekday!,
    time: row.local_time!,
    timezone: row.timezone!,
    unitType: row.unit_type,
    targetPlatforms: JSON.parse(row.platforms_json) as Platform[],
  };
}

function entryFromRow(
  row: CalendarRow,
  slotIds: Map<string, string>,
): CalendarEntry {
  const metadata = calendarMetadata(row);
  return {
    id: metadata.legacyId ?? row.id,
    ...(row.scheduled_at !== null
      ? { at: new Date(row.scheduled_at).toISOString() }
      : {}),
    ...(row.slot_id ? { slotId: slotIds.get(row.slot_id) ?? row.slot_id } : {}),
    unitType: row.unit_type,
    platforms: JSON.parse(row.platforms_json) as Platform[],
    status: row.state,
    ...(metadata.runId ? { runId: metadata.runId } : {}),
    ...(metadata.projectId ? { projectId: metadata.projectId } : {}),
    ...(metadata.unitSlug ? { unitSlug: metadata.unitSlug } : {}),
    ...(metadata.sampled !== undefined ? { sampled: metadata.sampled } : {}),
    ...(metadata.cadenceBasis ? { cadenceBasis: metadata.cadenceBasis } : {}),
    ...(metadata.cadenceOffsetMinutes !== undefined
      ? { cadenceOffsetMinutes: metadata.cadenceOffsetMinutes }
      : {}),
  };
}

function requireCalendarRow(
  db: import("bun:sqlite").Database,
  workspaceId: string,
  idOrLegacyId: string,
  kind: CalendarRow["kind"],
): CalendarRow {
  const rows = db.query<CalendarRow, [string, string]>(
    "SELECT * FROM calendar_entries WHERE workspace_id = ? AND kind = ?",
  ).all(workspaceId, kind);
  const row = rows.find((candidate) =>
    candidate.id === idOrLegacyId || calendarMetadata(candidate).legacyId === idOrLegacyId,
  );
  if (!row) throw new Error(`calendar ${kind} "${idOrLegacyId}" not found`);
  return row;
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
