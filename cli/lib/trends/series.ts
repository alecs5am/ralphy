// Series and visual format detection (#588) — pure, no I/O.
//
// A "format" is how a video is made and presented (big on-screen text over a
// person doing something, a podcast clip, a structured talking head, several
// characters acted out), not a caption hook or a topic. The strongest signal
// is a numbered series of such videos on one channel whose parts collect more
// views than the channel's other videos.
//
// Detection, per channel:
//   1. Parse part / episode / day / number markers in the caption (English and
//      Russian; the Russian marker words are Unicode escapes so the
//      English-only gate stays empty).
//   2. Stem each marked caption: drop the markers, hashtags, mentions, URLs,
//      and bare numbers, then keep the first `stemWords` words.
//   3. A stem group with at least `minParts` parts is a series (`stem`). When
//      no stem group qualifies but the channel has `minParts` marked videos,
//      they form one `numbered-set` (the episodes of a franchise whose titles
//      vary, such as "Pt 1" videos about different machines).
//   4. Baseline: the channel's videos with no marker at all (marked videos of
//      other series are never the baseline). Series lift = series median
//      views / baseline median views; where both sides are dated and scored,
//      the multiplier lift compares the creator-relative multipliers.
//   5. The primary series of a channel is its largest one (first seen wins a
//      tie) — the one-series-per-channel view of the manual pass in
//      docs/research/series-formats-2026-10-30.md.
//   6. Freshness (owner rule, 2026-10-30): detection and lift use the whole
//      channel history, but a series is a reference only when a part was
//      posted within the last 90 days. The newest part is the one with the
//      highest part number (YouTube flat listings carry no post date); a
//      series is `fresh` when any part is dated inside the window, `stale`
//      when its newest part (or every part) is dated and older, and
//      `unknown` otherwise — unknown series are dated before they rank.
//
// Lifts are Ralphy's own estimates from listing views (YouTube listing views
// are rounded to 2-3 significant figures), never platform data.

import { median } from "./math.js";

// ─── Markers ────────────────────────────────────────────────────────────────

export const SERIES_MARKER_KINDS = ["part", "episode", "day", "week", "chapter", "fraction", "series", "number"] as const;
export type SeriesMarkerKind = (typeof SERIES_MARKER_KINDS)[number];

export interface SeriesMarker {
  kind: SeriesMarkerKind;
  /** Part number. */
  n: number;
  /** Total parts for an `n/m` marker. */
  of: number | null;
  /** Code-unit span in the caption. */
  start: number;
  end: number;
}

/**
 * Russian marker words, escaped (the repository is English-only on disk):
 * part (and its abbreviation), episode (three words), day, week, chapter,
 * lesson.
 */
const RU = {
  part: ["\u0447\u0430\u0441\u0442\u044c", "\u0447\\."],
  episode: ["\u0441\u0435\u0440\u0438\u044f", "\u0432\u044b\u043f\u0443\u0441\u043a", "\u044d\u043f\u0438\u0437\u043e\u0434"],
  day: ["\u0434\u0435\u043d\u044c"],
  week: ["\u043d\u0435\u0434\u0435\u043b\u044f"],
  chapter: ["\u0433\u043b\u0430\u0432\u0430", "\u0443\u0440\u043e\u043a"],
} as const;

const LEFT = "(?<![\\p{L}\\p{N}])";
const RIGHT = "(?![\\p{L}\\p{N}])";
/** `<word> N`, optionally `<word> N/M` or `<word> N of M`; Russian "of" is the escaped preposition. */
const word = (words: readonly string[], digits = 4) =>
  new RegExp(`${LEFT}(?:${words.join("|")})\\.?\\s*#?\\s*(\\d{1,${digits}})(?:\\s?(?:\\/|of|\u0438\u0437)\\s?(\\d{1,4}))?${RIGHT}`, "giu");

/** Patterns in priority order; a later match that overlaps an earlier one is dropped. */
const MARKER_PATTERNS: Array<{ kind: SeriesMarkerKind; pattern: RegExp }> = [
  { kind: "part", pattern: word(["part", "pt", ...RU.part]) },
  { kind: "episode", pattern: word(["episode", "ep", ...RU.episode]) },
  { kind: "day", pattern: word(["day", ...RU.day]) },
  { kind: "week", pattern: word(["week", ...RU.week], 3) },
  { kind: "chapter", pattern: word(["chapter", "lesson", "vol", "volume", ...RU.chapter]) },
  // "Series 11" is also a product name (a watch generation); kept because a
  // numbered "series N" is a real marker and the parts still share a template.
  { kind: "series", pattern: word(["series"]) },
  { kind: "fraction", pattern: /(?<![\p{N}/.,:])(\d{1,3})\s?\/\s?(\d{1,3})(?![\p{N}/])/gu },
  { kind: "number", pattern: /(?<![\p{L}\p{N}&])#\s?(\d{1,4})(?![\p{L}\p{N}])/gu },
];

/** Every part / episode / day / number marker in a caption, in reading order. */
export function parseSeriesMarkers(text: string | null | undefined): SeriesMarker[] {
  if (!text) return [];
  const found: SeriesMarker[] = [];
  for (const { kind, pattern } of MARKER_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const n = Number(match[1]);
      const of = match[2] === undefined ? null : Number(match[2]);
      // "24/7" and "0/10" are not parts; "Day 2025" and "#2024" are years.
      if (kind === "fraction" && (of === null || of < 2 || n < 1 || n > of)) continue;
      if (n >= 1900 && n <= 2099) continue;
      if (found.some((marker) => start < marker.end && end > marker.start)) continue;
      found.push({ kind, n, of, start, end });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/** First `words` words of the caption with markers, hashtags, mentions, URLs, and digits removed (digits split words). */
export function seriesStem(text: string | null | undefined, markers: readonly SeriesMarker[] = parseSeriesMarkers(text), words = 3): string {
  if (!text) return "";
  let stripped = "";
  let cursor = 0;
  for (const marker of [...markers].sort((a, b) => a.start - b.start)) {
    stripped += `${text.slice(cursor, marker.start)} `;
    cursor = marker.end;
  }
  stripped += text.slice(cursor);
  return stripped
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/giu, " ")
    .replace(/[#@][\p{L}\p{N}_.]+/gu, " ")
    .toLowerCase()
    .replace(/[^\p{L}]+/gu, " ")
    .trim()
    .split(" ")
    .filter((token) => token !== "")
    .slice(0, Math.max(1, words))
    .join(" ");
}

// ─── Grouping ───────────────────────────────────────────────────────────────

export interface SeriesVideo {
  id: string;
  /** Caption (YouTube title, TikTok description). */
  text: string | null;
  views: number | null;
  /** Creator-relative multiplier when the video is dated and scored. */
  multiplier: number | null;
  postedAt: number | null;
}

export interface SeriesOptions {
  /** Parts a series needs. */
  minParts: number;
  /** Unmarked videos the channel needs for a baseline. */
  minOther: number;
  /** Words in a stem. */
  stemWords: number;
  /** Dated, scored videos each side needs for a multiplier lift. */
  minDatedParts: number;
  minDatedOther: number;
}

export const DEFAULT_SERIES_OPTIONS: SeriesOptions = { minParts: 3, minOther: 5, stemWords: 3, minDatedParts: 2, minDatedOther: 3 };

export type SeriesGrouping = "stem" | "numbered-set";

export interface DetectedSeries {
  /** `<stem>` for a stem series, `#numbered` for a numbered set. */
  key: string;
  stem: string;
  grouping: SeriesGrouping;
  primary: boolean;
  parts: number;
  partIds: string[];
  partNumbers: number[];
  markerKinds: SeriesMarkerKind[];
  other: number;
  seriesMedianViews: number | null;
  otherMedianViews: number | null;
  /** Series median views / unmarked median views. */
  lift: number | null;
  datedParts: number;
  datedOther: number;
  seriesMedianMultiplier: number | null;
  otherMedianMultiplier: number | null;
  /** Series median multiplier / unmarked median multiplier (dated, scored videos only). */
  multiplierLift: number | null;
  /** The part with the most views. */
  bestPartId: string | null;
  bestPartViews: number | null;
  /** The part with the highest part number (dated first on a tie): the one to date and digest. */
  newestPartId: string | null;
  newestPartNumber: number | null;
  /** Post time of the newest part, null when undated. */
  newestPartPostedAt: number | null;
  /** Latest known post time over all parts. */
  latestPostedAt: number | null;
  /** Parts with a post time. */
  datedPartsAny: number;
}

export const SERIES_FRESH_DAYS = 90;
export type SeriesFreshness = "fresh" | "stale" | "unknown";

const DAY = 86_400_000;

/** Whether a series is a reference now: a part posted within `freshDays`. */
export function seriesFreshness(series: Pick<DetectedSeries, "latestPostedAt" | "newestPartPostedAt" | "datedPartsAny" | "parts">, now: number, freshDays = SERIES_FRESH_DAYS): { freshness: SeriesFreshness; postedAt: number | null; ageDays: number | null } {
  const postedAt = series.latestPostedAt;
  const ageDays = postedAt === null ? null : Math.round(((now - postedAt) / DAY) * 10) / 10;
  if (postedAt !== null && now - postedAt <= freshDays * DAY) return { freshness: "fresh", postedAt, ageDays };
  if (postedAt !== null && (series.newestPartPostedAt !== null || series.datedPartsAny === series.parts)) return { freshness: "stale", postedAt, ageDays };
  return { freshness: "unknown", postedAt, ageDays };
}

export interface ChannelSeriesResult {
  videos: number;
  marked: number;
  other: number;
  series: DetectedSeries[];
  /** Why the channel has no series: too few marked videos or too thin a baseline. */
  reason: "ok" | "no-series" | "thin-baseline";
}

const finite = (values: Array<number | null>): number[] => values.filter((value): value is number => value !== null && Number.isFinite(value));

/** Ratio of two medians, null when either is missing or the baseline is zero. */
export function seriesLift(seriesValues: Array<number | null>, otherValues: Array<number | null>): { series: number | null; other: number | null; lift: number | null } {
  const series = median(finite(seriesValues));
  const other = median(finite(otherValues));
  return { series, other, lift: series !== null && other !== null && other > 0 ? series / other : null };
}

/** Group one channel's videos into series and compute each series' lift against the channel's unmarked videos. */
export function detectChannelSeries(videos: readonly SeriesVideo[], options: Partial<SeriesOptions> = {}): ChannelSeriesResult {
  const opts = { ...DEFAULT_SERIES_OPTIONS, ...options };
  const marked: Array<{ video: SeriesVideo; markers: SeriesMarker[]; stem: string }> = [];
  const other: SeriesVideo[] = [];
  for (const video of videos) {
    const markers = parseSeriesMarkers(video.text);
    if (markers.length === 0) other.push(video);
    else marked.push({ video, markers, stem: seriesStem(video.text, markers, opts.stemWords) });
  }
  const base = { videos: videos.length, marked: marked.length, other: other.length };
  if (marked.length < opts.minParts) return { ...base, series: [], reason: "no-series" };
  if (other.length < opts.minOther) return { ...base, series: [], reason: "thin-baseline" };

  const groups = new Map<string, typeof marked>();
  for (const entry of marked) (groups.get(entry.stem) ?? groups.set(entry.stem, []).get(entry.stem)!).push(entry);
  let chosen: Array<{ key: string; stem: string; grouping: SeriesGrouping; entries: typeof marked }> = [...groups.entries()]
    .filter(([, entries]) => entries.length >= opts.minParts)
    .map(([stem, entries]) => ({ key: stem, stem, grouping: "stem" as const, entries }));
  if (chosen.length === 0) chosen = [{ key: "#numbered", stem: marked[0]!.stem, grouping: "numbered-set", entries: marked }];

  // Primary: the largest series; Map order keeps the first seen on a tie.
  let primaryKey = chosen[0]!.key;
  let primarySize = chosen[0]!.entries.length;
  for (const group of chosen) if (group.entries.length > primarySize) [primaryKey, primarySize] = [group.key, group.entries.length];

  const otherViews = other.map((video) => video.views);
  const otherMultipliers = finite(other.map((video) => video.multiplier));
  const series = chosen.map((group): DetectedSeries => {
    const parts = group.entries.map((entry) => entry.video);
    const views = seriesLift(parts.map((video) => video.views), otherViews);
    const partMultipliers = finite(parts.map((video) => video.multiplier));
    const multipliers = partMultipliers.length >= opts.minDatedParts && otherMultipliers.length >= opts.minDatedOther ? seriesLift(partMultipliers, otherMultipliers) : { series: null, other: null, lift: null };
    const best = parts.reduce<SeriesVideo | null>((top, video) => (video.views !== null && (top === null || (top.views ?? -1) < video.views) ? video : top), null);
    const numbered = group.entries
      .map((entry, index) => ({ video: entry.video, n: entry.markers[0]!.n, index }))
      .sort((a, b) => b.n - a.n || (b.video.postedAt ?? -Infinity) - (a.video.postedAt ?? -Infinity) || a.index - b.index);
    const newest = numbered[0] ?? null;
    const dated = finite(parts.map((video) => video.postedAt));
    return {
      key: group.key,
      // A numbered set is named after its newest part (deterministic whatever the listing order).
      stem: group.grouping === "numbered-set" && newest ? group.entries[newest.index]!.stem : group.stem,
      grouping: group.grouping,
      primary: group.key === primaryKey,
      parts: parts.length,
      partIds: parts.map((video) => video.id),
      partNumbers: [...new Set(group.entries.map((entry) => entry.markers[0]!.n))].sort((a, b) => a - b),
      markerKinds: [...new Set(group.entries.flatMap((entry) => entry.markers.map((marker) => marker.kind)))].sort(
        (a, b) => SERIES_MARKER_KINDS.indexOf(a) - SERIES_MARKER_KINDS.indexOf(b),
      ),
      other: other.length,
      seriesMedianViews: views.series,
      otherMedianViews: views.other,
      lift: views.lift,
      datedParts: partMultipliers.length,
      datedOther: otherMultipliers.length,
      seriesMedianMultiplier: multipliers.series,
      otherMedianMultiplier: multipliers.other,
      multiplierLift: multipliers.lift,
      bestPartId: best?.id ?? parts[0]?.id ?? null,
      bestPartViews: best?.views ?? null,
      newestPartId: newest?.video.id ?? null,
      newestPartNumber: newest?.n ?? null,
      newestPartPostedAt: newest?.video.postedAt ?? null,
      latestPostedAt: dated.length > 0 ? Math.max(...dated) : null,
      datedPartsAny: dated.length,
    };
  });
  return { ...base, series, reason: "ok" };
}

// ─── Visual format taxonomy ─────────────────────────────────────────────────

export const VISUAL_FORMAT_TAXONOMY_VERSION = 1;

/** Fixed visual taxonomy: how a video is made and presented, read from frames. */
export const VISUAL_FORMATS = [
  "text-over-action",
  "structured-talking-head",
  "podcast-clip",
  "split-screen-reaction",
  "illustrated-explainer",
  "product-test-template",
  "ui-motion-graphics",
  "on-location-try-it",
  "in-character-monologue",
  "multi-character-skit",
  "other",
] as const;
export type VisualFormat = (typeof VISUAL_FORMATS)[number];

export const VISUAL_FORMAT_DEFINITIONS: Record<VisualFormat, string> = {
  "text-over-action": "Big on-screen title text over a person doing something; little or no speech to camera",
  "structured-talking-head": "A person talking to camera in a fixed structure (one rule, reason, tip, or myth per episode)",
  "podcast-clip": "A clip from a podcast or interview: mics, a studio set, a host and a guest",
  "split-screen-reaction": "A reaction to another clip: split screen or picture-in-picture with the reactor",
  "illustrated-explainer": "Illustrations, cards, diagrams, or animation carry the explanation under a voice-over",
  "product-test-template": "A fixed product test or comparison template: side by side, a timer, a result, often no face",
  "ui-motion-graphics": "Screen recordings or animated UI of software, usually after a short face hook",
  "on-location-try-it": "On location, the creator tries a place, a machine, or a piece of equipment while explaining",
  "in-character-monologue": "One person playing a character or a type, speaking as that character",
  "multi-character-skit": "Several characters acted out (one or more performers), a scripted scene",
  other: "None of the above",
};

export const VISUAL_FORMAT_METHOD = "vision-agent" as const;

export function isVisualFormat(value: unknown): value is VisualFormat {
  return typeof value === "string" && (VISUAL_FORMATS as readonly string[]).includes(value);
}

export interface VisualFormatLabel {
  videoId: string;
  format: VisualFormat;
  confidence: number;
  method: typeof VISUAL_FORMAT_METHOD;
  taxonomyVersion: number;
  niche: string | null;
  seriesKey: string | null;
  url: string | null;
  sheets: string[];
  notes: string | null;
  labeledAt: string;
}

/**
 * Labels from a worksheet the agent filled after looking at the sheets.
 * Items without a format are skipped (not labeled yet); an unknown format, a
 * confidence outside [0, 1], or a missing video id is an error with its index.
 */
export function parseLabelWorksheet(raw: unknown, now: number): { labels: VisualFormatLabel[]; skipped: number; errors: string[] } {
  const items = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : null;
  if (!items) return { labels: [], skipped: 0, errors: ["expected a worksheet { items: [...] } or a JSON array of labels"] };
  const labels: VisualFormatLabel[] = [];
  const errors: string[] = [];
  let skipped = 0;
  items.forEach((entry, index) => {
    const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
    if (!item) {
      errors.push(`items[${index}]: not an object`);
      return;
    }
    if (item.format === null || item.format === undefined || item.format === "") {
      skipped += 1;
      return;
    }
    if (!isVisualFormat(item.format)) {
      errors.push(`items[${index}]: format "${String(item.format)}" is not in the taxonomy (${VISUAL_FORMATS.join(", ")})`);
      return;
    }
    const confidence = Number(item.confidence);
    if (item.confidence === null || item.confidence === undefined || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      errors.push(`items[${index}]: confidence must be a number between 0 and 1`);
      return;
    }
    if (typeof item.videoId !== "string" || item.videoId.trim() === "") {
      errors.push(`items[${index}]: videoId is required`);
      return;
    }
    const sheets = Array.isArray(item.sheets) ? item.sheets.filter((sheet): sheet is string => typeof sheet === "string") : [];
    labels.push({
      videoId: item.videoId.trim(),
      format: item.format,
      confidence: Math.round(confidence * 1000) / 1000,
      method: VISUAL_FORMAT_METHOD,
      taxonomyVersion: VISUAL_FORMAT_TAXONOMY_VERSION,
      niche: typeof item.niche === "string" ? item.niche : null,
      seriesKey: typeof item.seriesKey === "string" ? item.seriesKey : null,
      url: typeof item.url === "string" ? item.url : null,
      sheets,
      notes: typeof item.notes === "string" && item.notes.trim() ? item.notes.trim().slice(0, 500) : null,
      labeledAt: new Date(now).toISOString(),
    });
  });
  return { labels, skipped, errors };
}

// ─── Format-level stats ─────────────────────────────────────────────────────

export interface LabeledSeries {
  niche: string;
  channel: string;
  creatorId: string;
  lift: number | null;
  parts: number;
  url: string | null;
  format: VisualFormat;
  confidence: number;
  /** Newest known part post time (ISO) and its age in days. */
  postedAt: string | null;
  ageDays: number | null;
}

export interface FormatStat {
  niche: string;
  format: VisualFormat;
  series: number;
  channels: number;
  medianLift: number | null;
  bestExample: { channel: string; lift: number | null; parts: number; url: string | null; postedAt: string | null; ageDays: number | null } | null;
}

/** Per niche and visual format: labeled series, distinct channels, median series lift, and the best example. */
export function formatStats(rows: readonly LabeledSeries[]): FormatStat[] {
  const groups = new Map<string, LabeledSeries[]>();
  for (const row of rows) {
    const key = `${row.niche}\u0000${row.format}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(row);
  }
  return [...groups.values()]
    .map((list): FormatStat => {
      const best = [...list].sort((a, b) => (b.lift ?? -Infinity) - (a.lift ?? -Infinity))[0] ?? null;
      const lift = median(finite(list.map((row) => row.lift)));
      return {
        niche: list[0]!.niche,
        format: list[0]!.format,
        series: list.length,
        channels: new Set(list.map((row) => row.creatorId)).size,
        medianLift: lift === null ? null : Math.round(lift * 100) / 100,
        bestExample: best ? { channel: best.channel, lift: best.lift === null ? null : Math.round(best.lift * 100) / 100, parts: best.parts, url: best.url, postedAt: best.postedAt, ageDays: best.ageDays } : null,
      };
    })
    .sort((a, b) => a.niche.localeCompare(b.niche) || b.series - a.series || (b.medianLift ?? -Infinity) - (a.medianLift ?? -Infinity) || a.format.localeCompare(b.format));
}
