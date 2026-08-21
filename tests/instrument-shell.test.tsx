import { act, useState } from "react";
import { describe, expect, test, vi } from "vitest";

import {
  InstrumentShell,
  InstrumentRightRailPortal,
  resolveRightRailMode,
  useInstrumentRightRail,
} from "../src/instrument/InstrumentShell";
import { createReactHost, type HostNode } from "./react-host";

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

function escape() {
  return Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: "Escape" });
}

function resizeObserverHarness() {
  const registrations: Array<{ callback: ResizeObserverCallback; target: Element; observer: ResizeObserver }> = [];
  class TestResizeObserver {
    constructor(readonly callback: ResizeObserverCallback) {}
    observe(target: Element) { registrations.push({ callback: this.callback, target, observer: this as unknown as ResizeObserver }); }
    disconnect() { registrations.length = 0; }
    unobserve(target: Element) {
      const retained = registrations.filter((entry) => entry.target !== target);
      registrations.splice(0, registrations.length, ...retained);
    }
  }
  globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
  return {
    resize(target: HostNode, width: number, height: number) {
      target.clientWidth = width;
      target.clientHeight = height;
      for (const entry of registrations.filter((registration) => registration.target === target as unknown as Element)) {
        entry.callback([{ target: target as unknown as Element, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry], entry.observer);
      }
    },
    observedTargets() { return new Set(registrations.map((entry) => entry.target)); },
  };
}

function RailControl() {
  const rail = useInstrumentRightRail();
  return <button type="button" data-rail-mode={rail.mode} data-rail-owner={rail.owner} onClick={(event) => {
    if (rail.mode === "closed") rail.open(event.currentTarget);
    else rail.close();
  }}>Toggle rail</button>;
}

function StatefulDesk() {
  const [selected, setSelected] = useState("first");
  return <button type="button" onClick={() => setSelected("second")}>{selected}</button>;
}

function StatefulChat() {
  const [draft, setDraft] = useState("");
  return <textarea aria-label="Chat draft" value={draft} onChange={(event) => setDraft(event.currentTarget.value)} />;
}

const defaultProps = {
  sidebar: <aside>Sidebar</aside>,
  desk: <main>Desk</main>,
  chat: <button type="button">Chat action</button>,
  island: <RailControl />,
  profile: <span>Profile</span>,
  routeScrollKey: "workspace:a",
  leftVisible: true,
  rightPreference: true,
  rightOverlayOpen: false,
  bottomPanel: <section>Terminal</section>,
  bottomVisible: false,
  onToggleLeft: () => undefined,
  onToggleRightPreference: () => undefined,
  onRightOverlayOpenChange: () => undefined,
};

async function mountShell(overrides: Partial<typeof defaultProps> = {}) {
  const host = createReactHost();
  const observer = resizeObserverHarness();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  const render = async (next: Partial<typeof defaultProps> = {}) => {
    await act(async () => {
      root.render(<InstrumentShell {...defaultProps} {...overrides} {...next} />);
      await settle();
    });
  };
  await render();
  return { host, observer, root, render };
}

describe("instrument shell", () => {
  test("resolves docked, overlay, and closed rail modes without hidden preference mutation", () => {
    expect(resolveRightRailMode({ dockEligible: true, preferenceOpen: true, overlayOpen: false })).toBe("docked");
    expect(resolveRightRailMode({ dockEligible: true, preferenceOpen: false, overlayOpen: true })).toBe("closed");
    expect(resolveRightRailMode({ dockEligible: false, preferenceOpen: true, overlayOpen: false })).toBe("closed");
    expect(resolveRightRailMode({ dockEligible: false, preferenceOpen: true, overlayOpen: true })).toBe("overlay");
  });

  test("uses one observer and requires both the 1280 frame and 680 docked desk boundaries", async () => {
    const onToggleRightPreference = vi.fn();
    const mounted = await mountShell({ onToggleRightPreference });
    try {
      const shell = mounted.host.container.querySelector(".instrument-shell")!;
      const desk = mounted.host.container.querySelector(".instrument-desk-scroll")!;
      expect(mounted.observer.observedTargets()).toEqual(new Set([shell, desk] as unknown as Element[]));

      await act(async () => {
        mounted.observer.resize(shell, 1_279, 800);
        mounted.observer.resize(desk, 1_200, 700);
        await settle();
      });
      expect(shell.getAttribute("data-right-rail-mode")).toBe("closed");

      await act(async () => {
        mounted.observer.resize(shell, 1_280, 800);
        mounted.observer.resize(desk, 971, 700);
        await settle();
      });
      expect(shell.getAttribute("data-right-rail-mode")).toBe("closed");

      await act(async () => {
        mounted.observer.resize(desk, 972, 700);
        await settle();
      });
      expect(shell.getAttribute("data-right-rail-mode")).toBe("docked");

      await act(async () => {
        mounted.observer.resize(desk, 679, 700);
        await settle();
      });
      expect(shell.getAttribute("data-right-rail-mode")).toBe("closed");
      expect(onToggleRightPreference).not.toHaveBeenCalled();
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("opens the narrow rail as its registered modal sheet and restores the exact opener on Escape", async () => {
    let overlayOpen = false;
    const mounted = await mountShell({
      rightOverlayOpen: overlayOpen,
      onRightOverlayOpenChange: (open) => { overlayOpen = open; void mounted.render({ rightOverlayOpen: open }); },
    });
    try {
      const shell = mounted.host.container.querySelector(".instrument-shell")!;
      const desk = mounted.host.container.querySelector(".instrument-desk-scroll")!;
      await act(async () => {
        mounted.observer.resize(shell, 1_100, 720);
        mounted.observer.resize(desk, 860, 672);
        await settle();
      });
      const opener = mounted.host.container.querySelector("button")!;
      opener.focus();
      await act(async () => {
        opener.dispatchEvent(new Event("click", { bubbles: true }));
        await settle();
      });
      const sheet = mounted.host.container.ownerDocument.body.querySelector("[data-instrument-overlay=\"right-rail-sheet\"]")!;
      expect(shell.getAttribute("data-right-rail-mode")).toBe("overlay");
      expect(sheet.getAttribute("role")).toBe("dialog");
      expect(sheet.getAttribute("data-instrument-local-scroll")).toBe("true");
      expect(desk.getAttribute("inert")).toBe("");
      expect(desk.style.overflow).toBe("hidden");
      expect(mounted.host.container.ownerDocument.body.style.overflow).toBe("hidden");

      await act(async () => {
        sheet.dispatchEvent(escape());
        await settle();
      });
      expect(overlayOpen).toBe(false);
      expect(mounted.host.container.ownerDocument.activeElement).toBe(opener);
      expect(desk.getAttribute("inert")).toBeNull();
      expect(desk.style.overflow).toBeFalsy();
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("keeps desk component state and focus while automatic rail geometry changes", async () => {
    const mounted = await mountShell({ desk: <StatefulDesk /> });
    try {
      const shell = mounted.host.container.querySelector(".instrument-shell")!;
      const desk = mounted.host.container.querySelector(".instrument-desk-scroll")!;
      const button = desk.querySelector("button")!;
      await act(async () => {
        button.focus();
        button.dispatchEvent(new Event("click", { bubbles: true }));
        mounted.observer.resize(shell, 1_440, 900);
        mounted.observer.resize(desk, 1_200, 852);
        await settle();
      });
      expect(desk.querySelector("button")).toBe(button);
      expect(button.textContent).toBe("second");
      expect(mounted.host.container.ownerDocument.activeElement).toBe(button);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("keeps one chat DOM subtree, draft, and focus while the rail reparents", async () => {
    let overlayOpen = true;
    const mounted = await mountShell({
      chat: <StatefulChat />,
      rightOverlayOpen: overlayOpen,
      onRightOverlayOpenChange: (open) => { overlayOpen = open; void mounted.render({ rightOverlayOpen: open }); },
    });
    try {
      const shell = mounted.host.container.querySelector(".instrument-shell")!;
      const desk = mounted.host.container.querySelector(".instrument-desk-scroll")!;
      await act(async () => {
        mounted.observer.resize(shell, 1_100, 720);
        mounted.observer.resize(desk, 860, 672);
        await settle();
      });
      const draft = mounted.host.container.ownerDocument.body.querySelector("textarea") as HostNode & { value: string };
      draft.focus();
      await act(async () => {
        draft.value = "Keep this exact draft";
        draft.dispatchEvent(new Event("input", { bubbles: true }));
        mounted.observer.resize(shell, 1_440, 900);
        mounted.observer.resize(desk, 1_200, 852);
        await settle();
      });
      const dockedDraft = mounted.host.container.querySelector("textarea") as HostNode & { value: string };
      expect(dockedDraft).toBe(draft);
      expect(dockedDraft.value).toBe("Keep this exact draft");
      expect(mounted.host.container.ownerDocument.activeElement).toBe(draft);

      await act(async () => {
        mounted.observer.resize(shell, 1_100, 720);
        mounted.observer.resize(desk, 860, 672);
        await settle();
      });
      expect(mounted.host.container.ownerDocument.body.querySelector("textarea")).toBe(draft);
      expect((draft as HostNode & { value: string }).value).toBe("Keep this exact draft");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("routes a registered inspector through the shared dock host and reports its owner", async () => {
    const mounted = await mountShell({
      desk: <main><InstrumentRightRailPortal owner="shared-inspector" label="Shared item inspector"><button type="button">Inspect selected artifact</button></InstrumentRightRailPortal></main>,
    });
    try {
      const shell = mounted.host.container.querySelector(".instrument-shell")!;
      const desk = mounted.host.container.querySelector(".instrument-desk-scroll")!;
      await act(async () => {
        mounted.observer.resize(shell, 1_440, 900);
        mounted.observer.resize(desk, 1_200, 852);
        await settle();
      });
      const rail = mounted.host.container.querySelector(".instrument-right-rail")!;
      expect(rail.getAttribute("aria-label")).toBe("Shared item inspector");
      expect(rail.textContent).toContain("Inspect selected artifact");
      expect(mounted.host.container.querySelector("[data-rail-owner=\"shared-inspector\"]")).not.toBeNull();
      expect(rail.querySelector(".instrument-chat-rail-content")?.getAttribute("hidden")).not.toBeNull();
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("clears transient overlay state when the same rail becomes dock-eligible", async () => {
    const onRightOverlayOpenChange = vi.fn();
    const mounted = await mountShell({ rightOverlayOpen: true, onRightOverlayOpenChange });
    try {
      const shell = mounted.host.container.querySelector(".instrument-shell")!;
      const desk = mounted.host.container.querySelector(".instrument-desk-scroll")!;
      await act(async () => {
        mounted.observer.resize(shell, 1_100, 720);
        mounted.observer.resize(desk, 860, 672);
        await settle();
      });
      expect(shell.getAttribute("data-right-rail-mode")).toBe("overlay");
      onRightOverlayOpenChange.mockClear();

      await act(async () => {
        mounted.observer.resize(shell, 1_440, 900);
        mounted.observer.resize(desk, 1_200, 852);
        await settle();
      });
      expect(shell.getAttribute("data-right-rail-mode")).toBe("docked");
      expect(onRightOverlayOpenChange).toHaveBeenCalledOnce();
      expect(onRightOverlayOpenChange).toHaveBeenCalledWith(false);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });
});
