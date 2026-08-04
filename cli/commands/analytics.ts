import { Command } from "commander";
import {
  queryPublicationPerformance,
  queryPublicationPostmortem,
} from "../lib/analytics/query.js";
import { resolveCommandContext } from "../lib/context.js";
import { raiseError } from "../lib/errors/index.js";
import { out } from "../lib/output.js";
import { ralphDir } from "../lib/paths.js";
import type { QueryContext } from "../lib/store/scope-context.js";
import { getMetricTotals, listMetricSnapshots } from "../lib/store/units.js";

export function analyticsCmd(): Command {
  const command = new Command("analytics").description(
    "Query immutable Publication metric snapshots",
  );

  command
    .command("list <publication-id>")
    .option("--source <source>", "Restrict provider source")
    .option("--as-of <iso>", "Include observations at or before this instant")
    .option("--window-start <iso>", "Exact window start")
    .option("--window-end <iso>", "Exact window end")
    .option("--cursor <cursor>", "Continue from an opaque cursor")
    .option("--limit <count>", "Maximum rows", Number, 50)
    .action((publicationId: string, opts, child: Command) => {
      out(listMetricSnapshots({
        context: context(child),
        publicationId,
        ...filters(opts),
        after: opts.cursor,
        limit: opts.limit,
      }));
    });

  command
    .command("totals")
    .requiredOption("--publications <json>", "One to 100 distinct Publication IDs")
    .option("--source <source>", "Restrict provider source")
    .option("--as-of <iso>", "Include observations at or before this instant")
    .option("--window-start <iso>", "Exact window start")
    .option("--window-end <iso>", "Exact window end")
    .action((opts, child: Command) => {
      out(getMetricTotals({
        context: context(child),
        publicationIds: publicationIds(opts.publications),
        ...filters(opts),
      }));
    });

  for (const name of ["roi", "postmortem"] as const) {
    command
      .command(name)
      .description(
        name === "roi"
          ? "Return filter-first newest-per-Publication performance facts"
          : "Return an evidence digest without scanning Unit files",
      )
      .requiredOption("--publications <json>", "One to 100 distinct Publication IDs")
      .option("--source <source>", "Restrict provider source")
      .option("--as-of <iso>", "Include observations at or before this instant")
      .option("--window-start <iso>", "Exact window start")
      .option("--window-end <iso>", "Exact window end")
      .action((opts, child: Command) => {
        const query = {
            context: context(child),
            publicationIds: publicationIds(opts.publications),
            ...filters(opts),
        };
        out({
          kind: name,
          ...(name === "roi"
            ? queryPublicationPerformance(query)
            : queryPublicationPostmortem(query)),
        });
      });
  }

  return command;
}

function context(command: Command): QueryContext {
  const opts = command.optsWithGlobals();
  const resolved = resolveCommandContext({
    dataRoot: ralphDir(),
    sessionId: opts.session,
    workspaceId: opts.workspace,
    projectId: opts.project,
    cwd: process.cwd(),
  });
  return resolved.kind === "session"
    ? { sessionId: resolved.sessionId }
    : {
        workspaceId: resolved.workspaceId,
        ...(resolved.projectId ? { projectId: resolved.projectId } : {}),
      };
}

function publicationIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.some((id) => typeof id !== "string")
    ) throw new Error();
    return parsed;
  } catch {
    raiseError("E_INPUT_INVALID", {
      field: "publications",
      detail: "expected a JSON array of Publication IDs",
    });
  }
}

function filters(opts: Record<string, unknown>) {
  if (Boolean(opts.windowStart) !== Boolean(opts.windowEnd)) {
    raiseError("E_INPUT_INVALID", {
      field: "window",
      detail: "window-start and window-end must be provided together",
    });
  }
  return {
    ...(typeof opts.source === "string" ? { source: opts.source } : {}),
    ...(typeof opts.asOf === "string" ? { asOf: timestamp(opts.asOf, "as-of") } : {}),
    ...(typeof opts.windowStart === "string" && typeof opts.windowEnd === "string"
      ? {
          windowStart: timestamp(opts.windowStart, "window-start"),
          windowEnd: timestamp(opts.windowEnd, "window-end"),
        }
      : {}),
  };
}

function timestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    raiseError("E_INPUT_INVALID", { field, detail: "expected an ISO datetime" });
  }
  return parsed;
}
