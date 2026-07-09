// Copyright-hygiene + attribution PUBLISH GATE wiring (#543) — executor tests.
//
// Covers: a scraped-source embed FAILS the gate and BLOCKS publish regardless
// of trust level (invariant #4 — refuse, not warn), even with the readiness
// gate force-bypassed and trust at L2; a clean generated unit PASSES the gate;
// the attribution "Sources:" block is injected into the publish payload; the
// explicit opt-out suppresses it. Tmp-root + env hygiene per #545: env is
// snapshot/restored, cwd untouched, isolated .ralphy root.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { projectDir, workspaceDir, runDir } from "../../cli/lib/paths";
import { getExecutor, NodeExecutionError, type ExecutorContext } from "../../cli/lib/workflow/executors/index";
import { RunControlSignal } from "../../cli/lib/workflow/executors/control-flow";
import type { UnitManifest } from "../../cli/lib/schemas/unit";
import type { WorkflowNode, WorkflowNodeType } from "../../cli/lib/schemas/workflow";

const WS = "newsfarm";
const PROJECT = "news-ep-001";
const SLUG = "story-cut";
const RUN = "hygiene-run-1";

let tmp: TmpRoot;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-hygiene-543");
  for (const k of ["POSTIZ_API_KEY", "POSTIZ_BASE_URL"]) savedEnv[k] = process.env[k];
  process.env.POSTIZ_API_KEY = "test-key";
  process.env.POSTIZ_BASE_URL = "http://localhost:4200";
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  tmp.cleanup();
});

/** Seed registry + workspace + a unit dir. Trust defaults L0 unless overridden. */
function seed(opts: {
  trustLevel?: "L0" | "L1" | "L2";
  attribution?: Record<string, unknown>;
  manifest?: Partial<UnitManifest>;
} = {}): string {
  const wsDir = workspaceDir(WS);
  fs.mkdirSync(path.join(wsDir, "projects"), { recursive: true });
  fs.writeFileSync(
    path.join(wsDir, "workspace.json"),
    JSON.stringify({
      slug: WS,
      name: WS,
      ...(opts.trustLevel ? { trust: { level: opts.trustLevel } } : {}),
      ...(opts.attribution ? { attribution: opts.attribution } : {}),
    }),
  );
  fs.writeFileSync(
    path.join(tmp.dir, ".ralphy", "registry.json"),
    JSON.stringify({ projects: { [PROJECT]: { id: PROJECT, name: "Ep", workspace: WS } } }),
  );
  const unitDir = path.join(projectDir(PROJECT), "units", SLUG);
  fs.mkdirSync(unitDir, { recursive: true });
  const manifest = {
    slug: SLUG,
    format: "video",
    media: ["final.mp4"],
    created: new Date().toISOString(),
    ...opts.manifest,
  };
  fs.writeFileSync(path.join(unitDir, "unit.json"), JSON.stringify(manifest, null, 2));
  for (const m of manifest.media as string[]) fs.writeFileSync(path.join(unitDir, m), "bytes");
  fs.mkdirSync(runDir(WS, RUN), { recursive: true });
  return unitDir;
}

function node(params: Record<string, unknown>, type: WorkflowNodeType = "publish"): WorkflowNode {
  return { id: "pub-1", type, in: {}, params, retry: { max: 0, backoff: "exponential" }, on_fail: "halt", cache: "none", emit: true };
}

function ctx(over: Partial<ExecutorContext> = {}): ExecutorContext {
  return {
    workspace: WS,
    workspaceDir: workspaceDir(WS),
    artifactsDir: path.join(runDir(WS, RUN), "artifacts"),
    inputs: { unit: { projectId: PROJECT, slug: SLUG } },
    runId: RUN,
    runDir: runDir(WS, RUN),
    projectId: PROJECT,
    log: async () => {},
    reportCost: () => {},
    ...over,
  };
}

/** Seed a #427 `ship` readiness scorecard so gateReadiness passes UNFORCED. */
function seedShipScorecard(): void {
  const dir = projectDir(PROJECT);
  fs.mkdirSync(path.join(dir, "render"), { recursive: true });
  fs.writeFileSync(path.join(dir, "render", "final.mp4"), "fake-mp4");
  fs.writeFileSync(path.join(dir, "production-plan.json"), JSON.stringify({ contentMode: { mode: "motion-design" } }));
  fs.writeFileSync(
    path.join(dir, "eval.json"),
    JSON.stringify({
      schemaVersion: "1.0",
      gate: { mode: "native-video", nativeVideo: true, explicitCheapMode: false, shipReady: true, reason: "native pass" },
      meta: { video: "render/final.mp4", projectId: null, template: null, evaluatedAt: "2026-07-09T00:00:00Z", durationSec: 15, resolution: { w: 1080, h: 1920 }, fps: 30, codec: { video: "h264", audio: "aac" }, bitrateKbps: 6000 },
      declared: null,
      structure: { scenes: [], sceneCount: 5, avgSceneDurationSec: 3, minSceneDurationSec: 2, maxSceneDurationSec: 4, hookZone: { durationSec: 3, sceneCount: 2, transcript: "stop scrolling right now watch this", wordCount: 6 } },
      audio: { integratedLufs: -16, truePeakDb: -1.5, loudnessRangeLu: 8, deadAirSegments: [], voicePresentPct: 80 },
      captions: { available: true, wordCount: 40, wordsPerSecond: 2.6, densityWarn: false },
      vision: { sceneFindings: [] },
      findings: [],
      scoring: { weights: {}, penalties: {}, score: 90, verdict: "pass" },
    }),
  );
}

function runEvents(): Array<Record<string, unknown>> {
  const p = path.join(runDir(WS, RUN), "run-events.jsonl");
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

const mockPostiz = () =>
  (async (url: string) => {
    if (url.includes("/integrations")) return new Response(JSON.stringify([{ id: "int-tt-1", identifier: "tiktok" }]), { status: 200 });
    if (url.includes("/posts")) return new Response(JSON.stringify([{ id: "post-1" }]), { status: 200 });
    return new Response(JSON.stringify({ id: "media-1" }), { status: 200 });
  }) as typeof fetch;

// ─── the hard gate: a scraped-source embed blocks at ANY trust level ─────────

describe("copyright-hygiene gate blocks a scraped-source embed", () => {
  const embedded: Partial<UnitManifest> = {
    media: ["hero.jpg"],
    source_assets: ["artifacts/refs/scraped-source.jpg"],
  };

  for (const level of ["L1", "L2"] as const) {
    test(`FAIL parks the run at ${level} even with force_reason (invariant #4)`, async () => {
      seed({ trustLevel: level, manifest: embedded });
      const exec = getExecutor("publish")!;
      // force_reason bypasses the readiness floor + the trust gate — but the
      // hygiene fail must STILL block. That is the whole point of the guard.
      const n = node({ targets: ["tiktok"], force_reason: "operator says ship" });
      await expect(exec(n, ctx({ fetchImpl: mockPostiz() }))).rejects.toThrow(RunControlSignal);
      const ev = runEvents();
      expect(ev.some((e) => e.kind === "hygiene-blocked")).toBe(true);
      // Nothing published: no publish-success completion event was logged.
      expect(ev.some((e) => e.kind === "node-completed")).toBe(false);
    });
  }

  test("outside a run context, a FAIL refuses with NodeExecutionError (chat-driven)", async () => {
    seed({ manifest: embedded });
    const exec = getExecutor("publish")!;
    const n = node({ targets: ["tiktok"], force_reason: "op" });
    await expect(
      exec(n, ctx({ runId: undefined, fetchImpl: mockPostiz() })),
    ).rejects.toThrow(/publish-hygiene-fail|referenced, not embedded/);
  });
});

// ─── the clean path: all-generated passes + attribution injects ─────────────

describe("clean generated unit passes + attribution injection", () => {
  const clean = (over: Partial<UnitManifest> = {}): Partial<UnitManifest> => ({
    media: ["final.mp4"],
    source_assets: ["artifacts/videos/final.mp4"],
    provenance: {
      sources: [{ url: "https://news.example/a", outlet: "Example" }],
    },
    ...over,
  });

  test("all-generated media passes the gate + injects a Sources block", async () => {
    seed({ manifest: clean() });
    const exec = getExecutor("publish")!;
    const n = node({ targets: ["tiktok"], force_reason: "op" });
    const res = await exec(n, ctx({ fetchImpl: mockPostiz() }));
    const out = res.output as {
      hygiene: { verdict: string; flagged: number };
      attribution?: { descriptionBlock: string; sources: unknown[] };
    };
    expect(out.hygiene.verdict).toBe("pass");
    expect(out.hygiene.flagged).toBe(0);
    expect(out.attribution?.descriptionBlock).toContain("Sources:");
    expect(out.attribution?.descriptionBlock).toContain("https://news.example/a");
    expect(out.attribution?.sources).toHaveLength(1);
  });

  test("explicit opt-out suppresses the attribution block", async () => {
    seed({ attribution: { enabled: false }, manifest: clean() });
    const exec = getExecutor("publish")!;
    const n = node({ targets: ["tiktok"], force_reason: "op" });
    const res = await exec(n, ctx({ fetchImpl: mockPostiz() }));
    const out = res.output as { attribution?: unknown };
    expect(out.attribution).toBeUndefined();
  });

  test("requireOnPublish + no resolvable source → WARN routes to review (not a hard fail)", async () => {
    // Clean generated media (hygiene pass) + a ship scorecard (readiness passes
    // unforced) but the policy requires attribution and the unit has no source →
    // a WARN park routed to review, NOT a NodeExecutionError block.
    seed({
      trustLevel: "L2",
      attribution: { enabled: true, requireOnPublish: true },
      manifest: { media: ["final.mp4"], source_assets: ["artifacts/videos/final.mp4"] },
    });
    seedShipScorecard();
    const exec = getExecutor("publish")!;
    const n = node({ targets: ["tiktok"] }); // no force_reason: no human in the loop
    await expect(exec(n, ctx({ fetchImpl: mockPostiz() }))).rejects.toThrow(RunControlSignal);
    const ev = runEvents();
    const flagged = ev.find((e) => e.kind === "hygiene-flagged");
    expect(flagged).toBeDefined();
    expect(flagged!.attributionMissing).toBe(true);
    // A WARN park, not a hard block.
    expect(ev.some((e) => e.kind === "hygiene-blocked")).toBe(false);
  });

  test("attribution falls back to the project research-facts sources", async () => {
    // No provenance.sources on the unit — the fallback reads research-facts.
    seed({ manifest: clean({ provenance: undefined }) });
    const refsDir = path.join(projectDir(PROJECT), "artifacts", "refs");
    fs.mkdirSync(refsDir, { recursive: true });
    fs.writeFileSync(
      path.join(refsDir, "research-facts.json"),
      JSON.stringify({ version: 1, sources: [{ id: "1", url: "https://wire.example/x", title: "Wire" }] }),
    );
    const exec = getExecutor("publish")!;
    const n = node({ targets: ["tiktok"], force_reason: "op" });
    const res = await exec(n, ctx({ fetchImpl: mockPostiz() }));
    const out = res.output as { attribution?: { descriptionBlock: string } };
    expect(out.attribution?.descriptionBlock).toContain("https://wire.example/x");
    expect(out.attribution?.descriptionBlock).toContain("Wire");
  });
});
