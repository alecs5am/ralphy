import { useCallback, useEffect } from "react";
import { useWorkspace } from "./stores/workspace";
import { useWebSocket } from "./hooks/useWebSocket";
import { Sidebar } from "./components/Sidebar";
import { AreaView } from "./components/AreaView";
import { WelcomeView } from "./views/WelcomeView";
import { ERA, SANS } from "./era/tokens";

function fetchAll() {
  const s = useWorkspace.getState();
  fetch("/api/info").then((r) => r.json()).then((d) => s.setProjectRoot(d.projectRoot)).catch(() => {});
  fetch("/api/projects").then((r) => r.json()).then(s.setProjects).catch(() => {});
  fetch("/api/brands").then((r) => r.json()).then(s.setBrands).catch(() => {});
  fetch("/api/personas").then((r) => r.json()).then(s.setPersonas).catch(() => {});
  fetch("/api/refs").then((r) => r.json()).then(s.setRefs).catch(() => {});
  fetch("/api/batches").then((r) => r.json()).then(s.setBatches).catch(() => {});
  fetch("/api/templates").then((r) => r.json()).then(s.setTemplates).catch(() => {});
  fetch("/api/workspace/stats").then((r) => r.json()).then(s.setStats).catch(() => {});
}

export function App() {
  const editorLayout = useWorkspace((s) => s.editorLayout);
  const openTerminal = useWorkspace((s) => s.openTerminal);

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        openTerminal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTerminal]);

  const handleWs = useCallback((event: any) => {
    if (event.type === "connected") return;
    fetchAll();
  }, []);
  useWebSocket(handleWs);

  return (
    <div
      className="flex h-screen w-screen overflow-hidden"
      style={{ background: ERA.bg, color: ERA.ink, ...SANS }}
    >
      <Sidebar />
      <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
        <AreaView root={editorLayout} emptyPlaceholder={<WelcomeView />} />
      </main>
    </div>
  );
}
