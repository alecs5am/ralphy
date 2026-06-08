/* OG card for /ralphy — the real home page (/ permanently redirects here).
 * Colocated on the segment because neither the root file-convention image nor
 * an explicit openGraph.images entry attaches to this page (see below). */

import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderBrandOg,
} from "@/app/_og/brand-card";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Ralphy — open-source content factory CLI";

export default function Image() {
  return renderBrandOg({
    eyebrow: "Open-source content factory CLI",
    title: "Your coding agent, now a one-prompt video marketer.",
  });
}
