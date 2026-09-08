import { describe, expect, test } from "vitest";

import { projectDynamicIslandFeed } from "@/widgets/dynamic-island";

describe("dynamic island live projection", () => {
  test("does not invent review totals, progress, or navigation", () => {
    const feed = projectDynamicIslandFeed({ rootEpoch: 4, appError: null, agentState: { activeChatId: "chat", runningChatId: "chat", chats: [{ id: "chat", title: "Cut launch film" } as never] } });
    expect(feed.projectStatus.status).toBe("unavailable");
    expect(feed.activeTask).toMatchObject({ label: "Cut launch film", progress: null });
    expect(feed.activeTask?.destination).toBeUndefined();
  });
  test("a new error has a different notification identity in the same root", () => {
    const project = (appError: string) => projectDynamicIslandFeed({ rootEpoch: 4, appError, agentState: { activeChatId: "", runningChatId: null, chats: [] } });
    const first = project("Network unavailable");
    const next = project("Save failed");
    expect(first.rootEpoch).toBe(4);
    if (first.notifications.status !== "ready" || next.notifications.status !== "ready") throw new Error("Expected notifications");
    expect(first.notifications.value[0]!.id).not.toBe(next.notifications.value[0]!.id);
    expect(project("Network unavailable").notifications).toMatchObject({ value: [{ id: first.notifications.value[0]!.id }] });
  });

});
