// Interactive setup wizard — `ralphy setup`.
//
// Multi-step TUI built on @clack/prompts. Detects existing keys, prompts for
// the missing ones (with API ping verification), offers public profiles to
// import, and optionally launches Studio + dashboard. Re-runnable safely.
//
// Sub-commands:
//   ralphy setup              — full interactive wizard
//   ralphy setup --status     — JSON capability status (for skill scripts)
//   ralphy setup --link <p>   — point ralphy at a project dir (global config)

import { Command } from "commander";
import * as p from "@clack/prompts";
import path from "node:path";
import fs from "node:fs/promises";
import net from "node:net";
import { spawn } from "node:child_process";
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
import { ok, out, err } from "../lib/output.js";
import { profileCmd } from "./profile.js";

export function setupCmd() {
  return new Command("setup")
    .description("Interactive setup wizard — API keys, profiles, dev services")
    .option("--status", "Print capability status as JSON and exit (no TUI)")
    .option("--link <path>", "Link ralphy to a project directory (global config)")
    .option("--unlink", "Remove the global project link")
    .action(async (opts: { status?: boolean; link?: string; unlink?: boolean }) => {
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
      await runWizard();
    });
}

async function runWizard(): Promise<void> {
  p.intro("ralphy setup");

  // 1. Project root — auto-detect or ask. Idempotent: don't rewrite the global
  //    config if we resolved the same project as last time.
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

  // 2. Show capability status
  const keyed = CAPABILITIES.filter((c): c is Capability & { envVar: string } => c.envVar !== null);
  const statusLines = keyed.map((c) => {
    const set = Boolean(existing[c.envVar]);
    const tag = set ? "[ ✓ set    ]" : c.required ? "[ • needed ]" : "[ optional ]";
    return `${tag}  ${c.label.padEnd(28)} ${c.envVar}`;
  });
  p.note(statusLines.join("\n"), "Current keys");

  // 3. Multi-select providers to (re)configure
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

  // 4. Prompt for each selected key, verify with API ping
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

  // 5. Profile picker — annotate already-imported profiles. Re-importing is
  //    safe (additive) but we tell the user so they don't do it accidentally.
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

  // 6. Dev services? Only ask if at least one port is free; otherwise skip
  //    silently (idempotent re-runs shouldn't spam EADDRINUSE).
  const studioBusy = await isPortBusy(3000);
  const dashboardBusy = await isPortBusy(4321);
  let startSvcs = false;
  if (studioBusy && dashboardBusy) {
    p.note(
      "Studio (port 3000) and dashboard (port 4321) already running — skipping.",
      "Services",
    );
  } else {
    const ans = await p.confirm({
      message:
        studioBusy
          ? "Start dashboard? (Studio already running on :3000)"
          : dashboardBusy
            ? "Start Remotion Studio? (dashboard already running on :4321)"
            : "Start Remotion Studio + dashboard now?",
      initialValue: false,
    });
    if (p.isCancel(ans)) return cancelled();
    startSvcs = ans;
  }

  // 7. Apply changes — only what's actually new.
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
      // Commander programmatic invocation. cwd-sensitive code uses paths.ts root,
      // so chdir into projectRoot for the duration.
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

  // Persist imports history (dedupe on name — keep latest timestamp).
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

  if (startSvcs) {
    const lines: string[] = [];
    if (!studioBusy) {
      spawn("bun", ["run", "dev"], {
        cwd: projectRoot,
        detached: true,
        stdio: "ignore",
      }).unref();
      lines.push("Studio  → http://localhost:3000");
    }
    if (!dashboardBusy) {
      spawn("bun", ["run", "dashboard"], {
        cwd: projectRoot,
        detached: true,
        stdio: "ignore",
      }).unref();
      lines.push("Dashboard → http://localhost:4321");
    }
    if (lines.length > 0) p.note(lines.join("\n"), "Started in background");
  }

  p.outro("Done. Try: ralphy status");
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
      case "FAL_KEY": {
        // No public whoami. Hit a request that requires auth — anything other
        // than 401/403 means the key is plausibly valid.
        const r = await fetch("https://queue.fal.run/fal-ai/recraft-v3", {
          method: "GET",
          headers: { Authorization: `Key ${value}` },
          signal: ctrl,
        });
        return r.status !== 401 && r.status !== 403;
      }
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
      case "VERCEL_AI_GATEWAY_KEY": {
        const r = await fetch("https://ai-gateway.vercel.sh/v1/models", {
          headers: { Authorization: `Bearer ${value}` },
          signal: ctrl,
        });
        return r.ok;
      }
      case "OPENAI_API_KEY": {
        const r = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${value}` },
          signal: ctrl,
        });
        return r.ok;
      }
      case "REPLICATE_API_KEY": {
        const r = await fetch("https://api.replicate.com/v1/account", {
          headers: { Authorization: `Token ${value}` },
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

/**
 * Returns true if something is already listening on the given port. Used to
 * make `ralphy setup` idempotent — we don't try to spawn a second Studio /
 * dashboard on top of a running one.
 */
function isPortBusy(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: "127.0.0.1" });
    const settle = (busy: boolean) => {
      sock.removeAllListeners();
      sock.destroy();
      resolve(busy);
    };
    sock.once("connect", () => settle(true));
    sock.once("error", () => settle(false));
    sock.setTimeout(500, () => settle(false));
  });
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

