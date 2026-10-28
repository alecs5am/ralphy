// Virality scoring — used by /researcher (rank scraped TikToks) and
// scenarist playbook (gate scenario drafts before handoff).
//
// All thresholds documented in docs/virality-rubric.md. This file mirrors the
// numbers there; if the doc changes, update this and vice versa.
//
// No external packages — pure deterministic checks over the content-mode registry. Cheap to call.

import { getContentMode } from "./content-modes.js";
import { strictRubricEnabled } from "./eval/strict-rubric.js";

// --- Part 1: TikTok engagement ranking ---------------------------------

export type TikTokMetrics = {
  playCount: number;
  diggCount: number;     // likes
  commentCount: number;
  shareCount: number;
};

export type TikTokScore = {
  score: number;                 // 0..12
  tier: "viral" | "great" | "good" | "weak";
  ratios: {
    likeRatio: number;
    commentRatio: number;
    shareRatio: number;
  };
  breakdown: {
    likeTier: number;
    commentTier: number;
    shareTier: number;
    viewTier: number;
  };
};

function tier(value: number, good: number, great: number, viral: number): number {
  if (value >= viral) return 3;
  if (value >= great) return 2;
  if (value >= good) return 1;
  return 0;
}

export function scoreTikTok(m: TikTokMetrics): TikTokScore {
  const plays = Math.max(1, m.playCount);
  const likeRatio = m.diggCount / plays;
  const commentRatio = m.commentCount / plays;
  const shareRatio = m.shareCount / plays;

  const likeTier = tier(likeRatio, 0.05, 0.10, 0.15);
  const commentTier = tier(commentRatio, 0.005, 0.01, 0.02);
  const shareTier = tier(shareRatio, 0.003, 0.01, 0.03);
  const viewTier =
    plays >= 1_000_000 ? 3 : plays >= 100_000 ? 2 : plays >= 10_000 ? 1 : 0;

  const score = likeTier + commentTier + shareTier + viewTier;
  const t: TikTokScore["tier"] =
    score >= 9 ? "viral" : score >= 6 ? "great" : score >= 3 ? "good" : "weak";

  return {
    score,
    tier: t,
    ratios: { likeRatio, commentRatio, shareRatio },
    breakdown: { likeTier, commentTier, shareTier, viewTier },
  };
}

// --- Part 2: Scenario quality gate -------------------------------------

// Mirror of src/lib/utils/green-zone.ts (1080×1920 canvas, X 60→960, Y 210→1480).
// Duplicated to avoid cross-root imports between cli/ and src/.
const GREEN_ZONE = { xMin: 60, xMax: 960, yMin: 210, yMax: 1480 };

// Angle taxonomy. Originally calibrated for 15s e-commerce ads (the first 5
// values). Extended 2026-05-11 to cover narrative / explainer / hook-driven
// formats surfaced in the Top-20 templates audit — without these, half the
// pack auto-fails the score gate for "invalid angle". See
// docs/render-test-2026-05-11.md §1.3 for the empirical findings.
const VALID_ANGLES = [
  // commerce-ad angles
  "testimonial",
  "unboxing",
  "problem-solution",
  "comparison",
  "demo",
  // narrative / explainer angles
  "storytime",
  "history-fact",
  "tutorial",
  "listicle",
  "tier-list",
  "expert-explainer",
  "news-brief",
  "talking-head-rant",
  // creator / lifestyle angles
  "grwm",
  "pov-relatable",
  "photo-dump",
  "podcast-clip",
  // viral / meme angles
  "brainrot-narration",
  "italian-brainrot",
  "trending-sound-remix",
  "ai-avatar",
  // sensory
  "asmr",
] as const;

type ScenarioScene = {
  id?: string;
  /** Legacy field — see normalizeScene(). */
  durationSec?: number;
  /** Canonical field per cli/lib/schemas/scene.ts (ScenarioSchema). */
  target_duration_s?: number;
  text_overlays?: Array<{
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    text?: string;
    role?: string;
  }>;
  voiceover?: { text?: string; durationSec?: number };
  vo_text?: string;
  role?: string;
};

export type Scenario = {
  /** Legacy field — total seconds, target. */
  duration?: number;
  /** Canonical field per ScenarioSchema. */
  target_duration_s?: number;
  /** Alias some scenario writers use for the declared total (read since #569). */
  durationSec?: number;
  /** Content mode the scenario was written for (drives gate applicability). */
  content_mode?: string;
  angle?: string;
  hook?:
    | string
    | {
        primary?: string;
        variant_b?: string;
        /** Canonical SceneRef shape (per ScenarioSchema). */
        scene_id?: string;
        vo?: string;
        duration_s?: number;
      };
  /**
   * Scenes. Canonical (per ScenarioSchema) is a record keyed by scene id.
   * Legacy shape was an array of scenes. Both are accepted; record is preferred.
   */
  scenes?: ScenarioScene[] | Record<string, ScenarioScene>;
};

export type ScenarioCheck = {
  passed: boolean;
  failures: string[];
  warnings: string[];
  /** The duration tier the checks were calibrated to. */
  tier?: "short-ad" | "mid-form" | "long-form";
  /** Set when the content mode does not declare this gate, so format findings
   *  were downgraded to warnings (#569). Null when the gate applied in full. */
  advisory?: string | null;
};

export type ScenarioScoreOptions = {
  /** Content mode (production-plan.json contentMode). Default: scenario.content_mode. */
  mode?: string | null;
  /** Restore the pre-audit (#569) behavior. Default: RALPHY_EVAL_STRICT_RUBRIC. */
  strictRubric?: boolean;
};

/**
 * Normalize a single scene across legacy + canonical shapes.
 * Canonical (per cli/lib/schemas/scene.ts):  target_duration_s, vo_text.
 * Legacy:                                    durationSec, voiceover.text.
 */
function normalizeScene(s: ScenarioScene) {
  return {
    id: s.id,
    durationSec: s.target_duration_s ?? s.durationSec ?? 0,
    text_overlays: s.text_overlays ?? [],
  };
}

/**
 * Normalize the scenes container to an array regardless of input shape.
 * Returns `{ scenes: ScenarioScene[]; shape: "record" | "array" | "missing" }`.
 */
function normalizeScenes(input: Scenario["scenes"]): {
  scenes: ScenarioScene[];
  shape: "record" | "array" | "missing";
} {
  if (input == null) return { scenes: [], shape: "missing" };
  if (Array.isArray(input)) return { scenes: input, shape: "array" };
  if (typeof input === "object") {
    // Record keyed by scene id. Preserve insertion order (matches JSON.parse
    // key order — same order scenarist emitted them). Inject the key as `id`
    // when the value omits it, so downstream logic ("first scene", per-scene
    // reporting) still has a stable identifier.
    const scenes = Object.entries(input).map(([key, value]) => ({
      ...value,
      id: value.id ?? key,
    }));
    return { scenes, shape: "record" };
  }
  return { scenes: [], shape: "missing" };
}

export function scoreScenario(scenario: Scenario, opts: ScenarioScoreOptions = {}): ScenarioCheck {
  const strict = opts.strictRubric ?? strictRubricEnabled();
  // Two kinds of hard fail. FORMAT failures encode rubric defaults tuned on
  // 15-second commerce clips (hook window, hook length, duration cap, angle,
  // scene presence); DEFECT failures are real regardless of format (text the
  // platform UI will cover). Since #569 the format failures become warnings
  // when the scenario's content mode does not declare scoreScenario as a gate.
  const formatFailures: string[] = [];
  const failures: string[] = [];
  const warnings: string[] = [];

  // Normalize scenes upfront so the rest of the gate is shape-agnostic.
  // Canonical schema (cli/lib/schemas/scene.ts) keys scenes by id; legacy
  // shape was an array. Both are accepted — record preferred.
  const { scenes: scenesList, shape: scenesShape } = normalizeScenes(scenario.scenes);
  if (scenesShape === "array" && scenesList.length > 0) {
    warnings.push(
      "scenario.scenes is an array (legacy shape); canonical schema uses a record keyed by scene id. " +
        "See cli/lib/schemas/scene.ts → ScenarioSchema."
    );
  }
  const normalizedScenes = scenesList.map(normalizeScene);
  const total = normalizedScenes.reduce((acc, s) => acc + (s.durationSec ?? 0), 0);

  // Format tier from declared duration. Calibrates the rest of the gate so
  // long-form templates (storytime, ai-avatar, podcast-clip) aren't refused
  // by 15s-ad-shaped rules. See docs/render-test-2026-05-11.md §1.3.
  //   short-ad:  ≤15s  — first scene must be ≤3s, all scenes ≤3s, +0.5s cap
  //   mid-form:  15-45s — first scene ≤6s, scenes ≤8s, +1.0s cap
  //   long-form: >45s   — first scene ≤10s, scenes ≤12s, +2.0s cap
  // An undeclared duration used to default to 15s, which refused every long
  // scenario that spelled its length `durationSec` (#569). Now `durationSec` is
  // read as an alias, and with no declaration at all the tier follows the
  // planned scene total and there is no target to exceed.
  const declaredRaw = scenario.target_duration_s ?? scenario.duration ?? scenario.durationSec;
  const declared = typeof declaredRaw === "number" && declaredRaw > 0 ? declaredRaw : null;
  const declaredDuration = declared ?? (total > 0 ? total : 15);
  const tier: "short-ad" | "mid-form" | "long-form" =
    declaredDuration <= 15 ? "short-ad" : declaredDuration <= 45 ? "mid-form" : "long-form";
  const limits = tier === "short-ad"
    ? { firstSceneMax: 3, sceneMax: 3, durationOverhead: 0.5 }
    : tier === "mid-form"
    ? { firstSceneMax: 6, sceneMax: 8, durationOverhead: 1.0 }
    : { firstSceneMax: 10, sceneMax: 12, durationOverhead: 2.0 };

  // Hook present and short. Accept three shapes:
  //   • legacy string                — scenario.hook = "watch this"
  //   • legacy object with primary   — scenario.hook.primary
  //   • canonical SceneRef           — scenario.hook = { scene_id, vo, duration_s }
  // The 10-word cap is a short-ad default; the course the retention review is
  // grounded in sets no word cap (docs/virality-rubric.md, #571). Since #569 it
  // is a hard fail for the short-ad tier only and a warning above it.
  const hookObj = typeof scenario.hook === "object" ? scenario.hook : null;
  const hookPrimary =
    typeof scenario.hook === "string"
      ? scenario.hook
      : hookObj?.primary ?? hookObj?.vo;
  if (!hookPrimary || !hookPrimary.trim()) {
    formatFailures.push("Missing hook.primary — first scene must have a hook line");
  } else {
    const wordCount = hookPrimary.trim().split(/\s+/).length;
    if (wordCount > 10) {
      if (strict || tier === "short-ad") {
        formatFailures.push(`Hook is ${wordCount} words; max 10 (one breath)`);
      } else {
        warnings.push(
          `Hook is ${wordCount} words; the 10-word cap is a short-ad default (${tier} format) — check the opening reads at its pace`
        );
      }
    }
  }

  // First scene = hook window. Tier-calibrated.
  const firstScene = normalizedScenes[0];
  if (firstScene) {
    const start = firstScene.durationSec ?? 0;
    if (start > limits.firstSceneMax) {
      formatFailures.push(
        `First scene is ${start}s; hook must land in the first ${limits.firstSceneMax}s window (${tier} format, ${declared !== null ? `declared duration ${declaredDuration}s` : `planned total ${declaredDuration}s`})`
      );
    }
  } else {
    formatFailures.push("Scenario has no scenes[]");
  }

  // Total duration — hard cap relative to the declared target, with tier
  // overhead. Without a declared target there is nothing to exceed.
  if (declared !== null && total > declared + limits.durationOverhead) {
    formatFailures.push(
      `Total duration ${total}s exceeds target ${declared}s (${tier} hard cap +${limits.durationOverhead}s)`
    );
  }
  // Short-form sweet-spot warning only for templates that DECLARED short-ad
  // intent — long-form templates are intentionally above 15s.
  if (tier === "short-ad" && total > 15) {
    warnings.push(
      `Total duration ${total}s exceeds 15s short-form sweet spot`
    );
  }

  // Per-scene cut discipline — tier-calibrated.
  for (const scene of normalizedScenes) {
    if ((scene.durationSec ?? 0) > limits.sceneMax) {
      warnings.push(
        `Scene ${scene.id ?? "?"} is ${scene.durationSec}s — break with internal cut/transition (${tier} max ${limits.sceneMax}s)`
      );
    }
  }

  // Angle present.
  if (!scenario.angle) {
    warnings.push(
      `No angle set; pick one of: ${VALID_ANGLES.join(", ")}`
    );
  } else if (!VALID_ANGLES.includes(scenario.angle as any)) {
    formatFailures.push(
      `Invalid angle "${scenario.angle}"; must be one of: ${VALID_ANGLES.join(", ")}`
    );
  }

  // Green Zone — every text overlay must fit. A real defect in every format.
  for (const scene of normalizedScenes) {
    for (const overlay of scene.text_overlays ?? []) {
      const x = overlay.x ?? 0;
      const y = overlay.y ?? 0;
      const w = overlay.width ?? 0;
      const h = overlay.height ?? 0;
      if (y < GREEN_ZONE.yMin || y + h > GREEN_ZONE.yMax) {
        failures.push(
          `Overlay "${(overlay.text || overlay.role || "?").slice(0, 30)}" at y=${y} (h=${h}) ` +
            `is outside Green Zone (Y ${GREEN_ZONE.yMin}–${GREEN_ZONE.yMax}); ` +
            `platform UI will cover it`
        );
      }
      if (x < GREEN_ZONE.xMin || x + w > GREEN_ZONE.xMax) {
        failures.push(
          `Overlay "${(overlay.text || overlay.role || "?").slice(0, 30)}" at x=${x} (w=${w}) ` +
            `is outside Green Zone (X ${GREEN_ZONE.xMin}–${GREEN_ZONE.xMax})`
        );
      }
    }
  }

  // Mode applicability (#569). The content-mode registry names the gates each
  // mode runs; for a mode that does not list scoreScenario (personal-clipper,
  // podcast-video, motion-design, typography-animation, infographic-animation)
  // the format failures are reported as warnings instead of refusing the
  // handoff. An unknown or missing mode keeps the gate hard.
  const mode = opts.mode ?? scenario.content_mode ?? null;
  const entry = mode ? getContentMode(mode) : undefined;
  const gateApplies = !entry || entry.qualityGates.includes("scoreScenario");
  let advisory: string | null = null;
  if (!strict && !gateApplies && formatFailures.length > 0) {
    advisory =
      `scoreScenario is not a declared quality gate for content mode "${mode}" ` +
      `(its gates: ${entry!.qualityGates.join(", ") || "none"}); format findings are reported as warnings.`;
    for (const f of formatFailures) warnings.push(`(advisory for ${mode}) ${f}`);
    formatFailures.length = 0;
  }

  const allFailures = [...formatFailures, ...failures];
  return {
    passed: allFailures.length === 0,
    failures: allFailures,
    warnings,
    tier,
    advisory,
  };
}
