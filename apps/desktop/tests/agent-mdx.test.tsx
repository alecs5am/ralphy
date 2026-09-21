import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, test, vi } from "vitest";
import { bridge } from "@/shared/api/ipc";
import { parseAgentMessage } from "../src/features/agent-chat/lib/agent-mdx";
import { ChatUnitCard } from "../src/features/agent-chat/ui/ChatUnitCard";
import { createReactHost } from "./react-host";

const reference = { workspaceId: "ws_demo", projectId: "proj_demo", unitId: "unit_demo", title: "Creative 1" };
const card = '<UnitCard workspaceId="ws_demo" projectId="proj_demo" unitId="unit_demo" title="Creative 1" />';

describe("agent MDX unit cards", () => {
  test("refreshes compact previews on activity and supports retry after a failure", async () => {
    vi.useFakeTimers();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    let count = 4;
    let activity: Parameters<typeof bridge.onMediaEvent>[0] = () => undefined;
    vi.spyOn(bridge, "onMediaEvent").mockImplementation((callback) => { activity = callback; return () => undefined; });
    const load = vi.spyOn(bridge, "loadProjectUnit").mockImplementation(async () => ({ id: "unit_demo", slug: "creative", latestRevisionId: `r${count}` } as never));
    vi.spyOn(bridge, "loadProjectUnitRevision").mockImplementation(async (_scope, _id, id) => ({ id, unitId: "unit_demo", revisionNo: count } as never));
    vi.spyOn(bridge, "loadProjectUnitPage").mockImplementation(async (_scope, request): Promise<any> => ({ items: request.kind === "revisions" ? Array.from({ length: count }, (_, index) => ({ id: `r${count - index}`, unitId: "unit_demo", revisionNo: count - index, sealedAt: 1 })) : [], nextCursor: null }));
    try {
      await act(async () => root.render(<ChatUnitCard reference={reference} workspaceId="ws_demo" onOpenUnit={() => undefined} />));
      expect(host.container.textContent).toContain("4 versions");
      count = 16;
      await act(async () => { activity({ type: "activity-refresh", storeId: "store", rootEpoch: 1, sequence: 16 }); await vi.advanceTimersByTimeAsync(200); });
      expect(host.container.textContent).toContain("16 versions");
      expect(host.container.querySelectorAll(".agent-unit-variant")).toHaveLength(4);
      expect(host.container.querySelector(".agent-unit-variant")?.textContent).toContain("R16");
      load.mockRejectedValueOnce(new Error("Missing unit"));
      await act(async () => { activity({ type: "activity-refresh", storeId: "store", rootEpoch: 1, sequence: 17 }); await vi.advanceTimersByTimeAsync(200); });
      expect(host.container.textContent).toContain("Content unavailable");
      expect(host.container.querySelectorAll(".agent-unit-variant")).toHaveLength(0);
      const retry = host.container.querySelectorAll("button").find((button) => button.textContent === "Retry")!;
      await act(async () => retry.dispatchEvent(new Event("click", { bubbles: true })));
      expect(host.container.textContent).toContain("16 versions");
      expect(host.container.textContent).not.toContain("Content unavailable");
    } finally {
      await act(async () => root.unmount());
      vi.restoreAllMocks(); vi.useRealTimers(); host.restore();
    }
  });

  test("keeps prose and fenced examples while recognizing only inert unit references", () => {
    expect(parseAgentMessage(`Created.\n\n${card}\n\nCompare the versions.`).map((part) => part.kind)).toEqual(["markdown", "unit", "markdown"]);
    expect(parseAgentMessage(`\`\`\`mdx\n${card}\n\`\`\``)).toMatchObject([{ kind: "markdown" }]);
    for (const unsafe of [card.replace('unit_demo', '../outside'), card.replace(' />', ' onClick="alert(1)" />'), card.replace('"unit_demo"', '{runCode()}')]) {
      expect(parseAgentMessage(unsafe).every((part) => part.kind === "markdown")).toBe(true);
    }
  });

  test.each([1, 4, 16, 55].flatMap((count) => [false, true].map((source) => ({ count, source }))))("previews at most four of $count versions with source=$source and opens the clicked revision", async ({ count, source }) => {
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    vi.spyOn(bridge, "onMediaEvent").mockReturnValue(() => undefined);
    const unit = vi.spyOn(bridge, "loadProjectUnit").mockResolvedValue({ id: "unit_demo", slug: "creative-1", latestRevisionId: `urev_${count}`, sourceRevisionId: source ? "source" : null, sourceLabel: "Uploaded creative" } as never);
    vi.spyOn(bridge, "loadProjectUnitRevision").mockImplementation(async (_project, _unit, id) => ({ id, unitId: "unit_demo", revisionNo: id === "source" ? 1 : count + (source ? 1 : 0) } as never));
    const pages = vi.spyOn(bridge, "loadProjectUnitPage").mockImplementation(async (_project, request): Promise<any> => ({ items: request.kind === "revisions"
      ? Array.from({ length: Math.min(count, 8) }, (_, i) => count - i).map((revisionNo) => ({ id: `urev_${revisionNo}`, unitId: "unit_demo", revisionNo: revisionNo + (source ? 1 : 0), sealedAt: 1, note: "New actor\nProduction details" }))
      : request.kind === "presentations" ? [{ id: `presentation_${request.revisionId}`, position: 0, platform: "facebook", coverArtifactRevisionId: `cover_${request.revisionId}` }] : [], nextCursor: request.kind === "revisions" && count > 8 ? "page-2" : null }));
    vi.spyOn(bridge, "resolveCompositionOutputPreview").mockImplementation(async (_project, id) => ({ url: `ralphy-media://asset/${id}`, mime: "image/png", sizeBytes: 10 }));
    const onOpenUnit = vi.fn();
    try {
      await act(async () => root.render(<ChatUnitCard reference={reference} workspaceId="ws_demo" onOpenUnit={onOpenUnit} />));
      expect(host.container.textContent).toContain(`${count} ${count === 1 ? "version" : "versions"}`);
      const previews = host.container.querySelectorAll(".agent-unit-variant");
      expect(previews).toHaveLength(Math.min(count + (source ? 1 : 0), 4));
      expect(host.container.querySelectorAll(".agent-unit-variant img")).toHaveLength(previews.length);
      const latest = previews[source ? 1 : 0];
      expect(latest.getAttribute("title")).toContain("New actor");
      expect(latest.textContent).not.toContain("Production details");
      expect(latest.querySelector("img")?.getAttribute("src")).toBe(`ralphy-media://asset/cover_urev_${count}`);
      await act(async () => latest.dispatchEvent(new Event("click", { bubbles: true })));
      expect(onOpenUnit).toHaveBeenLastCalledWith({ workspaceId: "ws_demo", projectId: "proj_demo" }, "unit_demo", "Creative 1", `urev_${count}`);
      if (source) {
        expect(previews[0].textContent).toContain("Original");
        const enter = Object.assign(new Event("keydown", { bubbles: true }), { key: "Enter" });
        await act(async () => previews[0].dispatchEvent(enter));
        expect(onOpenUnit).toHaveBeenLastCalledWith({ workspaceId: "ws_demo", projectId: "proj_demo" }, "unit_demo", "Creative 1", "source");
      } else expect(host.container.textContent).not.toContain("Original");
      expect(host.container.querySelector(".agent-unit-more")).toBeNull();
      for (const [scope, request] of pages.mock.calls) if (request.kind === "revisions") {
        expect(scope).toEqual({ workspaceId: "ws_demo", projectId: "proj_demo" });
        expect(request.cursor).toBeUndefined();
      }
      await act(async () => host.container.querySelector("button")!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(onOpenUnit).toHaveBeenLastCalledWith({ workspaceId: "ws_demo", projectId: "proj_demo" }, "unit_demo", "Creative 1", undefined);
      unit.mockClear(); onOpenUnit.mockClear();
      await act(async () => root.render(<ChatUnitCard reference={reference} workspaceId="ws_other" onOpenUnit={onOpenUnit} />));
      expect(unit).not.toHaveBeenCalled();
      expect(host.container.textContent).toContain("another workspace");
      expect(host.container.querySelectorAll(".agent-unit-variant")).toHaveLength(0);
      expect(host.container.querySelector("button")?.disabled).toBe(true);
    } finally {
      await act(async () => root.unmount());
      vi.restoreAllMocks(); host.restore();
    }
  });

  test("ignores a late reply after switching workspace", async () => {
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    let resolve!: (value: never) => void;
    vi.spyOn(bridge, "onMediaEvent").mockReturnValue(() => undefined);
    vi.spyOn(bridge, "loadProjectUnit").mockReturnValue(new Promise((done) => { resolve = done; }));
    const revisions = vi.spyOn(bridge, "loadProjectUnitRevision");
    try {
      await act(async () => root.render(<ChatUnitCard reference={reference} workspaceId="ws_demo" />));
      expect(host.container.textContent).toContain("Loading content");
      await act(async () => root.render(<ChatUnitCard reference={reference} workspaceId="ws_other" />));
      await act(async () => resolve({ id: "unit_demo", slug: "old", latestRevisionId: "r1" } as never));
      expect(revisions).not.toHaveBeenCalled();
      expect(host.container.textContent).toContain("another workspace");
      expect(host.container.querySelectorAll(".agent-unit-variant")).toHaveLength(0);
    } finally {
      await act(async () => root.unmount());
      vi.restoreAllMocks(); host.restore();
    }
  });
});
