/* OG card for /skills (the index). Per-skill detail pages inherit it unless a
 * future colocated file overrides. */

import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderBrandOg,
} from "@/app/_og/brand-card";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Ralphy Skills — the skill marketplace";

export default function Image() {
  return renderBrandOg({
    eyebrow: "Skills",
    title: "The Ralphy skill marketplace.",
    url: "www.alecs5am.com/skills",
  });
}
