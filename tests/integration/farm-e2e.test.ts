// Farm end-to-end simulator (#523) — the CI-gated executable definition of
// "the farm works". Mirrors the #431 agent-simulator pattern: a committed
// fixture bundle drives the REAL production loop (bundle → import → tick →
// ingest → produce → gate → park → approve → publish → analytics → report)
// with mocked spend and ZERO network.
//
// What is REAL here (so integration seams can't rot silently):
//   • the bundle round-trip (exportWorkspaceBundle → zip → importWorkspaceBundle)
//   • the farm runner (fireTick / executeGraphRun / resumeIncompleteRuns) and
//     its journal + farm-state trajectory
//   • the control-flow executors (schedule / gate / approval / calendar-slot /
//     budget-guard) — the real registered ones
//   • the #514 filter-reroute layer inside runMediaGeneration (the media node
//     runs the REAL t2i executor against a mocked connector)
//   • the #519 dead-letter quarantine + `retryNode`, the #521 upgrade, the
//     #518 `buildFarmReport` rollup
//
// What is MOCKED (at the executor / connector seam, never a real host):
//   • the LLM nodes (generate-text / generate-object), the ingestion node
//     (trend-watch), and the publish-side nodes (ralphy-unit / publish /
//     analytics-pull) via deps.executorOverrides
//   • the media connector via ctx.resolveMediaConnector
//
// ZERO NETWORK: a beforeAll fetch guard replaces globalThis.fetch with a throw.
// Any scenario that reaches a real host FAILS the whole file — a regression
// that bypasses a mock is caught, not silently tolerated. Assertions read ONLY
// public surfaces (bundle import result, CLI-lib verbs, journal files,
// farmStatus / buildFarmReport) — never a runner internal — so refactors stay
// honest.
//
// English-only on disk.

import { describe, test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, runDir, projectDir } from "../../cli/lib/paths.js";
import {
  exportWorkspaceBundle,
  importWorkspaceBundle,
  upgradeWorkspace,
} from "../../cli/lib/bundle.js";
import {
  fireTick,
  executeGraphRun,
  resumeIncompleteRuns,
  retryNode,
  readFarmState,
  loadGraphWorkflows,
  farmStatus,
  type FarmDeps,
} from "../../cli/lib/farm/runner.js";
import { buildFarmReport } from "../../cli/lib/farm/rollup.js";
import { listDeadLetters } from "../../cli/lib/farm/dead-letter.js";
import { recordRunApproval } from "../../cli/lib/spend.js";
import { TerminalProviderError } from "../../cli/lib/providers/shared.js";
import type { NodeExecutor, ExecutorContext } from "../../cli/lib/workflow/executors/types.js";
import type { WorkflowGraph } from "../../cli/lib/schemas/workflow.js";

const hasZip = Boolean(Bun.which("zip") && Bun.which("unzip"));
const FIXTURE = path.resolve(import.meta.dir, "../fixtures/farm");

// ─── Zero-network guard ────────────────────────────────────────────────────────
// Replace global fetch with a throw for the whole file. Every provider / publish
// / analytics call is mocked at the executor or connector seam, so a real fetch
// can only mean a regression bypassed a mock — fail loudly. Restored afterAll.
const realFetch = globalThis.fetch;
let fetchAttempts: string[] = [];
beforeAll(() => {
  globalThis.fetch = ((input: unknown) => {
    const url = typeof input === "string" ? input : String((input as { url?: unknown })?.url ?? input);
    fetchAttempts.push(url);
    throw new Error(`ZERO-NETWORK VIOLATION: a scenario attempted a real fetch to ${url}`);
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

let tmp: TmpRoot | undefined;
const scratch: string[] = [];
afterEach(() => {
  tmp?.cleanup();
  tmp = undefined;
  for (const f of scratch.splice(0)) fs.rmSync(f, { recursive: true, force: true });
  expect(fetchAttempts, `no real fetch may fire: ${fetchAttempts.join(", ")}`).toEqual([]);
  fetchAttempts = [];
});

const noSleep: Pick<FarmDeps, "sleep"> = { sleep: async () => {} };
const CLOCK = () => new Date("2026-07-07T09:00:00.000Z");

// ─── Fixture → workspace → bundle → import ──────────────────────────────────────

/** Seed a workspace from the committed fixture tree (the bundle's know-how). */
function seedFixtureWorkspace(slug: string): void {
  const dir = workspaceDir(slug);
  for (const sub of ["shared/refs", "projects", "workflows", "prompts"]) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ name: slug, slug }));
  fs.copyFileSync(path.join(FIXTURE, "pipeline.json"), path.join(dir, "workflows", "e2e-farm.json"));
  fs.copyFileSync(path.join(FIXTURE, "evaluators.json"), path.join(dir, "evaluators.json"));
  fs.copyFileSync(path.join(FIXTURE, "STYLE_LOCK.md"), path.join(dir, "STYLE_LOCK.md"));
  fs.copyFileSync(path.join(FIXTURE, "calendar.json"), path.join(dir, "calendar.json"));
  fs.cpSync(path.join(FIXTURE, "prompts"), path.join(dir, "prompts"), { recursive: true });
}

/**
 * The real bundle round-trip the issue asks for: seed a source workspace from
 * the fixture, export it to a scratch zip, import THAT zip as a fresh farm
 * workspace. Returns the imported workspace slug + its graph.
 */
function importFixtureBundle(opts: { version?: string } = {}): { ws: string; graph: WorkflowGraph } {
  seedFixtureWorkspace("fixture-src");
  const zip = path.join(tmp!.dir, `bundle-${opts.version ?? "1"}.zip`);
  exportWorkspaceBundle("fixture-src", zip, { version: opts.version });
  // Import under a distinct slug (import never overwrites the source).
  // allowMissingKeys downgrades the publish node's POSTIZ_* key requirement to
  // a warning — this e2e mocks the publish/analytics executors, so the keys are
  // never read (and CI only sets OPENROUTER/ELEVENLABS placeholders).
  const result = importWorkspaceBundle(zip, { as: "farm-e2e", allowMissingKeys: true });
  expect(result.workflows).toContain("e2e-farm");
  // The media node targets project "farm-e2e-001" (params.project). Create it
  // under the imported workspace so resolveProject() resolves + finds it (the
  // filesystem-scan path in projectWorkspace, no registry entry needed).
  fs.mkdirSync(path.join(workspaceDir("farm-e2e"), "projects", "farm-e2e-001", "artifacts"), {
    recursive: true,
  });
  const wf = loadGraphWorkflows("farm-e2e").find((g) => g.name === "e2e-farm");
  expect(wf, "the imported bundle carries the e2e-farm graph").toBeTruthy();
  return { ws: "farm-e2e", graph: wf!.graph };
}

// ─── Mocked executors + connector (the paid / networked seams) ──────────────────

interface Mocks {
  overrides: Partial<Record<string, NodeExecutor>>;
  ctx: Partial<ExecutorContext>;
  unitCalls: number;
  publishCalls: number;
  analyticsCalls: number;
  imageModels: string[];
}

/**
 * Build the mock set. `verdict` drives the judge (gate input). `imageFailure`
 * (optional) makes the FIRST t2i connector call throw it — the reroute /
 * quarantine scenarios use this to exercise real failure handling.
 */
function makeMocks(opts: { verdict?: string; imageFailure?: () => Error } = {}): Mocks {
  const state = { unitCalls: 0, publishCalls: 0, analyticsCalls: 0, imageModels: [] as string[] };

  const trend: NodeExecutor = async () => ({ output: [{ title: "fixture item", url: "https://example.test/x" }] });
  const write: NodeExecutor = async () => ({ output: "a deadpan product review, hook first" });
  const judge: NodeExecutor = async () => ({ output: { verdict: opts.verdict ?? "ship", score: 8 } });
  const unit: NodeExecutor = async (node) => {
    state.unitCalls++;
    return { output: { projectId: "farm-e2e-001", slug: String(node.params.slug ?? "unit") } };
  };
  const publish: NodeExecutor = async () => {
    state.publishCalls++;
    return { output: { allFailed: false, results: [{ target: "tiktok", status: "scheduled", postId: "mock-1" }] } };
  };
  const analytics: NodeExecutor = async () => {
    state.analyticsCalls++;
    return { output: { fetched: 1, skipped: 0, units: [{ slug: "fixture-unit" }] } };
  };

  // A mocked media connector: first call optionally fails; the recovery hop
  // (a different model chosen by the real #514 reroute layer) succeeds.
  let failuresLeft = opts.imageFailure ? [opts.imageFailure()] : [];
  const connector = {
    id: "openrouter",
    label: "Mock",
    envVar: "OPENROUTER_API_KEY",
    signupUrl: "",
    capabilities: ["image", "video", "voice", "music", "sfx"],
    available: () => true,
    generateImage: async (input: { projectId: string; slot: string; model?: string }) => {
      state.imageModels.push(input.model ?? "default");
      const next = failuresLeft.shift();
      if (next) throw next;
      const dir = path.join(projectDir(input.projectId), "artifacts", "images");
      fs.mkdirSync(dir, { recursive: true });
      const localPath = path.join(dir, `${input.slot}.png`);
      fs.writeFileSync(localPath, "png-bytes");
      return { localPath, costUsd: 0.02, latencyMs: 5, model: input.model ?? "mock/default-image" };
    },
  };

  return {
    overrides: {
      "trend-watch": trend,
      "generate-text": write,
      "generate-object": judge,
      "ralphy-unit": unit,
      publish,
      "analytics-pull": analytics,
    },
    ctx: { resolveMediaConnector: () => connector as never },
    get unitCalls() {
      return state.unitCalls;
    },
    get publishCalls() {
      return state.publishCalls;
    },
    get analyticsCalls() {
      return state.analyticsCalls;
    },
    imageModels: state.imageModels,
  };
}

function deps(mocks: Mocks, over: Partial<FarmDeps> = {}): FarmDeps {
  return { ...noSleep, now: CLOCK, executorOverrides: mocks.overrides, ctx: mocks.ctx, ...over };
}

function readEvents(ws: string, runId: string): Array<Record<string, unknown>> {
  return fs
    .readFileSync(path.join(runDir(ws, runId), "run-events.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}
const kinds = (ws: string, runId: string) => readEvents(ws, runId).map((e) => String(e.kind));
const completed = (ws: string, runId: string) =>
  readEvents(ws, runId)
    .filter((e) => e.kind === "node-completed")
    .map((e) => String(e.node));

// A run-approval identical to what `ralphy run approve` records (public state).
const approve = (runId: string) =>
  recordRunApproval(runId, { budgetCapUsd: 50, reason: "e2e: approve the finished unit" });

// The gemini output-safety filter error the built-in rule reroutes to gpt.
const IMAGE_SAFETY = () =>
  new TerminalProviderError(
    "OpenRouter image failed: the model returned IMAGE_SAFETY for this prompt",
  );

// ═══ Golden path ═════════════════════════════════════════════════════════════

describe("farm e2e (#523): golden path", () => {
  test.skipIf(!hasZip)(
    "import -> tick -> gated -> L0 park -> approve -> publish -> analytics; report numbers match exactly",
    async () => {
      tmp = makeTmpRoot("farm-e2e-golden");
      const { ws, graph } = importFixtureBundle();
      const mocks = makeMocks({ verdict: "ship" });

      // ── Tick 1: runs through the gate, then PARKS at the approval node (L0). ──
      const t1 = await fireTick(ws, "e2e-farm", graph, deps(mocks), { node: "tick", cron: "0 9 * * *" });
      const runId = t1.runId;
      expect(t1.status).toBe("parked-approval");
      expect(readFarmState(ws, runId)?.status).toBe("parked-approval");

      // Everything up to (and excluding) the approval ran; the gate shipped.
      expect(completed(ws, runId)).toEqual(["tick", "trends", "write", "image", "judge", "gate", "unit"]);
      const parked = readEvents(ws, runId).find((e) => e.kind === "run-parked");
      expect(parked?.node).toBe("approve");
      // The gate shipped on the judge's ship verdict (pruned no repair branch here).
      expect(readEvents(ws, runId).some((e) => e.kind === "run-halted")).toBe(false);
      // The approval inbox pack landed via the #489 mechanism.
      const inbox = fs.readdirSync(path.join(runDir(ws, runId), "agent-inbox")).filter((f) => f.endsWith(".json"));
      expect(inbox.length).toBe(1);
      // Publish / analytics have NOT run yet (parked before them).
      expect(mocks.publishCalls).toBe(0);
      expect(mocks.analyticsCalls).toBe(0);

      // ── Approve programmatically (== `ralphy run approve`), then tick 2 (resume). ──
      await approve(runId);
      const resumed = await resumeIncompleteRuns(ws, deps(mocks));
      expect(resumed[0]!.status).toBe("complete");
      expect(readFarmState(ws, runId)?.status).toBe("complete");

      // The full loop closed: approval -> calendar-slot -> publish -> analytics.
      expect(completed(ws, runId)).toEqual([
        "tick", "trends", "write", "image", "judge", "gate", "unit", "approve", "slot", "publish", "analytics",
      ]);
      expect(mocks.unitCalls).toBe(1);
      expect(mocks.publishCalls).toBe(1);
      expect(mocks.analyticsCalls).toBe(1);
      // Real media node produced a real artifact under the project tree ($0.02 mock spend).
      expect(fs.existsSync(path.join(projectDir("farm-e2e-001"), "artifacts", "images", "hero.png"))).toBe(true);

      // ── `farm report` numbers match EXACTLY. ──────────────────────────────
      const report = buildFarmReport(ws);
      expect(report.totals.ticks).toBe(1);
      expect(report.totals.runs).toBe(1);
      expect(report.totals.unitsProduced).toBe(1); // one ralphy-unit completion
      expect(report.totals.unitsGated).toBe(1); // one approval completion
      expect(report.totals.unitsPublished).toBe(2); // publish + analytics-pull are PUBLISH_NODE_TYPES
      expect(report.totals.spendUsd).toBe(0.02); // the one mocked media call
      expect(report.rates.nodeFailures).toBe(0);
      expect(report.rates.nodeReroutes).toBe(0);
      expect(report.rates.nodeQuarantines).toBe(0);
      expect(report.rates.failureRate).toBe(0);
      expect(report.partial).toBe(false);
      // The approval latency sample exists (park -> resume-that-cleared-it).
      expect(report.durations.approvalLatencySamples).toBe(1);

      // farmStatus agrees on the realized spend (a second public surface).
      expect(farmStatus(ws).runs.find((r) => r.id === runId)?.spendUsd).toBe(0.02);
    },
  );
});

// ═══ Failure scenarios ═══════════════════════════════════════════════════════

describe("farm e2e (#523): budget-guard halt", () => {
  test.skipIf(!hasZip)("a run-ledger cap below realized spend halts a paid node pre-flight", async () => {
    tmp = makeTmpRoot("farm-e2e-budget");
    const { ws, graph } = importFixtureBundle();
    const mocks = makeMocks({ verdict: "ship" });

    // Execute directly against a pre-approved run with a TINY cap (fireTick
    // derives the id from the clock; executeGraphRun lets us pre-seed the id).
    const { createRun } = await import("../../cli/lib/run.js");
    await createRun({ id: "budget-run", workspace: ws, title: "budget", workflow: "e2e-farm" });
    await recordRunApproval("budget-run", { budgetCapUsd: 0.01, reason: "tiny cap" });

    const outcome = await executeGraphRun(ws, "budget-run", "e2e-farm", graph, deps(mocks));
    // image (t2i) spends $0.02 >= cap $0.01 → the next paid node is blocked
    // pre-flight and the run halts on budget.
    expect(outcome.status).toBe("halted-budget");
    expect(readFarmState(ws, "budget-run")?.status).toBe("halted-budget");
    const halted = readEvents(ws, "budget-run").find((e) => e.kind === "run-halted");
    expect(String(halted?.reason)).toContain("cap");
    // The gate / approval never ran (halted mid-graph after the paid node).
    expect(completed(ws, "budget-run")).not.toContain("gate");
    expect(mocks.publishCalls).toBe(0);
  });
});

describe("farm e2e (#523): reroute-on-filter (#514)", () => {
  test.skipIf(!hasZip)(
    "a gemini image-safety filter reroutes ONCE to gpt via the real reroute layer; run completes",
    async () => {
      tmp = makeTmpRoot("farm-e2e-reroute");
      const { ws, graph } = importFixtureBundle();
      // The first t2i connector call fails with IMAGE_SAFETY (gemini output
      // filter); the built-in `gemini-image-safety-output` rule reroutes to
      // openai/gpt-5.4-image-2, which the mock connector then satisfies.
      const mocks = makeMocks({ verdict: "ship", imageFailure: IMAGE_SAFETY });

      const t1 = await fireTick(ws, "e2e-farm", graph, deps(mocks), { node: "tick", cron: "0 9 * * *" });
      const runId = t1.runId;
      // The run still parks at approval (the reroute recovered the media node).
      expect(t1.status).toBe("parked-approval");

      // The real #514 layer swapped the model and journaled a node-rerouted event.
      const reroute = readEvents(ws, runId).find((e) => e.kind === "node-rerouted");
      expect(reroute, "the media node rerouted on the filter failure").toBeTruthy();
      expect(reroute).toMatchObject({
        node: "image",
        from: "google/gemini-3-pro-image-preview",
        to: "openai/gpt-5.4-image-2",
        ruleId: "gemini-image-safety-output",
        errorClass: "safety-output",
      });
      // Exactly two connector calls: the failed gemini one + the gpt recovery hop.
      expect(mocks.imageModels).toEqual(["google/gemini-3-pro-image-preview", "openai/gpt-5.4-image-2"]);
      // image still completed (the recovery hop) so the gate + unit ran.
      expect(completed(ws, runId)).toContain("image");
      expect(completed(ws, runId)).toContain("gate");
      // Exactly ONE reroute hop is journaled (the #514 one-hop bound).
      expect(readEvents(ws, runId).filter((e) => e.kind === "node-rerouted")).toHaveLength(1);
      // The run recovered — it did NOT quarantine or halt on the filter error.
      expect(readEvents(ws, runId).some((e) => e.kind === "node-quarantined")).toBe(false);
      expect(readEvents(ws, runId).some((e) => e.kind === "run-halted")).toBe(false);
    },
  );
});

describe("farm e2e (#523): quarantine + farm retry (#519)", () => {
  test.skipIf(!hasZip)(
    "a permanent-class media failure quarantines the node; farm retry re-executes it and resolves the entry",
    async () => {
      tmp = makeTmpRoot("farm-e2e-retry");
      const { ws, graph } = importFixtureBundle();

      // A generic content-policy failure with NO matching reroute rule for the
      // image model → the runner short-circuits retries (permanent filter class)
      // and quarantines. on_fail is halt (default) → the run halts.
      const failing = makeMocks({
        verdict: "ship",
        imageFailure: () =>
          new TerminalProviderError("OpenRouter 400: prohibited content flagged by the safety system"),
      });
      const t1 = await fireTick(ws, "e2e-farm", graph, deps(failing), { node: "tick", cron: "0 9 * * *" });
      const runId = t1.runId;
      expect(t1.status).toBe("halted-failure");

      // The node was quarantined into the workspace dead-letter store.
      const quarantined = readEvents(ws, runId).find((e) => e.kind === "node-quarantined");
      expect(quarantined?.node).toBe("image");
      const deadLetters = listDeadLetters(ws);
      expect(deadLetters.map((d) => d.node)).toContain("image");
      expect(deadLetters.find((d) => d.node === "image")?.resolved).toBe(false);

      // ── farm retry: a fresh mock connector that SUCCEEDS this time. ────────
      const healthy = makeMocks({ verdict: "ship" });
      const retry = await retryNode(ws, runId, "e2e-farm", graph, "image", deps(healthy));
      // The retry invalidated image + its transitive consumers, re-ran the node,
      // and (with no approval yet) the run parks at the approval node.
      expect(retry.node).toBe("image");
      expect(retry.invalidated).toContain("image");
      // image feeds `unit` (in.media = image.image); unit is a transitive consumer.
      expect(retry.invalidated).toContain("unit");
      expect(retry.status).toBe("parked-approval");
      expect(retry.quarantineResolved).toBe(true);
      // The dead-letter entry now folds to resolved.
      expect(listDeadLetters(ws).find((d) => d.node === "image")).toBeUndefined();
      expect(listDeadLetters(ws, { includeResolved: true }).find((d) => d.node === "image")?.resolved).toBe(true);
    },
  );
});

describe("farm e2e (#523): kill-and-resume mid-tick", () => {
  test.skipIf(!hasZip)(
    "a crash after N nodes leaves a journal a fresh runner resumes without re-executing completed nodes",
    async () => {
      tmp = makeTmpRoot("farm-e2e-resume");
      const { ws, graph } = importFixtureBundle();
      const mocks = makeMocks({ verdict: "ship" });

      // Session 1: stop between nodes after 4 completions (tick, trends, write,
      // image) — the same journal a kill -9 mid-tick leaves behind.
      let count = 0;
      const t1 = await fireTick(ws, "e2e-farm", graph, {
        ...deps(mocks),
        onEvent: (_r, kind) => {
          if (kind === "node-completed") count++;
        },
        shouldStop: () => count >= 4,
      });
      const runId = t1.runId;
      expect(t1.status).toBe("running"); // stopped between nodes, farm-state stays running
      expect(completed(ws, runId)).toEqual(["tick", "trends", "write", "image"]);
      // The single paid media call happened exactly once so far.
      expect(mocks.imageModels).toEqual(["google/gemini-3-pro-image-preview"]);

      // Session 2: a FRESH runner over the SAME journal. Completed nodes are NOT
      // re-executed — it continues from judge and parks at approval.
      const t2 = await executeGraphRun(ws, runId, "e2e-farm", graph, deps(mocks));
      expect(t2.status).toBe("parked-approval");
      // Still exactly one image call across BOTH sessions (no re-execution).
      expect(mocks.imageModels).toEqual(["google/gemini-3-pro-image-preview"]);
      // Each completed node appears exactly once in the journal.
      const imageCompletions = readEvents(ws, runId).filter(
        (e) => e.kind === "node-completed" && e.node === "image",
      );
      expect(imageCompletions).toHaveLength(1);

      // Approve + final resume closes the loop over the same journal.
      await approve(runId);
      const t3 = await resumeIncompleteRuns(ws, deps(mocks));
      expect(t3[0]!.status).toBe("complete");
      expect(completed(ws, runId)).toEqual([
        "tick", "trends", "write", "image", "judge", "gate", "unit", "approve", "slot", "publish", "analytics",
      ]);
    },
  );
});

// ═══ Upgrade mid-lifecycle (#521) ════════════════════════════════════════════

describe("farm e2e (#523): upgrade mid-lifecycle (#521)", () => {
  test.skipIf(!hasZip)(
    "a completed run's workspace upgrades to a newer bundle version (know-how replaced, runtime state kept)",
    async () => {
      tmp = makeTmpRoot("farm-e2e-upgrade");
      const { ws, graph } = importFixtureBundle({ version: "1.0.0" });
      const mocks = makeMocks({ verdict: "ship" });

      // Run one tick to completion so there is runtime state (a run + journal).
      const t1 = await fireTick(ws, "e2e-farm", graph, deps(mocks), { node: "tick", cron: "0 9 * * *" });
      await approve(t1.runId);
      await resumeIncompleteRuns(ws, deps(mocks));
      expect(readFarmState(ws, t1.runId)?.status).toBe("complete");

      // Build a NEWER bundle of the SAME lineage: re-export the source workspace
      // (its bundleId is persisted) with a changed prompt + bumped version.
      fs.writeFileSync(
        path.join(workspaceDir("fixture-src"), "prompts", "script.md"),
        "Write a punchier deadpan review hook for {{topic}} (v2).\n",
      );
      const v2zip = path.join(tmp.dir, "bundle-2.zip");
      exportWorkspaceBundle("fixture-src", v2zip, { version: "1.1.0" });

      // allowUnknownLineage: importWorkspaceBundle does not persist the
      // bundleId onto the imported workspace.json, so the deployed lineage
      // reads as unknown — opt in to upgrade in place (a noticed gap; see the
      // test report). allowMissingKeys downgrades the POSTIZ_* key requirement.
      const result = upgradeWorkspace(ws, v2zip, {
        allowUnknownLineage: true,
        allowMissingKeys: true,
      });
      expect(result.applied).toBe(true);
      expect(result.preview.fromVersion).toBe("1.0.0");
      expect(result.preview.toVersion).toBe("1.1.0");
      // Know-how changed (the prompt); the diff names the prompts class.
      expect(result.preview.diff.some((d) => d.class === "prompts")).toBe(true);
      // Runtime state survived: the completed run's journal is still there.
      expect(readFarmState(ws, t1.runId)?.status).toBe("complete");
      expect(fs.existsSync(path.join(runDir(ws, t1.runId), "run-events.jsonl"))).toBe(true);
      // The new know-how is on disk; the prior copy survives in the rollback
      // snapshot (the <ws>.prev tree the upgrade leaves for rollback).
      const promptV2 = fs.readFileSync(path.join(workspaceDir(ws), "prompts", "script.md"), "utf8");
      expect(promptV2).toContain("punchier");
      const snap = result.rollbackSnapshot;
      expect(fs.existsSync(path.join(snap, "prompts", "script.md"))).toBe(true);
      // The prior prompt is preserved verbatim in the snapshot (append-only history).
      expect(fs.readFileSync(path.join(snap, "prompts", "script.md"), "utf8")).not.toContain("punchier");
    },
  );
});
