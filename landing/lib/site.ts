// Canonical site origin + identity — the single source of truth every SEO
// surface reads (root metadata `metadataBase`, per-page `canonical`, the
// sitemap, robots, JSON-LD, and the OG image routes).
//
// Resolution order, highest precedence first:
//   1. NEXT_PUBLIC_SITE_URL — set this explicitly for a custom domain.
//   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel injects the production domain
//      WITHOUT a scheme (e.g. "www.alecs5am.com"), so we prepend https://.
//   3. The hard-coded production domain, so a from-scratch build (no env)
//      still emits absolute, correct URLs.
//
// Previously each route re-derived this inline and used VERCEL_PROJECT_PRODUCTION_URL
// raw — that produces a scheme-less string that `new URL()` (and therefore
// Next's `metadataBase`) rejects. Centralizing fixes that bug in one place.

function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return stripTrailingSlash(ensureScheme(explicit));

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return stripTrailingSlash(ensureScheme(vercel));

  return "https://www.alecs5am.com";
}

function ensureScheme(host: string): string {
  return /^https?:\/\//.test(host) ? host : `https://${host}`;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Absolute production origin, no trailing slash (e.g. "https://www.alecs5am.com"). */
export const SITE_URL = resolveSiteUrl();

/** Brand name reused in <title> templates, og:siteName, and JSON-LD. */
export const SITE_NAME = "Ralphy";

/** One-line site description — the metadata fallback and JSON-LD `description`. */
export const SITE_DESCRIPTION =
  "Turn your coding agent into a one-prompt video marketer. Open-source CLI for TikTok, Reels & YouTube Shorts.";

/** The repository, surfaced in JSON-LD `sameAs` and the footer. */
export const SITE_REPO = "https://github.com/alecs5am/ralphy";

/** Join a path onto the canonical origin, guaranteeing exactly one slash. */
export function siteUrl(path = "/"): string {
  if (!path || path === "/") return SITE_URL;
  return `${SITE_URL}/${path.replace(/^\/+/, "")}`;
}
