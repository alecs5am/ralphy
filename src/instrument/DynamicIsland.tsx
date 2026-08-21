import { Bell, ChevronDown, CircleAlert, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { InstrumentOverlay } from "./overlay-registry";
import type { DynamicIslandFeed, IslandNotification } from "./dynamic-island-feed";

let hasAnimatedMockNotification = false;

export function DynamicIsland({ feed, projectName, mock, onNavigate }: {
  feed: DynamicIslandFeed;
  projectName: string | null;
  mock: boolean;
  onNavigate(destination: NonNullable<IslandNotification["destination"]>): void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const notifications = feed.notifications.status === "ready" || feed.notifications.status === "partial" ? feed.notifications.value : [];
  const unread = notifications.filter(({ unread: value }) => value).length;
  const animate = mock && !hasAnimatedMockNotification;
  useEffect(() => { if (animate) hasAnimatedMockNotification = true; }, [animate]);
  return <div className="dynamic-island" data-mock={mock || undefined} data-animate={animate || undefined}>
    <button ref={trigger} className="dynamic-island-trigger" type="button" aria-label="Project activity" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span className="dynamic-island-status"><i aria-hidden="true" />{feed.activeTask ? <LoaderCircle className="is-spinning" aria-hidden="true" size={13} /> : <Bell aria-hidden="true" size={13} />}</span>
      <span><strong>{feed.activeTask?.label ?? projectName ?? "Ralphy is ready"}</strong><small>{feed.activeTask ? (feed.activeTask.progress === null ? "Active task" : `${Math.round(feed.activeTask.progress * 100)}% complete`) : unread ? `${unread} unread` : "No active task"}</small></span>
      <ChevronDown aria-hidden="true" size={13} />
    </button>
    <span className="sr-only" aria-live="polite">{feed.activeTask?.label ?? (unread ? `${unread} unread notifications` : "")}</span>
    <InstrumentOverlay id="dynamic-island" open={open} label="Project activity" description="Current project task and notifications" opener={trigger.current} onOpenChange={setOpen}>
      <div className="dynamic-island-panel">
        {mock && <p className="dynamic-island-test-label">UX TEST FEED</p>}
        <header><strong>{projectName ?? "Workspace activity"}</strong>{feed.projectStatus.status === "ready" && <span>{feed.projectStatus.value.approved} approved · {feed.projectStatus.value.needsWork} needs work</span>}</header>
        {feed.projectStatus.status === "unavailable" && <p>{feed.projectStatus.reason}</p>}
        {feed.activeTask && <button type="button" aria-disabled={!feed.activeTask.destination} onClick={() => { if (feed.activeTask?.destination) onNavigate(feed.activeTask.destination); }}>{feed.activeTask.label}</button>}
        <div className="dynamic-island-notifications">{notifications.map((notification) => <button type="button" key={notification.id} aria-disabled={!notification.destination} onClick={() => { if (notification.destination) onNavigate(notification.destination); }}>{notification.severity === "error" ? <CircleAlert aria-hidden="true" size={14} /> : <Bell aria-hidden="true" size={14} />}<span><strong>{notification.title}</strong><small>{notification.unread ? "Unread" : "Seen"}</small></span></button>)}</div>
        {notifications.length === 0 && <p>{feed.notifications.status === "empty" || feed.notifications.status === "unavailable" ? feed.notifications.reason : "No notifications."}</p>}
      </div>
    </InstrumentOverlay>
  </div>;
}
