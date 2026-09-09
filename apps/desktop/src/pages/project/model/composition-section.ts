/**
 * Compositions: the production behind a Unit revision -- its revisions, their sources and
 * inputs, the builds each revision produced, and the preview of a build's output.
 *
 * Every load bumps the counters of everything below it before it writes, so a page that lands
 * after its parent changed lands nowhere. That is the whole concurrency story here: no request
 * is cancelled, each one checks on arrival that the parent it was asked for is still the parent.
 */
import type { BuildDto, BuildOutputDto, CompositionDto, CompositionRevisionDto } from "../../../../electron/ralphy/types";
import type { ProjectDomainState } from "@/entities/project";

import { appendUnique, errorMessage, idleUnitLoad, idleUnitPage, isConflict, type ProjectScreenController, type ProjectScreenSnapshot, type UnitPage } from "./screen-state";
import type { ProjectScreenSection, ProjectScreenStore } from "./screen-store";

export type CompositionActions = Pick<ProjectScreenController,
  "openComposition" | "inspectCompositionRevision" | "loadMoreCompositionRevisions"
  | "loadMoreCompositionSources" | "loadMoreCompositionInputs"
  | "loadMoreCompositionRevisionEvaluations" | "loadMoreCompositionBuilds"
  | "loadMoreCompositionBuildOutputs" | "loadMoreCompositionBuildEvaluations"
  | "previewCompositionOutput" | "selectInspectedCompositionRevision" | "reviseSelectedComposition"
  | "buildInspectedCompositionRevision">;

export interface CompositionSection extends ProjectScreenSection<CompositionActions> {
  /** Load a Composition whole: the record, its revisions, and the revision to inspect. */
  load(compositionId: string, inspectedRevisionId?: string | null, conflict?: string | null): Promise<void>;
  /** Drop the production a Unit revision no longer points at, and strand its requests. */
  resetProduction(): void;
}

/**
 * Every Composition key back to idle. Two callers clear the production -- a Unit revision with no
 * composition link, and a Unit that has just been opened -- and stating the keys once is what
 * keeps a key added later from being cleared in one place and left behind in the other.
 */
export const idleProduction = (): Partial<ProjectScreenSnapshot> => ({
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
});

  const compositionPageKeys = {
    revisions: "compositionRevisions",
    sources: "compositionSources",
    inputs: "compositionInputs",
    "revision-evaluations": "compositionRevisionEvaluations",
    builds: "compositionBuilds",
    "build-outputs": "compositionBuildOutputs",
    "build-evaluations": "compositionBuildEvaluations",
  } as const;
  type CompositionPageKind = keyof typeof compositionPageKeys;

export function createCompositionSection(store: ProjectScreenStore): CompositionSection {
  let compositionRequest = 0;
  let compositionRevisionRequest = 0;
  let compositionBuildRequest = 0;
  const compositionPageRequests = {
    revisions: 0, sources: 0, inputs: 0, "revision-evaluations": 0, builds: 0,
    "build-outputs": 0, "build-evaluations": 0,
  };
  let compositionPreviewRequest = 0;
  let compositionMutationRequest = 0;

  const compositionParentCurrent = (kind: CompositionPageKind, parentId: string): boolean => (
    kind === "revisions" ? store.snapshot.compositionId === parentId
      : kind === "build-outputs" || kind === "build-evaluations"
        ? store.snapshot.inspectedCompositionBuildId === parentId
        : store.snapshot.inspectedCompositionRevisionId === parentId
  );

  const domainWithComposition = (value: CompositionDto): ProjectDomainState => {
    const compositions = store.snapshot.domain.pages.compositions;
    return { ...store.snapshot.domain, pages: { ...store.snapshot.domain.pages, compositions: { ...compositions, items: compositions.items.map((item) => item.id === value.id ? value : item) } } };
  };

  async function loadCompositionBuild(buildId: string, known?: BuildDto): Promise<void> {
    const revisionId = store.snapshot.inspectedCompositionRevisionId;
    if (!revisionId) return;
    const requestId = ++compositionBuildRequest;
    compositionPreviewRequest += 1;
    compositionPageRequests["build-outputs"] += 1;
    compositionPageRequests["build-evaluations"] += 1;
    store.patch({
      inspectedCompositionBuildId: buildId,
      inspectedCompositionBuild: known ? { status: "ready", value: known, error: null } : { status: "loading", value: null, error: null },
      compositionBuildOutputs: idleUnitPage(),
      compositionBuildEvaluations: idleUnitPage(),
      compositionPreview: { status: "idle", value: null, error: null, artifactRevisionId: null },
    });
    try {
      const value = known ?? await store.api.loadProjectCompositionBuild(store.snapshot.domain.project, buildId);
      if (store.disposed || requestId !== compositionBuildRequest || store.snapshot.inspectedCompositionRevisionId !== revisionId
        || store.snapshot.inspectedCompositionBuildId !== buildId) return;
      if (value.compositionRevisionId !== revisionId) throw new Error("Invalid Composition Build");
      store.patch({ inspectedCompositionBuild: { status: "ready", value, error: null } });
      await Promise.all([
        loadCompositionPage("build-outputs", buildId),
        loadCompositionPage("build-evaluations", buildId),
      ]);
    } catch (error) {
      if (!store.disposed && requestId === compositionBuildRequest && store.snapshot.inspectedCompositionBuildId === buildId) {
        store.patch({ inspectedCompositionBuild: { status: "error", value: null, error: errorMessage(error) } });
      }
    }
  }

  async function loadCompositionPreview(artifactRevisionId: string): Promise<void> {
    const value = store.snapshot.composition.value;
    if (!value || !store.snapshot.compositionBuildOutputs.items.some((output) => output.artifactRevisionId === artifactRevisionId)) return;
    if (store.snapshot.compositionPreview.artifactRevisionId === artifactRevisionId
      && (store.snapshot.compositionPreview.status === "loading" || store.snapshot.compositionPreview.status === "ready")) return;
    const requestId = ++compositionPreviewRequest;
    const compositionId = value.id;
    const revisionId = store.snapshot.inspectedCompositionRevisionId;
    const buildId = store.snapshot.inspectedCompositionBuildId;
    store.patch({ compositionPreview: { status: "loading", value: null, error: null, artifactRevisionId } });
    try {
      const preview = await store.api.resolveCompositionOutputPreview(store.snapshot.domain.project, artifactRevisionId);
      if (store.disposed || requestId !== compositionPreviewRequest || store.snapshot.compositionId !== compositionId
        || store.snapshot.inspectedCompositionRevisionId !== revisionId || store.snapshot.inspectedCompositionBuildId !== buildId
        || !store.snapshot.compositionBuildOutputs.items.some((output) => output.artifactRevisionId === artifactRevisionId)) return;
      store.patch({ compositionPreview: { status: "ready", value: preview, error: null, artifactRevisionId } });
    } catch (error) {
      if (store.disposed || requestId !== compositionPreviewRequest || store.snapshot.compositionId !== compositionId
        || store.snapshot.inspectedCompositionRevisionId !== revisionId || store.snapshot.inspectedCompositionBuildId !== buildId) return;
      store.patch({ compositionPreview: { status: "error", value: null, error: errorMessage(error), artifactRevisionId } });
    }
  }

  async function loadCompositionPage(kind: CompositionPageKind, parentId: string, append = false): Promise<void> {
    const key = compositionPageKeys[kind];
    const current = store.snapshot[key] as UnitPage<{ id: string }>;
    const cursor = append ? current.nextCursor : null;
    if (append && (current.status === "loading" || cursor === null)) return;
    const requestId = ++compositionPageRequests[kind];
    const requestInput = kind === "revisions" ? { kind, compositionId: parentId, ...(cursor ? { cursor } : {}) }
      : kind === "build-outputs" || kind === "build-evaluations" ? { kind, buildId: parentId, ...(cursor ? { cursor } : {}) }
        : { kind, revisionId: parentId, ...(cursor ? { cursor } : {}) };
    store.patch({ [key]: { status: "loading", items: append ? current.items : [], nextCursor: cursor, requestedCursor: cursor, error: null } } as Partial<ProjectScreenSnapshot>);
    try {
      const page = await store.api.loadProjectCompositionPage(store.snapshot.domain.project, requestInput);
      if (store.disposed || requestId !== compositionPageRequests[kind] || !compositionParentCurrent(kind, parentId)) return;
      if (append && page.nextCursor === cursor) throw new Error("Composition page cursor did not advance");
      const items = append ? appendUnique(current.items, page.items) : page.items;
      store.patch({ [key]: { status: "ready", items, nextCursor: page.nextCursor, requestedCursor: null, error: null } } as Partial<ProjectScreenSnapshot>);
      if (kind === "builds" && !append) {
        const newest = (items as BuildDto[])[0];
        if (newest) await loadCompositionBuild(newest.id, newest);
      } else if (kind === "build-outputs" && !append) {
        const first = [...items as BuildOutputDto[]].sort((left, right) => left.position - right.position)[0];
        if (first) void loadCompositionPreview(first.artifactRevisionId);
      }
    } catch (error) {
      if (store.disposed || requestId !== compositionPageRequests[kind] || !compositionParentCurrent(kind, parentId)) return;
      store.patch({ [key]: { status: "error", items: append ? current.items : [], nextCursor: cursor, requestedCursor: null, error: errorMessage(error) } } as Partial<ProjectScreenSnapshot>);
    }
  }

  async function loadCompositionRevision(revisionId: string, known?: CompositionRevisionDto): Promise<void> {
    const compositionId = store.snapshot.compositionId;
    if (!compositionId) return;
    const requestId = ++compositionRevisionRequest;
    compositionPreviewRequest += 1;
    compositionBuildRequest += 1;
    for (const kind of ["sources", "inputs", "revision-evaluations", "builds", "build-outputs", "build-evaluations"] as const) compositionPageRequests[kind] += 1;
    store.patch({
      inspectedCompositionRevisionId: revisionId,
      inspectedCompositionRevision: known ? { status: "ready", value: known, error: null } : { status: "loading", value: null, error: null },
      compositionSources: idleUnitPage(),
      compositionInputs: idleUnitPage(),
      compositionRevisionEvaluations: idleUnitPage(),
      compositionBuilds: idleUnitPage(),
      inspectedCompositionBuildId: null,
      inspectedCompositionBuild: idleUnitLoad(),
      compositionBuildOutputs: idleUnitPage(),
      compositionBuildEvaluations: idleUnitPage(),
      compositionPreview: { status: "idle", value: null, error: null, artifactRevisionId: null },
    });
    try {
      const value = known ?? await store.api.loadProjectCompositionRevision(store.snapshot.domain.project, revisionId);
      if (store.disposed || requestId !== compositionRevisionRequest || store.snapshot.compositionId !== compositionId
        || store.snapshot.inspectedCompositionRevisionId !== revisionId) return;
      if (value.compositionId !== compositionId) throw new Error("Invalid Composition revision");
      store.patch({ inspectedCompositionRevision: { status: "ready", value, error: null } });
      await Promise.all([
        loadCompositionPage("sources", revisionId),
        loadCompositionPage("inputs", revisionId),
        loadCompositionPage("revision-evaluations", revisionId),
        loadCompositionPage("builds", revisionId),
      ]);
    } catch (error) {
      if (!store.disposed && requestId === compositionRevisionRequest && store.snapshot.inspectedCompositionRevisionId === revisionId) {
        store.patch({ inspectedCompositionRevision: { status: "error", value: null, error: errorMessage(error) } });
      }
    }
  }

  const loadComposition = async (compositionId: string, inspectedRevisionId: string | null = null, conflict: string | null = null) => {
    const requestId = ++compositionRequest;
    compositionPreviewRequest += 1;
    compositionRevisionRequest += 1;
    compositionBuildRequest += 1;
    for (const kind of Object.keys(compositionPageRequests) as CompositionPageKind[]) compositionPageRequests[kind] += 1;
    const projectRef = store.snapshot.domain.project;
    store.patch({
      compositionId,
      composition: { status: "loading", value: null, error: null },
      compositionRevisions: idleUnitPage(),
      inspectedCompositionRevisionId: null,
      inspectedCompositionRevision: idleUnitLoad(),
      compositionSources: idleUnitPage(), compositionInputs: idleUnitPage(), compositionRevisionEvaluations: idleUnitPage(), compositionBuilds: idleUnitPage(),
      inspectedCompositionBuildId: null, inspectedCompositionBuild: idleUnitLoad(), compositionBuildOutputs: idleUnitPage(), compositionBuildEvaluations: idleUnitPage(),
      compositionPreview: { status: "idle", value: null, error: null, artifactRevisionId: null },
      compositionConflict: conflict,
      compositionMutationError: null,
    });
    try {
      const value = await store.api.loadProjectComposition(projectRef, compositionId);
      if (store.disposed || requestId !== compositionRequest || store.snapshot.compositionId !== compositionId) return;
      store.patch({ composition: { status: "ready", value, error: null }, compositionConflict: conflict, domain: domainWithComposition(value) });
      await loadCompositionPage("revisions", compositionId);
      if (store.disposed || requestId !== compositionRequest || store.snapshot.compositionId !== compositionId) return;
      const revisions = store.snapshot.compositionRevisions.items;
      const preferred = inspectedRevisionId ?? value.selectedRevisionId ?? value.latestRevisionId;
      const revisionId = preferred ?? revisions[0]?.id ?? null;
      if (revisionId) {
        await loadCompositionRevision(revisionId, revisions.find(({ id }) => id === revisionId));
        if (store.disposed || requestId !== compositionRequest || store.snapshot.compositionId !== compositionId) return;
        const exact = store.snapshot.inspectedCompositionRevision.value;
        if (exact && !store.snapshot.compositionRevisions.items.some(({ id }) => id === exact.id)) {
          store.patch({ compositionRevisions: { ...store.snapshot.compositionRevisions, items: [...store.snapshot.compositionRevisions.items, exact] } });
        }
      }
    } catch (error) {
      if (!store.disposed && requestId === compositionRequest && store.snapshot.compositionId === compositionId) {
        store.patch({ composition: { status: "error", value: null, error: errorMessage(error) } });
      }
    }
  };

  const runCompositionMutation = async (kind: "revise" | "select" | "build", run: (value: CompositionDto) => Promise<unknown>) => {
    const value = store.snapshot.composition.value;
    if (!value || store.snapshot.compositionMutation !== "idle") return;
    const requestId = ++compositionMutationRequest;
    const compositionId = value.id;
    const inspected = store.snapshot.inspectedCompositionRevisionId;
    store.patch({ compositionMutation: kind, compositionConflict: null, compositionMutationError: null });
    try {
      await run(value);
      if (store.disposed || requestId !== compositionMutationRequest || store.snapshot.compositionId !== compositionId) return;
      await loadComposition(compositionId, inspected);
      if (!store.disposed && requestId === compositionMutationRequest && store.snapshot.compositionId === compositionId) store.patch({ compositionMutation: "idle" });
    } catch (error) {
      if (store.disposed || requestId !== compositionMutationRequest || store.snapshot.compositionId !== compositionId) return;
      const conflict = isConflict(error)
        ? kind === "select"
          ? "The selected revision changed elsewhere. Current pointer reloaded; click again to retry."
          : kind === "revise"
            ? "The latest revision changed elsewhere. Current pointer reloaded; click again to retry."
            : "The latest draft changed elsewhere. Current state reloaded; click again to retry."
        : null;
      const message = conflict ? null : errorMessage(error);
      await loadComposition(compositionId, inspected, conflict);
      if (!store.disposed && requestId === compositionMutationRequest && store.snapshot.compositionId === compositionId) {
        store.patch({ compositionMutation: "idle", compositionMutationError: message });
      }
    }
  };

  const resetProduction = () => {
    compositionRequest += 1;
    compositionRevisionRequest += 1;
    compositionBuildRequest += 1;
    compositionPreviewRequest += 1;
    for (const kind of Object.keys(compositionPageRequests) as CompositionPageKind[]) compositionPageRequests[kind] += 1;
    store.patch(idleProduction());
  };

  const actions: CompositionActions = {
    async openComposition(compositionId) {
      compositionMutationRequest += 1;
      store.patch({ compositionMutation: "idle", compositionConflict: null, compositionMutationError: null });
      await loadComposition(compositionId);
    },
    async inspectCompositionRevision(revisionId) {
      const known = store.snapshot.compositionRevisions.items.find(({ id }) => id === revisionId);
      if (!known) return;
      store.patch({ compositionConflict: null, compositionMutationError: null });
      await loadCompositionRevision(revisionId, known);
    },
    async loadMoreCompositionRevisions() { if (store.snapshot.compositionId) await loadCompositionPage("revisions", store.snapshot.compositionId, store.snapshot.compositionRevisions.items.length > 0); },
    async loadMoreCompositionSources() { if (store.snapshot.inspectedCompositionRevisionId) await loadCompositionPage("sources", store.snapshot.inspectedCompositionRevisionId, store.snapshot.compositionSources.items.length > 0); },
    async loadMoreCompositionInputs() { if (store.snapshot.inspectedCompositionRevisionId) await loadCompositionPage("inputs", store.snapshot.inspectedCompositionRevisionId, store.snapshot.compositionInputs.items.length > 0); },
    async loadMoreCompositionRevisionEvaluations() { if (store.snapshot.inspectedCompositionRevisionId) await loadCompositionPage("revision-evaluations", store.snapshot.inspectedCompositionRevisionId, store.snapshot.compositionRevisionEvaluations.items.length > 0); },
    async loadMoreCompositionBuilds() { if (store.snapshot.inspectedCompositionRevisionId) await loadCompositionPage("builds", store.snapshot.inspectedCompositionRevisionId, store.snapshot.compositionBuilds.items.length > 0); },
    async loadMoreCompositionBuildOutputs() { if (store.snapshot.inspectedCompositionBuildId) await loadCompositionPage("build-outputs", store.snapshot.inspectedCompositionBuildId, store.snapshot.compositionBuildOutputs.items.length > 0); },
    async loadMoreCompositionBuildEvaluations() { if (store.snapshot.inspectedCompositionBuildId) await loadCompositionPage("build-evaluations", store.snapshot.inspectedCompositionBuildId, store.snapshot.compositionBuildEvaluations.items.length > 0); },
    async previewCompositionOutput(artifactRevisionId) {
      await loadCompositionPreview(artifactRevisionId);
    },
    async selectInspectedCompositionRevision() {
      const revisionId = store.snapshot.inspectedCompositionRevisionId;
      const value = store.snapshot.composition.value;
      const revision = store.snapshot.inspectedCompositionRevision.value;
      if (!value || !revisionId || revision?.state !== "sealed" || revisionId === value.selectedRevisionId) return;
      await runCompositionMutation("select", () => store.api.selectProjectCompositionRevision(store.snapshot.domain.project, {
        compositionId: value.id,
        revisionId,
        expectedSelectedRevisionId: value.selectedRevisionId,
      }));
    },
    async reviseSelectedComposition() {
      const value = store.snapshot.composition.value;
      const latest = store.snapshot.compositionRevisions.items.find(({ id }) => id === value?.latestRevisionId);
      if (!value || !latest) return;
      await runCompositionMutation("revise", () => store.api.reviseProjectComposition(store.snapshot.domain.project, {
        compositionId: value.id,
        expectedLatestRevisionId: value.latestRevisionId,
        parentRevisionId: latest.id,
        iterationId: latest.iterationId,
        engine: latest.engine,
        engineVersion: latest.engineVersion,
      }));
    },
    async buildInspectedCompositionRevision() {
      const value = store.snapshot.composition.value;
      const revision = store.snapshot.inspectedCompositionRevision.value;
      const unit = store.snapshot.unit.value;
      const unitRevision = store.snapshot.inspectedUnitRevision.value;
      const linkedSelection = !!unit && !!unitRevision
        && unit.selectedRevisionId === unitRevision.id
        && unitRevision.compositionRevisionId === revision?.id;
      const latestBuild = [...store.snapshot.compositionBuilds.items].sort((left, right) => right.createdAt - left.createdAt)[0];
      const retry = linkedSelection && revision?.state === "sealed"
        && (latestBuild?.state === "failed" || latestBuild?.state === "cancelled");
      if (!value || !revision || (!retry && (revision.id !== value.latestRevisionId || revision.state !== "draft"))) return;
      await runCompositionMutation("build", () => store.api.buildProjectComposition(store.snapshot.domain.project, revision.id));
    },
  };
  return {
    actions,
    load: loadComposition,
    resetProduction,
    dispose() {
      compositionRequest += 1;
      compositionRevisionRequest += 1;
      compositionBuildRequest += 1;
      compositionPreviewRequest += 1;
      compositionMutationRequest += 1;
      for (const kind of Object.keys(compositionPageRequests) as CompositionPageKind[]) compositionPageRequests[kind] += 1;
    },
  };
}
