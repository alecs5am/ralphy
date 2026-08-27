/**
 * The project screen's controller: one store, four domain sections, and the paging the screen
 * itself owns -- the overview, a tab's page, and the activity feed that arrives by announcement.
 *
 * What lives here is what no single domain owns. Documents, media, compositions and units each
 * hold their own requests and expose only the actions the screen calls, so a change to one is a
 * change to one file. The two crossings are named rather than implied: a Composition page opens
 * the Composition the row points at, and a media query reloads the page it filters.
 *
 * Concurrency is a counter per request, never a cancellation: a response checks on arrival that
 * it is still the newest of its kind and that the thing it was asked about is still selected.
 */
import type { ActivityDto } from "../../../../electron/ralphy/types";
import type { ProjectSummary, ProjectTab } from "../../../../electron/media/types";
import type { DomainRow } from "@/entities/project";

import { createCompositionSection } from "./composition-section";
import { createDocumentSection } from "./document-section";
import { createMediaSection } from "./media-section";
import { errorMessage, type ProjectScreenApi, type ProjectScreenController } from "./screen-state";
import { createProjectScreenStore } from "./screen-store";
import { createUnitSection } from "./unit-section";

export type {
  DocumentDraft,
  DocumentPreview,
  ProjectScreenApi,
  ProjectScreenController,
  ProjectScreenSnapshot,
  ProjectView,
  UnitLoad,
  UnitPage,
} from "./screen-state";


export function createProjectScreenController(
  api: ProjectScreenApi,
  project: ProjectSummary,
  initialActivitySequence = 0,
): ProjectScreenController {
  const store = createProjectScreenStore(api, project);
  const compositions = createCompositionSection(store);
  const units = createUnitSection(store, compositions);
  const documents = createDocumentSection(store);

  let request = 0;
  let overviewRequest = 0;
  let coveredActivitySequence = initialActivitySequence;
  let highestActivityAnnouncement = initialActivitySequence;
  let activityCatchupRequest = 0;
  let activityCatchupInFlight = false;
  let activityPageReady = false;
  const pendingActivity = new Map<number, ActivityDto>();

  const loadOverview = async () => {
    const generation = store.snapshot.domain.generation;
    const requestId = ++overviewRequest;
    const projectRef = store.snapshot.domain.project;
    store.reduce({ type: "overview-loading", generation });
    try {
      const value = await store.api.loadProjectOverview(projectRef);
      if (store.disposed || requestId !== overviewRequest) return;
      store.reduce({ type: "overview-ready", generation, value });
    } catch (error) {
      if (store.disposed || requestId !== overviewRequest) return;
      store.reduce({ type: "overview-failed", generation, error: errorMessage(error) });
    }
  };

  const loadPage = async (tab: ProjectTab, append = false) => {
    const generation = store.snapshot.domain.generation;
    const page = store.snapshot.domain.pages[tab];
    const requestId = `page-${++request}`;
    const mediaQuery = tab === "media" ? store.snapshot.domain.media : undefined;
    const mediaFilter = mediaQuery?.filter;
    const projectRef = store.snapshot.domain.project;
    store.reduce({ type: "page-loading", tab, generation, requestId, mediaFilter });
    try {
      const value = await store.api.loadProjectPage({ tab, project: projectRef, ...(append ? { cursor: page.nextCursor } : {}), ...(mediaQuery ? { mediaQuery } : {}) });
      if (store.disposed) return;
      if (tab === "activity" && append && page.nextCursor !== null && value.nextCursor === page.nextCursor) {
        throw new Error("Activity page cursor did not advance");
      }
      store.reduce({ type: "page-ready", tab, generation, requestId, mediaFilter, append, page: value as { items: DomainRow[]; nextCursor: string | number | null } });
      if (tab === "activity" && !append && store.snapshot.domain.pages.activity.requestId === requestId) {
        activityPageReady = true;
        if (pendingActivity.size > 0) {
          store.reduce({ type: "activity-merge", generation, items: [...pendingActivity.values()] });
          pendingActivity.clear();
        }
      }
      if (tab === "compositions" && !append && store.snapshot.domain.pages.compositions.requestId === requestId) {
        const compositionId = store.snapshot.compositionId ?? (value.items[0] as { id?: string } | undefined)?.id ?? null;
        if (compositionId) await compositions.load(compositionId, store.snapshot.inspectedCompositionRevisionId);
      }
    } catch (error) {
      store.reduce({ type: "page-failed", tab, generation, requestId, mediaFilter, error: errorMessage(error) });
    }
  };

  const mergeActivity = (items: ActivityDto[], generation: number) => {
    if (activityPageReady) store.reduce({ type: "activity-merge", generation, items });
    else for (const item of items) pendingActivity.set(item.sequence, item);
  };

  const catchUpActivity = async (announcedSequence: number) => {
    const requestId = ++activityCatchupRequest;
    const generation = store.snapshot.domain.generation;
    const projectRef = store.snapshot.domain.project;
    let cursor = coveredActivitySequence;
    activityCatchupInFlight = true;
    try {
      while (!store.disposed && requestId === activityCatchupRequest && cursor < announcedSequence) {
        const page = await store.api.loadProjectPage({ tab: "activity", project: projectRef, cursor });
        if (store.disposed || requestId !== activityCatchupRequest || generation !== store.snapshot.domain.generation) return;
        const next = page.nextCursor;
        if (next !== null && (typeof next !== "number" || !Number.isSafeInteger(next) || next <= cursor)) return;
        mergeActivity(page.items as ActivityDto[], generation);
        if (next === null) {
          coveredActivitySequence = Math.max(announcedSequence, ...page.items.map((item) => (item as ActivityDto).sequence));
          return;
        }
        cursor = next;
        coveredActivitySequence = next;
      }
    } catch {
      // A later announcement retries from the last proven cursor.
    } finally {
      if (requestId === activityCatchupRequest) activityCatchupInFlight = false;
    }
  };

  const media = createMediaSection(store, loadPage);

  const controller: ProjectScreenController = {
    getSnapshot: () => store.snapshot,
    subscribe: store.subscribe,
    async start() { await Promise.all([loadOverview(), loadPage("units")]); },
    async refresh(sequence) {
      if (store.disposed || sequence <= coveredActivitySequence || sequence < highestActivityAnnouncement
        || (sequence === highestActivityAnnouncement && activityCatchupInFlight)) return;
      if (sequence > highestActivityAnnouncement) highestActivityAnnouncement = sequence;
      const activeTab = store.snapshot.activeTab;
      await Promise.all([
        loadOverview(),
        catchUpActivity(sequence),
        ...(activeTab === "activity" ? [] : [loadPage(activeTab)]),
      ]);
    },
    async selectTab(tab) {
      store.patch({ activeTab: tab });
      if (store.snapshot.domain.pages[tab].status === "idle") await loadPage(tab);
    },
    async loadMore(tab) {
      const page = store.snapshot.domain.pages[tab];
      if (store.disposed || store.snapshot.activeTab !== tab || page.status !== "ready" || page.nextCursor === null) return;
      await loadPage(tab, true);
    },
    async retryPage(tab) {
      const page = store.snapshot.domain.pages[tab];
      if (store.disposed || store.snapshot.activeTab !== tab || page.status !== "error" || page.items.length === 0 || page.nextCursor === null) return;
      await loadPage(tab, true);
    },
    async retry() {
      const page = store.snapshot.domain.pages[store.snapshot.activeTab];
      if (page.status === "error" && (page.items.length === 0 || (store.snapshot.activeTab === "media" && page.nextCursor === null))) await loadPage(store.snapshot.activeTab);
    },
    async loadActivityRun(runId) {
      return store.api.loadProjectActivityRun(store.snapshot.domain.project, runId);
    },
    ...documents.actions,
    ...media.actions,
    ...compositions.actions,
    ...units.actions,
    dispose() {
      overviewRequest += 1;
      request += 1;
      activityCatchupRequest += 1;
      documents.dispose();
      media.dispose();
      compositions.dispose();
      units.dispose();
      store.dispose();
    },
  };
  return controller;
}
