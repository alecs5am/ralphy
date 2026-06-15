// Failure lessons router (#425) — generalizes the #113 postmortem distiller.
//
// Distill (cli/lib/memory/distill.ts) routes postmortem lessons to memory or
// guideline and stages the memory ones into the `proposed/` tier. This widens
// BOTH ends of that pipe:
//   • INPUT  — postmortem lesson/workflow files + eval.json (+ deep-vision) +
//              repair-plan.json + council reports + the error rows of
//              generations.jsonl, assembled into ONE LLM context.
//   • ROUTE  — an 8-way enum (memory | guideline | MODELS.md | content-mode |
//              template | skill | cli-issue | drop) instead of memory/guideline.
//
// It reuses distill's hygiene verbatim (the DO-NOT-capture exclusions + the
// MANDATORY negative scope on memory/guideline proposals) and the SAME
// `proposed/` staging path (`writeEntry`, NOT auto-approve). Only `memory`
// proposals stage; every other route is REPORT-ONLY (they need human action on
// guidelines/MODELS.md/templates/skills and must never be auto-written).

import fs from "node:fs/promises";
import path from "node:path";
import { projectDir, projectWorkspace, root } from "../paths.js";
import { callLLM } from "../providers/llm.js";
import { readGenerations } from "../gen-log.js";
import { writeEntry, searchEntries, SLUG_RE, autoSlug, type MemoryEntry } from "../memory/store.js";
import { DISTILL_MODEL, DISTILL_SOURCES } from "../memory/distill.js";

/** The 8 destinations a routed lesson can land in (issue #425). */
export const LESSON_ROUTES = [
  "memory",
  "guideline",
  "MODELS.md",
  "content-mode",
  "template",
  "skill",
  "cli-issue",
  "drop",
] as const;
export type LessonRoute = (typeof LESSON_ROUTES)[number];

/** Routes that carry a durable rule and therefore MUST carry negative scope. */
const SCOPED_ROUTES: ReadonlySet<LessonRoute> = new Set(["memory", "guideline"]);

export interface LessonProposal {
  route: LessonRoute;
  title: string;
  detail: string;
  /** Source project + the section/file the lesson came from. */
  provenance: string;
  confidence: "high" | "medium" | "low";
  /** MANDATORY for memory/guideline routes — the negative scope (#045 discipline). */
  does_not_apply_to?: string;
  /** memory-only: tier + slug used when staging into proposed/. */
  tier?: "global" | "workspace";
  slug?: string;
  /** An overlapping live memory slug / guideline slug, when found (re-note the survivor). */
  existingSlug?: string;
}

export interface RouteResult {
  project: string;
  workspace: string;
  model: string;
  sources: string[];
  dryRun: boolean;
  proposals: LessonProposal[];
  /** Memory proposals actually staged into proposed/ (empty on --dry-run). */
  staged: Array<Pick<MemoryEntry, "slug" | "tier" | "file" | "path">>;
}

/** Thrown when the project has no readable failure-lesson sources at all. */
export class NoLessonSourcesError extends Error {
  readonly code = "E_NOT_FOUND" as const;
  constructor(readonly project: string, readonly lookedIn: string) {
    super(`no failure-lesson sources for ${project} (looked in ${lookedIn})`);
    this.name = "NoLessonSourcesError";
  }
}

// The hygiene block is lifted verbatim from distill's SYSTEM_PROMPT (the
// DO-NOT-capture exclusions + the mandatory negative scope) so the two share
// one self-poisoning guard. The routing instructions wrap it.
const SYSTEM_PROMPT = `You route durable lessons from a finished video-production project to the correct knowledge surface for an autonomous agent. You read postmortem lessons, the eval report, the repair plan, council reviews, and the project's failed model calls. Return STRICT JSON: {"proposals": [...]} where each proposal is {"route", "title", "detail", "provenance", "confidence", "does_not_apply_to", "tier", "slug", "existingSlug"}.

Fields:
- route: EXACTLY one of ${LESSON_ROUTES.join(" | ")}.
  - memory: a durable cross-project craft/model/tooling rule (global) OR a client/universe fact (workspace). The ONLY route that gets staged for the user to approve.
  - guideline: the lesson's value is an extractable reusable prompt-writing artifact (a register's rules, a six-token spine, an anti-slop cluster) — belongs in the guidelines library.
  - MODELS.md: a model-capability/limit fact (a model id's cap, audio behavior, a filter that blocks an input class) — belongs in the model reference.
  - content-mode: a routing/intake rule keyed to a content mode (research depth, required inputs, unit shape).
  - template: a reusable structure/style worth promoting into a template.
  - skill: a craft overlay that should become or update a skill.
  - cli-issue: a Ralphy CLI bug or gap the run worked around — file an issue.
  - drop: not durable; do not record anywhere.
- title: one line, <=80 chars, imperative.
- detail: the rule/finding, 1-3 sentences, plus the fix where there was one.
- provenance: the source project AND which section/file (e.g. "choose-001 / 02-lessons.md", "acme-001 / eval.json findings", "acme-001 / generations.jsonl error rows").
- confidence: high | medium | low — how strongly the evidence supports generalizing beyond this one project.
- does_not_apply_to: MANDATORY for route "memory" and "guideline" — the explicit negative scope, the cases that look like a match but are not. If truly universal, say "no known exceptions". OMIT for the other routes.
- tier (memory only): "global" for cross-project craft/model/tooling; "workspace" for client/universe facts.
- slug (memory/guideline only): lowercase kebab-case, CLASS-LEVEL (no project ids, error strings, session artifacts).
- existingSlug: if you believe this overlaps an existing entry, name its slug so the agent re-notes the survivor instead of creating a near-duplicate. The caller also checks the live store and may add this.

DO NOT capture (hard exclusions — route these to "drop"):
- Environment-dependent failures (missing binary, missing API key, unconfigured dep) — the user fixes those; they are not durable rules. If a FIX emerged from setup state, capture the fix, not the failure.
- Negative claims about tools or models ("X is broken", "Y does not work") — these harden into refusals cited long after the problem is fixed.
- Transient errors that resolved on retry — the lesson is the retry pattern, not the failure.
- One-off task narratives, task progress, session outcomes, completed-work logs.
- Anything already obvious from the project files themselves.

Prefer FEWER, stronger proposals (typically 2-8). Quality over coverage. An empty proposals array is valid when nothing durable emerged.`;

function asJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 0);
  } catch {
    return "";
  }
}

async function readText(abs: string): Promise<string | null> {
  try {
    return await fs.readFile(abs, "utf-8");
  } catch {
    return null;
  }
}

async function readJson(abs: string): Promise<unknown | null> {
  const t = await readText(abs);
  if (t == null) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/** Live memory + guideline slugs that overlap the proposal's key terms. */
async function findOverlap(p: LessonProposal, guidelineSlugs: string[], ws: string): Promise<string | undefined> {
  if (p.existingSlug) return p.existingSlug; // trust the model's own pointer first
  if (!SCOPED_ROUTES.has(p.route)) return undefined;
  if (p.route === "guideline") {
    const hit = guidelineSlugs.find((s) => p.slug === s || (p.slug && p.slug.includes(s)) || s.includes(p.slug ?? "\0"));
    return hit;
  }
  // memory: search the live store by the proposal's slug words (cheap substring scan).
  const key = (p.slug ?? p.title).replace(/-/g, " ");
  const matches = await searchEntries(key, ws);
  return matches[0]?.slug;
}

async function guidelineSlugs(): Promise<string[]> {
  try {
    const ents = await fs.readdir(path.join(root(), "guidelines"), { withFileTypes: true });
    return ents.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name);
  } catch {
    return [];
  }
}

function parseProposals(text: string): LessonProposal[] {
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
  const arr = (parsed as { proposals?: unknown })?.proposals;
  if (!Array.isArray(arr)) return [];
  const out: LessonProposal[] = [];
  for (const c of arr) {
    if (!c || typeof c !== "object") continue;
    const p = c as Record<string, unknown>;
    const route = (LESSON_ROUTES as readonly string[]).includes(String(p.route))
      ? (p.route as LessonRoute)
      : "drop";
    const title = typeof p.title === "string" ? p.title.trim() : "";
    if (!title) continue;
    const rawSlug = typeof p.slug === "string" ? p.slug : "";
    const slug = SLUG_RE.test(rawSlug) ? rawSlug : route === "memory" || route === "guideline" ? autoSlug(title) : undefined;
    out.push({
      route,
      title,
      detail: typeof p.detail === "string" ? p.detail : "",
      provenance: typeof p.provenance === "string" ? p.provenance : "",
      confidence: p.confidence === "high" || p.confidence === "low" ? p.confidence : "medium",
      ...(SCOPED_ROUTES.has(route)
        ? { does_not_apply_to: typeof p.does_not_apply_to === "string" ? p.does_not_apply_to : "" }
        : {}),
      ...(route === "memory" ? { tier: p.tier === "workspace" ? "workspace" : "global" } : {}),
      ...(slug ? { slug } : {}),
      ...(typeof p.existingSlug === "string" && SLUG_RE.test(p.existingSlug) ? { existingSlug: p.existingSlug } : {}),
    });
  }
  return out;
}

/** Memory body in the distill shape: rule + the negative-scope discipline lines. */
function proposalBody(p: LessonProposal): string {
  return [
    p.detail || p.title,
    "",
    `**Why:** ${p.provenance || "(not captured)"}`,
    `**How to apply:** (routed lesson — confidence ${p.confidence})`,
    `**Does NOT apply to:** ${p.does_not_apply_to || "(not captured — REQUIRED before approval)"}`,
  ].join("\n");
}

export async function routeFailureLessons(opts: {
  projectId: string;
  dryRun?: boolean;
}): Promise<RouteResult> {
  const dir = projectDir(opts.projectId);
  const ws = projectWorkspace(opts.projectId);
  const pmDir = path.join(dir, "postmortem");

  const sections: Array<{ label: string; body: string }> = [];

  // Postmortem lesson/workflow files (reuse distill's source list).
  for (const file of DISTILL_SOURCES) {
    const t = await readText(path.join(pmDir, file));
    if (t) sections.push({ label: `postmortem/${file}`, body: t });
  }
  // Eval report + deep-vision (compact JSON — the LLM only needs findings/redos).
  const evalJson = await readJson(path.join(dir, "eval.json"));
  if (evalJson) sections.push({ label: "eval.json", body: asJson(evalJson) });
  const deepVision = await readJson(path.join(dir, "eval-deep-vision.json"));
  if (deepVision) sections.push({ label: "eval-deep-vision.json", body: asJson(deepVision) });
  // Repair plan.
  const repairPlan = await readJson(path.join(dir, "repair-plan.json"));
  if (repairPlan) sections.push({ label: "repair-plan.json", body: asJson(repairPlan) });
  // Council reports (either phase).
  for (const file of ["council-preflight.json", "council-polish.json"]) {
    const j = await readJson(path.join(dir, file));
    if (j) sections.push({ label: file, body: asJson(j) });
  }
  // Generation failure rows only (#424 failureClass when present).
  const errorRows = (await readGenerations(opts.projectId))
    .filter((r) => r.status === "error")
    .map((r) => ({ endpoint: r.endpoint, model: r.model, error: r.error, failureClass: r.failureClass, slot: r.input?.slot }));
  if (errorRows.length) sections.push({ label: "generations.jsonl (error rows)", body: asJson(errorRows) });

  if (sections.length === 0) throw new NoLessonSourcesError(opts.projectId, dir);

  const r = await callLLM({
    model: DISTILL_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: sections.map((s) => `===== ${s.label} =====\n${s.body}`).join("\n\n"),
      },
    ],
    jsonMode: true,
    maxTokens: 4000,
    projectId: opts.projectId,
    endpoint: "openrouter/lessons-route",
  });

  const proposals = parseProposals(r.text);

  // Flag overlaps so the agent re-notes the survivor instead of duplicating.
  const gSlugs = await guidelineSlugs();
  for (const p of proposals) {
    const overlap = await findOverlap(p, gSlugs, ws);
    if (overlap) p.existingSlug = overlap;
  }

  // Stage ONLY memory proposals into proposed/ (NOT auto-approve). Every other
  // route is report-only — they require human action on guidelines/MODELS.md/etc.
  const staged: RouteResult["staged"] = [];
  if (!opts.dryRun) {
    for (const p of proposals.filter((x) => x.route === "memory" && x.slug)) {
      const w = await writeEntry({
        text: proposalBody(p),
        ref: p.tier === "workspace" ? { tier: "workspace", ws } : { tier: "global" },
        status: "proposed",
        slug: p.slug,
        description: p.title,
        source: `lessons:${opts.projectId} (${sections.map((s) => s.label).join(", ")})`,
      });
      staged.push({ slug: w.entry.slug, tier: w.entry.tier, file: w.entry.file, path: w.entry.path });
    }
  }

  return {
    project: opts.projectId,
    workspace: ws,
    model: DISTILL_MODEL,
    sources: sections.map((s) => s.label),
    dryRun: Boolean(opts.dryRun),
    proposals,
    staged,
  };
}
