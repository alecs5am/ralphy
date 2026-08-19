import { useEffect, useId, useRef, useState } from "react";

export interface ActivityIslandState {
  projectName: string | null;
  status: string | null;
  count: number | null;
  busyLabel: string | null;
  progress: number | null;
  alert: string | null;
}

export function ActivityIsland({ state }: { state: ActivityIslandState }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const progress = state.progress === null ? null : Math.min(100, Math.max(0, state.progress));
  useEffect(() => {
    if (!open) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => trigger.current?.focus());
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [open]);
  return (
    <div className="activity-island-wrap">
      <button className="activity-island" type="button" aria-label="Show activity details" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} ref={trigger} onClick={() => setOpen((value) => !value)}>
        {state.projectName && <strong>{state.projectName}</strong>}
        {state.status && <span>{state.status}</span>}
        {state.count !== null && <span className="activity-island-count">{state.count}</span>}
        {state.busyLabel && <span className="activity-island-busy">{state.busyLabel}</span>}
        {progress !== null && <span className="activity-island-progress">{progress}%</span>}
        {state.alert && <span role="alert">{state.alert}</span>}
      </button>
      {open && <div className="activity-island-popover" id={id} role="dialog" aria-label="Activity details">
        {state.projectName && <span><small>Context</small><strong>{state.projectName}</strong></span>}
        {state.status && <span><small>Status</small><strong>{state.status}</strong></span>}
        {state.count !== null && <span><small>Count</small><strong>{state.count}</strong></span>}
        {state.busyLabel && <span><small>Activity</small><strong>{state.busyLabel}</strong></span>}
        {progress !== null && <span><small>Progress</small><strong>{progress}%</strong></span>}
        {state.alert && <span><small>Alert</small><strong>{state.alert}</strong></span>}
      </div>}
    </div>
  );
}
