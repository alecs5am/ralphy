import { CalendarDays, ChartNoAxesCombined, Radio, Settings } from "lucide-react";
import { useState } from "react";
import { SocialIcon } from "@/shared/ui/SocialIcon";
import { Window } from "@/shared/ui/Window";
import { OverviewHeading } from "./OverviewHeading";
import { AccessibleTrendChart } from "./WorkspaceCharts";
export { AccessibleTrendChart } from "./WorkspaceCharts";
import { WorkspaceAccountHealth, WorkspaceEngagement } from "./WorkspaceEngagement";
import type { WorkspaceCalendarNavigationContext } from "@/shared/model/workbench";
import { DetailDialog } from "./DetailDialog";
import {
  DRAWER_ACTION,
  DRAWER_CELL,
  DRAWER_CELL_COPY,
  DRAWER_CELL_TITLE,
  DRAWER_FOOTER_NOTE,
  DRAWER_FOOTER_ROW,
  DRAWER_GLYPH,
  PLATE,
  PLATE_COPY,
  PLATE_TITLE,
  SECTION,
} from "../lib/overview-chrome";
import type {
  AccountPresentation,
  Availability,
  WorkspaceMomentumPresentation,
  WorkspaceOverviewPresentation,
} from "../lib/overview-presentation";

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



function UnavailablePanel({ title, reason }: { title: string; reason: string }) {
  return <div className={PLATE} role="note">
    <strong className={PLATE_TITLE}>{title}</strong>
    <p className={PLATE_COPY}>{reason}</p>
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
  return <dl className="workspace-metric-strip m-0 overflow-hidden rounded-frame bg-card">
    {metrics.map(([label, value, accessible], index) => <div className="workspace-metric min-w-0 px-3 py-3" key={label}>
      <span className="workspace-metric-index font-code type-mono-xs text-muted" aria-hidden="true">0{index + 1}</span>
      <dt className="type-sm text-muted">{label}</dt>
      <dd className="m-0 mt-2 type-display font-medium tracking-tight tabular-nums leading-none text-ink" aria-label={accessible}>{value}</dd>
    </div>)}
  </dl>;
}



export function WorkspaceMomentum({ value }: { value: WorkspaceMomentumPresentation }) {
  return <Window className="workspace-overview-section workspace-momentum col-span-12 gap-1 text-ink" role="region" aria-labelledby="workspace-momentum-title">
    <OverviewHeading id="workspace-momentum-title" title="Workspace momentum" icon={ChartNoAxesCombined} meta={value.periodLabel} />
    <MetricStrip values={value.totals} />
    <div className="workspace-performance-charts">
    {(value.trend.status === "ready" || value.trend.status === "partial") && <AccessibleTrendChart value={value.trend.value} />}
    <WorkspaceEngagement totals={value.totals} />
    </div>
    {value.trend.status === "partial" && <UnavailablePanel title="Partial trend data" reason={value.trend.reason} />}
    {(value.trend.status === "empty" || value.trend.status === "unavailable") && <details className="px-2 py-1 type-sm text-muted"><summary className="cursor-pointer">Trend unavailable · reporting history not connected</summary><p className="mt-2 type-xs">{value.trend.reason}</p></details>}
  </Window>;
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
  return <section className={`${SECTION} workspace-accounts`} aria-labelledby="workspace-accounts-title">
    <OverviewHeading id="workspace-accounts-title" title="Accounts" icon={Radio} meta={accounts.length ? `${accounts.length} channels` : undefined} />
    {value.status === "partial" && <UnavailablePanel title="Partial account data" reason={value.reason} />}
    {(value.status === "empty" || value.status === "unavailable") && <UnavailablePanel title="Accounts unavailable" reason={value.reason} />}
    {value.status === "ready" && accounts.length === 0 && <UnavailablePanel title="No connected accounts" reason="No connected accounts were returned by Core." />}
    {accounts.length > 0 && <WorkspaceAccountHealth accounts={accounts} />}
    {accounts.length > 0 && <div className="account-portfolio-wrap @container/account-portfolio">
      {/* Four accounts across, then two, then one. The count is read against the portfolio's
          own width, so a detail drawer or the chat rail re-flows it with no viewport rule. */}
      <div className="account-portfolio" aria-label="Account portfolio">
        {accounts.map((account) => {
          const warning = account.relinkRequired || !account.credentialConfigured;
          return <button id={`workspace-account-${account.id}`} className="account-card flex min-h-0 min-w-0 flex-col items-stretch gap-1.5 rounded-frame bg-card px-3 py-2 text-left type-sm text-ink hover:bg-row-hover" type="button" key={account.id} onClick={() => onSelect(account)}>
            <span className="account-card-heading flex items-center justify-between gap-2">
              <strong className="flex min-w-0 items-center gap-2 truncate type-sm font-normal capitalize text-muted"><SocialIcon platform={account.platform} className="size-5 flex-none text-ink" />{account.platform}</strong>
              <span className={`account-health${warning ? " is-warning" : ""} rounded-control px-2 py-0.5 type-xs whitespace-nowrap ${warning ? "bg-field text-muted" : "bg-field text-ink"}`}>{health(account)}</span>
            </span>
            <b className="truncate type-sm font-medium text-ink">{handle(account.username)}</b>
            {account.displayName && <small className={account.username ? "sr-only" : "truncate type-xs text-muted"}>{account.displayName}</small>}
            <span className="account-card-facts mt-auto flex flex-wrap gap-x-3 gap-y-1 font-code type-xs text-muted">
              <span>{publicationCount(account.publicationCount)}</span>
              <span>Updated <time dateTime={new Date(timestampMs(account.updatedAt)).toISOString()}>{new Date(timestampMs(account.updatedAt)).toLocaleDateString()}</time></span>
            </span>
          </button>;
        })}
      </div>
    </div>}
    {accounts.some((account) => account.metrics.status === "unavailable") && <details className="px-2 py-1 type-xs text-muted"><summary className="cursor-pointer">About channel analytics</summary><p className="mt-2">Account metrics are not available from the current Core contract.</p></details>}
  </section>;
}

function DetailUnavailable({ title, reason }: { title: string; reason: string }) {
  return <section className={DRAWER_CELL}>
    <h3 className={DRAWER_CELL_TITLE}>{title}</h3>
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
      <span className={DRAWER_FOOTER_ROW}>
        <button type="button" className={DRAWER_ACTION} onClick={() => onOpenCalendar({
          label: account.displayName ?? handle(account.username),
          accountId: account.id,
          accountLabel: account.username ? handle(account.username) : account.displayName ?? "Handle unavailable",
        }, `workspace-account-${account.id}`)}><CalendarDays className={DRAWER_GLYPH} aria-hidden="true" />Open Calendar</button>
        <small className={DRAWER_FOOTER_NOTE}>Opens the workspace Calendar; filtering by account is not available yet.</small>
      </span>
      <span className={DRAWER_FOOTER_ROW}>
        <button type="button" className={DRAWER_ACTION} disabled><Settings className={DRAWER_GLYPH} aria-hidden="true" />{account.relinkRequired ? "Relink account" : "Manage account"}</button>
        <small className={DRAWER_FOOTER_NOTE}>Account management is not available from the current desktop contract.</small>
      </span>
    </>}
    onOpenChange={onOpenChange}
  >
    {account && <>
      <DetailUnavailable title="Performance" reason={availabilityReason(account.metrics, "No provider metrics were returned by Core.")} />
      <DetailUnavailable title="Top Units" reason="Top Units are not available from the current Core contract." />
      <DetailUnavailable title="Upcoming" reason="Upcoming content is not available by account from the current Core contract." />
      <DetailUnavailable title="Recent publication failures" reason="Publication failures are not available by account from the current Core contract." />
      <section className={DRAWER_CELL}>
        <h3 className={DRAWER_CELL_TITLE}>Health</h3>
        <dl className="account-health-list m-0">
          {([
            ["Handle", handle(account.username)],
            ["Link status", health(account)],
            ["Credentials", account.credentialConfigured ? "Configured" : "Not configured"],
            ["Publications", publicationCount(account.publicationCount)],
          ] as const).map(([label, fact]) => <div className="flex justify-between gap-4 py-2 type-xs" key={label}>
            <dt className="text-muted">{label}</dt><dd className="m-0 font-code text-right text-muted">{fact}</dd>
          </div>)}
        </dl>
      </section>
      <section className={DRAWER_CELL}>
        <h3 className={DRAWER_CELL_TITLE}>Data freshness</h3>
        <p className={DRAWER_CELL_COPY}>Core account record updated <time dateTime={new Date(timestampMs(account.updatedAt)).toISOString()}>{new Date(timestampMs(account.updatedAt)).toLocaleString()}</time>.</p>
        <p className={DRAWER_CELL_COPY}>Provider analytics freshness is unavailable from the current Core contract.</p>
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
