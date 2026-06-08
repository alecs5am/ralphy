/* OG card for /library — the flagship discovery surface. */

import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderBrandOg,
} from "@/app/_og/brand-card";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Ralphy Library — everything Ralphy made, remix the recipe";

export default function Image() {
  return renderBrandOg({
    eyebrow: "Library",
    title: "Everything Ralphy made. Remix the recipe.",
    url: "www.alecs5am.com/library",
  });
}
