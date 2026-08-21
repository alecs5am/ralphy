import { act, useLayoutEffect } from "react";
import { describe, expect, test } from "vitest";

import { InstrumentShell, useInstrumentScroll } from "../src/instrument/InstrumentShell";
import { createReactHost } from "./react-host";

let currentScroll: ReturnType<typeof useInstrumentScroll> | null = null;

function ScrollConsumer({ routeKey }: { routeKey: string }) {
  currentScroll = useInstrumentScroll();
  useLayoutEffect(() => {
    if (currentScroll?.element) Object.defineProperty(currentScroll.element, "scrollHeight", { configurable: true, value: routeKey === "workspace:a" ? 1_200 : 600 });
    currentScroll?.element?.scrollTo({ top: 0 });
  }, [routeKey]);
  return <button type="button">Focusable selection</button>;
}

function props(routeScrollKey: string) {
  return {
    sidebar: null,
    desk: <ScrollConsumer routeKey={routeScrollKey} />,
    chat: null,
    island: null,
    profile: null,
    routeScrollKey,
    leftVisible: false,
    rightPreference: false,
    rightOverlayOpen: false,
    onToggleLeft: () => undefined,
    onToggleRightPreference: () => undefined,
    onRightOverlayOpenChange: () => undefined,
  };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("instrument scroll context", () => {
  test("exposes one measured external scroll owner and restores each route offset", async () => {
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => {
        root.render(<InstrumentShell {...props("workspace:a")} />);
        await settle();
      });
      const desk = host.container.querySelector("[data-instrument-scroll-owner=\"instrument-desk-scroll\"]")!;
      expect(host.container.querySelectorAll("[data-instrument-scroll-owner]")).toHaveLength(1);
      expect(currentScroll?.element).toBe(desk);
      expect(currentScroll).toMatchObject({ width: 800, height: 600, routeScrollKey: "workspace:a" });

      currentScroll?.scrollToOffset(500);
      expect(currentScroll?.capture()).toEqual({ key: "workspace:a", offset: 500 });
      await act(async () => {
        root.render(<InstrumentShell {...props("workspace:b")} />);
        await settle();
      });
      expect(desk.scrollTop).toBe(0);
      currentScroll?.restore({ key: "workspace:b", offset: 41 });
      expect(desk.scrollTop).toBe(41);

      await act(async () => {
        root.render(<InstrumentShell {...props("workspace:a")} />);
        await settle();
      });
      expect(desk.scrollTop).toBe(500);
      expect(currentScroll?.routeScrollKey).toBe("workspace:a");
    } finally {
      currentScroll = null;
      await act(async () => root.unmount());
      host.restore();
    }
  });
});
