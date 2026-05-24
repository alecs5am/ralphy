// Stage-1 orchestrator: planner → fan-out search → fan-out fetch →
// per-source summarize → synthesis → citation verify. Writes everything to
// a job dir under workspace/.ralph/research/<job-id>/.
//
// This is the "planner + parallel workers" topology (see
// docs/research/deep-research-architecture-foundations.md §1). It's the only
// shape that hits 100+ sources within a reasonable budget when the niche is
// broad — the four-role AI-Q split (intent → clarifier → shallow → deep)
// lands in Stage 2 alongside the async job manager.

import { mkdir, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { workspace } from "../paths.js";
import { planResearch, type ResearchPlan } from "./planner.js";
import { searchDuckDuckGo, type SearchHit } from "./retrievers/ddg-search.js";
import { fetchPage } from "./retrievers/web-fetch.js";
import { appendSource, loadRegistry } from "./source-registry.js";
import { summarizeSource, type SourceSummary } from "./summarizer.js";
import { synthesizeReport } from "./synthesizer.js";
import { extractUrls } from "./url-extractor.js";
import { verifyCitations, type VerifyResult } from "./citation-verifier.js";

export type RunOptions = {
  query: string;
  jobId?: string;
  context?: string;
  /** Max sources to fetch + summarize. Hard cap. */
  maxSources?: number;
  /** DDG results to pull per subquery. */
  hitsPerSubquery?: number;
  /** Parallel fetches. */
  fetchConcurrency?: number;
  /** Parallel summary calls. */
  summaryConcurrency?: number;
  plannerModel?: string;
  summaryModel?: string;
  synthModel?: string;
  /** Hook for live progress reporting. Called with status objects. */
  onEvent?: (e: ProgressEvent) => void;
  /** Hard timeout in seconds for the entire run. */
  budgetSeconds?: number;
};

export type ProgressEvent =
  | { kind: "plan_start"; query: string }
  | { kind: "plan_done"; subqueries: number; intent: string }
  | { kind: "search_start"; total: number }
  | { kind: "search_done"; uniqueUrls: number }
  | { kind: "fetch_start"; total: number }
  | { kind: "fetch_progress"; done: number; total: number; ok: number; failed: number }
  | { kind: "summarize_start"; total: number }
  | { kind: "summarize_progress"; done: number; total: number }
  | { kind: "synthesize_start" }
  | { kind: "synthesize_done"; words: number }
  | { kind: "verify_done"; matched: number; unmatched: number; rate: number };

export type RunResult = {
  jobId: string;
  jobDir: string;
  query: string;
  plan: ResearchPlan;
  sourcesAttempted: number;
  sourcesFetched: number;
  sourcesSummarized: number;
  report: string;
  reportPath: string;
  registryPath: string;
  verify: VerifyResult;
  citationRate: number;
};

function nowJobId(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return [
    d.getUTCFullYear(),
    pad(d.getUTCMonth() + 1),
    pad(d.getUTCDate()),
    "-",
    pad(d.getUTCHours()),
    pad(d.getUTCMinutes()),
    pad(d.getUTCSeconds()),
    "-",
    Math.random().toString(36).slice(2, 7),
  ].join("");
}

export function jobDirFor(jobId: string): string {
  return path.join(workspace(), ".ralph", "research", jobId);
}

async function appendEvent(jobDir: string, event: unknown): Promise<void> {
  const p = path.join(jobDir, "events.jsonl");
  await appendFile(
    p,
    JSON.stringify({ ts: new Date().toISOString(), ...(event as object) }) + "\n",
  );
}

async function runConcurrent<T, U>(
  items: T[],
  worker: (item: T, idx: number) => Promise<U>,
  concurrency: number,
  onProgress?: (done: number, total: number) => void,
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let next = 0;
  let done = 0;
  const total = items.length;

  async function take(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= total) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (e) {
        // worker is expected to swallow; this is a last-ditch safety net.
        results[i] = e as U;
      }
      done += 1;
      onProgress?.(done, total);
    }
  }
  const workers = Array(Math.min(concurrency, Math.max(1, total))).fill(0).map(() => take());
  await Promise.all(workers);
  return results;
}

export async function runDeepResearch(opts: RunOptions): Promise<RunResult> {
  const jobId = opts.jobId ?? nowJobId();
  const jobDir = jobDirFor(jobId);
  await mkdir(jobDir, { recursive: true });

  const maxSources = opts.maxSources ?? 100;
  const hitsPerSubquery = opts.hitsPerSubquery ?? 8;
  const fetchConcurrency = opts.fetchConcurrency ?? 8;
  const summaryConcurrency = opts.summaryConcurrency ?? 4;
  const deadline = opts.budgetSeconds
    ? Date.now() + opts.budgetSeconds * 1000
    : null;

  const emit = (e: ProgressEvent) => {
    opts.onEvent?.(e);
    void appendEvent(jobDir, e);
  };

  // ── Phase 1: Plan ──────────────────────────────────────────────────────
  emit({ kind: "plan_start", query: opts.query });
  const plan = await planResearch({
    query: opts.query,
    context: opts.context,
    model: opts.plannerModel,
    projectId: jobId,
  });
  await writeFile(
    path.join(jobDir, "plan.json"),
    JSON.stringify(plan, null, 2),
    "utf8",
  );
  emit({ kind: "plan_done", subqueries: plan.subqueries.length, intent: plan.intent });

  // ── Phase 2: Fan-out search ────────────────────────────────────────────
  emit({ kind: "search_start", total: plan.subqueries.length });
  const searchResults = await runConcurrent(
    plan.subqueries,
    (sq) => searchDuckDuckGo(sq.query, { limit: hitsPerSubquery }),
    Math.min(5, plan.subqueries.length),
  );
  // Flatten + dedup
  const seenUrls = new Set<string>();
  const candidates: SearchHit[] = [];
  for (const hits of searchResults) {
    for (const h of hits) {
      if (seenUrls.has(h.url)) continue;
      seenUrls.add(h.url);
      candidates.push(h);
    }
  }
  // Drop common non-content domains we know waste budget.
  const blocklist = [
    /\.youtube\.com\/feed\//i,
    /\.facebook\.com\/login/i,
    /\.instagram\.com\/accounts\/login/i,
    /\bpinterest\./i,
  ];
  const filtered = candidates.filter((c) => !blocklist.some((r) => r.test(c.url)));
  const targets = filtered.slice(0, maxSources);
  await writeFile(
    path.join(jobDir, "search-results.json"),
    JSON.stringify({ total: candidates.length, kept: targets.length, targets }, null, 2),
    "utf8",
  );
  emit({ kind: "search_done", uniqueUrls: targets.length });

  if (deadline && Date.now() > deadline) {
    throw new Error("budget exceeded after search phase");
  }

  // ── Phase 3: Fan-out fetch ─────────────────────────────────────────────
  emit({ kind: "fetch_start", total: targets.length });
  let okCount = 0;
  let failCount = 0;
  const fetched = await runConcurrent(
    targets,
    async (hit) => {
      const r = await fetchPage(hit.url, { timeoutMs: 15_000, maxBytes: 200_000 });
      if (r.score === 1 && r.text.length > 200) {
        okCount += 1;
        await appendSource(jobDir, {
          url: r.source_url,
          text: r.text,
          retrievedAt: r.retrieved_at,
          score: r.score,
          status: r.status,
          title: hit.title,
          searchRank: hit.rank,
        });
      } else {
        failCount += 1;
      }
      return { hit, fetch: r };
    },
    fetchConcurrency,
    (done, total) => {
      if (done % 5 === 0 || done === total) {
        emit({
          kind: "fetch_progress",
          done,
          total,
          ok: okCount,
          failed: failCount,
        });
      }
    },
  );

  if (deadline && Date.now() > deadline) {
    throw new Error("budget exceeded after fetch phase");
  }

  // ── Phase 4: Summarize ─────────────────────────────────────────────────
  const registry = await loadRegistry(jobDir);
  const toSummarize = registry.filter((r) => r.text.length > 200);
  emit({ kind: "summarize_start", total: toSummarize.length });

  const summaries = await runConcurrent(
    toSummarize,
    async (entry) => {
      try {
        return await summarizeSource({
          url: entry.url,
          rawText: entry.text,
          niche: opts.query,
          model: opts.summaryModel,
          projectId: jobId,
        });
      } catch (e) {
        return {
          url: entry.url,
          title: String((entry as { title?: unknown }).title ?? ""),
          summary: `summarize error: ${(e as Error).message}`,
          key_claims: [],
          format_patterns: [],
          why_resonates: "",
          source_quality: "low",
          freshness: "unknown",
        } as SourceSummary;
      }
    },
    summaryConcurrency,
    (done, total) => {
      if (done % 5 === 0 || done === total) {
        emit({ kind: "summarize_progress", done, total });
      }
    },
  );

  // Drop low-signal summaries so the synthesis context isn't polluted.
  const goodSummaries = summaries.filter(
    (s) => s.source_quality !== "low" && s.summary && !s.summary.startsWith("summarize error"),
  );

  await writeFile(
    path.join(jobDir, "summaries.json"),
    JSON.stringify(summaries, null, 2),
    "utf8",
  );

  if (deadline && Date.now() > deadline) {
    throw new Error("budget exceeded after summarize phase");
  }

  // ── Phase 5: Synthesize ────────────────────────────────────────────────
  emit({ kind: "synthesize_start" });
  const report = await synthesizeReport({
    query: opts.query,
    plan: {
      intent: plan.intent,
      audience_jtbd: plan.audience_jtbd,
      platforms: plan.platforms,
    },
    summaries: goodSummaries.length >= 5 ? goodSummaries : summaries,
    model: opts.synthModel,
    projectId: jobId,
  });
  const reportPath = path.join(jobDir, "report.md");
  await writeFile(reportPath, report, "utf8");
  const words = report.split(/\s+/).filter(Boolean).length;
  emit({ kind: "synthesize_done", words });

  // ── Phase 6: Verify citations ──────────────────────────────────────────
  const finalRegistry = await loadRegistry(jobDir);
  const citedUrls = extractUrls(report);
  const verify = verifyCitations(citedUrls, finalRegistry);
  const rate = citedUrls.length === 0 ? 0 : verify.matched.length / citedUrls.length;

  // Append verification footer to report.md so the user sees the gate result.
  const verifyFooter = [
    "",
    "---",
    "",
    "## Verification",
    "",
    `- Total inline citations: **${citedUrls.length}**`,
    `- Verified against source registry: **${verify.matched.length}** (${(rate * 100).toFixed(1)}%)`,
    `- Unmatched / flagged: **${verify.unmatched.length}**`,
    `- By level: exact=${verify.byLevel.exact}, truncation=${verify.byLevel.truncation}, prefix=${verify.byLevel.prefix}, child-path=${verify.byLevel["child-path"]}, query-subset=${verify.byLevel["query-subset"]}`,
    verify.unmatched.length
      ? `\nUnmatched URLs (verifier flagged — likely fabricated or stale):\n${verify.unmatched.map((u) => `- ${u}`).join("\n")}`
      : "",
  ].filter((s) => s !== "").join("\n");
  await appendFile(reportPath, "\n" + verifyFooter + "\n");
  emit({ kind: "verify_done", matched: verify.matched.length, unmatched: verify.unmatched.length, rate });

  await writeFile(
    path.join(jobDir, "verify.json"),
    JSON.stringify({ rate, ...verify }, null, 2),
    "utf8",
  );

  return {
    jobId,
    jobDir,
    query: opts.query,
    plan,
    sourcesAttempted: targets.length,
    sourcesFetched: okCount,
    sourcesSummarized: goodSummaries.length,
    report,
    reportPath,
    registryPath: path.join(jobDir, "sources.jsonl"),
    verify,
    citationRate: rate,
  };
}
