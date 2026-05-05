// Virality scoring — used by /ralph-researcher (rank scraped TikToks) and
// /ralph-scenarist (gate scenario drafts before handoff).
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

const VALID_ANGLES = [
  "testimonial",
  "unboxing",
  "problem-solution",
  "comparison",
  "demo",
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

  // Hook in first 3 seconds.
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

  const firstScene = scenario.scenes?.[0];
  if (firstScene) {
    const start = firstScene.durationSec ?? 0;
    if (start > 3) {
      failures.push(
        `First scene is ${start}s; hook must land in the first 3s window`
      );
    }
  } else {
    failures.push("Scenario has no scenes[]");
  }

  // Total duration.
  const total = (scenario.scenes ?? []).reduce(
    (acc, s) => acc + (s.durationSec ?? 0),
    0
  );
  const target = scenario.duration ?? 15;
  if (total > target + 0.5) {
    failures.push(
      `Total duration ${total}s exceeds target ${target}s (hard cap +0.5s)`
    );
  }
  if (total > 15) {
    warnings.push(
      `Total duration ${total}s exceeds 15s short-form sweet spot`
    );
  }

  // Per-scene cut discipline.
  for (const scene of scenario.scenes ?? []) {
    if ((scene.durationSec ?? 0) > 3) {
      warnings.push(
        `Scene ${scene.id ?? "?"} is ${scene.durationSec}s — break with internal cut/transition`
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
