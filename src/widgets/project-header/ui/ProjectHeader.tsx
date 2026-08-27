import { FolderKanban } from "lucide-react";
import type { ProjectSummary } from "@/shared/api/ipc";

/* A status fact is a pill on the theme's own widget: surface and ink stated together. */
const FACT = "inline-flex h-control-sm items-center gap-1.75 rounded-control bg-surface-sunken px-2.5 whitespace-nowrap text-muted";

export function ProjectHeader({ project }: { project: ProjectSummary }) {
  return (
    <header className="project-header flex min-h-0 flex-none flex-col items-stretch gap-3.5 px-6 pt-5 pb-4">
      <div className="project-header-top flex min-w-0 items-start justify-between gap-5">
        <div className="project-heading min-w-0">
          <h2 className="mb-1 flex items-center gap-2 overflow-hidden type-xl text-ellipsis whitespace-nowrap text-ink">
            <FolderKanban className="project-header-icon flex-none text-muted" size={20} aria-hidden="true" />{project.name}
          </h2>
          <p className="max-w-140 overflow-hidden type-base text-ellipsis whitespace-nowrap text-muted">{project.brief || "Ralphy production project"}</p>
        </div>
      </div>
      <div className="project-facts flex flex-wrap items-center gap-2 type-sm text-muted" aria-label="Project status">
        {/* The phase and status dots carry no reading of their own -- `data-status` and the
            `phase-*` classes were never styled -- so they stay one decorative tone. */}
        <span className={FACT}><i className={`phase-indicator phase-${project.phase ?? "unknown"} size-1.25 flex-none rounded-control bg-muted`} />{project.phase ?? project.status}</span>
        <span className={FACT}>{[project.platform, project.aspectRatio].filter(Boolean).join(" · ") || "No format"}</span>
        <span className={FACT}>{project.finalState}</span>
      </div>
    </header>
  );
}
