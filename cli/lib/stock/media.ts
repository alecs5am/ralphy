// What a downloaded stock file really is (#596), from its bytes.
//
// A source can answer a media URL with an HTML error page, a redirect to a
// login wall, or a different container than its metadata claims. The bytes
// decide the MIME, the extension and the Artifact kind; a file whose bytes do
// not match the kind that was asked for is refused, never stored.

import type { StockKind } from "./types.js";

export type StockArtifactKind = "image" | "video" | "audio";

export type StockMedia = { mime: string; extension: string; artifactKind: StockArtifactKind };

/** The Artifact kind a stock kind is stored as. */
export function artifactKindFor(kind: StockKind): StockArtifactKind {
  return kind === "logo" ? "image" : kind;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, Math.min(end, bytes.length)));
}

/** Identify the media in `bytes`; `kind` disambiguates containers used for both audio and video. */
export function sniffStockMedia(bytes: Uint8Array, kind: StockKind): StockMedia | null {
  const b = (i: number) => bytes[i];
  if (bytes.length < 4) return null;
  if (b(0) === 0x89 && ascii(bytes, 1, 4) === "PNG") return { mime: "image/png", extension: ".png", artifactKind: "image" };
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { mime: "image/jpeg", extension: ".jpg", artifactKind: "image" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { mime: "image/webp", extension: ".webp", artifactKind: "image" };
  if (ascii(bytes, 0, 4) === "GIF8") return { mime: "image/gif", extension: ".gif", artifactKind: "image" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE") return { mime: "audio/wav", extension: ".wav", artifactKind: "audio" };
  if (ascii(bytes, 0, 4) === "fLaC") return { mime: "audio/flac", extension: ".flac", artifactKind: "audio" };
  if (ascii(bytes, 0, 4) === "OggS") {
    return kind === "video"
      ? { mime: "video/ogg", extension: ".ogv", artifactKind: "video" }
      : { mime: "audio/ogg", extension: ".ogg", artifactKind: "audio" };
  }
  if (b(0) === 0x1a && b(1) === 0x45 && b(2) === 0xdf && b(3) === 0xa3) {
    return kind === "audio"
      ? { mime: "audio/webm", extension: ".webm", artifactKind: "audio" }
      : { mime: "video/webm", extension: ".webm", artifactKind: "video" };
  }
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (brand === "M4A " || brand === "M4B " || kind === "audio") return { mime: "audio/mp4", extension: ".m4a", artifactKind: "audio" };
    if (brand === "qt  ") return { mime: "video/quicktime", extension: ".mov", artifactKind: "video" };
    return { mime: "video/mp4", extension: ".mp4", artifactKind: "video" };
  }
  if (ascii(bytes, 0, 3) === "ID3" || (b(0) === 0xff && (b(1)! & 0xe0) === 0xe0)) return { mime: "audio/mpeg", extension: ".mp3", artifactKind: "audio" };
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).replace(/^\ufeff/, "").trimStart();
  if (/^<svg\b/i.test(head) || (/^<\?xml\b/i.test(head) && /<svg\b/i.test(head)) || (/^<!--/.test(head) && /<svg\b/i.test(head))) {
    return { mime: "image/svg+xml", extension: ".svg", artifactKind: "image" };
  }
  return null;
}

/**
 * The Project tree subfolder a pulled file lands in, under `artifacts/`:
 * images and logos -> `images/`, video -> `videos/`, audio -> `sfx/` or
 * `music/`. Audio is music when the source says so (Openverse category
 * `music`) or when it runs longer than 30 s; sound effects and short or
 * untimed clips go to `sfx/`.
 */
export function stockFolder(kind: StockArtifactKind, facts: { category?: unknown; durationSec: number | null }): "images" | "videos" | "sfx" | "music" {
  if (kind === "image") return "images";
  if (kind === "video") return "videos";
  if (facts.category === "music") return "music";
  if (facts.category === "sound_effect") return "sfx";
  return facts.durationSec !== null && facts.durationSec > 30 ? "music" : "sfx";
}
