import fs from "node:fs";
import pageSource from "./page.html" with { type: "text" };
import { accountsSnapshot } from "./accounts.js";
import { activitySnapshot } from "./activity.js";
import { formatRows, panelNiches, pickVideos, risingSignals, topVideos, withLabels, type PanelNiche } from "./trends.js";
import { getWorkspaceByReference, listWorkspaces } from "../store/scopes.js";
import { listNiches } from "../store/trend-niches.js";
import { trendCorpusAsOf } from "../store/trends.js";

// Bun types *.html imports as an HTMLBundle; the text import attribute makes it the page source.
const page = pageSource as unknown as string;

/** Runs `ralphy --json <args>` against the panel's data root and returns the parsed stdout. */
export type CliRunner = (args: string[]) => Promise<unknown>;

export type PanelServerOptions = {
  dataRoot: string;
  port: number;
  /** Workspace id or slug holding the trend corpus; detected when omitted. */
  trendWorkspace?: string;
  version: string;
  runCli?: CliRunner;
};

export type PanelServer = { url: string; port: number; trendWorkspace: { id: string; slug: string } | null; stop(): void };

/** The command that re-enters this same ralphy build: the binary itself, or bun plus the in-tree entry. */
export function selfCommand(): string[] {
  const entry = process.argv[1];
  const virtual = !entry || entry.includes("$bunfs") || entry.includes("~BUN");
  if (!virtual && /\.(ts|js|mjs)$/.test(entry) && fs.existsSync(entry)) return [process.execPath, entry];
  return [process.execPath];
}

export function cliRunner(dataRoot: string): CliRunner {
  return async (args) => {
    const proc = Bun.spawn([...selfCommand(), "--json", "--root", dataRoot, ...args], {
      stdout: "pipe", stderr: "pipe", stdin: "ignore", env: process.env,
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
    ]);
    if (code !== 0) {
      let message = (stderr.trim() || stdout.trim() || `exit ${code}`).slice(0, 2000);
      let hint: string | undefined;
      try {
        const body = JSON.parse(message);
        message = body.error?.message ?? message;
        hint = body.error?.hint;
      } catch {}
      throw Object.assign(new Error(message), { hint });
    }
    return JSON.parse(stdout);
  };
}

/** The Workspace whose trend corpus the panel shows: the named one, else `trend-corpus`, else the first with niches. */
export function detectTrendWorkspace(reference?: string): { id: string; slug: string } | null {
  if (reference) {
    const named = getWorkspaceByReference(reference);
    return named ? { id: named.id, slug: named.slug } : null;
  }
  const preferred = getWorkspaceByReference("trend-corpus");
  if (preferred && listNiches({ workspaceId: preferred.id }).length) return { id: preferred.id, slug: preferred.slug };
  let cursor: string | null = null;
  do {
    const page = listWorkspaces({ cursor, limit: 100 });
    for (const workspace of page.items) {
      if (listNiches({ workspaceId: workspace.id }).length) return { id: workspace.id, slug: workspace.slug };
    }
    cursor = page.nextCursor ?? null;
  } while (cursor);
  return null;
}

type Entry = {
  value?: unknown;
  computedAt?: number;
  error?: Error & { hint?: string };
  running?: Promise<void>;
  startedAt?: number;
  forced?: boolean;
};

/**
 * Stale-while-revalidate results for the slow trend views. A cached value is
 * answered at once and refreshed in the background after `ttlMs`; a missing or
 * explicitly recomputed one answers 202 until the child process finishes.
 */
export class TaskCache {
  private entries = new Map<string, Entry>();
  private durations = new Map<string, number>();

  constructor(private now: () => number = Date.now) {}

  get(input: { key: string; kind: string; ttlMs: number; fresh: boolean; run: () => Promise<unknown>; message: string; defaultMs: number }):
    { status: 200 | 202 | 502; body: unknown } {
    const entry = this.entries.get(input.key) ?? {};
    this.entries.set(input.key, entry);
    const start = (forced: boolean) => {
      if (entry.running) { entry.forced ||= forced; return; }
      entry.startedAt = this.now();
      entry.forced = forced;
      entry.running = input.run().then(
        (value) => { entry.value = value; entry.computedAt = this.now(); entry.error = undefined; },
        (error) => { entry.error = error instanceof Error ? error : new Error(String(error)); },
      ).finally(() => {
        this.durations.set(input.kind, this.now() - (entry.startedAt ?? this.now()));
        entry.running = undefined;
        entry.forced = false;
      });
    };
    if (input.fresh) start(true);
    if (entry.value !== undefined && !(entry.running && entry.forced)) {
      if (!entry.running && this.now() - (entry.computedAt ?? 0) > input.ttlMs) start(false);
      return { status: 200, body: { ...(entry.value as object), computedAt: entry.computedAt } };
    }
    if (!entry.running && entry.error) {
      const error = entry.error;
      entry.error = undefined;
      return { status: 502, body: { error: { message: error.message, hint: error.hint ?? null } } };
    }
    if (!entry.running) start(false);
    return {
      status: 202,
      body: { computing: true, startedAt: entry.startedAt, expectedMs: this.durations.get(input.kind) ?? input.defaultMs, message: input.message },
    };
  }

  /** Settle every running task (tests and shutdown). */
  async idle(): Promise<void> {
    await Promise.all([...this.entries.values()].map((entry) => entry.running));
  }
}

const SINCE = new Set(["3d", "7d", "14d", "30d", "90d"]);
const BY = new Set(["outlier", "views", "momentum"]);
const PLATFORMS = new Set(["tiktok", "youtube", "instagram"]);
const LABELS = new Set(["breakout", "outlier", "strong"]);
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MINUTE = 60_000;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function fail(status: number, message: string, hint?: string) {
  return json({ error: { message, hint: hint ?? null } }, status);
}

/** Build the request handler; exported separately so tests can drive it without a socket. */
export function panelHandler(input: { dataRoot: string; version: string; trend: { id: string; slug: string } | null; runCli: CliRunner; cache?: TaskCache }) {
  const cache = input.cache ?? new TaskCache();
  const trend = input.trend;
  let niches: { at: number; rows: PanelNiche[] } | null = null;
  const nicheRows = () => {
    if (!trend) return [];
    if (!niches || Date.now() - niches.at > 5 * MINUTE) niches = { at: Date.now(), rows: panelNiches(trend.id) };
    return niches.rows;
  };
  const trendArgs = (args: string[]) => ["--workspace", trend!.id, "trends", ...args];

  const views: Record<string, (q: URLSearchParams, niche: string, fresh: boolean) => { status: number; body: unknown }> = {
    picks: (_q, niche, fresh) => cache.get({
      key: `report:${niche}`, kind: "report", ttlMs: 30 * MINUTE, fresh, defaultMs: 8_000,
      message: "Building the niche report", run: async () => report(niche),
    }),
    formats: (_q, niche, fresh) => cache.get({
      key: `report:${niche}`, kind: "report", ttlMs: 30 * MINUTE, fresh, defaultMs: 8_000,
      message: "Building the niche report", run: async () => report(niche),
    }),
    rising: (_q, niche, fresh) => cache.get({
      key: `signals:${niche}`, kind: "signals", ttlMs: 30 * MINUTE, fresh, defaultMs: 20_000,
      message: "Computing signals", run: async () => {
        const raw = (await input.runCli(trendArgs(["signals", "--niche", niche, "--limit", "15"]))) as Record<string, any>;
        const rising = risingSignals(raw);
        return {
          groups: rising.groups.map((group) => ({ ...group, items: withLabels(trend!.id, group.items) })),
          formats: rising.formats,
          notes: Array.isArray(raw.notes) ? raw.notes : [],
        };
      },
    }),
    top: (q, niche, fresh) => {
      const since = SINCE.has(q.get("since") ?? "") ? q.get("since")! : "30d";
      const by = BY.has(q.get("by") ?? "") ? q.get("by")! : "outlier";
      const args = ["top", "--niche", niche, "--since", since, "--by", by, "--limit", "50"];
      if (PLATFORMS.has(q.get("platform") ?? "")) args.push("--platform", q.get("platform")!);
      if (LABELS.has(q.get("label") ?? "")) args.push("--label", q.get("label")!);
      return cache.get({
        key: `top:${args.join(" ")}`, kind: "top", ttlMs: 10 * MINUTE, fresh, defaultMs: 6_000,
        message: "Ranking videos", run: async () => {
          const raw = (await input.runCli(trendArgs(args))) as Record<string, any>;
          return { items: topVideos(raw), notes: Array.isArray(raw.notes) ? raw.notes : [] };
        },
      });
    },
  };
  // One niche report feeds both Picks and Formats.
  const report = async (niche: string) => {
    const raw = (await input.runCli(trendArgs(["niche", "report", niche]))) as Record<string, any>;
    const notes = Array.isArray(raw.notes) ? raw.notes.slice(0, 4) : [];
    return { items: withLabels(trend!.id, pickVideos(raw)), ...formatRows(raw), notes };
  };

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const host = request.headers.get("host") ?? "";
    // Refuse DNS-rebinding hosts: only loopback names may reach the panel.
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) return fail(403, "Forbidden host");
    if (request.method !== "GET") return fail(405, "The panel is read-only");
    if (url.pathname === "/") {
      return new Response(page, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
    if (url.pathname === "/api/health") return json({ app: "ralphy-panel", version: input.version, root: input.dataRoot });
    try {
      if (url.pathname === "/api/activity") return json(activitySnapshot());
      if (url.pathname === "/api/accounts") return json(accountsSnapshot());
      if (url.pathname === "/api/overview") {
        return json({
          root: input.dataRoot,
          trend: trend ? { workspace: trend, niches: nicheRows(), dataAsOf: isoOrNull(trendCorpusAsOf(trend.id)) } : null,
        });
      }
      const view = /^\/api\/trends\/(\w+)$/.exec(url.pathname)?.[1];
      if (view && views[view]) {
        if (!trend) return fail(404, "No trend corpus in this library", "Import one with `ralphy workspace import` or start a niche with `ralphy trends niche init`.");
        const niche = url.searchParams.get("niche") ?? "";
        if (!SLUG.test(niche) || !nicheRows().some((row) => row.slug === niche)) return fail(404, `Unknown niche: ${niche}`);
        const result = views[view](url.searchParams, niche, url.searchParams.get("fresh") === "1");
        const body = result.status === 200 && view === "formats"
          ? pickKeys(result.body, ["formats", "hooks", "subNiches", "notes", "computedAt"])
          : result.status === 200 && view === "picks" ? pickKeys(result.body, ["items", "notes", "computedAt"]) : result.body;
        return json(body, result.status);
      }
      return fail(404, "Not found");
    } catch (error) {
      return fail(500, error instanceof Error ? error.message : String(error));
    }
  };
}

function isoOrNull(ms: number | null) {
  return ms == null ? null : new Date(ms).toISOString();
}

function pickKeys(body: unknown, keys: string[]) {
  const source = body as Record<string, unknown>;
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}

/** Start the panel on 127.0.0.1 and warm the default trend views in the background. */
export function startPanelServer(options: PanelServerOptions): PanelServer {
  const trend = detectTrendWorkspace(options.trendWorkspace);
  const cache = new TaskCache();
  const handler = panelHandler({
    dataRoot: options.dataRoot, version: options.version, trend, cache,
    runCli: options.runCli ?? cliRunner(options.dataRoot),
  });
  const server = Bun.serve({ hostname: "127.0.0.1", port: options.port, idleTimeout: 60, fetch: handler });
  const url = `http://127.0.0.1:${server.port ?? options.port}/`;
  if (trend) {
    // Warm every niche report one child process at a time, so any niche opens instantly.
    const host = { host: `127.0.0.1:${server.port ?? options.port}` };
    void (async () => {
      for (const niche of panelNiches(trend.id)) {
        await handler(new Request(`${url}api/trends/picks?niche=${niche.slug}`, { headers: host }));
        await cache.idle();
      }
    })();
  }
  return { url, port: server.port ?? options.port, trendWorkspace: trend, stop: () => server.stop(true) };
}
