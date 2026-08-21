import { LoaderCircle, Plus } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import "../../styles/terminal.css";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";

import { bridge, type TerminalEvent, type TerminalSession } from "../../lib/ipc";
import { TerminalController } from "../../terminal/controller";
import {
  activateTerminalTab,
  addTerminalTab,
  closeTerminalTab,
  createTerminalLayout,
  moveTerminalTab,
  setSplitRatio,
  splitTerminalTab,
  type TerminalDropPlacement,
  type TerminalLayoutNode,
  type TerminalSplit,
} from "../../terminal/layout";
import {
  TerminalPane,
  type TerminalPaneSession,
} from "./TerminalPane";
import { RalphyMascot } from "../RalphyMascot";
import { useTheme } from "../../instrument/ThemeProvider";

const MAX_PENDING_OUTPUT = 1024 * 1024;

function terminalTitle(session: TerminalSession): string {
  const shell = session.shell.split("/").at(-1) ?? "shell";
  return `${session.label} — ${shell}`;
}

interface LayoutViewProps {
  node: TerminalLayoutNode;
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
  onRatio(splitId: string, ratio: number): void;
}

function SplitLayout({
  split,
  ...props
}: Omit<LayoutViewProps, "node"> & { split: TerminalSplit }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<number | null>(null);
  const row = split.axis === "row";
  const firstStyle = {
    flexBasis: `calc(${split.ratio * 100}% - 3px)`,
  } as CSSProperties;

  const finishResize = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className={`terminal-split is-${split.axis}`}
      ref={containerRef}
    >
      <div className="terminal-split-child" style={firstStyle}>
        <LayoutView node={split.first} {...props} />
      </div>
      <div
        className="terminal-split-gutter"
        role="separator"
        aria-label={row ? "Resize terminal columns" : "Resize terminal rows"}
        aria-orientation={row ? "vertical" : "horizontal"}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragRef.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (dragRef.current !== event.pointerId || !containerRef.current) return;
          const bounds = containerRef.current.getBoundingClientRect();
          const ratio = row
            ? (event.clientX - bounds.left) / Math.max(bounds.width, 1)
            : (event.clientY - bounds.top) / Math.max(bounds.height, 1);
          props.onRatio(split.id, ratio);
        }}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        onLostPointerCapture={(event) => {
          if (dragRef.current === event.pointerId) dragRef.current = null;
        }}
      />
      <div className="terminal-split-child">
        <LayoutView node={split.second} {...props} />
      </div>
    </div>
  );
}

function LayoutView({ node, ...props }: LayoutViewProps) {
  if (node.kind === "split") return <SplitLayout split={node} {...props} />;
  return <TerminalPane leaf={node} {...props} />;
}

export function TerminalWorkspace({
  visible,
  rootPath,
}: {
  visible: boolean;
  rootPath: string | null;
}) {
  const { resolved } = useTheme();
  const [layout, setLayout] = useState<TerminalLayoutNode>(createTerminalLayout);
  const [sessions, setSessions] = useState<Record<string, TerminalPaneSession>>({});
  const [focusedLeafId, setFocusedLeafId] = useState("terminal-root");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllers = useRef(new Map<string, TerminalController>());
  const pendingOutput = useRef(new Map<string, string>());
  const closedSessionIds = useRef(new Set<string>());
  const initialSessionCreated = useRef(false);

  useEffect(() => {
    for (const controller of controllers.current.values()) controller.setTheme(resolved);
  }, [resolved]);

  useEffect(() => bridge.onTerminalEvent((event: TerminalEvent) => {
    if (closedSessionIds.current.has(event.sessionId)) return;
    const controller = controllers.current.get(event.sessionId);
    if (event.type === "data") {
      if (controller) {
        controller.write(event.data);
      } else {
        const pending = `${pendingOutput.current.get(event.sessionId) ?? ""}${event.data}`;
        pendingOutput.current.set(
          event.sessionId,
          pending.slice(-MAX_PENDING_OUTPUT),
        );
      }
      return;
    }
    controller?.write(
      `\r\n\u001b[90m[process exited ${event.exitCode}]\u001b[0m\r\n`,
    );
    setSessions((current) => {
      const session = current[event.sessionId];
      if (!session) return current;
      return {
        ...current,
        [event.sessionId]: { ...session, status: "exited" },
      };
    });
  }), []);

  const createSession = useCallback(async (
    leafId?: string,
    placement?: TerminalDropPlacement,
  ) => {
    if (!rootPath || creating) return;
    setCreating(true);
    setError(null);
    try {
      const session = await bridge.createTerminal({ cols: 100, rows: 24 });
      const controller = new TerminalController(session, bridge, (title) => {
        const cleanTitle = title.trim();
        if (!cleanTitle) return;
        setSessions((current) => {
          const existing = current[session.id];
          return existing
            ? { ...current, [session.id]: { ...existing, title: cleanTitle } }
            : current;
        });
      }, resolved);
      controllers.current.set(session.id, controller);
      const pending = pendingOutput.current.get(session.id);
      if (pending) {
        controller.write(pending);
        pendingOutput.current.delete(session.id);
      }
      setSessions((current) => ({
        ...current,
        [session.id]: {
          id: session.id,
          title: terminalTitle(session),
          status: "running",
        },
      }));
      setLayout((current) => {
        if (placement && leafId) {
          const split = splitTerminalTab(current, session.id, leafId, placement);
          if (split !== current) return split;
        }
        const added = addTerminalTab(current, session.id, leafId);
        return added === current
          ? addTerminalTab(current, session.id)
          : added;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCreating(false);
    }
  }, [creating, resolved, rootPath]);

  useEffect(() => {
    if (!visible || !rootPath || initialSessionCreated.current) return;
    initialSessionCreated.current = true;
    void createSession();
  }, [createSession, rootPath, visible]);

  const closeSession = useCallback((sessionId: string) => {
    closedSessionIds.current.add(sessionId);
    pendingOutput.current.delete(sessionId);
    controllers.current.get(sessionId)?.dispose();
    controllers.current.delete(sessionId);
    setLayout((current) => closeTerminalTab(current, sessionId));
    setSessions((current) => {
      const next = { ...current };
      delete next[sessionId];
      return next;
    });
    void bridge.killTerminal(sessionId);
  }, []);

  const sessionCount = Object.keys(sessions).length;
  return (
    <div className="terminal-workspace">
      {sessionCount === 0 ? (
        <div className="terminal-empty">
          <span className="terminal-empty-mark">
            <RalphyMascot size={34} />
          </span>
          <span>{rootPath ? "Terminal workspace" : "Choose a .ralphy library"}</span>
          {rootPath && (
            <button
              className="terminal-empty-create"
              type="button"
              disabled={creating}
              onClick={() => void createSession(focusedLeafId)}
            >
              {creating ? (
                <LoaderCircle className="is-spinning" size={14} strokeWidth={1.5} />
              ) : (
                <Plus size={14} strokeWidth={1.5} />
              )}
              New terminal
            </button>
          )}
          {error && <small>{error}</small>}
        </div>
      ) : (
        <LayoutView
          node={layout}
          sessions={sessions}
          controllers={controllers.current}
          visible={visible}
          onActivate={(sessionId, leafId) => {
            setFocusedLeafId(leafId);
            setLayout((current) => activateTerminalTab(current, sessionId));
          }}
          onClose={closeSession}
          onCreate={(leafId, placement) => {
            setFocusedLeafId(leafId);
            void createSession(leafId, placement);
          }}
          onDropTerminal={(sessionId, leafId, placement) => {
            setFocusedLeafId(leafId);
            setLayout((current) => placement
              ? splitTerminalTab(current, sessionId, leafId, placement)
              : moveTerminalTab(current, sessionId, leafId));
          }}
          onFocusLeaf={setFocusedLeafId}
          onRatio={(splitId, ratio) => {
            setLayout((current) => setSplitRatio(current, splitId, ratio));
          }}
        />
      )}
      {creating && sessionCount > 0 && (
        <span className="terminal-creating" aria-label="Creating terminal">
          <LoaderCircle className="is-spinning" size={13} strokeWidth={1.5} />
        </span>
      )}
    </div>
  );
}
