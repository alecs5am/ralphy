// Variant decision-ledger recording (#558 + #561). After a tournament, each
// ranked variant's substantive changed axes and cosmetic last layer are
// recorded on its Unit's decision ledger, so `ralphy analytics report` can
// attribute outcomes to what actually changed. Append-only: the ledger writes
// a new Document revision only when the content changes.

import type { ResolvedCommandContext } from "./context-state.js";
import { recordManualDecisions } from "./analytics/ledger.js";
import { locateUnits } from "./store/outcomes.js";
import type { QueryContext } from "./store/scope-context.js";

export interface VariantLedgerRow {
  variantId: string;
  unit: string | null;
  written: boolean;
  note: string;
}

/**
 * Record changed axes for every variant whose project has exactly one Unit in
 * the resolved scope. Best effort: a variant without a Unit yet is reported,
 * and `ralphy unit decisions <unit> --derive` picks the axes up from the
 * variant's scenario.json (`variant_changed_axes`) later.
 */
export function recordVariantDecisions(
  scope: ResolvedCommandContext | null,
  ranked: Array<{ variantId: string; changedAxes: string[]; cosmeticLayer: string[] }>,
): VariantLedgerRow[] {
  const rows: VariantLedgerRow[] = [];
  for (const entry of ranked) {
    if (entry.changedAxes.length === 0 && entry.cosmeticLayer.length === 0) continue;
    if (!scope) {
      rows.push({ variantId: entry.variantId, unit: null, written: false, note: "no Workspace scope; derive later with unit decisions --derive" });
      continue;
    }
    const context: QueryContext = scope.kind === "session" ? { sessionId: scope.sessionId } : { workspaceId: scope.workspaceId };
    try {
      const matches = locateUnits({ context, ref: entry.variantId });
      if (matches.length !== 1) {
        rows.push({
          variantId: entry.variantId,
          unit: null,
          written: false,
          note: matches.length === 0 ? "no Unit for this variant yet" : "several Units; record with unit decisions --set",
        });
        continue;
      }
      const location = matches[0]!;
      const unitScope: QueryContext = scope.kind === "session"
        ? context
        : location.projectId
          ? { workspaceId: location.workspaceId, projectId: location.projectId }
          : { workspaceId: location.workspaceId };
      const assignments = [
        ...(entry.changedAxes.length > 0 ? [`changed_axes=${entry.changedAxes.join(",")}`] : []),
        ...(entry.cosmeticLayer.length > 0 ? [`cosmetic_layer=${entry.cosmeticLayer.join(",")}`] : []),
      ];
      const result = recordManualDecisions({ context: unitScope, location, assignments });
      rows.push({ variantId: entry.variantId, unit: location.slug, written: result.written, note: "decision ledger updated" });
    } catch (error) {
      rows.push({ variantId: entry.variantId, unit: null, written: false, note: (error as Error).message.slice(0, 160) });
    }
  }
  return rows;
}
