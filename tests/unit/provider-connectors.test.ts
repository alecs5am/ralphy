// Pluggable provider connectors (#487) — config parsing, secret allowlisting,
// connector health, prefixed model routing, and bundled-only backwards compat.
//
// Custom providers live in `.ralphy/config.json` `providers[]`; the registry
// builds an OpenAI-compatible connector per entry. We seed config by pointing
// `setRoot()` at a temp tree and writing the JSON, then `resetProviderCache()`
// so the registry re-reads it. No network is touched — `available()` is
// env/config only and the custom connector's `callLLM` is never invoked here.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setRoot, root } from "../../cli/lib/paths.js";
import {
  loadProviderConfigs,
  validateProviderEntry,
  secretEnvAllowlist,
  BANNED_ENV_VARS,
  type ProviderConfigEntry,
} from "../../cli/lib/providers/config.js";
import { makeOpenAiCompatibleConnector } from "../../cli/lib/providers/openai-compatible.js";
import {
  listConnectors,
  resetProviderCache,
  parseModelId,
} from "../../cli/lib/providers/registry.js";

const SAFE_ENV = "RALPHY_LOCAL_API_KEY";
let tmp: string;
let prevRoot: string;
let savedEnv: string | undefined;

/** Write `.ralphy/config.json` with the given object and reset the registry cache. */
function seedConfig(cfg: unknown) {
  const dir = path.join(tmp, ".ralphy");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(cfg, null, 2));
  resetProviderCache();
}

beforeEach(() => {
  prevRoot = root();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-provider-connectors-"));
  setRoot(tmp);
  savedEnv = process.env[SAFE_ENV];
  delete process.env[SAFE_ENV];
  resetProviderCache();
});

afterEach(() => {
  setRoot(prevRoot);
  resetProviderCache();
  if (savedEnv === undefined) delete process.env[SAFE_ENV];
  else process.env[SAFE_ENV] = savedEnv;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("config parsing", () => {
  test("a valid providers config loads", () => {
    seedConfig({
      providers: [
        { id: "local-llama", kind: "openai-compatible", baseUrl: "http://localhost:11434/v1", capabilities: ["text"] },
      ],
    });
    const { valid, errors } = loadProviderConfigs();
    expect(errors).toEqual([]);
    expect(valid.map((v) => v.id)).toEqual(["local-llama"]);
    expect(valid[0].capabilities).toEqual(["text"]);
  });

  test("malformed entries are rejected with a reason", () => {
    seedConfig({
      providers: [
        { id: "Bad_Id", kind: "openai-compatible", baseUrl: "http://x/v1", capabilities: ["text"] },
        { id: "bad-url", kind: "openai-compatible", baseUrl: "not a url", capabilities: ["text"] },
        { id: "bad-cap", kind: "openai-compatible", baseUrl: "http://x/v1", capabilities: ["telepathy"] },
        { id: "openrouter", kind: "openai-compatible", baseUrl: "http://x/v1", capabilities: ["text"] },
        { id: "ok", kind: "openai-compatible", baseUrl: "http://x/v1", capabilities: ["text"] },
      ],
    });
    const { valid, errors } = loadProviderConfigs();
    expect(valid.map((v) => v.id)).toEqual(["ok"]);
    const byId = Object.fromEntries(errors.map((e) => [e.id, e.reason]));
    expect(byId["Bad_Id"]).toMatch(/kebab-case/);
    expect(byId["bad-url"]).toMatch(/http\(s\) URL/);
    expect(byId["bad-cap"]).toMatch(/unknown capability/);
    expect(byId["openrouter"]).toMatch(/collides with a bundled connector/);
  });

  test("no providers config → empty load (no errors)", () => {
    seedConfig({});
    expect(loadProviderConfigs()).toEqual({ valid: [], errors: [] });
  });
});

describe("secret allowlisting", () => {
  test("an entry declaring a banned env var (OPENAI_API_KEY / VERCEL_*) is rejected", () => {
    for (const banned of ["OPENAI_API_KEY", "VERCEL_API_KEY", "VERCEL_KEY", "OPENROUTER_API_KEY"]) {
      const result = validateProviderEntry({
        id: "smuggler",
        kind: "openai-compatible",
        baseUrl: "http://x/v1",
        envVar: banned,
        capabilities: ["text"],
      });
      expect(typeof result).toBe("string");
      expect(result as string).toMatch(/forbidden/);
    }
    // The banned set covers both invariant channels and the bundled keys.
    expect(BANNED_ENV_VARS.has("OPENAI_API_KEY")).toBe(true);
    expect(BANNED_ENV_VARS.has("VERCEL_API_KEY")).toBe(true);
    expect(BANNED_ENV_VARS.has("VERCEL_KEY")).toBe(true);
  });

  test("the allowlist is exactly the declared (safe) env vars", () => {
    const entries: ProviderConfigEntry[] = [
      { id: "a", kind: "openai-compatible", baseUrl: "http://x/v1", envVar: SAFE_ENV, capabilities: ["text"] },
      { id: "b", kind: "openai-compatible", baseUrl: "http://y/v1", capabilities: ["text"] }, // keyless
      { id: "c", kind: "openai-compatible", baseUrl: "http://z/v1", envVar: "MY_OTHER_KEY", capabilities: ["text"] },
    ];
    expect(secretEnvAllowlist(entries)).toEqual(new Set([SAFE_ENV, "MY_OTHER_KEY"]));
  });
});

describe("connector health (available())", () => {
  test("keyless local endpoint is available whenever baseUrl is set", () => {
    const conn = makeOpenAiCompatibleConnector({
      id: "keyless",
      kind: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      capabilities: ["text"],
    });
    expect(conn.available()).toBe(true);
  });

  test("key-gated endpoint is unavailable without the key, available with it", () => {
    const conn = makeOpenAiCompatibleConnector({
      id: "gated",
      kind: "openai-compatible",
      baseUrl: "https://llm.internal/v1",
      envVar: SAFE_ENV,
      capabilities: ["text"],
    });
    delete process.env[SAFE_ENV];
    expect(conn.available()).toBe(false);
    process.env[SAFE_ENV] = "secret";
    expect(conn.available()).toBe(true);
  });
});

describe("prefixed model routing", () => {
  test("a registered custom provider prefix splits into { provider, model }", () => {
    seedConfig({
      providers: [
        { id: "myprovider", kind: "openai-compatible", baseUrl: "http://x/v1", capabilities: ["text"] },
      ],
    });
    expect(parseModelId("myprovider:llama-3")).toEqual({ provider: "myprovider", model: "llama-3" });
    // bundled prefixes resolve too
    expect(parseModelId("openrouter:google/gemini-3-pro-image-preview")).toEqual({
      provider: "openrouter",
      model: "google/gemini-3-pro-image-preview",
    });
  });

  test("a bare id (no registered prefix) is left untouched — backwards compat", () => {
    seedConfig({});
    expect(parseModelId("google/gemini-3-pro-image-preview")).toEqual({
      provider: null,
      model: "google/gemini-3-pro-image-preview",
    });
    // an unknown prefix is NOT treated as a provider
    expect(parseModelId("unknownprovider:foo")).toEqual({ provider: null, model: "unknownprovider:foo" });
  });
});

describe("backwards compatibility", () => {
  test("with no providers config, listConnectors() returns exactly the bundled three", () => {
    seedConfig({});
    expect(listConnectors().map((c) => c.id)).toEqual(["openrouter", "elevenlabs", "fal"]);
  });

  test("custom connectors append AFTER the bundled three", () => {
    seedConfig({
      providers: [
        { id: "local-llama", kind: "openai-compatible", baseUrl: "http://localhost:11434/v1", capabilities: ["text"] },
      ],
    });
    expect(listConnectors().map((c) => c.id)).toEqual(["openrouter", "elevenlabs", "fal", "local-llama"]);
  });
});
