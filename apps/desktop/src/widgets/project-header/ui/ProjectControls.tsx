import { PageHeader, PageHeaderMore, PAGE_HEADER_BUTTON } from "@/shared/ui/PageHeader";
import { Activity, ArrowLeft, Clapperboard, FileText, FolderOpen } from "@/shared/ui/icons";
import type { ProjectView } from "@/shared/model/routes";

export type { ProjectView };

interface ProjectControlsProps {
  title?: string;
  activeTab: ProjectView;
  onSelect(tab: ProjectView): void;
  /** Opens the storyboard review (#570); the entry is absent when the caller does not offer it. */
  onOpenStoryboard?(): void;
}

export const PROJECT_VIEWS: ProjectView[] = ["media", "documents", "units", "activity"];

export function ProjectControls({ title = "Project", activeTab, onSelect, onOpenStoryboard }: ProjectControlsProps) {
  return <PageHeader title={title} icon={FolderOpen} meta={activeTab === "media" ? "Media" : activeTab === "documents" ? "Documents" : activeTab === "activity" ? "Activity" : "Content"}>
    {activeTab !== "media" && <button id="project-tab-media" data-media-focus-fallback="true" className={PAGE_HEADER_BUTTON} type="button" aria-label="Back to media" onClick={() => onSelect("media")}><ArrowLeft size={14} aria-hidden="true" />Media</button>}
    <PageHeaderMore label="Project details">
      <button className={`${PAGE_HEADER_BUTTON} justify-start`} type="button" onClick={() => onSelect("documents")}><FileText size={14} aria-hidden="true" />Documents</button>
      <button className={`${PAGE_HEADER_BUTTON} justify-start`} type="button" onClick={() => onSelect("activity")}><Activity size={14} aria-hidden="true" />Activity</button>
      {onOpenStoryboard && <button className={`${PAGE_HEADER_BUTTON} justify-start`} type="button" onClick={onOpenStoryboard}><Clapperboard size={14} aria-hidden="true" />Storyboard</button>}
    </PageHeaderMore>
  </PageHeader>;
}
