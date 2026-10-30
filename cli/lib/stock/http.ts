// HTTP plumbing shared by the stock source connectors (#596).
//
// No hosts live here: each connector builds its own URLs from its own host
// constants (AGENTS.md invariant #1) and passes them in. This module adds the
// one stock User-Agent, a timeout, a byte cap for downloads, and maps HTTP
// failures to StockSourceError so `ralphy stock` can report a 429 as a rate
// limit with its Retry-After instead of a generic failure.

import { TerminalProviderError } from "../providers/shared.js";
import { STOCK_USER_AGENT, type FetchLike, type StockDownload } from "./types.js";

/** An HTTP failure at a stock source. `status` 0 means the request never got a response. */
export class StockSourceError extends TerminalProviderError {
  readonly source: string;
  readonly status: number;
  readonly retryAfterSec: number | null;
  constructor(source: string, status: number, message: string, retryAfterSec: number | null = null) {
    super(message);
    this.name = "StockSourceError";
    this.source = source;
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

let testFetch: FetchLike | null = null;

/** @internal Test-only injection seam: every `ralphy stock` request goes through it. */
export function setStockFetchForTesting(fetchImpl: FetchLike | null): void {
  testFetch = fetchImpl;
}

/** The fetch the stock command hands to connectors. */
export function stockFetch(): FetchLike {
  return testFetch ?? ((url, init) => fetch(url, init));
}

const DEFAULT_TIMEOUT_MS = 30_000;

type SendInit = { headers?: Record<string, string>; timeoutMs?: number; signal?: AbortSignal };

async function send(
  label: string,
  url: string,
  fetchImpl: FetchLike,
  init: SendInit,
): Promise<{ response: Response; clear: () => void }> {
  const controller = new AbortController();
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(new Error(`timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
  // An outer deadline (the search's per-source budget) aborts this request too.
  const onOuterAbort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) onOuterAbort();
  else init.signal?.addEventListener("abort", onOuterAbort, { once: true });
  const clear = () => {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", onOuterAbort);
  };
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { "User-Agent": STOCK_USER_AGENT, ...(init.headers ?? {}) },
      signal: controller.signal,
      redirect: "follow",
    });
  } catch (error) {
    clear();
    const reason = controller.signal.aborted
      ? (controller.signal.reason as Error | undefined)?.message ?? "aborted"
      : (error as Error)?.message ?? String(error);
    throw new StockSourceError(label, 0, `${label}: request failed (${reason})`);
  }
  if (!response.ok) {
    clear();
    const body = await response.text().catch(() => "");
    const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
    const detail = body.replace(/\s+/g, " ").trim().slice(0, 200);
    const message = response.status === 429
      ? `${label} rate-limited the request (HTTP 429${retryAfter !== null ? `, retry after ${retryAfter}s` : ""}). Anonymous access is throttled; wait and retry.`
      : `${label} returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`;
    throw new StockSourceError(label, response.status, message, retryAfter);
  }
  return { response, clear };
}

/** GET a JSON document from a stock source. */
export async function stockGetJson<T>(
  label: string,
  url: string,
  fetchImpl: FetchLike,
  init: SendInit = {},
): Promise<T> {
  const { response, clear } = await send(label, url, fetchImpl, { ...init, headers: { Accept: "application/json", ...(init.headers ?? {}) } });
  try {
    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new StockSourceError(label, response.status, `${label} returned a non-JSON body (${text.slice(0, 80).replace(/\s+/g, " ")})`);
    }
  } finally {
    clear();
  }
}

/** Download a media file into memory, refusing anything over `maxBytes`. */
export async function stockDownload(
  label: string,
  url: string,
  fetchImpl: FetchLike,
  options: { maxBytes: number; timeoutMs: number; headers?: Record<string, string> },
): Promise<StockDownload> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new StockSourceError(label, 0, `${label}: media URL is not a URL: ${url.slice(0, 120)}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new StockSourceError(label, 0, `${label}: refusing a non-HTTP media URL (${parsed.protocol})`);
  }
  const { response, clear } = await send(label, url, fetchImpl, { headers: options.headers, timeoutMs: options.timeoutMs });
  try {
    const declared = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > options.maxBytes) {
      throw new StockSourceError(label, response.status, `${label}: the file is ${formatBytes(declared)}, over the ${formatBytes(options.maxBytes)} limit`);
    }
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() || null;
    if (!response.body) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > options.maxBytes) throw new StockSourceError(label, response.status, `${label}: the file is over the ${formatBytes(options.maxBytes)} limit`);
      return { bytes, contentType };
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > options.maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new StockSourceError(label, response.status, `${label}: the file is over the ${formatBytes(options.maxBytes)} limit`);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { bytes, contentType };
  } catch (error) {
    if (error instanceof StockSourceError) throw error;
    throw new StockSourceError(label, 0, `${label}: download failed (${(error as Error)?.message ?? String(error)})`);
  } finally {
    clear();
  }
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const at = Date.parse(value);
  if (Number.isFinite(at)) return Math.max(0, Math.ceil((at - Date.now()) / 1000));
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** Strip HTML tags and decode the common entities (Commons extmetadata values are HTML). */
export function htmlToText(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (entity, code: string) => {
      const point = Number(code);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    })
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

/** The first `href` in an HTML fragment, made absolute. */
export function firstHref(value: string | null | undefined): string | null {
  const match = /href="([^"]+)"/i.exec(value ?? "");
  if (!match) return null;
  const href = match[1]!.replace(/&amp;/g, "&");
  if (href.startsWith("//")) return `https:${href}`;
  return /^https?:\/\//i.test(href) ? href : null;
}
