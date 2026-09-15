import type { UnitRevisionDto } from "../../../../electron/ralphy/types";

/** Originals occupy R0 in the UI; persisted revision numbers remain unchanged. */
export function unitRevisionNumber(revision: UnitRevisionDto, source?: UnitRevisionDto | null): number {
  if (!source || source.unitId !== revision.unitId) return revision.revisionNo;
  if (revision.id === source.id) return 0;
  return revision.revisionNo - (revision.revisionNo > source.revisionNo ? 1 : 0);
}
