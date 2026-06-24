// Custom provider config loader — the user-extensible half of the pluggable
// provider system (#487, promoted from notes/ideas/005).
//
// A content farm needs cost / privacy escape hatches: route high-volume work to
// a local or self-hosted OpenAI-compatible endpoint (Ollama / vLLM / LiteLLM)
// while keeping the premium APIs for the steps where quality matters. Users
// declare those endpoints in `.ralphy/config.json` under a `providers` array;
// the registry builds a connector per entry via the OpenAI-compatible factory.
//
// SECRET ALLOWLISTING (AGENTS.md invariant #1). A custom provider reads ONLY the
// env var it explicitly DECLARES (`envVar`). The banned set below blocks the two
// channels the invariant forbids everywhere (OpenAI-direct, Vercel) PLUS the
// bundled connectors' own env vars — so a user can't smuggle a banned key
// through config and have it read by an un-sanctioned code path. `secretEnvAllowlist`
// returns the exact union of declared (safe) env vars, making the property testable.
//
// The read is SYNCHRONOUS (mirrors `currentWorkspace()` in paths.ts) because the
// registry's `listConnectors()` / `resolveConnector()` are sync-shaped and called
// on every model call.

import { existsSync, readFileSync } from "node:fs";
import { configPath } from "../paths.js";
import type { Capability } from "./types.js";

/** A user-declared custom provider entry in `.ralphy/config.json` `providers[]`. */
export interface ProviderConfigEntry {
  /** Stable kebab-case id; used as `--provider <id>` and the `<id>:` model prefix. */
  id: string;
  /** Human label for `ralphy provider list`. Defaults to `id` when absent. */
  label?: string;
  /** Only "openai-compatible" is supported this slice (local/self-hosted /v1/chat/completions). */
  kind: "openai-compatible";
  /** Base URL of the OpenAI-compatible API, e.g. http://localhost:11434/v1. */
  baseUrl: string;
  /**
   * Env var holding the bearer key. OPTIONAL — a keyless local endpoint (Ollama)
   * omits it. MUST NOT be a banned channel (see BANNED_ENV_VARS) when present.
   * Defaults to RALPHY_LOCAL_API_KEY when a key is desired but unnamed.
   */
  envVar?: string;
  /** Capability cells this provider fills (subset of the Capability union). */
  capabilities: Capability[];
}

/** Result of loading + validating the config `providers[]` array. */
export interface ProviderConfigLoad {
  valid: ProviderConfigEntry[];
  errors: Array<{ id: string; reason: string }>;
}

// Env vars a custom provider entry may NEVER declare. The first two are the
// invariant-#1 forbidden channels (OpenAI-direct + Vercel); the rest are the
// bundled connectors' own env vars — declaring one would let an un-sanctioned
// connector read a key the invariant ties to a specific file.
export const BANNED_ENV_VARS: ReadonlySet<string> = new Set([
  "OPENAI_API_KEY",
  "VERCEL_API_KEY",
  "VERCEL_KEY",
  "OPENROUTER_API_KEY",
  "ELEVENLABS_API_KEY",
  "FAL_KEY",
]);

// Ids reserved by the bundled connectors — a custom entry can't shadow them.
const BUNDLED_IDS: ReadonlySet<string> = new Set(["openrouter", "elevenlabs", "fal"]);

const CAPABILITIES: ReadonlySet<string> = new Set<Capability>([
  "text",
  "image",
  "video",
  "voice",
  "music",
  "sfx",
  "transcribe",
]);

const ID_RE = /^[a-z][a-z0-9-]*$/;

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Validate one raw entry. Returns the typed entry or a reason string. */
export function validateProviderEntry(raw: unknown): ProviderConfigEntry | string {
  if (!raw || typeof raw !== "object") return "entry is not an object";
  const e = raw as Record<string, unknown>;
  const id = e.id;
  if (typeof id !== "string" || !ID_RE.test(id)) {
    return `id must be kebab-case (/^[a-z][a-z0-9-]*$/), got ${JSON.stringify(id)}`;
  }
  if (BUNDLED_IDS.has(id)) return `id '${id}' collides with a bundled connector`;
  if (e.kind !== "openai-compatible") {
    return `kind must be "openai-compatible", got ${JSON.stringify(e.kind)}`;
  }
  if (typeof e.baseUrl !== "string" || !isHttpUrl(e.baseUrl)) {
    return `baseUrl must be a valid http(s) URL, got ${JSON.stringify(e.baseUrl)}`;
  }
  if (e.envVar !== undefined) {
    if (typeof e.envVar !== "string" || e.envVar.length === 0) {
      return `envVar must be a non-empty string when set`;
    }
    if (BANNED_ENV_VARS.has(e.envVar)) {
      return `envVar '${e.envVar}' is forbidden (banned channel or bundled-connector key)`;
    }
  }
  if (!Array.isArray(e.capabilities) || e.capabilities.length === 0) {
    return `capabilities must be a non-empty array`;
  }
  for (const c of e.capabilities) {
    if (typeof c !== "string" || !CAPABILITIES.has(c)) {
      return `unknown capability ${JSON.stringify(c)} (allowed: ${[...CAPABILITIES].join(", ")})`;
    }
  }
  return {
    id,
    label: typeof e.label === "string" ? e.label : undefined,
    kind: "openai-compatible",
    baseUrl: e.baseUrl,
    envVar: e.envVar as string | undefined,
    capabilities: e.capabilities as Capability[],
  };
}

/**
 * Load + validate the custom `providers[]` array from `.ralphy/config.json`.
 * Returns valid entries and a per-entry error list (never throws — the command
 * boundary decides whether to surface errors). Duplicate ids keep the first.
 */
export function loadProviderConfigs(): ProviderConfigLoad {
  const out: ProviderConfigLoad = { valid: [], errors: [] };
  let raw: unknown;
  try {
    const p = configPath();
    if (!existsSync(p)) return out;
    raw = JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return out; // missing / malformed config.json → no custom providers
  }
  const list = (raw as { providers?: unknown })?.providers;
  if (!Array.isArray(list)) return out;

  const seen = new Set<string>();
  for (const item of list) {
    const result = validateProviderEntry(item);
    if (typeof result === "string") {
      const id = (item as { id?: unknown })?.id;
      out.errors.push({ id: typeof id === "string" ? id : "<unknown>", reason: result });
      continue;
    }
    if (seen.has(result.id)) {
      out.errors.push({ id: result.id, reason: "duplicate id (keeping the first)" });
      continue;
    }
    seen.add(result.id);
    out.valid.push(result);
  }
  return out;
}

/**
 * The exact set of env vars custom providers are allowed to read — the union of
 * the declared (already-validated, non-banned) `envVar`s. This IS the secret
 * allowlist: anything not in here is never read by a custom connector.
 */
export function secretEnvAllowlist(entries: ProviderConfigEntry[]): Set<string> {
  const allow = new Set<string>();
  for (const e of entries) if (e.envVar) allow.add(e.envVar);
  return allow;
}
