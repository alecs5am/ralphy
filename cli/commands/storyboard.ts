// `ralphy storyboard` (#570) — review the storyboard before paid AI generation.
//
//   show <project>                     the per-scene review sheet (JSON; a table on a TTY)
//   approve <project> --scene <id>…    approve scenes (or --all), optional --comment
//   reject <project> --scene <id>…     reject scenes (or --all), optional --comment
//   comment <project> --scene <id>…    comment without deciding
//   html <project>                     write a self-contained HTML gallery (append-only)
//
// Decisions append a revision to the Project's `storyboard` Document and are
// logged to the user-prompt log; `ralphy generate image|video` refuses scene
// slots whose scene is not approved (see cli/lib/storyboard/gate.ts).

import { Command } from "commander";
import { getCommandContext } from "../lib/context-state.js";
import { raiseError } from "../lib/errors/index.js";
import { isPretty, ok, out } from "../lib/output.js";
import {
  renderStoryboardHtml,
  requireStoryboardProject,
  reviewStoryboard,
  showStoryboard,
  StoryboardReviewError,
  writeStoryboardHtml,
  type StoryboardReviewAction,
  type StoryboardView,
} from "../lib/storyboard/index.js";

export function storyboardCmd(): Command {
  const cmd = new Command("storyboard").description(
    "Review the per-scene storyboard (frame, VO, duration, camera, model, estimated cost) and approve it before paid AI image/video generation (#570).",
  );

  cmd
    .command("show <project>")
    .description("Show the storyboard: per scene the frame, VO line, duration, camera note, models, estimated cost and approval state (pending | approved | rejected | stale). Reads only.")
    .action((project: string) => {
      const view = showStoryboard(resolveProject(project, "storyboard show"));
      out(isPretty() ? prettyView(view) : view);
    });

  for (const action of ["approve", "reject", "comment"] as const) {
    cmd
      .command(`${action} <project>`)
      .description(describe(action))
      .option("--scene <id...>", "Scene id(s), e.g. scene-01 (repeatable)")
      .option("--all", action === "approve" ? "Approve every scene (approve-all)" : `Apply to every scene`)
      .option("--comment <text>", action === "comment" ? "The comment (required)" : "Optional note recorded with the decision")
      .action(async (project: string, opts: { scene?: string[]; all?: boolean; comment?: string }) => {
        await review(project, action, opts);
      });
  }

  cmd
    .command("html <project>")
    .description("Write a self-contained HTML storyboard gallery (frames inlined) to <project>/storyboard/storyboard[.vN].html. Append-only: every run writes a new file version, never overwrites.")
    .action((project: string) => {
      const resolved = resolveProject(project, "storyboard html");
      const view = showStoryboard(resolved);
      const written = writeStoryboardHtml(resolved.dir, renderStoryboardHtml(view));
      ok(`Storyboard gallery written: ${written.path}`);
      out({
        project: view.project.slug,
        path: written.path,
        version: written.version,
        scenes: view.totals.scenes,
        approved: view.totals.approved,
        pending: view.totals.pending,
        rejected: view.totals.rejected,
        stale: view.totals.stale,
      });
    });

  return cmd;
}

function describe(action: StoryboardReviewAction): string {
  if (action === "approve") {
    return "Approve storyboard scene(s) — or --all — on their current content. Unlocks paid image/video generation for those scenes; logged to user-prompts.jsonl (stage storyboard-approval).";
  }
  if (action === "reject") {
    return "Reject storyboard scene(s) — or --all — with an optional --comment. Paid generation for rejected scenes stays refused; logged to user-prompts.jsonl (stage storyboard-rejection).";
  }
  return "Comment on storyboard scene(s) without changing their approval state; logged to user-prompts.jsonl (stage storyboard-comment).";
}

async function review(
  project: string,
  action: StoryboardReviewAction,
  opts: { scene?: string[]; all?: boolean; comment?: string },
): Promise<void> {
  const verb = `storyboard ${action}`;
  if (!opts.all && (!opts.scene || opts.scene.length === 0)) {
    raiseError("E_INPUT_INVALID", {
      field: "scene",
      detail: `pass --scene <id> (repeatable) or --all; example: ralphy ${verb} ${project} --scene scene-01`,
      verb,
    });
  }
  if (opts.all && opts.scene?.length) {
    raiseError("E_INPUT_INVALID", { field: "scene", detail: "pass --scene or --all, not both", verb });
  }
  if (action === "comment" && !opts.comment?.trim()) {
    raiseError("E_INPUT_INVALID", { field: "comment", detail: "--comment <text> is required", verb });
  }
  const resolved = resolveProject(project, verb);
  const context = getCommandContext();
  try {
    const result = await reviewStoryboard(resolved, {
      action,
      scenes: opts.scene,
      all: opts.all,
      comment: opts.comment ?? null,
      source: "cli",
      authoredBySessionId: context?.kind === "session" ? context.sessionId : null,
    });
    ok(`${action} recorded for ${result.touched.join(", ")}`);
    out(isPretty()
      ? { ...prettyView(result.storyboard), touched: result.touched, revisionId: result.revisionId }
      : { touched: result.touched, revisionId: result.revisionId, storyboard: result.storyboard });
  } catch (error) {
    if (!(error instanceof StoryboardReviewError)) throw error;
    raiseError("E_INPUT_INVALID", { field: "scene", detail: error.message, verb });
  }
}

function resolveProject(project: string, verb: string) {
  try {
    return requireStoryboardProject(project);
  } catch {
    raiseError("E_NOT_FOUND", { kind: "Project", id: project, verb });
  }
}

/** The pretty-mode shape: header facts plus one table row per scene. */
function prettyView(view: StoryboardView) {
  return {
    project: view.project.slug,
    aiProduction: view.aiProduction,
    reason: view.aiProductionReason,
    scenes: view.totals.scenes,
    approved: view.totals.approved,
    pending: view.totals.pending,
    rejected: view.totals.rejected,
    stale: view.totals.stale,
    approvedAll: view.approvedAll,
    estimatedCostUsd: view.totals.estimatedCostUsd,
    sheet: view.scenes.map((scene) => ({
      scene: scene.id,
      state: scene.state,
      seconds: scene.durationSec,
      vo: scene.vo,
      camera: scene.camera,
      model: [scene.models.image, scene.models.video].filter(Boolean).join(" + "),
      costUsd: scene.estimatedCostUsd,
      frame: scene.frame?.slot ?? null,
    })),
  };
}
