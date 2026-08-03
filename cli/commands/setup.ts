// Setup wizard — `ralphy setup`.
//
// v2: prompts for two keys only — OPENROUTER_API_KEY + ELEVENLABS_API_KEY —
// pings each via API verify. Does NOT auto-launch Studio or dashboard
// (AGENTS.md hard rule #5). Re-runnable safely.
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
};

export function setupCmd() {
  return new Command("setup")
    .description("Setup wizard — API keys, dev services")
    .option("--status", "Print capability status as JSON and exit (no TUI)")
    .option("--link <path>", "Link ralphy to a project directory (global config)")
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
      "Link ralphy to this project directory before configuring keys. Implies --non-interactive",
    )
    .option("--no-verify", "Skip API ping verification when saving keys")
    .option(
      "--allow-unverified",
      "When --verify is on (default) and a key fails to verify, save it anyway and exit 0",
      false,
    )
    .action(async (opts: SetupOpts) => {
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

      await runWizard();
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
    projectRoot = await findProjectRootSafe();
  }

  if (!projectRoot) {
    summary.errors.push(
      "no project root resolvable (cwd is not a ralphy project, no --project-dir passed, no prior `ralphy setup --link`)",
    );
    out(summary);
    process.exit(1);
  }
  summary.project_dir = projectRoot;

  summary.capabilities = getCapabilityStatus();
  if (isPretty()) ok("Setup complete");
  out(summary);
}

// ---------------------------------------------------------------------------
// Interactive wizard (unchanged from v2)
// ---------------------------------------------------------------------------

async function runWizard(): Promise<void> {
  p.intro("ralphy setup");

  const globalCfg = await readGlobalConfig();
  let projectRoot = await findProjectRootSafe();
  if (!projectRoot) {
    const picked = await p.text({
      message: "Path to your ugc-cli project directory:",
      placeholder: process.cwd(),
      validate: (val) => {
        if (!val) return "Required";
        return undefined;
      },
    });
    if (p.isCancel(picked)) return cancelled();
    projectRoot = path.resolve(picked);
    try {
      await fs.access(path.join(projectRoot, "package.json"));
    } catch {
      p.cancel(`No package.json at ${projectRoot}`);
      return;
    }
    await writeGlobalConfig({ ...globalCfg, default_project_dir: projectRoot });
    p.note(`Linked to ${projectRoot}`, "Project");
  } else {
    p.note(projectRoot, "Project");
  }

  p.note(
    "Pipe each credential to `ralphy provider auth set <provider> --stdin` after selecting an explicit Workspace or Project.",
    "Credentials",
  );
  p.outro("Done. Try: ralphy doctor");
}

function cancelled(): void {
  p.cancel("Cancelled.");
  process.exit(0);
}
