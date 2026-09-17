import { PageHeader, PageHeaderMore, PAGE_HEADER_BUTTON } from "@/shared/ui/PageHeader";
import { WorkspaceArchiveAction } from "@/shared/ui/WorkspaceArchiveAction";
import { ChartNoAxesCombined, RefreshCw } from "@/shared/ui/icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  Availability,
  WorkspaceHeaderPresentation,
} from "../lib/overview-presentation";

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
  previewControl,
  workspaceId,
}: {
  value: WorkspaceHeaderPresentation;
  criticalCount: Availability<number>;
  refreshing: boolean;
  lastSuccessfulRefreshAt: number | null;
  error: string | null;
  onRefresh(): void;
  previewControl?: ReactNode;
  workspaceId?: string;
}) {
  const [announcement, setAnnouncement] = useState("");
  const [transfer, setTransfer] = useState<{ message: string; failed: boolean } | null>(null);
  useEffect(() => setTransfer(null), [workspaceId]);
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
  return <><PageHeader title={value.name} icon={ChartNoAxesCombined} meta="Overview" description="Workspace overview">
    <PageHeaderMore label="Workspace details">
      <strong className="type-xs">{criticalCount.status === "ready" && criticalCount.value > 0 ? countLabel(criticalCount, "critical issue") : degraded.length ? "Partial data" : countLabel(value.accountCount, "account")}</strong>
      {value.description && <span className="leading-relaxed text-muted">{value.description}</span>}
      {lastSuccessfulRefreshAt !== null && <span className="text-muted">Refreshed <time dateTime={new Date(lastSuccessfulRefreshAt).toISOString()}>{new Date(lastSuccessfulRefreshAt).toLocaleString()}</time></span>}
      <span>{countLabel(value.accountCount, "account")} · {countLabel(criticalCount, "critical issue")}</span>
      {degraded.length > 0 && <span className="leading-relaxed text-muted">{degraded.join(" ")}</span>}
      {previewControl}
      {workspaceId && <WorkspaceArchiveAction workspaceId={workspaceId} onStatus={(message, failed) => setTransfer({ message, failed })} />}
    </PageHeaderMore>
    <button className={PAGE_HEADER_BUTTON} type="button" aria-label={refreshing ? "Refreshing…" : "Refresh"} title="Refresh workspace" disabled={refreshing} onClick={onRefresh}><RefreshCw size={13} aria-hidden="true" /><span className="page-header-action-label">{refreshing ? "Refreshing…" : "Refresh"}</span></button>
    <span className="workspace-overview-live sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
  </PageHeader>{transfer && <p role={transfer.failed ? "alert" : "status"} className="m-0 rounded-field bg-surface p-3 type-sm text-ink">{transfer.message}</p>}</>;
}
