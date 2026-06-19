import { Command } from "commander";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import {
  workspace,
  projectsDir,
  batchesDir,
  referencesDir,
  artifactsDir,
  projectDir,
  layoutMode,
  workspacesDir,
  workspaceDir,
  workspaceManifestPath,
  templatesDir,
  DEFAULT_WORKSPACE,
} from "../lib/paths.js";
import { setActiveWorkspace, getActiveWorkspace } from "../lib/registry.js";
import { out, ok, err } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import {
  runWorkspaceEval,
  renderWorkspaceEvalMarkdown,
  WORKSPACE_EVAL_ARTIFACT,
  WORKSPACE_EVAL_REPORT,
} from "../lib/eval/workspace-evaluators.js";
import { protectExistingAsset } from "../lib/providers/shared.js";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** commander reducer to collect repeatable options into an array. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        try {
          const stat = await fs.stat(path.join(entry.parentPath || (entry as any).path, entry.name));
          total += stat.size;
        } catch {}
      }
    }
  } catch {}
  return total;
}

async function countDirs(dir: string): Promise<number> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).length;
  } catch {
    return 0;
  }
}

function requireRalphyLayout(verb: string) {
  if (layoutMode() === "legacy") {
    // #106 fail-fast: every workspace verb requires the .ralphy/ root. This
    // explicit guard short-circuits before any path helper throws so the
    // refusal is immediate and carries the catalog payload.
    raiseError("E_LEGACY_LAYOUT", { verb });
  }
}

async function readWorkspaceManifest(slug: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(workspaceManifestPath(slug), "utf-8"));
  } catch {
    return null;
  }
}

async function listWorkspaceSlugs(): Promise<string[]> {
  try {
    const entries = await fs.readdir(workspacesDir(), { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export function workspaceCmd() {
  const cmd = new Command("workspace").description(
    "Manage workspaces (studio / universe groupings of projects with a shared/ asset tier)",
  );

  // ── create (#108) ──────────────────────────────────────────────────────
  cmd
    .command("create <slug>")
    .description("Create a workspace: .ralphy/workspaces/<slug>/{workspace.json,shared/,projects/,templates/,batches/}")
    .option("--name <name>", "Display name (default: the slug)")
    .option("--description <d>", "What this workspace groups (studio / universe / client)")
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
      for (const sub of ["shared", "projects", "templates", "batches"]) {
        await fs.mkdir(path.join(workspaceDir(slug), sub), { recursive: true });
      }
      const manifest = {
        name: opts.name || slug,
        slug,
        created: new Date().toISOString(),
        description: opts.description || "",
      };
      await fs.writeFile(workspaceManifestPath(slug), JSON.stringify(manifest, null, 2) + "\n");
      ok(`Workspace created: ${slug}`);
      out({ ...manifest, path: workspaceDir(slug) });
    });

  // ── list (#108) ────────────────────────────────────────────────────────
  cmd
    .command("list")
    .description("List workspaces (slug, name, project count)")
    .action(async () => {
      requireRalphyLayout("workspace list");
      const active = await getActiveWorkspace();
      const slugs = await listWorkspaceSlugs();
      if (slugs.length === 0) {
        // Fresh root with no explicit workspaces yet — the implicit default.
        out([
          {
            slug: DEFAULT_WORKSPACE,
            name: DEFAULT_WORKSPACE,
            projects: await countDirs(path.join(workspaceDir(DEFAULT_WORKSPACE), "projects")),
            active: active === DEFAULT_WORKSPACE,
            implicit: true,
          },
        ]);
        return;
      }
      const rows = [];
      for (const slug of slugs) {
        const manifest = await readWorkspaceManifest(slug);
        rows.push({
          slug,
          name: (manifest?.name as string) || slug,
          projects: await countDirs(path.join(workspaceDir(slug), "projects")),
          active: slug === active,
        });
      }
      out(rows);
    });

  // ── show (#108) ────────────────────────────────────────────────────────
  cmd
    .command("show <slug>")
    .description("Show a workspace: workspace.json + project list")
    .action(async (slug: string) => {
      requireRalphyLayout("workspace show");
      const dir = workspaceDir(slug);
      if (!existsSync(dir)) {
        raiseError("E_NOT_FOUND", { kind: "Workspace", id: slug });
      }
      const manifest = (await readWorkspaceManifest(slug)) || { slug, name: slug };
      const entries = await fs.readdir(path.join(dir, "projects"), { withFileTypes: true }).catch(() => []);
      const projects = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
      out({ ...manifest, path: dir, active: (await getActiveWorkspace()) === slug, projects });
    });

  // ── use (#108) ─────────────────────────────────────────────────────────
  cmd
    .command("use <slug>")
    .description("Set the active workspace (the default home for new projects)")
    .action(async (slug: string) => {
      requireRalphyLayout("workspace use");
      if (slug !== DEFAULT_WORKSPACE && !existsSync(workspaceDir(slug))) {
        raiseError("E_NOT_FOUND", { kind: "Workspace", id: slug });
      }
      await setActiveWorkspace(slug);
      // #117 auto-recall: switching workspaces mid-session must surface that
      // workspace's memory without a separate call — fresh client facts ride
      // along on the switch itself. Best-effort; never breaks the switch.
      let memory: unknown = null;
      try {
        const { recall } = await import("../lib/memory/store.js");
        const r = await recall({ ws: slug });
        memory = {
          workspace: r.workspace,
          count: r.count,
          truncated: r.truncated,
          note: r.note,
          entries: r.entries.map((e) => ({ slug: e.slug, tier: e.tier, description: e.description })),
        };
      } catch {
        /* no memory yet — omit */
      }
      ok(`Active workspace: ${slug}`);
      out({ activeWorkspace: slug, memory });
    });

  // ── eval (#469) ────────────────────────────────────────────────────────
  cmd
    .command("eval <project>")
    .description(
      "Score a project against its workspace's custom evaluator rubric (#468 config) and write workspace-eval.json + workspace-eval-report.md (append-only). Deterministic criteria run in code (via their validatorId — #470 wires the builtins; an unregistered id is reported as na, never an error); vision criteria run ONE ISOLATED deep-vision pass PER criterion (#477), each loading only its own rubric (inline rubricPrompt > rubricFile > builtin fragment > label) for focused, non-diluted context. The overall verdict uses the #427 readiness vocab (ship | repair | needs-user-decision | blocked). Use --criterion to re-run a single rubric in isolation: the fresh result merges over the prior workspace-eval.json so the other criteria are not re-spent. Example: ralphy workspace eval choose-silenthill-001 --criterion scenario-fidelity",
    )
    .option("--no-vision", "Skip the vision pass entirely (deterministic criteria only — no model call)")
    .option("--model <id>", "Override the deep-vision model (default google/gemini-3.1-pro-preview)")
    .option("--workspace <slug>", "Override the rubric workspace (default: the project's registered workspace)")
    .option("--video <path>", "Override the scored video (default: <project>/render/final.mp4)")
    .option(
      "--criterion <id>",
      "Run ONLY this criterion (repeatable; re-runs merge over the prior workspace-eval.json so other criteria aren't re-spent)",
      collect,
      [],
    )
    .action(async (project: string, opts) => {
      requireRalphyLayout("workspace eval");
      try {
        const criteria = (opts.criterion as string[]) ?? [];
        const result = await runWorkspaceEval(project, {
          noVision: opts.vision === false,
          model: opts.model as string | undefined,
          workspace: opts.workspace as string | undefined,
          video: opts.video as string | undefined,
          criteria: criteria.length > 0 ? criteria : undefined,
        });

        // Append-only persistence: archive any existing report to .vN first.
        const dest = path.join(projectDir(project), WORKSPACE_EVAL_ARTIFACT);
        await protectExistingAsset(dest, false);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, JSON.stringify(result, null, 2));

        const mdDest = path.join(projectDir(project), WORKSPACE_EVAL_REPORT);
        await protectExistingAsset(mdDest, false);
        await fs.writeFile(mdDest, renderWorkspaceEvalMarkdown(result));

        out({
          verdict: result.overall.verdict,
          score: result.overall.score,
          workspace: result.workspace,
          projectId: result.projectId,
          criteria: result.criteria.length,
          summary: result.overall.summary,
          jsonPath: dest,
          mdPath: mdDest,
        });
      } catch (e) {
        err(`workspace eval failed: ${(e as Error).message}`);
      }
    });

  // ── stats (pre-#108) ───────────────────────────────────────────────────
  cmd
    .command("stats")
    .description("Show workspace statistics")
    .action(async () => {
      const projectCount = await countDirs(projectsDir());
      const batchCount = await countDirs(batchesDir());
      const refCount = await countDirs(referencesDir());
      const totalBytes = await dirSize(workspace());
      const mb = Math.round((totalBytes / 1024 / 1024) * 100) / 100;

      out({
        projects: projectCount,
        batches: batchCount,
        references: refCount,
        totalSizeMB: mb,
        path: workspace(),
      });
    });

  cmd
    .command("clean")
    .description("Clean workspace contents")
    .option("--renders", "Only remove rendered videos")
    .option("--assets", "Only remove generated assets")
    .option("--all", "Remove everything in workspace (keeps engine config)")
    .action(async (opts) => {
      if (opts.renders) {
        const projects = await fs.readdir(projectsDir()).catch(() => [] as string[]);
        for (const p of projects) {
          await fs.rm(path.join(projectDir(p), "render"), { recursive: true, force: true });
          await fs.mkdir(path.join(projectDir(p), "render"), { recursive: true });
        }
        ok("Renders cleaned");
        out({ cleaned: "renders" });
      } else if (opts.assets) {
        const projects = await fs.readdir(projectsDir()).catch(() => [] as string[]);
        for (const p of projects) {
          await fs.rm(artifactsDir(p), { recursive: true, force: true });
          await fs.mkdir(artifactsDir(p), { recursive: true });
        }
        ok("Assets cleaned");
        out({ cleaned: "assets" });
      } else if (opts.all) {
        // Keep engine config; remove the active workspace's data dirs +
        // global references. The dirs resolve per layout mode (#108).
        for (const dir of [projectsDir(), batchesDir(), referencesDir(), templatesDir()]) {
          await fs.rm(dir, { recursive: true, force: true });
          await fs.mkdir(dir, { recursive: true });
        }
        ok("Workspace cleaned (config preserved)");
        out({ cleaned: "all" });
      } else {
        out({ error: "Specify --renders, --assets, or --all" });
      }
    });

  return cmd;
}
