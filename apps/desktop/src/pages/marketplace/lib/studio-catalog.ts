import type { MarketplacePublicItemDto } from "../../../../electron/media/types";
import type { MarketplacePublicItemPresentation, MarketplaceStudioExample } from "./presentation-types";
import { studioFormats, studioPrompts } from "./studio-catalog-content";
import { studioEffects, studioSounds } from "./studio-catalog-media";
import { studioVisuals } from "./studio-catalog-visuals";
import { studioBaseballPrompts, studioBaseballTemplate } from "./studio-catalog-baseball";
import { studioKenneySounds } from "./studio-catalog-kenney";
import { studioRemocnFoundations } from "./studio-catalog-remocn-foundations";
import { studioRemocnMotion } from "./studio-catalog-remocn-motion";

export interface StudioEntry extends MarketplaceStudioExample {
  id: string;
  name: string;
  summary: string;
  tags: string[];
}

function project(category: "templates" | "components" | "recipes" | "sounds" | "prompts", entry: StudioEntry): MarketplacePublicItemPresentation {
  const provider = entry.pack?.publisher === "Kenney" ? "Kenney" : entry.tags.includes("remocn") ? "Remocn" : "Ralphy";
  const dto: MarketplacePublicItemDto = {
    id: entry.id, category: category === "templates" ? "template" : category === "sounds" ? "asset" : "recipe",
    name: entry.name, summary: entry.summary, tags: entry.tags, referenceUrls: [entry.preview.url],
    recipe: { kind: category === "prompts" ? "prompt" : category === "components" || category === "templates" ? "hyperframes" : "ffmpeg", body: entry.body, artifact: entry.artifact ?? null, parameters: entry.settings ?? null, demo: null },
  };
  const common = {
    origin: "public" as const, key: `studio:${category}:${entry.id}`, category, name: entry.name,
    summary: entry.summary, tags: entry.tags, sourceLabel: provider === "Kenney" ? "Kenney audio packs" : provider === "Remocn" ? "Remocn · local copy" : "Ralphy studio examples", studio: entry,
    version: { status: "ready" as const, value: "1" },
    updatedAt: { status: "unavailable" as const, reason: "Examples are versioned with the desktop build." },
    license: { status: "ready" as const, value: entry.mediaCredit ?? "Original Ralphy test assets; reusable in your content." },
    publisherIdentity: { status: "ready" as const, value: provider === "Ralphy" ? "Ralphy studio" : provider },
    contentAudit: { status: "ready" as const, value: provider === "Ralphy" ? entry.reference ? "Reference study with original Ralphy instructions; preview supplied by the user." : "Curated test scenario; synthetic or generated preview, not a live trend." : `${provider} source copied into the local catalog with its upstream attribution.` },
    compatibility: { status: "ready" as const, value: "Instructions and previews are bundled with this build." },
  };
  if (category === "templates") return { ...common, category, template: dto };
  if (category === "sounds") return { ...common, category, sound: dto };
  return { ...common, category, recipe: dto };
}

/** First-party examples are independent of remote catalog availability and never require installation. */
export function studioCatalog(): MarketplacePublicItemPresentation[] {
  return [
    ...studioFormats().map((entry) => project("templates", entry)),
    project("templates", studioBaseballTemplate()),
    ...[...studioVisuals(), ...studioRemocnFoundations(), ...studioRemocnMotion()].map((entry) => project("components", entry)),
    ...studioEffects().map((entry) => project("recipes", entry)),
    ...[...studioSounds(), ...studioKenneySounds()].map((entry) => project("sounds", entry)),
    ...studioPrompts().map((entry) => project("prompts", entry)),
    ...studioBaseballPrompts().map((entry) => project("prompts", entry)),
  ];
}
