import { Command } from "commander";
import { resolveCommandContext } from "../lib/context.js";
import { out } from "../lib/output.js";
import { ralphDir } from "../lib/paths.js";
import { listActivity } from "../lib/store/activity.js";

export function activityCmd(): Command {
  const cmd = new Command("activity").description("Read the monotonic activity feed");

  cmd
    .command("list")
    .description("List activity after an exclusive sequence")
    .option("--workspace <id>", "Workspace ID")
    .option("--project <id>", "Project ID")
    .requiredOption("--since <event-id>", "Exclusive event sequence", parseSequence)
    .option("--limit <count>", "Maximum rows", parseCount, 50)
    .action((opts, command: Command) => {
      const globals = command.optsWithGlobals();
      const context = resolveCommandContext({
        dataRoot: ralphDir(),
        sessionId: globals.session,
        workspaceId: globals.workspace,
        projectId: opts.project ?? globals.project,
        cwd: process.cwd(),
      });
      out(
        listActivity({
          context:
            context.kind === "session"
              ? { sessionId: context.sessionId }
              : {
                  workspaceId: context.workspaceId,
                  ...(context.projectId ? { projectId: context.projectId } : {}),
                },
          afterSequence: opts.since,
          limit: opts.limit,
        }),
      );
    });

  return cmd;
}

function parseSequence(value: string): number {
  const sequence = Number(value);
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new Error("Expected a non-negative event sequence");
  }
  return sequence;
}

function parseCount(value: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error("Expected a positive integer");
  }
  return count;
}
