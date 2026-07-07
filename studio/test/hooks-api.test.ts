// Inbound webhook endpoint (#520) — POST /hooks/<ws>/<trigger-id>.
//
// decideWebhook is exercised directly (pure — injected clock, no spawn) for
// auth / replay / rate-limit granularity; handleWebhook with an injected fire
// fn covers the payload path; ONE end-to-end POST hits the real route, which
// spawns the real `bun cli/index.ts farm fire` detached against the fixture
// data root and completes a free-node graph (webhook-trigger -> transform,
// ZERO model calls) — asserted by polling the run journal.

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { startStudio } from "../server/index.js";
import {
  decideWebhook,
  handleWebhook,
  resetWebhookRateLimit,
  WEBHOOK_TOKEN_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from "../server/hooks.js";

const TOKEN = "hook-secret-token-0123456789abcdef";
const STUDIO_TOKEN = "studio-admin-token";
const E2E_MS = 30_000;

let tmpRoot: string;
let dataRoot: string;
let open: ReturnType<typeof startStudio>;
let authed: ReturnType<typeof startStudio>;
let openBase: string;
let authBase: string;

const GRAPH = {
  version: "2.0",
  name: "hooked",
  nodes: [
    {
      id: "on-upload",
      type: "webhook-trigger",
      params: { map: { title: "episode.title" }, rate_limit: 50 },
    },
    { id: "note", type: "transform", in: { items: "on-upload.out" }, params: { pick: "items" } },
    { id: "limited", type: "webhook-trigger", params: { rate_limit: 2, replay_window_s: 60 } },
  ],
};

function seed(root: string) {
  const ws = path.join(root, ".ralphy", "workspaces", "default");
  fs.mkdirSync(path.join(ws, "workflows"), { recursive: true });
  fs.mkdirSync(path.join(ws, "farm"), { recursive: true });
  fs.writeFileSync(path.join(ws, "workspace.json"), JSON.stringify({ name: "Default", slug: "default" }));
  fs.writeFileSync(path.join(ws, "workflows", "hooked.json"), JSON.stringify(GRAPH, null, 2));
  fs.writeFileSync(
    path.join(ws, "farm", "webhook-tokens.json"),
    JSON.stringify({
      "on-upload": { token: TOKEN, createdAt: "2026-07-07T00:00:00.000Z", rotatedAt: null },
      limited: { token: TOKEN, createdAt: "2026-07-07T00:00:00.000Z", rotatedAt: null },
    }),
  );
}

const nowS = () => String(Math.floor(Date.now() / 1000));

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-api-test-"));
  dataRoot = path.join(tmpRoot, ".ralphy");
  seed(tmpRoot);
  delete process.env.RALPHY_STUDIO_ROOT;
  open = startStudio({ port: 0, rootStartDir: tmpRoot, authToken: null });
  authed = startStudio({ port: 0, rootStartDir: tmpRoot, authToken: STUDIO_TOKEN, hostname: "127.0.0.1" });
  openBase = `http://127.0.0.1:${open.server.port}`;
  authBase = `http://127.0.0.1:${authed.server.port}`;
});

afterAll(() => {
  open.stop();
  authed.stop();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => resetWebhookRateLimit());

describe("decideWebhook — auth + replay + rate limit", () => {
  test("unknown workspace / trigger are 404", () => {
    expect(decideWebhook(dataRoot, "nope", "on-upload", { token: TOKEN, timestamp: nowS() }).status).toBe(404);
    expect(decideWebhook(dataRoot, "default", "ghost", { token: TOKEN, timestamp: nowS() }).status).toBe(404);
  });

  test("missing / wrong token is 401; unprovisioned trigger names the fix", () => {
    const noToken = decideWebhook(dataRoot, "default", "on-upload", { token: null, timestamp: nowS() });
    expect(noToken.status).toBe(401);
    const bad = decideWebhook(dataRoot, "default", "on-upload", { token: "wrong", timestamp: nowS() });
    expect(bad.status).toBe(401);

    // Temporarily unprovision to hit the "no token" branch.
    const store = path.join(dataRoot, "workspaces", "default", "farm", "webhook-tokens.json");
    const saved = fs.readFileSync(store, "utf8");
    fs.writeFileSync(store, "{}");
    try {
      const unprovisioned = decideWebhook(dataRoot, "default", "on-upload", { token: TOKEN, timestamp: nowS() });
      expect(unprovisioned.status).toBe(401);
      expect(String(unprovisioned.body.error)).toContain("farm trigger token");
    } finally {
      fs.writeFileSync(store, saved);
    }
  });

  test("stale or missing timestamp is rejected (per-trigger replay_window_s)", () => {
    const now = Date.now();
    const stale = decideWebhook(dataRoot, "default", "limited", {
      token: TOKEN,
      timestamp: String(Math.floor(now / 1000) - 120), // limited: 60s window
      nowMs: now,
    });
    expect(stale.status).toBe(401);
    expect(String(stale.body.error)).toContain("stale");

    const missing = decideWebhook(dataRoot, "default", "on-upload", { token: TOKEN, timestamp: null, nowMs: now });
    expect(missing.status).toBe(401);

    const fresh = decideWebhook(dataRoot, "default", "limited", {
      token: TOKEN,
      timestamp: String(Math.floor(now / 1000) - 30),
      nowMs: now,
    });
    expect(fresh.status).toBe(202);
  });

  test("rate limit: accepted hooks over params.rate_limit per hour are 429; the window slides", () => {
    const t0 = Date.now();
    const fire = (nowMs: number) =>
      decideWebhook(dataRoot, "default", "limited", {
        token: TOKEN,
        timestamp: String(Math.floor(nowMs / 1000)),
        nowMs,
      });
    expect(fire(t0).status).toBe(202);
    expect(fire(t0 + 1000).status).toBe(202);
    expect(fire(t0 + 2000).status).toBe(429); // limit 2/hour
    // 61 minutes later the window has slid.
    expect(fire(t0 + 61 * 60_000).status).toBe(202);
  });
});

describe("handleWebhook — payload handling (injected fire)", () => {
  test("valid request fires with the raw JSON payload and returns 202", async () => {
    const fired: Array<{ ws: string; trigger: string; payload: string }> = [];
    const req = new Request("http://x/hooks/default/on-upload", {
      method: "POST",
      headers: { [WEBHOOK_TOKEN_HEADER]: TOKEN, [WEBHOOK_TIMESTAMP_HEADER]: nowS() },
      body: JSON.stringify({ episode: { title: "E42" } }),
    });
    const r = await handleWebhook(dataRoot, "default", "on-upload", req, (_root, ws, trigger, payload) =>
      fired.push({ ws, trigger, payload }),
    );
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ accepted: true, workspace: "default", trigger: "on-upload", workflow: "hooked" });
    expect(fired).toEqual([{ ws: "default", trigger: "on-upload", payload: JSON.stringify({ episode: { title: "E42" } }) }]);
  });

  test("bad JSON body is 400; over-cap body is 413; failed auth never fires", async () => {
    let fires = 0;
    const count = () => fires++;
    const bad = new Request("http://x/", {
      method: "POST",
      headers: { [WEBHOOK_TOKEN_HEADER]: TOKEN, [WEBHOOK_TIMESTAMP_HEADER]: nowS() },
      body: "{not json",
    });
    expect((await handleWebhook(dataRoot, "default", "on-upload", bad, count)).status).toBe(400);

    const big = new Request("http://x/", {
      method: "POST",
      headers: { [WEBHOOK_TOKEN_HEADER]: TOKEN, [WEBHOOK_TIMESTAMP_HEADER]: nowS() },
      body: JSON.stringify({ pad: "x".repeat(300 * 1024) }),
    });
    expect((await handleWebhook(dataRoot, "default", "on-upload", big, count)).status).toBe(413);

    const unauth = new Request("http://x/", {
      method: "POST",
      headers: { [WEBHOOK_TOKEN_HEADER]: "wrong", [WEBHOOK_TIMESTAMP_HEADER]: nowS() },
      body: "{}",
    });
    expect((await handleWebhook(dataRoot, "default", "on-upload", unauth, count)).status).toBe(401);
    expect(fires).toBe(0);
  });
});

describe("the /hooks route", () => {
  test("GET is 405; the route bypasses the studio auth gate (its own 401, not the gate's)", async () => {
    expect((await fetch(`${openBase}/hooks/default/on-upload`)).status).toBe(405);
    // On the token-gated server, a bad TRIGGER token gets the webhook 401 —
    // proof the request reached hooks auth instead of the studio Bearer gate.
    const r = await fetch(`${authBase}/hooks/default/on-upload`, {
      method: "POST",
      headers: { [WEBHOOK_TOKEN_HEADER]: "wrong", [WEBHOOK_TIMESTAMP_HEADER]: nowS() },
      body: "{}",
    });
    expect(r.status).toBe(401);
    const body = (await r.json()) as { error: string };
    expect(body.error).toContain(WEBHOOK_TOKEN_HEADER);
  });

  test(
    "valid POST fires a real tick end to end: the run journal shows the trigger + downstream completed",
    async () => {
      const r = await fetch(`${openBase}/hooks/default/on-upload`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [WEBHOOK_TOKEN_HEADER]: TOKEN,
          [WEBHOOK_TIMESTAMP_HEADER]: nowS(),
        },
        body: JSON.stringify({ episode: { title: "E42" } }),
      });
      expect(r.status).toBe(202);
      const body = (await r.json()) as Record<string, unknown>;
      expect(body).toMatchObject({ accepted: true, workflow: "hooked" });

      // Poll the run journal: the detached `farm fire` completes the free
      // webhook-trigger -> transform graph (no keys, no model calls).
      const runsDir = path.join(dataRoot, "workspaces", "default", "runs");
      const deadline = Date.now() + 25_000;
      let events: Array<Record<string, unknown>> = [];
      while (Date.now() < deadline) {
        const runs = fs.existsSync(runsDir)
          ? fs.readdirSync(runsDir).filter((d) => d.startsWith("farm-hooked-"))
          : [];
        for (const run of runs) {
          const journal = path.join(runsDir, run, "run-events.jsonl");
          if (!fs.existsSync(journal)) continue;
          events = fs
            .readFileSync(journal, "utf8")
            .split("\n")
            .filter(Boolean)
            .map((l) => JSON.parse(l) as Record<string, unknown>);
          if (events.some((e) => e.kind === "run-completed")) break;
        }
        if (events.some((e) => e.kind === "run-completed")) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const hookDone = events.find((e) => e.kind === "node-completed" && e.node === "on-upload");
      expect(hookDone).toBeDefined();
      // The payload landed normalized through the trigger's map param.
      expect(hookDone!.output).toEqual({ title: "E42" });
      const noteDone = events.find((e) => e.kind === "node-completed" && e.node === "note");
      expect(noteDone).toBeDefined();
    },
    E2E_MS,
  );
});
