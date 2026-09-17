import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { MarketplaceMyLibrary, projectMarketplacePackItem } from "@/pages/marketplace";
import { MarketplacePackItemDetail } from "../src/pages/marketplace/ui/MarketplacePackItemDetail";
import { bridge } from "@/shared/api/ipc";
import { createReactHost } from "./react-host";

const entry = { id: "skill:editor", category: "skill" as const, slug: "editor", title: "Editor", summary: "Render craft", path: ".agents/skills/editor/SKILL.md", tags: [] };
afterEach(() => vi.restoreAllMocks());

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
