// landing/app/library/[slug]/TemplateShowcase.tsx
//
// SEAM for issue 055 (per-template results / showcase gallery).
//
// This is a deliberately minimal placeholder, NOT the full gallery. Issue 054
// (this work) builds the discovery surface; issue 055 builds the per-template
// "here are real renders made from this template" gallery that mounts here.
//
// When 055 lands it should:
//   - take the resolved template/guideline slug (already passed in),
//   - load the showcase entries for that slug (a `showcase.json` seeded by the
//     dev-publish-template flow, per its skill body),
//   - render a media grid (reuse MediaPlayer / ExamplesGrid visual language),
//   - keep the no-visible-borders rule (bg-tint + shadow + spacing).
//
// Until then it renders nothing, so the detail page is unaffected.

export function TemplateShowcase({ slug }: { slug: string }) {
  // Intentionally empty — issue 055 fills this in. `slug` is the stable
  // resolution key the gallery will load entries for.
  void slug;
  return null;
}
