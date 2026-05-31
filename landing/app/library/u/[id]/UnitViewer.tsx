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
import { MediaCell } from "../../_shared/UnitTile";
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
  // Numeric W/H ratio so the stage can derive its width from the 70vh height cap
  // (CSS `aspect-ratio` alone won't re-derive width once `width:100%` is set, so
  // a portrait clip would otherwise crop to the column width).
  const ratio = (() => {
    const [w, h] = itemAspect.split("/").map((n) => parseFloat(n.trim()));
    return w && h ? w / h : 0.75;
  })();
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
        {/* Cap the media at 70vh while preserving aspect + centering, so a
            portrait (9/16) clip fits comfortably beside the panel instead of
            dominating the page. aspect-ratio + max-height lets the box shrink
            to fit the cap; margin auto centers the narrower result. */}
        <div
          className="stage-media"
          style={{
            aspectRatio: itemAspect,
            // width capped at the column width OR (70vh × aspect ratio), so the
            // portrait full frame shows within the 70vh height cap.
            width: `min(100%, calc(70vh * ${ratio}))`,
            ["--hue" as string]: hue,
          }}
        >
          {stageItem ? (
            <MediaCell m={stageItem} alt={u.title} />
          ) : (
            <div className="ph" style={{ position: "absolute", inset: 0, ["--hue" as string]: hue }}>
              <span className="ph-glyph">{format?.glyph}</span>
            </div>
          )}
        </div>
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
                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                  <MediaCell m={m} alt={`${u.title} item ${k + 1}`} />
                </div>
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
