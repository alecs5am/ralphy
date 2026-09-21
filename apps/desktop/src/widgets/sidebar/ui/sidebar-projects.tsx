import { useEffect, useId, useState } from "react";
import type { ProjectSummary } from "@/shared/api/ipc";
import { CreateLibraryEntry } from "@/shared/ui/CreateLibraryEntry";
import { ChevronRight, FolderOpen, Plus } from "@/shared/ui/icons";
import { CHAT_UNSELECTED, SECTION_LABEL, SELECTED, SIDEBAR_ROW, type SidebarChat } from "./sidebar-chrome";
import { SidebarChats, type SidebarChatsProps } from "./sidebar-sections";

const CONTROL = "grid size-6 shrink-0 place-items-center rounded-field text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-ink";
type ProjectActions = {
  onOpenProject?(project: ProjectSummary): void;
  onNewProjectChat?(project: ProjectSummary): void;
};

function ProjectBranch({ project, active, onOpenProject, onNewProjectChat, ...chatProps }: ProjectActions & SidebarChatsProps & { project: ProjectSummary; active: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const activeChatHere = chatProps.chats.some((chat) => chat.id === chatProps.activeChatId);
  useEffect(() => { if (activeChatHere) setExpanded(true); }, [activeChatHere, chatProps.activeChatId]);
  const open = expanded;
  const childActive = activeChatHere && chatProps.activeChatVisible !== false;
  const context = active || childActive;
  return <div className="sidebar-project">
    <div className={`group relative flex h-7.5 min-w-0 items-center rounded-row ${active && !childActive ? SELECTED : context ? "bg-transparent text-ink hover:bg-row-hover" : CHAT_UNSELECTED}`}>
      <button type="button" className={`${CONTROL} absolute left-2`} aria-label={`${open ? "Hide" : "Show"} chats in ${project.name}`} title={`${open ? "Hide" : "Show"} chats`} aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => setExpanded(!open)}>
        <FolderOpen size={16} strokeWidth={1.8} className="group-hover:hidden group-focus-within:hidden" aria-hidden="true" />
        <ChevronRight size={12} className={`hidden group-hover:block group-focus-within:block ${open ? "rotate-90" : ""}`} aria-hidden="true" />
      </button>
      <button type="button" className={`${SIDEBAR_ROW} pr-8`} aria-label={`Open project ${project.name}`} aria-current={active ? "page" : undefined} onClick={() => onOpenProject?.(project)}>
        <span aria-hidden="true" /><span className="min-w-0 truncate">{project.name}</span>
      </button>
      {onNewProjectChat && <button type="button" className={`${CONTROL} absolute right-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100`} aria-label={`New chat in ${project.name}`} title={`New chat in ${project.name}`} onClick={() => { setExpanded(true); onNewProjectChat(project); }}><Plus size={13} aria-hidden="true" /></button>}
    </div>
    {open && <div id={listId} className="mt-1 mb-1"><SidebarChats {...chatProps} nested label={`${project.name} chats`} /></div>}
  </div>;
}

export function SidebarProjectTree({ projects, workspaceId, activeProjectId, onOpenProject, onOpenProjects, onNewProjectChat, ...chatProps }: ProjectActions & SidebarChatsProps & {
  projects: readonly ProjectSummary[];
  workspaceId: string;
  activeProjectId: string | null;
  onOpenProjects(): void;
}) {
  const belongsTo = (chat: SidebarChat, project: ProjectSummary) => chat.project?.workspaceId === project.workspaceId && chat.project.projectId === project.projectId;
  const branches = projects.map((project) => ({ project, chats: chatProps.chats.filter((chat) => belongsTo(chat, project)) }));
  // Legacy chats have no known project. Missing projects must not make their history disappear.
  const workspaceChats = chatProps.chats.filter((chat) => !projects.some((project) => belongsTo(chat, project)));
  return <>
    <section className="sidebar-projects mt-4 mb-3" aria-label="Projects and chats">
      <div className="mb-1 flex min-w-0 flex-wrap items-center px-3">
        <button type="button" className={`${SECTION_LABEL} min-w-0 flex-1 text-left hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink`} onClick={onOpenProjects} aria-label="Projects">Projects</button>
        <CreateLibraryEntry workspaceId={workspaceId} compact onCreated={onOpenProjects} />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-3">
        {branches.map(({ project, chats }) => <ProjectBranch key={project.id} {...chatProps} project={project} chats={chats} active={project.id === activeProjectId} onOpenProject={onOpenProject} onNewProjectChat={onNewProjectChat} />)}
      </div>
      {branches.length === 0 && <p className="m-0 px-6 py-2 type-xs text-muted">No projects yet</p>}
    </section>
    <SidebarChats {...chatProps} chats={workspaceChats} />
  </>;
}
