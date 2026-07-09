// Approval + capability API smoke tests (#492, the #533 gap) — fixture-backed,
// no network beyond 127.0.0.1, ZERO model calls. The approval endpoints shell
// out to the REAL `ralphy farm review` verb against the fixture data root (cwd
// = the tmp dir containing .ralphy/) — that is the point: the decision path
// drives the existing CLI transition, never a new media engine.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { startStudio } from "../server/index.js";
import { approvalId, parseApprovalId, listApprovals } from "../server/approvals.js";
import { capabilitiesView } from "../server/capabilities.js";

const TOKEN = "test-admin-token";
const CLI_MS = 30_000; // CLI shell-out tests spawn bun + the full commander tree

let tmpRoot: string;
let dataRoot: string;
let open: ReturnType<typeof startStudio>;
let authed: ReturnType<typeof startStudio>;
let openBase: string;
let authBase: string;

const RUN = "farm-approve-20260101-000000";

function seed(root: string) {
  const ws = path.join(root, ".ralphy", "workspaces", "default");
  fs.mkdirSync(path.join(ws, "projects", "ship-001", "units", "hero-cut"), { recursive: true });
  fs.mkdirSync(path.join(ws, "runs", RUN), { recursive: true });
  fs.writeFileSync(path.join(ws, "workspace.json"), JSON.stringify({ name: "Default", slug: "default" }));
  fs.writeFileSync(
    path.join(ws, "projects", "ship-001", "units", "hero-cut", "unit.json"),
    JSON.stringify({ slug: "hero-cut", format: "ugc-review", title: "Hero Cut", media: ["final.mp4"], publish: [{ target: "tiktok" }] }),
  );
  const runDir = path.join(ws, "runs", RUN);
  fs.writeFileSync(
    path.join(runDir, "farm-state.json"),
    JSON.stringify({ workflow: "pipeline", status: "parked-approval", updatedAt: "2026-01-01T00:00:05.000Z" }),
  );
  fs.writeFileSync(
    path.join(runDir, "run.json"),
    JSON.stringify({ version: 1, id: RUN, workspace: "default", status: "active", projectIds: ["ship-001"], unitIds: ["hero-cut"] }),
  );
  fs.writeFileSync(
    path.join(runDir, "run-events.jsonl"),
    [
      { ts: "2026-01-01T00:00:01.000Z", kind: "node-started", node: "publish" },
      { ts: "2026-01-01T00:00:02.000Z", kind: "node-completed", node: "prep", output: { project: "ship-001", slug: "hero-cut" } },
      { ts: "2026-01-01T00:00:03.000Z", kind: "run-parked", node: "publish", reason: "awaiting approval", costUsd: 0.42 },
    ]
      .map((e) => JSON.stringify(e))
      .join("\n") + "\n",
  );
  // A second, non-parked run must NOT surface in the approval inbox.
  const other = path.join(ws, "runs", "farm-done-20260101-000000");
  fs.mkdirSync(other, { recursive: true });
  fs.writeFileSync(path.join(other, "farm-state.json"), JSON.stringify({ workflow: "pipeline", status: "complete", updatedAt: "2026-01-01T00:00:05.000Z" }));
  fs.writeFileSync(path.join(other, "run.json"), JSON.stringify({ version: 1, id: "farm-done-20260101-000000", workspace: "default", status: "complete", projectIds: [] }));
}

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "approvals-api-test-"));
  dataRoot = path.join(tmpRoot, ".ralphy");
  seed(tmpRoot);
  delete process.env.RALPHY_STUDIO_ROOT;
  open = startStudio({ port: 0, rootStartDir: tmpRoot, authToken: null });
  authed = startStudio({ port: 0, rootStartDir: tmpRoot, authToken: TOKEN, hostname: "127.0.0.1" });
  openBase = `http://127.0.0.1:${open.server.port}`;
  authBase = `http://127.0.0.1:${authed.server.port}`;
});

afterAll(() => {
  open.stop();
  authed.stop();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const bearer = { authorization: `Bearer ${TOKEN}` };

describe("approval id convention", () => {
  test("approvalId / parseApprovalId round-trip; malformed → null", () => {
    expect(approvalId(RUN, "publish")).toBe(`${RUN}::publish`);
    expect(parseApprovalId(`${RUN}::publish`)).toEqual({ run: RUN, node: "publish" });
    expect(parseApprovalId("no-separator")).toBeNull();
    expect(parseApprovalId("::x")).toBeNull();
  });

  test("listApprovals: unknown workspace → null", () => {
    expect(listApprovals(dataRoot, "ghost")).toBeNull();
  });
});

describe("capability endpoint (#492)", () => {
  test("GET /api/capabilities lists the action surface + id conventions + rules", async () => {
    const cap = await fetch(`${openBase}/api/capabilities`).then((r) => r.json());
    expect(cap.version).toBe(1);
    const ids = cap.capabilities.map((c: { id: string }) => c.id);
    // The gap-filling actions this issue added must be discoverable.
    expect(ids).toContain("capabilities");
    expect(ids).toContain("run.show");
    expect(ids).toContain("approvals.list");
    expect(ids).toContain("approvals.respond");
    // Stable-id convention for approvals is documented.
    expect(cap.idConventions.approval).toContain("<run>::<node>");
    // The respond action names the ralphy verb it routes through (no new engine).
    const respond = cap.capabilities.find((c: { id: string }) => c.id === "approvals.respond");
    expect(respond.method).toBe("POST");
    expect(respond.mutates).toBe(true);
    expect(respond.throughCli).toBe("farm review");
    // Config-patch apply stays a ralphy verb — Studio only proposes.
    const propose = cap.capabilities.find((c: { id: string }) => c.id === "patches.propose");
    expect(propose.throughCli).toBeNull();
    expect(cap.rules.some((r: string) => r.toLowerCase().includes("api boundary"))).toBe(true);
  });
});

describe("approval list (#492/#533)", () => {
  test(
    "GET /api/workspaces/:ws/approvals returns parked items with stable <run>::<node> ids",
    async () => {
      const view = await fetch(`${openBase}/api/workspaces/default/approvals`).then((r) => r.json());
      expect(view.workspace).toBe("default");
      expect(view.count).toBe(1); // only the parked run, not the complete one
      const item = view.approvals[0];
      expect(item.id).toBe(`${RUN}::publish`);
      expect(item.run).toBe(RUN);
      expect(item.node).toBe("publish");
      expect(item.project).toBe("ship-001");
      expect(item.unit).toBe("hero-cut");
      expect(item.costUsd).toBe(0.42);
      expect(item.reason).toBe("awaiting approval");
    },
    CLI_MS,
  );

  test("GET approvals unknown workspace → 404", async () => {
    expect((await fetch(`${openBase}/api/workspaces/ghost/approvals`)).status).toBe(404);
  });
});

describe("approval respond (#492/#533) — drives `ralphy farm review`, no new media", () => {
  test(
    "POST reject drives the reject transition (append-only note, media untouched)",
    async () => {
      const before = fs.readdirSync(path.join(dataRoot, "workspaces", "default", "projects", "ship-001", "units", "hero-cut"));
      const r = await fetch(`${openBase}/api/workspaces/default/approvals/respond`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: `${RUN}::publish`, decision: "reject", reason: "off-brand thumbnail" }),
      });
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.decision).toBe("reject");
      expect(body.node).toBe("publish");
      // The reject wrote an append-only rejection note beside the unit — never
      // deleted media (invariant #14): the original unit.json is still there.
      const after = fs.readdirSync(path.join(dataRoot, "workspaces", "default", "projects", "ship-001", "units", "hero-cut"));
      expect(after).toContain("unit.json");
      expect(after).toContain("rejections.jsonl");
      expect(body.rejectionNote).toContain("rejections.jsonl");
      // No new media file appeared (no .mp4/.png/... written by the transition).
      const newMedia = after.filter((f) => /\.(mp4|mov|png|jpg|webp|mp3|wav)$/i.test(f) && !before.includes(f));
      expect(newMedia).toEqual([]);
    },
    CLI_MS,
  );

  test("POST reject without a reason → 400 (CLI validation), no CLI spawn cost", async () => {
    const r = await fetch(`${openBase}/api/workspaces/default/approvals/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: `${RUN}::publish`, decision: "reject" }),
    });
    expect(r.status).toBe(400);
  });

  test("POST with a bad decision → 400; malformed id → 400; unknown workspace → 404", async () => {
    const badDecision = await fetch(`${openBase}/api/workspaces/default/approvals/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: `${RUN}::publish`, decision: "nuke" }),
    });
    expect(badDecision.status).toBe(400);
    const badId = await fetch(`${openBase}/api/workspaces/default/approvals/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "no-separator", decision: "approve" }),
    });
    expect(badId.status).toBe(400);
    const ghost = await fetch(`${openBase}/api/workspaces/ghost/approvals/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: `${RUN}::publish`, decision: "approve" }),
    });
    expect(ghost.status).toBe(404);
  });
});

describe("auth gate (#506) covers the new routes", () => {
  test("token set: anonymous GET capabilities / approvals + POST respond are 401", async () => {
    expect((await fetch(`${authBase}/api/capabilities`)).status).toBe(401);
    expect((await fetch(`${authBase}/api/workspaces/default/approvals`)).status).toBe(401);
    const post = await fetch(`${authBase}/api/workspaces/default/approvals/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: `${RUN}::publish`, decision: "approve" }),
    });
    expect(post.status).toBe(401);
  });

  test("Bearer header grants access to the new routes", async () => {
    const cap = await fetch(`${authBase}/api/capabilities`, { headers: bearer });
    expect(cap.status).toBe(200);
    const appr = await fetch(`${authBase}/api/workspaces/default/approvals`, { headers: bearer });
    expect(appr.status).toBe(200);
  });
});
