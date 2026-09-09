import { describe, expect, test } from "vitest";
import type { CalendarEventDto } from "../electron/ralphy/types";
import {
  calendarRange,
  filterCalendarEvents,
  formatCalendarTime,
  groupAgenda,
  monthDays,
  weekDays,
  zonedDateTimeToEpoch,
} from "@/pages/calendar";

const base: CalendarEventDto = {
  id: "event_1", rowVersion: 1, unitId: "unit_1", unitRevisionId: "revision_1",
  title: "Launch", projectId: "project_1", project: "Autumn drop", kind: "video",
  thumbnail: null, at: Date.parse("2026-08-18T07:30:00.000Z"), draftAt: null, timezone: "Europe/Moscow",
  pinnedRevision: 2, unitSelectedRevision: 2, status: "scheduled", channels: [{
    id: null, platform: "instagram", accountId: "account_1", account: "@ralphy",
    status: "scheduled", at: Date.parse("2026-08-18T07:30:00.000Z"), postUrl: null, error: null, settings: {},
  }], metrics: null,
};

describe("Calendar presentation", () => {
  test("builds fixed Month and Monday-start Week geometry", () => {
    const month = monthDays(new Date(2026, 7, 18));
    expect(month).toHaveLength(42);
    expect(month[0]).toMatchObject({ key: "2026-07-27", inMonth: false });
    expect(month[41]).toMatchObject({ key: "2026-09-06", inMonth: false });
    expect(weekDays(new Date(2026, 7, 18)).map((day) => day.key)).toEqual([
      "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23",
    ]);
  });

  test("groups timed and no-time events and applies every filter", () => {
    const failed = { ...base, id: "event_2", projectId: "project_2", project: "Summer drop", status: "failed" as const,
      channels: [{ ...base.channels[0]!, platform: "youtube", status: "failed" as const }] };
    const draft = { ...base, id: "event_3", at: null, draftAt: Date.parse("2026-08-19T07:30:00.000Z"), status: "draft" as const };
    const groups = groupAgenda([draft, base, failed], "Europe/Moscow");
    expect(groups.map((group) => group.key)).toEqual(["2026-08-18", "2026-08-19"]);
    expect(filterCalendarEvents([base, failed, draft], {
      projectIds: ["project_2"], platforms: ["youtube"], statuses: ["failed"],
    })).toEqual([failed]);
    expect(filterCalendarEvents([base, failed, draft], { projectIds: [], platforms: [], statuses: [] })).toHaveLength(3);
  });

  test("formats timezone time and returns bounded view ranges", () => {
    expect(formatCalendarTime(base.at, "Europe/Moscow")).toBe("10:30");
    expect(calendarRange("month", new Date(2026, 7, 18))).toMatchObject({
      from: "2026-07-27T00:00:00.000Z",
      to: "2026-09-07T00:00:00.000Z",
    });
    expect(zonedDateTimeToEpoch("2026-08-18", "10:30", "Europe/Moscow"))
      .toBe(Date.parse("2026-08-18T07:30:00.000Z"));
    expect(zonedDateTimeToEpoch("2026-08-18", "10:30", "America/Los_Angeles"))
      .toBe(Date.parse("2026-08-18T17:30:00.000Z"));
  });
});
