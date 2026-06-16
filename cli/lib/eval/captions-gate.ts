// Caption sync + readability gate (#441).
//
// AGENTS.md already mandates SCRIBE-FIRST caption timing — word-level `startMs`
// is the source of truth for cuts and caption windows. The missing piece is a
// FINAL gate that checks whether the captions a project actually shipped are
// readable, on-time, not overcrowded, and not blocking the important visual
// (faces / products / CTAs). A mis-timed or overcrowded caption track makes an
// otherwise-good short feel cheap — cheaper to catch here, before Unit formation.
//
// It is the direct sibling of the OCR (#439) + first-frame hook (#440) +
// fidelity (#422) gates: same shape, same injectable-analyzer test seam, same
// `Finding`/`Verdict` machinery, same append-only report. It does NOT fork a
// parallel pipeline:
//   • the `Finding` shape + `score()`/`Verdict` from findings.ts,
//   • the on-disk caption shape (`Caption`, startMs/endMs) from captions/types,
//   • `extractKeyframes` from keyframes.ts for the placement/occlusion frames
//     (INJECTABLE so fixtures run with NO ffmpeg),
//   • a single `callLLM()` vision pass for the placement/occlusion read,
//     INJECTABLE so fixtures run with NO network / paid gen.
//
// ENRICH, don't duplicate. `cli/lib/eval/findings.ts` already emits the
// DENSITY findings (`captions.thin` / `captions.dense` / `captions.missing`,
// derived from `CaptionStats.wordsPerSecond`, no model). This gate ADDS the
// deeper checks under NEW `captions.*` categories that flow into the SAME
// scorecard `captions` dimension (#427, keyed on the `captions.` prefix) and the
// SAME repair plan (editor owner, #409 `EDITOR_PREFIXES`):
//   captions.drift            — a caption window is off vs the word-level timing.
//   captions.late             — a caption fires noticeably AFTER its words start.
//   captions.too-short        — a caption is on screen too briefly to read.
//   captions.overcrowded      — too many words in one caption window.
//   captions.occluding        — the caption box overlaps a face / product / CTA.
//   captions.unsafe-placement — the caption sits in the platform UI chrome zone.
// The density categories stay OWNED by findings.ts; this gate never re-emits
// them.

import path from "node:path";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { projectDir, artifactKindDir } from "../paths.js";
import { score } from "./findings.js";
import { fileToDataUri } from "./vision.js";
import { extractKeyframes } from "./keyframes.js";
import { callLLM } from "../providers/llm.js";
import type { Caption } from "../captions/types.js";
import type { Finding, Severity, Verdict, Scene } from "./types.js";

const CAPTIONS_MODEL = "google/gemini-2.5-flash";
const MEDIA_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);

/** Project-relative location the caption sync/readability report is persisted to. */
export const CAPTIONS_GATE_ARTIFACT = "captions-gate.json" as const;

/** How many frames to sample from a video for the placement/occlusion pass. */
const PLACEMENT_FRAME_SAMPLES = 6;

// ── Readability thresholds (deterministic, no model) ──────────────────────────
//
// Tuned for short-form: a caption window under ~0.5s is a flash the eye can't
// land on; a chunk over ~7 words is hard to read in the time it's on screen
// (the editor caption playbooks chunk to 1-3 words punching every 1-2s). The
// drift floor is the gap between a caption's declared start and the word-level
// `startMs` it should snap to (AGENTS.md #16 — derive timings from the SAME
// word-level startMs). A warn-then-fail ladder so a borderline track warns and a
// badly-out track refuses.

/** A caption on screen for fewer ms than this is too short to read (warn floor). */
const TOO_SHORT_WARN_MS = 600;
/** Below this it is a hard fail — a flash, unreadable. */
const TOO_SHORT_FAIL_MS = 350;
/** More words than this in one caption window is overcrowded (warn). */
const OVERCROWDED_WARN_WORDS = 7;
/** More than this is a hard fail — a wall of text. */
const OVERCROWDED_FAIL_WORDS = 11;
/** Caption start later than its words by more than this is drift (warn). */
const DRIFT_WARN_MS = 250;
/** More than this is a hard fail — the caption visibly lags the voice. */
const DRIFT_FAIL_MS = 600;

/** Count words in a caption's text (whitespace tokens, newlines folded). */
function countWords(s: string): number {
  const t = s.replace(/\s+/g, " ").trim();
  return t === "" ? 0 : t.split(" ").length;
}

/** A single region the placement analyzer flagged on a sampled frame. */
export interface CaptionPlacement {
  /** Does the caption text box overlap a face / product / CTA in the frame? */
  occludesSubject: boolean;
  /** Short hint at WHAT it overlaps (e.g. "speaker's face", "product label"), or null. */
  occludedElement: string | null;
  /** Does the caption sit inside the platform UI chrome (top label / bottom CTA / right rail)? */
  inUnsafeZone: boolean;
  /** Free-text issues the model raised that don't fit the two flags. */
  issues: Array<{ category: string; severity: Severity; message: string }>;
}

/**
 * The injectable analyzer: looks at ONE sampled frame (with the caption baked
 * in) and judges whether the caption box overlaps a face / product / CTA or
 * sits in the platform UI chrome. Tests pass a fake; the default is a vision
 * `callLLM()` pass. A frame with no visible caption yields all-false (the
 * deterministic sub-checks still run on the caption track itself).
 */
export type CaptionPlacementAnalyzer = (input: {
  /** Absolute (or project-relative) path of the sampled frame being read. */
  frame: string;
  /** The caption text expected to be on screen at this frame, when known (else null). */
  captionText: string | null;
  projectId: string;
}) => Promise<CaptionPlacement>;

/** One analyzed frame's placement/occlusion verdict. */
export interface FramePlacement {
  /** Path of the sampled frame checked. */
  frame: string;
  /** The placement read the analyzer returned. */
  placement: CaptionPlacement;
  /** Findings this frame contributed (already Finding-shaped). */
  findings: Finding[];
}

export interface CaptionsGateReport {
  schemaVersion: "1.0";
  projectId: string;
  mode: string | null;
  /** False when there is no caption track to check → pass-through. */
  applicable: boolean;
  /** pass | warn | fail (from the eval `score()` over the collected findings). */
  verdict: Verdict;
  /** The single hard blocker the readiness path (#427) + unit formation consult. */
  blocksShip: boolean;
  /** One-line reason for the verdict / blocksShip decision. */
  reason: string;
  /** Project-relative caption file the track was read from, or null. */
  captionSource: string | null;
  /** Number of caption windows checked. */
  captionCount: number;
  /** Whether a separate word-level timing track was supplied (drives drift checking). */
  wordTimingsProvided: boolean;
  /** The video whose frames were sampled for placement (project-relative), or null. */
  video: string | null;
  /** Per-sampled-frame placement results (empty when no placement pass ran). */
  frames: FramePlacement[];
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
      for (const file of readdirSync(vdir).sort()) {
        try {
          if (statSync(path.join(vdir, file)).isFile() && MEDIA_EXT.has(path.extname(file).toLowerCase())) {
            candidates.push(path.join(vdir, file));
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
 * Parse a caption file into a `Caption[]`. Handles both on-disk shapes:
 *   • the bare `Caption[]` (legacy captions.json), and
 *   • the per-slot `{ captions: Caption[], ... }` payload (artifacts/captions/<slot>.json).
 * Never throws — returns [] on any failure.
 */
function parseCaptionFile(abs: string): Caption[] {
  try {
    const raw = JSON.parse(readFileSync(abs, "utf8")) as unknown;
    const arr = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).captions)
        ? ((raw as Record<string, unknown>).captions as unknown[])
        : [];
    return arr.filter(
      (e): e is Caption =>
        !!e &&
        typeof e === "object" &&
        typeof (e as Record<string, unknown>).text === "string" &&
        typeof (e as Record<string, unknown>).startMs === "number" &&
        typeof (e as Record<string, unknown>).endMs === "number",
    );
  } catch {
    return [];
  }
}

/**
 * Resolve the caption track to check. Prefers the legacy project-root
 * captions.json (one stitched track), else the first per-slot caption file
 * under artifacts/captions/. Returns the parsed captions + the project-relative
 * source path, or null when there is nothing to check.
 */
function resolveCaptions(projectId: string): { captions: Caption[]; source: string } | null {
  const root = projectDir(projectId);
  const legacy = path.join(root, "captions.json");
  if (existsSync(legacy)) {
    const caps = parseCaptionFile(legacy);
    if (caps.length) return { captions: caps, source: "captions.json" };
  }
  try {
    const dir = artifactKindDir(projectId, "captions");
    if (existsSync(dir)) {
      for (const file of readdirSync(dir).sort()) {
        if (!file.toLowerCase().endsWith(".json")) continue;
        const abs = path.join(dir, file);
        const caps = parseCaptionFile(abs);
        if (caps.length) return { captions: caps, source: path.relative(root, abs) };
      }
    }
  } catch {
    // ignore — no caption artifacts
  }
  return null;
}

/**
 * Snap each caption to the nearest word-level `startMs` and return the drift in
 * ms (caption.startMs - nearest word startMs). A positive drift means the
 * caption fires LATE (after the words start) — the lag the viewer feels. We
 * match on the closest word start so a small re-ordering doesn't false-positive.
 */
function driftMs(caption: Caption, wordStartsMs: number[]): number | null {
  if (wordStartsMs.length === 0) return null;
  let nearest = wordStartsMs[0]!;
  let best = Math.abs(caption.startMs - nearest);
  for (const ws of wordStartsMs) {
    const d = Math.abs(caption.startMs - ws);
    if (d < best) {
      best = d;
      nearest = ws;
    }
  }
  return caption.startMs - nearest;
}

/**
 * Run the caption sync/readability gate for a project. Pure read — never
 * mutates. `analyze` (placement vision) and `extractFrames` (ffmpeg) are
 * INJECTABLE (defaults = the live providers) so fixtures run with NO network /
 * NO ffmpeg. A project with no caption track short-circuits to an
 * applicable:false pass.
 *
 * DETERMINISTIC sub-checks (no model): per-caption display duration (too-short),
 * words-per-caption (overcrowding), and — when `wordTimings` are supplied —
 * timing drift of each caption vs the word-level `startMs`.
 *
 * VISION sub-check (injectable, skipped when no analyzer + no video): caption
 * box overlap with faces / products / CTAs on sampled frames, plus unsafe
 * placement in the platform UI chrome.
 */
export async function checkCaptions(input: {
  projectId: string;
  mode: string | null;
  /** Explicit caption track (default: resolved from the project's caption artifacts). */
  captions?: Caption[];
  /** The project-relative source label for an explicit `captions` track. */
  captionSource?: string;
  /** Word-level timings (the scribe truth). When present, drives drift checking. */
  wordTimings?: Caption[];
  /** Explicit project-relative video for the placement pass (default: auto-detect). */
  videoPath?: string;
  /** Explicit absolute frame paths for the placement pass (default: sampled from the render). */
  frames?: string[];
  /** Skip the vision placement pass entirely (deterministic checks only). */
  noPlacement?: boolean;
  analyze?: CaptionPlacementAnalyzer;
  extractFrames?: typeof extractKeyframes;
}): Promise<CaptionsGateReport> {
  const { projectId, mode } = input;
  const analyze = input.analyze ?? defaultAnalyzer;
  const extractFrames = input.extractFrames ?? extractKeyframes;

  // — Resolve the caption track: explicit > project artifacts.
  const resolved = input.captions
    ? { captions: input.captions, source: input.captionSource ?? "(explicit)" }
    : resolveCaptions(projectId);

  const video = input.videoPath ?? findVideo(projectId);

  if (!resolved || resolved.captions.length === 0) {
    return {
      schemaVersion: "1.0",
      projectId,
      mode: mode ?? null,
      applicable: false,
      verdict: "pass",
      blocksShip: false,
      reason:
        "no caption track found (captions.json / artifacts/captions/) — caption sync gate not applicable (generate captions to run it).",
      captionSource: resolved?.source ?? null,
      captionCount: 0,
      wordTimingsProvided: !!input.wordTimings,
      video: video ?? null,
      frames: [],
      findings: [],
    };
  }

  const captions = resolved.captions;
  const findings: Finding[] = [];
  let nextId = 1;
  const add = (x: Omit<Finding, "id">) => {
    const f: Finding = { id: `CAP${nextId++}`, ...x };
    findings.push(f);
    return f;
  };

  // ── Deterministic sub-check 1: per-caption display duration (too-short). ──
  captions.forEach((c, i) => {
    const durMs = c.endMs - c.startMs;
    if (durMs <= 0) return; // a zero/negative window is a generator quirk, not a readability call
    const quote = ` "${c.text.replace(/\s+/g, " ").trim().slice(0, 40)}"`;
    if (durMs < TOO_SHORT_FAIL_MS) {
      add({
        category: "captions.too-short",
        severity: "fail",
        sceneIndex: null,
        timestampSec: c.startMs / 1000,
        message: `Caption #${i + 1}${quote} is on screen only ${durMs}ms — too brief to read.`,
        fixHint: `Hold each caption ≥ ${TOO_SHORT_WARN_MS}ms; merge it with the neighbouring window or slow the cut.`,
        fixCommand: null,
      });
    } else if (durMs < TOO_SHORT_WARN_MS) {
      add({
        category: "captions.too-short",
        severity: "warn",
        sceneIndex: null,
        timestampSec: c.startMs / 1000,
        message: `Caption #${i + 1}${quote} is on screen ${durMs}ms — under the ${TOO_SHORT_WARN_MS}ms readable floor.`,
        fixHint: "Lengthen the window or merge with the adjacent caption so the eye can land on it.",
        fixCommand: null,
      });
    }
  });

  // ── Deterministic sub-check 2: words-per-caption (overcrowding). ──
  captions.forEach((c, i) => {
    const words = countWords(c.text);
    const quote = ` "${c.text.replace(/\s+/g, " ").trim().slice(0, 40)}"`;
    if (words > OVERCROWDED_FAIL_WORDS) {
      add({
        category: "captions.overcrowded",
        severity: "fail",
        sceneIndex: null,
        timestampSec: c.startMs / 1000,
        message: `Caption #${i + 1}${quote} packs ${words} words into one window — a wall of text.`,
        fixHint: `Split into chunks of ≤ ${OVERCROWDED_WARN_WORDS} words; short-form captions read best at 1-3 words punching every 1-2s.`,
        fixCommand: null,
      });
    } else if (words > OVERCROWDED_WARN_WORDS) {
      add({
        category: "captions.overcrowded",
        severity: "warn",
        sceneIndex: null,
        timestampSec: c.startMs / 1000,
        message: `Caption #${i + 1}${quote} carries ${words} words — over the ${OVERCROWDED_WARN_WORDS}-word readable chunk.`,
        fixHint: "Break the line into shorter caption windows so each chunk is glanceable.",
        fixCommand: null,
      });
    }
  });

  // ── Deterministic sub-check 3: timing drift vs the word-level startMs. ──
  const wordTimings = input.wordTimings ?? null;
  if (wordTimings && wordTimings.length > 0) {
    const wordStartsMs = wordTimings.map((w) => w.startMs).sort((a, b) => a - b);
    captions.forEach((c, i) => {
      const drift = driftMs(c, wordStartsMs);
      if (drift === null) return;
      const ad = Math.abs(drift);
      const quote = ` "${c.text.replace(/\s+/g, " ").trim().slice(0, 40)}"`;
      // A LATE caption (positive drift past the floor) is the one the viewer
      // feels — the words are spoken before the text appears.
      if (ad >= DRIFT_FAIL_MS) {
        add({
          category: drift > 0 ? "captions.late" : "captions.drift",
          severity: "fail",
          sceneIndex: null,
          timestampSec: c.startMs / 1000,
          message: `Caption #${i + 1}${quote} is ${Math.round(ad)}ms ${drift > 0 ? "late vs" : "off from"} the word-level timing — the caption visibly desyncs from the voice.`,
          fixHint: "Snap every caption window to the word-level startMs (scribe-first, AGENTS.md #16); re-derive timings from the transcript.",
          fixCommand: null,
        });
      } else if (ad >= DRIFT_WARN_MS) {
        add({
          category: drift > 0 ? "captions.late" : "captions.drift",
          severity: "warn",
          sceneIndex: null,
          timestampSec: c.startMs / 1000,
          message: `Caption #${i + 1}${quote} is ${Math.round(ad)}ms ${drift > 0 ? "late vs" : "off from"} the word-level timing.`,
          fixHint: "Tighten the caption start to the word-level startMs so it lands with the voice.",
          fixCommand: null,
        });
      }
    });
  }

  // ── Vision sub-check: caption box overlap with faces/products/CTAs + unsafe
  //    placement. Runs over sampled frames; skipped when --no-placement, or when
  //    there is no video AND no explicit frames (deterministic checks still ran).
  const framePlacements: FramePlacement[] = [];
  let placementFrames: string[] = input.frames ?? [];
  if (!input.noPlacement && input.frames === undefined && video) {
    const root = projectDir(projectId);
    const absVideo = path.isAbsolute(video) ? video : path.join(root, video);
    const framesDir = path.join(root, "captions-gate-frames");
    try {
      const scenes = await extractFrames(absVideo, uniformScenes(PLACEMENT_FRAME_SAMPLES), framesDir);
      placementFrames = scenes.map((s) => s.firstFramePath).filter((p): p is string => !!p);
    } catch {
      // ffmpeg unavailable / video unreadable — deterministic checks still ran.
      placementFrames = [];
    }
  }

  if (!input.noPlacement && placementFrames.length > 0) {
    for (const frame of placementFrames) {
      let placement: CaptionPlacement;
      try {
        placement = await analyze({ frame, captionText: captionTextAt(captions, frame), projectId });
      } catch (e) {
        add({
          category: "captions.placement-analysis-failed",
          severity: "warn",
          sceneIndex: null,
          timestampSec: null,
          message: `Caption placement analysis failed for ${frame}: ${(e as Error).message}`,
          fixHint: "Re-run the caption gate once a model provider is reachable.",
          fixCommand: null,
        });
        continue;
      }
      const frameFindings: Finding[] = [];
      const emit = (category: string, severity: Severity, message: string, fixHint: string) =>
        frameFindings.push(
          add({ category, severity, sceneIndex: null, timestampSec: null, message, fixHint, fixCommand: null }),
        );

      if (placement.occludesSubject) {
        const what = placement.occludedElement ? ` (${placement.occludedElement})` : "";
        emit(
          "captions.occluding",
          "fail",
          `Caption box overlaps the key visual${what} in ${frame} — it blocks what the viewer needs to see.`,
          "Move the caption out of the subject area; place it in the upper-third / lower-third safe band, clear of faces, the product, and the CTA.",
        );
      }
      if (placement.inUnsafeZone) {
        emit(
          "captions.unsafe-placement",
          "warn",
          `Caption sits in the platform UI chrome in ${frame} (top label / bottom CTA / right rail).`,
          "Pull the caption into the platform safe zone (TikTok/Reels mid-frame, Shorts centred) so the app UI doesn't cover it.",
        );
      }
      for (const iss of placement.issues ?? []) {
        emit(
          `captions.${iss.category}`,
          iss.severity,
          `${frame}: ${iss.message}`,
          "Review the flagged caption placement against the frame.",
        );
      }
      framePlacements.push({ frame, placement, findings: frameFindings });
    }
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
      ? `${failCount} caption sync/readability failure(s) — desync / too-short / overcrowded / occluding captions. Blocks ship-ready until fixed.`
      : verdict === "warn"
        ? "caption sync/readability warnings present (soft drift / crowding / placement). Review before shipping; not a hard block."
        : "captions read cleanly — on-time, glanceable, and clear of the key visual across the checked windows / frames.",
    captionSource: resolved.source,
    captionCount: captions.length,
    wordTimingsProvided: !!wordTimings,
    video: video ?? null,
    frames: framePlacements,
    findings,
  };
}

/** Build a uniform `Scene[]` over a video's first `count` seconds for frame sampling. */
function uniformScenes(count: number): Scene[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    startSec: i,
    endSec: i + 1,
    durationSec: 1,
    firstFramePath: null,
  }));
}

/**
 * Best-effort: the caption text expected on screen at a sampled frame. The
 * frame filename carries the sampled second (scene-NN at startSec = N), so we
 * pick the caption whose window contains that second. Returns null when we
 * can't tell — the analyzer then judges whatever is on the frame.
 */
function captionTextAt(captions: Caption[], framePath: string): string | null {
  const m = /scene-(\d+)/.exec(path.basename(framePath));
  if (!m) return null;
  const sec = Number(m[1]);
  if (!Number.isFinite(sec)) return null;
  const ms = sec * 1000;
  const hit = captions.find((c) => ms >= c.startMs && ms < c.endMs);
  return hit ? hit.text.replace(/\s+/g, " ").trim() : null;
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
 * Default placement analyzer — one vision `callLLM()` jsonMode pass per frame.
 * It attaches the sampled frame and asks the model to judge whether the caption
 * box overlaps a face / product / CTA, and whether it sits in the platform UI
 * chrome. An unreadable frame yields all-false (do-not-invent rule).
 */
const defaultAnalyzer: CaptionPlacementAnalyzer = async ({ frame, captionText, projectId }) => {
  const sys = `You are a caption-placement checker for ONE frame of a short-form (TikTok/Reels/Shorts) video.
A caption (subtitle) text is usually baked into the frame. Judge ONLY the caption's PLACEMENT, not its wording. Return JSON only:
{
  "occludesSubject": boolean,   // does the caption text box cover a face, the product, or the CTA the viewer needs to see?
  "occludedElement": "short hint at what it covers (e.g. speaker's face, product label, CTA button) or null",
  "inUnsafeZone": boolean,      // does the caption sit in the platform UI chrome (top label, bottom CTA bar, right action rail)?
  "issues": [ { "category": "string", "severity": "info|warn|fail", "message": "specific" } ]
}
If there is no visible caption on the frame, return occludesSubject:false, inUnsafeZone:false, occludedElement:null, issues:[]. Do not invent text. Judge placement only.`;

  const userText = captionText
    ? `The caption expected on screen here is: "${captionText}". Check ONLY whether its on-screen box overlaps the key visual or the platform UI chrome.`
    : `Find the caption on this frame and check whether its box overlaps the key visual or the platform UI chrome.`;

  const content: Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: userText }];
  const uri = await frameDataUri(projectId, frame);
  if (uri) content.push({ type: "image_url", image_url: { url: uri } });

  const res = await callLLM({
    model: CAPTIONS_MODEL,
    messages: [
      { role: "system", content: sys },
      { role: "user", content },
    ],
    jsonMode: true,
    maxTokens: 500,
    projectId,
    endpoint: "openrouter/eval-captions",
  });
  const parsed = safeParse(res.text);
  return {
    occludesSubject: parsed.occludesSubject === true,
    occludedElement: typeof parsed.occludedElement === "string" ? parsed.occludedElement : null,
    inUnsafeZone: parsed.inUnsafeZone === true,
    issues: Array.isArray(parsed.issues)
      ? parsed.issues.filter(
          (i: unknown): i is { category: string; severity: Severity; message: string } =>
            !!i &&
            typeof i === "object" &&
            typeof (i as Record<string, unknown>).category === "string" &&
            typeof (i as Record<string, unknown>).message === "string" &&
            (["info", "warn", "fail"] as Severity[]).includes((i as Record<string, unknown>).severity as Severity),
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
