// Node-level content-hash caching (#513) — ZERO network: paid nodes are
// mocked via deps.executorOverrides and report synthetic cost; the cache
// module + runner integration under test are the real ones.
//
// Covers: hit on identical inputs (executor not re-run, node-cached journal
// event shape, downstream reuse of the cached output), miss on param change /
// model swap / ref-CONTENT change (and hit on same content at a different
// path), missing-artifact fallback, --no-cache forced execution, resume
// treating node-cached as completed, farm-status surfacing, and the
// prune-oldest index cap.

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, runDir } from "../../cli/lib/paths.js";
import { createRun } from "../../cli/lib/run.js";
import { executeGraphRun, farmStatus } from "../../cli/lib/farm/runner.js";
import type { FarmDeps } from "../../cli/lib/farm/runner.js";
import {
  computeNodeCacheHash,
  lookupNodeCache,
  appendNodeCacheEntry,
  nodeCachePath,
  NODE_CACHE_MAX_ENTRIES,
  type NodeCacheEntry,
} from "../../cli/lib/farm/node-cache.js";
import type { NodeExecutor } from "../../cli/lib/workflow/executors/types.js";
import type { WorkflowGraph, WorkflowNode, WorkflowNodeType } from "../../cli/lib/schemas/workflow.js";

let tmp: TmpRoot;
afterEach(() => tmp?.cleanup());

const WS = "test";

function seedWorkspace(): void {
  tmp = makeTmpRoot("ralphy-node-cache");
  const dir = workspaceDir(WS);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ slug: WS }));
}

function node(id: string, type: WorkflowNodeType, over: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id,
    type,
    in: {},
    params: {},
    retry: { max: 0, backoff: "exponential" },
    on_fail: "halt",
    cache: "none",
    emit: true,
    ...over,
  };
}

const graphOf = (nodes: WorkflowNode[], name = "wf"): WorkflowGraph => ({ version: "2.0", name, nodes });

function readEvents(runId: string): Array<Record<string, unknown>> {
  return fs
    .readFileSync(path.join(runDir(WS, runId), "run-events.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

const noSleep: FarmDeps = { sleep: async () => {} };

/** A mocked paid executor: writes a real artifact file, reports $0.5. */
function makePaid(costUsd = 0.5): { exec: NodeExecutor; calls: number[] } {
  const calls: number[] = [];
  const exec: NodeExecutor = async (n, ctx) => {
    calls.push(1);
    const dir = path.join(workspaceDir(WS), "media");
    fs.mkdirSync(dir, { recursive: true });
    const artifact = path.join(dir, `${n.id}-${calls.length}.png`);
    fs.writeFileSync(artifact, `png-bytes-${String(n.params.prompt)}`);
    ctx.reportCost(costUsd);
    return { output: { path: artifact, slot: n.id }, artifactPath: artifact };
  };
  return { exec, calls };
}

async function run(runId: string, graph: WorkflowGraph, deps: FarmDeps) {
  await createRun({ id: runId, workspace: WS, title: runId, workflow: graph.name });
  return executeGraphRun(WS, runId, graph.name, graph, deps);
}

const cachedT2i = (params: Record<string, unknown>) =>
  node("gen", "t2i", { cache: "content-hash", params });

// ─── Runner integration ──────────────────────────────────────────────────────

describe("content-hash cache: runner integration (#513)", () => {
  test("hit on identical inputs: no re-execution, node-cached event shape, downstream reuse", async () => {
    seedWorkspace();
    const paid = makePaid();
    const seen: unknown[] = [];
    const consumer: NodeExecutor = async (_n, ctx) => {
      seen.push(ctx.inputs.x);
      return { output: "used" };
    };
    const graph = graphOf([
      cachedT2i({ prompt: "a fox", model: "m1" }),
      node("use", "generate-text", { in: { x: "gen.out" }, params: {} }),
    ]);
    const deps: FarmDeps = { ...noSleep, executorOverrides: { t2i: paid.exec, "generate-text": consumer } };

    const r1 = await run("run-1", graph, deps);
    expect(r1.status).toBe("complete");
    expect(paid.calls.length).toBe(1);
    expect(fs.existsSync(nodeCachePath(WS))).toBe(true);

    const r2 = await run("run-2", graph, deps);
    expect(r2.status).toBe("complete");
    // The paid executor did NOT run again.
    expect(paid.calls.length).toBe(1);

    // node-cached journal event shape.
    const cached = readEvents("run-2").find((e) => e.kind === "node-cached")!;
    expect(cached.node).toBe("gen");
    expect(cached.branch).toBeUndefined();
    expect(String(cached.hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(cached.costSavedUsd).toBe(0.5);
    const artifact = String(cached.artifactPath);
    expect(artifact.endsWith("gen-1.png")).toBe(true);
    expect((cached.output as { path: string }).path).toBe(artifact);
    expect(String(cached.message)).toContain("saved ~$0.50");
    // No node-started for the cached node in run-2 (it never executed).
    expect(readEvents("run-2").some((e) => e.kind === "node-started" && e.node === "gen")).toBe(false);

    // The downstream consumer received the SAME output object both runs.
    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual(seen[0]);

    // A cache hit spends $0; run-2's realized spend is zero.
    const report = farmStatus(WS);
    const row2 = report.runs.find((r) => r.id === "run-2")!;
    expect(row2.spendUsd).toBe(0);
    expect(row2.cacheHits).toBe(1);
    expect(row2.cacheSavedUsd).toBe(0.5);
    expect(report.cache).toEqual({ hits: 1, savedUsd: 0.5 });

    // Resume of run-2 treats node-cached as completed — nothing re-executes.
    const resumed = await executeGraphRun(WS, "run-2", "wf", graph, deps);
    expect(resumed.status).toBe("complete");
    expect(paid.calls.length).toBe(1);
    expect(readEvents("run-2").filter((e) => e.kind === "node-cached")).toHaveLength(1);
  });

  test("miss on param change and on model swap", async () => {
    seedWorkspace();
    const paid = makePaid();
    const deps: FarmDeps = { ...noSleep, executorOverrides: { t2i: paid.exec } };

    await run("run-1", graphOf([cachedT2i({ prompt: "a fox", model: "m1" })]), deps);
    expect(paid.calls.length).toBe(1);

    // Prompt change → miss.
    await run("run-2", graphOf([cachedT2i({ prompt: "a wolf", model: "m1" })]), deps);
    expect(paid.calls.length).toBe(2);

    // Model swap (same prompt) → miss.
    await run("run-3", graphOf([cachedT2i({ prompt: "a fox", model: "m2" })]), deps);
    expect(paid.calls.length).toBe(3);

    // Back to the original binding → hit (both prior entries in the index).
    const r4 = await run("run-4", graphOf([cachedT2i({ prompt: "a fox", model: "m1" })]), deps);
    expect(r4.status).toBe("complete");
    expect(paid.calls.length).toBe(3);
  });

  test("input digests are file CONTENT, not paths: content change = miss, same bytes elsewhere = hit", async () => {
    seedWorkspace();
    const refDir = path.join(workspaceDir(WS), "refs");
    fs.mkdirSync(refDir, { recursive: true });
    const refA = path.join(refDir, "seed-a.png");
    const refB = path.join(refDir, "seed-b.png");
    fs.writeFileSync(refA, "original-bytes");

    let producedPath = refA;
    const producer: NodeExecutor = async () => ({ output: producedPath });
    const paid = makePaid();
    const graph = graphOf([
      node("prod", "generate-text", { params: {} }),
      node("gen", "i2v", {
        cache: "content-hash",
        in: { first_frame: "prod.out" },
        params: { prompt: "animate", model: "m1" },
      }),
    ]);
    const deps: FarmDeps = { ...noSleep, executorOverrides: { "generate-text": producer, i2v: paid.exec } };

    await run("run-1", graph, deps);
    expect(paid.calls.length).toBe(1);

    // Same bytes at a DIFFERENT path → still a hit (content, not path).
    fs.writeFileSync(refB, "original-bytes");
    producedPath = refB;
    await run("run-2", graph, deps);
    expect(paid.calls.length).toBe(1);

    // New bytes at the same path → miss.
    fs.writeFileSync(refB, "reshot-bytes");
    await run("run-3", graph, deps);
    expect(paid.calls.length).toBe(2);
  });

  test("missing referenced artifact = miss: entry exists, file deleted, node re-executes", async () => {
    seedWorkspace();
    const paid = makePaid();
    const graph = graphOf([cachedT2i({ prompt: "a fox", model: "m1" })]);
    const deps: FarmDeps = { ...noSleep, executorOverrides: { t2i: paid.exec } };

    await run("run-1", graph, deps);
    expect(paid.calls.length).toBe(1);
    // Delete the cached artifact out from under the index.
    fs.rmSync(path.join(workspaceDir(WS), "media", "gen-1.png"));

    const r2 = await run("run-2", graph, deps);
    expect(r2.status).toBe("complete");
    expect(paid.calls.length).toBe(2); // fell back to execution
    expect(readEvents("run-2").some((e) => e.kind === "node-cached")).toBe(false);

    // The re-execution re-primed the cache: a third run hits again.
    await run("run-3", graph, deps);
    expect(paid.calls.length).toBe(2);
  });

  test("--no-cache forces execution even with a valid entry", async () => {
    seedWorkspace();
    const paid = makePaid();
    const graph = graphOf([cachedT2i({ prompt: "a fox", model: "m1" })]);
    const deps: FarmDeps = { ...noSleep, executorOverrides: { t2i: paid.exec } };

    await run("run-1", graph, deps);
    expect(paid.calls.length).toBe(1);

    const r2 = await run("run-2", graph, { ...deps, noCache: true });
    expect(r2.status).toBe("complete");
    expect(paid.calls.length).toBe(2);
    expect(readEvents("run-2").some((e) => e.kind === "node-cached")).toBe(false);
  });

  test("cache: none nodes never read or write the index", async () => {
    seedWorkspace();
    const paid = makePaid();
    const graph = graphOf([node("gen", "t2i", { cache: "none", params: { prompt: "a fox" } })]);
    const deps: FarmDeps = { ...noSleep, executorOverrides: { t2i: paid.exec } };
    await run("run-1", graph, deps);
    await run("run-2", graph, deps);
    expect(paid.calls.length).toBe(2);
    expect(fs.existsSync(nodeCachePath(WS))).toBe(false);
  });
});

// ─── Cache module unit behavior ──────────────────────────────────────────────

describe("node-cache module (#513)", () => {
  const entry = (hash: string, refs: string[]): NodeCacheEntry => ({
    hash,
    nodeType: "t2i",
    output: { path: refs[0] },
    artifactPath: refs[0],
    artifactRefs: refs,
    costSavedUsd: 0.1,
    ts: "2026-07-07T00:00:00.000Z",
  });

  test("hash is param-key-order independent and excludes the node id", () => {
    seedWorkspace();
    const a = computeNodeCacheHash({ type: "t2i", params: { prompt: "x", model: "m" } }, {});
    const b = computeNodeCacheHash({ type: "t2i", params: { model: "m", prompt: "x" } }, {});
    expect(a).toBe(b);
    // Different type → different hash.
    expect(computeNodeCacheHash({ type: "i2i", params: { prompt: "x", model: "m" } }, {})).not.toBe(a);
  });

  test("prune-oldest cap: the index never exceeds NODE_CACHE_MAX_ENTRIES", () => {
    seedWorkspace();
    const ref = path.join(workspaceDir(WS), "keep.png");
    fs.mkdirSync(workspaceDir(WS), { recursive: true });
    fs.writeFileSync(ref, "x");
    for (let i = 0; i < NODE_CACHE_MAX_ENTRIES + 1; i++) {
      appendNodeCacheEntry(WS, entry(`hash-${i}`, [ref]));
    }
    const lines = fs.readFileSync(nodeCachePath(WS), "utf8").split("\n").filter(Boolean);
    expect(lines.length).toBe(NODE_CACHE_MAX_ENTRIES);
    // The OLDEST entry was pruned; the newest survives.
    expect(lookupNodeCache(WS, "hash-0")).toBeNull();
    expect(lookupNodeCache(WS, `hash-${NODE_CACHE_MAX_ENTRIES}`)).not.toBeNull();
  });

  test("lookup is newest-wins on duplicate hashes and verifies every ref", () => {
    seedWorkspace();
    const dir = workspaceDir(WS);
    fs.mkdirSync(dir, { recursive: true });
    const oldRef = path.join(dir, "old.png");
    const newRef = path.join(dir, "new.png");
    const goneRef = path.join(dir, "gone.png");
    fs.writeFileSync(oldRef, "old");
    fs.writeFileSync(newRef, "new");
    appendNodeCacheEntry(WS, entry("h", [oldRef]));
    appendNodeCacheEntry(WS, entry("h", [newRef]));
    expect(lookupNodeCache(WS, "h")?.artifactRefs).toEqual([newRef]);
    // Any missing ref on the newest match = a miss.
    appendNodeCacheEntry(WS, entry("h", [newRef, goneRef]));
    expect(lookupNodeCache(WS, "h")).toBeNull();
  });
});
