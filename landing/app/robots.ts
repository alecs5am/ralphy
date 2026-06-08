// Served at /robots.txt. Allows all crawlers everywhere, points them at the
// sitemap, and declares the canonical host so indexers consolidate on the
// www. domain instead of splitting rank across host variants.

import type { MetadataRoute } from "next";
import { SITE_URL, siteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: siteUrl("sitemap.xml"),
    host: SITE_URL,
  };
}
