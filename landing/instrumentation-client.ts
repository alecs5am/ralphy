import posthog from "posthog-js";

// Next.js 15.3+ auto-loads this file on the client before any app code runs.
// It is the single place PostHog gets initialized; `app/providers.tsx` reuses
// the same singleton so the SDK is never double-initialized.
//
// The key is the PUBLIC project key (phc_...), safe to expose to the browser —
// it is write-only ingestion, ships in the client bundle anyway, and PostHog
// treats it as public by design. We hardcode it as the default so production
// (Vercel auto-deploy from a commit, where .env.local does not exist) works
// with zero config. An env var still wins when set, so prod/preview can point
// at a different project. The remaining `if (key)` guard only matters if the
// env var is explicitly set to an empty string -> clean no-op, no bad events.
const key =
  process.env.NEXT_PUBLIC_POSTHOG_KEY ??
  "phc_qeVzz5szB9yn2hyfD5EFSwzA4f4dLowL27CkGxdQH49R";

if (key) {
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    // The dated defaults bundle turns on the modern App-Router-friendly
    // behavior: history-change pageview capture (so client-side navigations
    // are tracked without a manual route listener), pageleave, and autocapture.
    defaults: "2026-01-30",
    // Only create person profiles once a visitor is identify()'d. Anonymous
    // landing traffic still produces events, just without a stored profile —
    // cheaper and more privacy-friendly. Switch to 'always' to profile everyone.
    person_profiles: "identified_only",
  });
}
