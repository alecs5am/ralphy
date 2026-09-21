import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";

import { useAppCommands } from "@/app/model/use-app-commands";
import type { SettingsContext } from "@/pages/settings/model/context";
import { KeyboardPage } from "@/pages/settings/ui/pages-keyboard";
import { bridge } from "@/shared/api/ipc";
import { createReactHost } from "./react-host";

test("records native Cmd+R in Settings before global handling, then resumes the agent shortcut", async () => {
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const toggleAgent = vi.fn();
  const setBindings = vi.fn();
  const noop = () => undefined;
  let nativeShortcut: (() => void) | undefined;
  vi.spyOn(bridge, "onToggleRightPanel").mockImplementation((callback) => {
    nativeShortcut = callback;
    return () => { nativeShortcut = undefined; };
  });
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.stubGlobal("KeyboardEvent", class extends Event {
    key: string;
    metaKey: boolean;
    ctrlKey = false;
    altKey = false;
    shiftKey = false;
    repeat = false;
    constructor(type: string, init: KeyboardEventInit) {
      super(type, init);
      this.key = init.key ?? "";
      this.metaKey = !!init.metaKey;
    }
  });
  // Only restore the browser's bubbling here: the host's document and window are EventTargets.
  const dispatchDocument = document.dispatchEvent.bind(document);
  vi.spyOn(document, "dispatchEvent").mockImplementation((event) => {
    dispatchDocument(event);
    if (event.bubbles && !event.cancelBubble) window.dispatchEvent(event);
    return !event.defaultPrevented;
  });
  function SettingsWithCommands() {
    useAppCommands({
      settingsVisible: true, setSettingsVisible: noop, mode: "work", route: { kind: "library" },
      workspaces: [], navigateBack: noop, navigateForward: noop, openWorkspace: noop,
      clearOverviewNavigation: noop, setWorkspacePage: noop, setSidebarSearchRequest: noop,
      setSidebarVisible: noop, setLens: noop, toggleAgent, onNewChat: noop, switchAppMode: noop,
    });
    return <KeyboardPage ctx={{ bindings: {}, setBindings, goTo: noop } as unknown as SettingsContext} />;
  }
  try {
    await act(async () => root.render(<SettingsWithCommands />));
    const record = host.container.querySelectorAll("button")
      .find((button) => button.getAttribute("aria-label") === "Record a shortcut for Toggle agent")!;
    await act(async () => record.dispatchEvent(new Event("click", { bubbles: true })));
    expect(host.container.textContent).toContain("PRESS A SHORTCUT");

    const focusedInput = host.container.querySelector("input")!;
    focusedInput.focus();
    const dispatchInput = focusedInput.dispatchEvent.bind(focusedInput);
    vi.spyOn(focusedInput, "dispatchEvent").mockImplementation((event) => {
      dispatchInput(event);
      if (event.bubbles && !event.cancelBubble) document.dispatchEvent(event);
      return !event.defaultPrevented;
    });
    expect(nativeShortcut).toBeTypeOf("function");
    await act(async () => nativeShortcut!());
    expect(host.container.textContent).toContain("CAPTURED");
    expect(toggleAgent).not.toHaveBeenCalled();
    const save = host.container.querySelectorAll("button").find((button) => button.textContent === "Save")!;
    expect(save.disabled).toBe(false);
    await act(async () => save.dispatchEvent(new Event("click", { bubbles: true })));
    expect(setBindings).toHaveBeenCalledWith({
      "app.agent": { meta: true, ctrl: false, alt: false, shift: false, key: "r" },
    });

    await act(async () => nativeShortcut!());
    expect(toggleAgent).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    host.restore();
  }
});
