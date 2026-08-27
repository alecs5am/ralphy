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
} from "@/shared/instrument/primitives";
import { INSTRUMENT_PALETTE, contrastRatio } from "@/shared/instrument/palette";
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
    const source = readFileSync("src/shared/instrument/primitives.tsx", "utf8");
    const theme = readFileSync("src/app/styles/theme/shell.css", "utf8");
    // The counter is a Doto figure that never drops below the base step but follows its context
    // when that is larger, so the mark stays readable inside small copy. The measure is a role
    // key, not a literal in markup.
    expect(source).toMatch(/<output className="font-display type-counter font-extrabold text-ink"/);
    expect(theme).toMatch(/--type-counter:\s*max\(var\(--text-base\), 1em\)/);
    // One ring replaces the three theme-scoped outline rules the icon button used to carry:
    // `--color-ink` is the theme's own ink, which is #141414 on the light theme's sunken widget
    // and #F2F2F0 on the dark theme's, so a single utility is correct in both.
    expect(source).toContain("focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink");
    expect(source).not.toMatch(/data-theme/);
    expect(contrastRatio(INSTRUMENT_PALETTE.light.textPrimary, INSTRUMENT_PALETTE.light.widgetLightSunken)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(INSTRUMENT_PALETTE.dark.textPrimary, INSTRUMENT_PALETTE.dark.widgetLightSunken)).toBeGreaterThanOrEqual(3);
    // Surface and ink are stated as a pair everywhere in this file: a shared base that carried
    // only one half is what made a caller's override paint invisible text.
    const plate = /const PLATE = "([^"]*)"/.exec(source)?.[1] ?? "";
    expect(plate.split(" ")).toContain("bg-surface");
    expect(plate.split(" ")).toContain("text-ink");
    expect(plate.split(" ")).toContain("rounded-cell");
    expect(source).toMatch(/bg-surface-sunken px-2 text-muted/);
    // No borders, no shadows, no gradients anywhere in this vocabulary.
    expect(source).not.toMatch(/\b(?:border|shadow|bg-gradient|bg-linear|bg-radial)-/);
  });
});
