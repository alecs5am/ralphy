import { useState } from "react";
import type { WorkspacePage } from "../../state/workbench";
import { DetailDialog } from "./DetailDialog";
import {
  ACTION_QUIET,
  DRAWER_ACTION,
  DRAWER_CELL,
  DRAWER_CELL_COPY,
  DRAWER_CELL_TITLE,
  PLATE,
  PLATE_COPY,
  PLATE_TITLE,
  SECTION_HALF,
  SECTION_HEADING,
  SECTION_META,
  SECTION_TITLE,
} from "./overview-chrome";
import type {
  Availability,
  ProductionEfficiencyMetricId,
  ProductionEfficiencyPresentation,
  WorkspaceInsightPresentation,
  WorkspaceInsightUnitReference,
  WorkspaceOverviewPresentation,
} from "./overview-presentation";

interface Props {
  value: Pick<WorkspaceOverviewPresentation, "insights" | "efficiency">;
  onOpenPage(page: WorkspacePage, returnFocusId: string): void;
}

const efficiencySlots: { id: ProductionEfficiencyMetricId; label: string }[] = [
  { id: "production-time", label: "Median production time" },
  { id: "revisions", label: "Median revisions before selection" },
  { id: "cost", label: "Generation cost per published Unit" },
  { id: "adaptation", label: "Multi-platform adaptation" },
  { id: "asset-reuse", label: "Approved Shared Library reuse" },
  { id: "conversion", label: "Production-to-publication conversion" },
];

/* An evidence block inside a card: a sub-label over a short list or a reason. */
const REFERENCE_TITLE = "m-0 type-xs font-normal text-ink";
const REFERENCE_LIST = "m-0 mt-1 pl-4 type-xs leading-copy text-muted";
const REFERENCE_NOTE = "m-0 mt-1 type-xs text-muted";
const FACT_ROW = "grid grid-cols-(--workspace-fact-columns) gap-2 pt-1 type-xs";
const FACT_LABEL = "text-muted";
const FACT_VALUE = "m-0 text-muted";
/* The three drawer cells that carry an evidence list keep the drawer's own heading step. */
const DRAWER_EVIDENCE_CELL = `${DRAWER_CELL} [&_h3]:mb-2 [&_h3]:type-base`;

function UnavailablePanel({ title, reason }: { title: string; reason: string }) {
  return <div className={PLATE} role="note"><strong className={PLATE_TITLE}>{title}</strong><p className={PLATE_COPY}>{reason}</p></div>;
}

function strengthLabel(value: WorkspaceInsightPresentation["evidenceStrength"]): string {
  return `${value[0]!.toUpperCase()}${value.slice(1)} evidence`;
}

function ReferenceList({ title, values }: { title: string; values: WorkspaceInsightUnitReference[] }) {
  return <section className="workspace-insight-references"><h3 className={REFERENCE_TITLE}>{title}</h3>
    {values.length > 0
      ? <ul className={REFERENCE_LIST}>{values.map((value) => <li key={value.id}>{value.label}</li>)}</ul>
      : <p className={REFERENCE_NOTE}>No {title.toLowerCase()} were returned.</p>}
  </section>;
}

function CaveatList({ values }: { values: string[] }) {
  return <section className="workspace-insight-references"><h3 className={REFERENCE_TITLE}>Caveats</h3>
    {values.length > 0 ? <ul className={REFERENCE_LIST}>{values.map((value, index) => <li key={`${value}:${index}`}>{value}</li>)}</ul> : <p className={REFERENCE_NOTE}>No caveats were returned.</p>}
  </section>;
}

function InsightCard({ value, onReview }: { value: WorkspaceInsightPresentation; onReview(): void }) {
  return <li className={`workspace-insight-card is-${value.evidenceStrength}`}>
    <article className="grid h-full gap-3 rounded-cell bg-surface-sunken p-4">
      <header className="grid grid-cols-(--workspace-row-columns) items-start gap-2 type-xs text-muted">
        <span>{value.dimension}</span><strong className="type-xs font-normal text-muted">{strengthLabel(value.evidenceStrength)}</strong>
      </header>
      <h3 className="m-0 type-base font-normal leading-copy text-ink">{value.observation}</h3>
      <dl className="workspace-insight-facts m-0 grid gap-1">
        <div className={FACT_ROW}><dt className={FACT_LABEL}>Scope</dt><dd className={FACT_VALUE}>{value.platform} · {value.account}</dd></div>
        <div className={FACT_ROW}><dt className={FACT_LABEL}>Reporting window</dt><dd className={FACT_VALUE}>{value.reportingWindow}</dd></div>
        <div className={FACT_ROW}><dt className={FACT_LABEL}>Sample size</dt><dd className={FACT_VALUE}>{value.sampleSize} comparable Units</dd></div>
        <div className={FACT_ROW}><dt className={FACT_LABEL}>Baseline</dt><dd className={FACT_VALUE}>{value.baseline}</dd></div>
        <div className={FACT_ROW}><dt className={FACT_LABEL}>Evidence strength</dt><dd className={FACT_VALUE}>{strengthLabel(value.evidenceStrength)}</dd></div>
      </dl>
      <div className="workspace-insight-evidence grid gap-2">
        <ReferenceList title="Supporting Units" values={value.supportingUnits} />
        <ReferenceList title="Counterexamples" values={value.counterexamples} />
        <CaveatList values={value.caveats} />
      </div>
      <button className={`${ACTION_QUIET} mt-auto justify-self-start`} id={`workspace-insight-${value.id}`} type="button" onClick={onReview}>Review evidence</button>
    </article>
  </li>;
}

function EvidenceState({ value, onReview }: {
  value: Availability<WorkspaceInsightPresentation[]>;
  onReview(value: WorkspaceInsightPresentation, returnFocusId: string): void;
}) {
  if (value.status !== "ready" && value.status !== "partial") {
    return <UnavailablePanel title="More comparable publications are needed" reason={value.reason} />;
  }
  if (value.value.length === 0) {
    return <UnavailablePanel title="More comparable publications are needed" reason="No evidence-backed insights were returned." />;
  }
  return <>
    {value.status === "partial" && <UnavailablePanel title="Partial evidence" reason={value.reason} />}
    {/* Card count follows the space the section has: no breakpoint names it. */}
    <ul className="workspace-insight-list m-0 grid list-none grid-cols-(--workspace-insight-columns) gap-3 p-0">{value.value.map((insight) => <InsightCard key={insight.id} value={insight} onReview={() => onReview(insight, `workspace-insight-${insight.id}`)} />)}</ul>
  </>;
}

function LearnedState({ value, onReview, onOpenMemory }: {
  value: Availability<WorkspaceInsightPresentation[]>;
  onReview(value: WorkspaceInsightPresentation, returnFocusId: string): void;
  onOpenMemory(returnFocusId: string): void;
}) {
  if (value.status !== "ready" && value.status !== "partial") {
    return <UnavailablePanel title="No proposed learning without evidence" reason={value.reason} />;
  }
  const supported = value.value.filter((insight) => insight.evidenceStrength !== "insufficient");
  if (supported.length === 0) {
    return <UnavailablePanel title="No proposed learning without evidence" reason="No supported learnings were returned." />;
  }
  return <ul className="workspace-learning-list m-0 grid list-none gap-2 p-0">{supported.map((insight) => {
    const reviewId = `workspace-learning-review-${insight.id}`;
    return <li className="grid h-auto grid-cols-(--workspace-row-columns) items-center gap-3 rounded-cell bg-surface-sunken p-4 @max-workspace-row/main-region:grid-cols-1" key={insight.id}>
    <span className="workspace-learning-state col-span-full type-xs font-normal text-muted">Proposed · {strengthLabel(insight.evidenceStrength)}</span>
    <p className="m-0 type-base leading-5 text-muted">{insight.observation}</p>
    <div className="flex flex-wrap justify-end gap-2 @max-workspace-row/main-region:justify-start">
      <button className={ACTION_QUIET} id={reviewId} type="button" onClick={() => onReview(insight, reviewId)}>Review evidence</button>
      {insight.memoryAction.status === "ready" && <button className={ACTION_QUIET} id={`workspace-learning-memory-${insight.id}`} type="button" onClick={() => onOpenMemory(`workspace-learning-memory-${insight.id}`)}>{insight.memoryAction.value.label}</button>}
    </div>
  </li>;
  })}</ul>;
}

function EvidenceDetailDialog({ value, onOpenChange, onOpenMemory }: {
  value: WorkspaceInsightPresentation | null;
  onOpenChange(open: boolean): void;
  onOpenMemory(): void;
}) {
  return <DetailDialog
    id="workspace-evidence-detail"
    open={value !== null}
    className="workspace-evidence-dialog"
    title={value?.observation}
    description={value && `${value.platform} · ${value.account} · ${strengthLabel(value.evidenceStrength)}`}
    closeLabel="Close evidence detail"
    onOpenChange={onOpenChange}
  >
    {value && <>
      <section className={DRAWER_CELL}><h3 className={DRAWER_CELL_TITLE}>Method and sample</h3><p className={DRAWER_CELL_COPY}>{value.method}</p><dl className="workspace-insight-facts m-0 grid gap-1"><div className={FACT_ROW}><dt className={FACT_LABEL}>Scope</dt><dd className={FACT_VALUE}>{value.platform} · {value.account}</dd></div><div className={FACT_ROW}><dt className={FACT_LABEL}>Reporting window</dt><dd className={FACT_VALUE}>{value.reportingWindow}</dd></div><div className={FACT_ROW}><dt className={FACT_LABEL}>Sample size</dt><dd className={FACT_VALUE}>{value.sampleSize} comparable Units</dd></div><div className={FACT_ROW}><dt className={FACT_LABEL}>Baseline</dt><dd className={FACT_VALUE}>{value.baseline}</dd></div></dl></section>
      <section className={DRAWER_CELL}><h3 className={DRAWER_CELL_TITLE}>Median comparison</h3><p className={DRAWER_CELL_COPY}>{value.medianComparison}</p></section>
      <div className={DRAWER_EVIDENCE_CELL}><ReferenceList title="Supporting Units" values={value.supportingUnits} /></div>
      <div className={DRAWER_EVIDENCE_CELL}><ReferenceList title="Counterexamples" values={value.counterexamples} /></div>
      <div className={DRAWER_EVIDENCE_CELL}><CaveatList values={value.caveats} /></div>
      <section className={DRAWER_CELL}><h3 className={DRAWER_CELL_TITLE}>Memory action</h3>
        {value.memoryAction.status === "ready"
          ? <button type="button" className={DRAWER_ACTION} onClick={onOpenMemory}>{value.memoryAction.value.label}</button>
          : <UnavailablePanel title="Memory action unavailable" reason={value.memoryAction.reason} />}
      </section>
    </>}
  </DetailDialog>;
}

function metricValue(
  value: Availability<ProductionEfficiencyPresentation>,
  id: ProductionEfficiencyMetricId,
): Availability<string> {
  if (value.status !== "ready" && value.status !== "partial") return { status: value.status, reason: value.reason };
  return value.value.metrics.find((metric) => metric.id === id)?.value
    ?? { status: "unavailable", reason: "Core did not return this bounded metric." };
}

function ProductionEfficiency({ value, onOpenShared }: {
  value: Availability<ProductionEfficiencyPresentation>;
  onOpenShared(): void;
}) {
  const presentation = value.status === "ready" || value.status === "partial" ? value.value : null;
  return <section className={`${SECTION_HALF} workspace-production-efficiency`} aria-labelledby="workspace-production-efficiency-title">
    <header className={SECTION_HEADING}><h2 className={SECTION_TITLE} id="workspace-production-efficiency-title">Production efficiency</h2><span className={SECTION_META}>Operational evidence</span></header>
    {value.status === "partial" && <UnavailablePanel title="Partial production evidence" reason={value.reason} />}
    {/* Six bounded metrics; the band re-wraps rather than fixing a column count. */}
    <dl className="workspace-efficiency-strip m-0 mb-4 grid grid-cols-(--workspace-efficiency-columns) gap-2 bg-transparent">{efficiencySlots.map((slot) => {
      const metric = metricValue(value, slot.id);
      return <div className="workspace-efficiency-metric min-w-0 rounded-panel bg-surface-sunken p-3 @max-workspace-row/main-region:px-0" key={slot.id}>
        <dt className="type-xs leading-row text-muted">{slot.label}</dt>
        <dd className="mx-0 my-2 font-code type-lg tabular-nums text-ink">{metric.status === "ready" || metric.status === "partial" ? metric.value : "—"}</dd>
        {metric.status !== "ready" && <p className="m-0 type-xs leading-5 text-muted">{metric.reason}</p>}
      </div>;
    })}</dl>
    {presentation?.sharedAction.status === "ready" && <button id="workspace-open-shared" type="button" className="command-button" onClick={onOpenShared}>{presentation.sharedAction.value.label}</button>}
  </section>;
}

export function WorkspaceInsights({ value, onOpenPage }: Props) {
  const [selected, setSelected] = useState<{ value: WorkspaceInsightPresentation; returnFocusId: string } | null>(null);
  const openMemory = (returnFocusId: string) => onOpenPage("memory", returnFocusId);
  const selectEvidence = (insight: WorkspaceInsightPresentation, returnFocusId: string) => setSelected({ value: insight, returnFocusId });
  return <>
    <section className={`${SECTION_HALF} workspace-insights`} aria-labelledby="workspace-insights-title">
      <header className={SECTION_HEADING}><h2 className={SECTION_TITLE} id="workspace-insights-title">What works</h2><span className={SECTION_META}>Comparable evidence</span></header>
      <EvidenceState value={value.insights} onReview={selectEvidence} />
    </section>
    <section className={`${SECTION_HALF} workspace-learnings`} aria-labelledby="workspace-learnings-title">
      <header className={SECTION_HEADING}><h2 className={SECTION_TITLE} id="workspace-learnings-title">What Ralphy learned</h2><span className={SECTION_META}>Review before Memory</span></header>
      <LearnedState value={value.insights} onReview={selectEvidence} onOpenMemory={openMemory} />
    </section>
    <ProductionEfficiency value={value.efficiency} onOpenShared={() => onOpenPage("shared", "workspace-open-shared")} />
    <EvidenceDetailDialog value={selected?.value ?? null} onOpenChange={(open) => { if (!open) setSelected(null); }} onOpenMemory={() => selected && openMemory(selected.returnFocusId)} />
  </>;
}
