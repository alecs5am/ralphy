// Trust ladder (#505) — earned auto-publish per workspace. ZERO network.
//
// Covers: the decideAutoPass level matrix (L0 parks, L1 thresholded, L2
// ship-only) + the never-over-a-failed/warn-gate invariant (#4) at every
// level, the approval-node + publish-node gating, the append-only audit
// trail, the agreement math (rate + streak), the promotion suggestion, the
// demotion-on-reject path, the `workspace update` / `workspace trust` verbs,
// and the bundle trustDefault applied at import.

import { describe, test, expect, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, projectDir, runDir } from "../../cli/lib/paths.js";
import { createRun } from "../../cli/lib/run.js";
import { recordRunApproval } from "../../cli/lib/spend.js";
import { importWorkspaceBundle } from "../../cli/lib/bundle.js";
import {
  DEFAULT_TRUST_CONFIG,
  PROMOTION_AGREEMENT_RATE,
  readTrustConfig,
  writeTrustConfig,
  readProjectEval,
  decideAutoPass,
  appendTrustAudit,
  readTrustAudit,
  hasAutoPassAudit,
  readAgreementSamples,
  agreementStats,
  promotionSuggestion,
  recordTrustDecision,
  trustStatus,
  type TrustConfig,
  type TrustAgreementSample,
} from "../../cli/lib/trust.js";
import { checkPublishTrust } from "../../cli/lib/publish/publish.js";
import { approvalExecutor, RunControlSignal } from "../../cli/lib/workflow/executors/control-flow.js";
import { gatePublishTrust } from "../../cli/lib/workflow/executors/publish.js";
import type { ExecutorContext } from "../../cli/lib/workflow/executors/types.js";
import type { WorkflowNode, WorkflowNodeType } from "../../cli/lib/schemas/workflow.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const WS = "trusty";
const PROJECT = "trusty-ep-001";
const RUN = "trust-run-1";

let tmp: TmpRoot;
const scratchDirs: string[] = [];
afterEach(() => {
  tmp?.cleanup();
  for (const d of scratchDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function seed(trust?: Partial<TrustConfig>): void {
  tmp = makeTmpRoot("ralphy-trust");
  const dir = workspaceDir(WS);
  fs.mkdirSync(path.join(dir, "projects"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "workspace.json"),
    JSON.stringify({ name: WS, slug: WS, ...(trust ? { trust } : {}) }),
  );
  fs.writeFileSync(
    path.join(tmp.dir, ".ralphy", "registry.json"),
    JSON.stringify({ projects: { [PROJECT]: { id: PROJECT, name: "Ep", workspace: WS } } }),
  );
}

/** Write a #469 workspace-eval scorecard for the project. */
function seedEval(over: {
  verdict?: string;
  score?: number | null;
  criteria?: Array<{ id: string; verdict: string }>;
}): void {
  fs.mkdirSync(projectDir(PROJECT), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir(PROJECT), "workspace-eval.json"),
    JSON.stringify({
      schemaVersion: "1.0",
      workspace: WS,
      projectId: PROJECT,
      criteria: (over.criteria ?? [{ id: "hook", verdict: "pass" }]).map((c) => ({
        ...c,
        label: c.id,
        category: "test",
        check: "deterministic",
        score: 90,
        threshold: {},
        findings: [],
      })),
      overall: { verdict: over.verdict ?? "ship", score: over.score === undefined ? 90 : over.score, summary: "test" },
    }),
  );
}

function evalRead() {
  return readProjectEval(PROJECT);
}

function node(type: WorkflowNodeType = "approval", params: Record<string, unknown> = {}, id = "gate-1"): WorkflowNode {
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

function runEvents(): Array<Record<string, unknown>> {
  const p = path.join(runDir(WS, RUN), "run-events.jsonl");
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

const sample = (decision: "approve" | "reject", verdict: string): TrustAgreementSample => ({
  at: "2026-07-06T00:00:00.000Z",
  decision,
  verdict,
  match: (decision === "approve") === (verdict === "ship"),
});

// ─── decideAutoPass (the level matrix + invariant #4) ────────────────────────

describe("decideAutoPass", () => {
  test("defaults: every workspace starts at L0 with an 80 threshold", () => {
    seed();
    expect(readTrustConfig(WS)).toEqual(DEFAULT_TRUST_CONFIG);
    expect(DEFAULT_TRUST_CONFIG).toMatchObject({
      level: "L0",
      autoPublishScore: 80,
      promotionStreak: 10,
      demoteOnReject: true,
    });
  });

  test("L0 never auto-passes, even on a perfect scorecard", () => {
    seed({ level: "L0" });
    seedEval({ verdict: "ship", score: 100 });
    const d = decideAutoPass(readTrustConfig(WS), evalRead(), PROJECT);
    expect(d.autoPass).toBe(false);
    expect(d.reason).toContain("L0");
  });

  test("L1 auto-passes at/above the threshold, parks below and on a missing score", () => {
    seed({ level: "L1", autoPublishScore: 80 });
    seedEval({ verdict: "ship", score: 80 });
    expect(decideAutoPass(readTrustConfig(WS), evalRead(), PROJECT).autoPass).toBe(true);
    seedEval({ verdict: "ship", score: 79 });
    const below = decideAutoPass(readTrustConfig(WS), evalRead(), PROJECT);
    expect(below.autoPass).toBe(false);
    expect(below.reason).toContain("below the L1 auto-publish threshold");
    seedEval({ verdict: "ship", score: null });
    expect(decideAutoPass(readTrustConfig(WS), evalRead(), PROJECT).autoPass).toBe(false);
  });

  test("L2 auto-passes any gate-clearing (ship) unit regardless of score", () => {
    seed({ level: "L2" });
    seedEval({ verdict: "ship", score: 51 });
    const d = decideAutoPass(readTrustConfig(WS), evalRead(), PROJECT);
    expect(d.autoPass).toBe(true);
    expect(d.reason).toContain("L2");
  });

  test("invariant #4: a non-ship verdict never auto-passes at any level", () => {
    for (const level of ["L1", "L2"] as const) {
      for (const verdict of ["repair", "needs-user-decision", "blocked"]) {
        seed({ level, autoPublishScore: 0 });
        seedEval({ verdict, score: 100 });
        const d = decideAutoPass(readTrustConfig(WS), evalRead(), PROJECT);
        expect(d.autoPass).toBe(false);
        expect(d.reason).toContain("invariant #4");
        tmp.cleanup();
      }
    }
    seed(); // leave a root for afterEach
  });

  test("invariant #4: a fail/warn criterion refuses even under an overall ship verdict", () => {
    seed({ level: "L2" });
    seedEval({
      verdict: "ship",
      score: 95,
      criteria: [
        { id: "hook", verdict: "pass" },
        { id: "captions", verdict: "warn" },
      ],
    });
    const d = decideAutoPass(readTrustConfig(WS), evalRead(), PROJECT);
    expect(d.autoPass).toBe(false);
    expect(d.reason).toContain("captions");
  });

  test("no workspace-eval scorecard at all → park (nothing justifies the pass)", () => {
    seed({ level: "L2" });
    const d = decideAutoPass(readTrustConfig(WS), evalRead(), PROJECT);
    expect(d.autoPass).toBe(false);
    expect(d.reason).toContain("no workspace-eval scorecard");
  });
});

// ─── approval node executor ──────────────────────────────────────────────────

describe("approval executor + trust ladder", () => {
  test("L0 parks (today's behavior unchanged)", async () => {
    seed();
    seedEval({ verdict: "ship", score: 100 });
    await expect(approvalExecutor(node(), ctx())).rejects.toThrow(RunControlSignal);
  });

  test("L1 auto-passes >= threshold, with audit line + run-journal event", async () => {
    seed({ level: "L1", autoPublishScore: 80 });
    seedEval({ verdict: "ship", score: 92 });
    const res = await approvalExecutor(node(), ctx());
    expect(res.output).toMatchObject({
      approved: true,
      autoPass: true,
      trust: { level: "L1", project: PROJECT, verdict: "ship", score: 92 },
    });
    const audit = readTrustAudit(WS);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      kind: "auto-pass",
      surface: "approval-node",
      level: "L1",
      project: PROJECT,
      score: 92,
      threshold: 80,
      run: RUN,
    });
    const journal = runEvents().filter((e) => e.kind === "trust-auto-pass");
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({ node: "gate-1", level: "L1", project: PROJECT });
  });

  test("L1 below threshold parks, and the park reason carries the trust refusal", async () => {
    seed({ level: "L1", autoPublishScore: 80 });
    seedEval({ verdict: "ship", score: 60 });
    let msg = "";
    try {
      await approvalExecutor(node(), ctx());
    } catch (e) {
      expect(e).toBeInstanceOf(RunControlSignal);
      msg = (e as Error).message;
    }
    expect(msg).toContain("below the L1 auto-publish threshold");
    expect(readTrustAudit(WS)).toHaveLength(0); // no auto-pass, no audit line
  });

  test("L2 never passes over a non-ship verdict", async () => {
    seed({ level: "L2" });
    seedEval({ verdict: "repair", score: 95 });
    await expect(approvalExecutor(node(), ctx())).rejects.toThrow(RunControlSignal);
    expect(readTrustAudit(WS)).toHaveLength(0);
  });

  test("no resolvable project (multi-project run, no ctx.projectId) parks conservatively", async () => {
    seed({ level: "L2" });
    seedEval({ verdict: "ship", score: 100 });
    await expect(approvalExecutor(node(), ctx({ projectId: undefined }))).rejects.toThrow(
      RunControlSignal,
    );
  });
});

// ─── publish path ─────────────────────────────────────────────────────────────

describe("publish path + trust ladder", () => {
  test("checkPublishTrust never auto-passes over a non-ship readiness verdict", () => {
    seed({ level: "L2" });
    seedEval({ verdict: "ship", score: 100 });
    // No eval.json / scorecard artifacts → readiness is NOT ship in this fixture.
    const check = checkPublishTrust(PROJECT, WS);
    expect(check.readiness.pass).toBe(false);
    expect(check.autoPass).toBe(false);
    expect(check.reason).toContain("invariant #4");
    expect(check.level).toBe("L2");
  });

  test("outside a farm run the trust gate is inert (the human IS the approval)", async () => {
    seed({ level: "L0" });
    const gate = await gatePublishTrust(node("publish"), ctx({ runId: undefined }), { projectId: PROJECT, slug: "hero" }, false);
    expect(gate.mode).toBe("human");
  });

  test("force_reason stays the explicit bypass at any level", async () => {
    seed({ level: "L0" });
    const gate = await gatePublishTrust(node("publish"), ctx(), { projectId: PROJECT, slug: "hero" }, true);
    expect(gate.mode).toBe("forced");
  });

  test("a recorded active run approval covers the publish (no park, no auto-pass)", async () => {
    seed({ level: "L0" });
    fs.mkdirSync(runDir(WS, RUN), { recursive: true });
    await recordRunApproval(RUN, { budgetCapUsd: 10, reason: "approved" });
    const gate = await gatePublishTrust(node("publish"), ctx(), { projectId: PROJECT, slug: "hero" }, false);
    expect(gate.mode).toBe("approved");
  });

  test("L0 in a farm run parks the publish for approval (inbox pack written)", async () => {
    seed({ level: "L0" });
    seedEval({ verdict: "ship", score: 100 });
    await expect(
      gatePublishTrust(node("publish"), ctx(), { projectId: PROJECT, slug: "hero" }, false),
    ).rejects.toThrow(RunControlSignal);
    const inbox = path.join(runDir(WS, RUN), "agent-inbox");
    expect(fs.readdirSync(inbox).some((f) => f.endsWith("-approve.json"))).toBe(true);
  });

  test("L2 auto-passes a ship-verdict unit and audits it with the unit slug", async () => {
    seed({ level: "L2" });
    seedEval({ verdict: "ship", score: 88 });
    const gate = await gatePublishTrust(node("publish"), ctx(), { projectId: PROJECT, slug: "hero" }, false);
    expect(gate.mode).toBe("auto-pass");
    const audit = readTrustAudit(WS);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      kind: "auto-pass",
      surface: "publish-node",
      project: PROJECT,
      unit: "hero",
      verdict: "ship",
    });
    expect(runEvents().some((e) => e.kind === "trust-auto-pass")).toBe(true);
  });
});

// ─── agreement math + promotion ───────────────────────────────────────────────

describe("agreement math", () => {
  test("rate + streak; streak counts consecutive matches from the newest backward", () => {
    const samples = [
      sample("approve", "ship"), // match
      sample("approve", "repair"), // mismatch
      sample("reject", "blocked"), // match
      sample("approve", "ship"), // match
    ];
    const stats = agreementStats(samples);
    expect(stats).toEqual({ samples: 4, matches: 3, rate: 0.75, streak: 2 });
    expect(agreementStats([])).toEqual({ samples: 0, matches: 0, rate: null, streak: 0 });
  });

  test("recordTrustDecision computes the match convention (approve↔ship, reject↔non-ship)", () => {
    seed();
    expect(recordTrustDecision(WS, { decision: "approve", verdict: "ship" }).sample.match).toBe(true);
    expect(recordTrustDecision(WS, { decision: "approve", verdict: "repair" }).sample.match).toBe(false);
    expect(recordTrustDecision(WS, { decision: "reject", verdict: "blocked" }).sample.match).toBe(true);
    expect(recordTrustDecision(WS, { decision: "reject", verdict: "ship" }).sample.match).toBe(false);
    expect(readAgreementSamples(WS)).toHaveLength(4); // append-only jsonl
  });

  test("promotion suggested at streak >= promotionStreak AND rate >= 0.9; never at L2", () => {
    const config: TrustConfig = { ...DEFAULT_TRUST_CONFIG, level: "L0", promotionStreak: 3 };
    const clean = Array.from({ length: 10 }, () => sample("approve", "ship"));
    const suggestion = promotionSuggestion(config, agreementStats(clean));
    expect(suggestion.suggested).toBe(true);
    expect(suggestion.nextLevel).toBe("L1");
    expect(suggestion.rule).toContain(String(PROMOTION_AGREEMENT_RATE));

    // A recent streak over a noisy history: rate below the bar → not suggested.
    const noisy = [...Array.from({ length: 7 }, () => sample("approve", "repair")), ...clean.slice(0, 3)];
    expect(promotionSuggestion(config, agreementStats(noisy)).suggested).toBe(false);

    // L2 has nowhere to go.
    expect(promotionSuggestion({ ...config, level: "L2" }, agreementStats(clean))).toMatchObject({
      suggested: false,
      nextLevel: null,
    });
  });
});

// ─── demotion on reject ───────────────────────────────────────────────────────

describe("demotion on reject", () => {
  const autoPassAudit = () =>
    appendTrustAudit(WS, {
      kind: "auto-pass",
      level: "L2",
      surface: "publish-node",
      project: PROJECT,
      unit: "hero",
      verdict: "ship",
      score: 90,
      reason: "L2 auto-pass",
    });

  test("reject of an auto-published unit drops L2 -> L1 and resets the streak", () => {
    seed({ level: "L2" });
    recordTrustDecision(WS, { decision: "approve", verdict: "ship" }); // streak 1
    autoPassAudit();
    expect(hasAutoPassAudit(WS, PROJECT, "hero")).toBe(true);
    const rec = recordTrustDecision(WS, {
      decision: "reject",
      verdict: "ship",
      project: PROJECT,
      unit: "hero",
      source: "dashboard",
    });
    expect(rec.demotion).toMatchObject({ demoted: true, from: "L2", to: "L1" });
    expect(readTrustConfig(WS).level).toBe("L1");
    expect(agreementStats(readAgreementSamples(WS)).streak).toBe(0); // reset
    expect(readTrustAudit(WS).some((e) => e.kind === "demotion")).toBe(true);
  });

  test("L1 stays L1 on reject (streak reset is the penalty; never below L0 semantics)", () => {
    seed({ level: "L1" });
    autoPassAudit();
    const rec = recordTrustDecision(WS, { decision: "reject", verdict: "ship", project: PROJECT, unit: "hero" });
    expect(rec.demotion).toMatchObject({ demoted: false, from: "L1", to: "L1" });
    expect(readTrustConfig(WS).level).toBe("L1");
  });

  test("demoteOnReject=false keeps L2", () => {
    seed({ level: "L2", demoteOnReject: false });
    autoPassAudit();
    const rec = recordTrustDecision(WS, { decision: "reject", verdict: "ship", project: PROJECT, unit: "hero" });
    expect(rec.demotion).toMatchObject({ demoted: false, from: "L2", to: "L2" });
    expect(readTrustConfig(WS).level).toBe("L2");
  });

  test("reject of a unit that was never auto-published does not touch the level", () => {
    seed({ level: "L2" });
    const rec = recordTrustDecision(WS, { decision: "reject", verdict: "repair", project: PROJECT, unit: "hero" });
    expect(rec.demotion).toBeNull();
    expect(readTrustConfig(WS).level).toBe("L2");
  });
});

// ─── CLI verbs ────────────────────────────────────────────────────────────────

describe("workspace update / trust verbs", () => {
  const cli = (...args: string[]) =>
    spawnSync("bun", ["run", CLI, "--cwd", tmp.dir, "--json", ...args], { encoding: "utf8" });

  test("update writes the trust fields; trust shows level + agreement + suggestion", () => {
    seed();
    const upd = cli("workspace", "update", WS, "--trust-level", "L1", "--auto-publish-score", "85", "--promotion-streak", "5", "--demote-on-reject", "false");
    expect(upd.status).toBe(0);
    expect(JSON.parse(upd.stdout)).toMatchObject({
      workspace: WS,
      trust: { level: "L1", autoPublishScore: 85, promotionStreak: 5, demoteOnReject: false },
    });
    expect(readTrustConfig(WS)).toMatchObject({ level: "L1", autoPublishScore: 85 });

    for (let i = 0; i < 5; i++) recordTrustDecision(WS, { decision: "approve", verdict: "ship" });
    const show = cli("workspace", "trust", WS);
    expect(show.status).toBe(0);
    const status = JSON.parse(show.stdout);
    expect(status).toMatchObject({
      workspace: WS,
      level: "L1",
      autoPublishScore: 85,
      agreement: { samples: 5, matches: 5, rate: 1, streak: 5 },
      promotion: { suggested: true, nextLevel: "L2" },
      autoPasses: 0,
    });
  });

  test("update refuses an invalid level and an empty patch", () => {
    seed();
    expect(cli("workspace", "update", WS, "--trust-level", "L9").status).not.toBe(0);
    expect(cli("workspace", "update", WS).status).not.toBe(0);
    expect(readTrustConfig(WS).level).toBe("L0"); // untouched
  });

  test("trustStatus rolls up the config + logs paths", () => {
    seed({ level: "L1" });
    const s = trustStatus(WS);
    expect(s.level).toBe("L1");
    expect(s.agreementLog).toContain("trust-agreement.jsonl");
    expect(s.auditLog).toContain("trust-audit.jsonl");
  });
});

// ─── run approve hook ─────────────────────────────────────────────────────────

describe("run approve records agreement samples", () => {
  test("member projects with a workspace-eval verdict become approve-labeled samples", async () => {
    seed();
    seedEval({ verdict: "ship", score: 91 });
    await createRun({ id: RUN, workspace: WS, title: "trust run", projectIds: [PROJECT] });
    const out = spawnSync(
      "bun",
      ["run", CLI, "--cwd", tmp.dir, "--json", "run", "approve", RUN, "--cap", "5", "--reason", "test approval"],
      { encoding: "utf8" },
    );
    expect(out.status).toBe(0);
    expect(JSON.parse(out.stdout)).toMatchObject({ run: RUN, agreementSamples: 1 });
    const samples = readAgreementSamples(WS);
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({
      decision: "approve",
      verdict: "ship",
      score: 91,
      project: PROJECT,
      run: RUN,
      source: "run-approve",
      match: true,
    });
  });
});

// ─── bundle trustDefault on import ────────────────────────────────────────────

const hasZip = Boolean(Bun.which("zip") && Bun.which("unzip"));

describe.if(hasZip)("bundle import applies trustDefault", () => {
  test("manifest trustDefault L1 becomes the imported workspace's trust level", () => {
    seed();
    // Hand-build a minimal valid bundle zip: manifest.yaml + a lint-green pipeline.
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-trust-bundle-"));
    scratchDirs.push(scratch);
    fs.writeFileSync(
      path.join(scratch, "manifest.yaml"),
      stringifyYaml({
        name: "trusted-bundle",
        version: "1.0.0",
        ralphyVersionFloor: "0.1.0",
        requiredConnectorKeys: [],
        requiredCoverage: [],
        trustDefault: "L1",
      }),
    );
    fs.writeFileSync(
      path.join(scratch, "pipeline.json"),
      JSON.stringify({
        version: "2.0",
        name: "episode",
        nodes: [
          {
            id: "script",
            type: "generate-text",
            params: { model: "anthropic/claude-fable-5", provider: "openrouter", prompt: "prompts/script.md" },
            out: "script",
          },
        ],
      }),
    );
    const zipPath = path.join(scratch, "trusted-bundle.zip");
    const zipped = spawnSync("zip", ["-r", zipPath, "manifest.yaml", "pipeline.json"], { cwd: scratch });
    expect(zipped.status).toBe(0);

    const result = importWorkspaceBundle(zipPath, { as: "trusted-import", allowMissingKeys: true });
    expect(result.bundle.trustDefault).toBe("L1");
    expect(readTrustConfig("trusted-import")).toMatchObject({ level: "L1" });
    // The manifest carries the trust key explicitly.
    const manifest = JSON.parse(
      fs.readFileSync(path.join(workspaceDir("trusted-import"), "workspace.json"), "utf8"),
    );
    expect(manifest.trust).toEqual({ level: "L1" });
  });
});
