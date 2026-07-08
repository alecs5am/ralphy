// Rich approval review card — the #533 FOUNDATION layer (data + transitions).
//
// ZERO network, injected clock. Covers:
//   • card assembly from a fixture VIDEO unit + an ARTICLE unit (correct media
//     kind + paths + caption + targets + scheduleAt + scorecard + cost);
//   • each action's state transition (approve → run approval recorded +
//     calibration approve sample; reject → rejection recorded, MEDIA UNTOUCHED
//     on disk, calibration reject sample; request-change → repair plan enqueued
//     + note + calibration sample);
//   • the calibration-sample emission on all three (read back trust-agreement.jsonl);
//   • the batch path over a multi-card tick;
//   • empty/blocked states (no parked node → empty card list; no unit → null card).

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, runDir, projectDir } from "../../cli/lib/paths.js";
import { createRun, appendRunEvent } from "../../cli/lib/run.js";
import { readRunLedger, activeApproval } from "../../cli/lib/spend.js";
import { readAgreementSamples } from "../../cli/lib/trust.js";
import {
  assembleReviewCard,
  assembleReviewTick,
  applyReviewDecision,
  reviewRepairPlanPath,
  UNIT_REJECTIONS_ARTIFACT,
} from "../../cli/lib/review-card.js";

let tmp: TmpRoot;
afterEach(() => tmp?.cleanup());

const WS = "test";
const NOW = () => new Date("2026-07-08T12:00:00.000Z");

function seedWorkspace(): void {
  tmp = makeTmpRoot("ralphy-review");
  const dir = workspaceDir(WS);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ slug: WS }));
}

/** Seed a project + a unit dir (manifest + dummy media files). */
function seedUnit(
  project: string,
  slug: string,
  manifest: Record<string, unknown>,
  files: Record<string, string>,
): string {
  const unitDir = path.join(projectDir(project), "units", slug);
  fs.mkdirSync(unitDir, { recursive: true });
  fs.writeFileSync(
    path.join(unitDir, "unit.json"),
    JSON.stringify({ slug, created: NOW().toISOString(), ...manifest }, null, 2),
  );
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(unitDir, name), body);
  }
  return unitDir;
}

/** Seed a workspace-eval scorecard so the card + calibration have a verdict. */
function seedWorkspaceEval(project: string, verdict: string, score: number): void {
  fs.mkdirSync(projectDir(project), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir(project), "workspace-eval.json"),
    JSON.stringify({ overall: { verdict, score }, criteria: [] }),
  );
}

/** Create a parked run: run.json + a parked-approval journal + farm-state. */
async function seedParkedRun(
  run: string,
  project: string,
  opts: { node?: string; costUsd?: number; unitOutput?: unknown } = {},
): Promise<void> {
  const node = opts.node ?? "publish";
  await createRun({ id: run, workspace: WS, title: `tick ${run}`, projectIds: [project] });
  // A producer node journals a unit ref as its output (the publish node in-port).
  if (opts.unitOutput !== undefined) {
    await appendRunEvent(run, { kind: "node-completed", node: "form-unit", output: opts.unitOutput, message: "unit formed" });
  }
  if (opts.costUsd) {
    await appendRunEvent(run, { kind: "node-completed", node: "gen", costUsd: opts.costUsd, message: "gen done" });
  }
  await appendRunEvent(run, {
    kind: "run-parked",
    node,
    status: "parked-approval",
    reason: `approval node "${node}": no run approval is recorded yet`,
    message: `approval node "${node}": no run approval is recorded yet`,
  });
  fs.writeFileSync(
    path.join(runDir(WS, run), "farm-state.json"),
    JSON.stringify({ workflow: "wf", status: "parked-approval", updatedAt: NOW().toISOString() }),
  );
}

// ─── card assembly ─────────────────────────────────────────────────────────────

describe("assembleReviewCard — media kinds", () => {
  test("VIDEO unit → video kind, ordered paths, caption, targets, scheduleAt, scorecard, cost", async () => {
    seedWorkspace();
    const project = "vid-001";
    seedWorkspaceEval(project, "ship", 88);
    seedUnit(
      project,
      "hero-cut",
      {
        format: "video",
        media: ["final.mp4", "thumb.png"],
        title: "Hero cut",
        caption: {
          platform: { tiktok: "hook line", reels: "the fuller caption", shorts: "short title" },
          hashtags: ["#fyp"],
          language: "English",
        },
        publish: [
          { target: "youtube", integrationId: null, postId: null, status: "scheduled", scheduleAt: "2026-07-09T15:30:00.000Z", at: NOW().toISOString(), backend: "postiz" },
          { target: "tiktok", integrationId: null, postId: null, status: "scheduled", scheduleAt: "2026-07-09T15:30:00.000Z", at: NOW().toISOString(), backend: "postiz" },
        ],
      },
      { "final.mp4": "video-bytes", "thumb.png": "png-bytes" },
    );
    await seedParkedRun("run-vid", project, { costUsd: 0.42, unitOutput: `${project}/hero-cut` });

    const card = await assembleReviewCard({ ws: WS, run: "run-vid", node: "publish" });
    expect(card.project).toBe(project);
    expect(card.unit).toBe("hero-cut");
    expect(card.media?.kind).toBe("video");
    expect(card.media?.paths).toEqual([
      path.join(projectDir(project), "units", "hero-cut", "final.mp4"),
      path.join(projectDir(project), "units", "hero-cut", "thumb.png"),
    ]);
    expect(card.media?.thumbnail).toContain("thumb.png");
    expect(card.title).toBe("Hero cut");
    expect(card.caption).toBe("the fuller caption");
    expect(card.targets.sort()).toEqual(["tiktok", "youtube"]);
    expect(card.scheduleAt).toBe("2026-07-09T15:30:00.000Z");
    expect(card.scorecard).toEqual({ verdict: "ship", score: 88, criteria: [] });
    expect(card.costUsd).toBe(0.42);
    expect(card.status).toBe("parked-approval");
    expect(card.reason).toContain("no run approval");
  });

  test("ARTICLE unit → article kind, parsed frontmatter + body", async () => {
    seedWorkspace();
    const project = "art-001";
    seedWorkspaceEval(project, "repair", 61);
    const body = `---\ntitle: The Ship Log\ncanonical: draft\n---\n# The Ship Log\n\nThe body text.`;
    seedUnit(
      project,
      "ship-log",
      { format: "image", media: ["post.md"], title: "The Ship Log" },
      { "post.md": body },
    );
    await seedParkedRun("run-art", project, { unitOutput: { project, slug: "ship-log" } });

    const card = await assembleReviewCard({ ws: WS, run: "run-art", node: "publish" });
    expect(card.unit).toBe("ship-log");
    expect(card.media?.kind).toBe("article");
    expect(card.media?.frontmatter).toEqual({ title: "The Ship Log", canonical: "draft" });
    expect(card.media?.articleBody).toContain("The body text.");
    expect(card.media?.articleBody).not.toContain("canonical: draft");
    expect(card.scorecard?.verdict).toBe("repair");
    expect(card.scorecard?.score).toBe(61);
  });
});

describe("assembleReviewCard — empty / blocked states", () => {
  test("no parked node → empty tick", async () => {
    seedWorkspace();
    await createRun({ id: "run-quiet", workspace: WS, title: "quiet", projectIds: ["p"] });
    fs.writeFileSync(
      path.join(runDir(WS, "run-quiet"), "farm-state.json"),
      JSON.stringify({ workflow: "wf", status: "running", updatedAt: NOW().toISOString() }),
    );
    expect(await assembleReviewTick(WS, "run-quiet")).toEqual([]);
  });

  test("parked node with no resolvable unit → null-unit card (surfaced, not thrown)", async () => {
    seedWorkspace();
    // Run with 2 members and no unit output → ambiguous → unit null.
    await createRun({ id: "run-blocked", workspace: WS, title: "blocked", projectIds: ["a", "b"] });
    await appendRunEvent("run-blocked", {
      kind: "run-parked",
      node: "approve",
      status: "parked-approval",
      reason: "parked",
      message: "parked",
    });
    fs.writeFileSync(
      path.join(runDir(WS, "run-blocked"), "farm-state.json"),
      JSON.stringify({ workflow: "wf", status: "parked-approval", updatedAt: NOW().toISOString() }),
    );
    const card = await assembleReviewCard({ ws: WS, run: "run-blocked", node: "approve" });
    expect(card.unit).toBeNull();
    expect(card.project).toBeNull();
    expect(card.media).toBeNull();
  });

  test("a released park (later node-completed) drops out of the tick", async () => {
    seedWorkspace();
    const project = "rel-001";
    seedUnit(project, "u", { format: "video", media: ["a.mp4"] }, { "a.mp4": "x" });
    await seedParkedRun("run-rel", project, { unitOutput: `${project}/u` });
    // The parked node completed on a later resume → no longer a review target.
    await appendRunEvent("run-rel", { kind: "node-completed", node: "publish", message: "released" });
    expect(await assembleReviewTick(WS, "run-rel")).toEqual([]);
  });
});

// ─── action transitions ─────────────────────────────────────────────────────────

describe("applyReviewDecision — approve", () => {
  test("records a run approval + calibration approve sample (match on ship)", async () => {
    seedWorkspace();
    const project = "app-001";
    seedWorkspaceEval(project, "ship", 90);
    seedUnit(project, "u", { format: "video", media: ["a.mp4"] }, { "a.mp4": "x" });
    await seedParkedRun("run-app", project, { costUsd: 0.2, unitOutput: `${project}/u` });

    const r = await applyReviewDecision({
      ws: WS,
      run: "run-app",
      node: "publish",
      decision: "approve",
      actor: "alice",
      now: NOW,
    });
    expect(r.approvalRecorded).toBe(true);
    expect(r.calibrationMatch).toBe(true); // approve ↔ ship

    // The run ledger now carries an active approval → the parked node releases.
    const approval = activeApproval(await readRunLedger("run-app"));
    expect(approval).not.toBeNull();
    expect(approval!.scope).toBe("run");

    // Calibration sample landed (approve / ship / match).
    const samples = readAgreementSamples(WS);
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ decision: "approve", verdict: "ship", source: "review", match: true });

    // A review-approved run event is journaled.
    const events = fs.readFileSync(path.join(runDir(WS, "run-app"), "run-events.jsonl"), "utf8");
    expect(events).toContain("review-approved");
  });
});

describe("applyReviewDecision — reject", () => {
  test("records a rejection note, LEAVES MEDIA ON DISK, + calibration reject sample", async () => {
    seedWorkspace();
    const project = "rej-001";
    seedWorkspaceEval(project, "ship", 91);
    const unitDir = seedUnit(project, "u", { format: "video", media: ["a.mp4"] }, { "a.mp4": "the-media" });
    await seedParkedRun("run-rej", project, { unitOutput: `${project}/u` });

    const mediaPath = path.join(unitDir, "a.mp4");
    expect(fs.existsSync(mediaPath)).toBe(true);

    const r = await applyReviewDecision({
      ws: WS,
      run: "run-rej",
      node: "publish",
      decision: "reject",
      reason: "off-brand thumbnail",
      actor: "bob",
      now: NOW,
    });
    expect(r.rejectionNote).toBe(path.join(unitDir, UNIT_REJECTIONS_ARTIFACT));
    expect(r.calibrationMatch).toBe(false); // reject ↔ ship = mismatch

    // INVARIANT #14: the media is STILL on disk, byte-for-byte.
    expect(fs.existsSync(mediaPath)).toBe(true);
    expect(fs.readFileSync(mediaPath, "utf8")).toBe("the-media");

    // The rejection is a RECORD (append-only note).
    const note = fs.readFileSync(r.rejectionNote!, "utf8");
    expect(note).toContain("off-brand thumbnail");
    expect(note).toContain("bob");

    // Calibration sample (reject / ship / mismatch).
    const samples = readAgreementSamples(WS);
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ decision: "reject", verdict: "ship", source: "review", match: false });

    // No approval was recorded → the run stays parked.
    expect(activeApproval(await readRunLedger("run-rej"))).toBeNull();
  });

  test("refuses without a reason", async () => {
    seedWorkspace();
    const project = "rej-002";
    seedUnit(project, "u", { format: "video", media: ["a.mp4"] }, { "a.mp4": "x" });
    await seedParkedRun("run-rej2", project, { unitOutput: `${project}/u` });
    await expect(
      applyReviewDecision({ ws: WS, run: "run-rej2", node: "publish", decision: "reject", now: NOW }),
    ).rejects.toThrow(/requires a --reason/);
  });
});

describe("applyReviewDecision — request-change", () => {
  test("enqueues a repair plan + a run event + a calibration reject sample", async () => {
    seedWorkspace();
    const project = "chg-001";
    seedWorkspaceEval(project, "repair", 55);
    seedUnit(project, "u", { format: "video", media: ["a.mp4"] }, { "a.mp4": "x" });
    await seedParkedRun("run-chg", project, { unitOutput: `${project}/u` });

    const r = await applyReviewDecision({
      ws: WS,
      run: "run-chg",
      node: "publish",
      decision: "request-change",
      reason: "tighten the hook",
      actor: "carol",
      now: NOW,
    });
    expect(r.repair).not.toBeNull();
    expect(r.repair!.items).toBe(1);

    // The repair plan is written beside the run and carries the operator note.
    const planPath = reviewRepairPlanPath(WS, "run-chg", "publish");
    expect(fs.existsSync(planPath)).toBe(true);
    const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
    expect(plan.items[0].message).toBe("tighten the hook");
    // structure.* → scenarist per the #409 vocabulary.
    expect(plan.items[0].owner).toBe("scenarist");

    // Calibration sample — request-change is recorded as reject (did not ship).
    const samples = readAgreementSamples(WS);
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ decision: "reject", verdict: "repair", source: "review" });

    const events = fs.readFileSync(path.join(runDir(WS, "run-chg"), "run-events.jsonl"), "utf8");
    expect(events).toContain("review-request-change");
  });
});

// ─── batch path ──────────────────────────────────────────────────────────────

describe("assembleReviewTick — multi-card batch path", () => {
  test("assembles one card per distinct parked node", async () => {
    seedWorkspace();
    const project = "batch-001";
    seedWorkspaceEval(project, "ship", 80);
    seedUnit(project, "u", { format: "video", media: ["a.mp4"] }, { "a.mp4": "x" });
    await createRun({ id: "run-batch", workspace: WS, title: "batch", projectIds: [project] });
    await appendRunEvent("run-batch", { kind: "node-completed", node: "form-unit", output: `${project}/u`, message: "u" });
    for (const node of ["approve-a", "approve-b"]) {
      await appendRunEvent("run-batch", { kind: "run-parked", node, status: "parked-approval", reason: `park ${node}`, message: `park ${node}` });
    }
    fs.writeFileSync(
      path.join(runDir(WS, "run-batch"), "farm-state.json"),
      JSON.stringify({ workflow: "wf", status: "parked-approval", updatedAt: NOW().toISOString() }),
    );

    const cards = await assembleReviewTick(WS, "run-batch");
    expect(cards.map((c) => c.node).sort()).toEqual(["approve-a", "approve-b"]);
    expect(cards.every((c) => c.unit === "u")).toBe(true);
    expect(cards.every((c) => c.scorecard?.verdict === "ship")).toBe(true);
  });
});
