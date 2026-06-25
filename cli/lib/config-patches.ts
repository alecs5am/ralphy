// Safe config-patch reader + apply/reject (#491) — the CLI/agent side.
//
// Studio proposes patches into an append-only config-events.jsonl under a run
// (studio/server/patches.ts). This module folds that log, and lets the agent
// VALIDATE + APPLY or REJECT a patch through the shared allowlist schema. Apply
// / reject only APPEND events (AGENTS.md #14) — the file is never rewritten.
//
// Applying a patch records the user's decision and makes the value the run's
// effective config (the inspectable source of truth the agent reads); it does
// NOT itself spend money or mutate a workflow file — the agent still enacts any
// spend-/workflow-affecting change through the proper verb behind the gate.

import fs from "node:fs";
import path from "node:path";
import { runDir, runWorkspace } from "./paths.js";
import { validateConfigPatchValue, CONFIG_EVENTS_ARTIFACT } from "./schemas/config-patch.js";

export type ConfigPatchState = "pending" | "applied" | "rejected";
export interface FoldedPatch {
  id: string;
  field: string;
  value: unknown;
  target: string | null;
  note: string;
  state: ConfigPatchState;
  proposedAt: string;
  decidedAt?: string;
  reason?: string;
}
export interface PatchFold {
  patches: FoldedPatch[];
  effectiveConfig: Record<string, { value: unknown; target: string | null }>;
}

function eventsFile(runId: string, ws?: string): string {
  const w = ws || runWorkspace(runId);
  return path.join(runDir(w, runId), CONFIG_EVENTS_ARTIFACT);
}

/** Fold a run's config-events.jsonl into the live patch set + effective config. */
export function listConfigPatches(runId: string, ws?: string): PatchFold {
  let raw: string;
  try {
    raw = fs.readFileSync(eventsFile(runId, ws), "utf-8");
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
  const effectiveConfig: Record<string, { value: unknown; target: string | null }> = {};
  for (const id of appliedOrder) {
    const p = byId.get(id);
    if (p && p.state === "applied") effectiveConfig[p.field] = { value: p.value, target: p.target };
  }
  const patches = [...byId.values()].sort((a, b) => (a.proposedAt < b.proposedAt ? 1 : a.proposedAt > b.proposedAt ? -1 : 0));
  return { patches, effectiveConfig };
}

export function loadConfigPatch(runId: string, id: string, ws?: string): FoldedPatch | null {
  return listConfigPatches(runId, ws).patches.find((p) => p.id === id) ?? null;
}

function appendEvent(runId: string, ws: string, event: Record<string, unknown>): void {
  const file = eventsFile(runId, ws);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n");
}

export type PatchActionResult =
  | { ok: true; patch: FoldedPatch }
  | { ok: false; error: string };

/**
 * Validate then APPLY a pending patch (append an "apply" event). Re-validates
 * the value against the allowlist schema — an invalid patch can never be
 * applied. Returns an error for an unknown / already-decided patch.
 */
export function applyConfigPatch(runId: string, id: string, reason?: string): PatchActionResult {
  const ws = runWorkspace(runId);
  const patch = loadConfigPatch(runId, id, ws);
  if (!patch) return { ok: false, error: `unknown patch: ${id}` };
  if (patch.state !== "pending") return { ok: false, error: `patch ${id} is already ${patch.state}` };
  const v = validateConfigPatchValue(patch.field, patch.value, patch.target);
  if (!v.ok) return { ok: false, error: v.error };
  appendEvent(runId, ws, { op: "apply", id, ...(reason ? { reason } : {}) });
  return { ok: true, patch: loadConfigPatch(runId, id, ws)! };
}

/** REJECT a pending patch (append a "reject" event). */
export function rejectConfigPatch(runId: string, id: string, reason?: string): PatchActionResult {
  const ws = runWorkspace(runId);
  const patch = loadConfigPatch(runId, id, ws);
  if (!patch) return { ok: false, error: `unknown patch: ${id}` };
  if (patch.state !== "pending") return { ok: false, error: `patch ${id} is already ${patch.state}` };
  appendEvent(runId, ws, { op: "reject", id, ...(reason ? { reason } : {}) });
  return { ok: true, patch: loadConfigPatch(runId, id, ws)! };
}
