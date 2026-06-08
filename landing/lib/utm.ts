// UTM link helpers — build campaign-tagged URLs for off-site promotion
// (Reddit, Medium, X, dev.to, …). Both GA4 and PostHog auto-capture the
// standard utm_* query params, so a link built here is attributed end-to-end
// with zero extra client code: the visit lands with the params, the analytics
// SDKs read them, and the source/medium/campaign show up in both dashboards.

import { siteUrl } from "./site";

export interface UtmParams {
  /** utm_source — the referrer platform: "reddit", "medium", "x", "devto". */
  source: string;
  /** utm_medium — the channel class: "social", "referral", "email". */
  medium: string;
  /** utm_campaign — the initiative: "grab-template", "launch", … */
  campaign: string;
  /** utm_content — optional A/B or placement discriminator. */
  content?: string;
  /** utm_term — optional keyword. */
  term?: string;
}

/** Append utm_* params to an absolute URL (idempotent — overwrites existing). */
export function withUtm(url: string, utm: UtmParams): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", utm.source);
  u.searchParams.set("utm_medium", utm.medium);
  u.searchParams.set("utm_campaign", utm.campaign);
  if (utm.content) u.searchParams.set("utm_content", utm.content);
  if (utm.term) u.searchParams.set("utm_term", utm.term);
  return u.toString();
}

/** Default medium per known source — social platforms vs link aggregators. */
const MEDIUM_BY_SOURCE: Record<string, string> = {
  reddit: "social",
  x: "social",
  twitter: "social",
  linkedin: "social",
  discord: "social",
  medium: "referral",
  devto: "referral",
  hackernews: "referral",
  newsletter: "email",
};

/**
 * The canonical "grab this template" share link: lands on the unit/template
 * detail page (where the "Use this template" CTA lives), tagged for the given
 * source. Campaign defaults to "grab-template".
 */
export function templateGrabLink(
  unitId: string,
  source: string,
  campaign = "grab-template",
): string {
  return withUtm(siteUrl(`library/u/${unitId}`), {
    source,
    medium: MEDIUM_BY_SOURCE[source] ?? "referral",
    campaign,
  });
}
