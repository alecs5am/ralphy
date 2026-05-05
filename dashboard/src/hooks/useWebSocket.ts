import { useEffect, useRef } from "react";

type WsEvent = { type: string; path?: string; events?: any[] };
type WsHandler = (event: WsEvent) => void;

const handlers = new Set<WsHandler>();
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const sock = new WebSocket(`${protocol}//${location.host}/ws`);

  sock.onopen = () => console.log("[ws] connected");
  sock.onclose = () => {
    console.log("[ws] disconnected, reconnecting in 2s...");
    ws = null;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 2000);
  };
  sock.onerror = () => sock.close();
  sock.onmessage = (e) => {
    let data: WsEvent;
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }
    for (const h of handlers) h(data);
  };

  ws = sock;
}

export function useWebSocket(onMessage: WsHandler) {
  const ref = useRef(onMessage);
  ref.current = onMessage;

  useEffect(() => {
    const handler: WsHandler = (e) => ref.current(e);
    if (!ws) connect();
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }, []);
}

/** Extract affected file paths from either a single event or a batch event. */
export function eventPaths(e: WsEvent): string[] {
  if (e.type === "batch" && Array.isArray(e.events)) {
    return e.events.map((x: any) => x.path).filter(Boolean);
  }
  if (e.path) return [e.path];
  return [];
}
