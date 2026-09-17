import type { GenerationBridge, GenerationDraft } from "../../../shared/generation-studio";
import type { GenerationUnitsBridge } from "../../../shared/generation-units";

/** A browser can edit a draft, but only the native host can submit media generation. */
export function mockGenerationBridge(): GenerationBridge & GenerationUnitsBridge {
  const drafts = new Map<string, GenerationDraft>();
  const native = async (): Promise<never> => { throw new Error("Open the desktop app to generate and export media."); };
  return {
    loadGenerationProviders: async () => [
      { id: "openrouter", name: "OpenRouter", capabilities: ["text", "image", "video"], configured: false, stored: false, inherited: false },
      { id: "elevenlabs", name: "ElevenLabs", capabilities: ["voice", "music", "sfx"], configured: false, stored: false, inherited: false },
      { id: "fal", name: "fal", capabilities: ["video"], configured: false, stored: false, inherited: false },
    ],
    setGenerationProviderKey: native,
    probeGenerationProvider: native,
    clearGenerationProviderKey: native,
    loadGenerationCatalog: async () => ({ models: [], providers: [], errors: ["Open the desktop app to discover your generation models."] }),
    loadGenerationVoices: async () => [],
    loadGenerationDraft: async (workspaceId) => drafts.has(workspaceId) ? structuredClone(drafts.get(workspaceId)!) : null,
    saveGenerationDraft: async (workspaceId, draft) => { drafts.set(workspaceId, structuredClone(draft)); },
    startGeneration: native, loadGenerationRuns: async () => ({ items: [], nextCursor: null }), cancelGenerationRun: native, exportGenerationAsset: native,
    loadGenerationUnitOptions: native, saveGenerationToUnit: native,
  };
}
