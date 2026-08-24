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
  /* Handoff 13's greeting row: the identity stands on the desk, not on a widget of its own. The
     black plate this replaced read as a fifth surface between the desk and the panels below it,
     and the design gives the row no surface at all -- 29px name, a quiet sub-line, and the two
     controls on the right. */
  return <header className="screen-header workspace-overview-header relative m-0 flex min-h-0 w-full max-w-none flex-none flex-wrap items-end justify-between gap-4 px-2 pt-1 pb-1 text-ink">
    <div className="min-w-0">
      <div className="screen-kicker mb-1.5 font-code type-meta tracking-mono uppercase text-muted">Workspace overview</div>
      <h1 className="m-0 truncate type-greeting leading-none tracking-tight text-ink">{value.name}</h1>
      {value.description && <p className="m-0 mt-2 type-md leading-5 text-muted">{value.description}</p>}
      <div className="workspace-overview-meta mt-2 flex flex-wrap gap-x-3 gap-y-1 font-code type-xs text-muted">
        {lastSuccessfulRefreshAt !== null && <span>Refreshed <time dateTime={new Date(lastSuccessfulRefreshAt).toISOString()}>{new Date(lastSuccessfulRefreshAt).toLocaleString()}</time></span>}
        <span>Current Core totals · {countLabel(value.accountCount, "connected account")}</span>
      </div>
      {degraded.length > 0 && <p className="workspace-overview-partial m-0 mt-2 type-sm text-muted"><strong className="font-normal text-ink">Partial data</strong> · {degraded.join(" ")}</p>}
    </div>
    <div className="workspace-header-actions ml-auto flex flex-none items-center gap-2">
      <span className="inline-flex h-9 items-center rounded-full bg-card px-3.5 font-code type-sm text-muted">{countLabel(criticalCount, "critical issue")}</span>
      {/* The primary control on the desk is the inversion of the desk, which is the one place the
          design allows a filled button outside a black widget. */}
      <button className="command-button inline-flex h-9 flex-none items-center justify-center gap-2 rounded-full bg-desk-primary px-3.5 type-base text-desk-primary-ink disabled:opacity-60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-desk-primary-ink" type="button" disabled={refreshing} onClick={onRefresh}>
        <RefreshCw size={14} aria-hidden="true" />{refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </div>
    <span className="workspace-overview-live absolute size-px overflow-hidden [clip-path:inset(50%)]" aria-live="polite" aria-atomic="true">{announcement}</span>
  </header>;
}
