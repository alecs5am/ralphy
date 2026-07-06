// Studio — local artifact browser server (#107) + farm control plane (#506).
//
// One Bun.serve process: built Vite UI (studio/dist/) + JSON API + WebSocket
// live-watch. READ-ONLY over MEDIA (AGENTS.md invariant #14): no code path here
// writes, renames, or deletes any artifact. The only writes are sidecar
// METADATA or engine STATE, never media: the board choice + node layout (#478,
// board.json), the object annotations (#488, annotations.jsonl), the agent
// context inbox (#489, agent-inbox/), the config-patch proposals (#491), and
// the #506 control endpoints (bundle import = a NEW workspace via `ralphy
// workspace import`; farm start/stop/tick = pidfile + detached daemon + log;
// trust = workspace.json `trust` key + append-only jsonl). Every other non-GET
// stays 405. Per-endpoint import-vs-shell-out rationale: server/control.ts.
//
// AUTH (#506): env STUDIO_AUTH_TOKEN gates EVERY route (GET + POST + WS +
// static) except GET /api/health and POST /api/auth — Bearer header or the
// `studio_auth` cookie (set by POST /api/auth). Token set → binds 0.0.0.0
// (deployment; override with STUDIO_HOST); unset → localhost dev, 127.0.0.1
// only, no auth. See server/auth.ts.
//
// Run by the USER in their own shell (`bun run dev` inside studio/, or the
// docker/ compose stack) — never auto-launched by the agent (AGENTS.md
// invariant #5).

import path from "node:path";
import fs from "node:fs";
import {
  resolveDataRoot,
  listWorkspaces,
  listProjects,
  listArtifacts,
  safeProjectFile,
  safeWorkspaceFile,
  projectDir,
  kindOfRelPath,
  mediaType,
  readWorkflowLane,
  readBoard,
  readWorkspaceComponentStories,
  renderWorkspaceComponentStory,
  writeBoardChoice,
  writeBoardLayout,
  listRuns,
  summarizeRun,
  MIME,
} from "./lib.js";
import { readAnnotations, addAnnotation, removeAnnotation, type AnnotationScope } from "./annotations.js";
import { writeInboxPack, listInboxPacks, type InboxScope } from "./inbox.js";
import { buildRunGraph, writeRunCanvasLayout } from "./graph.js";
import { proposePatch, listPatches, type PatchScope } from "./patches.js";
import { isAuthorized, authCookieHeader, safeEqual } from "./auth.js";
import {
  importBundle,
  startFarm,
  stopFarm,
  farmStatusView,
  trustStatusView,
  updateTrustConfig,
  recordTrustDecisionView,
  readCalendarView,
  listWorkspaceWorkflows,
  workflowGraphView,
} from "./control.js";

const STATIC_DIRS = [
  path.join(import.meta.dir, "..", "dist"),
  // Build-missing HTML + shared CSS. The actual app lives in client/src and is
  // served from dist after `bun run build`.
  path.join(import.meta.dir, "..", "src"),
];

export type StudioServer = ReturnType<typeof startStudio>;

export function startStudio(
  opts: { port?: number; rootStartDir?: string; authToken?: string | null; hostname?: string } = {},
) {
  // Auth (#506): a set token turns on the gate on every route and opens the
  // bind to 0.0.0.0 (deployment); no token = historical localhost-only dev.
  const authToken =
    opts.authToken !== undefined ? opts.authToken : process.env.STUDIO_AUTH_TOKEN || null;
  const hostname = opts.hostname ?? (authToken ? process.env.STUDIO_HOST || "0.0.0.0" : "127.0.0.1");
  const dataRoot = resolveDataRoot(opts.rootStartDir ?? import.meta.dir);
  if (!dataRoot) {
    console.error(
      "studio: no .ralphy/workspaces data root found. Run from inside the ralphy repo, or set RALPHY_STUDIO_ROOT=<dir containing .ralphy>.",
    );
    process.exit(1);
  }

  // One watcher per watched project, shared across its WS subscribers.
  type Watch = { watcher: fs.FSWatcher; sockets: Set<unknown>; key: string };
  const watches = new Map<string, Watch>();

  function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  function fileResponse(abs: string, rangeHeader: string | null): Response {
    const ext = path.extname(abs).toLowerCase();
    const type = MIME[ext] ?? "application/octet-stream";
    const size = fs.statSync(abs).size;
    // Minimal single-range support so <video> seeking works.
    if (rangeHeader) {
      const m = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
      if (m && (m[1] || m[2])) {
        let start = m[1] ? parseInt(m[1], 10) : Math.max(0, size - parseInt(m[2], 10));
        let end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
        if (start <= end && start < size) {
          return new Response(Bun.file(abs).slice(start, end + 1), {
            status: 206,
            headers: {
              "content-type": type,
              "content-range": `bytes ${start}-${end}/${size}`,
              "accept-ranges": "bytes",
              "content-length": String(end - start + 1),
            },
          });
        }
      }
    }
    return new Response(Bun.file(abs), {
      headers: { "content-type": type, "accept-ranges": "bytes" },
    });
  }

  const server = Bun.serve({
    hostname,
    port: opts.port ?? 4860,
    websocket: {
      open(ws) {
        const { key, dir } = ws.data as { key: string; dir: string };
        let watch = watches.get(key);
        if (!watch) {
          const watcher = fs.watch(dir, { recursive: true }, (_event, filename) => {
            if (!filename || filename.endsWith(".DS_Store")) return;
            const kind = kindOfRelPath(String(filename));
            if (!kind) return;
            const rel = String(filename).split(path.sep).join("/");
            const abs = path.join(dir, String(filename));
            let payload: Record<string, unknown>;
            try {
              const st = fs.statSync(abs);
              if (!st.isFile()) return;
              payload = {
                type: "add-or-change",
                kind,
                path: rel,
                name: path.basename(rel),
                size: st.size,
                mtime: st.mtimeMs,
                mediaType: mediaType(rel),
              };
            } catch {
              payload = { type: "unlink", kind, path: rel, name: path.basename(rel) };
            }
            const msg = JSON.stringify(payload);
            for (const sock of watch!.sockets) (sock as { send(m: string): void }).send(msg);
          });
          watch = { watcher, sockets: new Set(), key };
          watches.set(key, watch);
        }
        watch.sockets.add(ws);
      },
      close(ws) {
        const { key } = ws.data as { key: string };
        const watch = watches.get(key);
        if (!watch) return;
        watch.sockets.delete(ws);
        if (watch.sockets.size === 0) {
          watch.watcher.close();
          watches.delete(key);
        }
      },
      message() { /* one-way push; client messages ignored */ },
    },
    async fetch(req, srv) {
      const url = new URL(req.url);

      // ── Health (login-free — compose healthcheck / login page probe) ─────
      if (url.pathname === "/api/health" && req.method === "GET") {
        return json({ ok: true, auth: !!authToken });
      }

      // ── Auth gate (#506) — EVERY other route when a token is configured ──
      if (url.pathname === "/api/auth" && req.method === "POST") {
        if (!authToken) return json({ ok: true, auth: false }); // no token configured — nothing to log into
        let body: { token?: string };
        try { body = await req.json(); } catch { return json({ error: "bad body" }, 400); }
        if (typeof body.token !== "string" || !safeEqual(body.token, authToken)) {
          return json({ error: "unauthorized" }, 401);
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "set-cookie": authCookieHeader(authToken),
          },
        });
      }
      if (authToken && !isAuthorized(req, authToken)) {
        return json({ error: "unauthorized — send Authorization: Bearer <token> or log in via POST /api/auth" }, 401);
      }

      // ── Farm control plane (#506) — see server/control.ts for the
      //    per-endpoint CLI-shell-out vs hand-copy rationale. ─────────────────
      if (req.method === "POST" && url.pathname === "/api/workspaces/import-bundle") {
        const bytes = new Uint8Array(await req.arrayBuffer());
        const outcome = importBundle(dataRoot!, bytes, {
          as: url.searchParams.get("as") ?? undefined,
          allowMissingKeys: url.searchParams.get("allowMissingKeys") === "1",
          allowCoverageGaps: url.searchParams.get("allowCoverageGaps") === "1",
        });
        return json(outcome.body, outcome.status);
      }
      if (req.method === "POST" && (url.pathname === "/api/farm/start" || url.pathname === "/api/farm/tick-now")) {
        let body: { workspace?: string };
        try { body = await req.json(); } catch { return json({ error: "bad body" }, 400); }
        const ws = body.workspace ?? "default";
        const result = startFarm(dataRoot!, ws, { tickNow: url.pathname.endsWith("tick-now") });
        if ("error" in result) return json(result, 409);
        return json({ workspace: ws, ...result });
      }
      if (req.method === "POST" && url.pathname === "/api/farm/stop") {
        let body: { workspace?: string };
        try { body = await req.json(); } catch { return json({ error: "bad body" }, 400); }
        const result = stopFarm(dataRoot!, body.workspace ?? "default");
        if (result && typeof result === "object" && "error" in (result as object)) return json(result, 500);
        return json(result);
      }
      {
        const tm = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/trust(\/decision)?$/);
        if (tm && req.method === "POST") {
          const ws = decodeURIComponent(tm[1]);
          if (!fs.existsSync(path.join(dataRoot!, "workspaces", ws))) return json({ error: "unknown workspace" }, 404);
          let body: any;
          try { body = await req.json(); } catch { return json({ error: "bad body" }, 400); }
          if (tm[2]) {
            const result = recordTrustDecisionView(dataRoot!, ws, {
              project: body.project,
              unitSlug: body.unitSlug ?? null,
              decision: body.decision,
              run: body.run ?? null,
            });
            if ("error" in result) return json(result, result.error === "unknown project" ? 404 : 400);
            return json(result);
          }
          const r = updateTrustConfig(dataRoot!, ws, body);
          return json(r.body, r.status);
        }
      }

      // ── The ONE sanctioned write (AGENTS.md #14): persist a board choice ──
      // Read-only over media; writing the per-scene chosen variant to board.json
      // is the sole mutation. Every other non-GET stays 405.
      if (req.method === "POST" && url.pathname.match(/^\/api\/projects\/([^/]+)\/board\/choose$/)) {
        const m2 = url.pathname.match(/^\/api\/projects\/([^/]+)\/board\/choose$/)!;
        const id = decodeURIComponent(m2[1]);
        let body: { workspace?: string; scene?: string; path?: string };
        try { body = await req.json(); } catch { return json({ error: "bad body" }, 400); }
        const ws = body.workspace ?? "default";
        if (!body.scene || !body.path) return json({ error: "scene + path required" }, 400);
        if (!fs.existsSync(projectDir(dataRoot!, ws, id))) return json({ error: "unknown project" }, 404);
        const result = writeBoardChoice(dataRoot!, ws, id, body.scene, body.path);
        if (result && "error" in result) return json(result, 400);
        return json(result);
      }
      if (req.method === "POST" && url.pathname.match(/^\/api\/projects\/([^/]+)\/board\/layout$/)) {
        const m2 = url.pathname.match(/^\/api\/projects\/([^/]+)\/board\/layout$/)!;
        const id = decodeURIComponent(m2[1]);
        let body: { workspace?: string; node?: string; x?: number; y?: number };
        try { body = await req.json(); } catch { return json({ error: "bad body" }, 400); }
        const ws = body.workspace ?? "default";
        if (!body.node || typeof body.x !== "number" || typeof body.y !== "number") return json({ error: "node + x + y required" }, 400);
        const result = writeBoardLayout(dataRoot!, ws, id, body.node, body.x, body.y);
        if ("error" in result) return json(result, 400);
        return json(result);
      }

      // ── Object annotations (#488) — append-only metadata sidecar ─────────
      // Tag / note Studio-selected objects. Project scope writes to
      // <project>/annotations.jsonl; run scope to runs/<id>/annotations.jsonl.
      // Never touches media. Add / remove only; the live set is the fold.
      {
        const am = url.pathname.match(/^\/api\/(projects|runs)\/([^/]+)\/annotations(\/remove)?$/);
        if (am && req.method === "POST") {
          const kind = am[1] === "runs" ? "run" : "project";
          const id = decodeURIComponent(am[2]);
          const isRemove = !!am[3];
          let body: any;
          try { body = await req.json(); } catch { return json({ error: "bad body" }, 400); }
          const ws = (body.workspace as string) ?? "default";
          const scope = { kind, dataRoot: dataRoot!, workspace: ws, id } as AnnotationScope;
          const result = isRemove
            ? removeAnnotation(scope, body.id)
            : addAnnotation(scope, { target: body.target, tags: body.tags, note: body.note });
          if ("error" in result) return json(result, result.error === "unknown scope" ? 404 : 400);
          return json(result);
        }
      }

      // ── Safe config patches (#491) — propose only; never applies/runs ───
      {
        const pm = url.pathname.match(/^\/api\/runs\/([^/]+)\/config-patches$/);
        if (pm && req.method === "POST") {
          const id = decodeURIComponent(pm[1]);
          let body: any;
          try { body = await req.json(); } catch { return json({ error: "bad body" }, 400); }
          const ws = (body.workspace as string) ?? "default";
          const scope = { dataRoot: dataRoot!, workspace: ws, runId: id } as PatchScope;
          const result = proposePatch(scope, { field: body.field, value: body.value, target: body.target, note: body.note });
          if ("error" in result) return json(result, result.error === "unknown run" ? 404 : 400);
          return json(result);
        }
      }

      // ── Run canvas node layout (#490) — run-scoped metadata, never media ─
      {
        const cl = url.pathname.match(/^\/api\/runs\/([^/]+)\/canvas\/layout$/);
        if (cl && req.method === "POST") {
          const id = decodeURIComponent(cl[1]);
          let body: { workspace?: string; node?: string; x?: number; y?: number };
          try { body = await req.json(); } catch { return json({ error: "bad body" }, 400); }
          const ws = body.workspace ?? "default";
          if (!body.node || typeof body.x !== "number" || typeof body.y !== "number") return json({ error: "node + x + y required" }, 400);
          const result = writeRunCanvasLayout(dataRoot!, ws, id, body.node, body.x, body.y);
          if ("error" in result) return json(result, result.error === "unknown run" ? 404 : 400);
          return json(result);
        }
      }

      // ── Agent context inbox (#489) — write a MD+JSON context pack ────────
      // Studio prepares a selection for Claude Code; it never runs a verb.
      {
        const im = url.pathname.match(/^\/api\/(projects|runs)\/([^/]+)\/inbox$/);
        if (im && req.method === "POST") {
          const kind = im[1] === "runs" ? "run" : "project";
          const id = decodeURIComponent(im[2]);
          let body: any;
          try { body = await req.json(); } catch { return json({ error: "bad body" }, 400); }
          const ws = (body.workspace as string) ?? "default";
          const scope = { kind, dataRoot: dataRoot!, workspace: ws, id } as InboxScope;
          const result = writeInboxPack(scope, {
            action: body.action,
            selected: body.selected,
            tags: body.tags,
            note: body.note,
            requestedOutcome: body.requestedOutcome,
          });
          if ("error" in result) return json(result, result.error === "unknown scope" ? 404 : 400);
          return json(result);
        }
      }

      if (req.method !== "GET") return json({ error: "read-only" }, 405);

      // ── WS upgrade ────────────────────────────────────────────────────
      if (url.pathname === "/ws") {
        const workspace = url.searchParams.get("workspace") ?? "";
        const id = url.searchParams.get("project") ?? "";
        const dir = projectDir(dataRoot!, workspace, id);
        if (!workspace || !id || !fs.existsSync(dir)) return json({ error: "unknown project" }, 404);
        const ok = srv.upgrade(req, { data: { key: `${workspace}/${id}`, dir } });
        return ok ? undefined : json({ error: "upgrade failed" }, 400);
      }

      // ── API ───────────────────────────────────────────────────────────
      if (url.pathname === "/api/workspaces") {
        return json(listWorkspaces(dataRoot!));
      }
      // ── Farm control plane reads (#506) ─────────────────────────────────
      if (url.pathname === "/api/farm/status") {
        return json(farmStatusView(dataRoot!, url.searchParams.get("workspace") ?? "default"));
      }
      let cm = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/trust$/);
      if (cm) {
        const status = trustStatusView(dataRoot!, decodeURIComponent(cm[1]));
        return status ? json(status) : json({ error: "unknown workspace" }, 404);
      }
      cm = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/calendar$/);
      if (cm) {
        const cal = readCalendarView(dataRoot!, decodeURIComponent(cm[1]));
        return cal ? json(cal) : json({ error: "unknown workspace" }, 404);
      }
      cm = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/workflows$/);
      if (cm) {
        const rows = listWorkspaceWorkflows(dataRoot!, decodeURIComponent(cm[1]));
        return rows ? json({ workflows: rows }) : json({ error: "unknown workspace" }, 404);
      }
      cm = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/workflows\/([^/]+)\/graph$/);
      if (cm) {
        const graph = workflowGraphView(dataRoot!, decodeURIComponent(cm[1]), decodeURIComponent(cm[2]));
        return graph ? json(graph) : json({ error: "unknown workflow graph" }, 404);
      }
      let wm = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/components$/);
      if (wm) {
        const ws = decodeURIComponent(wm[1]);
        const stories = await readWorkspaceComponentStories(dataRoot!, ws);
        if (!stories) return json({ error: "unknown workspace" }, 404);
        return json(stories);
      }
      wm = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/components\/render$/);
      if (wm) {
        const ws = decodeURIComponent(wm[1]);
        const id = url.searchParams.get("id") ?? "";
        let params: Record<string, unknown> = {};
        try {
          const raw = url.searchParams.get("params");
          params = raw ? JSON.parse(raw) : {};
        } catch {
          return json({ error: "bad params" }, 400);
        }
        const result = await renderWorkspaceComponentStory(dataRoot!, ws, id, params);
        if ("error" in result) return json(result, result.error === "unknown story" || result.error === "no component stories" ? 404 : 400);
        return json(result);
      }
      wm = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/file$/);
      if (wm) {
        const ws = decodeURIComponent(wm[1]);
        const rel = url.searchParams.get("path") ?? "";
        const abs = safeWorkspaceFile(dataRoot!, ws, rel);
        if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
          return json({ error: "not found" }, 404);
        }
        return fileResponse(abs, req.headers.get("range"));
      }
      if (url.pathname === "/api/projects") {
        const ws = url.searchParams.get("workspace") ?? "default";
        return json(listProjects(dataRoot!, ws));
      }
      // ── Runs (#482, read-only operator dashboard over the #480/#481 plane) ──
      if (url.pathname === "/api/runs") {
        const ws = url.searchParams.get("workspace") ?? "default";
        return json(listRuns(dataRoot!, ws));
      }
      const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
      if (runMatch) {
        const ws = url.searchParams.get("workspace") ?? "default";
        const runId = decodeURIComponent(runMatch[1]);
        const summary = summarizeRun(dataRoot!, ws, runId);
        if (!summary) return json({ error: "unknown run" }, 404);
        return json(summary);
      }
      // ── Run graph (#490) — derived source-to-unit canvas model ───────────
      const graphMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/graph$/);
      if (graphMatch) {
        const ws = url.searchParams.get("workspace") ?? "default";
        const runId = decodeURIComponent(graphMatch[1]);
        const graph = buildRunGraph(dataRoot!, ws, runId);
        if (!graph) return json({ error: "unknown run" }, 404);
        return json(graph);
      }
      // ── Config patches read (#491) ───────────────────────────────────────
      const patchMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/config-patches$/);
      if (patchMatch) {
        const ws = url.searchParams.get("workspace") ?? "default";
        const id = decodeURIComponent(patchMatch[1]);
        return json(listPatches({ dataRoot: dataRoot!, workspace: ws, runId: id }));
      }
      // ── Annotations read (#488) ──────────────────────────────────────────
      const annMatch = url.pathname.match(/^\/api\/(projects|runs)\/([^/]+)\/annotations$/);
      if (annMatch) {
        const kind = annMatch[1] === "runs" ? "run" : "project";
        const ws = url.searchParams.get("workspace") ?? "default";
        const id = decodeURIComponent(annMatch[2]);
        const scope = { kind, dataRoot: dataRoot!, workspace: ws, id } as AnnotationScope;
        return json({ annotations: readAnnotations(scope) });
      }
      // ── Inbox list (#489) ────────────────────────────────────────────────
      const inboxMatch = url.pathname.match(/^\/api\/(projects|runs)\/([^/]+)\/inbox$/);
      if (inboxMatch) {
        const kind = inboxMatch[1] === "runs" ? "run" : "project";
        const ws = url.searchParams.get("workspace") ?? "default";
        const id = decodeURIComponent(inboxMatch[2]);
        const scope = { kind, dataRoot: dataRoot!, workspace: ws, id } as InboxScope;
        return json({ inbox: listInboxPacks(scope) });
      }
      let m = url.pathname.match(/^\/api\/projects\/([^/]+)\/artifacts$/);
      if (m) {
        const ws = url.searchParams.get("workspace") ?? "default";
        const id = decodeURIComponent(m[1]);
        if (!fs.existsSync(projectDir(dataRoot!, ws, id))) return json({ error: "unknown project" }, 404);
        return json(listArtifacts(dataRoot!, ws, id));
      }
      m = url.pathname.match(/^\/api\/projects\/([^/]+)\/workflow$/);
      if (m) {
        const ws = url.searchParams.get("workspace") ?? "default";
        const id = decodeURIComponent(m[1]);
        if (!fs.existsSync(projectDir(dataRoot!, ws, id))) return json({ error: "unknown project" }, 404);
        return json(readWorkflowLane(dataRoot!, ws, id));
      }
      m = url.pathname.match(/^\/api\/projects\/([^/]+)\/board$/);
      if (m) {
        const ws = url.searchParams.get("workspace") ?? "default";
        const id = decodeURIComponent(m[1]);
        if (!fs.existsSync(projectDir(dataRoot!, ws, id))) return json({ error: "unknown project" }, 404);
        return json(readBoard(dataRoot!, ws, id));
      }
      m = url.pathname.match(/^\/api\/projects\/([^/]+)\/file$/);
      if (m) {
        const ws = url.searchParams.get("workspace") ?? "default";
        const id = decodeURIComponent(m[1]);
        const rel = url.searchParams.get("path") ?? "";
        const abs = safeProjectFile(dataRoot!, ws, id, rel);
        if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
          return json({ error: "not found" }, 404);
        }
        return fileResponse(abs, req.headers.get("range"));
      }

      // ── Static UI ─────────────────────────────────────────────────────
      const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      for (const root of STATIC_DIRS) {
        const abs = path.resolve(root, rel);
        if ((abs === root || abs.startsWith(root + path.sep)) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
          const ext = path.extname(abs).toLowerCase();
          return new Response(Bun.file(abs), {
            headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
          });
        }
      }
      return json({ error: "not found" }, 404);
    },
  });

  return { server, dataRoot, stop: () => server.stop(true) };
}

if (import.meta.main) {
  const { server, dataRoot } = startStudio({
    port: process.env.STUDIO_PORT ? parseInt(process.env.STUDIO_PORT, 10) : undefined,
  });
  console.log(`studio: browsing ${dataRoot}`);
  console.log(`studio: http://${server.hostname === "0.0.0.0" ? "0.0.0.0" : "127.0.0.1"}:${server.port}`);
  console.log(
    process.env.STUDIO_AUTH_TOKEN
      ? "studio: auth ON (STUDIO_AUTH_TOKEN) — Bearer header or POST /api/auth"
      : "studio: auth OFF — localhost dev mode (set STUDIO_AUTH_TOKEN before exposing a port)",
  );
}
