import { useEffect, useRef } from "react";
import { Terminal as XTerm, type IDisposable } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { getDrag } from "./dragState";

export const RALPH_PATH_MIME = "application/x-ralph-path";

function shellQuote(s: string): string {
  if (s.length === 0) return "''";
  if (/^[A-Za-z0-9_./@:=+,-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// ---- Shared WebSocket ----
let sharedWs: WebSocket | null = null;
let wsReady: Promise<WebSocket> | null = null;
const listeners = new Map<string, (msg: any) => void>();
const pendingBuffers = new Map<string, any[]>();

function getWs(): Promise<WebSocket> {
  if (sharedWs && sharedWs.readyState === WebSocket.OPEN) {
    return Promise.resolve(sharedWs);
  }
  if (wsReady) return wsReady;

  wsReady = new Promise((resolve, reject) => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/pty`);
    sharedWs = ws;

    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(e);
    ws.onclose = () => {
      sharedWs = null;
      wsReady = null;
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        const cb = listeners.get(msg.id);
        if (cb) {
          cb(msg);
        } else {
          const buf = pendingBuffers.get(msg.id) ?? [];
          buf.push(msg);
          pendingBuffers.set(msg.id, buf);
        }
      } catch {}
    };
  });
  return wsReady;
}

function send(obj: any) {
  getWs().then((ws) => ws.send(JSON.stringify(obj)));
}

// ---- Persistent xterm instances ----
type TermInstance = {
  term: XTerm;
  fit: FitAddon;
  dataSub: IDisposable;
  created: boolean;
};
const instances = new Map<string, TermInstance>();

function getOrCreateInstance(id: string): TermInstance {
  const existing = instances.get(id);
  if (existing) return existing;

  const term = new XTerm({
    cursorBlink: true,
    fontFamily:
      '"JetBrains Mono", "SF Mono", Menlo, Monaco, "Courier New", monospace',
    fontSize: 13,
    lineHeight: 1.2,
    theme: {
      background: "#09090b",
      foreground: "#e4e4e7",
      cursor: "#e4e4e7",
      black: "#18181b",
      brightBlack: "#52525b",
    },
    allowProposedApi: true,
    scrollback: 10000,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon());

  const dataSub = term.onData((data) => {
    send({ type: "input", id, data });
  });

  // Intercept Shift+Enter and send ESC+CR (\x1b\r) — the sequence Claude Code,
  // Zed, iTerm2 and VS Code use as "insert newline without submitting".
  // Returning false cancels xterm's default CR dispatch.
  term.attachCustomKeyEventHandler((ev) => {
    if (ev.type !== "keydown") return true;
    if (ev.key === "Enter" && ev.shiftKey && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault();
      ev.stopPropagation();
      send({ type: "input", id, data: "\x1b\r" });
      return false;
    }
    return true;
  });

  listeners.set(id, (msg) => {
    if (msg.type === "data") term.write(msg.data);
    else if (msg.type === "exit") {
      term.write(
        `\r\n\x1b[31m[process exited: ${msg.exitCode}]\x1b[0m\r\n`
      );
    }
  });

  const inst: TermInstance = { term, fit, dataSub, created: false };
  instances.set(id, inst);
  return inst;
}

export function disposeTerminal(id: string) {
  const inst = instances.get(id);
  if (!inst) return;
  try {
    inst.dataSub.dispose();
    inst.term.dispose();
  } catch {}
  listeners.delete(id);
  pendingBuffers.delete(id);
  instances.delete(id);
  send({ type: "close", id });
}

type Props = {
  sessionId: string;
  active: boolean;
};

export function TerminalView({ sessionId, active }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const inst = getOrCreateInstance(sessionId);

    // Mount: attach xterm DOM to this container
    if (!inst.term.element) {
      inst.term.open(container);
    } else {
      // Re-parent existing xterm element
      container.appendChild(inst.term.element);
    }

    // Flush pending buffered messages (if any arrived before first mount)
    const buf = pendingBuffers.get(sessionId);
    if (buf) {
      for (const msg of buf) {
        if (msg.type === "data") inst.term.write(msg.data);
      }
      pendingBuffers.delete(sessionId);
    }

    const doFit = () => {
      if (!container.offsetWidth) return;
      try {
        inst.fit.fit();
        const cols = inst.term.cols;
        const rows = inst.term.rows;
        if (!inst.created) {
          inst.created = true;
          send({ type: "create", id: sessionId, cols, rows });
        } else {
          send({ type: "resize", id: sessionId, cols, rows });
        }
      } catch {}
    };

    const raf = requestAnimationFrame(doFit);

    const ro = new ResizeObserver(() => {
      if (!container.offsetWidth) return;
      try {
        inst.fit.fit();
        send({
          type: "resize",
          id: sessionId,
          cols: inst.term.cols,
          rows: inst.term.rows,
        });
      } catch {}
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      // Do NOT dispose xterm — keep it alive for reparent.
      // Just detach from current container so React can take over.
      if (inst.term.element && inst.term.element.parentElement === container) {
        try {
          container.removeChild(inst.term.element);
        } catch {}
      }
    };
  }, [sessionId]);

  // Re-fit + focus on activate
  useEffect(() => {
    if (!active) return;
    const inst = instances.get(sessionId);
    if (!inst) return;
    const t = setTimeout(() => {
      try {
        inst.fit.fit();
        inst.term.focus();
        send({
          type: "resize",
          id: sessionId,
          cols: inst.term.cols,
          rows: inst.term.rows,
        });
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, [active, sessionId]);

  function handleDragOver(e: React.DragEvent) {
    // Skip our internal tab drags — those are handled by GroupView overlay
    if (getDrag()) return;
    const types = e.dataTransfer.types;
    if (
      types.includes(RALPH_PATH_MIME) ||
      types.includes("Files") ||
      types.includes("text/uri-list") ||
      types.includes("text/plain")
    ) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    }
  }

  function handleDrop(e: React.DragEvent) {
    if (getDrag()) return;

    // 1) Our internal media drag — custom MIME contains absolute path(s)
    const ralph = e.dataTransfer.getData(RALPH_PATH_MIME);
    if (ralph) {
      e.preventDefault();
      e.stopPropagation();
      const paths = ralph.split("\n").filter(Boolean).map(shellQuote).join(" ");
      send({ type: "input", id: sessionId, data: paths + " " });
      return;
    }

    // 2) Native file drop from Finder/desktop. In Chromium-based Electron apps
    // file.path is populated; in pure browsers it's not (security) — fall back to name.
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      const paths = files
        .map((f) => (f as unknown as { path?: string }).path || f.name)
        .map(shellQuote)
        .join(" ");
      send({ type: "input", id: sessionId, data: paths + " " });
      return;
    }

    // 3) Plain text / URI — e.g. drag from a browser tab or text selection
    const txt =
      e.dataTransfer.getData("text/uri-list") ||
      e.dataTransfer.getData("text/plain");
    if (txt) {
      e.preventDefault();
      e.stopPropagation();
      send({ type: "input", id: sessionId, data: shellQuote(txt.trim()) + " " });
    }
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden"
      style={{ padding: 4, background: "#09090b" }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    />
  );
}
