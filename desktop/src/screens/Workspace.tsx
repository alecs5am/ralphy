import { useEffect, useState } from "react";
import { bridge, type AgentEvent, type PermissionRequest } from "../lib/ipc";
import { Chat } from "../components/Chat";
import { ProjectPanel } from "../components/ProjectPanel";
import { PermissionModal } from "../components/PermissionModal";

export interface ChatItem {
  kind: "user" | "assistant" | "tool";
  text?: string;
  tool?: { name: string; summary: string; estCostUsd?: number; running: boolean };
  toolId?: string;
}

export function Workspace() {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState<PermissionRequest | null>(null);

  useEffect(() => {
    const offEvent = bridge.onEvent((e: AgentEvent) => {
      setItems((prev) => reduce(prev, e));
      if (e.type === "result") setBusy(false);
    });
    const offPerm = bridge.onPermission(setPerm);
    return () => { offEvent(); offPerm(); };
  }, []);

  const send = (prompt: string) => {
    setItems((p) => [...p, { kind: "user", text: prompt }]);
    setBusy(true);
    bridge.send(prompt);
  };

  const resolve = (allow: boolean) => {
    if (perm) bridge.resolvePermission(perm.id, allow);
    setPerm(null);
  };

  return (
    <div className="shell">
      <div className="titlebar">
        <div className="traffic">
          <i style={{ background: "#FF5F57" }} /><i style={{ background: "#FEBC2E" }} /><i style={{ background: "#28C840" }} />
        </div>
        <span className="brand">Ralphy</span>
        <span className="project">workspace/projects/spring-2026-001</span>
      </div>
      <Chat items={items} busy={busy} onSend={send} />
      <ProjectPanel items={items} />
      {perm && <PermissionModal req={perm} onResolve={resolve} />}
    </div>
  );
}

/** Fold a stream event into the chat item list. */
function reduce(prev: ChatItem[], e: AgentEvent): ChatItem[] {
  switch (e.type) {
    case "assistant-text":
      return [...prev, { kind: "assistant", text: e.text }];
    case "tool-use":
      return [...prev, { kind: "tool", toolId: e.id, tool: { name: e.name, summary: e.summary, estCostUsd: e.estCostUsd, running: true } }];
    case "tool-result":
      return prev.map((it) =>
        it.kind === "tool" && it.toolId === e.id && it.tool
          ? { ...it, tool: { ...it.tool, running: false } }
          : it,
      );
    default:
      return prev;
  }
}
