// Memory curation (#116) — LLM-assisted health pass over the active tiers.
//
// The on-demand analog of hermes-agent's idle-triggered curator: find
// overlapping entries (stage a merged survivor into proposed/), flag entries
// with a missing/placeholder negative scope, and flag stale references.
// Curate NEVER mutates active entries — merges land in proposed/ for the
// user's `approve`, retires are SUGGESTIONS the user executes via
// `ralphy memory retire <slug>`.

import { callLLM } from "../providers/llm.js";
import {
  listEntries,
  writeEntry,
  SLUG_RE,
  type MemoryEntry,
  type TierRef,
} from "./store.js";

/** Same register as distill — see MODELS.md "LLM" table. */
export const CURATE_MODEL = "anthropic/claude-sonnet-4.6";

export interface CurateMerge {
  /** The slug that survives — the merged body lands as its next proposed version. */
  survivor_slug: string;
  tier: "global" | "workspace";
  /** Full merged body (rule + Why / How to apply / Does NOT apply to lines). */
  merged_body: string;
  /** One-line description for the survivor's index line. */
  description: string;
  /** Slugs to `ralphy memory retire` AFTER the merge is approved. */
  retire_after_approve: string[];
}

export interface CurateFlag {
  slug: string;
  tier: "global" | "workspace";
  reason: "missing-negative-scope" | "stale-reference" | "other";
  detail: string;
}

export interface CurateResult {
  workspace: string;
  model: string;
  scanned: number;
  dryRun: boolean;
  merges: CurateMerge[];
  flags: CurateFlag[];
  /** Proposed merge entries actually staged (empty on --dry-run). */
  staged: Array<Pick<MemoryEntry, "slug" | "tier" | "file" | "path">>;
}

const SYSTEM_PROMPT = `You are auditing an agent's curated memory store (markdown rules). Return STRICT JSON: {"merges": [...], "flags": [...]}.

A merge candidate: two or more entries that encode overlapping or contradicting rules. For each, emit {"survivor_slug", "tier", "merged_body", "description", "retire_after_approve"}:
- survivor_slug: the strongest existing slug (never invent a new one);
- tier: the survivor's tier;
- merged_body: the consolidated rule body — the rule (1-3 imperative sentences), then "**Why:**", "**How to apply:**", "**Does NOT apply to:**" lines, preserving the most specific evidence from all merged entries;
- description: one line, <=140 chars;
- retire_after_approve: the OTHER slugs the merge absorbs (never the survivor).

A flag: {"slug", "tier", "reason", "detail"} where reason is:
- "missing-negative-scope" — the "Does NOT apply to:" line is absent, a placeholder, or so vague it cannot prevent over-application;
- "stale-reference" — the entry names a model id, CLI verb, or path that the provided context says no longer exists;
- "other" — contradicts another entry (name it), or is task narrative rather than a durable rule.

Be conservative: merging loses provenance granularity, so only merge clear overlaps. No merges and no flags is a valid answer ({"merges": [], "flags": []}).`;

function entryDigest(e: MemoryEntry): string {
  return `--- slug: ${e.slug} | tier: ${e.tier} | type: ${e.type} ---\n${e.body}`;
}

function parseCurate(text: string): { merges: CurateMerge[]; flags: CurateFlag[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { merges: [], flags: [] };
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return { merges: [], flags: [] };
    }
  }
  const obj = (parsed ?? {}) as { merges?: unknown; flags?: unknown };
  const merges: CurateMerge[] = [];
  if (Array.isArray(obj.merges)) {
    for (const m of obj.merges) {
      const mm = m as Record<string, unknown>;
      const survivor = typeof mm.survivor_slug === "string" ? mm.survivor_slug : "";
      const body = typeof mm.merged_body === "string" ? mm.merged_body.trim() : "";
      if (!SLUG_RE.test(survivor) || !body) continue;
      merges.push({
        survivor_slug: survivor,
        tier: mm.tier === "workspace" ? "workspace" : "global",
        merged_body: body,
        description: typeof mm.description === "string" ? mm.description : "",
        retire_after_approve: Array.isArray(mm.retire_after_approve)
          ? mm.retire_after_approve.filter((s): s is string => typeof s === "string" && SLUG_RE.test(s) && s !== survivor)
          : [],
      });
    }
  }
  const flags: CurateFlag[] = [];
  if (Array.isArray(obj.flags)) {
    for (const f of obj.flags) {
      const ff = f as Record<string, unknown>;
      const slug = typeof ff.slug === "string" ? ff.slug : "";
      if (!slug) continue;
      const reason = ff.reason === "missing-negative-scope" || ff.reason === "stale-reference" ? ff.reason : "other";
      flags.push({
        slug,
        tier: ff.tier === "workspace" ? "workspace" : "global",
        reason,
        detail: typeof ff.detail === "string" ? ff.detail : "",
      });
    }
  }
  return { merges, flags };
}

export async function curateMemory(opts: { ws: string; dryRun?: boolean }): Promise<CurateResult> {
  const refs: Array<{ ref: TierRef; tier: "global" | "workspace" }> = [
    { ref: { tier: "global" }, tier: "global" },
    { ref: { tier: "workspace", ws: opts.ws }, tier: "workspace" },
  ];
  const entries: MemoryEntry[] = [];
  for (const r of refs) entries.push(...(await listEntries(r.ref, "active")));

  if (entries.length === 0) {
    return { workspace: opts.ws, model: CURATE_MODEL, scanned: 0, dryRun: Boolean(opts.dryRun), merges: [], flags: [], staged: [] };
  }

  const r = await callLLM({
    model: CURATE_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: entries.map(entryDigest).join("\n\n") },
    ],
    jsonMode: true,
    maxTokens: 4000,
    endpoint: "openrouter/memory-curate",
  });

  const { merges, flags } = parseCurate(r.text);

  // Survivor must actually exist among the scanned entries — drop hallucinated slugs.
  const known = new Set(entries.map((e) => `${e.tier}:${e.slug}`));
  const validMerges = merges.filter((m) => known.has(`${m.tier}:${m.survivor_slug}`));

  const staged: CurateResult["staged"] = [];
  if (!opts.dryRun) {
    for (const m of validMerges) {
      const w = await writeEntry({
        text: m.merged_body,
        ref: m.tier === "workspace" ? { tier: "workspace", ws: opts.ws } : { tier: "global" },
        status: "proposed",
        slug: m.survivor_slug,
        description: m.description || undefined,
        source: `curate:merge of [${[m.survivor_slug, ...m.retire_after_approve].join(", ")}]`,
      });
      staged.push({ slug: w.entry.slug, tier: w.entry.tier, file: w.entry.file, path: w.entry.path });
    }
  }

  return {
    workspace: opts.ws,
    model: CURATE_MODEL,
    scanned: entries.length,
    dryRun: Boolean(opts.dryRun),
    merges: validMerges,
    flags,
    staged,
  };
}
