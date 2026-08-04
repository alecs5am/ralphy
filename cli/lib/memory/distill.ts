// Postmortem distillation (#113) — postmortem/ set → memory PROPOSALS.
//
// Reads the project's postmortem lessons + workflow-fixes files, extracts
// candidate memory rules via callLLM(), classifies each by tier (global craft
// vs workspace client/style) and stages them into the matching `proposed/`
// dir (#112 store). NEVER writes active entries — promotion is the user's
// `ralphy memory approve` (the user-approved ingestion decision).
//
// The hygiene rules in the system prompt are lifted from the hermes-agent
// background-review prompts (see notes/issues/113-*.md) — they are what keeps
// distilled memory from self-poisoning.

import fs from "node:fs/promises";
import path from "node:path";
import { projectDir, projectWorkspace } from "../paths.js";
import { callLLM } from "../providers/llm.js";
import {
  writeEntry,
  MEMORY_TYPES,
  SLUG_RE,
  autoSlug,
  memoryEntryReference,
  type MemoryEntryReference,
} from "./store.js";

/** Per MODELS.md "LLM" table: feedback parsing / nuance register. */
export const DISTILL_MODEL = "anthropic/claude-sonnet-4.6";

/** The postmortem files distillation reads (the lesson-bearing pair of the 7-file set). */
export const DISTILL_SOURCES = ["02-lessons.md", "05-workflow-fixes.md"] as const;

export interface DistillCandidate {
  slug: string;
  tier: "global" | "workspace";
  type: string;
  description: string;
  rule: string;
  why: string;
  how_to_apply: string;
  does_not_apply_to: string;
  /** Set when the lesson carries an extractable artifact and belongs in guidelines/skills instead. */
  route?: "memory" | "guideline";
}

export interface DistillResult {
  project: string;
  workspace: string;
  model: string;
  sources: string[];
  dryRun: boolean;
  candidates: DistillCandidate[];
  /** Candidates routed away from memory (guideline/skill material) — never staged. */
  routedToGuideline: DistillCandidate[];
  /** Proposed entries actually written (empty on --dry-run). */
  staged: MemoryEntryReference[];
}

const SYSTEM_PROMPT = `You distill a video-production project postmortem into durable memory rules for an autonomous agent. Return STRICT JSON: {"candidates": [...]} where each candidate is {"slug", "tier", "type", "description", "rule", "why", "how_to_apply", "does_not_apply_to", "route"}.

Fields:
- slug: lowercase kebab-case, CLASS-LEVEL (no project ids, error strings, or session artifacts).
- tier: "global" for cross-project craft/model/tooling lessons; "workspace" for client/universe facts (cast, style DNA, audience, what this client rejects).
- type: one of ${MEMORY_TYPES.join("|")}.
- description: one line, <=140 chars.
- rule: the rule itself, 1-3 sentences, imperative.
- why: the failure mode the rule prevents (cite the postmortem evidence).
- how_to_apply: concrete trigger conditions / workflow step where the rule fires.
- does_not_apply_to: MANDATORY explicit negative scope — the cases that look like a match but are not. If truly universal, say "no known exceptions".
- route: "memory" normally; "guideline" when the lesson's value is an extractable reusable artifact (ffmpeg recipe, prompt template, composition snippet) — those belong in the guidelines/skills library, not memory.

DO NOT capture (hard exclusions):
- Environment-dependent failures (missing binary, missing API key, unconfigured dep) — the user fixes those; they are not durable rules.
- Negative claims about tools or models ("X is broken", "Y does not work") — these harden into refusals cited long after the problem is fixed. If something failed from setup state, capture the FIX as the rule instead.
- Transient errors that resolved — if a retry worked, the lesson is the retry pattern, not the failure.
- One-off task narratives, task progress, session outcomes, completed-work logs.
- Anything already obvious from the project files themselves.

Prefer FEWER, stronger rules (typically 2-6 per postmortem). Quality over coverage. Empty candidates array is valid when nothing durable emerged.`;

function parseCandidates(text: string): DistillCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return [];
    }
  }
  const arr = (parsed as { candidates?: unknown })?.candidates;
  if (!Array.isArray(arr)) return [];
  const out: DistillCandidate[] = [];
  for (const c of arr) {
    if (!c || typeof c !== "object") continue;
    const cand = c as Record<string, unknown>;
    const rule = typeof cand.rule === "string" ? cand.rule.trim() : "";
    if (!rule) continue;
    const rawSlug = typeof cand.slug === "string" ? cand.slug : "";
    const slug = SLUG_RE.test(rawSlug) ? rawSlug : autoSlug(rule);
    out.push({
      slug,
      tier: cand.tier === "workspace" ? "workspace" : "global",
      type: (MEMORY_TYPES as readonly string[]).includes(String(cand.type)) ? String(cand.type) : "craft",
      description: typeof cand.description === "string" ? cand.description : "",
      rule,
      why: typeof cand.why === "string" ? cand.why : "",
      how_to_apply: typeof cand.how_to_apply === "string" ? cand.how_to_apply : "",
      does_not_apply_to: typeof cand.does_not_apply_to === "string" ? cand.does_not_apply_to : "",
      route: cand.route === "guideline" ? "guideline" : "memory",
    });
  }
  return out;
}

function candidateBody(c: DistillCandidate): string {
  return [
    c.rule,
    "",
    `**Why:** ${c.why || "(not captured)"}`,
    `**How to apply:** ${c.how_to_apply || "(not captured)"}`,
    `**Does NOT apply to:** ${c.does_not_apply_to || "(not captured — REQUIRED before approval)"}`,
  ].join("\n");
}

/** Thrown when the project has no readable postmortem source files. */
export class NoPostmortemError extends Error {
  readonly code = "E_NOT_FOUND" as const;
  constructor(readonly project: string, readonly lookedIn: string) {
    super(`no postmortem sources for ${project} (looked in ${lookedIn})`);
    this.name = "NoPostmortemError";
  }
}

export async function distillPostmortem(opts: {
  projectId: string;
  dryRun?: boolean;
}): Promise<DistillResult> {
  const pmDir = path.join(projectDir(opts.projectId), "postmortem");
  const ws = projectWorkspace(opts.projectId);

  const sources: Array<{ file: string; text: string }> = [];
  for (const file of DISTILL_SOURCES) {
    try {
      sources.push({ file, text: await fs.readFile(path.join(pmDir, file), "utf-8") });
    } catch {
      /* tolerate a missing file; require at least one below */
    }
  }
  if (sources.length === 0) throw new NoPostmortemError(opts.projectId, pmDir);

  const userContent = sources
    .map((s) => `===== ${s.file} =====\n${s.text}`)
    .join("\n\n");

  const r = await callLLM({
    model: DISTILL_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    jsonMode: true,
    maxTokens: 4000,
    projectId: opts.projectId,
    endpoint: "openrouter/memory-distill",
  });

  const all = parseCandidates(r.text);
  const candidates = all.filter((c) => c.route !== "guideline");
  const routedToGuideline = all.filter((c) => c.route === "guideline");

  const staged: DistillResult["staged"] = [];
  if (!opts.dryRun) {
    for (const c of candidates) {
      const w = await writeEntry({
        text: candidateBody(c),
        ref: c.tier === "workspace" ? { tier: "workspace", ws } : { tier: "global" },
        status: "proposed",
        type: c.type,
        slug: c.slug,
        description: c.description || undefined,
        source: `distill:${opts.projectId}/postmortem (${sources.map((s) => s.file).join(", ")})`,
      });
      staged.push(memoryEntryReference(w.entry));
    }
  }

  return {
    project: opts.projectId,
    workspace: ws,
    model: DISTILL_MODEL,
    sources: sources.map((s) => s.file),
    dryRun: Boolean(opts.dryRun),
    candidates,
    routedToGuideline,
    staged,
  };
}
