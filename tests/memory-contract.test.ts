import { describe, expect, test, vi } from "vitest";
import { createMemoryReader, validateMemoryDetail } from "../electron/ralphy/memory-reader";
import { MEDIA_CHANNELS } from "../electron/media/types";
import type { RalphyBridgeClient } from "../electron/ralphy/client";

const detail = {
  id: "mentry_1",
  revisionId: "mrev_1",
  slug: "voice",
  version: 1,
  revisionNo: 1,
  tier: "workspace",
  workspace: "ux-testing-lab",
  status: "active",
  name: "Voice",
  description: "Use plain language.",
  type: "style",
  filed: "2026-08-18",
  source: "Desktop",
  body: {
    rule: "Use plain language.",
    why: "Readers should understand it once.",
    howToApply: ["Prefer concrete verbs."],
    doesNotApplyTo: ["Verbatim customer quotes."],
  },
  rawBody: "## Rule\nUse plain language.",
  qualityFlags: [],
  overridesGlobal: false,
} as const;

describe("Memory Desktop contract", () => {
  test("validates Core details and rejects unsupported scope values", () => {
    expect(validateMemoryDetail(detail)).toEqual(detail);
    expect(() => validateMemoryDetail({ ...detail, tier: "account" })).toThrow("Invalid Memory detail");
    expect(() => validateMemoryDetail({ ...detail, privatePath: "/tmp/private" })).toThrow("Invalid Memory detail");
  });

  test("loads Memory through a fixed typed Core method", async () => {
    const request = vi.fn(async () => ({ items: [detail] }));
    const reader = createMemoryReader({ request: request as RalphyBridgeClient["request"] });

    await expect(reader.list("ws_1", { scope: "effective", status: "active" }))
      .resolves.toEqual({ items: [detail] });
    expect(request).toHaveBeenCalledWith("memory.list", {
      context: { workspaceId: "ws_1" },
      scope: "effective",
      status: "active",
    });
    expect(MEDIA_CHANNELS.loadMemory).toBe("workspace:memory:list");
  });
});
