// `ralphy stock` (#596): find free, licensed overlay assets (logos, photos,
// b-roll, SFX, music beds) and pull them into a Project with their license.
//
//   stock search <query> --kind image|video|audio|logo   candidates, no download
//   stock pull <id...> --project <id> [--slot <name>]    Artifact revision + tree copy
//   stock credits --project <id>                         attribution block (markdown)
//
// Sources are connector files under cli/lib/providers/ (openverse, commons,
// archive, simple-icons, pexels); the orchestration lives in cli/lib/stock/.
// `search` reads no Project and resolves no scope; `pull` and `credits`
// resolve scope like any project verb (cli/index.ts).

import { Command } from "commander";
import { raiseError } from "../lib/errors/index.js";
import { DomainError } from "../lib/errors/domain.js";
import { getCommandContext } from "../lib/context-state.js";
import { out, ok } from "../lib/output.js";
import { findCompatibilityProject, type CompatibilityProject } from "../lib/project-lookup.js";
import { listStockCredits, stockCreditsMarkdown } from "../lib/stock/credits.js";
import { StockSourceError, stockFetch } from "../lib/stock/http.js";
import { connectorForId, planStockPull, pullStockItem, type StockPullPlan, type StockPullResult } from "../lib/stock/pull.js";
import { STOCK_LIMIT_MAX, STOCK_SOURCE_TIMEOUT_MS, searchStock } from "../lib/stock/search.js";
import { DEFAULT_STOCK_SOURCES } from "../lib/stock/sources.js";
import {
  STOCK_KINDS,
  STOCK_LICENSE_FILTERS,
  STOCK_ORIENTATIONS,
  STOCK_SOURCES,
  isStockKind,
  isStockSourceId,
  type StockLicenseFilter,
  type StockOrientation,
} from "../lib/stock/types.js";

type SearchOpts = { kind?: string; source?: string[]; limit?: string; orientation?: string; license?: string; timeout?: string };
type PullOpts = { project: string; slot?: string; license?: string; dryRun?: boolean };
type CreditsOpts = { project: string; markdown?: boolean };

function checkEnum<T extends string>(flag: string, value: string | undefined, allowed: readonly T[], verb: string): T | undefined {
  if (value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) raiseError("E_FLAG_UNKNOWN", { flag, value, allowed: allowed.join(", "), verb });
  return value as T;
}

/** Map a stock failure to its catalog error and exit. */
function raiseStockError(error: unknown, verb: string): never {
  if (error instanceof DomainError) raiseError(error.code, (error.details ?? {}) as any);
  if (error instanceof StockSourceError) {
    if (error.status === 429) raiseError("E_PROVIDER_RATE_LIMIT", { provider: error.source, retryAfter: error.retryAfterSec ?? 60 });
    if ((error.status === 401 || error.status === 403) && error.source === "Pexels") raiseError("E_PROVIDER_AUTH", { provider: error.source });
    if (error.status === 0 || error.status >= 500) raiseError("E_PROVIDER_UNAVAILABLE", { provider: error.source, detail: error.message });
    raiseError("E_PROVIDER_HTTP", { provider: error.source, status: error.status, detail: error.message });
  }
  raiseError("E_INTERNAL", { detail: `${verb}: ${(error as Error)?.message ?? String(error)}` });
}

function failureText(error: unknown): string {
  if (error instanceof DomainError) {
    const detail = (error.details as { detail?: unknown } | undefined)?.detail;
    return typeof detail === "string" ? detail : error.message;
  }
  return (error as Error)?.message ?? String(error);
}

/** The store Project a stock verb names; stock items are domain Artifacts, so a store is required. */
async function requireStoreProject(reference: string, verb: string): Promise<CompatibilityProject> {
  if (getCommandContext() === null) {
    process.stderr.write(`[stock] ${verb} records Artifact revisions in the domain store, and this root has none; see \`ralphy migrate audit\`\n`);
    raiseError("E_MIGRATION_INCOMPLETE");
  }
  let project: CompatibilityProject | null;
  try {
    project = await findCompatibilityProject(reference);
  } catch (error) {
    raiseStockError(error, verb);
  }
  if (!project || project.source !== "store") raiseError("E_NOT_FOUND", { kind: "Project", id: reference });
  return project;
}

async function stockSearch(words: string[], opts: SearchOpts): Promise<void> {
  const verb = "stock search";
  const kind = opts.kind;
  if (!isStockKind(kind)) raiseError("E_FLAG_UNKNOWN", { flag: "kind", value: String(kind), allowed: STOCK_KINDS.join(", "), verb });
  const sources = (opts.source ?? []).flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean);
  for (const source of sources) {
    if (!isStockSourceId(source)) raiseError("E_FLAG_UNKNOWN", { flag: "source", value: source, allowed: STOCK_SOURCES.join(", "), verb });
  }
  const limit = Number(opts.limit ?? 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > STOCK_LIMIT_MAX) {
    raiseError("E_INPUT_INVALID", { field: "limit", detail: `expected an integer from 1 to ${STOCK_LIMIT_MAX}, got '${opts.limit}'`, verb });
  }
  const orientation = checkEnum<StockOrientation>("orientation", opts.orientation, STOCK_ORIENTATIONS, verb) ?? "any";
  const license = checkEnum<StockLicenseFilter>("license", opts.license, STOCK_LICENSE_FILTERS, verb) ?? "commercial";
  const timeoutSec = Number(opts.timeout ?? STOCK_SOURCE_TIMEOUT_MS / 1000);
  if (!Number.isFinite(timeoutSec) || timeoutSec < 1 || timeoutSec > 300) {
    raiseError("E_INPUT_INVALID", { field: "timeout", detail: `expected seconds from 1 to 300, got '${opts.timeout}'`, verb });
  }
  let result;
  try {
    result = await searchStock({
      query: words.join(" "),
      kind,
      sources: sources.filter(isStockSourceId),
      limit,
      orientation,
      license,
      fetchImpl: stockFetch(),
      timeoutMs: Math.round(timeoutSec * 1000),
    });
  } catch (error) {
    raiseStockError(error, verb);
  }
  for (const note of result.notes) process.stderr.write(`[stock] ${note}\n`);
  ok(`${result.count} candidate(s) for "${result.query}" (${result.kind}, license ${result.license})`);
  out(result);
}

async function stockPull(ids: string[], opts: PullOpts): Promise<void> {
  const verb = "stock pull";
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) raiseError("E_INPUT_INVALID", { field: "id", detail: "pass at least one candidate id from `ralphy stock search`", verb });
  if (opts.slot !== undefined && unique.length > 1) {
    raiseError("E_INPUT_INVALID", { field: "slot", detail: `--slot names one Artifact; pass it with a single id (got ${unique.length})`, verb });
  }
  for (const id of unique) {
    try {
      connectorForId(id);
    } catch (error) {
      raiseStockError(error, verb);
    }
  }
  const license = checkEnum<StockLicenseFilter>("license", opts.license, STOCK_LICENSE_FILTERS, verb) ?? "commercial";
  const project = await requireStoreProject(opts.project, verb);
  const fetchImpl = stockFetch();

  if (opts.dryRun) {
    const plans: StockPullPlan[] = [];
    for (const id of unique) {
      try {
        plans.push(await planStockPull({ candidateId: id, slot: opts.slot, license, fetchImpl }));
      } catch (error) {
        raiseStockError(error, verb);
      }
    }
    out({ dryRun: true, project: project.id, count: plans.length, plans, would_call: plans.map((p) => p.mediaUrl), cost_estimate_usd: 0 });
    return;
  }

  const pulled: StockPullResult[] = [];
  const failures: Array<{ id: string; error: string }> = [];
  let firstError: unknown = null;
  for (const id of unique) {
    try {
      const result = await pullStockItem({ project: { id: project.id, dir: project.dir }, candidateId: id, slot: opts.slot, license, fetchImpl });
      pulled.push(result);
      if (process.stderr.isTTY) process.stderr.write(`  pulled ${id} -> ${result.path} (revision ${result.revisionNo})\n`);
    } catch (error) {
      firstError ??= error;
      failures.push({ id, error: failureText(error) });
      process.stderr.write(`[stock] ${id} failed: ${failureText(error)}\n`);
    }
  }
  if (pulled.length === 0) raiseStockError(firstError, verb);
  ok(`Pulled ${pulled.length} stock item(s) into ${project.slug} ($0)`);
  out({ project: project.id, count: pulled.length, costUsd: 0, pulled, failures });
}

async function stockCredits(opts: CreditsOpts): Promise<void> {
  const verb = "stock credits";
  const project = await requireStoreProject(opts.project, verb);
  const credits = listStockCredits({ workspaceId: project.workspaceId, projectId: project.id });
  const markdown = stockCreditsMarkdown(credits);
  if (opts.markdown) {
    process.stdout.write(markdown);
    return;
  }
  out({ project: project.id, count: credits.length, credits, markdown });
}

const DEFAULTS = STOCK_KINDS.map((k) => `${k}: ${DEFAULT_STOCK_SOURCES[k].join(", ")}`).join("; ");

export function stockCmd(): Command {
  const cmd = new Command("stock").description(
    "Find free, licensed overlay assets (brand logos, photos, b-roll, SFX, music beds) and pull them into a Project with their license and attribution (#596)",
  );

  cmd
    .command("search")
    .description(
      "Search free licensed sources for candidates (JSON: id, source, kind, title, pageUrl, mediaUrl, previewUrl, size or duration, license + licenseUrl, author, attribution, commercialOk, attributionRequired). Downloads nothing.",
    )
    .argument("<query...>", "What to look for (several words are one query)")
    .requiredOption("--kind <kind>", `What to find: ${STOCK_KINDS.join(" | ")}`)
    .option("--source <id...>", `Sources to ask (${STOCK_SOURCES.join(", ")}). Default per kind: ${DEFAULTS}. pexels needs PEXELS_API_KEY and is skipped with a note without it`)
    .option("--limit <n>", `Most candidates to return, 1-${STOCK_LIMIT_MAX} (interleaved across sources)`, "10")
    .option("--orientation <o>", `Frame shape for images and video: ${STOCK_ORIENTATIONS.join(" | ")} (items of unknown size pass)`, "any")
    .option(
      "--license <filter>",
      "commercial: only items allowing commercial use AND modification (no NC, no ND); open: the same without ShareAlike (public domain, CC0, CC BY, Pexels), since BY-SA puts share-alike terms on the published video; any: everything, flags included",
      "commercial",
    )
    .option("--timeout <sec>", "How long each source may take; a slower source is reported as timed out while the others answer", String(STOCK_SOURCE_TIMEOUT_MS / 1000))
    .addHelpText(
      "after",
      `
Sources: openverse (images, audio; keyless, rate limited), commons (Wikimedia Commons:
images, video, audio, SVG logos; keyless), archive (Internet Archive film, public domain
and CC without NC/ND only; keyless), simple-icons (brand logos as SVG with the brand hex;
CC0 icon data, the logo is a trademark), pexels (photos, video; free PEXELS_API_KEY).

Examples:
  ralphy stock search nvidia --kind logo
  ralphy stock search "stock exchange" --kind video --source commons archive --orientation horizontal
  ralphy stock search whoosh --kind audio --limit 5
  ralphy stock search "trading floor" --kind image --license open --orientation vertical
`,
    )
    .action(async (words: string[], opts: SearchOpts) => stockSearch(words, opts));

  cmd
    .command("pull")
    .description(
      "Download candidates into a Project: each becomes an Artifact revision (Run stock.pull, cost $0) with provenance (source, page URL, license, author, attribution) " +
        "and a copy in the Project tree for index.html: artifacts/images/ (images, logos), artifacts/videos/ (video), artifacts/sfx/ (sound effects and audio of 30 s or less), " +
        "artifacts/music/ (audio the source calls music, or longer than 30 s). Append-only: an existing file is never overwritten (a <slot>.v2 name is written), nothing is deleted.",
    )
    .argument("<id...>", "Candidate ids from `ralphy stock search` (e.g. commons:File:Foo.jpg, simple-icons:nvidia)")
    .requiredOption("--project <id>", "Project id or slug")
    .option("--slot <name>", "Artifact slot for a single id (default: logo-<slug> for logos, else stock-<title>-<hash>)")
    .option("--license <filter>", "commercial (default) refuses items without commercial use AND modification rights; open also refuses ShareAlike (BY-SA, GFDL); any pulls them anyway", "commercial")
    .option("--dry-run", "Resolve the ids and print what would be pulled; download and record nothing", false)
    .addHelpText(
      "after",
      `
Examples:
  ralphy stock pull simple-icons:nvidia --project <project>
  ralphy stock pull commons:File:NYSE_floor.jpg archive:<identifier> --project <project>
`,
    )
    .action(async (ids: string[], opts: PullOpts) => stockPull(ids, opts));

  cmd
    .command("credits")
    .description("Print the attribution block for every stock item pulled into a Project, for the post caption or description (markdown in `markdown`; required credits first)")
    .requiredOption("--project <id>", "Project id or slug")
    .option("--markdown", "Print only the markdown block", false)
    .action(async (opts: CreditsOpts) => stockCredits(opts));

  return cmd;
}
