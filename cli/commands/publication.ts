import { Command } from "commander";
import { resolveCommandContext } from "../lib/context.js";
import { raiseError } from "../lib/errors/index.js";
import { out } from "../lib/output.js";
import { ralphDir } from "../lib/paths.js";
import {
  cancelPublication,
  exportMediumPresentation,
  lookupPublication,
  publishPresentation,
  reconcilePublication,
  refreshPublicationMetrics,
} from "../lib/publication.js";
import type { QueryContext } from "../lib/store/scope-context.js";
import { getPublication, listPublications } from "../lib/store/units.js";
import type { JsonValue, PublicationRail, PublicationState } from "../lib/store/types.js";

export function publicationCmd(): Command {
  const command = new Command("publication").description(
    "Publish and reconcile immutable Unit presentations through fenced provider operations",
  );

  command
    .command("list")
    .requiredOption("--presentation <id>", "Unit Presentation ID")
    .option("--cursor <cursor>", "Continue from an opaque cursor")
    .option("--limit <count>", "Maximum rows", Number, 50)
    .action((opts, child: Command) => {
      const context = queryContext(resolve(child));
      out(listPublications({
        context,
        presentationId: opts.presentation,
        after: opts.cursor,
        limit: opts.limit,
      }));
    });

  command
    .command("publish <presentation-id>")
    .requiredOption("--key <key>", "Stable idempotency key")
    .requiredOption("--rail <rail>", "postiz | github-pages | devto | hashnode | manual")
    .option("--account <id>", "Social Account ID")
    .option("--at <iso>", "Scheduled UTC instant")
    .option("--revised-from <id>", "Earlier Publication lineage ID")
    .action(async (presentationId: string, opts, child: Command) => {
      const context = queryContext(resolve(child));
      if (opts.rail === "manual") {
        out(await exportMediumPresentation({ context, presentationId }));
        return;
      }
      out(await publishPresentation({
        context,
        presentationId,
        socialAccountId: opts.account,
        idempotencyKey: opts.key,
        rail: rail(opts.rail),
        scheduledAt: opts.at ? timestamp(opts.at) : null,
        revisedFromPublicationId: opts.revisedFrom,
      }));
    });

  command
    .command("lookup <publication-id>")
    .requiredOption("--expected <state>", "scheduled | submitted")
    .action(async (publicationId: string, opts, child: Command) => {
      out(await lookupPublication({
        context: queryContext(resolve(child)),
        publicationId,
        expectedState: oneOf(opts.expected, ["scheduled", "submitted"] as const),
      }));
    });

  command
    .command("cancel <publication-id>")
    .requiredOption("--expected <state>", "draft | scheduled | submitted")
    .action(async (publicationId: string, opts, child: Command) => {
      out(await cancelPublication({
        context: queryContext(resolve(child)),
        publicationId,
        expectedState: oneOf(opts.expected, ["draft", "scheduled", "submitted"] as const),
      }));
    });

  command
    .command("reconcile <publication-id>")
    .requiredOption("--expected <state>", "unknown | reconciliation_required")
    .option("--resolution <json>", "Manual provider outcome; otherwise performs lookup")
    .action(async (publicationId: string, opts, child: Command) => {
      out(await reconcilePublication({
        context: queryContext(resolve(child)),
        publicationId,
        expectedState: oneOf(
          opts.expected,
          ["unknown", "reconciliation_required"] as const,
        ),
        ...(opts.resolution
          ? { resolution: json(opts.resolution, "resolution") as never }
          : {}),
      }));
    });

  command
    .command("show <publication-id>")
    .action((publicationId: string, _opts, child: Command) => {
      out(getPublication({
        context: queryContext(resolve(child)),
        publicationId,
      }));
    });

  command
    .command("refresh <publication-id>")
    .requiredOption("--key <key>", "Stable refresh idempotency key")
    .option("--source <source>", "Metric provider source", "postiz")
    .option("--as-of <iso>", "Snapshot observation time; defaults to now")
    .option("--window-start <iso>", "Inclusive metric window start")
    .option("--window-end <iso>", "Inclusive metric window end")
    .action(async (publicationId: string, opts, child: Command) => {
      if (Boolean(opts.windowStart) !== Boolean(opts.windowEnd)) {
        raiseError("E_INPUT_INVALID", {
          field: "window",
          detail: "window-start and window-end must be provided together",
        });
      }
      out(await refreshPublicationMetrics({
        context: queryContext(resolve(child)),
        publicationId,
        source: opts.source,
        asOf: opts.asOf ? timestamp(opts.asOf) : Date.now(),
        ...(opts.windowStart
          ? {
              windowStart: timestamp(opts.windowStart),
              windowEnd: timestamp(opts.windowEnd),
            }
          : {}),
        idempotencyKey: opts.key,
      }));
    });

  return command;
}

function resolve(child: Command) {
  const opts = child.optsWithGlobals();
  return resolveCommandContext({
    dataRoot: ralphDir(),
    sessionId: opts.session,
    workspaceId: opts.workspace,
    projectId: opts.project,
    cwd: process.cwd(),
  });
}

function queryContext(context: ReturnType<typeof resolveCommandContext>): QueryContext {
  return context.kind === "session"
    ? { sessionId: context.sessionId }
    : {
        workspaceId: context.workspaceId,
        ...(context.projectId ? { projectId: context.projectId } : {}),
      };
}

function rail(value: string): PublicationRail {
  return oneOf(value, ["postiz", "github-pages", "devto", "hashnode", "manual"] as const);
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    raiseError("E_INPUT_INVALID", { field: "at", detail: "expected an ISO datetime" });
  }
  return parsed;
}

function json(value: string, field: string): JsonValue {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    raiseError("E_INPUT_INVALID", { field, detail: "expected JSON" });
  }
}

function oneOf<T extends PublicationState | PublicationRail>(
  value: string,
  allowed: readonly T[],
): T {
  if (!allowed.includes(value as T)) {
    raiseError("E_INPUT_INVALID", {
      field: "state",
      detail: `expected ${allowed.join(" or ")}`,
    });
  }
  return value as T;
}
