import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronRight, Clock3, Copy, ExternalLink, Frame, Pause, Play, SlidersHorizontal, Volume2, VolumeX } from "@/shared/ui/icons";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ProjectOverviewDto, UnitPreviewDto } from "../../../../electron/ralphy/types";
import { GooeyTabs } from "@/shared/ui/GooeyTabs";
import { IPhoneMockup } from "@/shared/ui/IPhoneMockup";
import { SnappySlider } from "@/shared/ui/SnappySlider";
import { SocialIcon } from "@/shared/ui/SocialIcon";
import { sortBuilds, sortPositioned } from "@/entities/composition";
import { bridge } from "@/shared/api/ipc";
import { unitLifecycle, unitRevisionNumber, type UnitLifecycle } from "@/entities/unit";
import { preferredUnitPoster, resolveUnitMedia, socialTargets, unitPreviewKind, type UnitMedia } from "@/entities/unit";
import type { ProjectScreenController, ProjectScreenSnapshot } from "../model/screen-controller";
import { UnitSocialPreview } from "..";
import { WINDOW, WINDOW_BODY, WINDOW_TITLEBAR, WindowClose } from "@/shared/ui/Window";
import { UnitStatus, UnitRevisionPreview, UnitSourcePreview } from "@/entities/unit";
import { IconButton } from "@/shared/ui/IconButton";

const formatTime = (value: number) => new Date(value < 1_000_000_000_000 ? value * 1000 : value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const formatDuration = (value: number) => `${Math.floor((Number.isFinite(value) ? value : 0) / 60)}:${Math.floor((Number.isFinite(value) ? value : 0) % 60).toString().padStart(2, "0")}`;
const formatMetric = (value: number | null | undefined) => value == null ? "—" : Intl.NumberFormat(undefined, { notation: value > 9999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);

// The viewer is portalled to the body, outside the work-mode scope where the legacy tokens are
// remapped, so every surface and ink here is stated from the theme scale: the legacy ink is the
// on-dark family at the root and turns invisible on this light widget.
const META_LABEL = "block mb-2 font-code type-meta tracking-block text-muted";
const META_SECTION = "unit-meta-section min-w-0 [&>div]:[corner-shape:squircle]";
// A status pill states its tone with the dot; the label stays readable ink, and the label text
// already names the state, so nothing here is colour-only.
// The stepper mark is a ring, not a plate: an inset shadow leaves the design free of borders.
const MARK_PENDING = "[box-shadow:inset_0_0_0_1.5px_var(--color-track-on-instrument)]";
const MARK_CURRENT = "[box-shadow:inset_0_0_0_1.5px_var(--color-ink)] after:size-1.5 after:rounded-full after:bg-ink after:[content:'']";
const MARK_DONE = "bg-ink/15 text-ink";
// The stage's tab strip borrows GooeyTabs, so the strip states the cell geometry, the flat
// surface and the tooltip that is the only visible label these icon tabs have.
const STAGE_TABS = "[&_.gooey-tabs]:grid [&_.gooey-tabs]:w-auto [&_.gooey-tabs]:min-w-0 [&_.gooey-tabs]:[grid-template-columns:repeat(var(--gooey-count),var(--gooey-cell-width))] [&_.gooey-tabs]:gap-0.5 [&_.gooey-tabs]:overflow-visible [&_.gooey-tabs]:rounded-control [&_.gooey-tabs]:bg-surface [&_.gooey-tabs]:p-0.5 [&_.gooey-tabs]:[--gooey-cell-width:32px] [&_.gooey-tabs]:[grid-auto-columns:unset] [&_.gooey-tabs]:[grid-auto-flow:unset] [&_.gooey-tabs-blobs]:hidden [&_.gooey-tabs_button]:relative [&_.gooey-tabs_button]:w-(--gooey-cell-width) [&_.gooey-tabs_button]:min-w-0 [&_.gooey-tabs_button]:rounded-control [&_.gooey-tabs_button]:p-0 [&_.gooey-tabs_button[aria-selected=true]]:bg-surface [&_.gooey-tabs_button>svg]:size-3.25";
const STAGE_TAB_TOOLTIP = "[&_button[data-tooltip]]:after:pointer-events-none [&_button[data-tooltip]]:after:absolute [&_button[data-tooltip]]:after:bottom-[calc(100%_+_7px)] [&_button[data-tooltip]]:after:left-1/2 [&_button[data-tooltip]]:after:z-header [&_button[data-tooltip]]:after:-translate-x-1/2 [&_button[data-tooltip]]:after:translate-y-0.5 [&_button[data-tooltip]]:after:rounded-chip [&_button[data-tooltip]]:after:bg-ghost [&_button[data-tooltip]]:after:px-1.75 [&_button[data-tooltip]]:after:py-1 [&_button[data-tooltip]]:after:type-xs [&_button[data-tooltip]]:after:leading-pill [&_button[data-tooltip]]:after:text-on-instrument [&_button[data-tooltip]]:after:opacity-0 [&_button[data-tooltip]]:after:[content:attr(data-tooltip)] [&_button[data-tooltip]]:after:[transition:opacity_var(--dur)_var(--ease),transform_var(--dur)_var(--ease)] [&_button[data-tooltip]]:after:motion-reduce:[transition:none] [&_button[data-tooltip]:hover]:after:translate-y-0 [&_button[data-tooltip]:hover]:after:opacity-100 [&_button[data-tooltip]:focus-visible]:after:translate-y-0 [&_button[data-tooltip]:focus-visible]:after:opacity-100";

function LifecycleStepper({ lifecycle }: { lifecycle: UnitLifecycle }) {
  const current = lifecycle.label === "Published" ? 2 : lifecycle.label === "Scheduled" ? 1 : 0;
  const row = "relative grid justify-items-start gap-1.5 pt-0 after:absolute after:left-7 after:right-2.5 after:top-2 after:h-0.375 after:[content:''] last:after:hidden [&_svg]:size-2.5";
  const mark = "relative z-surface-content grid size-4.5 place-items-center rounded-full";
  return <ol className="unit-lifecycle m-0 grid list-none grid-cols-3 p-0 pt-1" aria-label="Unit lifecycle">
    {["In progress", "Scheduled", "Published"].map((label, index) => <li className={`${row} ${index < current ? "is-done text-muted after:bg-desk-primary" : index === current ? "is-current text-ink after:bg-surface" : "text-muted after:bg-surface"}`} key={label}>
      <span className={`${mark} ${index < current ? MARK_DONE : index === current ? MARK_CURRENT : MARK_PENDING}`}>{index < current ? <Check aria-hidden="true" /> : null}</span><small className="type-label">{label}</small>
    </li>)}
  </ol>;
}

function ProductionDetails({ snapshot }: { snapshot: ProjectScreenSnapshot }) {
  const composition = snapshot.composition.value;
  const revision = snapshot.inspectedCompositionRevision.value;
  if (!composition && snapshot.composition.status === "idle") return null;
  const builds = sortBuilds(snapshot.compositionBuilds.items);
  return <details className="unit-viewer-production col-span-full m-0 border-0 p-0 type-sm text-muted open:[&_summary_svg]:rotate-90">
    <summary className="grid h-8.5 cursor-pointer grid-cols-(--project-agent-row-columns) items-center gap-1.75 [list-style:none] [&::-webkit-details-marker]:hidden [&_svg]:size-3.25 [&_svg]:[transition:transform_var(--dur)_var(--ease)] [&_svg]:motion-reduce:[transition:none]"><ChevronRight aria-hidden="true" /><span>Production details</span><small className="truncate font-code type-meta text-muted">{revision ? `${revision.engine} · ${composition?.slug ?? composition?.id}` : "Loading"}</small></summary>
    {snapshot.composition.status === "loading" && <p>Loading production details…</p>}
    {snapshot.composition.status === "error" && <p role="alert">{snapshot.composition.error}</p>}
    {composition && revision && <div className="unit-production-content rounded-field bg-surface px-3.5 py-3 [&_dd]:m-0 [&_dd]:type-sm [&_dd]:text-muted [&_dd]:[overflow-wrap:anywhere] [&_dt]:font-code [&_dt]:type-meta [&_dt]:text-muted [&_p]:text-muted">
      <dl className="m-0 grid gap-1.75 [&>div]:grid [&>div]:grid-cols-(--project-production-columns) [&>div]:gap-2">
        <div><dt>ENGINE</dt><dd>{revision.engine}{revision.engineVersion ? ` ${revision.engineVersion}` : ""}</dd></div>
        <div><dt>COMPOSITION</dt><dd>{composition.slug} · R{revision.revisionNo}</dd></div>
        <div><dt>ASSETS</dt><dd>{snapshot.compositionInputs.items.length} linked</dd></div>
        <div><dt>PREVIEW BUILDS</dt><dd>{builds.length} · {builds[0] ? formatTime(builds[0].createdAt) : "none"}</dd></div>
        <div><dt>FINAL BUILDS</dt><dd>{builds.filter(({ state }) => state === "succeeded").length}</dd></div>
      </dl>
      {snapshot.compositionSources.items.length > 0 && <p>{sortPositioned(snapshot.compositionSources.items).length} production sources</p>}
      {snapshot.compositionBuildOutputs.items.length > 0 && <p>{sortPositioned(snapshot.compositionBuildOutputs.items).length} rendered outputs</p>}
      <code className="mt-3 block font-code type-meta text-muted">{snapshot.unit.value?.id} · {composition.id} · {revision.id}</code>
    </div>}
  </details>;
}

function captionFrom(metadata: UnitPreviewDto | null): string {
  const value = metadata?.presentation.caption;
  return typeof value === "string" ? value : "";
}

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
  const revisionStrip = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [media, setMedia] = useState<UnitMedia[]>([]);
  const targets = useMemo(() => unit ? socialTargets(unit.format, snapshot.unitPresentations.items) : [], [snapshot.unitPresentations.items, unit]);
  const [targetId, setTargetId] = useState("");
  const target = targets.find((item) => item.id === targetId) ?? targets[0];
  const [metadata, setMetadata] = useState<UnitPreviewDto | null>(null);
  const [previewMode, setPreviewMode] = useState<"post" | "clean">("post");
  const [deviceMockup, setDeviceMockup] = useState(true);
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
    if (open) revisionStrip.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [open, showOriginal, revision?.id, revisions.length]);

  useEffect(() => {
    if (!open || !revision) return;
    if (snapshot.unitRevisions.nextCursor && snapshot.unitRevisions.status !== "loading") void controller.loadMoreUnitRevisions();
    if (snapshot.unitItems.nextCursor && snapshot.unitItems.status !== "loading") void controller.loadMoreUnitItems();
    if (snapshot.unitPresentations.nextCursor && snapshot.unitPresentations.status !== "loading") void controller.loadMoreUnitPresentations();
  }, [controller, open, revision, snapshot.unitItems.nextCursor, snapshot.unitItems.status, snapshot.unitPresentations.nextCursor, snapshot.unitPresentations.status, snapshot.unitRevisions.nextCursor, snapshot.unitRevisions.status]);

  useEffect(() => {
    let current = true;
    setMedia([]);
    if (!open || !revision) return () => { current = false; };
    void resolveUnitMedia(bridge, snapshot.domain.project, snapshot.unitItems.items).then((value) => { if (current) setMedia(value); });
    return () => { current = false; };
  }, [open, revision?.id, snapshot.domain.project, snapshot.unitItems.items]);

  useEffect(() => { setTargetId(targets[0]?.id ?? ""); setPreviewMode("post"); setGuides(false); }, [revision?.id, unit?.format]);

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
  }, [previewMedia, previewMode, target?.id, deviceMockup, showOriginal]);

  const publication = unit && target ? publications.find((item) => item.unitId === unit.id && item.platform === target.platform) : null;
  const caption = captionFrom(metadata);
  const kind = unitPreviewKind(unit?.format ?? "");
  const mobile = kind !== "longform" && target?.platform !== "generic";
  const runningAgent = overview?.runs?.items.find(({ state }) => state === "running" || state === "pending");

  const runPrimaryAction = () => {
    if (lifecycle?.action === "select") void controller.selectInspectedUnitRevision();
    if (lifecycle?.action === "render" || lifecycle?.action === "retry") void controller.buildInspectedCompositionRevision();
    if (lifecycle?.label === "Published" && publication?.url) void bridge.openExternal(publication.url);
  };
  const primaryLabel = lifecycle?.action === "select" ? "Choose this version" : lifecycle?.action === "retry" ? "Retry render" : lifecycle?.action === "render" ? "Render final" : lifecycle?.label === "Published" && publication?.url ? "View post" : null;
  const activeMedia = () => stage.current?.querySelector<HTMLMediaElement>("video") ?? stage.current?.querySelector<HTMLMediaElement>("audio");

  const Title = embedded ? "h2" : Dialog.Title;
  const Description = embedded ? "p" : Dialog.Description;
  const preview = target && unit ? <UnitSocialPreview target={target} media={previewMedia} slug={unit.slug} caption={caption} previewMode={deviceMockup ? previewMode : "clean"} guides={deviceMockup && guides} /> : <div className="preview-empty grid place-items-center text-muted">Loading preview…</div>;
  const content = <>
        {/* One line, the way every other window's titlebar is: what this is, what state it is
            in, and the actions. Everything else -- the platform list, the revision stamp -- is
            content, and the card below already carries it. */}
        <header className={`unit-viewer-header ${embedded ? "flex min-w-0 flex-none flex-wrap items-center gap-2 p-3" : WINDOW_TITLEBAR}`}>
          <Title className={`m-0 min-w-0 truncate type-heading font-normal text-ink ${embedded ? "w-full" : "flex-none"}`}>{unit?.slug ?? "Unit"}</Title>
          <Description className="m-0 flex-none rounded-control bg-chip px-2.25 type-xs leading-5.5 text-muted">{unit?.format ?? "Loading Unit"}</Description>
          {lifecycle && <UnitStatus lifecycle={lifecycle} />}
          <small className="unit-viewer-state min-w-0 flex-1 truncate font-code type-meta text-muted">{showOriginal ? "R0 · Original" : revision ? `R${displayRevisionNo} \u00b7 ${formatTime(revision.createdAt)}` : "Loading revision"}</small>
          <div className={`unit-viewer-actions flex flex-none items-center gap-2 ${embedded ? "w-full justify-between" : ""}`}>
            {!showOriginal && unit && onEditVideo && (kind === "video" || kind === "longform") && <button type="button" className="inline-flex h-8 items-center gap-2 rounded-control bg-card px-3 type-sm text-ink" disabled={pending} onClick={() => onEditVideo(unit.id, unit.slug)}><SlidersHorizontal size={14} />Edit video</button>}
            {revision && lifecycle && primaryLabel ? <button className="unit-primary-action inline-flex h-8 items-center gap-1.75 rounded-control bg-brand px-3.5 type-ui text-brand-ink hover:opacity-88 disabled:opacity-45 [&_svg]:size-3.25" type="button" disabled={pending || revision.sealedAt === null || (lifecycle.action !== "select" && lifecycle.action !== "none" && !productionRevision)} onClick={runPrimaryAction}>{lifecycle.action === "select" ? <Check /> : lifecycle.action === "retry" ? <Clock3 /> : lifecycle.label === "Published" ? <ExternalLink /> : <Play />}{snapshot.unitMutation === "select" ? "Choosing\u2026" : snapshot.compositionMutation === "build" ? "Rendering\u2026" : primaryLabel}</button> : null}
            <WindowClose className="unit-viewer-close" label="Close Unit preview" onClick={() => onOpenChange(false)} />
          </div>
        </header>

        <div className={`unit-viewer-body ${WINDOW_BODY}`}>
        <div className={`unit-viewer-main grid min-h-0 min-w-0 flex-1 gap-5.5 px-5 py-3 @max-project-viewer/unit-viewer:flex @max-project-viewer/unit-viewer:flex-col @max-project-viewer/unit-viewer:overflow-y-auto ${kind === "longform" ? "grid-cols-(--project-viewer-longform-columns)" : "grid-cols-(--project-viewer-columns)"}`}>
          {showOriginal && unit?.sourceRevisionId ? <UnitSourcePreview key={unit.sourceRevisionId} project={snapshot.domain.project} revisionId={unit.sourceRevisionId} label={unit.sourceLabel ?? "Source creative"} /> : <>
          <section className="unit-stage-column flex min-h-0 min-w-0 flex-col items-center gap-2 @max-project-viewer/unit-viewer:flex-none">
            <div className={`unit-stage-toolbar flex flex-wrap w-full min-w-0 flex-none items-center justify-center gap-2 ${STAGE_TABS} ${STAGE_TAB_TOOLTIP}`}>
              {target && (targets.length === 1 ? <span className="unit-stage-platform inline-flex h-7.5 items-center gap-1.5 rounded-field bg-surface px-2.5 type-label text-ink"><SocialIcon platform={target.platform} className="size-3.5" />{target.label}</span> : <GooeyTabs tabs={targets.map((item) => ({ value: item.id, label: <SocialIcon platform={item.platform} />, ariaLabel: item.label, tooltip: item.label }))} value={target.id} onValueChange={setTargetId} size="s" ariaLabel="Social platform" />)}
              <button className={`unit-device-toggle inline-flex h-7.5 flex-none items-center gap-1.5 rounded-field px-2.5 type-label ${deviceMockup ? "bg-instrument text-on-instrument" : "bg-surface text-ink"}`} type="button" aria-pressed={deviceMockup} onClick={() => setDeviceMockup((value) => !value)}><Frame size={14} />Device mockup</button>
              {deviceMockup && <div className="unit-preview-mode inline-flex flex-none rounded-field bg-surface p-0.75" role="group" aria-label="Preview mode"><button className={`h-6 rounded-control px-2.25 type-label ${previewMode === "post" ? "is-active bg-instrument text-on-instrument" : "bg-transparent text-muted"}`} type="button" onClick={() => setPreviewMode("post")}>Post</button><button className={`h-6 rounded-control px-2.25 type-label ${previewMode === "clean" ? "is-active bg-instrument text-on-instrument" : "bg-transparent text-muted"}`} type="button" onClick={() => setPreviewMode("clean")}>Clean</button></div>}
              {deviceMockup && kind === "video" && <IconButton className={`unit-guides-toggle size-7.5 rounded-control [&_svg]:size-3.5 ${guides ? "is-active bg-ink/18 text-ink" : "hover:bg-surface"}`} label="Safe-area guides" aria-pressed={guides} onClick={() => setGuides((value) => !value)}><Frame /></IconButton>}
            </div>
            <div className="unit-stage-frame flex w-full min-h-0 min-w-0 flex-1 flex-col items-center gap-2 @max-project-viewer/unit-viewer:flex-none">
            <div className={`unit-social-stage flex w-full min-h-0 min-w-0 items-center justify-center overflow-visible rounded-none bg-transparent ${deviceMockup ? "flex-1 @max-project-viewer/unit-viewer:min-h-iphone-height @max-project-viewer/unit-viewer:flex-none" : "flex-1 @max-project-viewer/unit-viewer:h-unit-media-preview @max-project-viewer/unit-viewer:flex-none [&_.unit-clean-preview]:bg-transparent"} is-${kind}`} ref={stage}>
              {deviceMockup && mobile && target && unit ? <IPhoneMockup>{preview}</IPhoneMockup> : preview}
            </div>
            {(kind === "video" || kind === "longform") && <div className={`unit-playback grid w-full max-w-iphone flex-none grid-cols-(--project-playback-columns) items-center gap-2 font-code type-mono-md text-muted${mobile ? " is-mobile" : ""}`}>
              <IconButton className="size-6.5 rounded-full hover:bg-surface [&_svg]:size-3.25" label={playing ? "Pause preview" : "Play preview"} onClick={() => { const element = activeMedia(); if (!element) return; if (element.paused) void element.play().catch(() => setPlaying(false)); else element.pause(); }}>{playing ? <Pause /> : <Play />}</IconButton>
              <span>{formatDuration(currentTime)}</span>
              <SnappySlider className="unit-playback-seek h-4.5 cursor-pointer [&_.snappy-slider-range]:bg-muted [&_.snappy-slider-thumb]:bg-muted [&_.snappy-slider-thumb]:opacity-0 [&_.snappy-slider-track]:h-0.75 [&_.snappy-slider-track]:bg-surface hover:[&_.snappy-slider-thumb]:opacity-100 focus-visible:[&_.snappy-slider-thumb]:opacity-100" value={currentTime} min={0} max={Math.max(duration, .1)} step={.1} ariaLabel="Position in preview" onValueChange={(next) => { const element = activeMedia(); if (element) element.currentTime = next; setCurrentTime(next); }} />
              <span>{formatDuration(duration)}</span>
              <IconButton className="size-6.5 rounded-full hover:bg-surface [&_svg]:size-3.25" label={muted ? "Unmute preview" : "Mute preview"} onClick={() => { const element = activeMedia(); if (!element) return; element.muted = !element.muted; setMuted(element.muted); }}>{muted ? <VolumeX /> : <Volume2 />}</IconButton>
            </div>}
            </div>
          </section>

          <aside className="unit-viewer-meta grid min-h-0 min-w-0 flex-none grid-cols-2 content-start gap-x-7.5 gap-y-5 overflow-auto bg-transparent pb-3 pl-0.5 pr-1 pt-0.5 @max-project-viewer/unit-viewer:block @max-project-viewer/unit-viewer:overflow-visible @max-project-viewer/unit-viewer:[&>*+*]:mt-5">
            {lifecycle && <div className="unit-lifecycle-cell col-span-full grid gap-2"><LifecycleStepper lifecycle={lifecycle} /><p className="unit-lifecycle-note rounded-field bg-surface px-3 py-2.5 type-sm text-muted">{lifecycle.label === "Published" ? "Published across connected platforms" : lifecycle.label === "Scheduled" ? "Final is ready and publication is scheduled" : lifecycle.label === "Render failed" ? "The last final render failed — retry is available" : "Preview changes do not change the selected version"}</p></div>}

            {runningAgent && lifecycle?.label === "In progress" && <section className="unit-agent-block mt-2.5 grid grid-cols-(--project-agent-row-columns) items-center gap-2 rounded-field bg-surface p-3.25 type-xs text-muted"><span className="unit-spinner size-3 animate-pulse rounded-full bg-muted motion-reduce:animate-none motion-reduce:opacity-80" aria-hidden="true" /><strong className="type-ui font-normal text-ink">Agent is assembling the unit</strong><small className="font-code type-meta text-muted">{runningAgent.startedAt ? formatTime(runningAgent.startedAt) : "queued"}</small><i className="col-span-full h-0.75 overflow-hidden rounded-control bg-surface"><span className="block h-full w-progress-agent bg-ink" /></i><p className="col-span-full m-0 truncate type-label text-muted">Preview updates as new builds land.</p></section>}

            {revision && <section className={`${META_SECTION} unit-current-version`}><label className={META_LABEL}>CURRENT VERSION</label><div className="flex items-baseline gap-2"><strong className="font-code type-lg text-ink">R{displayRevisionNo}</strong><span className="type-sm text-muted">{revision.sealedAt ? "Preview ready" : "Building preview"}{revision.id === unit?.latestRevisionId ? " · latest" : ""}</span></div><small className="mt-0.5 block font-code type-meta text-muted">{revision.authoredBySessionId ? "Agent" : "Ralphy"} · {formatTime(revision.createdAt)}</small><p className="my-2.5 type-base leading-row text-muted">{revision.note ?? "Creative revision preview"}</p>{revision.id === unit?.selectedRevisionId ? <span className="unit-selected-version inline-flex h-7.5 items-center gap-1.5 rounded-control bg-transparent p-0 type-sm text-ink [&_svg]:size-3.25"><Check /> Selected version</span> : lifecycle?.action === "select" ? <button className="inline-flex h-7.5 items-center gap-1.5 rounded-control bg-ink/14 px-3.25 type-sm text-ink hover:bg-ink/24 [&_svg]:size-3.25" type="button" disabled={pending || revision.sealedAt === null} onClick={() => { void controller.selectInspectedUnitRevision(); }}><Check /> Choose this version</button> : null}</section>}

            {targets.length > 0 && <section className={`${META_SECTION} unit-platforms grid content-start gap-2`}><label className={META_LABEL}>PLATFORMS</label>{targets.map((item) => <button className={`grid min-h-11 grid-cols-(--project-row-columns) py-2 items-center rounded-control px-3 text-left [&_em]:col-start-2 [&_em]:row-span-2 [&_em]:row-start-1 [&_em]:inline-flex [&_em]:items-center [&_em]:gap-1 [&_em]:font-code [&_em]:type-meta [&_em]:not-italic [&_em_svg]:size-2.5 [&_small]:row-start-2 [&_small]:font-code [&_small]:type-meta [&>span]:type-ui ${item.id === target?.id ? "is-active bg-instrument text-on-instrument [&_em]:text-on-instrument-muted [&_small]:text-on-instrument-muted" : "bg-transparent text-ink hover:bg-surface [&_em]:text-muted [&_small]:text-muted"}`} type="button" key={item.id} onClick={() => setTargetId(item.id)}><span className="unit-platform-label inline-flex items-center gap-1.75 [&_svg]:size-3.25"><SocialIcon platform={item.platform} />{item.label}</span><small>{item.variant === "carousel" ? `${media.length} slides` : kind === "longform" ? "16:9" : kind === "post" ? "Text / image post" : duration > 0 ? formatDuration(duration) : "Preview"}</small><em>{snapshot.unitPresentations.items.some(({ platform }) => platform === item.platform) ? <><Check /> READY</> : <><Clock3 /> PREPARING</>}</em></button>)}</section>}

            <section className={`${META_SECTION} unit-caption`}><label className={META_LABEL}>{kind === "longform" ? "TITLE & DESCRIPTION" : `CAPTION · ${target?.label ?? "PREVIEW"}`}</label><div className="rounded-field bg-surface px-3.5 py-3"><p className="m-0 type-ui leading-row text-muted">{caption}</p><span className="mt-2 flex items-center justify-between font-code type-meta text-muted">{caption.length} characters<IconButton className="size-6 rounded-control hover:bg-surface [&_svg]:size-3" label="Copy caption" onClick={() => { void bridge.copyText(caption); }}><Copy /></IconButton></span></div></section>

            {lifecycle?.label === "Scheduled" && publication?.scheduledAt && <section className={`${META_SECTION} unit-schedule`}><label className={META_LABEL}>SCHEDULE</label><div className="flex items-center gap-2.5 rounded-field bg-surface px-3.25 py-2.75 text-muted [&>svg]:size-3.75"><Clock3 /><span className="grid gap-0.5"><strong className="type-base font-normal text-ink">{formatTime(publication.scheduledAt)}</strong><small className="font-code type-meta text-muted">{target?.label} · scheduled</small></span></div></section>}

            {lifecycle?.label === "Published" && <section className={`${META_SECTION} unit-performance`}><label className={META_LABEL}>PERFORMANCE · {target?.label?.toUpperCase()}</label><div className="unit-metrics grid grid-cols-4 gap-2 [&>span]:grid [&>span]:gap-0.75 [&>span]:rounded-field [&>span]:bg-surface [&>span]:px-3 [&>span]:py-2.5 [&_small]:type-mono-md [&_small]:text-muted [&_strong]:font-code [&_strong]:type-title [&_strong]:text-ink"><span><strong>{formatMetric(overview?.metrics?.views)}</strong><small>Views</small></span><span><strong>{formatMetric(overview?.metrics?.likes)}</strong><small>Likes</small></span><span><strong>{formatMetric(overview?.metrics?.comments)}</strong><small>Comments</small></span><span><strong>{formatMetric(overview?.metrics?.shares)}</strong><small>Shares</small></span></div><p className="unit-retention-unavailable mt-2.5 rounded-field bg-surface px-3 py-2.5 type-xs text-muted">Retention curve is not available from the current Core contract.</p></section>}

            <ProductionDetails snapshot={snapshot} />
          </aside>
          </>}
        </div>

        <i className="unit-revisions-rule mx-5 h-px flex-none bg-divider" aria-hidden="true" />
        <section className="unit-revisions min-w-0 flex-none px-5 pb-3.5 pt-3" aria-label="Unit revisions">
          <span className="mb-2 flex items-center justify-between gap-3"><label className="font-code type-meta tracking-block text-muted">REVISIONS · {revisions.length + (unit?.sourceRevisionId ? 1 : 0)}</label><span className="type-xs text-muted">Click a version to compare</span></span>
          <div ref={revisionStrip} className="flex gap-2 overflow-x-auto p-px" role="listbox" aria-label="Unit revisions list">
            {unit?.sourceRevisionId && <button type="button" role="option" aria-label="View revision 0" aria-selected={showOriginal} onClick={() => setOriginalUnitId(unit.id)} onKeyDown={(event) => { if (event.key === "ArrowRight" && revisions[0]) { event.preventDefault(); setOriginalUnitId(null); void controller.inspectUnitRevision(revisions[0].id); } }} className={`unit-original-revision relative grid w-revision-card min-w-revision-card-min shrink-0 gap-2 rounded-cell p-1.5 text-left ring-1 ring-inset ${showOriginal ? "is-viewing bg-brand/10 text-ink ring-brand" : "bg-surface text-ink ring-transparent hover:ring-divider hover:bg-surface-hover"}`}>
              <UnitRevisionPreview project={snapshot.domain.project} revisionId={unit.sourceRevisionId} className="unit-revision-thumb aspect-video w-full rounded-field" />
              <span className="truncate px-1 type-xs text-secondary">{unit.sourceLabel ?? "Source creative"}</span>
              <span className="flex items-center justify-between gap-2 px-1 pb-1"><strong className="font-code type-sm">R0</strong><span className="rounded-chip bg-brand px-2 py-1 font-code type-xs text-brand-ink">ORIGINAL</span></span>
            </button>}
            {revisions.map((item, index) => <button className={`relative grid w-revision-card min-w-revision-card-min shrink-0 gap-2 rounded-cell p-1.5 text-left ring-1 ring-inset transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-brand motion-reduce:transition-none ${!showOriginal && item.id === revision?.id ? "is-viewing bg-brand/10 text-ink ring-brand" : "bg-surface text-ink ring-transparent hover:ring-divider hover:bg-surface-hover"}`} type="button" role="option" aria-label={`View revision ${unitRevisionNumber(item, sourceRevision)}`} aria-selected={!showOriginal && item.id === revision?.id} title={item.note ?? undefined} key={item.id} onClick={() => { setOriginalUnitId(null); void controller.inspectUnitRevision(item.id); }} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); const next = revisions[index + (event.key === "ArrowLeft" ? -1 : 1)]; if (next) { setOriginalUnitId(null); void controller.inspectUnitRevision(next.id); } else if (event.key === "ArrowLeft" && index === 0 && unit?.sourceRevisionId) setOriginalUnitId(unit.id); } }}>
              <UnitRevisionPreview project={snapshot.domain.project} revisionId={item.id} sealedAt={item.sealedAt} className="unit-revision-thumb aspect-video w-full rounded-field" />
              {item.note && <span className="truncate px-1 type-xs text-secondary">{item.note.split("\n", 1)[0]}</span>}
              <span className="grid min-w-0 gap-1 px-1 pb-1"><span className="flex items-center justify-between gap-1"><strong className="font-code type-sm font-medium">R{unitRevisionNumber(item, sourceRevision)}</strong><span className="unit-revision-badges flex items-center gap-1.5 font-code type-mono-xs text-muted">{item.id === unit?.selectedRevisionId ? <b className="font-medium text-ink">SELECTED</b> : item.id === unit?.latestRevisionId ? <i className="font-medium not-italic text-ink">LATEST</i> : item.id === unit?.sourceRevisionId ? "ORIGINAL" : unitRevisionNumber(item, sourceRevision) === 1 ? "FIRST" : null}{!showOriginal && item.id === revision?.id && lifecycle?.label === "Ready" && <i className="is-final not-italic">✓ FINAL</i>}</span></span><small className="truncate font-code type-mono-sm text-muted">{formatTime(item.createdAt)}</small></span>
            </button>)}
          </div>
        </section>
        </div>
  </>;
  if (embedded) return open ? <section className={`unit-viewer @container/unit-viewer h-full w-full text-ink ${WINDOW}`} data-unit-view="panel" aria-label={`Unit preview: ${unit?.slug ?? "Loading"}`} ref={surface} onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); onOpenChange(false); } }}>{content}</section> : null;
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    {open && <Dialog.Portal forceMount container={typeof document === "undefined" ? undefined : document.body}>
      <Dialog.Overlay forceMount className="unit-viewer-overlay fixed inset-0 z-scrim" data-instrument-overlay-backdrop="" />
      <Dialog.Content forceMount className={`unit-viewer @container/unit-viewer fixed left-1/2 top-1/2 z-scrim-content h-unit-viewer-height w-unit-viewer-width -translate-x-1/2 -translate-y-1/2 text-ink outline-none ${WINDOW}`} data-instrument-overlay="unit-viewer" ref={surface} onOpenAutoFocus={(event) => { event.preventDefault(); surface.current?.focus({ preventScroll: true }); }} onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus?.focus({ preventScroll: true }); }} tabIndex={-1}>{content}</Dialog.Content>
    </Dialog.Portal>}
  </Dialog.Root>;
}
