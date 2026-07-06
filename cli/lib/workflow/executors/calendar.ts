// `calendar-slot` control-flow node executor (#504): given a produced unit's
// context (params unit_type / platform), pick the next free recurring slot
// from the workspace calendar and stamp a dated entry for it. Emits the
// object:calendar-slot port payload { slotId, scheduleAt, entryId } the
// publish node (#501) consumes as its schedule_at in-port.
//
// This node does NOT set status "scheduled" — that is the publish node's move.
// The entry it creates stays at the produced/gated level (params.status,
// default "produced"); on a no-free-slot horizon the entry is created UNDATED
// at status "queued" (queue, don't drop) and the payload carries null
// slotId/scheduleAt so downstream routing can park the unit.

import { nextFreeSlot, upsertEntry } from "../../calendar/store.js";
import { ENTRY_STATUSES, type EntryStatus } from "../../schemas/calendar.js";
import { writeNodeArtifact } from "./llm.js";
import { NodeExecutionError } from "./types.js";
import type { NodeExecutor } from "./types.js";

type CalendarSlotParams = {
  unit_type?: string;
  platform?: string;
  /** ISO datetime — only slot occurrences strictly after this count. Default now. */
  after?: string;
  horizon_weeks?: number;
  /** Pre-publish lifecycle level for the stamped entry (idea|queued|produced|gated). */
  status?: string;
  run_id?: string;
  unit_slug?: string;
};

/** Statuses a calendar-slot node may stamp — everything BEFORE "scheduled". */
const STAMPABLE = ENTRY_STATUSES.slice(0, ENTRY_STATUSES.indexOf("scheduled"));

export const calendarSlotExecutor: NodeExecutor = async (node, ctx) => {
  const p = node.params as CalendarSlotParams;
  if (typeof p.unit_type !== "string" || p.unit_type.length === 0) {
    throw new NodeExecutionError(
      "params-invalid",
      `calendar-slot node "${node.id}" requires params.unit_type (the format-taxonomy string the slot mix is keyed by)`,
    );
  }
  const status = (p.status ?? "produced") as EntryStatus;
  if (!(STAMPABLE as readonly string[]).includes(status)) {
    throw new NodeExecutionError(
      "params-invalid",
      `calendar-slot node "${node.id}" params.status must be one of ${STAMPABLE.join(", ")} — "scheduled"/"published" belong to the publish node`,
    );
  }

  const resolution = nextFreeSlot(ctx.workspaceDir, {
    unitType: p.unit_type,
    platform: p.platform,
    after: p.after,
    horizonWeeks: p.horizon_weeks,
  });

  const links = {
    unitType: p.unit_type,
    status,
    runId: p.run_id,
    projectId: ctx.projectId,
    unitSlug: p.unit_slug,
  };
  const { entry } = resolution.free
    ? upsertEntry(ctx.workspaceDir, { ...links, at: resolution.at, slotId: resolution.slotId })
    : upsertEntry(ctx.workspaceDir, { ...links, status: "queued" });

  const payload = resolution.free
    ? { slotId: resolution.slotId, scheduleAt: resolution.at, entryId: entry.id }
    : {
        slotId: null,
        scheduleAt: null,
        entryId: entry.id,
        queued: true,
        reason: resolution.reason,
        horizonWeeks: resolution.horizonWeeks,
      };

  const artifactPath = await writeNodeArtifact(ctx, `${node.id}.json`, JSON.stringify(payload, null, 2));
  return { output: payload, artifactPath };
};
