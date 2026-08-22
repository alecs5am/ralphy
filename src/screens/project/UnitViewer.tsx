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

function Status({ lifecycle }: { lifecycle: UnitLifecycle }) {
  return <span className={`unit-status status-${lifecycle.tone}`}><span aria-hidden="true" />{lifecycle.label}</span>;
}

function LifecycleStepper({ lifecycle }: { lifecycle: UnitLifecycle }) {
  const current = lifecycle.label === "Published" ? 2 : lifecycle.label === "Scheduled" ? 1 : 0;
  return <ol className="unit-lifecycle" aria-label="Unit lifecycle">
    {["In progress", "Scheduled", "Published"].map((label, index) => <li className={index < current ? "is-done" : index === current ? "is-current" : ""} key={label}>
      <span>{index < current ? <Check aria-hidden="true" /> : null}</span><small>{label}</small>
    </li>)}
  </ol>;
}

function ProductionDetails({ snapshot }: { snapshot: ProjectScreenSnapshot }) {
  const composition = snapshot.composition.value;
  const revision = snapshot.inspectedCompositionRevision.value;
  if (!composition && snapshot.composition.status === "idle") return null;
  const builds = sortBuilds(snapshot.compositionBuilds.items);
  return <details className="unit-viewer-production">
    <summary><ChevronRight aria-hidden="true" /><span>Production details</span><small>{revision ? `${revision.engine} · ${composition?.slug ?? composition?.id}` : "Loading"}</small></summary>
    {snapshot.composition.status === "loading" && <p>Loading production details…</p>}
    {snapshot.composition.status === "error" && <p role="alert">{snapshot.composition.error}</p>}
    {composition && revision && <div className="unit-production-content">
      <dl>
        <div><dt>ENGINE</dt><dd>{revision.engine}{revision.engineVersion ? ` ${revision.engineVersion}` : ""}</dd></div>
        <div><dt>COMPOSITION</dt><dd>{composition.slug} · R{revision.revisionNo}</dd></div>
        <div><dt>ASSETS</dt><dd>{snapshot.compositionInputs.items.length} linked</dd></div>
        <div><dt>PREVIEW BUILDS</dt><dd>{builds.length} · {builds[0] ? formatTime(builds[0].createdAt) : "none"}</dd></div>
        <div><dt>FINAL BUILDS</dt><dd>{builds.filter(({ state }) => state === "succeeded").length}</dd></div>
      </dl>
      {snapshot.compositionSources.items.length > 0 && <p>{sortPositioned(snapshot.compositionSources.items).length} production sources</p>}
      {snapshot.compositionBuildOutputs.items.length > 0 && <p>{sortPositioned(snapshot.compositionBuildOutputs.items).length} rendered outputs</p>}
      <code>{snapshot.unit.value?.id} · {composition.id} · {revision.id}</code>
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
      <Dialog.Overlay forceMount className="unit-viewer-overlay" data-instrument-overlay-backdrop="" />
      <Dialog.Content forceMount className="unit-viewer rounded-panel bg-surface text-ink [&_.unit-meta-section]:bg-surface-sunken" data-instrument-overlay="unit-viewer" ref={surface} onOpenAutoFocus={(event) => { event.preventDefault(); surface.current?.focus({ preventScroll: true }); }} onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus?.focus({ preventScroll: true }); }} tabIndex={-1}>
        <header className="unit-viewer-header bg-surface-sunken">
          <div className="unit-viewer-heading">
            <Dialog.Title>{unit?.slug ?? "Unit"}</Dialog.Title>
            <Dialog.Description>{unit?.format ?? "Loading Unit"}</Dialog.Description>
            {targets.map(({ id, label, platform }) => <span className="unit-platform-chip" key={id}><SocialIcon platform={platform} />{label}</span>)}
            {lifecycle && <span className="unit-viewer-state"><Status lifecycle={lifecycle} /><small>{revision ? `R${revision.revisionNo} · ${formatTime(revision.createdAt)}` : "Loading revision"}</small></span>}
          </div>
          <div className="unit-viewer-actions">
            {revision && lifecycle && primaryLabel ? <button className="unit-primary-action" type="button" disabled={pending || revision.sealedAt === null || (lifecycle.action !== "select" && lifecycle.action !== "none" && !productionRevision)} onClick={runPrimaryAction}>{lifecycle.action === "select" ? <Check /> : lifecycle.action === "retry" ? <Clock3 /> : lifecycle.label === "Published" ? <ExternalLink /> : <Play />}{snapshot.unitMutation === "select" ? "Choosing…" : snapshot.compositionMutation === "build" ? "Rendering…" : primaryLabel}</button> : null}
            <Dialog.Close asChild><button className="unit-viewer-close" type="button" aria-label="Close Unit preview"><X /></button></Dialog.Close>
          </div>
        </header>

        <div className="unit-viewer-main">
          <section className="unit-stage-column">
            <div className="unit-stage-toolbar">
              {target ? <GooeyTabs tabs={targets.map((item) => ({ value: item.id, label: <SocialIcon platform={item.platform} />, ariaLabel: item.label, tooltip: item.label }))} value={target.id} onValueChange={setTargetId} size="s" ariaLabel="Social platform" /> : null}
              <div className="unit-preview-mode" role="group" aria-label="Preview mode"><button className={previewMode === "post" ? "is-active bg-instrument text-on-instrument" : "bg-transparent text-muted"} type="button" onClick={() => setPreviewMode("post")}>Post</button><button className={previewMode === "clean" ? "is-active bg-instrument text-on-instrument" : "bg-transparent text-muted"} type="button" onClick={() => setPreviewMode("clean")}>Clean</button></div>
              {kind === "video" && <button className={`unit-guides-toggle${guides ? " is-active" : ""}`} type="button" aria-label="Safe-area guides" aria-pressed={guides} onClick={() => setGuides((value) => !value)}><Frame /></button>}
            </div>
            <div className={`unit-social-stage is-${kind}`} ref={stage}>
              {target && unit ? mobile ? <IPhoneMockup><UnitSocialPreview target={target} media={previewMedia} slug={unit.slug} caption={caption} previewMode={previewMode} guides={guides} /></IPhoneMockup> : <UnitSocialPreview target={target} media={previewMedia} slug={unit.slug} caption={caption} previewMode={previewMode} guides={guides} /> : <div className="preview-empty">Loading preview…</div>}
            </div>
            {(kind === "video" || kind === "longform") && <div className={`unit-playback${mobile ? " is-mobile" : ""}`}>
              <button type="button" aria-label={playing ? "Pause preview" : "Play preview"} onClick={() => { const element = activeMedia(); if (!element) return; if (element.paused) void element.play().catch(() => setPlaying(false)); else element.pause(); }}>{playing ? <Pause /> : <Play />}</button>
              <span>{formatDuration(currentTime)}</span>
              <SnappySlider className="unit-playback-seek" value={currentTime} min={0} max={Math.max(duration, .1)} step={.1} ariaLabel="Position in preview" onValueChange={(next) => { const element = activeMedia(); if (element) element.currentTime = next; setCurrentTime(next); }} />
              <span>{formatDuration(duration)}</span>
              <button type="button" aria-label={muted ? "Unmute preview" : "Mute preview"} onClick={() => { const element = activeMedia(); if (!element) return; element.muted = !element.muted; setMuted(element.muted); }}>{muted ? <VolumeX /> : <Volume2 />}</button>
            </div>}
          </section>

          <aside className="unit-viewer-meta">
            {lifecycle && <><LifecycleStepper lifecycle={lifecycle} /><p className="unit-lifecycle-note">{lifecycle.label === "Published" ? "Published across connected platforms" : lifecycle.label === "Scheduled" ? "Final is ready and publication is scheduled" : lifecycle.label === "Render failed" ? "The last final render failed — retry is available" : "Preview changes do not change the selected version"}</p></>}

            {runningAgent && lifecycle?.label === "In progress" && <section className="unit-agent-block"><span className="unit-spinner" aria-hidden="true" /><strong>Agent is assembling the unit</strong><small>{runningAgent.startedAt ? formatTime(runningAgent.startedAt) : "queued"}</small><i><span /></i><p>Preview updates as new builds land.</p></section>}

            {revision && <section className="unit-meta-section unit-current-version"><label>CURRENT VERSION</label><div><strong>R{revision.revisionNo}</strong><span>{revision.sealedAt ? "Preview ready" : "Building preview"}{revision.id === unit?.latestRevisionId ? " · latest" : ""}</span></div><small>{revision.authoredBySessionId ? "Agent" : "Ralphy"} · {formatTime(revision.createdAt)}</small><p>{revision.note ?? "Creative revision preview"}</p>{revision.id === unit?.selectedRevisionId ? <span className="unit-selected-version"><Check /> Selected version</span> : lifecycle?.action === "select" ? <button type="button" disabled={pending || revision.sealedAt === null} onClick={() => { void controller.selectInspectedUnitRevision(); }}><Check /> Choose this version</button> : null}</section>}

            {targets.length > 1 && <section className="unit-meta-section unit-platforms"><label>PLATFORMS</label>{targets.map((item) => <button className={item.id === target?.id ? "is-active bg-instrument text-on-instrument [&_small]:text-on-instrument-muted" : "bg-surface-sunken text-ink"} type="button" key={item.id} onClick={() => setTargetId(item.id)}><span className="unit-platform-label"><SocialIcon platform={item.platform} />{item.label}</span><small>{item.variant === "carousel" ? `${media.length} slides` : kind === "longform" ? "16:9" : "9:16 · 00:24"}</small><em>{snapshot.unitPresentations.items.some(({ platform }) => platform === item.platform) ? <><Check /> READY</> : <><Clock3 /> PREPARING</>}</em></button>)}</section>}

            <section className="unit-meta-section unit-caption"><label>{kind === "longform" ? "TITLE & DESCRIPTION" : `CAPTION · ${target?.label ?? "PREVIEW"}`}</label><div><p>{caption}</p><span>{caption.length} / 2200<button type="button" aria-label="Copy caption" onClick={() => { void bridge.copyText(caption); }}><Copy /></button></span></div></section>

            {lifecycle?.label === "Scheduled" && publication?.scheduledAt && <section className="unit-meta-section unit-schedule"><label>SCHEDULE</label><div><Clock3 /><span><strong>{formatTime(publication.scheduledAt)}</strong><small>{target?.label} · scheduled</small></span></div></section>}

            {lifecycle?.label === "Published" && <section className="unit-meta-section unit-performance"><label>PERFORMANCE · {target?.label?.toUpperCase()}</label><div className="unit-metrics"><span><strong>{formatMetric(overview?.metrics?.views)}</strong><small>Views</small></span><span><strong>{formatMetric(overview?.metrics?.likes)}</strong><small>Likes</small></span><span><strong>{formatMetric(overview?.metrics?.comments)}</strong><small>Comments</small></span><span><strong>{formatMetric(overview?.metrics?.shares)}</strong><small>Shares</small></span></div><p className="unit-retention-unavailable">Retention curve is not available from the current Core contract.</p></section>}

            <ProductionDetails snapshot={snapshot} />
          </aside>
        </div>

        <section className="unit-revisions" aria-label="Unit revisions">
          <label>REVISIONS · {revisions.length}</label>
          <div role="listbox" aria-label="Unit revisions list">
            {revisions.map((item, index) => <button className={item.id === revision?.id ? "is-viewing" : ""} type="button" role="option" aria-selected={item.id === revision?.id} key={item.id} onClick={() => { void controller.inspectUnitRevision(item.id); }} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); const next = revisions[index + (event.key === "ArrowLeft" ? -1 : 1)]; if (next) void controller.inspectUnitRevision(next.id); } }}>
              <span className="unit-revision-thumb">{item.id === revision?.id && media[0] && !("text" in media[0].preview) && media[0].kind === "image" ? <img src={media[0].preview.url} alt="" /> : `R${item.revisionNo}`}</span>
              <span><strong>R{item.revisionNo}</strong><small>{formatTime(item.createdAt)}</small><p>{item.note ?? (item.sealedAt ? "Preview ready" : "Building preview")}</p><em>{item.sealedAt ? "preview" : "building"}</em></span>
              <span className="unit-revision-badges">{item.id === unit?.selectedRevisionId && <b>SELECTED</b>}{item.id === unit?.latestRevisionId && <i>LATEST</i>}{item.id === revision?.id && lifecycle?.label === "Ready" && <i className="is-final">✓ FINAL</i>}</span>
            </button>)}
          </div>
        </section>
      </Dialog.Content>
    </Dialog.Portal>}
  </Dialog.Root>;
}
