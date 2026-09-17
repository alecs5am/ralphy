import { Window, WindowTitlebar, WINDOW_CARD } from "@/shared/ui/Window";
import { Heart } from "@/shared/ui/icons";
import type { AccountPresentation, WorkspaceMomentumPresentation } from "../lib/overview-presentation";
import { SegmentMeter } from "./WorkspaceCharts";

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

/** Counts share a scale; unavailable measures stay absent rather than becoming zero. */
export function WorkspaceEngagement({ totals }: { totals: WorkspaceMomentumPresentation["totals"] }) {
  const rows = [{ label: "Likes", value: totals.likes }, { label: "Comments", value: totals.comments }, { label: "Shares", value: totals.shares }];
  const max = Math.max(...rows.map(({ value }) => value ?? 0), 1);
  const complete = rows.every(({ value }) => value !== null);
  const interactions = rows.reduce((sum, { value }) => sum + (value ?? 0), 0);
  if (rows.every(({ value }) => value === null)) return <div className="workspace-engagement rounded-frame bg-card px-3 py-2 type-xs text-muted" role="status">No engagement reported yet.</div>;
  return <Window className="workspace-engagement min-w-0">
    <WindowTitlebar><Heart className="size-4 shrink-0 text-muted" aria-hidden="true" /><h3 className="m-0 flex-1 type-sm font-semibold">Engagement</h3><span className="font-code type-xs text-muted">{complete ? compact.format(interactions) : "Partial"}</span></WindowTitlebar>
    <div className={`${WINDOW_CARD} workspace-engagement-body gap-3 p-3`}>
      {rows.map(({ label, value }, index) => <div key={label} className="workspace-meter-row grid gap-1.5" data-channel={index}>
        <div className="flex justify-between type-xs"><span className="text-muted">{label}</span><span className="font-code tabular-nums">{value === null ? "Unavailable" : compact.format(value)}</span></div>
        <SegmentMeter value={value} max={max} label={label} />
      </div>)}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-divider pt-3 type-xs text-muted"><span>Interactions / views</span><strong className="font-display type-display font-normal leading-none text-ink">{complete && totals.views !== null && totals.views > 0 ? `${(interactions / totals.views * 100).toFixed(1)}%` : "—"}</strong></div>
    </div>
  </Window>;
}

export function WorkspaceAccountHealth({ accounts }: { accounts: AccountPresentation[] }) {
  const connected = accounts.filter((account) => account.credentialConfigured && !account.relinkRequired).length;
  const setup = accounts.length - connected;
  return <div className="workspace-account-health flex items-center gap-3 rounded-frame bg-card px-3 py-2">
    <div className="workspace-account-leds" role="img" aria-label={`${connected} of ${accounts.length} accounts connected`}>{accounts.map((account, index) => <span key={index} data-connected={account.credentialConfigured && !account.relinkRequired} />)}</div>
    <div className="flex flex-1 flex-wrap gap-x-4 gap-y-1 type-xs"><span className="text-muted"><strong className="mr-1 font-code type-lg font-medium text-ink">{connected}</strong>Connected</span><span className="text-muted"><strong className="mr-1 font-code type-lg font-medium text-ink">{setup}</strong>Need setup</span></div>
  </div>;
}
