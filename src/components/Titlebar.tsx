import {
  ArrowLeft,
  ArrowRight,
  FolderOpen,
  PanelBottom,
  PanelLeft,
  PanelRight,
  X,
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

export interface MainHeaderTab {
  id: string;
  label: string;
  active: boolean;
  onOpen(): void;
  onClose?(): void;
}

interface MainHeaderProps {
  tabs: MainHeaderTab[];
  sidebarVisible: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  rightPanelVisible: boolean;
  bottomPanelVisible: boolean;
  showChooseLibrary: boolean;
  onBack(): void;
  onForward(): void;
  onToggleSidebar(): void;
  onChooseLibrary(): void;
  onToggleRightPanel(): void;
  onToggleBottomPanel(): void;
}

export function MainHeader({
  tabs,
  sidebarVisible,
  canGoBack,
  canGoForward,
  rightPanelVisible,
  bottomPanelVisible,
  showChooseLibrary,
  onBack,
  onForward,
  onToggleSidebar,
  onChooseLibrary,
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
      <nav className="header-tabs" aria-label="Open project tabs" role="tablist">
        {tabs.map((tab) => (
          <div className={`header-tab${tab.active ? " is-active" : ""}`} key={tab.id}>
            <button className="header-tab-label" type="button" role="tab" aria-selected={tab.active} onClick={tab.onOpen}>
              {tab.label}
            </button>
            {tab.onClose && (
              <button className="header-tab-close" type="button" aria-label={`Close ${tab.label}`} title={`Close ${tab.label}`} onClick={tab.onClose}>
                <X size={13} strokeWidth={1.5} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </nav>
      <div className="main-header-actions">
        {showChooseLibrary && (
          <button className="icon-button" type="button" title="Choose .ralphy library" aria-label="Choose .ralphy library" onClick={onChooseLibrary}>
            <FolderOpen size={15} strokeWidth={1.5} />
          </button>
        )}
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
