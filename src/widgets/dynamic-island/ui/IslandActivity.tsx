import { ArrowUpRight, Bell, Check, CircleAlert, CircleCheck, LoaderCircle, X } from "@/shared/ui/icons";
import { IconButton } from "@/shared/ui/IconButton";
import type { DynamicIslandFeed, IslandNotification } from "../model/feed";

const ACTION = "rounded-control px-2 py-1 type-xs text-on-instrument-muted hover:bg-instrument-hover hover:text-on-instrument focus-visible:outline-2 focus-visible:outline-on-instrument";
const ROW = "grid min-h-14 grid-cols-(--dynamic-island-row-columns) items-center gap-2 rounded-inner bg-instrument-raised px-3 py-3 text-left text-on-instrument";
const STATUS = { running: "In progress", complete: "Completed", failed: "Needs attention" };

export function IslandActivity({ feed, notifications, unread, projectName, taskProgress, onNavigate, onRead, onDismiss, onReadAll }: {
  feed: DynamicIslandFeed;
  notifications: IslandNotification[];
  unread: number;
  projectName: string | null;
  taskProgress: number | null;
  onNavigate(destination: NonNullable<IslandNotification["destination"]>): void;
  onRead(id: string): void;
  onDismiss(id: string): void;
  onReadAll(): void;
}) {
  const task = feed.activeTask;
  const Icon = task?.status === "running" ? LoaderCircle : task?.status === "failed" ? CircleAlert : CircleCheck;
  return <>
    <header className="flex items-center justify-between px-2 pb-1 pt-2"><h2 className="m-0 type-ui font-medium">Activity</h2><span className="type-xs text-on-instrument-muted">{task ? STATUS[task.status] : "Ready when you are"}</span></header>
    <section className="grid gap-1" aria-label="Active task">
      {task ? <div className={ROW}>
        <Icon className={`size-4 text-on-instrument-muted ${task.status === "running" ? "animate-spinner motion-reduce:animate-none" : ""}`} aria-hidden="true" />
        <div className="grid min-w-0 gap-2"><strong className="type-sm font-medium leading-prose">{task.label}</strong>
          {taskProgress !== null && <div role="progressbar" aria-label="Task progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={taskProgress} className="h-1 overflow-hidden rounded-full bg-instrument"><span className="block h-full rounded-full bg-on-instrument" style={{ width: `${taskProgress}%` }} /></div>}
          {task.destination && <button type="button" className={`justify-self-start ${ACTION}`} onClick={() => onNavigate(task.destination!)}>Open task <ArrowUpRight className="inline size-3" aria-hidden="true" /></button>}
        </div><span className="type-sm text-on-instrument-muted">{taskProgress === null ? "" : `${taskProgress}%`}</span>
      </div> : <div className={ROW}><CircleCheck className="size-4 text-on-instrument-muted" aria-hidden="true" /><div className="col-span-2"><strong className="type-sm font-medium">No task running</strong><p className="mb-0 mt-1 type-xs leading-prose text-on-instrument-muted">{projectName ? "Start a chat or a generation. Its activity will appear here." : "Your next agent task will appear here when it starts."}</p></div></div>}
    </section>
    <section className="grid gap-1" aria-label="Notifications">
      <div className="flex items-center justify-between px-2 pt-2"><h3 className="m-0 type-sm font-medium">Notifications{unread > 0 ? ` · ${unread} new` : ""}</h3>{unread > 0 && <button type="button" className={ACTION} onClick={onReadAll}>Mark all read</button>}</div>
      <div className="dynamic-island-notifications grid gap-1">{notifications.map((notification) => {
        const NotificationIcon = notification.severity === "info" ? Bell : CircleAlert;
        return <article key={notification.id} className={ROW}>
          <NotificationIcon className="size-4 text-on-instrument-muted" aria-hidden="true" />
          <div className="grid min-w-0 gap-1"><strong className="type-sm font-medium leading-prose">{notification.title}</strong><span className="type-xs text-on-instrument-muted">{Number.isFinite(notification.timestamp) ? new Date(notification.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}{notification.unread ? " · Unread" : " · Read"}</span>
            <div className="flex flex-wrap gap-1">{notification.destination && <button type="button" className={ACTION} onClick={() => { onRead(notification.id); onNavigate(notification.destination!); }}>Open <ArrowUpRight className="inline size-3" aria-hidden="true" /></button>}{notification.unread && <button type="button" className={ACTION} onClick={() => onRead(notification.id)}><Check className="inline size-3" aria-hidden="true" /> Mark read</button>}</div>
          </div><IconButton label={`Dismiss ${notification.title}`} className="size-7 self-start rounded-control text-on-instrument-muted hover:bg-instrument-hover hover:text-on-instrument focus-visible:outline-on-instrument" onClick={() => onDismiss(notification.id)}><X className="size-3" aria-hidden="true" /></IconButton>
        </article>;
      })}</div>
      {notifications.length === 0 && <p className="m-0 rounded-inner bg-instrument-raised px-3 py-3 type-sm text-on-instrument-muted">{(feed.notifications.status === "unavailable" || feed.notifications.status === "error") ? feed.notifications.reason : "All caught up. No notifications to review."}</p>}
      {feed.notifications.status === "partial" && <p className="m-0 px-3 py-2 type-xs text-on-instrument-muted">{feed.notifications.reason}</p>}
    </section>
  </>;
}
