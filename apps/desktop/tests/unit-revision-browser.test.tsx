import { act, useState } from "react";
import { expect, test, vi } from "vitest";
import type { UnitRevisionDto } from "../electron/ralphy/types";
import { UnitRevisionBrowser } from "../src/pages/project/ui/UnitRevisionBrowser";
import { createReactHost, type HostNode } from "./react-host";

vi.mock("@/entities/unit", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/entities/unit")>(),
  UnitRevisionPreview: () => <span className="test-preview" />,
}));

test.each(["rail", "grid"] as const)("browses 17 revisions and the original in %s without choosing a saved version", async (layout) => {
  const host = createReactHost(), { createRoot } = await import("react-dom/client"), root = createRoot(host.container as unknown as Element);
  vi.spyOn(globalThis, "getComputedStyle").mockReturnValue({ gridTemplateColumns: "100px 100px 100px 100px" } as CSSStyleDeclaration);
  const revision = (index: number): UnitRevisionDto => ({ id: `r${index}`, unitId: "unit", revisionNo: index + 1, parentRevisionId: null, compositionRevisionId: null, iterationId: null, note: `Version ${index} notes`, authoredBySessionId: null, createdAt: 1, sealedAt: 1 });
  const revisions = Array.from({ length: 17 }, (_, index) => revision(index + 1));
  const inspect = vi.fn(), original = vi.fn();
  function Browser() {
    const [inspected, setInspected] = useState("r1"), [showOriginal, setShowOriginal] = useState(true);
    return <UnitRevisionBrowser project={{ workspaceId: "ws", projectId: "project" }} revisions={revisions} sourceRevision={revision(0)} sourceRevisionId="r0" sourceLabel="Source image" inspectedRevisionId={inspected} selectedRevisionId="r3" showOriginal={showOriginal} layout={layout}
      onInspect={(id, openGallery) => { inspect(id, openGallery); setInspected(id); setShowOriginal(false); }} onOriginal={(openGallery) => { original(openGallery); setShowOriginal(true); }} />;
  }
  const options = () => host.container.querySelectorAll("[role=option]");
  const option = (index: number) => options()[index]!;
  const press = (node: HostNode, key: string) => act(async () => { node.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key })); });
  const expectViewed = (index: number) => {
    expect(options().filter((node) => node.tabIndex === 0)).toEqual([option(index)]);
    expect(options().filter((node) => node.getAttribute("aria-selected") === "true")).toEqual([option(index)]);
    expect(host.container.ownerDocument.activeElement).toBe(option(index));
    expect(option(3).querySelector(".unit-revision-saved")).not.toBeNull();
  };
  try {
    await act(async () => root.render(<Browser />));
    expect(options()).toHaveLength(18);
    expect(host.container.querySelector(`.is-${layout}`)).not.toBeNull();
    expect(option(0).getAttribute("aria-label")).toBe("View revision 0");
    expect(option(0).getAttribute("title")).toContain("Source image");
    expect(option(3).getAttribute("title")).toContain("Selected version");
    expect(option(3).textContent).not.toContain("Version 3 notes");
    expect(options().filter((node) => node.tabIndex === 0)).toEqual([option(0)]);
    await press(option(0), "ArrowRight");
    expect(inspect).toHaveBeenLastCalledWith("r1", false);
    expectViewed(1);
    const below = layout === "grid" ? 5 : 2;
    await press(option(1), "ArrowDown");
    expect(inspect).toHaveBeenLastCalledWith(`r${below}`, false);
    expectViewed(below);
    await press(option(below), "End");
    expect(inspect).toHaveBeenLastCalledWith("r17", false);
    expectViewed(17);
    await press(option(17), "Home");
    expect(original).toHaveBeenLastCalledWith(false);
    expectViewed(0);
    expect(inspect.mock.calls.every(([, openGallery]) => openGallery === false)).toBe(true);
    await act(async () => { option(4).dispatchEvent(new Event("click", { bubbles: true })); });
    expect(inspect).toHaveBeenLastCalledWith("r4", true);
    await act(async () => { option(0).dispatchEvent(new Event("click", { bubbles: true })); });
    expect(original).toHaveBeenLastCalledWith(true);
  } finally { await act(async () => root.unmount()); vi.restoreAllMocks(); host.restore(); }
});
