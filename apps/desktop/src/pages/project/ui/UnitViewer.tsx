import * as Dialog from "@radix-ui/react-dialog";
import { Check, Clock3, ExternalLink, Frame, GalleryHorizontalEnd, Grid2X2, Info, Pause, Play, SlidersHorizontal, Volume2, VolumeX } from "@/shared/ui/icons";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ProjectOverviewDto, UnitPreviewDto } from "../../../../electron/ralphy/types";
import { IPhoneMockup } from "@/shared/ui/IPhoneMockup";
import { SnappySlider } from "@/shared/ui/SnappySlider";
import { SocialIcon } from "@/shared/ui/SocialIcon";
import { PageHeaderMore } from "@/shared/ui/PageHeader";
import { SegmentedControl } from "@/shared/ui/SegmentedControl";
import { bridge } from "@/shared/api/ipc";
import { unitLifecycle, unitRevisionNumber, preferredUnitPoster, resolveUnitMedia, socialTargets, unitPreviewKind, UnitSourcePreview, type UnitMedia } from "@/entities/unit";
import type { ProjectScreenController, ProjectScreenSnapshot } from "../model/screen-controller";
import { UnitSocialPreview } from "./UnitSocialPreview";
import { UnitRevisionBrowser } from "./UnitRevisionBrowser";
import { UnitViewerDetails } from "./UnitViewerDetails";
import { WINDOW, WindowClose } from "@/shared/ui/Window";
import { IconButton } from "@/shared/ui/IconButton";

const formatDuration = (value: number) => `${Math.floor((Number.isFinite(value) ? value : 0) / 60)}:${Math.floor((Number.isFinite(value) ? value : 0) % 60).toString().padStart(2, "0")}`;
const CONTROL = "unit-viewer-control size-7 rounded-control text-muted hover:bg-row-hover hover:text-ink [&_svg]:size-3.5";
const captionFrom = (metadata: UnitPreviewDto | null) => typeof metadata?.presentation.caption === "string" ? metadata.presentation.caption : "";

export function UnitViewer({
  open,
  onOpenChange,
  controller,
  snapshot,
  returnFocus,
  onEditVideo,
  embedded = false,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  controller: ProjectScreenController;
  snapshot: ProjectScreenSnapshot;
  returnFocus: HTMLElement | null;
  onEditVideo?(unitId: string, title: string): void;
  embedded?: boolean;
}) {
  const unit = snapshot.unit.value;
  const revision = snapshot.inspectedUnitRevision.value;
  const [originalUnitId, setOriginalUnitId] = useState<string | null>(null);
  const sourceRevision = snapshot.unitRevisions.items.find((item) => item.id === unit?.sourceRevisionId);
  const displayRevisionNo = revision ? unitRevisionNumber(revision, sourceRevision) : 0;
  const showOriginal = !!unit?.sourceRevisionId && originalUnitId === unit.id;
  const productionRevision = revision?.compositionRevisionId === snapshot.inspectedCompositionRevision.value?.id ? snapshot.inspectedCompositionRevision.value : null;
  const overview = snapshot.domain.overview.value as ProjectOverviewDto | null;
  const publications = overview?.publications?.items ?? [];
  const lifecycle = unit && !showOriginal ? unitLifecycle({ unit, revision, compositionRevision: productionRevision, builds: snapshot.compositionBuilds.items, publications }) : null;
  const pending = snapshot.unitMutation !== "idle" || snapshot.compositionMutation !== "idle";
  const surface = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [media, setMedia] = useState<UnitMedia[]>([]);
  const targets = useMemo(() => unit ? socialTargets(unit.format, snapshot.unitPresentations.items) : [], [snapshot.unitPresentations.items, unit]);
  const [targetId, setTargetId] = useState("");
  const target = targets.find((item) => item.id === targetId) ?? targets[0];
  const [metadata, setMetadata] = useState<UnitPreviewDto | null>(null);
  const [previewMode, setPreviewMode] = useState<"post" | "clean">("post");
  const [deviceMockup, setDeviceMockup] = useState(false);
  const [layout, setLayout] = useState<"gallery" | "grid">("gallery");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [guides, setGuides] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const previewCover = useMemo<UnitMedia | null>(() => {
    const preview = snapshot.unitPreview.value;
    const artifactRevisionId = snapshot.unitPreview.artifactRevisionId;
    if (!preview || "text" in preview || !artifactRevisionId) return null;
    const isPresentationCover = snapshot.unitPresentations.items.some((item) => item.coverArtifactRevisionId === artifactRevisionId);
    if (!isPresentationCover && !preview.mime?.startsWith("image/")) return null;
    return { id: artifactRevisionId, role: "vertical-cover", position: -1, kind: "image", preview };
  }, [snapshot.unitPresentations.items, snapshot.unitPreview.artifactRevisionId, snapshot.unitPreview.value]);
  const previewMedia = useMemo(() => {
    const ids = metadata?.presentation.unitItemIds;
    const visible = Array.isArray(ids) ? ids.flatMap((id) => media.filter((item) => item.id === id)) : media;
    const coverAlreadyVisible = snapshot.unitItems.items.some((item) => item.artifactRevisionId === previewCover?.id && visible.some((value) => value.id === item.id));
    return previewCover && !coverAlreadyVisible && !preferredUnitPoster(visible, true) ? [...visible, previewCover] : visible;
  }, [media, metadata, previewCover, snapshot.unitItems.items]);

  const revisions = useMemo(() => {
    const rows = revision && !snapshot.unitRevisions.items.some(({ id }) => id === revision.id) ? [...snapshot.unitRevisions.items, revision] : snapshot.unitRevisions.items;
    return rows.filter((item) => item.id !== unit?.sourceRevisionId).sort((a, b) => a.revisionNo - b.revisionNo);
  }, [revision, snapshot.unitRevisions.items, unit?.sourceRevisionId]);

  useEffect(() => {
    if (!open || !revision) return;
    if (snapshot.unitRevisions.nextCursor && snapshot.unitRevisions.status === "ready") void controller.loadMoreUnitRevisions();
    if (snapshot.unitItems.nextCursor && snapshot.unitItems.status === "ready") void controller.loadMoreUnitItems();
    if (snapshot.unitPresentations.nextCursor && snapshot.unitPresentations.status === "ready") void controller.loadMoreUnitPresentations();
  }, [controller, open, revision, snapshot.unitItems.nextCursor, snapshot.unitItems.status, snapshot.unitPresentations.nextCursor, snapshot.unitPresentations.status, snapshot.unitRevisions.nextCursor, snapshot.unitRevisions.status]);

  useEffect(() => {
    let current = true;
    setMedia([]);
    if (!open || !revision) return () => { current = false; };
    void resolveUnitMedia(bridge, snapshot.domain.project, snapshot.unitItems.items).then((value) => { if (current) setMedia(value); });
    return () => { current = false; };
  }, [open, revision?.id, snapshot.domain.project, snapshot.unitItems.items]);

  useEffect(() => {
    let current = true;
    setMetadata(null);
    if (!open || !revision || !target || target.platform === "generic") return () => { current = false; };
    void bridge.loadProjectUnitPreview(snapshot.domain.project, revision.id, target.platform).then((value) => { if (current) setMetadata(value); }).catch(() => undefined);
    return () => { current = false; };
  }, [open, revision?.id, snapshot.domain.project, target?.id]);

  useEffect(() => {
    const element = stage.current?.querySelector<HTMLMediaElement>("video") ?? stage.current?.querySelector<HTMLMediaElement>("audio");
    const sync = () => {
      setPlaying(element ? !element.paused : false);
      setCurrentTime(element && Number.isFinite(element.currentTime) ? element.currentTime : 0);
      setDuration(element && Number.isFinite(element.duration) ? element.duration : 0);
      setMuted(element?.muted ?? false);
    };
    sync();
    if (!element) return;
    const events = ["loadedmetadata", "durationchange", "timeupdate", "play", "pause", "volumechange", "ended"];
    events.forEach((event) => element.addEventListener(event, sync));
    return () => events.forEach((event) => element.removeEventListener(event, sync));
  }, [previewMedia, previewMode, target?.id, deviceMockup, showOriginal, layout]);

  const publication = unit && target ? publications.find((item) => item.unitId === unit.id && item.platform === target.platform) : null;
  const caption = captionFrom(metadata);
  const kind = unitPreviewKind(unit?.format ?? "");
  const mobile = kind !== "longform" && target?.platform !== "generic";

  const runPrimaryAction = () => {
    if (lifecycle?.action === "select") void controller.selectInspectedUnitRevision();
    else if (lifecycle?.action === "render" || lifecycle?.action === "retry") void controller.buildInspectedCompositionRevision();
    else if (lifecycle?.label === "Published" && publication?.url) void bridge.openExternal(publication.url);
  };
  const primaryLabel = lifecycle?.action === "select" ? "Choose this version" : lifecycle?.action === "retry" ? "Retry render" : lifecycle?.action === "render" ? "Render final" : lifecycle?.label === "Published" && publication?.url ? "View post" : null;
  const activeMedia = () => stage.current?.querySelector<HTMLMediaElement>("video") ?? stage.current?.querySelector<HTMLMediaElement>("audio");

  const dismissExtra = () => {
    const menu = surface.current?.querySelector<HTMLDetailsElement>(".page-header-more[open]");
    if (menu) { menu.open = false; menu.querySelector("summary")?.focus(); return true; }
    if (!detailsOpen) return false;
    setDetailsOpen(false);
    surface.current?.querySelector<HTMLElement>('button[aria-label="Content details"]')?.focus();
    return true;
  };

  const Title = embedded ? "h2" : Dialog.Title;
  const Description = embedded ? "p" : Dialog.Description;
  const preview = target && unit ? <UnitSocialPreview target={target} media={previewMedia} slug={unit.slug} caption={caption} tone={deviceMockup ? "instrument" : "surface"} previewMode={deviceMockup ? previewMode : "clean"} guides={deviceMockup && guides} /> : <div className="preview-empty grid place-items-center text-muted">Loading preview…</div>;
  const revisionBrowser = <UnitRevisionBrowser project={snapshot.domain.project} revisions={revisions} sourceRevision={sourceRevision} sourceRevisionId={unit?.sourceRevisionId} sourceLabel={unit?.sourceLabel} inspectedRevisionId={revision?.id} selectedRevisionId={unit?.selectedRevisionId} showOriginal={showOriginal} layout={layout === "gallery" ? "rail" : "grid"} onOriginal={(openGallery) => { if (unit) setOriginalUnitId(unit.id); if (openGallery) setLayout("gallery"); }} onInspect={(id, openGallery) => { setOriginalUnitId(null); void controller.inspectUnitRevision(id); if (openGallery) setLayout("gallery"); }} />;
  const content = <>
    <header className="unit-viewer-header flex h-10 min-w-0 shrink-0 items-center gap-1.5 px-2">
      <Title className="m-0 min-w-0 flex-1 truncate type-sm font-medium text-ink" title={unit?.slug}>{unit?.slug ?? "Content"}</Title>
      <Description className="sr-only">Browse content versions. Previewing a version does not change the selected version.</Description>
      <span className="unit-viewer-state shrink-0 type-xs text-muted">{showOriginal ? "R0 · Original" : revision ? `R${displayRevisionNo}` : "Loading…"}</span>
      <div className="unit-viewer-layout flex shrink-0 items-center gap-0.5 rounded-control bg-surface-sunken p-0.5" role="group" aria-label="Version layout">
        <IconButton className={CONTROL} label="Gallery view" aria-pressed={layout === "gallery"} onClick={() => setLayout("gallery")}><GalleryHorizontalEnd /></IconButton>
        <IconButton className={CONTROL} label="Grid view" aria-pressed={layout === "grid"} onClick={() => setLayout("grid")}><Grid2X2 /></IconButton>
      </div>
      {!showOriginal && unit && onEditVideo && (kind === "video" || kind === "longform") && <IconButton className={CONTROL} label="Edit video" disabled={pending} onClick={() => onEditVideo(unit.id, unit.slug)}><SlidersHorizontal /></IconButton>}
      {layout === "gallery" && revision && lifecycle && primaryLabel && <button className="unit-primary-action inline-flex h-7 shrink-0 items-center gap-1 rounded-control bg-ink px-2.5 type-xs text-card disabled:opacity-45 [&_svg]:size-3" type="button" disabled={pending || revision.sealedAt === null || (lifecycle.action !== "select" && lifecycle.action !== "none" && !productionRevision)} onClick={runPrimaryAction}>{lifecycle.action === "select" ? <Check /> : lifecycle.action === "retry" ? <Clock3 /> : lifecycle.label === "Published" ? <ExternalLink /> : <Play />}{snapshot.unitMutation === "select" ? "Choosing…" : snapshot.compositionMutation === "build" ? "Rendering…" : primaryLabel}</button>}
      <IconButton className={CONTROL} label="Content details" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((value) => !value)}><Info /></IconButton>
      {layout === "gallery" && !showOriginal && <PageHeaderMore label="Preview options">
        <button type="button" className="flex items-center justify-between gap-2 rounded-control px-2 py-1.5 hover:bg-row-hover" aria-pressed={deviceMockup} onClick={() => setDeviceMockup((value) => !value)}><span className="inline-flex items-center gap-2"><Frame size={14} />Device mockup</span>{deviceMockup && <Check size={14} />}</button>
        {targets.length > 0 && <div className="unit-stage-toolbar flex flex-wrap gap-1" role="group" aria-label="Social platform">{targets.map((item) => <button key={item.id} type="button" className={`inline-flex h-7 items-center gap-1.5 rounded-control px-2 ${item.id === target?.id ? "bg-ink text-card" : "text-muted hover:bg-row-hover"}`} aria-pressed={item.id === target?.id} onClick={() => setTargetId(item.id)}><SocialIcon platform={item.platform} className="size-3" />{item.label}</button>)}</div>}
        {deviceMockup && <div className="unit-preview-mode"><SegmentedControl<"post" | "clean"> value={previewMode} options={[{ value: "post", label: "Post" }, { value: "clean", label: "Clean" }]} ariaLabel="Preview mode" onValueChange={setPreviewMode} /></div>}
        {deviceMockup && kind === "video" && <button type="button" className="rounded-control px-2 py-1.5 text-left hover:bg-row-hover" aria-pressed={guides} onClick={() => setGuides((value) => !value)}>Safe-area guides</button>}
      </PageHeaderMore>}
      <WindowClose className="unit-viewer-close" label="Close Unit preview" onClick={() => onOpenChange(false)} />
    </header>
    <div className={`unit-viewer-body relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-frame bg-card ${layout === "grid" ? "is-grid" : "is-gallery"}`}>
      {revisionBrowser}
      {layout === "gallery" && <section className="unit-viewer-main flex min-h-0 min-w-0 flex-1 flex-col p-1" aria-label="Content preview">
        {showOriginal && unit?.sourceRevisionId ? <UnitSourcePreview key={unit.sourceRevisionId} project={snapshot.domain.project} revisionId={unit.sourceRevisionId} label={unit.sourceLabel ?? "Source creative"} /> : <>
          <div className={`unit-social-stage flex w-full min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-transparent is-${kind} ${deviceMockup ? "has-device" : "is-clean"}`} ref={stage}>
            {deviceMockup && mobile && target && unit ? <IPhoneMockup>{preview}</IPhoneMockup> : preview}
          </div>
          {(kind === "video" || kind === "longform") && <div className="unit-playback grid w-full max-w-iphone shrink-0 self-center grid-cols-(--project-playback-columns) items-center gap-2 py-1 font-code type-xs text-muted">
            <IconButton className={CONTROL} label={playing ? "Pause preview" : "Play preview"} onClick={() => { const element = activeMedia(); if (!element) return; if (element.paused) void element.play().catch(() => setPlaying(false)); else element.pause(); }}>{playing ? <Pause /> : <Play />}</IconButton>
            <span>{formatDuration(currentTime)}</span>
            <SnappySlider className="unit-playback-seek h-4.5 cursor-pointer" value={currentTime} min={0} max={Math.max(duration, .1)} step={.1} ariaLabel="Position in preview" onValueChange={(next) => { const element = activeMedia(); if (element) element.currentTime = next; setCurrentTime(next); }} />
            <span>{formatDuration(duration)}</span>
            <IconButton className={CONTROL} label={muted ? "Unmute preview" : "Mute preview"} onClick={() => { const element = activeMedia(); if (!element) return; element.muted = !element.muted; setMuted(element.muted); }}>{muted ? <VolumeX /> : <Volume2 />}</IconButton>
          </div>}
        </>}
      </section>}
      {detailsOpen && <aside className="unit-viewer-meta" aria-label="Content details" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDetailsOpen(false); surface.current?.querySelector<HTMLElement>('[aria-label="Content details"]')?.focus(); } }}>
        <header className="flex h-9 shrink-0 items-center justify-between gap-2 px-3"><strong className="type-sm font-medium">Details</strong><WindowClose label="Close content details" onClick={() => setDetailsOpen(false)} /></header>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3"><UnitViewerDetails snapshot={snapshot} lifecycle={lifecycle} revisionNo={displayRevisionNo} targets={targets} targetId={target?.id} onTargetChange={setTargetId} caption={caption} duration={duration} mediaCount={media.length} showOriginal={showOriginal} /></div>
      </aside>}
    </div>
    {snapshot.unitRevisions.error && <div role="alert" className="flex items-center justify-between gap-2 px-3 py-1 type-xs text-muted"><span>Could not load all versions</span><button type="button" onClick={() => { if (unit) void controller.openUnit(unit.id); }}>Retry</button></div>}
    {snapshot.unitMutationError && <p role="alert" className="m-0 px-3 py-1 type-xs text-alert">{snapshot.unitMutationError}</p>}
  </>;
  if (embedded) return open ? <section className={`unit-viewer @container/unit-viewer h-full w-full text-ink ${WINDOW}`} data-unit-view="panel" aria-label={`Unit preview: ${unit?.slug ?? "Loading"}`} ref={surface} onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); if (!dismissExtra()) onOpenChange(false); } }}>{content}</section> : null;
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    {open && <Dialog.Portal forceMount container={typeof document === "undefined" ? undefined : document.body}>
      <Dialog.Overlay forceMount className="unit-viewer-overlay fixed inset-0 z-scrim" data-instrument-overlay-backdrop="" />
      <Dialog.Content forceMount className={`unit-viewer @container/unit-viewer fixed left-1/2 top-1/2 z-scrim-content h-unit-viewer-height w-unit-viewer-width -translate-x-1/2 -translate-y-1/2 text-ink outline-none ${WINDOW}`} data-instrument-overlay="unit-viewer" ref={surface} onEscapeKeyDown={(event) => { if (dismissExtra()) event.preventDefault(); }} onOpenAutoFocus={(event) => { event.preventDefault(); surface.current?.focus({ preventScroll: true }); }} onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus?.focus({ preventScroll: true }); }} tabIndex={-1}>{content}</Dialog.Content>
    </Dialog.Portal>}
  </Dialog.Root>;
}
