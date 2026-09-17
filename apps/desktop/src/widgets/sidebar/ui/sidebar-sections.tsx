/**
 * The four lists the sidebar card holds: the place switch, the workspace pages, the chats and the
 * Marketplace routes.
 *
 * Each takes what it draws and reports a choice upward. None of them reads the search needle: the
 * card filters its lists before handing them over, so a list never has to know why it is short.
 */
import { Archive, Check, Compass, Pencil, RotateCcw, X } from "@/shared/ui/icons";
import { useEffect, useId, useState, type CSSProperties } from "react";

import type { WorkspaceSummary } from "@/shared/api/ipc";
import { WORKSPACE_PAGE_LABELS, type WorkspacePage } from "@/shared/model/workbench";
import type { AppMode, MarketplaceBrowseRoute, MarketplaceRoute } from "@/shared/model/routes";
import {
  CHAT_ROW,
  CHAT_UNSELECTED,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_LIBRARY,
  PAGE_ICONS,
  SECTION_LABEL,
  SELECTED,
  chatDetail,
  modeButton,
  pageCount,
  sidebarCount,
  sidebarRow,
  type SidebarChat,
} from "./sidebar-chrome";

/* The gooey indicator travels between the two segments, so the switch paints its selection once
   rather than giving each button a plate. The filter id is per-instance: two switches on one
   document would otherwise share -- and fight over -- one `<filter>`. */
export function SidebarModeSwitch({ mode, onSwitchMode }: { mode: AppMode; onSwitchMode(mode: AppMode): void }) {
  const gooId = `mode-goo-${useId().replace(/:/g, "")}`;
    return <nav
      className="sidebar-mode-switch relative mx-3 mt-2 mb-2.5 flex h-10.5 shrink-0 gap-0.5 overflow-hidden rounded-full bg-instrument p-1 isolate"
      style={{ "--mode-index": mode === "work" ? 0 : 1, "--mode-count": 2 } as CSSProperties}
      aria-label="Application mode"
    >
      <svg className="mode-goo-filter" aria-hidden="true">
        <defs>
          <filter id={gooId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
      <span className="mode-goo" style={{ filter: `url(#${gooId})` }} aria-hidden="true">
        <span className="mode-goo-blob mode-goo-blob-leading" />
        <span className="mode-goo-blob mode-goo-blob-trailing" />
      </span>
      <button
        id="app-mode-work"
        className={modeButton(mode === "work")}
        type="button"
        aria-current={mode === "work" ? "page" : undefined}
        onClick={() => onSwitchMode("work")}
      >
        <span>My Work</span>
      </button>
      <button
        id="app-mode-marketplace"
        className={modeButton(mode === "marketplace")}
        type="button"
        aria-current={mode === "marketplace" ? "page" : undefined}
        onClick={() => onSwitchMode("marketplace")}
      >
        <span>Marketplace</span>
      </button>
    </nav>;
}

export function WorkspacePagesNav({ pages, page, pageActive, workspace, onOpenPage }: {
  pages: readonly WorkspacePage[];
  page: WorkspacePage;
  pageActive: boolean;
  workspace: WorkspaceSummary;
  onOpenPage(page: WorkspacePage): void;
}) {
  return <>
      <div className={SECTION_LABEL}><span>MAIN MENU</span></div>
      <nav className="sidebar-nav flex shrink-0 flex-col gap-0.5 px-2.5" aria-label="Workspace pages">
        {pages.map((item) => {
          const Icon = PAGE_ICONS[item];
          const count = pageCount(item, workspace);
          const active = pageActive && page === item;
          return (
            <button
              className={sidebarRow(active)}
              type="button"
              key={item}
              aria-current={active ? "page" : undefined}
              onClick={() => onOpenPage(item)}
            >
              <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
              <span className="min-w-0 truncate">{WORKSPACE_PAGE_LABELS[item]}</span>
              <small className={sidebarCount(active)}>{count ?? ""}</small>
            </button>
          );
        })}
      </nav>
  </>;
}

export function SidebarChats({ chats, query = "", activeChatId, now, onSelectChat, onRenameChat, onArchiveChat }: {
  chats: readonly SidebarChat[];
  query?: string;
  activeChatId: string | null;
  now: number;
  onSelectChat?(chatId: string): void;
  onRenameChat?(chatId: string, title: string): void;
  onArchiveChat?(chatId: string, archived: boolean): void;
}) {
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const activeArchived = Boolean(chats.find((chat) => chat.id === activeChatId)?.archived);
  useEffect(() => { setArchived(activeArchived); setEditing(null); }, [activeChatId, activeArchived]);
  const needle = query.trim().toLocaleLowerCase();
  const visible = chats.filter((chat) => Boolean(chat.archived) === archived && (!needle || chat.title.toLocaleLowerCase().includes(needle) || chat.entries?.some((entry) => (entry.kind === "user" || entry.kind === "assistant") && entry.text?.toLocaleLowerCase().includes(needle))));
  const control = "grid size-6 shrink-0 place-items-center rounded-field text-muted hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-ink";
  return <section className="sidebar-chats">
    <div className="mx-3 mb-2 flex gap-1 rounded-control bg-field p-1" role="group" aria-label="Conversation list">
      {[false, true].map((value) => <button key={String(value)} type="button" className={`min-w-0 flex-1 rounded-control px-2 py-1.5 type-xs ${value === archived ? "bg-card text-ink" : "text-muted"}`} aria-pressed={value === archived} onClick={() => { setArchived(value); setEditing(null); }}>{value ? "Archived" : "Chats"} · {chats.filter((chat) => Boolean(chat.archived) === value).length}</button>)}
    </div>
    <div className={SECTION_LABEL}>
      <span>{archived ? "ARCHIVED" : needle ? "MATCHING CHATS" : "CHATS"}</span>
      <small className="font-display type-sm leading-none font-extrabold">{visible.length}</small>
    </div>
    <nav className="sidebar-nav flex shrink-0 flex-col gap-0.25 px-3" aria-label="Chats">
      {visible.map((item) => {
        const active = item.id === activeChatId;
        if (editing?.id === item.id) return <form key={item.id} className="flex min-w-0 items-center gap-1 rounded-row bg-field p-2" onSubmit={(event) => { event.preventDefault(); if (!editing.title.trim()) return; onRenameChat?.(item.id, editing.title); setEditing(null); }}>
          <input type="text" className="min-w-0 flex-1 bg-transparent type-sm text-ink" aria-label="Conversation title" value={editing.title} maxLength={80} autoFocus onChange={(event) => setEditing({ id: item.id, title: event.target.value })} onKeyDown={(event) => { if (event.key === "Escape") setEditing(null); }} />
          <button className={control} type="submit" aria-label="Save conversation title" disabled={!editing.title.trim()}><Check size={13} /></button>
          <button className={control} type="button" aria-label="Cancel rename" onClick={() => setEditing(null)}><X size={13} /></button>
        </form>;
        return <div key={item.id} className={`flex min-w-0 items-center rounded-row ${active ? SELECTED : CHAT_UNSELECTED}`}>
        <button
          className={`${CHAT_ROW} min-w-0 flex-1`}
          type="button"
          aria-current={active ? "true" : undefined}
          onClick={() => onSelectChat?.(item.id)}
        >
          <i className={`sidebar-chat-dot size-1.75 rounded-full bg-current ${item.busy ? "is-busy opacity-100 animate-sidebar-chat-pulse motion-reduce:animate-none" : "opacity-45"}`} aria-hidden="true" />
          <span className="min-w-0 truncate type-ui">{item.title}</span>
          <small className="col-start-2 min-w-0 truncate font-code type-mono-xs tracking-mono uppercase opacity-70">{chatDetail(item, now)}</small>
        </button>
        <div className="flex shrink-0 flex-col pr-1">
          {onRenameChat && <button className={control} type="button" title="Rename chat" aria-label={`Rename ${item.title}`} onClick={() => setEditing({ id: item.id, title: item.title })}><Pencil size={12} /></button>}
          {onArchiveChat && <button className={control} type="button" title={item.archived ? "Restore chat" : "Archive chat · keeps history and running work"} aria-label={`${item.archived ? "Restore" : "Archive"} ${item.title}`} onClick={() => { onArchiveChat(item.id, !item.archived); if (active) setArchived(!item.archived); }}>{item.archived ? <RotateCcw size={12} /> : <Archive size={12} />}</button>}
        </div></div>;
      })}
    </nav>
    {visible.length === 0 && <p className="m-0 px-4 py-2 type-sm text-muted">{needle ? "No conversations match this search." : archived ? "No archived conversations." : "No conversations in this workspace yet."}</p>}
    {archived && <p className="m-0 px-4 py-2 type-xs text-muted">Archived chats keep their history and running work. Sending a message restores the chat.</p>}
  </section>;
}

export function MarketplaceNav({ route, onOpenRoute }: { route: MarketplaceRoute; onOpenRoute(route: MarketplaceBrowseRoute): void }) {
  return <>
      <div className={SECTION_LABEL}><span>MARKETPLACE</span></div>
      <nav className="sidebar-nav flex shrink-0 flex-col gap-0.5 px-2.5" aria-label="Marketplace categories">
        <button
          className={sidebarRow(route.kind === "discover")}
          type="button"
          aria-current={route.kind === "discover" ? "page" : undefined}
          onClick={() => onOpenRoute({ kind: "discover" })}
        >
          <Compass size={16} strokeWidth={1.8} aria-hidden="true" />
          <span className="min-w-0 truncate">Discover</span>
          <small />
        </button>
        {MARKETPLACE_CATEGORIES.map(({ id, label, icon: Icon }) => {
          const active = route.kind === "category" && route.category === id;
          return <button
            className={sidebarRow(active)}
            type="button"
            key={id}
            aria-current={active ? "page" : undefined}
            onClick={() => onOpenRoute({ kind: "category", category: id })}
          >
            <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
            <span className="min-w-0 truncate">{label}</span>
            <small />
          </button>;
        })}
      </nav>
      <div className={`${SECTION_LABEL} mt-3`}><span>MY LIBRARY</span></div>
      <nav className="sidebar-nav flex shrink-0 flex-col gap-0.5 px-2.5" aria-label="My Library">
        {MARKETPLACE_LIBRARY.map(({ id, label, icon: Icon }) => {
          const active = route.kind === "library" && route.section === id;
          return <button
            className={sidebarRow(active)}
            type="button"
            key={id}
            aria-current={active ? "page" : undefined}
            onClick={() => onOpenRoute({ kind: "library", section: id })}
          >
            <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
            <span className="min-w-0 truncate">{label}</span>
            <small />
          </button>;
        })}
      </nav>
  </>;
}
