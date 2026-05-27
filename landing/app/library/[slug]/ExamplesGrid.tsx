"use client";

// Examples grid — each tile is its own MediaPlayer instance so the expand
// affordance (and the resulting fullscreen modal) is the same component
// used by the hero player. No bespoke lightbox state lives here anymore.

import type { GuidelineExample } from "@/lib/guidelines-loader";
import { MediaPlayer } from "@/components/MediaPlayer";

export function ExamplesGrid({ examples }: { examples: GuidelineExample[] }) {
  return (
    <div className="[columns:3] [column-gap:18px] max-[1100px]:[columns:2] max-[640px]:[columns:1]">
      {examples.map((ex) => (
        <figure key={ex.id} className="block break-inside-avoid mb-[22px] m-0">
          <MediaPlayer
            kind={ex.kind}
            src={ex.src}
            alt={ex.caption}
            aspect={ex.aspect}
            autoPlay={ex.kind === "video"}
            defaultMuted
          />
          <figcaption className="flex flex-col gap-1.5 px-0.5 pt-3">
            {ex.pattern && (
              <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-vio-2">{ex.pattern}</span>
            )}
            <span className="text-[13.5px] leading-[1.5] text-ink-3">{ex.caption}</span>
            {ex.model && (
              <span className="font-mono text-[11.5px] text-mute mt-0.5">{ex.model}</span>
            )}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
