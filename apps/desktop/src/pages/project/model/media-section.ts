/**
 * Media: which card is selected, the viewer over it, and the three things the viewer reads --
 * the preview and the generation that produced it.
 *
 * Every request here checks on arrival that the viewer is still open on the same card, because
 * the viewer's arrows walk the loaded page and a slower preview must not paint over a faster
 * one.
 */
import type { ArtifactMediaCardDto, MediaCardDto, MediaGenerationTarget } from "../../../../electron/ralphy/types";
import type { ProjectMediaQuery, ProjectTab } from "../../../../electron/media/types";

import { errorMessage, type ProjectScreenController } from "./screen-state";
import type { ProjectScreenSection, ProjectScreenStore } from "./screen-store";

export type MediaActions = Pick<ProjectScreenController,
  "selectMedia" | "openMediaViewer" | "closeMediaViewer" | "navigateMediaViewer"
  | "retryMediaPreview" | "retryMediaGeneration"
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
  const openLoadedMediaViewer = async (card: MediaCardDto) => {
    mediaPreviewRequest += 1;
    mediaGenerationRequest += 1;
    store.patch({
      selectedMedia: card,
      mediaViewerOpen: true,
      mediaGeneration: { status: "idle", value: null, error: null },
      mediaRevisions: { status: "idle", items: [], error: null },
      domain: resetPreview(),
    });
    await Promise.all([loadMediaPreview(card), loadMediaGeneration(card)]);
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
      if (store.snapshot.mediaViewerOpen && card) await loadMediaPreview(card);
    },
    async retryMediaGeneration() {
      const card = store.snapshot.selectedMedia;
      if (store.snapshot.mediaViewerOpen && card && generationTarget(card)) await loadMediaGeneration(card);
    },
    async setMediaQuery(changes) {
      const query: ProjectMediaQuery = { ...store.snapshot.domain.media, ...changes, filter: changes.filter ?? store.snapshot.domain.media.filter };
      if (Object.hasOwn(changes, "search") && changes.search === undefined) delete query.search;
      if (Object.hasOwn(changes, "mediaKind") && changes.mediaKind === undefined) delete query.mediaKind;
      if (Object.hasOwn(changes, "provenance") && changes.provenance === undefined) delete query.provenance;
      if (JSON.stringify(query) === JSON.stringify(store.snapshot.domain.media)) return;
      mediaPreviewRequest += 1;
      mediaGenerationRequest += 1;
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
    },
  };
}
