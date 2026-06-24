// Workspace-scoped Run manifest schema (#480) — parse valid + reject malformed.

import { describe, test, expect } from "bun:test";
import { parseRun, RUN_MANIFEST_ARTIFACT, RUN_EVENTS_ARTIFACT } from "../../cli/lib/schemas/run.js";

describe("parseRun — valid input", () => {
  test("fills defaults for a minimal manifest", () => {
    const run = parseRun({ id: "farm-001", workspace: "default", title: "Spring farm" });
    expect(run.version).toBe(1);
    expect(run.status).toBe("active");
    expect(run.projectIds).toEqual([]);
    expect(typeof run.createdAt).toBe("string");
    // optional reference fields stay undefined when absent
    expect(run.workflow).toBeUndefined();
    expect(run.batchId).toBeUndefined();
  });

  test("round-trips a fully-populated manifest (all references)", () => {
    const input = {
      version: 1,
      id: "q3-ads-001",
      workspace: "ellycoffee",
      title: "Q3 ads",
      brief: "30 cold-traffic creatives",
      status: "complete",
      createdAt: "2026-06-24T00:00:00.000Z",
      workflow: "episode",
      projectIds: ["q3-001", "q3-002"],
      batchId: "q3-batch-001",
      strategyPath: "artifacts/refs/strategy.md",
      intelligencePackPath: "shared/research/pack.json",
      unitIds: ["unit-q3-001"],
    };
    const run = parseRun(input);
    expect(run).toEqual(input);
  });

  test("artifact filename constants are stable", () => {
    expect(RUN_MANIFEST_ARTIFACT).toBe("run.json");
    expect(RUN_EVENTS_ARTIFACT).toBe("run-events.jsonl");
  });
});

describe("parseRun — malformed input rejects", () => {
  test("missing required id throws", () => {
    expect(() => parseRun({ workspace: "default", title: "x" })).toThrow();
  });

  test("missing required title throws", () => {
    expect(() => parseRun({ id: "farm-001", workspace: "default" })).toThrow();
  });

  test("an unknown status enum value throws", () => {
    expect(() => parseRun({ id: "f", workspace: "default", title: "x", status: "running" })).toThrow();
  });

  test("projectIds with a non-string element throws", () => {
    expect(() => parseRun({ id: "f", workspace: "default", title: "x", projectIds: ["ok", 7] })).toThrow();
  });
});
