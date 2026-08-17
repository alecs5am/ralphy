import { FolderKanban } from "lucide-react";
import type { ProjectSummary } from "../lib/ipc";

export function ProjectHeader({ project }: { project: ProjectSummary }) {
  return (
    <header className="project-header">
      <div className="project-header-top">
        <div className="project-heading">
          <h2><FolderKanban className="project-header-icon" size={20} aria-hidden="true" />{project.name}</h2>
          <p>{project.brief || "Ralphy production project"}</p>
        </div>
      </div>
      <div className="project-facts" aria-label="Project status">
        <span><i className={`phase-indicator phase-${project.phase ?? "unknown"}`} />{project.phase ?? project.status}</span>
        <span>{[project.platform, project.aspectRatio].filter(Boolean).join(" · ") || "No format"}</span>
        <span>{project.finalState}</span>
      </div>
    </header>
  );
}
