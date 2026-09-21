import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { bridge, type CatalogResult, type MarketplacePublicItemDto } from "@/shared/api/ipc";
import { MarketplaceScreenView, presentMarketplaceSources, projectMarketplacePublicItem, type MarketplaceLocation, type MarketplaceQueryState } from "@/pages/marketplace";
import { createReactHost } from "./react-host";

test("Explore prepares an agent reference without sending and keeps the active workspace during tag navigation", async () => {
  const entry: MarketplacePublicItemDto = {
    id: "radio-voice", category: "recipe", name: "Radio voice", summary: "Give a recording a vintage radio texture.", tags: ["horror", "voice"], referenceUrls: [],
    recipe: { kind: "ffmpeg", body: "Apply to the selected recording.", artifact: "highpass=f=300,lowpass=f=3000", parameters: { intensity: 0.5 }, demo: null },
  };
  const item = projectMarketplacePublicItem(entry, "live");
  const query: MarketplaceQueryState = { text: "radio", filters: { category: "recipes", source: "ralphy", license: "all", compatibility: "all", modality: "all", format: "all" }, sort: "relevance" };
  const location: MarketplaceLocation = { route: { kind: "detail", itemId: item.key }, query, selectedItemId: item.key, scrollTop: 120, focusId: null };
  const snapshot = presentMarketplaceSources(
    { schemaVersion: 1, source: "live", refreshedAt: "2026-09-18T10:00:00Z", sourceUpdatedAt: null, warning: null, items: [entry] },
    null, query, [], { publicLibrary: "ready", models: "unavailable" }, null,
    { schemaVersion: 1, selectedWorkspaceId: "other", installs: [], warning: null },
  );
  const catalog: CatalogResult = {
    rootPath: "/library", generation: 1, projects: [], mediaItemCount: 0, completedAt: "2026-09-18",
    workspaces: ["Active", "Other"].map((name) => ({ id: name.toLowerCase(), name, description: "", absolutePath: `/library/${name}`, projectCount: 0, sharedCount: 0, unitCount: 0, finalCount: 0, recentActivity: "2026-09-18" })),
  };
  const request = vi.fn();
  const navigate = vi.fn();
  const mutate = vi.fn();
  const send = vi.spyOn(bridge, "sendAgentMessage");
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const render = (nextLocation = location) => root.render(<MarketplaceScreenView
    catalog={catalog} workRoute={{ kind: "workspace", workspaceId: "active" }} location={nextLocation}
    sidebarVisible snapshot={snapshot} onBack={vi.fn()} onNavigate={navigate} onRememberLocation={vi.fn()}
    onRequestAgent={request} onRetry={vi.fn()} onInstallAction={mutate}
  />);
  const button = (label: string) => host.container.querySelectorAll("button").find((node) => node.textContent === label)!;
  const workspace = () => host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === "Workspace for saved items");
  try {
    await act(async () => render());
    expect(workspace()?.textContent).toContain("Active");
    await act(async () => button("Use in chat").dispatchEvent(new Event("click", { bubbles: true })));
    expect(request).toHaveBeenCalledOnce();
    const draft = request.mock.calls[0]![0];
    expect(draft.prompt).toBe("Use “Radio voice” in my content.");
    expect(draft.attachment).toMatchObject({ kind: "library", ref: item.key, label: "Radio voice" });
    expect(JSON.parse(draft.attachment.instructions.split("\n\n").at(-1))).toMatchObject({ key: item.key, category: "recipes", tags: expect.arrayContaining(["horror", "voice"]), source: { id: entry.id, category: entry.category } });
    expect(send).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();

    await act(async () => button("horror").dispatchEvent(new Event("click", { bubbles: true })));
    expect(navigate).toHaveBeenCalledOnce();
    const next = navigate.mock.calls[0]![0] as MarketplaceLocation;
    expect(next).toMatchObject({ route: { kind: "results" }, selectedItemId: null, scrollTop: 0, focusId: "marketplace-heading", query: { text: "", filters: { category: "all", source: "all", tag: "horror" } } });
    await act(async () => render(next));
    expect(workspace()?.textContent).toContain("Active");
    expect(request).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();

    const clearTag = host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === "Remove filter: #horror")!;
    await act(async () => clearTag.dispatchEvent(new Event("click", { bubbles: true })));
    const discover = navigate.mock.calls.at(-1)![0] as MarketplaceLocation;
    expect(discover).toMatchObject({ route: { kind: "discover" }, query: { text: "", filters: { category: "all", source: "all" } } });
    expect(discover.query.filters.tag).toBeUndefined();
    await act(async () => render(discover));
    await act(async () => host.container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(navigate.mock.calls.at(-1)![0].route).toEqual({ kind: "discover" });

    for (const filteredQuery of [{ ...discover.query, text: "radio" }, { ...discover.query, filters: { ...discover.query.filters, category: "models" as const } }]) {
      await act(async () => render({ ...discover, query: filteredQuery }));
      await act(async () => host.container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      expect(navigate.mock.calls.at(-1)![0]).toMatchObject({ route: { kind: "results" }, query: filteredQuery });
    }
    expect(workspace()?.textContent).toContain("Active");
    expect(send).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); }
});
