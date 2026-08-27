import { Grid2X2, List, Search, X } from "lucide-react";
import { useId } from "react";
import type { MediaKind, MediaProvenance } from "../../../../electron/ralphy/types";
import { SelectMenu, type SelectMenuOption } from "@/shared/ui/SelectMenu";
import type { SharedLibraryController } from "../model/controller";
import type { SharedLibraryQueryState } from "../lib/presentation";

const kinds: Array<SelectMenuOption<MediaKind | "all">> = [
  ["all", "All kinds"], ["image", "Images"], ["video", "Video"], ["audio", "Audio"],
  ["document", "Documents"], ["other", "Other"],
].map(([value, label]) => ({ value, label } as SelectMenuOption<MediaKind | "all">));
const provenances: Array<SelectMenuOption<MediaProvenance | "all">> = [
  ["all", "All provenance"], ["generation", "Generated"],
  ["not-generation", "Not generated"], ["unknown", "Unknown"],
].map(([value, label]) => ({ value, label } as SelectMenuOption<MediaProvenance | "all">));
const sorts: Array<SelectMenuOption<SharedLibraryQueryState["sort"]>> = [
  ["recently-selected", "Recently selected"], ["name", "Name"], ["size", "Size"],
].map(([value, label]) => ({ value, label } as SelectMenuOption<SharedLibraryQueryState["sort"]>));
const unavailable = ["Semantic role", "Entity", "Canonical", "Used / unused", "Rights", "Missing metadata"];
const unavailableReason = "This filter is unavailable from the current Core media contract.";

/* The toolbar is a light widget standing on the desk, so its controls take the sunken surface
   and the theme ink; the ring is the one reset.css paints. */
const CONTROL = "inline-flex h-7 items-center gap-1.5 rounded-control bg-surface-sunken px-2.5 type-label text-muted transition-colors duration-normal ease-instrument motion-reduce:transition-none motion-reduce:duration-0 hover:bg-surface-hover hover:text-ink";
/* The select trigger arrives as a black pill from the shared control sheet; on this widget it is
   a sunken pill, and it keeps its hover feedback in the light-widget idiom. */
/* This toolbar states its own select skin, so SelectMenu stands down (`tone="caller"`). The
   ring is the theme ink: the shared on-dark ring is near-white on this light pill. */
const SELECT = "flex h-7 items-center gap-1.5 rounded-control bg-surface-sunken px-2 type-mono-md text-muted hover:bg-surface-hover hover:text-ink data-[state=open]:bg-surface-hover data-[state=open]:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";
const VIEW_BUTTON = "inline-flex h-7 items-center gap-1 rounded-control px-2 type-xs transition-colors duration-normal ease-instrument motion-reduce:transition-none motion-reduce:duration-0";

export function SharedLibraryToolbar({ query, controller }: {
  query: SharedLibraryQueryState;
  controller: Pick<SharedLibraryController, "setQuery">;
}) {
  const unavailableReasonId = useId();
  const dirty = query.text !== "" || query.mediaKind !== "all" || query.provenance !== "all";
  return <form className="shared-library-toolbar m-0 flex min-h-9 w-full max-w-none flex-none flex-wrap items-center gap-2 rounded-panel bg-surface p-2 type-sm text-ink" aria-label="Shared Library controls" onSubmit={(event) => event.preventDefault()}>
    {/* A field wrapped in a container shows the one ring on the container: reset.css paints it
        on :focus-within and silences the input's own, so the input declares no outline here. */}
    <label className="shared-library-search flex h-9 min-w-shared-search flex-1 items-center gap-2 rounded-control bg-surface-sunken px-3 text-muted">
      <Search size={14} aria-hidden="true" />
      <input
        className="min-w-0 flex-1 border-0 bg-transparent type-base text-ink placeholder:text-muted"
        type="search"
        aria-label="Search Shared Library"
        placeholder="Search artifacts"
        value={query.text}
        onInput={(event) => controller.setQuery({ text: event.currentTarget.value })}
      />
    </label>
    <div className="shared-library-view-toggle flex h-9 items-center gap-0.5 rounded-control bg-surface-sunken p-1" aria-label="View">
      <button className={`${VIEW_BUTTON} ${query.view === "grid" ? "is-active bg-instrument text-on-instrument" : "bg-transparent text-muted"}`} type="button" aria-pressed={query.view === "grid"} onClick={() => controller.setQuery({ view: "grid" })}><Grid2X2 size={13} aria-hidden="true" />Grid</button>
      <button className={`${VIEW_BUTTON} ${query.view === "list" ? "is-active bg-instrument text-on-instrument" : "bg-transparent text-muted"}`} type="button" aria-pressed={query.view === "list"} onClick={() => controller.setQuery({ view: "list" })}><List size={13} aria-hidden="true" />List</button>
    </div>
    <SelectMenu tone="caller" overlayOwner="shared.toolbar" className={`shared-library-select ${SELECT}`} value={query.mediaKind} options={kinds} ariaLabel="Kind" prefix="Kind" onValueChange={(mediaKind) => controller.setQuery({ mediaKind })} />
    <SelectMenu tone="caller" overlayOwner="shared.toolbar" className={`shared-library-select ${SELECT}`} value={query.provenance} options={provenances} ariaLabel="Provenance" prefix="Provenance" onValueChange={(provenance) => controller.setQuery({ provenance })} />
    {unavailable.map((label) => <button className={CONTROL} key={label} type="button" aria-disabled="true" aria-describedby={unavailableReasonId} data-unavailable-filter>{label}</button>)}
    <button className={CONTROL} type="button" aria-disabled="true" aria-describedby={unavailableReasonId} data-unavailable-filter>Group by entity</button>
    {/* The sort control is pushed to the far end of the toolbar until the row is narrow enough
        that it reads as its own line. */}
    <SelectMenu tone="caller" overlayOwner="shared.toolbar" className={`shared-library-select ${SELECT} ml-auto @max-shared-header/main-region:ml-0`} value={query.sort} options={sorts} ariaLabel="Sort" prefix="Sort" onValueChange={(sort) => controller.setQuery({ sort })} />
    {dirty && <button className={CONTROL} type="button" onClick={() => controller.setQuery({ text: "", mediaKind: "all", provenance: "all" })}><X size={12} aria-hidden="true" />Clear filters</button>}
    <p className="m-0 w-full type-mono-md leading-caption text-muted" id={unavailableReasonId}>{unavailableReason} Grouping by entity is unavailable from Core.</p>
  </form>;
}
