// Farm operator notifications (#518) — the pluggable notifier fired on the
// farm's needs-a-human moments (run parked for approval, budget halt, run
// failed, node quarantined, trust promotion suggested) plus a daily digest.
//
// ── Connector discipline (AGENTS.md invariant #1) ────────────────────────────
// THIS IS THE ONLY SOURCE FILE PERMITTED TO READ `TELEGRAM_BOT_TOKEN` (the
// Telegram bot token) OR HIT `api.telegram.org`. The agents-md invariants test
// file-scopes the env var to exactly this file, the same way FAL_KEY is scoped
// to fal.ts and FIRECRAWL_API_KEY to firecrawl.ts. The chat id is config
// (workspace.json `notifications` block); the SECRET is env-only. The generic
// webhook channel POSTs to a user-configured URL (no fixed host, no key — the
// URL itself is the credential), same posture as the self-hosted Postiz
// connector (D-05).
//
// ── Failure isolation ────────────────────────────────────────────────────────
// A notification NEVER fails the run: every dispatch is wrapped so a throwing
// or slow channel is logged and swallowed. The farm's job is to make content;
// telling the operator is best-effort. `notifyFarmEvent` returns a per-channel
// result list for observability/tests but never rejects.
//
// ── Email is OUT of scope v1 ─────────────────────────────────────────────────
// (SMTP config burden — issue #518 "Notes"). A future `email` channel slots in
// beside webhook/telegram: add a schema in schemas/notifications.ts and a
// `sendEmail` here; nothing else changes.
//
// HTTP is injectable (`fetchImpl`) so tests run with zero network.

import { readNotificationsConfig } from "../notifications.js";
import {
  channelsForEvent,
  type NotificationsConfig,
  type NotifyChannel,
  type NotifyEvent,
} from "../schemas/notifications.js";

/** Default env var holding the Telegram bot token (overridable per config). */
const DEFAULT_TELEGRAM_TOKEN_ENV = "TELEGRAM_BOT_TOKEN";
const TELEGRAM_API_BASE = "https://api.telegram.org";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** The structured notification payload — the webhook body + the digest source. */
export interface FarmNotification {
  event: NotifyEvent;
  workspace: string;
  /** Human-readable one-liner (also the Telegram message body). */
  title: string;
  /** Longer detail (digest body / halt reason / quarantine hint). */
  body?: string;
  /** The run this is about, when event-scoped. */
  runId?: string | null;
  /** The node this is about, when event-scoped. */
  node?: string | null;
  /** Deep-link into the dashboard inbox item (approval events). */
  url?: string | null;
  /** Free-form structured extras (the digest report, quarantine class, …). */
  data?: Record<string, unknown>;
  /** ISO timestamp the notification was assembled. */
  ts: string;
}

/** One channel's delivery outcome (never thrown — always returned). */
export interface NotifyResult {
  channel: NotifyChannel;
  ok: boolean;
  /** Present on failure — the swallowed error message. */
  error?: string;
  /** HTTP status when the channel got that far. */
  status?: number;
}

// ─── Channels ─────────────────────────────────────────────────────────────────

/** POST the notification JSON to the configured webhook URL. */
async function sendWebhook(
  url: string,
  n: FarmNotification,
  fetchImpl: FetchLike,
): Promise<NotifyResult> {
  const resp = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(n),
  });
  return { channel: "webhook", ok: resp.ok, status: resp.status };
}

/**
 * Send the notification as a Telegram message. The bot token is read HERE
 * (invariant #1: the ONLY file allowed to read TELEGRAM_BOT_TOKEN) from the
 * config-named env var (default TELEGRAM_BOT_TOKEN); the chat id is config.
 */
async function sendTelegram(
  chatId: string,
  tokenEnvVar: string | undefined,
  n: FarmNotification,
  fetchImpl: FetchLike,
): Promise<NotifyResult> {
  // Default reads the literal TELEGRAM_BOT_TOKEN (the invariant-#1 file-scope
  // guard asserts THIS file reads it — a bare `process.env[envVar]` would make
  // the allowlist vacuous); a config override resolves the named var too.
  const envVar = tokenEnvVar || DEFAULT_TELEGRAM_TOKEN_ENV;
  const token = tokenEnvVar ? process.env[envVar] : process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { channel: "telegram", ok: false, error: `${envVar} is not set — export the bot token to enable Telegram notifications` };
  }
  const lines = [n.title, n.body ?? "", n.url ? `Open: ${n.url}` : ""].filter(Boolean);
  const resp = await fetchImpl(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: lines.join("\n"), disable_web_page_preview: true }),
  });
  return { channel: "telegram", ok: resp.ok, status: resp.status };
}

// ─── Dispatch ──────────────────────────────────────────────────────────────────

export interface NotifyOptions {
  /** Injected config (tests / callers that already loaded it); else read from workspace.json. */
  config?: NotificationsConfig;
  fetchImpl?: FetchLike;
  /** Where a swallowed channel error is reported (default: console.warn). */
  onError?: (channel: NotifyChannel, error: string) => void;
}

/**
 * Deliver one notification across every channel the workspace maps the event
 * to. FAILURE-SAFE: a throwing/failing channel is caught, logged via onError,
 * and reported as `{ ok: false }` — this function never rejects, so a runner
 * emit side-effect can `await` it without risking the run. Returns [] when the
 * event maps to no channels (quiet by default).
 */
export async function notifyFarmEvent(n: FarmNotification, opts: NotifyOptions = {}): Promise<NotifyResult[]> {
  const config = opts.config ?? readNotificationsConfig(n.workspace);
  const channels = channelsForEvent(config, n.event);
  if (channels.length === 0) return [];
  const fetchImpl = opts.fetchImpl ?? fetch;
  const onError = opts.onError ?? ((ch, e) => console.warn(`notify: ${ch} channel failed (${e}) — run continues`));

  const results: NotifyResult[] = [];
  for (const channel of channels) {
    try {
      let r: NotifyResult;
      if (channel === "webhook" && config.channels.webhook) {
        r = await sendWebhook(config.channels.webhook.url, n, fetchImpl);
      } else if (channel === "telegram" && config.channels.telegram) {
        const tg = config.channels.telegram;
        r = await sendTelegram(tg.chatId, tg.tokenEnvVar, n, fetchImpl);
      } else {
        continue; // channelsForEvent already filtered unconfigured channels
      }
      if (!r.ok) onError(channel, r.error ?? `HTTP ${r.status ?? "?"}`);
      results.push(r);
    } catch (e) {
      const error = (e as Error).message;
      onError(channel, error);
      results.push({ channel, ok: false, error });
    }
  }
  return results;
}

/**
 * Build the dashboard deep-link for an approval-parked run's inbox item. Uses
 * the configured `dashboardBaseUrl` when set, else a sane relative path the
 * dashboard resolves against its own origin. The hash route mirrors Studio's
 * run selection (`#<ws>/run/<runId>`).
 */
export function approvalDeepLink(
  config: NotificationsConfig,
  workspace: string,
  runId: string,
): string {
  const base = config.dashboardBaseUrl?.replace(/\/+$/, "") ?? "";
  return `${base}/#${workspace}/run/${runId}`;
}
