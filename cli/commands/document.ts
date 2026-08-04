import { Command } from "commander";
import { resolveCommandContext } from "../lib/context.js";
import { raiseError } from "../lib/errors/index.js";
import { out } from "../lib/output.js";
import { ralphDir } from "../lib/paths.js";
import { replaceProjectDocumentBinding } from "../lib/store/document-content.js";
import {
  createDocument,
  documentMutationContext,
  getDocument,
  listDocumentRevisions,
  listDocuments,
  reviseDocument,
  searchDocuments,
} from "../lib/store/documents.js";
import {
  StoreConflictError,
  type DocumentFormat,
  type DocumentKind,
} from "../lib/store/types.js";

const KINDS = new Set<DocumentKind>([
  "brief",
  "style-guide",
  "production-plan",
  "scenario",
  "storyboard",
  "research",
  "postmortem",
  "memory",
  "note",
  "custom",
]);
const FORMATS = new Set<DocumentFormat>(["markdown", "text", "json"]);

export function documentCmd(): Command {
  const cmd = new Command("document").description("Manage immutable Documents");

  cmd
    .command("create")
    .description("Create a workspace- or Project-scoped Document")
    .option("--workspace <id>", "Workspace ID")
    .option("--project <id>", "Project ID")
    .requiredOption("--kind <kind>", "Document kind")
    .requiredOption("--slug <slug>", "Document slug")
    .requiredOption("--title <title>", "Document title")
    .action((opts, command: Command) => {
      const context = resolve(command, opts.project);
      const kind = documentKind(opts.kind);
      out(
        context.projectId
          ? createDocument({
              projectId: context.projectId,
              kind,
              slug: opts.slug,
              title: opts.title,
            })
          : createDocument({
              workspaceId: context.workspaceId,
              kind,
              slug: opts.slug,
              title: opts.title,
            }),
      );
    });

  cmd
    .command("list")
    .description("List Documents in the explicit scope")
    .option("--workspace <id>", "Workspace ID")
    .option("--project <id>", "Project ID")
    .option("--cursor <cursor>", "Continue from an opaque cursor")
    .option("--limit <count>", "Maximum rows", parseCount)
    .action((opts, command: Command) => {
      const context = resolve(command, opts.project);
      out(
        listDocuments({
          context: queryContext(context),
          after: opts.cursor,
          limit: opts.limit ?? 50,
        }),
      );
    });

  cmd
    .command("show <id>")
    .description("Show safe Document metadata without its body")
    .option("--workspace <id>", "Workspace ID")
    .option("--project <id>", "Project ID")
    .action((id: string, opts, command: Command) => {
      const context = resolve(command, opts.project);
      out(getDocument({ context: queryContext(context), documentId: id }));
    });

  cmd
    .command("revisions <id>")
    .description("List immutable Document Revisions")
    .option("--workspace <id>", "Workspace ID")
    .option("--project <id>", "Project ID")
    .option("--cursor <cursor>", "Continue from an opaque cursor")
    .option("--limit <count>", "Maximum rows", parseCount)
    .action((id: string, opts, command: Command) => {
      const context = resolve(command, opts.project);
      out(
        listDocumentRevisions({
          context: queryContext(context),
          documentId: id,
          after: opts.cursor,
          limit: opts.limit ?? 50,
        }),
      );
    });

  cmd
    .command("revise <id>")
    .description("Append a Document Revision")
    .requiredOption("--body <body>", "Revision body")
    .requiredOption("--expected <revision-id>", "Expected head ID or none")
    .option("--format <format>", "markdown | text | json", "text")
    .option("--title <title>", "Revision title")
    .option("--iteration <id>", "Iteration ID")
    .action((id: string, opts, command: Command) => {
      const context = resolve(command);
      const authorizedContext = documentMutationContext(queryContext(context), id);
      getDocument({ context: authorizedContext, documentId: id });
      try {
        out(
          reviseDocument({
            documentId: id,
            body: opts.body,
            format: documentFormat(opts.format),
            title: opts.title,
            iterationId: opts.iteration,
            expectedHeadId: expectedId(opts.expected),
            ...(context.kind === "session"
              ? { authoredBySessionId: context.sessionId }
              : {}),
          }),
        );
      } catch (error) {
        if (error instanceof StoreConflictError) {
          raiseError("E_CONFLICT", { kind: "Document", id });
        }
        throw error;
      }
    });

  cmd
    .command("search <query>")
    .description("Search current text Document heads")
    .option("--workspace <id>", "Workspace ID")
    .option("--project <id>", "Project ID")
    .option("--cursor <cursor>", "Continue from an opaque cursor")
    .option("--limit <count>", "Maximum rows", parseCount)
    .action((query: string, opts, command: Command) => {
      const context = resolve(command, opts.project);
      out(
        searchDocuments({
          context: queryContext(context),
          query,
          after: opts.cursor,
          limit: opts.limit ?? 50,
        }),
      );
    });

  cmd
    .command("bind <revision-id>")
    .description("Bind a Document Revision to a Project role")
    .requiredOption("--project <id>", "Project ID")
    .requiredOption("--role <role>", "Binding role")
    .requiredOption("--expected <revision-id>", "Expected bound Revision ID or none")
    .action((revisionId: string, opts, command: Command) => {
      const context = resolve(command, opts.project);
      try {
        out(
          replaceProjectDocumentBinding({
            context: queryContext(context),
            projectId: opts.project,
            role: opts.role,
            revisionId,
            expectedRevisionId: expectedId(opts.expected),
          }),
        );
      } catch (error) {
        if (error instanceof StoreConflictError) {
          raiseError("E_CONFLICT", { kind: "Document binding", id: opts.role });
        }
        throw error;
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

function documentKind(value: string): DocumentKind {
  if (!KINDS.has(value as DocumentKind)) {
    throw new Error(`Unknown Document kind: ${value}`);
  }
  return value as DocumentKind;
}

function documentFormat(value: string): DocumentFormat {
  if (!FORMATS.has(value as DocumentFormat)) {
    throw new Error(`Unknown Document format: ${value}`);
  }
  return value as DocumentFormat;
}

function parseCount(value: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error("Expected a positive integer");
  }
  return count;
}
