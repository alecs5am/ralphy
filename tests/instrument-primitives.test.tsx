import { act } from "react";
import { RefreshCw } from "lucide-react";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import {
  DitherIdentity,
  InstrumentCounter,
  InstrumentEmptyState,
  InstrumentIconButton,
  InstrumentPill,
  InstrumentScreenHeader,
  InstrumentWidget,
  StatusDot,
} from "../src/instrument/primitives";
import { INSTRUMENT_PALETTE, contrastRatio } from "../src/instrument/palette";
import { createReactHost } from "./react-host";

async function mount(children: React.ReactNode) {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  await act(async () => root.render(children));
  return { host, root };
}

describe("instrument primitives", () => {
  test("keeps an icon-only action discoverable to assistive technology", async () => {
    const mounted = await mount(<InstrumentIconButton label="Refresh"><RefreshCw /></InstrumentIconButton>);
    try {
      const button = mounted.host.container.querySelector("button");
      expect(button?.getAttribute("aria-label")).toBe("Refresh");
      expect(button?.getAttribute("title")).toBe("Refresh");
      expect(button?.getAttribute("type")).toBe("button");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("renders unavailable reasons and textual status alongside the dot", async () => {
    const mounted = await mount(<>
      <InstrumentEmptyState title="Unavailable" reason="No contract" />
      <StatusDot label="Needs work" tone="attention" />
    </>);
    try {
      expect(mounted.host.container.textContent).toContain("No contract");
      expect(mounted.host.container.textContent).toContain("Needs work");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("keeps shared widget, pill, counter, header, and dither identity semantic", async () => {
    const mounted = await mount(<InstrumentWidget aria-label="Workspace summary">
      <InstrumentScreenHeader eyebrow="Workspace" title="UX Testing Lab" description="Test workspace" />
      <InstrumentPill>Ready</InstrumentPill>
      <InstrumentCounter label="Projects" value={4} />
      <DitherIdentity name="UX Testing Lab" />
    </InstrumentWidget>);
    try {
      const section = mounted.host.container.querySelector("section");
      expect(section?.getAttribute("aria-label")).toBe("Workspace summary");
      expect(mounted.host.container.textContent).toContain("UX Testing Lab");
      expect(mounted.host.container.textContent).toContain("Projects");
      expect(mounted.host.container.querySelector("img")?.getAttribute("src")).toBe("./assets/dither/g4.png");
      expect(mounted.host.container.querySelector("section")?.getAttribute("data-instrument-root")).toBe("instrument-widget");
      expect(mounted.host.container.querySelector("header")?.getAttribute("data-instrument-root")).toBe("instrument-screen-header");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("allows an icon action to opt into a submit button", async () => {
    const mounted = await mount(<InstrumentIconButton label="Save" type="submit"><RefreshCw /></InstrumentIconButton>);
    try {
      expect(mounted.host.container.querySelector("button")?.getAttribute("type")).toBe("submit");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("uses an accessible Doto counter and surface-correct focus indicators", () => {
    const styles = readFileSync("src/styles/instrument.css", "utf8");
    expect(styles).toMatch(/\.instrument-counter output\s*\{[^}]*font-family:\s*var\(--font-doto\)[^}]*font-size:\s*max\(13px, 1em\)[^}]*font-weight:\s*800/s);
    expect(styles).toContain('html[data-theme="light"] .instrument-icon-button:focus-visible');
    expect(styles).toContain('html[data-theme="dark"] .instrument-icon-button:focus-visible');
    expect(styles.match(/\.instrument-icon-button:focus-visible,[^}]+\}/)?.[0]).toContain("outline: var(--control-focus)");
    expect(contrastRatio(INSTRUMENT_PALETTE.light.focusOnLight, INSTRUMENT_PALETTE.light.widgetLight)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(INSTRUMENT_PALETTE.dark.focusOnDark, INSTRUMENT_PALETTE.dark.widgetLight)).toBeGreaterThanOrEqual(3);
  });
});
