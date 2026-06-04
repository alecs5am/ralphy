"use client";

// Shared <Media> — the single image/video renderer for the whole v2 library
// (#088). Two hard behaviors, single-sourced so the per-page sizing drift that
// caused the recent native-dimension bugs can't recur:
//
//   1. Aspect-preserving FIT into any slot. The media sits in a sized,
//      aspect-LOCKED box (CSS `aspect-ratio` = the DISPLAY/slot aspect). With
//      `fit="contain"` (default) the whole media shows via object-fit:contain;
//      the leftover space is filled by CINEMA BARS — the box's own tinted
//      background (a bg-tint token, NOT a border). So:
//        • a 9:16 media in a 1:1 slot  → contain shrinks it to the slot height,
//          the box is wider than the media → bars LEFT/RIGHT (pillarbox).
//        • a 16:9 media in a 9:16 slot → contain shrinks it to the slot width,
//          the box is taller than the media → bars TOP/BOTTOM (letterbox).
//      Works for ALL aspect pairings — the bars are simply the box background
//      showing through wherever contain leaves gaps.
//
//   2. Click → LIGHTBOX. Clicking opens a single-item modal (shadcn Dialog,
//      #087) showing the media large, capped to the viewport, contain. Default
//      on for non-tile contexts; `lightbox={false}` for tiles (which are links).
//
// `fit="cover"` is the opt-in crop mode for the masonry tile cells / contact
// sheets (the Pinterest look) — same locked box, object-fit:cover, no bars.
//
// No native-dimension rendering anywhere: every media is absolutely-positioned
// inside the aspect-locked box. The old per-page caps (AssetMedia single-ref
// max-height, .rx-media native width, .stage-media 70vh) are FOLDED IN here via
// the `maxHeight` / `displayAspect` props and the `.media-*` classes.
//
// No visible borders (repo hard rule): bars = bg-tint, separation = shadow +
// radius, never a hairline.

import { useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface MediaProps {
  src: string;
  kind: "image" | "video";
  /** Alt text / lightbox label. */
  alt?: string;
  /** Intrinsic aspect of the media ("W / H"). Used as the box aspect when no
   *  explicit `displayAspect` is given, so contain has no work to do and the
   *  media fills its own natural box (no bars). */
  aspect?: string;
  /** The slot/display aspect ("W / H"). When it differs from the media's
   *  intrinsic `aspect`, contain shows the whole media + cinema bars fill the
   *  gap. Falls back to `aspect`, then a portrait default. */
  displayAspect?: string;
  /** contain (default) = whole media + cinema bars; cover = crop to fill. */
  fit?: "contain" | "cover";
  /** Click opens a large modal preview. Default on; pass false for tiles. */
  lightbox?: boolean;
  /** Poster frame for a video. */
  poster?: string;
  /** Video playback flags. Tiles use muted+autoplay+loop for a silent preview;
   *  proof/demo media uses controls. */
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  /** Use a plain lazy <img> instead of next/image (match the call site to avoid
   *  layout regressions). Videos always use a native <video>. */
  plainImg?: boolean;
  /** Cap the rendered box height (folds in the old max-height caps). Any CSS
   *  length, e.g. "70vh" / "360px". */
  maxHeight?: string;
  /** Cap the rendered box width. */
  maxWidth?: string;
  /** Extra class on the outer box. */
  className?: string;
  /** Tinted backing for transparent stickers in the lightbox (checkerboard-ish
   *  elevated tint instead of pure black). */
  checker?: boolean;
}

/** Numeric W/H of a "W / H" aspect string. */
function ratioOf(aspect: string | undefined, fallback: number): number {
  if (!aspect) return fallback;
  const [w, h] = aspect.split("/").map((n) => parseFloat(n.trim()));
  return w && h ? w / h : fallback;
}

/** The inner media element, absolutely filling its aspect-locked parent box. */
function MediaEl({
  src,
  kind,
  alt,
  fit,
  poster,
  controls,
  autoPlay,
  loop,
  muted,
  plainImg,
  sizes,
}: {
  src: string;
  kind: "image" | "video";
  alt: string;
  fit: "contain" | "cover";
  poster?: string;
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  plainImg?: boolean;
  sizes?: string;
}) {
  const objectFit = fit === "cover" ? "cover" : "contain";
  if (kind === "video") {
    return (
      <video
        src={src}
        poster={poster}
        controls={controls}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        playsInline
        preload="metadata"
        disablePictureInPicture
        className="media-el"
        style={{ objectFit }}
      />
    );
  }
  if (plainImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} loading="lazy" className="media-el" style={{ objectFit }} />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes ?? "(max-width: 820px) 90vw, 60vw"}
      unoptimized
      style={{ objectFit }}
    />
  );
}

export function Media({
  src,
  kind,
  alt = "",
  aspect,
  displayAspect,
  fit = "contain",
  lightbox = true,
  poster,
  controls,
  autoPlay,
  loop,
  muted,
  plainImg,
  maxHeight,
  maxWidth,
  className,
  checker,
}: MediaProps) {
  const [open, setOpen] = useState(false);

  // The box aspect is the DISPLAY/slot aspect (so contain produces bars when it
  // differs from the media's intrinsic aspect). Falls back to the media's own
  // aspect (no bars), then to a portrait default.
  const boxAspect = displayAspect ?? aspect ?? "4 / 5";

  // When a maxHeight cap is set, derive the matching max width from the box
  // aspect so the box shrinks within the cap AND stays the right shape (a CSS
  // `aspect-ratio` box with width:100% won't re-derive its width from a
  // max-height alone — it would crop). `calc(maxHeight * ratio)` does.
  const ratio = ratioOf(boxAspect, 0.8);
  const widthCap =
    maxWidth ?? (maxHeight ? `calc(${maxHeight} * ${ratio})` : undefined);

  const boxStyle: React.CSSProperties = {
    aspectRatio: boxAspect,
    maxHeight,
    width: widthCap ? `min(100%, ${widthCap})` : "100%",
    marginInline: widthCap ? "auto" : undefined,
  };

  const clickable = lightbox;

  const inner = (
    <MediaEl
      src={src}
      kind={kind}
      alt={alt}
      fit={fit}
      poster={poster}
      controls={controls}
      autoPlay={autoPlay}
      loop={loop}
      muted={muted}
      plainImg={plainImg}
    />
  );

  // Non-lightbox: a plain box (used by tiles, which are themselves links).
  if (!clickable) {
    return (
      <div className={cn("media-box", className)} style={boxStyle}>
        {inner}
      </div>
    );
  }

  // Lightbox: the box is a button trigger; the Dialog shows it large + contain.
  return (
    <>
      <button
        type="button"
        className={cn("media-box media-trigger", className)}
        style={boxStyle}
        onClick={() => setOpen(true)}
        aria-label={alt ? `Open ${alt}` : "Open media"}
      >
        {inner}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          className="media-lb-content"
          // Drop the Dialog default sizing/padding — the lightbox is a
          // viewport-capped media stage, not a card.
        >
          <DialogTitle className="sr-only">{alt || "Media preview"}</DialogTitle>
          <div className={cn("media-lb-stage", checker && "is-checker")}>
            {kind === "video" ? (
              <video
                key={src}
                src={src}
                poster={poster}
                controls
                autoPlay
                loop
                playsInline
                ref={(el) => {
                  if (el) {
                    // Lightbox opens from a click — unmute + play so the take
                    // is heard, mirroring the gallery Lightbox behavior.
                    el.muted = false;
                    el.volume = 1;
                    el.play().catch(() => {});
                  }
                }}
                className="media-lb-el"
              />
            ) : (
              // Always a plain <img> in the lightbox: the large preview is a
              // viewport-capped contain stage, not a layout slot, so next/image
              // `fill` (which needs a fixed-size positioned parent) would fight
              // the auto-sized stage. The plain img sizes to its own content,
              // capped by `.media-lb-el`.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={alt} className="media-lb-el" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
