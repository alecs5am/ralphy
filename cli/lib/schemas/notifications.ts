// Farm notifications config schema (#518) — the per-workspace `notifications`
// block on workspace.json (mirrors the `trust` block, cli/lib/trust.ts).
//
// QUIET BY DEFAULT: an absent `notifications` block (or `enabled: false`) means
// NO notifications ever fire — the farm stays silent until an operator opts in.
// Malformed values degrade to safe defaults (`.catch`) so a hand-edited
// workspace.json never crashes the farm; a bad channel just disables itself.
//
// Two channels v1: a generic `webhook` (POST JSON to a configured URL) and
// `telegram` (bot token via env var, chat id from config — connector
// discipline, invariant #1). Email is deliberately OUT of scope v1 (SMTP
// config burden) — noted here so a future channel slots in beside these.
//
// The event → channel mapping is per event kind: each trigger event names the
// channels it fires on. A `daily-digest` pseudo-event carries the digest's
// send time. Bundled defaults ride the #502 manifest (bundle.ts) but stay
// quiet unless the bundle author opted in.

import { z } from "zod";

/** The notifier trigger events (the runner's journal events + the digest). */
export const NOTIFY_EVENTS = [
  "run-parked", // a run parked for human approval
  "budget-halt", // a budget-guard halt (halted-budget)
  "run-failed", // a run halted on failure (halted-failure)
  "node-quarantined", // #519 dead-letter quarantine
  "promotion-suggested", // trust-ladder promotion suggestion
  "daily-digest", // the produced/published/spend/needs-you roll-up
] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

/** The concrete channel kinds a notification can go out on. */
export const NOTIFY_CHANNELS = ["webhook", "telegram"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

/** Generic webhook channel — POST the notification JSON to `url`. */
export const WebhookChannelSchema = z.object({
  url: z.string().url(),
});
export type WebhookChannelConfig = z.infer<typeof WebhookChannelSchema>;

/**
 * Telegram channel — the bot token is NEVER stored here (connector discipline,
 * invariant #1): it is read from TELEGRAM_BOT_TOKEN inside the sanctioned
 * notifier connector only. Config carries the chat id (and an optional env-var
 * name override for a multi-bot setup, still resolved inside the connector).
 */
export const TelegramChannelSchema = z.object({
  chatId: z.string().min(1),
  /** Override the bot-token env var name (default TELEGRAM_BOT_TOKEN). */
  tokenEnvVar: z.string().min(1).optional(),
});
export type TelegramChannelConfig = z.infer<typeof TelegramChannelSchema>;

export const NotificationsConfigSchema = z.object({
  /** Master switch — false (the default) means the farm never notifies. */
  enabled: z.boolean().catch(false).default(false),
  /** Dashboard base URL for approval deep-links (e.g. https://studio.example.com). */
  dashboardBaseUrl: z.string().url().optional(),
  /** Channel configs (only the configured ones can be a mapping target). */
  channels: z
    .object({
      webhook: WebhookChannelSchema.optional(),
      telegram: TelegramChannelSchema.optional(),
    })
    .catch({})
    .default({}),
  /** Event → the channels it fires on. An unlisted event fires on nothing. */
  events: z
    .record(z.enum(NOTIFY_EVENTS), z.array(z.enum(NOTIFY_CHANNELS)))
    .catch({})
    .default({}),
  /** HH:MM (24h, workspace-local) the daily digest sends. Default 09:00. */
  digestTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .catch("09:00")
    .default("09:00"),
});
export type NotificationsConfig = z.infer<typeof NotificationsConfigSchema>;

/** Parse the `notifications` block (defaults + `.catch` = never throws in the farm). */
export function parseNotificationsConfig(raw: unknown): NotificationsConfig {
  return NotificationsConfigSchema.parse(raw ?? {});
}

export const DEFAULT_NOTIFICATIONS_CONFIG: NotificationsConfig = NotificationsConfigSchema.parse({});

/**
 * The channels a given event should fire on, honoring the master switch AND
 * requiring the channel to be configured (a mapping to `telegram` with no
 * telegram channel config resolves to nothing). Empty = do not notify.
 */
export function channelsForEvent(config: NotificationsConfig, event: NotifyEvent): NotifyChannel[] {
  if (!config.enabled) return [];
  const wanted = config.events[event] ?? [];
  return wanted.filter((ch) => config.channels[ch] !== undefined);
}
