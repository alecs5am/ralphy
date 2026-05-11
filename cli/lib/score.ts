// Virality scoring — used by /ralph-researcher (rank scraped TikToks) and
// scenarist playbook (gate scenario drafts before handoff).
//
// All thresholds documented in docs/virality-rubric.md. This file mirrors the
// numbers there; if the doc changes, update this and vice versa.
//
// No external dependencies — pure deterministic checks. Cheap to call.

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
  durationSec?: number;
  text_overlays?: Array<{
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    text?: string;
    role?: string;
  }>;
  voiceover?: { text?: string; durationSec?: number };
};

export type Scenario = {
  duration?: number;          // total seconds, target
  angle?: string;
  hook?:
    | string
    | {
        primary?: string;
        variant_b?: string;
      };
  scenes?: ScenarioScene[];
};

export type ScenarioCheck = {
  passed: boolean;
  failures: string[];
  warnings: string[];
};

export function scoreScenario(scenario: Scenario): ScenarioCheck {
  const failures: string[] = [];
  const warnings: string[] = [];

  // Format tier from declared duration. Calibrates the rest of the gate so
  // long-form templates (storytime, ai-avatar, podcast-clip) aren't refused
  // by 15s-ad-shaped rules. See docs/render-test-2026-05-11.md §1.3.
  //   short-ad:  ≤15s  — first scene must be ≤3s, all scenes ≤3s, +0.5s cap
  //   mid-form:  15-45s — first scene ≤6s, scenes ≤8s, +1.0s cap
  //   long-form: >45s   — first scene ≤10s, scenes ≤12s, +2.0s cap
  // Hook word-count and hook presence apply universally.
  const declaredDuration = scenario.duration ?? 15;
  const tier: "short-ad" | "mid-form" | "long-form" =
    declaredDuration <= 15 ? "short-ad" : declaredDuration <= 45 ? "mid-form" : "long-form";
  const limits = tier === "short-ad"
    ? { firstSceneMax: 3, sceneMax: 3, durationOverhead: 0.5 }
    : tier === "mid-form"
    ? { firstSceneMax: 6, sceneMax: 8, durationOverhead: 1.0 }
    : { firstSceneMax: 10, sceneMax: 12, durationOverhead: 2.0 };

  // Hook present and short.
  const hookPrimary =
    typeof scenario.hook === "string" ? scenario.hook : scenario.hook?.primary;
  if (!hookPrimary || !hookPrimary.trim()) {
    failures.push("Missing hook.primary — first scene must have a hook line");
  } else {
    const wordCount = hookPrimary.trim().split(/\s+/).length;
    if (wordCount > 10) {
      failures.push(`Hook is ${wordCount} words; max 10 (one breath)`);
    }
  }

  // First scene = hook window. Tier-calibrated.
  const firstScene = scenario.scenes?.[0];
  if (firstScene) {
    const start = firstScene.durationSec ?? 0;
    if (start > limits.firstSceneMax) {
      failures.push(
        `First scene is ${start}s; hook must land in the first ${limits.firstSceneMax}s window (${tier} format, declared duration ${declaredDuration}s)`
      );
    }
  } else {
    failures.push("Scenario has no scenes[]");
  }

  // Total duration — hard cap relative to declared target, with tier overhead.
  const total = (scenario.scenes ?? []).reduce(
    (acc, s) => acc + (s.durationSec ?? 0),
    0
  );
  if (total > declaredDuration + limits.durationOverhead) {
    failures.push(
      `Total duration ${total}s exceeds target ${declaredDuration}s (${tier} hard cap +${limits.durationOverhead}s)`
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
  for (const scene of scenario.scenes ?? []) {
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
    failures.push(
      `Invalid angle "${scenario.angle}"; must be one of: ${VALID_ANGLES.join(", ")}`
    );
  }

  // Green Zone — every text overlay must fit.
  for (const scene of scenario.scenes ?? []) {
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

  return {
    passed: failures.length === 0,
    failures,
    warnings,
  };
}
