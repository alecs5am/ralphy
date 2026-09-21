import { ChevronRight, Globe, House, Images, Maximize2, Minimize2, X } from "@/shared/ui/icons";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  taskViews,
  type OpenViewRequest,
  type ViewTab,
  type ViewTabSet,
} from "../model/view-panel";
import { InstrumentOverlay } from "@/shared/instrument/overlay-registry";

/** A task strip for opened documents and the browser; routes are selected in the sidebar. */
const EXPAND_WIDTH = 27;
const OVERFLOW_WIDTH = 26;
const STRIP_GAP = 3;
const STRIP_PAD = 12;
const PANEL_PAD = 4;
const TAB_MIN = 96;

const STRIP_ROW = "view-panel-strip flex h-8.5 flex-none items-center gap-0.75 px-1.5";
const TAB_BASE = "view-panel-tab group flex h-7 items-center gap-1.75 rounded-tab text-left type-label focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";
/* The active tab is white and sits directly above a white page card: that adjacency is the
   affordance the handoff asks for, which is why the tab draws no border and no shadow. */
const TAB_ACTIVE = "bg-card text-ink";
const TAB_IDLE = "bg-transparent text-muted hover:bg-chip hover:text-ink";
const CIRCLE = "grid place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const MENU_ROW = "grid h-8.5 w-full grid-cols-(--view-menu-columns) items-center gap-2.5 rounded-field px-2.25 text-left type-base text-ink hover:bg-panel focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";

export interface ViewPanelProps {
  set: ViewTabSet;
  /** The panel's own width, so the strip can decide what overflows without measuring. */
  width: number;
  /** Command id -> the chord's printed glyphs. A cap this component prints is a bound chord. */
  chords: Record<string, readonly string[]>;
  onSelect(id: string): void;
  onClose(id: string): void;
  onOpen(request: OpenViewRequest): void;
  /* The browser tab's page, rendered over the card rather than in place of it: a guest that
     unmounted on every tab switch would lose the page the operator opened it for. */
  browser?: ReactNode;
  chromeVisible?: boolean;
  expanded?: boolean;
  compact?: boolean;
  onToggleExpanded?(): void;
  children: ReactNode;
}

/**
 * How many view tabs the strip can show. Tabs never shrink below 96; the rest collapse into `+N`,
 * which costs its own width, so the fit is computed twice -- once without the button and once
 * with it, exactly as adding it would push a further tab out.
 */
function visibleCount(width: number, count: number, controlsWidth: number): number {
  const room = (fixed: number) => width - PANEL_PAD - STRIP_PAD - controlsWidth - fixed - STRIP_GAP * 2;
  const fit = (fixed: number) => Math.max(1, Math.floor((room(fixed) + STRIP_GAP) / (TAB_MIN + STRIP_GAP)));
  const bare = fit(0);
  return count <= bare ? count : fit(OVERFLOW_WIDTH + STRIP_GAP);
}

function TabButton({ tab, active, onSelect, onClose }: {
  tab: ViewTab;
  active: boolean;
  onSelect(): void;
  onClose(): void;
}) {
  const Icon = tab.type === "browser" ? Globe : Images;
  return <span
    className={`${TAB_BASE} min-w-24 max-w-37.5 flex-1 ${active ? `${TAB_ACTIVE} pr-1.25 pl-2.5` : `${TAB_IDLE} pr-2.75 pl-2.5`}`}
    /* Middle-click closes, the same habit a browser tab has. It is on the wrapper rather than the
       label button so the whole tab answers it, including the close control itself. */
    onAuxClick={(event) => { if (event.button === 1) { event.preventDefault(); onClose(); } }}
  >
    <button className="flex min-w-0 flex-1 items-center gap-1.75 bg-transparent text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" type="button" aria-current={active || undefined} onClick={onSelect}>
      <Icon className="flex-none" size={13} strokeWidth={1.8} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{tab.label}</span>
    </button>
    {/* Keep close discoverable by pointer and keyboard on every open document. */}
    <button
      className={`${CIRCLE} size-4.5 flex-none text-muted-decorative hover:text-ink ${active ? "" : "invisible group-hover:visible group-focus-within:visible"}`}
      type="button"
      aria-label={`Close ${tab.label}`}
      onClick={onClose}
    >
      <X size={11} strokeWidth={2} aria-hidden="true" />
    </button>
  </span>;
}

export function ViewPanel({ set, width, onSelect, onClose, onOpen, browser, chromeVisible = true, children, expanded, compact, onToggleExpanded }: ViewPanelProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowButton = useRef<HTMLButtonElement>(null);

  const views = taskViews(set);
  const showContentHome = views.some((tab) => tab.type === "unit");
  const canExpand = onToggleExpanded && set.tabs.find(({ id }) => id === set.activeTabId)?.type === "browser";
  const shown = visibleCount(width, views.length, (Number(showContentHome) + Number(!!canExpand)) * EXPAND_WIDTH);
  /* The active tab is always on the strip. When it has fallen into the overflow it takes the last
     visible slot, which keeps every other tab in its original order -- the order `+N` lists. */
  const strip = views.slice(0, shown);
  const activeHidden = views.slice(shown).some(({ id }) => id === set.activeTabId);
  if (activeHidden && strip.length) strip[strip.length - 1] = views.find(({ id }) => id === set.activeTabId)!;
  const hidden = views.filter((tab) => !strip.some(({ id }) => id === tab.id));

  const anchor = (node: HTMLElement | null) => {
    const box = node?.getBoundingClientRect();
    return box ? { top: box.bottom + 4, right: Math.max(8, window.innerWidth - box.right) } : { top: 48, right: 8 };
  };

  return <div className="view-panel flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden">
    {chromeVisible && views.length > 0 && <div className={STRIP_ROW} role="tablist" aria-label="Open documents">
      {showContentHome && <button className="grid size-7 flex-none place-items-center rounded-control text-muted hover:bg-chip hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink" type="button" aria-label="All content" title="All content" onClick={() => onOpen({ type: "units", label: "Content" })}><House size={15} aria-hidden="true" /></button>}
      {strip.map((tab) => <TabButton
        key={tab.id}
        tab={tab}
        active={tab.id === set.activeTabId}
        onSelect={() => onSelect(tab.id)}
        onClose={() => onClose(tab.id)}
      />)}
      {hidden.length > 0 && <button
        className="view-panel-overflow inline-flex h-6 flex-none items-center rounded-chip bg-chip px-2.25 font-code type-meta tracking-label text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        type="button"
        ref={overflowButton}
        aria-label={`${hidden.length} more views`}
        onClick={() => setOverflowOpen(true)}
      >{`+${hidden.length}`}</button>}
      <span className="min-w-0 flex-1" />
      {canExpand && <button className={`${CIRCLE} size-6 flex-none text-muted hover:bg-chip hover:text-ink`} type="button" aria-label={compact ? "Back to chat" : expanded ? "Restore split view" : "Expand workspace panel"} title={compact ? "Back to chat" : expanded ? "Restore split view" : "Expand workspace panel"} aria-pressed={expanded} onClick={onToggleExpanded}>{expanded ? <Minimize2 size={13} aria-hidden="true" /> : <Maximize2 size={13} aria-hidden="true" />}</button>}
    </div>}
    <div className="view-panel-page relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {children}
      {/* `visibility` rather than `hidden`: a guest under `display: none` is detached, which is the
          reload this layer exists to avoid. */}
      {browser && <div
        className={`view-panel-browser absolute inset-0 flex flex-col ${chromeVisible && set.tabs.find(({ id }) => id === set.activeTabId)?.type === "browser" ? "" : "invisible"}`}
      >{browser}</div>}
    </div>

    <InstrumentOverlay
      id="view-panel-overflow"
      open={chromeVisible && hidden.length > 0 && overflowOpen}
      label="More views"
      description="Views that do not fit the strip, in their original order."
      opener={overflowButton.current}
      surfaceClassName="view-panel-overflow-list fixed z-popover flex w-view-menu flex-col rounded-inner bg-card p-1.5 text-ink focus-visible:outline-none"
      onOpenChange={setOverflowOpen}
    >
      <Anchored to={overflowButton.current} anchor={anchor} onDismiss={() => setOverflowOpen(false)}>
        {hidden.map((tab) => {
          const Icon = tab.type === "browser" ? Globe : Images;
          return <button
            className={MENU_ROW}
            type="button"
            key={tab.id}
            onClick={() => { setOverflowOpen(false); onSelect(tab.id); }}
          >
            <Icon size={15} strokeWidth={1.8} className="text-muted" aria-hidden="true" />
            <span className="min-w-0 truncate">{tab.label}</span>
            <ChevronRight size={11} strokeWidth={2} className="text-muted-decorative" aria-hidden="true" />
          </button>;
        })}
      </Anchored>
    </InstrumentOverlay>
  </div>;
}

/**
 * A non-modal overlay positions nothing and dismisses on Escape only, so both are stated here
 * once: the surface is placed under its opener, and a pointer landing outside it closes it. The
 * placement is written onto the parent surface rather than a wrapper, because the surface is the
 * element the registry portals and the only one that can carry `fixed`.
 */
function Anchored({ to, anchor, onDismiss, children }: {
  to: HTMLElement | null;
  anchor(node: HTMLElement | null): { top: number; right: number };
  onDismiss(): void;
  children: ReactNode;
}) {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const surface = marker.current?.parentElement;
    if (!surface) return;
    const { top, right } = anchor(to);
    surface.style.top = `${top}px`;
    surface.style.right = `${right}px`;
    const onPointerDown = (event: PointerEvent) => {
      if (!surface.contains(event.target as Node) && !to?.contains(event.target as Node)) onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  });
  return <>
    <span ref={marker} hidden />
    {children}
  </>;
}
