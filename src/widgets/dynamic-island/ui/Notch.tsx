import { Bell, ChevronDown, CircleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { IslandActivity } from "./IslandActivity";
import { projectGlyphAsset, projectGlyphVars } from "@/shared/lib/project-glyph";
import type { DynamicIslandFeed, IslandContext, IslandNotification } from "../model/feed";

let hasAnimatedMockNotification = false;

/* A 16px identity mark cut out of the dither grain, coloured through the mask like every other
   identity mark in the system. `flex-none` keeps it from being the first thing the trigger
   shrinks when the label is long. */
const IDENTITY_MARK = "size-4 flex-none [mask-repeat:no-repeat] [mask-size:16px_16px]";

export function Notch({ feed, context, projectName, mock, onNavigate }: {
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
  const detailId = `notch-detail-${useId().replace(/:/g, "")}`;
  const [notificationState, setNotificationState] = useState<{ epoch: number | undefined; read: string[]; dismissed: string[] }>({ epoch: feed.rootEpoch, read: [], dismissed: [] });
  const local = notificationState.epoch === feed.rootEpoch ? notificationState : { epoch: feed.rootEpoch, read: [], dismissed: [] };
  const updateNotification = (id: string, dismiss = false) => {
    detail.current?.focus({ preventScroll: true });
    setNotificationState({ ...local, read: [...new Set([...local.read, id])], dismissed: dismiss ? [...new Set([...local.dismissed, id])] : local.dismissed });
  };
  const sourceNotifications = feed.notifications.status === "ready" || feed.notifications.status === "partial" ? feed.notifications.value : [];
  const notifications = sourceNotifications.filter(({ id }) => !local.dismissed.includes(id)).map((item) => ({ ...item, unread: item.unread && !local.read.includes(item.id) }));
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
    };
    const onPointerDown = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    detail.current?.focus({ preventScroll: true });
    return () => { document.removeEventListener("keydown", onKeyDown); document.removeEventListener("pointerdown", onPointerDown); };
  }, [open]);

  const progress = feed.activeTask?.progress;
  const taskProgress = typeof progress === "number" && Number.isFinite(progress) ? Math.round(Math.max(0, Math.min(1, progress)) * 100) : null;
  const navigate = (destination: NonNullable<IslandNotification["destination"]>) => { setOpen(false); onNavigate(destination); };
  const statusChip = (tone: "approved" | "needsWork" | "rejected", count: number) => <span className="flex items-center gap-1.25">
    <i className={`size-1.75 shrink-0 rounded-full ${tone === "approved" ? "bg-on-instrument" : tone === "rejected" ? "bg-alert" : "outline-(length:--spacing-island-ring) -outline-offset-(length:--spacing-island-ring) outline-on-instrument-muted"}`} aria-hidden="true" />
    <b className="font-display type-base font-extrabold tracking-label text-on-instrument">{count}</b>
  </span>;
  const separator = <i className="size-0.75 shrink-0 rounded-full bg-track-on-instrument" aria-hidden="true" />;
  // The active task's label is copy, not decoration: the decorative on-dark ink reads 3.39:1
  // against the island's own plate, so this run takes the readable muted one.
  const taskTone = feed.activeTask?.status === "failed" ? "text-alert" : "text-on-instrument-muted";
  // The island always carries the context, so it never contracts to a bare circle; the
  // segments after it appear only when there is something to report.
  const contextLabel = [context.label, context.detail].filter(Boolean).join(" \u00b7 ");

  /* Keep one plate and a finite half-height pill radius. Interpolating rounded-full's huge
     radius clips the growing panel into an oval until the very last frame. */
  return <div className="dynamic-island relative z-island flex [-webkit-app-region:no-drag]" ref={root} onBlur={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }} data-open={open || undefined} data-mock={mock || undefined} data-animate={animate || undefined}>
    {/* The dismiss surface, and it exists only while the island is open. A `document` listener for
        an outside pointerdown cannot see the one click the operator is most likely to make: the
        island stands in the titlebar, and Electron hands a mousedown on a drag region to the OS
        window-drag instead of to the page, so the whole bar around the island was deaf. A real
        surface hears it -- and opts out of the drag region for as long as it is there, which is
        what a popover should do to the window behind it anyway.

        No z-index: both this and the shell are positioned, so document order puts the shell on
        top, and the scrim covers everything else. */}
    {open && <div
      className="dynamic-island-scrim fixed inset-0 [-webkit-app-region:no-drag]"
      onPointerDown={close}
      aria-hidden="true"
    />}
    <div className={`dynamic-island-shell relative grid max-h-overlay-fit-block max-w-island-max overflow-hidden [corner-shape:round] bg-instrument text-on-instrument [interpolate-size:allow-keywords] [transition-property:width,border-radius,grid-template-rows] duration-notch ease-notch motion-reduce:duration-0 motion-reduce:[transition-property:none] [-webkit-app-region:no-drag] ${open ? "w-island-open rounded-panel grid-rows-(--island-rows-open)" : "w-max rounded-notch grid-rows-(--island-rows)"} ${animate ? "animate-island-in motion-reduce:animate-none" : ""}`}>
      <button
        ref={trigger}
        className="dynamic-island-trigger group/island flex h-full w-full min-w-0 items-center gap-3 pr-2 pl-4 [border-radius:inherit] focus-visible:outline-2 focus-visible:outline-focus-on-instrument focus-visible:[outline-offset:-3px]"
        type="button"
        aria-label="Notch activity"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen((value) => !value)}
      >
        {/* Keep context mounted so live updates do not restart motion or move the trigger. */}
        <span className="dynamic-island-context flex min-w-0 items-center gap-2" style={context.identity ? projectGlyphVars(context.identity) : undefined}>
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
            <span className="h-0.75 w-11 shrink-0 overflow-hidden rounded-full bg-track-on-instrument" aria-hidden="true"><i className="block h-full rounded-full bg-on-instrument" style={{ width: `${taskProgress}%` }} /></span>
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
        /* Contain the detail's intrinsic width in BOTH states. Changing its contribution on
           open changes the max-content animation endpoint and makes a compact pill jump. */
        className="dynamic-island-detail min-h-0 w-full [contain:inline-size] overflow-x-hidden overflow-y-auto overscroll-contain outline-0"
        id={detailId}
        ref={detail}
        role="region"
        tabIndex={-1}
        aria-label="Notch activity"
        data-instrument-overlay="dynamic-island"
        data-instrument-overlay-kind="popover"
        aria-hidden={!open || undefined}
        inert={!open || undefined}
      >
        <div className="dynamic-island-detail-inner grid w-island-open max-w-island-max gap-2 px-2 pb-2 motion-reduce:transition-none">
          {(mock || projectStatus) && <header className="flex min-w-0 items-center justify-between gap-3 px-2 pt-1 pb-1.5">
            {projectStatus && <span className="type-meta text-on-instrument-muted">{projectStatus.approved} approved · {projectStatus.needsWork} needs work · {projectStatus.rejected} rejected</span>}
            {/* The alarm red is 4.15:1 as 9px copy on the island's own plate; the bright variant
                exists for exactly this -- an alarm standing on a black widget. */}
            {mock && <small className="ml-auto shrink-0 font-code type-mono-xs tracking-mono text-alert-bright">UX TEST FEED</small>}
          </header>}
          {projectName && (feed.projectStatus.status === "unavailable" || feed.projectStatus.status === "error") && <details className="rounded-inner bg-instrument-raised px-3 py-2 type-xs text-on-instrument-muted"><summary className="cursor-pointer">Review counts are not available</summary><p className="mb-0 mt-2 leading-prose">{feed.projectStatus.reason}</p></details>}
          <IslandActivity feed={feed} notifications={notifications} unread={unread} projectName={projectName} taskProgress={taskProgress} onNavigate={navigate} onRead={(id) => updateNotification(id)} onDismiss={(id) => updateNotification(id, true)} onReadAll={() => { detail.current?.focus({ preventScroll: true }); setNotificationState({ ...local, read: [...new Set([...local.read, ...notifications.map(({ id }) => id)])] }); }} />
        </div>
      </div>
    </div>
  </div>;
}
