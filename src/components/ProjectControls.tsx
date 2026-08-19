import { Activity, FileText, Images, LayoutDashboard, Package, type LucideIcon } from "lucide-react";
import { useRef } from "react";
import type { ProjectTab } from "../lib/ipc";
import { moveGooeyTab, type GooeyTab } from "./ui/GooeyTabs";

export type ProjectView = "overview" | Exclude<ProjectTab, "compositions">;

interface ProjectControlsProps {
  activeTab: ProjectView;
  onSelect(tab: ProjectView): void;
}

const tabs: Array<GooeyTab<ProjectView> & { icon: LucideIcon }> = [
  { value: "overview", label: "Overview", icon: LayoutDashboard, id: "project-tab-overview", controlsId: "project-panel-overview" },
  { value: "documents", label: "Documents", icon: FileText, id: "project-tab-documents", controlsId: "project-panel-documents" },
  { value: "media", label: "Media", icon: Images, id: "project-tab-media", controlsId: "project-panel-media", focusFallback: true },
  { value: "units", label: "Units", icon: Package, id: "project-tab-units", controlsId: "project-panel-units" },
  { value: "activity", label: "Activity", icon: Activity, id: "project-tab-activity", controlsId: "project-panel-activity" },
];

export function moveProjectTab(tab: ProjectView, key: string): ProjectView {
  return moveGooeyTab(tabs, tab, key);
}

export function ProjectControls({ activeTab, onSelect }: ProjectControlsProps) {
  const buttons = useRef<Partial<Record<ProjectView, HTMLButtonElement>>>({});
  return (
    <div className="project-controls">
      <div className="project-toolbar">
        <div className="project-dock" role="tablist" aria-label="Project view">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return <button
              id={tab.id}
              type="button"
              role="tab"
              aria-label={String(tab.label)}
              aria-controls={tab.controlsId}
              aria-selected={activeTab === tab.value}
              title={String(tab.label)}
              data-tooltip={tab.label}
              data-media-focus-fallback={tab.focusFallback ? "true" : undefined}
              tabIndex={activeTab === tab.value ? 0 : -1}
              ref={(button) => { buttons.current[tab.value] = button ?? undefined; }}
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
              <Icon size={17} aria-hidden="true" />
            </button>;
          })}
        </div>
      </div>
    </div>
  );
}
