// HTTP page retriever. Bun fetch + a deterministic HTML-to-text stripper.
//
// Every retriever in the deep-research pipeline speaks the same contract:
//   { text, source_url, retrieved_at, score, status }
//
// score:  1 = ok (>=200 + body) ; 0 = unusable (4xx/5xx/network/timeout)
// status: "ok" | "http_4xx" | "http_5xx" | "network_error" | "timeout"
//
// Note: own-engine, no paid keys. Default UA is set to look like a normal
// browser to keep DDG / Reddit / blogs from gating us at the edge.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "caption",
  "dd",
  "details",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "td",
  "th",
  "tr",
  "ul",
]);

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const cp = parseInt(body.slice(2), 16);
      if (Number.isFinite(cp)) return String.fromCodePoint(cp);
      return m;
    }
    if (body.startsWith("#")) {
      const cp = parseInt(body.slice(1), 10);
      if (Number.isFinite(cp)) return String.fromCodePoint(cp);
      return m;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): string {
  // 1. Drop comments + script/style/noscript blocks.
  let s = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "");

  // 2. Normalize block tags to newlines.
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (m, tag: string) => {
    return BLOCK_TAGS.has(tag.toLowerCase()) ? "\n" : "";
  });

  // 3. Decode entities.
  s = decodeEntities(s);

  // 4. Whitespace cleanup. Spaces and tabs on each line first, then cap
  //    blank-line runs at 2 newlines.
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return s;
}

export type FetchStatus =
  | "ok"
  | "http_4xx"
  | "http_5xx"
  | "network_error"
  | "timeout";

export type FetchResult = {
  text: string;
  source_url: string;
  retrieved_at: string;
  score: number;
  status: FetchStatus;
  contentType?: string;
  httpStatus?: number;
};

export type FetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
  acceptLanguage?: string;
  headers?: Record<string, string>;
};

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.6 Safari/605.1.15";

export async function fetchPage(
  url: string,
  opts: FetchOptions = {},
): Promise<FetchResult> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxBytes = opts.maxBytes ?? 250_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const retrieved_at = new Date().toISOString();
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent": opts.userAgent ?? DEFAULT_UA,
        "accept-language": opts.acceptLanguage ?? "en-US,en;q=0.9",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9," +
          "text/plain;q=0.8,*/*;q=0.5",
        ...(opts.headers ?? {}),
      },
    });
    const httpStatus = resp.status;
    if (httpStatus >= 400 && httpStatus < 500) {
      return {
        text: "",
        source_url: url,
        retrieved_at,
        score: 0,
        status: "http_4xx",
        httpStatus,
      };
    }
    if (httpStatus >= 500) {
      return {
        text: "",
        source_url: url,
        retrieved_at,
        score: 0,
        status: "http_5xx",
        httpStatus,
      };
    }
    const contentType = resp.headers.get("content-type") ?? undefined;
    const buf = await resp.arrayBuffer();
    const truncated = new Uint8Array(buf).slice(0, maxBytes);
    const body = new TextDecoder("utf-8", { fatal: false }).decode(truncated);
    const text = looksLikeHtml(body, contentType) ? htmlToText(body) : body;
    return {
      text: text.slice(0, maxBytes),
      source_url: url,
      retrieved_at,
      score: 1,
      status: "ok",
      contentType,
      httpStatus,
    };
  } catch (e) {
    const isAbort = (e as Error).name === "AbortError";
    return {
      text: "",
      source_url: url,
      retrieved_at,
      score: 0,
      status: isAbort ? "timeout" : "network_error",
    };
  } finally {
    clearTimeout(timer);
  }
}

function looksLikeHtml(body: string, contentType?: string): boolean {
  if (contentType && contentType.toLowerCase().includes("html")) return true;
  return /<\s*(html|body|head|p|div|article|h1|h2)\b/i.test(body.slice(0, 4096));
}
