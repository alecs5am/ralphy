// Agent-facing error taxonomy (#450).
//
// Classifies an ARBITRARY raw provider / runtime error STRING into an
// agent-facing class + a retry policy + concrete next actions. This is a
// CLASSIFICATION layer, NOT new CLI exit codes — the `E_` catalog
// (cli/lib/errors/catalog.ts) owns ralphy's own exit codes and is append-only
// at 36/40; #450 deliberately adds no new `E_` code. Where an error already
// carries a catalog code the agent reads that; this layer is for the messages
// that DON'T — the raw `error_message` a failed queue job wrote to stderr, a
// caught provider `Error.message`, a gen-log error row.
//
// Single source of truth:
//   • cli/lib/jobs/error-hints.ts → burstCapHint() DELEGATES here (it keeps its
//     pure string-in / string-out signature and existing wording, now derived
//     from the classifier's nextActions for the rate/burst-cap family).
//   • cli/commands/queue.ts surfaces { errorClass, nextAction } on failed jobs.
//
// Vocabulary alignment:
//   • gen-log.ts `failureClass` uses "moderation" | "constraint" | "transient"
//     | "provider-semantic". `failureClassFor()` maps an ErrorClass back to
//     that vocabulary so the two never drift. The lessons router
//     (cli/lib/lessons/router.ts) reads `failureClass` off error rows; feeding
//     it `failureClassFor(classifyError(...).class)` keeps it consistent.
//   • For model-constraint / provider-semantic model errors, fallbackModels is
//     populated by REUSING cli/lib/models/telemetry.ts MODELS_MD_DEFAULTS
//     (the same default constraints.ts cites), not a new recommender.
//
// Pure + dependency-light: a string in, a classification out. No network.

import { MODELS_MD_DEFAULTS } from "../models/telemetry.js";
import type { GenerateKind } from "../models/constraints.js";

/** The agent-facing error classes (issue #450 acceptance list). */
export const ERROR_CLASSES = [
  "provider-transient",
  "provider-semantic",
  "moderation",
  "missing-refs",
  "bad-path",
  "model-constraint",
  "budget",
  "eval-failure",
  "artifact-mismatch",
] as const;

export type ErrorClass = (typeof ERROR_CLASSES)[number];

/** How the agent should react to a classified error. */
export type RetryPolicy =
  | "retry" // re-fire immediately (idempotent transient blip)
  | "retry-with-backoff" // wait, then re-fire (rate/concurrency limit)
  | "no-retry" // re-firing the same call is guaranteed to fail the same way
  | "ask-user"; // needs a human decision / input before any re-fire

export interface ErrorClassification {
  /** The agent-facing class. */
  class: ErrorClass;
  /** "fail" = a real failure to act on; "warn" = advisory / recoverable on retry. */
  severity: "fail" | "warn";
  /** What the agent should do about a re-fire. */
  retryPolicy: RetryPolicy;
  /** Ordered, concrete next actions (verbs / flags / files — never a paraphrase). */
  nextActions: string[];
  /** Recommended fallback model ids when the class is model-shaped. */
  fallbackModels?: string[];
  /** The matched rule id (for tests / debugging). null when unmatched. */
  matched: string | null;
}

export interface ClassifyInput {
  /** The raw error message / stderr text. */
  message: string;
  /** The model id that produced the error, when known (drives fallbackModels). */
  modelId?: string;
  /** The generate kind, when known (drives the MODELS.md default fallback). */
  kind?: GenerateKind;
}

/** A taxonomy rule: a matcher + the classification it produces. */
interface Rule {
  id: string;
  /** Substrings (lowercased) — ANY match fires. */
  any?: string[];
  /** A regex tested against the RAW (case-sensitive) message. */
  re?: RegExp;
  class: ErrorClass;
  severity: ErrorClassification["severity"];
  retryPolicy: RetryPolicy;
  nextActions: string[];
  /** Set when the class wants a recommended fallback model. */
  wantsFallback?: boolean;
}

// ─── The rule table. Order matters: the FIRST matching rule wins, so the most
//     specific / most actionable strings sit above the generic catch-alls.
const RULES: Rule[] = [
  // ── Moderation / content-policy / safety. Terminal — re-firing the same
  //    prompt or input is a guaranteed no. (gen-log failureClass "moderation".)
  {
    id: "image-safety",
    any: ["image_safety", "image safety"],
    class: "moderation",
    severity: "fail",
    retryPolicy: "ask-user",
    nextActions: [
      "the model's safety filter blocked this prompt / input frame — rephrase to remove the flagged element, or swap to a model with a different filter (MODELS.md image-safety thresholds)",
    ],
  },
  {
    id: "content-policy",
    any: [
      "content policy",
      "content_policy",
      "content-policy",
      "moderation",
      "safety system",
      "flagged",
      "nsfw",
      "prohibited content",
      "violates",
      "bad_prompt",
    ],
    class: "moderation",
    severity: "fail",
    retryPolicy: "ask-user",
    nextActions: [
      "provider refused on content policy — rephrase the prompt to drop the flagged element; for ElevenLabs Music a `prompt_suggestion` rewrite is in the error body, resubmit that",
    ],
  },

  // ── Budget. Estimate exceeds the cap — needs a human decision.
  {
    id: "budget",
    any: ["budget", "exceeds budget cap", "cost cap"],
    class: "budget",
    severity: "fail",
    retryPolicy: "ask-user",
    nextActions: [
      "raise the cap (`ralphy config set budgets.<scope> <usd>`) or trim the plan, then re-run — do NOT silently re-fire",
    ],
  },

  // ── Missing references. The reference-required gate or an unresolved --ref.
  {
    id: "missing-refs",
    any: [
      "reference required",
      "e_ref_required",
      "no reference",
      "ref required",
      "missing reference",
    ],
    class: "missing-refs",
    severity: "fail",
    retryPolicy: "ask-user",
    nextActions: [
      "attach a reference image (`ralphy ref add`) for the named entity, or pass --no-ref-consent \"<reason>\" to override the gate",
    ],
  },

  // ── Bad path / unreadable file. The input path is wrong — re-firing fails.
  {
    id: "bad-path",
    any: [
      "no such file or directory",
      "enoent",
      "cannot read file",
      "file not found",
      "is not in a valid base64 format",
      "--prompt arg missing",
      "--prompt-file",
    ],
    class: "bad-path",
    severity: "fail",
    retryPolicy: "no-retry",
    nextActions: [
      "fix the path: confirm the --ref / --prompt-file / --first-frame target exists and is readable (the base64 form usually means a C2PA / EXIF chunk — re-run, the strip in resolveImageRef handles it, or pass a clean PNG)",
    ],
  },

  // ── Model constraint: prompt cap, ref cap, broken combo, duration range,
  //    unsupported param. Re-firing the same call fails identically — change
  //    the call or the model. (gen-log failureClass "constraint".)
  {
    id: "model-constraint",
    any: [
      "prompt cap",
      "prompt is too long",
      "maximum context",
      "exceeds the maximum",
      "out of range",
      "unsupported",
      "invalid parameter",
      "accepts at most",
      "duration",
    ],
    class: "model-constraint",
    severity: "fail",
    retryPolicy: "no-retry",
    nextActions: [
      "the call violates a known model limit — run `ralphy models show <id>` (or the constraints.ts preflight) and shorten the prompt / drop refs / fix the duration, or swap to the recommended fallback",
    ],
    wantsFallback: true,
  },

  // ── Geo-block (ElevenLabs serving HTML/JSON in place of audio). Won't
  //    resolve on retry — route through a proxy. Terminal.
  {
    id: "geoblock",
    any: [
      "non-audio response",
      "non-audio body",
      "geo-block",
      "geoblock",
      "not an audio container",
      "corrupt audio file",
    ],
    class: "provider-semantic",
    severity: "fail",
    retryPolicy: "ask-user",
    nextActions: [
      "ElevenLabs is geo-blocked here (HTML/JSON returned in place of audio) — route through a non-blocked proxy: `ralphy config set elevenlabsBaseUrl <proxy-base-url>` (or RALPHY_ELEVENLABS_BASE_URL), then re-run. Nothing was written to disk",
    ],
  },

  // ── Auth. Key rejected — terminal until the key is fixed.
  {
    id: "auth",
    any: ["unauthorized", "invalid api key", "authentication", "401"],
    class: "provider-semantic",
    severity: "fail",
    retryPolicy: "ask-user",
    nextActions: [
      "provider rejected the key — re-check it with `ralphy doctor` and regenerate via the provider dashboard if needed",
    ],
  },

  // ── Eval failure. A quality gate refused. Repair, don't blindly re-render.
  {
    id: "eval-failure",
    any: [
      "quality gate refused",
      "gate refused",
      "eval failed",
      "verdict fail",
      "scored fail",
      "e_gate_",
    ],
    class: "eval-failure",
    severity: "fail",
    retryPolicy: "ask-user",
    nextActions: [
      "a quality gate refused — read the eval findings and run `ralphy project repair-plan <id>` for an owner-classified fix list before any re-render (do NOT render over a failed gate)",
    ],
  },

  // ── Artifact mismatch. Render / asset shape doesn't match the manifest /
  //    composition (missing slot, wrong dimensions, lint error).
  {
    id: "artifact-mismatch",
    any: [
      "wrapper-on-video",
      "missing id",
      "data-start",
      "lint error",
      "missing slot",
      "asset missing",
      "dimension mismatch",
      "aspect mismatch",
      "manifest mismatch",
    ],
    class: "artifact-mismatch",
    severity: "fail",
    retryPolicy: "no-retry",
    nextActions: [
      "the produced artifact doesn't match the composition / manifest — re-lint (`bunx hyperframes lint <project>`) and regenerate the missing / mis-shaped slot, then re-render",
    ],
  },

  // ── OpenRouter burst-cap (per-key concurrent-call limit masquerading as a $
  //    balance problem). Recoverable after lowering concurrency. Keep the
  //    wording the burstCapHint test asserts: "burst-cap", "concurrency",
  //    "NOT a $ balance".
  {
    id: "burst-cap",
    any: ["key limit exceeded", "total limit", "concurrent-call limit"],
    class: "provider-transient",
    severity: "warn",
    retryPolicy: "retry-with-backoff",
    nextActions: [
      "OpenRouter burst-cap hit (per-key concurrent-call limit, NOT a $ balance issue). Reduce image concurrency (queue retry --tag <tag> --state failed after lowering it) or add a per-kind min-interval throttle. Check credits with `ralphy doctor`.",
    ],
  },

  // ── Generic rate / concurrency limit (429 family). Keep the wording the
  //    burstCapHint test asserts: "429", "retry".
  {
    id: "rate-limit",
    any: [
      "concurrent_limit_exceeded",
      "rate limit",
      "rate-limit",
      "too many requests",
    ],
    re: /\b429\b/,
    class: "provider-transient",
    severity: "warn",
    retryPolicy: "retry-with-backoff",
    nextActions: [
      "Rate/concurrent-limit hit (HTTP 429). Serialize this endpoint or reduce concurrency, then retry the failed set (`ralphy queue retry --tag <tag> --state failed`).",
    ],
  },

  // ── Provider unavailable / 5xx / network blip. Cheap retry.
  {
    id: "transient-network",
    any: [
      "econnreset",
      "etimedout",
      "econnrefused",
      "socket hang up",
      "fetch failed",
      "tls",
      "handshake",
      "network",
      "premature close",
      "stream was destroyed",
      "service unavailable",
      "bad gateway",
      "gateway timeout",
      "skeleton-null",
      "malformed_function_call",
    ],
    re: /\b5\d{2}\b/,
    class: "provider-transient",
    severity: "warn",
    retryPolicy: "retry",
    nextActions: [
      "transient provider / network blip — retry (the connector's retryTransient already backs off; re-fire the slot if it slipped through a batch)",
    ],
  },

  // ── Generic 4xx semantic reject (a provider 400 that isn't a known
  //    constraint). Re-firing the same request fails identically.
  {
    id: "provider-4xx",
    re: /\b4\d{2}\b/,
    class: "provider-semantic",
    severity: "fail",
    retryPolicy: "no-retry",
    nextActions: [
      "provider rejected the request (4xx) — check the prompt + flags against `ralphy models show <id>`; this is not a transient blip, do not blindly retry",
    ],
    wantsFallback: true,
  },
];

/**
 * Map an ErrorClass back to the gen-log `failureClass` vocabulary
 * ("moderation" | "constraint" | "transient" | "provider-semantic") so the
 * taxonomy stays consistent with what telemetry.ts / lessons/router.ts already
 * read off generation rows. Classes with no direct gen-log analog map to the
 * closest existing bucket.
 */
export function failureClassFor(cls: ErrorClass): string {
  switch (cls) {
    case "provider-transient":
      return "transient";
    case "model-constraint":
      return "constraint";
    case "moderation":
      return "moderation";
    case "provider-semantic":
    case "budget":
    case "missing-refs":
    case "bad-path":
    case "eval-failure":
    case "artifact-mismatch":
      return "provider-semantic";
  }
}

/**
 * Classify a raw error string into an agent-facing class + retry policy + next
 * actions. PURE — no network, no provider calls. Unrecognized strings get the
 * conservative `provider-semantic` / `ask-user` fallback (a real, un-typed
 * failure the agent must look at — never silently retried).
 */
export function classifyError(input: ClassifyInput): ErrorClassification {
  const message = input.message ?? "";
  const lower = message.toLowerCase();

  const rule =
    RULES.find(
      (r) =>
        (r.any && r.any.some((s) => lower.includes(s))) ||
        (r.re && r.re.test(message)),
    ) ?? null;

  if (!rule) {
    return {
      class: "provider-semantic",
      severity: "fail",
      retryPolicy: "ask-user",
      nextActions: [
        "unrecognized error — read the raw message; do not blindly retry. File a notes/issue if it recurs so the taxonomy can learn it.",
      ],
      matched: null,
    };
  }

  const fallbackModels = rule.wantsFallback ? recommendFallbacks(input) : undefined;

  return {
    class: rule.class,
    severity: rule.severity,
    retryPolicy: rule.retryPolicy,
    nextActions: rule.nextActions,
    ...(fallbackModels && fallbackModels.length ? { fallbackModels } : {}),
    matched: rule.id,
  };
}

/**
 * Recommended fallback model(s) for a model-shaped failure. Reuses the
 * MODELS.md default for the kind (the same default constraints.ts cites) — does
 * NOT invent a new recommender. Returns [] when the kind is unknown or the
 * default IS the failing model.
 */
function recommendFallbacks(input: ClassifyInput): string[] {
  if (!input.kind) return [];
  const def = MODELS_MD_DEFAULTS[input.kind];
  if (!def) return [];
  if (input.modelId && def === input.modelId) return [];
  return [def];
}
