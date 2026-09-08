import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, type AppIcon } from "./icons";
import { Window } from "./Window";

export const PageHeaderHost = createContext<HTMLElement | null>(null);
export const usePageHeaderHost = () => useContext(PageHeaderHost);
export const PAGE_HEADER_BUTTON = "page-header-action inline-flex h-8 flex-none items-center justify-center gap-2 rounded-full bg-card px-3 type-xs text-ink hover:bg-row-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink disabled:opacity-40";
export const PAGE_HEADER_PRIMARY = `${PAGE_HEADER_BUTTON} page-header-primary`;

/** The page still owns its controls and state; only their DOM destination changes in desk mode. */
export function PageHeader({ title, icon: Icon, meta, description, children }: {
  title: string; icon: AppIcon; meta?: ReactNode; description?: string; children?: ReactNode;
}) {
  const host = usePageHeaderHost();
  const header = <div className="page-header flex min-w-0 flex-1 items-center gap-2 text-ink" role="group" aria-label={`${title} controls`}>
    <div className="page-header-identity flex min-w-0 flex-1 items-center gap-2 [-webkit-app-region:drag]" title={typeof meta === "string" ? `${title} · ${meta}` : title}>
      <Icon size={15} className="shrink-0 text-muted" aria-hidden="true" />
      <h1 className="m-0 truncate type-sm font-semibold">{title}</h1>
      {meta && <span className="page-header-meta min-w-0 truncate type-xs text-muted">{meta}</span>}
    </div>
    {description && <span className="sr-only">{description}</span>}
    {children && <div className="page-header-actions flex min-w-0 items-center gap-1">{children}</div>}
  </div>;
  return host ? createPortal(header, host) : <div className="page-header-inline shrink-0 p-1">{header}</div>;
}

export function PageHeaderMore({ label = "More page actions", children }: { label?: string; children: ReactNode }) {
  const root = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (root.current?.open && !root.current.contains(event.target as Node)) root.current.open = false; };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  return <details ref={root} className="page-header-more relative shrink-0" onClick={(event) => { if (event.target instanceof Element && event.target.closest("button")) event.currentTarget.open = false; }} onBlur={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) event.currentTarget.open = false; }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
    <summary className={`${PAGE_HEADER_BUTTON} cursor-pointer list-none`} aria-label={label} title={label}><MoreHorizontal size={16} /></summary>
    <Window className="page-header-menu absolute right-0 top-full z-popover mt-2 w-72"><div className="flex flex-col gap-2 rounded-frame bg-card p-3 type-xs text-ink">{children}</div></Window>
  </details>;
}
