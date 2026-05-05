import { WebSocketServer, WebSocket } from "ws";
import { watch } from "chokidar";
import type { Server } from "http";

export function createWatcher(_server: Server, workspace: string) {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: "connected", workspace }));
    ws.on("close", () => clients.delete(ws));
  });

  function broadcast(data: Record<string, unknown>) {
    const msg = JSON.stringify(data);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  // Debounce rapid file changes
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingEvents: Array<Record<string, unknown>> = [];

  function queueEvent(event: Record<string, unknown>) {
    pendingEvents.push(event);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      // Send individual events if few, batch if many
      if (pendingEvents.length <= 5) {
        for (const e of pendingEvents) broadcast(e);
      } else {
        broadcast({
          type: "batch",
          events: [...pendingEvents],
          count: pendingEvents.length,
        });
      }
      pendingEvents.length = 0;
      debounceTimer = null;
    }, 300);
  }

  const watcher = watch(workspace, {
    ignoreInitial: true,
    ignored: [
      "**/node_modules/**",
      "**/.DS_Store",
    ],
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  watcher
    .on("add", (filePath) => {
      console.log(`  [watch] + ${filePath}`);
      queueEvent({ type: "file:created", path: filePath });
    })
    .on("change", (filePath) => {
      console.log(`  [watch] ~ ${filePath}`);
      queueEvent({ type: "file:changed", path: filePath });
    })
    .on("unlink", (filePath) => {
      console.log(`  [watch] - ${filePath}`);
      queueEvent({ type: "file:deleted", path: filePath });
    });

  console.log(`  Watching: ${workspace}`);
  console.log(`  WebSocket: ws://localhost:4321/ws`);

  return { wss, watcher };
}
