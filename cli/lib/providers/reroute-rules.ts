// Filter-aware model rerouting rules (#514) — the declarative table the media
// node executors (#511/#512) consult when a provider content-filter / safety
// error kills a paid call. These rules are the distilled cost of every burned
// generation that hit a filter: what an agent-in-the-loop would have done,
// encoded as data so a headless farm run self-heals instead of dying at 2am.
//
// A rule matches on (model pattern, capability, #514 filter class, optional
// content-trait tag) and names ONE action:
//   • `reroute:<model>`           — retry the SAME call on a different model
//     (same connector; bounded to ONE hop per node execution, and gated on
//     the #497 coverage matrix — a target that can't express the call's
//     params parks instead).
//   • `resubmit-with:<transform>` — retry once with a transformed input.
//     The only built-in transform is `prompt-suggestion` (the ElevenLabs
//     Music ToS envelope carries a provider-sanitized rewrite, #006).
//   • `park-for-human`            — write an approval-inbox pack (#489) with
//     the rule's explanation and park the run.
//
// The `transient` filter class is deliberately unmatched here: transient
// errors are retry territory (retryTransient, #005), never reroutes.
//
// Rules as data is the ONE sanctioned place model ids appear outside
// MODELS.md's machine mirrors (coverage.ts, constraints.ts). Every rule
// carries a mandatory `source` citing the production origin (memory slug /
// postmortem / MODELS.md section) — an unsourced rule is a defect.
//
// Workspace extension (#502): a workspace can ship its own rules in
// `<workspace>/reroute-rules.json` (bundled top-level by workspace export).
// Workspace rules merge OVER the built-in set — they are consulted first and
// a same-id rule shadows the built-in — but never replace it.

import fs from "node:fs";
import path from "node:path";
import { workspaceDir } from "../paths.js";
import { FILTER_CLASSES, type FilterClass } from "../errors/taxonomy.js";
import type { Capability } from "./types.js";

export interface RerouteRule {
  /** Stable rule id. A workspace rule with the same id shadows the built-in. */
  id: string;
  /** Model-id pattern, `*` wildcards allowed (`bytedance/seedance-*`). `*` = any. */
  modelPattern: string;
  /** Capability the failing call was bound to, or `*` for any. */
  capability: Capability | "*";
  /** The #514 filter class this rule fires on (never "transient"). */
  errorClass: Exclude<FilterClass, "transient">;
  /** Optional content-trait tag — matches only when the node declares it in params.content_traits. */
  trait?: string;
  /** `reroute:<model>` | `resubmit-with:<transform>` | `park-for-human`. */
  action: string;
  /** MANDATORY provenance: memory slug / postmortem / MODELS.md pointer. */
  source: string;
  /** One-line human explanation (lands in journal events + inbox packs). */
  explanation: string;
}

export type ParsedRerouteAction =
  | { kind: "reroute"; model: string }
  | { kind: "resubmit-with"; transform: string }
  | { kind: "park-for-human" };

/** Parse the action DSL. Returns null on an unknown / malformed action. */
export function parseRerouteAction(action: string): ParsedRerouteAction | null {
  if (action === "park-for-human") return { kind: "park-for-human" };
  if (action.startsWith("reroute:")) {
    const model = action.slice("reroute:".length).trim();
    return model ? { kind: "reroute", model } : null;
  }
  if (action.startsWith("resubmit-with:")) {
    const transform = action.slice("resubmit-with:".length).trim();
    return transform ? { kind: "resubmit-with", transform } : null;
  }
  return null;
}

// ─── The built-in seed set — the documented production cases ─────────────────
// Model ids verified against MODELS.md (snapshot 2026-07-06).

export const BUILTIN_REROUTE_RULES: RerouteRule[] = [
  {
    id: "seedance-photoreal-human-input",
    modelPattern: "bytedance/seedance-*",
    capability: "video",
    errorClass: "safety-input",
    action: "reroute:kwaivgi/kling-v3.0-pro",
    source:
      "memory feedback_seedance_rejects_realistic_people + feedback_i2v_provider_filters; MODELS.md video lesson #6 (tokyo/noski/venom postmortems)",
    explanation:
      "seedance's privacy filter rejects photoreal-human i2v/r2v anchors (InputImageSensitiveContentDetected.PrivacyInformation) even when the human is AI-generated; kling-v3.0-pro accepts them",
  },
  {
    id: "seedance-output-copyright",
    modelPattern: "bytedance/seedance-*",
    capability: "video",
    errorClass: "copyright",
    action: "reroute:kwaivgi/kling-v3.0-pro",
    source:
      "memory feedback_seedance_copyright_filter_anime_lookalike (choose-silenthill-003) + feedback_i2v_provider_filters",
    explanation:
      "seedance's OUTPUT-stage copyright filter trips on anchors resembling known IP / anime characters regardless of prompt; kling-v3.0-pro cleared the same anchors first try",
  },
  {
    id: "veo-safety-input",
    modelPattern: "google/veo-*",
    capability: "video",
    errorClass: "safety-input",
    action: "reroute:kwaivgi/kling-v3.0-pro",
    source: "memory feedback_i2v_provider_filters (voidstomper-test-001)",
    explanation:
      "veo's Responsible AI filter blocks body-horror prompts AND scans input frames independently — sanitizing the prompt does not clear a flagged anchor; kling-v3.0-pro accepts both",
  },
  {
    id: "veo-safety-output",
    modelPattern: "google/veo-*",
    capability: "video",
    errorClass: "safety-output",
    action: "reroute:kwaivgi/kling-v3.0-pro",
    source: "memory feedback_i2v_provider_filters (voidstomper-test-001)",
    explanation:
      "veo output-side safety refusal on body-horror content — kling-v3.0-pro is the only validated route for body-horror with photoreal humans",
  },
  {
    id: "gemini-image-safety-output",
    modelPattern: "google/gemini-3-pro-image-*",
    capability: "image",
    errorClass: "safety-output",
    action: "reroute:openai/gpt-5.4-image-2",
    source:
      "memory feedback_image_safety_thresholds (voidstomper-test-001); MODELS.md image failure-modes + video lesson #10",
    explanation:
      "gemini returns IMAGE_SAFETY on body-horror / cryptid registers where gpt-5.4-image-2 accepts the same prompt — carry scene identity via refs",
  },
  {
    id: "elevenlabs-music-tos-resubmit",
    // Model is often the connector default (spec.model unset) — match on the
    // capability; the transform is self-limiting (fires only when the error
    // envelope actually carries a prompt_suggestion).
    modelPattern: "*",
    capability: "music",
    errorClass: "tos-content",
    action: "resubmit-with:prompt-suggestion",
    source:
      "memory feedback_elevenlabs_music_no_artist_names; MODELS.md 'Prompt content policy (#006)'",
    explanation:
      "ElevenLabs Music ToS rejects artist / track names with 400 bad_prompt and returns a ready prompt_suggestion rewrite — resubmit it verbatim, once",
  },
];

// ─── Matching ────────────────────────────────────────────────────────────────

/** `*`-wildcard model-pattern match (anchored). Undefined model only matches `*`. */
export function matchesModelPattern(pattern: string, model: string | undefined): boolean {
  if (pattern === "*") return true;
  if (!model) return false;
  const re = new RegExp(
    `^${pattern.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`,
  );
  return re.test(model);
}

export interface RerouteMatchInput {
  model?: string;
  capability: Capability;
  errorClass: FilterClass;
  /** Content-trait tags the node declares (params.content_traits). */
  traits?: string[];
}

/**
 * The FIRST rule matching (model pattern, capability, error class, trait).
 * "transient" never matches by construction (no rule may declare it).
 */
export function findRerouteRule(
  rules: RerouteRule[],
  input: RerouteMatchInput,
): RerouteRule | null {
  return (
    rules.find(
      (r) =>
        r.errorClass === input.errorClass &&
        (r.capability === "*" || r.capability === input.capability) &&
        matchesModelPattern(r.modelPattern, input.model) &&
        (!r.trait || (input.traits ?? []).includes(r.trait)),
    ) ?? null
  );
}

// ─── Workspace extension (#502) ──────────────────────────────────────────────

export const REROUTE_RULES_FILE = "reroute-rules.json" as const;

function isValidRule(r: unknown): r is RerouteRule {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    o.id.length > 0 &&
    typeof o.modelPattern === "string" &&
    typeof o.capability === "string" &&
    typeof o.errorClass === "string" &&
    o.errorClass !== "transient" &&
    (FILTER_CLASSES as readonly string[]).includes(o.errorClass) &&
    typeof o.action === "string" &&
    parseRerouteAction(o.action) !== null &&
    typeof o.source === "string" &&
    o.source.length > 0
  );
}

/**
 * Workspace-level rules from `<workspace>/reroute-rules.json` (an array, or
 * `{ "rules": [...] }`). Invalid entries are dropped with a stderr warning —
 * a malformed workspace file must not take the built-in safety net down.
 */
export function loadWorkspaceRerouteRules(ws: string): RerouteRule[] {
  const file = path.join(workspaceDir(ws), REROUTE_RULES_FILE);
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return []; // absent / unreadable / unparseable → built-ins only
  }
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { rules?: unknown }).rules)
      ? ((raw as { rules: unknown[] }).rules)
      : [];
  const valid: RerouteRule[] = [];
  for (const entry of list) {
    if (isValidRule(entry)) {
      valid.push({ ...entry, explanation: entry.explanation ?? entry.source });
    } else {
      // eslint-disable-next-line no-console
      console.error(
        `[warn] ${file}: dropping invalid reroute rule ${JSON.stringify((entry as { id?: unknown })?.id ?? entry).slice(0, 80)} — id/modelPattern/capability/errorClass/action/source are required (source is mandatory provenance)`,
      );
    }
  }
  return valid;
}

/**
 * The effective rule set for a workspace: workspace rules FIRST (they win
 * first-match), built-ins after; a workspace rule with a built-in's id
 * SHADOWS it. The built-in set is never replaced wholesale.
 */
export function effectiveRerouteRules(ws?: string): RerouteRule[] {
  const wsRules = ws ? loadWorkspaceRerouteRules(ws) : [];
  const shadowed = new Set(wsRules.map((r) => r.id));
  return [...wsRules, ...BUILTIN_REROUTE_RULES.filter((r) => !shadowed.has(r.id))];
}

/** Extract the ElevenLabs `prompt_suggestion` rewrite from an error. */
export function extractPromptSuggestion(err: unknown): string | undefined {
  const structured = (err as { promptSuggestion?: unknown })?.promptSuggestion;
  if (typeof structured === "string" && structured.trim().length > 0) return structured.trim();
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  // Connector message convention: `... prompt_suggestion: <rewrite>` (one line).
  const m = /prompt_suggestion["']?\s*[:=]\s*["']?([^"'\n]+)/i.exec(message);
  const text = m?.[1]?.trim();
  return text && text.length > 0 ? text : undefined;
}
