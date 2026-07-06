// Farm control plane + auth smoke tests (#506) — fixture-backed, no network
// beyond 127.0.0.1, ZERO model calls, no real farm loop (pidfiles are fixture
// `sleep` children). The CLI-shell-out endpoints (import-bundle, trust update,
// farm stop) spawn the REAL `bun cli/index.ts` against the fixture data root
// (cwd = the tmp dir containing .ralphy/) — that is the point: the CLI stays
// the single engine. Bundle zips are built with the system `zip` binary (same
// decision as cli/lib/bundle.ts); those tests skip when it is absent.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { startStudio } from "../server/index.js";
import {
  farmStatusView,
  readFarmPid,
  isFarmAlive,
  trustStatusView,
  recordTrustDecisionView,
  readCalendarView,
  listWorkspaceWorkflows,
  workflowGraphView,
} from "../server/control.js";

const hasZip = Boolean(Bun.which("zip") && Bun.which("unzip"));
const TOKEN = "test-admin-token";
const CLI_MS = 30_000; // CLI shell-out tests spawn bun + the full commander tree

let tmpRoot: string;
let dataRoot: string;
let open: ReturnType<typeof startStudio>;
let authed: ReturnType<typeof startStudio>;
let openBase: string;
let authBase: string;
let sleeper: ReturnType<typeof spawn> | null = null;

/** A 3-node lint-green graph with zero connector-key requirements. */
const GRAPH = {
  version: "2.0",
  name: "episode",
  nodes: [
    { id: "tick", type: "schedule", params: { cron: "0 9 * * 1" } },
    { id: "note", type: "transform", in: { items: "tick.out" }, params: {} },
    { id: "draft", type: "transform", in: { items: "note.out" }, params: {} },
  ],
};

function seed(root: string) {
  const ws = path.join(root, ".ralphy", "workspaces", "default");
  fs.mkdirSync(path.join(ws, "projects", "ship-001"), { recursive: true });
  fs.mkdirSync(path.join(ws, "workflows"), { recursive: true });
  fs.writeFileSync(path.join(ws, "workspace.json"), JSON.stringify({ name: "Default", slug: "default" }));
  fs.writeFileSync(
    path.join(ws, "projects", "ship-001", "workspace-eval.json"),
    JSON.stringify({ overall: { verdict: "ship", score: 92 }, criteria: [] }),
  );
  fs.writeFileSync(
    path.join(ws, "calendar.json"),
    JSON.stringify({
      version: "1.0",
      slots: [{ id: "slot-mon-0900", weekday: "mon", time: "09:00", timezone: "UTC", unitType: "ugc-review", targetPlatforms: ["tiktok"] }],
      entries: [{ id: "e-1", unitType: "ugc-review", status: "queued", at: "2026-07-06T09:00:00.000Z" }],
    }),
  );
  // Workflows: one #498 graph + one #478 linear.
  fs.writeFileSync(path.join(ws, "workflows", "pipeline.json"), JSON.stringify(GRAPH, null, 2));
  fs.writeFileSync(
    path.join(ws, "workflows", "linear.json"),
    JSON.stringify({ version: "1.0", name: "linear", steps: [{ id: "intake", phase: "intake", engine: "agent" }] }),
  );
  // A completed farm run: state file + journal (2 of the 3 nodes recorded).
  const runDir = path.join(ws, "runs", "farm-pipeline-20260706-090000");
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(
    path.join(runDir, "farm-state.json"),
    JSON.stringify({ workflow: "pipeline", status: "complete", updatedAt: "2026-07-06T09:00:05.000Z" }),
  );
  fs.writeFileSync(
    path.join(runDir, "run-events.jsonl"),
    [
      { kind: "node-started", node: "tick", message: "started" },
      { kind: "node-completed", node: "tick", message: "done" },
      { kind: "node-started", node: "note", message: "started" },
      { kind: "node-completed", node: "note", costUsd: 0.12, message: "done" },
    ]
      .map((e) => JSON.stringify(e))
      .join("\n") + "\n",
  );
}

/** Build a bundle zip (manifest.yaml + pipeline.json) with the system `zip`. */
function buildBundleZip(entries: Record<string, string>): Uint8Array {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "farm-api-bundle-"));
  const out = path.join(os.tmpdir(), `farm-api-${path.basename(staging)}.zip`);
  try {
    for (const [rel, content] of Object.entries(entries)) {
      fs.mkdirSync(path.dirname(path.join(staging, rel)), { recursive: true });
      fs.writeFileSync(path.join(staging, rel), content);
    }
    const r = spawnSync("zip", ["-r", "-q", "-X", out, "."], { cwd: staging, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`zip failed: ${r.stderr}`);
    return new Uint8Array(fs.readFileSync(out));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(out, { force: true });
  }
}

const VALID_MANIFEST = [
  "name: fixture-bundle",
  "version: 1.0.0",
  "ralphyVersionFloor: 0.1.0",
  "requiredConnectorKeys: []",
  "requiredCoverage: []",
  "trustDefault: L0",
  "",
].join("\n");

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "farm-api-test-"));
  dataRoot = path.join(tmpRoot, ".ralphy");
  seed(tmpRoot);
  // Isolate from any leaked env override — resolution goes via rootStartDir.
  delete process.env.RALPHY_STUDIO_ROOT;
  open = startStudio({ port: 0, rootStartDir: tmpRoot, authToken: null });
  authed = startStudio({ port: 0, rootStartDir: tmpRoot, authToken: TOKEN, hostname: "127.0.0.1" });
  openBase = `http://127.0.0.1:${open.server.port}`;
  authBase = `http://127.0.0.1:${authed.server.port}`;
});

afterAll(() => {
  open.stop();
  authed.stop();
  if (sleeper && sleeper.pid && isFarmAlive(sleeper.pid)) sleeper.kill("SIGKILL");
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const bearer = { authorization: `Bearer ${TOKEN}` };

describe("auth (#506)", () => {
  test("token set: anonymous GET / POST / static / ws are 401", async () => {
    expect((await fetch(`${authBase}/api/workspaces`)).status).toBe(401);
    expect((await fetch(`${authBase}/api/farm/status?workspace=default`)).status).toBe(401);
    const post = await fetch(`${authBase}/api/farm/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: "default" }),
    });
    expect(post.status).toBe(401);
    expect((await fetch(`${authBase}/`)).status).toBe(401); // static UI gated too
    expect((await fetch(`${authBase}/ws?workspace=default&project=ship-001`)).status).toBe(401);
  });

  test("/api/health is login-free and reports auth mode", async () => {
    const h = await fetch(`${authBase}/api/health`).then((r) => r.json());
    expect(h).toEqual({ ok: true, auth: true });
    const h2 = await fetch(`${openBase}/api/health`).then((r) => r.json());
    expect(h2).toEqual({ ok: true, auth: false });
  });

  test("POST /api/auth: wrong token 401; right token sets the httpOnly cookie", async () => {
    const bad = await fetch(`${authBase}/api/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "nope" }),
    });
    expect(bad.status).toBe(401);

    const good = await fetch(`${authBase}/api/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: TOKEN }),
    });
    expect(good.status).toBe(200);
    const cookie = good.headers.get("set-cookie")!;
    expect(cookie).toContain("studio_auth=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");

    // The cookie grants access (browser path).
    const withCookie = await fetch(`${authBase}/api/workspaces`, {
      headers: { cookie: cookie.split(";")[0] },
    });
    expect(withCookie.status).toBe(200);
  });

  test("Bearer header grants access (agent / curl path)", async () => {
    const r = await fetch(`${authBase}/api/workspaces`, { headers: bearer });
    expect(r.status).toBe(200);
    const ws = await r.json();
    expect(ws[0].slug).toBe("default");
  });

  test("no token configured: historical open behavior", async () => {
    expect((await fetch(`${openBase}/api/workspaces`)).status).toBe(200);
    expect((await fetch(`${openBase}/`)).status).toBe(200);
  });
});

describe("farm endpoints (#503 mapping)", () => {
  test("GET /api/farm/status: no daemon, fixture run rolled up from the journal", async () => {
    const s = await fetch(`${openBase}/api/farm/status?workspace=default`).then((r) => r.json());
    expect(s.daemon.running).toBe(false);
    expect(s.daemon.pid).toBeNull();
    expect(s.counts.complete).toBe(1);
    expect(s.runs.length).toBe(1);
    expect(s.runs[0].workflow).toBe("pipeline");
    expect(s.runs[0].completedNodes).toBe(2);
    expect(s.runs[0].totalNodes).toBe(3);
    expect(s.runs[0].spendUsd).toBe(0.12);
  });

  test("live pidfile: status reports running; start refuses 409; stop SIGTERMs via the CLI", async () => {
    // Fixture daemon: a real (harmless) sleep child standing in for the loop.
    sleeper = spawn("sleep", ["300"], { stdio: "ignore" });
    const pid = sleeper.pid!;
    fs.mkdirSync(path.join(dataRoot, "farm"), { recursive: true });
    fs.writeFileSync(path.join(dataRoot, "farm", "default.pid"), String(pid) + "\n");

    const s = await fetch(`${openBase}/api/farm/status?workspace=default`).then((r) => r.json());
    expect(s.daemon.running).toBe(true);
    expect(s.daemon.pid).toBe(pid);

    const start = await fetch(`${openBase}/api/farm/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: "default" }),
    });
    expect(start.status).toBe(409);
    expect((await start.json()).error).toContain("already running");

    const tick = await fetch(`${openBase}/api/farm/tick-now`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: "default" }),
    });
    expect(tick.status).toBe(409);

    const stop = await fetch(`${openBase}/api/farm/stop`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: "default" }),
    });
    expect(stop.status).toBe(200);
    const stopped = await stop.json();
    expect(stopped.stopped).toBe(true);
    expect(stopped.pid).toBe(pid);
    // SIGTERM landed — the fixture process dies.
    for (let i = 0; i < 50 && isFarmAlive(pid); i++) await new Promise((r) => setTimeout(r, 100));
    expect(isFarmAlive(pid)).toBe(false);
  }, CLI_MS);

  test("stop with no live daemon reports stopped:false (stale pidfile path)", async () => {
    const stop = await fetch(`${openBase}/api/farm/stop`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: "default" }),
    });
    expect(stop.status).toBe(200);
    expect((await stop.json()).stopped).toBe(false);
    expect(readFarmPid(dataRoot, "default")).toBeNull(); // stale pidfile cleared by the verb
  }, CLI_MS);

  test("farmStatusView never throws on an empty workspace", () => {
    const s = farmStatusView(dataRoot, "no-such-ws");
    expect(s.daemon.running).toBe(false);
    expect(s.runs).toEqual([]);
  });
});

describe("trust endpoints (#505 mapping)", () => {
  test("GET trust: defaults (L0, threshold 80, zero samples)", async () => {
    const t = await fetch(`${openBase}/api/workspaces/default/trust`).then((r) => r.json());
    expect(t.level).toBe("L0");
    expect(t.autoPublishScore).toBe(80);
    expect(t.agreement.samples).toBe(0);
    expect(t.promotion.suggested).toBe(false);
  });

  test("GET trust unknown workspace 404", async () => {
    expect((await fetch(`${openBase}/api/workspaces/ghost/trust`)).status).toBe(404);
  });

  test("POST trust config round-trips through `ralphy workspace update`", async () => {
    const r = await fetch(`${openBase}/api/workspaces/default/trust`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: "L1", autoPublishScore: 85 }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.trust.level).toBe("L1");
    expect(body.trust.autoPublishScore).toBe(85);
    const t = await fetch(`${openBase}/api/workspaces/default/trust`).then((x) => x.json());
    expect(t.level).toBe("L1");
    expect(t.autoPublishScore).toBe(85);
  }, CLI_MS);

  test("POST trust config: invalid level is a 400 with the CLI's refusal", async () => {
    const r = await fetch(`${openBase}/api/workspaces/default/trust`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: "L9" }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.length).toBeGreaterThan(0);
  }, CLI_MS);

  test("POST trust config: empty patch 400 without spawning the CLI", async () => {
    const r = await fetch(`${openBase}/api/workspaces/default/trust`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
  });

  test("POST trust/decision records the (verdict, decision) sample", async () => {
    const r = await fetch(`${openBase}/api/workspaces/default/trust/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: "ship-001", decision: "approve" }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.sample.verdict).toBe("ship");
    expect(body.sample.match).toBe(true);
    expect(body.sample.source).toBe("studio-dashboard");
    expect(body.demotion).toBeNull();
    const t = await fetch(`${openBase}/api/workspaces/default/trust`).then((x) => x.json());
    expect(t.agreement.samples).toBe(1);
    expect(t.agreement.streak).toBe(1);
  });

  test("POST trust/decision: unknown project 404, bad decision 400", async () => {
    const miss = await fetch(`${openBase}/api/workspaces/default/trust/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: "ghost-999", decision: "approve" }),
    });
    expect(miss.status).toBe(404);
    const bad = await fetch(`${openBase}/api/workspaces/default/trust/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: "ship-001", decision: "shrug" }),
    });
    expect(bad.status).toBe(400);
  });

  test("reject of an auto-published unit demotes L2 -> L1 (audited)", () => {
    const ws = path.join(dataRoot, "workspaces", "default");
    // Promote to L2 + plant an auto-pass audit entry for the unit.
    const manifest = JSON.parse(fs.readFileSync(path.join(ws, "workspace.json"), "utf8"));
    manifest.trust = { ...manifest.trust, level: "L2" };
    fs.writeFileSync(path.join(ws, "workspace.json"), JSON.stringify(manifest, null, 2));
    fs.appendFileSync(
      path.join(ws, "trust-audit.jsonl"),
      JSON.stringify({ at: "2026-07-06T00:00:00.000Z", kind: "auto-pass", workspace: "default", level: "L2", surface: "publish-node", project: "ship-001", unit: "hero-cut", reason: "test" }) + "\n",
    );
    const r = recordTrustDecisionView(dataRoot, "default", { project: "ship-001", unitSlug: "hero-cut", decision: "reject" });
    expect("error" in r).toBe(false);
    const ok = r as Exclude<typeof r, { error: string }>;
    expect(ok.demotion).toEqual({ demoted: true, from: "L2", to: "L1", reason: expect.stringContaining("demoted L2 -> L1") });
    expect(trustStatusView(dataRoot, "default")!.level).toBe("L1");
  });

  test("trust endpoints never touch project media", () => {
    const proj = path.join(dataRoot, "workspaces", "default", "projects", "ship-001");
    fs.mkdirSync(path.join(proj, "render"), { recursive: true });
    fs.writeFileSync(path.join(proj, "render", "final.mp4"), "media-bytes");
    recordTrustDecisionView(dataRoot, "default", { project: "ship-001", decision: "approve" });
    expect(fs.readFileSync(path.join(proj, "render", "final.mp4"), "utf8")).toBe("media-bytes");
  });
});

describe("calendar endpoint (#504 mapping)", () => {
  test("GET calendar returns the workspace document (slots + entries)", async () => {
    const c = await fetch(`${openBase}/api/workspaces/default/calendar`).then((r) => r.json());
    expect(c.workspace).toBe("default");
    expect(c.slots.length).toBe(1);
    expect(c.slots[0].id).toBe("slot-mon-0900");
    expect(c.entries.length).toBe(1);
    expect(c.entries[0].status).toBe("queued");
  });

  test("unknown workspace 404; missing calendar.json degrades to empty", async () => {
    expect((await fetch(`${openBase}/api/workspaces/ghost/calendar`)).status).toBe(404);
    fs.mkdirSync(path.join(dataRoot, "workspaces", "bare"), { recursive: true });
    const c = readCalendarView(dataRoot, "bare")!;
    expect(c.slots).toEqual([]);
    expect(c.entries).toEqual([]);
  });
});

describe("workflow graph endpoints (#498 spec -> #490 canvas shape)", () => {
  test("GET workflows lists graph + linear with counts", async () => {
    const { workflows } = await fetch(`${openBase}/api/workspaces/default/workflows`).then((r) => r.json());
    const byName = Object.fromEntries(workflows.map((w: { name: string }) => [w.name, w]));
    expect(byName.pipeline.kind).toBe("graph");
    expect(byName.pipeline.nodes).toBe(3);
    expect(byName.linear.kind).toBe("linear");
    expect(byName.linear.steps).toBe(1);
  });

  test("GET workflows/:name/graph mirrors the run-canvas conventions", async () => {
    const g = await fetch(`${openBase}/api/workspaces/default/workflows/pipeline/graph`).then((r) => r.json());
    expect(g.workflow).toBe("episode"); // the graph's own name field
    expect(g.nodes.map((n: { id: string }) => n.id)).toEqual(["tick", "note", "draft"]);
    // Same node/edge/layout shape buildRunGraph emits (id/type/label/layer + from/to).
    expect(g.nodes[0]).toMatchObject({ id: "tick", type: "schedule", label: "tick", layer: 0 });
    expect(g.nodes[2].layer).toBe(2);
    expect(g.edges).toEqual([
      { from: "tick", to: "note" },
      { from: "note", to: "draft" },
    ]);
    expect(g.issues).toEqual([]);
    expect(g.layout).toEqual({});
  });

  test("a linear workflow / unknown name is 404 on the graph endpoint", async () => {
    expect((await fetch(`${openBase}/api/workspaces/default/workflows/linear/graph`)).status).toBe(404);
    expect((await fetch(`${openBase}/api/workspaces/default/workflows/nope/graph`)).status).toBe(404);
  });

  test("unknown producer refs and cycles surface as issues, never throws", () => {
    const ws = path.join(dataRoot, "workspaces", "default", "workflows");
    fs.writeFileSync(
      path.join(ws, "broken.json"),
      JSON.stringify({
        version: "2.0",
        name: "broken",
        nodes: [
          { id: "a", type: "transform", in: { x: "b.out", y: "ghost.out" }, params: {} },
          { id: "b", type: "transform", in: { x: "a.out" }, params: {} },
        ],
      }),
    );
    const g = workflowGraphView(dataRoot, "default", "broken")!;
    expect(g.issues.some((i) => i.message.includes("unknown producer"))).toBe(true);
    expect(g.issues.some((i) => i.message.includes("cycle"))).toBe(true);
  });

  test("listWorkspaceWorkflows: unknown workspace is null", () => {
    expect(listWorkspaceWorkflows(dataRoot, "ghost")).toBeNull();
  });
});

describe.if(hasZip)("bundle import (#502 mapping)", () => {
  test("POST import-bundle: valid zip imports as a NEW workspace", async () => {
    const zip = buildBundleZip({
      "manifest.yaml": VALID_MANIFEST,
      "pipeline.json": JSON.stringify(GRAPH, null, 2),
    });
    const r = await fetch(`${openBase}/api/workspaces/import-bundle?as=imported-ws`, {
      method: "POST",
      headers: { "content-type": "application/zip" },
      body: zip,
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.imported).toBe(true);
    expect(body.workspace).toBe("imported-ws");
    expect(body.workflows).toEqual(["episode"]);
    expect(fs.existsSync(path.join(dataRoot, "workspaces", "imported-ws", "workflows", "episode.json"))).toBe(true);
  }, CLI_MS);

  test("slug collision refuses — import never overwrites a workspace", async () => {
    const zip = buildBundleZip({
      "manifest.yaml": VALID_MANIFEST,
      "pipeline.json": JSON.stringify(GRAPH, null, 2),
    });
    const r = await fetch(`${openBase}/api/workspaces/import-bundle?as=imported-ws`, {
      method: "POST",
      headers: { "content-type": "application/zip" },
      body: zip,
    });
    expect(r.status).toBe(400);
    expect((await r.json()).imported).toBe(false);
  }, CLI_MS);

  test("invalid bundle: validation refusals come back verbatim", async () => {
    const zip = buildBundleZip({ "README.md": "not a bundle\n" });
    const r = await fetch(`${openBase}/api/workspaces/import-bundle`, {
      method: "POST",
      headers: { "content-type": "application/zip" },
      body: zip,
    });
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.imported).toBe(false);
    expect(body.refusals.some((x: { id: string }) => x.id === "manifest-invalid")).toBe(true);
    expect(body.refusals.some((x: { id: string }) => x.id === "pipeline-invalid")).toBe(true);
  }, CLI_MS);

  test("empty body and bad slug are clean 400s (no CLI spawn)", async () => {
    const empty = await fetch(`${openBase}/api/workspaces/import-bundle`, { method: "POST" });
    expect(empty.status).toBe(400);
    const bad = await fetch(`${openBase}/api/workspaces/import-bundle?as=NOT_A_SLUG`, {
      method: "POST",
      body: new Uint8Array([1, 2, 3]),
    });
    expect(bad.status).toBe(400);
  });
});
