import type {
  LocalModelCatalog,
  LocalModelDetail,
  LocalModelMachine,
  LocalModelProvider,
  LocalModelSummary,
  MarketplaceInstallDto,
  MarketplaceInstallsDto,
  MarketplacePackCatalogDto,
  MarketplacePackEntryDto,
  MarketplacePublicItemDto,
  MarketplacePublicSnapshotDto,
} from "../../../electron/media/types";
import type {
  MarketplaceCategory,
  MarketplaceFilterState,
  MarketplaceQueryState,
} from "../../state/marketplace-navigation";

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

const PROVIDER_LABELS: Record<LocalModelProvider, string> = {
  huggingface: "Hugging Face",
  civitai: "Civitai",
  modelscope: "ModelScope",
};

const CATEGORY_COPY: Record<MarketplaceCategory, { label: string; purpose: string }> = {
  models: { label: "Models", purpose: "Model packages from current providers." },
  templates: { label: "Templates", purpose: "Reusable structures for content formats." },
  recipes: { label: "Recipes", purpose: "Reusable production artifacts and transformations." },
  prompts: { label: "Prompts", purpose: "Reusable generation instructions." },
  components: { label: "Components & Effects", purpose: "Reusable visual and audio building blocks." },
  skills: { label: "Skills", purpose: "Installable agent capabilities." },
};

const CATEGORIES = ["models", "templates", "recipes", "prompts", "components", "skills"] as const;
const unavailable = <T>(reason: string): Availability<T> => ({ status: "unavailable", reason });
const empty = <T>(reason: string): Availability<T> => ({ status: "empty", reason });
const ready = <T>(value: T): Availability<T> => ({ status: "ready", value });

export function marketplacePublicMediaKind(value: string): "image" | "video" | null {
  if (value.length === 0 || value.length > 2_048 || value.includes("\\")) return null;
  const rawPath = value.match(/^https:\/\/[^/?#]+([^?#]*)$/)?.[1];
  if (rawPath === undefined
    || rawPath.includes("//")
    || rawPath.split("/").some((part) => part === "." || part === "..")
    || /%(?:25)*(?:00|2e|2f|5c)/i.test(rawPath)) return null;
  try {
    const url = new URL(value);
    decodeURIComponent(url.pathname);
    if (url.origin !== "https://ralphy.b-cdn.net"
      || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== ""
      || (url.port !== "" && url.port !== "443")
      || (!url.pathname.startsWith("/blocks/") && !url.pathname.startsWith("/units/"))) return null;
    if (/\.(?:avif|gif|jpe?g|png|webp)$/i.test(url.pathname)) return "image";
    if (/\.(?:mp4|webm)$/i.test(url.pathname)) return "video";
  } catch {
    // Invalid source URLs stay inert.
  }
  return null;
}

export function projectMarketplaceModel(summary: LocalModelSummary): MarketplaceModelDto {
  return {
    provider: summary.provider,
    id: summary.id,
    name: summary.name,
    author: summary.author,
    task: summary.task,
    modality: summary.modality,
    modelType: summary.modelType,
    baseModel: summary.baseModel,
    license: summary.license,
    gated: summary.gated,
    revision: summary.revision,
    lastModified: summary.lastModified,
    tags: [...summary.tags],
    iconUrl: summary.iconUrl,
    previewUrl: summary.previewUrl,
    providerUrl: summary.providerUrl,
    recommendedPackage: {
      format: summary.recommendedPackage.format,
      bytes: summary.recommendedPackage.bytes,
      files: [...summary.recommendedPackage.files],
    },
    comfort: {
      level: summary.comfort.level,
      label: summary.comfort.label,
      score: summary.comfort.score,
      runtime: summary.comfort.runtime,
      estimatedMemoryBytes: summary.comfort.estimatedMemoryBytes,
      evidence: [...summary.comfort.evidence],
    },
    state: summary.state,
    permissions: [...summary.permissions],
  };
}

export function projectMarketplaceModelDetail(detail: LocalModelDetail): MarketplaceModelDetailDto {
  return {
    ...projectMarketplaceModel(detail),
    readme: detail.readme,
    previewUrls: [...detail.previewUrls],
    files: detail.files.map((file) => ({
      name: file.name,
      bytes: file.bytes,
      format: file.format,
      recommended: file.recommended,
      warning: file.warning,
    })),
  };
}

export function marketplaceModelProviders(source: MarketplaceFilterState["source"]): LocalModelProvider[] {
  return source === "all" || source === "ralphy" ? ["huggingface", "civitai"] : [source];
}

function modelPresentation(summary: LocalModelSummary): MarketplaceItemPresentation {
  const model = projectMarketplaceModel(summary);
  return {
    origin: "models",
    key: `model:${model.provider}:${model.id}`,
    category: "models",
    name: model.name,
    summary: model.task,
    sourceLabel: PROVIDER_LABELS[model.provider],
    version: model.revision === null ? empty("The model provider did not declare a revision.") : ready(model.revision),
    updatedAt: model.lastModified === null ? empty("The model provider did not declare an update date.") : ready(model.lastModified),
    license: model.license === null ? empty("The model provider did not declare a license.") : ready(model.license),
    publisherIdentity: unavailable("Publisher verification is unavailable from the current model contract."),
    contentAudit: unavailable("Content audit status is unavailable from the current model contract."),
    compatibility: ready(model.comfort.label),
    model,
  };
}

export function projectMarketplacePublicItem(item: MarketplacePublicItemDto, source: MarketplacePublicSnapshotDto["source"]): MarketplaceItemPresentation {
  const common = {
    origin: "public" as const,
    key: `${item.category}:${item.id}`,
    name: item.name,
    summary: item.summary,
    sourceLabel: `Ralphy public library · ${source === "live" ? "Live" : "Cached"}`,
    version: unavailable<string>("Version is unavailable from public-library schema 1."),
    updatedAt: unavailable<string>("Item update date is unavailable from public-library schema 1."),
    license: unavailable<string>("License is unavailable from public-library schema 1."),
    publisherIdentity: unavailable<string>("Publisher identity is unavailable from public-library schema 1."),
    contentAudit: unavailable<string>("Content audit status is unavailable from public-library schema 1."),
    compatibility: unavailable<string>("Compatibility is unavailable from public-library schema 1."),
  };
  return item.category === "template"
    ? { ...common, category: "templates", template: item }
    : { ...common, category: "recipes", recipe: item };
}

/* Pack category -> Marketplace category. The pack names one item; the shelf
   names a shelf, and the two vocabularies were never going to be the same word. */
const PACK_CATEGORY: Record<MarketplacePackEntryDto["category"], Exclude<MarketplaceCategory, "models">> = {
  skill: "skills",
  prompt: "prompts",
  template: "templates",
  recipe: "recipes",
  component: "components",
};

export function projectMarketplacePackItem(
  entry: MarketplacePackEntryDto,
  cliVersion: string | null,
  install: MarketplaceInstallState = { status: "no-workspace" },
): MarketplacePackItemPresentation {
  return {
    origin: "pack",
    key: `pack:${entry.id}`,
    category: PACK_CATEGORY[entry.category],
    name: entry.title,
    summary: entry.summary,
    sourceLabel: cliVersion === null ? "Bundled with this build" : `Bundled with this build · Ralphy CLI ${cliVersion}`,
    /* The pack is versioned as a whole, not per document: one export, one
       version stamp, and no per-entry history to report. */
    version: cliVersion === null ? unavailable<string>("The bundled catalog did not declare a CLI version.") : ready(cliVersion),
    updatedAt: unavailable<string>("A bundled document carries no update date of its own."),
    license: unavailable<string>("License is unavailable from the bundled catalog."),
    publisherIdentity: ready("Ralphy — shipped inside this build"),
    contentAudit: unavailable<string>("Content audit status is unavailable from the bundled catalog."),
    compatibility: cliVersion === null
      ? unavailable<string>("Compatibility is unavailable from the bundled catalog.")
      : ready(`Ralphy CLI ${cliVersion}`),
    pack: entry,
    install,
  };
}

/** The install state of one entry, for the workspace currently selected. */
export function marketplaceInstallState(
  entryId: string,
  workspaceId: string | null,
  installs: readonly MarketplaceInstallDto[],
): MarketplaceInstallState {
  if (workspaceId === null) return { status: "no-workspace" };
  const install = installs.find((row) => row.workspaceId === workspaceId && row.entryId === entryId);
  return install === undefined
    ? { status: "available" }
    : { status: "installed", enabled: install.enabled, installedAt: install.installedAt };
}

function sourceMatches(item: MarketplaceItemPresentation, source: MarketplaceFilterState["source"]): boolean {
  if (source === "all") return true;
  if (source === "ralphy") return item.origin !== "models";
  return item.origin === "models" && item.model.provider === source;
}

function compatibilityMatches(model: MarketplaceModelDto, filter: MarketplaceFilterState["compatibility"]): boolean {
  if (filter === "all") return true;
  if (filter === "compatible") return model.comfort.level === "comfortable" || model.comfort.level === "usable" || model.comfort.level === "tight";
  if (filter === "incompatible") return model.comfort.level === "incompatible";
  return model.comfort.level === "unknown";
}

function filtersMatch(item: MarketplaceItemPresentation, filters: MarketplaceFilterState): boolean {
  if (filters.category !== "all" && item.category !== filters.category) return false;
  if (!sourceMatches(item, filters.source)) return false;
  if (filters.license !== "all" && (item.origin !== "models" || item.model.license === null)) return false;
  if (filters.compatibility !== "all" && (item.origin !== "models" || !compatibilityMatches(item.model, filters.compatibility))) return false;
  if (filters.modality !== "all" && (item.origin !== "models" || item.model.modality !== filters.modality)) return false;
  if (filters.format !== "all" && (item.origin !== "models" || !item.model.recommendedPackage.format.toLocaleLowerCase().includes(filters.format))) return false;
  return true;
}

function keywordScore(item: MarketplaceItemPresentation, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const name = item.name.toLocaleLowerCase();
  const summary = item.summary.toLocaleLowerCase();
  const categoryMetadata = item.origin === "models"
    ? [
      item.model.id,
      item.model.task,
      item.model.modality,
      item.model.modelType,
      item.model.baseModel ?? "",
      item.model.license ?? "",
      item.model.revision ?? "",
      item.model.recommendedPackage.format,
      ...item.model.tags,
      ...item.model.permissions,
      ...item.model.comfort.evidence,
    ]
    : [
      item.category,
      ...(item.origin === "public" && item.category === "recipes" ? [
        item.recipe.recipe?.kind ?? "",
        item.recipe.recipe?.body ?? "",
        item.recipe.recipe?.artifact ?? "",
      ] : []),
      ...(item.origin === "pack" ? [item.pack.slug, ...item.pack.tags] : []),
    ];
  const metadata = [item.sourceLabel, ...categoryMetadata].join(" ").toLocaleLowerCase();
  const author = item.origin === "models" ? item.model.author.toLocaleLowerCase() : "";
  let score = 0;
  for (const token of tokens) {
    if (name.startsWith(token)) score += 8;
    else if (name.includes(token)) score += 6;
    if (summary.includes(token)) score += 3;
    if (author.includes(token)) score += 2;
    if (metadata.includes(token)) score += 1;
  }
  return score;
}

function compareName(left: MarketplaceItemPresentation, right: MarketplaceItemPresentation): number {
  return left.name.localeCompare(right.name, "en", { sensitivity: "base" }) || left.key.localeCompare(right.key, "en");
}

function updatedTimestamp(item: MarketplaceItemPresentation): number {
  if (item.origin !== "models" || item.model.lastModified === null) return Number.NEGATIVE_INFINITY;
  const timestamp = Date.parse(item.model.lastModified);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function categoryPresentations(
  items: MarketplaceItemPresentation[],
  publicSnapshot: MarketplacePublicSnapshotDto | null,
  packCatalog: MarketplacePackCatalogDto | null,
  modelCatalog: LocalModelCatalog | null,
  sourceHealth: MarketplaceSourceHealth,
): MarketplaceCategoryPresentation[] {
  /* The bundled shelf is counted from the rows that actually projected, not from
     the raw catalog: a row this build could not read is not on the shelf. */
  const bundled = new Map<MarketplaceCategory, number>();
  for (const item of items) {
    if (item.origin !== "pack") continue;
    bundled.set(item.category, (bundled.get(item.category) ?? 0) + 1);
  }
  const sourced: Partial<Record<MarketplaceCategory, Availability<number>>> = {
    models: sourceHealth.models !== "unavailable" && modelCatalog !== null
      ? ready(Math.min(modelCatalog.items.length, 24))
      : unavailable("Model count is unavailable because the selected model source is unavailable."),
    templates: sourceHealth.publicLibrary === "ready" && publicSnapshot !== null
      ? ready(publicSnapshot.items.slice(0, 512).filter(({ category }) => category === "template").length)
      : undefined,
    recipes: sourceHealth.publicLibrary === "ready" && publicSnapshot !== null
      ? ready(publicSnapshot.items.slice(0, 512).filter(({ category }) => category === "recipe").length)
      : undefined,
  };
  return CATEGORIES.map((category) => {
    const shelf = bundled.get(category) ?? 0;
    const remote = sourced[category];
    const count: Availability<number> = remote !== undefined && remote.status === "ready"
      ? ready(remote.value + (category === "models" ? 0 : shelf))
      : shelf > 0
        ? ready(shelf)
        : packCatalog?.unavailable !== null && packCatalog !== null && category !== "models"
          ? unavailable(packCatalog.unavailable)
          : remote ?? unavailable<number>(`${CATEGORY_COPY[category].label} are unavailable from every source this build can reach.`);
    return { category, ...CATEGORY_COPY[category], count, catalog: count.status === "unavailable" ? "unavailable" : "ready" };
  });
}

export function presentMarketplaceSources(
  publicSnapshot: MarketplacePublicSnapshotDto | null,
  modelCatalog: LocalModelCatalog | null,
  query: MarketplaceQueryState,
  sourceErrors: MarketplaceSourceIssue[],
  sourceHealth: MarketplaceSourceHealth,
  packCatalog: MarketplacePackCatalogDto | null = null,
  installs: MarketplaceInstallsDto | null = null,
): Extract<MarketplaceSnapshot, { status: "ready" }> {
  const publicItems = publicSnapshot?.items.slice(0, 512).map((item) => projectMarketplacePublicItem(item, publicSnapshot.source)) ?? [];
  const workspaceId = installs?.selectedWorkspaceId ?? null;
  const packItems = packCatalog?.entries.slice(0, 1_024)
    .map((entry) => projectMarketplacePackItem(
      entry,
      packCatalog.cliVersion,
      marketplaceInstallState(entry.id, workspaceId, installs?.installs ?? []),
    )) ?? [];
  const modelItems = modelCatalog?.items.slice(0, 24).map(modelPresentation) ?? [];
  const tokens = query.text.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const scored = [...modelItems, ...packItems, ...publicItems]
    .filter((item) => filtersMatch(item, query.filters))
    .map((item) => ({ item, score: keywordScore(item, tokens) }))
    .filter(({ score }) => tokens.length === 0 || score > 0);
  scored.sort((left, right) => {
    if (query.sort === "updated") return updatedTimestamp(right.item) - updatedTimestamp(left.item) || compareName(left.item, right.item);
    if (query.sort === "relevance" && tokens.length > 0) return right.score - left.score || compareName(left.item, right.item);
    return compareName(left.item, right.item);
  });
  const items = scored.map(({ item }) => item);
  return {
    status: "ready",
    items,
    /* Counted from every projected row, not from the filtered result: a category
       tile answers "what is on this shelf", not "what survived the search". */
    categories: categoryPresentations(
      [...modelItems, ...packItems, ...publicItems],
      publicSnapshot,
      packCatalog,
      modelCatalog,
      sourceHealth,
    ),
    machine: modelCatalog?.machine ?? null,
    publicSource: publicSnapshot,
    packSource: packCatalog,
    installs,
    sourceErrors,
    sourceHealth,
    refreshing: false,
    query,
  };
}
