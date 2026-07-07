// Inbound webhook endpoint (#520) — POST /hooks/<ws>/<trigger-id>.
//
// The app half of the webhook-trigger node type: an external event (a Zapier/
// n8n hook, "new episode uploaded") authenticates with the trigger's SECRET
// TOKEN, passes replay + rate-limit checks, and fires one tick of the graph
// rooted at that trigger — exactly like a schedule firing.
//
// Boundary (#506 rule — studio/ never imports cli/): the VALIDATION half is a
// hand-copy over the same on-disk state the CLI owns (workflows/*.json for the
// trigger node, farm/webhook-tokens.json for the secret — written only by
// `ralphy farm trigger token`), and the EXECUTION half shells out: a DETACHED
// `ralphy farm fire <ws> <trigger-id> --payload <json>` (stdio → the farm log,
// same pattern as startFarm) so the endpoint answers 202 immediately while
// the CLI stays the single engine (journal, budget caps #481, invariant #2).
//
// AUTH: this route intentionally BYPASSES the studio STUDIO_AUTH_TOKEN gate —
// an external webhook sender only holds the per-trigger secret. Headers:
//   • x-ralphy-token      — the trigger's secret (constant-time compare).
//   • x-ralphy-timestamp  — unix SECONDS at send time; must be within the
//     trigger's replay window (params.replay_window_s, default 300).
// Rate limit: params.rate_limit ACCEPTED hooks per trigger per hour (default
// 12), counted in-memory per server process (a restart resets the window —
// conservative default, documented trade-off).

import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { workspaceDir } from "./lib.js";
import { safeEqual } from "./auth.js";
import { farmLogPath } from "./control.js";

// Shared contract with cli/lib/farm/webhook.ts (hand-copied per the boundary
// rule above — keep the two in lockstep).
export const WEBHOOK_TOKEN_HEADER = "x-ralphy-token";
export const WEBHOOK_TIMESTAMP_HEADER = "x-ralphy-timestamp";
export const DEFAULT_REPLAY_WINDOW_S = 300;
export const DEFAULT_RATE_LIMIT_PER_HOUR = 12;
export const WEBHOOK_MAX_BODY_BYTES = 256 * 1024;

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..");
const CLI_ENTRY = path.join(REPO_ROOT, "cli", "index.ts");

interface TriggerNodeInfo {
  workflow: string;
  params: Record<string, unknown>;
}

/** Find the webhook-trigger node <triggerId> across the workspace's graph workflows. */
export function findWebhookTrigger(dataRoot: string, ws: string, triggerId: string): TriggerNodeInfo | null {
  const dir = path.join(workspaceDir(dataRoot, ws), "workflows");
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return null;
  }
  for (const f of files) {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    } catch {
      continue;
    }
    if (!Array.isArray(raw.nodes)) continue; // linear (#478) — no triggers
    for (const n of raw.nodes) {
      if (n && typeof n === "object" && (n as Record<string, unknown>).type === "webhook-trigger" && (n as Record<string, unknown>).id === triggerId) {
        const params = (n as Record<string, unknown>).params;
        return {
          workflow: f.replace(/\.json$/, ""),
          params: params && typeof params === "object" ? (params as Record<string, unknown>) : {},
        };
      }
    }
  }
  return null;
}

/** The trigger's provisioned token (farm/webhook-tokens.json), or null. */
export function readTriggerToken(dataRoot: string, ws: string, triggerId: string): string | null {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(workspaceDir(dataRoot, ws), "farm", "webhook-tokens.json"), "utf8"),
    ) as Record<string, { token?: unknown }>;
    const token = raw?.[triggerId]?.token;
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

// ─── Rate limiter (in-memory sliding window per trigger) ─────────────────────

const accepted = new Map<string, number[]>();

/** Test seam: clear the in-memory rate-limit window. */
export function resetWebhookRateLimit(): void {
  accepted.clear();
}

function rateLimited(key: string, limitPerHour: number, nowMs: number): boolean {
  const windowStart = nowMs - 3_600_000;
  const recent = (accepted.get(key) ?? []).filter((t) => t > windowStart);
  accepted.set(key, recent);
  return recent.length >= limitPerHour;
}

function recordAccepted(key: string, nowMs: number): void {
  accepted.set(key, [...(accepted.get(key) ?? []), nowMs]);
}

// ─── Decision (pure — the route calls this, tests call it directly) ──────────

export interface HookDecision {
  status: number;
  body: Record<string, unknown>;
  /** Set on 202: which workflow to fire. */
  workflow?: string;
}

export function decideWebhook(
  dataRoot: string,
  ws: string,
  triggerId: string,
  input: { token: string | null; timestamp: string | null; nowMs?: number },
): HookDecision {
  if (!fs.existsSync(workspaceDir(dataRoot, ws))) {
    return { status: 404, body: { error: "unknown workspace" } };
  }
  const trigger = findWebhookTrigger(dataRoot, ws, triggerId);
  if (!trigger) {
    return { status: 404, body: { error: `no webhook-trigger node "${triggerId}" in workspace "${ws}" graph workflows` } };
  }

  const expected = readTriggerToken(dataRoot, ws, triggerId);
  if (!expected) {
    return {
      status: 401,
      body: { error: `no token provisioned for trigger "${triggerId}" — run \`ralphy farm trigger token ${ws} ${triggerId}\`` },
    };
  }
  if (!input.token || !safeEqual(input.token, expected)) {
    return { status: 401, body: { error: `bad or missing ${WEBHOOK_TOKEN_HEADER} header` } };
  }

  // Replay protection: unix-seconds timestamp within the trigger's window.
  const nowMs = input.nowMs ?? Date.now();
  const windowS =
    typeof trigger.params.replay_window_s === "number" && trigger.params.replay_window_s > 0
      ? trigger.params.replay_window_s
      : DEFAULT_REPLAY_WINDOW_S;
  const ts = Number(input.timestamp);
  if (!input.timestamp || !Number.isFinite(ts)) {
    return { status: 401, body: { error: `missing or non-numeric ${WEBHOOK_TIMESTAMP_HEADER} header (unix seconds)` } };
  }
  if (Math.abs(nowMs / 1000 - ts) > windowS) {
    return { status: 401, body: { error: `stale ${WEBHOOK_TIMESTAMP_HEADER} — outside the ${windowS}s replay window` } };
  }

  // Rate limit ACCEPTED hooks (each one fires a tick that can spend).
  const limit =
    typeof trigger.params.rate_limit === "number" && trigger.params.rate_limit > 0
      ? trigger.params.rate_limit
      : DEFAULT_RATE_LIMIT_PER_HOUR;
  const key = `${ws}/${triggerId}`;
  if (rateLimited(key, limit, nowMs)) {
    return { status: 429, body: { error: `rate limit exceeded — ${limit} hooks/hour for trigger "${triggerId}"` } };
  }
  recordAccepted(key, nowMs);

  return {
    status: 202,
    workflow: trigger.workflow,
    body: { accepted: true, workspace: ws, trigger: triggerId, workflow: trigger.workflow },
  };
}

// ─── The route handler ───────────────────────────────────────────────────────

/** Spawn seam so tests can capture the fire instead of spawning the real CLI. */
export type FireFn = (dataRoot: string, ws: string, triggerId: string, payloadJson: string) => void;

/** DETACHED `ralphy farm fire` — stdio to the farm log (same pattern as startFarm). */
export const spawnFarmFire: FireFn = (dataRoot, ws, triggerId, payloadJson) => {
  const log = farmLogPath(dataRoot, ws);
  fs.mkdirSync(path.dirname(log), { recursive: true });
  const fd = fs.openSync(log, "a");
  try {
    const rootDir = path.dirname(dataRoot);
    const env: Record<string, string | undefined> = { ...process.env, NO_COLOR: "1" };
    delete env.FORCE_COLOR;
    const child = spawn(
      process.execPath,
      [CLI_ENTRY, "--cwd", rootDir, "farm", "fire", ws, triggerId, "--payload", payloadJson],
      { cwd: rootDir, detached: true, stdio: ["ignore", fd, fd], env },
    );
    child.unref();
  } finally {
    fs.closeSync(fd);
  }
};

export async function handleWebhook(
  dataRoot: string,
  ws: string,
  triggerId: string,
  req: Request,
  fire: FireFn = spawnFarmFire,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > WEBHOOK_MAX_BODY_BYTES) {
    return { status: 413, body: { error: `payload over the ${WEBHOOK_MAX_BODY_BYTES}-byte cap` } };
  }
  let payload: unknown = {};
  if (bytes.byteLength > 0) {
    try {
      payload = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return { status: 400, body: { error: "body is not valid JSON" } };
    }
  }
  const decision = decideWebhook(dataRoot, ws, triggerId, {
    token: req.headers.get(WEBHOOK_TOKEN_HEADER),
    timestamp: req.headers.get(WEBHOOK_TIMESTAMP_HEADER),
  });
  if (decision.status !== 202) return { status: decision.status, body: decision.body };
  fire(dataRoot, ws, triggerId, JSON.stringify(payload));
  return { status: 202, body: decision.body };
}
