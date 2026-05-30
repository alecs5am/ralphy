// landing/app/library/[slug]/TemplateShowcase.tsx
//
// Per-template results / showcase gallery (issue 055 → 060). Server component:
// loads the resolved, web-servable outputs for the template `slug` at build
// time and mounts the right per-format gallery via a component registry keyed
// by the template's `format` (issue 060):
//
//   video, motion-design        → uniform video-tile grid (autoplay-muted-loop)
//   image, poster               → image grid
//   fb-creative                 → grouped by campaign/set (A/B/C/D/E)
//   sticker-pack                → expandable sticker-pack tiles (checkerboard)
//   carousel                    → swipeable per-style slide series
//   (default / undefined)       → the legacy flat grid
//
// Empty state degrades gracefully: a template with no hosted media renders
// NOTHING here (the detail page is unaffected). Media is resolved to
// `/showcase/<slug>/...` public paths by the loader; the heavy source renders
// live under gitignored `workspace/`. See showcase-loader.ts for the convention.

import { loadShowcase } from "@/lib/showcase-loader";
import { ShowcaseGallery } from "./ShowcaseGallery";
import { StickerPackGallery } from "./galleries/StickerPackGallery";
import { CarouselGallery } from "./galleries/CarouselGallery";
import { GroupedGallery } from "./galleries/GroupedGallery";

export function TemplateShowcase({ slug, format }: { slug: string; format?: string }) {
  const outputs = loadShowcase(slug);
  if (outputs.length === 0) return null;

  const count = outputs.length;
  const groupCount = new Set(outputs.map((o) => o.group).filter(Boolean)).size;

  let gallery: React.ReactNode;
  let blurb = "Real outputs produced from this recipe. Click any tile to open it full-size.";

  switch (format) {
    case "sticker-pack":
      gallery = <StickerPackGallery outputs={outputs} />;
      blurb =
        "Every sticker in the pack, on a transparent checkerboard backing. Tap a pack to expand all of its stickers below — no page change.";
      break;
    case "carousel":
      gallery = <CarouselGallery outputs={outputs} />;
      blurb =
        "Each style is a full slide series. Tap a cover to open the swipeable deck and step through every slide.";
      break;
    case "fb-creative":
      gallery = <GroupedGallery outputs={outputs} />;
      blurb =
        "The full creative matrix, grouped by set. Each set targets a different angle — real-people, graphic, proof, meme, niche.";
      break;
    default:
      // video / motion-design / image / poster / unknown — uniform tidy grid.
      // Honor an explicit grouping if the manifest set one (e.g. a poster pack).
      gallery =
        groupCount > 0 ? (
          <GroupedGallery outputs={outputs} />
        ) : (
          <ShowcaseGallery outputs={outputs} />
        );
      break;
  }

  return (
    <section className="pt-6 pb-4">
      <div className="container">
        <div className="flex items-baseline justify-between gap-4 flex-wrap mb-2">
          <h2 className="font-display text-[clamp(28px,3.4vw,40px)] leading-[1.06] m-0 font-semibold text-ink tracking-[-0.01em]">
            {format === "carousel"
              ? "The style series"
              : format === "sticker-pack"
                ? "The full pack"
                : "Made with this template"}
          </h2>
          <span className="font-mono text-[11.5px] tracking-[0.1em] uppercase text-mute tabular-nums">
            {count} {count === 1 ? "output" : "outputs"}
            {groupCount > 1 ? ` · ${groupCount} sets` : ""}
          </span>
        </div>
        <p className="text-[16px] leading-[1.55] text-ink-3 m-0 mb-6 max-w-[64ch]">{blurb}</p>
        {gallery}
      </div>
    </section>
  );
}
