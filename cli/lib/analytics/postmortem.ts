// Performance postmortem (#507) — one bounded callLLM() pass over a project's
// unit BATCH: analytics.jsonl snapshots + unit metadata in, evidence-grounded
// findings out. Closes the performance feedback loop: the audience's numbers,
// not the user's taste,
// calibrate the next production tick.
//
// EVIDENCE RULE (the issue's "never vibes" clause), enforced twice:
//   1. The prompt requires every finding to cite unit slugs + concrete metric
//      deltas.
//   2. `parseFindings` VALIDATES: a finding whose `evidence.units` names no
//      known unit slug of this project is DROPPED (counted, surfaced, never
//      staged or written as a finding).
//
// OUTPUTS (both append-only):
//   • `<project>/postmortem/analytics-findings.json` — versioned `.vN` when
//     the file exists (invariant #14; mirrors the generate .vN convention).
//   • Workspace-tier memory PROPOSALS via the #117/#118 bulk-ingestion
//     discipline: staged into the workspace `proposed/` dir (the same
//     `writeEntry({ status: "proposed" })` mechanism `ralphy memory distill`
//     uses), surfaced as a list, promoted only by the user's
//     `ralphy memory approve`. Tier rule (#507 notes): niche/audience
//     findings are WORKSPACE facts — nothing is ever written to global memory
//     here, whatever the model claims.

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { projectDir, projectWorkspace } from "../paths.js";
import { callLLM } from "../providers/llm.js";
import type { CallLLMOptions, CallLLMResult } from "../providers/llm.js";
import {
  writeEntry,
  MEMORY_TYPES,
  SLUG_RE,
  autoSlug,
  memoryEntryReference,
  type MemoryEntryReference,
} from "../memory/store.js";
import type { AnalyticsSnapshot } from "../schemas/analytics.js";
import { readSnapshots, listUnitSlugs } from "./pull.js";
import { unitDirFor } from "../publish/publish.js";

/** Per MODELS.md "LLM" table: feedback parsing / nuance register. */
export const ANALYTICS_POSTMORTEM_MODEL = "anthropic/claude-sonnet-4.6";

export type LLMImpl = (opts: CallLLMOptions) => Promise<CallLLMResult>;

// ─── input gathering ─────────────────────────────────────────────────────────

export interface UnitAnalyticsDigest {
  slug: string;
  format?: string;
  title?: string;
  created?: string;
  /** The TikTok hook line from the unit's caption, when drafted. */
  captionHook?: string;
  /** Present only when unit.json carries a duration-ish field (tolerant read). */
  durationSec?: number;
  snapshots: AnalyticsSnapshot[];
}

/** Tolerant unit.json read — metadata only, no schema strictness needed here. */
async function readUnitMeta(unitDir: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(unitDir, "unit.json"), "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Units of the project that HAVE analytics snapshots, with their metadata. */
export async function gatherUnitAnalytics(projectId: string): Promise<UnitAnalyticsDigest[]> {
  const out: UnitAnalyticsDigest[] = [];
  for (const slug of listUnitSlugs(projectId)) {
    const unitDir = unitDirFor(projectId, slug);
    const snapshots = readSnapshots(unitDir);
    if (snapshots.length === 0) continue;
    const meta = (await readUnitMeta(unitDir)) ?? {};
    const caption = meta.caption as { platform?: { tiktok?: string } } | undefined;
    const rawDuration = (meta.durationSec ?? meta.duration) as unknown;
    const durationSec = typeof rawDuration === "number" && Number.isFinite(rawDuration) ? rawDuration : undefined;
    out.push({
      slug,
      ...(typeof meta.format === "string" && { format: meta.format }),
      ...(typeof meta.title === "string" && { title: meta.title }),
      ...(typeof meta.created === "string" && { created: meta.created }),
      ...(typeof caption?.platform?.tiktok === "string" && { captionHook: caption.platform.tiktok }),
      ...(durationSec !== undefined && { durationSec }),
      snapshots,
    });
  }
  return out;
}

// ─── the LLM pass ────────────────────────────────────────────────────────────

export interface AnalyticsFinding {
  slug: string;
  finding: string;
  evidence: {
    /** Unit slugs the finding is grounded in — at least one MUST be known. */
    units: string[];
    /** The concrete metric delta cited (e.g. "hero-cut 4.2k views vs b-roll-cut 310"). */
    metrics: string;
  };
  recommendation?: string;
  /** Memory entry type (constrained to MEMORY_TYPES; defaults to "client"). */
  type?: string;
}

const SYSTEM_PROMPT = `You analyze per-post performance metrics for a batch of published content units and distill findings an autonomous content agent can act on. Return STRICT JSON: {"findings": [...]} where each finding is {"slug", "finding", "evidence": {"units": [...], "metrics": "..."}, "recommendation", "type"}.

Fields:
- slug: lowercase kebab-case identifier for the finding (class-level, no timestamps).
- finding: 1-2 sentences — what the data shows (hook style, duration, format, caption pattern that retained or died).
- evidence.units: the unit slugs the finding is grounded in. MANDATORY — a finding that cites no unit id will be DROPPED by the caller. Only use slugs from the provided batch.
- evidence.metrics: the concrete numbers/deltas backing the finding (e.g. "unit-a 4200 views vs unit-b 310 at +7d"). Numbers, not vibes.
- recommendation: the action for the next production tick (optional).
- type: one of ${MEMORY_TYPES.join("|")} (these are niche/audience findings — usually "client" or "style").

Rules:
- Every finding MUST reference concrete evidence: unit ids + metric deltas from the data given. No general content-marketing wisdom.
- Compare across units and across snapshot times (deltas) where possible.
- Prefer FEWER, stronger findings (typically 1-5). An empty findings array is valid when the data supports nothing.`;

/**
 * Parse + VALIDATE the model output. The evidence rule is enforced here: a
 * finding whose `evidence.units` contains no known unit slug is dropped.
 */
export function parseFindings(
  text: string,
  knownSlugs: readonly string[],
): { findings: AnalyticsFinding[]; dropped: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { findings: [], dropped: 0 };
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return { findings: [], dropped: 0 };
    }
  }
  const arr = (parsed as { findings?: unknown })?.findings;
  if (!Array.isArray(arr)) return { findings: [], dropped: 0 };

  const known = new Set(knownSlugs);
  const findings: AnalyticsFinding[] = [];
  let dropped = 0;
  for (const f of arr) {
    if (!f || typeof f !== "object") continue;
    const raw = f as Record<string, unknown>;
    const finding = typeof raw.finding === "string" ? raw.finding.trim() : "";
    if (!finding) continue;
    const ev = raw.evidence as Record<string, unknown> | undefined;
    const units = Array.isArray(ev?.units) ? ev.units.filter((u): u is string => typeof u === "string") : [];
    const grounded = units.filter((u) => known.has(u));
    if (grounded.length === 0) {
      dropped += 1; // evidence-less (or fabricated-evidence) finding — the hard rule
      continue;
    }
    const rawSlug = typeof raw.slug === "string" ? raw.slug : "";
    findings.push({
      slug: SLUG_RE.test(rawSlug) ? rawSlug : autoSlug(finding),
      finding,
      evidence: {
        units: grounded,
        metrics: typeof ev?.metrics === "string" ? ev.metrics : "",
      },
      ...(typeof raw.recommendation === "string" && { recommendation: raw.recommendation }),
      type: (MEMORY_TYPES as readonly string[]).includes(String(raw.type)) ? String(raw.type) : "client",
    });
  }
  return { findings, dropped };
}

// ─── outputs ─────────────────────────────────────────────────────────────────

/** `analytics-findings.json`, versioning to `.vN` when taken (append-only). */
export function versionedFindingsPath(pmDir: string): string {
  const base = path.join(pmDir, "analytics-findings.json");
  if (!existsSync(base)) return base;
  for (let v = 2; ; v += 1) {
    const p = path.join(pmDir, `analytics-findings.v${v}.json`);
    if (!existsSync(p)) return p;
  }
}

function findingBody(f: AnalyticsFinding): string {
  return [
    f.finding,
    "",
    `**Why:** performance data — ${f.evidence.metrics || "(metrics not quoted)"} (units: ${f.evidence.units.join(", ")})`,
    `**How to apply:** ${f.recommendation || "fold into the next production plan for this workspace"}`,
    "**Does NOT apply to:** other niches/workspaces — audience finding scoped to this workspace's content (re-verify before porting)",
  ].join("\n");
}

export interface AnalyticsPostmortemResult {
  project: string;
  workspace: string;
  model: string;
  units: string[];
  findings: AnalyticsFinding[];
  /** Findings dropped for citing no known unit id (the evidence rule). */
  dropped: number;
  findingsPath: string | null;
  /** Workspace-tier proposed/ entries staged (empty on --dry-run). */
  staged: MemoryEntryReference[];
  dryRun: boolean;
}

/** Thrown when no unit of the project has any analytics snapshots yet. */
export class NoAnalyticsError extends Error {
  readonly code = "E_NOT_FOUND" as const;
  constructor(readonly project: string) {
    super(`no analytics snapshots for any unit of ${project} — run \`ralphy analytics pull ${project}\` first`);
    this.name = "NoAnalyticsError";
  }
}

export async function runAnalyticsPostmortem(opts: {
  projectId: string;
  dryRun?: boolean;
  /** Test seam — defaults to the real bounded callLLM(). */
  llmImpl?: LLMImpl;
}): Promise<AnalyticsPostmortemResult> {
  const digests = await gatherUnitAnalytics(opts.projectId);
  if (digests.length === 0) throw new NoAnalyticsError(opts.projectId);
  const ws = projectWorkspace(opts.projectId);
  const knownSlugs = digests.map((d) => d.slug);

  const llm = opts.llmImpl ?? callLLM;
  const r = await llm({
    model: ANALYTICS_POSTMORTEM_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify({ project: opts.projectId, units: digests }, null, 2) },
    ],
    jsonMode: true,
    maxTokens: 4000,
    projectId: opts.projectId,
    endpoint: "openrouter/analytics-postmortem",
  });

  const { findings, dropped } = parseFindings(r.text, knownSlugs);

  let findingsPath: string | null = null;
  const staged: AnalyticsPostmortemResult["staged"] = [];
  if (!opts.dryRun) {
    const pmDir = path.join(projectDir(opts.projectId), "postmortem");
    await fs.mkdir(pmDir, { recursive: true });
    findingsPath = versionedFindingsPath(pmDir);
    await fs.writeFile(
      findingsPath,
      JSON.stringify(
        {
          project: opts.projectId,
          workspace: ws,
          model: ANALYTICS_POSTMORTEM_MODEL,
          generatedAt: new Date().toISOString(),
          units: knownSlugs,
          findings,
          dropped,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    for (const f of findings) {
      // WORKSPACE tier, always — niche/audience findings never write global.
      const w = await writeEntry({
        text: findingBody(f),
        ref: { tier: "workspace", ws },
        status: "proposed",
        type: f.type ?? "client",
        slug: f.slug,
        description: f.finding.slice(0, 140),
        source: `analytics-postmortem:${opts.projectId} (${knownSlugs.join(", ")})`,
      });
      staged.push(memoryEntryReference(w.entry));
    }
  }

  return {
    project: opts.projectId,
    workspace: ws,
    model: ANALYTICS_POSTMORTEM_MODEL,
    units: knownSlugs,
    findings,
    dropped,
    findingsPath,
    staged,
    dryRun: Boolean(opts.dryRun),
  };
}
