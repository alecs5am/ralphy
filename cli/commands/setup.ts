// Setup wizard — `ralphy setup`.
//
// Initializes a local SQLite workspace without requiring a source checkout.
// Credentials remain scoped and are entered with provider auth set --stdin.
//
// Modes:
//   ralphy setup                              — interactive TUI wizard
//   ralphy setup --status                     — JSON capability status (read-only)
//   ralphy setup --link <p> / --unlink        — manage the global project link
//   ralphy setup --non-interactive [flags]    — agent / CI-friendly. No TUI.
//                                               Credential flags are refused;
//                                               use provider auth set --stdin.
//
// Non-interactive examples (Claude Code in a terminal):
//   ralphy setup -y --project-dir /path/to/ugc-cli --no-verify

import { Command } from "commander";
import * as p from "@clack/prompts";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  getCapabilityStatus,
} from "../lib/capabilities.js";
import {
  findProjectRootSafe,
  readGlobalConfig,
  writeGlobalConfig,
} from "../lib/project-root.js";
import { ok, out, err, isPretty } from "../lib/output.js";
import { DomainError } from "../lib/errors/domain.js";
import { ralphDir, root, setDataRoot, setRoot } from "../lib/paths.js";
import { createWorkspace, listWorkspaces } from "../lib/store/scopes.js";
import { resolveDataRoot } from "../lib/context.js";
import { assertStartupJournalReady } from "../lib/migration/cutover-journal.js";

type SetupOpts = {
  status?: boolean;
  link?: string;
  unlink?: boolean;
  // Non-interactive
  nonInteractive?: boolean;
  yes?: boolean;
  openrouterKey?: string;
  elevenlabsKey?: string;
  keysFromEnv?: boolean;
  projectDir?: string;
  verify?: boolean;
  allowUnverified?: boolean;
  root?: string;
  cwd?: string;
};

export function setupCmd() {
  return new Command("setup")
    .description("Initialize a local Workspace and show provider credential instructions")
    .option("--status", "Print capability status as JSON and exit (no TUI)")
    .option("--link <path>", "Link ralphy to a source checkout (compatibility option)")
    .option("--unlink", "Remove the global project link")
    .option(
      "--non-interactive",
      "Agent / CI mode: never prompt, never open a TUI, emit a JSON summary",
      false,
    )
    .option("-y, --yes", "Alias for --non-interactive", false)
    .option(
      "--openrouter-key <key>",
      "Deprecated and refused; use provider auth set openrouter --stdin",
    )
    .option(
      "--elevenlabs-key <key>",
      "Deprecated and refused; use provider auth set elevenlabs --stdin",
    )
    .option(
      "--keys-from-env",
      "Deprecated and refused; project/inherited env is not a credential source",
      false,
    )
    .option(
      "--project-dir <path>",
      "Link ralphy to a source checkout and initialize its Workspace. Implies --non-interactive",
    )
    .option("--no-verify", "Compatibility flag; setup does not verify credentials")
    .option(
      "--allow-unverified",
      "Compatibility flag; setup does not accept or verify credentials",
      false,
    )
    .action(async (opts: SetupOpts, command: Command) => {
      const globals = command.optsWithGlobals();
      opts = { ...opts, root: globals.root, cwd: globals.cwd };
      if (opts.status) {
        out({
          capabilities: getCapabilityStatus(),
          project_dir: (await findProjectRootSafe()) ?? null,
        });
        return;
      }
      if (opts.unlink) {
        const cfg = await readGlobalConfig();
        if (!cfg.default_project_dir) {
          ok("No project link to remove");
          out({ already: "unlinked" });
          return;
        }
        await writeGlobalConfig({ ...cfg, default_project_dir: undefined });
        ok("Removed global project link");
        out({ unlinked: cfg.default_project_dir });
        return;
      }
      if (opts.link) {
        const target = path.resolve(opts.link);
        try {
          await fs.access(path.join(target, "package.json"));
        } catch {
          err(`Not a valid project dir: ${target}`);
        }
        const cfg = await readGlobalConfig();
        if (cfg.default_project_dir === target) {
          ok(`Already linked to ${target} (no change)`);
          out({ project_dir: target, changed: false });
          return;
        }
        await writeGlobalConfig({ ...cfg, default_project_dir: target });
        ok(`Linked ralphy → ${target}`);
        out({ project_dir: target, changed: true });
        return;
      }

      if (
        opts.openrouterKey != null ||
        opts.elevenlabsKey != null ||
        opts.keysFromEnv
      ) {
        throw new DomainError("E_INPUT_INVALID", undefined, {
          field: "credential",
          detail:
            "setup no longer accepts credential values; use `ralphy provider auth set <provider> --stdin`",
          verb: "setup",
        });
      }

      // Any of these flags forces non-interactive mode — the user is clearly
      // scripting rather than driving the TUI by hand.
      const niTriggers =
        opts.nonInteractive ||
        opts.yes ||
        opts.openrouterKey != null ||
        opts.elevenlabsKey != null ||
        opts.keysFromEnv ||
        opts.projectDir != null;

      if (niTriggers) {
        await runNonInteractive(opts);
        return;
      }

      await runWizard(opts);
    });
}

// ---------------------------------------------------------------------------
// Non-interactive path
// ---------------------------------------------------------------------------

type KeyResult = {
  envVar: string;
  saved: boolean;
  verified: boolean | null; // null when verification was skipped
  reason?: string; // populated on skip / failure
};

async function runNonInteractive(opts: SetupOpts): Promise<void> {
  const summary = {
    mode: "non-interactive" as const,
    project_dir: null as string | null,
    data_root: null as string | null,
    workspace_id: null as string | null,
    project_link_changed: false,
    keys: [] as KeyResult[],
    capabilities: [] as ReturnType<typeof getCapabilityStatus>,
    errors: [] as string[],
  };

  // 1. Resolve project root.
  let projectRoot: string | null = null;
  const globalCfg = await readGlobalConfig();
  if (opts.projectDir) {
    const target = path.resolve(opts.projectDir);
    try {
      await fs.access(path.join(target, "package.json"));
    } catch {
      summary.errors.push(`project_dir is not a valid project: ${target}`);
      out(summary);
      process.exit(1);
    }
    projectRoot = target;
    if (globalCfg.default_project_dir !== target) {
      await writeGlobalConfig({ ...globalCfg, default_project_dir: target });
      summary.project_link_changed = true;
    }
  } else {
    projectRoot = opts.root || opts.cwd ? null : await findProjectRootSafe();
  }

  summary.project_dir = projectRoot;
  if (projectRoot && !opts.root && !opts.cwd) setRoot(projectRoot);
  const initialized = await initializeWorkspace(Boolean(opts.root));
  summary.data_root = initialized.data_root;
  summary.workspace_id = initialized.workspace_id;

  summary.capabilities = getCapabilityStatus();
  if (isPretty()) ok("Setup complete");
  out(summary);
}

// ---------------------------------------------------------------------------
// Interactive first-run summary. Credential values never pass through argv.
// ---------------------------------------------------------------------------

async function runWizard(opts: SetupOpts): Promise<void> {
  p.intro("ralphy setup");
  const initialized = await initializeWorkspace(Boolean(opts.root));
  p.note(initialized.data_root, "Data directory");
  p.note(initialized.workspace_id ?? "Choose an explicit Workspace from `ralphy workspace list`", "Workspace");
  p.note(
    "Enter keys in your own terminal with `ralphy --root <data-directory> --workspace <workspace-id> provider auth set <provider> --stdin`. Never paste keys into chat.",
    "Credentials",
  );
  p.outro("Done. Try: ralphy doctor");
}

async function initializeWorkspace(explicitRoot: boolean): Promise<{ data_root: string; workspace_id: string | null }> {
  if (!explicitRoot) {
    let current = path.resolve(root());
    while (true) {
      const candidate = path.join(current, ".ralphy");
      assertStartupJournalReady(candidate);
      const exists = await fs.stat(candidate).then(() => true).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return false;
        throw error;
      });
      if (exists) {
        setDataRoot(candidate);
        break;
      }
      if (existsSync(path.join(current, "workspace", ".ralph")) ||
          existsSync(path.join(current, "workspace", "projects"))) {
        throw new DomainError("E_LEGACY_LAYOUT");
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  const dataRoot = ralphDir();
  // Never interpret an old JSON/filesystem store as an empty new library.
  // Prompt packs and caches may have been installed before setup.
  if (path.basename(dataRoot) === ".ralphy") assertStartupJournalReady(dataRoot);
  const entries = await fs.readdir(dataRoot).catch((error: NodeJS.ErrnoException): string[] => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  if (!entries.includes("ralphy.db") && entries.some((entry) => !["prompts", "cache"].includes(entry))) {
    throw new DomainError("E_MIGRATION_INCOMPLETE");
  }
  if (entries.includes("ralphy.db")) resolveDataRoot({ root: dataRoot });
  await fs.mkdir(dataRoot, { recursive: true });
  const workspaces = listWorkspaces({ limit: 2 }).items;
  const workspaceId = workspaces.length === 0
    ? createWorkspace({ slug: "default", name: "Default" }).id
    : workspaces.length === 1 ? workspaces[0]!.id : null;
  return { data_root: await fs.realpath(dataRoot), workspace_id: workspaceId };
}
