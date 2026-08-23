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
  return <header className="screen-header workspace-overview-header relative m-0 flex min-h-0 w-full max-w-none flex-none flex-wrap items-center justify-between gap-4 rounded-panel bg-instrument px-5 py-4 text-on-instrument">
    <div className="min-w-0">
      <div className="screen-kicker mb-1 type-xs uppercase tracking-wide text-on-instrument-muted">Workspace overview</div>
      <h1 className="mx-0 my-1 truncate type-hero font-semibold leading-none tracking-tight text-on-instrument">{value.name}</h1>
      {value.description && <p className="m-0 mt-1 type-base leading-5 text-on-instrument-muted">{value.description}</p>}
      <div className="workspace-overview-meta mt-2 flex flex-wrap gap-x-3 gap-y-1 font-code type-xs text-on-instrument-muted">
        {lastSuccessfulRefreshAt !== null && <span>Refreshed <time dateTime={new Date(lastSuccessfulRefreshAt).toISOString()}>{new Date(lastSuccessfulRefreshAt).toLocaleString()}</time></span>}
        <span>Current Core totals · {countLabel(value.accountCount, "connected account")}</span>
      </div>
      {degraded.length > 0 && <p className="workspace-overview-partial m-0 mt-2 type-sm text-on-instrument-muted"><strong className="font-normal text-on-instrument">Partial data</strong> · {degraded.join(" ")}</p>}
    </div>
    <div className="workspace-header-actions flex flex-none items-center gap-2">
      <span className="rounded-full bg-instrument-raised px-3 py-2 font-code type-sm text-on-instrument-muted">{countLabel(criticalCount, "critical issue")}</span>
      {/* The one control standing on the black header: its ring is the on-instrument ring,
          because the theme ink is black on black in the light theme. */}
      <button className="command-button inline-flex min-h-9 flex-none items-center justify-center gap-2 rounded-control bg-surface px-3 type-base font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-on-instrument" type="button" disabled={refreshing} onClick={onRefresh}>
        <RefreshCw size={14} aria-hidden="true" />{refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </div>
    <span className="workspace-overview-live absolute size-px overflow-hidden [clip-path:inset(50%)]" aria-live="polite" aria-atomic="true">{announcement}</span>
  </header>;
}
