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
  /** Injectable fetch (zero-network tests). */
  fetchImpl?: FetchLike;
}

export interface TargetPublishResult {
  target: PublishTarget;
  integrationId: string;
  status: "scheduled" | "published" | "failed";
  postId: string | null;
  scheduleAt: string | null;
  error?: string;
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

  const integrations = await postizIntegrations(fetchImpl);
  const bound = bindIntegrations(opts.targets, integrations, opts.accounts);

  // Upload the unit's ordered media ONCE; every target references the same set.
  const media: UploadedMedia[] = [];
  for (const filename of manifest.media) {
    const up = await postizUpload(path.join(unitDir, filename), fetchImpl);
    media.push({ id: up.id, path: up.path });
  }

  const scheduleAt = opts.scheduleAt ?? null;
  const type = scheduleAt ? "schedule" : "now";
  const okStatus = scheduleAt ? "scheduled" : "published";

  const results: TargetPublishResult[] = [];
  for (const target of opts.targets) {
    const integrationId = bound[target];
    const entry = buildPostEntry(target, integrationId, manifest, media);
    try {
      const created = await postizCreatePost(
        { type, ...(scheduleAt && { date: scheduleAt }), posts: [entry] },
        fetchImpl,
      );
      const postId = created[0]?.postId ?? created[0]?.id ?? null;
      results.push({ target, integrationId, status: okStatus, postId, scheduleAt });
    } catch (e) {
      results.push({
        target,
        integrationId,
        status: "failed",
        postId: null,
        scheduleAt,
        error: (e as Error).message,
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
    type,
    scheduleAt,
    results,
    allFailed: results.every((r) => r.status === "failed"),
  };
}
