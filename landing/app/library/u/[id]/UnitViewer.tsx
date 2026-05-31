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

const THUMB_CAP = 8;

export function UnitViewer({ u, format }: { u: Unit; format: Format | undefined }) {
  const media = u.media ?? [];
  const multi = u.mediaCount > 1 && media.length > 1;
  const [active, setActive] = useState(0);
  const [lb, setLb] = useState<LightboxState | null>(null);

  const hue = format ? fhue(format.id) : "var(--mute)";
  const stageItem = media[active] ?? media[0];
  // A multi-item unit's individual item reads as a still / clip of its family.
  const itemAspect = multi ? "1 / 1" : (format?.aspect ?? "4 / 5");
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
        style={{ ["--hue" as string]: hue, cursor: stageItem ? "zoom-in" : "default", display: "block", width: "100%", padding: 0, border: 0, background: "#050506" }}
        onClick={() => openLightbox(active)}
        aria-label={stageItem ? `Open ${u.title} in fullscreen` : u.title}
      >
        <div style={{ position: "relative", width: "100%", aspectRatio: itemAspect, ["--hue" as string]: hue }}>
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
          <div className="seg">
            {media.slice(0, THUMB_CAP).map((m, k) => (
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
            {u.mediaCount > Math.min(media.length, THUMB_CAP) ? " ·…" : ""}
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
