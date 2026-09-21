import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { MarketplaceMyLibrary, MarketplaceScreenView, presentMarketplaceSources, projectMarketplacePackItem, type MarketplaceLocation, type MarketplaceQueryState } from "@/pages/marketplace";
import { MarketplacePackItemDetail } from "../src/pages/marketplace/ui/MarketplacePackItemDetail";
import { bridge } from "@/shared/api/ipc";
import { createReactHost } from "./react-host";

const entry = { id: "skill:editor", category: "skill" as const, slug: "editor", title: "Editor", summary: "Render craft", path: ".agents/skills/editor/SKILL.md", tags: [] };
vi.mock("@/shared/ui/SelectMenu", () => ({ SelectMenu: ({ ariaLabel, options, onValueChange }: { ariaLabel: string; options: { value: string; label: string }[]; onValueChange(value: string): void }) => <div aria-label={ariaLabel}>{options.map((option) => <button type="button" key={option.value} onClick={() => onValueChange(option.value)}>{option.label}</button>)}</div> }));
afterEach(() => vi.restoreAllMocks());

test("Explore saves to the active workspace, honors an explicit target, and follows the next workspace", async () => {
  const host = createReactHost();
  const root = createRoot(host.container);
  const query: MarketplaceQueryState = { text: "", filters: { category: "all", source: "all", license: "all", compatibility: "all", modality: "all", format: "all" }, sort: "relevance" };
  const location: MarketplaceLocation = { route: { kind: "detail", itemId: `pack:${entry.id}` }, query, scrollTop: 0, focusId: null, selectedItemId: null };
  const catalog = { rootPath: "/library", generation: 1, projects: [], mediaItemCount: 0, completedAt: "2026-09-17", workspaces: ["Current", "Other", "Next"].map((name) => ({ id: name.toLowerCase(), name, description: "", absolutePath: `/library/${name}`, projectCount: 0, sharedCount: 0, unitCount: 0, finalCount: 0, recentActivity: "2026-09-17" })) };
  const snapshot = presentMarketplaceSources(null, null, query, [], { publicLibrary: "unavailable", models: "unavailable" }, { schemaVersion: 1, cliVersion: "0.3.0", entries: [entry], unavailable: null }, { schemaVersion: 1, selectedWorkspaceId: "other", installs: [{ entryId: entry.id, workspaceId: "other", installedAt: 1, enabled: true }], warning: null });
  vi.spyOn(bridge, "loadMarketplacePackDocument").mockResolvedValue({ id: entry.id, path: entry.path, markdown: "# Editor", truncated: false });
  const mutate = vi.fn();
  const render = (workspaceId: string, nextLocation = location) => root.render(<MarketplaceScreenView catalog={catalog} workRoute={{ kind: "workspace", workspaceId }} location={nextLocation} sidebarVisible={false} snapshot={snapshot} onBack={vi.fn()} onNavigate={vi.fn()} onRememberLocation={vi.fn()} onRetry={vi.fn()} onInstallAction={mutate} />);
  const button = (label: string) => host.container.querySelectorAll("button").find((node) => node.textContent === label)!;
  try {
    await act(async () => render("current"));
    expect(host.container.textContent).toContain("Save a reference for “Current”");
    await act(async () => button("Save to workspace").dispatchEvent(new Event("click", { bubbles: true })));
    expect(mutate).toHaveBeenLastCalledWith({ action: "install", workspaceId: "current", entryId: entry.id });
    await act(async () => button("Filters").dispatchEvent(new Event("click", { bubbles: true })));
    await act(async () => button("Other").dispatchEvent(new Event("click", { bubbles: true })));
    expect(host.container.textContent).toContain("Saved for “Other”");
    await act(async () => button("Remove from saved").dispatchEvent(new Event("click", { bubbles: true })));
    expect(mutate).toHaveBeenLastCalledWith({ action: "uninstall", workspaceId: "other", entryId: entry.id });
    await act(async () => render("next"));
    expect(host.container.textContent).toContain("Save a reference for “Next”");
    await act(async () => render("next", { ...location, route: { kind: "results" } }));
    expect(host.container.querySelector(".marketplace-result-installed")).toBeNull();
    await act(async () => render("next", { ...location, route: { kind: "library", section: "saved" } }));
    expect(host.container.querySelector(".marketplace-installed-pack")?.textContent).toContain("No saved documents yet");
  } finally { await act(async () => root.unmount()); host.restore(); }
});

test("bundled documents are saved references, with working copy and remove actions", async () => {
  const host = createReactHost();
  const root = createRoot(host.container);
  vi.spyOn(bridge, "loadMarketplacePackDocument").mockResolvedValue({ id: entry.id, path: entry.path, markdown: "# Editor\nRender the composition.", truncated: false });
  const copy = vi.spyOn(bridge, "copyText").mockResolvedValue(undefined);
  const mutate = vi.fn();
  const props = { workspaceName: "Studio", onBack: vi.fn(), onReviewTarget: vi.fn(), onInstallAction: mutate };
  try {
    await act(async () => { root.render(<MarketplacePackItemDetail {...props} item={projectMarketplacePackItem(entry, "0.3.0", { status: "available" })} />); });
    const button = (label: string) => [...host.container.querySelectorAll("button")].find((element) => element.textContent === label)!;
    expect(button("Save to workspace")).toBeDefined();
    await act(async () => button("Save to workspace").dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
    expect(mutate).toHaveBeenCalledWith("install", entry.id);
    await act(async () => button("Copy document").dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
    expect(copy).toHaveBeenCalledWith("# Editor\nRender the composition.");
    expect(host.container.textContent).toContain("Document copied");
    const saved = projectMarketplacePackItem(entry, "0.3.0", { status: "installed", installedAt: 1_700_000_000_000, enabled: false });
    await act(async () => { root.render(<MarketplacePackItemDetail {...props} item={saved} />); });
    expect(host.container.textContent).not.toMatch(/agent does not reach|Disable|Enable|Uninstall|Review install/);
    await act(async () => button("Remove from saved").dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
    expect(mutate).toHaveBeenLastCalledWith("uninstall", entry.id);
    const open = vi.fn();
    await act(async () => { root.render(<MarketplaceMyLibrary section="saved" machine={null} installedItems={[saved]} workspaceName="Studio" onOpenItem={open} />); });
    expect(host.container.textContent).toContain("Saved for this workspace");
    await act(async () => host.container.querySelector("button")!.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
    expect(open).toHaveBeenCalledWith(saved.key);
  } finally {
    await act(async () => root.unmount());
    host.restore();
  }
});
