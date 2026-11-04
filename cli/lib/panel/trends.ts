import { listNiches, loadNicheMembers } from "../store/trend-niches.js";
import { trendVideoLabels } from "../store/trends.js";

/** One corpus video as every panel list renders it. */
export type PanelVideo = {
  id: string | null;
  url: string;
  title: string | null;
  thumb: string | null;
  creator: string | null;
  followers: number | null;
  platform: string | null;
  views: number | null;
  multiplier: number | null;
  label: string | null;
  verdict: string | null;
  ageDays: number | null;
  postedAt: string | null;
  lang: string | null;
  format: string | null;
  subNiche: string | null;
  signal: string | null;
  reasons: string[];
  note: string | null;
};

export type PanelNiche = { slug: string; topic: string; kept: number; subNiches: number; updatedAt: string | null };

type Json = Record<string, any>;

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

/** A YouTube thumbnail derived from the video URL; other platforms have no stable public thumbnail URL. */
export function thumbnailFor(url: string): string | null {
  const match = /youtube\.com\/(?:shorts\/|watch\?v=)([\w-]{6,})|youtu\.be\/([\w-]{6,})/.exec(url);
  const id = match?.[1] ?? match?.[2];
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

/** Scorecard reasons without the rule codes and the bookkeeping notes ("A1 strong lift: …" → "strong lift: …"). */
export function readableReasons(reasons: unknown, limit = 3): string[] {
  if (!Array.isArray(reasons)) return [];
  return reasons
    .filter((reason): reason is string => typeof reason === "string" && !reason.startsWith("note:"))
    .map((reason) => reason.replace(/^[A-Z]\d+\s+/, ""))
    .slice(0, limit);
}

function video(url: string, fields: Partial<PanelVideo>): PanelVideo {
  return {
    id: null, url, title: null, thumb: thumbnailFor(url), creator: null, followers: null, platform: null, views: null,
    multiplier: null, label: null, verdict: null, ageDays: null, postedAt: null, lang: null, format: null,
    subNiche: null, signal: null, reasons: [], note: null, ...fields,
  };
}

/** Rows of `trends top`. */
export function topVideos(report: Json): PanelVideo[] {
  return (Array.isArray(report.videos) ? report.videos : []).map((row: Json) => video(String(row.url), {
    id: str(row.id), title: str(row.title), creator: str(row.creator), followers: num(row.followers),
    platform: str(row.platform), views: num(row.views), multiplier: num(row.multiplier), label: str(row.label),
    ageDays: num(row.ageDays), postedAt: str(row.postedAt), lang: str(row.cohort?.language),
    format: str(row.cohort?.format),
  }));
}

/** The "what to copy" list of `trends niche report`. */
export function pickVideos(report: Json): PanelVideo[] {
  const items = Array.isArray(report.whatToCopy?.items) ? report.whatToCopy.items : [];
  return items.map((row: Json) => video(String(row.url), {
    creator: str(row.creator), followers: num(row.followers), platform: str(row.platform), views: num(row.views),
    multiplier: num(row.multiplier), label: str(row.label), verdict: str(row.verdict), ageDays: num(row.ageDays),
    postedAt: str(row.postedAt), format: str(row.format), subNiche: str(row.subNiche),
    reasons: readableReasons(row.scorecard?.reasons),
  }));
}

const SIGNAL_GROUPS = [
  { type: "breakout", title: "Breakouts", hint: "Fresh videos far above their creator's usual views." },
  { type: "small-account-breakout", title: "Small accounts that broke out", hint: "Proof the idea works without an audience: the most copyable kind." },
] as const;

export type PanelFormatSignal = {
  label: string;
  creators: number;
  hits: number;
  windowDays: number;
  hitRate: number | null;
  nicheHitRate: number | null;
  examples: string[];
};

/** `trends signals` grouped for reading: video signals by type, then emerging formats. */
export function risingSignals(report: Json) {
  const signals: Json[] = Array.isArray(report.signals) ? report.signals : [];
  const groups = SIGNAL_GROUPS.map((group) => ({
    ...group,
    items: signals.filter((signal) => signal.type === group.type && str(signal.url)).map((signal) => video(String(signal.url), {
      id: str(signal.videoId), creator: str(signal.creator), platform: str(signal.platform),
      followers: num(signal.evidence?.followers) ?? num(signal.scorecard?.creator?.followers),
      views: num(signal.evidence?.views) ?? num(signal.scorecard?.views),
      multiplier: num(signal.evidence?.multiplier) ?? num(signal.scorecard?.multiplier),
      label: str(signal.evidence?.scoreLabel) ?? str(signal.label), verdict: str(signal.verdict),
      ageDays: num(signal.ageDays), postedAt: str(signal.postedAt), signal: group.type,
      format: str(signal.scorecard?.visualFormat) ?? str(signal.scorecard?.captionLabel),
      reasons: readableReasons(signal.scorecard?.reasons, 2), note: str(signal.improvement),
    })),
  }));
  const formats: PanelFormatSignal[] = signals.filter((signal) => signal.type === "emerging-format").map((signal) => ({
    label: String(signal.evidence?.value ?? signal.label ?? "format"),
    creators: num(signal.evidence?.unrelatedCreators) ?? (Array.isArray(signal.creators) ? signal.creators.length : 0),
    hits: num(signal.evidence?.hitsInWindow) ?? 0,
    windowDays: num(signal.evidence?.windowDays) ?? 0,
    hitRate: num(signal.evidence?.labelHitRate),
    nicheHitRate: num(signal.evidence?.nicheHitRate),
    examples: (Array.isArray(signal.urls) ? signal.urls : []).slice(0, 3),
  }));
  return { groups, formats };
}

/** Entry formats and hooks of `trends niche report`, split by axis. */
export function formatRows(report: Json) {
  const rows: Json[] = Array.isArray(report.entryFormats?.rows) ? report.entryFormats.rows : [];
  const shape = (row: Json) => ({
    label: String(row.label), n: num(row.n) ?? 0, creators: num(row.creators), hitRate: num(row.hitRate),
    lift: num(row.lift), verdict: str(row.verdict),
  });
  const byLift = (a: { lift: number | null }, b: { lift: number | null }) => (b.lift ?? -Infinity) - (a.lift ?? -Infinity);
  return {
    formats: rows.filter((row) => row.axis === "format").map(shape).sort(byLift),
    hooks: rows.filter((row) => row.axis === "hook").map(shape).sort(byLift),
    subNiches: Array.isArray(report.niche?.subNiches) ? report.niche.subNiches.map(String) : [],
  };
}

/** Fill titles and languages the report rows lack from the corpus itself. */
export function withLabels(workspaceId: string, videos: PanelVideo[]): PanelVideo[] {
  const missing = videos.filter((entry) => !entry.title);
  if (!missing.length) return videos;
  const labels = trendVideoLabels({
    workspaceId,
    ids: missing.flatMap((entry) => (entry.id ? [entry.id] : [])),
    urls: missing.flatMap((entry) => (entry.id ? [] : [entry.url])),
  });
  const byId = new Map(labels.map((row) => [row.id, row]));
  const byUrl = new Map(labels.map((row) => [row.url, row]));
  return videos.map((entry) => {
    if (entry.title) return entry;
    const label = (entry.id ? byId.get(entry.id) : undefined) ?? byUrl.get(entry.url);
    return label ? { ...entry, id: entry.id ?? label.id, title: label.title, lang: entry.lang ?? label.language } : entry;
  });
}

/** Open niches of the corpus Workspace with their kept-member counts (as `trends niche list`). */
export function panelNiches(workspaceId: string): PanelNiche[] {
  return listNiches({ workspaceId }).map((row) => ({
    slug: row.slug,
    topic: row.topic,
    kept: loadNicheMembers({ nicheId: row.id, statuses: ["kept"] })
      .filter((member) => !member.flags.includes("out-of-sample")).length,
    subNiches: row.taxonomy.subNiches.length,
    updatedAt: Number.isFinite(row.updatedAt) ? new Date(row.updatedAt).toISOString() : null,
  }));
}
