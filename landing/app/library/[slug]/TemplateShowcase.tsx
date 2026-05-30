// landing/app/library/[slug]/TemplateShowcase.tsx
//
// Per-template results / showcase gallery (issue 055). Server component: loads
// the resolved, web-servable outputs for the template `slug` at build time and
// mounts the client `ShowcaseGallery` (MediaPlayer tiles + lightbox).
//
// Empty state degrades gracefully: most templates have no showcase entries (or
// none hosted yet), so `loadShowcase` returns `[]` and this renders NOTHING —
// the detail page is unaffected. We deliberately do not show a "no examples"
// placeholder, since a recipe page with zero proven outputs reads cleaner
// without an empty section.
//
// Media is resolved to `/showcase/<slug>/...` public paths by the loader; the
// heavy source renders live under gitignored `workspace/` (eventual home:
// the `ralphy-assets` companion repo, issue 059). See showcase-loader.ts for
// the resolution convention.

import { loadShowcase } from "@/lib/showcase-loader";
import { ShowcaseGallery } from "./ShowcaseGallery";

export function TemplateShowcase({ slug }: { slug: string }) {
  const outputs = loadShowcase(slug);
  if (outputs.length === 0) return null;

  return (
    <section className="pt-6 pb-4">
      <div className="container">
        <h2 className="font-display text-[clamp(28px,3.4vw,40px)] leading-[1.06] m-0 mb-2 font-semibold text-ink tracking-[-0.01em]">
          Made with this template
        </h2>
        <p className="text-[16px] leading-[1.55] text-ink-3 m-0 mb-6 max-w-[64ch]">
          Real outputs produced from this recipe. Click any tile to open it
          full-size.
        </p>
        <ShowcaseGallery outputs={outputs} />
      </div>
    </section>
  );
}
