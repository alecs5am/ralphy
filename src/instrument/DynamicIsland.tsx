import { Bell, ChevronDown, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { projectGlyphAsset, projectGlyphVars } from "../lib/project-glyph";
import type { DynamicIslandFeed, IslandContext, IslandNotification } from "./dynamic-island-feed";

let hasAnimatedMockNotification = false;

/* A 16px identity mark cut out of the dither grain, coloured through the mask like every other
   identity mark in the system. `flex-none` keeps it from being the first thing the trigger
   shrinks when the label is long. */
const IDENTITY_MARK = "size-4 flex-none [mask-repeat:no-repeat] [mask-size:16px_16px]";

export function DynamicIsland({ feed, context, projectName, mock, onNavigate }: {
  feed: DynamicIslandFeed;
  context: IslandContext;
  projectName: string | null;
  mock: boolean;
  onNavigate(destination: NonNullable<IslandNotification["destination"]>): void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  const detailId = `dynamic-island-detail-${useId().replace(/:/g, "")}`;
  const notifications = feed.notifications.status === "ready" || feed.notifications.status === "partial" ? feed.notifications.value : [];
  const unread = notifications.filter(({ unread: value }) => value).length;
  const hasUnreadError = notifications.some((notification) => notification.unread && notification.severity === "error");
  const projectStatus = projectName && feed.projectStatus.status === "ready" ? feed.projectStatus.value : null;
  const animate = mock && !hasAnimatedMockNotification;
  useEffect(() => { if (animate) hasAnimatedMockNotification = true; }, [animate]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    detail.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const taskProgress = feed.activeTask?.progress === null || feed.activeTask?.progress === undefined
    ? null
    : Math.round(feed.activeTask.progress * 100);
  const statusChip = (tone: "approved" | "needsWork" | "rejected", count: number) => <span className="flex items-center gap-1.25">
    <i className={`size-[7px] shrink-0 rounded-full ${tone === "approved" ? "bg-on-instrument" : tone === "rejected" ? "bg-alert" : "outline-[1.5px] -outline-offset-[1.5px] outline-on-instrument-muted"}`} aria-hidden="true" />
    <b className="font-display type-base font-extrabold tracking-label text-on-instrument">{count}</b>
  </span>;
  const separator = <i className="size-[3px] shrink-0 rounded-full bg-track-on-instrument" aria-hidden="true" />;
  // The active task's label is copy, not decoration: the decorative on-dark ink reads 3.39:1
  // against the island's own plate, so this run takes the readable muted one.
  const taskTone = feed.activeTask?.status === "failed" ? "text-alert" : "text-on-instrument-muted";
  // The island always carries the context, so it never contracts to a bare circle; the
  // segments after it appear only when there is something to report.
  const contextLabel = [context.label, context.detail].filter(Boolean).join(" \u00b7 ");

  /* The island expands in place, like the iPhone one: the same plate morphs from a pill into a
     panel. The plate is in flow rather than absolutely positioned over a zero-width anchor --
     that older shape left every no-drag box in this subtree empty, so the plate itself sat inside
     the header's drag region and macOS turned each click into a window drag. The centred
     absolute box now lives in InstrumentShell, so the plate grows symmetrically around the
     centre and its no-drag box always matches what the pointer actually hits.

     `corner-shape` cannot be interpolated: switching it mid-transition snapped the pill to a
     different curve while the radius was still animating, so the morphing plate stays round for
     its whole travel and never states a shape at all. */
  return <div className="dynamic-island relative z-island flex [-webkit-app-region:no-drag]" ref={root} data-open={open || undefined} data-mock={mock || undefined} data-animate={animate || undefined}>
    <div className={`dynamic-island-shell grid max-h-overlay-fit-block max-w-island-max overflow-hidden [corner-shape:round] bg-instrument text-on-instrument [transition-property:width,border-radius,grid-template-rows] duration-slow ease-instrument motion-reduce:duration-0 motion-reduce:[transition-property:none] [-webkit-app-region:no-drag] ${open ? "w-island-open rounded-panel grid-rows-(--island-rows-open)" : "w-max rounded-control grid-rows-(--island-rows)"} ${animate ? "animate-island-in motion-reduce:animate-none" : ""}`}>
      <button
        ref={trigger}
        className="dynamic-island-trigger group/island flex h-full w-full min-w-0 items-center gap-3 pr-2 pl-4 [border-radius:inherit] focus-visible:outline-2 focus-visible:outline-focus-on-instrument focus-visible:[outline-offset:-3px]"
        type="button"
        aria-label="Project activity"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen((value) => !value)}
      >
        {/* The island always carries the context, so it never contracts to a bare circle. The
            label re-mounts on change (React key), which replays the tune-in keyframes. */}
        <span className="dynamic-island-context flex min-w-0 items-center gap-2 animate-island-tune motion-reduce:animate-none" key={contextLabel} style={context.identity ? projectGlyphVars(context.identity) : undefined}>
          {context.identity
            ? <i className={`dynamic-island-identity ${IDENTITY_MARK} bg-(--glyph-color,var(--instrument-dither-highlight))`} style={{ maskImage: `url("${projectGlyphAsset(context.identity)}")`, WebkitMaskImage: `url("${projectGlyphAsset(context.identity)}")` }} aria-hidden="true" />
            : <i className={`dynamic-island-identity is-blank ${IDENTITY_MARK} rounded-control bg-on-instrument-muted-decorative`} aria-hidden="true" />}
          <span className="dynamic-island-context-label min-w-0 overflow-hidden font-code type-mono-md tracking-caps text-ellipsis whitespace-nowrap text-on-instrument uppercase">{contextLabel}</span>
          {context.count !== null && <b className="dynamic-island-context-count flex-none font-display type-base font-extrabold tracking-figure text-on-instrument">{context.count}</b>}
        </span>
        {(projectStatus || feed.activeTask) && separator}
        {projectStatus && <span className="dynamic-island-project flex shrink-0 items-center gap-2.5" aria-label={`${projectStatus.approved} approved, ${projectStatus.needsWork} need work, ${projectStatus.rejected} rejected`}>
          {statusChip("approved", projectStatus.approved)}
          {statusChip("needsWork", projectStatus.needsWork)}
          {projectStatus.rejected > 0 && statusChip("rejected", projectStatus.rejected)}
        </span>}
        {projectStatus && feed.activeTask && separator}
        {feed.activeTask && <span className="dynamic-island-task flex min-w-0 items-center gap-2">
          <i className="dynamic-island-orb block size-4 shrink-0 bg-dither-highlight [mask-image:url('/assets/dither/g5.png')] [mask-repeat:no-repeat] [mask-size:16px_16px]" aria-hidden="true" />
          <span className={`min-w-0 truncate font-code type-mono-sm tracking-label uppercase ${taskTone}`}>{feed.activeTask.label}</span>
          {taskProgress !== null && <>
            <span className="h-[3px] w-11 shrink-0 overflow-hidden rounded-full bg-track-on-instrument" aria-hidden="true"><i className="block h-full rounded-full bg-on-instrument" style={{ width: `${taskProgress}%` }} /></span>
            <b className="shrink-0 font-display type-base font-extrabold tracking-label">{taskProgress}%</b>
          </>}
        </span>}
        {unread > 0 && <>
          {separator}
          <span className={`flex shrink-0 items-center gap-1.25 ${hasUnreadError ? "text-alert" : "text-on-instrument-muted"}`} aria-label={`${unread} unread notification${unread === 1 ? "" : "s"}`}>
            {hasUnreadError ? <CircleAlert aria-hidden="true" size={13} /> : <Bell aria-hidden="true" size={13} />}
            <b className="font-display type-base font-extrabold tracking-label text-on-instrument">{unread}</b>
          </span>
        </>}
        <span className={`dynamic-island-expand ml-auto grid size-6 flex-none place-items-center rounded-control bg-instrument-raised text-on-instrument-muted [transition-property:transform,color] duration-normal ease-instrument group-hover/island:text-on-instrument motion-reduce:duration-0 motion-reduce:[transition-property:none] ${open ? "rotate-180" : ""}`} aria-hidden="true">
          <ChevronDown size={12} />
        </span>
      </button>
      <span className="sr-only" aria-live="polite">{feed.activeTask?.label ?? (unread ? `${unread} unread notifications` : "")}</span>
      <div
        /* Closed, the panel must not contribute to the plate's `max-content` width, or the
           collapsed pill is sized by the widest line of a panel nobody can see yet. */
        className={`dynamic-island-detail min-h-0 overflow-x-hidden overscroll-contain outline-0 ${open ? "w-full overflow-y-auto" : "w-0 overflow-y-hidden"}`}
        id={detailId}
        ref={detail}
        role="region"
        tabIndex={-1}
        aria-label="Project activity"
        data-instrument-overlay="dynamic-island"
        data-instrument-overlay-kind="popover"
        aria-hidden={!open || undefined}
        inert={!open || undefined}
      >
        <div className={`dynamic-island-detail-inner grid gap-2 px-2 pb-2 transition-opacity duration-normal ease-instrument motion-reduce:transition-none ${open ? "opacity-100 delay-90" : "opacity-0"}`}>
          {(mock || projectStatus) && <header className="flex min-w-0 items-center justify-between gap-3 px-2 pt-1 pb-1.5">
            {projectStatus && <span className="type-meta text-on-instrument-muted">{projectStatus.approved} approved · {projectStatus.needsWork} needs work · {projectStatus.rejected} rejected</span>}
            {/* The alarm red is 4.15:1 as 9px copy on the island's own plate; the bright variant
                exists for exactly this -- an alarm standing on a black widget. */}
            {mock && <small className="ml-auto shrink-0 font-code type-mono-xs tracking-mono text-alert-bright">UX TEST FEED</small>}
          </header>}
          {projectName && feed.projectStatus.status === "unavailable" && <p className="m-0 rounded-inner bg-instrument-raised px-3 py-2 type-xs text-on-instrument-muted">{feed.projectStatus.reason}</p>}
          {feed.activeTask && <section className="grid gap-1" aria-label="Active task">
            <span className="px-2 font-code type-mono-xs tracking-mono text-on-instrument-muted">ACTIVE TASK</span>
            <button className="grid min-h-14 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-inner bg-instrument-raised px-2.5 py-2 text-left text-on-instrument hover:bg-instrument-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-on-instrument aria-disabled:text-on-instrument-muted" type="button" aria-disabled={!feed.activeTask.destination} onClick={() => { if (feed.activeTask?.destination) onNavigate(feed.activeTask.destination); }}>
              <span className="grid size-7 place-items-center rounded-full bg-instrument">{feed.activeTask.status === "running" ? <LoaderCircle className="is-spinning animate-spinner motion-reduce:animate-none" aria-hidden="true" size={14} /> : feed.activeTask.status === "failed" ? <CircleAlert className="text-alert" aria-hidden="true" size={14} /> : <CircleCheck className="text-on-instrument-muted" aria-hidden="true" size={14} />}</span>
              <span className="grid min-w-0 gap-1"><strong className="truncate type-sm font-normal">{feed.activeTask.label}</strong>{taskProgress !== null && <span className="h-1 overflow-hidden rounded-full bg-instrument"><i className="block h-full rounded-full bg-on-instrument" style={{ width: `${taskProgress}%` }} /></span>}</span>
              <small className="font-display type-base text-on-instrument-muted">{taskProgress === null ? feed.activeTask.status : `${taskProgress}%`}</small>
            </button>
          </section>}
          {!feed.activeTask && <section className="grid gap-1" aria-label="Active task">
            <span className="px-2 font-code type-mono-xs tracking-mono text-on-instrument-muted">ACTIVE TASK</span>
            <p className="m-0 rounded-inner bg-instrument-raised px-3 py-2.5 type-xs text-on-instrument-muted">{projectName ? "No active task for this project." : "Open a project to track its active task here."}</p>
          </section>}
          <section className="grid gap-1" aria-label="Notifications">
            <span className="flex items-center justify-between px-2 font-code type-mono-xs tracking-mono text-on-instrument-muted"><span>NOTIFICATIONS</span>{unread > 0 && <b className="font-display type-sm text-on-instrument">{unread} NEW</b>}</span>
            <div className="dynamic-island-notifications grid gap-1">{notifications.map((notification) => <button className="grid min-h-12 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-inner bg-instrument-raised px-2.5 py-2 text-left text-on-instrument hover:bg-instrument-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-on-instrument aria-disabled:text-on-instrument-muted" type="button" key={notification.id} aria-disabled={!notification.destination} onClick={() => { if (notification.destination) onNavigate(notification.destination); }}><span className="grid size-7 place-items-center rounded-full bg-instrument">{notification.severity === "error" ? <CircleAlert className="text-alert" aria-hidden="true" size={14} /> : <Bell className="text-on-instrument-muted" aria-hidden="true" size={14} />}</span><span className="grid min-w-0"><strong className="truncate type-sm font-normal">{notification.title}</strong><small className="type-meta text-on-instrument-muted">{new Date(notification.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></span>{notification.unread && <i className={`size-2 rounded-full ${notification.severity === "error" ? "bg-alert" : "bg-on-instrument"}`} aria-label="Unread" />}</button>)}</div>
            {notifications.length === 0 && <p className="m-0 rounded-inner bg-instrument-raised px-3 py-2.5 type-xs text-on-instrument-muted">{feed.notifications.status === "empty" || feed.notifications.status === "unavailable" ? feed.notifications.reason : "No notifications."}</p>}
          </section>
        </div>
      </div>
    </div>
  </div>;
}
