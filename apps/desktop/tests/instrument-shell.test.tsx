import { act, useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { InstrumentShell, type InstrumentShellProps } from "@/app/layout/InstrumentShell";
import { InstrumentRightRailPortal, resolveRightRailMode, useInstrumentRightRail } from "@/shared/lib/instrument-rail";
import { createReactHost, type HostNode } from "./react-host";

async function settle() { await Promise.resolve(); await Promise.resolve(); }

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
    if (rail.mode === "closed") rail.open(event.currentTarget); else rail.close();
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

// Registered inspectors retain their own dock thresholds and overlay preference.
const REVIEW_DESK = <main><InstrumentRightRailPortal owner="shared-inspector" label="Shared item"><button type="button">Review selected media</button></InstrumentRightRailPortal></main>;

const defaultProps: InstrumentShellProps = {
  sidebar: <aside>Sidebar</aside>, desk: <main>Desk</main>,
  chat: <button type="button">Chat action</button>, island: <RailControl />,
  routeScrollKey: "workspace:a",
  leftVisible: true, leftWidth: 240,
  onLeftWidthChange: () => undefined,
  rightWidth: 292,
  onRightWidthChange: () => undefined,
  viewOpen: true, viewWidth: 440,
  onViewWidthChange: () => undefined,
  rightPreference: true, rightOverlayOpen: false,
  lens: "desk" as const,
  onLensChange: () => undefined,
  onToggleLeft: () => undefined,
  onToggleRightPreference: () => undefined,
  onRightOverlayOpenChange: () => undefined,
};

async function mountShell(overrides: Partial<typeof defaultProps> = {}) {
  const host = createReactHost();
  const observer = resizeObserverHarness();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  const update = (next: Partial<InstrumentShellProps> = {}) => root.render(<InstrumentShell {...defaultProps} {...overrides} {...next} />);
  const render = async (next: Partial<typeof defaultProps> = {}) => {
    await act(async () => {
      update(next);
      await settle();
    });
  };
  await render();
  return { host, observer, root, render, update };
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
    const mounted = await mountShell({ desk: REVIEW_DESK, onToggleRightPreference });
    try {
      const shell = mounted.host.container.querySelector(".instrument-shell")!;
      const desk = mounted.host.container.querySelector(".instrument-desk-scroll")!;
      expect(desk.getAttribute("class")).toContain("[&_.overscroll-contain]:overscroll-auto");
      expect(desk.getAttribute("data-scroll-mode")).toBe("desk");
      await mounted.render({ deskFill: true });
      expect(desk.getAttribute("class")).not.toContain("[&_.overscroll-contain]:overscroll-auto");
      expect(desk.getAttribute("data-scroll-mode")).toBe("page");
      await mounted.render({ deskFill: false });
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
    } finally { await act(async () => mounted.root.unmount()); mounted.host.restore(); }
  });

  test("keeps content left and mounted while the Agent button toggles the resizable right rail", async () => {
    const onRightWidthChange = vi.fn();
    const mounted = await mountShell({
      desk: <StatefulDesk />, rightWidth: 360, onRightWidthChange,
      onLensChange: (lens) => mounted.update({ lens }),
    });
    try {
      const shell = mounted.host.container.querySelector(".instrument-shell")!;
      const desk = mounted.host.container.querySelector(".instrument-desk-column")!;
      const rail = mounted.host.container.querySelector(".instrument-right-rail")!;
      const content = desk.querySelector("button")!;
      await act(async () => { mounted.observer.resize(shell, 1200, 800); content.dispatchEvent(new Event("click", { bubbles: true })); });
      const agent = mounted.host.container.querySelector('[aria-label="Agent"]')!;
      expect(agent).not.toBeNull();
      expect(agent.textContent).toBe("");
      expect(agent.getAttribute("title")).toBe("Show agent");
      expect(agent.parentElement?.querySelector(".page-island-reserve")).not.toBeNull();
      expect(agent.getAttribute("aria-pressed")).toBe("false");
      await act(async () => agent.dispatchEvent(new Event("click", { bubbles: true })));
      expect(agent.getAttribute("aria-pressed")).toBe("true");
      expect(desk.style.width).toBeFalsy();
      expect(desk.getAttribute("class")).toContain("flex-1");
      expect(desk.getAttribute("class")).not.toContain("order-last");
      expect(rail.style.width).toBe("360px");
      expect(rail.getAttribute("class")).toContain("flex-none");
      expect(rail.getAttribute("hidden")).toBeNull();
      expect(mounted.host.container.querySelector(".resize-instrument-view")).toBeNull();
      const handle = mounted.host.container.querySelector(".resize-instrument-rail")!;
      expect(handle.parentNode).toBe(rail.parentNode);
      expect(handle.getAttribute("aria-valuemin")).toBe("292");
      expect(handle.getAttribute("aria-valuemax")).toBe("564");
      await act(async () => handle.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true }), { key: "ArrowLeft" })));
      expect(onRightWidthChange).toHaveBeenCalledWith(376);
      await act(async () => agent.dispatchEvent(new Event("click", { bubbles: true })));
      expect(rail.getAttribute("hidden")).toBe("");
      expect(desk.querySelector("button")).toBe(content);
      expect(content.textContent).toBe("second");
      await mounted.render({ lens: "chat", viewExpanded: true });
      expect(rail.getAttribute("hidden")).toBe("");
      expect(agent.getAttribute("aria-pressed")).toBe("false");
      await mounted.render({ lens: "chat", viewOpen: false });
      expect(desk.getAttribute("hidden")).toBe("");
      expect(rail.getAttribute("hidden")).toBeNull();
      expect(rail.style.width).toBeFalsy();
      expect(rail.getAttribute("class")).toContain("flex-1");
    } finally { await act(async () => mounted.root.unmount()); mounted.host.restore(); }
  });

  test("opens Agent as a right sheet below the content minimum and closes it with Escape", async () => {
    const mounted = await mountShell({
      onLensChange: (lens) => mounted.update({ lens }),
    });
    try {
      const shell = mounted.host.container.querySelector(".instrument-shell")!;
      const desk = mounted.host.container.querySelector(".instrument-desk-column")!;
      await act(async () => mounted.observer.resize(shell, 927, 720));
      const agent = mounted.host.container.querySelector('[aria-label="Agent"]')!;
      expect(agent).not.toBeNull();
      agent.focus();
      await act(async () => agent.dispatchEvent(new Event("click", { bubbles: true })));
      const sheet = mounted.host.container.ownerDocument.body.querySelector('[data-instrument-overlay="right-rail-sheet"]')!;
      expect(sheet.getAttribute("role")).toBe("dialog");
      expect(sheet.getAttribute("class")).toContain("right-2");
      expect(desk.getAttribute("hidden")).toBeNull();
      expect(sheet.querySelector(".instrument-chat-rail-content")).not.toBeNull();
      await act(async () => sheet.dispatchEvent(escape()));
      expect(shell.getAttribute("data-right-rail-mode")).toBe("closed");
      expect(agent.getAttribute("aria-pressed")).toBe("false");
      expect(mounted.host.container.ownerDocument.activeElement).toBe(agent);
    } finally { await act(async () => mounted.root.unmount()); mounted.host.restore(); }
  });

  test("opens the narrow rail as its registered modal sheet and restores the exact opener on Escape", async () => {
    let overlayOpen = false;
    const mounted = await mountShell({
      desk: REVIEW_DESK,
      rightOverlayOpen: overlayOpen,
      onRightOverlayOpenChange: (open) => { overlayOpen = open; mounted.update({ rightOverlayOpen: open }); },
    });
    try {
      const shell = mounted.host.container.querySelector(".instrument-shell")!;
      const desk = mounted.host.container.querySelector(".instrument-desk-scroll")!;
      await act(async () => {
        mounted.observer.resize(shell, 1_100, 720);
        mounted.observer.resize(desk, 860, 672);
        await settle();
      });
      const opener = mounted.host.container.querySelector("[data-rail-mode]") as HTMLButtonElement;
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
    } finally { await act(async () => mounted.root.unmount()); mounted.host.restore(); }
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
    } finally { await act(async () => mounted.root.unmount()); mounted.host.restore(); }
  });

  test("resizes the docked rail up to 1000px and clamps it against the desk minimum", async () => {
    const onRightWidthChange = vi.fn();
    const mounted = await mountShell({ desk: REVIEW_DESK, onRightWidthChange });
    try {
      const shell = mounted.host.container.querySelector(".instrument-shell")!;
      const desk = mounted.host.container.querySelector(".instrument-desk-scroll")!;
      const rail = () => mounted.host.container.querySelector(".instrument-right-rail") as HTMLElement;
      const handle = () => mounted.host.container.querySelector(".resize-instrument-rail")!;
      await act(async () => {
        mounted.observer.resize(shell, 2_560, 900);
        mounted.observer.resize(desk, 2_020, 800);
        await settle();
      });
      expect(shell.getAttribute("data-right-rail-mode")).toBe("docked");
      expect(rail().style.width).toBe("292px");
      await mounted.render({ rightWidth: 1_000 });
      expect(rail().style.width).toBe("1000px");
      expect(handle().getAttribute("aria-valuemax")).toBe("1000");
      await mounted.render({ rightWidth: 4_000 });
      expect(rail().style.width).toBe("1000px");

      // On a narrow frame the desk minimum wins, so a wide rail cannot squeeze it out.
      await act(async () => {
        mounted.observer.resize(shell, 1_400, 900);
        await settle();
      });
      expect(rail().style.width).toBe("480px");
      expect(handle().getAttribute("aria-valuemax")).toBe("480");
      expect(onRightWidthChange).not.toHaveBeenCalled();
    } finally { await act(async () => mounted.root.unmount()); mounted.host.restore(); }
  });

  test("sizes the sidebar column from its own width and clamps it to the sidebar bounds", async () => {
    const mounted = await mountShell();
    try {
      const shell = mounted.host.container.querySelector(".instrument-shell")!;
      const handle = () => mounted.host.container.querySelector(".resize-instrument-sidebar")!;
      const leftColumn = () => (shell.style as unknown as Record<string, string>)["--instrument-left-width"];
      expect(leftColumn()).toBe("240px");
      expect(handle().getAttribute("aria-valuenow")).toBe("240");
      await mounted.render({ leftWidth: 360 });
      expect(leftColumn()).toBe("360px");
      await mounted.render({ leftWidth: 4_000 });
      expect(leftColumn()).toBe("420px");
      await mounted.render({ leftWidth: 10 });
      expect(leftColumn()).toBe("216px");

      // A hidden sidebar contributes no track, but its remembered width is still the handle's.
      await mounted.render({ leftWidth: 320, leftVisible: false });
      expect(leftColumn()).toBe("0px");
      expect(mounted.host.container.querySelector(".resize-instrument-sidebar")).toBeNull();
    } finally { await act(async () => mounted.root.unmount()); mounted.host.restore(); }
  });

  test("keeps one chat DOM subtree, draft, and focus while the rail reparents", async () => {
    let overlayOpen = true;
    const mounted = await mountShell({
      chat: <StatefulChat />, lens: "chat",
      rightOverlayOpen: overlayOpen,
      onRightOverlayOpenChange: (open) => { overlayOpen = open; mounted.update({ rightOverlayOpen: open }); },
    });
    try {
      const shell = mounted.host.container.querySelector(".instrument-shell")!;
      const desk = mounted.host.container.querySelector(".instrument-desk-scroll")!;
      await act(async () => {
        mounted.observer.resize(shell, 900, 720);
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
        mounted.observer.resize(shell, 900, 720);
        mounted.observer.resize(desk, 860, 672);
        await settle();
      });
      expect(mounted.host.container.ownerDocument.body.querySelector("textarea")).toBe(draft);
      expect((draft as HostNode & { value: string }).value).toBe("Keep this exact draft");
    } finally { await act(async () => mounted.root.unmount()); mounted.host.restore(); }
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
    } finally { await act(async () => mounted.root.unmount()); mounted.host.restore(); }
  });

  test("Agent takes the rail from an inspector and reopening the inspector returns its controls", async () => {
    function Inspector() {
      const rail = useInstrumentRightRail();
      return <main><button type="button" onClick={(event) => rail.open(event.currentTarget)}>Inspect artifact</button><InstrumentRightRailPortal owner="shared-inspector" label="Shared item"><button type="button">Artifact details</button></InstrumentRightRailPortal></main>;
    }
    let lens: "desk" | "chat" = "desk", rightOverlayOpen = false;
    const mounted = await mountShell({ desk: <Inspector />,
      onLensChange: (next) => { lens = next; mounted.update({ lens, rightOverlayOpen }); },
      onRightOverlayOpenChange: (open) => { rightOverlayOpen = open; mounted.update({ lens, rightOverlayOpen }); },
    });
    try {
      const shell = mounted.host.container.querySelector(".instrument-shell")!;
      const desk = mounted.host.container.querySelector(".instrument-desk-scroll")!;
      await act(async () => { mounted.observer.resize(shell, 1440, 900); mounted.observer.resize(desk, 1200, 852); });
      const rail = mounted.host.container.querySelector(".instrument-right-rail")!;
      expect(rail.textContent).toContain("Artifact details");
      const agent = mounted.host.container.querySelector('[aria-label="Agent"]')!;
      await act(async () => agent.dispatchEvent(new Event("click", { bubbles: true })));
      expect(agent.getAttribute("aria-pressed")).toBe("true");
      expect(rail.textContent).not.toContain("Artifact details");
      expect(rail.querySelector(".instrument-chat-rail-content")?.getAttribute("hidden")).toBeNull();
      await act(async () => desk.querySelector("button")!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(rail.textContent).toContain("Artifact details");
      expect(agent.getAttribute("aria-pressed")).toBe("false");
      await mounted.render({ lens: "chat", agentRequest: 1 });
      expect(agent.getAttribute("aria-pressed")).toBe("true");
      await mounted.render({ lens: "desk", rightRailEnabled: false });
      expect(shell.getAttribute("data-right-rail-mode")).toBe("closed");
      rightOverlayOpen = true;
      await mounted.render({ lens: "chat", rightOverlayOpen });
      await act(async () => desk.querySelector("button")!.dispatchEvent(new Event("click", { bubbles: true })));
      await act(async () => mounted.observer.resize(shell, 927, 720));
      const sheet = mounted.host.container.ownerDocument.body.querySelector('[data-instrument-overlay="right-rail-sheet"]')!;
      await act(async () => sheet.dispatchEvent(escape()));
      expect(shell.getAttribute("data-right-rail-mode")).toBe("closed");
      expect(rightOverlayOpen).toBe(false);
    } finally { await act(async () => mounted.root.unmount()); mounted.host.restore(); }
  });

  test("clears transient overlay state when the same rail becomes dock-eligible", async () => {
    const onRightOverlayOpenChange = vi.fn();
    const mounted = await mountShell({ desk: REVIEW_DESK, rightOverlayOpen: true, onRightOverlayOpenChange });
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
    } finally { await act(async () => mounted.root.unmount()); mounted.host.restore(); }
  });
});
