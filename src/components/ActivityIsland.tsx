export interface ActivityIslandState {
  projectName: string | null;
  status: string | null;
  count: number | null;
  busyLabel: string | null;
  progress: number | null;
  alert: string | null;
}

export function ActivityIsland({ state }: { state: ActivityIslandState }) {
  const progress = state.progress === null ? null : Math.min(100, Math.max(0, state.progress));
  return (
    <div className="activity-island" aria-live="polite">
      {state.projectName && <strong>{state.projectName}</strong>}
      {state.status && <span>{state.status}</span>}
      {state.count !== null && <span>{state.count}</span>}
      {state.busyLabel && <span>{state.busyLabel}</span>}
      {progress !== null && <span>{progress}%</span>}
      {state.alert && <span role="alert">{state.alert}</span>}
    </div>
  );
}
