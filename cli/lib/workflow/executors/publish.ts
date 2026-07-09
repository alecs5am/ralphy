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
import { resolveFreshnessTtl, classifyFreshness, type StaleAction } from "../../farm/freshness.js";
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
import {
  publishArticle,
  isArticleTarget,
  type ArticleTarget,
  type GithubPagesConfig,
} from "../../publish/article.js";
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

// ─── covered-topic record (#541) ─────────────────────────────────────────────

/**
 * Record the just-published unit's TOPIC in the workspace's published-history
 * index (#541). Called ONLY on publish success — the topic is genuinely covered
 * now, so a later fresher source on the same story is suppressed by the dedup
 * node's topic consult. Best-effort: a manifest read / index write failure must
 * NOT fail a live publish (the post already exists), so it is swallowed. The
 * signature is derived from the unit's title + tags + article frontmatter.
 */
async function recordCoveredTopic(ctx: ExecutorContext, ref: UnitRef): Promise<void> {
  try {
    const manifest = await readUnitManifest(unitDirFor(ref.projectId, ref.slug));
    if (!manifest) return;
    const { topicSignature, recordTopic } = await import("../../ingestion/topic-index.js");
    const signature = topicSignature({
      title: manifest.title ?? manifest.article?.title ?? ref.slug,
      claims: manifest.blurb ? [manifest.blurb] : manifest.article?.description ? [manifest.article.description] : [],
      entities: [...(manifest.tags ?? []), ...(manifest.article?.tags ?? [])],
    });
    recordTopic(ctx.workspaceDir, {
      unitId: `${ref.projectId}/${ref.slug}`,
      ts: (ctx.now ?? (() => new Date()))().toISOString(),
      signature,
      title: manifest.title ?? manifest.article?.title,
    });
  } catch {
    // best-effort: a live publish must not fail on a topic-index write
  }
}

// ─── freshness guard (#542) ────────────────────────────────────────────────

type FreshnessGuard =
  | { drop: true; ageMs: number | null; ttlMs: number; source_ts: string }
  | { drop: false; downgraded: boolean; ageMs?: number | null; ttlMs?: number };

/**
 * The publish-time staleness guard (#542). Reads the unit's source `ts` +
 * effective TTL (item/node param/content-class default), classifies age
 * measured FROM THE SOURCE `ts` (not the tick), and decides: a fresh unit
 * proceeds; a past-TTL unit is DROPPED (never published as fresh) OR — when the
 * node sets `params.stale_action: "downgrade"` — flagged for a lower-priority
 * evergreen treatment while still publishing. A unit with no TTL (evergreen) or
 * no `source_ts` proceeds unguarded.
 *
 * `source_ts` is read from the schedule_at slot payload's `sourceTs`, else
 * `params.source_ts`; the TTL from `params.freshness_ttl` / `params.content_class`.
 * Wired via node params so the guard stays free of the unit-manifest coupling.
 */
function guardFreshness(
  node: WorkflowNode,
  ctx: ExecutorContext,
  slot: CalendarSlotPayload | null,
): FreshnessGuard {
  const p = node.params as {
    source_ts?: unknown;
    freshness_ttl?: unknown;
    content_class?: unknown;
    stale_action?: unknown;
  };
  const slotSourceTs = slot && typeof (slot as { sourceTs?: unknown }).sourceTs === "string"
    ? (slot as { sourceTs: string }).sourceTs
    : undefined;
  const sourceTs = slotSourceTs ?? (typeof p.source_ts === "string" ? p.source_ts : undefined);
  if (!sourceTs) return { drop: false, downgraded: false };

  const ttlMs = resolveFreshnessTtl({
    nodeTtl: typeof p.freshness_ttl === "string" ? p.freshness_ttl : undefined,
    contentClass: typeof p.content_class === "string" ? p.content_class : undefined,
  });
  const action: StaleAction = p.stale_action === "downgrade" ? "downgrade" : "drop";
  const now = (ctx.now ?? (() => new Date()))().getTime();
  const verdict = classifyFreshness(sourceTs, ttlMs, now, action);
  if (!verdict.stale) return { drop: false, downgraded: false };
  if (verdict.action === "downgrade") {
    return { drop: false, downgraded: true, ageMs: verdict.ageMs, ttlMs: verdict.ttlMs };
  }
  return { drop: true, ageMs: verdict.ageMs, ttlMs: verdict.ttlMs!, source_ts: sourceTs };
}

// ─── campaign cross-linking (#528) ─────────────────────────────────────────
//
// When a publish node carries `params.campaign` + `params.cell`, resolve the
// campaign siblings' published URLs and produce the cross-link block that gets
// injected into this unit's description (media) / frontmatter (article). A
// sibling published AFTER this unit has no URL yet → a PENDING-LINK entry
// (surfaced in `campaign status`, applied on the target's NEXT publish, never a
// retroactive edit of a live post). Any pending links ALREADY recorded for this
// cell are resolved now (its next publish) and cleared. This is the injection
// HOOK the publish path exposes; the block builders are tested standalone.

interface CampaignCrossLink {
  /** The description link block (media) — empty when no resolvable siblings. */
  descriptionBlock: string;
  /** The frontmatter link fragment (article) — empty when no resolvable siblings. */
  frontmatterBlock: string;
  /** Resolved sibling links surfaced on the node output. */
  siblings: Array<{ cellId: string; format: string; url: string }>;
  /** Pending links recorded this run (siblings not yet published). */
  recordedPending: number;
}

async function resolveCampaignCrossLink(
  node: WorkflowNode,
  ctx: ExecutorContext,
): Promise<CampaignCrossLink | null> {
  const campaignId = node.params.campaign;
  const cellId = node.params.cell;
  if (typeof campaignId !== "string" || typeof cellId !== "string") return null;

  const { readCampaign, clearPendingLinksFor } = await import("../../campaign/store.js");
  const { resolveSiblingLinks, buildDescriptionLinkBlock, buildFrontmatterLinkBlock } = await import(
    "../../campaign/crosslink.js"
  );
  const campaign = readCampaign(ctx.workspaceDir, campaignId);
  if (!campaign) return null;
  const cell = campaign.inventory.find((c) => c.id === cellId);
  if (!cell) return null;

  const siblings = await resolveSiblingLinks(campaign, cell);
  // Applying pending links = this cell's NEXT publish. Clear them so they are
  // not re-applied; the resolved sibling URLs above already include them.
  const pendingForCell = campaign.pendingLinks.filter((l) => l.targetCellId === cellId).length;
  if (pendingForCell > 0) clearPendingLinksFor(ctx.workspaceDir, campaignId, cellId);

  return {
    descriptionBlock: buildDescriptionLinkBlock(siblings),
    frontmatterBlock: buildFrontmatterLinkBlock(siblings),
    siblings,
    recordedPending: 0,
  };
}

// ─── copyright hygiene + attribution (#543) ─────────────────────────────────
//
// The hygiene gate is the deterministic copyright guard: a unit distributing a
// SCRAPED/SOURCE asset (copied out of the `artifacts/refs/` tier) is a `fail`
// that BLOCKS auto-publish at ANY trust level — it parks the run through the
// same RunControlSignal("park-approval") mechanics as the trust gate, mirroring
// invariant #4 (gates refuse, not warn). A `warn` (or a policy-required-but-
// missing attribution) routes to the approval queue too, but as a softer signal
// that a human should look before the piece goes out. It sits BEFORE the trust
// auto-pass: no trust level buys past an embedded source asset.
//
// Attribution: the source url/outlet/author reaches the unit via
// `provenance.sources`, falling back to the project's research-facts sources.
// A publish-time policy (workspace `attribution` block) injects a "Sources:"
// block into the description/caption (media) / frontmatter (article). Default
// ON when sources exist; OFF only by an explicit `{ enabled: false }` opt-out.

interface HygieneGateOutcome {
  /** The hygiene verdict, surfaced on the node output for the journal. */
  verdict: "pass" | "warn" | "fail";
  /** Flag count (0 on a clean pass). */
  flagged: number;
  /** True when the policy requires attribution and none was resolvable. */
  attributionMissing: boolean;
}

/**
 * The #543 hygiene + attribution gate. Runs BEFORE the trust auto-pass so a
 * scraped-source embed can never be bought past by trust. A `fail` OR (a `warn`
 * / attribution-missing while a human is not already in the loop) parks the run
 * for approval — same park mechanics as gatePublishTrust. Returns the outcome
 * for the node payload/journal. Outside a run context (chat-driven `ralphy
 * publish`) the human IS the approval, so a warn does not park — but a `fail`
 * still throws a NodeExecutionError so the CLI refuses the embed.
 */
async function gateCopyrightHygiene(
  node: WorkflowNode,
  ctx: ExecutorContext,
  ref: UnitRef,
  forced: boolean,
): Promise<HygieneGateOutcome> {
  const manifest = await readUnitManifest(unitDirFor(ref.projectId, ref.slug));
  if (!manifest) return { verdict: "pass", flagged: 0, attributionMissing: false };

  const { checkCopyrightHygiene } = await import("../../publish/hygiene.js");
  const { readAttributionConfig, dedupeSources } = await import("../../publish/attribution.js");
  const hygiene = checkCopyrightHygiene(manifest);

  const policy = readAttributionConfig(ctx.workspace);
  const sources = await resolveAttributionSources(ref, manifest);
  const attributionMissing =
    policy.enabled && policy.requireOnPublish && dedupeSources(sources).length === 0;

  const outcome: HygieneGateOutcome = {
    verdict: hygiene.verdict,
    flagged: hygiene.flags.length,
    attributionMissing,
  };

  // A hygiene FAIL blocks at any trust level — force_reason does not buy past a
  // copyright embed (the whole point of the guard). Journal, park (in a run) or
  // refuse (chat-driven).
  if (hygiene.verdict === "fail") {
    const detail = hygiene.flags
      .filter((f) => f.severity === "fail")
      .map((f) => f.detail)
      .join("; ");
    const reason = `copyright hygiene FAIL (#543) for ${ref.projectId}/${ref.slug}: ${detail} — source media must be referenced, not embedded; re-form the unit with generated media`;
    if (ctx.runId) {
      const { appendRunEvent } = await import("../../run.js");
      await appendRunEvent(ctx.runId, {
        kind: "hygiene-blocked",
        node: node.id,
        project: ref.projectId,
        unit: ref.slug,
        flagged: hygiene.flags.length,
        message: reason,
      });
      const { writeApprovalInboxPack, RunControlSignal } = await import("./control-flow.js");
      await writeApprovalInboxPack(ctx, node.id, reason);
      throw new RunControlSignal("park-approval", `publish node "${node.id}": ${reason}`);
    }
    throw new NodeExecutionError("publish-hygiene-fail", `publish node "${node.id}": ${reason}`);
  }

  // A WARN (a soft hygiene flag) or a policy-required-but-missing attribution
  // routes to review — unless a human is already in the loop (forced bypass, or
  // outside a run entirely). Never a hard fail: a clean generated video missing
  // a source link should not be nuked.
  const needsReview = (hygiene.verdict === "warn" || attributionMissing) && ctx.runId && !forced;
  if (needsReview) {
    const { readRunLedger, activeApproval } = await import("../../spend.js");
    const approval = activeApproval(await readRunLedger(ctx.runId!));
    if (!approval) {
      const why = attributionMissing
        ? `attribution required by policy but no source is resolvable for ${ref.projectId}/${ref.slug}`
        : hygiene.flags.map((f) => f.detail).join("; ");
      const reason = `hygiene WARN (#543) — routed to review: ${why}`;
      const { appendRunEvent } = await import("../../run.js");
      await appendRunEvent(ctx.runId!, {
        kind: "hygiene-flagged",
        node: node.id,
        project: ref.projectId,
        unit: ref.slug,
        flagged: hygiene.flags.length,
        attributionMissing,
        message: reason,
      });
      const { writeApprovalInboxPack, RunControlSignal } = await import("./control-flow.js");
      await writeApprovalInboxPack(ctx, node.id, reason);
      throw new RunControlSignal("park-approval", `publish node "${node.id}": ${reason}`);
    }
  }

  return outcome;
}

/**
 * Resolve the attribution sources for a unit: the unit's `provenance.sources`
 * first (the durable carry), falling back to the project's research-facts
 * `sources[]` (url + title → outlet). Best-effort read — no throw.
 */
async function resolveAttributionSources(
  ref: UnitRef,
  manifest: { provenance?: { sources?: Array<{ url: string; outlet?: string; author?: string }> } },
): Promise<Array<{ url: string; outlet?: string; author?: string }>> {
  const onUnit = manifest.provenance?.sources ?? [];
  if (onUnit.length > 0) return onUnit;
  // Fallback: the project's research-facts sources (url + title).
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { projectDir } = await import("../../paths.js");
    const { RESEARCH_FACTS_ARTIFACT } = await import("../../schemas/research-facts.js");
    const p = path.join(projectDir(ref.projectId), RESEARCH_FACTS_ARTIFACT);
    if (!fs.existsSync(p)) return [];
    const facts = JSON.parse(fs.readFileSync(p, "utf8")) as {
      sources?: Array<{ url?: string; title?: string }>;
    };
    return (facts.sources ?? [])
      .filter((s): s is { url: string; title?: string } => typeof s.url === "string" && s.url.length > 0)
      .map((s) => ({ url: s.url, ...(s.title ? { outlet: s.title } : {}) }));
  } catch {
    return [];
  }
}

/**
 * Build the #543 attribution injection blocks for a unit, honoring the
 * workspace policy. Returns empty blocks when the policy is opted out or no
 * source resolves. Mirrors resolveCampaignCrossLink's shape.
 */
async function resolveAttribution(
  ctx: ExecutorContext,
  ref: UnitRef,
): Promise<{
  descriptionBlock: string;
  frontmatterBlock: string;
  sources: Array<{ url: string; outlet?: string; author?: string }>;
} | null> {
  const { readAttributionConfig, buildSourcesBlock, buildSourcesFrontmatterBlock, dedupeSources } =
    await import("../../publish/attribution.js");
  const policy = readAttributionConfig(ctx.workspace);
  if (!policy.enabled) return null;
  const manifest = await readUnitManifest(unitDirFor(ref.projectId, ref.slug));
  if (!manifest) return null;
  const sources = dedupeSources(await resolveAttributionSources(ref, manifest));
  if (sources.length === 0) return null;
  return {
    descriptionBlock: buildSourcesBlock(sources, policy.heading),
    frontmatterBlock: buildSourcesFrontmatterBlock(sources),
    sources,
  };
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

  // #542 freshness guard — BEFORE the readiness/trust gates and any paid
  // publish: a past-TTL unit must never be posted as fresh. A `drop` short-
  // circuits with a `stale-dropped` journal event (carrying age + TTL) and
  // publishes NOTHING; a `downgrade` proceeds but flags the evergreen treatment.
  const freshness = guardFreshness(node, ctx, slot);
  if (freshness.drop) {
    const ageH = freshness.ageMs !== null ? (freshness.ageMs / 3_600_000).toFixed(1) : "unknown";
    const ttlH = (freshness.ttlMs / 3_600_000).toFixed(1);
    const message = `publish node "${node.id}": ${ref.projectId}/${ref.slug} stale-dropped — source aged ${ageH}h > TTL ${ttlH}h (source_ts ${freshness.source_ts}); not published`;
    if (ctx.runId) {
      const { appendRunEvent } = await import("../../run.js");
      // #541: a stale-DROP must NOT mark the topic "covered" — the unit was
      // never published, so the topic stays OPEN for a fresher source. The
      // topic-index "cover" write lives ONLY on the publish-SUCCESS path below
      // (see `recordCoveredTopic` after result.allFailed is false); this drop
      // path deliberately records NOTHING in the topic index.
      await appendRunEvent(ctx.runId, {
        kind: "stale-dropped",
        node: node.id,
        project: ref.projectId,
        unit: ref.slug,
        ageMs: freshness.ageMs,
        ttlMs: freshness.ttlMs,
        sourceTs: freshness.source_ts,
        message,
      });
    }
    const payload = { stale_dropped: true, ageMs: freshness.ageMs, ttlMs: freshness.ttlMs, sourceTs: freshness.source_ts };
    const artifactPath = await writeNodeArtifact(ctx, `${node.id}.json`, JSON.stringify(payload, null, 2));
    await ctx.log({
      provider: "postiz",
      model: "postiz",
      endpoint: "posts",
      kind: "publish",
      status: "ok",
      input: { node: node.id, project: ref.projectId, unit: ref.slug },
      output: payload,
      note: message,
    });
    return { output: payload, artifactPath };
  }

  const { forced } = await gateReadiness(node, ref);
  // #543 copyright-hygiene + attribution gate — BEFORE the trust auto-pass so a
  // scraped-source embed can never be bought past by trust. A `fail` parks/refuses
  // unconditionally (invariant #4); a `warn` / missing-required attribution routes
  // to review when no human is already in the loop.
  const hygieneGate = await gateCopyrightHygiene(node, ctx, ref, forced);
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

  // #541: the topic is now COVERED — record it in the workspace's published-
  // history index (gated on publish success; the stale-drop path above never
  // reaches here). A future fresher source on the same topic is then suppressed
  // by the dedup node's topic consult.
  await recordCoveredTopic(ctx, ref);

  const crossLink = await resolveCampaignCrossLink(node, ctx);
  const attribution = await resolveAttribution(ctx, ref);
  const payload = {
    ...result,
    entryId: slot?.entryId ?? null,
    calendarTransition,
    trustGate: trustGate.mode,
    // #543: the hygiene verdict + the attribution "Sources:" block injected into
    // the description, surfaced so coverage + flags are visible on the journal.
    hygiene: { verdict: hygieneGate.verdict, flagged: hygieneGate.flagged },
    ...(attribution
      ? { attribution: { descriptionBlock: attribution.descriptionBlock, sources: attribution.sources } }
      : {}),
    // #528: the cross-link block injected into the description + the resolved
    // siblings, surfaced so the mesh is visible on the run journal.
    ...(crossLink && crossLink.siblings.length > 0
      ? { crossLink: { descriptionBlock: crossLink.descriptionBlock, siblings: crossLink.siblings } }
      : {}),
    // #542: a past-TTL unit the node chose to DOWNGRADE (not drop) still
    // publishes, flagged so downstream/report can see the evergreen treatment.
    ...(freshness.downgraded ? { staleDowngraded: true, ageMs: freshness.ageMs, ttlMs: freshness.ttlMs } : {}),
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
    await gateCopyrightHygiene(node, ctx, ref, forced); // #543 (blocks scraped embeds)
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
    // #541: topic covered on x-post success (bound unit + no error).
    if (!error) await recordCoveredTopic(ctx, ref!);
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

// ─── article-publish (#527) ────────────────────────────────────────────────

/** Parse + validate params.targets ⊆ the article targets. */
function parseArticleNodeTargets(node: WorkflowNode): ArticleTarget[] {
  const raw = node.params.targets;
  const list = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === "string"
      ? raw.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
  const bad = list.filter((t) => !isArticleTarget(t));
  if (list.length === 0 || bad.length) {
    throw new NodeExecutionError(
      "params-invalid",
      `article-publish node "${node.id}" requires params.targets ⊆ github-pages|devto|hashnode|medium${bad.length ? ` (unknown: ${bad.join(", ")})` : ""}`,
    );
  }
  return list as ArticleTarget[];
}

/**
 * Publish an ARTICLE unit (#526) to article rails (#527). Reuses the same
 * readiness floor + #505 trust gate + #536 freeze as the media publish node
 * (calendar/cadence flow in via the schedule_at port the same way), then hands
 * off to publishArticle for per-target isolation, canonical enforcement, the
 * exactly-once ledger, and provenance append. github-pages is COMMIT-ONLY.
 */
export const articlePublishExecutor: NodeExecutor = async (node, ctx) => {
  const ref = resolveUnitRef(node, ctx);
  if (!ref) {
    throw new NodeExecutionError(
      "params-invalid",
      `article-publish node "${node.id}" needs a unit — wire the \`unit\` in-port or set params.project + params.unit_slug`,
    );
  }
  const targets = parseArticleNodeTargets(node);

  const { forced } = await gateReadiness(node, ref);
  const hygieneGate = await gateCopyrightHygiene(node, ctx, ref, forced); // #543
  const trustGate = await gatePublishTrust(node, ctx, ref, forced);

  const gh = node.params.github_pages as GithubPagesConfig | undefined;
  const result = await publishArticle({
    projectId: ref.projectId,
    slug: ref.slug,
    targets,
    githubPages: gh,
    hashnodePublicationId: node.params.hashnode_publication_id as string | undefined,
    draft: typeof node.params.draft === "boolean" ? node.params.draft : undefined,
    dryRun: node.params.dry_run === true,
    slot: readScheduleAt(node, ctx)?.entryId ?? null,
    workspace: ctx.workspace,
    fetchImpl: ctx.fetchImpl as Parameters<typeof publishArticle>[0]["fetchImpl"],
  });

  await ctx.log({
    provider: "article",
    model: "article",
    endpoint: "publish",
    kind: "publish",
    status: result.allFailed ? "error" : "ok",
    input: { node: node.id, project: ref.projectId, unit: ref.slug, targets },
    output: result.results,
  });

  if (result.allFailed) {
    throw new NodeExecutionError(
      "publish-all-failed",
      `article-publish node "${node.id}": every target failed — ${result.results.map((r) => `${r.target}: ${r.error}`).join("; ")}`,
    );
  }

  // #541: topic covered on article-publish success (same gate as media).
  await recordCoveredTopic(ctx, ref);

  const crossLink = await resolveCampaignCrossLink(node, ctx);
  const attribution = await resolveAttribution(ctx, ref);
  const payload = {
    ...result,
    trustGate: trustGate.mode,
    // #543: the hygiene verdict + the attribution frontmatter fragment.
    hygiene: { verdict: hygieneGate.verdict, flagged: hygieneGate.flagged },
    ...(attribution
      ? { attribution: { frontmatterBlock: attribution.frontmatterBlock, sources: attribution.sources } }
      : {}),
    // #528: the cross-link frontmatter fragment + resolved siblings.
    ...(crossLink && crossLink.siblings.length > 0
      ? { crossLink: { frontmatterBlock: crossLink.frontmatterBlock, siblings: crossLink.siblings } }
      : {}),
  };
  const artifactPath = await writeNodeArtifact(ctx, `${node.id}.json`, JSON.stringify(payload, null, 2));
  return { output: payload, artifactPath };
};
