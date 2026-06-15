import { Command } from "commander";
import { out, ok, isPretty } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import {
  routeFailureLessons,
  NoLessonSourcesError,
  LESSON_ROUTES,
  type LessonProposal,
  type LessonRoute,
} from "../lib/lessons/router.js";

// `ralphy lessons` (#425) — the failure-lessons router. Generalizes the #113
// postmortem distiller: a wider INPUT set (postmortem + eval + deep-vision +
// repair-plan + council + gen-log error rows) and a wider ROUTE set (the 8-way
// LESSON_ROUTES enum). Only `memory` proposals stage into the memory `proposed/`
// tier (NOT auto-approve, exactly like distill); all other routes are
// REPORT-ONLY and need human action on guidelines/MODELS.md/templates/skills.

/** Group proposals by route for the report. */
function byRoute(proposals: LessonProposal[]): Record<string, LessonProposal[]> {
  const groups: Record<string, LessonProposal[]> = {};
  for (const r of LESSON_ROUTES) {
    const owned = proposals.filter((p) => p.route === r);
    if (owned.length) groups[r] = owned;
  }
  return groups;
}

export function lessonsCmd() {
  const cmd = new Command("lessons").description(
    "Route durable failure lessons (postmortem + eval + repair + council + gen-log) to the right knowledge surface",
  );

  cmd
    .command("route <project>")
    .description(
      "Classify a project's lessons into proposals (memory|guideline|MODELS.md|content-mode|template|skill|cli-issue|drop). Stages ONLY memory proposals into proposed/; every other route is report-only",
    )
    .option("--dry-run", "Print the proposals without staging anything (the default report mode)")
    .action(async (project: string, opts) => {
      let r;
      try {
        r = await routeFailureLessons({ projectId: project, dryRun: Boolean(opts.dryRun) });
      } catch (e) {
        if (e instanceof NoLessonSourcesError) {
          raiseError("E_NOT_FOUND", { kind: "Lesson sources", id: `${project} (${e.lookedIn})` });
        }
        throw e;
      }
      if (!r.dryRun && r.staged.length > 0) {
        ok(
          `Staged ${r.staged.length} memory proposal${r.staged.length === 1 ? "" : "s"} — review with \`ralphy memory list --proposed\` then \`ralphy memory approve <slug>\`. Other routes are report-only (no auto-write).`,
        );
      }
      const groups = byRoute(r.proposals);
      if (isPretty()) {
        const { c, section } = await import("../lib/ui.js");
        section(`Lessons route  ${c.muted(`(${r.project} · ${r.proposals.length} proposal${r.proposals.length === 1 ? "" : "s"}${r.dryRun ? " · dry-run" : ""})`)}`);
        for (const [route, items] of Object.entries(groups)) {
          console.log(`  ${c.bold(route)}`);
          for (const p of items) {
            const tags = [p.confidence, p.existingSlug ? `update ${p.existingSlug}` : ""].filter(Boolean).join(", ");
            console.log(`    - ${p.title}  ${c.muted(`(${tags})`)}`);
            if (p.provenance) console.log(`      ${c.muted(p.provenance)}`);
          }
        }
        console.log();
        return;
      }
      out({
        project: r.project,
        workspace: r.workspace,
        model: r.model,
        sources: r.sources,
        dry_run: r.dryRun,
        routes: groups as Record<LessonRoute, LessonProposal[]>,
        staged: r.staged,
      });
    })
    .addHelpText(
      "after",
      `
Examples:
  $ ralphy lessons route choose-path-001 --dry-run
  $ ralphy lessons route choose-path-001

Stages ONLY route=memory proposals into the memory proposed/ tier (review with
\`ralphy memory approve\`). Routes guideline | MODELS.md | content-mode | template |
skill | cli-issue | drop are REPORT-ONLY — they require human action, never auto-written.
`,
    );

  return cmd;
}
