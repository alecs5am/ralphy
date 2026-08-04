import { Command } from "commander";
import { resolveCommandContext } from "../lib/context.js";
import { raiseError } from "../lib/errors/index.js";
import { out } from "../lib/output.js";
import { ralphDir } from "../lib/paths.js";
import { getCompositionHistory, reviseCompositionCheckout, runCompositionBuild } from "../lib/composition-build.js";
import { getComposition, listCompositions, selectCompositionRevision } from "../lib/store/compositions.js";
import { StoreConflictError, type JsonValue } from "../lib/store/types.js";

export function compositionCmd(): Command {
  const command = new Command("composition").description("Manage versioned Compositions and reproducible Builds");

  command.command("show <id>").description("Show revision history with nested Builds and outputs")
    .action((id: string, _opts, child: Command) => {
      const context = resolve(child);
      out(getCompositionHistory(queryContext(context), id));
    });

  command.command("list").description("List Compositions in a Project")
    .option("--project <id>", "Project ID")
    .option("--cursor <cursor>", "Continue from an opaque cursor")
    .option("--limit <count>", "Maximum rows", (value) => Number(value), 50)
    .action((opts, child: Command) => {
      const context = resolve(child, opts.project);
      if (!context.projectId) raiseError("E_INPUT_INVALID", { field: "project", detail: "Project scope is required" });
      out(listCompositions({ context: queryContext(context), projectId: context.projectId, after: opts.cursor, limit: opts.limit }));
    });

  command.command("revise <id>").description("Create a draft child and materialize its editable checkout")
    .requiredOption("--expected <revision-id>", "Expected latest revision ID or none")
    .requiredOption("--engine <engine>", "Composition engine")
    .option("--engine-version <version>", "Engine version")
    .option("--config <json>", "Engine configuration JSON", "{}")
    .action(async (id: string, opts, child: Command) => {
      const context = resolve(child);
      getComposition({ context: queryContext(context), compositionId: id });
      try {
        out(await reviseCompositionCheckout({
          compositionId: id,
          expectedLatestRevisionId: expected(opts.expected),
          engine: opts.engine,
          engineVersion: opts.engineVersion,
          engineConfig: json(opts.config, "config"),
          ...(context.kind === "session" ? { authoredBySessionId: context.sessionId } : {}),
        }));
      } catch (error) { conflict(error, id); }
    });

  command.command("build <id>").description("Snapshot, seal, and build one exact draft revision")
    .requiredOption("--revision <id>", "Expected latest draft revision ID")
    .option("--profile <json-or-name>", "Build profile", "{}")
    .action(async (id: string, opts, child: Command) => {
      const context = resolve(child);
      getComposition({ context: queryContext(context), compositionId: id });
      try {
        out(await runCompositionBuild({
          compositionId: id,
          revisionId: opts.revision,
          profile: jsonOrName(opts.profile),
          ...(context.kind === "session" ? { authoredBySessionId: context.sessionId } : {}),
        }));
      } catch (error) { conflict(error, id); }
    });

  command.command("select <id>").description("Select a sealed Composition revision")
    .requiredOption("--revision <id>", "Revision ID")
    .requiredOption("--expected <revision-id>", "Expected selected revision ID or none")
    .action((id: string, opts, child: Command) => {
      const context = resolve(child);
      getComposition({ context: queryContext(context), compositionId: id });
      try {
        out(selectCompositionRevision({ compositionId: id, revisionId: opts.revision, expectedSelectedRevisionId: expected(opts.expected) }));
      } catch (error) { conflict(error, id); }
    });
  return command;
}

function resolve(command: Command, projectId?: string) {
  const opts = command.optsWithGlobals();
  return resolveCommandContext({
    dataRoot: ralphDir(), sessionId: opts.session, workspaceId: opts.workspace,
    projectId: projectId ?? opts.project, cwd: process.cwd(),
  });
}
function queryContext(context: ReturnType<typeof resolveCommandContext>) {
  return context.kind === "session" ? { sessionId: context.sessionId } : {
    workspaceId: context.workspaceId, ...(context.projectId ? { projectId: context.projectId } : {}),
  };
}
function expected(value: string): string | null { return value === "none" ? null : value; }
function json(value: string, field: string): JsonValue {
  try { return JSON.parse(value) as JsonValue; }
  catch { raiseError("E_INPUT_INVALID", { field, detail: "expected JSON" }); }
}
function jsonOrName(value: string): JsonValue {
  if (!value.trim().startsWith("{") && !value.trim().startsWith("[")) return { name: value };
  return json(value, "profile");
}
function conflict(error: unknown, id: string): never {
  if (error instanceof StoreConflictError) raiseError("E_CONFLICT", { kind: "Composition", id });
  throw error;
}
