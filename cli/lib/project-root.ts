// Project root resolution — for when ralphy is installed globally.
//
// When the binary is in PATH (e.g. ~/.local/bin/ralphy) and the user runs
// it from anywhere, we need to find the ugc-cli project directory. Order:
//   1. Walk up from cwd, looking for package.json with name "ugc-cli"
//   2. RALPHY_PROJECT_DIR env var
//   3. ~/.config/ralphy/config.json default_project_dir (set by `ralphy setup --link`)
//   4. fail with a useful message
//
// In-tree dev (`bun run ralph -- ...`) hits #1 immediately because cwd is
// the project root.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const PROJECT_NAME = "ugc-cli";

export type ImportedProfile = {
  name: string;
  imported_at: string;
};

export type GlobalConfig = {
  default_project_dir?: string;
  /** Profiles the user has already imported via the wizard. Used to mark them
   *  as "(imported)" in the multi-select hint on subsequent runs — purely
   *  informational; profile import itself is additive and re-runs are safe. */
  imports?: ImportedProfile[];
};

export function globalConfigPath(): string {
  return path.join(os.homedir(), ".config", "ralphy", "config.json");
}

export async function readGlobalConfig(): Promise<GlobalConfig> {
  try {
    return JSON.parse(await fs.readFile(globalConfigPath(), "utf-8")) as GlobalConfig;
  } catch {
    return {};
  }
}

export async function writeGlobalConfig(cfg: GlobalConfig): Promise<void> {
  const p = globalConfigPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(cfg, null, 2) + "\n");
}

async function isProjectDir(dir: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(path.join(dir, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as { name?: string };
    return pkg.name === PROJECT_NAME;
  } catch {
    return false;
  }
}

async function walkUp(start: string): Promise<string | null> {
  let dir = path.resolve(start);
  // Bound the walk to avoid pathological filesystem layouts.
  for (let i = 0; i < 32; i++) {
    if (await isProjectDir(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

export async function findProjectRoot(): Promise<string> {
  const fromCwd = await walkUp(process.cwd());
  if (fromCwd) return fromCwd;

  const fromEnv = process.env.RALPHY_PROJECT_DIR;
  if (fromEnv) {
    const dir = path.resolve(fromEnv);
    if (await isProjectDir(dir)) return dir;
  }

  const cfg = await readGlobalConfig();
  if (cfg.default_project_dir && (await isProjectDir(cfg.default_project_dir))) {
    return cfg.default_project_dir;
  }

  throw new Error(
    `Could not locate the ugc-cli project.\n` +
      `  Run "ralphy setup --link <path>" to point ralphy at your checkout, or\n` +
      `  set RALPHY_PROJECT_DIR=/path/to/ugc-cli, or\n` +
      `  cd into the project directory first.`,
  );
}

export async function findProjectRootSafe(): Promise<string | null> {
  try {
    return await findProjectRoot();
  } catch {
    return null;
  }
}

/**
 * Load `<projectRoot>/.env` into `process.env` for any keys that are not
 * already set in the environment. Real shell-exported vars always win.
 *
 * Bun auto-loads `.env` from cwd at startup. When ralphy runs from a
 * different cwd than the project (the common case for the global binary),
 * we need to manually merge the project's keys.
 */
export async function loadProjectEnv(projectRoot: string): Promise<void> {
  const envPath = path.join(projectRoot, ".env");
  let raw: string;
  try {
    raw = await fs.readFile(envPath, "utf-8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
}
