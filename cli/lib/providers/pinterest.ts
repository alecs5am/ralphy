// Pinterest connector (#597): URL import only. `ralphy stock pull
// pinterest:<pin-or-board-url>` reads pin or board metadata with the local
// `yt-dlp -J` and downloads the original image (or the video, through
// yt-dlp). There is no search: Pinterest has no open search API, and its terms
// restrict automated access, so only pins the user may use, or keeps for
// private reference, belong here.
//
// THIS IS THE ONLY SOURCE FILE PERMITTED TO HIT Pinterest hosts
// (`pinterest.*`, `pinimg.com`, `pin.it`) (AGENTS.md invariant #1, the same
// file-scoped discipline as firecrawl.ts). yt-dlp runs logged out: no
// cookies, no login, no proxies (assertLoggedOutArgs refuses them) and
// `--ignore-config` keeps a user config from adding them; nothing here
// handles a CAPTCHA or a login wall. A board is capped at `--max` pins
// (default 30) and `stock pull` pauses between downloads.
//
// A pin carries no license: the rights belong to the pin's creator, who is
// often not the person who pinned it. Every candidate is UNKNOWN-licensed and
// marked `referenceOnly`: it fails `--license commercial` and `open`, needs
// `--license any`, and `stock credits` lists it under "reference only, not
// cleared for publishing". The yt-dlp runner is injectable for tests.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runYtdlp, ytdlpAvailable, type YtdlpRunner } from "../trends/sources/ytdlp.js";
import { buildAttribution } from "../stock/license.js";
import { StockSourceError, stockDownload } from "../stock/http.js";
import type { FetchLike, StockCandidate, StockConnector, StockDownload, StockLicense } from "../stock/types.js";

const LABEL = "Pinterest";
const PIN_PAGE = "https://www.pinterest.com/pin/";
export const PINTEREST_DEFAULT_MAX = 30;
const PAUSE_MS = 2000;
const META_TIMEOUT_MS = 90_000;
const BOARD_TIMEOUT_MS = 240_000;
/** Path segments that are not a user's board (`/<user>/<board>/`). */
const NOT_A_BOARD = new Set(["pin", "search", "ideas", "today", "explore", "business", "settings", "_", "categories"]);

export const PINTEREST_LICENSE: StockLicense = Object.freeze({
  license: "unknown (rights belong to the pin's creator; reference only)",
  licenseUrl: null,
  commercialOk: false,
  modificationOk: false,
  attributionRequired: true,
  shareAlike: false,
});

export const PINTEREST_TERMS_NOTE = "Pinterest's terms restrict automated access: import only pins you may use, or keep them as a private reference.";

const RIGHTS_NOTE = "A pin carries no license: the rights belong to the pin's creator, who is often not the person who pinned it. Keep it as a private reference; to publish it, find the creator and get permission.";

let testRunner: YtdlpRunner | null = null;
let testPauseMs: number | null = null;
/** Candidates read from a board in this process, so pulling its pins does not ask again. */
const expanded = new Map<string, StockCandidate>();

/** @internal Test-only: the yt-dlp runner (null restores the real one). */
export function setPinterestRunnerForTesting(runner: YtdlpRunner | null): void {
  testRunner = runner;
}

/** @internal Test-only: the pause between downloads (null restores the default). */
export function setPinterestPauseForTesting(ms: number | null): void {
  testPauseMs = ms;
}

/** @internal Tests reset the in-process board memo. */
export function clearPinterestCache(): void {
  expanded.clear();
}

function runner(): YtdlpRunner {
  return testRunner ?? runYtdlp;
}

export type PinterestRef =
  | { type: "pin"; pinId: string; url: string }
  | { type: "board"; url: string }
  | { type: "short"; url: string };

function isPinterestHost(host: string): boolean {
  return /(^|\.)pinterest\.(?:[a-z]{2,3})(?:\.[a-z]{2})?$/i.test(host);
}

/** What a `pinterest:` id names: a pin, a board, or a `pin.it` short link (resolved by yt-dlp). */
export function parsePinterestRef(id: string): PinterestRef | null {
  const canonical = /^pinterest:pin:(\d{1,25})$/.exec(id);
  if (canonical) return { type: "pin", pinId: canonical[1]!, url: `${PIN_PAGE}${canonical[1]}/` };
  const raw = /^pinterest:(https?:\/\/\S+)$/i.exec(id)?.[1];
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "pin.it") return /^\/[A-Za-z0-9]+\/?$/.test(url.pathname) ? { type: "short", url: `https://pin.it${url.pathname}` } : null;
  if (!isPinterestHost(host)) return null;
  const pin = /^\/pin\/(?:[\w-]+--)?(\d{1,25})\/?$/.exec(url.pathname);
  if (pin) return { type: "pin", pinId: pin[1]!, url: `${PIN_PAGE}${pin[1]}/` };
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 2 && !NOT_A_BOARD.has(segments[0]!.toLowerCase()) && segments.every((s) => /^[\w.%-]{1,100}$/.test(s))) {
    return { type: "board", url: `https://www.pinterest.com/${segments.join("/")}/` };
  }
  return null;
}

export type YtdlpPinInfo = {
  _type?: string;
  id?: string;
  title?: string | null;
  description?: string | null;
  uploader?: string | null;
  uploader_id?: string | null;
  webpage_url?: string | null;
  duration?: number | null;
  tags?: string[] | null;
  thumbnails?: Array<{ url?: string; width?: number | null; height?: number | null }> | null;
  formats?: Array<{ url?: string; format_id?: string; width?: number | null; height?: number | null; ext?: string; protocol?: string; vcodec?: string | null }> | null;
  entries?: YtdlpPinInfo[] | null;
  extractor_key?: string | null;
};

/** The original image of a pin: the largest thumbnail on a Pinterest image host. */
export function pickPinImage(thumbnails: YtdlpPinInfo["thumbnails"]): { url: string; width: number | null; height: number | null } | null {
  const usable = (thumbnails ?? []).filter((t): t is { url: string; width?: number | null; height?: number | null } => {
    if (!t?.url) return false;
    try {
      const u = new URL(t.url);
      return u.protocol === "https:" && /(^|\.)pinimg\.com$/i.test(u.hostname);
    } catch {
      return false;
    }
  });
  if (usable.length === 0) return null;
  const area = (t: { url: string; width?: number | null; height?: number | null }) => (t.width ?? 0) * (t.height ?? 0) + (t.url.includes("/originals/") ? 1e12 : 0);
  const best = usable.sort((a, b) => area(b) - area(a))[0]!;
  return { url: best.url, width: best.width ?? null, height: best.height ?? null };
}

function oneLine(text: string | null | undefined, max: number): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}...`;
}

/** One pin from yt-dlp's JSON as a stock candidate; null when it is no Pinterest pin. */
export function pinterestCandidate(info: YtdlpPinInfo): StockCandidate | null {
  // A pin that embeds another site's video resolves to that site's extractor: not a Pinterest file.
  if (info.extractor_key && info.extractor_key !== "Pinterest") return null;
  const pinId = typeof info.id === "string" && /^\d{1,25}$/.test(info.id) ? info.id : null;
  if (!pinId) return null;
  const pageUrl = `${PIN_PAGE}${pinId}/`;
  const formats = (info.formats ?? []).filter((f) => f?.url && f.vcodec !== "none");
  const isVideo = formats.length > 0;
  const image = pickPinImage(info.thumbnails);
  if (!isVideo && !image) return null;
  const title = oneLine(info.title, 100) ?? oneLine(info.description, 80) ?? `Pinterest pin ${pinId}`;
  const author = oneLine(info.uploader, 120);
  const best = isVideo
    ? formats.filter((f) => Math.min(f.width ?? 0, f.height ?? 0) <= 1080).sort((a, b) => (b.height ?? 0) * (b.width ?? 0) - (a.height ?? 0) * (a.width ?? 0))[0] ?? formats[0]!
    : null;
  return {
    id: `pinterest:pin:${pinId}`,
    source: "pinterest",
    kind: isVideo ? "video" : "image",
    title,
    pageUrl,
    // A video pin is downloaded through yt-dlp from its page (direct MP4 or HLS).
    mediaUrl: isVideo ? pageUrl : image!.url,
    previewUrl: image?.url ?? null,
    mime: isVideo ? "video/mp4" : null,
    width: isVideo ? best?.width ?? null : image!.width,
    height: isVideo ? best?.height ?? null : image!.height,
    durationSec: isVideo && typeof info.duration === "number" ? Math.round(info.duration * 10) / 10 : null,
    author,
    authorUrl: null,
    ...PINTEREST_LICENSE,
    attribution: buildAttribution({ title, author, license: "rights belong to the pin's creator (reference only)", licenseUrl: null, sourceLabel: LABEL, pageUrl }),
    notes: [RIGHTS_NOTE, PINTEREST_TERMS_NOTE],
    extra: { referenceOnly: true, pinId, uploaderId: info.uploader_id ?? null, video: isVideo },
  };
}

function parseInfo(stdout: string, what: string): YtdlpPinInfo {
  const line = stdout.split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith("{"));
  if (!line) throw new StockSourceError(LABEL, 0, `${LABEL}: yt-dlp printed no metadata for ${what}`);
  try {
    return JSON.parse(line) as YtdlpPinInfo;
  } catch {
    throw new StockSourceError(LABEL, 0, `${LABEL}: yt-dlp printed unreadable metadata for ${what}`);
  }
}

function ytdlpFailure(stderr: string, what: string, timedOut: boolean): StockSourceError {
  if (timedOut) return new StockSourceError(LABEL, 0, `${LABEL}: yt-dlp took too long reading ${what}`);
  const line = stderr.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^ERROR:/.test(l)).pop() ?? stderr.trim().split(/\r?\n/).pop() ?? "";
  const detail = line.replace(/^ERROR:\s*/, "").slice(0, 240);
  const status = /\b404\b|not found/i.test(detail) ? 404 : /\b429\b/.test(detail) ? 429 : 0;
  return new StockSourceError(LABEL, status, `${LABEL}: yt-dlp could not read ${what}${detail ? ` (${detail})` : ""}. Private pins and boards, and pins behind a login, cannot be imported.`);
}

/** `yt-dlp -J` on a pin, board or short link. */
async function readMetadata(url: string, options: { max: number; board: boolean }): Promise<YtdlpPinInfo> {
  const args = ["-J", "--no-warnings", "--ignore-no-formats-error", "--socket-timeout", "15"];
  if (options.board) args.push("--playlist-end", String(Math.max(1, Math.floor(options.max))));
  else args.push("--no-playlist");
  args.push(url);
  const result = await runner()(args, { timeoutMs: options.board ? BOARD_TIMEOUT_MS : META_TIMEOUT_MS });
  if (result.code !== 0 || result.timedOut) throw ytdlpFailure(result.stderr, url, result.timedOut);
  return parseInfo(result.stdout, url);
}

/** The pins of a board (or of whatever a short link resolves to), at most `max`, memoized for the pull. */
async function readPins(url: string, max: number, board: boolean): Promise<StockCandidate[]> {
  const info = await readMetadata(url, { max, board });
  const items = info._type === "playlist" ? (info.entries ?? []) : [info];
  const pins = items.map((entry) => (entry ? pinterestCandidate(entry) : null)).filter((c): c is StockCandidate => c !== null).slice(0, max);
  for (const pin of pins) expanded.set(pin.id, pin);
  return pins;
}

async function expand(id: string, _fetchImpl: FetchLike, options: { max: number }): Promise<string[] | null> {
  const ref = parsePinterestRef(id);
  if (!ref || ref.type === "pin") return null;
  const pins = await readPins(ref.url, options.max, ref.type === "board");
  if (pins.length === 0) throw new StockSourceError(LABEL, 404, `${LABEL}: ${ref.url} has no importable pins (private, empty, or only embeds of other sites)`);
  return pins.map((pin) => pin.id);
}

async function lookup(id: string, _fetchImpl: FetchLike): Promise<StockCandidate> {
  const ref = parsePinterestRef(id);
  if (!ref) throw new StockSourceError(LABEL, 0, `${LABEL}: '${id}' is not a Pinterest pin or board (pinterest:<pin-or-board-url>)`);
  if (ref.type === "board") throw new StockSourceError(LABEL, 0, `${LABEL}: ${ref.url} is a board; \`stock pull\` expands it into its pins`);
  if (ref.type === "pin") {
    const memo = expanded.get(`pinterest:pin:${ref.pinId}`);
    if (memo) return memo;
  }
  const [pin] = await readPins(ref.url, 1, false);
  if (!pin) throw new StockSourceError(LABEL, 404, `${LABEL}: ${ref.url} has no image or video yt-dlp can read`);
  return pin;
}

async function download(candidate: StockCandidate, fetchImpl: FetchLike, options: { maxBytes: number; timeoutMs: number }): Promise<StockDownload> {
  if (candidate.kind !== "video") return stockDownload(LABEL, candidate.mediaUrl, fetchImpl, options);
  // Video pins: let yt-dlp fetch the best single file (direct MP4 or HLS) into scratch.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-stock-pin-"));
  try {
    const args = [
      "--no-warnings",
      "--no-playlist",
      "--socket-timeout",
      "15",
      "-f",
      "b[ext=mp4][height<=1080]/b[height<=1080]/b",
      "--max-filesize",
      String(options.maxBytes),
      "-o",
      path.join(scratch, "pin.%(ext)s"),
      candidate.pageUrl,
    ];
    const result = await runner()(args, { timeoutMs: options.timeoutMs });
    if (result.code !== 0 || result.timedOut) throw ytdlpFailure(result.stderr, candidate.pageUrl, result.timedOut);
    const file = fs.readdirSync(scratch).find((name) => name.startsWith("pin.") && !name.endsWith(".part"));
    if (!file) throw new StockSourceError(LABEL, 0, `${LABEL}: yt-dlp wrote no video for ${candidate.id} (over the size limit, or no playable format)`);
    const bytes = new Uint8Array(fs.readFileSync(path.join(scratch, file)));
    if (bytes.byteLength > options.maxBytes) throw new StockSourceError(LABEL, 0, `${LABEL}: ${candidate.id} is over the size limit`);
    return { bytes, contentType: null };
  } finally {
    // Scratch outside the Project tree; the Project copy is written by `stock pull`.
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export const pinterestConnector: StockConnector = {
  id: "pinterest",
  label: LABEL,
  kinds: ["image", "video"],
  requiredBinary: "yt-dlp",
  searchable: false,
  referenceOnly: true,
  idPattern: /^pinterest:(?:pin:\d{1,25}|https?:\/\/\S+)$/i,
  idHint: "pinterest:<pin-or-board-url> (https://www.pinterest.com/pin/<n>/ or https://www.pinterest.com/<user>/<board>/)",
  unavailableNote: () => (testRunner || ytdlpAvailable() ? null : "pinterest needs yt-dlp on PATH (`brew install yt-dlp`, or see https://github.com/yt-dlp/yt-dlp)"),
  async search() {
    throw new StockSourceError(LABEL, 0, `${LABEL}: there is no search; pull a pin or board URL with \`ralphy stock pull pinterest:<url> --project <id>\``);
  },
  lookup,
  expand,
  download,
  pullPauseMs: () => testPauseMs ?? PAUSE_MS,
};
