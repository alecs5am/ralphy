// Storyboard review before paid AI generation (#570): the data contract,
// approvals, the generate gate, the HTML fallback, the contract ledger and the
// bridge methods the desktop gallery calls.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { ensureDomainContractProject } from "../helpers/domain-contract";
import { projectDir, ralphDir, root } from "../../cli/lib/paths";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db";
import { ingestObject } from "../../cli/lib/store/objects";
import { addArtifactRevision, createArtifact } from "../../cli/lib/store/artifacts";
import {
  applyReview,
  checkStoryboardGate,
  emptyRecord,
  enforceStoryboardGate,
  renderStoryboardHtml,
  requireStoryboardProject,
  reviewStoryboard,
  sceneOfSlot,
  showStoryboard,
  StoryboardReviewError,
  writeStoryboardHtml,
} from "../../cli/lib/storyboard/index";
import { evaluateContract } from "../../cli/lib/contract";
import { createBridgeMethods } from "../../cli/lib/bridge/methods";

const PROJECT = "storyboard-fixture-570";

let tmp: TmpRoot;
let ids: { workspaceId: string; projectId: string };

function scenario(overrides: Record<string, unknown> = {}, scene02Vo = "Meet the bottle.") {
  return {
    project_id: PROJECT,
    target_duration_s: 8,
    hook: { scene_id: "scene-01", vo: "Stop scrolling.", duration_s: 3 },
    body: [{ scene_id: "scene-02", vo: scene02Vo, duration_s: 5 }],
    cta: { scene_id: "scene-02", vo: scene02Vo, duration_s: 5 },
    scenes: {
      "scene-01": { id: "scene-01", role: "hook", vo_text: "Stop scrolling.", target_duration_s: 3, camera: "selfie 35mm, eye-level" },
      "scene-02": { id: "scene-02", role: "body", vo_text: scene02Vo, target_duration_s: 5, camera: "macro push-in <warm>" },
    },
    ...overrides,
  };
}

function write(rel: string, value: unknown) {
  const file = path.join(projectDir(PROJECT), rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

function promptLog(): Array<{ stage: string; text: string; note?: string }> {
  const file = path.join(projectDir(PROJECT), "logs", "user-prompts.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function project() {
  return requireStoryboardProject(PROJECT);
}

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-storyboard-570");
  ids = ensureDomainContractProject(root(), PROJECT);
  fs.mkdirSync(projectDir(PROJECT), { recursive: true });
  write("scenario.json", scenario());
});

afterEach(() => {
  closeDomainDb();
  tmp.cleanup();
});

describe("storyboard data contract", () => {
  test("derives one card per scene with VO, duration, camera, models, cost and frame", () => {
    write("prompts.json", { slots: { "scene-02-vid": { model: "google/veo-3.1-fast", kind: "video" }, "scene-02-bg": { model: "openai/gpt-5.4-image-2" } } });
    write("storyboard/storyboard-scene-01.png", "\x89PNG fake");
    const view = showStoryboard(project());
    expect(view.aiProduction).toBe(true);
    expect(view.scenarioSource).toBe("scenario.json");
    expect(view.scenes.map((scene) => scene.id)).toEqual(["scene-01", "scene-02"]);
    const [first, second] = view.scenes;
    expect(first).toMatchObject({ vo: "Stop scrolling.", durationSec: 3, camera: "selfie 35mm, eye-level", state: "pending" });
    expect(first!.frame).toMatchObject({ source: "file", mime: "image/png" });
    expect(first!.models).toEqual({ image: "google/gemini-3-pro-image-preview", video: "kwaivgi/kling-v3.0-pro" });
    expect(second!.models).toEqual({ image: "openai/gpt-5.4-image-2", video: "google/veo-3.1-fast" });
    expect(second!.frame).toBeNull();
    expect(second!.estimatedCostUsd).toBeGreaterThan(0);
    expect(view.totals).toMatchObject({ scenes: 2, pending: 2, approved: 0, durationSec: 8 });
    expect(view.document).toBeNull();
  });

  test("an image Artifact under storyboard-<scene> is the frame", async () => {
    const source = path.join(tmp.dir, "frame.png");
    fs.writeFileSync(source, "\x89PNG artifact frame");
    const object = await ingestObject({
      scope: { workspaceId: ids.workspaceId, projectId: ids.projectId },
      sourcePath: source,
      originalName: "frame.png",
      mime: "image/png",
      storageClass: "durable",
      transfer: "move",
    });
    const artifact = createArtifact({ projectId: ids.projectId, slug: "storyboard-scene-02", kind: "image" });
    const revision = addArtifactRevision({ artifactId: artifact.id, objectId: object.id, parentRevisionId: null, state: "working" });
    const frame = showStoryboard(project()).scenes[1]!.frame;
    expect(frame).toMatchObject({ source: "artifact", artifactId: artifact.id, revisionId: revision.id, mime: "image/png", key: revision.id });
    expect(fs.existsSync(frame!.path!)).toBe(true);
  });

  test("raw-footage modes and explicit raw-footage projects skip the approval step", () => {
    write("production-plan.json", { contentMode: { mode: "personal-clipper" } });
    expect(showStoryboard(project()).aiProduction).toBe(false);
    fs.rmSync(path.join(projectDir(PROJECT), "production-plan.json"));
    write("scenario.json", scenario({ production: "raw-footage" }));
    const view = showStoryboard(project());
    expect(view.aiProduction).toBe(false);
    expect(view.aiProductionReason).toContain("raw-footage");
  });

  test("scene slots map to scenes; storyboard frame slots never do", () => {
    expect(sceneOfSlot("scene-03-bg-image")).toBe("scene-03");
    expect(sceneOfSlot("Scene_03_VID")).toBe("scene-03");
    expect(sceneOfSlot("scene-03")).toBe("scene-03");
    expect(sceneOfSlot("storyboard-scene-03")).toBeNull();
    expect(sceneOfSlot("scene-03-storyboard")).toBeNull();
    expect(sceneOfSlot("scene-03-sketch")).toBeNull();
    expect(sceneOfSlot("hero-shot")).toBeNull();
  });

  test("applyReview refuses unknown scenes and empty comments", () => {
    const drafts = showStoryboard(project()).scenes;
    expect(() => applyReview(emptyRecord(), drafts, { action: "approve", scenes: ["scene-09"] })).toThrow(StoryboardReviewError);
    expect(() => applyReview(emptyRecord(), drafts, { action: "comment", scenes: ["scene-01"], comment: "  " })).toThrow(StoryboardReviewError);
    expect(() => applyReview(emptyRecord(), drafts, { action: "approve" })).toThrow(StoryboardReviewError);
  });
});

describe("approvals", () => {
  test("approve / reject / comment append Document revisions and log every decision", async () => {
    const approved = await reviewStoryboard(project(), { action: "approve", scenes: ["scene-01"], comment: "hook works" });
    expect(approved.touched).toEqual(["scene-01"]);
    expect(approved.storyboard.scenes[0]!.state).toBe("approved");
    const rejected = await reviewStoryboard(project(), { action: "reject", scenes: ["scene-02"], comment: "label is wrong" });
    expect(rejected.storyboard.scenes[1]).toMatchObject({ state: "rejected", approval: { comment: "label is wrong" } });
    const commented = await reviewStoryboard(project(), { action: "comment", scenes: ["scene-01"], comment: "keep the grain" });
    expect(commented.storyboard.scenes[0]!.state).toBe("approved");
    expect(commented.storyboard.scenes[0]!.comments.map((comment) => comment.text)).toEqual(["hook works", "keep the grain"]);
    expect(commented.storyboard.document!.revisionNo).toBe(3);

    const revisions = openDomainDb().query<{ n: number }, [string]>(
      "SELECT COUNT(*) AS n FROM document_revisions WHERE document_id = ?",
    ).get(commented.storyboard.document!.documentId)!.n;
    expect(revisions).toBe(3);
    expect(promptLog().map((entry) => entry.stage)).toEqual([
      "storyboard-approval",
      "storyboard-rejection",
      "storyboard-comment",
    ]);
    expect(promptLog()[0]!.text).toBe("hook works");
  });

  test("approve-all approves every scene; a content change turns the approval stale", async () => {
    const result = await reviewStoryboard(project(), { action: "approve", all: true });
    expect(result.storyboard.approvedAll).toBe(true);
    expect(result.storyboard.approvedAllAt).not.toBeNull();
    write("scenario.json", scenario({}, "Meet the new bottle."));
    const view = showStoryboard(project());
    expect(view.scenes.map((scene) => scene.state)).toEqual(["approved", "stale"]);
    expect(view.approvedAll).toBe(false);
  });
});

describe("generate gate", () => {
  test("blocks pending, rejected, stale and unknown scenes; passes approved scenes and frame slots", async () => {
    let verdict = checkStoryboardGate(PROJECT, ["scene-01-bg"]);
    expect(verdict).toMatchObject({ applies: true, allowed: false });
    expect(verdict.blocked[0]).toMatchObject({ scene: "scene-01", state: "pending" });
    expect(checkStoryboardGate(PROJECT, ["storyboard-scene-01"]).allowed).toBe(true);
    expect(checkStoryboardGate(PROJECT, ["hero-shot"]).applies).toBe(false);

    await reviewStoryboard(project(), { action: "approve", scenes: ["scene-01"] });
    await reviewStoryboard(project(), { action: "reject", scenes: ["scene-02"] });
    expect(checkStoryboardGate(PROJECT, ["scene-01-bg", "scene-01-vid"]).allowed).toBe(true);
    verdict = checkStoryboardGate(PROJECT, ["scene-01-bg", "scene-02-vid", "scene-07-bg"]);
    expect(verdict.blocked.map((entry) => `${entry.scene}:${entry.state}`)).toEqual(["scene-02:rejected", "scene-07:unknown"]);

    write("scenario.json", scenario({ scenes: { ...scenario().scenes, "scene-01": { ...scenario().scenes["scene-01"], camera: "drone top-down" } } }));
    expect(checkStoryboardGate(PROJECT, ["scene-01-bg"]).blocked[0]!.state).toBe("stale");
  });

  test("raw-footage projects are not gated", () => {
    write("production-plan.json", { contentMode: { mode: "podcast-video" } });
    expect(checkStoryboardGate(PROJECT, ["scene-01-bg"])).toMatchObject({ applies: false, allowed: true });
  });

  test("--no-storyboard-consent proceeds and logs the override; a dry run warns only", async () => {
    const dry = await enforceStoryboardGate({ project: PROJECT, slots: ["scene-01-bg"], consent: null, dryRun: true, verb: "generate image" });
    expect(dry!.allowed).toBe(false);
    expect(promptLog()).toEqual([]);
    const bypassed = await enforceStoryboardGate({ project: PROJECT, slots: ["scene-02-vid"], consent: "user said ship it", verb: "generate video" });
    expect(bypassed!.allowed).toBe(false);
    const [entry] = promptLog();
    expect(entry).toMatchObject({ stage: "no-storyboard-consent", text: "user said ship it" });
    expect(entry!.note).toContain("scene-02-vid");
  });
});

describe("HTML fallback", () => {
  test("renders a self-contained gallery and never overwrites an earlier one", async () => {
    write("storyboard/scene-01.png", "\x89PNG inline");
    await reviewStoryboard(project(), { action: "reject", scenes: ["scene-02"], comment: "<b>too dark</b>" });
    const view = showStoryboard(project());
    const html = renderStoryboardHtml(view, { generatedAt: "2026-10-30T00:00:00.000Z" });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("data:image/png;base64,");
    expect(html).toContain("macro push-in &lt;warm&gt;");
    expect(html).toContain("&lt;b&gt;too dark&lt;/b&gt;");
    expect(html).not.toContain("<b>too dark</b>");
    expect(html).toContain(`ralphy storyboard approve ${PROJECT} --scene scene-01`);
    expect(html).not.toMatch(/<script|<link /);

    const first = writeStoryboardHtml(project().dir, html);
    const second = writeStoryboardHtml(project().dir, "second");
    expect(path.basename(first.path)).toBe("storyboard.html");
    expect(path.basename(second.path)).toBe("storyboard.v2.html");
    expect(second.version).toBe(2);
    expect(fs.readFileSync(first.path, "utf8")).toBe(html);
  });
});

describe("contract ledger", () => {
  test("project status --contract carries per-scene approval state and the approval stop", async () => {
    await reviewStoryboard(project(), { action: "approve", scenes: ["scene-01"], comment: "good" });
    let ledger = evaluateContract(PROJECT);
    expect(ledger.storyboard).toMatchObject({ aiProduction: true, scenes: 2, approved: 1, pending: 1, approvedAll: false });
    expect(ledger.storyboard!.perScene).toEqual([
      { id: "scene-01", state: "approved", comment: "good" },
      { id: "scene-02", state: "pending", comment: null },
    ]);
    const stop = ledger.stopConditions.find((entry) => entry.id === "storyboard-approval-needed");
    expect(stop).toMatchObject({ phase: "assets", severity: "block" });
    expect(stop!.detail).toContain("scene-02 (pending)");

    await reviewStoryboard(project(), { action: "approve", all: true });
    ledger = evaluateContract(PROJECT);
    expect(ledger.storyboard!.approvedAll).toBe(true);
    expect(ledger.stopConditions.some((entry) => entry.id === "storyboard-approval-needed")).toBe(false);
  });

  test("a project without scenario scenes carries no storyboard", () => {
    write("scenario.json", "{}");
    expect(evaluateContract(PROJECT).storyboard).toBeNull();
  });
});

describe("bridge methods", () => {
  test("storyboard.show and storyboard.review speak the Project scope", async () => {
    const methods = createBridgeMethods({ dataRoot: ralphDir() });
    const context = { workspaceId: ids.workspaceId, projectId: ids.projectId };
    const methodContext = {
      consumerSessions: new Set<string>(),
      activitySubscriptions: new Map(),
      helloComplete: true,
      markHello() {},
      setAuthority() {},
    };
    const shown = await methods.get("storyboard.show")!.handle({ context }, methodContext) as { scenes: Array<{ id: string; state: string }> };
    expect(shown.scenes.map((scene) => scene.state)).toEqual(["pending", "pending"]);
    const reviewed = await methods.get("storyboard.review")!.handle(
      { context, action: "reject", scenes: ["scene-02"], comment: "needs a hand in frame" },
      methodContext,
    ) as { touched: string[]; storyboard: { scenes: Array<{ state: string; approval: { source: string } | null }> } };
    expect(reviewed.touched).toEqual(["scene-02"]);
    expect(reviewed.storyboard.scenes[1]).toMatchObject({ state: "rejected", approval: { source: "desktop" } });
    expect(methods.get("storyboard.review")!.kind).toBe("mutation");
    const refused = await Promise.resolve(methods.get("storyboard.review")!.handle({ context, action: "approve", scenes: ["scene-09"] }, methodContext))
      .then(() => null, (error: unknown) => error as { code?: string; details?: { detail?: string } });
    expect(refused?.code).toBe("E_VALIDATION_FAILED");
    expect(refused?.details?.detail).toContain("unknown storyboard scene");
    expect(() => methods.get("storyboard.show")!.handle({ context: { workspaceId: ids.workspaceId } }, methodContext))
      .toThrow("Project scope");
    expect(promptLog().at(-1)).toMatchObject({ stage: "storyboard-rejection", text: "needs a hand in frame" });
  });
});
