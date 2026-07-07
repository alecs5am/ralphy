// Webhook-trigger secret store + request-validation vocabulary (#520).
//
// Per-trigger secrets live in WORKSPACE-LOCAL ENGINE STATE —
// `.ralphy/workspaces/<ws>/farm/webhook-tokens.json` (next to the #519
// dead-letter store) — NEVER in the workflow graph file: graphs are committed
// and #502-bundled, and cli/lib/bundle.ts stages an explicit allowlist that
// does not include the farm/ state dir, so a token can never leak into a
// bundle. `ralphy workflow lint` additionally rejects secret-looking literals
// on webhook-trigger / http nodes (cli/lib/workflow/env-refs.ts).
//
// Verb: `ralphy farm trigger token <ws> <trigger-id> [--rotate]` — generates
// (or rotates / shows) the token. The app endpoint (studio/server/hooks.ts,
// #506 boundary) READS this store to validate `x-ralphy-token`; the defaults
// below are the shared contract both sides speak.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { workspaceDir } from "../paths.js";

/** Inbound-hook auth header (per-trigger secret from this store). */
export const WEBHOOK_TOKEN_HEADER = "x-ralphy-token";
/** Inbound-hook replay-protection header: unix SECONDS at send time. */
export const WEBHOOK_TIMESTAMP_HEADER = "x-ralphy-timestamp";
/** Default replay window (params.replay_window_s): |now - ts| must be within. */
export const DEFAULT_REPLAY_WINDOW_S = 300;
/** Default rate limit (params.rate_limit): accepted hooks per trigger per hour. */
export const DEFAULT_RATE_LIMIT_PER_HOUR = 12;
/** Inbound payload size cap (bytes) at the endpoint. */
export const WEBHOOK_MAX_BODY_BYTES = 256 * 1024;

export interface TriggerTokenRecord {
  token: string;
  createdAt: string;
  rotatedAt: string | null;
}

export function webhookTokensPath(ws: string): string {
  return path.join(workspaceDir(ws), "farm", "webhook-tokens.json");
}

function readStore(ws: string): Record<string, TriggerTokenRecord> {
  try {
    const raw = JSON.parse(fs.readFileSync(webhookTokensPath(ws), "utf8"));
    return raw && typeof raw === "object" ? (raw as Record<string, TriggerTokenRecord>) : {};
  } catch {
    return {};
  }
}

/** The trigger's current token record, or null when none is provisioned. */
export function readTriggerToken(ws: string, triggerId: string): TriggerTokenRecord | null {
  const rec = readStore(ws)[triggerId];
  return rec && typeof rec.token === "string" && rec.token.length > 0 ? rec : null;
}

/**
 * Ensure a token exists for the trigger (generate on first call); `rotate`
 * replaces it. Returns the live record plus what happened. 256-bit
 * crypto-random, base64url.
 */
export function ensureTriggerToken(
  ws: string,
  triggerId: string,
  opts: { rotate?: boolean } = {},
): { record: TriggerTokenRecord; created: boolean; rotated: boolean } {
  const store = readStore(ws);
  const existing = store[triggerId];
  if (existing && !opts.rotate) return { record: existing, created: false, rotated: false };
  const now = new Date().toISOString();
  const record: TriggerTokenRecord = {
    token: crypto.randomBytes(32).toString("base64url"),
    createdAt: existing?.createdAt ?? now,
    rotatedAt: existing ? now : null,
  };
  store[triggerId] = record;
  const file = webhookTokensPath(ws);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store, null, 2) + "\n");
  return { record, created: !existing, rotated: !!existing };
}
