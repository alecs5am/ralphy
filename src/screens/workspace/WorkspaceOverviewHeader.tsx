import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  Availability,
  WorkspaceHeaderPresentation,
} from "./overview-presentation";

function countLabel(value: Availability<number>, noun: string): string {
  if (value.status === "ready") return `${value.value} ${noun}${value.value === 1 ? "" : "s"}`;
  if (value.status === "partial") return `At least ${value.value} ${noun}${value.value === 1 ? "" : "s"}`;
  return `${noun[0]!.toUpperCase()}${noun.slice(1)} unavailable`;
}

export function WorkspaceOverviewHeader({
  value,
  criticalCount,
  refreshing,
  lastSuccessfulRefreshAt,
  error,
  onRefresh,
}: {
  value: WorkspaceHeaderPresentation;
  criticalCount: Availability<number>;
  refreshing: boolean;
  lastSuccessfulRefreshAt: number | null;
  error: string | null;
  onRefresh(): void;
}) {
  const [announcement, setAnnouncement] = useState("");
  const wasRefreshing = useRef(false);
  const previousRefreshAt = useRef(lastSuccessfulRefreshAt);
  useEffect(() => {
    if (wasRefreshing.current && !refreshing) {
      if (lastSuccessfulRefreshAt !== null
        && (previousRefreshAt.current === null || lastSuccessfulRefreshAt > previousRefreshAt.current)) {
        setAnnouncement(`Workspace refreshed. ${countLabel(criticalCount, "critical issue")}.`);
      } else if (error) {
        setAnnouncement(`Refresh failed. ${error}`);
      }
    }
    wasRefreshing.current = refreshing;
    previousRefreshAt.current = lastSuccessfulRefreshAt;
  }, [criticalCount, error, lastSuccessfulRefreshAt, refreshing]);
  const degraded = [value.accountCount, criticalCount]
    .filter((item) => item.status !== "ready")
    .map((item) => item.reason);
  return <header className="screen-header workspace-overview-header relative m-0 flex min-h-0 w-full max-w-none flex-wrap items-center justify-between gap-4 rounded-panel bg-instrument px-5 py-4 text-on-instrument">
    <div className="min-w-0">
      <div className="screen-kicker type-xs uppercase tracking-wide text-on-instrument-muted">Workspace overview</div>
      <h1 className="mt-1 truncate type-hero font-semibold leading-none tracking-tight text-on-instrument">{value.name}</h1>
      {value.description && <p className="mt-1 type-base leading-5 text-on-instrument-muted">{value.description}</p>}
      <div className="workspace-overview-meta mt-2 flex flex-wrap gap-x-3 gap-y-1 type-xs text-on-instrument-muted">
        {lastSuccessfulRefreshAt !== null && <span>Refreshed <time dateTime={new Date(lastSuccessfulRefreshAt).toISOString()}>{new Date(lastSuccessfulRefreshAt).toLocaleString()}</time></span>}
        <span>Current Core totals · {countLabel(value.accountCount, "connected account")}</span>
      </div>
      {degraded.length > 0 && <p className="workspace-overview-partial mt-2 type-sm text-on-instrument-muted"><strong className="text-on-instrument">Partial data</strong> · {degraded.join(" ")}</p>}
    </div>
    <div className="workspace-header-actions flex items-center gap-2 type-sm text-on-instrument-muted">
      <span className="rounded-full bg-instrument-raised px-3 py-2">{countLabel(criticalCount, "critical issue")}</span>
      <button className="command-button inline-flex min-h-9 items-center gap-2 rounded-control bg-surface px-3 type-base font-medium text-ink" type="button" disabled={refreshing} onClick={onRefresh}>
        <RefreshCw size={14} aria-hidden="true" />{refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </div>
    <span className="workspace-overview-live" aria-live="polite" aria-atomic="true">{announcement}</span>
  </header>;
}
