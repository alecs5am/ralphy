import {
  Brain,
  Calendar,
  ChevronRight,
  Folder,
  House,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Library,
  Plus,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  HOME_TAB_ID,
  VIEW_TYPES,
  VIEW_TYPES_UNAVAILABLE,
  type OpenViewRequest,
  type ViewTab,
  type ViewTabSet,
  type ViewTabType,
} from "../state/view-panel";
import { InstrumentOverlay } from "./overlay-registry";

/**
 * Handoff 14's view panel: the chat lens' right-hand panel, and the tab strip that navigates it.
 *
 * The panel is chrome around the work route -- the page card holds whatever the active tab points
 * at, which for every tab but home is a screen the app already has. What this component owns is
 * the frame: the permanent home tab, the strip, the overflow, the type menu and the page card.
 *
 * Geometry is the handoff's, to the pixel: panel pad 2 R18, strip 34 with pad 0 6 and gap 3, home
 * tab 30x28 R9, tabs 28 R9 between 96 and 150, overflow 24 R8, the `+` a 24 circle, page card R16.
 */

const TAB_ICONS: Record<ViewTabType, LucideIcon> = {
  home: House,
  overview: LayoutDashboard,
  projects: Folder,
  units: Layers,
  calendar: Calendar,
  shared: Library,
  memory: Brain,
  /* A project tab is the media grid the handoff names: the grid is what a project opens on. */
  project: LayoutGrid,
};

/* The strip's fixed costs, so how many tabs fit is arithmetic on the panel's own width rather
   than a measurement pass. Every number here is the handoff's. */
const HOME_WIDTH = 30;
const PLUS_WIDTH = 24;
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
const MENU_LABEL = "m-0 px-2.25 pt-2 pb-0.75 font-code type-mono-xs tracking-mono text-muted";
const CAP = "grid h-4.5 min-w-4.5 place-items-center rounded-key bg-panel px-1 font-code type-mono-sm font-bold text-muted";

export interface ViewPanelProps {
  set: ViewTabSet;
  /** The panel's own width, so the strip can decide what overflows without measuring. */
  width: number;
  /** Command id -> the chord's printed glyphs. A cap this component prints is a bound chord. */
  chords: Record<string, readonly string[]>;
  onSelect(id: string): void;
  onClose(id: string): void;
  onOpen(request: OpenViewRequest): void;
  children: ReactNode;
}

/**
 * How many view tabs the strip can show. Tabs never shrink below 96; the rest collapse into `+N`,
 * which costs its own width, so the fit is computed twice -- once without the button and once
 * with it, exactly as adding it would push a further tab out.
 */
function visibleCount(width: number, count: number): number {
  const room = (fixed: number) => width - PANEL_PAD - STRIP_PAD - HOME_WIDTH - PLUS_WIDTH - fixed - STRIP_GAP * 2;
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
  const Icon = TAB_ICONS[tab.type];
  return <span className={`${TAB_BASE} min-w-24 max-w-37.5 flex-1 ${active ? `${TAB_ACTIVE} pr-1.25 pl-2.5` : `${TAB_IDLE} pr-2.75 pl-2.5`}`}>
    <button className="flex min-w-0 flex-1 items-center gap-1.75 bg-transparent text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" type="button" aria-current={active || undefined} onClick={onSelect}>
      <Icon className="flex-none" size={13} strokeWidth={1.8} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{tab.label}</span>
    </button>
    {/* Close is on the active tab and on hover, per the handoff. `group-hover` is the hover half;
        an idle tab keeps the slot empty rather than reserving width for a control that is not
        there, which is what lets an idle tab carry its 11px of right padding instead. */}
    <button
      className={`${CIRCLE} size-4.5 flex-none text-muted-decorative hover:text-ink ${active ? "" : "hidden group-hover:grid"}`}
      type="button"
      aria-label={`Close ${tab.label}`}
      onClick={onClose}
    >
      <X size={11} strokeWidth={2} aria-hidden="true" />
    </button>
  </span>;
}

export function ViewPanel({ set, width, chords, onSelect, onClose, onOpen, children }: ViewPanelProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const plus = useRef<HTMLButtonElement>(null);
  const overflowButton = useRef<HTMLButtonElement>(null);

  const views = set.tabs.filter(({ id }) => id !== HOME_TAB_ID);
  const shown = visibleCount(width, views.length);
  const hidden = views.slice(shown);
  /* The active tab is always on the strip. When it has fallen into the overflow it takes the last
     visible slot, which keeps every other tab in its original order -- the order `+N` lists. */
  const strip = views.slice(0, shown);
  const activeHidden = hidden.some(({ id }) => id === set.activeTabId);
  if (activeHidden && strip.length) strip[strip.length - 1] = views.find(({ id }) => id === set.activeTabId)!;

  const homeActive = set.activeTabId === HOME_TAB_ID;
  const anchor = (node: HTMLElement | null) => {
    const box = node?.getBoundingClientRect();
    return box ? { top: box.bottom + 4, right: Math.max(8, window.innerWidth - box.right) } : { top: 48, right: 8 };
  };

  return <div className="view-panel flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-panel bg-panel p-0.5">
    <div className={STRIP_ROW} role="tablist" aria-label="Workspace views">
      <button
        /* Home is first, permanent, icon-only, and the panel's point of return. It carries no
           close control because it has nothing to close back to. */
        className={`view-panel-home ${CIRCLE} h-7 w-7.5 flex-none rounded-tab ${homeActive ? "bg-card text-ink" : "bg-transparent text-muted hover:bg-chip hover:text-ink"}`}
        type="button"
        aria-current={homeActive || undefined}
        aria-label="Workspace home"
        title={`Workspace home${chords["view.home"] ? ` · ${chords["view.home"]!.join("")}` : ""}`}
        onClick={() => onSelect(HOME_TAB_ID)}
      >
        <House size={14} strokeWidth={1.8} aria-hidden="true" />
      </button>
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
      <button
        className={`view-panel-new ${CIRCLE} size-6 flex-none ${menuOpen ? "bg-chip text-ink" : "bg-transparent text-muted hover:bg-chip hover:text-ink"}`}
        type="button"
        ref={plus}
        aria-label="New view"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <Plus size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
    <div className="view-panel-page relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-inner bg-card">
      {children}
      {/* The design's scrim covers the page, not the window: the type menu is a non-modal overlay,
          so the app's own backdrop rule -- which only fires for the modal kinds -- paints nothing
          here, and a window-wide dim would be heavier than the menu is. The wash is the desk
          rather than the design's 7% black: black on black is invisible in the dark theme, and
          "the page steps back toward the desk" is the same depth language as everything else. */}
      {menuOpen && <span className="absolute inset-0 z-scrim bg-desk/55" aria-hidden="true" />}
    </div>

    <InstrumentOverlay
      id="view-panel-types"
      open={menuOpen}
      label="New view"
      description="Open a workspace view in the panel."
      opener={plus.current}
      surfaceClassName="view-panel-menu fixed z-popover flex w-view-menu flex-col rounded-inner bg-card p-1.5 text-ink focus-visible:outline-none"
      onOpenChange={setMenuOpen}
    >
      <Anchored to={plus.current} anchor={anchor} onDismiss={() => setMenuOpen(false)}>
        <h2 className={MENU_LABEL}>WORKSPACE VIEWS</h2>
        {VIEW_TYPES.filter(({ singleton }) => singleton).map((descriptor) => {
          const Icon = TAB_ICONS[descriptor.type];
          const cap = descriptor.command ? chords[descriptor.command] : undefined;
          return <button
            className={MENU_ROW}
            type="button"
            key={descriptor.type}
            onClick={() => { setMenuOpen(false); onOpen({ type: descriptor.type, label: descriptor.label }); }}
          >
            <Icon size={15} strokeWidth={1.8} className="text-muted" aria-hidden="true" />
            <span className="min-w-0 truncate">{descriptor.label}</span>
            {cap ? <kbd className={CAP}>{cap.join("")}</kbd> : <span aria-hidden="true" />}
          </button>;
        })}
        {/* Named rather than drawn. A menu row that cannot open anything is worse than a line
            saying which types are still waiting on a runtime. */}
        <p className="m-0 px-2.25 pt-2 pb-1 font-code type-mono-xs tracking-mono leading-note text-muted">
          {`${VIEW_TYPES_UNAVAILABLE.join(" · ")} need a runtime the Core contract does not serve yet.`}
        </p>
      </Anchored>
    </InstrumentOverlay>

    <InstrumentOverlay
      id="view-panel-overflow"
      open={overflowOpen}
      label="More views"
      description="Views that do not fit the strip, in their original order."
      opener={overflowButton.current}
      surfaceClassName="view-panel-overflow-list fixed z-popover flex w-view-menu flex-col rounded-inner bg-card p-1.5 text-ink focus-visible:outline-none"
      onOpenChange={setOverflowOpen}
    >
      <Anchored to={overflowButton.current} anchor={anchor} onDismiss={() => setOverflowOpen(false)}>
        {hidden.map((tab) => {
          const Icon = TAB_ICONS[tab.type];
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
