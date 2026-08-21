import { FileText, Film, Images, Layers3, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BuildDto, ProjectOverviewDto, UnitDto } from "../../../electron/ralphy/types";
import { RalphyMascot } from "../../components/RalphyMascot";
import { SocialIcon } from "../../components/ui/SocialIcon";
import { bridge } from "../../lib/ipc";
import { defineInstrumentScreenStates, InstrumentScreenRoot, type InstrumentScenarioState } from "../../instrument/screen-state-registry";
import { unitLifecycle, type UnitLifecycle } from "../../lib/unit-lifecycle";
import { preferredUnitPoster, resolveUnitMedia, unitPreviewKind, type UnitMedia } from "../../lib/unit-previews";
import type { DomainPage } from "../../state/project-domain";
import type { ProjectScreenController, ProjectScreenSnapshot } from "../../state/project-screen-controller";
import { AutoCursorTail } from "./AutoCursorTail";
import { useRememberedScroll } from "./scroll-memory";
import { UnitViewer } from "./UnitViewer";

type Filter = "all" | "in-progress" | "scheduled" | "published";
type CardSummary = { lifecycle: UnitLifecycle; media: UnitMedia | null; platforms: string[]; revisionNo: number };

const formatTime = (value: number) => new Date(value < 1_000_000_000_000 ? value * 1000 : value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const typeLabel = (format: string) => format.toLowerCase().includes("audio") ? "AUDIO" : ({ video: "VIDEO", carousel: "CAROUSEL", longform: "LONG-FORM", post: "POST", generic: format.toUpperCase() })[unitPreviewKind(format)];
const formatKey = (format: string) => { const value = format.trim().toLowerCase() || "unknown"; return value === "longform" ? "long-form" : value; };
const formatLabels: Record<string, string> = { "long-form": "Long-form", "fb-creative": "FB creative" };
const formatLabel = (format: string) => { const value = format.replace(/[-_]+/g, " "); return formatLabels[format] ?? value[0]?.toUpperCase() + value.slice(1).toLowerCase(); };
const formatOrder = ["video", "carousel", "long-form", "audio", "image", "post", "thread", "article", "fb-creative", "motion-design", "poster", "sticker-pack"];
const filterFor = (lifecycle: UnitLifecycle): Exclude<Filter, "all"> => lifecycle.label === "Published" ? "published" : lifecycle.label === "Scheduled" ? "scheduled" : "in-progress";

export const unitsInstrumentStates = defineInstrumentScreenStates({
  routeKey: "project.units",
  states: ["loading", "ready", "empty", "partial", "error", "selected", "viewer", "conflict"],
  rootMarker: "project-units",
  landmarks: ["Units", "Unit status filter"],
} as const);

export function unitsInstrumentState(page: DomainPage, snapshot: ProjectScreenSnapshot, viewerOpen = false): InstrumentScenarioState {
  if (snapshot.unitConflict) return "conflict";
  if (viewerOpen) return "viewer";
  if (snapshot.unitId) return "selected";
  if (page.status === "loading" && page.items.length === 0) return "loading";
  if (page.status === "error" && page.items.length === 0) return "error";
  if (page.items.length === 0) return "empty";
  return page.status === "loading" || page.status === "error" ? "partial" : "ready";
}

function Status({ lifecycle }: { lifecycle: UnitLifecycle }) {
  return <span className={`unit-status status-${lifecycle.tone}`}><span aria-hidden="true" />{lifecycle.label}</span>;
}

function FormatIcon({ format }: { format: string }) {
  const kind = unitPreviewKind(format);
  const Icon = kind === "video" || kind === "longform" ? Film : kind === "carousel" ? Images : kind === "post" ? FileText : Layers3;
  return <Icon size={26} aria-hidden="true" />;
}

function PlatformIcons({ platforms }: { platforms: string[] }) {
  return <span className="unit-card-platforms" aria-label={platforms.length ? `Platforms: ${platforms.join(", ")}` : "No platforms yet"}>
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
  return <article className="unit-card-shell">
    <button className="unit-card" type="button" disabled={disabled} aria-label={`Open ${unit.slug}`} onClick={(event) => onOpen(event.currentTarget)}>
      <span className="unit-card-preview"><CardMedia media={summary?.media ?? null} format={unit.format} /><em>{typeLabel(unit.format)}</em>{lifecycle.label === "Rendering" && <i className="unit-card-progress"><span /></i>}</span>
      <span className="unit-card-copy">
        <strong>{unit.slug}</strong>
        <span className="unit-card-status"><Status lifecycle={lifecycle} /><small>{detailFor(lifecycle, unit, publications)}</small></span>
        <span className="unit-card-footer"><PlatformIcons platforms={summary?.platforms ?? []} /><small>{summary ? `R${summary.revisionNo}` : unit.latestRevisionId ? "Latest" : "Starting"} · {formatTime(unit.updatedAt)}</small></span>
      </span>
    </button>
    {retry && <button className="unit-card-retry" type="button" disabled={disabled} onClick={() => { void controller.openUnit(unit.id).then(() => controller.buildInspectedCompositionRevision()); }}>Retry</button>}
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

  return <InstrumentScreenRoot descriptor={unitsInstrumentStates} state={unitsInstrumentState(page, snapshot, viewerOpen)}><div className="units-workbench units-grid-workbench">
    <div className="units-toolbar">
      <div className="units-toolbar-filters">
        <div className="units-filter" role="group" aria-label="Unit status filter">
          {(["all", "in-progress", "scheduled", "published"] as Filter[]).map((value) => <button className={filter === value ? "is-active" : ""} type="button" aria-pressed={filter === value} key={value} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "in-progress" ? "In progress" : value[0].toUpperCase() + value.slice(1)} <span>{counts[value]}</span></button>)}
        </div>
        <div className="units-type-filter" role="group" aria-label="Unit type filter">
          {["all", ...typeFilters].map((value) => <button className={typeFilter === value ? "is-active" : ""} type="button" aria-pressed={typeFilter === value} key={value} onClick={() => setTypeFilter(value)}>{value === "all" ? "All" : formatLabel(value)}</button>)}
        </div>
      </div>
      <label className="units-search"><Search aria-hidden="true" /><input aria-label="Search units" placeholder="Search units" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    </div>
    <div className="units-grid-scroll" role="region" aria-label="Units" ref={attachScroll} onScroll={rememberedScroll.onScroll}>
      {units.length === 0 ? <div className="units-empty"><RalphyMascot size={46} /><strong>No units yet</strong><p>Units appear here as soon as an agent starts working, long before the final render is ready.</p></div> : visible.length === 0 ? <div className="units-empty is-filtered"><strong>No matching units</strong><p>Try another status, type, or search phrase.</p></div> : <div className="units-grid">
        {visible.map(({ unit, lifecycle }) => <UnitCard key={unit.id} unit={unit} baseLifecycle={lifecycle} publications={publications} controller={controller} disabled={snapshot.unitMutation !== "idle" || snapshot.compositionMutation !== "idle"} onOpen={(trigger) => openUnit(unit.id, trigger)} />)}
      </div>}
      <AutoCursorTail root={scrollRoot} hasMore={page.nextCursor !== null} loading={page.status === "loading" && units.length > 0} error={page.status === "error" && units.length > 0 ? page.error : null} onLoadMore={() => { void controller.loadMore("units"); }} onRetry={() => { void controller.retryPage("units"); }} />
    </div>
    <UnitViewer open={viewerOpen} onOpenChange={setViewerOpen} controller={controller} snapshot={snapshot} returnFocus={returnFocus} />
  </div></InstrumentScreenRoot>;
}
