// `ralphy research <verb>` — topic-level deep-research workflow.
//
// Sibling to `ralphy ref <verb>` (which works on a single URL). Research
// composes one or more refs into a topic-level synthesis:
//
//   research start <topic> [--question "..."]
//   research add-source <url> --topic <slug> [--meta-only] [--frames <n>]
//   research synthesize <topic> [--model <id>]
//   research show <topic>
//   research list
//
// Output lands in workspace/research/<topic>/ → report.md + sources.json.
// The `/ralphy-researcher` skill is the human entry-point; this CLI is the
// machine contract.

import { Command } from "commander";
import { out, ok, err } from "../lib/output.js";
import {
  startTopic,
  addSource,
  synthesizeReport,
  showTopic,
  listTopics,
  topicPaths,
} from "../lib/research-topic.js";
import { runDeepResearch } from "../lib/research/orchestrator.js";
import { scrapeProfile } from "../lib/research/scrape-profile-orchestrator.js";

export function researchCmd() {
  const cmd = new Command("research").description("Topic-level research: aggregate multiple sources into a single report");

  cmd
    .command("start <topic>")
    .description("Create a research topic directory (workspace/research/<slug>/)")
    .option("--question <text>", "The research question to anchor the synthesis")
    .action(async (topic: string, opts: { question?: string }) => {
      try {
        const state = await startTopic({ topic, question: opts.question });
        ok(`Research topic ready: ${state.topic}`);
        out({ topic: state.topic, dir: topicPaths(state.topic).dir, sources: state.sources.length });
      } catch (e) {
        err(`start failed: ${(e as Error).message}`);
      }
    });

  cmd
    .command("add-source <url>")
    .description("Pull a URL and run the full ref chain, linking the result into a topic")
    .requiredOption("--topic <slug>", "Target research topic")
    .option("--meta-only", "Only pull metadata + register the source (skip frames / transcript / vision)")
    .option("--frames <n>", "Cap for sampled frames", (v) => parseInt(v, 10))
    .action(async (url: string, opts: { topic: string; metaOnly?: boolean; frames?: number }) => {
      try {
        const { source, state } = await addSource({
          topic: opts.topic,
          url,
          metaOnly: opts.metaOnly,
          maxFrames: opts.frames,
        });
        ok(`Source [${source.id}] ${source.status}: ${source.title}`);
        out({ topic: state.topic, sourceId: source.id, refSlug: source.refSlug, status: source.status });
      } catch (e) {
        err(`add-source failed: ${(e as Error).message}`);
      }
    });

  cmd
    .command("synthesize <topic>")
    .description("Cross-source LLM synthesis → report.md + sources.json")
    .option("--model <id>", "Override the synthesis model (default google/gemini-2.5-flash)")
    .action(async (topic: string, opts: { model?: string }) => {
      try {
        const r = await synthesizeReport({ topic, model: opts.model });
        ok(`Report written → ${r.reportPath}`);
        out({
          topic: r.state.topic,
          sources: r.state.sources.length,
          reportPath: r.reportPath,
          sourcesPath: r.sourcesPath,
          synthesizedAt: r.state.lastSynthesizedAt,
        });
      } catch (e) {
        err(`synthesize failed: ${(e as Error).message}`);
      }
    });

  cmd
    .command("show <topic>")
    .description("Print the topic state (sources, question, last synthesis)")
    .action(async (topic: string) => {
      const s = await showTopic(topic);
      if (!s) {
        err(`research topic not found: ${topic}`);
        return;
      }
      out(s);
    });

  cmd
    .command("list")
    .description("List all research topics under workspace/research/")
    .action(async () => {
      const topics = await listTopics();
      out(topics.map((t) => ({
        topic: t.topic,
        question: t.question ?? null,
        sources: t.sources.length,
        analyzed: t.sources.filter((s) => s.status === "analyzed").length,
        createdAt: t.createdAt,
        lastSynthesizedAt: t.lastSynthesizedAt ?? null,
      })));
    });

  cmd
    .command("run <query...>")
    .description("Deep research: plan → fan-out search → fetch → summarize → cited report")
    .option("--max-sources <n>", "Hard cap on sources to fetch + summarize", (v) => parseInt(v, 10))
    .option("--hits-per-subquery <n>", "DDG hits per subquery", (v) => parseInt(v, 10))
    .option("--fetch-concurrency <n>", "Parallel page fetches", (v) => parseInt(v, 10))
    .option("--summary-concurrency <n>", "Parallel summary LLM calls", (v) => parseInt(v, 10))
    .option("--planner-model <id>", "OpenRouter model for the planner / synthesis")
    .option("--summary-model <id>", "OpenRouter model for per-source summaries")
    .option("--synth-model <id>", "OpenRouter model for final synthesis")
    .option("--job-id <id>", "Override job id (default: timestamp-randhash)")
    .option("--context <text>", "Extra brief / context for the planner")
    .option("--budget-seconds <n>", "Hard wall-clock budget", (v) => parseInt(v, 10))
    .option("--max-videos <n>", "Top videos to download + vision-analyze (0 disables video track)", (v) => parseInt(v, 10))
    .option("--video-hits-per-query <n>", "DDG hits per video discovery query", (v) => parseInt(v, 10))
    .option("--video-meta-concurrency <n>", "Parallel yt-dlp meta probes", (v) => parseInt(v, 10))
    .option("--video-pull-concurrency <n>", "Parallel full video downloads", (v) => parseInt(v, 10))
    .option("--video-summary-concurrency <n>", "Parallel vision summarize calls", (v) => parseInt(v, 10))
    .option("--video-summary-model <id>", "OpenRouter model for video vision summaries")
    .option("--no-video", "Disable the video track entirely (text-only research)")
    .option("--quiet", "Suppress progress events on stderr")
    .action(async (queryParts: string[], opts: {
      maxSources?: number;
      hitsPerSubquery?: number;
      fetchConcurrency?: number;
      summaryConcurrency?: number;
      plannerModel?: string;
      summaryModel?: string;
      synthModel?: string;
      jobId?: string;
      context?: string;
      budgetSeconds?: number;
      maxVideos?: number;
      videoHitsPerQuery?: number;
      videoMetaConcurrency?: number;
      videoPullConcurrency?: number;
      videoSummaryConcurrency?: number;
      videoSummaryModel?: string;
      video?: boolean;
      quiet?: boolean;
    }) => {
      try {
        const query = queryParts.join(" ").trim();
        if (!query) {
          err("usage: ralphy research run \"<niche / question>\"");
          return;
        }
        const onEvent = opts.quiet
          ? undefined
          : (e: { kind: string; [k: string]: unknown }) => {
              process.stderr.write(`[${e.kind}] ${JSON.stringify(e)}\n`);
            };
        const result = await runDeepResearch({
          query,
          jobId: opts.jobId,
          context: opts.context,
          maxSources: opts.maxSources,
          hitsPerSubquery: opts.hitsPerSubquery,
          fetchConcurrency: opts.fetchConcurrency,
          summaryConcurrency: opts.summaryConcurrency,
          plannerModel: opts.plannerModel,
          summaryModel: opts.summaryModel,
          synthModel: opts.synthModel,
          budgetSeconds: opts.budgetSeconds,
          maxVideos: opts.video === false ? 0 : opts.maxVideos,
          videoHitsPerQuery: opts.videoHitsPerQuery,
          videoMetaConcurrency: opts.videoMetaConcurrency,
          videoPullConcurrency: opts.videoPullConcurrency,
          videoSummaryConcurrency: opts.videoSummaryConcurrency,
          videoSummaryModel: opts.videoSummaryModel,
          onEvent,
        });
        ok(`Research complete → ${result.reportPath}`);
        out({
          jobId: result.jobId,
          jobDir: result.jobDir,
          query: result.query,
          subqueries: result.plan.subqueries.length,
          videoQueries: result.plan.video_discovery_queries.length,
          sourcesAttempted: result.sourcesAttempted,
          sourcesFetched: result.sourcesFetched,
          sourcesSummarized: result.sourcesSummarized,
          videosDiscovered: result.videosDiscovered,
          videosMetaProbed: result.videosMetaProbed,
          videosAnalyzed: result.videosAnalyzed,
          reportPath: result.reportPath,
          registryPath: result.registryPath,
          citationRate: Number(result.citationRate.toFixed(3)),
          citations: {
            total: result.verify.matched.length + result.verify.unmatched.length,
            matched: result.verify.matched.length,
            unmatched: result.verify.unmatched.length,
            byLevel: result.verify.byLevel,
          },
        });
      } catch (e) {
        err(`run failed: ${(e as Error).message}`);
      }
    });

  cmd
    .command("scrape-profile <profile-url>")
    .description("Distill one creator's style: yt-dlp lists N recent videos, vision-analyzes each, writes a style-sheet.md")
    .option("--max <n>", "Number of recent videos to analyze (default 50)", (v) => parseInt(v, 10))
    .option("--niche <text>", "Optional niche context to ground the style sheet")
    .option("--reanalyze-from <existing-job-id>", "Skip list+pull; reuse video dirs from an existing job and re-run summarize+stylesheet with the current prompts")
    .option("--pull-concurrency <n>", "Parallel video downloads", (v) => parseInt(v, 10))
    .option("--summary-concurrency <n>", "Parallel vision summarize calls", (v) => parseInt(v, 10))
    .option("--summary-model <id>", "OpenRouter model for per-video vision analysis")
    .option("--synth-model <id>", "OpenRouter model for style-sheet synthesis")
    .option("--job-id <id>", "Override job id")
    .option("--budget-seconds <n>", "Hard wall-clock budget", (v) => parseInt(v, 10))
    .option("--quiet", "Suppress progress events on stderr")
    .action(async (profileUrl: string, opts: {
      max?: number;
      niche?: string;
      reanalyzeFrom?: string;
      pullConcurrency?: number;
      summaryConcurrency?: number;
      summaryModel?: string;
      synthModel?: string;
      jobId?: string;
      budgetSeconds?: number;
      quiet?: boolean;
    }) => {
      try {
        const onEvent = opts.quiet
          ? undefined
          : (e: { kind: string; [k: string]: unknown }) => {
              process.stderr.write(`[${e.kind}] ${JSON.stringify(e)}\n`);
            };
        const result = await scrapeProfile({
          profileUrl,
          max: opts.max,
          niche: opts.niche,
          reanalyzeFrom: opts.reanalyzeFrom,
          pullConcurrency: opts.pullConcurrency,
          summaryConcurrency: opts.summaryConcurrency,
          summaryModel: opts.summaryModel,
          synthModel: opts.synthModel,
          jobId: opts.jobId,
          budgetSeconds: opts.budgetSeconds,
          onEvent,
        });
        ok(`Style sheet → ${result.reportPath}`);
        out({
          jobId: result.jobId,
          jobDir: result.jobDir,
          profileUrl: result.profileUrl,
          creatorHandle: result.creatorHandle,
          videosListed: result.videosListed,
          videosPulled: result.videosPulled,
          videosAnalyzed: result.videosAnalyzed,
          reportPath: result.reportPath,
          citationRate: Number(result.citationRate.toFixed(3)),
        });
      } catch (e) {
        err(`scrape-profile failed: ${(e as Error).message}`);
      }
    });

  return cmd;
}
