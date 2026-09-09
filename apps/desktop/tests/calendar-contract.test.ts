import { describe, expect, test, vi } from "vitest";
import { createCalendarReader, validateCalendarWorkspace } from "../electron/ralphy/calendar-reader";
import { MEDIA_CHANNELS } from "../electron/media/types";
import type { RalphyBridgeClient } from "../electron/ralphy/client";

const event = {
  id: "calendar_1",
  rowVersion: 1,
  unitId: "unit_1",
  unitRevisionId: "unitrev_1",
  title: "Launch teaser",
  projectId: "project_1",
  project: "Product launch",
  kind: "video",
  thumbnail: { type: "artifact-revision", id: "arev_1" },
  at: 1_787_045_400_000,
  draftAt: null,
  timezone: "Europe/Moscow",
  pinnedRevision: 3,
  unitSelectedRevision: 3,
  status: "partial",
  channels: [{
    id: "publication_1",
    platform: "instagram",
    accountId: "account_1",
    account: "@ralphy",
    status: "published",
    at: 1_787_045_400_000,
    postUrl: "https://example.test/post/1",
    error: null,
    settings: { postType: "reel" },
  }],
  metrics: { views: 1_200, likes: 80, comments: 6, shares: 4, syncedAt: 1_787_045_500_000 },
} as const;

const workspace = {
  timezone: "Europe/Moscow",
  postiz: { available: true, lastSyncedAt: 1_787_045_500_000, error: null },
  events: [event],
  readyUnits: [],
  projects: [{ id: "project_1", name: "Product launch" }],
  accounts: [{ id: "account_1", platform: "instagram", handle: "@ralphy", disconnected: false, rowVersion: 1 }],
} as const;

describe("Calendar Desktop contract", () => {
  test("validates the exact safe projection", () => {
    expect(validateCalendarWorkspace(workspace)).toEqual(workspace);
    expect(() => validateCalendarWorkspace({ ...workspace, privatePath: "/tmp/private" })).toThrow("Invalid Calendar workspace");
    expect(() => validateCalendarWorkspace({ ...workspace, events: [{ ...event, status: "queued" }] })).toThrow("Invalid Calendar workspace");
  });

  test("routes reads and mutations through fixed Core methods", async () => {
    const request = vi.fn(async (method: string) => method === "calendar.overview"
      ? workspace
      : method === "media.revision.show"
        ? { id: "arev_1", objectId: "object_1" }
        : method === "locator.resolve"
          ? { absolutePath: "/safe/preview.jpg", mime: "image/jpeg", bytes: 42 }
          : event);
    const mint = vi.fn(async () => ({ url: "ralphy-media://asset/token", sizeBytes: 42 }));
    const reader = createCalendarReader({ request: request as RalphyBridgeClient["request"], mint });

    await expect(reader.load("ws_1", {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
      timezone: "Europe/Moscow",
    })).resolves.toEqual(workspace);
    await reader.mutate("ws_1", {
      action: "remove",
      eventId: "calendar_1",
      expectedRowVersion: 1,
    });
    await reader.reconnect("ws_1", { accountId: "account_1", expectedRowVersion: 1, credential: "postiz-secret" });
    await expect(reader.resolvePreview("ws_1", "project_1", { type: "artifact-revision", id: "arev_1" }))
      .resolves.toEqual({ url: "ralphy-media://asset/token", sizeBytes: 42 });

    expect(request).toHaveBeenNthCalledWith(1, "calendar.overview", {
      context: { workspaceId: "ws_1" },
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
      timezone: "Europe/Moscow",
    });
    expect(request).toHaveBeenNthCalledWith(2, "calendar.remove", {
      context: { workspaceId: "ws_1" },
      eventId: "calendar_1",
      expectedRowVersion: 1,
    });
    expect(request).toHaveBeenNthCalledWith(3, "agent.credential.set", {
      context: { workspaceId: "ws_1" },
      provider: "postiz",
      value: "postiz-secret",
      accountId: "account_1",
      expectedRowVersion: 1,
    });
    expect(request).toHaveBeenNthCalledWith(4, "media.revision.show", {
      context: { workspaceId: "ws_1", projectId: "project_1" },
      revisionId: "arev_1",
    });
    expect(request).toHaveBeenNthCalledWith(5, "locator.resolve", {
      context: { workspaceId: "ws_1", projectId: "project_1" },
      target: { type: "object", id: "object_1" },
      purpose: "preview",
    });
    expect(mint).toHaveBeenCalledWith("/safe/preview.jpg", "image/jpeg", 42);
    await expect(reader.mutate("ws_1", { action: "erase" } as never)).rejects.toThrow("Invalid Calendar mutation");
    expect(MEDIA_CHANNELS.loadCalendar).toBe("workspace:calendar:load");
    expect(MEDIA_CHANNELS.mutateCalendar).toBe("workspace:calendar:mutate");
    expect(MEDIA_CHANNELS.reconnectCalendarAccount).toBe("workspace:calendar:reconnect-account");
    expect(MEDIA_CHANNELS.resolveCalendarPreview).toBe("workspace:calendar:preview");
  });
});
