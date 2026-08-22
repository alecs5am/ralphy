import { CalendarDays, Settings } from "lucide-react";
import { useState } from "react";
import type { WorkspaceCalendarNavigationContext } from "../../state/workbench";
import { DetailDialog } from "./DetailDialog";
import type {
  AccountPresentation,
  Availability,
  WorkspaceMomentumPresentation,
  WorkspaceOverviewPresentation,
} from "./overview-presentation";

interface TrendPoint {
  label: string;
  value: number;
}

const numberFormat = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

function timestampMs(value: number): number {
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function metric(value: number | null): string {
  return value === null ? "—" : numberFormat.format(value);
}

function watchTime(value: number | null): string {
  if (value === null) return "—";
  if (value > 0 && value < 60_000) return "<1m";
  const minutes = Math.round(value / 60_000);
  return minutes < 60 ? `${minutes}m` : `${numberFormat.format(minutes / 60)}h`;
}

function handle(value: string | null): string {
  if (!value) return "Handle unavailable";
  return value.startsWith("@") ? value : `@${value}`;
}

function health(account: AccountPresentation): string {
  if (account.relinkRequired) return "Relink required";
  if (!account.credentialConfigured) return "Setup required";
  return "Connected";
}

function availabilityReason(value: Availability<unknown>, fallback: string): string {
  return value.status === "ready" ? fallback : value.reason;
}

function SectionHeading({ id, title, meta }: { id: string; title: string; meta?: string }) {
  return <header className="workspace-section-heading mb-3 flex items-center justify-between gap-3">
    <h2 id={id}>{title}</h2>
    {meta && <span>{meta}</span>}
  </header>;
}

function UnavailablePanel({ title, reason }: { title: string; reason: string }) {
  return <div className="workspace-unavailable rounded-cell bg-surface-sunken px-3 py-2 type-sm leading-5 text-muted" role="note">
    <strong>{title}</strong>
    <p>{reason}</p>
  </div>;
}

function MetricStrip({ values }: { values: WorkspaceMomentumPresentation["totals"] }) {
  const metrics: [string, string, string][] = [
    ["Publications", metric(values.publications), values.publications === null ? "Publications unavailable" : `${values.publications.toLocaleString()} publication${values.publications === 1 ? "" : "s"}`],
    ["Views", metric(values.views), values.views === null ? "Views unavailable" : `Views: ${values.views.toLocaleString()}`],
    ["Watch time", watchTime(values.watchTimeMs), values.watchTimeMs === null ? "Watch time unavailable" : `${(values.watchTimeMs / 1000).toLocaleString()} seconds watch time`],
    ["Likes", metric(values.likes), values.likes === null ? "Likes unavailable" : `${values.likes.toLocaleString()} like${values.likes === 1 ? "" : "s"}`],
    ["Comments", metric(values.comments), values.comments === null ? "Comments unavailable" : `${values.comments.toLocaleString()} comment${values.comments === 1 ? "" : "s"}`],
    ["Shares", metric(values.shares), values.shares === null ? "Shares unavailable" : `${values.shares.toLocaleString()} share${values.shares === 1 ? "" : "s"}`],
  ];
  return <dl className="workspace-metric-strip grid grid-cols-[repeat(auto-fit,minmax(124px,1fr))] gap-2 overflow-hidden rounded-cell bg-transparent">
    {metrics.map(([label, value, accessible]) => <div className="min-w-0 rounded-control bg-surface-sunken px-3 py-3" key={label}>
      <dt className="type-xs text-muted">{label}</dt>
      <dd className="mt-1 type-xl font-semibold leading-none text-ink" aria-label={accessible}>{value}</dd>
    </div>)}
  </dl>;
}

export function AccessibleTrendChart({ value }: { value: readonly TrendPoint[] }) {
  const max = Math.max(...value.map((point) => point.value), 1);
  const points = value.map((point, index) => {
    const x = value.length < 2 ? 0 : (index / (value.length - 1)) * 100;
    const y = 40 - (point.value / max) * 40;
    return `${x},${y}`;
  }).join(" ");
  return <div className="workspace-trend">
    <svg viewBox="0 0 100 40" role="img">
      <title>Workspace performance trend</title>
      <desc>Values over the selected reporting period. Exact values follow in a table.</desc>
      <polyline points={points} vectorEffect="non-scaling-stroke" />
    </svg>
    <table>
      <caption>Workspace performance trend values</caption>
      <thead><tr><th scope="col">Period</th><th scope="col">Value</th></tr></thead>
      <tbody>{value.map((point) => <tr key={point.label}><th scope="row">{point.label}</th><td>{point.value.toLocaleString()}</td></tr>)}</tbody>
    </table>
  </div>;
}

export function WorkspaceMomentum({ value }: { value: WorkspaceMomentumPresentation }) {
  return <section className="workspace-overview-section workspace-momentum col-span-12 m-0 min-w-0 max-w-none rounded-panel bg-surface p-4" aria-labelledby="workspace-momentum-title">
    <SectionHeading id="workspace-momentum-title" title="Workspace momentum" meta={value.periodLabel} />
    <MetricStrip values={value.totals} />
    {(value.trend.status === "ready" || value.trend.status === "partial") && <AccessibleTrendChart value={value.trend.value} />}
    {value.trend.status === "partial" && <UnavailablePanel title="Partial trend data" reason={value.trend.reason} />}
    {(value.trend.status === "empty" || value.trend.status === "unavailable") && <UnavailablePanel title="Trend unavailable" reason={value.trend.reason} />}
  </section>;
}

function publicationCount(value: Availability<number>): string {
  if (value.status === "ready") return `${value.value} publication${value.value === 1 ? "" : "s"}`;
  if (value.status === "partial") return `At least ${value.value} publication${value.value === 1 ? "" : "s"}`;
  return "Publication count unavailable";
}

export function AccountPortfolio({
  value,
  onSelect,
}: {
  value: Availability<AccountPresentation[]>;
  onSelect(account: AccountPresentation): void;
}) {
  const accounts = value.status === "ready" || value.status === "partial" ? value.value : [];
  return <section className="workspace-overview-section workspace-accounts col-span-12 m-0 min-w-0 max-w-none rounded-panel bg-surface p-4 @min-[860px]/instrument-desk:col-span-6" aria-labelledby="workspace-accounts-title">
    <SectionHeading id="workspace-accounts-title" title="Accounts" meta={accounts.length ? `${accounts.length} returned by Core` : undefined} />
    {value.status === "partial" && <UnavailablePanel title="Partial account data" reason={value.reason} />}
    {(value.status === "empty" || value.status === "unavailable") && <UnavailablePanel title="Accounts unavailable" reason={value.reason} />}
    {value.status === "ready" && accounts.length === 0 && <UnavailablePanel title="No connected accounts" reason="No connected accounts were returned by Core." />}
    {accounts.length > 0 && <div className="account-portfolio-wrap">
      <div className="account-portfolio" aria-label="Account portfolio">
        {accounts.map((account) => <button id={`workspace-account-${account.id}`} className="account-card min-h-0 rounded-cell bg-surface-sunken p-3 text-left type-sm text-ink" type="button" key={account.id} onClick={() => onSelect(account)}>
          <span className="account-card-heading"><strong>{account.platform}</strong><span className={`account-health${account.relinkRequired || !account.credentialConfigured ? " is-warning" : ""}`}>{health(account)}</span></span>
          <b>{handle(account.username)}</b>
          {account.displayName && <small>{account.displayName}</small>}
          <span className="account-card-facts">
            <span>{publicationCount(account.publicationCount)}</span>
            <span>Last Core update <time dateTime={new Date(timestampMs(account.updatedAt)).toISOString()}>{new Date(timestampMs(account.updatedAt)).toLocaleString()}</time></span>
          </span>
          <span className="account-metric-unavailable">{availabilityReason(account.metrics, "No provider metrics were returned by Core.")}</span>
        </button>)}
      </div>
    </div>}
  </section>;
}

function DetailUnavailable({ title, reason }: { title: string; reason: string }) {
  return <section className="account-detail-section">
    <h3>{title}</h3>
    <UnavailablePanel title="Unavailable" reason={reason} />
  </section>;
}

export function AccountDetailDialog({
  account,
  onOpenChange,
  onOpenCalendar,
}: {
  account: AccountPresentation | null;
  onOpenChange(open: boolean): void;
  onOpenCalendar(context: WorkspaceCalendarNavigationContext, returnFocusId: string): void;
}) {
  return <DetailDialog
    id="workspace-account-detail"
    open={account !== null}
    title={account && (account.username ? handle(account.username) : account.displayName ?? `${account.platform} account`)}
    description={account && `${account.platform} account · ${health(account)}`}
    closeLabel="Close account details"
    footer={account && <>
      <span>
        <button type="button" className="command-button" onClick={() => onOpenCalendar({
          label: account.displayName ?? handle(account.username),
          accountId: account.id,
          accountLabel: account.username ? handle(account.username) : account.displayName ?? "Handle unavailable",
        }, `workspace-account-${account.id}`)}><CalendarDays aria-hidden="true" />Open Calendar</button>
        <small>Opens the workspace Calendar; filtering by account is not available yet.</small>
      </span>
      <span>
        <button type="button" className="command-button" disabled><Settings aria-hidden="true" />{account.relinkRequired ? "Relink account" : "Manage account"}</button>
        <small>Account management is not available from the current desktop contract.</small>
      </span>
    </>}
    onOpenChange={onOpenChange}
  >
    {account && <>
      <DetailUnavailable title="Performance" reason={availabilityReason(account.metrics, "No provider metrics were returned by Core.")} />
      <DetailUnavailable title="Top Units" reason="Top Units are not available from the current Core contract." />
      <DetailUnavailable title="Upcoming" reason="Upcoming content is not available by account from the current Core contract." />
      <DetailUnavailable title="Recent publication failures" reason="Publication failures are not available by account from the current Core contract." />
      <section className="account-detail-section">
        <h3>Health</h3>
        <dl className="account-health-list">
          <div><dt>Handle</dt><dd>{handle(account.username)}</dd></div>
          <div><dt>Link status</dt><dd>{health(account)}</dd></div>
          <div><dt>Credentials</dt><dd>{account.credentialConfigured ? "Configured" : "Not configured"}</dd></div>
          <div><dt>Publications</dt><dd>{publicationCount(account.publicationCount)}</dd></div>
        </dl>
      </section>
      <section className="account-detail-section">
        <h3>Data freshness</h3>
        <p>Core account record updated <time dateTime={new Date(timestampMs(account.updatedAt)).toISOString()}>{new Date(timestampMs(account.updatedAt)).toLocaleString()}</time>.</p>
        <p>Provider analytics freshness is unavailable from the current Core contract.</p>
      </section>
    </>}
  </DetailDialog>;
}

export function WorkspacePerformance({
  value,
  onOpenCalendar,
}: {
  value: Pick<WorkspaceOverviewPresentation, "momentum" | "accounts">;
  onOpenCalendar(context: WorkspaceCalendarNavigationContext, returnFocusId: string): void;
}) {
  const [selectedAccount, setSelectedAccount] = useState<AccountPresentation | null>(null);
  return <>
    <WorkspaceMomentum value={value.momentum} />
    <AccountPortfolio value={value.accounts} onSelect={setSelectedAccount} />
    <AccountDetailDialog account={selectedAccount} onOpenChange={(open) => { if (!open) setSelectedAccount(null); }} onOpenCalendar={onOpenCalendar} />
  </>;
}
