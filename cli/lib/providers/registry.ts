// Provider connector registry — the seam that lets Ralphy run over more than the
// two bundled providers (OpenRouter + ElevenLabs) without forking.
//
// First slice of the pluggable-provider spec (notes/ideas/005). The full spec
// adds TOML config + dynamic-imported npm connectors; this slice ships the
// in-tree contract: a capability matrix per provider, the two bundled connectors
// (each living in its own file — openrouter.ts / elevenlabs.ts), a `--provider`
// selection flag, and "first available wins" fallback.
//
// Each generation verb is a capability (image / video / voice / music / sfx /
// text / transcribe). A connector advertises which cells it fills and how to
// call them. The CLI resolves a connector per call — explicit `--provider <id>`
// if given, else the first registered connector that advertises the capability
// AND has its key set. Adding a provider = adding a file + one line here.

import { raiseError } from "../errors/index.js";
import { openrouterConnector } from "./openrouter.js";
import { elevenlabsConnector } from "./elevenlabs.js";
import { falConnector } from "./fal.js";
import { loadProviderConfigs } from "./config.js";
import { makeOpenAiCompatibleConnector } from "./openai-compatible.js";
import { loadConfigSync } from "../config.js";
import type {
  Capability,
  RalphyConnector,
  CallLLMOptions,
  CallLLMResult,
} from "./types.js";

export type { Capability, RalphyConnector } from "./types.js";

// Registration order = priority for "first available wins". OpenRouter first
// because it fills the most cells; ElevenLabs owns the audio cells OR doesn't.
// fal is a video-only third-party connector (#402) and sits LAST so it never
// pre-empts OpenRouter as the default video provider — it's reached only via
// an explicit `--provider fal` (or a fal-only model id).
const BUNDLED: RalphyConnector[] = [openrouterConnector, elevenlabsConnector, falConnector];

// Custom (config-loaded) connectors are cached per process — the config file is
// read once on first registry touch. Bundled connectors ALWAYS come first so
// existing default resolution is unchanged; custom connectors only ever win via
// an explicit `--provider <id>` or a `<id>:` model prefix.
let _customCache: RalphyConnector[] | null = null;

function customConnectors(): RalphyConnector[] {
  if (_customCache) return _customCache;
  const { valid } = loadProviderConfigs();
  _customCache = valid.map(makeOpenAiCompatibleConnector);
  return _customCache;
}

/** Drop the custom-connector cache (tests reseed config between cases). */
export function resetProviderCache(): void {
  _customCache = null;
}

/** All registered connectors, bundled (priority) first, then custom. */
export function listConnectors(): RalphyConnector[] {
  return [...BUNDLED, ...customConnectors()];
}

/** Connectors advertising a capability, in priority order (regardless of availability). */
export function connectorsFor(cap: Capability): RalphyConnector[] {
  return listConnectors().filter((c) => c.capabilities.includes(cap));
}

/**
 * Split a model id into `{ provider, model }`. A `<provider>:<model>` prefix is
 * honored ONLY when the substring before the FIRST `:` is a REGISTERED connector
 * id — so bare ids that contain `/` (e.g. `google/gemini-3-pro-image-preview`)
 * or a `:` that isn't a provider (none today) stay untouched. This keeps every
 * existing bare model id backwards-compatible.
 */
export function parseModelId(id: string): { provider: string | null; model: string } {
  const i = id.indexOf(":");
  if (i <= 0) return { provider: null, model: id };
  const prefix = id.slice(0, i);
  const known = listConnectors().some((c) => c.id === prefix);
  if (!known) return { provider: null, model: id };
  return { provider: prefix, model: id.slice(i + 1) };
}

/**
 * Resolve the connector that serves a capability for this call.
 *
 * - `explicitId` set → that connector must exist, advertise the capability, and
 *   have its key present, else a clean refusal.
 * - `explicitId` omitted → the first registered connector that advertises the
 *   capability AND is available. If none are available, refuse and name the keys.
 */
export function resolveConnector(cap: Capability, explicitId?: string): RalphyConnector {
  const candidates = connectorsFor(cap);
  const all = listConnectors();

  if (explicitId) {
    const c = all.find((x) => x.id === explicitId);
    if (!c) {
      raiseError("E_INPUT_INVALID", {
        field: "provider",
        detail: `unknown provider '${explicitId}'. Known: ${all.map((x) => x.id).join(", ")}`,
        verb: "generate",
      });
    }
    if (!c.capabilities.includes(cap)) {
      raiseError("E_INPUT_INVALID", {
        field: "provider",
        detail:
          `provider '${explicitId}' cannot ${cap}. It serves: ${c.capabilities.join(", ")}. ` +
          `Providers for '${cap}': ${candidates.map((x) => x.id).join(", ") || "none"}`,
        verb: "generate",
      });
    }
    if (!c.available()) {
      raiseError("E_PROVIDER_UNAVAILABLE", {
        provider: c.label,
        detail: `${c.envVar} is not set. Get a key at ${c.signupUrl} and run "ralphy setup".`,
      });
    }
    return c;
  }

  const avail = candidates.find((c) => c.available());
  if (!avail) {
    const keys = candidates.map((c) => c.envVar).join(" or ");
    raiseError("E_PROVIDER_UNAVAILABLE", {
      provider: candidates.map((c) => c.label).join(" / ") || `(${cap})`,
      detail:
        `no provider for '${cap}' is configured. ` +
        (keys ? `Set ${keys} and run "ralphy setup".` : `No connector advertises '${cap}'.`),
    });
  }
  return avail;
}

/**
 * Route an LLM call through the resolved `text` connector. This is the
 * de-hardcoded `callLLM`: callers no longer reach a fixed OpenRouter function —
 * they hit whichever connector serves `text`, selectable via `opts.provider`.
 *
 * A `<provider>:<model>` prefix on `opts.model` selects the provider (when no
 * explicit `opts.provider` was given) and the bare model is sent to the API.
 */
export async function callLLM(opts: CallLLMOptions): Promise<CallLLMResult> {
  let provider = opts.provider;
  let model = opts.model;
  if (model) {
    const parsed = parseModelId(model);
    model = parsed.model;
    if (parsed.provider && !provider) provider = parsed.provider;
  }
  const conn = resolveConnector("text", provider);
  return conn.callLLM!({ ...opts, provider, model });
}

/**
 * Pick the judge/gate model + provider INDEPENDENTLY from the generation
 * provider. Reads the optional `judge` config key (`.ralphy/config.json`:
 * `{ "judge": { "provider": "<id>", "model": "<provider>:<model> | <model>" } }`).
 * Returns `{ provider, model }` suitable to spread into `callLLM(...)`; both
 * fields may be undefined (callLLM then falls back to the default text provider).
 * A `<provider>:<model>` prefix on the configured model is honored.
 */
export function resolveJudgeModel(): { provider?: string; model?: string } {
  const cfg = loadConfigSync().judge as { provider?: unknown; model?: unknown } | undefined;
  let provider = typeof cfg?.provider === "string" ? cfg.provider : undefined;
  let model = typeof cfg?.model === "string" ? cfg.model : undefined;
  if (model) {
    const parsed = parseModelId(model);
    model = parsed.model;
    if (parsed.provider && !provider) provider = parsed.provider;
  }
  return { provider, model };
}

/** Snapshot of the capability matrix for `ralphy provider list`. */
export function providerMatrix(): Array<{
  id: string;
  label: string;
  envVar: string;
  available: boolean;
  capabilities: Capability[];
}> {
  return listConnectors().map((c) => ({
    id: c.id,
    label: c.label,
    envVar: c.envVar,
    available: c.available(),
    capabilities: c.capabilities,
  }));
}
