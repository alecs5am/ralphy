// Safe Studio config patches (#491) — write + read side.
//
// Studio proposes a bounded set of run/workflow config changes; the changes are
// recorded as APPEND-ONLY events under the run (config-events.jsonl). Studio
// NEVER applies a change, creates a node, wires an edge, or runs a command — it
// only proposes (validated) and lists state. Applying a patch is the agent's
// job via `ralphy studio patch apply` (through the same validation). Patches are
// METADATA, never media (AGENTS.md #14).
//
// Self-contained like the rest of studio/server (no cli import): the field
// allowlist + validators are hand-mirrored from cli/lib/schemas/config-patch.ts.

import path from "node:path";
import fs from "node:fs";

const CONFIG_EVENTS = "config-events.jsonl";

/** The field allowlist — mirrors CONFIG_PATCH_FIELDS in cli/lib/schemas. There
 *  is NO arbitrary field: a value must pass the field's validator to propose. */
type FieldDef = { label: string; requiresTarget: boolean; validate: (v: unknown) => boolean };
const isInt = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const isStr = (v: unknown) => typeof v === "string" && v.length > 0;
export const CONFIG_PATCH_FIELDS: Record<string, FieldDef> = {
  batchSize: { label: "Batch size", requiresTarget: false, validate: (v) => isInt(v, 1, 200) },
  variantCount: { label: "Variant count", requiresTarget: false, validate: (v) => isInt(v, 1, 10) },
  budgetCapUsd: { label: "Budget cap (USD)", requiresTarget: false, validate: (v) => typeof v === "number" && v >= 0 },
  destinationEnabled: { label: "Destination enabled", requiresTarget: true, validate: (v) => typeof v === "boolean" },
  templateChoice: { label: "Template choice", requiresTarget: false, validate: isStr },
  modelPreference: { label: "Model preference", requiresTarget: false, validate: isStr },
  gateStrictness: { label: "Gate strictness", requiresTarget: false, validate: (v) => ["strict", "normal", "lenient", "off"].includes(v as string) },
  approvalMode: { label: "Approval mode", requiresTarget: false, validate: (v) => ["auto", "approve"].includes(v as string) },
  publishTarget: { label: "Publish target", requiresTarget: false, validate: isStr },
};

export type PatchScope = { dataRoot: string; workspace: string; runId: string };
export type ConfigPatchState = "pending" | "applied" | "rejected";
export type FoldedPatch = {
  id: string;
  field: string;
  value: unknown;
  target: string | null;
  note: string;
  state: ConfigPatchState;
  proposedAt: string;
  decidedAt?: string;
  reason?: string;
};

function runDirOf(s: PatchScope): string {
  return path.join(s.dataRoot, "workspaces", s.workspace, "runs", s.runId);
}
function eventsPath(root: string): string {
  return path.join(root, CONFIG_EVENTS);
}
function scopeRoot(s: PatchScope): string | null {
  const dir = runDirOf(s);
  return fs.existsSync(dir) ? dir : null;
}
function mkId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Validate a field + value (+ target) against the allowlist. */
export function validatePatch(field: string, value: unknown, target?: string | null): { ok: true } | { ok: false; error: string } {
  const def = CONFIG_PATCH_FIELDS[field];
  if (!def) return { ok: false, error: `unknown field: ${field} (not in the allowlist)` };
  if (def.requiresTarget && (typeof target !== "string" || !target)) return { ok: false, error: `field "${field}" requires a target` };
  if (!def.validate(value)) return { ok: false, error: `invalid value for "${field}"` };
  return { ok: true };
}

/** Fold config-events.jsonl into the live patch set + effective config. */
export function listPatches(scope: PatchScope): { patches: FoldedPatch[]; effectiveConfig: Record<string, { value: unknown; target: string | null }> } {
  const root = scopeRoot(scope);
  if (!root) return { patches: [], effectiveConfig: {} };
  let raw: string;
  try {
    raw = fs.readFileSync(eventsPath(root), "utf-8");
  } catch {
    return { patches: [], effectiveConfig: {} };
  }
  const byId = new Map<string, FoldedPatch>();
  const appliedOrder: string[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    let row: any;
    try { row = JSON.parse(t); } catch { continue; }
    if (row.op === "propose" && typeof row.id === "string" && typeof row.field === "string") {
      byId.set(row.id, {
        id: row.id, field: row.field, value: row.value, target: row.target ?? null,
        note: typeof row.note === "string" ? row.note : "", state: "pending",
        proposedAt: typeof row.proposedAt === "string" ? row.proposedAt : (typeof row.ts === "string" ? row.ts : ""),
      });
    } else if ((row.op === "apply" || row.op === "reject") && typeof row.id === "string") {
      const p = byId.get(row.id);
      if (!p) continue;
      p.state = row.op === "apply" ? "applied" : "rejected";
      p.decidedAt = typeof row.ts === "string" ? row.ts : undefined;
      if (typeof row.reason === "string") p.reason = row.reason;
      if (row.op === "apply") appliedOrder.push(row.id);
    }
  }
  // Effective config: the latest APPLIED value per field (by apply order).
  const effectiveConfig: Record<string, { value: unknown; target: string | null }> = {};
  for (const id of appliedOrder) {
    const p = byId.get(id);
    if (p && p.state === "applied") effectiveConfig[p.field] = { value: p.value, target: p.target };
  }
  const patches = [...byId.values()].sort((a, b) => (a.proposedAt < b.proposedAt ? 1 : a.proposedAt > b.proposedAt ? -1 : 0));
  return { patches, effectiveConfig };
}

export type ProposeInput = { field: string; value: unknown; target?: string | null; note?: string };

/**
 * Validate + append a "propose" event. Returns the patch + the folded state, or
 * `{ error }` (mapped to 400/404 by the HTTP layer). Studio only proposes —
 * apply/reject is the agent's path (`ralphy studio patch`).
 */
export function proposePatch(scope: PatchScope, input: ProposeInput): { patch: FoldedPatch; patches: FoldedPatch[]; effectiveConfig: Record<string, { value: unknown; target: string | null }> } | { error: string } {
  const root = scopeRoot(scope);
  if (!root) return { error: "unknown run" };
  const v = validatePatch(input.field, input.value, input.target ?? null);
  if (!v.ok) return { error: v.error };
  const patch = {
    op: "propose" as const,
    version: 1,
    kind: "config-patch" as const,
    id: mkId(),
    field: input.field,
    value: input.value,
    target: input.target ?? null,
    note: typeof input.note === "string" ? input.note.slice(0, 1000) : "",
    proposedAt: new Date().toISOString(),
  };
  fs.appendFileSync(eventsPath(root), JSON.stringify(patch) + "\n");
  const folded = listPatches(scope);
  const f = folded.patches.find((p) => p.id === patch.id)!;
  return { patch: f, patches: folded.patches, effectiveConfig: folded.effectiveConfig };
}
