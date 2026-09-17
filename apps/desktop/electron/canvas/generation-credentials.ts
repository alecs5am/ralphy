import { isGenerationProviderId, type GenerationProviderStatus } from "../../shared/generation-studio";
import { type EncryptedCredentialStore, validateOpenRouterApiKey } from "../claude/credentials";
import { MEDIA_CHANNELS } from "../media/types";
import { createHash } from "node:crypto";

type Provider = GenerationProviderStatus["id"];
const PROVIDERS: { id: Provider; name: string; capabilities: string[]; env: string }[] = [
  { id: "openrouter", name: "OpenRouter", capabilities: ["text", "image", "video"], env: "OPENROUTER_API_KEY" },
  { id: "elevenlabs", name: "ElevenLabs", capabilities: ["voiceover", "music", "sfx"], env: "ELEVENLABS_API_KEY" },
  { id: "fal", name: "fal", capabilities: ["video"], env: "FAL_KEY" },
];

function parseProvider(value: unknown): Provider {
  if (!isGenerationProviderId(value)) throw new Error("Unsupported generation provider");
  return value;
}

export function validateGenerationProviderKey(provider: Provider, value: unknown): string {
  parseProvider(provider);
  if (typeof value !== "string" || /[\u0000-\u001f\u007f-\u009f]/.test(value)) throw new Error("Invalid provider API key");
  const key = value.trim();
  if (key.length < 16 || key.length > 512 || /\s/.test(key)) throw new Error("Invalid provider API key");
  return provider === "openrouter" ? validateOpenRouterApiKey(key) : key;
}

export function createGenerationCredentials(deps: {
  store(provider: Provider): Pick<EncryptedCredentialStore, "read" | "write" | "clear" | "has">;
  environment(): NodeJS.ProcessEnv;
  probe?(provider: Provider, key: string): Promise<NonNullable<GenerationProviderStatus["validation"]>["state"]>;
}) {
  let pending: Promise<unknown> = Promise.resolve();
  const probes = new Map<Provider, { fingerprint: string; validation: NonNullable<GenerationProviderStatus["validation"]> }>();
  const fingerprint = (key: string) => createHash("sha256").update(key).digest("hex");
  const inherited = (provider: typeof PROVIDERS[number], env: NodeJS.ProcessEnv) => {
    try { return validateGenerationProviderKey(provider.id, env[provider.env]); } catch { return null; }
  };
  const statuses = async (): Promise<GenerationProviderStatus[]> => {
    const env = deps.environment();
    return Promise.all(PROVIDERS.map(async ({ id, name, capabilities, ...rest }) => {
      const saved = await deps.store(id).read();
      const environmentKey = inherited({ id, name, capabilities, ...rest }, env);
      const key = saved ?? environmentKey, probe = probes.get(id);
      const validation = key && probe?.fingerprint === fingerprint(key) ? probe.validation : undefined;
      return { id, name, capabilities: [...capabilities], configured: key !== null, stored: saved !== null, inherited: environmentKey !== null, ...(validation ? { validation } : {}) };
    }));
  };
  // Serialize the three provider stores so removal cannot overtake an in-flight save.
  const change = (operation: () => Promise<void>) => {
    const result = pending.catch(() => undefined).then(async () => { await operation(); return statuses(); });
    pending = result.catch(() => undefined);
    return result;
  };
  return {
    load: async () => { await pending; return statuses(); },
    set: async (rawProvider: unknown, value: unknown) => {
      const provider = parseProvider(rawProvider);
      const key = validateGenerationProviderKey(provider, value);
      return change(() => deps.store(provider).write(key));
    },
    clear: async (rawProvider: unknown) => {
      const provider = parseProvider(rawProvider);
      return change(() => deps.store(provider).clear());
    },
    probe: async (rawProvider: unknown) => {
      const provider = parseProvider(rawProvider);
      if (provider !== "openrouter") throw new Error("Authentication checks are currently available for OpenRouter. Other services are checked when used.");
      return change(async () => {
        const key = await deps.store(provider).read() ?? inherited(PROVIDERS.find((item) => item.id === provider)!, deps.environment());
        if (!key) throw new Error("Add an OpenRouter API key before testing the connection.");
        let state: NonNullable<GenerationProviderStatus["validation"]>["state"] = "unreachable";
        try { state = await deps.probe?.(provider, key) ?? "untested"; } catch { /* Never expose native errors that could include credentials. */ }
        probes.set(provider, { fingerprint: fingerprint(key), validation: { state, checkedAt: Date.now() } });
      });
    },
    capture: async (): Promise<NodeJS.ProcessEnv> => {
      await pending;
      const env = deps.environment();
      const entries = await Promise.all(PROVIDERS.map(async (provider) => {
        const key = await deps.store(provider.id).read() ?? inherited(provider, env);
        return key ? [[provider.env, key]] : [];
      }));
      return Object.fromEntries(entries.flat());
    },
  };
}

export function registerGenerationCredentialIpc(deps: {
  handle(channel: string, handler: (...args: unknown[]) => unknown): void;
  credentials: ReturnType<typeof createGenerationCredentials>;
}): void {
  deps.handle(MEDIA_CHANNELS.loadGenerationProviders, () => deps.credentials.load());
  deps.handle(MEDIA_CHANNELS.setGenerationProviderKey, (provider, key) => deps.credentials.set(provider, key));
  deps.handle(MEDIA_CHANNELS.clearGenerationProviderKey, (provider) => deps.credentials.clear(provider));
  deps.handle(MEDIA_CHANNELS.probeGenerationProvider, (provider) => deps.credentials.probe(provider));
}
