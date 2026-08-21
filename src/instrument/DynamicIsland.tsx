import { Bell, ChevronDown, CircleAlert, LoaderCircle } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
  const hasUnreadError = notifications.some((notification) => notification.unread && notification.severity === "error");
  const projectStatus = projectName && feed.projectStatus.status === "ready" ? feed.projectStatus.value : null;
  const animate = mock && !hasAnimatedMockNotification;
  useEffect(() => { if (animate) hasAnimatedMockNotification = true; }, [animate]);
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const root = document.documentElement;
    const position = () => {
      const bounds = trigger.current?.getBoundingClientRect();
      if (!bounds) return;
      root.style.setProperty("--instrument-island-left", `${Math.round(bounds.left + bounds.width / 2)}px`);
      root.style.setProperty("--instrument-island-top", `${Math.round(bounds.bottom + 8)}px`);
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      root.style.removeProperty("--instrument-island-left");
      root.style.removeProperty("--instrument-island-top");
    };
  }, [open]);
  return <div className="dynamic-island relative z-20 max-w-[520px] [-webkit-app-region:no-drag]" data-mock={mock || undefined} data-animate={animate || undefined}>
    <button ref={trigger} className="dynamic-island-trigger flex h-9 max-w-full items-center gap-3 rounded-full bg-instrument py-0 pr-1.5 pl-4 text-on-instrument focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" type="button" aria-label="Project activity" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {projectStatus && <span className="dynamic-island-project flex shrink-0 items-center gap-2" aria-label={`${projectStatus.approved} approved, ${projectStatus.needsWork} need work, ${projectStatus.rejected} rejected`}>
        <span className="flex items-center gap-1"><i className="size-[7px] rounded-full bg-on-instrument" aria-hidden="true" /><b className="font-display text-[13px] font-extrabold">{projectStatus.approved}</b></span>
        <span className="flex items-center gap-1"><i className="size-[7px] rounded-full outline-[1.5px] outline-on-instrument-muted" aria-hidden="true" /><b className="font-display text-[13px] font-extrabold">{projectStatus.needsWork}</b></span>
        {projectStatus.rejected > 0 && <span className="flex items-center gap-1 text-alert"><i className="size-[7px] rounded-full bg-alert" aria-hidden="true" /><b className="font-display text-[13px] font-extrabold">{projectStatus.rejected}</b></span>}
      </span>}
      {projectStatus && (feed.activeTask || unread > 0) && <i className="size-[3px] shrink-0 rounded-full bg-instrument-raised" aria-hidden="true" />}
      {feed.activeTask && <span className="dynamic-island-task flex min-w-0 items-center gap-2">
        <LoaderCircle className="is-spinning shrink-0 text-on-instrument-muted" aria-hidden="true" size={13} />
        <span className="max-w-36 truncate font-code text-[9.5px] tracking-[.06em] text-on-instrument-muted">{feed.activeTask.label}</span>
        {feed.activeTask.progress !== null && <>
          <span className="h-[3px] w-11 shrink-0 overflow-hidden rounded-full bg-instrument-raised" aria-hidden="true"><i className="block h-full rounded-full bg-on-instrument" style={{ width: `${Math.round(feed.activeTask.progress * 100)}%` }} /></span>
          <b className="shrink-0 font-display text-[13px] font-extrabold">{Math.round(feed.activeTask.progress * 100)}%</b>
        </>}
      </span>}
      {feed.activeTask && unread > 0 && <i className="size-[3px] shrink-0 rounded-full bg-instrument-raised" aria-hidden="true" />}
      {unread > 0 && <span className={`flex shrink-0 items-center gap-1 ${hasUnreadError ? "text-alert" : "text-on-instrument-muted"}`} aria-label={`${unread} unread notification${unread === 1 ? "" : "s"}`}>
        {hasUnreadError ? <CircleAlert aria-hidden="true" size={13} /> : <Bell aria-hidden="true" size={13} />}
        <b className="font-display text-[13px] font-extrabold text-on-instrument">{unread}</b>
      </span>}
      {!projectStatus && !feed.activeTask && unread === 0 && <Bell className="text-on-instrument-muted" aria-hidden="true" size={13} />}
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-instrument-raised text-on-instrument-muted hover:text-on-instrument"><ChevronDown aria-hidden="true" size={12} /></span>
    </button>
    <span className="sr-only" aria-live="polite">{feed.activeTask?.label ?? (unread ? `${unread} unread notifications` : "")}</span>
    <InstrumentOverlay id="dynamic-island" open={open} label="Project activity" description="Current project task and notifications" opener={trigger.current} onOpenChange={setOpen}>
      <div className="dynamic-island-panel grid gap-2 rounded-[24px] bg-instrument p-3 text-on-instrument">
        {mock && <p className="dynamic-island-test-label m-0 font-code text-[9px] tracking-[.12em] text-alert">UX TEST FEED</p>}
        <header className="grid gap-0.5"><strong className="text-[13px] font-normal">{projectName ?? "Activity"}</strong>{projectStatus && <span className="text-[11px] text-on-instrument-muted">{projectStatus.approved} approved · {projectStatus.needsWork} needs work · {projectStatus.rejected} rejected</span>}</header>
        {projectName && feed.projectStatus.status === "unavailable" && <p className="m-0 text-[11px] text-on-instrument-muted">{feed.projectStatus.reason}</p>}
        {feed.activeTask && <button className="flex min-h-[38px] items-center gap-2 rounded-[14px] bg-instrument-raised px-2 py-1.5 text-left text-[12px] text-on-instrument aria-disabled:text-on-instrument-muted" type="button" aria-disabled={!feed.activeTask.destination} onClick={() => { if (feed.activeTask?.destination) onNavigate(feed.activeTask.destination); }}>{feed.activeTask.label}</button>}
        <div className="dynamic-island-notifications grid gap-1">{notifications.map((notification) => <button className="flex min-h-[42px] items-center gap-2 rounded-[14px] bg-instrument-raised px-2 py-1.5 text-left text-on-instrument aria-disabled:text-on-instrument-muted" type="button" key={notification.id} aria-disabled={!notification.destination} onClick={() => { if (notification.destination) onNavigate(notification.destination); }}>{notification.severity === "error" ? <CircleAlert className="shrink-0 text-alert" aria-hidden="true" size={14} /> : <Bell className="shrink-0 text-on-instrument-muted" aria-hidden="true" size={14} />}<span className="grid min-w-0 flex-1"><strong className="truncate text-[12px] font-normal">{notification.title}</strong><small className="text-[10px] text-on-instrument-muted">{notification.unread ? "Unread" : "Seen"} · {new Date(notification.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></span></button>)}</div>
        {notifications.length === 0 && <p className="m-0 text-[11px] text-on-instrument-muted">{feed.notifications.status === "empty" || feed.notifications.status === "unavailable" ? feed.notifications.reason : "No notifications."}</p>}
      </div>
    </InstrumentOverlay>
  </div>;
}
