import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { EncryptedCredentialStore } from "../electron/claude/credentials";
import { createGenerationCredentials, registerGenerationCredentialIpc, validateGenerationProviderKey } from "../electron/canvas/generation-credentials";
import { MEDIA_CHANNELS } from "../electron/media/types";

const paths: string[] = [];
afterEach(async () => { await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

test("provider IPC keeps secrets encrypted, returns only presence, and shares stored keys with runtime capture", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ralphy-generation-credentials-")); paths.push(directory);
  const env = { OPENROUTER_API_KEY: "sk-or-inherited-1234567890", FAL_KEY: "fal-inherited-1234567890" }; // gitleaks:allow — nonfunctional test credentials
  const stores = new Map<string, EncryptedCredentialStore>();
  const credentials = createGenerationCredentials({
    environment: () => env,
    store: (provider) => {
      let store = stores.get(provider);
      if (!store) { store = new EncryptedCredentialStore({ path: join(directory, `${provider}.bin`), validate: (key) => validateGenerationProviderKey(provider, key), cipher: {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(`sealed:${value}`).reverse(),
        decryptString: (value) => Buffer.from(value).reverse().toString().slice(7),
      } }); stores.set(provider, store); }
      return store;
    },
  });
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  registerGenerationCredentialIpc({ handle: (channel, handler) => handlers.set(channel, handler), credentials });
  const invoke = async (channel: string, ...args: unknown[]) => await handlers.get(channel)!(...args);
  expect(await invoke(MEDIA_CHANNELS.loadGenerationProviders)).toEqual([
    { id: "openrouter", name: "OpenRouter", capabilities: ["text", "image", "video"], configured: true, stored: false, inherited: true },
    { id: "elevenlabs", name: "ElevenLabs", capabilities: ["voiceover", "music", "sfx"], configured: false, stored: false, inherited: false },
    { id: "fal", name: "fal", capabilities: ["video"], configured: true, stored: false, inherited: true },
  ]);
  const key = "elevenlabs-mock-1234567890";
  const status = await invoke(MEDIA_CHANNELS.setGenerationProviderKey, "elevenlabs", key);
  expect(status).toContainEqual({ id: "elevenlabs", name: "ElevenLabs", capabilities: ["voiceover", "music", "sfx"], configured: true, stored: true, inherited: false });
  expect(JSON.stringify(status)).not.toContain(key);
  expect(await readFile(join(directory, "elevenlabs.bin"), "utf8")).not.toContain(key);
  await invoke(MEDIA_CHANNELS.setGenerationProviderKey, "openrouter", "sk-or-stored-1234567890");
  expect(await stores.get("openrouter")!.read()).toBe("sk-or-stored-1234567890");
  expect(await credentials.capture()).toEqual({ OPENROUTER_API_KEY: "sk-or-stored-1234567890", ELEVENLABS_API_KEY: key, FAL_KEY: env.FAL_KEY });
  await invoke(MEDIA_CHANNELS.clearGenerationProviderKey, "openrouter");
  await invoke(MEDIA_CHANNELS.clearGenerationProviderKey, "elevenlabs");
  expect(await credentials.capture()).toEqual(env);
  for (const provider of ["../openrouter", "__proto__", null]) {
    await expect(invoke(MEDIA_CHANNELS.setGenerationProviderKey, provider, key)).rejects.toThrow("provider");
    await expect(invoke(MEDIA_CHANNELS.clearGenerationProviderKey, provider)).rejects.toThrow("provider");
  }
  for (const value of ["short", "x".repeat(513), "valid-key-123456789\n", "valid-key-123456789\u0000", 42]) {
    await expect(invoke(MEDIA_CHANNELS.setGenerationProviderKey, "fal", value)).rejects.toThrow("API key");
  }
});

test("auth checks use the effective key, redact failures, and invalidate results after replacement", async () => {
  let saved: string | null = "sk-or-stored-nonfunctional-key";
  let received = "";
  let fail = false;
  const credentials = createGenerationCredentials({ environment: () => ({ OPENROUTER_API_KEY: "sk-or-env-nonfunctional-key" }), store: () => ({
    read: async () => saved, has: async () => saved !== null, write: async (key) => { saved = key; }, clear: async () => { saved = null; },
  }), probe: async (_provider, key) => { received = key; if (fail) throw new Error(key); return "valid"; } });
  expect((await credentials.load())[0]?.validation).toBeUndefined();
  const tested = await credentials.probe("openrouter");
  expect(received).toBe(saved);
  expect(tested[0]?.validation?.state).toBe("valid");
  expect(JSON.stringify(tested)).not.toContain(saved);
  await credentials.set("openrouter", "sk-or-replacement-nonfunctional-key");
  expect((await credentials.load())[0]?.validation).toBeUndefined();
  fail = true;
  expect((await credentials.probe("openrouter"))[0]?.validation?.state).toBe("unreachable");
  await credentials.clear("openrouter");
  expect((await credentials.load())[0]?.validation).toBeUndefined();
  await credentials.probe("openrouter");
  expect(received).toBe("sk-or-env-nonfunctional-key");
  await expect(credentials.probe("fal")).rejects.toThrow("OpenRouter");
});

test("queued credential mutations finish before status and runtime reads", async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  let value: string | null = null;
  const credentials = createGenerationCredentials({ environment: () => ({}), store: () => ({
    read: async () => value, has: async () => value !== null,
    write: async (key: string) => { await blocked; value = key; }, clear: async () => { value = null; },
  }) });
  const saving = credentials.set("fal", "fal-mock-1234567890");
  const clearing = credentials.clear("fal");
  const loading = credentials.load();
  const capture = credentials.capture();
  release(); await saving; await clearing;
  expect((await loading).every((provider) => !provider.configured)).toBe(true);
  expect(await capture).toEqual({});
});
