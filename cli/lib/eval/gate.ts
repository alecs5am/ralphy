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
import { requiresStyleLock } from "../style-lock.js";
import { requiresFidelityGate, hasBakedText } from "../content-modes.js";
import { isPlatformKey } from "./platform.js";
import type { TemplateFormat } from "../schemas/template.js";
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

// ─── Gate registry (#457 acceptance #1) ─────────────────────────────────────────
//
// The quality flywheel (#457) runs the gates RELEVANT to a Unit, then merges
// their persisted reports through `buildScorecard()` (cli/lib/scorecard.ts). Which
// gates are relevant has always been DERIVABLE — from the content mode, the media
// format, and the target platforms — but the derivation lived implicitly across
// `requiresStyleLock` (style-lock.ts), `requiresFidelityGate` / `hasBakedText`
// (content-modes.ts), the per-gate `applicable` flags, and `PLATFORM_PROFILES`
// (platform.ts). `gatesForContext` is the SINGLE named source of truth that names
// the applicable set up front. It DOES NOT re-decide ship/repair/blocked (that is
// the scorecard's verdict precedence) and DOES NOT re-implement any predicate — it
// composes the existing ones, so adding a commercial / baked-text / lock-required
// mode auto-updates the registry through those helpers.

/** The gate identifiers the flywheel can run (issue #457 acceptance #1). */
export const QUALITY_GATES = [
  "native-video", // #411 full-mp4 final gate → scorecard technicalPolish
  "structure", // #411 deterministic structure pass → hook / pacing
  "ocr", // #439 text-legibility → scorecard textLegibility
  "first-frame-hook", // #440 scroll-stop opener critic → enriches hook
  "captions", // #441 caption sync/readability → enriches captions
  "product-fidelity", // #422 product/brand fidelity → scorecard productFidelity
  "claims", // #442 claims/policy → scorecard claimsCompliance
  "platform-spec", // #443 upload-spec validator → enriches platformFit
  "distribution-pack", // #423 publish-copy pack → scorecard distributionReadiness
  "council", // #415 polish council → scorecard originality
] as const;
export type QualityGate = (typeof QUALITY_GATES)[number];

/** Why a gate is in / out of the applicable set — surfaced so the agent can
 *  explain the registry decision, not just the membership. */
export interface GateApplicability {
  gate: QualityGate;
  applicable: boolean;
  /** One-line, English-on-disk reason composed from the existing predicates. */
  reason: string;
}

export interface GatesForContextInput {
  /** The content mode (production-plan.json contentMode). null = unclassified. */
  mode?: string | null;
  /** The media format the Unit ships as (template taxonomy). null = unknown. */
  format?: TemplateFormat | null;
  /** Declared target platforms (platform.ts keys). Empty = none declared. */
  platforms?: string[];
}

export interface GatesForContextResult {
  mode: string | null;
  format: TemplateFormat | null;
  platforms: string[];
  /** Every gate with its applicability + reason (stable QUALITY_GATES order). */
  gates: GateApplicability[];
  /** Convenience: just the applicable gate ids, in stable order. */
  applicable: QualityGate[];
}

/** Formats whose deliverable is a moving image — the temporal gates only apply here. */
const VIDEO_FORMATS: ReadonlySet<TemplateFormat> = new Set([
  "video",
  "motion-design",
]);

/**
 * Name which quality gates apply for a (mode, format, platform) context — the
 * #457 gate registry. PURE: composes the existing predicates, makes ZERO model
 * calls, never re-decides the verdict. Membership rules:
 *
 *   • native-video / structure — every render gets the #411 final gate.
 *   • first-frame-hook / captions — VIDEO formats only (a still has no opener
 *     scroll-stop arc or caption track); `null`/unknown format is treated as
 *     video (the conservative default — a moving Unit shouldn't skip its gates).
 *   • product-fidelity / claims — commercial modes only (`requiresFidelityGate`).
 *   • ocr — baked-text modes only (`hasBakedText`).
 *   • platform-spec — only when a known target platform is declared; a video on
 *     an image-only platform (or vice-versa) is still caught by the validator.
 *   • distribution-pack / council — advisory, always considered (their reports
 *     are `na` until produced; the scorecard treats them as non-gating signal).
 */
export function gatesForContext(input: GatesForContextInput): GatesForContextResult {
  const mode = input.mode ?? null;
  const format = input.format ?? null;
  const knownPlatforms = (input.platforms ?? []).filter(isPlatformKey);
  const isVideo = format === null || VIDEO_FORMATS.has(format);

  const fidelity = !!mode && requiresFidelityGate(mode);
  const baked = !!mode && hasBakedText(mode);
  const locked = requiresStyleLock(mode); // surfaced via styleFit, not its own gate

  const gates: GateApplicability[] = [
    {
      gate: "native-video",
      applicable: true,
      reason: "every render runs the #411 native-video final gate (the only gate that can mark a Unit polished).",
    },
    {
      gate: "structure",
      applicable: true,
      reason: "the deterministic structure pass (scene count / durations / hook zone) runs on every render.",
    },
    {
      gate: "first-frame-hook",
      applicable: isVideo,
      reason: isVideo
        ? `video format${format ? ` (${format})` : " (default)"} → the #440 scroll-stop opener critic applies.`
        : `still format (${format}) has no temporal opener → the first-frame hook gate does not apply.`,
    },
    {
      gate: "captions",
      applicable: isVideo,
      reason: isVideo
        ? `video format${format ? ` (${format})` : " (default)"} → the #441 caption sync/readability gate applies.`
        : `still format (${format}) carries no caption track → the caption-sync gate does not apply.`,
    },
    {
      gate: "product-fidelity",
      applicable: fidelity,
      reason: fidelity
        ? `mode "${mode}" is commercial (requiresFidelityGate) → the #422 product/brand fidelity gate applies.`
        : mode
          ? `mode "${mode}" is non-commercial → no named product/brand to verify, fidelity gate skipped.`
          : "no mode resolved → commercial fidelity gate not selected.",
    },
    {
      gate: "claims",
      applicable: fidelity,
      reason: fidelity
        ? `mode "${mode}" is commercial → the #442 claims/policy gate applies to the commercial copy.`
        : mode
          ? `mode "${mode}" is non-commercial → no product claims to police, claims gate skipped.`
          : "no mode resolved → claims gate not selected.",
    },
    {
      gate: "ocr",
      applicable: baked,
      reason: baked
        ? `mode "${mode}" bakes copy into the frame (hasBakedText) → the #439 OCR/text-legibility gate applies.`
        : mode
          ? `mode "${mode}" ships no baked copy → text-legibility gate skipped (no text to read).`
          : "no mode resolved → OCR gate not selected.",
    },
    {
      gate: "platform-spec",
      applicable: knownPlatforms.length > 0,
      reason: knownPlatforms.length > 0
        ? `target platform(s) declared (${knownPlatforms.join(", ")}) → the #443 upload-spec validator applies.`
        : "no known target platform declared → platform-spec gate not selected (pass --platform <list>).",
    },
    {
      gate: "distribution-pack",
      applicable: true,
      reason: "the #423 distribution pack is advisory readiness — always considered; its report is `na` until packaged.",
    },
    {
      gate: "council",
      applicable: true,
      reason: "the #415 polish council is an advisory market-fit second opinion — always considered; `na` until convened.",
    },
  ];

  // styleFit is not a runnable GATE — it is a scorecard dimension keyed off
  // STYLE_LOCK.md presence. We thread the `locked` decision into the native-video
  // gate's reason so the registry result still tells the agent a lock is required.
  if (locked) {
    const nv = gates[0]!;
    nv.reason = `${nv.reason} Mode "${mode}" requires a style lock (requiresStyleLock) — STYLE_LOCK.md must be present for the styleFit scorecard dimension to pass.`;
  }

  return {
    mode,
    format,
    platforms: knownPlatforms,
    gates,
    applicable: gates.filter((g) => g.applicable).map((g) => g.gate),
  };
}
