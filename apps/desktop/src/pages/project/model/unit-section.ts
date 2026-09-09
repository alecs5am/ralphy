/**
 * Units: the record the project page lists, its revisions, and what one revision holds --
 * its items, its presentations, and the preview the viewer shows.
 *
 * A Unit revision may point at a Composition revision, so this section drives the production
 * one: it asks the Composition section to load the link, or to drop it when a revision has
 * none. Nothing here reaches into Composition state directly.
 */
import type { UnitDto, UnitRevisionDto } from "../../../../electron/ralphy/types";
import type { ProjectDomainState } from "@/entities/project";

import { idleProduction, type CompositionSection } from "./composition-section";
import { appendUnique, errorMessage, idleUnitLoad, idleUnitPage, isConflict, type ProjectScreenController } from "./screen-state";
import type { ProjectScreenSection, ProjectScreenStore } from "./screen-store";

export type UnitActions = Pick<ProjectScreenController,
  "openUnit" | "loadMoreUnitRevisions" | "inspectUnitRevision" | "loadMoreUnitItems"
  | "loadMoreUnitPresentations" | "selectInspectedUnitRevision">;


export function createUnitSection(store: ProjectScreenStore, compositions: CompositionSection): ProjectScreenSection<UnitActions> {
  let unitRequest = 0;
  let unitRevisionPageRequest = 0;
  let unitExactRevisionRequest = 0;
  let unitItemsRequest = 0;
  let unitPresentationsRequest = 0;
  let unitPreviewRequest = 0;
  let unitMutationRequest = 0;

  const domainWithUnit = (value: UnitDto): ProjectDomainState => {
    const units = store.snapshot.domain.pages.units;
    return {
      ...store.snapshot.domain,
      pages: {
        ...store.snapshot.domain.pages,
        units: {
          ...units,
          items: units.items.map((row) => row.id === value.id ? value : row),
        },
      },
    };
  };

  const loadUnitItems = async (unitId: string, revisionId: string, requestId: number) => {
    store.patch({ unitItems: { status: "loading", items: [], nextCursor: null, requestedCursor: null, error: null } });
    try {
      const page = await store.api.loadProjectUnitPage(store.snapshot.domain.project, { kind: "items", revisionId });
      if (store.disposed || requestId !== unitItemsRequest || store.snapshot.unitId !== unitId
        || store.snapshot.inspectedUnitRevisionId !== revisionId) return;
      store.patch({ unitItems: { status: "ready", items: page.items, nextCursor: page.nextCursor, requestedCursor: null, error: null } });
    } catch (error) {
      if (store.disposed || requestId !== unitItemsRequest || store.snapshot.unitId !== unitId
        || store.snapshot.inspectedUnitRevisionId !== revisionId) return;
      store.patch({ unitItems: { status: "error", items: [], nextCursor: null, requestedCursor: null, error: errorMessage(error) } });
    }
  };

  const loadUnitPresentations = async (unitId: string, revisionId: string, requestId: number) => {
    store.patch({ unitPresentations: { status: "loading", items: [], nextCursor: null, requestedCursor: null, error: null } });
    try {
      const page = await store.api.loadProjectUnitPage(store.snapshot.domain.project, { kind: "presentations", revisionId });
      if (store.disposed || requestId !== unitPresentationsRequest || store.snapshot.unitId !== unitId
        || store.snapshot.inspectedUnitRevisionId !== revisionId) return;
      store.patch({ unitPresentations: { status: "ready", items: page.items, nextCursor: page.nextCursor, requestedCursor: null, error: null } });
    } catch (error) {
      if (store.disposed || requestId !== unitPresentationsRequest || store.snapshot.unitId !== unitId
        || store.snapshot.inspectedUnitRevisionId !== revisionId) return;
      store.patch({ unitPresentations: { status: "error", items: [], nextCursor: null, requestedCursor: null, error: errorMessage(error) } });
    }
  };

  const loadUnitPreview = async (unitId: string, revisionId: string) => {
    const artifactRevisionId = store.snapshot.unitPresentations.items.find(({ coverArtifactRevisionId }) => coverArtifactRevisionId)?.coverArtifactRevisionId
      ?? store.snapshot.unitItems.items.find(({ artifactRevisionId }) => artifactRevisionId)?.artifactRevisionId
      ?? null;
    const documentRevisionId = store.snapshot.unitItems.items.find(({ documentRevisionId }) => documentRevisionId)?.documentRevisionId ?? null;
    if (!artifactRevisionId && !documentRevisionId) {
      store.patch({ unitPreview: { status: "idle", value: null, error: null, artifactRevisionId: null } });
      return;
    }
    const requestId = ++unitPreviewRequest;
    store.patch({ unitPreview: { status: "loading", value: null, error: null, artifactRevisionId } });
    try {
      const value = artifactRevisionId
        ? await store.api.resolveCompositionOutputPreview(store.snapshot.domain.project, artifactRevisionId)
        : await store.api.loadDocumentPreview(store.snapshot.domain.project, documentRevisionId!);
      if (store.disposed || requestId !== unitPreviewRequest || store.snapshot.unitId !== unitId
        || store.snapshot.inspectedUnitRevisionId !== revisionId) return;
      store.patch({ unitPreview: { status: "ready", value, error: null, artifactRevisionId } });
    } catch (error) {
      if (store.disposed || requestId !== unitPreviewRequest || store.snapshot.unitId !== unitId
        || store.snapshot.inspectedUnitRevisionId !== revisionId) return;
      store.patch({ unitPreview: { status: "error", value: null, error: errorMessage(error), artifactRevisionId } });
    }
  };

  const loadUnitRevision = async (revisionId: string, known?: UnitRevisionDto) => {
    const unitId = store.snapshot.unitId;
    if (!unitId || !revisionId) return;
    const requestId = ++unitExactRevisionRequest;
    const itemsRequestId = ++unitItemsRequest;
    const presentationsRequestId = ++unitPresentationsRequest;
    unitPreviewRequest += 1;
    unitMutationRequest += 1;
    store.patch({
      inspectedUnitRevisionId: revisionId,
      inspectedUnitRevision: known ? { status: "ready", value: known, error: null } : { status: "loading", value: null, error: null },
      unitItems: idleUnitPage(),
      unitPresentations: idleUnitPage(),
      unitPreview: { status: "idle", value: null, error: null, artifactRevisionId: null },
      unitMutation: "idle",
      unitConflict: null,
      unitMutationError: null,
    });
    try {
      const value = known ?? await store.api.loadProjectUnitRevision(store.snapshot.domain.project, unitId, revisionId);
      if (store.disposed || requestId !== unitExactRevisionRequest || store.snapshot.unitId !== unitId
        || store.snapshot.inspectedUnitRevisionId !== revisionId) return;
      if (value.id !== revisionId || value.unitId !== unitId) throw new Error("Invalid Unit revision");
      const compositionId = store.snapshot.unit.value?.compositionId ?? null;
      if (value.compositionRevisionId && compositionId === null) {
        throw new Error("Invalid Unit production link");
      }
      store.patch({ inspectedUnitRevision: { status: "ready", value, error: null } });
      const production = value.compositionRevisionId && compositionId
        ? compositions.load(compositionId, value.compositionRevisionId)
        : Promise.resolve(compositions.resetProduction());
      await Promise.all([
        loadUnitItems(unitId, revisionId, itemsRequestId),
        loadUnitPresentations(unitId, revisionId, presentationsRequestId),
        production,
      ]);
      if (!store.disposed && requestId === unitExactRevisionRequest && store.snapshot.unitId === unitId
        && store.snapshot.inspectedUnitRevisionId === revisionId) void loadUnitPreview(unitId, revisionId);
    } catch (error) {
      if (store.disposed || requestId !== unitExactRevisionRequest || store.snapshot.unitId !== unitId
        || store.snapshot.inspectedUnitRevisionId !== revisionId) return;
      store.patch({ inspectedUnitRevision: { status: "error", value: null, error: errorMessage(error) } });
    }
  };

  const loadUnit = async (unitId: string) => {
    if (!unitId) return;
    const requestId = ++unitRequest;
    unitRevisionPageRequest += 1;
    unitExactRevisionRequest += 1;
    unitItemsRequest += 1;
    unitPresentationsRequest += 1;
    unitPreviewRequest += 1;
    unitMutationRequest += 1;
    store.patch({
      ...idleProduction(),
      unitId,
      unit: { status: "loading", value: null, error: null },
      unitRevisions: idleUnitPage(),
      inspectedUnitRevisionId: null,
      inspectedUnitRevision: idleUnitLoad(),
      unitItems: idleUnitPage(),
      unitPresentations: idleUnitPage(),
      unitPreview: { status: "idle", value: null, error: null, artifactRevisionId: null },
      unitMutation: "idle",
      unitConflict: null,
      unitMutationError: null,
    });
    let value: UnitDto;
    try {
      value = await store.api.loadProjectUnit(store.snapshot.domain.project, unitId);
      if (store.disposed || requestId !== unitRequest || store.snapshot.unitId !== unitId) return;
      if (value.id !== unitId) throw new Error("Invalid Unit");
      store.patch({ unit: { status: "ready", value, error: null }, domain: domainWithUnit(value) });
    } catch (error) {
      if (store.disposed || requestId !== unitRequest || store.snapshot.unitId !== unitId) return;
      store.patch({ unit: { status: "error", value: null, error: errorMessage(error) } });
      return;
    }

    const revisionRequestId = ++unitRevisionPageRequest;
    let revisions: UnitRevisionDto[] = [];
    store.patch({ unitRevisions: { status: "loading", items: [], nextCursor: null, requestedCursor: null, error: null } });
    try {
      const page = await store.api.loadProjectUnitPage(store.snapshot.domain.project, { kind: "revisions", unitId });
      if (store.disposed || requestId !== unitRequest || revisionRequestId !== unitRevisionPageRequest
        || store.snapshot.unitId !== unitId) return;
      revisions = page.items;
      store.patch({ unitRevisions: { status: "ready", items: revisions, nextCursor: page.nextCursor, requestedCursor: null, error: null } });
    } catch (error) {
      if (store.disposed || requestId !== unitRequest || revisionRequestId !== unitRevisionPageRequest
        || store.snapshot.unitId !== unitId) return;
      store.patch({ unitRevisions: { status: "error", items: [], nextCursor: null, requestedCursor: null, error: errorMessage(error) } });
    }
    const preferred = value.selectedRevisionId ?? value.latestRevisionId ?? revisions[0]?.id ?? null;
    if (preferred && !store.disposed && requestId === unitRequest && store.snapshot.unitId === unitId) {
      await loadUnitRevision(preferred, revisions.find(({ id }) => id === preferred));
    }
  };

  const appendUnitRevisions = async () => {
    const unitId = store.snapshot.unitId;
    const current = store.snapshot.unitRevisions;
    const cursor = current.nextCursor;
    if (!unitId || !cursor || current.status === "loading" || store.snapshot.unitMutation !== "idle") return;
    const requestId = ++unitRevisionPageRequest;
    store.patch({ unitRevisions: { ...current, status: "loading", requestedCursor: cursor, error: null } });
    try {
      const page = await store.api.loadProjectUnitPage(store.snapshot.domain.project, { kind: "revisions", unitId, cursor });
      if (store.disposed || requestId !== unitRevisionPageRequest || store.snapshot.unitId !== unitId) return;
      if (page.nextCursor === cursor) throw new Error("Unit page cursor did not advance");
      store.patch({ unitRevisions: { status: "ready", items: appendUnique(current.items, page.items), nextCursor: page.nextCursor, requestedCursor: null, error: null } });
    } catch (error) {
      if (store.disposed || requestId !== unitRevisionPageRequest || store.snapshot.unitId !== unitId) return;
      store.patch({ unitRevisions: { status: "error", items: current.items, nextCursor: cursor, requestedCursor: null, error: errorMessage(error) } });
    }
  };

  const appendUnitItems = async () => {
    const unitId = store.snapshot.unitId;
    const revisionId = store.snapshot.inspectedUnitRevisionId;
    const current = store.snapshot.unitItems;
    const cursor = current.nextCursor;
    if (!unitId || !revisionId || !cursor || current.status === "loading") return;
    const requestId = ++unitItemsRequest;
    store.patch({ unitItems: { ...current, status: "loading", requestedCursor: cursor, error: null } });
    try {
      const page = await store.api.loadProjectUnitPage(store.snapshot.domain.project, { kind: "items", revisionId, cursor });
      if (store.disposed || requestId !== unitItemsRequest || store.snapshot.unitId !== unitId
        || store.snapshot.inspectedUnitRevisionId !== revisionId) return;
      if (page.nextCursor === cursor) throw new Error("Unit item cursor did not advance");
      store.patch({ unitItems: { status: "ready", items: appendUnique(current.items, page.items), nextCursor: page.nextCursor, requestedCursor: null, error: null } });
    } catch (error) {
      if (store.disposed || requestId !== unitItemsRequest || store.snapshot.unitId !== unitId
        || store.snapshot.inspectedUnitRevisionId !== revisionId) return;
      store.patch({ unitItems: { status: "error", items: current.items, nextCursor: cursor, requestedCursor: null, error: errorMessage(error) } });
    }
  };

  const appendUnitPresentations = async () => {
    const unitId = store.snapshot.unitId;
    const revisionId = store.snapshot.inspectedUnitRevisionId;
    const current = store.snapshot.unitPresentations;
    const cursor = current.nextCursor;
    if (!unitId || !revisionId || !cursor || current.status === "loading") return;
    const requestId = ++unitPresentationsRequest;
    store.patch({ unitPresentations: { ...current, status: "loading", requestedCursor: cursor, error: null } });
    try {
      const page = await store.api.loadProjectUnitPage(store.snapshot.domain.project, { kind: "presentations", revisionId, cursor });
      if (store.disposed || requestId !== unitPresentationsRequest || store.snapshot.unitId !== unitId
        || store.snapshot.inspectedUnitRevisionId !== revisionId) return;
      if (page.nextCursor === cursor) throw new Error("Unit presentation cursor did not advance");
      store.patch({ unitPresentations: { status: "ready", items: appendUnique(current.items, page.items), nextCursor: page.nextCursor, requestedCursor: null, error: null } });
    } catch (error) {
      if (store.disposed || requestId !== unitPresentationsRequest || store.snapshot.unitId !== unitId
        || store.snapshot.inspectedUnitRevisionId !== revisionId) return;
      store.patch({ unitPresentations: { status: "error", items: current.items, nextCursor: cursor, requestedCursor: null, error: errorMessage(error) } });
    }
  };

  const actions: UnitActions = {
    async openUnit(unitId) {
      await loadUnit(unitId);
    },
    async loadMoreUnitRevisions() {
      await appendUnitRevisions();
    },
    async inspectUnitRevision(revisionId) {
      const known = store.snapshot.unitRevisions.items.find(({ id }) => id === revisionId);
      await loadUnitRevision(revisionId, known);
    },
    async loadMoreUnitItems() {
      await appendUnitItems();
    },
    async loadMoreUnitPresentations() {
      await appendUnitPresentations();
    },
    async selectInspectedUnitRevision() {
      const unit = store.snapshot.unit.value;
      const revision = store.snapshot.inspectedUnitRevision.value;
      if (!unit || store.snapshot.unit.status !== "ready" || !revision
        || store.snapshot.inspectedUnitRevision.status !== "ready" || revision.sealedAt === null
        || revision.unitId !== unit.id || revision.id === unit.selectedRevisionId
        || store.snapshot.unitMutation !== "idle" || store.snapshot.unitRevisions.status === "loading") return;
      const requestId = ++unitMutationRequest;
      const unitId = unit.id;
      const revisionId = revision.id;
      store.patch({ unitMutation: "select", unitConflict: null, unitMutationError: null });
      try {
        const selected = await store.api.selectProjectUnitRevision(
          store.snapshot.domain.project,
          unitId,
          revisionId,
          unit.selectedRevisionId,
        );
        if (store.disposed || requestId !== unitMutationRequest || store.snapshot.unitId !== unitId
          || store.snapshot.inspectedUnitRevisionId !== revisionId) return;
        if (selected.id !== unitId || selected.selectedRevisionId !== revisionId) {
          throw new Error("Invalid Unit selection");
        }
        store.patch({
          unit: { status: "ready", value: selected, error: null },
          unitMutation: "idle",
          unitConflict: null,
          unitMutationError: null,
          domain: domainWithUnit(selected),
        });
      } catch (error) {
        if (store.disposed || requestId !== unitMutationRequest || store.snapshot.unitId !== unitId
          || store.snapshot.inspectedUnitRevisionId !== revisionId) return;
        if (!isConflict(error)) {
          store.patch({ unitMutation: "idle", unitMutationError: errorMessage(error) });
          return;
        }
        const shellRequestId = ++unitRequest;
        const pageRequestId = ++unitRevisionPageRequest;
        try {
          const [authoritative, revisions] = await Promise.all([
            store.api.loadProjectUnit(store.snapshot.domain.project, unitId),
            store.api.loadProjectUnitPage(store.snapshot.domain.project, { kind: "revisions", unitId }),
          ]);
          if (store.disposed || requestId !== unitMutationRequest || shellRequestId !== unitRequest
            || pageRequestId !== unitRevisionPageRequest || store.snapshot.unitId !== unitId
            || store.snapshot.inspectedUnitRevisionId !== revisionId) return;
          if (authoritative.id !== unitId) throw new Error("Invalid Unit");
          store.patch({
            unit: { status: "ready", value: authoritative, error: null },
            unitRevisions: { status: "ready", items: revisions.items, nextCursor: revisions.nextCursor, requestedCursor: null, error: null },
            unitMutation: "idle",
            unitConflict: "The selected revision changed elsewhere. Current pointer reloaded; click again to retry.",
            unitMutationError: null,
            domain: domainWithUnit(authoritative),
          });
        } catch (reloadError) {
          if (store.disposed || requestId !== unitMutationRequest || store.snapshot.unitId !== unitId) return;
          store.patch({ unitMutation: "idle", unitMutationError: errorMessage(reloadError) });
        }
      }
    },
  };
  return {
    actions,
    dispose() {
      unitRequest += 1;
      unitRevisionPageRequest += 1;
      unitExactRevisionRequest += 1;
      unitItemsRequest += 1;
      unitPresentationsRequest += 1;
      unitPreviewRequest += 1;
      unitMutationRequest += 1;
    },
  };
}
