// Extract http(s) URLs from arbitrary model output (markdown or plain text).
//
// Rules:
//   - http:// or https:// schemes only. mailto, ftp, etc. are ignored.
//   - URLs inside fenced ``` blocks and inline `code` spans are stripped
//     out before scanning — the verifier should not chase URLs the model
//     wrote as code examples.
//   - Trailing punctuation that is almost always sentence punctuation rather
//     than part of the URL is stripped: . , ; : ! ? ) ] > " '
//   - Closing characters from matching pairs we opened ( ) are honored —
//     we strip a trailing `)` only when the URL itself has no unmatched `(`.
//   - Dedup by normalizeUrl — different casing / utm / fragment of the same
//     URL collapse to a single first-seen string.

import { normalizeUrl } from "./citation-verifier.js";

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

function stripCodeRegions(input: string): string {
  // Replace fenced blocks first, then inline code spans, with whitespace of
  // equal length so character offsets in the remaining prose are stable for
  // debugging (offsets are not actually used downstream, but easier to read
  // in test failures).
  return input
    .replace(/```[\s\S]*?```/g, (m) => " ".repeat(m.length))
    .replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));
}

function trimTrailing(url: string): string {
  // Strip trailing punctuation that is overwhelmingly sentence punctuation
  // rather than part of the URL.
  let out = url;
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (".,;:!?\"'>".includes(last)) {
      out = out.slice(0, -1);
      continue;
    }
    if (last === ")" && countChar(out, "(") < countChar(out, ")")) {
      out = out.slice(0, -1);
      continue;
    }
    if (last === "]" && countChar(out, "[") < countChar(out, "]")) {
      out = out.slice(0, -1);
      continue;
    }
    break;
  }
  return out;
}

function countChar(s: string, ch: string): number {
  let n = 0;
  for (const c of s) if (c === ch) n += 1;
  return n;
}

function isWellFormed(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (!u.host || !u.host.includes(".")) return false;
    return true;
  } catch {
    return false;
  }
}

export function extractUrls(input: string): string[] {
  const cleaned = stripCodeRegions(input);
  const matches = cleaned.match(URL_RE) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of matches) {
    const trimmed = trimTrailing(raw);
    if (!isWellFormed(trimmed)) continue;
    let key: string;
    try {
      key = normalizeUrl(trimmed);
    } catch {
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
