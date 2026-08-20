import { RefreshCw } from "lucide-react";
import type {
  Availability,
  WorkspaceHeaderPresentation,
} from "./overview-presentation";

function timestampMs(value: number): number {
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function countLabel(value: Availability<number>, noun: string): string {
  if (value.status === "ready") return `${value.value} ${noun}${value.value === 1 ? "" : "s"}`;
  if (value.status === "partial") return `At least ${value.value} ${noun}${value.value === 1 ? "" : "s"}`;
  return `${noun[0]!.toUpperCase()}${noun.slice(1)} unavailable`;
}

export function WorkspaceOverviewHeader({
  value,
  criticalCount,
  refreshing,
  onRefresh,
}: {
  value: WorkspaceHeaderPresentation;
  criticalCount: Availability<number>;
  refreshing: boolean;
  onRefresh(): void;
}) {
  const updatedAt = timestampMs(value.updatedAt);
  const degraded = [value.accountCount, criticalCount]
    .filter((item) => item.status !== "ready")
    .map((item) => item.reason);
  return <header className="screen-header workspace-overview-header">
    <div>
      <div className="screen-kicker">Workspace overview</div>
      <h1>{value.name}</h1>
      {value.description && <p>{value.description}</p>}
      <div className="workspace-overview-meta">
        <span>Updated <time dateTime={new Date(updatedAt).toISOString()}>{new Date(updatedAt).toLocaleString()}</time></span>
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
  </header>;
}
