import { Grid2X2, List, Search, X } from "lucide-react";
import { useId } from "react";
import type { MediaKind, MediaProvenance } from "../../../electron/ralphy/types";
import { SelectMenu, type SelectMenuOption } from "../../components/ui/SelectMenu";
import type { SharedLibraryController } from "../../state/shared-library-controller";
import type { SharedLibraryQueryState } from "./presentation";

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

export function SharedLibraryToolbar({ query, controller }: {
  query: SharedLibraryQueryState;
  controller: Pick<SharedLibraryController, "setQuery">;
}) {
  const unavailableReasonId = useId();
  const dirty = query.text !== "" || query.mediaKind !== "all" || query.provenance !== "all";
  return <form className="shared-library-toolbar m-0 flex w-full max-w-none flex-wrap items-center gap-2 rounded-panel border-0 bg-surface p-2 text-[12px] text-ink shadow-none" aria-label="Shared Library controls" onSubmit={(event) => event.preventDefault()}>
    <label className="shared-library-search flex h-9 min-w-[240px] flex-1 items-center gap-2 rounded-control bg-surface-sunken px-3">
      <Search size={14} aria-hidden="true" />
      <input
        className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
        type="search"
        aria-label="Search Shared Library"
        placeholder="Search slug, kind, referenced role, provenance"
        value={query.text}
        onInput={(event) => controller.setQuery({ text: event.currentTarget.value })}
      />
    </label>
    <div className="shared-library-view-toggle flex h-9 items-center rounded-control bg-surface-sunken p-1" aria-label="View">
      <button className={`inline-flex h-7 items-center gap-1 rounded-[7px] border-0 px-2 text-[11px] ${query.view === "grid" ? "is-active bg-instrument text-on-instrument" : "bg-transparent text-muted"}`} type="button" aria-pressed={query.view === "grid"} onClick={() => controller.setQuery({ view: "grid" })}><Grid2X2 size={13} aria-hidden="true" />Grid</button>
      <button className={`inline-flex h-7 items-center gap-1 rounded-[7px] border-0 px-2 text-[11px] ${query.view === "list" ? "is-active bg-instrument text-on-instrument" : "bg-transparent text-muted"}`} type="button" aria-pressed={query.view === "list"} onClick={() => controller.setQuery({ view: "list" })}><List size={13} aria-hidden="true" />List</button>
    </div>
    <SelectMenu overlayOwner="shared.toolbar" className="shared-library-select" value={query.mediaKind} options={kinds} ariaLabel="Kind" prefix="Kind" onValueChange={(mediaKind) => controller.setQuery({ mediaKind })} />
    <SelectMenu overlayOwner="shared.toolbar" className="shared-library-select" value={query.provenance} options={provenances} ariaLabel="Provenance" prefix="Provenance" onValueChange={(provenance) => controller.setQuery({ provenance })} />
    {unavailable.map((label) => <button key={label} type="button" aria-disabled="true" aria-describedby={unavailableReasonId} data-unavailable-filter>{label}</button>)}
    <button type="button" aria-disabled="true" aria-describedby={unavailableReasonId} data-unavailable-filter>Group by entity</button>
    <SelectMenu overlayOwner="shared.toolbar" className="shared-library-select shared-library-sort" value={query.sort} options={sorts} ariaLabel="Sort" prefix="Sort" onValueChange={(sort) => controller.setQuery({ sort })} />
    {dirty && <button className="shared-library-clear" type="button" onClick={() => controller.setQuery({ text: "", mediaKind: "all", provenance: "all" })}><X size={12} aria-hidden="true" />Clear filters</button>}
    <p className="shared-library-toolbar-reason" id={unavailableReasonId}>{unavailableReason} Grouping by entity is unavailable from Core.</p>
  </form>;
}
