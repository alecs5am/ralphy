// Unit helpers shared by `ralphy unit` and flows that act on a Unit's behalf
// (analytics import adds a missing platform Presentation; the decision ledger
// resolves a Unit reference): one sealed revision graph as a view or as
// `reviseUnit` input, and reference resolution. Pure store reads.

import { DomainError } from "./errors/domain.js";
import {
  getUnit,
  getUnitRevision,
  listPresentationCaptionRevisions,
  listPresentationItems,
  listUnitItems,
  listUnitPresentations,
  type ReviseUnitInput,
  type UnitPresentationInput,
} from "./store/units.js";
import type { PresentationItemDto, UnitPresentationDto } from "./store/types.js";
import type { QueryContext } from "./store/scope-context.js";
import { locateUnits, type UnitLocationDto } from "./store/outcomes.js";

export type PresentationView = UnitPresentationDto & {
  captions: ReturnType<typeof listPresentationCaptionRevisions>["items"];
  items: PresentationItemDto[];
};

export function allPages<T>(
  read: (after: string | null) => { items: T[]; nextCursor: string | null },
): T[] {
  const items: T[] = [];
  let after: string | null = null;
  do {
    const page = read(after);
    items.push(...page.items);
    after = page.nextCursor;
  } while (after !== null);
  return items;
}

/** The Unit plus one exact revision's items and presentations (with captions + items). */
export function unitRevisionView(
  context: QueryContext,
  unitId: string,
  revisionId: string,
) {
  const unit = getUnit({ context, unitId });
  const revision = getUnitRevision({ context, revisionId });
  if (revision.unitId !== unit.id) {
    throw new DomainError("E_NOT_FOUND", undefined, { kind: "Unit Revision", id: revisionId });
  }
  const items = allPages((after) =>
    listUnitItems({ context, revisionId, after, limit: 100 }),
  );
  const presentations = allPages((after) =>
    listUnitPresentations({ context, revisionId, after, limit: 100 }),
  ).map<PresentationView>((presentation) => ({
    ...presentation,
    captions: allPages((after) =>
      listPresentationCaptionRevisions({
        context,
        presentationId: presentation.id,
        after,
        limit: 100,
      }),
    ),
    items: allPages((after) =>
      listPresentationItems({
        context,
        presentationId: presentation.id,
        after,
        limit: 100,
      }),
    ),
  }));
  return { unit, revision, items, presentations };
}

/** A revision restated as `reviseUnit` input, so a caller can append a near-identical revision. */
export function unitRevisionInput(
  context: QueryContext,
  revisionId: string,
): { items: ReviseUnitInput["items"]; presentations: UnitPresentationInput[] } {
  const view = unitRevisionView(
    context,
    getUnitRevision({ context, revisionId }).unitId,
    revisionId,
  );
  const itemPositions = new Map(view.items.map((item) => [item.id, item.position]));
  return {
    items: view.items.map((item) => ({
      artifactRevisionId: item.artifactRevisionId,
      documentRevisionId: item.documentRevisionId,
      role: item.role,
      position: item.position,
      config: item.config,
    })),
    presentations: view.presentations.map((presentation) => ({
      platform: presentation.platform,
      position: presentation.position,
      captions: presentation.captions.map((caption) => ({
        state: caption.state,
        text: caption.text,
      })),
      effectiveCaptionRevisionNo:
        presentation.effectiveCaptionRevisionId === null
          ? null
          : presentation.captions.find(
              (caption) => caption.id === presentation.effectiveCaptionRevisionId,
            )?.revisionNo ?? null,
      coverArtifactRevisionId: presentation.coverArtifactRevisionId,
      crop: presentation.crop,
      safeArea: presentation.safeArea,
      options: presentation.options,
      items: presentation.items.map((item) => ({
        unitItemPosition: itemPositions.get(item.unitItemId)!,
        position: item.position,
        config: item.config,
      })),
    })),
  };
}

/** Resolve exactly one Unit from a Unit ID / slug or a single-Unit Project. */
export function resolveUnitReference(context: QueryContext, ref: string): UnitLocationDto {
  const matches = locateUnits({ context, ref });
  if (matches.length === 0) {
    throw new DomainError("E_NOT_FOUND", undefined, { kind: "Unit", id: ref });
  }
  if (matches.length > 1) {
    const candidates = matches
      .slice(0, 10)
      .map((match) => `${match.unitId} (${match.slug}${match.projectSlug ? ` in ${match.projectSlug}` : ""})`)
      .join(", ");
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "unit",
      detail: `"${ref}" matches ${matches.length} Units; pass one Unit ID: ${candidates}`.slice(0, 1800),
    });
  }
  return matches[0]!;
}

/** The narrowest context that sees the Unit (a Session keeps its own authority). */
export function unitContext(context: QueryContext, location: UnitLocationDto): QueryContext {
  if (context.sessionId !== undefined) return context;
  return location.projectId
    ? { workspaceId: location.workspaceId, projectId: location.projectId }
    : { workspaceId: location.workspaceId };
}
