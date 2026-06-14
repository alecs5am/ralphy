// Validation-mode resolution + the ship-ready gate (#411).
//
// Two pure decisions live here so the orchestrator stays a wiring layer and
// both decisions are unit-testable without ffmpeg / a model call:
//
//   1. resolveMode — turn the (optional) user-requested mode + the available
//      context (model credentials present? a style lock / brief discoverable?)
//      into the effective EvalMode the orchestrator runs.
//
//   2. resolveGate — given the effective mode, whether the user asked for it
//      explicitly, and the score verdict, decide whether the report may mark a
//      Unit ship-ready. A keyframe-only / structure-only report NEVER yields
//      ship-ready unless the user explicitly chose that cheap mode — keyframe
//      slicing is a diagnostic, not a final gate.

import { connectorsFor } from "../providers/registry.js";
import type { EvalMode, GateInfo, Verdict } from "./types.js";

/** Modes that run a full-mp4 native model pass — the only gates strong enough
 *  to mark a Unit polished/ship-ready. */
const NATIVE_MODES: ReadonlySet<EvalMode> = new Set<EvalMode>(["native-video", "deep-style"]);

export function isNativeMode(mode: EvalMode): boolean {
  return NATIVE_MODES.has(mode);
}

export interface ResolveModeInput {
  /** The mode the user explicitly requested (`--mode`), if any. */
  requested?: EvalMode | null;
  /** Whether a text/vision model provider is configured (key present). */
  modelCredentials: boolean;
  /** Whether a project STYLE_LOCK / style sheet / brief is discoverable —
   *  drives the native-video → deep-style default upgrade. */
  styleContextAvailable: boolean;
}

export interface ResolvedMode {
  /** The mode the orchestrator will run. */
  mode: EvalMode;
  /** True when the user named a mode explicitly (so a non-native result is
   *  intentional, not an accidental cheap gate). */
  explicit: boolean;
  /** When the requested mode was downgraded because credentials are missing,
   *  the reason — surfaced to the user so a silent cheap gate never happens. */
  downgradeNote: string | null;
}

/**
 * Resolve the effective validation mode.
 *
 * Explicit request:
 *   • Honored as-is when it needs no model OR credentials are present.
 *   • A model-requiring mode (keyframe / native-video / deep-style) with NO
 *     credentials downgrades to `structure` and records a downgrade note (the
 *     gate then refuses ship-ready unless the user had asked for a cheap mode).
 *
 * No explicit request (the final/Unit-readiness gate):
 *   • Credentials present → `deep-style` when a style lock/brief is available,
 *     else `native-video`. The default final gate is ALWAYS native.
 *   • No credentials → `structure` (deterministic-only), with a note.
 */
export function resolveMode(input: ResolveModeInput): ResolvedMode {
  const { requested, modelCredentials, styleContextAvailable } = input;

  if (requested) {
    const needsModel = requested !== "structure";
    if (needsModel && !modelCredentials) {
      return {
        mode: "structure",
        explicit: true,
        downgradeNote: `requested mode "${requested}" needs a model provider, but none is configured — ran structure-only. Set OPENROUTER_API_KEY and re-run for the ${requested} gate.`,
      };
    }
    return { mode: requested, explicit: true, downgradeNote: null };
  }

  // No explicit mode → this is a final/Unit-readiness gate. Default native.
  if (!modelCredentials) {
    return {
      mode: "structure",
      explicit: false,
      downgradeNote:
        "no model provider configured — ran structure-only. This is NOT a ship-ready gate; set OPENROUTER_API_KEY for the native-video final gate.",
    };
  }
  return {
    mode: styleContextAvailable ? "deep-style" : "native-video",
    explicit: false,
    downgradeNote: null,
  };
}

export interface ResolveGateInput {
  mode: EvalMode;
  /** Whether the user explicitly chose this mode (`--mode`). */
  explicit: boolean;
  /** The score verdict from `findings.ts → score()`. */
  verdict: Verdict;
}

/**
 * Decide whether this report may mark a Unit ship-ready.
 *
 * Rules (issue Acceptance #3):
 *   • A native gate (native-video / deep-style) CAN be ship-ready — when its
 *     verdict is `pass`.
 *   • A non-native gate (keyframe / structure) is NEVER ship-ready, regardless
 *     of score, UNLESS the user explicitly asked for that cheap mode — in which
 *     case it still isn't "polished-approved", but the report doesn't pretend a
 *     ship-block either: shipReady stays false, and the reason names the cheap
 *     mode so the agent knows the cap is intentional.
 *
 * `shipReady` is the single boolean a Unit-forming/publishing step gates on. It
 * is false for every non-native report — keyframe slicing cannot approve a
 * polished Unit.
 */
export function resolveGate(input: ResolveGateInput): GateInfo {
  const { mode, explicit, verdict } = input;
  const nativeVideo = isNativeMode(mode);

  if (!nativeVideo) {
    const cheapKind = mode === "structure" ? "structure-only (deterministic)" : "keyframe-only (cheap smoke check)";
    return {
      mode,
      nativeVideo: false,
      explicitCheapMode: explicit,
      shipReady: false,
      reason: explicit
        ? `${cheapKind} ran at the user's explicit request — a diagnostic, not a ship-ready gate. Run native-video before forming/publishing a Unit.`
        : `${cheapKind} cannot approve a polished Unit — keyframe slicing misses temporal continuity, audio-picture alignment, and caption sync. Run native-video (or deep-style) for the final gate.`,
    };
  }

  const shipReady = verdict === "pass";
  return {
    mode,
    nativeVideo: true,
    explicitCheapMode: false,
    shipReady,
    reason: shipReady
      ? `native full-mp4 gate (${mode}) passed — eligible to form/publish as a Unit.`
      : `native full-mp4 gate (${mode}) returned "${verdict}" — block forming/publishing until the priority fixes land.`,
  };
}

/** True when a text/vision model provider is configured (key present). The
 *  default final gate only escalates to native when this holds. */
export function hasModelCredentials(): boolean {
  try {
    return connectorsFor("text").some((c) => c.available());
  } catch {
    return false;
  }
}
