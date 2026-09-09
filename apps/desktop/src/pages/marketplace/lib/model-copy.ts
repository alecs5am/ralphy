import type { MarketplaceModelDto } from "./presentation-types";

/** Provider sentinels are absent metadata, not a model capability. Raw DTOs stay untouched. */
export function declaredModelText(...values: string[]): string {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value && value.toLowerCase() !== "unknown"))].join(" · ");
}

export function marketplaceModelDescription(model: MarketplaceModelDto): string {
  return declaredModelText(model.task, model.modality, model.modelType) || "Review package and runtime requirements";
}

export function marketplaceRevisionLabel(revision: string): string {
  return /^[a-f0-9]{40,64}$/i.test(revision) ? revision.slice(0, 7) : revision;
}
