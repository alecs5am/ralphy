// What a downloaded stock file really is (#596, #597), from its bytes.
//
// A source can answer a media URL with an HTML error page, a redirect to a
// login wall, or a different container than its metadata claims. The bytes
// decide the MIME, the extension and the Artifact kind; a file whose bytes do
// not match the kind that was asked for is refused, never stored.

import type { StockCandidate, StockKind } from "./types.js";

/** `data`: a Lottie JSON animation (#597). */
export type StockArtifactKind = "image" | "video" | "audio" | "data";

export type StockMedia = { mime: string; extension: string; artifactKind: StockArtifactKind; lottie?: true };

/**
 * The Artifact kind a stock kind is stored as. An animation's kind depends on
 * its format (Lottie JSON `data`, WebM `video`, GIF / WebP / SVG `image`): the
 * candidate's MIME predicts it, the sniffed bytes decide it.
 */
export function artifactKindFor(kind: StockKind, mime?: string | null): StockArtifactKind {
  if (kind === "logo" || kind === "sticker" || kind === "icon") return "image";
  if (kind === "animation") {
    const m = (mime ?? "").toLowerCase();
    if (m === "application/json" || m.includes("lottie")) return "data";
    if (m.startsWith("video/")) return "video";
    return "image";
  }
  return kind;
}

/** Whether downloaded media satisfies the kind a candidate was pulled as. */
export function mediaFitsKind(media: StockMedia, candidate: Pick<StockCandidate, "kind">): boolean {
  switch (candidate.kind) {
    case "animation":
      return media.lottie === true || media.artifactKind === "video" || ["image/gif", "image/webp", "image/svg+xml"].includes(media.mime);
    case "video":
      return media.artifactKind === "video";
    case "audio":
      return media.artifactKind === "audio";
    default:
      return media.artifactKind === "image";
  }
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, Math.min(end, bytes.length)));
}

/** A Lottie (bodymovin) document: a JSON object with a frame rate, an out point and a layer list. */
export function isLottieJson(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 64)).replace(/^\ufeff/, "").trimStart();
  if (!head.startsWith("{")) return false;
  try {
    const doc = JSON.parse(new TextDecoder().decode(bytes).replace(/^\ufeff/, "")) as Record<string, unknown>;
    return Boolean(doc) && typeof doc === "object" && Array.isArray(doc.layers) && typeof doc.fr === "number" && typeof doc.op === "number";
  } catch {
    return false;
  }
}

/** Identify the media in `bytes`; `kind` disambiguates containers used for both audio and video. */
export function sniffStockMedia(bytes: Uint8Array, kind: StockKind): StockMedia | null {
  const b = (i: number) => bytes[i];
  if (bytes.length < 4) return null;
  const moving = kind === "video" || kind === "animation";
  if (b(0) === 0x89 && ascii(bytes, 1, 4) === "PNG") return { mime: "image/png", extension: ".png", artifactKind: "image" };
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { mime: "image/jpeg", extension: ".jpg", artifactKind: "image" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { mime: "image/webp", extension: ".webp", artifactKind: "image" };
  if (ascii(bytes, 0, 4) === "GIF8") return { mime: "image/gif", extension: ".gif", artifactKind: "image" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE") return { mime: "audio/wav", extension: ".wav", artifactKind: "audio" };
  if (ascii(bytes, 0, 4) === "fLaC") return { mime: "audio/flac", extension: ".flac", artifactKind: "audio" };
  if (ascii(bytes, 0, 4) === "OggS") {
    return moving
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
  if (kind === "animation" && isLottieJson(bytes)) return { mime: "application/json", extension: ".json", artifactKind: "data", lottie: true };
  return null;
}

/**
 * The Project tree subfolder a pulled file lands in, under `artifacts/`:
 * images, logos, stickers and icons -> `images/`, animations ->
 * `animations/`, video -> `videos/`, audio -> `sfx/` or `music/`. Audio is
 * music when the source says so (Openverse category `music`) or when it runs
 * longer than 30 s; sound effects and short or untimed clips go to `sfx/`.
 */
export function stockFolder(
  kind: StockArtifactKind | "animation",
  facts: { category?: unknown; durationSec: number | null },
): "images" | "videos" | "sfx" | "music" | "animations" {
  if (kind === "animation") return "animations";
  if (kind === "image" || kind === "data") return "images";
  if (kind === "video") return "videos";
  if (facts.category === "music") return "music";
  if (facts.category === "sound_effect") return "sfx";
  return facts.durationSec !== null && facts.durationSec > 30 ? "music" : "sfx";
}

/** The folder for a candidate: animations by stock kind, everything else by Artifact kind. */
export function stockFolderFor(candidate: Pick<StockCandidate, "kind" | "mime" | "durationSec" | "extra">): ReturnType<typeof stockFolder> {
  if (candidate.kind === "animation") return "animations";
  return stockFolder(artifactKindFor(candidate.kind, candidate.mime), { category: candidate.extra.category, durationSec: candidate.durationSec });
}
