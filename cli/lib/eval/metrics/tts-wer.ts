// TTS Word Error Rate adapter (#485).
//
// Speech intelligibility for generated voiceover: transcribe the project's VO
// artifact and compare it to the EXPECTED text, scoring the word-level edit
// distance as a Word Error Rate (WER). A low WER means the synthesized speech
// is intelligible enough that a transcriber recovers the script; a high WER
// flags mush / wrong words / dropped phrases cheaply, before a vision judge.
//
// The pure heart is `computeWer()` — word-level Levenshtein over normalized
// tokens, divided by the reference word count. It is exported and unit-tested
// directly (no model calls). The adapter's `score()` is the LIVE, paid path:
// it transcribes via cli/lib/transcribe.ts (the only sanctioned route) and
// feeds the transcript into `computeWer`. A `hypothesisOverride` seam lets
// tests inject a transcript and exercise the threshold mapping with ZERO model
// calls.

import path from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";
import { transcribe } from "../../transcribe.js";
import { connectorsFor } from "../../providers/registry.js";
import { artifactKindDir } from "../../paths.js";
import { thresholdFor } from "./thresholds.js";
import type { MetricAdapter, MetricInput, MetricResult } from "./types.js";

const ADAPTER_ID = "tts-wer";

/** Normalize a transcript-ish string for word-level comparison: lowercase,
 *  strip punctuation, collapse whitespace, trim. Empty → []. */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    // Drop punctuation; keep letters/digits and word-internal apostrophes.
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 0);
}

/**
 * Word Error Rate = word-level Levenshtein edit distance / reference word count.
 *
 * PURE. Both strings are normalized (lowercase / punctuation-stripped /
 * whitespace-collapsed) before tokenizing. Conventions:
 *   • reference empty + hypothesis empty → 0 (nothing to get wrong).
 *   • reference empty + hypothesis non-empty → 1 (all inserted; cap at 1).
 *   • hypothesis empty + reference non-empty → 1 (every word deleted).
 * The result is the raw edit-distance / refLen (can exceed 1 when the
 * hypothesis is much longer than the reference; callers map it to a status).
 */
export function computeWer(reference: string, hypothesis: string): number {
  const ref = tokenize(reference);
  const hyp = tokenize(hypothesis);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  if (hyp.length === 0) return 1;

  // Levenshtein over word tokens (sub/ins/del cost 1). Rolling two-row DP.
  let prev = new Array<number>(hyp.length + 1);
  let cur = new Array<number>(hyp.length + 1);
  for (let j = 0; j <= hyp.length; j++) prev[j] = j;
  for (let i = 1; i <= ref.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= hyp.length; j++) {
      const sub = prev[j - 1]! + (ref[i - 1] === hyp[j - 1] ? 0 : 1);
      const del = prev[j]! + 1;
      const ins = cur[j - 1]! + 1;
      cur[j] = Math.min(sub, del, ins);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[hyp.length]! / ref.length;
}

/** Map a WER value to a status against a threshold: ≤thr pass, ≤2×thr warn, else fail. */
export function statusForWer(wer: number, threshold: number): "pass" | "warn" | "fail" {
  if (wer <= threshold) return "pass";
  if (wer <= threshold * 2) return "warn";
  return "fail";
}

/** Find the most-recent voiceover artifact (the deliverable the WER scores). */
function findVoiceover(projectId: string): string | null {
  try {
    const dir = artifactKindDir(projectId, "voiceover");
    if (!existsSync(dir)) return null;
    const audio = readdirSync(dir)
      .filter((f) => /\.(mp3|wav|m4a|aac|ogg|flac|webm)$/i.test(f))
      .map((f) => path.join(dir, f));
    if (audio.length === 0) return null;
    // Most-recently-modified file (the latest re-roll wins as the candidate).
    return audio.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]!;
  } catch {
    return null;
  }
}

/** True when a transcribe-capable connector is configured (key present). */
function transcribeAvailable(): boolean {
  try {
    return connectorsFor("transcribe").some((c) => c.available());
  } catch {
    return false;
  }
}

export const ttsWerAdapter: MetricAdapter = {
  id: ADAPTER_ID,
  label: "TTS Word Error Rate",
  capability: "voice",

  async available(input: MetricInput): Promise<{ ok: boolean; hint?: string }> {
    const expected = (input.expectedText ?? "").trim();
    if (!expected) {
      return {
        ok: false,
        hint: "no expected text supplied — pass --expected <path> (the script the VO speaks) so WER has a reference to compare against.",
      };
    }
    // A test-injected hypothesis bypasses the live transcribe path entirely.
    if (input.hypothesisOverride != null) return { ok: true };
    if (!transcribeAvailable()) {
      return {
        ok: false,
        hint: "no transcribe-capable provider configured — set ELEVENLABS_API_KEY (or OPENROUTER_API_KEY) and run `ralphy setup`.",
      };
    }
    if (!findVoiceover(input.projectId)) {
      return {
        ok: false,
        hint: "no voiceover artifact found under artifacts/voiceover/ — generate the VO first (`ralphy generate voiceover`).",
      };
    }
    return { ok: true };
  },

  async score(input: MetricInput): Promise<MetricResult> {
    const threshold = thresholdFor(ADAPTER_ID, input.mode);
    const naResult = (reason: string): MetricResult => ({
      adapter: ADAPTER_ID,
      capability: "voice",
      status: "na",
      score: null,
      threshold,
      reason,
    });

    const avail = await this.available(input);
    if (!avail.ok) return naResult(avail.hint ?? "tts-wer unavailable.");

    const expected = (input.expectedText ?? "").trim();

    // Resolve the hypothesis transcript: a test override, else a LIVE transcribe.
    let hypothesis: string;
    if (input.hypothesisOverride != null) {
      hypothesis = input.hypothesisOverride;
    } else {
      const voPath = findVoiceover(input.projectId);
      if (!voPath) return naResult("no voiceover artifact to transcribe.");
      try {
        const result = await transcribe({ audioPath: voPath });
        hypothesis = result.captions.map((c) => c.text).join(" ");
      } catch (e) {
        return naResult(`transcription failed — could not score WER: ${(e as Error).message}`);
      }
    }

    const wer = computeWer(expected, hypothesis);
    const status = statusForWer(wer, threshold);
    const pct = (wer * 100).toFixed(1);
    return {
      adapter: ADAPTER_ID,
      capability: "voice",
      status,
      score: wer,
      threshold,
      reason:
        status === "pass"
          ? `WER ${pct}% ≤ ${(threshold * 100).toFixed(0)}% — the VO transcribes back to the script intelligibly.`
          : status === "warn"
            ? `WER ${pct}% over the ${(threshold * 100).toFixed(0)}% bar (within 2×) — review the VO for mishears / dropped words.`
            : `WER ${pct}% well over the ${(threshold * 100).toFixed(0)}% bar — the synthesized speech diverges from the script; re-roll the VO or check the voice/model.`,
    };
  },
};
