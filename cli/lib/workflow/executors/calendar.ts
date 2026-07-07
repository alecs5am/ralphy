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
//
// CADENCE (#525): between slot resolution and the stamped `scheduleAt`, the
// exact slot time is HUMANIZED into a sampled instant inside a jitter window
// (seeded by the run id → deterministic on resume, different across runs),
// min-gap-separated from the same platform's already-scheduled posts. A
// workspace with no `cadence` block (or `enabled: false`) is a NO-OP: the exact
// slot time passes through exactly as pre-#525. The sampled fields
// (sampled/cadenceBasis/cadenceOffsetMinutes) ride the payload AND the calendar
// entry so `workflow simulate` and the studio calendar view mark them.

import { nextFreeSlot, upsertEntry, readCalendar } from "../../calendar/store.js";
import { readCadenceConfig } from "../../cadence-config.js";
import { sampleCadence } from "../../farm/cadence.js";
import { ENTRY_STATUSES, type EntryStatus } from "../../schemas/calendar.js";
import { writeNodeArtifact } from "./llm.js";
import { NodeExecutionError } from "./types.js";
import type { ExecutorContext, NodeExecutor } from "./types.js";

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

/**
 * Same-platform already-dated instants the min-gap must clear. LOCAL pending
 * (the workspace calendar's dated entries on this platform, excluding the one
 * we are about to stamp) plus the Postiz-scheduled seam. Postiz has no
 * public list-scheduled endpoint on the connector today, so the query is a
 * documented HOOK: `ctx.postizScheduledAt` (a test/integration seam) supplies
 * the extra instants when a future connector method lands. Until then local
 * pending is the enforced floor (the issue's "define the seam, use local
 * pending + a documented Postiz-query hook").
 */
async function sameplatformNeighbours(
  ctx: ExecutorContext,
  platform: string | undefined,
  slotTime: string,
): Promise<string[]> {
  const cal = readCalendar(ctx.workspaceDir);
  const local = cal.entries
    .filter(
      (e) =>
        e.at &&
        e.at !== slotTime &&
        (!platform || (e.platforms ?? []).includes(platform as never)),
    )
    .map((e) => e.at!) as string[];
  const hook = (ctx as { postizScheduledAt?: (platform?: string) => Promise<string[]> }).postizScheduledAt;
  const remote = hook ? await hook(platform).catch(() => []) : [];
  return [...local, ...remote];
}

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

  if (!resolution.free) {
    const { entry } = upsertEntry(ctx.workspaceDir, { ...links, status: "queued" });
    const payload = {
      slotId: null,
      scheduleAt: null,
      entryId: entry.id,
      queued: true,
      reason: resolution.reason,
      horizonWeeks: resolution.horizonWeeks,
    };
    const artifactPath = await writeNodeArtifact(ctx, `${node.id}.json`, JSON.stringify(payload, null, 2));
    return { output: payload, artifactPath };
  }

  // ── Cadence: humanize the exact slot time into a sampled instant (#525). ──
  const config = readCadenceConfig(ctx.workspace);
  const slot = readCalendar(ctx.workspaceDir).slots.find((s) => s.id === resolution.slotId);
  const timezone = slot?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Seed source: the run id (deterministic on resume). Falls back to the
  // params.run_id / node id when the node runs outside a farm run (chat-driven).
  const seed = ctx.runId ?? p.run_id ?? node.id;
  const neighbours = await sameplatformNeighbours(ctx, p.platform, resolution.at);
  const sample = sampleCadence({
    exactIso: resolution.at,
    timezone,
    platform: p.platform,
    config,
    seed,
    neighbours,
  });

  const { entry } = upsertEntry(ctx.workspaceDir, {
    ...links,
    at: sample.scheduleAt,
    slotId: resolution.slotId,
    ...(sample.sampled
      ? { sampled: true, cadenceBasis: sample.basis, cadenceOffsetMinutes: sample.offsetMinutes }
      : {}),
  });

  const payload = {
    slotId: resolution.slotId,
    scheduleAt: sample.scheduleAt,
    entryId: entry.id,
    ...(sample.sampled
      ? {
          sampled: true,
          slotTime: resolution.at,
          cadenceBasis: sample.basis,
          cadenceOffsetMinutes: sample.offsetMinutes,
        }
      : {}),
  };

  const artifactPath = await writeNodeArtifact(ctx, `${node.id}.json`, JSON.stringify(payload, null, 2));
  return { output: payload, artifactPath };
};
