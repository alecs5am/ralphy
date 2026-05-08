// Setup wizard — `ralphy setup`.
//
// v2: prompts for two keys only — OPENROUTER_API_KEY + ELEVENLABS_API_KEY —
// pings each via API verify, optionally imports a public profile. Does NOT
// auto-launch Studio or dashboard (AGENTS.md hard rule #5). Re-runnable safely.
//
// Modes:
//   ralphy setup                              — interactive TUI wizard
//   ralphy setup --status                     — JSON capability status (read-only)
//   ralphy setup --link <p> / --unlink        — manage the global project link
//   ralphy setup --non-interactive [flags]    — agent / CI-friendly. No TUI.
//                                               Reads keys from flags, stdin (via
//                                               `-`), or process.env. Emits a
//                                               structured JSON summary on stdout.
//
// Non-interactive examples (Claude Code in a terminal):
//   ralphy setup -y --keys-from-env
//   ralphy setup -y --openrouter-key sk-or-... --elevenlabs-key xi-...
//   cat key.txt | ralphy setup -y --openrouter-key -
//   ralphy setup -y --project-dir /path/to/ugc-cli --no-verify
//   ralphy setup -y --import-profile demo,starter

import { Command } from "commander";
import * as p from "@clack/prompts";
import path from "node:path";
import fs from "node:fs/promises";
import {
  CAPABILITIES,
  getCapabilityStatus,
  type Capability,
} from "../lib/capabilities.js";
import {
  findProjectRootSafe,
  readGlobalConfig,
  writeGlobalConfig,
  type ImportedProfile,
} from "../lib/project-root.js";
import { ok, out, err, isPretty } from "../lib/output.js";
import { profileCmd } from "./profile.js";

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
  importProfile?: string[];
  verify?: boolean;
  allowUnverified?: boolean;
};

export function setupCmd() {
  return new Command("setup")
    .description("Setup wizard — API keys, profiles, dev services")
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
      "Set OPENROUTER_API_KEY (use `-` to read from stdin). Implies --non-interactive",
    )
    .option(
      "--elevenlabs-key <key>",
      "Set ELEVENLABS_API_KEY (use `-` to read from stdin). Implies --non-interactive",
    )
    .option(
      "--keys-from-env",
      "Pick up OPENROUTER_API_KEY / ELEVENLABS_API_KEY from the current process env. Implies --non-interactive",
      false,
    )
    .option(
      "--project-dir <path>",
      "Link ralphy to this project directory before configuring keys. Implies --non-interactive",
    )
    .option(
      "--import-profile <names>",
      "Comma-separated profile names to import (additive, safe to re-run)",
      collectCsv,
      [] as string[],
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

      // Any of these flags forces non-interactive mode — the user is clearly
      // scripting rather than driving the TUI by hand.
      const niTriggers =
        opts.nonInteractive ||
        opts.yes ||
        opts.openrouterKey != null ||
        opts.elevenlabsKey != null ||
        opts.keysFromEnv ||
        opts.projectDir != null ||
        (opts.importProfile && opts.importProfile.length > 0);

      if (niTriggers) {
        await runNonInteractive(opts);
        return;
      }

      await runWizard();
    });
}

function collectCsv(value: string, prev: string[]): string[] {
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...prev, ...parts];
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
    imports: [] as { name: string; ok: boolean; reason?: string }[],
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

  // 2. Collect keys from flags / stdin / env.
  const provided: Record<string, string> = {};
  try {
    const orKey = await resolveKeyFlag(opts.openrouterKey, "OPENROUTER_API_KEY");
    if (orKey) provided.OPENROUTER_API_KEY = orKey;
    const elKey = await resolveKeyFlag(opts.elevenlabsKey, "ELEVENLABS_API_KEY");
    if (elKey) provided.ELEVENLABS_API_KEY = elKey;
  } catch (e) {
    summary.errors.push((e as Error).message);
    out(summary);
    process.exit(1);
  }

  if (opts.keysFromEnv) {
    for (const cap of CAPABILITIES) {
      if (provided[cap.envVar]) continue; // explicit flag wins
      const v = process.env[cap.envVar];
      if (v) provided[cap.envVar] = v;
    }
  }

  // 3. Verify + persist keys.
  const verify = opts.verify !== false; // commander --no-verify flips to false
  const updates: Record<string, string> = {};
  let verifyFailureFatal = false;

  for (const cap of CAPABILITIES) {
    const value = provided[cap.envVar];
    if (!value) continue;

    let verified: boolean | null = null;
    let reason: string | undefined;
    if (verify) {
      verified = await verifyKey(cap.envVar, value);
      if (!verified && !opts.allowUnverified) {
        reason = "verification failed (provider rejected the key); pass --allow-unverified to save anyway";
        summary.keys.push({ envVar: cap.envVar, saved: false, verified, reason });
        verifyFailureFatal = true;
        continue;
      }
      if (!verified && opts.allowUnverified) {
        reason = "verification failed but --allow-unverified set; saving anyway";
      }
    } else {
      reason = "verification skipped (--no-verify)";
    }

    updates[cap.envVar] = value;
    summary.keys.push({ envVar: cap.envVar, saved: true, verified, reason });
  }

  if (Object.keys(updates).length > 0) {
    await applyEnvUpdates(path.join(projectRoot, ".env"), updates);
  }

  // 4. Profile imports.
  const profilesToImport = opts.importProfile ?? [];
  if (profilesToImport.length > 0) {
    const importedThisRun: ImportedProfile[] = [];
    for (const profName of profilesToImport) {
      try {
        const cmd = profileCmd();
        const prevCwd = process.cwd();
        process.chdir(projectRoot);
        try {
          await cmd.parseAsync(["import", profName], { from: "user" });
        } finally {
          process.chdir(prevCwd);
        }
        summary.imports.push({ name: profName, ok: true });
        importedThisRun.push({ name: profName, imported_at: new Date().toISOString() });
      } catch (e) {
        summary.imports.push({ name: profName, ok: false, reason: (e as Error).message });
      }
    }

    if (importedThisRun.length > 0) {
      const cfgNow = await readGlobalConfig();
      const merged = new Map<string, ImportedProfile>();
      for (const i of cfgNow.imports ?? []) merged.set(i.name, i);
      for (const i of importedThisRun) merged.set(i.name, i);
      await writeGlobalConfig({
        ...cfgNow,
        default_project_dir: projectRoot,
        imports: [...merged.values()].sort((a, b) => a.name.localeCompare(b.name)),
      });
    }
  }

  // 5. Re-snapshot capabilities so the summary reflects the post-write state.
  //    We have to source from the .env we just wrote, since process.env was
  //    captured at startup and may lag what's now on disk.
  const envOnDisk = await readDotenv(path.join(projectRoot, ".env"));
  for (const k of Object.keys(updates)) {
    if (envOnDisk[k]) process.env[k] = envOnDisk[k];
  }
  summary.capabilities = getCapabilityStatus();

  if (verifyFailureFatal) {
    out(summary);
    process.exit(1);
  }

  if (isPretty()) ok(`Setup complete (${Object.keys(updates).length} key(s) saved)`);
  out(summary);
}

async function resolveKeyFlag(flag: string | undefined, envVar: string): Promise<string | null> {
  if (flag == null) return null;
  if (flag === "-") {
    const stdinValue = await readAllStdin();
    if (!stdinValue) {
      throw new Error(`empty stdin while reading ${envVar}`);
    }
    return stdinValue.trim();
  }
  const trimmed = flag.trim();
  if (!trimmed) {
    throw new Error(`empty value for ${envVar}`);
  }
  return trimmed;
}

let _stdinCache: Promise<string> | null = null;
function readAllStdin(): Promise<string> {
  // Cache so multiple `-` flags can in principle share, but we error before
  // that in practice. Node treats stdin as a one-shot stream.
  if (_stdinCache) return _stdinCache;
  _stdinCache = new Promise<string>((resolve, reject) => {
    if (process.stdin.isTTY) {
      reject(new Error("stdin is a TTY — pipe data in, e.g. `cat key.txt | ralphy setup --openrouter-key -`"));
      return;
    }
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
  return _stdinCache;
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

  const envPath = path.join(projectRoot, ".env");
  const existing = await readDotenv(envPath);

  const keyed: Capability[] = CAPABILITIES;
  const statusLines = keyed.map((c) => {
    const set = Boolean(existing[c.envVar]);
    const tag = set ? "[ ✓ set    ]" : c.required ? "[ • needed ]" : "[ optional ]";
    return `${tag}  ${c.label.padEnd(28)} ${c.envVar}`;
  });
  p.note(statusLines.join("\n"), "Current keys");

  const preselect = keyed.filter((c) => !existing[c.envVar]).map((c) => c.id);
  const picks = await p.multiselect({
    message: "Which providers do you want to set up?",
    options: keyed.map((c) => ({
      value: c.id,
      label: `${c.label}${existing[c.envVar] ? " (already set — pick to overwrite)" : ""}`,
      hint: c.description,
    })),
    initialValues: preselect,
    required: false,
  });
  if (p.isCancel(picks)) return cancelled();

  const updates: Record<string, string> = {};
  for (const id of picks as string[]) {
    const cap = keyed.find((c) => c.id === id);
    if (!cap) continue;
    const value = await p.password({
      message: `${cap.label} — enter ${cap.envVar} (Ctrl+C to skip remaining)`,
      validate: (v) => {
        if (!v && !existing[cap.envVar]) return "Required, or hit Esc to skip";
        return undefined;
      },
    });
    if (p.isCancel(value)) return cancelled();
    if (!value || value === existing[cap.envVar]) continue;

    const sp = p.spinner();
    sp.start(`Verifying ${cap.label}…`);
    const verified = await verifyKey(cap.envVar, value);
    sp.stop(
      verified
        ? `✓ ${cap.label} verified`
        : `! ${cap.label} could not be verified — saving anyway`,
    );
    updates[cap.envVar] = value;
  }

  const profilesAvail = await listAvailableProfiles(projectRoot);
  const importedSet = new Set((globalCfg.imports ?? []).map((i) => i.name));
  let pickedProfiles: string[] = [];
  if (profilesAvail.length > 0) {
    const sel = await p.multiselect({
      message: "Import a public profile? (templates, references, example projects)",
      options: profilesAvail.map((prof) => ({
        value: prof.name,
        label: prof.name + (importedSet.has(prof.name) ? "  (imported — re-import is safe)" : ""),
        hint: prof.summary,
      })),
      required: false,
    });
    if (p.isCancel(sel)) return cancelled();
    pickedProfiles = sel as string[];
  }

  if (Object.keys(updates).length > 0) {
    const sp = p.spinner();
    sp.start("Saving .env…");
    await applyEnvUpdates(envPath, updates);
    sp.stop(
      `Saved .env (${Object.keys(updates).length} key${Object.keys(updates).length === 1 ? "" : "s"})`,
    );
  }

  const importedThisRun: ImportedProfile[] = [];
  for (const profName of pickedProfiles) {
    const sp = p.spinner();
    sp.start(`Importing profile ${profName}…`);
    try {
      const cmd = profileCmd();
      const prevCwd = process.cwd();
      process.chdir(projectRoot);
      try {
        await cmd.parseAsync(["import", profName], { from: "user" });
      } finally {
        process.chdir(prevCwd);
      }
      sp.stop(`✓ Imported ${profName}`);
      importedThisRun.push({ name: profName, imported_at: new Date().toISOString() });
    } catch (e) {
      sp.stop(`! Import ${profName} failed: ${(e as Error).message}`);
    }
  }

  if (importedThisRun.length > 0) {
    const merged = new Map<string, ImportedProfile>();
    for (const i of globalCfg.imports ?? []) merged.set(i.name, i);
    for (const i of importedThisRun) merged.set(i.name, i);
    await writeGlobalConfig({
      ...globalCfg,
      default_project_dir: projectRoot,
      imports: [...merged.values()].sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  p.outro("Done. Try: ralphy doctor");
}

function cancelled(): void {
  p.cancel("Cancelled.");
  process.exit(0);
}

async function readDotenv(envPath: string): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(envPath, "utf-8");
    const result: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      result[k] = v;
    }
    return result;
  } catch {
    return {};
  }
}

async function applyEnvUpdates(envPath: string, updates: Record<string, string>): Promise<void> {
  let content = "";
  try {
    content = await fs.readFile(envPath, "utf-8");
  } catch {
    /* fresh */
  }
  const lines = content.split("\n");
  const seen = new Set<string>();

  const newLines = lines.map((line) => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (m && updates[m[1]] !== undefined) {
      seen.add(m[1]);
      return `${m[1]}=${updates[m[1]]}`;
    }
    return line;
  });

  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) newLines.push(`${k}=${v}`);
  }

  while (newLines.length > 0 && newLines[newLines.length - 1] === "") newLines.pop();
  await fs.mkdir(path.dirname(envPath), { recursive: true });
  await fs.writeFile(envPath, newLines.join("\n") + "\n");
}

async function verifyKey(envVar: string, value: string): Promise<boolean> {
  const ctrl = AbortSignal.timeout(8000);
  try {
    switch (envVar) {
      case "ELEVENLABS_API_KEY": {
        const r = await fetch("https://api.elevenlabs.io/v1/user", {
          headers: { "xi-api-key": value },
          signal: ctrl,
        });
        return r.ok;
      }
      case "OPENROUTER_API_KEY": {
        const r = await fetch("https://openrouter.ai/api/v1/auth/key", {
          headers: { Authorization: `Bearer ${value}` },
          signal: ctrl,
        });
        return r.ok;
      }
      default:
        return true;
    }
  } catch {
    return false;
  }
}

async function listAvailableProfiles(
  projectRoot: string,
): Promise<Array<{ name: string; summary: string }>> {
  const dir = path.join(projectRoot, "profiles");
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const profiles = await Promise.all(
      entries
        .filter((e) => e.isDirectory())
        .map(async (e) => {
          const meta = await fs
            .readFile(path.join(dir, e.name, "PROFILE.md"), "utf-8")
            .catch(() => "");
          const filesMatch = meta.match(/\*\*Files:\*\* ([^\n]+)/);
          return {
            name: e.name,
            summary: filesMatch?.[1]?.trim() ?? "",
          };
        }),
    );
    return profiles;
  } catch {
    return [];
  }
}
