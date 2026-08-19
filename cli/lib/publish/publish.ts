// Publish orchestrator (#501) — shared by the `ralphy publish` verb and the
// `publish` / `x-post` node executors. Reads the unit, binds accounts, uploads
// media through the Postiz connector, fires ONE create-post request PER target
// (so failures are per-target facts, not one opaque batch error), and appends
// the results to the unit's `publish` provenance array (APPEND-only —
// invariant #14: records are added, never rewritten or dropped).
//
// The readiness gate (`checkPublishReadiness`) requires a `ship` scorecard.
// The chat-driven command is always an explicit human action; unattended
// publish policy belongs to the separate ralphy-farm runtime.

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  projectDir,
  projectWorkspace,
  workspaceDir,
  workspaceUnitsDir,
} from "../paths.js";
import { buildScorecard } from "../scorecard.js";
import {
  UnitManifestSchema,
  type UnitManifest,
  type UnitPublishRecord,
} from "../schemas/unit.js";
import {
  postizIntegrations,
  postizUpload,
  postizCreatePost,
  postizDeletePost,
  type FetchLike,
} from "../providers/postiz.js";
import {
  bindIntegrations,
  buildPostEntry,
  buildDevtoEntry,
  type PublishTarget,
  type PostizSettingsDefaults,
  type UploadedMedia,
} from "./mapping.js";
import { publishIdempotencyKey, findLedgerEntry, appendPublishLedger } from "./ledger.js";
import { rescheduleForQuota, recordQuotaUsage } from "./quota.js";

// ─── readiness gate ─────────────────────────────────────────────────────────

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

// ─── unit manifest I/O ───────────────────────────────────────────────────────

export function unitDirFor(projectId: string, slug: string): string {
  return path.join(projectDir(projectId), "units", slug);
}

export function workspaceUnitDirFor(workspaceId: string, slug: string): string {
  return path.join(workspaceUnitsDir(workspaceId), slug);
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
  projectId?: string;
  workspaceId?: string;
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
}

export interface TargetPublishResult {
  target: PublishTarget;
  integrationId: string;
  /**
   * `idempotent-skip` (#531): the exactly-once ledger already had a
   * `submitted`/`published`/`scheduled` record for this (unit, target, slot), so the
   * platform was NOT called again — the recorded postId/scheduleAt are carried
   * through. It is a SUCCESS, not a failure (never counts toward `allFailed`).
   */
  status: "scheduled" | "submitted" | "published" | "failed" | "idempotent-skip";
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
  /** The prior Postiz post id this result replaced (`--revise` only). */
  revisedFrom?: string;
}

export interface PublishUnitResult {
  project: string | null;
  workspace: string;
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
  if (Boolean(opts.projectId) === Boolean(opts.workspaceId)) {
    throw new Error("publish needs exactly one projectId or workspaceId");
  }
  const workspace = opts.workspaceId ?? opts.workspace ?? projectWorkspace(opts.projectId!);
  const ownerId = opts.projectId ?? `workspace:${opts.workspaceId}`;
  const unitDir = opts.workspaceId
    ? workspaceUnitDirFor(opts.workspaceId, opts.slug)
    : unitDirFor(opts.projectId!, opts.slug);
  const manifest = await readUnitManifest(unitDir);
  if (!manifest) {
    throw new Error(
      `unit '${opts.slug}' not found in ${opts.workspaceId ? `workspace '${opts.workspaceId}'` : `project '${opts.projectId}'`}`,
    );
  }
  if (opts.targets.length === 0) throw new Error("no publish targets given");

  const slot = opts.slot ?? undefined;

  const integrations = await postizIntegrations(fetchImpl, workspace);
  const bound = bindIntegrations(opts.targets, integrations, opts.accounts);
  const defaults = await readPostizDefaults(workspace);

  let textBody: string | undefined;
  if (manifest.text?.body) {
    textBody = manifest.text.body;
  }

  // Upload the unit's ordered media ONCE; every target references the same set.
  // Skip the article body markdown — only images are uploaded (#527 devto).
  const media: UploadedMedia[] = [];
  const uploadedByName: Record<string, UploadedMedia> = {};
  for (const filename of manifest.media.filter(
    (item) => item !== manifest.text?.body && !item.toLowerCase().endsWith(".md"),
  )) {
    const up = await postizUpload(path.join(unitDir, filename), fetchImpl, workspace);
    const ref: UploadedMedia = { id: up.id, path: up.path };
    media.push(ref);
    uploadedByName[filename] = ref;
  }

  // Article units (#527): the body markdown lives in a file. Load it and rewrite
  // any inline image refs to their uploaded Postiz URLs so devto renders them.
  let articleBody: string | undefined;
  if (manifest.format === "article") {
    const bodyFile = manifest.media.find((m) => m.toLowerCase().endsWith(".md"));
    if (bodyFile) {
      articleBody = await fs.readFile(path.join(unitDir, bodyFile), "utf8");
      for (const [name, ref] of Object.entries(uploadedByName)) {
        if (ref.path) articleBody = articleBody.split(`(${name})`).join(`(${ref.path})`);
      }
    }
  }

  const requestedScheduleAt = opts.scheduleAt ?? null;
  const now = opts.now ?? (() => new Date());

  const results: TargetPublishResult[] = [];
  for (const target of opts.targets) {
    const integrationId = bound[target];

    // Exactly-once guard (#531): if the ledger already carries a
    // submitted/published/scheduled record for this (unit, target, slot), do NOT fire the
    // platform again. Reuse the recorded postId AND the recorded scheduleAt (so
    // a re-run does not resample a new cadence time — #525 interplay).
    const key = publishIdempotencyKey({ workspace, projectId: ownerId, slug: opts.slug, target, slot });
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

    // #537: a remote-confirm SECOND belt would go HERE — after the ledger
    // miss, before the fire below — closing the single-appendFileSync crash
    // window (see ledger.ts header). Postiz now lists posts by date range, but
    // exposes no stable client idempotency key; fuzzy content/date matching
    // could skip two intentional same-copy posts, so the guard stays ledger-only.

    // Quota governor (#534): PER-TARGET, so a YT-exhausted + X-OK publish
    // reschedules only YT. When the platform has no headroom in the requested
    // window the schedule is pushed to its next quota window (never dropped,
    // never hard-failed); a platform with no declared quota passes through.
    const q = rescheduleForQuota(workspace, target, requestedScheduleAt, now());
    const targetScheduleAt = q.rescheduled ? q.scheduleAt : requestedScheduleAt;
    const type = targetScheduleAt ? "schedule" : "now";
    const okStatus = targetScheduleAt ? "scheduled" : "submitted";
    const quotaFields = q.rescheduled ? { quotaRescheduledTo: q.scheduleAt, quotaReason: q.reason } : {};

    const identifier = integrations.find((integration) => integration.id === integrationId)?.identifier ?? target;
    const heroName = manifest.article?.hero;
    const entry =
      target === "devto"
        ? buildDevtoEntry(
            integrationId,
            manifest,
            articleBody ?? "",
            heroName ? uploadedByName[heroName] : undefined,
          )
        : buildPostEntry(target, integrationId, manifest, media, identifier, textBody, defaults);
    try {
      const created = await postizCreatePost(
        {
          type,
          date: targetScheduleAt ?? now().toISOString(),
          shortLink: false,
          tags: [],
          posts: [entry],
        },
        fetchImpl,
        workspace,
      );
      const postId = created[0]?.postId ?? created[0]?.id ?? null;
      // Ledger append is the BELT: it lands right after the platform accepts,
      // before/independent of the unit-manifest append below, so a crash
      // between the two is recoverable on the next run via the ledger check.
      appendPublishLedger(workspace, {
        key,
        project: ownerId,
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
    project: opts.projectId ?? null,
    workspace,
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

// ─── the revise run (delete-then-recreate; Postiz has no post-edit API) ──────

export interface RevisePublishOptions {
  projectId?: string;
  workspaceId?: string;
  slug: string;
  targets: PublishTarget[];
  /** Explicit target → Postiz integration-id bindings (win over auto-match). */
  accounts?: Partial<Record<PublishTarget, string>>;
  /** Workspace for the idempotency ledger. Defaults to the project's workspace. */
  workspace?: string;
  /** Injectable fetch (zero-network tests). */
  fetchImpl?: FetchLike;
  /** Clock seam for the still-in-the-future check (deterministic tests). */
  now?: () => Date;
}

/**
 * Re-push the CURRENT unit.json copy into already-SCHEDULED Postiz posts.
 * The public API exposes create / delete / change-status but no post edit, so
 * a revise is delete-then-recreate at the ledger's recorded schedule time.
 * Delete-first is deliberate (fail-closed): a failed create leaves a missing
 * scheduled post — recoverable by re-running revise (the delete tolerates
 * 404 = "already deleted") — never a public double-post. Targets with no prior
 * blocking ledger record, or whose scheduleAt is absent/past (already live),
 * are refused as `failed` rows: revise never touches a live post.
 */
export async function revisePublishUnit(opts: RevisePublishOptions): Promise<PublishUnitResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  if (Boolean(opts.projectId) === Boolean(opts.workspaceId)) {
    throw new Error("revise needs exactly one projectId or workspaceId");
  }
  const workspace = opts.workspaceId ?? opts.workspace ?? projectWorkspace(opts.projectId!);
  const ownerId = opts.projectId ?? `workspace:${opts.workspaceId}`;
  const unitDir = opts.workspaceId
    ? workspaceUnitDirFor(opts.workspaceId, opts.slug)
    : unitDirFor(opts.projectId!, opts.slug);
  const manifest = await readUnitManifest(unitDir);
  if (!manifest) {
    throw new Error(
      `unit '${opts.slug}' not found in ${opts.workspaceId ? `workspace '${opts.workspaceId}'` : `project '${opts.projectId}'`}`,
    );
  }
  if (opts.targets.length === 0) throw new Error("no revise targets given");

  const integrations = await postizIntegrations(fetchImpl, workspace);
  const bound = bindIntegrations(opts.targets, integrations, opts.accounts);
  const defaults = await readPostizDefaults(workspace);
  const textBody = manifest.text?.body;
  const now = opts.now ?? (() => new Date());

  // Upload lazily — only when at least one target passes the revise checks.
  let media: UploadedMedia[] | null = null;
  const uploadedByName: Record<string, UploadedMedia> = {};
  const uploadMedia = async (): Promise<UploadedMedia[]> => {
    if (media) return media;
    media = [];
    for (const filename of manifest.media.filter(
      (item) => item !== manifest.text?.body && !item.toLowerCase().endsWith(".md"),
    )) {
      const up = await postizUpload(path.join(unitDir, filename), fetchImpl, workspace);
      const ref: UploadedMedia = { id: up.id, path: up.path };
      media.push(ref);
      uploadedByName[filename] = ref;
    }
    return media;
  };

  // Article body loader (#527): mirror the publish path — load the markdown body
  // and rewrite inline image refs to their uploaded Postiz URLs.
  const buildArticleBody = async (): Promise<string> => {
    const bodyFile = manifest.media.find((m) => m.toLowerCase().endsWith(".md"));
    if (!bodyFile) return "";
    let body = await fs.readFile(path.join(unitDir, bodyFile), "utf8");
    for (const [name, ref] of Object.entries(uploadedByName)) {
      if (ref.path) body = body.split(`(${name})`).join(`(${ref.path})`);
    }
    return body;
  };

  const results: TargetPublishResult[] = [];
  for (const target of opts.targets) {
    const integrationId = bound[target];
    const key = publishIdempotencyKey({ workspace, projectId: ownerId, slug: opts.slug, target });
    const prior = findLedgerEntry(workspace, key, target);
    if (!prior?.postId) {
      results.push({
        target,
        integrationId,
        status: "failed",
        postId: null,
        scheduleAt: null,
        error: "no prior scheduled publish to revise — use a plain `ralphy publish` first",
      });
      continue;
    }
    if (!prior.scheduleAt || new Date(prior.scheduleAt).getTime() <= now().getTime()) {
      results.push({
        target,
        integrationId,
        status: "failed",
        postId: prior.postId,
        scheduleAt: prior.scheduleAt,
        error: "post is already live — revise only touches future-scheduled posts",
      });
      continue;
    }
    const identifier =
      integrations.find((integration) => integration.id === integrationId)?.identifier ?? target;
    try {
      try {
        await postizDeletePost(prior.postId, fetchImpl, workspace);
      } catch (e) {
        // Postiz DELETE 404 means "already deleted" (an earlier revise's
        // create may have failed after its delete) — proceed to recreate.
        if (!(e as Error).message.includes(" 404:")) throw e;
      }
      const uploaded = await uploadMedia();
      const heroName = manifest.article?.hero;
      const entry =
        target === "devto"
          ? buildDevtoEntry(
              integrationId,
              manifest,
              await buildArticleBody(),
              heroName ? uploadedByName[heroName] : undefined,
            )
          : buildPostEntry(target, integrationId, manifest, uploaded, identifier, textBody, defaults);
      const created = await postizCreatePost(
        {
          type: "schedule",
          date: prior.scheduleAt,
          shortLink: false,
          tags: [],
          posts: [entry],
        },
        fetchImpl,
        workspace,
      );
      const postId = created[0]?.postId ?? created[0]?.id ?? null;
      appendPublishLedger(workspace, {
        key,
        project: ownerId,
        slug: opts.slug,
        target,
        postId,
        scheduleAt: prior.scheduleAt,
        status: "scheduled",
      });
      results.push({
        target,
        integrationId,
        status: "scheduled",
        postId,
        scheduleAt: prior.scheduleAt,
        revisedFrom: prior.postId,
      });
    } catch (e) {
      results.push({
        target,
        integrationId,
        status: "failed",
        postId: null,
        scheduleAt: prior.scheduleAt,
        error: (e as Error).message,
        revisedFrom: prior.postId,
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
      ...(r.revisedFrom && { revisedFrom: r.revisedFrom }),
      at,
      backend: "postiz",
    })),
  );

  return {
    project: opts.projectId ?? null,
    workspace,
    slug: opts.slug,
    unitDir,
    type: "schedule",
    scheduleAt: null,
    results,
    allFailed: results.every((r) => r.status === "failed"),
  };
}

async function readPostizDefaults(workspace: string): Promise<PostizSettingsDefaults> {
  try {
    const manifest = JSON.parse(
      await fs.readFile(path.join(workspaceDir(workspace), "workspace.json"), "utf8"),
    ) as {
      publishing?: { postiz?: { defaults?: PostizSettingsDefaults } };
    };
    return manifest.publishing?.postiz?.defaults ?? {};
  } catch {
    return {};
  }
}
