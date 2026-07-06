// Apify connector (#500) — the `actor` ingestion backend: run an actor by id
// with an input, poll the run, fetch the dataset items.
//
// THIS IS THE ONLY SOURCE FILE PERMITTED TO READ `APIFY_TOKEN` OR HIT
// `api.apify.com` (AGENTS.md invariant #1, extended for #500 the same way
// fal.ts was for #402). The agents-md invariants test allowlists exactly this
// file. `APIFY_TOKEN` is Apify's standard env-var convention (apify-cli / SDK).
//
// Like firecrawl.ts: NOT registered in the provider registry — ingestion is
// not a generation Capability — and it throws (never process.exit()s) so the
// workflow executors surface structured errors. HTTP is injectable
// (`fetchImpl`) so tests run with zero network.

import { TerminalProviderError } from "./shared.js";
import type { FetchLike } from "./firecrawl.js";

const LABEL = "Apify";
const ENV_VAR = "APIFY_TOKEN";
const SIGNUP_URL = "https://console.apify.com/account/integrations";
const API_BASE = "https://api.apify.com/v2";

/** True iff the connector's token is present. */
export function apifyAvailable(): boolean {
  return Boolean(process.env.APIFY_TOKEN);
}

function requireKey(): void {
  if (!apifyAvailable()) {
    throw new TerminalProviderError(
      `${LABEL}: ${ENV_VAR} is not set. Get a token at ${SIGNUP_URL} and export it.`,
    );
  }
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.APIFY_TOKEN!}`,
    "Content-Type": "application/json",
  };
}

async function request<T>(url: string, init: RequestInit, fetchImpl: FetchLike): Promise<T> {
  requireKey();
  const resp = await fetchImpl(url, { ...init, headers: authHeaders() });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const message = `apify ${init.method ?? "GET"} ${url} ${resp.status}: ${text.slice(0, 300)}`;
    if (resp.status >= 400 && resp.status < 500) throw new TerminalProviderError(message);
    throw new Error(message);
  }
  return (await resp.json()) as T;
}

/** "user/actor-name" → the path-safe "user~actor-name" form the REST API expects. */
const actorPath = (id: string) => id.replace(/\//g, "~");

type ApifyRun = { id?: string; status?: string; defaultDatasetId?: string };

const TERMINAL_FAILURES = new Set(["FAILED", "ABORTED", "ABORTING", "TIMED-OUT", "TIMED_OUT"]);

/**
 * Run an actor and return its dataset items: POST /acts/<id>/runs → poll
 * GET /actor-runs/<runId> until SUCCEEDED → GET /datasets/<id>/items.
 */
export async function apifyRunActor(opts: {
  actorId: string;
  input?: unknown;
  pollIntervalMs?: number;
  pollMaxAttempts?: number;
  fetchImpl?: FetchLike;
}): Promise<unknown[]> {
  const fetchImpl = opts.fetchImpl ?? (fetch as FetchLike);
  const interval = opts.pollIntervalMs ?? 5_000;
  const max = opts.pollMaxAttempts ?? 120;

  const submit = await request<{ data?: ApifyRun }>(
    `${API_BASE}/acts/${actorPath(opts.actorId)}/runs`,
    { method: "POST", body: JSON.stringify(opts.input ?? {}) },
    fetchImpl,
  );
  let run = submit.data ?? {};
  if (!run.id) {
    throw new TerminalProviderError(
      `apify actor run submit returned no run id (actor=${opts.actorId}). Raw: ${JSON.stringify(submit).slice(0, 200)}`,
    );
  }

  for (let attempt = 1; (run.status ?? "") !== "SUCCEEDED"; attempt += 1) {
    if (TERMINAL_FAILURES.has(run.status ?? "")) {
      throw new TerminalProviderError(`apify actor run ${run.status} (actor=${opts.actorId})`);
    }
    if (attempt > max) {
      throw new Error(
        `apify actor run did not finish after ${max} polls (${interval}ms each); last status: ${run.status}`,
      );
    }
    await new Promise((r) => setTimeout(r, interval));
    const poll = await request<{ data?: ApifyRun }>(
      `${API_BASE}/actor-runs/${run.id}`,
      { method: "GET" },
      fetchImpl,
    );
    run = { ...run, ...poll.data };
  }

  if (!run.defaultDatasetId) {
    throw new TerminalProviderError(
      `apify actor run succeeded but has no defaultDatasetId (actor=${opts.actorId})`,
    );
  }
  const items = await request<unknown>(
    `${API_BASE}/datasets/${run.defaultDatasetId}/items?format=json&clean=true`,
    { method: "GET" },
    fetchImpl,
  );
  return Array.isArray(items) ? items : [];
}
