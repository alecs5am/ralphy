// Ledger evidence for the production plan (#558). Pure: given the decision-vs-
// outcome rows of `ralphy analytics report` and the options a plan chose, cite
// the rows that have enough evidence (n >= minN) and list the chosen options
// that do not yet. The plan builder stays deterministic and offline — the
// caller loads the report and injects the index.

import { lengthBand } from "../selection.js";
import type { DecisionRow, OutcomeMetric } from "./outcomes.js";
import type { LedgerEvidenceIndex } from "./report.js";

export interface PlanChoice {
  dimension: string;
  value: string;
}

export interface LedgerCitation {
  dimension: string;
  value: string;
  n: number;
  medianOutcome: number | null;
  lift: number | null;
  verdict: string;
  note: string;
}

export interface PlanLedgerEvidence {
  source: string;
  workspaceId: string;
  metric: string;
  minN: number;
  observations: number;
  generatedAt: string;
  cited: LedgerCitation[];
  insufficient: Array<{ dimension: string; value: string; n: number }>;
  note: string;
}

/** The ledger dimensions a production plan decides up front. */
export function planChoices(plan: {
  formatTemplate: { format: string; templateSlug: string | null };
  contentMode: { mode: string | null };
  aspect: string;
  durationSec: number;
  modelStack: Array<{ model: string }>;
}): PlanChoice[] {
  const choices: PlanChoice[] = [{ dimension: "format", value: plan.formatTemplate.format }];
  if (plan.formatTemplate.templateSlug) choices.push({ dimension: "template", value: plan.formatTemplate.templateSlug });
  if (plan.contentMode.mode) choices.push({ dimension: "content_mode", value: plan.contentMode.mode });
  if (plan.aspect) choices.push({ dimension: "aspect", value: plan.aspect });
  if (plan.durationSec > 0) choices.push({ dimension: "length_band", value: lengthBand(plan.durationSec, "seconds") });
  for (const model of new Set(plan.modelStack.map((entry) => entry.model.toLowerCase()))) {
    if (model.includes("/")) choices.push({ dimension: "models", value: model });
  }
  return choices.map((choice) => ({ dimension: choice.dimension, value: choice.value.toLowerCase() }));
}

export function citeLedgerEvidence(index: LedgerEvidenceIndex, choices: PlanChoice[]): PlanLedgerEvidence {
  const rows = new Map<string, DecisionRow>(index.rows.map((row) => [`${row.dimension}\u0000${row.value}`, row]));
  const cited: LedgerCitation[] = [];
  const insufficient: PlanLedgerEvidence["insufficient"] = [];
  for (const choice of choices) {
    const row = rows.get(`${choice.dimension}\u0000${choice.value}`);
    if (!row) {
      insufficient.push({ dimension: choice.dimension, value: choice.value, n: 0 });
      continue;
    }
    if (row.n < index.minN || row.verdict === "insufficient data") {
      insufficient.push({ dimension: choice.dimension, value: choice.value, n: row.n });
      continue;
    }
    cited.push({
      dimension: row.dimension,
      value: row.value,
      n: row.n,
      medianOutcome: row.medianOutcome,
      lift: row.lift,
      verdict: row.verdict,
      note: citationNote(row, index.metric),
    });
  }
  return {
    source: `ralphy analytics report --workspace ${index.workspaceId}`,
    workspaceId: index.workspaceId,
    metric: index.metric,
    minN: index.minN,
    observations: index.observations,
    generatedAt: index.generatedAt,
    cited,
    insufficient,
    note: cited.length > 0
      ? `${cited.length} chosen option(s) have outcome evidence (n >= ${index.minN}); weigh "under" verdicts before committing spend.`
      : index.observations === 0
        ? "No measured outcomes in this workspace yet; the plan is not evidence-backed."
        : `No chosen option has n >= ${index.minN} observations yet.`,
  };
}

function citationNote(row: DecisionRow, metric: OutcomeMetric | string): string {
  const lift = row.lift === null
    ? "no platform baseline yet"
    : `${row.lift >= 0 ? "+" : ""}${Math.round(row.lift * 100)}% vs the workspace baseline`;
  return `${row.dimension}=${row.value}: ${metric} ${lift} across ${row.n} post(s) (${row.verdict})`;
}
