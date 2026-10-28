// scripts/lib/session-report/phases.ts — #562
//
// Deterministic phase attribution. Every tool call is classified from its ops
// against ONE table (`PHASE_RULES`): which `ralphy <verb>` ran, which skill
// was loaded, which file was read or written, which shell tool ran. Calls that
// match nothing inherit a phase from their neighbors (see `analyze.ts`).
//
// Phase ids follow the production contract (docs/playbooks/agent-production-
// contract.md). The pre-production contract phases that have no separate
// tooling (format/template match, memory recall, reference gate, style lock,
// production plan, preflight council) are folded into `intake`, matching the
// intake skill's ownership of phases 1-8. `dev` is repository development
// (edits under cli/, tests/, docs/, notes/, ...); `other` is everything else.

import type { Op } from "./types.js";
import { extractRalphyInvocations } from "./shell.js";

export const PHASES = [
  "intake",
  "content-mode",
  "research",
  "scenario",
  "prompts",
  "assets",
  "render",
  "eval",
  "repair",
  "unit",
  "postmortem",
  "dev",
  "other",
] as const;

export type Phase = (typeof PHASES)[number];

export const PRODUCTION_PHASES: readonly Phase[] = PHASES.filter((p) => p !== "dev" && p !== "other");

/** weak = context only (skill loads, doc reads); strong = an action (verb run, file written). */
export type Strength = "strong" | "weak";

export type PhaseRule =
  /** `match` is "verb" or "verb sub"; the more specific entry wins. `phase: null` = explicitly no signal. */
  | { kind: "verb"; match: string; phase: Phase | null }
  /** Skill slug → the phase it opens, plus the phases that count as its follow-up action. */
  | { kind: "skill"; match: string; phase: Phase | null; follow?: readonly Phase[] }
  /** File path pattern; `project: true` rules only apply under a `.ralphy/` project tree. */
  | { kind: "path"; match: RegExp; access: "read" | "write"; phase: Phase; project?: boolean; strength?: Strength }
  /** Shell command pattern for non-ralphy tools. */
  | { kind: "command"; match: RegExp; phase: Phase };

const ALL_PRODUCTION = PRODUCTION_PHASES;
const CRAFT_FOLLOW: readonly Phase[] = ["intake", "content-mode", "research", "scenario", "prompts", "assets", "render"];

export const PHASE_RULES: readonly PhaseRule[] = [
  // ── ralphy verbs ─────────────────────────────────────────────────────────
  { kind: "verb", match: "template", phase: "intake" },
  { kind: "verb", match: "template extract", phase: "unit" },
  { kind: "verb", match: "new", phase: "intake" },
  { kind: "verb", match: "clone", phase: "intake" },
  { kind: "verb", match: "persona", phase: "intake" },
  { kind: "verb", match: "brand", phase: "intake" },
  { kind: "verb", match: "project create", phase: "intake" },
  { kind: "verb", match: "project plan", phase: "intake" },
  { kind: "verb", match: "project council", phase: "intake" },
  { kind: "verb", match: "project repair-plan", phase: "repair" },
  { kind: "verb", match: "project eval", phase: "eval" },
  { kind: "verb", match: "project", phase: null },
  { kind: "verb", match: "memory recall", phase: "intake" },
  { kind: "verb", match: "memory distill", phase: "postmortem" },
  { kind: "verb", match: "memory", phase: null },
  { kind: "verb", match: "ref check", phase: "intake" },
  { kind: "verb", match: "ref pack", phase: "intake" },
  { kind: "verb", match: "ref lint", phase: "intake" },
  { kind: "verb", match: "ref contact-sheet", phase: "intake" },
  { kind: "verb", match: "ref", phase: "research" },
  { kind: "verb", match: "research", phase: "research" },
  { kind: "verb", match: "trends", phase: "research" },
  { kind: "verb", match: "benchmark", phase: "research" },
  { kind: "verb", match: "analytics", phase: "research" },
  { kind: "verb", match: "storyboard", phase: "scenario" },
  { kind: "verb", match: "generate text", phase: "scenario" },
  { kind: "verb", match: "prompts", phase: "prompts" },
  { kind: "verb", match: "guideline", phase: "prompts" },
  { kind: "verb", match: "generate", phase: "assets" },
  { kind: "verb", match: "voice", phase: "assets" },
  { kind: "verb", match: "asset", phase: "assets" },
  { kind: "verb", match: "assets", phase: "assets" },
  { kind: "verb", match: "audio", phase: "assets" },
  { kind: "verb", match: "image", phase: "assets" },
  { kind: "verb", match: "clip", phase: "assets" },
  { kind: "verb", match: "matte", phase: "assets" },
  { kind: "verb", match: "track", phase: "assets" },
  { kind: "verb", match: "banner", phase: "assets" },
  { kind: "verb", match: "batch", phase: "assets" },
  { kind: "verb", match: "render", phase: "render" },
  { kind: "verb", match: "editor", phase: "render" },
  { kind: "verb", match: "compose", phase: "render" },
  { kind: "verb", match: "composition", phase: "render" },
  { kind: "verb", match: "hyperframes", phase: "render" },
  { kind: "verb", match: "video", phase: "render" },
  { kind: "verb", match: "eval", phase: "eval" },
  { kind: "verb", match: "workspace eval", phase: "eval" },
  { kind: "verb", match: "workspace", phase: null },
  { kind: "verb", match: "unit originality", phase: "eval" },
  { kind: "verb", match: "unit", phase: "unit" },
  { kind: "verb", match: "publish", phase: "unit" },
  { kind: "verb", match: "publication", phase: "unit" },
  { kind: "verb", match: "postiz", phase: "unit" },
  { kind: "verb", match: "library", phase: "unit" },
  { kind: "verb", match: "blueprint", phase: "unit" },
  { kind: "verb", match: "calendar", phase: "unit" },
  { kind: "verb", match: "campaign", phase: "unit" },
  { kind: "verb", match: "lessons", phase: "postmortem" },
  { kind: "verb", match: "feedback", phase: "postmortem" },
  // Setup / bookkeeping verbs carry no phase signal; the call inherits.
  ...["version", "status", "doctor", "setup", "provider", "models", "config", "init", "whoami", "skill", "daemon", "queue", "migrate", "session", "activity", "artifact", "document", "bridge", "example"].map(
    (match): PhaseRule => ({ kind: "verb", match, phase: null }),
  ),

  // ── skills (weak signals; follow-up = an action in one of `follow`) ──────
  { kind: "skill", match: "intake", phase: "intake" },
  { kind: "skill", match: "producer", phase: "intake", follow: ALL_PRODUCTION },
  { kind: "skill", match: "universe-studio", phase: "intake", follow: ALL_PRODUCTION },
  { kind: "skill", match: "researcher", phase: "research" },
  { kind: "skill", match: "scenarist", phase: "scenario" },
  { kind: "skill", match: "good-writing", phase: "scenario", follow: ["scenario", "unit"] },
  { kind: "skill", match: "humanizer", phase: "scenario", follow: ["scenario", "unit"] },
  { kind: "skill", match: "art-director", phase: "prompts", follow: ["prompts", "assets"] },
  { kind: "skill", match: "seedance-prompts", phase: "prompts", follow: ["prompts", "assets"] },
  { kind: "skill", match: "json-prompt-engine", phase: "prompts", follow: ["prompts", "assets"] },
  ...["editor", "hyperframes", "hyperframes-cli", "hyperframes-media", "hyperframes-registry", "website-to-hyperframes", "gsap", "css-animations", "animejs", "lottie", "three", "typegpu", "waapi", "tailwind", "remotion-to-hyperframes", "ralphy-remotion"].map(
    (match): PhaseRule => ({ kind: "skill", match, phase: "render" }),
  ),
  { kind: "skill", match: "evaluator", phase: "eval", follow: ["eval", "repair"] },
  { kind: "skill", match: "workspace-eval", phase: "eval", follow: ["eval", "repair"] },
  { kind: "skill", match: "fixer", phase: "repair", follow: ["repair", "assets", "render", "eval"] },
  { kind: "skill", match: "templater", phase: "unit" },
  { kind: "skill", match: "social-copy", phase: "unit" },
  { kind: "skill", match: "social-publish", phase: "unit" },
  { kind: "skill", match: "postmortem", phase: "postmortem" },
  { kind: "skill", match: "memory-review", phase: "postmortem" },
  ...["poster", "carousel", "fb-creatives", "ugc-ad", "ugc-unboxing", "ugc-review", "ugc-model-swap", "ugc-rockstar", "ugc-toon-action", "analog-horror-psa", "vox-collage", "audio-explainer", "personal-clipper"].map(
    (match): PhaseRule => ({ kind: "skill", match, phase: "intake", follow: CRAFT_FOLLOW }),
  ),
  ...["dev-issues", "dev-loop", "dev-tasks", "dev-release", "dev-publish-template", "contribute-catalog"].map(
    (match): PhaseRule => ({ kind: "skill", match, phase: "dev" }),
  ),
  { kind: "skill", match: "troubleshooting", phase: null },
  { kind: "skill", match: "install", phase: null },

  // ── project files (under .ralphy/), written ──────────────────────────────
  { kind: "path", project: true, access: "write", match: /(^|\/)(BRIEF\.md|PRODUCTION_PLAN\.md|production-plan\.json|STYLE_LOCK\.md|REF_PACK\.md|ref-pack\.json|user-prompts\.jsonl)$/, phase: "intake" },
  { kind: "path", project: true, access: "write", match: /\/artifacts\/refs\/research[^/]*$|\/research\//, phase: "research" },
  { kind: "path", project: true, access: "write", match: /(^|\/)(scenario\.json|STORYBOARD\.md|script\.md)$/, phase: "scenario" },
  { kind: "path", project: true, access: "write", match: /(^|\/)prompts\.json$|\/prompts\/[^/]+$/, phase: "prompts" },
  { kind: "path", project: true, access: "write", match: /(^|\/)asset-manifest\.json$|\/artifacts\/(images|videos|voiceover|music|sfx|captions|fonts)\//, phase: "assets" },
  { kind: "path", project: true, access: "write", match: /\/projects\/[^/]+\/(index\.html|compositions\/|render\/)/, phase: "render" },
  { kind: "path", project: true, access: "write", match: /(^|\/)(eval\.json|eval-report\.md|eval-deep-vision\.json)$/, phase: "eval" },
  { kind: "path", project: true, access: "write", match: /(^|\/)repair-plan\.json$/, phase: "repair" },
  { kind: "path", project: true, access: "write", match: /\/units\/[^/]+\//, phase: "unit" },
  { kind: "path", project: true, access: "write", match: /(^|\/)(postmortem\/|POSTMORTEM\.md)/, phase: "postmortem" },

  // ── docs read for routing context (weak) ─────────────────────────────────
  { kind: "path", access: "read", match: /(^|\/)docs\/(playbooks\/modes\/|content-modes\.md|content-mode-coverage\.md)/, phase: "content-mode", strength: "weak" },
  { kind: "path", access: "read", match: /(^|\/)docs\/developing-ralphy\.md$/, phase: "dev", strength: "weak" },
  { kind: "path", access: "read", match: /(^|\/)(cli|tests|scripts|notes|apps)\//, phase: "dev", strength: "weak" },

  // ── repository development, written ──────────────────────────────────────
  { kind: "path", access: "write", match: /(^|\/)(cli|tests|scripts|notes|docs|apps|\.agents\/skills|\.github)\//, phase: "dev" },
  { kind: "path", access: "write", match: /(^|\/)(package\.json|AGENTS\.md|CLAUDE\.md|MODELS\.md|README\.md|tsconfig\.json|CHANGELOG\.md)$/, phase: "dev" },

  // ── other shell tools ────────────────────────────────────────────────────
  { kind: "command", match: /(^|[\s;&|(])(bun\s+(run\s+)?test|bunx?\s+tsc|bun\s+run\s+(lint|check|cli:surface|build|test))\b/, phase: "dev" },
  { kind: "command", match: /(^|[\s;&|(])(git\s+(commit|push|rebase|merge|cherry-pick|tag)|gh\s+pr|git\s+gh)\b/, phase: "dev" },
  { kind: "command", match: /(^|[\s;&|(])(bunx\s+)?hyperframes\s+(render|lint|snapshot|preview|inspect)\b/, phase: "render" },
  { kind: "command", match: /(^|[\s;&|(])ffmpeg\b/, phase: "render" },
  { kind: "command", match: /(^|[\s;&|(])yt-dlp\b/, phase: "research" },
];

const VERB_RULES = new Map<string, Phase | null>();
const SKILL_RULES = new Map<string, Extract<PhaseRule, { kind: "skill" }>>();
const PATH_RULES: Extract<PhaseRule, { kind: "path" }>[] = [];
const COMMAND_RULES: Extract<PhaseRule, { kind: "command" }>[] = [];
for (const rule of PHASE_RULES) {
  if (rule.kind === "verb") VERB_RULES.set(rule.match, rule.phase);
  else if (rule.kind === "skill") SKILL_RULES.set(rule.match, rule);
  else if (rule.kind === "path") PATH_RULES.push(rule);
  else COMMAND_RULES.push(rule);
}

/** Verb lookup: "verb sub" first, then "verb". `undefined` = not in the table. */
export function phaseForVerb(verb: string, sub?: string): Phase | null | undefined {
  if (sub && VERB_RULES.has(`${verb} ${sub}`)) return VERB_RULES.get(`${verb} ${sub}`)!;
  if (VERB_RULES.has(verb)) return VERB_RULES.get(verb)!;
  return undefined;
}

export function skillRule(slug: string): Extract<PhaseRule, { kind: "skill" }> | undefined {
  return SKILL_RULES.get(slug);
}

/** Phases that count as a skill's follow-up action (its own phase by default). */
export function skillFollowPhases(slug: string): readonly Phase[] {
  const rule = SKILL_RULES.get(slug);
  if (!rule || !rule.phase) return [];
  return rule.follow ?? [rule.phase];
}

export function isProjectPath(p: string): boolean {
  return /(^|\/)\.ralphy\//.test(p) || /(^|\/)workspaces\/[^/]+\/projects\/[^/]+\//.test(p);
}

export function phaseForPath(p: string, access: "read" | "write"): { phase: Phase; strength: Strength } | null {
  const project = isProjectPath(p);
  for (const rule of PATH_RULES) {
    if (rule.access !== access) continue;
    if (rule.project && !project) continue;
    if (!rule.project && project) continue;
    if (rule.match.test(p)) return { phase: rule.phase, strength: rule.strength ?? "strong" };
  }
  return null;
}

export interface Signal {
  phase: Phase;
  strength: Strength;
  source: "verb" | "skill" | "path" | "command";
  /** The verb ("generate image"), skill slug, or path that produced the signal. */
  detail: string;
}

/** Classify one op. Returns the strongest, last-occurring signal, or null. */
export function classifyOp(op: Op): Signal | null {
  const signals: Signal[] = [];
  if (op.kind === "skill" && op.skill) {
    const rule = skillRule(op.skill);
    if (rule?.phase) signals.push({ phase: rule.phase, strength: "weak", source: "skill", detail: op.skill });
  }
  for (const file of op.reads ?? []) {
    const slug = op.skill ?? op.skillRef;
    const rule = slug ? skillRule(slug) : undefined;
    if (rule?.phase && (op.skill || op.skillRef)) {
      signals.push({ phase: rule.phase, strength: "weak", source: "skill", detail: slug! });
      continue;
    }
    const hit = phaseForPath(file, "read");
    if (hit) signals.push({ ...hit, source: "path", detail: file });
  }
  if (op.command) {
    for (const inv of extractRalphyInvocations(op.command)) {
      const phase = phaseForVerb(inv.verb, inv.sub);
      if (phase) signals.push({ phase, strength: "strong", source: "verb", detail: verbLabel(inv.verb, inv.sub) });
    }
    for (const rule of COMMAND_RULES) {
      if (rule.match.test(op.command)) signals.push({ phase: rule.phase, strength: "strong", source: "command", detail: rule.match.source.slice(0, 40) });
    }
  }
  for (const file of op.writes ?? []) {
    const hit = phaseForPath(file, "write");
    if (hit) signals.push({ ...hit, source: "path", detail: file });
  }
  return pickSignal(signals);
}

function pickSignal(signals: Signal[]): Signal | null {
  if (signals.length === 0) return null;
  for (let i = signals.length - 1; i >= 0; i--) if (signals[i]!.strength === "strong") return signals[i]!;
  return signals[signals.length - 1]!;
}

/** Classify a call from its ops: the last strong signal wins, else the last weak one. */
export function classifyOps(ops: Op[]): Signal | null {
  return pickSignal(ops.map(classifyOp).filter((s): s is Signal => s !== null));
}

/** Label for a ralphy invocation used in reports ("generate image", "render"). */
export function verbLabel(verb: string, sub?: string): string {
  if (!verb) return "(no verb)";
  if (sub && VERB_RULES.has(`${verb} ${sub}`)) return `${verb} ${sub}`;
  if (["generate", "ref", "project", "template", "memory", "video", "workspace", "unit", "eval", "research", "editor", "prompts", "voice", "audio", "image", "assets", "provider", "models", "hyperframes"].includes(verb) && sub) {
    return `${verb} ${sub}`;
  }
  return verb;
}
