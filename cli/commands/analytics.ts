import { Command } from "commander";
import {
  queryPublicationPerformance,
  queryPublicationPostmortem,
} from "../lib/analytics/query.js";
import { resolveCommandContext } from "../lib/context.js";
import { raiseError } from "../lib/errors/index.js";
import { out } from "../lib/output.js";
import { ralphDir } from "../lib/paths.js";
import type { QueryContext } from "../lib/store/scope-context.js";
import { getMetricTotals, listMetricSnapshots } from "../lib/store/units.js";
import {
  extractFromScreenshots,
  importAnalytics,
  isImportPlatform,
  readImportData,
} from "../lib/analytics/import.js";
import { DEFAULT_REPORT_OPTIONS, loadOutcomeReport } from "../lib/analytics/report.js";
import { importComments, isCommentPlatform, readCommentsData } from "../lib/analytics/comment-import.js";
import { DEFAULT_COMMENT_REPORT_OPTIONS, DEFAULT_COMMENT_SIGNAL_MIN_N, loadCommentReport } from "../lib/analytics/comment-report.js";
import { DEFAULT_YTDLP_MAX_COMMENTS } from "../lib/analytics/comment-ytdlp.js";
import { isOutcomeMetric, OUTCOME_METRICS } from "../lib/analytics/outcomes.js";
import { trendCohortProvider } from "../lib/trends/cohort-provider.js";
import { currentCurves } from "../lib/trends/ingest.js";

export function analyticsCmd(): Command {
  const command = new Command("analytics").description(
    "Query Publication metric snapshots, import screenshot analytics and post comments, and report outcomes per decision",
  );

  command
    .command("list <publication-id>")
    .option("--source <source>", "Restrict provider source")
    .option("--as-of <iso>", "Include observations at or before this instant")
    .option("--window-start <iso>", "Exact window start")
    .option("--window-end <iso>", "Exact window end")
    .option("--cursor <cursor>", "Continue from an opaque cursor")
    .option("--limit <count>", "Maximum rows", Number, 50)
    .action((publicationId: string, opts, child: Command) => {
      out(listMetricSnapshots({
        context: context(child),
        publicationId,
        ...filters(opts),
        after: opts.cursor,
        limit: opts.limit,
      }));
    });

  command
    .command("totals")
    .requiredOption("--publications <json>", "One to 100 distinct Publication IDs")
    .option("--source <source>", "Restrict provider source")
    .option("--as-of <iso>", "Include observations at or before this instant")
    .option("--window-start <iso>", "Exact window start")
    .option("--window-end <iso>", "Exact window end")
    .action((opts, child: Command) => {
      out(getMetricTotals({
        context: context(child),
        publicationIds: publicationIds(opts.publications),
        ...filters(opts),
      }));
    });

  for (const name of ["roi", "postmortem"] as const) {
    command
      .command(name)
      .description(
        name === "roi"
          ? "Return filter-first newest-per-Publication performance facts"
          : "Return an evidence digest without scanning Unit files",
      )
      .requiredOption("--publications <json>", "One to 100 distinct Publication IDs")
      .option("--source <source>", "Restrict provider source")
      .option("--as-of <iso>", "Include observations at or before this instant")
      .option("--window-start <iso>", "Exact window start")
      .option("--window-end <iso>", "Exact window end")
      .action((opts, child: Command) => {
        const query = {
            context: context(child),
            publicationIds: publicationIds(opts.publications),
            ...filters(opts),
        };
        out({
          kind: name,
          ...(name === "roi"
            ? queryPublicationPerformance(query)
            : queryPublicationPostmortem(query)),
        });
      });
  }

  // ── import (#558) ─────────────────────────────────────────────────────────
  // Free first: the agent reads the analytics screenshot with its own vision,
  // fills the JSON, previews (the default), then re-runs with --yes.
  command
    .command("import <unit-or-project>")
    .description(
      "Import platform analytics the agent read off a screenshot (TikTok Studio / Instagram Insights / YouTube Studio) as a Metric Snapshot. Previews the parsed numbers and planned writes unless --yes; --extract pre-fills the JSON with one callLLM() vision pass (off by default).",
    )
    .requiredOption("--platform <platform>", "tiktok | instagram | youtube")
    .option("--data <json-or-file>", "Metrics JSON (inline or a file path): views, likes, comments, shares, saves, follows, reach, avgWatchTimeSec, avgWatchPct, completionPct, retention [{t, pct}], capturedAt, postedAt")
    .option("--screenshot <files...>", "Source screenshot image(s); copied into the store as provenance")
    .option("--extract", "Pre-fill the metrics from the screenshots through one vision call (still needs --yes to write)")
    .option("--source <slug>", "Metric source slug (default: screenshot with screenshots attached, else manual)")
    .option("--from <dir>", "Project working directory used to derive the decision ledger")
    .option("--dry-run", "Preview only — print the parsed numbers and the writes it would make (the default)")
    .option("--yes", "Write the snapshot after the numbers were confirmed with the owner")
    .action(async (ref: string, opts, child: Command) => {
      if (!isImportPlatform(opts.platform)) {
        raiseError("E_FLAG_UNKNOWN", { flag: "platform", value: opts.platform, allowed: "tiktok, instagram, youtube" });
      }
      if (opts.yes && opts.dryRun) {
        raiseError("E_INPUT_INVALID", { field: "yes", detail: "--yes and --dry-run are mutually exclusive" });
      }
      const screenshots: string[] = opts.screenshot ?? [];
      let data: Record<string, unknown> = {};
      if (opts.extract) {
        data = await extractFromScreenshots({ platform: opts.platform, screenshots });
      }
      if (opts.data) {
        const given = readImportData(opts.data);
        if (!given || typeof given !== "object" || Array.isArray(given)) {
          raiseError("E_INPUT_INVALID", { field: "data", detail: "expected a JSON object" });
        }
        // Agent-read values win over the vision pre-fill.
        data = { ...data, ...(given as Record<string, unknown>) };
      }
      if (!opts.data && !opts.extract) {
        raiseError("E_INPUT_INVALID", { field: "data", detail: "pass --data <json-or-file> (or --extract with --screenshot)" });
      }
      out(await importAnalytics({
        context: context(child),
        ref,
        platform: opts.platform,
        data,
        screenshots,
        ...(opts.source ? { source: opts.source } : {}),
        extractedBy: opts.extract ? "vision-extract" : "agent",
        write: Boolean(opts.yes),
        ...(opts.from ? { fromDir: opts.from } : {}),
      }));
    });

  // ── comments (#582) ───────────────────────────────────────────────────────
  // Comments on our own posts: the agent reads comment screenshots with its
  // own vision (or the owner pastes text, or yt-dlp pulls our own YouTube
  // video's comments for free), previews, then re-runs with --yes. Nothing is
  // ever posted or replied to.
  const comments = command
    .command("comments")
    .description("Import and analyze the comments on our own posts: classes, moments mapped to scenario beats, and iteration proposals with evidence");

  comments
    .command("import <unit-or-project>")
    .description(
      "Import comments for a Unit from agent-read screenshot JSON, pasted text (one comment per line), or --from-ytdlp for our own YouTube video. Classifies with deterministic rules (agent labels win; --llm labels the rest on --yes). Previews unless --yes; nothing is posted or replied to.",
    )
    .requiredOption("--platform <platform>", "tiktok | instagram | youtube")
    .option("--data <json-file-or-text>", "Comments JSON (an array, or {capturedAt, postUrl, comments: [{text, author, likes, postedAt, replyTo, labels, timestamps}]}), a JSON file, or pasted text")
    .option("--screenshot <files...>", "Source screenshot image(s); copied into the store as provenance")
    .option("--from-ytdlp <video-url>", "Pull the comments of OUR OWN YouTube video with yt-dlp (free; one video URL, passed explicitly)")
    .option("--max-comments <count>", "Comment cap for --from-ytdlp", String(DEFAULT_YTDLP_MAX_COMMENTS))
    .option("--llm", "Label the comments the rules left unlabeled with one cheap callLLM() pass per 100 (runs on --yes only)")
    .option("--dry-run", "Preview only: parsed comments, labels, moments, and the merge plan (the default)")
    .option("--yes", "Store the comments after the owner confirmed the preview")
    .action(async (ref: string, opts, child: Command) => {
      if (!isCommentPlatform(opts.platform)) {
        raiseError("E_FLAG_UNKNOWN", { flag: "platform", value: opts.platform, allowed: "tiktok, instagram, youtube" });
      }
      if (opts.yes && opts.dryRun) {
        raiseError("E_INPUT_INVALID", { field: "yes", detail: "--yes and --dry-run are mutually exclusive" });
      }
      if (!opts.data && !opts.fromYtdlp) {
        raiseError("E_INPUT_INVALID", { field: "data", detail: "pass --data <json|file|pasted text> or --from-ytdlp <our youtube video url>" });
      }
      const read = typeof opts.data === "string" ? readCommentsData(opts.data) : null;
      out(await importComments({
        context: context(child),
        ref,
        platform: opts.platform,
        ...(read ? { data: read.data, dataFormat: read.format } : {}),
        screenshots: opts.screenshot ?? [],
        ...(typeof opts.fromYtdlp === "string"
          ? { ytdlp: { url: opts.fromYtdlp, maxComments: positiveInt(opts.maxComments, "max-comments") } }
          : {}),
        llm: Boolean(opts.llm),
        write: Boolean(opts.yes),
      }));
    });

  comments
    .command("report <unit-or-project>")
    .description(
      "Comment report for one Unit: counts and top comments per class, a beat-level map of the moments viewers name (joined to the imported retention curve), and iteration proposals (next videos from demand, beat fixes, hook / packaging / delivery changes), each with comment ids and counts. Read-only.",
    )
    .option("--min-n <count>", "Distinct commenters a pattern needs before it becomes a proposal", String(DEFAULT_COMMENT_REPORT_OPTIONS.minN))
    .option("--top <count>", "Comments listed per class", String(DEFAULT_COMMENT_REPORT_OPTIONS.top))
    .option("--platform <platform>", "Restrict to one platform's comments")
    .option("--from <dir>", "Project working directory holding scenario.json (beats)")
    .action((ref: string, opts, child: Command) => {
      if (opts.platform !== undefined && !isCommentPlatform(opts.platform)) {
        raiseError("E_FLAG_UNKNOWN", { flag: "platform", value: opts.platform, allowed: "tiktok, instagram, youtube" });
      }
      out(loadCommentReport(
        context(child),
        ref,
        {
          minN: positiveInt(opts.minN, "min-n"),
          top: positiveInt(opts.top, "top"),
          ...(typeof opts.platform === "string" ? { platform: opts.platform } : {}),
        },
        typeof opts.from === "string" ? opts.from : undefined,
      ));
    });

  // ── report (#558) ─────────────────────────────────────────────────────────
  command
    .command("report")
    .description(
      "Outcome report for the --workspace tree (or one --project): hit rate against the workspace's own rolling median, per-platform baselines, and the decision-vs-outcome table (n, median outcome, lift) with a minimum-n rule that prints \"insufficient data\" instead of a claim.",
    )
    .option("--metric <metric>", `Target metric: ${OUTCOME_METRICS.join(" | ")}`, DEFAULT_REPORT_OPTIONS.metric)
    .option("--min-n <count>", "Minimum observations before a decision value gets a claim", String(DEFAULT_REPORT_OPTIONS.minN))
    .option("--window <count>", "Rolling baseline window (posts per platform)", String(DEFAULT_REPORT_OPTIONS.window))
    .option("--min-prior <count>", "Earlier posts needed before a hit can be judged", String(DEFAULT_REPORT_OPTIONS.minPrior))
    .option("--lift-threshold <ratio>", "Lift at or beyond this reads as over / under", String(DEFAULT_REPORT_OPTIONS.liftThreshold))
    .option("--hit-threshold <value>", "Absolute target on the metric instead of the rolling median")
    .option("--platform <platform>", "Restrict to one platform")
    .option("--no-derive", "Use stored decision ledgers only (skip on-the-fly derivation)")
    .option("--cohort-workspace <id>", "Trend corpus Workspace (#556) whose creator-listed videos supply cohort baselines")
    .option("--cohort-niche <niche...>", "Restrict cohort baselines to these corpus niches (e.g. ai-tools tech-tips)")
    .option("--comments-min-n <count>", "Analyzed comments a unit + platform needs before its comment signals show (#582)", String(DEFAULT_COMMENT_SIGNAL_MIN_N))
    .action((opts, child: Command) => {
      if (!isOutcomeMetric(opts.metric)) {
        raiseError("E_FLAG_UNKNOWN", { flag: "metric", value: opts.metric, allowed: OUTCOME_METRICS.join(", ") });
      }
      const query = context(child);
      const scope = scopeOf(child);
      out(loadOutcomeReport(query, {
        metric: opts.metric,
        minN: positiveInt(opts.minN, "min-n"),
        window: positiveInt(opts.window, "window"),
        minPrior: positiveInt(opts.minPrior, "min-prior"),
        liftThreshold: nonNegative(opts.liftThreshold, "lift-threshold"),
        ...(opts.hitThreshold !== undefined ? { hitThreshold: nonNegative(opts.hitThreshold, "hit-threshold") } : {}),
        ...(typeof opts.platform === "string" ? { platform: opts.platform } : {}),
        deriveMissing: opts.derive !== false,
        commentMinN: positiveInt(opts.commentsMinN, "comments-min-n"),
        ...(typeof opts.cohortWorkspace === "string"
          ? {
              cohort: trendCohortProvider({
                workspaceId: opts.cohortWorkspace,
                ...(Array.isArray(opts.cohortNiche) ? { niches: (opts.cohortNiche as string[]).flatMap((value) => value.split(",")).filter(Boolean) } : {}),
                curves: currentCurves(opts.cohortWorkspace),
              }),
            }
          : {}),
      }, scope));
    });

  return command;
}

function scopeOf(command: Command): { workspaceId: string; projectId: string | null } {
  const resolved = resolvedContext(command);
  return { workspaceId: resolved.workspaceId, projectId: resolved.projectId ?? null };
}

function positiveInt(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    raiseError("E_INPUT_INVALID", { field, detail: "expected a positive whole number" });
  }
  return parsed;
}

function nonNegative(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    raiseError("E_INPUT_INVALID", { field, detail: "expected a non-negative number" });
  }
  return parsed;
}

function resolvedContext(command: Command) {
  const opts = command.optsWithGlobals();
  return resolveCommandContext({
    dataRoot: ralphDir(),
    sessionId: opts.session,
    workspaceId: opts.workspace,
    projectId: opts.project,
    cwd: process.cwd(),
  });
}

function context(command: Command): QueryContext {
  const resolved = resolvedContext(command);
  return resolved.kind === "session"
    ? { sessionId: resolved.sessionId }
    : {
        workspaceId: resolved.workspaceId,
        ...(resolved.projectId ? { projectId: resolved.projectId } : {}),
      };
}

function publicationIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.some((id) => typeof id !== "string")
    ) throw new Error();
    return parsed;
  } catch {
    raiseError("E_INPUT_INVALID", {
      field: "publications",
      detail: "expected a JSON array of Publication IDs",
    });
  }
}

function filters(opts: Record<string, unknown>) {
  if (Boolean(opts.windowStart) !== Boolean(opts.windowEnd)) {
    raiseError("E_INPUT_INVALID", {
      field: "window",
      detail: "window-start and window-end must be provided together",
    });
  }
  return {
    ...(typeof opts.source === "string" ? { source: opts.source } : {}),
    ...(typeof opts.asOf === "string" ? { asOf: timestamp(opts.asOf, "as-of") } : {}),
    ...(typeof opts.windowStart === "string" && typeof opts.windowEnd === "string"
      ? {
          windowStart: timestamp(opts.windowStart, "window-start"),
          windowEnd: timestamp(opts.windowEnd, "window-end"),
        }
      : {}),
  };
}

function timestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    raiseError("E_INPUT_INVALID", { field, detail: "expected an ISO datetime" });
  }
  return parsed;
}
