import { FileText, Film, Images, Layers3, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BuildDto, ProjectOverviewDto, UnitDto } from "../../../electron/ralphy/types";
import { entityDragProps } from "../../chat/attachments";
import { RalphyMascot } from "../../components/RalphyMascot";
import { SocialIcon } from "../../components/ui/SocialIcon";
import { bridge } from "../../lib/ipc";
import { InstrumentScreenRoot, type InstrumentScenarioState } from "../../instrument/screen-state-registry";
import { WINDOW, WINDOW_PLATE } from "../../components/ui/Window";
import { UnitStatus } from "./unit-status";
import { unitLifecycle, type UnitLifecycle } from "../../lib/unit-lifecycle";
import { preferredUnitPoster, resolveUnitMedia, unitPreviewKind, type UnitMedia } from "../../lib/unit-previews";
import type { DomainPage } from "../../state/project-domain";
import type { ProjectScreenController, ProjectScreenSnapshot } from "../../state/project-screen-controller";
import { AutoCursorTail } from "./AutoCursorTail";
import { useRememberedScroll } from "./scroll-memory";
import { UnitViewer } from "./UnitViewer";
import { unitsInstrumentStates } from "./unit-instrument-state";

export { unitsInstrumentStates } from "./unit-instrument-state";

type Filter = "all" | "in-progress" | "scheduled" | "published";
type CardSummary = { lifecycle: UnitLifecycle; media: UnitMedia | null; platforms: string[]; revisionNo: number };

const formatTime = (value: number) => new Date(value < 1_000_000_000_000 ? value * 1000 : value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const typeLabel = (format: string) => format.toLowerCase().includes("audio") ? "AUDIO" : ({ video: "VIDEO", carousel: "CAROUSEL", longform: "LONG-FORM", post: "POST", generic: format.toUpperCase() })[unitPreviewKind(format)];
const formatKey = (format: string) => { const value = format.trim().toLowerCase() || "unknown"; return value === "longform" ? "long-form" : value; };
const formatLabels: Record<string, string> = { "long-form": "Long-form", "fb-creative": "FB creative" };
const formatLabel = (format: string) => { const value = format.replace(/[-_]+/g, " "); return formatLabels[format] ?? value[0]?.toUpperCase() + value.slice(1).toLowerCase(); };
const formatOrder = ["video", "carousel", "long-form", "audio", "image", "post", "thread", "article", "fb-creative", "motion-design", "poster", "sticker-pack"];
const filterFor = (lifecycle: UnitLifecycle): Exclude<Filter, "all"> => lifecycle.label === "Published" ? "published" : lifecycle.label === "Scheduled" ? "scheduled" : "in-progress";

export function unitsInstrumentState(page: DomainPage, snapshot: ProjectScreenSnapshot, viewerOpen = false): InstrumentScenarioState {
  if (snapshot.unitConflict) return "conflict";
  if (viewerOpen) return "viewer";
  if (snapshot.unitId) return "selected";
  if (page.status === "loading" && page.items.length === 0) return "loading";
  if (page.status === "error" && page.items.length === 0) return "error";
  if (page.items.length === 0) return "empty";
  return page.status === "loading" || page.status === "error" ? "partial" : "ready";
}

/* A card is a window: the same panel rim and card the modals and the sidebar wear, with the
   titlebar below the picture instead of above it, because the picture is the subject and the
   identity reads as its caption. Ink is the theme family throughout -- the card is chrome now, not
   a black widget -- and only a plate standing *over* media keeps the on-dark pair. */
const FILTER_BUTTON = "inline-flex h-control-sm items-center gap-1.5 rounded-control px-2.5 type-sm whitespace-nowrap";
// The mascot art is near-white, so on the light desk it needs its own dark plate.
const UNITS_EMPTY = "units-empty grid min-h-full place-content-center justify-items-center p-12 text-center [&_.ralphy-mascot]:mb-3.5 [&_.ralphy-mascot]:block [&_.ralphy-mascot]:rounded-full [&_.ralphy-mascot]:bg-instrument [&_.ralphy-mascot]:p-2.25 [&_.ralphy-mascot]:[box-sizing:content-box]";

function FormatIcon({ format }: { format: string }) {
  const kind = unitPreviewKind(format);
  const Icon = kind === "video" || kind === "longform" ? Film : kind === "carousel" ? Images : kind === "post" ? FileText : Layers3;
  return <Icon size={26} aria-hidden="true" />;
}

function PlatformIcons({ platforms }: { platforms: string[] }) {
  return <span className="unit-card-platforms inline-flex min-w-6 items-center gap-1.25 text-muted [&_svg]:size-3" aria-label={platforms.length ? `Platforms: ${platforms.join(", ")}` : "No platforms yet"}>
    {[...new Set(platforms)].map((platform) => <SocialIcon platform={platform} key={platform} />)}
  </span>;
}

function CardMedia({ media, format }: { media: UnitMedia | null; format: string }) {
  if (!media) return <><FormatIcon format={format} /><span>Preview builds appear here</span></>;
  if ("text" in media.preview) return <p>{media.preview.text}</p>;
  if (media.role === "cover" || media.role === "vertical-cover") return <img src={media.preview.url} alt="" loading="lazy" />;
  if (media.kind === "image") return <img src={media.preview.url} alt="" loading="lazy" />;
  if (media.kind === "video") return <video src={media.preview.url} muted playsInline preload="auto" onMouseEnter={(event) => { void event.currentTarget.play().catch(() => undefined); }} onMouseLeave={(event) => { event.currentTarget.pause(); event.currentTarget.currentTime = 0; }} />;
  return <FormatIcon format={format} />;
}

function detailFor(lifecycle: UnitLifecycle, unit: UnitDto, publications: NonNullable<ProjectOverviewDto["publications"]>["items"]): string {
  const publication = publications.find((item) => item.unitId === unit.id && (item.state === "published" || item.state === "scheduled"));
  if (lifecycle.label === "Scheduled" && publication?.scheduledAt) return formatTime(publication.scheduledAt);
  if (lifecycle.label === "Published") return publication?.publishedAt ? formatTime(publication.publishedAt) : "live";
  if (lifecycle.label === "Render failed") return "final render";
  if (lifecycle.label === "Rendering") return "rendering final";
  if (lifecycle.label === "Preview ready") return "awaiting selection";
  if (lifecycle.label === "Selected") return "ready to render";
  if (lifecycle.label === "Ready") return "final ready";
  return "agent is working";
}

function UnitCard({ unit, baseLifecycle, publications, controller, disabled, onOpen }: {
  unit: UnitDto;
  baseLifecycle: UnitLifecycle;
  publications: NonNullable<ProjectOverviewDto["publications"]>["items"];
  controller: ProjectScreenController;
  disabled: boolean;
  onOpen(trigger: HTMLElement): void;
}) {
  const [summary, setSummary] = useState<CardSummary | null>(null);
  useEffect(() => {
    let current = true;
    if (!unit.latestRevisionId) return () => { current = false; };
    void Promise.all([
      bridge.loadProjectUnitRevision(controller.getSnapshot().domain.project, unit.id, unit.latestRevisionId),
      bridge.loadProjectUnitPage(controller.getSnapshot().domain.project, { kind: "items", revisionId: unit.latestRevisionId }),
      bridge.loadProjectUnitPage(controller.getSnapshot().domain.project, { kind: "presentations", revisionId: unit.latestRevisionId }),
    ]).then(async ([revision, items, presentations]) => {
      const media = await resolveUnitMedia(bridge, controller.getSnapshot().domain.project, items.items);
      let lifecycle = unitLifecycle({ unit, revision, publications });
      if (revision.compositionRevisionId) {
        const [productionRevision, builds] = await Promise.all([
          bridge.loadProjectCompositionRevision(controller.getSnapshot().domain.project, revision.compositionRevisionId),
          bridge.loadProjectCompositionPage(controller.getSnapshot().domain.project, { kind: "builds", revisionId: revision.compositionRevisionId }),
        ]);
        const buildItems = builds.items.filter((item): item is BuildDto => "state" in item && "compositionRevisionId" in item);
        lifecycle = unitLifecycle({ unit, revision, compositionRevision: productionRevision, builds: buildItems, publications });
      }
      if (current) setSummary({ lifecycle, media: preferredUnitPoster(media) ?? media.find((item) => item.kind === "video") ?? media[0] ?? null, platforms: presentations.items.map(({ platform }) => platform), revisionNo: revision.revisionNo });
    }).catch(() => undefined);
    return () => { current = false; };
  }, [controller, publications, unit]);

  const lifecycle = summary?.lifecycle ?? baseLifecycle;
  const retry = lifecycle.action === "retry";
  /* Draggable into the chat: a card states what it is once, and the composer's drop reads it. */
  return <article
    className={`unit-card-shell group relative min-w-0 text-ink ${WINDOW}`}
    {...entityDragProps({ kind: "unit", ref: unit.slug, label: unit.slug })}
  >
    <button className="unit-card flex w-full min-w-0 flex-col gap-0.5 overflow-hidden rounded-frame bg-transparent p-0 text-left text-ink [transition:background_var(--dur-fast)_var(--ease)] hover:bg-chip focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink motion-reduce:[transition:none]" type="button" disabled={disabled} aria-label={`Open ${unit.slug}`} onClick={(event) => onOpen(event.currentTarget)}>
      <span className={`unit-card-preview relative grid aspect-video w-full content-center place-items-center gap-1.75 text-muted ${WINDOW_PLATE} [&>em]:absolute [&>em]:left-2 [&>em]:top-2 [&>em]:h-4.5 [&>em]:rounded-control [&>em]:bg-media-plate [&>em]:px-1.75 [&>em]:font-code [&>em]:type-mono-sm [&>em]:leading-4.5 [&>em]:not-italic [&>em]:text-on-instrument [&>span]:font-code [&>span]:type-meta [&_img]:size-full [&_img]:object-cover [&_p]:m-0 [&_p]:line-clamp-5 [&_p]:px-4.5 [&_p]:font-code [&_p]:type-meta [&_p]:leading-row [&_p]:text-left [&_p]:text-on-instrument-muted [&_video]:size-full [&_video]:object-cover`}><CardMedia media={summary?.media ?? null} format={unit.format} /><em>{typeLabel(unit.format)}</em>{lifecycle.label === "Rendering" && <i className="unit-card-progress absolute inset-x-0 bottom-0 h-0.75 bg-ink/18"><span className="block h-full w-progress-render bg-ink" /></i>}</span>
      <span className="unit-card-copy grid w-full min-w-0 gap-2 px-2.5 pb-1.5 pt-2 [&_small]:truncate [&_small]:font-code [&_small]:type-meta [&_small]:text-muted">
        <strong className="block truncate type-base font-semibold leading-4 text-ink">{unit.slug}</strong>
        <span className={`unit-card-status flex min-h-5 min-w-0 items-center justify-start gap-2 [&_small]:min-w-0 ${retry ? "pr-14.5" : ""}`}><UnitStatus lifecycle={lifecycle} /><small>{detailFor(lifecycle, unit, publications)}</small></span>
        <span className="unit-card-footer flex min-w-0 items-center justify-between gap-2"><PlatformIcons platforms={summary?.platforms ?? []} /><small>{summary ? `R${summary.revisionNo}` : unit.latestRevisionId ? "Latest" : "Starting"} · {formatTime(unit.updatedAt)}</small></span>
      </span>
    </button>
    {retry && <button className="unit-card-retry absolute bottom-10.5 right-3 h-5 rounded-control bg-alert px-2.25 type-xs text-alert-ink hover:bg-alert-bright" type="button" disabled={disabled} onClick={() => { void controller.openUnit(unit.id).then(() => controller.buildInspectedCompositionRevision()); }}>Retry</button>}
  </article>;
}

export function UnitsPanel({ page, controller, snapshot, targetUnitId, scrollMemory, resetToken }: {
  page: DomainPage;
  controller: ProjectScreenController;
  snapshot: ProjectScreenSnapshot;
  targetUnitId?: string | null;
  scrollMemory: Map<string, number>;
  resetToken: string;
}) {
  const units = page.items as UnitDto[];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!targetUnitId) return;
    setViewerOpen(true);
    void controller.openUnit(targetUnitId);
  }, [controller, targetUnitId]);
  const rememberedScroll = useRememberedScroll(scrollMemory, "units-grid", resetToken);
  const publications = (snapshot.domain.overview.value as ProjectOverviewDto | null)?.publications?.items ?? [];
  const rows = useMemo(() => units.map((unit) => ({ unit, lifecycle: unitLifecycle({ unit, publications }) })), [publications, units]);
  const counts = useMemo(() => ({
    all: rows.length,
    "in-progress": rows.filter(({ lifecycle }) => filterFor(lifecycle) === "in-progress").length,
    scheduled: rows.filter(({ lifecycle }) => filterFor(lifecycle) === "scheduled").length,
    published: rows.filter(({ lifecycle }) => filterFor(lifecycle) === "published").length,
  }), [rows]);
  const typeFilters = useMemo(() => [...new Set([...formatOrder, ...units.map(({ format }) => formatKey(format))])].sort((a, b) => {
    const aIndex = formatOrder.indexOf(a); const bIndex = formatOrder.indexOf(b);
    return (aIndex < 0 ? formatOrder.length : aIndex) - (bIndex < 0 ? formatOrder.length : bIndex) || a.localeCompare(b);
  }), [units]);
  const visible = useMemo(() => rows.filter(({ unit, lifecycle }) => (filter === "all" || filterFor(lifecycle) === filter) && (typeFilter === "all" || formatKey(unit.format) === typeFilter) && unit.slug.toLowerCase().includes(query.trim().toLowerCase())), [filter, query, rows, typeFilter]);
  const attachScroll = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    rememberedScroll.ref(node);
    setScrollRoot((current) => current === node ? current : node);
  }, [rememberedScroll.ref]);

  const openUnit = (unitId: string, trigger: HTMLElement) => {
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    setReturnFocus(trigger);
    setViewerOpen(true);
    void controller.openUnit(unitId).finally(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollTop; });
  };

  return <InstrumentScreenRoot descriptor={unitsInstrumentStates} state={unitsInstrumentState(page, snapshot, viewerOpen)}><div className="units-workbench units-grid-workbench flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden type-base">
    <div className="units-toolbar m-0 flex w-full min-w-0 max-w-none flex-wrap items-center justify-between gap-2 rounded-cell bg-surface-sunken p-2">
      <div className="units-toolbar-filters flex min-w-0 shrink grow basis-155 flex-wrap items-start gap-2">
        <div className="units-filter inline-flex min-w-0 gap-0.5 rounded-control bg-surface-sunken p-0.5" role="group" aria-label="Unit status filter">
          {(["all", "in-progress", "scheduled", "published"] as Filter[]).map((value) => <button className={`${FILTER_BUTTON} ${filter === value ? "is-active bg-instrument text-on-instrument [&_span]:text-on-instrument-muted" : "bg-surface text-muted hover:text-ink [&_span]:text-muted"}`} type="button" aria-pressed={filter === value} key={value} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "in-progress" ? "In progress" : value[0].toUpperCase() + value.slice(1)} <span className="font-code type-meta">{counts[value]}</span></button>)}
        </div>
        <div className="units-type-filter inline-flex min-w-0 shrink grow basis-125 flex-wrap gap-0.5 rounded-control bg-surface-sunken p-0.5" role="group" aria-label="Unit type filter">
          {["all", ...typeFilters].map((value) => <button className={`${FILTER_BUTTON} ${typeFilter === value ? "is-active bg-instrument text-on-instrument" : "bg-surface text-muted hover:text-ink"}`} type="button" aria-pressed={typeFilter === value} key={value} onClick={() => setTypeFilter(value)}>{value === "all" ? "All" : formatLabel(value)}</button>)}
        </div>
      </div>
      <label className="units-search flex h-9 w-units-search flex-none items-center gap-2 rounded-control bg-surface px-3 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ink"><Search className="size-4 shrink-0 text-muted" aria-hidden="true" /><input className="min-w-0 flex-1 border-0 bg-transparent type-base text-ink outline-none placeholder:text-muted" aria-label="Search units" placeholder="Search units" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    </div>
    <div className="units-grid-scroll h-full min-h-0 flex-1 overflow-auto overscroll-contain" role="region" aria-label="Units" ref={attachScroll} onScroll={rememberedScroll.onScroll}>
      {units.length === 0 ? <div className={UNITS_EMPTY}><RalphyMascot size={46} /><strong className="type-lg font-normal text-ink">No units yet</strong><p className="mt-1.75 max-w-85 type-ui leading-row text-muted">Units appear here as soon as an agent starts working, long before the final render is ready.</p></div> : visible.length === 0 ? <div className={`${UNITS_EMPTY} is-filtered min-h-units-empty`}><strong className="type-lg font-normal text-ink">No matching units</strong><p className="mt-1.75 max-w-85 type-ui leading-row text-muted">Try another status, type, or search phrase.</p></div> : <div className="units-grid grid grid-cols-(--project-units-columns) gap-2 px-0.5 pb-5.5 pt-0.5">
        {visible.map(({ unit, lifecycle }) => <UnitCard key={unit.id} unit={unit} baseLifecycle={lifecycle} publications={publications} controller={controller} disabled={snapshot.unitMutation !== "idle" || snapshot.compositionMutation !== "idle"} onOpen={(trigger) => openUnit(unit.id, trigger)} />)}
      </div>}
      <AutoCursorTail root={scrollRoot} hasMore={page.nextCursor !== null} loading={page.status === "loading" && units.length > 0} error={page.status === "error" && units.length > 0 ? page.error : null} onLoadMore={() => { void controller.loadMore("units"); }} onRetry={() => { void controller.retryPage("units"); }} />
    </div>
    <UnitViewer open={viewerOpen} onOpenChange={setViewerOpen} controller={controller} snapshot={snapshot} returnFocus={returnFocus} />
  </div></InstrumentScreenRoot>;
}
