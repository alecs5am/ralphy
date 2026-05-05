import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import path from "path";
import { createApiRoutes } from "./api.js";
import { createWatcher } from "./watcher.js";
import { createMediaHandler } from "./media.js";
import { createPtyServer } from "./pty.js";

const PORT = parseInt(process.env.DASHBOARD_PORT || "4321", 10);
const PROJECT_ROOT = path.resolve(
  process.env.PROJECT_ROOT || path.join(import.meta.dirname, "..", "..")
);
const WORKSPACE = path.join(PROJECT_ROOT, "workspace");

const app = new Hono();
app.use("*", cors());

// API routes
const apiRoutes = createApiRoutes(PROJECT_ROOT, WORKSPACE);
app.route("/api", apiRoutes);

// Media file serving
const mediaHandler = createMediaHandler(PROJECT_ROOT);
app.route("/media", mediaHandler);

console.log(`ralph dashboard starting...`);
console.log(`  Project root: ${PROJECT_ROOT}`);
console.log(`  Workspace: ${WORKSPACE}`);

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`  Dashboard: http://localhost:${info.port}`);
  console.log(`  API: http://localhost:${info.port}/api`);
  console.log(`  Press Ctrl+C to stop\n`);
});

// WebSocket + file watcher
const watcher = createWatcher(server as any, WORKSPACE);

// PTY WebSocket server
const pty = createPtyServer(server as any, PROJECT_ROOT);

// Single upgrade dispatcher — route by pathname to the right WebSocketServer
(server as any).on("upgrade", (req: any, socket: any, head: Buffer) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname === "/ws") {
    watcher.wss.handleUpgrade(req, socket, head, (ws) => {
      watcher.wss.emit("connection", ws, req);
    });
  } else if (url.pathname === "/pty") {
    pty.wss.handleUpgrade(req, socket, head, (ws) => {
      pty.wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});
