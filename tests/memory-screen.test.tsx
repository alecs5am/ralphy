import { act } from "react";
import { describe, expect, test, vi } from "vitest";
import type { MemoryDetailDto } from "../electron/ralphy/types";
import { bridge } from "@/shared/api/ipc";
import { MemoryScreen } from "@/pages/memory/ui/MemoryScreen";
import { createReactHost } from "./react-host";

const entry: MemoryDetailDto = {
  id: "mentry_1", revisionId: "mrev_1", slug: "voice", version: 1, revisionNo: 1,
  tier: "workspace", workspace: "ux-testing-lab", status: "active", name: "Voice",
  description: "Use plain language.", type: "style", filed: "2026-08-18", source: "Desktop",
  body: {
    rule: "Use plain language.", why: "Readers should understand it once.",
    howToApply: ["Prefer concrete verbs."], doesNotApplyTo: ["Verbatim customer quotes."],
  },
  rawBody: "## Rule\nUse plain language.", qualityFlags: [], overridesGlobal: false,
};

function button(host: HTMLElement, name: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((item) => item.textContent?.trim().includes(name));
  if (!found) throw new Error(`Missing button: ${name}`);
  return found;
}

function click(target: HTMLButtonElement): void {
  target.dispatchEvent(new Event("click", { bubbles: true }));
}

describe("Memory screen", () => {
  test("clears a selected marker when filters hide the expanded memory", async () => {
    const craft = { ...entry, id: "mentry_3", revisionId: "mrev_3", type: "craft" as const, name: "Craft", body: { ...entry.body, rule: "Keep the cut concise." } };
    vi.spyOn(bridge, "loadMemory").mockImplementation(async (_workspaceId, input) => ({
      items: input?.status === "proposed" ? [] : [entry, craft],
    }));
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);

    try {
      await act(async () => {
        root.render(<MemoryScreen workspaceId="ws_ux" workspaceName="UX Testing Lab" />);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(host.container.querySelector('[data-instrument-state="selected"]')).toBeTruthy();

      await act(async () => click(button(host.container, "Craft 1")));

      expect(host.container.querySelector('[data-instrument-state="ready"]')).toBeTruthy();
      expect(host.container.querySelector('[aria-expanded="true"]')).toBeNull();
      expect(host.container.textContent).toContain("Keep the cut concise.");
    } finally {
      await act(async () => root.unmount());
      host.restore();
      vi.restoreAllMocks();
    }
  });

  test("matches the handoff filter controls and opens the first active rule", async () => {
    const craft = { ...entry, id: "mentry_3", revisionId: "mrev_3", type: "craft" as const, name: "Craft", body: { ...entry.body, rule: "Keep the cut concise." } };
    vi.spyOn(bridge, "loadMemory").mockImplementation(async (_workspaceId, input) => ({
      items: input?.status === "proposed" ? [] : [entry, craft],
    }));
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);

    try {
      await act(async () => {
        root.render(<MemoryScreen workspaceId="ws_ux" workspaceName="UX Testing Lab" />);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(button(host.container, "All 2")).toBeTruthy();
      expect(button(host.container, "Style 1")).toBeTruthy();
      expect(button(host.container, "Use plain language").getAttribute("aria-expanded")).toBe("true");

      await act(async () => click(button(host.container, "Style 1")));
      expect(host.container.textContent).not.toContain("Keep the cut concise.");
      expect(button(host.container, "Clear filters")).toBeTruthy();

      await act(async () => click(button(host.container, "Clear filters")));
      expect(host.container.textContent).toContain("Keep the cut concise.");
      expect([...host.container.querySelectorAll("button")].some((item) => item.textContent?.includes("Clear filters"))).toBe(false);
    } finally {
      await act(async () => root.unmount());
      host.restore();
      vi.restoreAllMocks();
    }
  });

  test("renders the rulebook, accordion, review mode, and recall drawer", async () => {
    const load = vi.spyOn(bridge, "loadMemory").mockImplementation(async (_workspaceId, input) => ({
      items: input?.status === "proposed" ? [{ ...entry, id: "mentry_2", revisionId: "mrev_2", status: "proposed", body: { ...entry.body, rule: "Proposed voice rule." } }] : [entry],
    }));
    const recallMemory = vi.spyOn(bridge, "recallMemory").mockResolvedValue({
      workspace: "ws_ux", workspaceId: "ws_ux", count: 1, workspaceCount: 1, globalCount: 0,
      overriddenGlobalSlugs: [], truncated: false, note: "Background reference only.", entries: [entry],
    });
    vi.spyOn(bridge, "loadMemoryHealth").mockResolvedValue({ scanned: 1, findings: [] });
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);

    try {
      await act(async () => {
        root.render(<MemoryScreen workspaceId="ws_ux" workspaceName="UX Testing Lab" />);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(host.container.textContent).toContain("Durable context agents reuse across future work");
      expect(host.container.textContent).toContain("Use plain language.");

      expect(host.container.textContent).toContain("Readers should understand it once.");
      expect(button(host.container, "Use plain language").getAttribute("aria-expanded")).toBe("true");

      await act(async () => {
        click(button(host.container, "Preview agent context"));
        await Promise.resolve();
      });
      expect(recallMemory).toHaveBeenCalledWith("ws_ux");
      expect(document.body.textContent).toContain("Agent context preview");
      expect(document.body.textContent).toContain("Background reference only.");

      await act(async () => click(button(host.container, "Review now")));
      expect(host.container.textContent).toContain("Proposed voice rule.");
      expect(load).toHaveBeenCalledWith("ws_ux", expect.objectContaining({ status: "proposed" }));
    } finally {
      await act(async () => root.unmount());
      host.restore();
      vi.restoreAllMocks();
    }
  });

  test("requires confirmation before approving a proposal", async () => {
    vi.spyOn(bridge, "loadMemory").mockImplementation(async (_workspaceId, input) => ({
      items: input?.status === "proposed" ? [{ ...entry, status: "proposed" }] : [],
    }));
    const mutate = vi.spyOn(bridge, "mutateMemory").mockResolvedValue();
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);

    try {
      await act(async () => {
        root.render(<MemoryScreen workspaceId="ws_ux" workspaceName="UX Testing Lab" />);
        await Promise.resolve();
      });
      await act(async () => click(button(host.container, "Review now")));
      await act(async () => click(button(host.container, "Use plain language")));
      await act(async () => click(button(host.container, "Approve")));
      expect(mutate).not.toHaveBeenCalled();

      // The modal is portalled to the document body now, the same as every other one in the app.
      const modal = document.body.querySelector<HTMLElement>(".memory-modal");
      expect(modal?.textContent).toContain("Approve memory?");
      await act(async () => click(button(modal!, "Approve")));
      expect(mutate).toHaveBeenCalledWith("ws_ux", {
        action: "approve",
        memoryEntryId: entry.id,
        expectedRevisionId: entry.revisionId,
      });
    } finally {
      await act(async () => root.unmount());
      host.restore();
      vi.restoreAllMocks();
    }
  });
});
