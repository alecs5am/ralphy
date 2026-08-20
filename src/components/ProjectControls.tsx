import type { ProjectTab } from "../lib/ipc";
import { GooeyTabs, moveGooeyTab, type GooeyTab } from "./ui/GooeyTabs";

export type ProjectView = Exclude<ProjectTab, "compositions">;

interface ProjectControlsProps {
  activeTab: ProjectView;
  onSelect(tab: ProjectView): void;
}

const tabs: Array<GooeyTab<ProjectView>> = [
  { value: "units", label: "Units", id: "project-tab-units", controlsId: "project-panel-units" },
  { value: "documents", label: "Documents", id: "project-tab-documents", controlsId: "project-panel-documents" },
  { value: "media", label: "Media", id: "project-tab-media", controlsId: "project-panel-media", focusFallback: true },
  { value: "activity", label: "Activity", id: "project-tab-activity", controlsId: "project-panel-activity" },
];

export function moveProjectTab(tab: ProjectView, key: string): ProjectView {
  return moveGooeyTab(tabs, tab, key);
}

export function ProjectControls({ activeTab, onSelect }: ProjectControlsProps) {
  return (
    <div className="project-controls">
      <div className="project-toolbar">
        <GooeyTabs tabs={tabs} value={activeTab} onValueChange={onSelect} size="m" ariaLabel="Project view" />
      </div>
    </div>
  );
}
