// Spend governor + approval ledger (#444).
//
// Tests call the library directly against a temp project with a synthetic
// gen-log (NO network, NO live generation):
//   - recordApproval() appends to spend-ledger.json (append-only).
//   - actualSpendUsd() sums generations.jsonl cost_usd.
//   - checkSpend() returns the four block conditions + the pass-through case:
//       BYPASSED (no ledger → allow), APPROVED (under cap → allow),
//       OVER-BUDGET (spent + estimated > cap → block), EXPIRED (→ block),
//       MODE-NOT-ALLOWED (→ block).
//   - estimatedCallCostUsd() reuses the existing per-kind pricing helpers.
//
// The temp-project + setRoot pattern mirrors tests/unit/model-telemetry.test.ts.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { setRoot } from "../../cli/lib/paths.js";
import {
  recordApproval,
  actualSpendUsd,
  checkSpend,
  budgetSummary,
  estimatedCallCostUsd,
  resolveExpiry,
  readLedger,
  SPEND_LEDGER_ARTIFACT,
} from "../../cli/lib/spend.js";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { finishRun, finishRunAttempt, startRun, startRunAttempt } from "../../cli/lib/store/runs.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";

let tmpRoot: string;
let origRoot: string;

function projDir(id: string): string {
  return path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", id);
}

/** Seed generations.jsonl with rows carrying the given cost_usd values. */
function seedGenLog(id: string, costs: number[]) {
  const dir = path.join(projDir(id), "logs");
  fs.mkdirSync(dir, { recursive: true });
  const lines = costs.map((c, i) =>
    JSON.stringify({
      timestamp: new Date().toISOString(),
      provider: "openrouter",
      model: "google/gemini-3-pro-image-preview",
      endpoint: "google/gemini-3-pro-image-preview",
      kind: "image",
      input: { slot: `scene-${i}`, project: id },
      status: "ok",
      cost_usd: c,
    }),
  );
  fs.writeFileSync(path.join(dir, "generations.jsonl"), lines.join("\n") + "\n");
}

beforeEach(() => {
  origRoot = process.cwd();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-spend-444-"));
  fs.mkdirSync(path.join(tmpRoot, ".ralphy"), { recursive: true });
  setRoot(tmpRoot);
});

afterEach(() => {
  closeDomainDb();
  setRoot(origRoot);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("spend governor (#444): pass-through when no ledger exists", () => {
  test("checkSpend allows when no ledger / no approval was ever recorded", async () => {
    const id = "no-ledger-001";
    seedGenLog(id, [0.15, 0.15]);
    const verdict = await checkSpend(id, { estimatedUsd: 5 });
    expect(verdict.allowed).toBe(true);
    expect(verdict.capUsd).toBeNull();
    expect(verdict.remainingUsd).toBeNull();
    expect(verdict.reason).toBeNull();
    // Spend is still reported (auditable) even with no cap.
    expect(verdict.spentUsd).toBeCloseTo(0.3, 6);
  });

  test("an absent gen-log reports zero spend, still allowed", async () => {
    const id = "empty-001";
    expect(await actualSpendUsd(id)).toBe(0);
    const verdict = await checkSpend(id, { estimatedUsd: 99 });
    expect(verdict.allowed).toBe(true);
  });
});

describe("spend governor (#444): actualSpendUsd sums gen-log cost_usd", () => {
  test("sums every row's cost_usd", async () => {
    const id = "sum-001";
    seedGenLog(id, [0.15, 0.2, 0.05, 0.6]);
    expect(await actualSpendUsd(id)).toBeCloseTo(1.0, 6);
  });

  test("includes domain Run Attempt costs while retaining legacy compatibility rows", async () => {
    const workspace = createWorkspace({ slug: "default", name: "Default" });
    const project = createProject({ workspaceId: workspace.id, slug: "domain-spend", name: "Domain spend" });
    seedGenLog(project.id, [0.25]);
    const run = startRun({ projectId: project.id, kind: "generate.image", label: "hero" });
    const attempt = startRunAttempt({ runId: run.id, provider: "fixture", model: "fixture/image" });
    finishRunAttempt(attempt.id, { state: "succeeded", costUsd: 0.75 });
    finishRun(run.id, { state: "succeeded" });

    expect(await actualSpendUsd(project.id)).toBeCloseTo(1, 6);
  });
});

describe("spend governor (#444): recordApproval is append-only", () => {
  test("each approval appends; prior approvals survive", async () => {
    const id = "append-001";
    await recordApproval(id, { scope: "project", budgetCapUsd: 5, reason: "first" });
    await recordApproval(id, { scope: "project", budgetCapUsd: 10, reason: "second" });
    const ledger = await readLedger(id);
    expect(ledger).not.toBeNull();
    expect(ledger!.approvals.length).toBe(2);
    expect(ledger!.approvals[0]!.reason).toBe("first");
    expect(ledger!.approvals[1]!.reason).toBe("second");
    // The file lives at the documented artifact path.
    expect(fs.existsSync(path.join(projDir(id), SPEND_LEDGER_ARTIFACT))).toBe(true);
  });
});

describe("spend governor (#444): the four block conditions + approved", () => {
  test("APPROVED — spent + estimated under cap → allow", async () => {
    const id = "approved-001";
    seedGenLog(id, [1, 1]); // spent $2
    await recordApproval(id, { scope: "project", budgetCapUsd: 10, reason: "go" });
    const verdict = await checkSpend(id, { estimatedUsd: 1 });
    expect(verdict.allowed).toBe(true);
    expect(verdict.capUsd).toBe(10);
    expect(verdict.spentUsd).toBeCloseTo(2, 6);
    expect(verdict.remainingUsd).toBeCloseTo(7, 6); // 10 - 2 - 1
    expect(verdict.reason).toBeNull();
  });

  test("OVER-BUDGET — spent + estimated > cap → block", async () => {
    const id = "over-001";
    seedGenLog(id, [4, 4]); // spent $8
    await recordApproval(id, { scope: "project", budgetCapUsd: 10, reason: "go" });
    const verdict = await checkSpend(id, { estimatedUsd: 3 }); // 8 + 3 = 11 > 10
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("exceeds");
    expect(verdict.remainingUsd).toBeCloseTo(-1, 6);
  });

  test("EXPIRED — now past the approval expiry → block", async () => {
    const id = "expired-001";
    seedGenLog(id, [0.1]);
    const past = new Date(Date.now() - 60_000).toISOString();
    await recordApproval(id, { scope: "project", budgetCapUsd: 100, reason: "go", expiry: past });
    const verdict = await checkSpend(id, { estimatedUsd: 0.1 });
    expect(verdict.allowed).toBe(false);
    expect(verdict.expired).toBe(true);
    expect(verdict.reason).toContain("expired");
  });

  test("EXPIRED — a future expiry does NOT block (now override)", async () => {
    const id = "future-expiry-001";
    const future = new Date(Date.now() + 3_600_000).toISOString();
    await recordApproval(id, { scope: "project", budgetCapUsd: 100, reason: "go", expiry: future });
    const verdict = await checkSpend(id, { estimatedUsd: 1, now: new Date().toISOString() });
    expect(verdict.allowed).toBe(true);
    expect(verdict.expired).toBe(false);
  });

  test("MODE-NOT-ALLOWED — call mode outside allowedModes → block", async () => {
    const id = "mode-001";
    await recordApproval(id, {
      scope: "project",
      budgetCapUsd: 100,
      reason: "go",
      allowedModes: ["ugc-review", "unboxing-ugc"],
    });
    const blocked = await checkSpend(id, { estimatedUsd: 1, mode: "tv-ad" });
    expect(blocked.allowed).toBe(false);
    expect(blocked.modeAllowed).toBe(false);
    expect(blocked.reason).toContain("not in the approved modes");

    const allowed = await checkSpend(id, { estimatedUsd: 1, mode: "ugc-review" });
    expect(allowed.allowed).toBe(true);
    expect(allowed.modeAllowed).toBe(true);
  });

  test("a mode-restricted approval blocks a call that declares no mode", async () => {
    const id = "mode-none-001";
    await recordApproval(id, { scope: "project", budgetCapUsd: 100, reason: "go", allowedModes: ["ugc-review"] });
    const verdict = await checkSpend(id, { estimatedUsd: 1 });
    expect(verdict.allowed).toBe(false);
    expect(verdict.modeAllowed).toBe(false);
  });

  test("the LATEST approval is the active one (most recent decision wins)", async () => {
    const id = "latest-001";
    seedGenLog(id, [3]); // spent $3
    await recordApproval(id, { scope: "project", budgetCapUsd: 100, reason: "generous" });
    await recordApproval(id, { scope: "project", budgetCapUsd: 4, reason: "tightened" });
    const verdict = await checkSpend(id, { estimatedUsd: 2 }); // 3 + 2 = 5 > 4
    expect(verdict.allowed).toBe(false);
    expect(verdict.capUsd).toBe(4);
  });
});

describe("spend governor (#444): estimated-vs-actual + per-kind estimate", () => {
  test("estimatedCallCostUsd reuses per-kind pricing", () => {
    // image: imageCostUsd table; video: catalog per-second; flat VO/music/sfx.
    expect(estimatedCallCostUsd({ kind: "image", model: "openai/gpt-5.4-image-2" })).toBeGreaterThan(0);
    expect(estimatedCallCostUsd({ kind: "image", model: "google/gemini-3-pro-image-preview", variants: 3 }))
      .toBeCloseTo(estimatedCallCostUsd({ kind: "image", model: "google/gemini-3-pro-image-preview" }) * 3, 6);
    expect(estimatedCallCostUsd({ kind: "voiceover" })).toBeCloseTo(0.05, 6);
    expect(estimatedCallCostUsd({ kind: "music" })).toBeCloseTo(0.1, 6);
    expect(estimatedCallCostUsd({ kind: "sfx" })).toBeCloseTo(0.02, 6);
    expect(estimatedCallCostUsd({ kind: "video", model: "kwaivgi/kling-v3.0-pro", durationSec: 5 })).toBeGreaterThan(0);
  });

  test("budgetSummary reports estimated-vs-actual state (cap, spent, remaining, over-budget)", async () => {
    const id = "summary-001";
    seedGenLog(id, [2, 2, 2]); // spent $6
    await recordApproval(id, { scope: "project", budgetCapUsd: 5, reason: "go" });
    const s = await budgetSummary(id);
    expect(s.hasLedger).toBe(true);
    expect(s.capUsd).toBe(5);
    expect(s.spentUsd).toBeCloseTo(6, 6);
    expect(s.remainingUsd).toBeCloseTo(-1, 6);
    expect(s.overBudget).toBe(true);
    expect(s.approvals.length).toBe(1);
  });
});

describe("spend governor (#444): resolveExpiry", () => {
  test("parses durations and ISO timestamps; rejects garbage", () => {
    const now = new Date("2026-06-16T00:00:00.000Z");
    expect(resolveExpiry("24h", now)).toBe("2026-06-17T00:00:00.000Z");
    expect(resolveExpiry("7d", now)).toBe("2026-06-23T00:00:00.000Z");
    expect(resolveExpiry("30m", now)).toBe("2026-06-16T00:30:00.000Z");
    expect(resolveExpiry("2w", now)).toBe("2026-06-30T00:00:00.000Z");
    expect(resolveExpiry("2026-12-01T00:00:00.000Z", now)).toBe("2026-12-01T00:00:00.000Z");
    expect(resolveExpiry("not-a-date", now)).toBeNull();
  });
});
