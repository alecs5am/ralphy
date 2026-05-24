"use client";

// Examples grid — each tile is its own MediaPlayer instance so the expand
// affordance (and the resulting fullscreen modal) is the same component
// used by the hero player. No bespoke lightbox state lives here anymore.

import type { GuidelineExample } from "@/lib/guidelines-loader";
import { MediaPlayer } from "@/components/MediaPlayer";

export function ExamplesGrid({ examples }: { examples: GuidelineExample[] }) {
  return (
    <div className="lib-examples-grid">
      {examples.map((ex) => (
        <figure key={ex.id} className="lib-example">
          <MediaPlayer
            kind={ex.kind}
            src={ex.src}
            alt={ex.caption}
            aspect={ex.aspect}
            autoPlay={ex.kind === "video"}
            defaultMuted
          />
          <figcaption className="lib-example-caption">
            {ex.pattern && (
              <span className="lib-example-pattern">{ex.pattern}</span>
            )}
            <span className="lib-example-text">{ex.caption}</span>
            {ex.model && (
              <span className="lib-example-model">{ex.model}</span>
            )}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
