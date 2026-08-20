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
  return <header className="screen-header workspace-overview-header">
    <div>
      <div className="screen-kicker">Workspace overview</div>
      <h1>{value.name}</h1>
      {value.description && <p>{value.description}</p>}
      <div className="workspace-overview-meta">
        {lastSuccessfulRefreshAt !== null && <span>Refreshed <time dateTime={new Date(lastSuccessfulRefreshAt).toISOString()}>{new Date(lastSuccessfulRefreshAt).toLocaleString()}</time></span>}
        <span>Current Core totals · {countLabel(value.accountCount, "connected account")}</span>
      </div>
      {degraded.length > 0 && <p className="workspace-overview-partial"><strong>Partial data</strong> · {degraded.join(" ")}</p>}
    </div>
    <div className="workspace-header-actions">
      <span>{countLabel(criticalCount, "critical issue")}</span>
      <button className="command-button" type="button" disabled={refreshing} onClick={onRefresh}>
        <RefreshCw size={14} aria-hidden="true" />{refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </div>
    <span className="workspace-overview-live" aria-live="polite" aria-atomic="true">{announcement}</span>
  </header>;
}
