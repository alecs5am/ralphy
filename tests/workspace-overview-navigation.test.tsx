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
vi.mock("../src/components/ProfileMenu", () => ({ ProfileMenu: () => null }));
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

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function mountApp() {
  vi.useFakeTimers();
  const host = createReactHost();
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
      workspaces: [{
        id: "workspace-1", name: "Launch Studio", description: "Short-form launches", absolutePath: "/tmp/.ralphy/workspaces/launch",
        projectCount: 0, sharedCount: 0, unitCount: 1, finalCount: 0, recentActivity: "2026-08-20T10:00:00.000Z",
      }],
      projects: [],
    },
  });
  const loadOverview = vi.spyOn(bridge, "loadWorkspaceOverview").mockResolvedValue(overview);
  const loadCalendar = vi.spyOn(bridge, "loadCalendar").mockImplementation(async (_workspaceId, input) => ({
    timezone: input.timezone, postiz: { available: false, lastSyncedAt: null, error: null },
    events: [], readyUnits: [], projects: [], accounts: [],
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

  test("falls back to workspace Units when a returned Unit project is absent from the catalog", async () => {
    const mounted = await mountApp();
    try {
      const openUnit = [...mounted.host.container.querySelectorAll("button")]
        .find((button) => button.textContent === "Open Unit")!;
      expect(openUnit).toBeTruthy();
      await act(async () => { openUnit.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });

      expect(mounted.host.container.textContent).toContain("Units is not wired yet");
      expect(mounted.host.container.textContent).toContain("Back to Overview");
      expect(mounted.host.container.textContent).toContain("Unit unit-1 is not present in the current project catalog");
    } finally {
      await mounted.cleanup();
    }
  });
});
