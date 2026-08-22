import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronRight, Clock3, Copy, ExternalLink, Frame, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ProjectOverviewDto, UnitPreviewDto } from "../../../electron/ralphy/types";
import { GooeyTabs } from "../../components/ui/GooeyTabs";
import { IPhoneMockup } from "../../components/ui/IPhoneMockup";
import { SnappySlider } from "../../components/ui/SnappySlider";
import { SocialIcon } from "../../components/ui/SocialIcon";
import { sortBuilds, sortPositioned } from "../../lib/compositions";
import { bridge } from "../../lib/ipc";
import { unitLifecycle, type UnitLifecycle } from "../../lib/unit-lifecycle";
import { preferredUnitPoster, resolveUnitMedia, socialTargets, unitPreviewKind, type UnitMedia } from "../../lib/unit-previews";
import type { ProjectScreenController, ProjectScreenSnapshot } from "../../state/project-screen-controller";
import { UnitSocialPreview } from "./UnitSocialPreview";

const formatTime = (value: number) => new Date(value < 1_000_000_000_000 ? value * 1000 : value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const formatDuration = (value: number) => `${Math.floor((Number.isFinite(value) ? value : 0) / 60)}:${Math.floor((Number.isFinite(value) ? value : 0) % 60).toString().padStart(2, "0")}`;
const formatMetric = (value: number | null | undefined) => value == null ? "—" : Intl.NumberFormat(undefined, { notation: value > 9999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);

// The viewer is portalled to the body, outside the work-mode scope where the legacy tokens are
// remapped, so every surface and ink here is stated from the theme scale: the legacy ink is the
// on-dark family at the root and turns invisible on this light widget.
const META_LABEL = "block mb-2 font-code type-meta tracking-block text-muted";
const META_SECTION = "unit-meta-section min-w-0 [&>div]:[corner-shape:squircle]";
const META_PLATE = "mt-2.5 rounded-field bg-surface-sunken px-3 py-2.5 type-xs text-muted";
// A status pill states its tone with the dot; the label stays readable ink, and the label text
// already names the state, so nothing here is colour-only.
const STATUS_PILL = "inline-flex h-5 items-center gap-1.5 rounded-control bg-ink/13 px-2 type-mono-md whitespace-nowrap text-ink";
const statusDot = (tone: string) => ({ ok: "bg-ink", warn: "bg-muted", danger: "bg-alert" } as Record<string, string>)[tone] ?? "bg-muted";
// The stepper mark is a ring, not a plate: an inset shadow leaves the design free of borders.
const MARK_PENDING = "[box-shadow:inset_0_0_0_1.5px_var(--color-track-on-instrument)]";
const MARK_CURRENT = "[box-shadow:inset_0_0_0_1.5px_var(--color-ink)] after:size-1.5 after:rounded-full after:bg-ink after:[content:'']";
const MARK_DONE = "bg-ink/15 text-ink";
// The stage's tab strip borrows GooeyTabs, so the strip states the cell geometry, the flat
// surface and the tooltip that is the only visible label these icon tabs have.
const STAGE_TABS = "[&_.gooey-tabs]:grid [&_.gooey-tabs]:w-auto [&_.gooey-tabs]:min-w-0 [&_.gooey-tabs]:grid-cols-(--project-gooey-columns) [&_.gooey-tabs]:gap-0.5 [&_.gooey-tabs]:overflow-visible [&_.gooey-tabs]:rounded-control [&_.gooey-tabs]:bg-surface-sunken [&_.gooey-tabs]:p-0.5 [&_.gooey-tabs]:[--gooey-cell-width:32px] [&_.gooey-tabs]:[grid-auto-columns:unset] [&_.gooey-tabs]:[grid-auto-flow:unset] [&_.gooey-tabs-blobs]:hidden [&_.gooey-tabs_button]:relative [&_.gooey-tabs_button]:w-(--gooey-cell-width) [&_.gooey-tabs_button]:min-w-0 [&_.gooey-tabs_button]:rounded-control [&_.gooey-tabs_button]:p-0 [&_.gooey-tabs_button[aria-selected=true]]:bg-surface [&_.gooey-tabs_button>svg]:size-3.25";
const STAGE_TAB_TOOLTIP = "[&_button[data-tooltip]]:after:pointer-events-none [&_button[data-tooltip]]:after:absolute [&_button[data-tooltip]]:after:bottom-[calc(100%_+_7px)] [&_button[data-tooltip]]:after:left-1/2 [&_button[data-tooltip]]:after:z-header [&_button[data-tooltip]]:after:-translate-x-1/2 [&_button[data-tooltip]]:after:translate-y-0.5 [&_button[data-tooltip]]:after:rounded-chip [&_button[data-tooltip]]:after:bg-ghost [&_button[data-tooltip]]:after:px-1.75 [&_button[data-tooltip]]:after:py-1 [&_button[data-tooltip]]:after:type-xs [&_button[data-tooltip]]:after:leading-pill [&_button[data-tooltip]]:after:text-on-instrument [&_button[data-tooltip]]:after:opacity-0 [&_button[data-tooltip]]:after:[content:attr(data-tooltip)] [&_button[data-tooltip]]:after:[transition:opacity_var(--dur)_var(--ease),transform_var(--dur)_var(--ease)] [&_button[data-tooltip]]:after:motion-reduce:[transition:none] [&_button[data-tooltip]:hover]:after:translate-y-0 [&_button[data-tooltip]:hover]:after:opacity-100 [&_button[data-tooltip]:focus-visible]:after:translate-y-0 [&_button[data-tooltip]:focus-visible]:after:opacity-100";

function Status({ lifecycle }: { lifecycle: UnitLifecycle }) {
  return <span className={`unit-status status-${lifecycle.tone} ${STATUS_PILL}`}><span className={`size-1.25 flex-none rounded-full ${statusDot(lifecycle.tone)}`} aria-hidden="true" />{lifecycle.label}</span>;
}

function LifecycleStepper({ lifecycle }: { lifecycle: UnitLifecycle }) {
  const current = lifecycle.label === "Published" ? 2 : lifecycle.label === "Scheduled" ? 1 : 0;
  const row = "relative grid justify-items-start gap-1.5 pt-0 after:absolute after:left-7 after:right-2.5 after:top-2 after:h-0.375 after:[content:''] last:after:hidden [&_svg]:size-2.5";
  const mark = "relative z-1 grid size-4.5 place-items-center rounded-full";
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
    {composition && revision && <div className="unit-production-content rounded-field bg-surface-sunken px-3.5 py-3 [&_dd]:m-0 [&_dd]:type-sm [&_dd]:text-muted [&_dd]:[overflow-wrap:anywhere] [&_dt]:font-code [&_dt]:type-meta [&_dt]:text-muted [&_p]:text-muted">
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

function captionFrom(metadata: UnitPreviewDto | null, fallback: string): string {
  const value = metadata?.presentation.caption;
  return typeof value === "string" && value.trim() ? value : `${fallback} — made with Ralphy. #ralphy`;
}

export function UnitViewer({
  open,
  onOpenChange,
  controller,
  snapshot,
  returnFocus,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  controller: ProjectScreenController;
  snapshot: ProjectScreenSnapshot;
  returnFocus: HTMLElement | null;
}) {
  const unit = snapshot.unit.value;
  const revision = snapshot.inspectedUnitRevision.value;
  const productionRevision = revision?.compositionRevisionId === snapshot.inspectedCompositionRevision.value?.id ? snapshot.inspectedCompositionRevision.value : null;
  const overview = snapshot.domain.overview.value as ProjectOverviewDto | null;
  const publications = overview?.publications?.items ?? [];
  const lifecycle = unit ? unitLifecycle({ unit, revision, compositionRevision: productionRevision, builds: snapshot.compositionBuilds.items, publications }) : null;
  const pending = snapshot.unitMutation !== "idle" || snapshot.compositionMutation !== "idle";
  const surface = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [media, setMedia] = useState<UnitMedia[]>([]);
  const targets = useMemo(() => unit ? socialTargets(unit.format, snapshot.unitPresentations.items) : [], [snapshot.unitPresentations.items, unit]);
  const [targetId, setTargetId] = useState("");
  const target = targets.find((item) => item.id === targetId) ?? targets[0];
  const [metadata, setMetadata] = useState<UnitPreviewDto | null>(null);
  const [previewMode, setPreviewMode] = useState<"post" | "clean">("post");
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
  const previewMedia = useMemo(() => previewCover && !preferredUnitPoster(media, true) ? [...media, previewCover] : media, [media, previewCover]);

  const revisions = useMemo(() => {
    const rows = revision && !snapshot.unitRevisions.items.some(({ id }) => id === revision.id) ? [...snapshot.unitRevisions.items, revision] : snapshot.unitRevisions.items;
    return [...rows].sort((a, b) => b.revisionNo - a.revisionNo);
  }, [revision, snapshot.unitRevisions.items]);

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
  }, [previewMedia, previewMode, target?.id]);

  const publication = unit && target ? publications.find((item) => item.unitId === unit.id && item.platform === target.platform) : null;
  const caption = captionFrom(metadata, unit?.slug ?? "Unit");
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

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    {open && <Dialog.Portal forceMount container={typeof document === "undefined" ? undefined : document.body}>
      <Dialog.Overlay forceMount className="unit-viewer-overlay fixed inset-0 z-scrim" data-instrument-overlay-backdrop="" />
      <Dialog.Content forceMount className="unit-viewer @container/unit-viewer fixed left-1/2 top-1/2 z-scrim-content grid h-unit-viewer-height w-unit-viewer-width min-h-0 min-w-0 -translate-x-1/2 -translate-y-1/2 grid-rows-(--project-viewer-rows) overflow-hidden rounded-panel bg-surface text-ink outline-none [&_.unit-meta-section]:bg-surface-sunken" data-instrument-overlay="unit-viewer" ref={surface} onOpenAutoFocus={(event) => { event.preventDefault(); surface.current?.focus({ preventScroll: true }); }} onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus?.focus({ preventScroll: true }); }} tabIndex={-1}>
        <header className="unit-viewer-header flex min-w-0 items-center justify-between gap-4 bg-surface-sunken px-6 pb-3.5 pt-4.5 @max-project-viewer/unit-viewer:items-start">
          <div className="unit-viewer-heading flex min-w-0 flex-wrap items-center gap-1.75">
            <Dialog.Title className="m-0 w-full type-heading font-normal text-ink">{unit?.slug ?? "Unit"}</Dialog.Title>
            <Dialog.Description className="m-0 h-5.5 rounded-control bg-surface px-2.25 type-xs leading-5.5 text-muted">{unit?.format ?? "Loading Unit"}</Dialog.Description>
            {targets.map(({ id, label, platform }) => <span className="unit-platform-chip inline-flex h-5.5 items-center gap-1.25 rounded-control bg-surface px-2.25 type-xs leading-5.5 text-muted [&_svg]:size-2.75" key={id}><SocialIcon platform={platform} />{label}</span>)}
            {lifecycle && <span className="unit-viewer-state flex w-full items-center gap-2 [&_small]:font-code [&_small]:type-meta [&_small]:text-muted"><Status lifecycle={lifecycle} /><small>{revision ? `R${revision.revisionNo} · ${formatTime(revision.createdAt)}` : "Loading revision"}</small></span>}
          </div>
          <div className="unit-viewer-actions flex items-center gap-2 @max-project-viewer/unit-viewer:flex-wrap @max-project-viewer/unit-viewer:justify-end">
            {revision && lifecycle && primaryLabel ? <button className="unit-primary-action inline-flex h-8 items-center gap-1.75 rounded-control bg-desk-primary px-3.5 type-ui text-desk-primary-ink disabled:opacity-45 [&_svg]:size-3.25" type="button" disabled={pending || revision.sealedAt === null || (lifecycle.action !== "select" && lifecycle.action !== "none" && !productionRevision)} onClick={runPrimaryAction}>{lifecycle.action === "select" ? <Check /> : lifecycle.action === "retry" ? <Clock3 /> : lifecycle.label === "Published" ? <ExternalLink /> : <Play />}{snapshot.unitMutation === "select" ? "Choosing…" : snapshot.compositionMutation === "build" ? "Rendering…" : primaryLabel}</button> : null}
            <Dialog.Close asChild><button className="unit-viewer-close grid size-7.5 place-items-center rounded-field text-muted hover:bg-transparent hover:text-ink [&_svg]:size-3.75" type="button" aria-label="Close Unit preview"><X /></button></Dialog.Close>
          </div>
        </header>

        <div className={`unit-viewer-main grid min-h-0 min-w-0 gap-5.5 px-6 pb-4 @max-project-viewer/unit-viewer:grid-cols-1 @max-project-viewer/unit-viewer:overflow-y-auto ${kind === "longform" ? "grid-cols-(--project-viewer-longform-columns)" : "grid-cols-(--project-viewer-columns)"}`}>
          <section className="unit-stage-column grid min-h-0 min-w-0 grid-rows-(--project-viewer-rows) justify-items-center gap-2.5">
            <div className={`unit-stage-toolbar flex w-full min-w-0 items-center justify-center gap-2 ${STAGE_TABS} ${STAGE_TAB_TOOLTIP}`}>
              {target ? <GooeyTabs tabs={targets.map((item) => ({ value: item.id, label: <SocialIcon platform={item.platform} />, ariaLabel: item.label, tooltip: item.label }))} value={target.id} onValueChange={setTargetId} size="s" ariaLabel="Social platform" /> : null}
              <div className="unit-preview-mode inline-flex flex-none rounded-field bg-surface-sunken p-0.75" role="group" aria-label="Preview mode"><button className={`h-6 rounded-control px-2.25 type-label ${previewMode === "post" ? "is-active bg-instrument text-on-instrument" : "bg-transparent text-muted"}`} type="button" onClick={() => setPreviewMode("post")}>Post</button><button className={`h-6 rounded-control px-2.25 type-label ${previewMode === "clean" ? "is-active bg-instrument text-on-instrument" : "bg-transparent text-muted"}`} type="button" onClick={() => setPreviewMode("clean")}>Clean</button></div>
              {kind === "video" && <button className={`unit-guides-toggle grid size-7.5 flex-none place-items-center rounded-control [&_svg]:size-3.5 ${guides ? "is-active bg-ink/18 text-ink" : "text-muted hover:bg-surface hover:text-ink"}`} type="button" aria-label="Safe-area guides" aria-pressed={guides} onClick={() => setGuides((value) => !value)}><Frame /></button>}
            </div>
            <div className={`unit-social-stage grid w-full min-h-0 min-w-0 place-items-center overflow-visible rounded-none bg-transparent @max-project-viewer/unit-viewer:min-h-social-stage is-${kind}`} ref={stage}>
              {target && unit ? mobile ? <IPhoneMockup><UnitSocialPreview target={target} media={previewMedia} slug={unit.slug} caption={caption} previewMode={previewMode} guides={guides} /></IPhoneMockup> : <UnitSocialPreview target={target} media={previewMedia} slug={unit.slug} caption={caption} previewMode={previewMode} guides={guides} /> : <div className="preview-empty grid place-items-center text-muted">Loading preview…</div>}
            </div>
            {(kind === "video" || kind === "longform") && <div className={`unit-playback grid grid-cols-(--project-playback-columns) items-center gap-2 font-code type-mono-md text-muted ${mobile ? "is-mobile w-iphone" : "w-full"}`}>
              <button className="grid size-6.5 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink [&_svg]:size-3.25" type="button" aria-label={playing ? "Pause preview" : "Play preview"} onClick={() => { const element = activeMedia(); if (!element) return; if (element.paused) void element.play().catch(() => setPlaying(false)); else element.pause(); }}>{playing ? <Pause /> : <Play />}</button>
              <span>{formatDuration(currentTime)}</span>
              <SnappySlider className="unit-playback-seek h-4.5 cursor-pointer [&_.snappy-slider-range]:bg-muted [&_.snappy-slider-thumb]:bg-muted [&_.snappy-slider-thumb]:opacity-0 [&_.snappy-slider-track]:h-0.75 [&_.snappy-slider-track]:bg-surface hover:[&_.snappy-slider-thumb]:opacity-100 focus-visible:[&_.snappy-slider-thumb]:opacity-100" value={currentTime} min={0} max={Math.max(duration, .1)} step={.1} ariaLabel="Position in preview" onValueChange={(next) => { const element = activeMedia(); if (element) element.currentTime = next; setCurrentTime(next); }} />
              <span>{formatDuration(duration)}</span>
              <button className="grid size-6.5 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink [&_svg]:size-3.25" type="button" aria-label={muted ? "Unmute preview" : "Mute preview"} onClick={() => { const element = activeMedia(); if (!element) return; element.muted = !element.muted; setMuted(element.muted); }}>{muted ? <VolumeX /> : <Volume2 />}</button>
            </div>}
          </section>

          <aside className="unit-viewer-meta grid min-h-0 min-w-0 grid-cols-2 content-start gap-x-7.5 gap-y-5 overflow-auto bg-transparent pb-3 pl-0.5 pr-1 pt-0.5 @max-project-viewer/unit-viewer:block @max-project-viewer/unit-viewer:overflow-visible @max-project-viewer/unit-viewer:[&>*+*]:mt-5">
            {lifecycle && <><LifecycleStepper lifecycle={lifecycle} /><p className="unit-lifecycle-note -mt-2.5 rounded-field bg-surface-sunken px-3 py-2.5 type-sm text-muted">{lifecycle.label === "Published" ? "Published across connected platforms" : lifecycle.label === "Scheduled" ? "Final is ready and publication is scheduled" : lifecycle.label === "Render failed" ? "The last final render failed — retry is available" : "Preview changes do not change the selected version"}</p></>}

            {runningAgent && lifecycle?.label === "In progress" && <section className="unit-agent-block mt-2.5 grid grid-cols-(--project-agent-row-columns) items-center gap-2 rounded-field bg-surface-sunken p-3.25 type-xs text-muted"><span className="unit-spinner size-3 animate-pulse rounded-full bg-muted motion-reduce:animate-none motion-reduce:opacity-80" aria-hidden="true" /><strong className="type-ui font-normal text-ink">Agent is assembling the unit</strong><small className="font-code type-meta text-muted">{runningAgent.startedAt ? formatTime(runningAgent.startedAt) : "queued"}</small><i className="col-span-full h-0.75 overflow-hidden rounded-control bg-surface"><span className="block h-full w-progress-agent bg-ink" /></i><p className="col-span-full m-0 truncate type-label text-muted">Preview updates as new builds land.</p></section>}

            {revision && <section className={`${META_SECTION} unit-current-version`}><label className={META_LABEL}>CURRENT VERSION</label><div className="flex items-baseline gap-2"><strong className="font-code type-lg text-ink">R{revision.revisionNo}</strong><span className="type-sm text-muted">{revision.sealedAt ? "Preview ready" : "Building preview"}{revision.id === unit?.latestRevisionId ? " · latest" : ""}</span></div><small className="mt-0.5 block font-code type-meta text-muted">{revision.authoredBySessionId ? "Agent" : "Ralphy"} · {formatTime(revision.createdAt)}</small><p className="my-2.5 type-base leading-row text-muted">{revision.note ?? "Creative revision preview"}</p>{revision.id === unit?.selectedRevisionId ? <span className="unit-selected-version inline-flex h-7.5 items-center gap-1.5 rounded-control bg-transparent p-0 type-sm text-ink [&_svg]:size-3.25"><Check /> Selected version</span> : lifecycle?.action === "select" ? <button className="inline-flex h-7.5 items-center gap-1.5 rounded-control bg-ink/14 px-3.25 type-sm text-ink hover:bg-ink/24 [&_svg]:size-3.25" type="button" disabled={pending || revision.sealedAt === null} onClick={() => { void controller.selectInspectedUnitRevision(); }}><Check /> Choose this version</button> : null}</section>}

            {targets.length > 1 && <section className={`${META_SECTION} unit-platforms grid content-start`}><label className={META_LABEL}>PLATFORMS</label>{targets.map((item) => <button className={`grid h-9.5 grid-cols-(--project-row-columns) items-center rounded-control px-3 text-left [&_em]:col-start-2 [&_em]:row-span-2 [&_em]:row-start-1 [&_em]:inline-flex [&_em]:items-center [&_em]:gap-1 [&_em]:font-code [&_em]:type-meta [&_em]:not-italic [&_em_svg]:size-2.5 [&_small]:row-start-2 [&_small]:font-code [&_small]:type-meta [&>span]:type-ui ${item.id === target?.id ? "is-active bg-instrument text-on-instrument [&_em]:text-on-instrument-muted [&_small]:text-on-instrument-muted" : "bg-surface-sunken text-ink hover:bg-surface [&_em]:text-muted [&_small]:text-muted"}`} type="button" key={item.id} onClick={() => setTargetId(item.id)}><span className="unit-platform-label inline-flex items-center gap-1.75 [&_svg]:size-3.25"><SocialIcon platform={item.platform} />{item.label}</span><small>{item.variant === "carousel" ? `${media.length} slides` : kind === "longform" ? "16:9" : "9:16 · 00:24"}</small><em>{snapshot.unitPresentations.items.some(({ platform }) => platform === item.platform) ? <><Check /> READY</> : <><Clock3 /> PREPARING</>}</em></button>)}</section>}

            <section className={`${META_SECTION} unit-caption ${META_PLATE}`}><label className={META_LABEL}>{kind === "longform" ? "TITLE & DESCRIPTION" : `CAPTION · ${target?.label ?? "PREVIEW"}`}</label><div className="rounded-field bg-surface-sunken px-3.5 py-3"><p className="m-0 type-ui leading-row text-muted">{caption}</p><span className="mt-2 flex items-center justify-between font-code type-meta text-muted">{caption.length} / 2200<button className="grid size-6 place-items-center rounded-control text-muted hover:bg-surface hover:text-ink [&_svg]:size-3" type="button" aria-label="Copy caption" onClick={() => { void bridge.copyText(caption); }}><Copy /></button></span></div></section>

            {lifecycle?.label === "Scheduled" && publication?.scheduledAt && <section className={`${META_SECTION} unit-schedule ${META_PLATE}`}><label className={META_LABEL}>SCHEDULE</label><div className="flex items-center gap-2.5 rounded-field bg-surface-sunken px-3.25 py-2.75 text-muted [&>svg]:size-3.75"><Clock3 /><span className="grid gap-0.5"><strong className="type-base font-normal text-ink">{formatTime(publication.scheduledAt)}</strong><small className="font-code type-meta text-muted">{target?.label} · scheduled</small></span></div></section>}

            {lifecycle?.label === "Published" && <section className={`${META_SECTION} unit-performance ${META_PLATE}`}><label className={META_LABEL}>PERFORMANCE · {target?.label?.toUpperCase()}</label><div className="unit-metrics grid grid-cols-4 gap-2 [&>span]:grid [&>span]:gap-0.75 [&>span]:rounded-field [&>span]:bg-surface-sunken [&>span]:px-3 [&>span]:py-2.5 [&_small]:type-mono-md [&_small]:text-muted [&_strong]:font-code [&_strong]:type-title [&_strong]:text-ink"><span><strong>{formatMetric(overview?.metrics?.views)}</strong><small>Views</small></span><span><strong>{formatMetric(overview?.metrics?.likes)}</strong><small>Likes</small></span><span><strong>{formatMetric(overview?.metrics?.comments)}</strong><small>Comments</small></span><span><strong>{formatMetric(overview?.metrics?.shares)}</strong><small>Shares</small></span></div><p className="unit-retention-unavailable mt-2.5 rounded-field bg-surface-sunken px-3 py-2.5 type-xs text-muted">Retention curve is not available from the current Core contract.</p></section>}

            <ProductionDetails snapshot={snapshot} />
          </aside>
        </div>

        <section className="unit-revisions min-w-0 rounded-b-panel bg-surface-sunken px-6 pb-4.5 pt-3.5 @max-project-viewer/unit-viewer:rounded-none" aria-label="Unit revisions">
          <label className={META_LABEL}>REVISIONS · {revisions.length}</label>
          <div className="flex gap-2 overflow-x-auto p-px" role="listbox" aria-label="Unit revisions list">
            {revisions.map((item, index) => <button className={`relative grid w-revision-card min-w-revision-card-min grid-cols-(--project-revision-columns) gap-2.5 rounded-cell py-2.5 pl-2.5 pr-3.25 text-left [corner-shape:squircle] ${item.id === revision?.id ? "is-viewing bg-desk-primary text-desk-primary-ink [&_em]:text-desk-primary-ink [&_p]:text-desk-primary-ink [&_small]:text-desk-primary-ink [&_strong]:text-desk-primary-ink [&_b]:bg-desk-primary-ink/18 [&_b]:text-desk-primary-ink [&_i]:text-desk-primary-ink" : "bg-surface text-muted hover:bg-surface-hover [&_b]:bg-ink/18 [&_b]:text-ink [&_i]:text-muted"}`} type="button" role="option" aria-selected={item.id === revision?.id} key={item.id} onClick={() => { void controller.inspectUnitRevision(item.id); }} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); const next = revisions[index + (event.key === "ArrowLeft" ? -1 : 1)]; if (next) void controller.inspectUnitRevision(next.id); } }}>
              <span className="unit-revision-thumb grid h-15.5 w-12 place-items-center overflow-hidden rounded-field bg-surface-sunken font-code type-sm text-muted [&_img]:size-full [&_img]:object-cover">{item.id === revision?.id && media[0] && !("text" in media[0].preview) && media[0].kind === "image" ? <img src={media[0].preview.url} alt="" /> : `R${item.revisionNo}`}</span>
              <span className="grid min-w-0 grid-cols-(--project-glyph-row-columns) content-start gap-x-2 gap-y-0.75"><strong className="font-code type-sm text-ink">R{item.revisionNo}</strong><small className="font-code type-mono-sm text-muted">{formatTime(item.createdAt)}</small><p className="col-span-full mt-0.5 truncate type-xs text-muted">{item.note ?? (item.sealedAt ? "Preview ready" : "Building preview")}</p><em className="col-span-full font-code type-mono-sm not-italic text-muted">{item.sealedAt ? "preview" : "building"}</em></span>
              <span className="unit-revision-badges absolute bottom-2 right-2.5 flex items-center gap-1.5">{item.id === unit?.selectedRevisionId && <b className="h-4 rounded-control px-1.5 font-code type-mono-xs leading-4 tracking-caps-tight">SELECTED</b>}{item.id === unit?.latestRevisionId && <i className="font-code type-mono-xs not-italic">LATEST</i>}{item.id === revision?.id && lifecycle?.label === "Ready" && <i className="is-final font-code type-mono-xs not-italic">✓ FINAL</i>}</span>
            </button>)}
          </div>
        </section>
      </Dialog.Content>
    </Dialog.Portal>}
  </Dialog.Root>;
}
