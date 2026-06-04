// Library v2 — Screen 3 header-proof player (#085, generalized for the
// media-or-nothing proof slot). Renders a REAL player for ANY block kind
// (asset / template / style) in the header-proof slot, sourced from
// `block.refs` (the ref media URLs). Server Component — the native
// <audio>/<video>/<img> controls need no JS. Routing:
//
//   music sub / audio ext      → inline <audio controls> (play the bed). The
//                                concrete ask: clicking "Choose-Path Soundtrack"
//                                yields a player.
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
            <div key={src} className="am-audio">
              <audio className="am-audio-el" controls preload="metadata" src={src} />
              <span className="am-audio-name">{block.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Video refs → video players.
  if (refs.every((r) => VIDEO_EXT.test(r))) {
    return (
      <div className="bh-refs">
        <p className="rh">Reference clips</p>
        <div className="am-grid">
          {refs.map((src) => (
            <div key={src} className="am-item">
              <video className="am-media" src={src} controls playsInline preload="metadata" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // character / location / prop (and any image refs) → image viewer.
  return (
    <div className="bh-refs">
      <p className="rh">Reference examples</p>
      <div className="am-grid">
        {refs.map((src) =>
          VIDEO_EXT.test(src) ? (
            <div key={src} className="am-item">
              <video className="am-media" src={src} controls playsInline preload="metadata" />
            </div>
          ) : (
            <div key={src} className="am-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="am-media" src={src} alt={block.name} loading="lazy" />
            </div>
          ),
        )}
      </div>
    </div>
  );
}
