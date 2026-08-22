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
   `main-header-actions` stay as the hooks the geometry harness and 01-unowned.css read. */
const CHROME_ROW = "flex h-full items-center gap-0.5 [-webkit-app-region:no-drag]";
/* The reserved native traffic-light inset: a spacer, never a control. */
const TRAFFIC_SPACE = "h-px flex-none";

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
    <div className="sidebar-chrome">
      <div className={`sidebar-chrome-leading ${CHROME_ROW}`}>
        <div className={`sidebar-traffic-space w-traffic-sidebar ${TRAFFIC_SPACE}`} aria-hidden="true" />
        <button className="icon-button" type="button" title="Hide sidebar" aria-label="Toggle sidebar" aria-pressed="true" onClick={onToggleSidebar}>
          <PanelLeft size={16} strokeWidth={1.5} />
        </button>
      </div>
      <nav className={`history-controls ${CHROME_ROW}`} aria-label="Navigation history">
        <button className="icon-button" type="button" title="Back" aria-label="Back" disabled={!canGoBack} onClick={onBack}>
          <ArrowLeft size={16} strokeWidth={1.5} />
        </button>
        <button className="icon-button" type="button" title="Forward" aria-label="Forward" disabled={!canGoForward} onClick={onForward}>
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
    <motion.header className="main-header flex min-w-0 items-center gap-2.5 bg-desk pr-3 pl-4.5 text-ink" layout>
      {!sidebarVisible && (
        <div className={`collapsed-window-controls ${CHROME_ROW} -ml-4.5 self-stretch`}>
          <div className={`main-traffic-space w-traffic-main ${TRAFFIC_SPACE}`} aria-hidden="true" />
          <button className="icon-button" type="button" title="Show sidebar" aria-label="Toggle sidebar" aria-pressed="false" onClick={onToggleSidebar}>
            <PanelLeft size={16} strokeWidth={1.5} />
          </button>
          <button className="icon-button" type="button" title="Back" aria-label="Back" disabled={!canGoBack} onClick={onBack}>
            <ArrowLeft size={16} strokeWidth={1.5} />
          </button>
          <button className="icon-button" type="button" title="Forward" aria-label="Forward" disabled={!canGoForward} onClick={onForward}>
            <ArrowRight size={16} strokeWidth={1.5} />
          </button>
        </div>
      )}
      <button className="icon-button main-header-home relative z-window-controls [-webkit-app-region:no-drag]" type="button" title="Projects" aria-label="Projects" onClick={onHome}>
        <House size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <div className={`main-header-actions ${CHROME_ROW} relative z-window-controls ml-auto`}>
        <button className={`icon-button${rightPanelVisible ? " is-active" : ""}`} type="button" title="Toggle right panel (⌘R)" aria-label="Toggle right panel" aria-pressed={rightPanelVisible} onClick={onToggleRightPanel}>
          <PanelRight size={16} strokeWidth={1.5} />
        </button>
      </div>
    </motion.header>
  );
}
