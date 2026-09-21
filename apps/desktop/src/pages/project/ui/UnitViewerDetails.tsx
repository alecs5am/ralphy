import type { ProjectOverviewDto } from "../../../../electron/ralphy/types";
import { sortBuilds, sortPositioned } from "@/entities/composition";
import { unitPreviewKind, type SocialTarget, type UnitLifecycle } from "@/entities/unit";
import { bridge } from "@/shared/api/ipc";
import { IconButton } from "@/shared/ui/IconButton";
import { Check, ChevronRight, Copy, ExternalLink } from "@/shared/ui/icons";
import { SocialIcon } from "@/shared/ui/SocialIcon";
import type { ProjectScreenSnapshot } from "../model/screen-controller";

const formatTime = (value: number) => new Date(value < 1_000_000_000_000 ? value * 1000 : value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const formatDuration = (value: number) => `${Math.floor((Number.isFinite(value) ? value : 0) / 60)}:${Math.floor((Number.isFinite(value) ? value : 0) % 60).toString().padStart(2, "0")}`;
const formatMetric = (value: number | null | undefined) => value == null ? "Unavailable" : Intl.NumberFormat(undefined, { notation: value > 9999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
const SECTION = "grid min-w-0 gap-2";
const HEADING = "m-0 type-sm font-medium text-ink";
const FACTS = "m-0 grid gap-2 [&>div]:flex [&>div]:min-w-0 [&>div]:items-baseline [&>div]:justify-between [&>div]:gap-3 [&_dt]:shrink-0 [&_dt]:text-muted [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:break-words [&_dd]:text-right [&_dd]:text-ink";

function ProductionDetails({ snapshot }: { snapshot: ProjectScreenSnapshot }) {
  const composition = snapshot.composition.value;
  const revision = snapshot.inspectedCompositionRevision.value;
  if (!composition && snapshot.composition.status === "idle") return null;
  const builds = sortBuilds(snapshot.compositionBuilds.items);
  return <details className="unit-viewer-production min-w-0 type-sm text-muted open:[&_summary_svg]:rotate-90">
    <summary className="flex min-h-8 cursor-pointer items-center gap-1.5 text-ink [&::-webkit-details-marker]:hidden">
      <ChevronRight className="size-3.5 shrink-0 transition-transform duration-fast motion-reduce:transition-none" aria-hidden="true" />
      Production details
    </summary>
    {snapshot.composition.status === "loading" && <p role="status">Loading production details…</p>}
    {snapshot.composition.status === "error" && <p role="alert">{snapshot.composition.error}</p>}
    {composition && revision && <div className="unit-production-content grid min-w-0 gap-3 pt-2">
      <dl className={FACTS}>
        <div><dt>Engine</dt><dd>{revision.engine}{revision.engineVersion ? ` ${revision.engineVersion}` : ""}</dd></div>
        <div><dt>Composition</dt><dd>{composition.slug} · R{revision.revisionNo}</dd></div>
        <div><dt>Assets</dt><dd>{snapshot.compositionInputs.items.length} linked</dd></div>
        <div><dt>Builds</dt><dd>{builds.length}</dd></div>
        {builds[0] && <div><dt>Latest build</dt><dd>{formatTime(builds[0].createdAt)}</dd></div>}
        <div><dt>Successful builds</dt><dd>{builds.filter(({ state }) => state === "succeeded").length}</dd></div>
        {snapshot.compositionSources.items.length > 0 && <div><dt>Sources</dt><dd>{sortPositioned(snapshot.compositionSources.items).length}</dd></div>}
        {snapshot.compositionBuildOutputs.items.length > 0 && <div><dt>Rendered outputs</dt><dd>{sortPositioned(snapshot.compositionBuildOutputs.items).length}</dd></div>}
      </dl>
      <div className="grid gap-1 break-all font-code type-xs text-muted">
        <span>Unit: {snapshot.unit.value?.id}</span>
        <span>Composition: {composition.id}</span>
        <span>Revision: {revision.id}</span>
      </div>
    </div>}
  </details>;
}

export function UnitViewerDetails({
  snapshot, lifecycle, revisionNo, targets, targetId, onTargetChange, caption, duration, mediaCount, showOriginal,
}: {
  snapshot: ProjectScreenSnapshot;
  lifecycle: UnitLifecycle | null;
  revisionNo: number;
  targets: SocialTarget[];
  targetId: string | undefined;
  onTargetChange(id: string): void;
  caption: string;
  duration: number;
  mediaCount: number;
  showOriginal: boolean;
}) {
  const unit = snapshot.unit.value;
  const revision = snapshot.inspectedUnitRevision.value;
  const target = targets.find(({ id }) => id === targetId) ?? targets[0];
  const kind = unitPreviewKind(unit?.format ?? "");
  const overview = snapshot.domain.overview.value as ProjectOverviewDto | null;
  const publication = unit && target ? overview?.publications?.items.find((item) => item.unitId === unit.id && item.platform === target.platform) : null;
  const selected = revision?.id === unit?.selectedRevisionId;
  const latest = revision?.id === unit?.latestRevisionId;

  return <div className="unit-viewer-details grid min-w-0 content-start gap-5 type-sm text-ink">
    {showOriginal ? <section className={`${SECTION} unit-source-details`} aria-label="Original source">
      <h3 className={HEADING}>Original · R0</h3>
      <p className="m-0 break-words text-ink">{unit?.sourceLabel ?? "Source creative"}</p>
      <dl className={FACTS}><div><dt>Format</dt><dd>{unit?.format}</dd></div></dl>
      {unit?.sourceRevisionId && <code className="break-all font-code type-xs text-muted">{unit.sourceRevisionId}</code>}
    </section> : <>
      {revision && <section className={`${SECTION} unit-current-version`} aria-label="Version details">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={HEADING}>Version {revisionNo}</h3>
          {selected && <span className="inline-flex items-center gap-1 text-muted"><Check className="size-3.5" aria-hidden="true" />Selected</span>}
        </div>
        <dl className={FACTS}>
          <div><dt>Format</dt><dd>{unit?.format}</dd></div>
          {lifecycle && <div><dt>Status</dt><dd>{lifecycle.label}</dd></div>}
          <div><dt>Preview</dt><dd>{revision.sealedAt ? "Ready" : "Building"}{latest ? " · latest" : ""}</dd></div>
          <div><dt>Created</dt><dd>{formatTime(revision.createdAt)}</dd></div>
          <div><dt>Author</dt><dd>{revision.authoredBySessionId ? "Agent" : "Ralphy"}</dd></div>
        </dl>
        {revision.note && <p className="m-0 whitespace-pre-wrap break-words leading-row text-muted">{revision.note}</p>}
      </section>}

      {targets.length > 0 && <section className={`${SECTION} unit-platforms`} aria-label="Platform previews">
        <h3 className={HEADING}>Platforms</h3>
        <div className="grid gap-1" role="group" aria-label="Preview platform">
          {targets.map((item) => {
            const ready = snapshot.unitPresentations.items.some(({ platform }) => platform === item.platform);
            return <button type="button" key={item.id} aria-pressed={item.id === target?.id} onClick={() => onTargetChange(item.id)} className={`flex min-h-10 min-w-0 items-center gap-2 rounded-control px-2 py-1.5 text-left ${item.id === target?.id ? "bg-surface text-ink" : "text-muted hover:bg-surface-hover hover:text-ink"}`}>
              <SocialIcon platform={item.platform} className="size-4 shrink-0" />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate">{item.label}</span>
                <span className="type-xs text-muted">{item.variant === "carousel" ? `${mediaCount} slides` : kind === "longform" ? "16:9" : kind === "post" ? "Text / image post" : duration > 0 ? formatDuration(duration) : "Preview"}</span>
              </span>
              <span className="shrink-0 type-xs text-muted">{ready ? "Ready" : "Preparing"}</span>
            </button>;
          })}
        </div>
      </section>}

      <section className={`${SECTION} unit-caption`} aria-label="Caption">
        <div className="flex items-center justify-between gap-2">
          <h3 className={HEADING}>{kind === "longform" ? "Title & description" : "Caption"}</h3>
          {caption && <IconButton className="size-7 rounded-control text-muted hover:bg-surface hover:text-ink [&_svg]:size-3.5" label="Copy caption" onClick={() => { void bridge.copyText(caption); }}><Copy /></IconButton>}
        </div>
        <p className="m-0 whitespace-pre-wrap break-words leading-row text-muted">{caption || "No caption"}</p>
        {caption && <small className="type-xs text-muted">{caption.length} characters{target ? ` · ${target.label}` : ""}</small>}
      </section>

      {publication && <section className={`${SECTION} unit-publication`} aria-label="Publication details">
        <h3 className={HEADING}>Publication · {target?.label}</h3>
        <dl className={FACTS}>
          <div><dt>Status</dt><dd>{publication.state.replaceAll("_", " ")}</dd></div>
          {publication.scheduledAt && <div><dt>Scheduled</dt><dd>{formatTime(publication.scheduledAt)}</dd></div>}
          {publication.publishedAt && <div><dt>Published</dt><dd>{formatTime(publication.publishedAt)}</dd></div>}
        </dl>
        {publication.url && <button type="button" className="inline-flex min-h-8 items-center justify-start gap-1.5 text-ink hover:underline" onClick={() => { void bridge.openExternal(publication.url!); }}><ExternalLink className="size-3.5" aria-hidden="true" />View post</button>}
      </section>}

      {lifecycle?.label === "Published" && <section className={`${SECTION} unit-performance`} aria-label="Project metrics">
        <h3 className={HEADING}>Project metrics</h3>
        <dl className={FACTS}>
          <div><dt>Views</dt><dd>{formatMetric(overview?.metrics?.views)}</dd></div>
          <div><dt>Likes</dt><dd>{formatMetric(overview?.metrics?.likes)}</dd></div>
          <div><dt>Comments</dt><dd>{formatMetric(overview?.metrics?.comments)}</dd></div>
          <div><dt>Shares</dt><dd>{formatMetric(overview?.metrics?.shares)}</dd></div>
        </dl>
      </section>}

      <ProductionDetails snapshot={snapshot} />
    </>}
  </div>;
}
