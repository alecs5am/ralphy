// The #558 `CohortBaselineProvider` backed by the trend corpus (#556).
//
// `ralphy analytics report --cohort-workspace <corpus-ws>` asks this provider
// for each platform's median on the report's target metric. The answer is a
// Ralphy estimate from creator-listed corpus videos (never the discovery
// sample) posted within 45 days either side of the workspace's median post
// date: views are projected to 28 days with the platform maturity curve; rate
// metrics use mature videos only (72 h or older). Metrics the corpus cannot
// observe (watch percentage, completion) return null — never a guess.

import type { CohortBaselineProvider, OutcomeMetric } from "../analytics/outcomes.js";
import { cohortSample, type CohortSampleDto } from "../store/trends.js";
import { DAY_MS, HOUR_MS, MATURITY_PRIORS, PROVISIONAL_AGE_HOURS, isTrendPlatform, median, project, type MaturityCurve, type TrendPlatform } from "./math.js";

export const COHORT_PROVIDER_MIN_N = 20;
export const COHORT_PROVIDER_HALF_WINDOW_DAYS = 45;

function rate(numerator: number | null, views: number | null): number | null {
  return numerator !== null && views !== null && views > 0 ? (numerator / views) * 100 : null;
}

/** One sample's value for an outcome metric, or null when the corpus cannot observe it. */
export function sampleValue(sample: CohortSampleDto, metric: OutcomeMetric, curve: MaturityCurve): number | null {
  const ageHours = (sample.asOf - sample.postedAt) / HOUR_MS;
  if (metric === "views") return sample.views === null ? null : project(sample.views, ageHours, curve);
  if (ageHours < PROVISIONAL_AGE_HOURS) return null;
  if (metric === "engagement-rate") {
    const parts = [sample.likes, sample.comments, sample.shares, sample.saves].filter((value): value is number => value !== null);
    return parts.length === 0 ? null : rate(parts.reduce((sum, value) => sum + value, 0), sample.views);
  }
  if (metric === "save-rate") return rate(sample.saves, sample.views);
  if (metric === "share-rate") return rate(sample.shares, sample.views);
  return null;
}

export function trendCohortProvider(input: {
  workspaceId: string;
  niches?: string[];
  now?: number;
  curves?: Partial<Record<TrendPlatform, MaturityCurve>>;
  minN?: number;
}): CohortBaselineProvider {
  const minN = input.minN ?? COHORT_PROVIDER_MIN_N;
  return {
    id: `trend-corpus:${input.workspaceId}`,
    baseline({ platform, metric, cohort, postedAt }) {
      if (!isTrendPlatform(platform)) return null;
      const niches = cohort ? [cohort] : input.niches ?? [];
      const center = postedAt ?? input.now ?? Date.now();
      const half = COHORT_PROVIDER_HALF_WINDOW_DAYS * DAY_MS;
      const curve = input.curves?.[platform] ?? MATURITY_PRIORS[platform];
      const values = cohortSample({ workspaceId: input.workspaceId, platform, niches, since: center - half, until: center + half })
        .map((sample) => sampleValue(sample, metric, curve))
        .filter((value): value is number => value !== null && Number.isFinite(value));
      if (values.length < minN) return null;
      const middle = median(values)!;
      const scope = niches.length > 0 ? niches.join("+") : "all niches";
      const basis = metric === "views" ? "28-day projected views" : `${metric} of videos 72 h or older`;
      return {
        median: Math.round(middle * 10_000) / 10_000,
        n: values.length,
        label: `trend corpus, ${scope}, ${platform}: median ${basis} over ${values.length} creator-listed videos (Ralphy estimate)`,
      };
    },
  };
}
