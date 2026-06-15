// Style / benchmark grounding — the STYLE_LOCK.md artifact (#408).
//
// `STYLE_LOCK.md` is the contract phase-6 artifact (see `cli/lib/contract.ts →
// CONTRACT_PHASES` and `docs/playbooks/agent-production-contract.md`). It freezes
// the register a project generates against — visual register, pacing, hook
// mechanics, caption/audio style, a do-not-do list, benchmark references, and
// model-specific implications — BEFORE any prompt fan-out, so downstream prompts
// and the eval deep-vision pass score against the SAME source of truth.
//
// This module is the readable/testable half of the feature:
//   • path + presence helpers (`styleLockPath`, `hasStyleLock`),
//   • the per-mode requirement, composed with the #412 content-mode registry
//     (`requiresStyleLock` reads `guidelineOrStyleLock.required` — it never
//     hardcodes a covered list),
//   • eval auto-discovery (`discoverStyleLock` walks up from a video path to the
//     project root and returns its STYLE_LOCK.md when present), and
//   • the field spec + deterministic scaffold (`STYLE_LOCK_FIELDS`,
//     `renderStyleLockScaffold`) the `ralphy project style-lock` verb writes.
//
// The LLM enrichment + I/O (auto-versioning, the `--check` refusal) live in the
// `project style-lock` verb (cli/commands/project.ts) so this module stays a
// pure data → data + fs-probe library, callable directly from tests.

import path from "node:path";
import { existsSync, statSync } from "node:fs";
import { projectDir } from "./paths.js";
import {
  getContentMode,
  isContentMode,
} from "./content-modes.js";

/** `<project>/STYLE_LOCK.md` — the phase-6 grounding artifact. */
export function styleLockPath(projectId: string): string {
  return path.join(projectDir(projectId), "STYLE_LOCK.md");
}

/** True when `<project>/STYLE_LOCK.md` exists on disk. */
export function hasStyleLock(projectId: string): boolean {
  try {
    return existsSync(styleLockPath(projectId));
  } catch {
    return false;
  }
}

/**
 * Whether a content mode requires a locked style/benchmark before generation.
 * Composed with the #412 registry — a mode requires a style lock IFF its
 * `guidelineOrStyleLock.required` flag is set. Never hardcodes a list, so the
 * covered set stays single-sourced in `content-modes.ts`.
 *
 * Accepts a raw string (an unknown / future mode id returns `false` — an
 * unrecognized mode is not a covered mode, so it never blocks generation).
 */
export function requiresStyleLock(mode: string | null | undefined): boolean {
  if (!mode || !isContentMode(mode)) return false;
  return getContentMode(mode)?.guidelineOrStyleLock.required ?? false;
}

// ─── eval auto-discovery ──────────────────────────────────────────────────────

/**
 * Markers that identify a directory as a ralphy project root. Best-effort:
 * #411 will harden registry-backed project-id detection; until then this
 * walk-up keys on the artifacts a project always carries by the time it has a
 * render to evaluate.
 */
const PROJECT_ROOT_MARKERS = [
  "BRIEF.md",
  "production-plan.json",
  "PRODUCTION_PLAN.md",
  "artifacts",
  "scenario.json",
] as const;

function looksLikeProjectRoot(dir: string): boolean {
  return PROJECT_ROOT_MARKERS.some((m) => {
    try {
      return existsSync(path.join(dir, m));
    } catch {
      return false;
    }
  });
}

/**
 * Auto-discover a project-local `STYLE_LOCK.md` from a video (or any file/dir)
 * path, for the eval deep-vision pass. Walks UP from the path's directory to the
 * nearest ancestor that looks like a project root (carries one of
 * `PROJECT_ROOT_MARKERS`) and returns its STYLE_LOCK.md if present, else null.
 *
 * Best-effort by design (no registry lookup): a render usually lives at
 * `<project>/render/final.mp4`, so the walk-up finds `<project>/` within a hop
 * or two. Returns null when no STYLE_LOCK.md is found on the way to the
 * filesystem root.
 *
 * NOTE (#411): registry-backed project-id resolution will replace this heuristic
 * once it lands. The walk-up is the floor that keeps eval auto-discovery working
 * for videos outside the registry too (a stray mp4 in a project dir).
 */
export function discoverStyleLock(videoOrProjectPath: string): string | null {
  let dir: string;
  try {
    const resolved = path.resolve(videoOrProjectPath);
    dir = isDirectory(resolved) ? resolved : path.dirname(resolved);
  } catch {
    return null;
  }

  let prev = "";
  // Walk up to the filesystem root. `path.dirname("/") === "/"`, so the loop
  // terminates when the directory stops changing.
  while (dir && dir !== prev) {
    const candidate = path.join(dir, "STYLE_LOCK.md");
    try {
      if (looksLikeProjectRoot(dir) && existsSync(candidate)) return candidate;
    } catch {
      /* unreadable dir — keep walking */
    }
    prev = dir;
    dir = path.dirname(dir);
  }
  return null;
}

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// ─── Field spec + scaffold ─────────────────────────────────────────────────────

/**
 * The STYLE_LOCK.md field spec. The verb renders these as `## ` sections in the
 * scaffold; the LLM enrichment pass fills the register/pacing/do-not-do prose.
 * Order is the on-disk section order. English-only-on-disk.
 */
export const STYLE_LOCK_FIELDS = [
  {
    key: "visualRegister",
    heading: "Visual register",
    prompt:
      "The locked look: palette, lighting, lens/camera language, grain/texture, realism axis (photoreal ↔ stylized), aspect. The single hardest thing to get right per the postmortems.",
  },
  {
    key: "pacing",
    heading: "Pacing",
    prompt:
      "Cut cadence, hold lengths, motion energy. For video: seconds-per-shot and whether static holds are allowed. For stills: information density per slide/frame.",
  },
  {
    key: "hookMechanics",
    heading: "Hook mechanics",
    prompt:
      "What stops the scroll in the first 0-3s (video) or the cover (carousel/still): the cold-open beat, the on-screen promise, the contrast that earns the watch.",
  },
  {
    key: "captionAudioStyle",
    heading: "Caption / audio style",
    prompt:
      "Caption treatment (font, color, chunking, timing), VO register + language, music bed + SFX policy. Cite the audio invariants (Kling --audio EN-only, music as a separate pass).",
  },
  {
    key: "doNotDo",
    heading: "Do-not-do list",
    prompt:
      "The explicit anti-patterns: AI-slop tells, register breakers, banned colors/effects, off-tone moves. The negative scope that keeps generation on-register.",
  },
  {
    key: "benchmarkRefs",
    heading: "Benchmark references",
    prompt:
      "The concrete targets this register is measured against: reference URLs/handles, the matched template slug, applicable guideline slugs, or canonical frames. The eval deep-vision pass scores against these.",
  },
  {
    key: "modelImplications",
    heading: "Model-specific implications",
    prompt:
      "What the locked register means for the model stack: which image/video models hit this look, provider filters to route around, prompt-spine cues, aspect/encode constraints (read MODELS.md before naming a model).",
  },
] as const;

export type StyleLockFieldKey = (typeof STYLE_LOCK_FIELDS)[number]["key"];

/** The enrichment payload the LLM pass (or the deterministic fallback) fills. */
export type StyleLockContent = Record<StyleLockFieldKey, string>;

/** Context the scaffold renderer + enrichment prompt read. All optional — a
 *  bare project (no plan yet) still renders a usable template. */
export interface StyleLockContext {
  projectId: string;
  /** The originating brief (from the production plan or the verb arg). */
  brief?: string | null;
  /** Resolved content mode (#412), from the production plan. */
  contentMode?: string | null;
  /** Whether the resolved mode requires the lock (drives the header note). */
  required?: boolean;
  /** Guideline slugs that apply to the mode (from the #412 registry). */
  guidelineSlugs?: string[];
  /** Matched template slug, from the production plan. */
  templateSlug?: string | null;
  /** Register/vibe the production plan already inferred (seeds the fallback). */
  register?: string | null;
  vibe?: string | null;
  /** Aspect + platform, from the production plan. */
  aspect?: string | null;
  platform?: string | null;
  /** A benchmark source URL / slug the plan recorded (a URL routes to researcher). */
  benchmarkSource?: string | null;
  /** Golden-benchmark-set slug the mode declares (#419), if any — cited in the
   *  benchmark-references section so generation + eval score against the same set. */
  benchmarkSet?: string | null;
}

/**
 * Deterministic enrichment fallback — used by `--no-llm`, and when the LLM pass
 * fails/returns malformed JSON. Pulls everything it can from the resolved
 * context (plan register/vibe, mode, template, guidelines) and leaves explicit
 * `TODO:` placeholders the agent fills, so the scaffold is always actionable but
 * never silently fabricates a register.
 */
export function deterministicStyleLock(ctx: StyleLockContext): StyleLockContent {
  const register = (ctx.register ?? "").trim();
  const vibe = (ctx.vibe ?? "").trim();
  const aspect = ctx.aspect ?? "9:16";
  const platform = ctx.platform ?? "the target platform";
  const guidelineLine =
    ctx.guidelineSlugs && ctx.guidelineSlugs.length
      ? `Applicable guidelines: ${ctx.guidelineSlugs.map((s) => `\`@guideline:${s}\``).join(", ")} — run \`ralphy guideline show <slug>\` and fold the rules in.`
      : "No guideline slug pre-mapped for this mode — derive the register from the matched template / memory.";
  const benchmarkLine = ctx.benchmarkSource
    ? `Plan benchmark source: \`${ctx.benchmarkSource}\`.${/^https?:\/\//i.test(ctx.benchmarkSource) ? " This is a URL — route it through the researcher / site-grounding sub-agent (AGENTS #15) and store the digest before finalizing this lock." : ""}`
    : "No benchmark source recorded in the plan yet.";
  const benchmarkSetLine = ctx.benchmarkSet
    ? `Golden benchmark set: \`${ctx.benchmarkSet}\` (#419) — run \`ralphy benchmark show ${ctx.benchmarkSet}\` and lock the register against its good/acceptable/bad features.`
    : "No golden benchmark set mapped to this mode yet.";
  const templateLine = ctx.templateSlug
    ? `Matched template: \`${ctx.templateSlug}\` — its style block is the starting register.`
    : "No template matched (freeform) — derive the register from the brief + memory.";

  return {
    visualRegister: [
      register ? `Plan register: **${register}**.` : "TODO: lock the look — palette, lighting, lens, grain, realism axis.",
      vibe ? `Vibe: ${vibe}.` : null,
      `Aspect: ${aspect}.`,
      templateLine,
    ]
      .filter(Boolean)
      .join(" "),
    pacing:
      "TODO: lock the cut cadence / hold lengths (video) or the per-frame information density (stills). Cite the relevant memory (e.g. faceless-essay pacing, choose-path target duration) if one applies.",
    hookMechanics:
      `TODO: define the scroll-stop for ${platform} — the first 0-3s beat (video) or the cover (carousel/still).`,
    captionAudioStyle:
      "TODO: caption treatment (font/color/chunking/timing), VO register + language, music + SFX policy. Honor the audio invariants (Kling --audio EN-only; music is a separate ElevenLabs pass post-mixed in the editor stage).",
    doNotDo:
      "TODO: list the anti-patterns — AI-slop tells, register breakers, banned colors/effects. This negative-scope list is the load-bearing one.",
    benchmarkRefs: [benchmarkSetLine, benchmarkLine, guidelineLine].join(" "),
    modelImplications:
      "TODO: what the locked register implies for the model stack (read MODELS.md before naming a model). Note any provider filter to route around and the prompt-spine cues.",
  };
}

/**
 * Merge LLM-enriched fields over the deterministic fallback. Non-empty LLM
 * values win per-field; everything else keeps the deterministic value, so a
 * partial / failed enrichment never leaves a section blank. Pure.
 */
export function mergeStyleLockContent(
  fallback: StyleLockContent,
  enriched: Partial<StyleLockContent> | null | undefined,
): StyleLockContent {
  if (!enriched) return { ...fallback };
  const merged = { ...fallback };
  for (const f of STYLE_LOCK_FIELDS) {
    const v = enriched[f.key];
    if (typeof v === "string" && v.trim().length > 0) merged[f.key] = v.trim();
  }
  return merged;
}

/**
 * Render the STYLE_LOCK.md body from the resolved context + filled content.
 * English-only-on-disk. The header states whether the mode requires the lock and
 * points back at the contract + the `--check` gate.
 */
export function renderStyleLockScaffold(
  ctx: StyleLockContext,
  content: StyleLockContent,
): string {
  const modeLine = ctx.contentMode
    ? `\`${ctx.contentMode}\`${ctx.required ? " (style lock REQUIRED for this mode)" : " (style lock optional for this mode)"}`
    : "(unclassified — confirm the content mode with the user)";

  const sections = STYLE_LOCK_FIELDS.map(
    (f) => `## ${f.heading}\n\n> ${f.prompt}\n\n${content[f.key].trim() || "_(to be filled)_"}`,
  ).join("\n\n");

  return `# Style Lock — ${ctx.projectId}

> Contract phase-6 artifact (#408). See \`docs/playbooks/agent-production-contract.md\` and \`cli/lib/contract.ts → CONTRACT_PHASES\`. Created BEFORE prompt fan-out; the same register downstream prompts AND the eval deep-vision pass score against. Gate it with \`ralphy project style-lock ${ctx.projectId} --check\`.
>
> Content mode (#412): ${modeLine}

## Brief

${(ctx.brief ?? "").trim() || "_(no brief text supplied — pull from PRODUCTION_PLAN.md)_"}

${sections}

## Derivation route

> If a URL / handle / reference is present in the brief, DO NOT crawl it from this verb — route through the \`researcher\` skill / site-grounding sub-agent (AGENTS #15), then fold the digest into the sections above. Otherwise derive the register from the matched template, the applicable guideline slugs, and memory.
`;
}
