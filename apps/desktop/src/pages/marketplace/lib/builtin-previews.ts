import type { MarketplaceItemPresentation } from "./presentation-types";

export interface BuiltinPreview {
  kind: "video" | "audio";
  url: string;
  beforeUrl: string;
  beforePosterUrl?: string;
  posterUrl?: string;
  label: "Sample preview";
}

const VIDEO_SAMPLES = new Set([
  "vhs-overlay", "chroma-split", "film-grain", "noir-grade", "voxel-dither", "crt-scanlines",
]);
const asset = (name: string) => `${import.meta.env.BASE_URL}explore/${name}`;

/** First-party synthetic samples, never a claim that the publisher supplied a demo. */
export function builtinPreview(item: MarketplaceItemPresentation): BuiltinPreview | null {
  if (item.origin !== "public" || item.category !== "recipes") return null;
  const id = item.recipe.id;
  if (VIDEO_SAMPLES.has(id)) return {
    kind: "video",
    url: asset(`${id}.mp4`),
    beforeUrl: asset("source.mp4"),
    beforePosterUrl: asset("source.webp"),
    posterUrl: asset(`${id}.webp`),
    label: "Sample preview",
  };
  if (id === "old-radio-ps1-vo") return {
    kind: "audio",
    url: asset(`${id}.mp3`),
    beforeUrl: asset("voice-source.mp3"),
    label: "Sample preview",
  };
  return null;
}
