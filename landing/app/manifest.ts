// Served at /manifest.webmanifest. A web app manifest lets the site be
// installed / added to a home screen and gives search + social surfaces a
// canonical name, theme color, and icon. Lightweight SEO + PWA win.

import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} · Open-source content factory CLI`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/ralphy",
    display: "standalone",
    background_color: "#0A0A0B",
    theme_color: "#FFA630",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
