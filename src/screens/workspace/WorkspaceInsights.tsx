import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState } from "react";
import type { WorkspacePage } from "../../state/workbench";
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
  onOpenPage(page: WorkspacePage): void;
}

const efficiencySlots: { id: ProductionEfficiencyMetricId; label: string }[] = [
  { id: "production-time", label: "Median production time" },
  { id: "revisions", label: "Median revisions before selection" },
  { id: "cost", label: "Generation cost per published Unit" },
  { id: "adaptation", label: "Multi-platform adaptation" },
  { id: "asset-reuse", label: "Approved Shared Library reuse" },
  { id: "conversion", label: "Production-to-publication conversion" },
];

function UnavailablePanel({ title, reason }: { title: string; reason: string }) {
  return <div className="workspace-unavailable" role="note"><strong>{title}</strong><p>{reason}</p></div>;
}

function strengthLabel(value: WorkspaceInsightPresentation["evidenceStrength"]): string {
  return `${value[0]!.toUpperCase()}${value.slice(1)} evidence`;
}

function ReferenceList({ title, values }: { title: string; values: WorkspaceInsightUnitReference[] }) {
  return <section className="workspace-insight-references"><h3>{title}</h3>
    {values.length > 0
      ? <ul>{values.map((value) => <li key={value.id}>{value.label}</li>)}</ul>
      : <p>No {title.toLowerCase()} were returned.</p>}
  </section>;
}

function CaveatList({ values }: { values: string[] }) {
  return <section className="workspace-insight-references"><h3>Caveats</h3>
    {values.length > 0 ? <ul>{values.map((value, index) => <li key={`${value}:${index}`}>{value}</li>)}</ul> : <p>No caveats were returned.</p>}
  </section>;
}

function InsightCard({ value, onReview }: { value: WorkspaceInsightPresentation; onReview(): void }) {
  return <li className={`workspace-insight-card is-${value.evidenceStrength}`}>
    <article>
      <header><span>{value.dimension}</span><strong>{strengthLabel(value.evidenceStrength)}</strong></header>
      <h3>{value.observation}</h3>
      <dl className="workspace-insight-facts">
        <div><dt>Scope</dt><dd>{value.platform} · {value.account}</dd></div>
        <div><dt>Reporting window</dt><dd>{value.reportingWindow}</dd></div>
        <div><dt>Sample size</dt><dd>{value.sampleSize} comparable Units</dd></div>
        <div><dt>Baseline</dt><dd>{value.baseline}</dd></div>
        <div><dt>Evidence strength</dt><dd>{strengthLabel(value.evidenceStrength)}</dd></div>
      </dl>
      <div className="workspace-insight-evidence">
        <ReferenceList title="Supporting Units" values={value.supportingUnits} />
        <ReferenceList title="Counterexamples" values={value.counterexamples} />
        <CaveatList values={value.caveats} />
      </div>
      <button type="button" onClick={onReview}>Review evidence</button>
    </article>
  </li>;
}

function EvidenceState({ value, onReview }: {
  value: Availability<WorkspaceInsightPresentation[]>;
  onReview(value: WorkspaceInsightPresentation): void;
}) {
  if (value.status !== "ready" && value.status !== "partial") {
    return <UnavailablePanel title="More comparable publications are needed" reason={value.reason} />;
  }
  if (value.value.length === 0) {
    return <UnavailablePanel title="More comparable publications are needed" reason="No evidence-backed insights were returned." />;
  }
  return <>
    {value.status === "partial" && <UnavailablePanel title="Partial evidence" reason={value.reason} />}
    <ul className="workspace-insight-list">{value.value.map((insight) => <InsightCard key={insight.id} value={insight} onReview={() => onReview(insight)} />)}</ul>
  </>;
}

function LearnedState({ value, onReview, onOpenMemory }: {
  value: Availability<WorkspaceInsightPresentation[]>;
  onReview(value: WorkspaceInsightPresentation): void;
  onOpenMemory(): void;
}) {
  if (value.status !== "ready" && value.status !== "partial") {
    return <UnavailablePanel title="No proposed learning without evidence" reason={value.reason} />;
  }
  const supported = value.value.filter((insight) => insight.evidenceStrength !== "insufficient");
  if (supported.length === 0) {
    return <UnavailablePanel title="No proposed learning without evidence" reason="No supported learnings were returned." />;
  }
  return <ul className="workspace-learning-list">{supported.map((insight) => <li key={insight.id}>
    <span className="workspace-learning-state">Proposed · {strengthLabel(insight.evidenceStrength)}</span>
    <p>{insight.observation}</p>
    <div>
      <button type="button" onClick={() => onReview(insight)}>Review evidence</button>
      {insight.memoryAction.status === "ready" && <button type="button" onClick={onOpenMemory}>{insight.memoryAction.value.label}</button>}
    </div>
  </li>)}</ul>;
}

function EvidenceDetailDialog({ value, onOpenChange, onOpenMemory }: {
  value: WorkspaceInsightPresentation | null;
  onOpenChange(open: boolean): void;
  onOpenMemory(): void;
}) {
  return <Dialog.Root open={value !== null} onOpenChange={onOpenChange}>
    {value && <Dialog.Portal forceMount container={typeof document === "undefined" ? undefined : document.body}>
      <Dialog.Overlay forceMount className="account-detail-overlay" />
      <Dialog.Content forceMount className="account-detail-dialog workspace-evidence-dialog">
        <header className="account-detail-header"><span><Dialog.Title>{value.observation}</Dialog.Title><Dialog.Description>{value.platform} · {value.account} · {strengthLabel(value.evidenceStrength)}</Dialog.Description></span><Dialog.Close asChild><button type="button" aria-label="Close evidence detail"><X aria-hidden="true" /></button></Dialog.Close></header>
        <div className="account-detail-body">
          <section className="account-detail-section"><h3>Method and sample</h3><p>{value.method}</p><dl className="workspace-insight-facts"><div><dt>Scope</dt><dd>{value.platform} · {value.account}</dd></div><div><dt>Reporting window</dt><dd>{value.reportingWindow}</dd></div><div><dt>Sample size</dt><dd>{value.sampleSize} comparable Units</dd></div><div><dt>Baseline</dt><dd>{value.baseline}</dd></div></dl></section>
          <section className="account-detail-section"><h3>Median comparison</h3><p>{value.medianComparison}</p></section>
          <div className="account-detail-section"><ReferenceList title="Supporting Units" values={value.supportingUnits} /></div>
          <div className="account-detail-section"><ReferenceList title="Counterexamples" values={value.counterexamples} /></div>
          <div className="account-detail-section"><CaveatList values={value.caveats} /></div>
          <section className="account-detail-section"><h3>Memory action</h3>
            {value.memoryAction.status === "ready"
              ? <button type="button" className="command-button" onClick={onOpenMemory}>{value.memoryAction.value.label}</button>
              : <UnavailablePanel title="Memory action unavailable" reason={value.memoryAction.reason} />}
          </section>
        </div>
      </Dialog.Content>
    </Dialog.Portal>}
  </Dialog.Root>;
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
  return <section className="workspace-overview-section workspace-production-efficiency" aria-labelledby="workspace-production-efficiency-title">
    <header className="workspace-section-heading"><h2 id="workspace-production-efficiency-title">Production efficiency</h2><span>Operational evidence</span></header>
    {value.status === "partial" && <UnavailablePanel title="Partial production evidence" reason={value.reason} />}
    <dl className="workspace-efficiency-strip">{efficiencySlots.map((slot) => {
      const metric = metricValue(value, slot.id);
      return <div className="workspace-efficiency-metric" key={slot.id}>
        <dt>{slot.label}</dt>
        <dd>{metric.status === "ready" || metric.status === "partial" ? metric.value : "—"}</dd>
        {metric.status !== "ready" && <p>{metric.reason}</p>}
      </div>;
    })}</dl>
    {presentation?.sharedAction.status === "ready" && <button type="button" className="command-button" onClick={onOpenShared}>{presentation.sharedAction.value.label}</button>}
  </section>;
}

export function WorkspaceInsights({ value, onOpenPage }: Props) {
  const [selected, setSelected] = useState<WorkspaceInsightPresentation | null>(null);
  const openMemory = () => onOpenPage("memory");
  return <>
    <section className="workspace-overview-section workspace-insights" aria-labelledby="workspace-insights-title">
      <header className="workspace-section-heading"><h2 id="workspace-insights-title">What works</h2><span>Comparable evidence</span></header>
      <EvidenceState value={value.insights} onReview={setSelected} />
    </section>
    <section className="workspace-overview-section workspace-learnings" aria-labelledby="workspace-learnings-title">
      <header className="workspace-section-heading"><h2 id="workspace-learnings-title">What Ralphy learned</h2><span>Review before Memory</span></header>
      <LearnedState value={value.insights} onReview={setSelected} onOpenMemory={openMemory} />
    </section>
    <ProductionEfficiency value={value.efficiency} onOpenShared={() => onOpenPage("shared")} />
    <EvidenceDetailDialog value={selected} onOpenChange={(open) => { if (!open) setSelected(null); }} onOpenMemory={openMemory} />
  </>;
}
