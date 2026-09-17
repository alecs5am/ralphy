import { act } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { SaveGenerationToUnit } from "@/entities/generation";
import { bridge } from "@/shared/api/ipc";
import type { SavedGenerationUnit } from "../shared/generation-units";
import { createReactHost, type HostNode } from "./react-host";
import { CanvasRunsPanel } from "../src/features/workflow-canvas/ui/CanvasRunsPanel";
import type { CanvasRun } from "../shared/canvas-runtime";

// SelectMenu owns keyboard/portal behavior; these checks exercise destination and save state.
vi.mock("@/shared/ui/SelectMenu", () => ({ SelectMenu: ({ ariaLabel, options, onValueChange, disabled }: { ariaLabel: string; options: { value: string; label: string }[]; onValueChange(value: string): void; disabled?: boolean }) => <div aria-label={ariaLabel}>{options.map((option) => <button type="button" disabled={disabled} key={option.value} onClick={() => onValueChange(option.value)}>{option.label}</button>)}</div> }));
afterEach(() => vi.restoreAllMocks());
const source = { canvasId: "workflow", runId: "retained-run", resultId: "generated-result" };
const receipt: SavedGenerationUnit = { workspaceId: "workspace", projectId: "project", unitId: "unit", revisionId: "revision", revisionNo: 3, label: "Summer launch", alreadySaved: false };
function button(container: HostNode, label: string) { const node = container.querySelectorAll("button").find((node) => node.textContent === label); if (!node) throw new Error(`Missing ${label}`); return node; }
async function click(container: HostNode, label: string) { await act(async () => { button(container, label).dispatchEvent(new Event("click", { bubbles: true })); }); }
async function submit(container: HostNode, count = 1) { await act(async () => { for (let i = 0; i < count; i++) container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
async function mount() {
  const options = vi.spyOn(bridge, "loadGenerationUnitOptions").mockResolvedValue({ workspaceName: "Acme studio", projects: [{ id: "project", name: "Launch campaign" }], units: [{ id: "unit", label: "Existing image", format: "image", latestRevisionId: "head-1" }, { id: "video", label: "Incompatible video", format: "video", latestRevisionId: "video-head" }] });
  const save = vi.spyOn(bridge, "saveGenerationToUnit").mockResolvedValue(receipt), open = vi.fn();
  const host = createReactHost(), { createRoot } = await import("react-dom/client"), root = createRoot(host.container as unknown as Element);
  await act(async () => root.render(<SaveGenerationToUnit workspaceId="workspace" source={source} kind="image" label="Created image" onOpenUnit={open} />));
  await click(host.container, "Save to Unit");
  return { host, options, save, open, async close() { await act(async () => root.unmount()); host.restore(); } };
}

test("new Unit chooses its project, blocks duplicate submission, and opens the saved Unit through the existing panel callback", async () => {
  const view = await mount();
  try {
    expect(view.host.container.textContent).toContain("Workspace: Acme studio");
    await click(view.host.container, "Launch campaign");
    expect(view.options).toHaveBeenLastCalledWith("workspace", "project");
    let finish!: (value: SavedGenerationUnit) => void;
    view.save.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await submit(view.host.container, 2);
    expect(view.save).toHaveBeenCalledOnce(); expect(view.save).toHaveBeenCalledWith("workspace", source, { projectId: "project", name: "Created image" });
    expect(button(view.host.container, "Saving…").disabled).toBe(true);
    expect(button(view.host.container, "Workspace Units").disabled).toBe(true);
    await act(async () => finish(receipt));
    expect(view.host.container.textContent).toContain("selected version and publishing status are unchanged");
    await click(view.host.container, "Open Unit");
    expect(view.open).toHaveBeenCalledOnce(); expect(view.open).toHaveBeenCalledWith({ workspaceId: "workspace", projectId: "project" }, "unit", "Summer launch", "revision");
  } finally { await view.close(); }
});

test("existing Unit retry refreshes a stale head, excludes incompatible formats, and sends identities rather than file paths or provenance", async () => {
  const view = await mount();
  try {
    await click(view.host.container, "Revision of an existing Unit");
    expect(view.host.container.textContent).not.toContain("Incompatible video");
    view.save.mockRejectedValueOnce(new Error("The Unit changed. Refresh its revisions before saving this result."));
    await submit(view.host.container);
    expect(view.save).toHaveBeenLastCalledWith("workspace", source, { projectId: null, unitId: "unit", expectedLatestRevisionId: "head-1" });
    expect(view.host.container.textContent).toContain("The Unit changed");
    view.options.mockResolvedValue({ workspaceName: "Acme studio", projects: [], units: [{ id: "unit", label: "Existing image", format: "image", latestRevisionId: "head-2" }] });
    await click(view.host.container, "Refresh destinations");
    view.save.mockResolvedValue({ ...receipt, projectId: null, alreadySaved: true });
    await submit(view.host.container);
    expect(view.save).toHaveBeenLastCalledWith("workspace", source, { projectId: null, unitId: "unit", expectedLatestRevisionId: "head-2" });
    expect(view.host.container.textContent).toContain("Already saved as revision 3");
  } finally { await view.close(); }
});

test("Canvas saves only generated output and resets its dialog when a historical result is forwarded by another run", async () => {
  const view = await mount(); await view.close();
  const host = createReactHost(), { createRoot } = await import("react-dom/client"), root = createRoot(host.container as unknown as Element);
  const result = { id: "same-historical-result", nodeId: "model", kind: "image" as const, label: "Generated frame", asset: { path: "/fixture.png", name: "fixture.png", kind: "image" as const } };
  const run: CanvasRun = { id: "first", canvasId: "canvas", workspaceId: "workspace", canvasRevision: "revision", mode: "execute", status: "succeeded", startedAt: 1, endedAt: 2, error: null, snapshot: { version: 2, id: "canvas", name: "Canvas", edges: [], nodes: [{ id: "model", kind: "model", title: "Model", value: "", x: 0, y: 0 }, { id: "reference", kind: "media", title: "Reference", value: "", x: 0, y: 0 }] }, nodes: ["model", "reference"].map((nodeId) => ({ nodeId, status: "succeeded", startedAt: 1, endedAt: 2, coreRunIds: [], results: [{ ...result, ...(nodeId === "reference" ? { id: "reference", nodeId, label: "Input reference" } : {}) }], error: null, estimatedCostUsd: null })) };
  const render = (selectedRun: CanvasRun) => <CanvasRunsPanel runs={[selectedRun]} selectedRun={selectedRun} expanded={false} running={false} onSelectRun={() => {}} onClose={() => {}} onExpand={() => {}} onCancel={() => {}} onUseResult={() => {}} onRestore={() => {}} onExecute={() => {}} />;
  try {
    await act(async () => root.render(render(run)));
    expect(host.container.querySelectorAll("button").filter((node) => node.textContent === "Save to Unit")).toHaveLength(1);
    await click(host.container, "Save to Unit"); expect(host.container.querySelector("form")).not.toBeNull();
    await act(async () => root.render(render({ ...run, id: "second" })));
    expect(host.container.querySelector("form")).toBeNull();
    await click(host.container, "Save to Unit"); await submit(host.container);
    expect(view.save).toHaveBeenCalledWith("workspace", { canvasId: "canvas", runId: "second", resultId: result.id }, { projectId: null, name: "Generated frame" });
  } finally { await act(async () => root.unmount()); host.restore(); }
});
