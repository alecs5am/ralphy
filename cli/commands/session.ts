import { Command } from "commander";
import { resolveCommandContext } from "../lib/context.js";
import { raiseError } from "../lib/errors/index.js";
import { out } from "../lib/output.js";
import { ralphDir } from "../lib/paths.js";
import {
  endAgentSession,
  getAgentSession,
  listAgentSessions,
  startAgentSession,
} from "../lib/store/sessions.js";
import { type AgentSessionDto, StoreConflictError } from "../lib/store/types.js";

export function sessionCmd(): Command {
  const cmd = new Command("session").description("Manage immutable Agent Sessions");

  cmd
    .command("start")
    .description("Start a new Agent Session for the explicit scope")
    .option("--agent <label>", "Agent label", "codex")
    .action((opts, command: Command) => {
      const context = resolve(command);
      out(
        startAgentSession({
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          agent: opts.agent,
        }),
      );
    });

  cmd
    .command("show <id>")
    .description("Show an Agent Session")
    .action((id: string, _opts, command: Command) => {
      const context = resolve(command, id);
      const session = getAgentSession(id);
      assertVisible(context, session, "session show");
      out(session);
    });

  cmd
    .command("list")
    .description("List Agent Sessions in the explicit scope")
    .option("--cursor <cursor>", "Continue from a cursor")
    .option("--limit <count>", "Maximum rows", parseCount)
    .action((opts, command: Command) => {
      const context = resolve(command);
      out(
        listAgentSessions({
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          cursor: opts.cursor,
          limit: opts.limit,
        }),
      );
    });

  cmd
    .command("end <id>")
    .description("End an Agent Session with no active Run")
    .action((id: string, _opts, command: Command) => {
      const context = resolve(command, id);
      assertVisible(context, getAgentSession(id), "session end");
      try {
        out(endAgentSession(id));
      } catch (error) {
        if (error instanceof StoreConflictError) {
          raiseError("E_CONFLICT", { kind: "Agent Session", id });
        }
        throw error;
      }
    });

  return cmd;
}

function resolve(command: Command, targetSessionId?: string) {
  const opts = command.optsWithGlobals();
  return resolveCommandContext({
    dataRoot: ralphDir(),
    sessionId:
      opts.session ??
      (opts.workspace === undefined && opts.project === undefined
        ? targetSessionId
        : undefined),
    workspaceId: opts.workspace,
    projectId: opts.project,
    cwd: process.cwd(),
  });
}

function assertVisible(
  context: ReturnType<typeof resolveCommandContext>,
  session: AgentSessionDto,
  verb: string,
): void {
  if (
    context.workspaceId !== session.workspaceId ||
    (context.projectId !== undefined && context.projectId !== session.projectId)
  ) {
    raiseError("E_INPUT_INVALID", {
      field: "id",
      detail: "Agent Session is outside the command context",
      verb,
    });
  }
}

function parseCount(value: string): number {
  return Number.parseInt(value, 10);
}
