import type { ProbeOutcome } from "../breaker.js";
import type { TrendPlatform } from "../math.js";

/** A creator as a source reports it (normalized). */
export interface SourceCreator {
  platform: TrendPlatform;
  platformCreatorId: string;
  handle: string | null;
  displayName: string | null;
  followers: number | null;
  videoCount: number | null;
  totalLikes: number | null;
  region: string | null;
}

export interface SourceMetrics {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}

/** A video as a source reports it (normalized). */
export interface SourceVideo {
  platform: TrendPlatform;
  platformVideoId: string;
  creatorPlatformId: string;
  url: string;
  postedAt: number | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  title: string | null;
  description: string | null;
  hashtags: string[];
  soundId: string | null;
  soundTitle: string | null;
  soundOriginal: boolean | null;
  language: string | null;
  region: string | null;
  isAd: boolean | null;
  aigcLabel: boolean | null;
  metrics: SourceMetrics;
  viewsPrecision: "exact" | "rounded";
}

export interface ListingResult {
  outcome: ProbeOutcome;
  creator: Partial<SourceCreator> | null;
  videos: SourceVideo[];
  ms: number;
}

export interface DiscoveryResult {
  outcome: ProbeOutcome;
  /** Creators found (seeds for listing). */
  creators: SourceCreator[];
  /** Videos found with their creator (discovery sample — never a baseline). */
  videos: SourceVideo[];
  /** Video ids found without a creator (cannot be stored until resolved). */
  unresolvedVideoIds: string[];
  requests: number;
  ms: number;
  region?: string | null;
  note?: string;
}

export const EMPTY_METRICS: SourceMetrics = { views: null, likes: null, comments: null, shares: null, saves: null };
