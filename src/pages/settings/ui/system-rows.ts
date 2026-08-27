/**
 * The table the system pages are: fixed columns, so five providers read as five rows of one table
 * rather than five different rows.
 *
 * A service row lists identity, reported state and one action. The columns give up their width
 * before they give up their content when the content row is narrow -- a provider whose model name
 * is elided still says which provider it is.
 */
/* A service row lists identity, reported state and one action: the columns are fixed so five
   providers read as a table rather than five different rows, and they give up their width
   before they give up their content when the content row is narrow. */
export const SERVICE_ROW = "flex items-center gap-4 rounded-inner bg-card px-3 py-settings-row [[data-density=compact]_&]:py-settings-row-compact text-left transition-colors duration-slow ease-instrument @max-settings-column/settings-main:flex-wrap";
export const SERVICE_NARROW = "@max-settings-column/settings-main:w-auto @max-settings-column/settings-main:min-w-0 @max-settings-column/settings-main:flex-1";
export const SERVICE_NAME = `flex flex-none flex-col gap-0.75 ${SERVICE_NARROW}`;
export const SERVICE_STATE = "flex min-w-0 flex-1 flex-col gap-0.75";
export const SERVICE_META = "font-code type-mono-xs tracking-status text-muted";
export const SERVICE_MODEL = "max-w-settings-service-model flex-none overflow-hidden font-code type-mono-sm tracking-label text-ellipsis whitespace-nowrap text-muted @max-settings-column/settings-main:hidden";
/* A flat row: one statement per line, no copy column under it. */
export const FLAT_ROW = "flex items-center gap-4 rounded-inner bg-card px-3 py-2.25 text-left transition-colors duration-slow ease-instrument";
export const FLAT_LABEL = `w-settings-diagnostics flex-none type-ui text-ink ${SERVICE_NARROW}`;
export const FLAT_VALUE = "min-w-0 flex-1 overflow-hidden font-code type-meta text-ellipsis whitespace-nowrap text-muted";

export const options = <Value extends string>(values: readonly Value[]) => values.map((value) => ({ value, label: value }));
