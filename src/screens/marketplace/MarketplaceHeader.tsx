import { Search, X } from "lucide-react";
import type { FormEvent } from "react";
import { SelectMenu, type SelectMenuOption } from "../../components/ui/SelectMenu";
import type {
  MarketplaceCategory,
  MarketplaceQueryState,
} from "../../state/marketplace-navigation";

const categoryLabels: Record<MarketplaceCategory, string> = {
  models: "Models",
  templates: "Templates",
  recipes: "Recipes",
  prompts: "Prompts",
  components: "Components & Effects",
  skills: "Skills",
};

const categoryOptions = [
  { value: "all", label: "All categories" },
  ...Object.entries(categoryLabels).map(([value, label]) => ({ value: value as MarketplaceCategory, label })),
] satisfies Array<SelectMenuOption<MarketplaceCategory | "all">>;
const sourceOptions = [
  { value: "all", label: "All sources" },
  { value: "ralphy", label: "Ralphy public library" },
  { value: "huggingface", label: "Hugging Face" },
  { value: "civitai", label: "Civitai" },
  { value: "modelscope", label: "ModelScope" },
] satisfies Array<SelectMenuOption<MarketplaceQueryState["filters"]["source"]>>;
const licenseOptions = [
  { value: "all", label: "Any license state" },
  { value: "declared", label: "License declared" },
] satisfies Array<SelectMenuOption<MarketplaceQueryState["filters"]["license"]>>;
const compatibilityOptions = [
  { value: "all", label: "Any compatibility" },
  { value: "compatible", label: "Compatible" },
  { value: "unknown", label: "Unknown compatibility" },
  { value: "incompatible", label: "Incompatible" },
] satisfies Array<SelectMenuOption<MarketplaceQueryState["filters"]["compatibility"]>>;
const modalityOptions = [
  { value: "all", label: "All modalities" },
  { value: "text", label: "Text" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "multimodal", label: "Multimodal" },
] satisfies Array<SelectMenuOption<MarketplaceQueryState["filters"]["modality"]>>;
const formatOptions = [
  { value: "all", label: "All formats" },
  { value: "gguf", label: "GGUF" },
  { value: "safetensors", label: "Safetensors" },
  { value: "onnx", label: "ONNX" },
  { value: "mlx", label: "MLX" },
] satisfies Array<SelectMenuOption<MarketplaceQueryState["filters"]["format"]>>;
const sortOptions = [
  { value: "relevance", label: "Relevance · keyword" },
  { value: "updated", label: "Updated" },
  { value: "name", label: "Name" },
] satisfies Array<SelectMenuOption<MarketplaceQueryState["sort"]>>;

const filterClass = "h-[30px] shrink-0 rounded-control border-0 bg-surface-sunken px-3 text-xs text-muted hover:bg-surface-hover hover:text-ink";

function queryWithFilter<Key extends keyof MarketplaceQueryState["filters"]>(
  query: MarketplaceQueryState,
  key: Key,
  value: MarketplaceQueryState["filters"][Key],
): MarketplaceQueryState {
  return { ...query, filters: { ...query.filters, [key]: value } };
}

export interface MarketplaceHeaderProps {
  title: string;
  query: MarketplaceQueryState;
  selectedCategory: MarketplaceCategory | "all" | null;
  sidebarVisible: boolean;
  refreshing: boolean;
  onQueryChange(query: MarketplaceQueryState): void;
  onSearch(): void;
  onOpenCategory(category: MarketplaceCategory): void;
}

export function MarketplaceHeader({
  title,
  query,
  selectedCategory,
  sidebarVisible,
  refreshing,
  onQueryChange,
  onSearch,
  onOpenCategory,
}: MarketplaceHeaderProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSearch();
  };
  const activeFilters = [
    query.filters.source !== "all" ? { label: sourceOptions.find(({ value }) => value === query.filters.source)!.label, clear: () => onQueryChange(queryWithFilter(query, "source", "all")) } : null,
    query.filters.license !== "all" ? { label: "License declared", clear: () => onQueryChange(queryWithFilter(query, "license", "all")) } : null,
    query.filters.compatibility !== "all" ? { label: compatibilityOptions.find(({ value }) => value === query.filters.compatibility)!.label, clear: () => onQueryChange(queryWithFilter(query, "compatibility", "all")) } : null,
    query.filters.modality !== "all" ? { label: query.filters.modality, clear: () => onQueryChange(queryWithFilter(query, "modality", "all")) } : null,
    query.filters.format !== "all" ? { label: query.filters.format.toLocaleUpperCase(), clear: () => onQueryChange(queryWithFilter(query, "format", "all")) } : null,
  ].filter((item): item is { label: string; clear(): void } => item !== null);

  return <header className="marketplace-header @container/header mx-2 mt-2 grid shrink-0 grid-cols-[minmax(150px,.55fr)_minmax(280px,1.45fr)_auto] items-center gap-x-4 gap-y-2 rounded-panel bg-surface px-5 py-3.5 text-ink @max-[760px]/header:grid-cols-1">
    <div className="marketplace-header-title grid min-w-0 gap-0.5">
      <span className="font-mono text-[9px] uppercase tracking-[.11em] text-muted">Marketplace</span>
      <h1 className="m-0 truncate text-xl leading-none outline-none" id="marketplace-heading" tabIndex={-1}>{title}</h1>
      {refreshing && <small className="text-[10px] text-muted" role="status">Refreshing catalog…</small>}
    </div>
    <form className="marketplace-search flex h-[34px] w-full max-w-[440px] min-w-0 items-center gap-2 justify-self-center rounded-[11px] bg-surface-sunken py-0 pr-0.5 pl-3 @max-[760px]/header:max-w-none" role="search" onSubmit={submit}>
      <Search className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
      <input className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-xs text-ink placeholder:text-muted"
        type="search"
        aria-label="Search Marketplace"
        placeholder="Search Marketplace"
        maxLength={256}
        value={query.text}
        onChange={(event) => onQueryChange({ ...query, text: event.currentTarget.value })}
      />
      <button className="flex h-[30px] shrink-0 items-center rounded-control bg-instrument px-3 text-xs text-on-instrument hover:bg-instrument-hover" type="submit">Search</button>
    </form>
    {!sidebarVisible && <div className="marketplace-header-category-menu flex items-center gap-2 @max-[760px]/header:justify-between">
      <span className="text-[10px] text-muted">Marketplace category</span>
      <SelectMenu className={`${filterClass} marketplace-category-select`} overlayOwner="marketplace.header"
        ariaLabel="Marketplace category"
        value={selectedCategory ?? (query.filters.category === "all" ? "all" : query.filters.category)}
        options={categoryOptions}
        align="end"
        onValueChange={(category) => category === "all"
          ? onQueryChange(queryWithFilter(query, "category", "all"))
          : onOpenCategory(category)}
      />
    </div>}
    <div className="marketplace-filter-row col-span-full flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Marketplace filters">
      <SelectMenu className={filterClass} overlayOwner="marketplace.header" ariaLabel="Category" prefix="Category" value={query.filters.category} options={categoryOptions} onValueChange={(category) => category === "all" ? onQueryChange(queryWithFilter(query, "category", "all")) : onOpenCategory(category)} />
      <SelectMenu className={filterClass} overlayOwner="marketplace.header" ariaLabel="Source" prefix="Source" value={query.filters.source} options={sourceOptions} onValueChange={(value) => onQueryChange(queryWithFilter(query, "source", value))} />
      <SelectMenu className={filterClass} overlayOwner="marketplace.header" ariaLabel="License" prefix="License" value={query.filters.license} options={licenseOptions} onValueChange={(value) => onQueryChange(queryWithFilter(query, "license", value))} />
      <SelectMenu className={filterClass} overlayOwner="marketplace.header" ariaLabel="Compatibility" prefix="Compatibility" value={query.filters.compatibility} options={compatibilityOptions} onValueChange={(value) => onQueryChange(queryWithFilter(query, "compatibility", value))} />
      {(selectedCategory === "models" || query.filters.category === "models") && <>
        <SelectMenu className={filterClass} overlayOwner="marketplace.header" ariaLabel="Modality" prefix="Modality" value={query.filters.modality} options={modalityOptions} onValueChange={(value) => onQueryChange(queryWithFilter(query, "modality", value))} />
        <SelectMenu className={filterClass} overlayOwner="marketplace.header" ariaLabel="Format" prefix="Format" value={query.filters.format} options={formatOptions} onValueChange={(value) => onQueryChange(queryWithFilter(query, "format", value))} />
      </>}
      <span className="marketplace-filter-spacer min-w-3 flex-1 @max-[760px]/header:hidden" />
      <SelectMenu className={filterClass} overlayOwner="marketplace.header" ariaLabel="Sort Marketplace" prefix="Sort" value={query.sort} options={sortOptions} align="end" onValueChange={(sort) => onQueryChange({ ...query, sort })} />
    </div>
    {activeFilters.length > 0 && <div className="marketplace-filter-chips col-span-full flex flex-wrap gap-1.5" aria-label="Active filters">
      {activeFilters.map(({ label, clear }) => <button className="flex h-7 items-center gap-1.5 rounded-full bg-instrument px-3 text-[10px] text-on-instrument" type="button" key={label} onClick={clear}>{label}<X className="size-3" aria-hidden="true" /></button>)}
    </div>}
  </header>;
}
