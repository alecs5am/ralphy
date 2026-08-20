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

  return <header className="marketplace-header">
    <div className="marketplace-header-title">
      <span>Marketplace</span>
      <h1 id="marketplace-heading" tabIndex={-1}>{title}</h1>
      {refreshing && <small role="status">Refreshing catalog…</small>}
    </div>
    <form className="marketplace-search" role="search" onSubmit={submit}>
      <Search aria-hidden="true" />
      <input
        type="search"
        aria-label="Search Marketplace"
        placeholder="Search Marketplace"
        maxLength={256}
        value={query.text}
        onChange={(event) => onQueryChange({ ...query, text: event.currentTarget.value })}
      />
      <button type="submit">Search</button>
    </form>
    {!sidebarVisible && <div className="marketplace-header-category-menu">
      <span>Marketplace category</span>
      <SelectMenu
        ariaLabel="Marketplace category"
        className="marketplace-category-select"
        value={selectedCategory ?? (query.filters.category === "all" ? "all" : query.filters.category)}
        options={categoryOptions}
        align="end"
        onValueChange={(category) => category === "all"
          ? onQueryChange(queryWithFilter(query, "category", "all"))
          : onOpenCategory(category)}
      />
    </div>}
    <div className="marketplace-filter-row" aria-label="Marketplace filters">
      <SelectMenu ariaLabel="Category" prefix="Category" value={query.filters.category} options={categoryOptions} onValueChange={(category) => category === "all" ? onQueryChange(queryWithFilter(query, "category", "all")) : onOpenCategory(category)} />
      <SelectMenu ariaLabel="Source" prefix="Source" value={query.filters.source} options={sourceOptions} onValueChange={(value) => onQueryChange(queryWithFilter(query, "source", value))} />
      <SelectMenu ariaLabel="License" prefix="License" value={query.filters.license} options={licenseOptions} onValueChange={(value) => onQueryChange(queryWithFilter(query, "license", value))} />
      <SelectMenu ariaLabel="Compatibility" prefix="Compatibility" value={query.filters.compatibility} options={compatibilityOptions} onValueChange={(value) => onQueryChange(queryWithFilter(query, "compatibility", value))} />
      {(selectedCategory === "models" || query.filters.category === "models") && <>
        <SelectMenu ariaLabel="Modality" prefix="Modality" value={query.filters.modality} options={modalityOptions} onValueChange={(value) => onQueryChange(queryWithFilter(query, "modality", value))} />
        <SelectMenu ariaLabel="Format" prefix="Format" value={query.filters.format} options={formatOptions} onValueChange={(value) => onQueryChange(queryWithFilter(query, "format", value))} />
      </>}
      <span className="marketplace-filter-spacer" />
      <SelectMenu ariaLabel="Sort Marketplace" prefix="Sort" value={query.sort} options={sortOptions} align="end" onValueChange={(sort) => onQueryChange({ ...query, sort })} />
    </div>
    {activeFilters.length > 0 && <div className="marketplace-filter-chips" aria-label="Active filters">
      {activeFilters.map(({ label, clear }) => <button type="button" key={label} onClick={clear}>{label}<X aria-hidden="true" /></button>)}
    </div>}
  </header>;
}
