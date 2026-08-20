import { act } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  INSTRUMENT_OVERLAYS,
  InstrumentOverlay,
  SHARED_SELECT_OVERLAY_OWNERS,
} from "../src/instrument/overlay-registry";
import { createReactHost, type HostNode } from "./react-host";

const overlayIds = [
  "root-picker", "migration-recovery", "app-alert", "profile-menu", "settings", "shared-select-menu", "workspace-picker",
  "agent-chat-recent-menu", "agent-chat-provider-menu", "agent-chat-model-menu", "agent-chat-mode-menu", "dynamic-island", "right-rail-sheet",
  "workspace-account-detail", "workspace-unit-outcome-detail", "workspace-evidence-detail", "shared-inspector", "shared-viewer", "shared-workflow",
  "memory-recall", "memory-editor", "memory-history", "memory-confirm", "calendar-filter", "calendar-drawer", "calendar-inspector", "calendar-schedule",
  "calendar-unit-picker", "calendar-date-popover", "calendar-time-popover", "calendar-platform-settings", "calendar-account-detail", "calendar-reconnect",
  "document-editor", "document-viewer", "document-conflict", "media-viewer", "media-context-menu", "mock-needs-work", "unit-viewer", "run-inspector",
  "marketplace-detail", "target-chooser", "terminal",
] as const;

const sharedSelectOwners = [
  "settings.appearance", "shared.toolbar", "shared.workflow", "memory.editor", "project.media", "project.activity", "marketplace.header",
] as const;

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

async function mount(children: React.ReactNode, host = createReactHost()) {
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  await act(async () => {
    root.render(children);
    await settle();
  });
  return { host, root };
}

function overlay(host: ReturnType<typeof createReactHost>): HostNode | null {
  return host.container.ownerDocument.body.querySelector("[data-instrument-overlay]");
}

function escape() {
  return Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: "Escape" });
}

afterEach(() => vi.restoreAllMocks());

describe("instrument overlay registry", () => {
  test("registers every production overlay and shared Select owner exactly once", () => {
    expect(Object.keys(INSTRUMENT_OVERLAYS)).toEqual(overlayIds);
    expect(Object.keys(SHARED_SELECT_OVERLAY_OWNERS)).toEqual(sharedSelectOwners);
    expect(SHARED_SELECT_OVERLAY_OWNERS["project.media"].routeScope).toEqual({ kind: "exact", routeKeys: ["project.media"] });
    expect(SHARED_SELECT_OVERLAY_OWNERS["marketplace.header"].routeScope).toEqual({ kind: "production-prefix", prefix: "marketplace." });
  });

  test("renders a managed overlay marker only while open and returns focus on Escape", async () => {
    const host = createReactHost();
    const opener = host.container.ownerDocument.createElement("button") as unknown as HTMLElement;
    host.container.ownerDocument.body.appendChild(opener as unknown as HostNode);
    const onOpenChange = vi.fn();
    const mounted = await mount(
      <InstrumentOverlay id="calendar-date-popover" open label="Choose date" description="Select the date" opener={opener} onOpenChange={onOpenChange}>
        <button type="button">Today</button>
      </InstrumentOverlay>,
      host,
    );

    try {
      const surface = overlay(mounted.host);
      expect(surface?.getAttribute("data-instrument-overlay")).toBe("calendar-date-popover");
      expect(surface?.getAttribute("role")).toBe("dialog");
      expect(mounted.host.container.ownerDocument.activeElement).toBe(surface);

      await act(async () => {
        surface?.dispatchEvent(escape());
        await settle();
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(mounted.host.container.ownerDocument.activeElement).toBe(opener);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("does not render a closed overlay", async () => {
    const mounted = await mount(
      <InstrumentOverlay id="calendar-date-popover" open={false} label="Choose date" description="Select the date" opener={null} onOpenChange={() => undefined}>
        <span>date</span>
      </InstrumentOverlay>,
    );
    try {
      expect(overlay(mounted.host)).toBeNull();
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("marks a primitive host without replacing its own Escape and focus behavior", async () => {
    const host = createReactHost();
    const opener = host.container.ownerDocument.createElement("button") as unknown as HTMLElement;
    host.container.ownerDocument.body.appendChild(opener as unknown as HostNode);
    const onOpenChange = vi.fn(() => opener.focus({ preventScroll: true }));
    const mounted = await mount(
      <InstrumentOverlay id="shared-select-menu" host="primitive-host" overlayOwner="project.media" open label="Media type" description="Filter media" opener={opener} onOpenChange={onOpenChange}>
        <div role="listbox" onKeyDown={(event) => { if (event.key === "Escape") onOpenChange(false); }}>Video</div>
      </InstrumentOverlay>,
      host,
    );
    try {
      const surface = overlay(mounted.host);
      expect(surface?.getAttribute("data-instrument-overlay")).toBe("shared-select-menu");
      expect(surface?.getAttribute("data-instrument-overlay-owner")).toBe("project.media");

      await act(async () => {
        surface?.dispatchEvent(escape());
        await settle();
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(mounted.host.container.ownerDocument.activeElement).toBe(opener);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("rejects invalid primitive owner combinations before rendering", () => {
    const props = {
      open: true,
      label: "Media type",
      description: "Filter media",
      opener: null,
      onOpenChange: () => undefined,
      children: <div role="listbox" />,
    };
    expect(() => InstrumentOverlay({ id: "shared-select-menu", host: "primitive-host", ...props })).toThrow("requires one registered overlay owner");
    expect(() => InstrumentOverlay({ id: "calendar-date-popover", overlayOwner: "project.media", ...props })).toThrow("only accepts an overlay owner");
  });
});
