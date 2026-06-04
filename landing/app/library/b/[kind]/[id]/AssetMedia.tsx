// Library v2 — Screen 3 header-proof player (#085, generalized for the
// media-or-nothing proof slot). Renders a REAL player for ANY block kind
// (asset / template / style) in the header-proof slot, sourced from
// `block.refs` (the ref media URLs). Server Component — the native
// <video>/<img> controls need no JS; the audio branch delegates to the
// "use client" <AudioPlayer> (#091). Routing:
//
//   music sub / audio ext      → designed <AudioPlayer> per ref (play the bed,
//                                #091). The concrete ask: clicking
//                                "Choose-Path Soundtrack" yields a player.
//   all-video refs             → <video controls poster>.
//   image refs (default — incl.
//   character/location/prop,
//   template/style previews)   → the reference image(s) in a simple <img> viewer.
//
// Media-or-nothing: when `block.refs` is empty, this returns null and the proof
// slot renders NOTHING — no schematic placeholder (the user's "no dumb
// placeholders" rule). The caller drops `.bhead` to a single column.
//
// No visible borders: separation via bg-tint + shadow + spacing only.

import type { Block } from "@/lib/library-v2/types";
import { AudioPlayer } from "../../../_shared/AudioPlayer";
import { Media } from "../../../_shared/Media";

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac)(\?|#|$)/i;

/** True when this block has at least one playable ref to show in the proof slot. */
export function hasRefMedia(block: Block): boolean {
  return !!block.refs && block.refs.length > 0;
}

export function AssetMedia({ block }: { block: Block }) {
  const refs = block.refs ?? [];
  if (refs.length === 0) return null;

  const sub = block.sub;

  // Music → audio player(s). Honour an explicit audio extension too, in case a
  // music bed lands as a non-obvious sub.
  if (sub === "music" || refs.some((r) => AUDIO_EXT.test(r))) {
    return (
      <div className="bh-refs">
        <p className="rh">Listen</p>
        <div className="am-audio-stack">
          {refs.map((src) => (
            <AudioPlayer key={src} src={src} name={block.name} />
          ))}
        </div>
      </div>
    );
  }

  // Video refs → video players (through <Media>, contain + cinema bars +
  // click-to-lightbox).
  if (refs.every((r) => VIDEO_EXT.test(r))) {
    return (
      <div className="bh-refs">
        <p className="rh">Reference clips</p>
        <RefGrid refs={refs} kind={() => "video"} name={block.name} />
      </div>
    );
  }

  // character / location / prop (and any image refs) → image viewer (mixed
  // image/video routed per-ref through <Media>).
  return (
    <div className="bh-refs">
      <p className="rh">Reference examples</p>
      <RefGrid refs={refs} kind={(src) => (VIDEO_EXT.test(src) ? "video" : "image")} name={block.name} />
    </div>
  );
}

/** The proof grid. A single ref renders CONTAINED + capped (whole frame, never
 *  page-tall — folds in the old `.am-grid:has(:only-child)` max-height:360px
 *  cap); multiple refs are cover-cropped 4/3 cells (the tidy proof grid). Both
 *  click → lightbox via <Media>. */
function RefGrid({
  refs,
  kind,
  name,
}: {
  refs: string[];
  kind: (src: string) => "image" | "video";
  name: string;
}) {
  const single = refs.length === 1;
  return (
    <div className={`am-grid${single ? " am-grid-single" : ""}`}>
      {refs.map((src) => (
        <div key={src} className="am-item">
          <Media
            src={src}
            kind={kind(src)}
            alt={name}
            // Single ref: contain into a 4/3 box capped at 360px so a portrait
            // shows whole with side bars and a landscape whole with top/bottom
            // bars — never page-tall native. Multiple refs: cover-crop 4/3.
            fit={single ? "contain" : "cover"}
            displayAspect="4 / 3"
            maxHeight={single ? "360px" : undefined}
            controls={kind(src) === "video"}
          />
        </div>
      ))}
    </div>
  );
}
