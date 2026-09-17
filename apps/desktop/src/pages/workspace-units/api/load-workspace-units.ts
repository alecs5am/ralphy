import type { MediaWorkbenchBridge, WorkspaceUnitCursors } from "../../../../electron/media/types";
import type { OverviewPublicationDto, UnitDto } from "../../../../electron/ralphy/types";

export async function loadWorkspaceUnits(
  workspaceId: string,
  read: MediaWorkbenchBridge["loadWorkspaceUnitPage"],
  isCurrent = () => true,
): Promise<{ units: UnitDto[]; publications: OverviewPublicationDto[]; warning: string | null }> {
  const units = new Map<string, UnitDto>();
  const publications = new Map<string, OverviewPublicationDto>();
  const seen = { units: new Set<string>(), publications: new Set<string>() };
  let cursors: WorkspaceUnitCursors = { units: null, publications: null };
  let warning: string | null = null;
  try {
    while (Object.keys(cursors).length && isCurrent()) {
      const page = await read(workspaceId, cursors);
      const next: WorkspaceUnitCursors = {};
      for (const key of ["units", "publications"] as const) {
        if (cursors[key] === undefined) continue;
        const result = page[key];
        if (!result) throw new Error(`The library did not return ${key}.`);
        if (key === "units") for (const unit of page.units!.items) units.set(unit.id, unit);
        else for (const publication of page.publications!.items) publications.set(publication.id, publication);
        if (result.nextCursor) {
          if (seen[key].has(result.nextCursor)) throw new Error("The library repeated a page cursor. Retry to read the remaining items.");
          seen[key].add(result.nextCursor);
          next[key] = result.nextCursor;
        }
      }
      cursors = next;
    }
  } catch (error) {
    warning = error instanceof Error ? error.message : "The workspace library could not be read.";
  }
  return { units: [...units.values()], publications: [...publications.values()], warning };
}
