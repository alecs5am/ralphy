// Publishing kill switch + safe-mode (#536) — ZERO network / ZERO model calls.
//
// Covers: mode enforcement per level (normal passes the trust gate, safe forces
// the approval park, freeze holds — asserted via gatePublishTrust + the chat
// verb publishUnit), global-vs-workspace precedence (a non-normal global wins),
// auto-trip on each of the three signals (spend / failure / policy) → trips to
// safe + would-notify, restart persistence (write mode → re-read is the same),
// the explicit-resume gate (the CLI refuses without a reason, succeeds with one
// + logs), and no-duplicate-on-release (freeze → resume → re-publish reuses the
// #531 ledger: 0 extra platform calls, same scheduleAt).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, projectDir, runDir } from "../../cli/lib/paths.js";
import { setGlobalConfigPath, resetGlobalConfigPath } from "../../cli/lib/global-config.js";
import {
  effectivePublishMode,
  readWorkspacePublishMode,
  setPublishMode,
  setGlobalPublishMode,
  evaluateAutoTrip,
  readAutoTripConfig,
  DEFAULT_AUTO_TRIP_CONFIG,
  readPublishModeAudit,
  publishModeStatus,
} from "../../cli/lib/farm/publish-mode.js";
import { gatePublishTrust } from "../../cli/lib/workflow/executors/publish.js";
import { RunControlSignal } from "../../cli/lib/workflow/executors/control-flow.js";
import { publishUnit } from "../../cli/lib/publish/publish.js";
import type { ExecutorContext } from "../../cli/lib/workflow/executors/types.js";
import type { WorkflowNode, WorkflowNodeType } from "../../cli/lib/schemas/workflow.js";
import type { UnitManifest } from "../../cli/lib/schemas/unit.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const WS = "killswitch";
const PROJECT = "ks-ep-001";
const RUN = "ks-run-1";
const SLUG = "hero-cut";

let tmp: TmpRoot;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ["POSTIZ_API_KEY", "POSTIZ_BASE_URL"]) savedEnv[k] = process.env[k];
  process.env.POSTIZ_API_KEY = "test-key";
  process.env.POSTIZ_BASE_URL = "http://localhost:4200";
});

afterEach(() => {
  resetGlobalConfigPath();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  tmp?.cleanup();
});

/** Seed the tmp root, workspace, registry, and an isolated global config file. */
function seed(): void {
  tmp = makeTmpRoot("ralphy-killswitch");
  const dir = workspaceDir(WS);
  fs.mkdirSync(path.join(dir, "projects"), { recursive: true });
  fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ name: WS, slug: WS }));
  fs.writeFileSync(
    path.join(tmp.dir, ".ralphy", "registry.json"),
    JSON.stringify({ projects: { [PROJECT]: { id: PROJECT, name: "Ep", workspace: WS } } }),
  );
  setGlobalConfigPath(path.join(tmp.dir, ".ralphy", "config.json"));
}

/** A ship-verdict L2 workspace-eval scorecard — so a `normal` trust gate would auto-pass. */
function seedShipEval(): void {
  fs.mkdirSync(projectDir(PROJECT), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir(PROJECT), "workspace-eval.json"),
    JSON.stringify({
      schemaVersion: "1.0",
      workspace: WS,
      projectId: PROJECT,
      criteria: [{ id: "hook", label: "hook", category: "test", check: "deterministic", verdict: "pass", score: 90, threshold: {}, findings: [] }],
      overall: { verdict: "ship", score: 95, summary: "test" },
    }),
  );
  // L2 trust: any ship-verdict unit auto-passes when mode is normal.
  fs.writeFileSync(path.join(workspaceDir(WS), "workspace.json"), JSON.stringify({ name: WS, slug: WS, trust: { level: "L2" } }));
}

function node(type: WorkflowNodeType = "publish", params: Record<string, unknown> = {}, id = "pub-1"): WorkflowNode {
  return { id, type, in: {}, params, retry: { max: 0, backoff: "exponential" }, on_fail: "halt", cache: "none", emit: true };
}

function ctx(over: Partial<ExecutorContext> = {}): ExecutorContext {
  fs.mkdirSync(runDir(WS, RUN), { recursive: true });
  return {
    workspace: WS,
    workspaceDir: workspaceDir(WS),
    artifactsDir: path.join(runDir(WS, RUN), "artifacts"),
    inputs: {},
    runId: RUN,
    runDir: runDir(WS, RUN),
    projectId: PROJECT,
    log: async () => {},
    reportCost: () => {},
    ...over,
  };
}

const ref = { projectId: PROJECT, slug: SLUG };

// ─── enforcement at the trust gate (node path) ────────────────────────────────

describe("gatePublishTrust — kill switch precedence", () => {
  test("normal: a ship-verdict L2 unit auto-passes (today's behavior unchanged)", async () => {
    seed();
    seedShipEval();
    const res = await gatePublishTrust(node(), ctx(), ref, false);
    expect(res.mode).toBe("auto-pass");
  });

  test("safe: forces the approval park even for an L2 auto-pass unit", async () => {
    seed();
    seedShipEval();
    setPublishMode(WS, "safe", { actor: "op", reason: "review the queue" });
    let parked: RunControlSignal | null = null;
    try {
      await gatePublishTrust(node(), ctx(), ref, false);
    } catch (e) {
      parked = e as RunControlSignal;
    }
    expect(parked).toBeInstanceOf(RunControlSignal);
    expect(parked!.kind).toBe("park-approval");
    expect(parked!.message).toContain("SAFE-MODE");
  });

  test("freeze: parks unconditionally — over force_reason (top authority)", async () => {
    seed();
    seedShipEval();
    setPublishMode(WS, "freeze", { actor: "op", reason: "incident" });
    let parked: RunControlSignal | null = null;
    try {
      // forced=true would normally short-circuit to a bypass; freeze wins.
      await gatePublishTrust(node({ force_reason: "ship it" }), ctx(), ref, true);
    } catch (e) {
      parked = e as RunControlSignal;
    }
    expect(parked).toBeInstanceOf(RunControlSignal);
    expect(parked!.kind).toBe("park-approval");
    expect(parked!.message).toContain("FROZEN");
  });

  test("safe yields to a human already in the loop (force_reason passes)", async () => {
    seed();
    seedShipEval();
    setPublishMode(WS, "safe", { actor: "op", reason: "review" });
    const res = await gatePublishTrust(node({ force_reason: "human bypass" }), ctx(), ref, true);
    expect(res.mode).toBe("forced");
  });
});

// ─── global-vs-workspace precedence ────────────────────────────────────────────

describe("effectivePublishMode precedence", () => {
  test("a non-normal GLOBAL wins over the workspace's own mode", () => {
    seed();
    setPublishMode(WS, "safe", { actor: "op", reason: "ws safe" });
    setGlobalPublishMode("freeze", WS, { actor: "op", reason: "global freeze" });
    const eff = effectivePublishMode(WS);
    expect(eff.mode).toBe("freeze");
    expect(eff.scope).toBe("global");
    expect(eff.workspaceMode).toBe("safe");
  });

  test("a normal GLOBAL falls through to the workspace mode", () => {
    seed();
    setPublishMode(WS, "safe", { actor: "op", reason: "ws safe" });
    // global left unset (normal)
    const eff = effectivePublishMode(WS);
    expect(eff.mode).toBe("safe");
    expect(eff.scope).toBe("workspace");
  });
});

// ─── restart persistence ───────────────────────────────────────────────────────

describe("restart persistence", () => {
  test("a written mode survives a fresh read (it is a file read)", () => {
    seed();
    setPublishMode(WS, "freeze", { actor: "op", reason: "hold" });
    // Simulate a restart: mode is on disk, re-read gives the same value.
    expect(readWorkspacePublishMode(WS)).toBe("freeze");
    expect(effectivePublishMode(WS).mode).toBe("freeze");
  });
});

// ─── auto-trip on each signal ───────────────────────────────────────────────────

describe("evaluateAutoTrip", () => {
  const cfg = DEFAULT_AUTO_TRIP_CONFIG;

  test("no signal crossed → no trip", () => {
    const d = evaluateAutoTrip(cfg, { spendFraction: 0.5, failureCount: 1, policyBreachCount: 0 });
    expect(d.trip).toBe(false);
    expect(d.signal).toBeNull();
  });

  test("spend signal trips (>= 90% of cap)", () => {
    const d = evaluateAutoTrip(cfg, { spendFraction: 0.95, failureCount: 0, policyBreachCount: 0 });
    expect(d.trip).toBe(true);
    expect(d.signal).toBe("spend");
  });

  test("failure signal trips (>= 10 unresolved)", () => {
    const d = evaluateAutoTrip(cfg, { spendFraction: null, failureCount: 12, policyBreachCount: 0 });
    expect(d.trip).toBe(true);
    expect(d.signal).toBe("failure");
  });

  test("policy signal trips (>= 3 breaching projects)", () => {
    const d = evaluateAutoTrip(cfg, { spendFraction: null, failureCount: 0, policyBreachCount: 3 });
    expect(d.trip).toBe(true);
    expect(d.signal).toBe("policy");
  });

  test("disabled config never trips", () => {
    const d = evaluateAutoTrip({ ...cfg, enabled: false }, { spendFraction: 1, failureCount: 99, policyBreachCount: 99 });
    expect(d.trip).toBe(false);
  });

  test("defaults are conservative + enabled (the safe default)", () => {
    seed();
    const c = readAutoTripConfig(WS);
    expect(c.enabled).toBe(true);
    expect(c.spendFraction).toBe(0.9);
    expect(c.failureCount).toBe(10);
    expect(c.policyBreachCount).toBe(3);
  });
});

// ─── the setter audit + status ─────────────────────────────────────────────────

describe("audit log (append-only)", () => {
  test("every change appends an actor/reason line", () => {
    seed();
    setPublishMode(WS, "safe", { actor: "alice", reason: "off-policy" });
    setPublishMode(WS, "normal", { actor: "bob", reason: "cleared" });
    const audit = readPublishModeAudit(WS);
    expect(audit.length).toBe(2);
    expect(audit[0]).toMatchObject({ scope: "workspace", mode: "safe", actor: "alice", reason: "off-policy" });
    expect(audit[1]).toMatchObject({ scope: "workspace", mode: "normal", actor: "bob" });
    const status = publishModeStatus(WS);
    expect(status.mode).toBe("normal");
    expect(status.lastChange).toMatchObject({ mode: "normal", actor: "bob" });
  });
});

// ─── the chat-verb freeze guard (publishUnit) ──────────────────────────────────

const INTEGRATIONS = [
  { id: "int-yt-1", identifier: "youtube" },
  { id: "int-tt-1", identifier: "tiktok" },
];
const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
function mockPostiz() {
  let postCount = 0;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    if (url.includes("/integrations")) return json(INTEGRATIONS);
    if (url.includes("/upload")) return json({ id: "media-1", path: "/uploads/media-1.mp4" });
    if (url.includes("/posts")) {
      postCount++;
      const intId = body?.posts?.[0]?.integration?.id as string;
      return json([{ id: `post-${intId}` }]);
    }
    throw new Error(`unrouted ${url}`);
  }) as typeof fetch;
  return { fetchImpl, posts: () => postCount };
}
function seedUnit(manifest: Partial<UnitManifest> = {}): string {
  const unitDir = path.join(projectDir(PROJECT), "units", SLUG);
  fs.mkdirSync(unitDir, { recursive: true });
  const full = { slug: SLUG, format: "video", media: ["final.mp4"], created: new Date().toISOString(), title: "Hero cut", blurb: "A demo unit.", ...manifest };
  fs.writeFileSync(path.join(unitDir, "unit.json"), JSON.stringify(full, null, 2));
  for (const m of full.media as string[]) fs.writeFileSync(path.join(unitDir, m), "media-bytes");
  return unitDir;
}

describe("chat-verb freeze guard (publishUnit)", () => {
  test("freeze: the chat verb refuses with a clear error", async () => {
    seed();
    seedUnit();
    setPublishMode(WS, "freeze", { actor: "op", reason: "hold" });
    await expect(
      publishUnit({ projectId: PROJECT, slug: SLUG, targets: ["tiktok"], workspace: WS, fetchImpl: mockPostiz().fetchImpl }),
    ).rejects.toThrow(/frozen for workspace "killswitch" \(#536\)/);
  });

  test("safe: the chat verb is a no-op (the invoking human IS the approval)", async () => {
    seed();
    seedUnit();
    setPublishMode(WS, "safe", { actor: "op", reason: "review" });
    const m = mockPostiz();
    const res = await publishUnit({ projectId: PROJECT, slug: SLUG, targets: ["tiktok"], workspace: WS, fetchImpl: m.fetchImpl });
    expect(res.results[0]!.status).toBe("published");
    expect(m.posts()).toBe(1);
  });
});

// ─── no-duplicate-on-release (#531 composition) ────────────────────────────────

describe("no-duplicate-on-release (freeze → resume → re-publish)", () => {
  test("a held post released after resume does NOT double-post and reuses the recorded scheduleAt", async () => {
    seed();
    seedUnit();
    const at = "2026-07-20T10:00:00.000Z";

    // 1) FREEZE — the chat-verb refuses (nothing is published).
    setPublishMode(WS, "freeze", { actor: "op", reason: "hold" });
    const mFrozen = mockPostiz();
    await expect(
      publishUnit({ projectId: PROJECT, slug: SLUG, targets: ["youtube"], scheduleAt: at, slot: "entry-cadence", workspace: WS, fetchImpl: mFrozen.fetchImpl }),
    ).rejects.toThrow(/frozen/);
    expect(mFrozen.posts()).toBe(0);

    // 2) RESUME — publish now lands, records the ledger entry at `at`.
    setPublishMode(WS, "normal", { actor: "op", reason: "cleared" });
    const m1 = mockPostiz();
    const first = await publishUnit({ projectId: PROJECT, slug: SLUG, targets: ["youtube"], scheduleAt: at, slot: "entry-cadence", workspace: WS, fetchImpl: m1.fetchImpl });
    expect(first.results[0]!.status).toBe("scheduled");
    expect(first.results[0]!.scheduleAt).toBe(at);
    expect(m1.posts()).toBe(1);

    // 3) A re-fire with a DIFFERENT sampled time skips (idempotent) and reuses
    //    the ORIGINAL recorded scheduleAt — zero extra platform calls (#531).
    const m2 = mockPostiz();
    const second = await publishUnit({ projectId: PROJECT, slug: SLUG, targets: ["youtube"], scheduleAt: "2026-07-20T13:37:00.000Z", slot: "entry-cadence", workspace: WS, fetchImpl: m2.fetchImpl });
    expect(second.results[0]!.status).toBe("idempotent-skip");
    expect(second.results[0]!.scheduleAt).toBe(at);
    expect(m2.posts()).toBe(0);
  });
});

// ─── explicit-resume gate (CLI) ────────────────────────────────────────────────

describe("farm resume — the explicit-resume gate (CLI)", () => {
  const cli = (...args: string[]) =>
    spawnSync("bun", ["run", CLI, "--cwd", tmp.dir, "--json", ...args], { encoding: "utf8" });

  test("resume WITHOUT a reason refuses; WITH a reason succeeds + logs the actor", () => {
    seed();
    setPublishMode(WS, "freeze", { actor: "op", reason: "hold" });

    const refused = cli("farm", "resume", "--workspace", WS);
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain("explicit human action");

    const ok = cli("farm", "resume", "--workspace", WS, "--reason", "reviewed the queue");
    expect(ok.status).toBe(0);
    const out = JSON.parse(ok.stdout);
    expect(out.mode).toBe("normal");
    expect(out.changed).toMatchObject({ mode: "normal", reason: "reviewed the queue" });
    expect(typeof out.changed.actor).toBe("string");
    expect(readWorkspacePublishMode(WS)).toBe("normal");
  });

  test("safe-mode / freeze CLI verbs set the mode + log actor/reason", () => {
    seed();
    const safe = cli("farm", "safe-mode", "--workspace", WS, "--reason", "spotted bad creative");
    expect(safe.status).toBe(0);
    expect(JSON.parse(safe.stdout).mode).toBe("safe");
    expect(readWorkspacePublishMode(WS)).toBe("safe");

    const freeze = cli("farm", "freeze", "--workspace", WS, "--reason", "incident");
    expect(freeze.status).toBe(0);
    expect(JSON.parse(freeze.stdout).mode).toBe("freeze");
  });
});
