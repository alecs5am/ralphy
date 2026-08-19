import { act } from "react";
import { describe, expect, test, vi } from "vitest";
import type { CalendarWorkspaceDto } from "../electron/ralphy/types";
import { bridge } from "../src/lib/ipc";
import { CalendarScreen } from "../src/screens/CalendarScreen";
import { createReactHost } from "./react-host";

const workspace: CalendarWorkspaceDto = {
  timezone: "Europe/Moscow",
  postiz: { available: true, lastSyncedAt: null, error: null },
  events: [{
    id: "event_1", rowVersion: 1, unitId: "unit_1", unitRevisionId: "revision_1",
    title: "Launch teaser", projectId: "project_1", project: "Autumn drop", kind: "9:16 · 0:24",
    thumbnail: null, at: Date.parse("2026-08-18T07:30:00.000Z"), draftAt: null, timezone: "Europe/Moscow",
    pinnedRevision: 2, unitSelectedRevision: 3, status: "partial", metrics: null,
    channels: [
      { id: "publication_1", platform: "instagram", accountId: "account_1", account: "@ralphy",
        status: "failed", at: Date.parse("2026-08-18T07:30:00.000Z"), postUrl: null, error: "Upload failed", settings: {} },
      { id: "draft_1", platform: "tiktok", accountId: "account_2", account: "@ralphy.video",
        status: "draft", at: null, postUrl: null, error: null, settings: {} },
    ],
  }],
  readyUnits: [{ unitId: "unit_2", unitRevisionId: "revision_2", title: "Beach reset", projectId: "project_1",
    project: "Autumn drop", revision: 2, kind: "9:16", thumbnail: null, platforms: ["instagram", "tiktok"],
    channels: [
      { presentationId: "presentation_2", socialAccountId: "account_1", platform: "instagram", account: "@ralphy", settings: {} },
      { presentationId: "presentation_2", socialAccountId: "account_3", platform: "instagram", account: "@ralphy.studio", settings: {} },
      { presentationId: "presentation_3", socialAccountId: "account_2", platform: "tiktok", account: "@ralphy.video", settings: {} },
    ],
    revisions: [
      { unitRevisionId: "revision_1_old", revision: 1, thumbnail: null, platforms: ["instagram"], channels: [
        { presentationId: "presentation_old", socialAccountId: "account_1", platform: "instagram", account: "@ralphy", settings: {} },
      ] },
      { unitRevisionId: "revision_2", revision: 2, thumbnail: null, platforms: ["instagram", "tiktok"], channels: [
        { presentationId: "presentation_2", socialAccountId: "account_1", platform: "instagram", account: "@ralphy", settings: {} },
        { presentationId: "presentation_2", socialAccountId: "account_3", platform: "instagram", account: "@ralphy.studio", settings: {} },
        { presentationId: "presentation_3", socialAccountId: "account_2", platform: "tiktok", account: "@ralphy.video", settings: {} },
      ] },
    ],
    readiness: "ready", note: null }],
  projects: [{ id: "project_1", name: "Autumn drop" }],
  accounts: [
    { id: "account_1", platform: "instagram", handle: "@ralphy", disconnected: false, rowVersion: 1 },
    { id: "account_2", platform: "tiktok", handle: "@ralphy.video", disconnected: true, rowVersion: 4 },
    { id: "account_3", platform: "instagram", handle: "@ralphy.studio", disconnected: false, rowVersion: 1 },
  ],
};

function button(host: HTMLElement, name: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((item) => item.textContent?.trim().includes(name));
  if (!found) throw new Error(`Missing button: ${name}`);
  return found;
}

const click = (target: HTMLButtonElement) => target.dispatchEvent(new Event("click", { bubbles: true }));

describe("Calendar screen", () => {
  test("renders Month and keeps the right overlays exclusive", async () => {
    vi.spyOn(bridge, "loadCalendar").mockResolvedValue(workspace);
    const openProject = vi.fn();
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => {
        root.render(<CalendarScreen workspaceId="ws_ux" workspaceName="UX Testing Lab" initialDate={new Date(2026, 7, 18)} onOpenProject={openProject} />);
        await Promise.resolve(); await Promise.resolve();
      });
      expect(host.container.textContent).toContain("August 2026");
      expect(host.container.querySelectorAll(".calendar-month-cell")).toHaveLength(42);
      await act(async () => click(button(host.container, "Launch teaser")));
      expect(host.container.querySelector(".calendar-inspector")?.textContent).toContain("PINNED REVISION");
      await act(async () => click(button(host.container, "Open Unit")));
      expect(openProject).toHaveBeenCalledWith("project_1", "unit_1");
      await act(async () => click(button(host.container, "Ready to schedule")));
      expect(host.container.querySelector(".calendar-inspector")).toBeNull();
      expect(host.container.querySelector(".calendar-ready-drawer")?.textContent).toContain("Beach reset");
    } finally {
      await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks();
    }
  });

  test("switches views, clears filters, and opens both modal screens", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 18, 12));
    vi.spyOn(bridge, "loadCalendar").mockResolvedValue(workspace);
    vi.spyOn(bridge, "reconnectCalendarAccount").mockResolvedValue();
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<CalendarScreen workspaceId="ws_ux" workspaceName="UX Testing Lab" initialDate={new Date(2026, 7, 18)} />); await Promise.resolve(); });
      await act(async () => click(button(host.container, "Agenda")));
      expect(host.container.textContent).toContain("Needs attention");
      await act(async () => click(button(host.container, "Filters")));
      await act(async () => click(button(host.container, "Autumn drop")));
      expect(button(host.container, "Clear all")).toBeTruthy();
      await act(async () => click(button(host.container, "Clear all")));
      expect([...host.container.querySelectorAll("button")].some((item) => item.textContent?.includes("Clear all"))).toBe(false);
      await act(async () => { click(button(host.container, "Schedule content")); await Promise.resolve(); });
      expect(document.body.querySelector(".calendar-modal-poster")).toBeTruthy();
      expect(document.body.textContent).toContain("Tue, Aug 18, 2026");
      const channels = [...document.body.querySelectorAll<HTMLElement>(".calendar-channel-option")];
      expect(channels.filter((item) => item.getAttribute("class")?.includes("is-selected"))).toHaveLength(2);
      expect(channels.filter((item) => item.getAttribute("class")?.includes("is-disconnected"))).toHaveLength(1);
      await act(async () => click(button(document.body as unknown as HTMLElement, "Reconnect")));
      expect(document.body.querySelector(".calendar-reconnect-dialog")?.textContent).toContain("Reconnect @ralphy.video");
      expect(button(document.body as unknown as HTMLElement, "Save and reconnect").disabled).toBe(true);
      await act(async () => click(button(document.body as unknown as HTMLElement, "Cancel")));
      expect(button(document.body as unknown as HTMLElement, "Schedule 2 publications").disabled).toBe(false);
      await act(async () => click(channels.find((item) => item.getAttribute("class")?.includes("is-selected"))! as HTMLButtonElement));
      expect(button(document.body as unknown as HTMLElement, "Schedule 1 publication").disabled).toBe(false);
      await act(async () => click(button(document.body as unknown as HTMLElement, "Platform settings")));
      expect(document.body.querySelector(".calendar-modal-poster")).toBeTruthy();
      expect(document.body.querySelector(".calendar-platform-tabs")).toBeTruthy();
      expect(document.body.textContent).toContain("Share to feed");
      await act(async () => click(button(document.body as unknown as HTMLElement, "Share to feed")));
      expect(document.body.querySelector(".calendar-platform-tabs")?.textContent).toContain("Edited");
    } finally {
      await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); vi.useRealTimers();
    }
  });

  test("pins the revision chosen in Schedule content", async () => {
    vi.spyOn(bridge, "loadCalendar").mockResolvedValue(workspace);
    const mutate = vi.spyOn(bridge, "mutateCalendar").mockResolvedValue(workspace.events[0]);
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<CalendarScreen workspaceId="ws_ux" workspaceName="UX Testing Lab" initialDate={new Date(2026, 7, 18)} />); await Promise.resolve(); });
      await act(async () => { click(button(host.container, "Schedule content")); await Promise.resolve(); });
      await act(async () => click(button(document.body as unknown as HTMLElement, "R1")));
      expect(document.body.textContent).toContain("older than the latest R2");
      await act(async () => { click(button(document.body as unknown as HTMLElement, "Save as draft")); await Promise.resolve(); });
      expect(mutate).toHaveBeenCalledWith("ws_ux", expect.objectContaining({
        action: "create",
        unitRevisionId: "revision_1_old",
      }));
    } finally {
      await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks();
    }
  });

  test("exposes a ready unit as a calendar drag payload", async () => {
    vi.spyOn(bridge, "loadCalendar").mockResolvedValue(workspace);
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<CalendarScreen workspaceId="ws_ux" workspaceName="UX Testing Lab" initialDate={new Date(2026, 7, 18)} />); await Promise.resolve(); });
      await act(async () => click(button(host.container, "Ready to schedule")));
      const row = host.container.querySelector<HTMLButtonElement>(".calendar-ready-row")!;
      expect(row.getAttribute("draggable")).toBe("true");
      const values = new Map<string, string>();
      const dataTransfer = { types: ["application/x-ralphy-calendar-unit"], effectAllowed: "none", setData(type: string, value: string) { values.set(type, value); }, getData(type: string) { return values.get(type) ?? ""; } };
      const drag = new Event("dragstart", { bubbles: true });
      Object.defineProperty(drag, "dataTransfer", { value: dataTransfer });
      await act(async () => row.dispatchEvent(drag));
      expect(values.get("application/x-ralphy-calendar-unit")).toBe("unit_2");
    } finally {
      await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks();
    }
  });

  test("uses the approved Week card geometry and Agenda channel rows", async () => {
    vi.spyOn(bridge, "loadCalendar").mockResolvedValue(workspace);
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<CalendarScreen workspaceId="ws_ux" workspaceName="UX Testing Lab" initialDate={new Date(2026, 7, 18)} />); await Promise.resolve(); });
      await act(async () => click(button(host.container, "Week")));
      const hourLabels = [...host.container.querySelectorAll<HTMLElement>(".calendar-week-scroll aside span")].map((item) => item.textContent);
      expect(hourLabels).toHaveLength(24);
      expect(hourLabels[0]).toBe("00:00");
      expect(hourLabels.at(-1)).toBe("23:00");
      const weekCard = host.container.querySelector<HTMLElement>(".calendar-week-event");
      expect(weekCard?.style.top).toBe("485px");
      expect(weekCard?.querySelector(".calendar-week-event-meta")).toBeTruthy();
      expect(weekCard?.querySelector(".calendar-week-platforms svg")).toBeTruthy();

      await act(async () => click(button(host.container, "Agenda")));
      expect(host.container.querySelector(".calendar-agenda-day-line")).toBeTruthy();
      expect(host.container.querySelector(".calendar-agenda-channel")?.textContent).toContain("@ralphy · failed");
      expect(host.container.textContent).toContain("@ralphy.video · 10:30");
      expect(button(host.container, "Retry")).toBeTruthy();
    } finally {
      await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks();
    }
  });

  test("uses Ralphy date and time popovers instead of native pickers", async () => {
    vi.spyOn(bridge, "loadCalendar").mockResolvedValue(workspace);
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<CalendarScreen workspaceId="ws_ux" workspaceName="UX Testing Lab" initialDate={new Date(2026, 7, 18)} />); await Promise.resolve(); });
      await act(async () => { click(button(host.container, "Schedule content")); await Promise.resolve(); });
      expect(document.body.querySelector('input[type="date"], input[type="time"]')).toBeNull();
      const ariaButton = (label: string) => [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.getAttribute("aria-label") === label)!;

      const dateTrigger = ariaButton("Choose publication date");
      expect(dateTrigger).toBeTruthy();
      await act(async () => click(dateTrigger));
      expect(document.body.querySelector(".calendar-date-popover")).toBeTruthy();
      await act(async () => click(ariaButton("Choose Thursday, August 20, 2026")));
      expect(dateTrigger.textContent).toContain("Thu, Aug 20, 2026");

      const timeTrigger = ariaButton("Choose publication time");
      expect(timeTrigger).toBeTruthy();
      await act(async () => click(timeTrigger));
      await act(async () => click(ariaButton("Set hour 14")));
      await act(async () => click(ariaButton("Set minute 15")));
      expect(timeTrigger.textContent).toContain("14:15");
      expect(document.body.querySelector(".calendar-time-popover")).toBeNull();
    } finally {
      await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks();
    }
  });
});
