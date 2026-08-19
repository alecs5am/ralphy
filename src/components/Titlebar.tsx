import {
  ArrowLeft,
  ArrowRight,
  House,
  PanelBottom,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { motion } from "motion/react";

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
      <div className="sidebar-chrome-leading">
        <div className="sidebar-traffic-space" aria-hidden="true" />
        <button className="icon-button" type="button" title="Hide sidebar" aria-label="Toggle sidebar" aria-pressed="true" onClick={onToggleSidebar}>
          <PanelLeft size={16} strokeWidth={1.5} />
        </button>
      </div>
      <nav className="history-controls" aria-label="Navigation history">
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
  bottomPanelVisible: boolean;
  onBack(): void;
  onForward(): void;
  onHome(): void;
  onToggleSidebar(): void;
  onToggleRightPanel(): void;
  onToggleBottomPanel(): void;
}

export function MainHeader({
  sidebarVisible,
  canGoBack,
  canGoForward,
  rightPanelVisible,
  bottomPanelVisible,
  onBack,
  onForward,
  onHome,
  onToggleSidebar,
  onToggleRightPanel,
  onToggleBottomPanel,
}: MainHeaderProps) {
  return (
    <motion.header className="main-header" layout>
      {!sidebarVisible && (
        <div className="collapsed-window-controls">
          <div className="main-traffic-space" aria-hidden="true" />
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
      <button className="icon-button main-header-home" type="button" title="Projects" aria-label="Projects" onClick={onHome}>
        <House size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <div className="main-header-actions">
        <button className={`icon-button${bottomPanelVisible ? " is-active" : ""}`} type="button" title="Toggle bottom panel (⌘J)" aria-label="Toggle bottom panel" aria-pressed={bottomPanelVisible} onClick={onToggleBottomPanel}>
          <PanelBottom size={16} strokeWidth={1.5} />
        </button>
        <button className={`icon-button${rightPanelVisible ? " is-active" : ""}`} type="button" title="Toggle right panel (⌘R)" aria-label="Toggle right panel" aria-pressed={rightPanelVisible} onClick={onToggleRightPanel}>
          <PanelRight size={16} strokeWidth={1.5} />
        </button>
      </div>
    </motion.header>
  );
}
