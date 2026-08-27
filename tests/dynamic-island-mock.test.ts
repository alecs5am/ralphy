import { describe, expect, test } from "vitest";

import { projectMockDynamicIslandFeed } from "@/widgets/dynamic-island/model/mock";

const workspace = { id: "ux", name: "UX Testing Lab" } as never;

describe("dynamic island mock isolation", () => {
  test("matches only the exact UX Testing Lab workspace", () => {
    expect(projectMockDynamicIslandFeed({ rootEpoch: 1, workspace: { ...workspace, name: "UX Testing lab" }, project: null })).toBeNull();
    const feed = projectMockDynamicIslandFeed({ rootEpoch: 1, workspace, project: null });
    expect(feed?.notifications.status).toBe("ready");
    expect(feed?.notifications.status === "ready" ? feed.notifications.value : []).toHaveLength(3);
  });
});
