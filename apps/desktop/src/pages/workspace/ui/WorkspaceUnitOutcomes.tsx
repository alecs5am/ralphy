import { ArrowDownRight, ArrowUpRight, Boxes, ChartNoAxesCombined } from "@/shared/ui/icons";
import { useId, useState } from "react";
import { SocialIcon } from "@/shared/ui/SocialIcon";
import { Window } from "@/shared/ui/Window";
import { Modal } from "@/shared/ui/Modal";
import type { Availability, UnitChannelPerformance, UnitOutcomeGroups, UnitOutcomePresentation } from "../lib/overview-presentation";
import { DRAWER_ACTION, PLATE, PLATE_COPY } from "../lib/overview-chrome";
import { OverviewHeading } from "./OverviewHeading";

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const CELL = "px-2 py-2 text-right font-code type-xs tabular-nums";
const DETAIL_SECTION = "grid gap-2";
const DETAIL_TITLE = "m-0 type-sm font-semibold text-ink";
const DETAIL_COPY = "m-0 type-xs leading-5 text-muted";
const CHANNELS = new Map([["instagram", "Instagram"], ["tiktok", "TikTok"], ["youtube", "YouTube"]]);

function change(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous * 100 : current === 0 ? 0 : null;
}

function signed(value: number | null): string {
  return value === null ? "New" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(0)}%`;
}

function totals(channels: UnitChannelPerformance[]) {
  return channels.reduce((sum, channel) => ({ views: sum.views + channel.views, previous: sum.previous + channel.previousViews }), { views: 0, previous: 0 });
}

/** Both directions share the same ±100% scale; the exact change stays beside the meter. */
function ChangeMeter({ value }: { value: number | null }) {
  const id = useId();
  const width = Math.min(100, Math.abs(value ?? 0));
  return <svg className="workspace-change-meter" viewBox="0 0 204 12" preserveAspectRatio="none" aria-hidden="true">
    <defs><pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="currentColor" /></pattern></defs>
    <rect x="2" width="200" height="12" fill={`url(#${id})`} opacity=".12" />
    <rect x={value !== null && value < 0 ? 102 - width : 102} width={width} height="12" fill={`url(#${id})`} />
    <line x1="102" x2="102" y1="0" y2="12" className="stroke-muted" />
  </svg>;
}

function ChannelResults({ channels, exact = false }: { channels: UnitChannelPerformance[]; exact?: boolean }) {
  return <table className="workspace-channel-results w-full border-collapse text-ink">
    <caption className="sr-only">Channel performance, compared with the previous 7 days. Engagement is interactions divided by views; completion is completed plays divided by video starts.</caption>
    <thead className="text-muted"><tr><th className="px-2 py-2 text-left type-xs font-normal" scope="col">Channel</th><th className={`${CELL} font-normal`} scope="col">Views</th><th className={`${CELL} font-normal`} scope="col">Change</th><th className={`${CELL} font-normal`} scope="col" title="Interactions divided by views">Eng.</th><th className={`${CELL} font-normal`} scope="col" title="Completed plays divided by video starts">Finish</th></tr></thead>
    <tbody>{channels.map((channel) => {
      const delta = change(channel.views, channel.previousViews);
      return <tr key={channel.platform} data-direction={channel.views >= channel.previousViews ? "up" : "down"}>
        <th className="workspace-channel-name px-2 py-2 text-left type-xs font-medium" scope="row"><span className="flex items-center gap-1.5"><SocialIcon platform={channel.platform} className="size-3.5 shrink-0" />{CHANNELS.get(channel.platform) ?? channel.platform}</span><ChangeMeter value={delta} /></th>
        <td className={CELL}>{exact ? channel.views.toLocaleString() : compact.format(channel.views)}{exact && <small className="block text-muted">from {channel.previousViews.toLocaleString()}</small>}</td>
        <td className={`${CELL} workspace-result-change font-medium`}>{signed(delta)}</td>
        <td className={`${CELL} text-muted`}>{channel.engagementRate.toFixed(1)}%</td>
        <td className={`${CELL} text-muted`}>{channel.completionRate}%</td>
      </tr>;
    })}</tbody>
  </table>;
}

function OutcomeCard({ value, onSelect }: { value: UnitOutcomePresentation; onSelect(): void }) {
  const performance = value.performance;
  const result = totals(performance?.channels ?? []);
  const delta = change(result.views, result.previous);
  const rising = result.views >= result.previous;
  const Direction = rising ? ArrowUpRight : ArrowDownRight;
  return <article className="workspace-unit-result flex min-w-0 flex-col gap-3 rounded-frame bg-card p-3" data-direction={rising ? "up" : "down"}>
    <header className="flex items-center gap-2"><Boxes className="size-4 shrink-0 text-muted" aria-hidden="true" /><div className="min-w-0 flex-1"><h3 className="m-0 truncate type-sm font-semibold text-ink">{value.title}</h3><span className="type-xs text-muted">{value.projectTitle} · {value.revisionLabel}</span></div>{performance?.sample && <span className="font-code type-xs text-muted">SAMPLE</span>}</header>
    {performance ? <>
      <div className="flex items-end justify-between gap-2"><div><span className="font-code type-xs text-muted">{performance.windowLabel} · Views</span><strong className="mt-1 block type-display font-medium leading-none tabular-nums text-ink">{compact.format(result.views)}</strong></div><div className="text-right"><strong className="workspace-result-change flex items-center justify-end gap-1 type-xl font-semibold tabular-nums"><Direction className="size-5" aria-hidden="true" />{signed(delta)}</strong><small className="font-code type-xs text-muted">from {compact.format(result.previous)}</small></div></div>
      <ChannelResults channels={performance.channels} />
      <p className="m-0 type-xs leading-5 text-muted">{performance.observation}</p>
    </> : <p className="m-0 type-xs text-muted">Comparable metrics unavailable</p>}
    <button className="mt-auto inline-flex items-center justify-between rounded-control bg-field px-3 py-2 type-xs font-medium text-ink hover:bg-row-hover" id={`workspace-outcome-${value.id}`} type="button" aria-label={`Review ${value.title} performance`} onClick={onSelect}>Review result <ArrowUpRight className="size-3.5" aria-hidden="true" /></button>
  </article>;
}

function UnitOutcomeDetailDialog({ value, onOpenChange, onOpenUnit }: {
  value: UnitOutcomePresentation | null;
  onOpenChange(open: boolean): void;
  onOpenUnit(projectId: string, unitId: string, unitLabel: string, returnFocusId: string): void;
}) {
  const performance = value?.performance;
  return <Modal id="workspace-unit-outcome-detail" open={value !== null} className="unit-outcome-dialog" size="h-fit w-workspace-outcome-detail" eyebrow={<Boxes className="size-4 shrink-0 text-muted" aria-hidden="true" />} title={value?.title} titleClassName="m-0 min-w-0 flex-1 truncate type-base font-semibold text-ink" description={value && `Unit outcome detail · ${value.projectTitle} · ${value.revisionLabel}${performance?.sample ? " · Demo analytics" : ""}`} descriptionPlacement="body" descriptionClassName="m-0 type-xs text-muted" bodyClassName="gap-4 overflow-y-auto p-4" closeLabel="Close Unit outcome detail" onOpenChange={onOpenChange}
    footer={value?.unitId && value.projectId && <button type="button" className={DRAWER_ACTION} onClick={() => onOpenUnit(value.projectId, value.unitId, value.title, `workspace-outcome-${value.id}`)}>Open Unit</button>}>
    {performance ? <>
      <section className={DETAIL_SECTION}><h3 className={DETAIL_TITLE}>Result</h3><p className={DETAIL_COPY}>{performance.observation}</p><ChannelResults channels={performance.channels} exact /></section>
      <section className={DETAIL_SECTION}><h3 className={DETAIL_TITLE}>Observation window</h3><p className={DETAIL_COPY}>{performance.windowLabel} compared with {performance.baseline.toLowerCase()}. View change is calculated separately for each channel. Dither meters use a shared ±100% scale.</p></section>
      <section className={DETAIL_SECTION}><h3 className={DETAIL_TITLE}>Benchmark method</h3><p className={DETAIL_COPY}>Percentage change = (current views − previous views) / previous views. Engagement = interactions / views. Finish = completed plays / video starts.</p>{performance.sample && <p className={DETAIL_COPY}>Sample analytics for UX Testing Lab. These values are illustrative and are not saved to the workspace.</p>}</section>
    </> : ([
      ["Result", "Normalized result"], ["Benchmark method", "Benchmark method"], ["Child publications", "Child publication metrics"], ["Observation window", "Observation windows"], ["Destination", "Destination outcomes"],
    ]).map(([title, subject]) => <section className={DETAIL_SECTION} key={title}><h3 className={DETAIL_TITLE}>{title}</h3><p className={DETAIL_COPY}>{subject} {title === "Result" || title === "Benchmark method" ? "has" : "have"} not been reported.</p></section>)}
  </Modal>;
}

export function WorkspaceUnitOutcomes({ value, onOpenUnit }: { value: Availability<UnitOutcomeGroups>; onOpenUnit(projectId: string, unitId: string, unitLabel: string, returnFocusId: string): void }) {
  const [selected, setSelected] = useState<UnitOutcomePresentation | null>(null);
  if (value.status !== "ready" && value.status !== "partial") return null;
  const outcomes = [...value.value.top, ...value.value.emerging, ...value.value.learningOpportunities];
  if (outcomes.length === 0) return null;
  const sample = outcomes.every((outcome) => outcome.performance?.sample);
  return <Window className="workspace-overview-section workspace-unit-outcomes col-span-12 gap-1 text-ink" role="region" aria-labelledby="workspace-unit-outcomes-title">
    <OverviewHeading id="workspace-unit-outcomes-title" title="Unit performance" icon={ChartNoAxesCombined} meta={sample ? "Demo · Sample analytics" : "Comparable results"} />
    {sample && <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1 type-xs text-muted"><span>Last 7 days versus previous 7 days</span><span className="font-code">← Decline · Gain →</span></div>}
    {value.status === "partial" && <div className={PLATE}><p className={PLATE_COPY}>{value.reason}</p></div>}
    <div className="workspace-unit-result-grid grid gap-1">{outcomes.map((outcome) => <OutcomeCard key={outcome.id} value={outcome} onSelect={() => setSelected(outcome)} />)}</div>
    <UnitOutcomeDetailDialog value={selected} onOpenChange={(open) => { if (!open) setSelected(null); }} onOpenUnit={onOpenUnit} />
  </Window>;
}
