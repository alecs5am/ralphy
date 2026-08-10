import { useRef } from "react";
import type { ProjectTab } from "../lib/ipc";

export type ProjectView = "overview" | ProjectTab;

interface ProjectControlsProps {
  activeTab: ProjectView;
  onSelect(tab: ProjectView): void;
}

const tabs: Array<{ value: ProjectView; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "documents", label: "Documents" },
  { value: "media", label: "Media" },
  { value: "compositions", label: "Compositions" },
  { value: "units", label: "Units" },
  { value: "activity", label: "Activity" },
];

export function moveProjectTab(tab: ProjectView, key: string): ProjectView {
  if (key === "Home") return tabs[0].value;
  if (key === "End") return tabs[tabs.length - 1].value;
  const direction = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
  if (direction === 0) return tab;
  const index = tabs.findIndex((candidate) => candidate.value === tab);
  return tabs[(index + direction + tabs.length) % tabs.length].value;
}

export function ProjectControls({ activeTab, onSelect }: ProjectControlsProps) {
  const buttons = useRef<Partial<Record<ProjectView, HTMLButtonElement>>>({});
  return (
    <div className="project-controls">
      <div className="project-toolbar">
        <div className="mode-segments" role="tablist" aria-label="Project view">
          {tabs.map((tab) => (
            <button
              id={`project-tab-${tab.value}`}
              type="button"
              role="tab"
              aria-controls={`project-panel-${tab.value}`}
              aria-selected={activeTab === tab.value}
              tabIndex={activeTab === tab.value ? 0 : -1}
              ref={(button) => { buttons.current[tab.value] = button ?? undefined; }}
              className={activeTab === tab.value ? "is-active" : ""}
              key={tab.value}
              onClick={() => onSelect(tab.value)}
              onKeyDown={(event) => {
                const next = moveProjectTab(activeTab, event.key);
                if (next === activeTab) return;
                event.preventDefault();
                onSelect(next);
                buttons.current[next]?.focus();
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
