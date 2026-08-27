import {
  ArrowLeft,
  ArrowRight,
  House,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { motion } from "motion/react";

/* A row of window chrome: full-height, hairline gaps, and never part of the drag region.
   `sidebar-chrome-leading`, `history-controls`, `collapsed-window-controls` and
   `main-header-actions` stay as the hooks the geometry harness reads. */
const CHROME_ROW = "flex h-full items-center gap-0.5 [-webkit-app-region:no-drag]";
/* The reserved native traffic-light inset: a spacer, never a control. */
const TRAFFIC_SPACE = "h-px flex-none";
/* The window chrome band: one titlebar row, never squeezed, and the whole of it is the drag
   region except the controls standing on it. */
const CHROME_BAND = "h-titlebar flex-none select-none [-webkit-app-region:drag] [&>*]:translate-y-0.5";
/* A square glyph control on the desk. Geometry only, so a caller that needs another skin cannot
   half-override this one; the desk pair follows. */
const GLYPH = "inline-grid size-7 flex-none place-items-center rounded-control p-0";
const GLYPH_ON_DESK = "text-muted hover:bg-board hover:text-ink disabled:text-muted-decorative";

interface SidebarChromeProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack(): void;
  onForward(): void;
  onToggleSidebar(): void;
}

export function SidebarChrome({
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onToggleSidebar,
}: SidebarChromeProps) {
  return (
    <div className={`sidebar-chrome ${CHROME_BAND} flex items-center justify-between pr-2.5 pl-3.5`}>
      <div className={`sidebar-chrome-leading ${CHROME_ROW}`}>
        <div className={`sidebar-traffic-space w-traffic-sidebar ${TRAFFIC_SPACE}`} aria-hidden="true" />
        <button className={`icon-button ${GLYPH} ${GLYPH_ON_DESK}`} type="button" title="Hide sidebar" aria-label="Toggle sidebar" aria-pressed="true" onClick={onToggleSidebar}>
          <PanelLeft size={16} strokeWidth={1.5} />
        </button>
      </div>
      <nav className={`history-controls ${CHROME_ROW}`} aria-label="Navigation history">
        <button className={`icon-button ${GLYPH} ${GLYPH_ON_DESK}`} type="button" title="Back" aria-label="Back" disabled={!canGoBack} onClick={onBack}>
          <ArrowLeft size={16} strokeWidth={1.5} />
        </button>
        <button className={`icon-button ${GLYPH} ${GLYPH_ON_DESK}`} type="button" title="Forward" aria-label="Forward" disabled={!canGoForward} onClick={onForward}>
          <ArrowRight size={16} strokeWidth={1.5} />
        </button>
      </nav>
    </div>
  );
}

interface MainHeaderProps {
  sidebarVisible: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  rightPanelVisible: boolean;
  onBack(): void;
  onForward(): void;
  onHome(): void;
  onToggleSidebar(): void;
  onToggleRightPanel(): void;
}

export function MainHeader({
  sidebarVisible,
  canGoBack,
  canGoForward,
  rightPanelVisible,
  onBack,
  onForward,
  onHome,
  onToggleSidebar,
  onToggleRightPanel,
}: MainHeaderProps) {
  return (
    <motion.header className={`main-header ${CHROME_BAND} flex min-w-0 items-center gap-2.5 bg-desk pr-3 pl-4.5 text-ink`} layout>
      {!sidebarVisible && (
        <div className={`collapsed-window-controls ${CHROME_ROW} -ml-4.5 self-stretch`}>
          <div className={`main-traffic-space w-traffic-main ${TRAFFIC_SPACE}`} aria-hidden="true" />
          <button className={`icon-button ${GLYPH} ${GLYPH_ON_DESK}`} type="button" title="Show sidebar" aria-label="Toggle sidebar" aria-pressed="false" onClick={onToggleSidebar}>
            <PanelLeft size={16} strokeWidth={1.5} />
          </button>
          <button className={`icon-button ${GLYPH} ${GLYPH_ON_DESK}`} type="button" title="Back" aria-label="Back" disabled={!canGoBack} onClick={onBack}>
            <ArrowLeft size={16} strokeWidth={1.5} />
          </button>
          <button className={`icon-button ${GLYPH} ${GLYPH_ON_DESK}`} type="button" title="Forward" aria-label="Forward" disabled={!canGoForward} onClick={onForward}>
            <ArrowRight size={16} strokeWidth={1.5} />
          </button>
        </div>
      )}
      <button className={`icon-button main-header-home ${GLYPH} ${GLYPH_ON_DESK} relative z-window-controls [-webkit-app-region:no-drag]`} type="button" title="Projects" aria-label="Projects" onClick={onHome}>
        <House size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <div className={`main-header-actions ${CHROME_ROW} relative z-window-controls ml-auto`}>
        <button className={`icon-button ${GLYPH} ${rightPanelVisible ? "is-active bg-board text-ink" : GLYPH_ON_DESK}`} type="button" title="Toggle right panel (⌘R)" aria-label="Toggle right panel" aria-pressed={rightPanelVisible} onClick={onToggleRightPanel}>
          <PanelRight size={16} strokeWidth={1.5} />
        </button>
      </div>
    </motion.header>
  );
}
