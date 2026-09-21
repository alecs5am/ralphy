import { Archive, Check, ChevronRight, Pencil, RotateCcw, X } from "@/shared/ui/icons";
import { useEffect, useId, useState } from "react";

import type { WorkspaceSummary } from "@/shared/api/ipc";
import { WORKSPACE_PAGE_LABELS, type WorkspacePage } from "@/shared/model/workbench";
import {
  CHAT_ROW,
  CHAT_UNSELECTED,
  PAGE_ICONS,
  SECTION_LABEL,
  SIDEBAR_NAV,
  SELECTED,
  chatDetail,
  chatMatches,
  pageCount,
  sidebarCount,
  sidebarRow,
  type SidebarChat,
} from "./sidebar-chrome";

export function WorkspacePagesNav({ pages, page, pageActive, workspace, onOpenPage, label = "Workspace pages" }: {
  pages: readonly WorkspacePage[];
  page: WorkspacePage;
  pageActive: boolean;
  workspace: WorkspaceSummary;
  onOpenPage(page: WorkspacePage): void;
  label?: string;
}) {
  return <nav className={SIDEBAR_NAV} aria-label={label}>
        {pages.map((item) => {
          const Icon = PAGE_ICONS[item];
          const count = pageCount(item, workspace);
          const active = pageActive && page === item;
          return (
            <button
              className={sidebarRow(active)}
              type="button"
              key={item}
              aria-label={WORKSPACE_PAGE_LABELS[item]}
              aria-current={active ? "page" : undefined}
              onClick={() => onOpenPage(item)}
            >
              <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
              <span className="min-w-0 truncate">{WORKSPACE_PAGE_LABELS[item]}</span>
              <small className={sidebarCount(active)}>{count ?? ""}</small>
            </button>
          );
        })}
      </nav>;
}

export interface SidebarChatsProps {
  chats: readonly SidebarChat[];
  query?: string;
  activeChatId: string | null;
  activeChatVisible?: boolean;
  nested?: boolean;
  label?: string;
  now: number;
  onSelectChat?(chatId: string): void;
  onRenameChat?(chatId: string, title: string): void;
  onArchiveChat?(chatId: string, archived: boolean): void;
}

export function SidebarChats({ chats, query = "", activeChatId, activeChatVisible = true, nested = false, label = "Chats", now, onSelectChat, onRenameChat, onArchiveChat }: SidebarChatsProps) {
  const [archived, setArchived] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const listId = useId();
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const activeArchived = Boolean(chats.find((chat) => chat.id === activeChatId)?.archived);
  useEffect(() => { setArchived(activeArchived); setEditing(null); }, [activeChatId, activeArchived]);
  const containsActiveChat = chats.some((chat) => chat.id === activeChatId);
  useEffect(() => { if (containsActiveChat) setCollapsed(false); }, [activeChatId, containsActiveChat]);
  const needle = query.trim().toLocaleLowerCase();
  const visible = chats.filter((chat) => Boolean(chat.archived) === archived && chatMatches(chat, needle));
  const control = "grid size-6 shrink-0 place-items-center rounded-field text-muted hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-ink";
  const heading = <><span>{archived ? "Archived chats" : needle ? "Matching chats" : "Chats"}</span><small className="tabular-nums">{visible.length}</small></>;
  return <section className="sidebar-chats">
    {(!nested || chats.some((chat) => chat.archived)) && <div className={`mb-1 flex items-center ${nested ? "px-0" : "px-3"}`} role="group" aria-label={`${label} list`}>
      {nested ? <span className={`${SECTION_LABEL} min-w-0 flex-1`}>{heading}</span> : <button type="button" className={`${SECTION_LABEL} min-w-0 flex-1 rounded-row text-left hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink`} aria-label={collapsed ? "Expand chats" : "Collapse chats"} aria-expanded={!collapsed} aria-controls={collapsed ? undefined : listId} onClick={() => setCollapsed(!collapsed)}>
        {heading}<ChevronRight size={12} className={collapsed ? "" : "rotate-90"} aria-hidden="true" />
      </button>}
      <button type="button" className={control} aria-label={archived ? "Show chats" : "Show archived chats"} title={archived ? "Show chats" : "Show archived chats"} aria-pressed={archived} onClick={() => { setArchived(!archived); setEditing(null); setCollapsed(false); }}><Archive size={13} /></button>
    </div>}
    {(!collapsed || nested) && <div id={listId}>
    <nav className={`sidebar-nav flex shrink-0 flex-col gap-0.5 ${nested ? "px-0" : "px-3"}`} aria-label={label}>
      {visible.map((item) => {
        const active = activeChatVisible && item.id === activeChatId;
        if (editing?.id === item.id) return <form key={item.id} className="flex min-w-0 items-center gap-1 rounded-row bg-field p-2" onSubmit={(event) => { event.preventDefault(); if (!editing.title.trim()) return; onRenameChat?.(item.id, editing.title); setEditing(null); }}>
          <input type="text" className="min-w-0 flex-1 bg-transparent type-sm text-ink" aria-label="Conversation title" value={editing.title} maxLength={80} autoFocus onChange={(event) => setEditing({ id: item.id, title: event.target.value })} onKeyDown={(event) => { if (event.key === "Escape") setEditing(null); }} />
          <button className={control} type="submit" aria-label="Save conversation title" disabled={!editing.title.trim()}><Check size={13} /></button>
          <button className={control} type="button" aria-label="Cancel rename" onClick={() => setEditing(null)}><X size={13} /></button>
        </form>;
        return <div key={item.id} className={`group flex min-w-0 items-center rounded-row ${active ? SELECTED : CHAT_UNSELECTED}`}>
        <button
          className={`${CHAT_ROW} min-w-0 flex-1 ${nested ? "pl-12" : "pl-6"}`}
          type="button"
          aria-current={active ? "true" : undefined}
          title={`${item.title} · ${chatDetail(item, now)}`}
          onClick={() => onSelectChat?.(item.id)}
        >
          {item.busy && <i className={`sidebar-chat-dot is-busy absolute ${nested ? "left-9" : "left-3"} size-1.5 rounded-full bg-current animate-sidebar-chat-pulse motion-reduce:animate-none`} role="status" aria-label="Running" />}
          <span className="min-w-0 truncate type-ui">{item.title}</span>
        </button>
        <div className="flex shrink-0 pr-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
          {onRenameChat && <button className={control} type="button" title="Rename chat" aria-label={`Rename ${item.title}`} onClick={() => setEditing({ id: item.id, title: item.title })}><Pencil size={12} /></button>}
          {onArchiveChat && <button className={control} type="button" title={item.archived ? "Restore chat" : "Archive chat · keeps history and running work"} aria-label={`${item.archived ? "Restore" : "Archive"} ${item.title}`} onClick={() => { onArchiveChat(item.id, !item.archived); if (active) setArchived(!item.archived); }}>{item.archived ? <RotateCcw size={12} /> : <Archive size={12} />}</button>}
        </div></div>;
      })}
    </nav>
    {visible.length === 0 && <p className={`m-0 py-2 type-xs text-muted ${nested ? "px-3" : "px-6"}`}>{needle ? "No conversations match this search." : archived ? "No archived conversations." : nested ? "No chats yet" : "No conversations in this workspace yet."}</p>}
    {archived && <p className="m-0 px-3 py-2 type-xs text-muted">Archived chats keep their history and running work. Sending a message restores the chat.</p>}
    </div>}
  </section>;
}
