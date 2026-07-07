// Workflow simulate (#516) — dry-run cost forecast over the REAL farm runner
// with synthetic executors. ZERO network, ZERO provider calls: every node is
// overridden through the FarmDeps.executorOverrides seam and the run executes
// in an ephemeral scratch root (nothing lands in the workspace's runs/ tree).

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, workflowsDir, runsDir, root } from "../../cli/lib/paths.js";
import {
  simulateWorkflow,
  estimateNodeCost,
  resolveAssumeItems,
  llmCallCostUsd,
} from "../../cli/lib/farm/simulate.js";
import { parseWorkflowGraph, type WorkflowNode } from "../../cli/lib/schemas/workflow.js";

let tmp: TmpRoot;
afterEach(() => tmp?.cleanup());

const WS = "test";

function seedWorkspace(): void {
  tmp = makeTmpRoot("ralphy-simulate");
  const dir = workspaceDir(WS);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ slug: WS }));
}

function writeWorkflow(name: string, nodes: unknown[]): void {
  fs.mkdirSync(workflowsDir(WS), { recursive: true });
  fs.writeFileSync(
    path.join(workflowsDir(WS), `${name}.json`),
    JSON.stringify({ version: "2.0", name, nodes }, null, 2),
  );
}

function seedCalendarSlots(count: number): void {
  const slots = Array.from({ length: count }, (_v, i) => ({
    id: `slot-${i}`,
    weekday: "mon",
    time: "09:00",
    timezone: "UTC",
    unitType: "ugc-review",
    targetPlatforms: [],
  }));
  fs.writeFileSync(
    path.join(workspaceDir(WS), "calendar.json"),
    JSON.stringify({ version: "1.0", slots, entries: [] }),
  );
}

/** The fixture graph: schedule -> trend-watch -> fan-out -> t2i -> t2v -> join. */
const COST_GRAPH = [
  { id: "tick", type: "schedule", params: { cron: "0 9 * * 1,3,5" } },
  { id: "guard", type: "budget-guard", in: { seed: "tick.out" }, params: { max_usd: 20 } },
  { id: "watch", type: "trend-watch", in: {}, params: { topics: [{ id: "a", feeds: ["feed.xml"] }] } },
  { id: "fan", type: "fan-out", in: { items: "watch.out" }, params: {} },
  {
    id: "anchor",
    type: "t2i",
    in: { prompt: "fan.out" },
    params: { model: "google/gemini-3-pro-image-preview", variants: 2 },
  },
  {
    id: "clip",
    type: "t2v",
    in: { prompt: "anchor.out" },
    params: { model: "kwaivgi/kling-v3.0-pro", durationSec: 5 },
  },
  { id: "merge", type: "join", in: { clips: "clip.out" }, params: {} },
  { id: "ask", type: "approval", in: { go: "merge.out" }, params: { reason: "publish spend" } },
];

describe("simulate cost math", () => {
  test("variants x fan-out multiplication is exact; run stays out of the workspace", async () => {
    seedWorkspace();
    writeWorkflow("pipeline", COST_GRAPH);
    const realRoot = root();

    const report = await simulateWorkflow(WS, "pipeline", { assumeItems: 4 });

    expect(report.ok).toBe(true);
    expect(report.assumptions.fanOutItems).toBe(4);
    expect(report.assumptions.fanOutItemsSource).toBe("--assume-items");

    const anchor = report.costs.perNode.find((n) => n.node === "anchor")!;
    // 2 variants x $0.04/image (gemini-3-pro-image-preview), 4 fan-out branches.
    expect(anchor.unitUsd).toBeCloseTo(0.08, 6);
    expect(anchor.invocations).toBe(4);
    expect(anchor.totalUsd).toBeCloseTo(0.32, 6);

    const clip = report.costs.perNode.find((n) => n.node === "clip")!;
    // 5s x $0.14/s (kling-v3.0-pro), 4 branches.
    expect(clip.unitUsd).toBeCloseTo(0.7, 6);
    expect(clip.invocations).toBe(4);
    expect(clip.totalUsd).toBeCloseTo(2.8, 6);

    expect(report.costs.tickKnownUsd).toBeCloseTo(3.12, 6);
    expect(report.costs.unknownPricing).toHaveLength(0);

    // Paid inventory names the two media nodes (content-hash cache defaults).
    const paid = report.paidNodes.map((n) => n.node);
    expect(paid).toContain("anchor");
    expect(paid).toContain("clip");
    expect(report.paidNodes.find((n) => n.node === "anchor")!.cache).toBe("content-hash");

    // Approval stop + trust level surfaced; budget headroom = cap - tick cost.
    expect(report.approvals.trustLevel).toBe("L0");
    expect(report.approvals.stops).toEqual([{ node: "ask", reason: "publish spend", autoPass: false }]);
    expect(report.budget.minCapUsd).toBe(20);
    expect(report.budget.headroomUsd).toBeCloseTo(16.88, 6);

    // Isolation: no run landed in the REAL workspace tree, and the root is restored.
    expect(root()).toBe(realRoot);
    expect(fs.existsSync(runsDir(WS))).toBe(false);

    // #525: no cadence block on the workspace → exact times (disabled).
    expect(report.cadence.enabled).toBe(false);
    expect(report.cadence.note).toContain("exact slot times");
  });

  test("#525 cadence section marks sampled times when a cadence block is present", async () => {
    seedWorkspace();
    writeWorkflow("pipeline", COST_GRAPH);
    // Author a cadence block on the real workspace.json.
    const src = path.join(workspaceDir(WS), "workspace.json");
    const m = JSON.parse(fs.readFileSync(src, "utf8"));
    m.cadence = {
      enabled: true,
      platforms: { tiktok: { distribution: "uniform", windows: [{ start: "08:40", end: "10:15" }], minGapMinutes: 30, slideProbability: 0.05 } },
    };
    fs.writeFileSync(src, JSON.stringify(m));

    const report = await simulateWorkflow(WS, "pipeline", { assumeItems: 2 });
    expect(report.cadence.enabled).toBe(true);
    expect(report.cadence.note).toContain("SAMPLED");
    expect(report.cadence.platforms).toContainEqual({ platform: "tiktok", windows: 1, minGapMinutes: 30, slideProbability: 0.05 });
  });

  test("weekly projection: schedule crons win; calendar slots are the fallback basis", async () => {
    seedWorkspace();
    seedCalendarSlots(2);
    writeWorkflow("pipeline", COST_GRAPH);

    const report = await simulateWorkflow(WS, "pipeline", { assumeItems: 4, week: true });
    // "0 9 * * 1,3,5" fires 3x per 7-day window regardless of the anchor date.
    expect(report.weekly.schedule).toEqual([{ node: "tick", cron: "0 9 * * 1,3,5", firesPerWeek: 3 }]);
    expect(report.weekly.ticksPerWeek).toBe(3);
    expect(report.weekly.basis).toBe("schedule-cron");
    expect(report.weekly.calendarSlots).toBe(2);
    expect(report.weekly.projectedKnownUsd).toBeCloseTo(3 * 3.12, 6);
    // --week: the tick projection follows the weekly tick count.
    expect(report.ticks.count).toBe(3);
    expect(report.ticks.projectedKnownUsd).toBeCloseTo(3 * 3.12, 6);
  });

  test("no schedule node -> weekly basis falls back to calendar slots", async () => {
    seedWorkspace();
    seedCalendarSlots(2);
    writeWorkflow("adhoc", [
      { id: "watch", type: "trend-watch", in: {}, params: { expected_items: 5 } },
      { id: "note", type: "transform", in: { items: "watch.out" }, params: {} },
    ]);

    const report = await simulateWorkflow(WS, "adhoc", { week: true });
    expect(report.assumptions.fanOutItems).toBe(5);
    expect(report.assumptions.fanOutItemsSource).toContain("expected_items");
    expect(report.weekly.basis).toBe("calendar-slots");
    expect(report.weekly.ticksPerWeek).toBe(2);
    expect(report.ticks.count).toBe(2);
  });
});

describe("unknown pricing", () => {
  test("an unpriceable model is an explicit unknown line, never a silent $0", async () => {
    seedWorkspace();
    writeWorkflow("mystery", [
      { id: "tick", type: "schedule", params: { cron: "0 9 * * *" } },
      {
        id: "clip",
        type: "t2v",
        in: { prompt: "tick.out" },
        params: { model: "acme/mystery-video", durationSec: 5 },
      },
      {
        id: "anchor",
        type: "t2i",
        in: { prompt: "tick.out" },
        params: { model: "google/gemini-3-pro-image-preview" },
      },
    ]);

    const report = await simulateWorkflow(WS, "mystery", {});
    const clip = report.costs.perNode.find((n) => n.node === "clip")!;
    expect(clip.pricing).toBe("unknown");
    expect(clip.unitUsd).toBeNull();
    expect(clip.totalUsd).toBeNull();
    expect(report.costs.unknownPricing).toEqual([
      {
        node: "clip",
        type: "t2v",
        model: "acme/mystery-video",
        reason: expect.stringContaining("no video price entry"),
      },
    ]);
    // The known image node still totals; the unknown one is NOT counted as $0-known.
    expect(report.costs.tickKnownUsd).toBeCloseTo(0.04, 6);
    // Unknown pricing alone is NOT a blocking finding (keys/coverage are).
    expect(report.ok).toBe(true);
  });

  test("estimateNodeCost primitives: missing duration, LLM defaults, free post-ops", () => {
    const node = (over: Partial<WorkflowNode>): WorkflowNode =>
      parseWorkflowGraph({ name: "x", nodes: [{ id: "n", type: "t2i", ...over }] }).nodes[0]!;

    // Video model priced per-second but no duration -> unknown, names the gap.
    const noDuration = estimateNodeCost(node({ type: "t2v", params: { model: "kwaivgi/kling-v3.0-pro" } }));
    expect(noDuration.pricing).toBe("unknown");
    expect(noDuration.basis).toContain("durationSec");

    // LLM node without a model uses the engine default table entry.
    const llm = estimateNodeCost(node({ type: "generate-text", params: {} }));
    expect(llm.pricing).toBe("known");
    expect(llm.unitUsd).toBeCloseTo(llmCallCostUsd("google/gemini-2.5-flash")!, 6);

    // LLM node with an untabled model -> unknown.
    const exotic = estimateNodeCost(node({ type: "generate-text", params: { model: "acme/llm-9000" } }));
    expect(exotic.pricing).toBe("unknown");

    // Deterministic post-op is free, not unknown.
    const post = estimateNodeCost(node({ type: "remove-bg", params: {} }));
    expect(post.pricing).toBe("free");
    expect(post.unitUsd).toBe(0);
  });

  test("resolveAssumeItems precedence: explicit > expected_items > topics > default", () => {
    const graph = (params: Record<string, unknown>) =>
      parseWorkflowGraph({ name: "x", nodes: [{ id: "watch", type: "trend-watch", params }] });
    expect(resolveAssumeItems(graph({ topics: [{ id: "a" }, { id: "b" }] }), 7)).toEqual({
      items: 7,
      source: "--assume-items",
    });
    expect(resolveAssumeItems(graph({ expected_items: 5, topics: [{ id: "a" }] })).items).toBe(5);
    expect(resolveAssumeItems(graph({ topics: [{ id: "a" }, { id: "b" }] })).items).toBe(2);
    expect(resolveAssumeItems(parseWorkflowGraph({ name: "x", nodes: [] })).items).toBe(3);
  });
});

describe("missing keys + coverage gaps (blocking)", () => {
  const KEY = "FIRECRAWL_API_KEY";
  let savedKey: string | undefined;

  test("a web-scrape node without its connector key is a blocking missing-key finding", async () => {
    savedKey = process.env[KEY];
    delete process.env[KEY];
    try {
      seedWorkspace();
      writeWorkflow("scrapey", [
        { id: "tick", type: "schedule", params: { cron: "0 9 * * *" } },
        { id: "scrape", type: "web-scrape", in: {}, params: { mode: "search", query: "ralphy" } },
      ]);
      const report = await simulateWorkflow(WS, "scrapey", {});
      expect(report.environment.requiredKeys).toContain(KEY);
      expect(report.environment.missingKeys).toContain(KEY);
      expect(report.ok).toBe(false);
      expect(report.blocking.some((b) => b.id === "missing-key" && b.detail.includes(KEY))).toBe(true);
    } finally {
      if (savedKey !== undefined) process.env[KEY] = savedKey;
    }
  });

  test("an unknown (model, capability, provider) triple is a blocking coverage gap", async () => {
    seedWorkspace();
    writeWorkflow("gappy", [
      { id: "tick", type: "schedule", params: { cron: "0 9 * * *" } },
      {
        id: "anchor",
        type: "t2i",
        in: { prompt: "tick.out" },
        params: { model: "acme/mystery-image", provider: "elevenlabs" },
      },
    ]);
    // The elevenlabs connector key may be set in this environment — the
    // coverage gap is asserted independently of the key finding.
    const report = await simulateWorkflow(WS, "gappy", {});
    expect(report.ok).toBe(false);
    expect(report.environment.coverageGaps).toEqual([
      { model: "acme/mystery-image", capability: "image", provider: "elevenlabs" },
    ]);
    expect(report.blocking.some((b) => b.id === "coverage-gap")).toBe(true);
  });
});

// ─── Exit-code semantics (CLI smoke, spawned) ────────────────────────────────

describe("workflow simulate CLI exit codes", () => {
  const CLI = path.resolve(import.meta.dir, "..", "..", "cli", "index.ts");

  function seedCliRoot(nodes: unknown[]): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-simulate-cli-"));
    const ws = path.join(dir, ".ralphy", "workspaces", "default");
    fs.mkdirSync(path.join(ws, "workflows"), { recursive: true });
    fs.writeFileSync(path.join(ws, "workspace.json"), JSON.stringify({ slug: "default" }));
    fs.writeFileSync(
      path.join(ws, "workflows", "wf.json"),
      JSON.stringify({ version: "2.0", name: "wf", nodes }, null, 2),
    );
    return dir;
  }

  function runSimulate(dir: string, env: Record<string, string | undefined>) {
    const r = spawnSync(
      process.execPath,
      [CLI, "--cwd", dir, "workflow", "simulate", "default", "wf", "--assume-items", "2"],
      { encoding: "utf8", env: { ...process.env, NO_COLOR: "1", ...env }, timeout: 60_000 },
    );
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(r.stdout);
    } catch {
      /* non-JSON stdout — the assertion below will fail loudly */
    }
    return { status: r.status, json, stderr: r.stderr };
  }

  test("blocking finding (missing key) -> exit 1, report still printed", () => {
    const dir = seedCliRoot([
      { id: "tick", type: "schedule", params: { cron: "0 9 * * *" } },
      { id: "scrape", type: "web-scrape", in: {}, params: { mode: "search", query: "ralphy" } },
    ]);
    try {
      const r = runSimulate(dir, { FIRECRAWL_API_KEY: undefined });
      expect(r.status).toBe(1);
      expect(r.json?.ok).toBe(false);
      expect(Array.isArray(r.json?.blocking)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  test("clean graph -> exit 0 with the JSON report", () => {
    const dir = seedCliRoot([
      { id: "tick", type: "schedule", params: { cron: "0 9 * * *" } },
      { id: "note", type: "transform", in: { seed: "tick.out" }, params: {} },
    ]);
    try {
      const r = runSimulate(dir, {});
      expect(r.status).toBe(0);
      expect(r.json?.ok).toBe(true);
      expect(r.json?.workflow).toBe("wf");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
