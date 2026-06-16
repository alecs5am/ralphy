// First-frame / hook gate (#440).
//
// Short-form videos win or lose in the OPENING FRAME and the first second. The
// broad native-video eval (#411) judges the whole clip; this gate is the
// FOCUSED scroll-stop critic of just the first frame + the first ~1s preview.
// A technically clean video with a weak opener underperforms — this makes that
// performance-oriented critique concrete, repeatable, and mode-thresholded.
//
// It is the direct sibling of the fidelity (#422) + OCR (#439) gates: same
// shape, same injectable-analyzer test seam, same `Finding`/`Verdict` machinery,
// same append-only report. It does NOT fork a parallel pipeline:
//   • the `Finding` shape + `score()`/`Verdict` from findings.ts,
//   • `extractKeyframes` from keyframes.ts for the first-frame extraction
//     (INJECTABLE so fixtures run with NO ffmpeg) — the issue says "extract the
//     first frame and first-second preview through existing Ralphy primitives",
//   • `checkTextLegibility` from ocr.ts for the TEXT-hook legibility sub-check
//     (no duplicate OCR — a baked-text-hook frame rides the existing gate),
//   • mode-thresholds keyed off the #412 content-mode registry.
//
// The hook read is a single `callLLM()` vision pass (read the first frame +
// the first-second frame; rate each hook dimension 0-10), NOT a new dependency.
// The analyzer is INJECTABLE so fixtures run with NO network/paid gen.
//
// Findings emit under the `hook.` category prefix:
//   hook.unclear-subject · hook.low-contrast · hook.subject-not-visible ·
//   hook.weak-text-hook · hook.no-curiosity-gap · hook.weak-scroll-stop ·
//   hook.misleading (the opener over-promises vs the rest of the clip).
// The scorecard `hook` dimension (#427) reads hook.json and MERGES it with the
// eval `structure.hook-zone` findings (worst wins); the repair plan (#409)
// classifies `hook.*` → scenarist (re-script the opening beat).

import path from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";
import { projectDir, artifactKindDir } from "../paths.js";
import { getContentMode } from "../content-modes.js";
import { score } from "./findings.js";
import { fileToDataUri } from "./vision.js";
import { extractKeyframes } from "./keyframes.js";
import { checkTextLegibility, type OcrAnalyzer } from "./ocr.js";
import { callLLM } from "../providers/llm.js";
import type { Finding, Severity, Verdict, Scene } from "./types.js";

const HOOK_MODEL = "google/gemini-2.5-flash";
const MEDIA_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);

/** Project-relative location the first-frame hook report is persisted to. */
export const HOOK_ARTIFACT = "hook.json" as const;

/** When (seconds) we sample the first frame and the first-second preview frame. */
const FIRST_FRAME_SEC = 0;
const FIRST_SECOND_SEC = 1;

/** The six hook dimensions the gate scores (0-10 each). */
export interface HookDimensionScores {
  /** Is the subject / hook visually clear at a glance? */
  subjectClarity: number;
  /** Is there enough figure/ground contrast to read on a feed at thumbnail size? */
  visualContrast: number;
  /** Is the subject / product actually visible (not cropped / buried / tiny)? */
  subjectVisibility: number;
  /** Is any baked text-hook legible (size / contrast / not clipped)? 10 when no text. */
  textHookLegibility: number;
  /** Does the opener open a curiosity gap that makes you want the next beat? */
  curiosityGap: number;
  /** Overall scroll-stop pull of the first frame. */
  scrollStop: number;
}

/**
 * The injectable analyzer: rates the first frame's hook on the six dimensions
 * (0-10) and flags whether the opener MISLEADS (over-promises vs the clip). The
 * first-second frame rides along so the model can judge motion-promise / a
 * static opener. Tests pass a fake; the default is a vision `callLLM()` pass.
 */
export type HookAnalyzer = (input: {
  /** Project-relative (or absolute) path of the first frame. */
  firstFrame: string;
  /** Path of the ~1s preview frame, or null when the clip is shorter. */
  firstSecondFrame: string | null;
  /** The resolved content mode (drives the model's tolerance), or null. */
  mode: string | null;
  projectId: string;
}) => Promise<{
  scores: HookDimensionScores;
  /** True when the opener over-promises relative to the rest of the clip. */
  misleading: boolean;
  /** Free-text issues the model raised that don't fit a dimension. */
  issues: Array<{ category: string; severity: Severity; message: string }>;
}>;

export interface HookReport {
  schemaVersion: "1.0";
  projectId: string;
  mode: string | null;
  /** False when there is no video to check (a stills-only project) → pass-through. */
  applicable: boolean;
  /** pass | warn | fail (from the eval `score()` over the collected findings). */
  verdict: Verdict;
  /** The single hard blocker the readiness path (#427) consults. */
  blocksShip: boolean;
  /** One-line reason for the verdict / blocksShip decision. */
  reason: string;
  /** The video whose first frame was checked (project-relative), or null. */
  video: string | null;
  /** The first-frame + first-second preview the analyzer read (absolute), or null. */
  frames: { firstFrame: string | null; firstSecond: string | null };
  /** Per-dimension 0-10 scores (carried through for the human report + tournament). */
  dimensions: HookDimensionScores | null;
  /**
   * The single 0-100 HOOK SCORE a variant tournament (#421) scorer can weight: a
   * mean of the six dimensions, on the same 0-100 scale as the manual /
   * model-assisted tournament scores. null when the gate did not run.
   */
  hookScore: number | null;
  /** All findings, flattened (the fixer/readiness path consumes these). */
  findings: Finding[];
}

/** First rendered video under render/ or artifacts/videos, or null. Never throws. */
function findVideo(projectId: string): string | null {
  const root = projectDir(projectId);
  const candidates = [path.join(root, "render", "final.mp4")];
  try {
    const vdir = artifactKindDir(projectId, "videos");
    if (existsSync(vdir)) {
      for (const f of readdirSync(vdir).sort()) {
        try {
          if (statSync(path.join(vdir, f)).isFile() && MEDIA_EXT.has(path.extname(f).toLowerCase())) {
            candidates.push(path.join(vdir, f));
          }
        } catch {
          // ignore unreadable dir entry
        }
      }
    }
  } catch {
    // ignore — stills-only project
  }
  const abs = candidates.find((c) => existsSync(c)) ?? null;
  return abs ? path.relative(root, abs) : null;
}

/**
 * Mode-specific PASS thresholds for the mean hook score (0-10) and the hard
 * scroll-stop floor. A scroll-first feed format (carousel cover, ad creative,
 * pinterest pin) demands a stronger opener than a talking-head UGC review where
 * the viewer is already half-committed. Derived from the registry intent:
 * commercial scroll-stop modes get the strict bar, the UGC video modes a
 * softer one, everything else the balanced default. Unknown mode → default.
 */
interface HookThresholds {
  /** Minimum mean-of-six score (0-10) to clear the gate without a warn. */
  meanWarn: number;
  /** Mean score (0-10) below which the gate FAILS (refuse, not warn). */
  meanFail: number;
  /** scrollStop dimension (0-10) below which the gate FAILS. */
  scrollStopFail: number;
}

const STRICT: HookThresholds = { meanWarn: 7, meanFail: 5, scrollStopFail: 4 };
const DEFAULT: HookThresholds = { meanWarn: 6, meanFail: 4, scrollStopFail: 3 };
const SOFT: HookThresholds = { meanWarn: 5, meanFail: 3, scrollStopFail: 2 };

/**
 * Resolve the hook thresholds for a mode. Scroll-first feed formats (the modes
 * whose deliverable lives or dies on the thumbnail) get STRICT; the
 * already-engaged UGC video / long-form modes get SOFT; the rest DEFAULT.
 * Deterministic, registry-derived, no LLM.
 */
export function hookThresholdsForMode(mode: string | null): HookThresholds {
  if (!mode) return DEFAULT;
  // Scroll-first: the opener IS the entire scroll-stop decision.
  const STRICT_MODES = new Set([
    "ad-creative-pack",
    "social-carousel",
    "pinterest-pin",
    "hero-banner",
    "amazon-listing",
  ]);
  // Already-engaged / longer-dwell: a softer opener is tolerated.
  const SOFT_MODES = new Set([
    "ugc-review",
    "tutorial-ugc",
    "unboxing-ugc",
    "podcast-video",
  ]);
  if (STRICT_MODES.has(mode)) return STRICT;
  if (SOFT_MODES.has(mode)) return SOFT;
  // Fall back to the registry's research depth as a coarse cue: a `none`-depth
  // quick still mode leans strict, otherwise default. Keeps it data-driven
  // without hand-listing every mode.
  const entry = getContentMode(mode);
  if (entry && entry.defaultResearchDepth === "deep") return STRICT;
  return DEFAULT;
}

/** Mean of the six dimension scores on the 0-10 scale. */
function meanScore(s: HookDimensionScores): number {
  const parts = [
    s.subjectClarity,
    s.visualContrast,
    s.subjectVisibility,
    s.textHookLegibility,
    s.curiosityGap,
    s.scrollStop,
  ];
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

/**
 * Run the first-frame hook gate for a project. Pure read — never mutates.
 * `analyze` is injectable (default = a vision `callLLM()` pass) so tests run with
 * NO network; `extractFrames` is injectable for the same reason (default = the
 * ffmpeg keyframe extractor). A stills-only project (no video) short-circuits to
 * an applicable:false pass.
 *
 * The TEXT-hook legibility sub-check reuses `checkTextLegibility` (#439) on the
 * extracted first frame rather than duplicating OCR — when its analyzer is
 * supplied (`textAnalyze`) and it reports an unreadable / clipped baked hook, the
 * dimension is pinned low and a `hook.weak-text-hook` finding is raised.
 */
export async function checkFirstFrameHook(input: {
  projectId: string;
  mode: string | null;
  /** Explicit project-relative video path (default: the first render / video). */
  videoPath?: string;
  analyze?: HookAnalyzer;
  extractFrames?: typeof extractKeyframes;
  /** Optional OCR analyzer for the text-hook legibility sub-check (reuses #439). */
  textAnalyze?: OcrAnalyzer;
}): Promise<HookReport> {
  const { projectId, mode } = input;
  const analyze = input.analyze ?? defaultAnalyzer;
  const extractFrames = input.extractFrames ?? extractKeyframes;

  const video = input.videoPath ?? findVideo(projectId);
  const naReport = (reason: string): HookReport => ({
    schemaVersion: "1.0",
    projectId,
    mode: mode ?? null,
    applicable: false,
    verdict: "pass",
    blocksShip: false,
    reason,
    video: video ?? null,
    frames: { firstFrame: null, firstSecond: null },
    dimensions: null,
    hookScore: null,
    findings: [],
  });

  if (!video) {
    return naReport("no rendered video found — first-frame hook gate not applicable (re-run after render).");
  }

  const findings: Finding[] = [];
  let nextId = 1;
  const add = (x: Omit<Finding, "id">) => {
    const f: Finding = { id: `HOOK${nextId++}`, ...x };
    findings.push(f);
    return f;
  };

  // — Extract the first frame (0s) + the first-second preview (~1s). We reuse the
  //   keyframe extractor by feeding it two single-frame "scenes" pinned to those
  //   timecodes (durationSec 0 → it samples exactly at startSec).
  const root = projectDir(projectId);
  const absVideo = path.isAbsolute(video) ? video : path.join(root, video);
  const framesDir = path.join(root, "hook-frames");
  const sampleScenes: Scene[] = [
    { index: 0, startSec: FIRST_FRAME_SEC, endSec: FIRST_FRAME_SEC, durationSec: 0, firstFramePath: null },
    { index: 1, startSec: FIRST_SECOND_SEC, endSec: FIRST_SECOND_SEC, durationSec: 0, firstFramePath: null },
  ];
  let firstFrame: string | null = null;
  let firstSecond: string | null = null;
  try {
    const extracted = await extractFrames(absVideo, sampleScenes, framesDir);
    firstFrame = extracted[0]?.firstFramePath ?? null;
    firstSecond = extracted[1]?.firstFramePath ?? null;
  } catch (e) {
    add({
      category: "hook.frame-extraction-failed",
      severity: "warn",
      sceneIndex: 0,
      timestampSec: 0,
      message: `Could not extract the first frame from ${video}: ${(e as Error).message}`,
      fixHint: "Re-run the hook gate once ffmpeg is available and the render is readable.",
      fixCommand: null,
    });
  }

  if (!firstFrame) {
    // Extraction yielded no first frame (failed, or the extractor returned null).
    // Record a single warn (inconclusive, not a fail) if nothing was added above.
    if (findings.length === 0) {
      add({
        category: "hook.frame-extraction-failed",
        severity: "warn",
        sceneIndex: 0,
        timestampSec: 0,
        message: `No first frame could be extracted from ${video} — hook gate inconclusive.`,
        fixHint: "Re-run the hook gate once ffmpeg is available and the render is readable.",
        fixCommand: null,
      });
    }
    const { verdict } = score(findings);
    return {
      ...naReport("first frame could not be extracted — hook gate inconclusive (re-run after a clean render)."),
      applicable: false,
      verdict,
      frames: { firstFrame, firstSecond },
      findings,
    };
  }

  // — Vision pass over the first frame (+ first-second preview).
  let r: Awaited<ReturnType<HookAnalyzer>>;
  try {
    r = await analyze({ firstFrame, firstSecondFrame: firstSecond, mode: mode ?? null, projectId });
  } catch (e) {
    add({
      category: "hook.analysis-failed",
      severity: "warn",
      sceneIndex: 0,
      timestampSec: 0,
      message: `Hook analysis failed for ${video}: ${(e as Error).message}`,
      fixHint: "Re-run the hook gate once a model provider is reachable.",
      fixCommand: null,
    });
    const { verdict } = score(findings);
    return {
      ...naReport("hook analysis could not run — re-run once a model provider is reachable."),
      applicable: true,
      verdict,
      frames: { firstFrame, firstSecond },
      findings,
    };
  }

  const dimensions = r.scores;
  const th = hookThresholdsForMode(mode);
  const mean = meanScore(dimensions);
  const hookScore = Number((mean * 10).toFixed(1)); // 0-10 → 0-100

  // — Per-dimension findings. Each dimension that lands below the MODE floor
  //   raises a `hook.*` finding: below the mode fail-floor is a fail, below the
  //   mode warn-bar is a warn, at-or-above the warn-bar passes. Mode-driven so a
  //   soft UGC mode tolerates a mid dimension a strict scroll-first mode flags.
  const dimSeverity = (v: number): Severity | null =>
    v < th.meanFail ? "fail" : v < th.meanWarn ? "warn" : null;
  const emitDim = (
    v: number,
    category: string,
    failMsg: string,
    warnMsg: string,
    fixHint: string,
  ) => {
    const sev = dimSeverity(v);
    if (!sev) return;
    add({
      category,
      severity: sev,
      sceneIndex: 0,
      timestampSec: 0,
      message: `${sev === "fail" ? failMsg : warnMsg} (scored ${v}/10).`,
      fixHint,
      fixCommand: null,
    });
  };

  emitDim(
    dimensions.subjectClarity,
    "hook.unclear-subject",
    "First frame has no clear subject — the viewer can't tell what this is in the first beat",
    "First-frame subject reads weakly",
    "Re-script the opening beat so the subject/hook is unmistakable in frame one; lead with the payoff, not a slow build.",
  );
  emitDim(
    dimensions.visualContrast,
    "hook.low-contrast",
    "First frame is low-contrast — it disappears at feed thumbnail size",
    "First-frame contrast is soft",
    "Open on a high figure/ground-contrast frame; punch the subject off the background so it survives a small autoplay thumbnail.",
  );
  emitDim(
    dimensions.subjectVisibility,
    "hook.subject-not-visible",
    "Subject/product is not clearly visible in the first frame (cropped / buried / tiny)",
    "Subject/product is only partly visible up front",
    "Frame the subject/product large and centered in the opener; do not bury the payoff behind a logo card or an empty establishing shot.",
  );
  emitDim(
    dimensions.textHookLegibility,
    "hook.weak-text-hook",
    "The baked text-hook is illegible in the first frame (too small / clipped / low-contrast)",
    "The baked text-hook is hard to read up front",
    "Enlarge the hook text, raise its contrast, and keep it inside the safe area; a hook line you can't read on autoplay is no hook.",
  );
  emitDim(
    dimensions.curiosityGap,
    "hook.no-curiosity-gap",
    "First frame opens no curiosity gap — nothing makes the viewer want the next beat",
    "First-frame curiosity gap is thin",
    "Open a question/tension the rest of the clip pays off (a stakes line, a reveal tease, a pattern-interrupt) instead of a flat statement.",
  );
  emitDim(
    dimensions.scrollStop,
    "hook.weak-scroll-stop",
    "First frame has weak scroll-stop pull — it reads as scrollable",
    "First-frame scroll-stop pull is mild",
    "Strengthen the opener: a bolder visual, a sharper hook line, or a motion beat in the first second so the thumb stops.",
  );

  // — Mode-thresholded hard floors (on top of the per-dimension findings): a mean
  //   below the mode fail-floor, or a scroll-stop below the mode floor, is a hard
  //   fail even if no single dimension tripped — the OPENER as a whole is too weak
  //   for this mode.
  if (mean < th.meanFail) {
    add({
      category: "hook.weak-scroll-stop",
      severity: "fail",
      sceneIndex: 0,
      timestampSec: 0,
      message: `Overall hook strength ${hookScore}/100 is below the fail floor for mode "${mode ?? "default"}" (mean ${mean.toFixed(1)} < ${th.meanFail}/10).`,
      fixHint: "Re-script and re-shoot the opening beat — the first frame is too weak to scroll-stop for this format.",
      fixCommand: null,
    });
  } else if (mean < th.meanWarn) {
    add({
      category: "hook.weak-scroll-stop",
      severity: "warn",
      sceneIndex: 0,
      timestampSec: 0,
      message: `Overall hook strength ${hookScore}/100 is under the recommended bar for mode "${mode ?? "default"}" (mean ${mean.toFixed(1)} < ${th.meanWarn}/10).`,
      fixHint: "Tighten the opener before shipping; this format rewards a stronger first frame.",
      fixCommand: null,
    });
  }
  if (dimensions.scrollStop < th.scrollStopFail) {
    add({
      category: "hook.weak-scroll-stop",
      severity: "fail",
      sceneIndex: 0,
      timestampSec: 0,
      message: `Scroll-stop pull ${dimensions.scrollStop}/10 is below the floor for mode "${mode ?? "default"}" (< ${th.scrollStopFail}/10).`,
      fixHint: "The opener does not stop the scroll for this format — rebuild the first frame around the strongest visual / hook line.",
      fixCommand: null,
    });
  }

  // — A MISLEADING opener (over-promises vs the clip) is a hard fail: it stops the
  //   scroll but burns trust / retention. Distinct from a weak hook.
  if (r.misleading) {
    add({
      category: "hook.misleading",
      severity: "fail",
      sceneIndex: 0,
      timestampSec: 0,
      message: "First frame over-promises relative to the rest of the clip — a misleading hook tanks retention and trust.",
      fixHint: "Align the opener with what the clip actually delivers; keep the scroll-stop honest or the watch-through collapses.",
      fixCommand: null,
    });
  }

  // — TEXT-hook legibility sub-check: reuse the #439 OCR gate on the first frame
  //   rather than duplicating OCR. We only run it when a text analyzer is wired
  //   (the default vision path already judges legibility in `textHookLegibility`);
  //   when it surfaces an unreadable / clipped baked hook we pin the finding.
  if (input.textAnalyze) {
    try {
      const text = await checkTextLegibility({
        projectId,
        mode: mode ?? "social-carousel", // treat the first frame as a baked-text frame for this sub-check
        frames: [firstFrame],
        analyze: input.textAnalyze,
      });
      const textFail = text.findings.find(
        (f) => f.category === "text.unreadable-small-text" || f.category === "text.clipped-text",
      );
      if (textFail) {
        add({
          category: "hook.weak-text-hook",
          severity: "fail",
          sceneIndex: 0,
          timestampSec: 0,
          message: `Baked text-hook in the first frame is not readable: ${textFail.message}`,
          fixHint: "Enlarge / re-contrast the hook text and keep it inside the safe area before shipping.",
          fixCommand: null,
        });
      }
    } catch {
      // OCR sub-check is best-effort — the primary vision pass already scored legibility.
    }
  }

  // — Carry the model's free-text issues through verbatim (namespaced under hook.).
  for (const iss of r.issues ?? []) {
    add({
      category: `hook.${iss.category}`,
      severity: iss.severity,
      sceneIndex: 0,
      timestampSec: 0,
      message: iss.message,
      fixHint: "Review the flagged opener issue against the first frame.",
      fixCommand: null,
    });
  }

  const { verdict } = score(findings);
  const blocksShip = verdict === "fail";
  const failCount = findings.filter((f) => f.severity === "fail").length;

  return {
    schemaVersion: "1.0",
    projectId,
    mode: mode ?? null,
    applicable: true,
    verdict,
    blocksShip,
    reason: blocksShip
      ? `${failCount} first-frame hook failure(s) — the opener is too weak / misleading to scroll-stop for mode "${mode ?? "default"}". Blocks ship-ready until fixed.`
      : verdict === "warn"
        ? `first-frame hook is shippable but soft for mode "${mode ?? "default"}" (hook score ${hookScore}/100). Tighten the opener before shipping; not a hard block.`
        : `first frame scroll-stops cleanly for mode "${mode ?? "default"}" (hook score ${hookScore}/100).`,
    video,
    frames: { firstFrame, firstSecond },
    dimensions,
    hookScore,
    findings,
  };
}

/** Best-effort image data-URI for a project-relative or absolute path; null when unreadable. */
async function frameDataUri(projectId: string, p: string): Promise<string | null> {
  try {
    const abs = path.isAbsolute(p) ? p : path.join(projectDir(projectId), p);
    return await fileToDataUri(abs);
  } catch {
    return null;
  }
}

/**
 * Default analyzer — one vision `callLLM()` jsonMode pass. It attaches the FIRST
 * frame, then the first-second preview frame (so the model can judge a static
 * opener / motion promise), and asks the model to rate the six hook dimensions
 * 0-10 and flag a misleading opener. An unreadable frame defaults to a neutral
 * mid score (do-not-invent a failure rule).
 */
const defaultAnalyzer: HookAnalyzer = async ({ firstFrame, firstSecondFrame, mode, projectId }) => {
  const sys = `You are a scroll-stop / hook critic for the FIRST FRAME of a short-form (TikTok/Reels/Shorts) video.
The FIRST attached image is the opening frame (t=0). A SECOND image, when present, is the frame ~1 second in (for judging motion promise vs a static opener).
Rate the OPENING on each dimension 0-10 (10 = excellent). Return JSON only:
{
  "scores": {
    "subjectClarity": 0-10,     // is the subject/hook unmistakable at a glance?
    "visualContrast": 0-10,     // enough figure/ground contrast to read at thumbnail size?
    "subjectVisibility": 0-10,  // is the subject/product clearly visible (not cropped/buried/tiny)?
    "textHookLegibility": 0-10, // is any baked text-hook legible? Return 10 if there is no text.
    "curiosityGap": 0-10,       // does it open a question that makes you want the next beat?
    "scrollStop": 0-10          // overall: would this stop a thumb on autoplay?
  },
  "misleading": boolean,        // does the opener OVER-PROMISE relative to what the clip looks like it delivers?
  "issues": [ { "category": "string", "severity": "info|warn|fail", "message": "specific" } ]
}
Judge for the format intent "${mode ?? "short-form video"}". Do not invent text that is not present. When a frame is unreadable, default its scores to 5.`;

  const content: Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
  > = [
    {
      type: "text",
      text: `Rate the opening frame of this ${mode ?? "short-form"} video. First image = t=0. Second image (if present) = ~1s in.`,
    },
  ];
  const firstUri = await frameDataUri(projectId, firstFrame);
  if (firstUri) content.push({ type: "image_url", image_url: { url: firstUri } });
  if (firstSecondFrame) {
    const secondUri = await frameDataUri(projectId, firstSecondFrame);
    if (secondUri) content.push({ type: "image_url", image_url: { url: secondUri } });
  }

  const res = await callLLM({
    model: HOOK_MODEL,
    messages: [
      { role: "system", content: sys },
      { role: "user", content },
    ],
    jsonMode: true,
    maxTokens: 700,
    projectId,
    endpoint: "openrouter/eval-hook",
  });
  const parsed = safeParse(res.text);
  const s = (parsed.scores ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : 5;
  };
  return {
    scores: {
      subjectClarity: num(s.subjectClarity),
      visualContrast: num(s.visualContrast),
      subjectVisibility: num(s.subjectVisibility),
      textHookLegibility: num(s.textHookLegibility),
      curiosityGap: num(s.curiosityGap),
      scrollStop: num(s.scrollStop),
    },
    misleading: parsed.misleading === true,
    issues: Array.isArray(parsed.issues)
      ? parsed.issues.filter(
          (i: unknown): i is { category: string; severity: Severity; message: string } =>
            !!i && typeof i === "object" &&
            typeof (i as any).category === "string" && typeof (i as any).message === "string" &&
            (["info", "warn", "fail"] as Severity[]).includes((i as any).severity as Severity),
        )
      : [],
  };
};

function safeParse(text: string): Record<string, any> {
  try {
    return JSON.parse(text);
  } catch {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s >= 0 && e > s) {
      try {
        return JSON.parse(text.slice(s, e + 1));
      } catch {
        return {};
      }
    }
    return {};
  }
}
