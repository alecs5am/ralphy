"use client";

// ShowcaseGallery (issue 055) — the per-template results grid. Each output is
// its own MediaPlayer instance, so the expand affordance + fullscreen lightbox
// are the exact components the hero player and ExamplesGrid already use. No
// bespoke lightbox state lives here.
//
// Visual language matches ExamplesGrid (masonry columns) and the library card
// system: no visible borders — tiles separate via the media's own rounded
// shell + spacing + the caption block beneath. Media lazy-loads (MediaPlayer
// images are plain <img>, videos preload metadata only).

import type { ShowcaseOutput } from "@/lib/showcase-loader";
import { MediaPlayer } from "@/components/MediaPlayer";

export function ShowcaseGallery({ outputs }: { outputs: ShowcaseOutput[] }) {
  return (
    <div className="[columns:3] [column-gap:18px] max-[1100px]:[columns:2] max-[640px]:[columns:1]">
      {outputs.map((o) => (
        <figure key={o.id} className="block break-inside-avoid mb-[22px] m-0">
          <MediaPlayer
            kind={o.kind}
            src={o.src}
            alt={o.caption ?? o.id}
            aspect={o.aspect}
            autoPlay={o.kind === "video"}
            defaultMuted
          />
          <figcaption className="flex flex-col gap-1.5 px-0.5 pt-3">
            {o.format && (
              <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-vio-2">
                {o.format}
              </span>
            )}
            {o.caption && (
              <span className="text-[13.5px] leading-[1.5] text-ink-3">{o.caption}</span>
            )}
            {(o.sourceProject || o.created) && (
              <span className="font-mono text-[11.5px] text-mute mt-0.5">
                {o.sourceProject}
                {o.sourceProject && o.created ? " · " : ""}
                {o.created}
              </span>
            )}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
