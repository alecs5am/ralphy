// `ralphy analytics` (#507) — the performance feedback loop's agent-facing
// door. Two verbs:
//   • `pull <project> [unit-slug]` — fetch per-post metrics for the project's
//     published units (youtube target → the youtube-analytics connector;
//     everything else → the Postiz analytics passthrough) and APPEND a
//     timestamped snapshot line to each unit's `analytics.jsonl`. Every run
//     appends a new snapshot — that is the design (deltas between snapshots
//     feed the postmortem); nothing is ever rewritten.
//   • `postmortem <project>` — one bounded callLLM() pass over the batch's
//     snapshots + unit metadata → evidence-grounded findings written to
//     `<project>/postmortem/analytics-findings.json` (.vN versioned) and
//     staged as WORKSPACE-tier memory proposals (promote via
//     `ralphy memory approve`).
// The farm door is the `analytics-pull` node executor
// (cli/lib/workflow/executors/analytics.ts) — both run through
// cli/lib/analytics/.

import { Command } from "commander";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { postizAvailable } from "../lib/providers/postiz.js";
import { youtubeAnalyticsAvailable } from "../lib/providers/youtube-analytics.js";
import { pullProjectAnalytics, listUnitSlugs } from "../lib/analytics/pull.js";
import { runAnalyticsPostmortem, NoAnalyticsError } from "../lib/analytics/postmortem.js";
import { readUnitManifest, unitDirFor } from "../lib/publish/publish.js";

export function analyticsCmd() {
  const cmd = new Command("analytics").description(
    "Per-post performance metrics for published units (#507): append-only analytics.jsonl snapshots + an evidence-grounded performance postmortem. Example: ralphy analytics pull spring-2026-001",
  );

  cmd
    .command("pull")
    .description(
      "Fetch per-post metrics for the project's published units and append snapshots to each unit's analytics.jsonl (append-only; every run adds a new timestamped snapshot). Example: ralphy analytics pull spring-2026-001 hero-cut --target youtube",
    )
    .argument("<project>", "Project id")
    .argument("[unit-slug]", "One unit under <project>/units/ (default: every unit)")
    .option("--target <t>", "Restrict to one target platform (youtube | tiktok | instagram | x)")
    .option("--days <n>", "Postiz analytics lookback window in days", "7")
    .action(async (project: string, slug: string | undefined, opts) => {
      if (!youtubeAnalyticsAvailable() && !postizAvailable()) {
        raiseError("E_ENV_KEY_MISSING", {
          key: "YOUTUBE_API_KEY (or POSTIZ_API_KEY + POSTIZ_BASE_URL)",
        });
      }
      if (slug && !(await readUnitManifest(unitDirFor(project, slug)))) {
        raiseError("E_NOT_FOUND", { kind: "Unit", id: `${project}/${slug}` });
      }
      if (!slug && listUnitSlugs(project).length === 0) {
        raiseError("E_NOT_FOUND", { kind: "Units", id: project });
      }

      const days = Number(opts.days);
      const result = await pullProjectAnalytics({
        projectId: project,
        slug,
        target: opts.target,
        days: Number.isFinite(days) && days > 0 ? days : 7,
      });
      ok(
        `Pulled ${result.fetched} snapshot(s) across ${result.units.length} unit(s)` +
          (result.skipped ? ` (${result.skipped} skipped)` : ""),
      );
      out({
        project: result.project,
        fetched: result.fetched,
        skipped: result.skipped,
        units: result.units.map((u) => ({
          slug: u.slug,
          appended: u.appended,
          analyticsPath: u.analyticsPath,
          records: u.records,
        })),
      });
    });

  cmd
    .command("postmortem")
    .description(
      "Distill the project's analytics snapshots + unit metadata into evidence-grounded findings (bounded LLM pass): writes postmortem/analytics-findings.json (.vN versioned) and stages workspace-tier memory proposals. Example: ralphy analytics postmortem spring-2026-001 --dry-run",
    )
    .argument("<project>", "Project id")
    .option("--dry-run", "Print findings without writing the file or staging memory proposals")
    .action(async (project: string, opts) => {
      try {
        const r = await runAnalyticsPostmortem({ projectId: project, dryRun: Boolean(opts.dryRun) });
        ok(
          r.dryRun
            ? `Distilled ${r.findings.length} finding(s) (dry-run — nothing written)`
            : `Distilled ${r.findings.length} finding(s) → ${r.findingsPath}; staged ${r.staged.length} workspace memory proposal(s) — review with \`ralphy memory list --workspace ${r.workspace} --proposed\` then \`ralphy memory approve <slug>\``,
        );
        out({
          project: r.project,
          workspace: r.workspace,
          model: r.model,
          units: r.units,
          findings: r.findings,
          dropped: r.dropped,
          findingsPath: r.findingsPath,
          staged: r.staged,
          dryRun: r.dryRun,
        });
      } catch (e) {
        if (e instanceof NoAnalyticsError) {
          raiseError("E_NOT_FOUND", { kind: "Analytics snapshots", id: project });
        }
        throw e;
      }
    });

  return cmd;
}
