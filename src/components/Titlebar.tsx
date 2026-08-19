import {
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { ActivityIsland, type ActivityIslandState } from "./ActivityIsland";
import { ProfileAvatar } from "./ProfileAvatar";

interface MainHeaderProps {
  sidebarVisible: boolean;
  rightPanelVisible: boolean;
  rightPanelAvailable: boolean;
  rootPath: string;
  activity: ActivityIslandState;
  onToggleSidebar(): void;
  onToggleRightPanel(): void;
}

export function MainHeader({
  sidebarVisible,
  rightPanelVisible,
  rightPanelAvailable,
  rootPath,
  activity,
  onToggleSidebar,
  onToggleRightPanel,
}: MainHeaderProps) {
  return (
    <motion.header className="main-header" layout>
      <div className="main-header-leading" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
        <div className="main-traffic-space" aria-hidden="true" />
        <button className="icon-button" type="button" title={sidebarVisible ? "Hide sidebar" : "Show sidebar"} aria-label="Toggle sidebar" aria-pressed={sidebarVisible} onClick={onToggleSidebar}>
          <PanelLeft size={16} strokeWidth={1.5} />
        </button>
      </div>
      <ActivityIsland state={activity} />
      <div className="main-header-actions">
        {rightPanelAvailable && (
          <button className={`icon-button${rightPanelVisible ? " is-active" : ""}`} type="button" title="Toggle right panel (⌘R)" aria-label="Toggle right panel" aria-pressed={rightPanelVisible} onClick={onToggleRightPanel}>
            <PanelRight size={16} strokeWidth={1.5} />
          </button>
        )}
        <span className="main-header-avatar"><ProfileAvatar rootPath={rootPath} size={20} /></span>
      </div>
    </motion.header>
  );
}
