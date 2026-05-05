import { WebSocketServer, WebSocket } from "ws";
import { spawn, type IPty } from "@homebridge/node-pty-prebuilt-multiarch";
import os from "os";
import type { Server } from "http";

type Session = {
  id: string;
  pty: IPty;
  ws: WebSocket;
};

const DEFAULT_SHELL =
  process.env.SHELL ||
  (os.platform() === "win32" ? "powershell.exe" : "/bin/zsh");

export function createPtyServer(_server: Server, projectRoot: string) {
  const wss = new WebSocketServer({ noServer: true });
  const sessions = new Map<string, Session>();

  wss.on("connection", (ws) => {
    const owned = new Set<string>();

    ws.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === "create") {
        const { id, cols = 80, rows = 24, cwd, shell, args } = msg;
        if (!id || sessions.has(id)) return;

        const ptyProc = spawn(shell || DEFAULT_SHELL, args || [], {
          name: "xterm-256color",
          cols,
          rows,
          cwd: cwd || projectRoot,
          env: {
            ...process.env,
            TERM: "xterm-256color",
            COLORTERM: "truecolor",
          },
        });

        ptyProc.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "data", id, data }));
          }
        });

        ptyProc.onExit(({ exitCode, signal }) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "exit", id, exitCode, signal }));
          }
          sessions.delete(id);
          owned.delete(id);
        });

        sessions.set(id, { id, pty: ptyProc, ws });
        owned.add(id);
        ws.send(JSON.stringify({ type: "created", id, pid: ptyProc.pid }));
        return;
      }

      const session = sessions.get(msg.id);
      if (!session) return;

      if (msg.type === "input") {
        session.pty.write(msg.data);
      } else if (msg.type === "resize") {
        const cols = Math.max(1, msg.cols | 0);
        const rows = Math.max(1, msg.rows | 0);
        try {
          session.pty.resize(cols, rows);
        } catch {}
      } else if (msg.type === "close") {
        try {
          session.pty.kill();
        } catch {}
        sessions.delete(msg.id);
        owned.delete(msg.id);
      }
    });

    ws.on("close", () => {
      for (const id of owned) {
        const s = sessions.get(id);
        if (s) {
          try {
            s.pty.kill();
          } catch {}
          sessions.delete(id);
        }
      }
      owned.clear();
    });
  });

  console.log(`  PTY WebSocket: ws://localhost:4321/pty`);
  return { wss, sessions };
}
