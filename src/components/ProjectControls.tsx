import type { ProjectTab } from "../lib/ipc";
import { Activity, FileText, Image, Layers3 } from "lucide-react";
import { ProjectDock } from "../instrument/ProjectDock";
import { moveGooeyTab, type GooeyTab } from "./ui/GooeyTabs";

export type ProjectView = Exclude<ProjectTab, "compositions">;

interface ProjectControlsProps {
  activeTab: ProjectView;
  onSelect(tab: ProjectView): void;
}

const tabs = [
  { value: "units", label: "Units", id: "project-tab-units", controlsId: "project-panel-units" },
  { value: "documents", label: "Documents", id: "project-tab-documents", controlsId: "project-panel-documents" },
  { value: "media", label: "Media", id: "project-tab-media", controlsId: "project-panel-media", focusFallback: true },
  { value: "activity", label: "Activity", id: "project-tab-activity", controlsId: "project-panel-activity" },
] as const satisfies readonly GooeyTab<ProjectView>[];

const dockItems = [
  { id: "documents", label: "Documents", icon: FileText },
  { id: "media", label: "Media", icon: Image },
  { id: "units", label: "Units", icon: Layers3 },
  { id: "activity", label: "Activity", icon: Activity },
] as const;

export const PROJECT_VIEWS = tabs.map(({ value }) => value);

export function moveProjectTab(tab: ProjectView, key: string): ProjectView {
  return moveGooeyTab(tabs, tab, key);
}

export function ProjectControls({ activeTab, onSelect }: ProjectControlsProps) {
  return (
    <div className="project-controls"><ProjectDock active={activeTab} items={dockItems} onSelect={onSelect} /></div>
  );
}
