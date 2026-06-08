/* OG card for /blog (the index). Per-post cards live at
 * app/blog/[slug]/opengraph-image.tsx. */

import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderBrandOg,
} from "@/app/_og/brand-card";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Ralphy Blog — field notes from the Ralphy team";

export default function Image() {
  return renderBrandOg({
    eyebrow: "Blog · Field notes",
    title: "Articles, comparisons & design notes.",
    url: "www.alecs5am.com/blog",
  });
}
