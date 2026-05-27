// Back-compat barrel. The media-generation implementations moved into
// per-provider connector files (openrouter.ts, elevenlabs.ts) as part of the
// pluggable-provider refactor (notes/ideas/005). This module re-exports the
// stable surface so existing importers keep working unchanged.
//
// New code should resolve a connector via `cli/lib/providers/registry.ts`
// (`resolveConnector(<capability>)`) rather than import these directly — that is
// what makes the provider swappable.

export { generateImage, generateVideo } from "./openrouter.js";
export { generateVoiceover, generateMusic, generateSfx } from "./elevenlabs.js";

export type {
  Size9x16,
  GenerateResult,
  GenerateImageInput,
  GenerateVideoInput,
  GenerateVoiceoverInput,
  GenerateMusicInput,
  GenerateSfxInput,
} from "./types.js";

import { openrouterConnector } from "./openrouter.js";
import { elevenlabsConnector } from "./elevenlabs.js";

/** Convenience — true when both bundled providers are configured. */
export function mediaProvidersReady(): boolean {
  return openrouterConnector.available() && elevenlabsConnector.available();
}
