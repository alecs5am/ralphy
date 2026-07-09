// Publish orchestrator (#501) — shared by the `ralphy publish` verb and the
// `publish` / `x-post` node executors. Reads the unit, binds accounts, uploads
// media through the Postiz connector, fires ONE create-post request PER target
// (so failures are per-target facts, not one opaque batch error), and appends
// the results to the unit's `publish` provenance array (APPEND-only —
// invariant #14: records are added, never rewritten or dropped).
//
// The readiness gate (`checkPublishReadiness`) is the trust-ladder FLOOR: a
// non-`ship` #427 scorecard verdict refuses at EVERY level (invariant #4),
// and the explicit bypass is logged to user-prompts.jsonl by the caller
// (mirrors --no-ref-consent). The ladder itself (#505) layers on top via
// `checkPublishTrust`: L0 never auto-passes (human approval required), L1
// auto-passes when the workspace-eval score clears the configured threshold,
// L2 auto-passes any gate-clearing (verdict `ship`) unit. Pure best-effort
// reads — zero model calls.

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { projectDir, projectWorkspace } from "../paths.js";
import { buildScorecard } from "../scorecard.js";
import {
  readTrustConfig,
  readProjectEval,
  decideAutoPass,
  type TrustLevel,
} from "../trust.js";
import {
  UnitManifestSchema,
  type UnitManifest,
  type UnitPublishRecord,
} from "../schemas/unit.js";
import {
  postizIntegrations,
  postizUpload,
  postizCreatePost,
  type FetchLike,
} from "../providers/postiz.js";
import {
  bindIntegrations,
  buildPostEntry,
  type PublishTarget,
  type UploadedMedia,
} from "./mapping.js";
import { publishIdempotencyKey, findLedgerEntry, appendPublishLedger } from "./ledger.js";
import { rescheduleForQuota, recordQuotaUsage } from "./quota.js";

// ─── readiness gate (the floor) + trust ladder (#505) ────────────────────────

export interface PublishReadiness {
  pass: boolean;
  verdict: string;
  reason: string;
}

/**
 * The publish gate: the project's #427 readiness scorecard must say `ship`.
 * Best-effort read — an unreadable scorecard degrades to a refusing
 * `needs-user-decision`, never a silent pass.
 */
export function checkPublishReadiness(projectId: string): PublishReadiness {
  try {
    const card = buildScorecard({ projectId });
    return { pass: card.verdict === "ship", verdict: card.verdict, reason: card.reason };
  } catch (e) {
    return {
      pass: false,
      verdict: "needs-user-decision",
      reason: `could not read the readiness scorecard: ${(e as Error).message}`,
    };
  }
}

export interface PublishTrustCheck {
  readiness: PublishReadiness;
  level: TrustLevel;
  /** True when the trust ladder lets this publish run without a human approval. */
  autoPass: boolean;
  reason: string;
  /** The workspace-eval overall verdict/score the decision was made on. */
  verdict: string | null;
  score: number | null;
}

/**
 * The full #505 publish decision: the readiness floor + the ladder. A failed
 * readiness gate can NEVER auto-pass (invariant #4 — the caller either refuses
 * or takes the explicit --force bypass); a passing one auto-passes only per
 * the workspace's level + the project's workspace-eval scorecard
 * (`decideAutoPass`). `ws` defaults to the project's workspace — the ladder
 * belongs to the workspace whose rubric scored the unit.
 */
export function checkPublishTrust(projectId: string, ws?: string): PublishTrustCheck {
  const workspace = ws ?? projectWorkspace(projectId);
  const readiness = checkPublishReadiness(projectId);
  const config = readTrustConfig(workspace);
  if (!readiness.pass) {
    return {
      readiness,
      level: config.level,
      autoPass: false,
      reason: `readiness verdict "${readiness.verdict}" is not ship — never auto-pass over a failed gate (invariant #4)`,
      verdict: null,
      score: null,
    };
  }
  const decision = decideAutoPass(config, readProjectEval(projectId), projectId);
  return {
    readiness,
    level: config.level,
    autoPass: decision.autoPass,
    reason: decision.reason,
    verdict: decision.verdict,
    score: decision.score,
  };
}

// ─── unit manifest I/O ───────────────────────────────────────────────────────

export function unitDirFor(projectId: string, slug: string): string {
  return path.join(projectDir(projectId), "units", slug);
}

export async function readUnitManifest(unitDir: string): Promise<UnitManifest | null> {
  const fp = path.join(unitDir, "unit.json");
  if (!existsSync(fp)) return null;
  try {
    return UnitManifestSchema.parse(JSON.parse(await fs.readFile(fp, "utf8")));
  } catch {
    return null;
  }
}

/**
 * Append publish records to `unit.json`'s `publish` array. APPEND-only:
 * re-reads the manifest, concatenates onto the existing array, never touches
 * prior entries. Every attempt lands — failed targets included — so the
 * provenance is the full attempt history, not a success log.
 */
export async function appendPublishRecords(
  unitDir: string,
  records: UnitPublishRecord[],
): Promise<UnitManifest> {
  const manifest = await readUnitManifest(unitDir);
  if (!manifest) throw new Error(`unit.json not found or malformed in ${unitDir}`);
  const updated = UnitManifestSchema.parse({
    ...manifest,
    publish: [...(manifest.publish ?? []), ...records],
  });
  await fs.writeFile(path.join(unitDir, "unit.json"), JSON.stringify(updated, null, 2) + "\n", "utf8");
  return updated;
}

// ─── the publish run ─────────────────────────────────────────────────────────

export interface PublishUnitOptions {
  projectId: string;
  slug: string;
  targets: PublishTarget[];
  /** Explicit target → Postiz integration-id bindings (win over auto-match). */
  accounts?: Partial<Record<PublishTarget, string>>;
  /** ISO datetime → type "schedule"; absent/null → type "now". */
  scheduleAt?: string | null;
  /**
   * The idempotency-key SLOT discriminator (#531): the calendar entryId when
   * the publish targets a calendar slot, else undefined ("default"). Same key
   * across resume/retry so the exactly-once ledger check works.
   */
  slot?: string | null;
  /** Workspace for the idempotency ledger. Defaults to the project's workspace. */
  workspace?: string;
  /** Injectable fetch (zero-network tests). */
  fetchImpl?: FetchLike;
  /** Clock seam for the #534 quota window math (deterministic tests). */
  now?: () => Date;
  /**
   * The #536 publish kill-switch mode. Injected by the node path (which already
   * read the effective mode at the gate) to avoid a double-read, and by tests.
   * Default: read the effective mode for the resolved workspace. `freeze`
   * refuses; `safe` is a no-op here — the human invoking the chat verb IS the
   * approval.
   */
  publishMode?: import("../farm/publish-mode.js").PublishMode;
}

export interface TargetPublishResult {
  target: PublishTarget;
  integrationId: string;
  /**
   * `idempotent-skip` (#531): the exactly-once ledger already had a
   * `published`/`scheduled` record for this (unit, target, slot), so the
   * platform was NOT called again — the recorded postId/scheduleAt are carried
   * through. It is a SUCCESS, not a failure (never counts toward `allFailed`).
   */
  status: "scheduled" | "published" | "failed" | "idempotent-skip";
  postId: string | null;
  scheduleAt: string | null;
  error?: string;
  /**
   * Set (#534) when the target had no publish-quota headroom in the requested
   * window and its schedule was pushed to the platform's next quota window.
   * Absent = the requested time had headroom (pass-through, today's behaviour).
   */
  quotaRescheduledTo?: string;
  /** The quota-reschedule reason, when `quotaRescheduledTo` is set. */
  quotaReason?: string;
}

export interface PublishUnitResult {
  project: string;
  slug: string;
  unitDir: string;
  type: "schedule" | "now";
  scheduleAt: string | null;
  results: TargetPublishResult[];
  /** True when EVERY target failed (callers escalate; partial failure does not). */
  allFailed: boolean;
}

/**
 * Push one unit to Postiz across the given targets. Per-target semantics:
 * a failed target is a `status: "failed"` row in `results` (and in the unit's
 * `publish` provenance) — it never silently drops, and it never aborts the
 * remaining targets. The caller decides how to escalate `allFailed`.
 *
 * Throws (rather than returning failed rows) only for pre-flight failures
 * that predate any post: missing unit, missing connector config, integration
 * listing/binding, media upload.
 */
export async function publishUnit(opts: PublishUnitOptions): Promise<PublishUnitResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const unitDir = unitDirFor(opts.projectId, opts.slug);
  const manifest = await readUnitManifest(unitDir);
  if (!manifest) throw new Error(`unit '${opts.slug}' not found in project '${opts.projectId}'`);
  if (opts.targets.length === 0) throw new Error("no publish targets given");

  const workspace = opts.workspace ?? projectWorkspace(opts.projectId);
  const slot = opts.slot ?? undefined;

  // #536 kill switch: `freeze` refuses the chat-driven publish verb too (the
  // node path parks the run at the trust gate; here there is no run to park).
  // `safe` is a no-op — the human invoking `ralphy publish` IS the approval.
  const { effectivePublishMode } = await import("../farm/publish-mode.js");
  const mode = opts.publishMode ?? effectivePublishMode(workspace).mode;
  if (mode === "freeze") {
    throw new Error(
      `publishing is frozen for workspace "${workspace}" (#536) — resume with \`ralphy farm resume --workspace ${workspace} --reason "<why>"\``,
    );
  }

  const integrations = await postizIntegrations(fetchImpl);
  const bound = bindIntegrations(opts.targets, integrations, opts.accounts);

  // Upload the unit's ordered media ONCE; every target references the same set.
  const media: UploadedMedia[] = [];
  for (const filename of manifest.media) {
    const up = await postizUpload(path.join(unitDir, filename), fetchImpl);
    media.push({ id: up.id, path: up.path });
  }

  const requestedScheduleAt = opts.scheduleAt ?? null;
  const now = opts.now ?? (() => new Date());

  const results: TargetPublishResult[] = [];
  for (const target of opts.targets) {
    const integrationId = bound[target];

    // Exactly-once guard (#531): if the ledger already carries a
    // published/scheduled record for this (unit, target, slot), do NOT fire the
    // platform again. Reuse the recorded postId AND the recorded scheduleAt (so
    // a re-run does not resample a new cadence time — #525 interplay).
    const key = publishIdempotencyKey({ workspace, projectId: opts.projectId, slug: opts.slug, target, slot });
    const prior = findLedgerEntry(workspace, key, target);
    if (prior) {
      results.push({
        target,
        integrationId,
        status: "idempotent-skip",
        postId: prior.postId,
        scheduleAt: prior.scheduleAt,
      });
      continue;
    }

    // #537: the remote-confirm SECOND belt would go HERE — after the ledger
    // miss, before the fire below — closing the single-appendFileSync crash
    // window (see ledger.ts header). It is BLOCKED: the Postiz public API has
    // no scheduled-post lookup endpoint to query for an already-scheduled
    // (unit, target, slot). When Postiz ships one, add a tolerant connector fn
    // (mirror `postizPostAnalytics`) and skip-as-idempotent on a remote match.

    // Quota governor (#534): PER-TARGET, so a YT-exhausted + X-OK publish
    // reschedules only YT. When the platform has no headroom in the requested
    // window the schedule is pushed to its next quota window (never dropped,
    // never hard-failed); a platform with no declared quota passes through.
    const q = rescheduleForQuota(workspace, target, requestedScheduleAt, now());
    const targetScheduleAt = q.rescheduled ? q.scheduleAt : requestedScheduleAt;
    const type = targetScheduleAt ? "schedule" : "now";
    const okStatus = targetScheduleAt ? "scheduled" : "published";
    const quotaFields = q.rescheduled ? { quotaRescheduledTo: q.scheduleAt, quotaReason: q.reason } : {};

    const entry = buildPostEntry(target, integrationId, manifest, media);
    try {
      const created = await postizCreatePost(
        { type, ...(targetScheduleAt && { date: targetScheduleAt }), posts: [entry] },
        fetchImpl,
      );
      const postId = created[0]?.postId ?? created[0]?.id ?? null;
      // Ledger append is the BELT: it lands right after the platform accepts,
      // before/independent of the unit-manifest append below, so a crash
      // between the two is recoverable on the next run via the ledger check.
      appendPublishLedger(workspace, {
        key,
        project: opts.projectId,
        slug: opts.slug,
        target,
        postId,
        scheduleAt: targetScheduleAt,
        status: okStatus,
      });
      // Record the quota consumption ONLY on a successful schedule/publish, so
      // the rolling window counts what actually landed on the platform.
      recordQuotaUsage(workspace, target, now());
      results.push({ target, integrationId, status: okStatus, postId, scheduleAt: targetScheduleAt, ...quotaFields });
    } catch (e) {
      results.push({
        target,
        integrationId,
        status: "failed",
        postId: null,
        scheduleAt: targetScheduleAt,
        error: (e as Error).message,
        ...quotaFields,
      });
    }
  }

  const at = new Date().toISOString();
  await appendPublishRecords(
    unitDir,
    results.map((r) => ({
      target: r.target,
      integrationId: r.integrationId,
      postId: r.postId,
      status: r.status,
      scheduleAt: r.scheduleAt,
      ...(r.error && { error: r.error }),
      at,
      backend: "postiz",
    })),
  );

  return {
    project: opts.projectId,
    slug: opts.slug,
    unitDir,
    // The requested intent (a per-target quota push can still move an
    // individual result's scheduleAt — see TargetPublishResult.quotaRescheduledTo).
    type: requestedScheduleAt ? "schedule" : "now",
    scheduleAt: requestedScheduleAt,
    results,
    // idempotent-skip is a success — allFailed stays "every target failed".
    allFailed: results.every((r) => r.status === "failed"),
  };
}
