/* Site-default OG card. Next auto-registers app/opengraph-image.tsx as the
 * og:image (and twitter:image) for every route that doesn't define its own,
 * so this covers the home page and any future page without a local OG. */

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
