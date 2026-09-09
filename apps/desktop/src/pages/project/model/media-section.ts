/**
 * Media: which card is selected, the viewer over it, and the three things the viewer reads --
 * the preview, the generation that produced it, and the revisions to choose between.
 *
 * Every request here checks on arrival that the viewer is still open on the same card, because
 * the viewer's arrows walk the loaded page and a slower preview must not paint over a faster
 * one. Selecting a revision that lost a conflict reloads the card and its revisions instead of
 * reporting a failure: the pointer moved, and what the viewer shows has to be what is there.
 */
import type { ArtifactMediaCardDto, MediaCardDto, MediaGenerationTarget } from "../../../../electron/ralphy/types";
import type { ProjectMediaQuery, ProjectTab } from "../../../../electron/media/types";

import { errorMessage, isConflict, type ProjectScreenController } from "./screen-state";
import type { ProjectScreenSection, ProjectScreenStore } from "./screen-store";

export type MediaActions = Pick<ProjectScreenController,
  "selectMedia" | "openMediaViewer" | "closeMediaViewer" | "navigateMediaViewer"
  | "retryMediaPreview" | "retryMediaGeneration" | "retryMediaRevisions" | "selectMediaRevision"
  | "setMediaQuery">;


/**
 * The media query change also reloads the page it filters, which is the project screen's own
 * loader -- the section is handed it rather than owning a second copy of paging.
 */
export function createMediaSection(
  store: ProjectScreenStore,
  loadPage: (tab: ProjectTab, append?: boolean) => Promise<void>,
): ProjectScreenSection<MediaActions> {
  let mediaPreviewRequest = 0;
  let mediaGenerationRequest = 0;
  let mediaRevisionRequest = 0;

  const sameMedia = (left: MediaCardDto | null, right: MediaCardDto): boolean => left?.ref.type === right.ref.type && left.ref.id === right.ref.id;
  const isArtifactMedia = (card: MediaCardDto): card is ArtifactMediaCardDto => card.ref.type === "artifact";
  const loadedMedia = (card: MediaCardDto): MediaCardDto | null => (
    store.snapshot.domain.pages.media.items as MediaCardDto[]
  ).find((item) => sameMedia(item, card)) ?? null;
  const generationTarget = (card: MediaCardDto): MediaGenerationTarget | null => {
    if (isArtifactMedia(card)) return card.selectedRevisionId ? { type: "artifact-revision", id: card.selectedRevisionId } : null;
    if (card.ref.type === "run-object") return { type: "run-object", id: card.ref.id };
    return null;
  };
  const resetPreview = () => ({ ...store.snapshot.domain, preview: { status: "idle" as const, value: null, error: null, requestId: null } });
  const replaceLoadedMedia = (card: MediaCardDto) => {
    const page = store.snapshot.domain.pages.media;
    store.patch({
      selectedMedia: card,
      domain: {
        ...store.snapshot.domain,
        pages: {
          ...store.snapshot.domain.pages,
          media: { ...page, items: (page.items as MediaCardDto[]).map((item) => sameMedia(item, card) ? card : item) },
        },
      },
    });
  };
  const loadMediaPreview = async (card: MediaCardDto) => {
    const requestId = ++mediaPreviewRequest;
    const generation = store.snapshot.domain.generation;
    store.reduce({ type: "preview-loading", generation, requestId: `viewer-preview-${requestId}` });
    try {
      const value = await store.api.resolveProjectPreview(store.snapshot.domain.project, card.ref);
      if (store.disposed || requestId !== mediaPreviewRequest || !store.snapshot.mediaViewerOpen || !sameMedia(store.snapshot.selectedMedia, card)) return;
      store.reduce({ type: "preview-ready", generation, requestId: `viewer-preview-${requestId}`, value });
    } catch (error) {
      if (store.disposed || requestId !== mediaPreviewRequest || !store.snapshot.mediaViewerOpen || !sameMedia(store.snapshot.selectedMedia, card)) return;
      store.reduce({ type: "preview-failed", generation, requestId: `viewer-preview-${requestId}`, error: errorMessage(error) });
    }
  };
  const loadMediaGeneration = async (card: MediaCardDto) => {
    const target = generationTarget(card);
    const requestId = ++mediaGenerationRequest;
    if (!target) {
      store.patch({ mediaGeneration: { status: "ready", value: null, error: null } });
      return;
    }
    store.patch({ mediaGeneration: { status: "loading", value: null, error: null } });
    try {
      const value = await store.api.loadProjectGeneration(store.snapshot.domain.project, target);
      if (store.disposed || requestId !== mediaGenerationRequest || !store.snapshot.mediaViewerOpen || !sameMedia(store.snapshot.selectedMedia, card)) return;
      store.patch({ mediaGeneration: { status: "ready", value, error: null } });
    } catch (error) {
      if (store.disposed || requestId !== mediaGenerationRequest || !store.snapshot.mediaViewerOpen || !sameMedia(store.snapshot.selectedMedia, card)) return;
      store.patch({ mediaGeneration: { status: "error", value: null, error: errorMessage(error) } });
    }
  };
  const loadMediaRevisions = async (card: MediaCardDto, conflict: string | null = null) => {
    const requestId = ++mediaRevisionRequest;
    if (!isArtifactMedia(card)) {
      store.patch({ mediaRevisions: { status: "idle", items: [], error: null } });
      return;
    }
    store.patch({ mediaRevisions: { status: "loading", items: [], error: conflict } });
    try {
      const page = await store.api.loadProjectMediaRevisions(store.snapshot.domain.project, card.ref.id);
      if (store.disposed || requestId !== mediaRevisionRequest || !store.snapshot.mediaViewerOpen || !sameMedia(store.snapshot.selectedMedia, card)) return;
      store.patch({ mediaRevisions: { status: "ready", items: page.items, error: conflict } });
    } catch (error) {
      if (store.disposed || requestId !== mediaRevisionRequest || !store.snapshot.mediaViewerOpen || !sameMedia(store.snapshot.selectedMedia, card)) return;
      store.patch({ mediaRevisions: { status: "error", items: [], error: errorMessage(error) } });
    }
  };
  const openLoadedMediaViewer = async (card: MediaCardDto) => {
    mediaPreviewRequest += 1;
    mediaGenerationRequest += 1;
    mediaRevisionRequest += 1;
    store.patch({
      selectedMedia: card,
      mediaViewerOpen: true,
      mediaGeneration: { status: "idle", value: null, error: null },
      mediaRevisions: { status: "idle", items: [], error: null },
      domain: resetPreview(),
    });
    if (isArtifactMedia(card) && !card.selectedRevisionId) {
      await loadMediaRevisions(card);
      return;
    }
    await Promise.all([
      loadMediaPreview(card),
      loadMediaGeneration(card),
      ...(isArtifactMedia(card) ? [loadMediaRevisions(card)] : []),
    ]);
  };

  const actions: MediaActions = {
    selectMedia(card) {
      const loaded = loadedMedia(card);
      if (loaded) store.patch({ selectedMedia: loaded });
    },
    async openMediaViewer(card) {
      const loaded = loadedMedia(card);
      if (loaded) await openLoadedMediaViewer(loaded);
    },
    closeMediaViewer() {
      mediaPreviewRequest += 1;
      mediaGenerationRequest += 1;
      mediaRevisionRequest += 1;
      store.patch({
        mediaViewerOpen: false,
        mediaGeneration: { status: "idle", value: null, error: null },
        mediaRevisions: { status: "idle", items: [], error: null },
        domain: resetPreview(),
      });
    },
    async navigateMediaViewer(delta) {
      if (!store.snapshot.mediaViewerOpen || !store.snapshot.selectedMedia || delta === 0) return;
      const items = store.snapshot.domain.pages.media.items as MediaCardDto[];
      const index = items.findIndex((item) => sameMedia(item, store.snapshot.selectedMedia!));
      const next = items[index + Math.sign(delta)];
      if (next) await openLoadedMediaViewer(next);
    },
    async retryMediaPreview() {
      const card = store.snapshot.selectedMedia;
      if (store.snapshot.mediaViewerOpen && card && !(isArtifactMedia(card) && !card.selectedRevisionId)) await loadMediaPreview(card);
    },
    async retryMediaGeneration() {
      const card = store.snapshot.selectedMedia;
      if (store.snapshot.mediaViewerOpen && card && generationTarget(card)) await loadMediaGeneration(card);
    },
    async retryMediaRevisions() {
      const card = store.snapshot.selectedMedia;
      if (store.snapshot.mediaViewerOpen && card && isArtifactMedia(card)) await loadMediaRevisions(card);
    },
    async selectMediaRevision(revisionId) {
      const card = store.snapshot.selectedMedia;
      if (!store.snapshot.mediaViewerOpen || !card || !isArtifactMedia(card) || !store.snapshot.mediaRevisions.items.some(({ id }) => id === revisionId)) return;
      const requestId = ++mediaRevisionRequest;
      store.patch({ mediaRevisions: { ...store.snapshot.mediaRevisions, status: "loading", error: null } });
      try {
        const refreshed = await store.api.selectProjectMediaRevision(store.snapshot.domain.project, card.ref.id, revisionId, card.selectedRevisionId);
        if (store.disposed || requestId !== mediaRevisionRequest || !store.snapshot.mediaViewerOpen || !sameMedia(store.snapshot.selectedMedia, card)) return;
        replaceLoadedMedia(refreshed);
        await openLoadedMediaViewer(refreshed);
      } catch (error) {
        if (store.disposed || requestId !== mediaRevisionRequest || !store.snapshot.mediaViewerOpen || !sameMedia(store.snapshot.selectedMedia, card)) return;
        if (!isConflict(error)) {
          store.patch({ mediaRevisions: { ...store.snapshot.mediaRevisions, status: "error", error: errorMessage(error) } });
          return;
        }
        const conflict = "The selected revision changed elsewhere. Current card and revisions reloaded; select again to retry.";
        try {
          const [refreshed, revisions] = await Promise.all([
            store.api.loadProjectMediaCard(store.snapshot.domain.project, card.ref),
            store.api.loadProjectMediaRevisions(store.snapshot.domain.project, card.ref.id),
          ]);
          if (store.disposed || requestId !== mediaRevisionRequest || !store.snapshot.mediaViewerOpen || !sameMedia(store.snapshot.selectedMedia, card)) return;
          replaceLoadedMedia(refreshed);
          if (isArtifactMedia(refreshed) && refreshed.selectedRevisionId) {
            await Promise.all([loadMediaPreview(refreshed), loadMediaGeneration(refreshed)]);
          }
          if (store.disposed || requestId !== mediaRevisionRequest || !store.snapshot.mediaViewerOpen || !sameMedia(store.snapshot.selectedMedia, refreshed)) return;
          store.patch({ mediaRevisions: { status: "ready", items: revisions.items, error: conflict } });
        } catch (reloadError) {
          if (store.disposed || requestId !== mediaRevisionRequest || !store.snapshot.mediaViewerOpen) return;
          store.patch({ mediaRevisions: { status: "error", items: [], error: errorMessage(reloadError) } });
        }
      }
    },
    async setMediaQuery(changes) {
      const query: ProjectMediaQuery = { ...store.snapshot.domain.media, ...changes, filter: changes.filter ?? store.snapshot.domain.media.filter };
      if (Object.hasOwn(changes, "mediaKind") && changes.mediaKind === undefined) delete query.mediaKind;
      if (Object.hasOwn(changes, "provenance") && changes.provenance === undefined) delete query.provenance;
      if (JSON.stringify(query) === JSON.stringify(store.snapshot.domain.media)) return;
      mediaPreviewRequest += 1;
      mediaGenerationRequest += 1;
      mediaRevisionRequest += 1;
      store.patch({ selectedMedia: null, mediaViewerOpen: false, mediaGeneration: { status: "idle", value: null, error: null }, mediaRevisions: { status: "idle", items: [], error: null } });
      store.reduce({ type: "media-query", query, preserveItems: true });
      if (store.snapshot.activeTab === "media") await loadPage("media");
    },
  };
  return {
    actions,
    dispose() {
      mediaPreviewRequest += 1;
      mediaGenerationRequest += 1;
      mediaRevisionRequest += 1;
    },
  };
}
