import {
  Columns2,
  Plus,
  Rows2,
  SquareTerminal,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";

import type { TerminalController } from "../../terminal/controller";
import type {
  TerminalDropPlacement,
  TerminalLeaf,
} from "../../terminal/layout";

export const TERMINAL_TAB_MIME = "application/x-ralphy-terminal-tab";

export interface TerminalPaneSession {
  id: string;
  title: string;
  status: "running" | "exited";
}

interface TerminalPaneProps {
  leaf: TerminalLeaf;
  sessions: Record<string, TerminalPaneSession>;
  controllers: ReadonlyMap<string, TerminalController>;
  visible: boolean;
  onActivate(sessionId: string, leafId: string): void;
  onClose(sessionId: string): void;
  onCreate(leafId: string, placement?: TerminalDropPlacement): void;
  onDropTerminal(
    sessionId: string,
    leafId: string,
    placement: TerminalDropPlacement | null,
  ): void;
  onFocusLeaf(leafId: string): void;
}

function dropPlacement(
  event: DragEvent<HTMLElement>,
): TerminalDropPlacement | null {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / Math.max(bounds.width, 1);
  const y = (event.clientY - bounds.top) / Math.max(bounds.height, 1);
  const edge = 0.22;
  if (y < edge) return "top";
  if (y > 1 - edge) return "bottom";
  if (x < edge) return "left";
  if (x > 1 - edge) return "right";
  return null;
}

export function TerminalPane({
  leaf,
  sessions,
  controllers,
  visible,
  onActivate,
  onClose,
  onCreate,
  onDropTerminal,
  onFocusLeaf,
}: TerminalPaneProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [dropTarget, setDropTarget] = useState<TerminalDropPlacement | "center" | null>(
    null,
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    for (const sessionId of leaf.tabs) {
      controllers.get(sessionId)?.mount(
        viewport,
        visible && sessionId === leaf.activeId,
      );
    }
    if (visible && leaf.activeId) controllers.get(leaf.activeId)?.fit();
  }, [controllers, leaf.activeId, leaf.tabs, visible]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !leaf.activeId) return;
    const observer = new ResizeObserver(() => {
      if (visible) controllers.get(leaf.activeId!)?.fit();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [controllers, leaf.activeId, visible]);

  const closeFromMouse = (event: MouseEvent, sessionId: string) => {
    if (event.button !== 1) return;
    event.preventDefault();
    onClose(sessionId);
  };

  return (
    <section
      className="terminal-pane"
      data-leaf-id={leaf.id}
      onPointerDown={() => onFocusLeaf(leaf.id)}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(TERMINAL_TAB_MIME)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropTarget(dropPlacement(event) ?? "center");
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDropTarget(null);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        const sessionId = event.dataTransfer.getData(TERMINAL_TAB_MIME);
        const placement = dropPlacement(event);
        setDropTarget(null);
        if (sessionId) onDropTerminal(sessionId, leaf.id, placement);
      }}
    >
      <header className="terminal-pane-tabs" role="tablist" aria-label="Terminals">
        <div className="terminal-tab-strip">
          {leaf.tabs.map((sessionId) => {
            const session = sessions[sessionId];
            const active = sessionId === leaf.activeId;
            return (
              <button
                className={`terminal-tab${active ? " is-active" : ""}`}
                type="button"
                role="tab"
                aria-selected={active}
                draggable
                key={sessionId}
                onClick={() => {
                  onActivate(sessionId, leaf.id);
                  requestAnimationFrame(() => controllers.get(sessionId)?.focus());
                }}
                onAuxClick={(event) => closeFromMouse(event, sessionId)}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(TERMINAL_TAB_MIME, sessionId);
                }}
              >
                <SquareTerminal size={13} strokeWidth={1.5} />
                <span>{session?.title ?? "Terminal"}</span>
                <i
                  className={`terminal-status-dot is-${session?.status ?? "running"}`}
                  aria-label={session?.status ?? "running"}
                />
                <span
                  className="terminal-tab-close"
                  role="button"
                  aria-label={`Close ${session?.title ?? "terminal"}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(sessionId);
                  }}
                >
                  <X size={12} strokeWidth={1.5} />
                </span>
              </button>
            );
          })}
        </div>
        <div className="terminal-pane-actions">
          <button
            className="terminal-action"
            type="button"
            title="New terminal"
            aria-label="New terminal"
            onClick={() => onCreate(leaf.id)}
          >
            <Plus size={14} strokeWidth={1.5} />
          </button>
          <button
            className="terminal-action"
            type="button"
            title="Split right"
            aria-label="Split terminal right"
            onClick={() => onCreate(leaf.id, "right")}
          >
            <Columns2 size={14} strokeWidth={1.5} />
          </button>
          <button
            className="terminal-action"
            type="button"
            title="Split down"
            aria-label="Split terminal down"
            onClick={() => onCreate(leaf.id, "bottom")}
          >
            <Rows2 size={14} strokeWidth={1.5} />
          </button>
        </div>
      </header>
      <div className="terminal-pane-viewport" ref={viewportRef} />
      {dropTarget && (
        <div className="terminal-drop-overlay" aria-hidden="true">
          {(["top", "right", "bottom", "left"] as const).map((placement) => (
            <span
              className={`terminal-drop-zone is-${placement}${
                dropTarget === placement ? " is-target" : ""
              }`}
              key={placement}
            />
          ))}
          <span
            className={`terminal-drop-zone is-center${
              dropTarget === "center" ? " is-target" : ""
            }`}
          />
        </div>
      )}
    </section>
  );
}
