// Single source of the unit-level Remix payload builder (#089).
//
// Previously copy-pasted verbatim in LibraryListing and BlockUnits (byte-
// identical). Both now import this one definition so the Remix CTA reads the
// same everywhere a unit is listed. Pure data — safe in server or client files.

import type { Format, Unit } from "@/lib/library-v2/types";
import { mediaUrl } from "./blockMeta";
import type { RemixPayload } from "./types";

export function remixForUnit(u: Unit, f: Format | undefined): RemixPayload {
  const firstMedia = u.media && u.media.length > 0 ? u.media[0] : undefined;
  const thumb = firstMedia
    ? { kind: firstMedia.kind, src: mediaUrl(firstMedia) }
    : f
      ? { glyph: f.glyph }
      : undefined;
  return {
    tag: `@unit:${u.id}`,
    cli: `ralphy remix ${u.id}`,
    title: u.title,
    eyebrow: "Remix this unit",
    from: f ? `${f.label} · keeps everything you didn't touch` : undefined,
    thumb,
    swapHint:
      "say what to swap (a character, a location, the style). Ralphy reads the unit's recipe and re-runs only what your swap touches, keeping the rest pinned.",
  };
}
