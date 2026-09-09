import type { ActivityRunDetail } from "../../../../electron/media/types";
import type { ActivityDto } from "../../../../electron/ralphy/types";

export type ActivitySource = "ralphy" | "generation" | "production";

const PRODUCTION = /document|composition|unit|iteration|feedback|build|publication|artifact|media/i;
const GENERATION = /run|generation|attempt|model/i;

export function humanizeActivity(value: string): string {
  const words = value.replace(/[._-]+/g, " ").trim();
  return words ? `${words[0].toUpperCase()}${words.slice(1)}` : value;
}

export function activitySource(event: Pick<ActivityDto, "action" | "entityType">): ActivitySource {
  const value = `${event.entityType} ${event.action}`;
  if (GENERATION.test(value)) return "generation";
  if (PRODUCTION.test(value)) return "production";
  return "ralphy";
}

export function summarizeActivityRun(detail: ActivityRunDetail): {
  models: string[];
  providers: string[];
  costUsd: number | null;
  durationMs: number | null;
} {
  const models = [...new Set(detail.attempts.flatMap(({ model }) => model ? [model] : []))];
  const providers = [...new Set(detail.attempts.flatMap(({ provider }) => provider ? [provider] : []))];
  const costs = detail.attempts.flatMap(({ costUsd }) => costUsd === null ? [] : [costUsd]);
  const { startedAt, endedAt } = detail.run;
  const durationMs = startedAt === null || endedAt === null ? null : (endedAt - startedAt) * (endedAt < 1_000_000_000_000 ? 1000 : 1);
  return { models, providers, costUsd: costs.length === 0 ? null : costs.reduce((sum, value) => sum + value, 0), durationMs };
}

export function activitySearchText(event: ActivityDto, detail?: ActivityRunDetail): string {
  const summary = detail ? summarizeActivityRun(detail) : null;
  return [event.action, event.entityType, event.entityId, activitySource(event), detail?.run.label, detail?.run.kind, detail?.run.state, ...(summary?.models ?? []), ...(summary?.providers ?? [])]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLocaleLowerCase();
}
