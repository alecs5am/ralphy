import { describe, expect, test } from "vitest";

import { projectDynamicIslandFeed } from "@/widgets/dynamic-island/model/feed";

describe("dynamic island live projection", () => {
  test("does not invent review totals, progress, or navigation", () => {
    const feed = projectDynamicIslandFeed({ rootEpoch: 4, appError: null, agentState: { activeChatId: "chat", runningChatId: "chat", chats: [{ id: "chat", title: "Cut launch film" } as never] } });
    expect(feed.projectStatus.status).toBe("unavailable");
    expect(feed.activeTask).toMatchObject({ label: "Cut launch film", progress: null });
    expect(feed.activeTask?.destination).toBeUndefined();
  });
});
