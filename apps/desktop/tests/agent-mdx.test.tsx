import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, test, vi } from "vitest";
import { bridge } from "@/shared/api/ipc";
import { parseAgentMessage } from "../src/features/agent-chat/lib/agent-mdx";
import { AgentMessage } from "../src/features/agent-chat/ui/AgentMessage";
import { createReactHost } from "./react-host";

const card = '<UnitCard workspaceId="ws_demo" projectId="proj_demo" unitId="unit_demo" title="Creative 1" />';

describe("agent MDX unit cards", () => {
  test("refreshes an existing card on activity and preserves expanded versions", async () => {
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
      await act(async () => root.render(<AgentMessage markdown={card} workspaceId="ws_demo" onOpenUnit={() => undefined} />));
      expect(host.container.textContent).toContain("4 versions");
      for (const next of [8, 16]) {
        count = next;
        await act(async () => { activity({ type: "activity-refresh", storeId: "store", rootEpoch: 1, sequence: next }); await vi.advanceTimersByTimeAsync(200); });
        expect(host.container.textContent).toContain(`${next} versions`);
      }
      await act(async () => host.container.querySelector(".agent-unit-more")!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(host.container.querySelectorAll(".agent-unit-variant")).toHaveLength(16);
      await act(async () => { activity({ type: "activity-refresh", storeId: "store", rootEpoch: 1, sequence: 17 }); await vi.advanceTimersByTimeAsync(200); });
      expect(host.container.querySelectorAll(".agent-unit-variant")).toHaveLength(16);
      load.mockRejectedValue(new Error("Missing unit"));
      await act(async () => { activity({ type: "activity-refresh", storeId: "store", rootEpoch: 1, sequence: 18 }); await vi.advanceTimersByTimeAsync(200); });
      expect(host.container.textContent).toContain("Unit unavailable");
      expect(host.container.querySelectorAll(".agent-unit-variant")).toHaveLength(0);
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

  test.each([4, 8, 16, 55].flatMap((count) => [false, true].map((source) => ({ count, source }))))("renders $count versions with source=$source and scoped navigation", async ({ count, source }) => {
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const unit = vi.spyOn(bridge, "loadProjectUnit").mockResolvedValue({ id: "unit_demo", slug: "creative-1", latestRevisionId: `urev_${count}`, sourceRevisionId: source ? "source" : null } as never);
    const revision = vi.spyOn(bridge, "loadProjectUnitRevision").mockImplementation(async (_project, _unit, id) => ({ id, unitId: "unit_demo", revisionNo: id === "source" ? 1 : count + (source ? 1 : 0) } as never));
    const pages = vi.spyOn(bridge, "loadProjectUnitPage").mockImplementation(async (_project, request): Promise<any> => ({ items: request.kind === "revisions"
      ? Array.from({ length: request.cursor ? Math.max(0, count - 8) : Math.min(count, 8) }, (_, i) => count - i - (request.cursor ? 8 : 0)).map((revisionNo) => ({ id: `urev_${revisionNo}`, unitId: "unit_demo", revisionNo: revisionNo + (source ? 1 : 0), sealedAt: 1, note: "New actor\nProduction details" }))
      : request.kind === "presentations" ? [{ id: `presentation_${request.revisionId}`, position: 0, platform: "facebook", coverArtifactRevisionId: `cover_${request.revisionId}` }] : [], nextCursor: request.kind === "revisions" && !request.cursor && count > 8 ? "page-2" : null }));
    const previews = vi.spyOn(bridge, "resolveCompositionOutputPreview").mockImplementation(async (_project, id) => ({ url: `ralphy-media://asset/${id}`, mime: "image/png", sizeBytes: 10 }));
    const onOpenUnit = vi.fn();
    try {
      await act(async () => root.render(<AgentMessage markdown={card} workspaceId="ws_demo" onOpenUnit={onOpenUnit} />));
      expect(host.container.textContent).toContain(`${count} versions`);
      expect(host.container.querySelector(".agent-unit-variant")?.textContent).toContain("New actor");
      expect(host.container.querySelector(".agent-unit-variant")?.textContent).not.toContain("Production details");
      expect(host.container.querySelectorAll(".agent-unit-variant img")).toHaveLength(Math.min(count, 8));
      expect(host.container.querySelector(".agent-unit-variant img")?.getAttribute("src")).toBe(`ralphy-media://asset/cover_urev_${count}`);
      while (host.container.querySelector(".agent-unit-more")) {
        await act(async () => host.container.querySelector(".agent-unit-more")!.dispatchEvent(new Event("click", { bubbles: true })));
      }
      expect(host.container.querySelectorAll(".agent-unit-variant img")).toHaveLength(count);
      for (const [scope, request] of pages.mock.calls) if (request.kind === "revisions") expect(scope).toEqual({ workspaceId: "ws_demo", projectId: "proj_demo" });
      expect(host.container.textContent).toContain("First version");
      if (source) expect(host.container.textContent).toContain("R0 · Original");
      else expect(host.container.textContent).not.toContain("Original");
      await act(async () => host.container.querySelector("button")!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(onOpenUnit).toHaveBeenCalledWith({ workspaceId: "ws_demo", projectId: "proj_demo" }, "unit_demo", "Creative 1");
      unit.mockClear();
      await act(async () => root.render(<AgentMessage markdown={card} workspaceId="ws_other" onOpenUnit={onOpenUnit} />));
      expect(unit).not.toHaveBeenCalled();
      expect(host.container.textContent).toContain("another workspace");
    } finally {
      await act(async () => root.unmount());
      unit.mockRestore(); revision.mockRestore(); pages.mockRestore(); previews.mockRestore(); host.restore();
    }
  });
});
