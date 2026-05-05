import { useState } from "react";
import { useWorkspace, type Group, type Tab } from "../stores/workspace";
import { ERA, MONO } from "../era/tokens";
import {
  PlusIcon,
  TerminalIcon,
  XIcon,
  TAB_ICONS,
  FileJsonIcon,
} from "../era/icons";
import { disposeTerminal } from "./Terminal";
import { getDrag, setDrag } from "./dragState";

type Props = {
  group: Group;
  isActiveGroup: boolean;
};

export function TabBar({ group }: Props) {
  const {
    setActiveTab,
    closeTab,
    setActiveGroup,
    moveTab,
    openTerminal,
    openViewTab,
    projects,
  } = useWorkspace();
  const [dropBeforeTabId, setDropBeforeTabId] = useState<string | null | "end">(null);

  function onTabClose(tab: Tab) {
    if (tab.kind === "terminal") disposeTerminal(tab.id);
    closeTab(group.id, tab.id);
  }

  function openNew() {
    if (projects[0]) {
      openViewTab({
        id: `project:${projects[0].id}`,
        type: "project",
        label: projects[0].name || projects[0].id,
        entityId: projects[0].id,
      });
    }
  }

  return (
    <div
      className="flex items-stretch shrink-0 relative flex-nowrap"
      style={{
        borderBottom: `1px solid ${ERA.rule}`,
        background: ERA.bg,
        whiteSpace: "nowrap",
      }}
      onMouseDown={() => setActiveGroup(group.id)}
    >
      <div
        className="flex items-stretch min-w-0 overflow-x-auto flex-1"
        style={{ scrollbarWidth: "none" }}
        onDragOver={(e) => {
          if (!getDrag()) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (dropBeforeTabId === null) setDropBeforeTabId("end");
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDropBeforeTabId(null);
        }}
        onDrop={(e) => {
          const src = getDrag();
          if (!src) return;
          e.preventDefault();
          e.stopPropagation();
          const before =
            dropBeforeTabId === "end" || !dropBeforeTabId ? null : dropBeforeTabId;
          moveTab(src, { area: "editor", groupId: group.id, beforeTabId: before });
          setDropBeforeTabId(null);
          setDrag(null);
        }}
      >
        {group.tabs.map((tab, i) => {
          const active = tab.id === group.activeTabId;
          const Icon =
            tab.kind === "terminal"
              ? TAB_ICONS.terminal
              : (TAB_ICONS as any)[tab.type] || FileJsonIcon;
          const showBefore = dropBeforeTabId === tab.id;
          return (
            <div
              key={tab.id}
              draggable
              onDragStart={(e) => {
                setDrag({ area: "editor", groupId: group.id, tabId: tab.id });
                e.dataTransfer.effectAllowed = "move";
                try {
                  e.dataTransfer.setData("text/plain", tab.id);
                } catch {}
              }}
              onDragEnd={() => {
                setDrag(null);
                setDropBeforeTabId(null);
              }}
              onDragOver={(e) => {
                if (!getDrag()) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "move";
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const midpoint = rect.left + rect.width / 2;
                setDropBeforeTabId(
                  e.clientX < midpoint ? tab.id : nextTabId(group.tabs, tab.id)
                );
              }}
              onClick={() => setActiveTab(group.id, tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onTabClose(tab);
                }
              }}
              className="px-3 h-9 flex items-center gap-2 text-[12px] relative shrink-0 cursor-pointer"
              style={{
                borderRight: `1px solid ${ERA.rule}`,
                background: active ? ERA.bg : ERA.panel,
                color: active ? ERA.ink : ERA.sub,
                fontWeight: active ? 500 : 400,
              }}
            >
              {showBefore && (
                <span
                  className="absolute -left-px top-0 bottom-0 w-px"
                  style={{ background: ERA.ink, zIndex: 1 }}
                />
              )}
              <span
                className="text-[10px]"
                style={{ color: ERA.mute, ...MONO }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <Icon size={11} style={{ color: active ? ERA.ink : ERA.mute }} />
              <span
                className="truncate max-w-[180px]"
                style={{ whiteSpace: "nowrap" }}
              >
                {tab.label.toLowerCase()}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab);
                }}
                className="ml-1 w-4 h-4 flex items-center justify-center hover:bg-black/5"
                style={{ color: ERA.mute }}
                aria-label="close tab"
              >
                <XIcon size={9} />
              </button>
              {active && (
                <span
                  className="absolute left-0 right-0 top-0 h-px"
                  style={{ background: ERA.ink }}
                />
              )}
              {active && (
                <span
                  className="absolute left-0 right-0 -bottom-px h-px"
                  style={{ background: ERA.bg }}
                />
              )}
            </div>
          );
        })}
        {dropBeforeTabId === "end" && (
          <span
            className="self-center w-px h-6 mx-1"
            style={{ background: ERA.ink }}
          />
        )}
        <button
          onClick={openNew}
          className="px-3 h-9 flex items-center text-[12px] shrink-0"
          style={{
            color: ERA.mute,
            borderRight: `1px solid ${ERA.rule}`,
          }}
          title="new tab"
        >
          <PlusIcon size={11} />
        </button>
      </div>

      <div className="flex items-stretch shrink-0">
        <button
          onClick={openTerminal}
          className="px-3 h-9 text-[12px] flex items-center gap-1.5"
          style={{
            color: ERA.sub,
            borderLeft: `1px solid ${ERA.rule}`,
          }}
          title="open terminal in this group"
        >
          <TerminalIcon size={11} />
          <span>terminal</span>
        </button>
      </div>
    </div>
  );
}

function nextTabId(tabs: Tab[], id: string): string | null {
  const idx = tabs.findIndex((t) => t.id === id);
  return tabs[idx + 1]?.id ?? null;
}
