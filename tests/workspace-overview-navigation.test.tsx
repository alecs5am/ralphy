import { act, type HTMLAttributes, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { WorkspaceOverviewDto } from "../electron/ralphy/types";
import { bridge } from "../src/lib/ipc";
import { createReactHost, type HostNode } from "./react-host";

vi.mock("motion/react", () => {
  const Div = ({ children, initial: _initial, animate: _animate, transition: _transition, layout: _layout, ...props }: HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...props}>{children as ReactNode}</div>;
  const Section = ({ children, layout: _layout, ...props }: HTMLAttributes<HTMLElement> & Record<string, unknown>) => <section {...props}>{children as ReactNode}</section>;
  const Aside = ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: HTMLAttributes<HTMLElement> & Record<string, unknown>) => <aside {...props}>{children as ReactNode}</aside>;
  const Header = ({ children, layout: _layout, ...props }: HTMLAttributes<HTMLElement> & Record<string, unknown>) => <header {...props}>{children as ReactNode}</header>;
  const Pass = ({ children }: { children: ReactNode }) => <>{children}</>;
  return { AnimatePresence: Pass, LayoutGroup: Pass, MotionConfig: Pass, motion: { div: Div, section: Section, aside: Aside, header: Header } };
});
vi.mock("../src/components/UtilityPanels", () => ({ AgentChatPanel: () => null, BottomPanel: () => null }));
vi.mock("../src/components/WelcomeScreen", () => ({ WelcomeScreen: () => <div>Loading Ralphy</div> }));
vi.mock("../src/chat/useAgentChat", () => ({ useAgentChat: () => ({}) }));

const scheduledAt = Date.now() + 60 * 60 * 1000;
const account = {
  id: "account-1", workspaceId: "workspace-1", platform: "tiktok", externalId: "private-account-id",
  username: "launch", displayName: "Launch Studio", credentialConfigured: true, credentialSource: "encrypted" as const,
  relinkRequired: false, rowVersion: 1, createdAt: 1, updatedAt: 2,
};
const publication = {
  id: "publication-1", unitId: "unit-1", presentationId: "presentation-1", platform: "tiktok",
  socialAccountId: account.id, rail: "postiz" as const, state: "failed" as const, url: null,
  scheduledAt, submittedAt: null, publishedAt: null, createdAt: 1, updatedAt: 2,
};
const overview = {
  workspace: { id: "workspace-1", slug: "launch", name: "Launch Studio", rowVersion: 1, createdAt: 1, updatedAt: 2 },
  accounts: { items: Array.from({ length: 6 }, (_, index) => ({ ...account, id: `account-${index + 1}`, externalId: `private-${index + 1}`, username: `launch${index + 1}` })), nextCursor: null },
  projects: { items: [], nextCursor: null },
  units: { items: [{
    id: "unit-1", workspaceId: "workspace-1", projectId: "missing-project", compositionId: null,
    slug: "Product reveal", format: "video", latestRevisionId: "revision-1", selectedRevisionId: "revision-1",
    createdAt: 1, updatedAt: 2,
  }], nextCursor: null },
  publications: { items: Array.from({ length: 6 }, (_, index) => ({
    ...publication, id: `publication-${index + 1}`, socialAccountId: `account-${index + 1}`,
  })), nextCursor: null },
  metrics: { publicationCount: 6, views: null, likes: null, comments: null, shares: null, watchTimeMs: null },
} satisfies WorkspaceOverviewDto;

const secondOverview: WorkspaceOverviewDto = {
  ...overview,
  workspace: { ...overview.workspace, id: "workspace-2", slug: "studio", name: "Second Studio" },
  accounts: { items: overview.accounts.items.map((item, index) => ({
    ...item, id: `second-account-${index + 1}`, workspaceId: "workspace-2", username: `second${index + 1}`,
  })), nextCursor: null },
  units: { items: overview.units.items.map((item) => ({ ...item, id: "unit-2", workspaceId: "workspace-2", slug: "Second reveal" })), nextCursor: null },
  publications: { items: overview.publications.items.map((item, index) => ({
    ...item, id: `second-publication-${index + 1}`, unitId: "unit-2", socialAccountId: `second-account-${index + 1}`,
  })), nextCursor: null },
};

const workspaceSummary = {
  id: "workspace-1", name: "Launch Studio", description: "Short-form launches", absolutePath: "/tmp/.ralphy/workspaces/launch",
  projectCount: 0, sharedCount: 0, unitCount: 1, finalCount: 0, recentActivity: "2026-08-20T10:00:00.000Z",
};
const secondWorkspaceSummary = {
  ...workspaceSummary, id: "workspace-2", name: "Second Studio", description: "Second workspace", absolutePath: "/tmp/.ralphy/workspaces/studio",
};

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function mountApp({
  overviews = { "workspace-1": overview },
  workspaces = [workspaceSummary],
  calendarEvents = {},
}: {
  overviews?: Record<string, WorkspaceOverviewDto>;
  workspaces?: typeof workspaceSummary[];
  calendarEvents?: Record<string, Awaited<ReturnType<typeof bridge.loadCalendar>>["events"]>;
} = {}) {
  vi.useFakeTimers();
  const host = createReactHost();
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: 1280 },
    innerHeight: { configurable: true, value: 900 },
  });
  const storage = new Map<string, string>();
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } });
  const restoreLibrary = vi.spyOn(bridge, "restoreLibrary").mockResolvedValue({
    identity: { storeId: "store-1", label: "Ralphy", rootEpoch: 1, activitySequence: 0 },
    catalog: {
      rootPath: "/tmp/.ralphy", generation: 1, mediaItemCount: 0, completedAt: "2026-08-20T10:00:00.000Z",
      workspaces,
      projects: [],
    },
  });
  const loadOverview = vi.spyOn(bridge, "loadWorkspaceOverview").mockImplementation(async (workspaceId) => overviews[workspaceId]!);
  const loadCalendar = vi.spyOn(bridge, "loadCalendar").mockImplementation(async (workspaceId, input) => ({
    timezone: input.timezone, postiz: { available: false, lastSyncedAt: null, error: null },
    events: calendarEvents[workspaceId] ?? [], readyUnits: [], projects: [], accounts: [],
  }));
  const { App } = await import("../src/App");
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  await act(async () => { root.render(<App />); await settle(); });
  await act(async () => { vi.advanceTimersByTime(1_500); await settle(); });
  await act(async () => { await settle(); });
  return {
    host, root, loadCalendar,
    cleanup: async () => {
      await act(async () => root.unmount());
      restoreLibrary.mockRestore(); loadOverview.mockRestore(); loadCalendar.mockRestore();
      if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
      else delete (globalThis as Record<string, unknown>).localStorage;
      host.restore();
      vi.useRealTimers();
    },
  };
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("workspace overview navigation lifecycle", () => {
  test("opens Shared Library from Overview and restores the originating control on Back", async () => {
    const emptyOverview: WorkspaceOverviewDto = {
      ...overview,
      accounts: { items: [], nextCursor: null },
      units: { items: [], nextCursor: null },
      publications: { items: [], nextCursor: null },
      metrics: { ...overview.metrics, publicationCount: 0 },
    };
    const mounted = await mountApp({ overviews: { "workspace-1": emptyOverview } });
    try {
      const scroll = mounted.host.container.querySelector(".workspace-overview-scroll") as unknown as HostNode;
      scroll.scrollTop = 221;
      const openShared = [...mounted.host.container.querySelectorAll("button")]
        .find((button) => button.textContent === "Open Shared library")!;
      const focusId = openShared.getAttribute("id");
      await act(async () => { openShared.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });

      expect(mounted.host.container.textContent).toContain("Back to Overview");
      expect(mounted.host.container.textContent).toContain("Shared Library");
      expect(mounted.host.container.textContent).toContain("Reusable workspace artifacts for people and agents");
      expect(mounted.host.container.textContent).not.toContain("Shared Library is not wired yet");

      const back = [...mounted.host.container.querySelectorAll("button")]
        .find((button) => button.textContent === "Back to Overview")!;
      await act(async () => { back.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect((mounted.host.container.querySelector(".workspace-overview-scroll") as unknown as HostNode).scrollTop).toBe(221);
      expect((document.activeElement as unknown as HostNode)?.getAttribute("id")).toBe(focusId);
    } finally {
      await mounted.cleanup();
    }
  });

  test("carries Calendar context and restores Overview scroll, expansion, and focus on Back", async () => {
    const mounted = await mountApp();
    try {
      const scroll = mounted.host.container.querySelector(".workspace-overview-scroll") as unknown as HostNode;
      expect(scroll).toBeTruthy();
      scroll.scrollTop = 347;

      const expand = [...mounted.host.container.querySelectorAll("button")]
        .find((button) => button.textContent === "View all attention")!;
      await act(async () => expand.dispatchEvent(new Event("click", { bubbles: true })));
      expect(mounted.host.container.querySelector(".workspace-attention-list")?.querySelectorAll("li")).toHaveLength(6);

      const calendar = [...mounted.host.container.querySelectorAll("button")]
        .find((button) => button.textContent === "Open in Calendar")!;
      calendar.focus();
      const originId = calendar.getAttribute("id");
      await act(async () => { calendar.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });

      expect(mounted.host.container.textContent).toContain("Back to Overview");
      expect(mounted.host.container.textContent).toContain("Product reveal");
      expect(mounted.host.container.textContent).toContain("@launch1");
      expect(mounted.host.container.textContent).toContain("account filtering unavailable");
      const [, calendarInput] = mounted.loadCalendar.mock.calls.at(-1)!;
      expect(Date.parse(calendarInput.from)).toBeLessThanOrEqual(scheduledAt);
      expect(Date.parse(calendarInput.to)).toBeGreaterThan(scheduledAt);
      expect((document.activeElement as unknown as HostNode)?.textContent).toBe("Calendar");

      const back = [...mounted.host.container.querySelectorAll("button")]
        .find((button) => button.textContent === "Back to Overview")!;
      await act(async () => { back.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });

      const restoredScroll = mounted.host.container.querySelector(".workspace-overview-scroll") as unknown as HostNode;
      expect(restoredScroll.scrollTop).toBe(347);
      expect(mounted.host.container.querySelector(".workspace-attention-list")?.querySelectorAll("li")).toHaveLength(6);
      expect((document.activeElement as unknown as HostNode)?.getAttribute("id")).toBe(originId);
    } finally {
      await mounted.cleanup();
    }
  });

  test("restores the explicit Review problem control after Calendar unmounts Overview", async () => {
    const mounted = await mountApp();
    try {
      const review = [...mounted.host.container.querySelectorAll("button")]
        .find((button) => button.textContent === "Review problem")!;
      expect(review.getAttribute("id")).toBe(`workspace-calendar-problem-unit-1-${scheduledAt}`);
      await act(async () => { review.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      const back = [...mounted.host.container.querySelectorAll("button")]
        .find((button) => button.textContent === "Back to Overview")!;
      await act(async () => { back.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect((document.activeElement as unknown as HostNode)?.getAttribute("id")).toBe(review.getAttribute("id"));
    } finally {
      await mounted.cleanup();
    }
  });

  test("restores an originating Attention control that only exists after expansion", async () => {
    const overviews: Record<string, WorkspaceOverviewDto> = { "workspace-1": overview };
    const mounted = await mountApp({ overviews });
    try {
      const expand = [...mounted.host.container.querySelectorAll("button")]
        .find((button) => button.textContent === "View all attention")!;
      await act(async () => expand.dispatchEvent(new Event("click", { bubbles: true })));
      const attention = [...mounted.host.container.querySelectorAll(".workspace-attention-list button")].at(-1)!;
      const focusId = attention.getAttribute("id");
      expect(focusId).toBe("workspace-attention-publication-failure-account-6");
      await act(async () => { attention.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      overviews["workspace-1"] = {
        ...overview,
        accounts: { items: [{ ...account, id: "account-0", externalId: "private-0", username: "launch0" }, ...overview.accounts.items], nextCursor: null },
        publications: { items: [{ ...publication, id: "publication-0", socialAccountId: "account-0" }, ...overview.publications.items], nextCursor: null },
        metrics: { ...overview.metrics, publicationCount: 7 },
      };
      const back = [...mounted.host.container.querySelectorAll("button")]
        .find((button) => button.textContent === "Back to Overview")!;
      await act(async () => { back.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect(mounted.host.container.querySelector(".workspace-attention-list")?.querySelectorAll("li")).toHaveLength(7);
      expect((document.activeElement as unknown as HostNode)?.getAttribute("id")).toBe(focusId);
    } finally {
      await mounted.cleanup();
    }
  });

  test("restores the stable account card after account-drawer Calendar navigation", async () => {
    const mounted = await mountApp();
    try {
      const card = mounted.host.container.querySelector(".account-card")!;
      expect(card.getAttribute("id")).toBe("workspace-account-account-1");
      await act(async () => card.dispatchEvent(new Event("click", { bubbles: true })));
      const openCalendar = [...document.body.querySelectorAll("button")]
        .find((button) => button.textContent === "Open Calendar")!;
      await act(async () => { openCalendar.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      const back = [...mounted.host.container.querySelectorAll("button")]
        .find((button) => button.textContent === "Back to Overview")!;
      await act(async () => { back.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect((document.activeElement as unknown as HostNode)?.getAttribute("id")).toBe("workspace-account-account-1");
    } finally {
      await mounted.cleanup();
    }
  });

  test.each([
    ["workspace-empty-calendar", "empty plan"],
    ["workspace-onboarding-calendar", "onboarding"],
  ])("restores %s after %s Calendar navigation", async (focusId) => {
    const emptyOverview: WorkspaceOverviewDto = {
      ...overview,
      accounts: { items: [], nextCursor: null },
      publications: { items: [], nextCursor: null },
    };
    const mounted = await mountApp({ overviews: { "workspace-1": emptyOverview } });
    try {
      const origin = mounted.host.container.querySelector(`#${focusId}`)!;
      expect(origin).toBeTruthy();
      await act(async () => { origin.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      const back = [...mounted.host.container.querySelectorAll("button")]
        .find((button) => button.textContent === "Back to Overview")!;
      await act(async () => { back.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect((document.activeElement as unknown as HostNode)?.getAttribute("id")).toBe(focusId);
    } finally {
      await mounted.cleanup();
    }
  });

  test("falls back to workspace Units when a returned Unit project is absent from the catalog", async () => {
    const mounted = await mountApp();
    try {
      const openUnit = [...mounted.host.container.querySelectorAll("button")]
        .find((button) => button.textContent === "Open Unit")!;
      expect(openUnit).toBeTruthy();
      const focusId = openUnit.getAttribute("id");
      expect(focusId).toBe(`workspace-open-unit-unit-1-${scheduledAt}`);
      await act(async () => { openUnit.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });

      /* The Units page is a real screen now: it fans the workspace's projects out into one list,
         so what stands here is its own heading rather than the old "not wired yet" plate. */
      expect(mounted.host.container.textContent).toContain("Every Unit in this workspace");
      expect(mounted.host.container.textContent).toContain("Back to Overview");
      expect(mounted.host.container.textContent).toContain("Product reveal is not present in the current project catalog");
      expect(mounted.host.container.textContent).not.toContain("Unit unit-1");
      const back = [...mounted.host.container.querySelectorAll("button")]
        .find((button) => button.textContent === "Back to Overview")!;
      await act(async () => { back.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect((document.activeElement as unknown as HostNode)?.getAttribute("id")).toBe(focusId);
    } finally {
      await mounted.cleanup();
    }
  });

  test("does not carry destination or Overview return state across a workspace switch", async () => {
    const calendarEvent = {
      id: "shared-calendar-event", rowVersion: 1, unitId: "unit-1", unitRevisionId: "revision-1",
      title: "Product reveal", projectId: null, project: "Missing project", kind: "video", thumbnail: null,
      at: scheduledAt, draftAt: null, timezone: "UTC", pinnedRevision: 1, unitSelectedRevision: 1,
      status: "failed" as const, channels: [], metrics: null,
    };
    const mounted = await mountApp({
      overviews: { "workspace-1": overview, "workspace-2": secondOverview },
      workspaces: [workspaceSummary, secondWorkspaceSummary],
      calendarEvents: {
        "workspace-1": [calendarEvent],
        "workspace-2": [{ ...calendarEvent, unitId: "unit-2", title: "Second reveal" }],
      },
    });
    try {
      const scroll = mounted.host.container.querySelector(".workspace-overview-scroll") as unknown as HostNode;
      scroll.scrollTop = 347;
      const expand = [...mounted.host.container.querySelectorAll("button")]
        .find((button) => button.textContent === "View all attention")!;
      await act(async () => expand.dispatchEvent(new Event("click", { bubbles: true })));
      const calendar = [...mounted.host.container.querySelectorAll("button")]
        .find((button) => button.textContent === "Open in Calendar")!;
      calendar.focus();
      const oldFocusId = calendar.getAttribute("id");
      await act(async () => { calendar.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect(mounted.host.container.querySelector(".calendar-inspector")?.textContent).toContain("Product reveal");

      const picker = [...mounted.host.container.querySelectorAll("button")]
        .find((button) => button.getAttribute("aria-label") === "Select workspace")!;
      await act(async () => { picker.dispatchEvent(new Event("click", { bubbles: true })); vi.advanceTimersByTime(1); await settle(); });
      const second = [...document.body.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Second Studio"))!;
      await act(async () => { second.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });

      expect(mounted.host.container.textContent).not.toContain("Back to Overview");
      expect(mounted.host.container.textContent).not.toContain("Product reveal");
      expect(mounted.host.container.textContent).not.toContain("@launch1");
      expect(mounted.host.container.querySelector(".calendar-inspector")).toBeNull();

      const overviewButton = [...mounted.host.container.querySelectorAll(".sidebar-nav-row")]
        .find((button) => button.textContent?.includes("Overview"))!;
      await act(async () => { overviewButton.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      const secondScroll = mounted.host.container.querySelector(".workspace-overview-scroll") as unknown as HostNode;
      expect(secondScroll.scrollTop).toBe(0);
      expect(mounted.host.container.querySelector(".workspace-attention-list")?.querySelectorAll("li")).toHaveLength(5);
      expect((document.activeElement as unknown as HostNode)?.getAttribute("id")).not.toBe(oldFocusId);
    } finally {
      await mounted.cleanup();
    }
  });
});
