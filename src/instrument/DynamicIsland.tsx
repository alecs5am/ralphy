import { Bell, ChevronDown, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
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
      root.style.setProperty("--instrument-island-top", `${Math.round(bounds.bottom + 12)}px`);
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
  const taskProgress = feed.activeTask?.progress === null || feed.activeTask?.progress === undefined
    ? null
    : Math.round(feed.activeTask.progress * 100);
  return <div className="dynamic-island relative z-20 w-max max-w-[520px] [-webkit-app-region:no-drag]" data-mock={mock || undefined} data-animate={animate || undefined}>
    <button ref={trigger} className="dynamic-island-trigger flex h-9 w-full max-w-full items-center gap-2.5 overflow-hidden rounded-full bg-instrument py-0 pr-3 pl-4 text-on-instrument focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" type="button" aria-label="Project activity" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {projectStatus && <span className="dynamic-island-project flex shrink-0 items-center gap-2" aria-label={`${projectStatus.approved} approved, ${projectStatus.needsWork} need work, ${projectStatus.rejected} rejected`}>
        <span className="flex items-center gap-1"><i className="size-[7px] rounded-full bg-on-instrument" aria-hidden="true" /><b className="font-display text-[13px] font-extrabold">{projectStatus.approved}</b></span>
        <span className="flex items-center gap-1"><i className="size-[7px] rounded-full outline-[1.5px] outline-on-instrument-muted" aria-hidden="true" /><b className="font-display text-[13px] font-extrabold">{projectStatus.needsWork}</b></span>
        {projectStatus.rejected > 0 && <span className="flex items-center gap-1 text-alert"><i className="size-[7px] rounded-full bg-alert" aria-hidden="true" /><b className="font-display text-[13px] font-extrabold">{projectStatus.rejected}</b></span>}
      </span>}
      {feed.activeTask && <span className="dynamic-island-task flex min-w-0 items-center gap-2">
        {feed.activeTask.status === "running"
          ? <LoaderCircle className="is-spinning shrink-0 text-on-instrument-muted" aria-hidden="true" size={13} />
          : feed.activeTask.status === "failed"
            ? <CircleAlert className="shrink-0 text-alert" aria-hidden="true" size={13} />
            : <CircleCheck className="shrink-0 text-on-instrument-muted" aria-hidden="true" size={13} />}
        <span className="max-w-40 truncate text-[11px] text-on-instrument-muted">{feed.activeTask.label}</span>
        {taskProgress !== null && <>
          <span className="h-[3px] w-11 shrink-0 overflow-hidden rounded-full bg-instrument-raised" aria-hidden="true"><i className="block h-full rounded-full bg-on-instrument" style={{ width: `${taskProgress}%` }} /></span>
          <b className="shrink-0 font-display text-[13px] font-extrabold">{taskProgress}%</b>
        </>}
      </span>}
      {unread > 0 && <span className={`flex shrink-0 items-center gap-1 ${hasUnreadError ? "text-alert" : "text-on-instrument-muted"}`} aria-label={`${unread} unread notification${unread === 1 ? "" : "s"}`}>
        {hasUnreadError ? <CircleAlert aria-hidden="true" size={13} /> : <Bell aria-hidden="true" size={13} />}
        <b className="font-display text-[13px] font-extrabold text-on-instrument">{unread}</b>
      </span>}
      {!projectStatus && !feed.activeTask && unread === 0 && <span className="flex items-center gap-2 text-[11px] text-on-instrument-muted"><Bell aria-hidden="true" size={13} /><span>Activity</span></span>}
      <ChevronDown className={`shrink-0 text-on-instrument-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" size={12} />
    </button>
    <span className="sr-only" aria-live="polite">{feed.activeTask?.label ?? (unread ? `${unread} unread notifications` : "")}</span>
    <InstrumentOverlay id="dynamic-island" open={open} label="Project activity" description="Current project task and notifications" opener={trigger.current} onOpenChange={setOpen}>
      <div className="dynamic-island-panel grid gap-2 rounded-[24px] bg-transparent p-2 text-on-instrument">
        <header className="grid min-w-0 gap-1 px-2 pt-1 pb-1.5">
          <span className="flex items-center justify-between gap-3"><strong className="truncate text-[13px] font-normal">{projectName ?? "Workspace activity"}</strong>{mock && <small className="shrink-0 font-code text-[9px] tracking-[.1em] text-alert">UX TEST FEED</small>}</span>
          {projectStatus && <span className="text-[10px] text-on-instrument-muted">{projectStatus.approved} approved · {projectStatus.needsWork} needs work · {projectStatus.rejected} rejected</span>}
        </header>
        {projectName && feed.projectStatus.status === "unavailable" && <p className="m-0 rounded-2xl bg-instrument-raised px-3 py-2 text-[11px] text-on-instrument-muted">{feed.projectStatus.reason}</p>}
        {feed.activeTask && <section className="grid gap-1" aria-label="Active task">
          <span className="px-2 font-code text-[9px] tracking-[.1em] text-on-instrument-muted">ACTIVE TASK</span>
          <button className="grid min-h-14 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl bg-instrument-raised px-2.5 py-2 text-left text-on-instrument hover:bg-instrument-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-on-instrument aria-disabled:text-on-instrument-muted" type="button" aria-disabled={!feed.activeTask.destination} onClick={() => { if (feed.activeTask?.destination) onNavigate(feed.activeTask.destination); }}>
            <span className="grid size-7 place-items-center rounded-[10px] bg-instrument">{feed.activeTask.status === "running" ? <LoaderCircle className="is-spinning" aria-hidden="true" size={14} /> : feed.activeTask.status === "failed" ? <CircleAlert className="text-alert" aria-hidden="true" size={14} /> : <CircleCheck className="text-on-instrument-muted" aria-hidden="true" size={14} />}</span>
            <span className="grid min-w-0 gap-1"><strong className="truncate text-[12px] font-normal">{feed.activeTask.label}</strong>{taskProgress !== null && <span className="h-1 overflow-hidden rounded-full bg-instrument"><i className="block h-full rounded-full bg-on-instrument" style={{ width: `${taskProgress}%` }} /></span>}</span>
            <small className="font-display text-[13px] text-on-instrument-muted">{taskProgress === null ? feed.activeTask.status : `${taskProgress}%`}</small>
          </button>
        </section>}
        {!feed.activeTask && <section className="grid gap-1" aria-label="Active task">
          <span className="px-2 font-code text-[9px] tracking-[.1em] text-on-instrument-muted">ACTIVE TASK</span>
          <p className="m-0 rounded-2xl bg-instrument px-3 py-2.5 text-[11px] text-on-instrument-muted">{projectName ? "No active task for this project." : "Open a project to track its active task here."}</p>
        </section>}
        <section className="grid gap-1" aria-label="Notifications">
          <span className="flex items-center justify-between px-2 font-code text-[9px] tracking-[.1em] text-on-instrument-muted"><span>NOTIFICATIONS</span>{unread > 0 && <b className="font-display text-[12px] text-on-instrument">{unread} NEW</b>}</span>
          <div className="dynamic-island-notifications grid gap-1">{notifications.map((notification) => <button className="grid min-h-12 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl bg-instrument-raised px-2.5 py-2 text-left text-on-instrument hover:bg-instrument-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-on-instrument aria-disabled:text-on-instrument-muted" type="button" key={notification.id} aria-disabled={!notification.destination} onClick={() => { if (notification.destination) onNavigate(notification.destination); }}><span className="grid size-7 place-items-center rounded-[10px] bg-instrument">{notification.severity === "error" ? <CircleAlert className="text-alert" aria-hidden="true" size={14} /> : <Bell className="text-on-instrument-muted" aria-hidden="true" size={14} />}</span><span className="grid min-w-0"><strong className="truncate text-[12px] font-normal">{notification.title}</strong><small className="text-[10px] text-on-instrument-muted">{new Date(notification.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></span>{notification.unread && <i className={`size-2 rounded-full ${notification.severity === "error" ? "bg-alert" : "bg-on-instrument"}`} aria-label="Unread" />}</button>)}</div>
          {notifications.length === 0 && <p className="m-0 rounded-2xl bg-instrument-raised px-3 py-2.5 text-[11px] text-on-instrument-muted">{feed.notifications.status === "empty" || feed.notifications.status === "unavailable" ? feed.notifications.reason : "No notifications."}</p>}
        </section>
      </div>
    </InstrumentOverlay>
  </div>;
}
