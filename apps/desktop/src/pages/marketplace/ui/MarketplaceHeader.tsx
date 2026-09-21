import { Bookmark, Compass, Search, SlidersHorizontal, X } from "@/shared/ui/icons";
import { PageHeader } from "@/shared/ui/PageHeader";
import { useId, useState, type FormEvent } from "react";
import { SelectMenu, type SelectMenuOption } from "@/shared/ui/SelectMenu";
import { categoryIcons, categoryLabels, creativeCategories } from "./browse-discover";
import type {
  MarketplaceCategory,
  MarketplaceQueryState,
} from "../model/navigation";

const categoryOptions = [
  { value: "models", label: "Models" },
  { value: "skills", label: "Skills" },
] satisfies Array<SelectMenuOption<"models" | "skills">>;
const sourceOptions = [
  { value: "all", label: "All sources" },
  { value: "ralphy", label: "Ralphy library" },
  { value: "huggingface", label: "Hugging Face" },
  { value: "civitai", label: "Civitai" },
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

/* The filter pills state their own skin, so SelectMenu is told to stand down (`tone="caller"`)
   and exactly one surface, ink, height, radius and ring lands on each trigger. The ring is the
   theme ink: the shared on-dark ring is near-white and vanished on this light pill. */
const filterClass = "h-control-md shrink-0 rounded-control bg-surface-sunken px-3 text-xs text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";

function queryWithFilter<Key extends keyof MarketplaceQueryState["filters"]>(
  query: MarketplaceQueryState,
  key: Key,
  value: MarketplaceQueryState["filters"][Key],
): MarketplaceQueryState {
  const filters = { ...query.filters, [key]: value };
  if (key === "tag" && value === undefined) delete filters.tag;
  return { ...query, filters };
}

export interface MarketplaceHeaderProps {
  title: string;
  query: MarketplaceQueryState;
  selectedCategory: MarketplaceCategory | "all" | null;
  sidebarVisible: boolean;
  refreshing: boolean;
  /** Named workspaces from the current home library, for the install target. */
  workspaces: Array<{ id: string; name: string }>;
  selectedWorkspaceId: string | null;
  onQueryChange(query: MarketplaceQueryState): void;
  onSearch(): void;
  onOpenCategory(category: MarketplaceCategory): void;
  onOpenSaved?(): void;
  onOpenInstalled?(): void;
  onSelectWorkspace(workspaceId: string): void;
}

export function MarketplaceHeader({
  title,
  query,
  selectedCategory,
  refreshing,
  workspaces,
  selectedWorkspaceId,
  onQueryChange,
  onSearch,
  onOpenCategory,
  onOpenSaved,
  onOpenInstalled,
  onSelectWorkspace,
}: MarketplaceHeaderProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();
  const category = selectedCategory ?? query.filters.category;
  const modelFilters = category === "models" || (category === "all" && !["all", "ralphy"].includes(query.filters.source));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSearch();
  };
  const activeFilters = [
    query.filters.tag ? { label: `#${query.filters.tag}`, clear: () => onQueryChange(queryWithFilter(query, "tag", undefined)) } : null,
    query.filters.source !== "all" ? { label: sourceOptions.find(({ value }) => value === query.filters.source)?.label ?? "Unavailable source", clear: () => onQueryChange(queryWithFilter(query, "source", "all")) } : null,
    query.filters.license !== "all" ? { label: "License declared", clear: () => onQueryChange(queryWithFilter(query, "license", "all")) } : null,
    query.filters.compatibility !== "all" ? { label: compatibilityOptions.find(({ value }) => value === query.filters.compatibility)!.label, clear: () => onQueryChange(queryWithFilter(query, "compatibility", "all")) } : null,
    query.filters.modality !== "all" ? { label: query.filters.modality, clear: () => onQueryChange(queryWithFilter(query, "modality", "all")) } : null,
    query.filters.format !== "all" ? { label: query.filters.format.toLocaleUpperCase(), clear: () => onQueryChange(queryWithFilter(query, "format", "all")) } : null,
  ].filter((item): item is { label: string; clear(): void } => item !== null);

  return <header className="marketplace-header flex shrink-0 flex-col gap-2 text-ink">
    <PageHeader title={title} icon={Compass} headingId="marketplace-heading">
    <div className="marketplace-toolbar flex min-w-0 flex-1 items-center gap-1">
    <form className="marketplace-search page-header-search flex h-control-md min-w-0 flex-1 items-center gap-2 rounded-control bg-surface-sunken pl-3 pr-0.5" role="search" onSubmit={submit}>
      <Search className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
      <input className="h-full min-w-0 flex-1 bg-transparent p-0 type-xs text-ink placeholder:text-muted"
        type="search"
        aria-label="Search creative library"
        placeholder="Search ideas, effects or tags…"
        maxLength={256}
        value={query.text}
        onChange={(event) => onQueryChange({ ...query, text: event.currentTarget.value })}
      />
      <button className="flex h-control-md shrink-0 items-center rounded-control px-2 type-xs text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink" type="submit" aria-label="Search creative library"><Search className="size-3.5" aria-hidden="true" /></button>
    </form>
    <button className={`inline-flex items-center gap-1.5 ${filterClass}`} type="button" aria-label={`Filters${activeFilters.length > 0 ? ` (${activeFilters.length})` : ""}`} aria-expanded={filtersOpen} aria-controls={filtersId} onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal className="size-3.5" aria-hidden="true" /><span className="page-header-action-label">Filters{activeFilters.length > 0 ? ` (${activeFilters.length})` : ""}</span></button>
    {onOpenSaved && <button className={`inline-flex items-center gap-1.5 ${filterClass}`} type="button" aria-label="Saved items" onClick={onOpenSaved}><Bookmark className="size-3.5" aria-hidden="true" /><span className="page-header-action-label">Saved items</span></button>}
    </div>
    </PageHeader>
    <nav className="flex min-w-0 flex-wrap items-center gap-1 pb-1" aria-label="Library category">
      {creativeCategories.map((value) => {
        const label = categoryLabels[value];
        const Icon = categoryIcons[value];
        const active = category === value;
        return <button key={value} type="button" aria-label={label} title={label} aria-current={active ? "page" : undefined}
          className={`marketplace-category-button inline-flex h-7 shrink-0 items-center gap-1.5 rounded-chip px-2 type-sm whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 ${active ? "bg-instrument text-on-instrument hover:bg-instrument hover:text-on-instrument focus-visible:outline-focus-on-instrument" : "text-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline-ink"}`}
          onClick={() => onOpenCategory(value)}>
          <Icon className="size-3.5" aria-hidden="true" /><span className="marketplace-category-label">{label}</span>
        </button>;
      })}
      <SelectMenu<"models" | "skills" | ""> className={`${filterClass} marketplace-category-select`} tone="caller" overlayOwner="marketplace.header"
        ariaLabel="More library categories" value={category === "models" || category === "skills" ? category : ""}
        prefix={category === "models" || category === "skills" ? undefined : "More"}
        options={categoryOptions} onValueChange={(value) => { if (value) onOpenCategory(value); }} />
      {category === "models" && onOpenInstalled && <button className={filterClass} type="button" onClick={onOpenInstalled}>Installed models</button>}
    </nav>
    <div id={filtersId} className="rounded-panel bg-surface p-2" hidden={!filtersOpen}>
    <div className="marketplace-filter-row flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Library filters">
      {(category === "all" || category === "models") && <SelectMenu className={filterClass} tone="caller" overlayOwner="marketplace.header" ariaLabel="Source" prefix="Source" value={query.filters.source} options={sourceOptions.filter(({ value }) => category !== "models" || value !== "ralphy")} onValueChange={(value) => onQueryChange(queryWithFilter(query, "source", value))} />}
      {modelFilters && <>
      <SelectMenu className={filterClass} tone="caller" overlayOwner="marketplace.header" ariaLabel="License" prefix="License" value={query.filters.license} options={licenseOptions} onValueChange={(value) => onQueryChange(queryWithFilter(query, "license", value))} />
      <SelectMenu className={filterClass} tone="caller" overlayOwner="marketplace.header" ariaLabel="Compatibility" prefix="Compatibility" value={query.filters.compatibility} options={compatibilityOptions} onValueChange={(value) => onQueryChange(queryWithFilter(query, "compatibility", value))} />
        <SelectMenu className={filterClass} tone="caller" overlayOwner="marketplace.header" ariaLabel="Modality" prefix="Modality" value={query.filters.modality} options={modalityOptions} onValueChange={(value) => onQueryChange(queryWithFilter(query, "modality", value))} />
        <SelectMenu className={filterClass} tone="caller" overlayOwner="marketplace.header" ariaLabel="Format" prefix="Format" value={query.filters.format} options={formatOptions} onValueChange={(value) => onQueryChange(queryWithFilter(query, "format", value))} />
      </>}
      <SelectMenu className={filterClass} tone="caller" overlayOwner="marketplace.header" ariaLabel="Sort creative library" prefix="Sort" value={query.sort} options={sortOptions.filter(({ value }) => value !== "updated" || category === "all" || category === "models")} align="end" onValueChange={(sort) => onQueryChange({ ...query, sort })} />
      {workspaces.length > 0
        ? <SelectMenu className={filterClass} tone="caller" overlayOwner="marketplace.header"
          ariaLabel="Workspace for saved items" prefix="Workspace"
          value={selectedWorkspaceId ?? workspaces[0]!.id}
          options={workspaces.map(({ id, name }) => ({ value: id, label: name }))}
          align="end"
          onValueChange={onSelectWorkspace}
        />
        : <span className="marketplace-install-target-unavailable inline-flex h-control-md items-center rounded-control bg-surface-sunken px-3 type-xs text-muted" role="status">Create a workspace to save items</span>}
    </div>
    </div>
    {activeFilters.length > 0 && <div className="marketplace-filter-chips flex min-w-0 flex-wrap gap-1.5" aria-label="Active filters">
      {activeFilters.map(({ label, clear }) => <button className="flex h-7 items-center gap-1.5 rounded-control bg-instrument px-3 type-meta text-on-instrument focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-on-instrument" type="button" key={label} aria-label={`Remove filter: ${label}`} onClick={clear}>{label}<X className="size-3" aria-hidden="true" /></button>)}
    </div>}
    {refreshing && <small className="type-meta text-muted" role="status">Refreshing catalog…</small>}
  </header>;
}
