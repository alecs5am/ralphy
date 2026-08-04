import { Command } from "commander";
import { resolveCommandContext } from "../lib/context.js";
import { raiseError } from "../lib/errors/index.js";
import { out } from "../lib/output.js";
import { ralphDir } from "../lib/paths.js";
import {
  addArtifactRevision,
  addArtifactUsage,
  artifactMutationContext,
  createArtifact,
  getArtifact,
  getArtifactRevision,
  listArtifactRevisions,
  listArtifacts,
  listArtifactUsages,
  selectArtifactRevision,
  setArtifactRevisionState,
} from "../lib/store/artifacts.js";
import { getFeedback, getProject } from "../lib/store/scopes.js";
import {
  StoreConflictError,
  type ArtifactKind,
  type ArtifactRevisionState,
} from "../lib/store/types.js";

const STATES = new Set<ArtifactRevisionState>([
  "working",
  "candidate",
  "approved",
  "rejected",
  "superseded",
  "archived",
]);

export function artifactCmd(): Command {
  const cmd = new Command("artifact").description("Manage immutable Artifacts");

  cmd
    .command("create")
    .description("Create a workspace- or Project-scoped Artifact")
    .option("--workspace <id>", "Workspace ID")
    .option("--project <id>", "Project ID")
    .requiredOption("--slug <slug>", "Artifact slug")
    .requiredOption("--kind <kind>", "Artifact kind")
    .action((opts, command: Command) => {
      const context = resolve(command, opts.project);
      const shared = { slug: opts.slug, kind: opts.kind as ArtifactKind };
      out(
        context.projectId
          ? createArtifact({ projectId: context.projectId, ...shared })
          : createArtifact({ workspaceId: context.workspaceId, ...shared }),
      );
    });

  cmd
    .command("list")
    .description("List Artifacts in the explicit scope")
    .option("--workspace <id>", "Workspace ID")
    .option("--project <id>", "Project ID")
    .option("--cursor <cursor>", "Continue from an opaque cursor")
    .option("--limit <count>", "Maximum rows", parseCount)
    .action((opts, command: Command) => {
      const context = resolve(command, opts.project);
      out(
        listArtifacts({
          context: queryContext(context),
          after: opts.cursor,
          limit: opts.limit ?? 50,
        }),
      );
    });

  cmd
    .command("show <id>")
    .description("Show safe Artifact metadata")
    .option("--workspace <id>", "Workspace ID")
    .option("--project <id>", "Project ID")
    .action((id: string, opts, command: Command) => {
      const context = resolve(command, opts.project);
      out(getArtifact({ context: queryContext(context), artifactId: id }));
    });

  cmd
    .command("revisions <id>")
    .description("List immutable Artifact Revisions")
    .option("--workspace <id>", "Workspace ID")
    .option("--project <id>", "Project ID")
    .option("--cursor <cursor>", "Continue from an opaque cursor")
    .option("--limit <count>", "Maximum rows", parseCount)
    .action((id: string, opts, command: Command) => {
      const context = resolve(command, opts.project);
      out(
        listArtifactRevisions({
          context: queryContext(context),
          artifactId: id,
          after: opts.cursor,
          limit: opts.limit ?? 50,
        }),
      );
    });

  cmd
    .command("revise <id>")
    .description("Append an Artifact Revision using an existing Object")
    .requiredOption("--object <id>", "Object ID")
    .requiredOption("--expected <revision-id>", "Expected parent Revision ID or none")
    .option("--state <state>", "Initial Revision state", "working")
    .option("--iteration <id>", "Iteration ID")
    .action((id: string, opts, command: Command) => {
      const context = resolve(command);
      const authorizedContext = artifactMutationContext(queryContext(context), id);
      getArtifact({ context: authorizedContext, artifactId: id });
      try {
        out(
          addArtifactRevision({
            artifactId: id,
            objectId: opts.object,
            parentRevisionId: expectedId(opts.expected),
            iterationId: opts.iteration,
            state: revisionState(opts.state),
            ...(context.kind === "session"
              ? { authoredBySessionId: context.sessionId }
              : {}),
          }),
        );
      } catch (error) {
        conflict(error, id);
      }
    });

  cmd
    .command("promote <id>")
    .description("Select an Artifact Revision")
    .requiredOption("--revision <id>", "Revision ID to select")
    .requiredOption("--expected <revision-id>", "Expected selected Revision ID or none")
    .action((id: string, opts, command: Command) => {
      const context = resolve(command);
      const authorizedContext = artifactMutationContext(queryContext(context), id);
      getArtifact({ context: authorizedContext, artifactId: id });
      try {
        out(
          selectArtifactRevision({
            artifactId: id,
            revisionId: opts.revision,
            expectedRevisionId: expectedId(opts.expected),
          }),
        );
      } catch (error) {
        conflict(error, id);
      }
    });

  cmd
    .command("state <revision-id>")
    .description("Append a state-changing Artifact Revision")
    .requiredOption("--state <state>", "Revision state")
    .requiredOption("--expected <revision-id>", "Expected source Revision ID")
    .action((revisionId: string, opts, command: Command) => {
      const context = resolve(command);
      getArtifactRevision({
        context: queryContext(context),
        revisionId,
      });
      if (expectedId(opts.expected) !== revisionId) {
        raiseError("E_CONFLICT", { kind: "Artifact Revision", id: revisionId });
      }
      out(
        setArtifactRevisionState({
          revisionId,
          state: revisionState(opts.state),
          ...(context.kind === "session"
            ? { authoredBySessionId: context.sessionId }
            : {}),
        }),
      );
    });

  cmd
    .command("usage <revision-id>")
    .description("List or add a safe Artifact usage")
    .option("--workspace <id>", "Workspace usage target")
    .option("--project <id>", "Project usage target and query scope")
    .option("--feedback <id>", "Feedback usage target")
    .option("--role <role>", "Usage role; when omitted, list usages")
    .option("--lifecycle <state>", "Optional lifecycle label")
    .option("--cursor <cursor>", "Continue from an opaque cursor")
    .option("--limit <count>", "Maximum rows", parseCount)
    .action((revisionId: string, opts, command: Command) => {
      const context = resolve(command, opts.project);
      if (!opts.role) {
        out(
          listArtifactUsages({
            context: queryContext(context),
            revisionId,
            after: opts.cursor,
            limit: opts.limit ?? 50,
          }),
        );
        return;
      }
      getArtifactRevision({
        context: queryContext(context),
        revisionId,
      });
      const targets = [opts.workspace, opts.project, opts.feedback].filter(Boolean);
      if (targets.length !== 1) {
        raiseError("E_INPUT_INVALID", {
          field: "artifact usage",
          detail: "choose exactly one of --workspace, --project, or --feedback",
        });
      }
      if (opts.project) {
        getProject({ workspaceId: context.workspaceId, projectId: opts.project });
      } else if (opts.feedback) {
        getFeedback({ context: queryContext(context), feedbackId: opts.feedback });
      }
      try {
        out(
          addArtifactUsage({
            artifactRevisionId: revisionId,
            role: opts.role,
            lifecycle: opts.lifecycle,
            ...(opts.workspace
              ? { workspaceId: opts.workspace }
              : opts.project
                ? { projectId: opts.project }
                : { feedbackId: opts.feedback }),
          }),
        );
      } catch (error) {
        conflict(error, revisionId);
      }
    });

  return cmd;
}

function resolve(command: Command, projectId?: string) {
  const opts = command.optsWithGlobals();
  return resolveCommandContext({
    dataRoot: ralphDir(),
    sessionId: opts.session,
    workspaceId: opts.workspace,
    projectId: projectId ?? opts.project,
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

function expectedId(value: string): string | null {
  return value === "none" ? null : value;
}

function revisionState(value: string): ArtifactRevisionState {
  if (!STATES.has(value as ArtifactRevisionState)) {
    throw new Error(`Unknown Artifact Revision state: ${value}`);
  }
  return value as ArtifactRevisionState;
}

function conflict(error: unknown, id: string): never {
  if (error instanceof StoreConflictError) {
    raiseError("E_CONFLICT", { kind: "Artifact", id });
  }
  throw error;
}

function parseCount(value: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error("Expected a positive integer");
  }
  return count;
}
