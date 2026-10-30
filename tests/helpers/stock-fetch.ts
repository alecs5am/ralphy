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

/** A byte string that sniffs as PNG (#597). */
export function pngBytes(tag: string): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new TextEncoder().encode(`fixture-${tag}`)]);
}

/** A byte string that sniffs as GIF (#597). */
export function gifBytes(tag: string): Uint8Array {
  return new TextEncoder().encode(`GIF89afixture-${tag}`);
}

/** A minimal Lottie (bodymovin) document (#597). */
export function lottieJson(name = "dog"): string {
  return JSON.stringify({ v: "5.7.4", fr: 30, ip: 0, op: 90, w: 512, h: 512, nm: name, ddd: 0, assets: [], layers: [], markers: [{ tm: 0, cm: "rest", dr: 0 }] });
}

export const STAR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2L9.19 8.63L2 9.24l5.46 4.73L5.82 21z"/></svg>';

/** A fake yt-dlp runner (#597): answers by URL, records every argument list, writes `-o` files on demand. */
export function fakeYtdlp(answers: Record<string, { stdout?: unknown; code?: number; stderr?: string; writeBytes?: Uint8Array }>) {
  const calls: string[][] = [];
  const run = async (args: string[], _options: { timeoutMs: number }) => {
    calls.push(args);
    const url = args[args.length - 1]!;
    const answer = answers[url];
    if (!answer) return { code: 1, stdout: "", stderr: `ERROR: no fixture for ${url}`, ms: 1, timedOut: false };
    const out = args.indexOf("-o");
    if (out >= 0 && answer.writeBytes) {
      const target = args[out + 1]!.replace("%(ext)s", "mp4");
      fs.writeFileSync(target, answer.writeBytes);
    }
    const stdout = answer.stdout === undefined ? "" : typeof answer.stdout === "string" ? answer.stdout : JSON.stringify(answer.stdout);
    return { code: answer.code ?? 0, stdout, stderr: answer.stderr ?? "", ms: 1, timedOut: false };
  };
  return { run, calls };
}
