/**
 * What the Marketplace shows, as types.
 *
 * `Availability` is the shape every list and every panel takes: ready with a value, empty with a
 * reason, or unavailable with a reason. There is no fourth state and no bare empty array -- a list
 * with nothing in it has to say why, because "no models" and "no source configured" are different
 * facts and the operator can act on only one of them.
 */
import type {
  LocalModelMachine,
  MarketplaceInstallsDto,
  MarketplacePackCatalogDto,
  MarketplacePackEntryDto,
  MarketplacePublicItemDto,
  MarketplacePublicSnapshotDto,
} from "../../../../electron/media/types";
import type {
  MarketplaceCategory,
  MarketplaceQueryState,
} from "../model/navigation";

export type Availability<T> =
  | { status: "ready"; value: T }
  | { status: "empty"; reason: string }
  | { status: "unavailable"; reason: string };

interface MarketplaceCommonItem {
  /* Which source produced this row. `category` alone stopped identifying the
     shape once the bundled pack started supplying Templates and Recipes too. */
  origin: "models" | "public" | "pack";
  key: string;
  name: string;
  summary: string;
  sourceLabel: string;
  version: Availability<string>;
  updatedAt: Availability<string>;
  license: Availability<string>;
  publisherIdentity: Availability<string>;
  contentAudit: Availability<string>;
  compatibility: Availability<string>;
}

export interface MarketplaceModelDto {
  provider: "huggingface" | "civitai" | "modelscope";
  id: string;
  name: string;
  author: string;
  task: string;
  modality: "text" | "image" | "video" | "audio" | "multimodal" | "unknown";
  modelType: string;
  baseModel: string | null;
  license: string | null;
  gated: boolean;
  revision: string | null;
  lastModified: string | null;
  tags: string[];
  iconUrl: string | null;
  previewUrl: string | null;
  providerUrl: string;
  recommendedPackage: { format: string; bytes: number | null; files: string[] };
  comfort: {
    level: "comfortable" | "usable" | "tight" | "unknown" | "incompatible";
    label: string;
    score: 0 | 1 | 2 | 3 | 4;
    runtime: "ollama" | "diffusers" | "transformers" | "mlx";
    estimatedMemoryBytes: number | null;
    evidence: string[];
  };
  state: "remote" | "gated" | "downloaded" | "ready";
  permissions: string[];
}

export interface MarketplaceModelDetailDto extends MarketplaceModelDto {
  readme: string;
  previewUrls: string[];
  files: { name: string; bytes: number | null; format: string; recommended: boolean; warning: string | null }[];
}

export type MarketplaceItemPresentation =
  | (MarketplaceCommonItem & { origin: "models"; category: "models"; model: MarketplaceModelDto })
  | (MarketplaceCommonItem & { origin: "public"; category: "templates"; template: MarketplacePublicItemDto })
  | (MarketplaceCommonItem & { origin: "public"; category: "recipes"; recipe: MarketplacePublicItemDto })
  /* The pack ships documents, never model weights, so `models` is not one of
     its categories -- saying so keeps every `category === "models"` narrowing
     in the renderer exact. */
  | (MarketplaceCommonItem & {
    origin: "pack";
    category: Exclude<MarketplaceCategory, "models">;
    pack: MarketplacePackEntryDto;
    /* For the workspace the Marketplace is installing into: "off the shelf",
       "taken and on", "taken and off". No workspace selected is not the same
       sentence as not installed, so it is its own state. */
    install: MarketplaceInstallState;
  });

export type MarketplaceInstallState =
  | { status: "no-workspace" }
  | { status: "available" }
  | { status: "installed"; enabled: boolean; installedAt: number };

export type MarketplacePublicItemPresentation = Extract<MarketplaceItemPresentation, { origin: "public" }>;
export type MarketplacePackItemPresentation = Extract<MarketplaceItemPresentation, { origin: "pack" }>;

export interface MarketplaceCategoryPresentation {
  category: MarketplaceCategory;
  label: string;
  purpose: string;
  count: Availability<number>;
  catalog: "ready" | "unavailable";
}

export interface MarketplaceSourceIssue {
  source: "ralphy-public" | "ralphy-bundled" | "huggingface" | "civitai" | "modelscope" | "models";
  scope: "public-library" | "bundled-catalog" | "model-provider" | "model-catalog";
  message: string;
}

export interface MarketplaceSourceHealth {
  publicLibrary: "ready" | "unavailable";
  models: "ready" | "partial" | "unavailable";
}

export type MarketplaceSnapshot =
  | { status: "loading"; query: MarketplaceQueryState }
  | { status: "ready"; items: MarketplaceItemPresentation[]; categories: MarketplaceCategoryPresentation[]; machine: LocalModelMachine | null; publicSource: MarketplacePublicSnapshotDto | null; packSource: MarketplacePackCatalogDto | null; installs: MarketplaceInstallsDto | null; sourceErrors: MarketplaceSourceIssue[]; sourceHealth: MarketplaceSourceHealth; refreshing: boolean; query: MarketplaceQueryState }
  | { status: "error"; error: string; sourceErrors: MarketplaceSourceIssue[]; sourceHealth: MarketplaceSourceHealth; query: MarketplaceQueryState };
