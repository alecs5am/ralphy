// Studio — local artifact browser server (#107).
//
// One Bun.serve process: static UI (studio/src/) + JSON API + WebSocket
// live-watch. READ-ONLY over MEDIA (AGENTS.md invariant #14): no code path here
// writes, renames, or deletes any artifact. The only writes are sidecar
// METADATA, never media: the board choice + node layout (#478, board.json), the
// object annotations (#488, annotations.jsonl), and the agent context inbox
// (#489, agent-inbox/). Every other non-GET stays 405.
//
// Run by the USER in their own shell (`bun run dev` inside studio/) — never
// auto-launched by the agent (AGENTS.md invariant #5).

import path from "node:path";
import fs from "node:fs";
import {
  resolveDataRoot,
  listWorkspaces,
  listProjects,
  listArtifacts,
  safeProjectFile,
  projectDir,
  kindOfRelPath,
  mediaType,
  readWorkflowLane,
  readBoard,
  writeBoardChoice,
  writeBoardLayout,
  listRuns,
  summarizeRun,
  MIME,
} from "./lib.js";
import { readAnnotations, addAnnotation, removeAnnotation, type AnnotationScope } from "./annotations.js";
import { writeInboxPack, listInboxPacks, type InboxScope } from "./inbox.js";
import { buildRunGraph, writeRunCanvasLayout } from "./graph.js";

const SRC_DIR = path.join(import.meta.dir, "..", "src");

export type StudioServer = ReturnType<typeof startStudio>;

export function startStudio(opts: { port?: number; rootStartDir?: string } = {}) {
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
    hostname: "127.0.0.1",
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
      const abs = path.resolve(SRC_DIR, rel);
      if ((abs === SRC_DIR || abs.startsWith(SRC_DIR + path.sep)) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        const ext = path.extname(abs).toLowerCase();
        return new Response(Bun.file(abs), {
          headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
        });
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
  console.log(`studio: http://127.0.0.1:${server.port}`);
}
