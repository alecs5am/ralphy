"use client";

// UnitViewer — the sticky media viewer on the unit-detail page.
//   single-item formats (video / motion-design / poster / image) → one big media
//   multi-item formats (carousel / sticker-pack / fb-creative / podcast-cuts) →
//     one active item + a .vthumb strip (capped 8) + "i / n"
// Clicking the stage opens the shared fullscreen Lightbox (Esc / ← / →,
// scroll-lock). Real media via the shared MediaCell; thumbnails reuse the same.

import { useState } from "react";
import type { Format, Unit } from "@/lib/library-v2/types";
import { fhue, mediaUrl, singleItemFormat } from "../../_shared/blockMeta";
import { Media } from "../../_shared/Media";
import { Lightbox } from "../../_shared/Lightbox";
import type { LightboxItem, LightboxState } from "../../_shared/types";

export function UnitViewer({ u, format }: { u: Unit; format: Format | undefined }) {
  const media = u.media ?? [];
  const multi = u.mediaCount > 1 && media.length > 1;
  const [active, setActive] = useState(0);
  const [lb, setLb] = useState<LightboxState | null>(null);

  const hue = format ? fhue(format.id) : "var(--mute)";
  const stageItem = media[active] ?? media[0];
  // A multi-item unit's individual item reads as a still / clip of its family.
  // For single-item units prefer the media's OWN aspect (a video unit can be
  // 1/1, 16/9, or 9/16) over the format default.
  const itemAspect = multi ? "1 / 1" : (stageItem?.aspect ?? format?.aspect ?? "4 / 5");
  const isStickerLike = u.format === "sticker-pack";

  const lbItems: LightboxItem[] = media.map((m, i) => ({
    src: mediaUrl(m),
    kind: m.kind,
    label: u.title,
    fmtLabel: format
      ? multi
        ? `${format.label} · ${singleItemFormat(u.format)}`
        : `${format.label} · single ${format.unit}`
      : u.format,
    remix: i === active
      ? {
          tag: `@unit:${u.id}`,
          cli: `ralphy remix ${u.id}`,
          title: u.title,
          eyebrow: "Remix this unit",
        }
      : undefined,
  }));

  function openLightbox(index: number) {
    if (lbItems.length === 0) return;
    setLb({ items: lbItems, index, checker: isStickerLike });
  }

  return (
    <div className="uviewer">
      <button
        type="button"
        className="stage"
        style={{ ["--hue" as string]: hue, cursor: stageItem ? "zoom-in" : "default" }}
        onClick={() => openLightbox(active)}
        aria-label={stageItem ? `Open ${u.title} in fullscreen` : u.title}
      >
        {/* The stage media now flows through <Media> (#088): contain + cinema
            bars into the item's aspect, capped at 70vh (Media derives its own
            width from maxHeight × aspect, replacing the manual width calc), so a
            portrait (9/16) clip fits beside the panel instead of dominating the
            page and never crops. lightbox={false} — the click is handled by the
            enclosing .stage button, which opens the MULTI-ITEM gallery Lightbox
            (prev/next + remix bar) below, not a single-item dialog. */}
        {stageItem ? (
          <Media
            src={mediaUrl(stageItem)}
            kind={stageItem.kind}
            alt={u.title}
            displayAspect={itemAspect}
            maxHeight="70vh"
            fit="contain"
            lightbox={false}
            className="stage-media"
            checker={isStickerLike}
            muted
            loop
            autoPlay
          />
        ) : (
          <div
            className="stage-media ph"
            style={{ aspectRatio: itemAspect, position: "relative", ["--hue" as string]: hue }}
          >
            <span className="ph-glyph">{format?.glyph}</span>
          </div>
        )}
      </button>

      {multi && (
        <div className="vctl">
          {/* Scrollable strip — ALL items are reachable (no cap), so a 32-up pack
              browses fully. The main stage shows the selected item. */}
          <div className="seg">
            {media.map((m, k) => (
              <button
                type="button"
                key={k}
                className={`vthumb${k === active ? " on" : ""}`}
                onClick={() => setActive(k)}
                aria-label={`Item ${k + 1}`}
                style={{ ["--hue" as string]: hue }}
              >
                <Media
                  src={mediaUrl(m)}
                  kind={m.kind}
                  alt={`${u.title} item ${k + 1}`}
                  displayAspect="1 / 1"
                  fit="cover"
                  lightbox={false}
                  muted
                  loop
                  autoPlay
                  className="vthumb-media"
                />
              </button>
            ))}
          </div>
          <span className="vidx">
            {active + 1} / {u.mediaCount}
            {u.mediaCount > media.length ? " ·…" : ""}
          </span>
        </div>
      )}

      <Lightbox
        state={lb}
        onClose={() => setLb(null)}
        onNav={(dir) =>
          setLb((s) =>
            s ? { ...s, index: (s.index + dir + s.items.length) % s.items.length } : s,
          )
        }
        onRemix={() => {
          /* Remix-from-lightbox is wired by the panel's own commit bar; the
             lightbox action is a no-op here to keep the viewer self-contained. */
        }}
      />
    </div>
  );
}
