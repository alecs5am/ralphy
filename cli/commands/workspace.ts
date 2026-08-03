import { Command } from "commander";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_WORKSPACE,
  currentWorkspace,
  layoutMode,
  projectDir,
  workspaceDir,
  workspaceManifestPath,
  workspaceSharedAssetKindDir,
  workspaceUnitsDir,
  workspacesDir,
} from "../lib/paths.js";
import { err, ok, out } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import {
  renderWorkspaceEvalMarkdown,
  runWorkspaceEval,
  WORKSPACE_EVAL_ARTIFACT,
  WORKSPACE_EVAL_REPORT,
} from "../lib/eval/workspace-evaluators.js";
import { protectExistingAsset } from "../lib/providers/shared.js";
import { buildWorkspaceRoi } from "../lib/analytics/roi.js";
import {
  assertCommandWorkspace,
  getCommandContext,
} from "../lib/context-state.js";
import {
  parseWorkspaceManifest,
  WORKSPACE_CHANNELS,
  type WorkspaceManifest,
} from "../lib/schemas/workspace.js";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const SHARED_ASSET_KINDS = ["images", "videos", "voiceover", "music", "sfx", "fonts"];
const WORKSPACE_DIRS = [
  ...SHARED_ASSET_KINDS.map((kind) => `shared/assets/${kind}`),
  "projects",
  "templates",
  "batches",
  "logs",
  "units",
];

function requireRalphyLayout(verb: string): void {
  if (layoutMode() === "legacy") raiseError("E_LEGACY_LAYOUT", { verb });
}

async function readWorkspaceManifest(slug: string): Promise<WorkspaceManifest | null> {
  try {
    return parseWorkspaceManifest(
      JSON.parse(await fs.readFile(workspaceManifestPath(slug), "utf8")),
    );
  } catch {
    return null;
  }
}

async function writeWorkspaceManifest(manifest: WorkspaceManifest): Promise<void> {
  await fs.writeFile(
    workspaceManifestPath(manifest.slug),
    JSON.stringify(manifest, null, 2) + "\n",
  );
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

async function workspaceSlugs(): Promise<string[]> {
  try {
    return (await fs.readdir(workspacesDir(), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
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
    .command("create <slug>")
    .description("Create an account workspace with shared assets, projects, and content units")
    .option("--name <name>", "Display name (default: slug)")
    .option("--description <text>", "Account, studio, or client description")
    .action(async (slug: string, opts) => {
      requireRalphyLayout("workspace create");
      if (!SLUG_RE.test(slug)) {
        raiseError("E_VALIDATION_FAILED", {
          target: "slug",
          detail: `'${slug}' is not a valid workspace slug (lowercase kebab-case)`,
        });
      }
      if (existsSync(workspaceDir(slug))) {
        raiseError("E_ALREADY_EXISTS", { kind: "Workspace", id: slug });
      }
      await Promise.all(
        WORKSPACE_DIRS.map((relative) =>
          fs.mkdir(path.join(workspaceDir(slug), relative), { recursive: true }),
        ),
      );
      const manifest = parseWorkspaceManifest({
        slug,
        name: opts.name || slug,
        description: opts.description || "",
        created: new Date().toISOString(),
      });
      await writeWorkspaceManifest(manifest);
      ok(`Workspace created: ${slug}`);
      out({ ...manifest, path: workspaceDir(slug) });
    });

  cmd
    .command("list")
    .description("List account workspaces")
    .action(async () => {
      requireRalphyLayout("workspace list");
      const context = getCommandContext();
      const slugs = (await workspaceSlugs()).filter(
        (slug) => context === null || slug === context.workspaceId,
      );
      if (slugs.length === 0) {
        out([
          {
            slug: context?.workspaceId ?? DEFAULT_WORKSPACE,
            name: context?.workspaceId ?? DEFAULT_WORKSPACE,
            projects: 0,
            units: 0,
            implicit: true,
          },
        ]);
        return;
      }
      out(
        await Promise.all(
          slugs.map(async (slug) => {
            const manifest = await readWorkspaceManifest(slug);
            return {
              slug,
              name: manifest?.name || slug,
              projects: await countDirs(path.join(workspaceDir(slug), "projects")),
              units: await countDirs(workspaceUnitsDir(slug)),
            };
          }),
        ),
      );
    });

  cmd
    .command("show <slug>")
    .description("Show account profile, channels, shared assets, projects, and units")
    .action(async (slug: string) => {
      requireRalphyLayout("workspace show");
      requireWorkspace(slug);
      const manifest = (await readWorkspaceManifest(slug)) ||
        parseWorkspaceManifest({ slug, name: slug });
      const projects = (await fs.readdir(path.join(workspaceDir(slug), "projects"), {
        withFileTypes: true,
      }).catch(() => []))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      out({
        ...manifest,
        path: workspaceDir(slug),
        projects,
        sharedAssets: await sharedAssetInventory(slug),
        workspaceUnits: await countDirs(workspaceUnitsDir(slug)),
      });
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
    .command("update <slug>")
    .description("Update account profile and public channel handles")
    .option("--name <name>", "Workspace name")
    .option("--description <text>", "Workspace description")
    .option("--display-name <name>", "Public account display name")
    .option("--bio <text>", "Public account bio")
    .option("--language <language>", "Default content language")
    .option("--timezone <timezone>", "Account timezone")
    .option("--telegram <handle>", "Telegram channel handle")
    .option("--x <handle>", "X account handle")
    .option("--threads <handle>", "Threads account handle")
    .option("--devto <handle>", "dev.to account handle")
    .option("--medium <handle>", "Medium account handle")
    .action(async (slug: string, opts) => {
      requireRalphyLayout("workspace update");
      requireWorkspace(slug);
      const current = await readWorkspaceManifest(slug);
      if (!current) {
        raiseError("E_INPUT_INVALID", {
          field: "workspace.json",
          detail: "workspace manifest is missing or invalid",
          verb: "workspace update",
        });
      }
      const profileFields = ["displayName", "bio", "language", "timezone"] as const;
      const hasPatch =
        opts.name !== undefined ||
        opts.description !== undefined ||
        profileFields.some((key) => opts[key] !== undefined) ||
        WORKSPACE_CHANNELS.some((channel) => opts[channel] !== undefined);
      if (!hasPatch) {
        raiseError("E_INPUT_INVALID", {
          field: "flags",
          detail: "nothing to update — pass a profile field or channel handle",
          verb: "workspace update",
        });
      }
      const profile = { ...current.profile };
      for (const key of profileFields) {
        if (opts[key] !== undefined) profile[key] = String(opts[key]);
      }
      const channels: Record<string, { handle?: string } | undefined> = {
        ...current.channels,
      };
      for (const channel of WORKSPACE_CHANNELS) {
        if (opts[channel] !== undefined) channels[channel] = { handle: String(opts[channel]) };
      }
      const updated = parseWorkspaceManifest({
        ...current,
        name: opts.name ?? current.name,
        description: opts.description ?? current.description,
        profile,
        channels,
      });
      await writeWorkspaceManifest(updated);
      ok(`Workspace updated: ${slug}`);
      out(updated);
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
        const jsonPath = path.join(projectDir(project), WORKSPACE_EVAL_ARTIFACT);
        const reportPath = path.join(projectDir(project), WORKSPACE_EVAL_REPORT);
        await protectExistingAsset(jsonPath, false);
        await protectExistingAsset(reportPath, false);
        await fs.writeFile(jsonPath, JSON.stringify(result, null, 2));
        await fs.writeFile(reportPath, renderWorkspaceEvalMarkdown(result));
        out({
          verdict: result.overall.verdict,
          score: result.overall.score,
          workspace: result.workspace,
          projectId: result.projectId,
          criteria: result.criteria.length,
          summary: result.overall.summary,
          jsonPath,
          mdPath: reportPath,
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
