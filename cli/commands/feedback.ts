import { Command } from "commander";
import { resolveCommandContext } from "../lib/context.js";
import { out } from "../lib/output.js";
import { ralphDir } from "../lib/paths.js";
import { getArtifactRevision } from "../lib/store/artifacts.js";
import { getBuild, getBuildOutput, getCompositionRevision } from "../lib/store/compositions.js";
import { getDocumentRevision } from "../lib/store/documents.js";
import type { QueryContext } from "../lib/store/scope-context.js";
import {
  addFeedback,
  getFeedback,
  getIteration,
  listFeedback,
  resolveFeedback,
} from "../lib/store/scopes.js";
import type { FeedbackTargetType } from "../lib/store/types.js";
import { getUnitItem, getUnitPresentation } from "../lib/store/units.js";

export function feedbackCmd(): Command {
  const cmd = new Command("feedback").description("Manage Iteration feedback");

  cmd
    .command("add")
    .description("Add feedback to an Iteration")
    .requiredOption("--iteration <id>", "Iteration ID")
    .requiredOption("--body <text>", "Feedback body")
    .option("--target-type <type>", "Target entity type")
    .option("--target <id>", "Target entity ID")
    .option("--timecode <milliseconds>", "Non-negative timecode", parseNonNegative)
    .action((opts, command: Command) => {
      const context = resolve(command);
      getIteration({
        context: queryContext(context),
        iterationId: opts.iteration,
      });
      if ((opts.targetType === undefined) !== (opts.target === undefined)) {
        throw new Error("--target-type and --target are required together");
      }
      if (opts.target !== undefined) {
        authorizeFeedbackTarget(
          queryContext(context),
          opts.targetType as FeedbackTargetType,
          opts.target,
        );
      }
      out(
        addFeedback({
          iterationId: opts.iteration,
          body: opts.body,
          timecodeMs: opts.timecode,
          ...(opts.target
            ? {
                targetType: opts.targetType as FeedbackTargetType,
                targetId: opts.target,
              }
            : {}),
        }),
      );
    });

  cmd
    .command("list")
    .description("List Project feedback")
    .requiredOption("--project <id>", "Project ID")
    .option("--cursor <cursor>", "Continue from an opaque cursor")
    .option("--limit <count>", "Maximum rows", parseCount)
    .action((opts, command: Command) => {
      const context = resolve(command, opts.project);
      out(
        listFeedback({
          context: queryContext(context),
          projectId: opts.project,
          after: opts.cursor,
          limit: opts.limit ?? 50,
        }),
      );
    });

  cmd
    .command("resolve <id>")
    .description("Resolve feedback")
    .option("--note <text>", "Resolution note")
    .action((id: string, opts, command: Command) => {
      const context = resolve(command);
      getFeedback({ context: queryContext(context), feedbackId: id });
      out(resolveFeedback(id, { note: opts.note }));
    });

  return cmd;
}

function authorizeFeedbackTarget(
  context: QueryContext,
  type: FeedbackTargetType,
  id: string,
): void {
  switch (type) {
    case "document_revision":
      getDocumentRevision({ context, revisionId: id });
      return;
    case "artifact_revision":
      getArtifactRevision({ context, revisionId: id });
      return;
    case "composition_revision":
      getCompositionRevision({ context, revisionId: id });
      return;
    case "build":
      getBuild({ context, buildId: id });
      return;
    case "build_output":
      getBuildOutput({ context, outputId: id });
      return;
    case "unit_item":
      getUnitItem({ context, itemId: id });
      return;
    case "unit_presentation":
      getUnitPresentation({ context, presentationId: id });
      return;
    default:
      throw new Error(`Unknown feedback target type: ${String(type)}`);
  }
}

function resolve(command: Command, projectId?: string) {
  const opts = command.optsWithGlobals();
  return resolveCommandContext({
    dataRoot: ralphDir(),
    sessionId: opts.session,
    workspaceId: opts.workspace,
    projectId,
    cwd: process.cwd(),
  });
}

function queryContext(context: ReturnType<typeof resolveCommandContext>) {
  return context.kind === "session"
    ? { sessionId: context.sessionId }
    : {
        workspaceId: context.workspaceId,
        ...(context.projectId ? { projectId: context.projectId } : {}),
      };
}

function parseNonNegative(value: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error("Expected a non-negative integer");
  }
  return number;
}

function parseCount(value: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error("Expected a positive integer");
  }
  return count;
}
