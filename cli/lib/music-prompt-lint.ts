// Pre-submit soft linter for ElevenLabs Music prompts (#006).
//
// ElevenLabs Music ToS rejects prompts that name specific artists / producers /
// copyrighted tracks with `400 bad_prompt`. Three projects per week hit this on
// the first music call — the memory entry `feedback_elevenlabs_music_no_artist_names`
// already documents the rule, but lives in user memory not in code. This module
// is the in-code soft warning: known artist/track patterns surface a warning +
// a generic alternative BEFORE the request hits the wire, so the agent can
// rewrite without burning a round-trip.
//
// Discipline: this is a SOFT warning — never blocks. The provider is the
// source of truth on what is and isn't allowed; we only flag the high-frequency
// failure modes. False positives are cheaper than false negatives here.

/** A single lint match — what we matched and what to swap to. */
export type MusicPromptLintMatch = {
  /** The substring that triggered the warning (lowercased). */
  matched: string;
  /** Category of the offending token. */
  kind: "rapper" | "producer" | "named-track" | "named-artist";
  /** Human-readable warning sentence the caller can echo to stderr. */
  warning: string;
  /** Generic rewrite suggestion the user can paste in to retry. */
  suggestion: string;
};

export type MusicPromptLintResult = {
  /** True when no high-risk patterns matched. */
  ok: boolean;
  matches: MusicPromptLintMatch[];
};

/**
 * Known high-risk artist / producer / track names from the postmortem record.
 *
 * Sources (each name in this list cost ≥1 burned music call):
 *  - skater-spiderverse-001: ScHoolboy Q, Pop Smoke
 *  - playdate-pixel-001: "Game Boy / Tetris / NES" track refs
 *  - noski-people-001: Brian Eno
 *  - generic memory: Drake, Kanye, Travis Scott, Metro Boomin, etc.
 *
 * Match is case-insensitive whole-word — "popsmoke" matches, "popcorn" does not.
 * Add new entries with a one-line postmortem citation rather than guessing.
 */
const KNOWN_ARTISTS: Array<{ name: string; kind: MusicPromptLintMatch["kind"] }> = [
  // Hip-hop / rap
  { name: "drake", kind: "rapper" },
  { name: "kanye", kind: "rapper" },
  { name: "kanye west", kind: "rapper" },
  { name: "travis scott", kind: "rapper" },
  { name: "kendrick", kind: "rapper" },
  { name: "kendrick lamar", kind: "rapper" },
  { name: "schoolboy q", kind: "rapper" },
  { name: "pop smoke", kind: "rapper" },
  { name: "tyler the creator", kind: "rapper" },
  { name: "lil wayne", kind: "rapper" },
  { name: "future", kind: "rapper" },
  { name: "21 savage", kind: "rapper" },
  { name: "j cole", kind: "rapper" },
  { name: "jay-z", kind: "rapper" },
  { name: "jay z", kind: "rapper" },
  { name: "asap rocky", kind: "rapper" },
  { name: "a$ap rocky", kind: "rapper" },

  // Producers
  { name: "metro boomin", kind: "producer" },
  { name: "mike will made it", kind: "producer" },
  { name: "pharrell", kind: "producer" },
  { name: "timbaland", kind: "producer" },
  { name: "dr. dre", kind: "producer" },
  { name: "dr dre", kind: "producer" },
  { name: "rick rubin", kind: "producer" },

  // Other named artists frequently cited
  { name: "brian eno", kind: "named-artist" },
  { name: "daft punk", kind: "named-artist" },
  { name: "the weeknd", kind: "named-artist" },
  { name: "billie eilish", kind: "named-artist" },
  { name: "taylor swift", kind: "named-artist" },
  { name: "beyonce", kind: "named-artist" },
  { name: "beyoncé", kind: "named-artist" },
  { name: "rihanna", kind: "named-artist" },
  { name: "ariana grande", kind: "named-artist" },
  { name: "dua lipa", kind: "named-artist" },
  { name: "post malone", kind: "named-artist" },
  { name: "ed sheeran", kind: "named-artist" },
  { name: "bad bunny", kind: "named-artist" },
  { name: "frank ocean", kind: "named-artist" },
  { name: "tame impala", kind: "named-artist" },
  { name: "radiohead", kind: "named-artist" },
  { name: "nirvana", kind: "named-artist" },

  // Named tracks / themes the model resolves to copyrighted material
  { name: "tetris theme", kind: "named-track" },
  { name: "mario theme", kind: "named-track" },
  { name: "zelda theme", kind: "named-track" },
  { name: "pokemon theme", kind: "named-track" },
  { name: "star wars theme", kind: "named-track" },
  { name: "harry potter theme", kind: "named-track" },
  { name: "stranger things theme", kind: "named-track" },
];

/**
 * Generic-alternative recipes by kind. Picked to be specific enough that the
 * agent can immediately paste them but generic enough that the provider won't
 * flag them. The "register" framing (genre + tempo + instrumentation) is what
 * the ElevenLabs prompt policy wants.
 */
function genericAlternative(kind: MusicPromptLintMatch["kind"]): string {
  switch (kind) {
    case "rapper":
      return "trap beat, 140 BPM, 808 sub-bass, hi-hat rolls, dark minor-key piano stab, no vocals";
    case "producer":
      return "modern hip-hop production, 90 BPM, layered synth pads, swung trap drums, no vocals";
    case "named-track":
      return "8-bit chiptune in the style of the genre, 120 BPM, square-wave lead, arpeggiated bass, no melodic quotation of any specific track";
    case "named-artist":
    default:
      return "describe the desired register by genre + tempo + instrumentation + mood (e.g. 'cinematic ambient, 60 BPM, sustained synth pads, muted piano, melancholy')";
  }
}

/**
 * Pre-submit lint on a music prompt. Pure, no I/O. Caller writes the warning
 * to stderr and proceeds — the linter does NOT block.
 *
 * Match semantics: case-insensitive, surrounded by word boundaries. So
 * "Pop Smoke type beat" matches but "popsmokefactory" doesn't. Multi-word
 * names use a flexible whitespace match so "Pop  Smoke" (two spaces) still
 * fires, mirroring how users actually paste these in.
 */
export function lintMusicPrompt(prompt: string): MusicPromptLintResult {
  const matches: MusicPromptLintMatch[] = [];
  const lower = prompt.toLowerCase();
  const seen = new Set<string>();
  for (const { name, kind } of KNOWN_ARTISTS) {
    // Escape any regex metachars in the name, then loosen single spaces to \s+
    // so multi-word names tolerate double-space / tab.
    const escaped = name
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    const rx = new RegExp(`\\b${escaped}\\b`, "i");
    if (rx.test(lower)) {
      if (seen.has(name)) continue;
      seen.add(name);
      matches.push({
        matched: name,
        kind,
        warning: `Music prompt names "${name}" (${kind}). ElevenLabs Music ToS rejects named ${kind === "named-track" ? "tracks" : "artists / producers"} with HTTP 400 \`bad_prompt\`.`,
        suggestion: genericAlternative(kind),
      });
    }
  }
  return { ok: matches.length === 0, matches };
}

/**
 * Format the lint result as a multi-line stderr block. Returns null when the
 * prompt is clean so the caller can skip emitting anything.
 */
export function formatMusicPromptLintReport(result: MusicPromptLintResult): string | null {
  if (result.ok) return null;
  const lines: string[] = ["ralphy: music prompt lint — soft warning (not blocking):"];
  for (const m of result.matches) {
    lines.push(`  • ${m.warning}`);
    lines.push(`    → try: ${m.suggestion}`);
  }
  lines.push(
    "  (pass --auto-retry-on-tos-rejection to auto-resubmit using the provider's sanitized rewrite if the request 400s)",
  );
  return lines.join("\n");
}

// ─── ToS-auto-resubmit helper (#006) ─────────────────────────────────────────
//
// The shape `ralphy generate music --auto-retry-on-tos-rejection` runs in the
// CLI action handler — but we factor the decision out here so unit tests can
// hit it without spawning a child process or mocking commander.

import { TerminalProviderError } from "./providers/shared.js";
import { logGeneration } from "./gen-log.js";

/**
 * Inputs the helper needs that mirror the music command arguments. The submit
 * fn is the connector call — passed in by the command so the helper stays
 * provider-agnostic and the tests can stub it cleanly.
 */
export type ToSAutoRetryDeps = {
  projectId: string;
  runId?: string;
  slot: string;
  prompt: string;
  durationSec: number;
  forceInstrumental: boolean;
  /** Connector submit. Takes the prompt (so resubmit can swap it in). */
  submit: (prompt: string) => Promise<{
    localPath: string;
    costUsd: number;
    latencyMs: number;
    model: string;
    url?: string;
  }>;
};

export type ToSAutoRetryResult = {
  result: { localPath: string; costUsd: number; latencyMs: number; model: string; url?: string };
  /** True when the helper had to perform the one-shot resubmit. */
  resubmitted: boolean;
  /** The provider-supplied rewrite that was used on resubmit (when resubmitted). */
  promptSuggestion?: string;
};

/**
 * Run the music submit with one-shot ToS auto-resubmit. Throws when:
 *  - the first submit fails with anything other than a ToS rejection
 *  - the ToS rejection carries no `prompt_suggestion`
 *  - the resubmit itself fails
 *
 * Logging contract (issue 032 canonical schema):
 *  - Original ToS failure → `status: "error"`, `error: "tos_rejected: ..."`,
 *    `attempt: 1`, `input.prompt_suggestion: "<rewrite>"`.
 *  - Successful resubmit → connector logs `status: "ok"` internally; this
 *    helper appends a second annotation row with
 *    `input.prompt_suggestion_used: true`, `attempt: 2`,
 *    `input.original_prompt` and `input.resubmit_prompt` for postmortem grep.
 */
export async function submitMusicWithToSAutoRetry(
  deps: ToSAutoRetryDeps,
): Promise<ToSAutoRetryResult> {
  try {
    const result = await deps.submit(deps.prompt);
    return { result, resubmitted: false };
  } catch (err) {
    const suggestion =
      err instanceof TerminalProviderError ? err.promptSuggestion : undefined;
    if (!(err instanceof TerminalProviderError) || !suggestion) {
      throw err;
    }
    const musicLengthMs = Math.max(3000, Math.min(600000, Math.round(deps.durationSec * 1000)));
    if (!deps.runId) {
      await logGeneration(deps.projectId, {
      slot: deps.slot,
      provider: "elevenlabs",
      model: "music_v1",
      endpoint: "music",
      kind: "music",
      input: {
        slot: deps.slot,
        project: deps.projectId,
        prompt: deps.prompt,
        music_length_ms: musicLengthMs,
        force_instrumental: deps.forceInstrumental,
        prompt_suggestion: suggestion,
      },
      status: "error",
      error: `tos_rejected: ${(err as Error).message.slice(0, 300)}`,
      attempt: 1,
      note: `tos_rejected (#006) — auto-resubmit with provider rewrite`,
      });
    }
    const result = await deps.submit(suggestion);
    if (!deps.runId) {
      await logGeneration(deps.projectId, {
      slot: deps.slot,
      provider: "elevenlabs",
      model: "music_v1",
      endpoint: "music",
      kind: "music",
      input: {
        slot: deps.slot,
        project: deps.projectId,
        prompt_suggestion_used: true,
        original_prompt: deps.prompt,
        resubmit_prompt: suggestion,
      },
      output: { local: result.localPath, bytes: 0 },
      status: "ok",
      attempt: 2,
      cost_usd: 0,
      note: `tos_rejected_resubmit (#006)`,
      });
    }
    return { result, resubmitted: true, promptSuggestion: suggestion };
  }
}
