import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { WorkspaceAccountHealth, WorkspaceEngagement } from "../src/pages/workspace/ui/WorkspaceEngagement";
import type { AccountPresentation } from "../src/pages/workspace/lib/overview-presentation";
import { AccessibleTrendChart } from "../src/pages/workspace/ui/WorkspacePerformance";
import { act } from "react";
import { createReactHost } from "./react-host";

test("engagement uses reported totals and does not derive a rate from incomplete data", () => {
  const totals = { publications: 4, views: 1000, likes: 80, comments: 10, shares: 10, watchTimeMs: null };
  const complete = renderToStaticMarkup(<WorkspaceEngagement totals={totals} />);
  expect(complete).toContain("10.0%");
  expect(complete).toContain('width="12.5"');
  expect(complete).toContain("rounded-window");
  const partial = renderToStaticMarkup(<WorkspaceEngagement totals={{ ...totals, comments: null }} />);
  expect(partial).toContain("Unavailable");
  expect(partial).not.toContain("9.0%");
});

test("the account indicators count credentials and relink state", () => {
  const accounts = [{ credentialConfigured: true, relinkRequired: false }, { credentialConfigured: true, relinkRequired: true }, { credentialConfigured: false, relinkRequired: false }] as AccountPresentation[];
  const markup = renderToStaticMarkup(<WorkspaceAccountHealth accounts={accounts} />);
  expect(markup).toContain('aria-label="1 of 3 accounts connected"');
  expect(markup.match(/data-connected="true"/g)).toHaveLength(1);
  expect(markup.match(/data-connected="false"/g)).toHaveLength(2);
});

test("the matrix chart preserves zero, a shared scale and exact values", () => {
  const markup = renderToStaticMarkup(<AccessibleTrendChart value={[{ label: "Mon", value: 0 }, { label: "Tue", value: 80 }, { label: "Wed", value: 100 }]} />);
  expect(markup).toContain('data-value="0" height="0"');
  expect(markup).toContain('data-value="80" height="96"');
  expect(markup).toContain('data-value="100" height="120"');
  expect(markup).toContain('aria-label="Tue: 80 views"');
  expect(markup).toContain("Workspace performance trend values");
  const empty = renderToStaticMarkup(<AccessibleTrendChart value={[]} />);
  expect(empty).toContain("No trend samples");
  expect(empty).not.toContain("NaN");
  const zero = renderToStaticMarkup(<AccessibleTrendChart value={[{ label: "Mon", value: 0 }]} />);
  expect(zero).toContain("MAX 0");
});

test("period selection updates the readout and survives a shorter refreshed series", async () => {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  try {
    await act(async () => root.render(<AccessibleTrendChart value={[{ label: "Mon", value: 0 }, { label: "Tue", value: 80 }]} />));
    const periods = host.container.querySelectorAll("button");
    expect(periods[1]?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => periods[0]!.dispatchEvent(new Event("click", { bubbles: true })));
    expect(periods[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(host.container.querySelector("[aria-live=polite]")?.textContent).toBe("0");
    await act(async () => periods[1]!.dispatchEvent(new Event("click", { bubbles: true })));
    await act(async () => root.render(<AccessibleTrendChart value={[{ label: "Wed", value: 20 }]} />));
    expect(host.container.querySelector("[aria-live=polite]")?.textContent).toBe("20");
  } finally { await act(async () => root.unmount()); host.restore(); }
});

test("missing engagement data renders one compact status without empty bars", () => {
  const markup = renderToStaticMarkup(<WorkspaceEngagement totals={{ publications: null, views: null, likes: null, comments: null, shares: null, watchTimeMs: null }} />);
  expect(markup).toContain("Engagement unavailable");
  expect(markup).toContain('role="status"');
  expect(markup).not.toContain("<svg");
  expect(markup).not.toContain("Interactions / views");
});
