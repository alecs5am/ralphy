import { useEffect, useState } from "react";
import { useWorkspace, type Group, type Tab } from "../stores/workspace";
import { computeSide, type Side } from "../stores/layout";
import { TabBar } from "./TabBar";
import { TerminalView as XTermView } from "./Terminal";
import { ProjectDetail } from "../views/ProjectDetail";
import { BrandDetail } from "../views/BrandDetail";
import { PersonaDetail } from "../views/PersonaDetail";
import { RefDetail } from "../views/RefDetail";
import { RefsLibrary } from "../views/RefsLibrary";
import { TemplateDetail } from "../views/TemplateDetail";
import { BatchDetail } from "../views/BatchDetail";
import { WelcomeView } from "../views/WelcomeView";
import { getDrag, setDrag, subscribeDrag } from "./dragState";
import { ERA, MONO } from "../era/tokens";

type Props = {
  group: Group;
  isActiveGroup: boolean;
};

export function GroupView({ group, isActiveGroup }: Props) {
  const { splitWithTab, moveTab, setActiveGroup } = useWorkspace();
  const [side, setSide] = useState<Side | "center" | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const unsub = subscribeDrag((p) => setDragging(!!p));
    return () => {
      unsub();
    };
  }, []);

  function handleDrop(e: React.DragEvent) {
    const src = getDrag();
    if (!src) return;
    e.preventDefault();
    e.stopPropagation();
    if (!side) return;
    if (side === "center") {
      moveTab(src, { area: "editor", groupId: group.id, beforeTabId: null });
    } else {
      splitWithTab(src, { area: "editor", groupId: group.id, side });
    }
    setSide(null);
    setDrag(null);
  }

  return (
    <div
      className="h-full flex flex-col min-w-0 min-h-0"
      style={{ background: ERA.bg }}
      onMouseDown={() => setActiveGroup(group.id)}
    >
      <TabBar group={group} isActiveGroup={isActiveGroup} />

      <div className="flex-1 min-h-0 overflow-hidden relative">
        {group.tabs.length === 0 ? (
          <WelcomeView />
        ) : (
          group.tabs.map((t) => {
            const isActive = t.id === group.activeTabId;
            return (
              <div
                key={t.id}
                className="absolute inset-0 overflow-hidden"
                style={{ display: isActive ? "block" : "none" }}
              >
                {renderTabContent(t, isActive && isActiveGroup)}
              </div>
            );
          })
        )}

        {dragging && (
          <div
            className="absolute inset-0 z-10"
            onDragOver={(e) => {
              if (!getDrag()) return;
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "move";
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const nx = (e.clientX - rect.left) / rect.width - 0.5;
              const ny = (e.clientY - rect.top) / rect.height - 0.5;
              const dist = Math.max(Math.abs(nx), Math.abs(ny));
              if (dist < 0.18) {
                setSide("center");
              } else {
                setSide(computeSide(rect, e.clientX, e.clientY));
              }
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              setSide(null);
            }}
            onDrop={handleDrop}
          >
            <DropHighlight side={side} />
          </div>
        )}
      </div>
    </div>
  );
}

function DropHighlight({ side }: { side: Side | "center" | null }) {
  if (!side) return null;
  const baseStyle = {
    position: "absolute" as const,
    background: "rgba(10,10,10,0.06)",
    border: `1px dashed ${ERA.ink}`,
    pointerEvents: "none" as const,
    transition: "all 75ms",
    zIndex: 11,
  };
  if (side === "left")
    return <div style={{ ...baseStyle, top: 0, bottom: 0, left: 0, width: "50%" }} />;
  if (side === "right")
    return <div style={{ ...baseStyle, top: 0, bottom: 0, right: 0, width: "50%" }} />;
  if (side === "top")
    return <div style={{ ...baseStyle, left: 0, right: 0, top: 0, height: "50%" }} />;
  if (side === "bottom")
    return <div style={{ ...baseStyle, left: 0, right: 0, bottom: 0, height: "50%" }} />;
  return <div style={{ ...baseStyle, inset: 0 }} />;
}

function renderTabContent(tab: Tab, active: boolean) {
  if (tab.kind === "terminal") {
    return <TerminalChrome sessionId={tab.id} active={active} />;
  }
  switch (tab.type) {
    case "project":
      return <ProjectDetail projectId={tab.entityId!} />;
    case "brand":
      return <BrandDetail brandId={tab.entityId!} />;
    case "persona":
      return <PersonaDetail personaId={tab.entityId!} />;
    case "ref":
      return <RefDetail refId={tab.entityId!} />;
    case "refs":
      return <RefsLibrary />;
    case "template":
      return <TemplateDetail templateId={tab.entityId!} />;
    case "batch":
      return <BatchDetail batchId={tab.entityId!} />;
    default:
      return (
        <div className="p-4 text-xs" style={{ color: ERA.mute }}>
          unknown tab type: {String((tab as any).type)}
        </div>
      );
  }
}

function TerminalChrome({ sessionId, active }: { sessionId: string; active: boolean }) {
  return (
    <div className="h-full flex flex-col" style={{ background: ERA.bg }}>
      <div
        className="px-6 py-3 flex items-center justify-between text-[10px] shrink-0"
        style={{
          borderBottom: `1px solid ${ERA.rule}`,
          color: ERA.mute,
          ...MONO,
        }}
      >
        <div className="flex items-center gap-3">
          <span>ralph@workspace</span>
          <span>:</span>
          <span>~</span>
          <span style={{ color: ERA.mute }}>—</span>
          <span>zsh</span>
        </div>
        <span className="flex items-center gap-1.5">
          <span
            className="w-1 h-1 rounded-full"
            style={{ background: ERA.ok, display: "inline-block" }}
          />
          online
        </span>
      </div>
      <div className="flex-1 min-h-0 era-terminal">
        <XTermView sessionId={sessionId} active={active} />
      </div>
    </div>
  );
}
