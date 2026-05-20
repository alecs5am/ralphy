// Doctor-driven update check (09.05.04 / 09-D-04).
//
// `ralphy doctor` performs an unauthenticated GET against the GitHub Releases
// API after the existing env/key probes and prints a one-line hint when the
// running binary lags the latest tag. Hot-path verbs do NOT make this call —
// the no-phone-home invariant for everyday usage stays intact.
//
// Opt-out:
//   • Env var: `RALPHY_DOCTOR_NO_UPDATE_CHECK=1`
//   • Config:  `ralphy config set doctor.checkUpdates false`
//              (persists in ~/.ralphy/config.json)

import type { GlobalConfig } from "./global-config.js";

const RELEASE_API = "https://api.github.com/repos/alecs5am/ralphy/releases/latest";
const TIMEOUT_MS = 5_000;

export type InstallMode = "brew" | "npm" | "curl" | "developer" | "binary" | "unknown";

export type Compare = "current" | "newer" | "ahead" | "unknown";

export interface UpdateCheckResult {
  current: string;
  latest: string | null;
  compare: Compare;
  update_hint?: string;
}

// ─── Decision: should we even probe? ───────────────────────────────────────

export function shouldCheckUpdates(config: Partial<GlobalConfig>): boolean {
  if (process.env.RALPHY_DOCTOR_NO_UPDATE_CHECK === "1") return false;
  const doctor = (config.doctor ?? {}) as { checkUpdates?: boolean };
  if (doctor.checkUpdates === false) return false;
  return true;
}

// ─── SemVer compare (loose — major.minor.patch with optional `v`) ─────────

function parseVersion(raw: string): [number, number, number] | null {
  const m = raw.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function compareVersions(current: string, latest: string): Compare {
  const a = parseVersion(current);
  const b = parseVersion(latest);
  if (!a || !b) return "unknown";
  for (let i = 0; i < 3; i++) {
    if (a[i]! < b[i]!) return "newer";
    if (a[i]! > b[i]!) return "ahead";
  }
  return "current";
}

// ─── Hint text by install mode ─────────────────────────────────────────────

export function upgradeHintForMode(mode: InstallMode): string {
  switch (mode) {
    case "brew":
      return "Run `brew upgrade ralphy` to pick up the latest.";
    case "npm":
      return "Run `npm update -g @alecs5am/ralphy` to pick up the latest.";
    case "curl":
    case "binary":
      return "Run `curl -fsSL https://raw.githubusercontent.com/alecs5am/ralphy/main/install.sh | sh` to pick up the latest.";
    case "developer":
      return "You're on a developer checkout — `git pull` to get the latest, then `bun install` if dependencies changed.";
    default:
      return "Upgrade with `brew upgrade ralphy` (Homebrew), `npm update -g @alecs5am/ralphy` (npm), or re-run the install script.";
  }
}

// ─── Network probe ─────────────────────────────────────────────────────────

export async function fetchLatestRelease(timeoutMs = TIMEOUT_MS): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { tag_name?: string };
    return typeof json.tag_name === "string" ? json.tag_name : null;
  } catch {
    // Silent on failure per acceptance — doctor still reports everything else.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Orchestrator ──────────────────────────────────────────────────────────

export async function checkForUpdate(
  current: string,
  mode: InstallMode,
  config: Partial<GlobalConfig>,
): Promise<UpdateCheckResult> {
  if (!shouldCheckUpdates(config)) {
    return { current, latest: null, compare: "unknown" };
  }
  const latest = await fetchLatestRelease();
  if (!latest) {
    return { current, latest: null, compare: "unknown" };
  }
  const compare = compareVersions(current, latest);
  const result: UpdateCheckResult = { current, latest, compare };
  if (compare === "newer") {
    result.update_hint = upgradeHintForMode(mode);
  }
  return result;
}
