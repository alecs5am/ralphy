// Text-legibility / OCR quality gate (#439).
//
// Many content modes BAKE copy into the image or video frame — App Store
// screenshots, Amazon listings, carousels, posters, motion design, end cards.
// The broad visual eval (#411) catches "this frame looks off" but not reliably
// whether the rendered TEXT is readable and correct. A typo, an unreadable
// 9-pt caption, a clipped headline, or a literal `**bold**` leaking from a
// markdown prompt into the baked copy is a high-visibility defect that usually
// forces a full regeneration — cheaper to catch here, before Unit formation.
//
// This gate is the direct sibling of the product/brand fidelity gate (#422):
// same shape, same injectable-analyzer test seam, same `Finding`/`Verdict`
// machinery, same append-only report. It does NOT fork a parallel pipeline:
//   • the `Finding` shape + `score()`/`Verdict` from findings.ts,
//   • `fileToDataUri` from the eval vision primitive,
//   • `extractKeyframes` from keyframes.ts for the sampled-video-frame path,
//   • `hasBakedText(mode)` (#412/#439) — only baked-text modes run the gate.
//
// The OCR read is a single `callLLM()` vision pass per image (read the baked
// text + flag legibility / clipping / emphasis), NOT a new tesseract dependency
// (AGENTS.md #1/#2 — reach for the registered vision provider, like vision.ts /
// fidelity.ts do). The analyzer is INJECTABLE so fixtures run with NO network.

import path from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";
import { projectDir, artifactKindDir } from "../paths.js";
import { hasBakedText } from "../content-modes.js";
import { score } from "./findings.js";
import { fileToDataUri } from "./vision.js";
import { extractKeyframes } from "./keyframes.js";
import { callLLM } from "../providers/llm.js";
import type { Finding, Severity, Verdict, Scene } from "./types.js";

const OCR_MODEL = "google/gemini-2.5-flash";
const MEDIA_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/** How many frames to sample from a video for the OCR pass (uniform spacing). */
const VIDEO_FRAME_SAMPLES = 6;

/** Project-relative location the text-legibility report is persisted to. */
export const TEXT_LEGIBILITY_ARTIFACT = "text-legibility.json" as const;

/** One detected text region inside an analyzed image. */
export interface TextRegion {
  /** The text the model read at this region (its best transcription). */
  text: string;
  /** Coarse location hint the model gave (e.g. "top headline", "footer"), or null. */
  location: string | null;
  /** True when the region is too small / low-contrast to read comfortably. */
  unreadable: boolean;
  /** True when the copy is cut off at a frame / container edge. */
  clipped: boolean;
  /** True when the text reads as garbled / has an obvious typo / spelling error. */
  garbled: boolean;
  /** True when emphasis (bold/size/color) lands on the wrong word vs the intent. */
  wrongEmphasis: boolean;
}

/**
 * The injectable analyzer: reads the baked text in ONE image and flags
 * legibility problems. Tests pass a fake; the default is a vision `callLLM()`
 * pass. `expectedCopy` (when supplied) lets the model judge mismatch + emphasis
 * against the intended copy; markdown-artifact detection is done deterministically
 * by `checkTextLegibility` over the returned region text (cheap, model-free).
 */
export type OcrAnalyzer = (input: {
  /** Project-relative path of the image / sampled frame being read. */
  image: string;
  /** Expected copy for this asset, when available (else null). */
  expectedCopy: string | null;
  projectId: string;
}) => Promise<{
  /** Per-region transcription + legibility flags. */
  regions: TextRegion[];
  /** True when the detected copy materially diverges from `expectedCopy`. */
  mismatchVsExpected: boolean;
  /** Free-text issues the model raised that don't fit a region flag. */
  issues: Array<{ category: string; severity: Severity; message: string }>;
}>;

/** One analyzed image's text-legibility verdict. */
export interface AssetTextLegibility {
  /** Project-relative path of the image / frame checked. */
  asset: string;
  /** Whether this asset is a sampled video frame (vs a still). */
  fromVideoFrame: boolean;
  /** The regions the analyzer read (carried through for the human report). */
  regions: TextRegion[];
  /** Findings this asset contributed (already Finding-shaped). */
  findings: Finding[];
}

export interface TextLegibilityReport {
  schemaVersion: "1.0";
  projectId: string;
  mode: string | null;
  /** False when the mode bakes no text → the gate is a pass-through. */
  applicable: boolean;
  /** pass | warn | fail (from the eval `score()` over the collected findings). */
  verdict: Verdict;
  /** The single hard blocker the readiness path (#427) + unit formation consult. */
  blocksShip: boolean;
  /** One-line reason for the verdict / blocksShip decision. */
  reason: string;
  /** Whether expected copy was supplied (drives mismatch checking). */
  expectedCopyProvided: boolean;
  /** Per-analyzed-asset results (stills + sampled frames). */
  assets: AssetTextLegibility[];
  /** All findings, flattened (the fixer/readiness path consumes these). */
  findings: Finding[];
}

/** Literal markdown control tokens that must never survive into baked copy. */
const MARKDOWN_ARTIFACT_RE =
  /(\*\*|__|`{1,3}|^\s*#{1,6}\s|^\s*[-*]\s+|\]\(http|\[.+?\]\(|~~)/m;

/** List generated still media under artifacts/images (top level). Never throws. */
function listStills(projectId: string): string[] {
  const dir = artifactKindDir(projectId, "images");
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => {
        try {
          return statSync(path.join(dir, f)).isFile() && MEDIA_EXT.has(path.extname(f).toLowerCase());
        } catch {
          return false;
        }
      })
      .map((f) => path.join("artifacts/images", f))
      .sort();
  } catch {
    return [];
  }
}

/** First rendered video under render/ or artifacts/videos, or null. Never throws. */
function findVideo(projectId: string): string | null {
  const root = projectDir(projectId);
  const candidates = [path.join(root, "render", "final.mp4")];
  try {
    const vdir = artifactKindDir(projectId, "videos");
    if (existsSync(vdir)) {
      for (const f of readdirSync(vdir).sort()) {
        if (f.toLowerCase().endsWith(".mp4")) candidates.push(path.join(vdir, f));
      }
    }
  } catch {
    // ignore — stills-only project
  }
  return candidates.find((c) => existsSync(c)) ?? null;
}

/** Build a uniform `Scene[]` over a video's [0, frames*spacing) for frame sampling. */
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
 * Run the text-legibility / OCR gate for a project. Pure read — never mutates.
 * `analyze` is injectable (default = a vision `callLLM()` pass) so tests run with
 * NO network; `extractFrames` is injectable for the same reason (default = the
 * ffmpeg keyframe extractor). A no-baked-text mode short-circuits to an
 * applicable:false pass.
 */
export async function checkTextLegibility(input: {
  projectId: string;
  mode: string | null;
  /** Explicit project-relative still paths to check (default: artifacts/images). */
  images?: string[];
  /** Explicit absolute frame paths to check (default: sampled from the render). */
  frames?: string[];
  /** Expected copy (whole-project) the detected text is compared against. */
  expectedCopy?: string | null;
  /** Skip the gate entirely (the `--no-text` escape for an unclassified mode). */
  noText?: boolean;
  analyze?: OcrAnalyzer;
  extractFrames?: typeof extractKeyframes;
}): Promise<TextLegibilityReport> {
  const { projectId, mode } = input;
  const analyze = input.analyze ?? defaultAnalyzer;
  const extractFrames = input.extractFrames ?? extractKeyframes;
  const expectedCopy = input.expectedCopy ?? null;

  // — Mode-optional: a text-free mode (or an explicit --no-text) is a pass-through.
  if (input.noText || !mode || !hasBakedText(mode)) {
    return {
      schemaVersion: "1.0",
      projectId,
      mode: mode ?? null,
      applicable: false,
      verdict: "pass",
      blocksShip: false,
      reason: input.noText
        ? "text-legibility gate skipped (--no-text)."
        : mode
          ? `mode "${mode}" bakes no copy into the image/frame — text-legibility gate not applicable.`
          : "no content mode resolved — text-legibility gate not applicable (pass a baked-text mode to run it).",
      expectedCopyProvided: expectedCopy !== null,
      assets: [],
      findings: [],
    };
  }

  const findings: Finding[] = [];
  let nextId = 1;
  const add = (x: Omit<Finding, "id">) => {
    const f: Finding = { id: `TXT${nextId++}`, ...x };
    findings.push(f);
    return f;
  };

  // — Resolve the assets to read: explicit > project stills + sampled frames.
  const stills = input.images ?? listStills(projectId);
  let videoFrames: string[] = input.frames ?? [];
  if (input.frames === undefined) {
    const video = findVideo(projectId);
    if (video) {
      try {
        const framesDir = path.join(projectDir(projectId), "text-legibility-frames");
        const scenes = await extractFrames(video, uniformScenes(VIDEO_FRAME_SAMPLES), framesDir);
        videoFrames = scenes.map((s) => s.firstFramePath).filter((p): p is string => !!p);
      } catch {
        // ffmpeg unavailable / video unreadable — still-only check still runs.
      }
    }
  }

  const targets: Array<{ asset: string; fromVideoFrame: boolean }> = [
    ...stills.map((asset) => ({ asset, fromVideoFrame: false })),
    ...videoFrames.map((asset) => ({ asset, fromVideoFrame: true })),
  ];

  const assets: AssetTextLegibility[] = [];
  for (const { asset, fromVideoFrame } of targets) {
    let r: Awaited<ReturnType<OcrAnalyzer>>;
    try {
      r = await analyze({ image: asset, expectedCopy, projectId });
    } catch (e) {
      add({
        category: "text.analysis-failed",
        severity: "warn",
        sceneIndex: null,
        timestampSec: null,
        message: `Text-legibility analysis failed for ${asset}: ${(e as Error).message}`,
        fixHint: "Re-run the OCR gate once a model provider is reachable.",
        fixCommand: null,
      });
      continue;
    }

    const assetFindings: Finding[] = [];
    const emit = (category: string, severity: Severity, message: string, fixHint: string) =>
      assetFindings.push(add({ category, severity, sceneIndex: null, timestampSec: null, message: `${asset}: ${message}`, fixHint, fixCommand: null }));

    for (const region of r.regions) {
      const where = region.location ? ` (${region.location})` : "";
      const quote = region.text ? ` "${region.text.slice(0, 60)}"` : "";
      // Unreadable small / low-contrast text and clipped copy are hard fails —
      // they are not fixable in post and read as low-effort (refuse, not warn).
      if (region.unreadable) emit("text.unreadable-small-text", "fail", `text${where} is too small / low-contrast to read${quote}.`, "Raise the font size / weight and contrast; keep body copy ≥ 4% of the frame height.");
      if (region.clipped) emit("text.clipped-text", "fail", `text${where} is clipped at an edge / container${quote}.`, "Re-flow the copy inside the safe area; shorten the line or enlarge the container.");
      // A typo / garbled glyph is a fail; wrong emphasis is a warn (fixable nuance).
      if (region.garbled) emit("text.garbled-text", "fail", `text${where} is garbled or has a spelling error${quote}.`, "Regenerate with the exact copy restated verbatim in the prompt; verify the spelling.");
      if (region.wrongEmphasis) emit("text.wrong-emphasis", "warn", `emphasis${where} lands on the wrong word vs the intended copy${quote}.`, "Move the bold / size / color emphasis to the key word.");
      // Literal markdown control tokens leaking into baked copy — deterministic,
      // model-free detection over the transcribed text (a fail: it never belongs).
      if (region.text && MARKDOWN_ARTIFACT_RE.test(region.text)) {
        emit("text.markdown-artifact", "fail", `literal markdown control characters leaked into the baked copy${quote}.`, "Strip markdown (**, #, - , backticks, links) from the copy fed to the image prompt — bake plain text only.");
      }
    }

    if (expectedCopy !== null && r.mismatchVsExpected) {
      emit("text.mismatch-vs-expected", "fail", "detected copy does not match the expected copy.", "Reconcile the rendered text with the expected copy; regenerate the asset with the exact intended wording.");
    }

    for (const iss of r.issues ?? []) {
      emit(`text.${iss.category}`, iss.severity, iss.message, "Review the flagged text region against the intended copy.");
    }

    assets.push({ asset, fromVideoFrame, regions: r.regions, findings: assetFindings });
  }

  const { verdict } = score(findings);
  const blocksShip = verdict === "fail";
  const failCount = findings.filter((f) => f.severity === "fail").length;

  return {
    schemaVersion: "1.0",
    projectId,
    mode,
    applicable: true,
    verdict,
    blocksShip,
    reason: blocksShip
      ? `${failCount} text-legibility failure(s) — unreadable / clipped / garbled copy or markdown artifacts. Blocks ship-ready until fixed.`
      : verdict === "warn"
        ? "text-legibility warnings present (emphasis / soft issues). Review before shipping; not a hard block."
        : targets.length === 0
          ? "no stills or sampled frames to check yet — no text-legibility failures (re-run after generation)."
          : "baked copy reads cleanly across the checked stills / frames.",
    expectedCopyProvided: expectedCopy !== null,
    assets,
    findings,
  };
}

/** Best-effort image data-URI for a project-relative or absolute path; null when unreadable. */
async function imageDataUri(projectId: string, p: string): Promise<string | null> {
  try {
    const abs = path.isAbsolute(p) ? p : path.join(projectDir(projectId), p);
    return await fileToDataUri(abs);
  } catch {
    return null;
  }
}

/**
 * Default analyzer — one vision `callLLM()` jsonMode pass per image. It attaches
 * the image and asks the model to transcribe every baked text region and flag
 * legibility problems (small/low-contrast, clipped, garbled/typo, wrong
 * emphasis). When `expectedCopy` is supplied it also judges mismatch. An
 * unreadable image yields an empty region set (do-not-invent rule).
 */
const defaultAnalyzer: OcrAnalyzer = async ({ image, expectedCopy, projectId }) => {
  const sys = `You are an OCR + text-legibility checker for a single marketing image / video frame.
Read EVERY piece of baked-in text and judge its quality. Return JSON only:
{
  "regions": [
    {
      "text": "the exact text you read at this region",
      "location": "short location hint (e.g. top headline, footer CTA) or null",
      "unreadable": boolean,   // too small or low-contrast to read comfortably
      "clipped": boolean,      // cut off at a frame / container edge
      "garbled": boolean,      // garbled glyphs or an obvious spelling error / typo
      "wrongEmphasis": boolean // bold/size/color emphasis on the wrong word
    }
  ],
  "mismatchVsExpected": boolean,  // detected copy materially differs from the expected copy (false if no expected copy)
  "issues": [ { "category": "string", "severity": "info|warn|fail", "message": "specific" } ]
}
Transcribe text verbatim — including any literal markdown characters (** # - backticks) if they appear. Do not invent text that is not present. If there is no text, return an empty regions array.`;

  const userText = expectedCopy
    ? `Expected copy for this asset (the intended wording):\n${expectedCopy}\n\nNow read the attached image and compare.`
    : `Read the attached image. (No expected copy supplied — set mismatchVsExpected to false.)`;

  const content: Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: userText }];
  const uri = await imageDataUri(projectId, image);
  if (uri) content.push({ type: "image_url", image_url: { url: uri } });

  const res = await callLLM({
    model: OCR_MODEL,
    messages: [
      { role: "system", content: sys },
      { role: "user", content },
    ],
    jsonMode: true,
    maxTokens: 800,
    projectId,
    endpoint: "openrouter/eval-ocr",
  });
  const parsed = safeParse(res.text);
  const regions: TextRegion[] = Array.isArray(parsed.regions)
    ? parsed.regions
        .filter((x: unknown): x is Record<string, unknown> => !!x && typeof x === "object")
        .map((x: Record<string, unknown>) => ({
          text: typeof x.text === "string" ? x.text : "",
          location: typeof x.location === "string" ? x.location : null,
          unreadable: x.unreadable === true,
          clipped: x.clipped === true,
          garbled: x.garbled === true,
          wrongEmphasis: x.wrongEmphasis === true,
        }))
    : [];
  return {
    regions,
    mismatchVsExpected: expectedCopy !== null && parsed.mismatchVsExpected === true,
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
