// Fixture fetch for the stock connectors (#596): routes requests to canned
// responses and records every call, so stock tests make zero network calls.

import fs from "node:fs";
import path from "node:path";
import type { FetchLike } from "../../cli/lib/stock/types.js";

export const STOCK_FIXTURES = path.resolve(import.meta.dir, "..", "fixtures", "stock");

export function stockFixture<T = any>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(STOCK_FIXTURES, name), "utf8")) as T;
}

export type StockRoute = {
  match: (url: URL) => boolean;
  respond: (url: URL) => Response | Promise<Response>;
};

export type RecordedCall = { url: string; headers: Record<string, string> };

export function fixtureFetch(routes: StockRoute[]): { fetchImpl: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(input);
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    calls.push({ url: input, headers });
    const route = routes.find((candidate) => candidate.match(url));
    if (!route) return new Response(`no fixture for ${input}`, { status: 404 });
    const signal = init?.signal;
    if (!signal) return route.respond(url);
    // Like a real fetch: an abort rejects a response that has not arrived.
    return new Promise<Response>((resolve, reject) => {
      const onAbort = () => reject(signal.reason ?? new Error("aborted"));
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
      Promise.resolve(route.respond(url)).then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    });
  };
  return { fetchImpl, calls };
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

export function bytesResponse(body: Uint8Array | string, contentType: string): Response {
  return new Response(body, { headers: { "content-type": contentType } });
}

/** A byte string that sniffs as JPEG. */
export function jpegBytes(tag: string): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(`fixture-${tag}`)]);
}

/** A byte string that sniffs as MP3 (ID3 header). */
export function mp3Bytes(tag: string): Uint8Array {
  return new TextEncoder().encode(`ID3fixture-${tag}`);
}

/** A byte string that sniffs as MP4. */
export function mp4Bytes(tag: string): Uint8Array {
  return new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypisom"), ...new TextEncoder().encode(`fixture-${tag}`)]);
}

export const NVIDIA_SVG = '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>NVIDIA</title><path d="M8.948 8.798v-1.43"/></svg>';
