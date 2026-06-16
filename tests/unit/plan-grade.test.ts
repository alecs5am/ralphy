// Production-plan quality grader tests (#432).
//
// The grader (`gradeProductionPlan`) is a PURE, DETERMINISTIC critic of a
// ProductionPlan (#407) BEFORE it becomes the contract for expensive work. These
// tests hand-construct STRONG, WEAK, and BLOCKED plans (schema-valid via
// parseProductionPlan) and assert the per-dimension statuses + the overall
// verdict. They make NO network/live calls — the optional LLM completeness pass
// is exercised only with a stubbed (injected) fn.
//
// English-only-on-disk: every fixture string is plain English.

import { describe, test, expect } from "bun:test";
import { gradeProductionPlan, gradePlanDeterministic } from "../../cli/lib/plan/grade";
import { parsePlanGrade, type PlanGradeDimension, type PlanGradeStatus } from "../../cli/lib/schemas/plan-grade";
import { parseProductionPlan, type ProductionPlan } from "../../cli/lib/schemas/production-plan";

// ─── Plan fixtures (schema-valid via the real parser) ─────────────────────────

/** A complete, mode-fit video plan — the STRONG baseline. */
function strongPlan(): ProductionPlan {
  return parseProductionPlan({
    version: 1,
    projectId: "grade-strong",
    brief: "an unboxing video for my skincare product",
    register: "photoreal UGC selfie",
    vibe: "fast, authentic, scroll-stopping",
    sceneCount: 5,
    durationSec: 25,
    firstCheckpoint: "scene-01 anchor -> wait for go before batching the rest",
    aspect: "9:16",
    platform: "tiktok",
    contentMode: { mode: "unboxing-ugc", confidence: 0.9, ambiguous: false, alternatives: [] },
    formatTemplate: { format: "video", templateSlug: "unboxing-general", confidence: 0.7, source: "keyword" },
    craftOverlay: ["ugc-unboxing"],
    guidelinesUsed: [],
    // unboxing-ugc declares 2 required inputs (product + packaging ref).
    requiredRefs: ["product reference", "packaging reference"],
    benchmarkSource: "https://example.com/reference-unboxing-reel",
    audioPath: null,
    modelStack: [
      { role: "image", model: "google/gemini-3-pro-image-preview", unitCostUsd: 0.15 },
      { role: "video", model: "kwaivgi/kling-v3.0-pro", unitCostUsd: 0.05 },
      { role: "voiceover", model: "elevenlabs-tts", unitCostUsd: 0.05 },
      { role: "music", model: "elevenlabs-music", unitCostUsd: 0.1 },
    ],
    estimate: { costLowUsd: 2.0, costHighUsd: 3.2, wallClockMin: 14, basis: "5x image + 25s video + 5x VO + 1x music; high = low x 1.6" },
    bypasses: [],
  });
}

const dimStatus = (grade: { dimensions: Array<{ dimension: PlanGradeDimension; status: PlanGradeStatus }> }, d: PlanGradeDimension): PlanGradeStatus =>
  grade.dimensions.find((x) => x.dimension === d)!.status;

// ─── STRONG ───────────────────────────────────────────────────────────────────

describe("gradeProductionPlan — STRONG", () => {
  test("a complete mode-fit video plan grades strong; every dimension passes", async () => {
    const grade = await gradeProductionPlan(strongPlan());
    expect(() => parsePlanGrade(grade)).not.toThrow();
    expect(grade.verdict).toBe("strong");
    expect(grade.mode).toBe("unboxing-ugc");
    // No fail / warn across the eight dimensions.
    expect(grade.dimensions.every((d) => d.status === "pass")).toBe(true);
    expect(grade.dimensions.length).toBe(8);
  });
});

// ─── WEAK ───────────────────────────────────────────────────────────────────

describe("gradeProductionPlan — WEAK", () => {
  test("a research-required mode with no benchmarkSource warns (researchGrounding) → weak", async () => {
    const plan = strongPlan();
    plan.benchmarkSource = null; // unboxing-ugc defaultResearchDepth is "quick"
    const grade = await gradeProductionPlan(plan);
    expect(grade.verdict).toBe("weak");
    expect(dimStatus(grade, "researchGrounding")).toBe("warn");
    // No hard fail anywhere (still executable).
    expect(grade.dimensions.some((d) => d.status === "fail")).toBe(false);
  });

  test("an empty/incoherent estimate warns (costEta) → weak", async () => {
    const plan = strongPlan();
    plan.estimate = parseProductionPlan(strongPlan()).estimate;
    plan.estimate.costLowUsd = 0;
    plan.estimate.costHighUsd = 0;
    plan.estimate.wallClockMin = 0;
    plan.estimate.basis = undefined;
    const grade = await gradeProductionPlan(plan);
    expect(grade.verdict).toBe("weak");
    expect(dimStatus(grade, "costEta")).toBe("warn");
  });

  test("no first checkpoint warns (firstCheckpoint) → weak", async () => {
    const plan = strongPlan();
    plan.firstCheckpoint = "";
    const grade = await gradeProductionPlan(plan);
    expect(grade.verdict).toBe("weak");
    expect(dimStatus(grade, "firstCheckpoint")).toBe("warn");
  });

  test("an under-covered model stack warns (modelStack) → weak", async () => {
    const plan = strongPlan();
    // Drop the video + voiceover roles a video format needs.
    plan.modelStack = plan.modelStack.filter((m) => m.role === "image" || m.role === "music");
    const grade = await gradeProductionPlan(plan);
    expect(grade.verdict).toBe("weak");
    expect(dimStatus(grade, "modelStack")).toBe("warn");
  });

  test("an ambiguous mode warns (modeFit) → weak", async () => {
    const plan = strongPlan();
    plan.contentMode.ambiguous = true;
    const grade = await gradeProductionPlan(plan);
    expect(grade.verdict).toBe("weak");
    expect(dimStatus(grade, "modeFit")).toBe("warn");
  });
});

// ─── BLOCKED — a mode-required artifact is missing ────────────────────────────

describe("gradeProductionPlan — BLOCKED", () => {
  test("a mode that requires refs with an empty requiredRefs is blocked (missingInputs fail)", async () => {
    const plan = strongPlan();
    plan.requiredRefs = []; // unboxing-ugc requires product + packaging refs
    const grade = await gradeProductionPlan(plan);
    expect(grade.verdict).toBe("blocked");
    expect(dimStatus(grade, "missingInputs")).toBe("fail");
  });

  test("a lock-required mode with no style lock is blocked (styleLock fail)", async () => {
    // product-shot: guidelineOrStyleLock.required === true, requiredRefTypes ["product"].
    const plan = parseProductionPlan({
      version: 1,
      projectId: "grade-blocked-lock",
      brief: "a clean studio product shot on white",
      register: "", // no register
      sceneCount: 1,
      durationSec: 0,
      firstCheckpoint: "first still -> wait for go",
      aspect: "1:1",
      platform: "instagram",
      contentMode: { mode: "product-shot", confidence: 0.9, ambiguous: false, alternatives: [] },
      formatTemplate: { format: "image", templateSlug: "clean-dtc-product-shot", confidence: 0.6, source: "keyword" },
      craftOverlay: [],
      guidelinesUsed: [], // no guideline coverage
      requiredRefs: ["product reference image"],
      benchmarkSource: null,
      audioPath: null,
      modelStack: [{ role: "image", model: "google/gemini-3-pro-image-preview", unitCostUsd: 0.15 }],
      estimate: { costLowUsd: 0.15, costHighUsd: 0.24, wallClockMin: 2, basis: "1x image" },
      bypasses: [],
    });
    const grade = await gradeProductionPlan(plan);
    expect(grade.verdict).toBe("blocked");
    expect(dimStatus(grade, "styleLock")).toBe("fail");
  });

  test("an unclassified mode is blocked (modeFit fail)", async () => {
    const plan = strongPlan();
    plan.contentMode.mode = null;
    const grade = await gradeProductionPlan(plan);
    expect(grade.verdict).toBe("blocked");
    expect(dimStatus(grade, "modeFit")).toBe("fail");
  });

  test("an empty model stack is blocked (modelStack fail)", async () => {
    const plan = strongPlan();
    plan.modelStack = [];
    const grade = await gradeProductionPlan(plan);
    expect(grade.verdict).toBe("blocked");
    expect(dimStatus(grade, "modelStack")).toBe("fail");
  });

  test("an incoherent estimate (high < low) is blocked (costEta fail)", async () => {
    const plan = strongPlan();
    plan.estimate.costLowUsd = 5;
    plan.estimate.costHighUsd = 1;
    const grade = await gradeProductionPlan(plan);
    expect(grade.verdict).toBe("blocked");
    expect(dimStatus(grade, "costEta")).toBe("fail");
  });
});

// ─── Determinism + the optional LLM pass ──────────────────────────────────────

describe("gradeProductionPlan — determinism + optional LLM pass", () => {
  test("the deterministic core matches the async grader (no opts)", async () => {
    const plan = strongPlan();
    const sync = gradePlanDeterministic(plan);
    const asyncGrade = await gradeProductionPlan(plan);
    expect(sync.verdict).toBe(asyncGrade.verdict);
    expect(sync.dimensions.map((d) => d.status)).toEqual(asyncGrade.dimensions.map((d) => d.status));
    // No LLM note when no review fn is injected.
    expect(sync.llmReviewNote).toBeUndefined();
  });

  test("an injected warn LLM review demotes a strong plan to weak, never blocks", async () => {
    const llmReview = async () => ({ verdict: "warn" as const, note: "scene-count reasoning is thin for a 25s reel" });
    const grade = await gradeProductionPlan(strongPlan(), { llmReview });
    expect(grade.verdict).toBe("weak");
    expect(grade.llmReviewNote).toContain("thin");
    expect(dimStatus(grade, "firstCheckpoint")).toBe("warn");
  });

  test("a thrown LLM review never crashes — falls back to the deterministic grade", async () => {
    const llmReview = async () => {
      throw new Error("network down");
    };
    const grade = await gradeProductionPlan(strongPlan(), { llmReview });
    expect(grade.verdict).toBe("strong");
    expect(grade.llmReviewNote).toBeUndefined();
  });
});
