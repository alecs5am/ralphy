import { act, useState } from "react";
import { createPortal } from "react-dom";
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
  "marketplace-detail", "target-chooser",
  "view-panel-types", "view-panel-overflow",
] as const;

const sharedSelectOwners = [
  "settings.rows", "shared.toolbar", "shared.workflow", "memory.editor", "project.media", "project.activity", "marketplace.header",
] as const;

const overlayKinds = {
  "root-picker": "dialog", "migration-recovery": "dialog", "app-alert": "dialog", "profile-menu": "menu", settings: "dialog", "shared-select-menu": "listbox",
  "workspace-picker": "listbox", "agent-chat-recent-menu": "menu", "agent-chat-provider-menu": "menu", "agent-chat-model-menu": "menu", "agent-chat-mode-menu": "menu",
  "dynamic-island": "popover", "right-rail-sheet": "sheet", "workspace-account-detail": "dialog", "workspace-unit-outcome-detail": "dialog", "workspace-evidence-detail": "dialog",
  "shared-inspector": "rail", "shared-viewer": "viewer", "shared-workflow": "dialog", "memory-recall": "dialog", "memory-editor": "dialog", "memory-history": "dialog", "memory-confirm": "dialog",
  "calendar-filter": "popover", "calendar-drawer": "drawer", "calendar-inspector": "rail", "calendar-schedule": "dialog", "calendar-unit-picker": "popover", "calendar-date-popover": "popover",
  "calendar-time-popover": "popover", "calendar-platform-settings": "dialog", "calendar-account-detail": "dialog", "calendar-reconnect": "dialog", "document-editor": "dialog", "document-viewer": "viewer",
  "document-conflict": "dialog", "media-viewer": "viewer", "media-context-menu": "menu", "mock-needs-work": "dialog", "unit-viewer": "viewer", "run-inspector": "rail", "marketplace-detail": "dialog",
  "target-chooser": "dialog", "view-panel-types": "menu", "view-panel-overflow": "menu",
} as const;

const sharedSelectOwnerRecords = {
  "settings.rows": { module: "src/screens/settings/rows.tsx", routeScope: { kind: "production-prefix", prefix: "settings." } },
  "shared.toolbar": { module: "src/screens/shared-library/SharedLibraryToolbar.tsx", routeScope: { kind: "exact", routeKeys: ["workspace.shared"] } },
  "shared.workflow": { module: "src/screens/shared-library/SharedLibraryWorkflows.tsx", routeScope: { kind: "exact", routeKeys: ["workspace.shared"] } },
  "memory.editor": { module: "src/screens/MemoryScreen.tsx", routeScope: { kind: "exact", routeKeys: ["workspace.memory"] } },
  "project.media": { module: "src/screens/project/MediaPanel.tsx", routeScope: { kind: "exact", routeKeys: ["project.media"] } },
  "project.activity": { module: "src/screens/project/ActivityTimeline.tsx", routeScope: { kind: "exact", routeKeys: ["project.activity"] } },
  "marketplace.header": { module: "src/screens/marketplace/MarketplaceHeader.tsx", routeScope: { kind: "production-prefix", prefix: "marketplace." } },
};

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

function tab() {
  return Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: "Tab" });
}

function ControlledModal({ localScroll = false }: { localScroll?: boolean }) {
  const [open, setOpen] = useState(true);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  return <>
    <button ref={setOpener} type="button">Background opener</button>
    <button type="button" onClick={() => setOpen(false)}>Controlled close</button>
    {opener && <InstrumentOverlay id="right-rail-sheet" open={open} label="Agent chat" description="Chat with the active agent" opener={opener} onOpenChange={setOpen} localScroll={localScroll}>
      <button type="button">First action</button>
      <button type="button">Last action</button>
    </InstrumentOverlay>}
  </>;
}

function NestedModals() {
  const [outerOpen, setOuterOpen] = useState(true);
  const [innerOpen, setInnerOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setInnerOpen(true)}>Open reconnect</button>
    <button type="button" onClick={() => setOuterOpen(false)}>Close schedule</button>
    <button type="button" onClick={() => setInnerOpen(false)}>Close reconnect</button>
    <button type="button" onClick={() => { setOuterOpen(false); setInnerOpen(false); }}>Close calendar</button>
    {outerOpen && <InstrumentOverlay id="calendar-schedule" open label="Schedule content" description="Schedule a Unit" opener={null} onOpenChange={setOuterOpen}>
      <button type="button">Schedule action</button>
    </InstrumentOverlay>}
    {innerOpen && <InstrumentOverlay id="calendar-reconnect" open label="Reconnect account" description="Replace credentials" opener={null} onOpenChange={setInnerOpen}>
      <button type="button">Reconnect action</button>
    </InstrumentOverlay>}
  </>;
}

function buttonByText(host: ReturnType<typeof createReactHost>, text: string) {
  const button = host.container.querySelectorAll("button").find((node) => node.textContent === text);
  if (!button) throw new Error(`Missing ${text}`);
  return button;
}

async function click(node: HostNode) {
  await act(async () => {
    node.dispatchEvent(new Event("click", { bubbles: true }));
    await settle();
  });
}

afterEach(() => vi.restoreAllMocks());

describe("instrument overlay registry", () => {
  test("registers every production overlay and shared Select owner exactly once", () => {
    expect(Object.keys(INSTRUMENT_OVERLAYS)).toEqual(overlayIds);
    expect(INSTRUMENT_OVERLAYS).toEqual(Object.fromEntries(Object.entries(overlayKinds).map(([id, kind]) => [id, { kind }])));
    expect(Object.keys(SHARED_SELECT_OVERLAY_OWNERS)).toEqual(sharedSelectOwners);
    expect(SHARED_SELECT_OVERLAY_OWNERS).toEqual(sharedSelectOwnerRecords);
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

  test("uses a modal Radix host to trap Tab, inert the background, and lock body scroll", async () => {
    const mounted = await mount(<ControlledModal />);
    try {
      const surface = overlay(mounted.host);
      const buttons = surface?.querySelectorAll("button") ?? [];
      const opener = mounted.host.container.querySelectorAll("button")[0];
      expect(surface?.getAttribute("role")).toBe("dialog");
      expect(surface?.getAttribute("aria-modal")).toBe("true");
      expect(mounted.host.container.getAttribute("inert")).toBe("");
      expect(mounted.host.container.ownerDocument.body.style.overflow).toBe("hidden");

      buttons.at(-1)?.focus();
      await act(async () => {
        buttons.at(-1)?.dispatchEvent(tab());
        await settle();
      });
      expect(mounted.host.container.ownerDocument.activeElement).toBe(buttons[0]);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("restores the opener and releases the scroll owner after a controlled close", async () => {
    const mounted = await mount(<ControlledModal localScroll />);
    try {
      const surface = overlay(mounted.host);
      const opener = mounted.host.container.querySelectorAll("button")[0];
      const close = mounted.host.container.querySelectorAll("button")[1];
      expect(surface?.getAttribute("data-instrument-local-scroll")).toBe("true");
      expect(surface?.style.overflow).toBe("auto");

      await act(async () => {
        close?.dispatchEvent(new Event("click", { bubbles: true }));
        await settle();
      });
      expect(overlay(mounted.host)).toBeNull();
      expect(mounted.host.container.ownerDocument.activeElement).toBe(opener);
      expect(mounted.host.container.getAttribute("inert")).toBeNull();
      expect(mounted.host.container.ownerDocument.body.style.overflow).toBe("");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("keeps the application background inert until nested modal releases finish in either order", async () => {
    const mounted = await mount(<NestedModals />);
    try {
      await click(buttonByText(mounted.host, "Open reconnect"));
      expect(mounted.host.container.getAttribute("inert")).toBe("");
      await click(buttonByText(mounted.host, "Close schedule"));
      expect(mounted.host.container.getAttribute("inert")).toBe("");
      expect(mounted.host.container.ownerDocument.body.style.overflow).toBe("hidden");
      await click(buttonByText(mounted.host, "Close reconnect"));
      expect(mounted.host.container.getAttribute("inert")).toBeNull();
      expect(mounted.host.container.ownerDocument.body.style.overflow).toBe("");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("keeps the application background inert when the nested modal releases before its parent", async () => {
    const mounted = await mount(<NestedModals />);
    try {
      await click(buttonByText(mounted.host, "Open reconnect"));
      await click(buttonByText(mounted.host, "Close reconnect"));
      expect(mounted.host.container.getAttribute("inert")).toBe("");
      expect(mounted.host.container.ownerDocument.body.style.overflow).toBe("hidden");
      await click(buttonByText(mounted.host, "Close schedule"));
      expect(mounted.host.container.getAttribute("inert")).toBeNull();
      expect(mounted.host.container.ownerDocument.body.style.overflow).toBe("");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("releases owned modality after simultaneous nested teardown", async () => {
    const mounted = await mount(<NestedModals />);
    try {
      await click(buttonByText(mounted.host, "Open reconnect"));
      await click(buttonByText(mounted.host, "Close calendar"));
      expect(mounted.host.container.getAttribute("inert")).toBeNull();
      expect(mounted.host.container.ownerDocument.body.style.overflow).toBe("");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("restores pre-existing modal environment after simultaneous nested teardown", async () => {
    const host = createReactHost();
    host.container.setAttribute("inert", "");
    host.container.ownerDocument.body.style.overflow = "scroll";
    const mounted = await mount(<NestedModals />, host);
    try {
      await click(buttonByText(mounted.host, "Open reconnect"));
      await click(buttonByText(mounted.host, "Close calendar"));
      expect(mounted.host.container.getAttribute("inert")).toBe("");
      expect(mounted.host.container.ownerDocument.body.style.overflow).toBe("scroll");
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
    expect(() => InstrumentOverlay({ id: "shared-select-menu", host: "primitive-host", overlayOwner: "not-registered", ...props } as never)).toThrow("registered overlay owner");
    expect(() => InstrumentOverlay({ id: "calendar-date-popover", overlayOwner: "project.media", ...props })).toThrow("only accepts an overlay owner");
    expect(() => InstrumentOverlay({ id: "calendar-date-popover", host: "primitive-host", ...props })).toThrow("does not support primitive-host");
    expect(() => InstrumentOverlay({ id: "shared-select-menu", overlayOwner: "project.media", ...props })).toThrow("only supports primitive-host");
    expect(() => InstrumentOverlay({ id: "workspace-picker", ...props } as never)).toThrow("only supports primitive-host");
    expect(() => InstrumentOverlay({ id: "workspace-picker", host: "primitive-host", ...props, children: <><div role="listbox" /></> } as never)).toThrow("exactly one concrete DOM-capable");
    expect(() => InstrumentOverlay({ id: "workspace-picker", host: "primitive-host", ...props, children: "not a listbox" } as never)).toThrow("exactly one concrete DOM-capable");
    const host = createReactHost();
    try {
      expect(() => InstrumentOverlay({ id: "workspace-picker", host: "primitive-host", ...props, children: createPortal(<div role="listbox" />, host.container as unknown as Element) } as never)).toThrow("exactly one concrete DOM-capable");
    } finally {
      host.restore();
    }
  });
});
