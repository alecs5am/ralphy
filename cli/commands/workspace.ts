import { Command } from "commander";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_WORKSPACE,
  currentWorkspace,
  layoutMode,
  workspaceDir,
  workspaceSharedAssetKindDir,
  workspaceUnitsDir,
} from "../lib/paths.js";
import { err, out } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import {
  recordWorkspaceEvalResult,
  runWorkspaceEval,
} from "../lib/eval/workspace-evaluators.js";
import { buildWorkspaceRoi } from "../lib/analytics/roi.js";
import {
  assertCommandWorkspace,
} from "../lib/context-state.js";
import {
  createWorkspace,
  getWorkspace,
  listSocialAccounts,
  listWorkspaces,
  updateWorkspace,
  upsertSocialAccount,
} from "../lib/store/scopes.js";
import { StoreConflictError } from "../lib/store/types.js";
import { resolveCommandContext } from "../lib/context.js";
import { ralphDir } from "../lib/paths.js";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const SHARED_ASSET_KINDS = ["images", "videos", "voiceover", "music", "sfx", "fonts"];

function requireRalphyLayout(verb: string): void {
  if (layoutMode() === "legacy") raiseError("E_LEGACY_LAYOUT", { verb });
}

async function countDirs(dir: string): Promise<number> {
  try {
    return (await fs.readdir(dir, { withFileTypes: true })).filter((entry) => entry.isDirectory())
      .length;
  } catch {
    return 0;
  }
}

async function countFiles(dir: string): Promise<number> {
  try {
    return (await fs.readdir(dir, { withFileTypes: true, recursive: true })).filter((entry) =>
      entry.isFile(),
    ).length;
  } catch {
    return 0;
  }
}

async function sharedAssetInventory(slug: string): Promise<Record<string, number>> {
  return Object.fromEntries(
    await Promise.all(
      SHARED_ASSET_KINDS.map(async (kind) => [
        kind,
        await countFiles(workspaceSharedAssetKindDir(slug, kind)),
      ]),
    ),
  );
}

function requireWorkspace(slug: string): void {
  assertCommandWorkspace(slug);
  if (!existsSync(workspaceDir(slug))) {
    raiseError("E_NOT_FOUND", { kind: "Workspace", id: slug });
  }
}

export function workspaceCmd(): Command {
  const cmd = new Command("workspace").description(
    "Manage account workspaces: profile, channels, shared brand assets, projects, and units",
  );

  cmd
    .command("create <name>")
    .description("Create a Workspace")
    .option("--as <slug>", "Stable Workspace slug")
    .option("--name <name>", "Compatibility alias for the display name")
    .option("--description <text>", "Public Workspace description metadata")
    .action((positionalName: string, opts) => {
      const slug = String(opts.as ?? positionalName);
      const name = String(opts.name ?? positionalName);
      if (!SLUG_RE.test(slug)) {
        raiseError("E_VALIDATION_FAILED", {
          target: "slug",
          detail: `'${slug}' is not a valid workspace slug (lowercase kebab-case)`,
        });
      }
      try {
        out(
          createWorkspace({
            slug,
            name,
            ...(opts.description ? { metadata: { description: opts.description } } : {}),
          }),
        );
      } catch (error) {
        if (String(error).includes("UNIQUE")) {
          raiseError("E_ALREADY_EXISTS", { kind: "Workspace", id: slug });
        }
        throw error;
      }
    });

  cmd
    .command("list")
    .description("List Workspaces")
    .option("--cursor <cursor>", "Continue from an opaque cursor")
    .option("--limit <count>", "Maximum rows", parseCount)
    .action((opts, command: Command) => {
      const context = explicitContext(command);
      out(
        context
          ? { items: [getWorkspace(context.workspaceId)], nextCursor: null }
          : listWorkspaces({ cursor: opts.cursor, limit: opts.limit }),
      );
    });

  cmd
    .command("show <id>")
    .description("Show a Workspace")
    .action((id: string, _opts, command: Command) => {
      const workspace = findWorkspace(id);
      assertWorkspaceContext(command, workspace.id);
      out(workspace);
    });

  cmd
    .command("use <slug>")
    .description("Deprecated: use explicit --workspace or start a Session")
    .action(async (slug: string) => {
      requireRalphyLayout("workspace use");
      if (slug !== DEFAULT_WORKSPACE) requireWorkspace(slug);
      raiseError("E_INPUT_INVALID", {
        field: "workspace use",
        detail: "deprecated; pass --workspace <id> or run `ralphy session start`",
        verb: "workspace use",
      });
    });

  cmd
    .command("update <id>")
    .description("Update Workspace metadata with optimistic concurrency")
    .option("--name <name>", "Workspace name")
    .option("--slug <slug>", "Workspace slug")
    .option("--expected <version>", "Expected row version", parseCount)
    .action((id: string, opts, command: Command) => {
      const workspace = findWorkspace(id);
      assertWorkspaceContext(command, workspace.id);
      if (opts.expected === undefined) {
        raiseError("E_INPUT_INVALID", {
          field: "--expected",
          detail: "an expected row version is required",
        });
      }
      try {
        out(
          updateWorkspace(
            workspace.id,
            { name: opts.name, slug: opts.slug },
            opts.expected,
          ),
        );
      } catch (error) {
        if (error instanceof StoreConflictError) {
          raiseError("E_CONFLICT", { kind: "Workspace", id: workspace.id });
        }
        throw error;
      }
    });

  cmd
    .command("account <workspace>")
    .description("List or upsert public social-account metadata")
    .option("--platform <platform>", "Provider platform")
    .option("--external-id <id>", "Provider-owned public account ID")
    .option("--display-name <name>", "Public display name")
    .option("--username <username>", "Public handle")
    .option("--cursor <cursor>", "Continue from an opaque cursor")
    .option("--limit <count>", "Maximum rows", parseCount)
    .action((workspace: string, opts, command: Command) => {
      const workspaceId = findWorkspace(workspace).id;
      assertWorkspaceContext(command, workspaceId);
      if (opts.platform !== undefined || opts.externalId !== undefined) {
        if (!opts.platform || !opts.externalId) {
          raiseError("E_INPUT_INVALID", {
            field: "workspace account",
            detail: "--platform and --external-id are required together",
          });
        }
        out(
          upsertSocialAccount({
            workspaceId,
            platform: opts.platform,
            externalId: opts.externalId,
            displayName: opts.displayName,
            username: opts.username,
          }),
        );
        return;
      }
      out(listSocialAccounts({ workspaceId, cursor: opts.cursor, limit: opts.limit }));
    });

  cmd
    .command("eval <project>")
    .description("Score a project against its account workspace evaluator rubric")
    .option("--no-vision", "Skip vision criteria")
    .option("--model <id>", "Override the vision model")
    .option("--workspace <slug>", "Override the project's workspace")
    .option("--video <path>", "Override the scored video")
    .option("--criterion <id>", "Run one criterion (repeatable)", collect, [])
    .action(async (project: string, opts) => {
      requireRalphyLayout("workspace eval");
      try {
        const criteria = opts.criterion as string[];
        const result = await runWorkspaceEval(project, {
          noVision: opts.vision === false,
          model: opts.model,
          workspace: opts.workspace,
          video: opts.video,
          criteria: criteria.length ? criteria : undefined,
        });
        const recorded = recordWorkspaceEvalResult(result);
        out({
          verdict: result.overall.verdict,
          score: result.overall.score,
          workspace: result.workspace,
          projectId: result.projectId,
          criteria: result.criteria.length,
          summary: result.overall.summary,
          runId: recorded.runId,
          evaluationId: recorded.evaluationId,
        });
      } catch (error) {
        err(`workspace eval failed: ${(error as Error).message}`);
      }
    });

  cmd
    .command("roi <slug>")
    .description("Show realized generation spend and measured account performance")
    .action(async (slug: string) => {
      requireRalphyLayout("workspace roi");
      requireWorkspace(slug);
      out(await buildWorkspaceRoi(slug));
    });

  cmd
    .command("stats [slug]")
    .description("Show project, unit, and shared-asset counts for an account workspace")
    .action(async (slug?: string) => {
      const target = slug ?? currentWorkspace();
      requireWorkspace(target);
      out({
        workspace: target,
        projects: await countDirs(path.join(workspaceDir(target), "projects")),
        units: await countDirs(workspaceUnitsDir(target)),
        sharedAssets: await sharedAssetInventory(target),
        path: workspaceDir(target),
      });
    });

  return cmd;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function findWorkspace(idOrSlug: string) {
  try {
    return getWorkspace(idOrSlug);
  } catch {
    let cursor: string | null = null;
    do {
      const page = listWorkspaces({ cursor, limit: 100 });
      const workspace = page.items.find((item) => item.slug === idOrSlug);
      if (workspace) return workspace;
      cursor = page.nextCursor;
    } while (cursor !== null);
    raiseError("E_NOT_FOUND", { kind: "Workspace", id: idOrSlug });
  }
}

function parseCount(value: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error("Expected a positive integer");
  }
  return count;
}

function explicitContext(command: Command) {
  const opts = command.optsWithGlobals();
  if (!opts.session && !opts.workspace && !opts.project) return null;
  return resolveCommandContext({
    dataRoot: ralphDir(),
    sessionId: opts.session,
    workspaceId: opts.workspace,
    projectId: opts.project,
    cwd: process.cwd(),
  });
}

function assertWorkspaceContext(command: Command, workspaceId: string): void {
  const opts = command.optsWithGlobals();
  if (!opts.session && !opts.workspace && !opts.project) return;
  resolveCommandContext({
    dataRoot: ralphDir(),
    sessionId: opts.session,
    workspaceId,
    projectId: opts.project,
    cwd: process.cwd(),
  });
}
