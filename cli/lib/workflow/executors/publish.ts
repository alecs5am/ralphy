// `publish` + `x-post` node executors (#501) — the farm's last mile, backed
// by the Postiz connector (cli/lib/providers/postiz.ts) through the shared
// orchestrator (cli/lib/publish/publish.ts).
//
// FAILURE SEMANTICS (the documented choice): a failed target is included in
// the result with `status: "failed"` (and appended to the unit's `publish`
// provenance) — PARTIAL failure does NOT throw, so the runner sees per-target
// detail on the output port and downstream routing can react per platform.
// Only when ALL targets failed does the executor throw NodeExecutionError
// ("publish-all-failed"), which is what the node's on_fail routing consumes.
//
// READINESS GATE + TRUST LADDER (#505): the unit's project must carry a
// `ship` readiness-scorecard verdict; the explicit bypass is
// `params.force_reason`, logged to the project's user-prompts.jsonl the same
// way `--no-ref-consent` records a deliberate gate skip. On top of that
// floor, INSIDE a farm run (ctx.runId) with no recorded run approval, the
// workspace's trust level decides: L0 parks the run for approval (publish is
// never unattended by default), L1 auto-passes when the workspace-eval score
// clears the configured threshold, L2 auto-passes any gate-clearing unit.
// Every auto-pass is audited (workspace trust-audit.jsonl + run journal);
// force_reason stays the explicit bypass at any level. Outside a run context
// (the chat-driven `ralphy publish` path) the human invoking the verb IS the
// approval — no park.
//
// CALENDAR: the `schedule_at` in-port is the calendar-slot payload
// ({ slotId, scheduleAt, entryId }, #504). On a non-all-failed publish the
// calendar entry transitions to "scheduled" (the move calendar.ts deliberately
// leaves to this node). A PARKED payload (scheduleAt null — no free slot) is
// a hard error: publishing immediately would defeat the calendar; route the
// queued branch around this node instead. No schedule_at port at all = an
// explicitly immediate post ("now").
//
// x-post runs THROUGH Postiz too (an `x` integration) — a direct X API
// connector is a NAMED FOLLOW-UP, deliberately not built here; likewise the
// `youtube-upload` direct-API fallback (chapters/thumbnails) stays a named
// follow-up (#501 notes). Thread support: the text in-port splits on a
// standalone `---` line into multiple value entries (one tweet each).

import { transitionEntry } from "../../calendar/store.js";
import { makePrng } from "../../farm/prng.js";
import { logUserPrompt } from "../../gen-log.js";
import {
  postizIntegrations,
  postizCreatePost,
  type FetchLike,
} from "../../providers/postiz.js";
import { bindIntegrations, isPublishTarget, type PublishTarget } from "../../publish/mapping.js";
import {
  checkPublishReadiness,
  publishUnit,
  unitDirFor,
  readUnitManifest,
  appendPublishRecords,
} from "../../publish/publish.js";
import { publishIdempotencyKey, findLedgerEntry, appendPublishLedger } from "../../publish/ledger.js";
import { writeNodeArtifact } from "./llm.js";
import { NodeExecutionError } from "./types.js";
import type { ExecutorContext, NodeExecutor } from "./types.js";
import type { WorkflowNode } from "../../schemas/workflow.js";

// ─── shared helpers ──────────────────────────────────────────────────────────

type UnitRef = { projectId: string; slug: string };

/**
 * Resolve the `unit` in-port into { projectId, slug }. Accepted shapes:
 * an object ({ project|projectId, slug|unitSlug }), a "project/slug" string,
 * or params.project + params.unit_slug (with ctx.projectId as the project
 * fallback). The ralphy-unit node's output and hand-wired graphs both fit.
 */
function resolveUnitRef(node: WorkflowNode, ctx: ExecutorContext): UnitRef | null {
  const raw = ctx.inputs.unit;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const projectId = (o.projectId ?? o.project) as string | undefined;
    const slug = (o.slug ?? o.unitSlug) as string | undefined;
    if (projectId && slug) return { projectId, slug };
  }
  if (typeof raw === "string" && raw.includes("/")) {
    const [projectId, ...rest] = raw.split("/");
    return { projectId: projectId!, slug: rest.join("/") };
  }
  const projectId = (node.params.project as string | undefined) ?? ctx.projectId;
  const slug = node.params.unit_slug as string | undefined;
  return projectId && slug ? { projectId, slug } : null;
}

type CalendarSlotPayload = {
  slotId?: string | null;
  scheduleAt?: string | null;
  entryId?: string;
  queued?: boolean;
};

/**
 * Parse `params.delay_window` = [minMinutes, maxMinutes] (#525): an
 * event-triggered publish's SAMPLED delay window replacing a fixed offset.
 * Tolerant — a missing/malformed value returns null (no delay).
 */
function parseDelayWindow(node: WorkflowNode): [number, number] | null {
  const raw = node.params.delay_window;
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const [lo, hi] = raw.map(Number);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo! < 0 || hi! < lo!) return null;
  return [lo!, hi!];
}

/**
 * The calendar-slot payload on the schedule_at in-port, or null when unwired.
 * When there is NO calendar payload but the node carries a #525
 * `delay_window: [min, max]` (minutes), sample a delayed schedule_at off the
 * runner clock, seeded by the run id so a resume re-derives the same instant.
 * This is the #520 event-triggered path's humanized delay.
 */
function readScheduleAt(node: WorkflowNode, ctx: ExecutorContext): CalendarSlotPayload | null {
  const raw = ctx.inputs.schedule_at;
  if (raw && typeof raw === "object") return raw as CalendarSlotPayload;
  if (typeof raw === "string") return { scheduleAt: raw };
  const p = node.params.schedule_at;
  if (typeof p === "string") return { scheduleAt: p };

  const window = parseDelayWindow(node);
  if (window) {
    const [lo, hi] = window;
    const base = (ctx.now ?? (() => new Date()))().getTime();
    // Deterministic delay: run id + node id → a stable draw for THIS publish.
    const prng = makePrng(`${ctx.runId ?? "no-run"}|${node.id}|delay`);
    const delayMin = prng.float(lo, hi);
    return { scheduleAt: new Date(base + delayMin * 60000).toISOString() };
  }
  return null;
}

/**
 * The floor gate for a node run: `ship` verdict or an explicit
 * params.force_reason (logged). Throws NodeExecutionError("publish-not-ready")
 * otherwise. Returns whether the gate was force-bypassed (the trust gate
 * honors the same explicit bypass).
 */
async function gateReadiness(node: WorkflowNode, ref: UnitRef): Promise<{ forced: boolean }> {
  const readiness = checkPublishReadiness(ref.projectId);
  if (readiness.pass) return { forced: false };
  const force = node.params.force_reason;
  if (typeof force !== "string" || force.trim().length === 0) {
    throw new NodeExecutionError(
      "publish-not-ready",
      `publish node "${node.id}" refused: readiness verdict for ${ref.projectId} is "${readiness.verdict}" (${readiness.reason}) — repair to a \`ship\` verdict or set params.force_reason to bypass explicitly`,
    );
  }
  await logUserPrompt(ref.projectId, {
    stage: "publish-force",
    text: force.trim(),
    note: `node=${node.id} unit=${ref.slug} verdict=${readiness.verdict}`,
  });
  return { forced: true };
}

/**
 * The #505 trust gate for a node run. Fires ONLY inside a farm run
 * (ctx.runId) — the chat-driven CLI verb is human-invoked by construction.
 *
 * PRECEDENCE (top authority first):
 *   1. FREEZE (#536) — the publish kill switch at `freeze` parks the run
 *      UNCONDITIONALLY. An operator freeze outranks EVERYTHING below it,
 *      including a workflow `force_reason` and a trust auto-pass: the operator
 *      turned publishing OFF, and a graph-baked bypass must not override that.
 *   2. force_reason — explicit per-node bypass at any level (below freeze).
 *   3. SAFE (#536) — the kill switch at `safe` forces the approval park like
 *      L0 (skips the trust auto-pass), EXCEPT when a human is already in the
 *      loop: a recorded active run approval (or force_reason, handled above).
 *   4. a recorded active run approval (#482 — the human already approved this run).
 *   5. the trust ladder (`decideAutoPass`: L0 never, L1 score >= threshold, L2
 *      any ship-verdict unit; never over a failed/warn gate).
 * Auto-pass is audited append-only; anything else parks the run through the
 * same inbox-pack + RunControlSignal mechanics as the approval node. Exported
 * for tests.
 */
export async function gatePublishTrust(
  node: WorkflowNode,
  ctx: ExecutorContext,
  ref: UnitRef,
  forced: boolean,
): Promise<{ mode: "human" | "forced" | "approved" | "auto-pass"; reason?: string }> {
  if (!ctx.runId) return { mode: "human" };

  // #536 publish kill switch — read the effective mode BEFORE the trust logic.
  const { effectivePublishMode } = await import("../../farm/publish-mode.js");
  const publishMode = effectivePublishMode(ctx.workspace).mode;

  // freeze: the top authority. Parks unconditionally — over force_reason AND
  // over any trust auto-pass. Journal the reason and park like the approval node.
  if (publishMode === "freeze") {
    const reason = `publishing is FROZEN (#536) for workspace "${ctx.workspace}" — held ${ref.projectId}/${ref.slug}; \`ralphy farm resume --workspace ${ctx.workspace} --reason "<why>"\` to release`;
    const { writeApprovalInboxPack, RunControlSignal } = await import("./control-flow.js");
    await writeApprovalInboxPack(ctx, node.id, reason);
    throw new RunControlSignal("park-approval", `publish node "${node.id}": ${reason}`);
  }

  if (forced) return { mode: "forced" };

  const { readRunLedger, activeApproval } = await import("../../spend.js");
  const approval = activeApproval(await readRunLedger(ctx.runId));
  const expired =
    approval?.expiry != null &&
    Number.isFinite(Date.parse(approval.expiry)) &&
    Date.now() > Date.parse(approval.expiry);
  if (approval && !expired) return { mode: "approved" };

  // safe (#536): force the approval park regardless of trust level — behave
  // like L0. A human already in the loop (an active run approval above, or a
  // force_reason handled earlier) is the exception; here neither holds, so park.
  if (publishMode === "safe") {
    const reason = `publishing is in SAFE-MODE (#536) for workspace "${ctx.workspace}" — every publish parks for approval regardless of trust (unit ${ref.projectId}/${ref.slug}); record an approval or \`ralphy farm resume\``;
    const { writeApprovalInboxPack, RunControlSignal } = await import("./control-flow.js");
    await writeApprovalInboxPack(ctx, node.id, reason);
    throw new RunControlSignal("park-approval", `publish node "${node.id}": ${reason}`);
  }

  const trust = await import("../../trust.js");
  const config = trust.readTrustConfig(ctx.workspace);
  const decision = trust.decideAutoPass(config, trust.readProjectEval(ref.projectId), ref.projectId);
  if (decision.autoPass) {
    trust.appendTrustAudit(ctx.workspace, {
      kind: "auto-pass",
      level: config.level,
      surface: `${node.type}-node`,
      run: ctx.runId,
      node: node.id,
      project: ref.projectId,
      unit: ref.slug,
      verdict: decision.verdict,
      score: decision.score,
      threshold: config.level === "L1" ? config.autoPublishScore : null,
      reason: decision.reason,
    });
    const { appendRunEvent } = await import("../../run.js");
    await appendRunEvent(ctx.runId, {
      kind: "trust-auto-pass",
      node: node.id,
      level: config.level,
      project: ref.projectId,
      unit: ref.slug,
      verdict: decision.verdict,
      score: decision.score,
      message: `publish node "${node.id}" auto-passed at ${config.level}: ${decision.reason}`,
    });
    return { mode: "auto-pass", reason: decision.reason };
  }

  const reason = `unit ${ref.projectId}/${ref.slug} needs a human publish approval (trust ${config.level}: ${decision.reason})`;
  const { writeApprovalInboxPack, RunControlSignal } = await import("./control-flow.js");
  await writeApprovalInboxPack(ctx, node.id, reason);
  throw new RunControlSignal("park-approval", `publish node "${node.id}": ${reason}`);
}

function parseNodeTargets(node: WorkflowNode): PublishTarget[] {
  const raw = node.params.targets;
  const list = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === "string"
      ? raw.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
  const bad = list.filter((t) => !isPublishTarget(t));
  if (list.length === 0 || bad.length) {
    throw new NodeExecutionError(
      "params-invalid",
      `publish node "${node.id}" requires params.targets ⊆ youtube|tiktok|instagram|x${bad.length ? ` (unknown: ${bad.join(", ")})` : ""}`,
    );
  }
  return list as PublishTarget[];
}

// ─── publish ─────────────────────────────────────────────────────────────────

export const publishExecutor: NodeExecutor = async (node, ctx) => {
  const ref = resolveUnitRef(node, ctx);
  if (!ref) {
    throw new NodeExecutionError(
      "params-invalid",
      `publish node "${node.id}" needs a unit — wire the \`unit\` in-port or set params.project + params.unit_slug`,
    );
  }
  const targets = parseNodeTargets(node);
  const slot = readScheduleAt(node, ctx);
  if (slot && !slot.scheduleAt) {
    // Parked calendar payload (queued, no free slot): publishing "now" would
    // defeat the calendar — route the queued branch around this node instead.
    throw new NodeExecutionError(
      "schedule-missing",
      `publish node "${node.id}" got a parked calendar-slot payload (no free slot, entry ${slot.entryId ?? "?"}) — the unit stays queued; route the queued branch to an approval/park node instead of publish`,
    );
  }

  const { forced } = await gateReadiness(node, ref);
  const trustGate = await gatePublishTrust(node, ctx, ref, forced);

  // #536: the gate above already parked on `freeze`, so the effective mode here
  // is `normal` or `safe` — pass it through so publishUnit does not re-read it.
  const { effectivePublishMode } = await import("../../farm/publish-mode.js");
  const publishMode = effectivePublishMode(ctx.workspace).mode;

  const result = await publishUnit({
    projectId: ref.projectId,
    slug: ref.slug,
    targets,
    accounts: (node.params.accounts as Partial<Record<PublishTarget, string>> | undefined) ?? {},
    scheduleAt: slot?.scheduleAt ?? null,
    publishMode,
    // The exactly-once ledger slot (#531): the calendar entryId when this
    // publish targets a calendar slot, else "default". Stable across resume.
    slot: slot?.entryId ?? null,
    workspace: ctx.workspace,
    fetchImpl: ctx.fetchImpl as FetchLike | undefined,
    now: ctx.now,
  });

  // Idempotent-skips are a SUCCESS, not an error — they flow through
  // result.results (status "idempotent-skip"), and do NOT count toward
  // allFailed. Make the exactly-once skip visible in the journal (#531).
  const skipped = result.results.filter((r) => r.status === "idempotent-skip");
  // #534: per-target quota pushes (a YT-exhausted target rescheduled to its
  // next quota window) surfaced on the journal alongside the idempotent-skip.
  const quotaPushed = result.results.filter((r) => r.quotaRescheduledTo);
  const notes = [
    skipped.length
      ? `publish-idempotent-skip: ${skipped.map((r) => r.target).join(", ")} already published/scheduled (exactly-once ledger)`
      : null,
    quotaPushed.length
      ? `quota-rescheduled: ${quotaPushed.map((r) => `${r.target}→${r.quotaRescheduledTo}`).join(", ")}`
      : null,
  ].filter(Boolean);
  await ctx.log({
    provider: "postiz",
    model: "postiz",
    endpoint: "posts",
    kind: "publish",
    status: result.allFailed ? "error" : "ok",
    input: { node: node.id, project: ref.projectId, unit: ref.slug, targets, scheduleAt: result.scheduleAt },
    output: result.results,
    ...(notes.length && { note: notes.join(" | ") }),
  });

  if (result.allFailed) {
    throw new NodeExecutionError(
      "publish-all-failed",
      `publish node "${node.id}": every target failed — ${result.results.map((r) => `${r.target}: ${r.error}`).join("; ")}`,
    );
  }

  // Move the calendar entry to "scheduled" (the publish node's move, per
  // #504). Best-effort AFTER the posts exist: a transition error must not
  // mark a live publish failed (on_fail retry would double-post) — it is
  // surfaced on the output instead.
  let calendarTransition: string | null = null;
  if (slot?.entryId) {
    try {
      transitionEntry(ctx.workspaceDir, slot.entryId, "scheduled");
      calendarTransition = "scheduled";
    } catch (e) {
      calendarTransition = `failed: ${(e as Error).message}`;
    }
  }

  const payload = {
    ...result,
    entryId: slot?.entryId ?? null,
    calendarTransition,
    trustGate: trustGate.mode,
  };
  const artifactPath = await writeNodeArtifact(ctx, `${node.id}.json`, JSON.stringify(payload, null, 2));
  return { output: payload, artifactPath };
};

// ─── x-post ──────────────────────────────────────────────────────────────────

/** Split post text into thread segments on a standalone `---` line. */
export function splitThread(text: string): string[] {
  return text
    .split(/\n\s*---\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const xPostExecutor: NodeExecutor = async (node, ctx) => {
  const text = typeof ctx.inputs.text === "string" ? ctx.inputs.text : (node.params.text as string | undefined);
  if (!text || !text.trim()) {
    throw new NodeExecutionError(
      "params-invalid",
      `x-post node "${node.id}" requires the \`text\` in-port (or params.text)`,
    );
  }

  // Optional unit binding: gates on readiness + trust + appends provenance.
  const ref = resolveUnitRef(node, ctx);
  const hasUnit = Boolean(ref && (await readUnitManifest(unitDirFor(ref.projectId, ref.slug))));
  if (ref && hasUnit) {
    const { forced } = await gateReadiness(node, ref);
    await gatePublishTrust(node, ctx, ref, forced);
  }

  const fetchImpl = (ctx.fetchImpl as FetchLike | undefined) ?? fetch;
  const explicit = node.params.account as string | undefined;
  const integrationId = explicit
    ? explicit
    : bindIntegrations(["x"], await postizIntegrations(fetchImpl))["x"];

  const slot = readScheduleAt(node, ctx);
  if (slot && !slot.scheduleAt) {
    throw new NodeExecutionError(
      "schedule-missing",
      `x-post node "${node.id}" got a parked calendar-slot payload — route the queued branch around this node`,
    );
  }
  const scheduleAt = slot?.scheduleAt ?? null;
  const segments = splitThread(text);

  // Exactly-once guard (#531/#537) — close the ledger-bypass this executor had:
  // it fires `postizCreatePost` directly (not through publishUnit), so a
  // resumed/retried x-post thread could double-post. The thread is ONE atomic
  // Postiz post carrying N `value` entries (one per `---` segment), so there is
  // a single platform-accept event — but we key the ledger PER THREAD-ITEM
  // (slot = "<entryId|default>#<index>") so the guard dedups at item
  // granularity, never collapsing the whole thread to one row. Requires a bound
  // unit for a stable identity (projectId/slug); an unbound x-post has no stable
  // key and keeps the pre-#537 fire-always behaviour (nothing to reconcile
  // against). The recorded postId is the same for every item of one thread.
  const ledgerWorkspace = ref && hasUnit ? ctx.workspace : null;
  const itemSlot = (i: number) => `${slot?.entryId ?? "default"}#${i}`;
  const itemKey = (i: number) =>
    publishIdempotencyKey({ workspace: ctx.workspace, projectId: ref!.projectId, slug: ref!.slug, target: "x", slot: itemSlot(i) });

  if (ledgerWorkspace) {
    // A thread fires atomically: if EVERY item already has a blocking ledger
    // row, the thread already posted — idempotent-skip without re-firing. Reuse
    // the recorded postId/scheduleAt (a partial set means a prior crash between
    // accept and the per-item appends; re-fire to be safe, the ledger tolerates
    // duplicate rows and findLedgerEntry resolves newest-first).
    const priors = segments.map((_, i) => findLedgerEntry(ledgerWorkspace, itemKey(i), "x"));
    if (priors.length > 0 && priors.every((p) => p)) {
      const first = priors[0]!;
      const result = {
        target: "x" as const,
        integrationId,
        status: "idempotent-skip" as const,
        postId: first.postId,
        scheduleAt: first.scheduleAt,
        segments: segments.length,
      };
      await ctx.log({
        provider: "postiz",
        model: "postiz",
        endpoint: "posts",
        kind: "publish",
        status: "ok",
        input: { node: node.id, target: "x", segments: segments.length, scheduleAt },
        output: result,
        note: `publish-idempotent-skip: x thread already published/scheduled (exactly-once ledger, ${segments.length} items)`,
      });
      const artifactPath = await writeNodeArtifact(ctx, `${node.id}.json`, JSON.stringify(result, null, 2));
      return { output: result, artifactPath };
    }
  }

  let postId: string | null = null;
  let error: string | undefined;
  try {
    const created = await postizCreatePost(
      {
        type: scheduleAt ? "schedule" : "now",
        ...(scheduleAt && { date: scheduleAt }),
        posts: [{ integration: { id: integrationId }, value: segments.map((content) => ({ content })) }],
      },
      fetchImpl,
    );
    postId = created[0]?.postId ?? created[0]?.id ?? null;
  } catch (e) {
    error = (e as Error).message;
  }

  const status = error ? "failed" : scheduleAt ? "scheduled" : "published";

  // Ledger BELT: right after the platform accepts, append one row PER
  // thread-item (before the unit-manifest provenance append below), mirroring
  // publishUnit's ordering — a crash between the two is recoverable on re-run
  // via the ledger check above. A failed fire records a non-blocking `failed`
  // row per item so a retry re-fires (findLedgerEntry ignores `failed`).
  if (ledgerWorkspace) {
    for (let i = 0; i < segments.length; i++) {
      appendPublishLedger(ledgerWorkspace, {
        key: itemKey(i),
        project: ref!.projectId,
        slug: ref!.slug,
        target: "x",
        postId,
        scheduleAt,
        status: status as "scheduled" | "published" | "failed",
      });
    }
  }

  const result = { target: "x" as const, integrationId, status, postId, scheduleAt, segments: segments.length, ...(error && { error }) };

  await ctx.log({
    provider: "postiz",
    model: "postiz",
    endpoint: "posts",
    kind: "publish",
    status: error ? "error" : "ok",
    input: { node: node.id, target: "x", segments: segments.length, scheduleAt },
    output: result,
  });

  if (ref && hasUnit) {
    await appendPublishRecords(unitDirFor(ref.projectId, ref.slug), [
      {
        target: "x",
        integrationId,
        postId,
        status: status as "scheduled" | "published" | "failed",
        scheduleAt,
        ...(error && { error }),
        at: new Date().toISOString(),
        backend: "postiz",
      },
    ]);
  }

  // A single-target node: its one failure IS the all-failed case.
  if (error) {
    throw new NodeExecutionError("publish-all-failed", `x-post node "${node.id}" failed: ${error}`);
  }

  if (slot?.entryId) {
    try {
      transitionEntry(ctx.workspaceDir, slot.entryId, "scheduled");
    } catch {
      /* surfaced pattern as publish: never fail a live post on a calendar move */
    }
  }

  const artifactPath = await writeNodeArtifact(ctx, `${node.id}.json`, JSON.stringify(result, null, 2));
  return { output: result, artifactPath };
};
