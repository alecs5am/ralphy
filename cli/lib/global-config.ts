// Global config at ~/.ralphy/config.json (01.09.02).
//
// API keys, defaults, and `active_project_id` live here so the CLI works
// from any directory without a repo clone. Persisted with 0600 permissions
// so the keys don't leak via shared umask.
//
// Migration plan from the workspace-scoped `workspace/.ralph/config.json`
// (cli/lib/config.ts):
//   • New code reads/writes the global file via this module.
//   • Workspace config still loads in dev mode (presence of package.json
//     sibling — checked by 01.09.07 doctor-install-mode reporting).
//   • The repo's own `cli/lib/config.ts` stays for the workspace path so
//     existing back-stage callers don't break mid-migration.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_PATH = path.join(os.homedir(), ".ralphy", "config.json");

let _override: string | null = null;

/** For tests / CLI flags: redirect the global config to a different path. */
export function setGlobalConfigPath(p: string): void {
  _override = p;
}

export function resetGlobalConfigPath(): void {
  _override = null;
}

export function globalConfigPath(): string {
  return _override ?? DEFAULT_PATH;
}

export type GlobalConfig = Record<string, unknown>;

export function readGlobalConfig(): GlobalConfig {
  const p = globalConfigPath();
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as GlobalConfig;
  } catch {
    return {};
  }
}

export function writeGlobalConfig(cfg: GlobalConfig): void {
  const p = globalConfigPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  // Write then chmod — `mode` arg on writeFile only applies on create.
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");
  fs.chmodSync(p, 0o600);
}

// ─── Dot-path get/set ──────────────────────────────────────────────────────

function getNested(obj: GlobalConfig, dotPath: string): unknown {
  return dotPath.split(".").reduce<unknown>((acc, k) => {
    if (acc === undefined || acc === null) return undefined;
    return (acc as Record<string, unknown>)[k];
  }, obj);
}

function setNested(obj: GlobalConfig, dotPath: string, value: unknown): void {
  const parts = dotPath.split(".");
  let cur: Record<string, unknown> = obj as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]!;
    if (typeof cur[k] !== "object" || cur[k] === null) {
      cur[k] = {};
    }
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

export function configGet(dotPath: string): unknown {
  return getNested(readGlobalConfig(), dotPath);
}

export function configSet(dotPath: string, value: unknown): void {
  const cfg = readGlobalConfig();
  setNested(cfg, dotPath, value);
  writeGlobalConfig(cfg);
}

export function configList(): GlobalConfig {
  return readGlobalConfig();
}
