import { ICON_BUTTON } from "@/shared/ui/IconButton";

const STUDIO_CONTROL = "inline-flex min-h-8 items-center justify-center gap-2 rounded-control px-3 type-xs font-medium transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none";
export const STUDIO_BUTTON = `${STUDIO_CONTROL} bg-field text-ink hover:bg-row-hover`;
export const STUDIO_PRIMARY = `${STUDIO_CONTROL} generation-primary`;
export const studioSelection = (active: boolean) => `${STUDIO_CONTROL} ${active ? "generation-selected" : "generation-unselected"}`;
export const STUDIO_ICON = `${ICON_BUTTON} size-8 rounded-control bg-chip text-muted hover:bg-row-hover hover:text-ink`;
export const STUDIO_FIELD = "generation-field min-h-9 w-full min-w-0 rounded-field bg-field px-3 py-2 type-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink disabled:opacity-35";
export const STUDIO_LABEL = "generation-label flex items-center justify-between gap-2 text-muted";
