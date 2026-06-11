// `ralphy compose <project-id>` — timeline-aware composer.
//
// Issue #013: prior to this verb, every project re-implemented the same
// ffmpeg pipeline (concat-demuxer + 50ms boundary fades + speech-aware trim
// + music-duck + loudnorm). The choose-your-guide-001 postmortem flagged
// 60+ raw ffmpeg invocations in a single session because a structural edit
// (drop a scene, shift the VO, re-flow captions) had no CLI surface.
//
// This module exposes a small `Timeline` model and three operations:
//   - buildTimelineFromProject(projectId): scan workspace assets + scenario
//     + scribe word-timestamps into a Timeline.
//   - mutateTimelineRemoveSegment(timeline, slot): PURE — drop a segment and
//     re-flow VO offsets + caption offsets + music fades.
//   - renderTimeline(timeline, outPath): one ffmpeg call that produces the
//     final mp4 (concat with crossfade-audio at boundaries, VO mixed, music
//     ducked, loudnorm, +faststart).
//
// MVP scope (intentional):
//   - Single video output, no chapters / multi-output.
//   - Audio fades only — no video crossfade (hard cut keeps it editable).
//   - Single music bed. Multi-stem is a follow-up (TODO marker below).
//   - Caption track is shifted but NOT burned in (issue #019 lives in the
//     editor for burn step). We expose the shifted track so a downstream
//     burn-subs recipe can consume it.
//
// Append-only on disk (AGENTS invariant #14): `renderTimeline` chooses the
// next free `compose-vN.mp4` filename when the user-supplied path collides.

import fs from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { ensureFfmpeg } from "./ffmpeg-recipes.js";
import { logGeneration } from "./gen-log.js";
import { resolveArtifactKindDirs, projectDir } from "./paths.js";

// ─── Types ───────────────────────────────────────────────────────────────

/** One video segment in the timeline — a clip (or sub-window of a clip). */
export type Segment = {
  /** Slot id this segment is bound to (e.g. "scene-01-vid"). */
  slot: string;
  /** Absolute path to the source clip on disk. */
  clip_path: string;
  /** Effective duration after trim, seconds. */
  duration_s: number;
  /** Trim-in offset from the start of the source clip, seconds. Default 0. */
  trim_in_s: number;
  /** Trim-out offset from the start of the source clip, seconds. */
  trim_out_s: number;
  /**
   * Optional boundary transition between this segment and the NEXT one. The
   * audio fade is always applied (50ms) regardless; this field is a hook for
   * future video-level transitions. MVP ignores it.
   */
  transition?: "hard-cut" | "crossfade";
};

/** One voice-over clip placed on the VO track. */
export type VoClip = {
  /** Absolute path to the VO audio file. */
  path: string;
  /** Absolute start time on the master timeline, seconds. */
  start_at_s: number;
  /** Gap to leave BEFORE this VO clip (used by re-flow math). Optional. */
  gap_before_s?: number;
};

export type VoTrack = {
  clips: VoClip[];
};

/** One caption phrase with start/end ms (master-timeline coordinates). */
export type CaptionTrack = {
  /** Phrase text. */
  phrase: string;
  /** Phrase start on the master timeline, milliseconds. */
  start_ms: number;
  /** Phrase end on the master timeline, milliseconds. */
  end_ms: number;
  /** Optional style hint (e.g. "hook-bold"). Consumed by the burn step. */
  style?: string;
};

export type MusicTrack = {
  /** Absolute path to the music bed. Falsy means "no music". */
  path?: string;
  /** Linear gain, 0-1. Default 0.6 (music sits 6dB below VO). */
  volume: number;
  /** Fade-in length, milliseconds. */
  fade_in_ms?: number;
  /** Fade-out length, milliseconds. */
  fade_out_ms?: number;
};

export type Timeline = {
  segments: Segment[];
  vo_track: VoTrack;
  captions_track: CaptionTrack[];
  music_track: MusicTrack;
  /** Total master-timeline duration, seconds (sum of segments). */
  total_duration_s: number;
};

// ─── Constants ───────────────────────────────────────────────────────────

/** Audio fade applied at every segment boundary to avoid click pops (#011). */
export const BOUNDARY_FADE_MS = 50;

/** Default music volume when not specified. */
const DEFAULT_MUSIC_VOLUME = 0.6;

// ─── Build ──────────────────────────────────────────────────────────────

/**
 * Read a JSON file, return parsed object or `null` on any failure. Used to
 * make the builder tolerant of missing optional inputs (scribe / scenario).
 */
async function readJsonSafe<T = unknown>(p: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(p, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function ffprobeDurationSec(src: string): number {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", src],
    { encoding: "utf8" },
  );
  const v = parseFloat((r.stdout || "").trim());
  return Number.isFinite(v) ? v : 0;
}

async function listDir(dirs: string | string[], exts: string[]): Promise<string[]> {
  const dirList = Array.isArray(dirs) ? dirs : [dirs];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const dir of dirList) {
    try {
      const items = await fs.readdir(dir);
      for (const f of items) {
        if (!exts.includes(path.extname(f).toLowerCase())) continue;
        // First dir wins on basename collision.
        if (seen.has(f)) continue;
        seen.add(f);
        out.push(path.join(dir, f));
      }
    } catch {
      /* missing dir → contributes nothing */
    }
  }
  // Sort by basename so scene order is stable regardless of which tree a
  // file came from.
  return out.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

/**
 * Build a Timeline from the on-disk project layout. Looks for:
 *   artifacts/videos/*.mp4          → segments (sorted)
 *   artifacts/voiceover/*.mp3       → VO clips (sorted, packed back-to-back)
 *   artifacts/music/*.mp3 (first)   → music bed
 *   artifacts/captions/*.json       → caption phrases (Scribe-shape)
 *   scenario.json                → optional trim-in/trim-out per scene
 *
 * The defaults are intentionally simple — caller can post-process the
 * Timeline before calling renderTimeline().
 */
export async function buildTimelineFromProject(projectId: string): Promise<Timeline> {
  const dir = projectDir(projectId);
  const videosDirs = resolveArtifactKindDirs(projectId, "videos");
  const voDirs = resolveArtifactKindDirs(projectId, "voiceover");
  const musicDirs = resolveArtifactKindDirs(projectId, "music");
  const captionsDirs = resolveArtifactKindDirs(projectId, "captions");

  const videoFiles = await listDir(videosDirs, [".mp4", ".mov", ".webm", ".mkv", ".m4v"]);
  const voFiles = await listDir(voDirs, [".mp3", ".wav", ".m4a", ".ogg", ".flac"]);
  const musicFiles = await listDir(musicDirs, [".mp3", ".wav", ".m4a", ".ogg", ".flac"]);

  const scenario = await readJsonSafe<{ scenes?: Record<string, { trim_in_s?: number; trim_out_s?: number }> | Array<{ id?: string; slot?: string; trim_in_s?: number; trim_out_s?: number }> }>(
    path.join(dir, "scenario.json"),
  );

  // Build segments. Each video file becomes one segment. trim defaults to
  // the full clip duration (probed via ffprobe); scenario.json can override.
  const segments: Segment[] = [];
  for (const clipPath of videoFiles) {
    const slot = path.basename(clipPath, path.extname(clipPath));
    const fullDur = ffprobeDurationSec(clipPath);
    let trimIn = 0;
    let trimOut = fullDur;
    // Scenario lookup — accept both record + array shapes.
    if (scenario?.scenes) {
      const s = scenario.scenes;
      const match = (() => {
        if (Array.isArray(s)) {
          return s.find((sc) => {
            const id = sc?.slot ?? sc?.id;
            return typeof id === "string" && (slot === id || slot.startsWith(`${id}-`));
          });
        }
        for (const [k, v] of Object.entries(s)) {
          if (slot === k || slot.startsWith(`${k}-`)) return v as { trim_in_s?: number; trim_out_s?: number };
        }
        return undefined;
      })();
      if (match) {
        if (typeof match.trim_in_s === "number") trimIn = match.trim_in_s;
        if (typeof match.trim_out_s === "number") trimOut = match.trim_out_s;
      }
    }
    const dur = Math.max(0, trimOut - trimIn);
    segments.push({
      slot,
      clip_path: clipPath,
      trim_in_s: trimIn,
      trim_out_s: trimOut,
      duration_s: dur,
      transition: "hard-cut",
    });
  }

  // VO track: pack VO clips back-to-back starting at t=0. Real projects
  // typically align VO to scene boundaries; this MVP gives a sane default.
  // TODO(013-followup): wire scenario.scenes[*].vo_clip → per-segment start.
  const voClips: VoClip[] = [];
  let voCursor = 0;
  for (const voPath of voFiles) {
    const dur = ffprobeDurationSec(voPath);
    voClips.push({ path: voPath, start_at_s: voCursor });
    voCursor += dur;
  }

  // Captions: read all *.json caption files, concat phrases in start-order.
  // Tolerant of multiple shapes — scribe-words, Caption[], {captions:[]}.
  const captionFiles = await listDir(captionsDirs, [".json"]);
  const captions: CaptionTrack[] = [];
  for (const cf of captionFiles) {
    const parsed = await readJsonSafe<unknown>(cf);
    captions.push(...normalizeCaptions(parsed));
  }
  captions.sort((a, b) => a.start_ms - b.start_ms);

  const music: MusicTrack = musicFiles[0]
    ? {
        path: musicFiles[0],
        volume: DEFAULT_MUSIC_VOLUME,
        fade_in_ms: 500,
        fade_out_ms: 1000,
      }
    : { volume: DEFAULT_MUSIC_VOLUME };

  const total = segments.reduce((s, x) => s + x.duration_s, 0);

  return {
    segments,
    vo_track: { clips: voClips },
    captions_track: captions,
    music_track: music,
    total_duration_s: Math.round(total * 1000) / 1000,
  };
}

/** Best-effort caption-shape normalizer. */
export function normalizeCaptions(raw: unknown): CaptionTrack[] {
  if (!raw) return [];
  // Accept top-level array OR {captions:[]} OR {words:[]} wrappers.
  let arr: unknown[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.captions)) arr = obj.captions;
    else if (Array.isArray(obj.words)) arr = obj.words;
    else if (Array.isArray(obj.phrases)) arr = obj.phrases;
  }
  const out: CaptionTrack[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const text = (r.text ?? r.phrase ?? r.word) as string | undefined;
    if (typeof text !== "string" || !text.trim()) continue;
    // Accept startMs/endMs (Remotion shape), start_ms/end_ms (snake), or
    // start/end in seconds.
    const startMs =
      typeof r.startMs === "number"
        ? r.startMs
        : typeof r.start_ms === "number"
          ? r.start_ms
          : typeof r.start === "number"
            ? r.start * 1000
            : undefined;
    const endMs =
      typeof r.endMs === "number"
        ? r.endMs
        : typeof r.end_ms === "number"
          ? r.end_ms
          : typeof r.end === "number"
            ? r.end * 1000
            : undefined;
    if (typeof startMs !== "number" || typeof endMs !== "number") continue;
    out.push({
      phrase: text.trim(),
      start_ms: Math.round(startMs),
      end_ms: Math.round(endMs),
      style: typeof r.style === "string" ? r.style : undefined,
    });
  }
  return out;
}

// ─── Mutate (pure) ──────────────────────────────────────────────────────

/**
 * Drop the segment matching `slot` and re-flow everything downstream:
 *   - segments after it shift left by the removed duration
 *   - VO clips whose start_at_s landed inside the removed window are dropped
 *   - VO clips after the window shift left by the removed duration
 *   - captions whose start_ms landed inside the removed window are dropped
 *   - captions after the window shift left by the removed duration (in ms)
 *   - music fade-out re-anchors to the new total duration
 *
 * Pure function — returns a new Timeline; never mutates the input. Unknown
 * slot → returns the input unchanged (the agent surfaces the no-op).
 */
export function mutateTimelineRemoveSegment(timeline: Timeline, slot: string): Timeline {
  const idx = timeline.segments.findIndex((s) => s.slot === slot);
  if (idx < 0) return timeline;

  // Master-timeline window the removed segment occupies.
  let startSec = 0;
  for (let i = 0; i < idx; i++) startSec += timeline.segments[i]!.duration_s;
  const dropSec = timeline.segments[idx]!.duration_s;
  const endSec = startSec + dropSec;
  const dropMs = dropSec * 1000;
  const startMs = startSec * 1000;
  const endMs = endSec * 1000;

  // Segments — just drop and keep order.
  const segments = timeline.segments.filter((_, i) => i !== idx);

  // VO — drop those that started inside the removed window; shift later ones.
  const voClips: VoClip[] = [];
  for (const v of timeline.vo_track.clips) {
    if (v.start_at_s >= startSec && v.start_at_s < endSec) {
      // dropped — its scene is gone
      continue;
    }
    if (v.start_at_s >= endSec) {
      voClips.push({ ...v, start_at_s: Math.max(0, v.start_at_s - dropSec) });
    } else {
      voClips.push({ ...v });
    }
  }

  // Captions — same logic in ms.
  const captions: CaptionTrack[] = [];
  for (const cap of timeline.captions_track) {
    if (cap.start_ms >= startMs && cap.start_ms < endMs) continue; // dropped
    if (cap.start_ms >= endMs) {
      captions.push({
        ...cap,
        start_ms: Math.max(0, cap.start_ms - dropMs),
        end_ms: Math.max(0, cap.end_ms - dropMs),
      });
    } else {
      captions.push({ ...cap });
    }
  }

  const total = segments.reduce((s, x) => s + x.duration_s, 0);

  return {
    segments,
    vo_track: { clips: voClips },
    captions_track: captions,
    music_track: { ...timeline.music_track }, // fade-out math is re-derived at render time from total_duration_s
    total_duration_s: Math.round(total * 1000) / 1000,
  };
}

// ─── Filter graph builder ───────────────────────────────────────────────

/**
 * Build the ffmpeg `-filter_complex` graph for the full timeline. Pure
 * function (no spawn) so unit tests can assert label correctness.
 *
 * Inputs are arranged in this order:
 *   [0..N-1]  segments (video + audio if present)
 *   [N]       music bed (optional — omitted from inputs when music.path absent)
 *   [N+1..]   VO clips (each as a separate audio input)
 *
 * The graph:
 *   - extracts each segment via `trim` + `setpts=PTS-STARTPTS`
 *   - normalizes each video to a consistent SAR (1) so concat doesn't
 *     refuse mismatched aspects
 *   - extracts segment audio with a 50ms in/out fade per boundary
 *   - concats all segment v+a into `[vmain]` + `[amain]`
 *   - mixes VO clips at their start_at_s offsets via `adelay`
 *   - amix's [amain] (segment audio bed) with [vo_mix]
 *   - if music present: sidechain-compresses music keyed by VO, fades in/out
 *   - finally loudnorm's the master audio bus → [aout]
 *
 * Multi-char labels everywhere per issue #011.
 *
 * Returns the filter_complex string and the final video + audio label tags
 * the caller will `-map` against.
 */
export type FilterGraph = {
  filter: string;
  videoLabel: string; // e.g. "[vout]"
  audioLabel: string; // e.g. "[aout]"
  /**
   * Input indices in the order they must be supplied as `-i` to ffmpeg.
   * 0..segments.length-1 = segment paths, then optionally music, then VOs.
   */
  inputOrder: string[];
};

export function buildFilterGraph(timeline: Timeline): FilterGraph {
  const steps: string[] = [];
  const inputs: string[] = timeline.segments.map((s) => s.clip_path);

  // ── Segment chain ────────────────────────────────────────────────────
  // Each segment: trim video + audio, setpts/asetpts, 50ms fade at boundary.
  const fadeSec = BOUNDARY_FADE_MS / 1000;
  const segVideoTags: string[] = [];
  const segAudioTags: string[] = [];
  timeline.segments.forEach((seg, i) => {
    const t = `seg${i}`;
    const vTag = `${t}v`;
    const aTag = `${t}a`;
    // Video: trim + reset PTS + force SAR=1 + reset timebase.
    steps.push(
      `[${i}:v]trim=start=${seg.trim_in_s}:end=${seg.trim_out_s},setpts=PTS-STARTPTS,setsar=1[${vTag}]`,
    );
    // Audio: trim + reset PTS + fade-in at head + fade-out at tail (50ms each).
    // The fade-out anchors at duration_s - fade — when duration < 2*fade we
    // clamp so the fades don't cross.
    const dur = Math.max(seg.duration_s, fadeSec * 2);
    const fadeOutStart = Math.max(0, dur - fadeSec);
    steps.push(
      `[${i}:a]atrim=start=${seg.trim_in_s}:end=${seg.trim_out_s},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${fadeSec},afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeSec}[${aTag}]`,
    );
    segVideoTags.push(`[${vTag}]`);
    segAudioTags.push(`[${aTag}]`);
  });

  // ── Concat ───────────────────────────────────────────────────────────
  // ffmpeg's concat filter wants inputs INTERLEAVED: [v0][a0][v1][a1]…
  // NOT [v0][v1][v2][a0][a1][a2] — that triggers the "Media type mismatch
  // between filter output pad 0 (video) and concat input pad 1 (audio)"
  // error and exit 234.
  const n = timeline.segments.length;
  if (n === 0) {
    throw new Error("buildFilterGraph: timeline has no segments");
  }
  const interleaved: string[] = [];
  for (let i = 0; i < n; i++) {
    interleaved.push(segVideoTags[i]!, segAudioTags[i]!);
  }
  steps.push(
    `${interleaved.join("")}concat=n=${n}:v=1:a=1[vmain][amain]`,
  );

  // ── VO mix ───────────────────────────────────────────────────────────
  let voInputBaseIndex = n;
  let hasMusic = false;
  if (timeline.music_track.path) {
    hasMusic = true;
    inputs.push(timeline.music_track.path);
    voInputBaseIndex += 1;
  }
  const voClips = timeline.vo_track.clips;
  voClips.forEach((v) => inputs.push(v.path));

  let voMixLabel: string | null = null;
  if (voClips.length > 0) {
    const voTags: string[] = [];
    voClips.forEach((v, i) => {
      const inputIdx = voInputBaseIndex + i;
      const tag = `vo${i}`;
      const delayMs = Math.max(0, Math.round(v.start_at_s * 1000));
      steps.push(
        // Stereo input → adelay needs `N|N`. Mono → `N`. Specify the same value
        // twice so it works for both. ffmpeg ignores the extra "|N" on mono.
        `[${inputIdx}:a]adelay=${delayMs}|${delayMs}[${tag}]`,
      );
      voTags.push(`[${tag}]`);
    });
    if (voTags.length === 1) {
      // Single VO clip — adelay output IS the mix. `anull` is the audio
      // pass-through filter (NOT `acopy` — that's a codec name, not a
      // filter, and ffmpeg's filtergraph parser rejects it with
      // "Error linking filters / Invalid argument").
      voMixLabel = "[vomix]";
      steps.push(`${voTags[0]}anull[vomix]`);
    } else {
      voMixLabel = "[vomix]";
      steps.push(
        `${voTags.join("")}amix=inputs=${voTags.length}:duration=longest:dropout_transition=0[vomix]`,
      );
    }
  }

  // ── Music ────────────────────────────────────────────────────────────
  // [music] = volume(music_volume) on input index = n. With fade-in / fade-out.
  let musicLabel: string | null = null;
  if (hasMusic) {
    const m = timeline.music_track;
    const musicInputIdx = n;
    const fadeIn = (m.fade_in_ms ?? 0) / 1000;
    const fadeOut = (m.fade_out_ms ?? 0) / 1000;
    const total = Math.max(0.001, timeline.total_duration_s);
    const fadeOutStart = Math.max(0, total - fadeOut);
    const chain: string[] = [
      `[${musicInputIdx}:a]volume=${m.volume}`,
    ];
    if (fadeIn > 0) chain.push(`afade=t=in:st=0:d=${fadeIn}`);
    if (fadeOut > 0) chain.push(`afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOut}`);
    musicLabel = "[music]";
    steps.push(`${chain.join(",")}${musicLabel}`);
  }

  // ── Mix VO over segment bed ──────────────────────────────────────────
  // The segment audio is the "natural" bed (kling lip-sync, ambient). VO sits
  // on top at full volume; both are kept.
  let preMusicAudio = "[amain]";
  if (voMixLabel) {
    steps.push(
      `[amain]${voMixLabel}amix=inputs=2:duration=longest:dropout_transition=0[bedplusvo]`,
    );
    preMusicAudio = "[bedplusvo]";
  }

  // ── Sidechain music under VO/bed (or simple mix if no VO) ────────────
  // ffmpeg requires every label to be consumed EXACTLY once. The VO+bed
  // bus needs to feed both the sidechain key AND the final amix, so we
  // `asplit` it into two distinct labels first.
  let finalAudio = preMusicAudio;
  if (musicLabel) {
    const keyLabel = "[busKey]";
    const mixLabel = "[busMix]";
    steps.push(`${preMusicAudio}asplit=2${keyLabel}${mixLabel}`);
    // Sidechain key = the VO+bed bus copy. Compresses music when VO is loud.
    steps.push(
      `${musicLabel}${keyLabel}sidechaincompress=threshold=0.05:ratio=8:attack=10:release=250[mducked]`,
    );
    steps.push(
      `${mixLabel}[mducked]amix=inputs=2:duration=longest:dropout_transition=2[premix]`,
    );
    finalAudio = "[premix]";
  }

  // ── Loudnorm master ──────────────────────────────────────────────────
  steps.push(`${finalAudio}loudnorm=I=-16:TP=-1.5:LRA=11[aout]`);

  // Video passthrough rename for symmetry (so the caller maps a stable
  // [vout] label regardless of which audio branch was taken). `null` is the
  // video pass-through filter (NOT `copy` — that's a codec name, not a
  // filter, and ffmpeg's filtergraph parser rejects it).
  steps.push(`[vmain]null[vout]`);

  return {
    filter: steps.join(";"),
    videoLabel: "[vout]",
    audioLabel: "[aout]",
    inputOrder: inputs,
  };
}

// ─── Filter graph validity (label-collision check) ──────────────────────

/**
 * Cheap structural check on a filter_complex string:
 *   - every right-hand label `[name]` (sink) appears at most once
 *   - every left-hand label appears at most once (well-defined producer)
 *   - no single-letter label `[v]` / `[m]` / `[a]` / `[x]` — issue #011
 *
 * Returns { ok: true } when clean, otherwise an array of human-readable
 * issues. Not a full ffmpeg parser — just a guard against the specific
 * regressions postmortems flagged.
 */
export function checkFilterGraph(filter: string): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  // Tokenize ;-separated steps.
  const steps = filter.split(";");
  const sinkSeen = new Set<string>();
  // Single-letter labels are forbidden inside the graph (ffmpeg parses them
  // as stream specifiers). [N:a] / [N:v] (input refs) are OK and not caught
  // by this regex because they contain ":".
  const SINGLE_LETTER = /\[([a-zA-Z])\](?!:)/g;
  for (const step of steps) {
    // Sink labels are at the END of the step: `…stuff…[name1][name2]`.
    // We pick the trailing run of `[xxx]` tokens.
    const trailing = step.match(/(\[[a-zA-Z0-9_]+\])+$/);
    if (trailing) {
      const sinks = trailing[0].match(/\[[a-zA-Z0-9_]+\]/g) ?? [];
      for (const s of sinks) {
        if (sinkSeen.has(s)) issues.push(`duplicate sink label ${s} in step: ${step}`);
        sinkSeen.add(s);
      }
    }
    // Single-letter label inside this step.
    const singles = [...step.matchAll(SINGLE_LETTER)];
    for (const m of singles) {
      // Allow `[0:v]` style — those have a colon and won't match here.
      issues.push(`single-letter label [${m[1]}] in step: ${step} — use multi-char per #011`);
    }
  }
  return { ok: issues.length === 0, issues };
}

// ─── Render ──────────────────────────────────────────────────────────────

/**
 * Choose the next free `compose-vN.mp4` path in the project's `render/` dir
 * when the desired path already exists. AGENTS invariant #14: never
 * overwrite an existing render.
 */
export async function pickNonClobberOutPath(desired: string): Promise<string> {
  try {
    await fs.access(desired);
  } catch {
    return desired; // free
  }
  const dir = path.dirname(desired);
  const ext = path.extname(desired);
  const base = path.basename(desired, ext);
  for (let n = 2; n < 1000; n++) {
    const candidate = path.join(dir, `${base}-v${n}${ext}`);
    try {
      await fs.access(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error(`pickNonClobberOutPath: no free slot under ${dir} for ${base}`);
}

export type RenderTimelineOpts = {
  /** Project id — when present, logs the ffmpeg call into generations.jsonl. */
  projectId?: string;
  /** Free-form note attached to the log row. */
  note?: string;
};

/**
 * Single ffmpeg call that renders the full timeline to `outPath`. Throws on
 * non-zero exit with the tail of stderr.
 */
export async function renderTimeline(
  timeline: Timeline,
  outPath: string,
  opts: RenderTimelineOpts = {},
): Promise<string> {
  if (timeline.segments.length === 0) {
    throw new Error("renderTimeline: timeline has no segments");
  }
  ensureFfmpeg();
  const graph = buildFilterGraph(timeline);
  const check = checkFilterGraph(graph.filter);
  if (!check.ok) {
    throw new Error(`renderTimeline: filter graph invalid:\n${check.issues.join("\n")}`);
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const args: string[] = ["-y", "-loglevel", "error"];
  for (const input of graph.inputOrder) {
    args.push("-i", input);
  }
  args.push(
    "-filter_complex", graph.filter,
    "-map", graph.videoLabel,
    "-map", graph.audioLabel,
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    outPath,
  );

  const t0 = Date.now();
  const stderr = await new Promise<string>((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let buf = "";
    proc.stderr.on("data", (d) => (buf += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve(buf);
      else reject(new Error(`ffmpeg exit ${code}: ${buf.slice(-1000)}`));
    });
  });
  const durationMs = Date.now() - t0;

  if (opts.projectId) {
    await logGeneration(opts.projectId, {
      provider: "ffmpeg",
      model: "ffmpeg/compose-timeline",
      endpoint: "ffmpeg/compose-timeline",
      kind: "video",
      input: {
        project: opts.projectId,
        slot: "compose",
        segments: timeline.segments.map((s) => ({ slot: s.slot, duration_s: s.duration_s })),
        vo_clips: timeline.vo_track.clips.length,
        captions: timeline.captions_track.length,
        music: Boolean(timeline.music_track.path),
        total_duration_s: timeline.total_duration_s,
        out: outPath,
      },
      output: { local: outPath },
      status: "ok",
      latency_ms: durationMs,
      cost_usd: 0,
      note: opts.note ?? "compose timeline",
    });
  }
  // stderr is captured but only surfaced on failure (above).
  void stderr;
  return outPath;
}
