import { Command } from "commander";
import { resolveCommandContext } from "../lib/context.js";
import { raiseError } from "../lib/errors/index.js";
import { out } from "../lib/output.js";
import { ralphDir } from "../lib/paths.js";
import { publishPresentation } from "../lib/publication.js";
import type { QueryContext } from "../lib/store/scope-context.js";

/** Compatibility spelling for `publication publish`, using stable entity IDs. */
export function publishCmd(): Command {
  return new Command("publish")
    .description("Submit one immutable Unit Presentation through Postiz")
    .argument("<presentation-id>", "Unit Presentation ID")
    .requiredOption("--account <id>", "Social Account ID")
    .requiredOption("--key <key>", "Stable idempotency key")
    .option("--at <iso>", "Scheduled UTC instant")
    .option("--revised-from <id>", "Earlier Publication lineage ID")
    .action(async (presentationId: string, opts, command: Command) => {
      const context = resolve(command);
      out(await publishPresentation({
        context,
        presentationId,
        socialAccountId: opts.account,
        idempotencyKey: opts.key,
        rail: "postiz",
        scheduledAt: opts.at ? timestamp(opts.at) : null,
        revisedFromPublicationId: opts.revisedFrom,
      }));
    });
}

function resolve(command: Command): QueryContext {
  const opts = command.optsWithGlobals();
  const context = resolveCommandContext({
    dataRoot: ralphDir(),
    sessionId: opts.session,
    workspaceId: opts.workspace,
    projectId: opts.project,
    cwd: process.cwd(),
  });
  return context.kind === "session"
    ? { sessionId: context.sessionId }
    : {
        workspaceId: context.workspaceId,
        ...(context.projectId ? { projectId: context.projectId } : {}),
      };
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    raiseError("E_INPUT_INVALID", { field: "at", detail: "expected an ISO datetime" });
  }
  return parsed;
}
