"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import type { ReactNode } from "react";

// PostHog is initialized in `instrumentation-client.ts` (runs before app code).
// This provider just hands that already-initialized singleton to the React
// tree so client components can call `usePostHog()`, `useFeatureFlagEnabled()`,
// etc. Passing `client` (not `apiKey`) is what prevents a second init.
export function PostHogProvider({ children }: { children: ReactNode }) {
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
