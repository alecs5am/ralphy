/**
 * The one piece of state the project screen's sections share.
 *
 * Every section reads the whole snapshot and writes only its own keys, so the store exposes a
 * `patch` rather than a setter: a section states the keys it changed and never has to spread a
 * snapshot it does not own. `snapshot` and `disposed` are getters because a section holds the
 * store, not a copy of what the store held when the section was built.
 */
import { createProjectDomainState, projectDomainReducer } from "@/entities/project";

import type { ProjectSummary } from "../../../../electron/media/types";
import { idleDocument, idleUnitLoad, idleUnitPage, type ProjectScreenApi, type ProjectScreenSnapshot } from "./screen-state";

export interface ProjectScreenStore {
  readonly api: ProjectScreenApi;
  readonly snapshot: ProjectScreenSnapshot;
  readonly disposed: boolean;
  patch(part: Partial<ProjectScreenSnapshot>): void;
  reduce(action: Parameters<typeof projectDomainReducer>[1]): void;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export function createProjectScreenStore(api: ProjectScreenApi, project: ProjectSummary): ProjectScreenStore {
  let snapshot: ProjectScreenSnapshot = {
    domain: createProjectDomainState({ workspaceId: project.workspaceId, projectId: project.projectId }),
    activeTab: "units",
    selectedDocument: null,
    documentPreview: idleDocument,
    documentMode: "read",
    documentSearch: { query: "", items: [], nextCursor: null, status: "idle", appendError: null },
    documentDraft: null,
    documentDirty: false,
    documentSaving: false,
    documentConflict: null,
    documentConflictReview: false,
    selectedMedia: null,
    mediaViewerOpen: false,
    mediaGeneration: { status: "idle", value: null, error: null },
    mediaRevisions: { status: "idle", items: [], error: null },
    compositionId: null,
    composition: idleUnitLoad(),
    compositionRevisions: idleUnitPage(),
    inspectedCompositionRevisionId: null,
    inspectedCompositionRevision: idleUnitLoad(),
    compositionSources: idleUnitPage(),
    compositionInputs: idleUnitPage(),
    compositionRevisionEvaluations: idleUnitPage(),
    compositionBuilds: idleUnitPage(),
    inspectedCompositionBuildId: null,
    inspectedCompositionBuild: idleUnitLoad(),
    compositionBuildOutputs: idleUnitPage(),
    compositionBuildEvaluations: idleUnitPage(),
    compositionPreview: { status: "idle", value: null, error: null, artifactRevisionId: null },
    compositionMutation: "idle",
    compositionConflict: null,
    compositionMutationError: null,
    unitId: null,
    unit: idleUnitLoad(),
    unitRevisions: idleUnitPage(),
    inspectedUnitRevisionId: null,
    inspectedUnitRevision: idleUnitLoad(),
    unitItems: idleUnitPage(),
    unitPresentations: idleUnitPage(),
    unitPreview: { status: "idle", value: null, error: null, artifactRevisionId: null },
    unitMutation: "idle",
    unitConflict: null,
    unitMutationError: null,
  };
  let disposed = false;
  const listeners = new Set<() => void>();
  const patch = (part: Partial<ProjectScreenSnapshot>) => {
    if (disposed) return;
    snapshot = { ...snapshot, ...part };
    listeners.forEach((listener) => listener());
  };
  return {
    api,
    get snapshot() { return snapshot; },
    get disposed() { return disposed; },
    patch,
    reduce: (action) => patch({ domain: projectDomainReducer(snapshot.domain, action) }),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { disposed = true; listeners.clear(); },
  };
}

/**
 * One domain's share of the controller: the actions it owns, and the way to make every request
 * it has in flight land nowhere. A section never returns its loaders -- a caller that needs one
 * gets it named on the section, so the reason for the crossing is visible.
 */
export interface ProjectScreenSection<Actions> {
  actions: Actions;
  dispose(): void;
}
