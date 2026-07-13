// Workspace content calendar (#504) — slot resolution (timezone/DST-aware,
// skip-if-filled), lifecycle transitions, no-free-slot queueing, fill
// idempotence, the calendar-slot executor, and the append-only event log.

import { describe, test, expect, beforeEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readCalendar,
  addSlot,
  upsertEntry,
  transitionEntry,
  nextFreeSlot,
  fillCalendar,
  calendarPath,
  calendarEventsPath,
} from "../../cli/lib/calendar/store.js";
import { parseCalendar, canTransition, ENTRY_STATUSES, PLATFORMS } from "../../cli/lib/schemas/calendar.js";

// 2026 anchors (verified): Jan 12 / Mar 9 are Mondays; US DST starts Mar 8.
const NY_SLOT = {
  id: "mon-9",
  weekday: "mon",
  time: "09:00",
  timezone: "America/New_York",
  unitType: "short",
  targetPlatforms: ["tiktok", "youtube"],
};

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "calendar-"));
});

const eventLines = () =>
  fs
    .readFileSync(calendarEventsPath(dir), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

// ─── Schema + lifecycle ──────────────────────────────────────────────────────

describe("calendar schema", () => {
  test("Telegram is a first-class calendar platform", () => {
    const cal = parseCalendar({
      slots: [{ id: "tg", weekday: "tue", time: "18:00", unitType: "post", targetPlatforms: ["telegram"] }],
    });
    expect(PLATFORMS).toContain("telegram");
    expect(cal.slots[0]!.targetPlatforms).toEqual(["telegram"]);
  });

  test("timezone defaults to the system zone; bad time / weekday / platform rejected", () => {
    const cal = parseCalendar({
      slots: [{ id: "s1", weekday: "fri", time: "18:30", unitType: "carousel" }],
    });
    expect(cal.slots[0]!.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(() => parseCalendar({ slots: [{ id: "s", weekday: "fri", time: "25:00", unitType: "x" }] })).toThrow();
    expect(() => parseCalendar({ slots: [{ id: "s", weekday: "monday", time: "09:00", unitType: "x" }] })).toThrow();
    expect(() =>
      parseCalendar({ entries: [{ id: "e", unitType: "x", platforms: ["facebook"] }] }),
    ).toThrow();
  });

  test("canTransition is forward-only over the full lifecycle", () => {
    expect(canTransition("idea", "queued")).toBe(true);
    expect(canTransition("queued", "scheduled")).toBe(true); // forward skips allowed
    expect(canTransition("published", "idea")).toBe(false);
    expect(canTransition("scheduled", "produced")).toBe(false);
    expect(canTransition("gated", "gated")).toBe(false);
    expect(ENTRY_STATUSES).toEqual(["idea", "queued", "produced", "gated", "scheduled", "published"]);
  });
});

describe("lifecycle transitions (store)", () => {
  test("legal transition updates the entry and logs an event; illegal throws untouched", () => {
    upsertEntry(dir, { id: "e1", unitType: "short", status: "idea" });
    const moved = transitionEntry(dir, "e1", "produced");
    expect(moved.status).toBe("produced");
    expect(() => transitionEntry(dir, "e1", "idea")).toThrow(/illegal transition/);
    expect(readCalendar(dir).entries[0]!.status).toBe("produced");
    const events = eventLines();
    expect(events.map((e) => e.type)).toEqual(["entry-created", "entry-transition"]);
    expect(events[1]).toMatchObject({ id: "e1", from: "idea", to: "produced" });
  });

  test("upsert cannot smuggle a status change past the transition gate", () => {
    upsertEntry(dir, { id: "e1", unitType: "short", status: "idea" });
    expect(() => upsertEntry(dir, { id: "e1", status: "published" })).toThrow(/transitionEntry/);
    // Non-status updates merge fine.
    const { entry, created } = upsertEntry(dir, { id: "e1", projectId: "proj-001" });
    expect(created).toBe(false);
    expect(entry).toMatchObject({ status: "idea", projectId: "proj-001" });
  });
});

// ─── Slot resolution ─────────────────────────────────────────────────────────

describe("nextFreeSlot", () => {
  test("timezone-aware: Monday 09:00 America/New_York in EST resolves to 14:00Z", () => {
    addSlot(dir, NY_SLOT);
    const r = nextFreeSlot(dir, { after: "2026-01-06T00:00:00Z" });
    expect(r).toEqual({ free: true, slotId: "mon-9", at: "2026-01-12T14:00:00.000Z" });
  });

  test("DST-aware: the same slot after the March switch resolves to 13:00Z (EDT)", () => {
    addSlot(dir, NY_SLOT);
    const r = nextFreeSlot(dir, { after: "2026-03-05T00:00:00Z" });
    expect(r).toEqual({ free: true, slotId: "mon-9", at: "2026-03-09T13:00:00.000Z" });
  });

  test("east-of-UTC zone: Sunday 21:00 Asia/Tokyo resolves to 12:00Z the same day", () => {
    addSlot(dir, { ...NY_SLOT, id: "sun-21", weekday: "sun", time: "21:00", timezone: "Asia/Tokyo" });
    const r = nextFreeSlot(dir, { after: "2026-07-01T00:00:00Z" });
    expect(r).toEqual({ free: true, slotId: "sun-21", at: "2026-07-05T12:00:00.000Z" });
  });

  test("a same-day occurrence earlier than `after` is skipped to next week", () => {
    addSlot(dir, NY_SLOT);
    // Monday Jan 12 10:00 NY — the 09:00 slot that day is already past.
    const r = nextFreeSlot(dir, { after: "2026-01-12T15:00:00Z" });
    expect(r).toEqual({ free: true, slotId: "mon-9", at: "2026-01-19T14:00:00.000Z" });
  });

  test("skip-if-filled: an entry at the (slotId, instant) pushes to the next occurrence", () => {
    addSlot(dir, NY_SLOT);
    upsertEntry(dir, { at: "2026-01-12T14:00:00.000Z", slotId: "mon-9", unitType: "short", status: "queued" });
    const r = nextFreeSlot(dir, { after: "2026-01-06T00:00:00Z" });
    expect(r).toEqual({ free: true, slotId: "mon-9", at: "2026-01-19T14:00:00.000Z" });
  });

  test("unitType / platform filters select among slots", () => {
    addSlot(dir, NY_SLOT);
    addSlot(dir, { ...NY_SLOT, id: "tue-12", weekday: "tue", time: "12:00", unitType: "carousel", targetPlatforms: ["instagram"] });
    const r = nextFreeSlot(dir, { after: "2026-01-06T00:00:00Z", unitType: "carousel" });
    expect(r).toMatchObject({ free: true, slotId: "tue-12" });
    const p = nextFreeSlot(dir, { after: "2026-01-06T00:00:00Z", platform: "instagram" });
    expect(p).toMatchObject({ free: true, slotId: "tue-12" });
  });

  test("no matching slot at all is a structured queue signal", () => {
    addSlot(dir, NY_SLOT);
    expect(nextFreeSlot(dir, { unitType: "longform" })).toEqual({
      free: false,
      reason: "no-matching-slot",
      horizonWeeks: 8,
      matchedSlots: 0,
    });
  });

  test("no free occurrence within the horizon queues, nothing dropped", () => {
    addSlot(dir, NY_SLOT);
    fillCalendar(dir, { weeks: 1, after: "2026-01-06T00:00:00Z" });
    const r = nextFreeSlot(dir, { after: "2026-01-06T00:00:00Z", horizonWeeks: 1 });
    expect(r).toEqual({ free: false, reason: "no-free-slot", horizonWeeks: 1, matchedSlots: 1 });
    // The already-planned entry is still there — queueing never deletes.
    expect(readCalendar(dir).entries).toHaveLength(1);
  });
});

// ─── fill ────────────────────────────────────────────────────────────────────

describe("fillCalendar", () => {
  test("creates queued entries per slot occurrence; a second run is a no-op (idempotent)", () => {
    addSlot(dir, NY_SLOT);
    addSlot(dir, { ...NY_SLOT, id: "thu-18", weekday: "thu", time: "18:00", unitType: "carousel", targetPlatforms: ["instagram"] });
    const first = fillCalendar(dir, { weeks: 2, after: "2026-01-06T00:00:00Z" });
    expect(first.created).toHaveLength(4); // 2 slots x 2 weeks
    expect(first.created.every((e) => e.status === "queued")).toBe(true);
    expect(first.created.every((e) => e.slotId && e.at)).toBe(true);

    const second = fillCalendar(dir, { weeks: 2, after: "2026-01-06T00:00:00Z" });
    expect(second.created).toHaveLength(0);
    expect(second.skipped).toBe(4);
    expect(readCalendar(dir).entries).toHaveLength(4);
  });
});

// ─── Event log (append-only) ─────────────────────────────────────────────────

describe("calendar-events.jsonl", () => {
  test("every mutation appends; prior lines are never rewritten", () => {
    addSlot(dir, NY_SLOT);
    upsertEntry(dir, { id: "e1", unitType: "short" });
    const snapshot = fs.readFileSync(calendarEventsPath(dir), "utf8");
    expect(eventLines().map((e) => e.type)).toEqual(["slot-added", "entry-created"]);

    upsertEntry(dir, { id: "e1", projectId: "p-001" });
    transitionEntry(dir, "e1", "queued");
    const after = fs.readFileSync(calendarEventsPath(dir), "utf8");
    expect(after.startsWith(snapshot)).toBe(true); // strictly appended
    expect(eventLines().map((e) => e.type)).toEqual([
      "slot-added",
      "entry-created",
      "entry-updated",
      "entry-transition",
    ]);
  });

  test("calendar.json is engine state beside the log", () => {
    addSlot(dir, NY_SLOT);
    expect(calendarPath(dir)).toBe(path.join(dir, "calendar.json"));
    expect(fs.existsSync(calendarPath(dir))).toBe(true);
    expect(fs.existsSync(calendarEventsPath(dir))).toBe(true);
  });
});
