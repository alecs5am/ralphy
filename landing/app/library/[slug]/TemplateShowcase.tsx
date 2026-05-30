// landing/app/library/[slug]/TemplateShowcase.tsx
//
// Per-template results / showcase gallery (issue 055 → 060 → library redesign).
// Server component: resolves the web-servable outputs for the template `slug` at
// build time and hands them to the client `ShowcaseResults` island, which owns
// the shared lightbox + remix modal and dispatches to the right per-format
// gallery (sticker accordion, carousel swipe-modal, FB angle-tabs, poster grid,
// video takes). Renders nothing when the template has no hosted media.

import { loadShowcase } from "@/lib/showcase-loader";
import { ShowcaseResults } from "./ShowcaseResults";

export function TemplateShowcase({
  slug,
  name,
  format,
}: {
  slug: string;
  name: string;
  format?: string;
}) {
  const outputs = loadShowcase(slug);
  if (outputs.length === 0) return null;

  return (
    <ShowcaseResults
      outputs={outputs}
      format={format}
      meta={{ slug, name, tag: `@template:${slug}`, cli: `ralphy template use ${slug}` }}
    />
  );
}
