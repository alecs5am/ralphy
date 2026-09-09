import { lstat, readFile } from "node:fs/promises";

import type { AgentModelOption } from "../media/types";

const MODEL_ID = /^[~a-zA-Z0-9][a-zA-Z0-9._~:/-]{0,255}$/;
const MAX_CODEX_CACHE_BYTES = 2 * 1024 * 1024;
const MAX_OPENROUTER_BYTES = 4 * 1024 * 1024;
const MAX_MODELS = 1000;

export const CLAUDE_MODELS: AgentModelOption[] = [
  { id: "opus", label: "Claude Opus", description: "Highest capability" },
  { id: "sonnet", label: "Claude Sonnet", description: "Balanced" },
  { id: "fable", label: "Claude Fable", description: "Fast" },
];

const CODEX_DEFAULT: AgentModelOption = {
  id: "default",
  label: "Codex default",
  description: "Uses your Codex configuration",
};

function row(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function bounded(value: unknown, maxLength = 256): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

export function parseCodexModelCache(value: unknown): AgentModelOption[] {
  const root = row(value);
  if (!root || !Array.isArray(root.models)) return [CODEX_DEFAULT];
  const seen = new Set<string>();
  const models: AgentModelOption[] = [];
  for (const value of root.models) {
    const model = row(value);
    if (!model || model.visibility !== "list") continue;
    const id = bounded(model.slug);
    if (!MODEL_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    models.push({
      id,
      label: bounded(model.display_name) || id,
      description: "Codex",
    });
    if (models.length >= 64) break;
  }
  return [CODEX_DEFAULT, ...models];
}

/* What the installed Codex can actually run, and whether the operator's own default is one of
   them. The catalogue used to be read from `~/.codex/models_cache.json`, which is a shared file:
   the Codex *app* writes it, stamped with its own version, and the server gates the catalogue on
   the client version -- so a newer app left model ids in that file which the installed CLI rejects
   with a 400 that reads "requires a newer version of Codex". The binary's own bundled catalogue is
   the honest answer to "what can this CLI use", and it costs no network call and writes nothing.

   A configured default outside that list is not silently replaced -- it is the operator's config --
   but it does stop being what a new chat sends, because a new chat that fails by default is worse
   than a new chat on a listed model. */
export function codexCatalog(catalog: unknown, configured: string | null): {
  models: AgentModelOption[];
  defaultModel: string;
  unsupportedDefault: string | null;
} {
  const models = parseCodexModelCache(catalog);
  const listed = models.filter(({ id }) => id !== CODEX_DEFAULT.id);
  const supported = configured === null || listed.some(({ id }) => id === configured);
  if (supported) return { models, defaultModel: CODEX_DEFAULT.id, unsupportedDefault: null };
  /* Annotated, never removed. A row is removed only if the operator could not run it, and this
     function cannot know that: the catalogue is what the *build* ships, while the refusal that
     reads "requires a newer version of Codex" comes from the server and depends on the client
     version -- a model can be listed here and still be refused by an outdated CLI, and the cure
     for that is a newer CLI, not a shorter menu. What is stated here is the narrower fact this
     function does know: the configured default is a name this build has never heard of. */
  const reason = `Your Codex config asks for ${configured}, which this build does not list`;
  return {
    models: models.map((model) => model.id === CODEX_DEFAULT.id ? { ...model, description: reason } : model),
    defaultModel: listed[0]?.id ?? CODEX_DEFAULT.id,
    unsupportedDefault: configured,
  };
}

function contextLabel(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M context`;
  return `${Math.round(value / 1000)}K context`;
}

function price(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value) * 1_000_000;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function openRouterDescription(model: Record<string, unknown>): string {
  const parts: string[] = [];
  const context = contextLabel(model.context_length);
  if (context) parts.push(context);
  const pricing = row(model.pricing);
  const prompt = price(pricing?.prompt);
  const completion = price(pricing?.completion);
  if (prompt !== null && completion !== null) {
    parts.push(`$${prompt.toFixed(2)} / $${completion.toFixed(2)} per 1M`);
  }
  return parts.join(" · ") || "OpenRouter";
}

export function parseOpenRouterModels(value: unknown): AgentModelOption[] {
  const root = row(value);
  if (!root || !Array.isArray(root.data)) return [];
  const seen = new Set<string>();
  const models: AgentModelOption[] = [];
  for (const value of root.data) {
    const model = row(value);
    if (!model) continue;
    const id = bounded(model.id);
    const parameters = Array.isArray(model.supported_parameters)
      ? model.supported_parameters
      : [];
    const architecture = row(model.architecture);
    const modalities = Array.isArray(architecture?.output_modalities)
      ? architecture.output_modalities
      : [];
    if (
      !MODEL_ID.test(id)
      || seen.has(id)
      || !parameters.includes("tools")
      || !modalities.includes("text")
    ) continue;
    seen.add(id);
    models.push({
      id,
      label: bounded(model.name) || id,
      description: openRouterDescription(model),
    });
    if (models.length >= MAX_MODELS) break;
  }
  return models;
}

export async function readCodexModels(path: string): Promise<AgentModelOption[]> {
  const info = await lstat(path).catch(() => null);
  if (!info?.isFile() || info.isSymbolicLink() || info.size > MAX_CODEX_CACHE_BYTES) {
    return [CODEX_DEFAULT];
  }
  try {
    return parseCodexModelCache(JSON.parse(await readFile(path, "utf8")) as unknown);
  } catch {
    return [CODEX_DEFAULT];
  }
}

export async function fetchOpenRouterModels(
  fetcher: typeof fetch,
  apiKey?: string,
): Promise<AgentModelOption[]> {
  const response = await fetcher(
    "https://openrouter.ai/api/v1/models?output_modalities=text&supported_parameters=tools&sort=most-popular",
    {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error(`OpenRouter models failed (${response.status})`);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_OPENROUTER_BYTES) throw new Error("OpenRouter model catalog is too large");
  const body = await response.text();
  if (Buffer.byteLength(body) > MAX_OPENROUTER_BYTES) {
    throw new Error("OpenRouter model catalog is too large");
  }
  return parseOpenRouterModels(JSON.parse(body) as unknown);
}
