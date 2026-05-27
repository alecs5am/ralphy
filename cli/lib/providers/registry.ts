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
import type {
  Capability,
  RalphyConnector,
  CallLLMOptions,
  CallLLMResult,
} from "./types.js";

export type { Capability, RalphyConnector } from "./types.js";

// Registration order = priority for "first available wins". OpenRouter first
// because it fills the most cells; ElevenLabs owns the audio cells OR doesn't.
const CONNECTORS: RalphyConnector[] = [openrouterConnector, elevenlabsConnector];

/** All registered connectors, in priority order. */
export function listConnectors(): RalphyConnector[] {
  return CONNECTORS;
}

/** Connectors advertising a capability, in priority order (regardless of availability). */
export function connectorsFor(cap: Capability): RalphyConnector[] {
  return CONNECTORS.filter((c) => c.capabilities.includes(cap));
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

  if (explicitId) {
    const c = CONNECTORS.find((x) => x.id === explicitId);
    if (!c) {
      raiseError("E_INPUT_INVALID", {
        field: "provider",
        detail: `unknown provider '${explicitId}'. Known: ${CONNECTORS.map((x) => x.id).join(", ")}`,
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
 */
export async function callLLM(opts: CallLLMOptions): Promise<CallLLMResult> {
  const conn = resolveConnector("text", opts.provider);
  return conn.callLLM!(opts);
}

/** Snapshot of the capability matrix for `ralphy provider list`. */
export function providerMatrix(): Array<{
  id: string;
  label: string;
  envVar: string;
  available: boolean;
  capabilities: Capability[];
}> {
  return CONNECTORS.map((c) => ({
    id: c.id,
    label: c.label,
    envVar: c.envVar,
    available: c.available(),
    capabilities: c.capabilities,
  }));
}
