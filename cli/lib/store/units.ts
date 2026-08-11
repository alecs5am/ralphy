import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import { isValidUnitSlug } from "../schemas/unit.js";
import { appendActivity } from "./activity.js";
import { canonicalPublicJson } from "./canonical-json.js";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { newDomainId } from "./ids.js";
import { resolveObjectPath } from "./internal-objects.js";
import { assertLimit, buildPage, decodeCursor } from "./pagination.js";
import {
  assertFreshPendingRun,
  finishRunAttemptInTransaction,
  finishRunInTransaction,
  recordRunResult,
  startRunInTransaction,
  startRunAttemptInTransaction,
} from "./runs.js";
import {
  resolveQueryContext,
  scopeVisibilityClause,
  type QueryContext,
  type ResolvedScope,
} from "./scope-context.js";
import { assertActiveSessionScope } from "./sessions.js";
import type {
  JsonValue,
  MetricRetentionPoint,
  MetricSnapshotDto,
  MetricTotals,
  Page,
  PresentationCaptionRevisionDto,
  PresentationCaptionState,
  PresentationItemDto,
  PublicationClaimKind,
  PublicationDto,
  PublicationRail,
  PublicationState,
  UnitDto,
  UnitItemDto,
  UnitPresentationDto,
  UnitRevisionDto,
} from "./types.js";
import { StoreConflictError } from "./types.js";
import type {
  MetricSnapshotRow,
  ObjectRow,
  PublicationClaim,
  PublicationFence,
  PublicationRow,
  UnitRevisionRow,
  UnitRow,
} from "./internal-types.js";

type UnitScope =
  | { workspaceId: string; projectId?: never }
  | { workspaceId?: never; projectId: string };

export type CreateUnitInput = UnitScope & {
  slug: string;
  format: string;
};

export type UnitItemInput = {
  artifactRevisionId?: string | null;
  documentRevisionId?: string | null;
  role: string;
  position: number;
  config?: JsonValue | null;
};

export type UnitPresentationInput = {
  platform: string;
  position?: number;
  caption?: string | null;
  captions?: Array<{
    state: PresentationCaptionState;
    text: string;
  }>;
  effectiveCaptionRevisionNo?: number | null;
  coverArtifactRevisionId?: string | null;
  crop?: JsonValue | null;
  safeArea?: JsonValue | null;
  options?: JsonValue;
  items?: Array<{
    unitItemPosition: number;
    position: number;
    config?: JsonValue | null;
  }>;
};

export type ReviseUnitInput = {
  unitId: string;
  expectedLatestRevisionId: string | null;
  parentRevisionId?: string | null;
  iterationId?: string | null;
  note?: string | null;
  metadata?: JsonValue | null;
  authoredBySessionId?: string | null;
  items: UnitItemInput[];
  presentations?: UnitPresentationInput[];
};

export type CreateUnitWithRevisionInput = CreateUnitInput &
  Omit<ReviseUnitInput, "unitId" | "expectedLatestRevisionId" | "parentRevisionId">;

export type AppendMetricSnapshotInput = {
  publicationId: string;
  runId: string;
  position: number;
  source: string;
  asOf: number;
  windowStart?: number | null;
  windowEnd?: number | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  watchTimeMs?: number | null;
  ctr?: number | null;
  retentionCurve?: MetricRetentionPoint[] | null;
  avgViewDurationSec?: number | null;
  note?: string | null;
  raw?: JsonValue | null;
};

export type MetricSnapshotFilter = {
  source?: string;
  asOf?: number;
  windowStart?: number;
  windowEnd?: number;
};

type UnitDbRow = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  slug: string;
  format: string;
  latest_revision_id: string | null;
  selected_revision_id: string | null;
  row_version: number;
  created_at: number;
  updated_at: number;
};

type UnitRevisionDbRow = {
  id: string;
  unit_id: string;
  revision_no: number;
  parent_revision_id: string | null;
  iteration_id: string | null;
  note: string | null;
  metadata_json: string | null;
  authored_by_session_id: string | null;
  created_at: number;
  sealed_at: number | null;
};

type PublicationDbRow = {
  id: string;
  presentation_id: string;
  effective_caption_revision_id: string | null;
  effective_options_json: string;
  social_account_id: string | null;
  submission_run_id: string;
  active_claim_run_id: string | null;
  revised_from_publication_id: string | null;
  rail: PublicationRail;
  provider_publication_id: string | null;
  state: PublicationState;
  url: string | null;
  scheduled_at: number | null;
  submitted_at: number | null;
  published_at: number | null;
  error: string | null;
  failure_stage: string | null;
  idempotency_key: string;
  claim_kind: PublicationClaimKind | null;
  claim_epoch: number;
  claim_token: string | null;
  claim_expires_at: number | null;
  created_at: number;
  updated_at: number;
};

type MetricSnapshotDbRow = {
  id: string;
  publication_id: string;
  source: string;
  as_of: number;
  window_start: number | null;
  window_end: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  watch_time_ms: number | null;
  ctr: number | null;
  retention_curve_json: string | null;
  avg_view_duration_sec: number | null;
  note: string | null;
  raw_json: string | null;
  created_at: number;
};

type UnitItemDtoDbRow = Omit<UnitItemDto, "config"> & {
  configJson: string | null;
};
type UnitPresentationDtoDbRow = Omit<
  UnitPresentationDto,
  "crop" | "safeArea" | "options"
> & {
  cropJson: string | null;
  safeAreaJson: string | null;
  optionsJson: string;
};
type PresentationItemDtoDbRow = Omit<PresentationItemDto, "config"> & {
  configJson: string | null;
};
type PublicationDtoDbRow = Omit<PublicationDto, "effectiveOptions"> & {
  effectiveOptionsJson: string;
};
type MetricSnapshotDtoDbRow = Omit<MetricSnapshotDto, "retentionCurve"> & {
  retentionCurveJson: string | null;
};

const UNIT_COLUMNS =
  "id, workspace_id, project_id, slug, format, latest_revision_id, selected_revision_id, row_version, created_at, updated_at";
const REVISION_COLUMNS =
  "id, unit_id, revision_no, parent_revision_id, iteration_id, note, metadata_json, authored_by_session_id, created_at, sealed_at";
const PUBLICATION_COLUMNS =
  "id, presentation_id, effective_caption_revision_id, effective_options_json, social_account_id, submission_run_id, active_claim_run_id, revised_from_publication_id, rail, provider_publication_id, state, url, scheduled_at, submitted_at, published_at, error, failure_stage, idempotency_key, claim_kind, claim_epoch, claim_token, claim_expires_at, created_at, updated_at";
const METRIC_SNAPSHOT_COLUMNS =
  "id, publication_id, source, as_of, window_start, window_end, views, likes, comments, shares, watch_time_ms, ctr, retention_curve_json, avg_view_duration_sec, note, raw_json, created_at";
const UNIT_DTO_COLUMNS = `unit.id AS id, unit.workspace_id AS workspaceId,
  unit.project_id AS projectId, unit.slug AS slug, unit.format AS format,
  unit.latest_revision_id AS latestRevisionId,
  unit.selected_revision_id AS selectedRevisionId,
  unit.created_at AS createdAt, unit.updated_at AS updatedAt`;
const REVISION_DTO_COLUMNS = `revision.id AS id, revision.unit_id AS unitId,
  revision.revision_no AS revisionNo,
  revision.parent_revision_id AS parentRevisionId,
  revision.iteration_id AS iterationId, revision.note AS note,
  revision.authored_by_session_id AS authoredBySessionId,
  revision.created_at AS createdAt, revision.sealed_at AS sealedAt`;
const ITEM_DTO_COLUMNS = `item.id AS id,
  item.unit_revision_id AS unitRevisionId,
  item.artifact_revision_id AS artifactRevisionId,
  item.document_revision_id AS documentRevisionId, item.role AS role,
  item.position AS position, item.config_json AS configJson,
  item.created_at AS createdAt`;
const PRESENTATION_DTO_COLUMNS = `presentation.id AS id,
  presentation.unit_revision_id AS unitRevisionId,
  presentation.platform AS platform, presentation.position AS position,
  presentation.effective_caption_revision_id AS effectiveCaptionRevisionId,
  presentation.cover_artifact_revision_id AS coverArtifactRevisionId,
  presentation.crop_json AS cropJson,
  presentation.safe_area_json AS safeAreaJson,
  presentation.options_json AS optionsJson,
  presentation.created_at AS createdAt`;
const CAPTION_DTO_COLUMNS = `caption.id AS id,
  caption.presentation_id AS presentationId,
  caption.revision_no AS revisionNo,
  caption.parent_revision_id AS parentRevisionId, caption.state AS state,
  caption.text AS text, caption.created_at AS createdAt`;
const PRESENTATION_ITEM_DTO_COLUMNS = `item.id AS id,
  item.presentation_id AS presentationId, item.unit_item_id AS unitItemId,
  item.position AS position, item.config_json AS configJson,
  item.created_at AS createdAt`;
const PUBLICATION_DTO_COLUMNS = `publication.id AS id,
  publication.presentation_id AS presentationId,
  publication.effective_caption_revision_id AS effectiveCaptionRevisionId,
  publication.effective_options_json AS effectiveOptionsJson,
  publication.social_account_id AS socialAccountId,
  publication.submission_run_id AS submissionRunId,
  publication.revised_from_publication_id AS revisedFromPublicationId,
  publication.rail AS rail,
  publication.provider_publication_id AS providerPublicationId,
  publication.state AS state, publication.url AS url,
  publication.scheduled_at AS scheduledAt,
  publication.submitted_at AS submittedAt,
  publication.published_at AS publishedAt,
  publication.created_at AS createdAt, publication.updated_at AS updatedAt`;
const METRIC_DTO_COLUMNS = `metric.id AS id,
  metric.publication_id AS publicationId, metric.source AS source,
  metric.as_of AS asOf, metric.window_start AS windowStart,
  metric.window_end AS windowEnd, metric.views AS views,
  metric.likes AS likes, metric.comments AS comments,
  metric.shares AS shares, metric.watch_time_ms AS watchTimeMs,
  metric.ctr AS ctr, metric.retention_curve_json AS retentionCurveJson,
  metric.avg_view_duration_sec AS avgViewDurationSec, metric.note AS note,
  metric.created_at AS createdAt`;
const PUBLICATION_RAILS = new Set<PublicationRail>([
  "postiz",
  "github-pages",
  "devto",
  "hashnode",
  "manual",
]);

export function createUnit(input: CreateUnitInput): UnitDto {
  const { slug, format } = checkedUnitIdentity(input);
  return withImmediateTransaction((db) => {
    return createUnitInTransaction(db, input, slug, format);
  });
}

/** Creates one Unit identity and its required first sealed revision atomically. */
export function createUnitWithRevision(
  input: CreateUnitWithRevisionInput,
): UnitRevisionDto {
  const { slug, format } = checkedUnitIdentity(input);
  const prepared = prepareUnitRevision(input);
  return withImmediateTransaction((db) => {
    const unit = createUnitInTransaction(db, input, slug, format);
    return reviseUnitInTransaction(db, {
      ...input,
      unitId: unit.id,
      expectedLatestRevisionId: null,
    }, prepared);
  });
}

export function reviseUnit(input: ReviseUnitInput): UnitRevisionDto {
  if (!Object.hasOwn(input, "expectedLatestRevisionId")) {
    throw new Error("Unit revision requires expectedLatestRevisionId");
  }
  const prepared = prepareUnitRevision(input);
  return withImmediateTransaction((db) =>
    reviseUnitInTransaction(db, input, prepared),
  );
}

function reviseUnitInTransaction(
  db: Database,
  input: ReviseUnitInput,
  prepared: ReturnType<typeof prepareUnitRevision>,
): UnitRevisionDto {
    const { items, presentations, note, metadata } = prepared;
    const unit = getUnitRow(db, input.unitId);
    if (!unit) throw new Error(`Unit not found: ${input.unitId}`);
    const latest = latestRevision(db, unit.id);
    if ((latest?.id ?? null) !== input.expectedLatestRevisionId) {
      throw new StoreConflictError("Unit latest revision conflict");
    }
    const parentId = Object.hasOwn(input, "parentRevisionId")
      ? input.parentRevisionId ?? null
      : latest?.id ?? null;
    if (latest && parentId === null) {
      throw new Error("Only the first Unit revision may have no parent");
    }
    if (!latest && parentId !== null) {
      throw new Error("The first Unit revision cannot have a parent");
    }
    if (parentId !== null) {
      const parent = getRevisionRow(db, parentId);
      if (!parent || parent.unitId !== unit.id || parent.sealedAt === null) {
        throw new Error("Unit revision parent must be sealed in the same Unit");
      }
    }
    assertIteration(db, unit, input.iterationId ?? null);
    if (input.authoredBySessionId != null) {
      assertActiveSessionScope(db, input.authoredBySessionId, unit);
    }
    for (const item of items) assertItemScope(db, unit, item);

    const id = newDomainId("urev");
    const revisionNo = (latest?.revisionNo ?? 0) + 1;
    const now = Date.now();
    db.prepare(
      `INSERT INTO unit_revisions
       (id, unit_id, revision_no, parent_revision_id, iteration_id, note,
        metadata_json, authored_by_session_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      unit.id,
      revisionNo,
      parentId,
      input.iterationId ?? null,
      note,
      serializeJson(metadata),
      input.authoredBySessionId ?? null,
      now,
    );
    const itemIds = new Map<number, string>();
    for (const item of items) {
      const itemId = newDomainId("item");
      itemIds.set(item.position, itemId);
      db.prepare(
        `INSERT INTO unit_items
         (id, unit_revision_id, artifact_revision_id, document_revision_id,
          role, position, config_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        itemId,
        id,
        item.artifactRevisionId,
        item.documentRevisionId,
        item.role,
        item.position,
        serializeJson(item.config),
        now,
      );
    }
    for (const presentation of presentations) {
      const presentationId = newDomainId("pres");
      db.prepare(
        `INSERT INTO unit_presentations
         (id, unit_revision_id, platform, position, cover_artifact_revision_id,
          crop_json, safe_area_json, options_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        presentationId,
        id,
        presentation.platform,
        presentation.position,
        presentation.coverArtifactRevisionId,
        serializeJson(presentation.crop),
        serializeJson(presentation.safeArea),
        JSON.stringify(presentation.options),
        now,
      );
      let parentId: string | null = null;
      const captionIds = new Map<number, string>();
      for (const caption of presentation.captions) {
        const captionId = newDomainId("caption");
        captionIds.set(caption.revisionNo, captionId);
        db.prepare(
          `INSERT INTO presentation_caption_revisions
           (id, presentation_id, revision_no, parent_revision_id, state, text, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          captionId,
          presentationId,
          caption.revisionNo,
          parentId,
          caption.state,
          caption.text,
          now,
        );
        parentId = captionId;
      }
      const effectiveCaptionId =
        presentation.effectiveCaptionRevisionNo === null
          ? null
          : captionIds.get(presentation.effectiveCaptionRevisionNo) ?? null;
      if (effectiveCaptionId !== null) {
        db.prepare(
          "UPDATE unit_presentations SET effective_caption_revision_id = ? WHERE id = ?",
        ).run(effectiveCaptionId, presentationId);
      }
      for (const item of presentation.items) {
        db.prepare(
          `INSERT INTO presentation_items
           (id, presentation_id, unit_item_id, position, config_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
          newDomainId("pitem"),
          presentationId,
          itemIds.get(item.unitItemPosition)!,
          item.position,
          serializeJson(item.config),
          now,
        );
      }
    }
    db.prepare("UPDATE unit_revisions SET sealed_at = ? WHERE id = ?").run(
      now,
      id,
    );
    appendActivity(db, {
      workspaceId: unit.workspaceId,
      projectId: unit.projectId,
      entityType: "unit_revision",
      entityId: id,
      action: "unit.revised",
      payload: { unitId: unit.id, revisionNo, parentRevisionId: parentId },
      createdAt: now,
    });
    return toRevisionDto(getRevisionRow(db, id)!);
}

function checkedUnitIdentity(input: CreateUnitInput): {
  slug: string;
  format: string;
} {
  if (!isValidUnitSlug(input.slug)) {
    throw new Error("Unit slug must be canonical kebab-case");
  }
  if (!isValidUnitSlug(input.format)) {
    throw new Error("Unit format must be canonical kebab-case");
  }
  return { slug: input.slug, format: input.format };
}

function prepareUnitRevision(input: Pick<
  ReviseUnitInput,
  "items" | "presentations" | "note" | "metadata"
>) {
  const items = checkedItems(input.items);
  return {
    items,
    presentations: checkedPresentations(input.presentations ?? [], items),
    note: optionalText(input.note, "Unit revision note"),
    metadata: canonicalOptionalJson(input.metadata, "Unit revision metadata"),
  };
}

function createUnitInTransaction(
  db: Database,
  input: CreateUnitInput,
  slug: string,
  format: string,
): UnitDto {
  const scope = resolveScope(db, input);
  const id = newDomainId("unit");
  const now = Date.now();
  db.prepare(
    `INSERT INTO units
     (id, workspace_id, project_id, slug, format, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, scope.workspaceId, scope.projectId, slug, format, now, now);
  appendActivity(db, {
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    entityType: "unit",
    entityId: id,
    action: "unit.created",
    payload: { format, slug },
    createdAt: now,
  });
  return toUnitDto(getUnitRow(db, id)!);
}

export function selectUnitRevision(input: {
  unitId: string;
  revisionId: string;
  expectedSelectedRevisionId: string | null;
}): UnitDto {
  if (!Object.hasOwn(input, "expectedSelectedRevisionId")) {
    throw new Error("Unit selection requires expectedSelectedRevisionId");
  }
  return withImmediateTransaction((db) => {
    const unit = getUnitRow(db, input.unitId);
    if (!unit) throw new Error(`Unit not found: ${input.unitId}`);
    const revision = getRevisionRow(db, input.revisionId);
    if (!revision || revision.unitId !== unit.id || revision.sealedAt === null) {
      throw new Error("Unit revision must be sealed in the same Unit");
    }
    const now = Date.now();
    const result = db.prepare(
      `UPDATE units SET selected_revision_id = ?, row_version = row_version + 1,
       updated_at = ? WHERE id = ? AND selected_revision_id IS ?`,
    ).run(revision.id, now, unit.id, input.expectedSelectedRevisionId);
    if (!result.changes) throw new StoreConflictError("Unit selection conflict");
    appendActivity(db, {
      workspaceId: unit.workspaceId,
      projectId: unit.projectId,
      entityType: "unit",
      entityId: unit.id,
      action: "unit.selected",
      payload: {
        fromRevisionId: input.expectedSelectedRevisionId,
        revisionId: revision.id,
      },
      createdAt: now,
    });
    return toUnitDto(getUnitRow(db, unit.id)!);
  });
}

export type RecordPublicationInput = {
  presentationId: string;
  socialAccountId?: string | null;
  submissionRunId: string;
  rail: PublicationRail;
  idempotencyKey: string;
  scheduledAt?: number | null;
  revisedFromPublicationId?: string | null;
  state?: "draft" | "failed";
  error?: string | null;
  failureStage?: "account-resolution" | "preflight" | null;
};

export function recordPublication(input: RecordPublicationInput): PublicationDto {
  const prepared = preparePublicationRecord(input);
  return withImmediateTransaction((db) =>
    recordPublicationInTransaction(db, input, prepared),
  );
}

function preparePublicationRecord(input: RecordPublicationInput) {
  if (!PUBLICATION_RAILS.has(input.rail)) {
    throw new Error(`Unsupported Publication rail: ${input.rail}`);
  }
  const idempotencyKey = checkedText(
    input.idempotencyKey,
    "Publication idempotency key",
  );
  const scheduledAt = checkedOptionalTimestamp(
    input.scheduledAt,
    "Publication scheduledAt",
  );
  const state = input.state ?? "draft";
  if (state !== "draft" && state !== "failed") {
    throw new Error("Publication may be recorded only as draft or failed preflight");
  }
  return { idempotencyKey, scheduledAt, state };
}

function recordPublicationInTransaction(
  db: Database,
  input: RecordPublicationInput,
  prepared: ReturnType<typeof preparePublicationRecord>,
): PublicationDto {
    const { idempotencyKey, scheduledAt, state } = prepared;
    const existing = getPublicationByKey(db, idempotencyKey);
    if (existing) {
      if (
        existing.presentationId !== input.presentationId ||
        existing.socialAccountId !== (input.socialAccountId ?? null) ||
        existing.submissionRunId !== input.submissionRunId ||
        existing.rail !== input.rail
      ) {
        throw new StoreConflictError(
          "Publication idempotency key belongs to another attempt",
        );
      }
      const scope = publicationScope(db, existing.presentationId)!;
      appendActivity(db, {
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        entityType: "publication",
        entityId: existing.id,
        action: "publication.idempotent_skip",
        payload: {},
      });
      return toPublicationDto(existing);
    }
    const scope = publicationScope(db, input.presentationId);
    if (!scope) throw new Error(`Unit Presentation not found: ${input.presentationId}`);
    if (scope.sealedAt === null) {
      throw new Error("Publication requires a sealed Unit Presentation");
    }
    assertFreshPendingRun(db, input.submissionRunId, scope);
    const failedPreflight = state === "failed";
    assertPublicationAccount(db, {
      scope,
      rail: input.rail,
      socialAccountId: input.socialAccountId ?? null,
      failedPreflight,
    });
    if (failedPreflight) {
      if (
        (input.failureStage !== "account-resolution" &&
          input.failureStage !== "preflight") ||
        !input.error
      ) {
        throw new Error("Failed preflight Publication requires a failure stage and error");
      }
    } else if (input.failureStage != null || input.error != null) {
      throw new Error("Draft Publication cannot contain failure data");
    }
    const revisedFrom = input.revisedFromPublicationId
      ? getPublicationRow(db, input.revisedFromPublicationId)
      : null;
    if (input.revisedFromPublicationId && !revisedFrom) {
      throw new Error(`Publication not found: ${input.revisedFromPublicationId}`);
    }
    if (revisedFrom) {
      const previousScope = publicationScope(db, revisedFrom.presentationId)!;
      if (previousScope.workspaceId !== scope.workspaceId) {
        throw new Error("Revised Publication must belong to the same Workspace");
      }
    }
    const id = newDomainId("pub");
    const now = Date.now();
    db.prepare(
      `INSERT INTO publications
       (id, presentation_id, effective_caption_revision_id,
        effective_options_json, social_account_id, submission_run_id,
        revised_from_publication_id, rail, state, scheduled_at, error,
        failure_stage, idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      scope.presentationId,
      scope.effectiveCaptionRevisionId,
      JSON.stringify(scope.options),
      input.socialAccountId ?? null,
      input.submissionRunId,
      revisedFrom?.id ?? null,
      input.rail,
      state,
      scheduledAt,
      input.error ?? null,
      input.failureStage ?? null,
      idempotencyKey,
      now,
      now,
    );
    if (failedPreflight) {
      recordRunResult(db, {
        runId: input.submissionRunId,
        position: 0,
        entityType: "publication",
        entityId: id,
      });
      finishRunInTransaction(db, input.submissionRunId, {
        state: "failed",
        error: input.error,
      });
    }
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      entityType: "publication",
      entityId: id,
      action: "publication.recorded",
      payload: { rail: input.rail, state },
      createdAt: now,
    });
    return toPublicationDto(getPublicationRow(db, id)!);
}

export function claimPublication(
  id: string,
  expectedState: "draft",
  leaseMs: number,
): PublicationClaim {
  const lease = checkedLease(leaseMs);
  return withImmediateTransaction((db) =>
    claimPublicationInTransaction(db, id, expectedState, lease),
  );
}

function claimPublicationInTransaction(
  db: Database,
  id: string,
  expectedState: "draft",
  lease: number,
): PublicationClaim {
    const publication = requirePublication(db, id);
    if (publication.state !== expectedState || publication.state !== "draft") {
      throw new StoreConflictError("Publication state conflict");
    }
    const scope = publicationScope(db, publication.presentationId)!;
    assertFreshPendingRun(db, publication.submissionRunId, scope);
    const epoch = publication.claimEpoch + 1;
    const token = randomUUID();
    const now = Date.now();
    const expiresAt = now + lease;
    const changed = db.prepare(
      `UPDATE publications
       SET state = 'submitting', active_claim_run_id = submission_run_id,
           claim_kind = 'submission', claim_epoch = ?, claim_token = ?,
           claim_expires_at = ?, updated_at = ?
       WHERE id = ? AND state = 'draft' AND claim_token IS NULL`,
    ).run(epoch, token, expiresAt, now, publication.id);
    if (!changed.changes) throw new StoreConflictError("Publication claim conflict");
    startRunAttemptInTransaction(db, {
      runId: publication.submissionRunId,
      provider: publication.rail,
      request: {
        publicationId: publication.id,
        presentationId: publication.presentationId,
        socialAccountId: publication.socialAccountId,
        captionRevisionId: publication.effectiveCaptionRevisionId,
        options: publication.effectiveOptions,
        scheduledAt: publication.scheduledAt,
        operation: "submit",
      },
    });
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      entityType: "publication",
      entityId: publication.id,
      action: "publication.claimed",
      payload: { kind: "submission", epoch },
      createdAt: now,
    });
    return {
      publication: toPublicationDto(getPublicationRow(db, publication.id)!),
      fence: {
        kind: "submission",
        runId: publication.submissionRunId,
        epoch,
        token,
        expiresAt,
      },
    };
}

export function startPublicationSubmission(input: {
  presentationId: string;
  socialAccountId?: string | null;
  rail: PublicationRail;
  idempotencyKey: string;
  scheduledAt?: number | null;
  revisedFromPublicationId?: string | null;
  agentSessionId?: string | null;
  leaseMs: number;
  failedPreflight?: { error: string; failureStage: "account-resolution" | "preflight" };
}): {
  publication: PublicationDto;
  claim: PublicationClaim | null;
  replayed: boolean;
} {
  const lease = checkedLease(input.leaseMs);
  const prepared = preparePublicationRecord({
    ...input,
    submissionRunId: "pending-allocation",
  });
  return withImmediateTransaction((db) => {
    const existing = getPublicationByKey(db, prepared.idempotencyKey);
    if (existing) {
      if (
        existing.presentationId !== input.presentationId ||
        existing.socialAccountId !== (input.socialAccountId ?? null) ||
        existing.rail !== input.rail ||
        existing.scheduledAt !== prepared.scheduledAt ||
        existing.revisedFromPublicationId !== (input.revisedFromPublicationId ?? null)
      ) {
        throw new StoreConflictError(
          "Publication idempotency key belongs to another attempt",
        );
      }
      if (existing.state === "draft") {
        if (input.failedPreflight) {
          const now = Date.now();
          const epoch = existing.claimEpoch + 1;
          const token = randomUUID();
          const expiresAt = now + lease;
          const fenced = db.prepare(
            `UPDATE publications
             SET state = 'submitting', active_claim_run_id = submission_run_id,
                 claim_kind = 'submission', claim_epoch = ?, claim_token = ?,
                 claim_expires_at = ?, updated_at = ?
             WHERE id = ? AND state = 'draft' AND claim_token IS NULL`,
          ).run(epoch, token, expiresAt, now, existing.id);
          if (!fenced.changes) {
            throw new StoreConflictError("Publication preflight conflict");
          }
          const changed = db.prepare(
            `UPDATE publications
             SET state = 'failed', active_claim_run_id = NULL,
                 claim_kind = NULL, claim_token = NULL, claim_expires_at = NULL,
                 error = ?, failure_stage = ?, updated_at = ?
             WHERE id = ? AND state = 'submitting' AND claim_kind = 'submission'
               AND claim_epoch = ? AND claim_token = ?`,
          ).run(
            input.failedPreflight.error,
            input.failedPreflight.failureStage,
            now,
            existing.id,
            epoch,
            token,
          );
          if (!changed.changes) {
            throw new StoreConflictError("Publication preflight conflict");
          }
          recordRunResult(db, {
            runId: existing.submissionRunId,
            position: 0,
            entityType: "publication",
            entityId: existing.id,
          });
          finishRunInTransaction(db, existing.submissionRunId, {
            state: "failed",
            error: input.failedPreflight.error,
          });
          const scope = publicationScope(db, existing.presentationId)!;
          appendActivity(db, {
            workspaceId: scope.workspaceId,
            projectId: scope.projectId,
            entityType: "publication",
            entityId: existing.id,
            action: "publication.finished",
            payload: { kind: "submission", state: "failed" },
            createdAt: now,
          });
          return {
            publication: toPublicationDto(getPublicationRow(db, existing.id)!),
            claim: null,
            replayed: false,
          };
        }
        const claim = claimPublicationInTransaction(db, existing.id, "draft", lease);
        return { publication: claim.publication, claim, replayed: false };
      }
      const scope = publicationScope(db, existing.presentationId)!;
      appendActivity(db, {
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        entityType: "publication",
        entityId: existing.id,
        action: "publication.idempotent_skip",
        payload: {},
      });
      return { publication: toPublicationDto(existing), claim: null, replayed: true };
    }

    const scope = publicationScope(db, input.presentationId);
    if (!scope) throw new Error(`Unit Presentation not found: ${input.presentationId}`);
    if (scope.sealedAt === null) {
      throw new Error("Publication requires a sealed Unit Presentation");
    }
    const run = startRunInTransaction(db, {
      ...(scope.projectId === null
        ? { workspaceId: scope.workspaceId }
        : { projectId: scope.projectId }),
      agentSessionId: input.agentSessionId,
      kind: "publication-submit",
      label: scope.platform,
    });
    const missingAccount = publicationRailRequiresAccount(input.rail) &&
      input.socialAccountId == null;
    const failedPreflight = input.failedPreflight ?? (missingAccount
      ? {
          error: `${input.rail} Publication requires a social account`,
          failureStage: "account-resolution" as const,
        }
      : null);
    const recordInput: RecordPublicationInput = {
      ...input,
      submissionRunId: run.id,
      ...(failedPreflight
        ? {
            state: "failed" as const,
            error: failedPreflight.error,
            failureStage: failedPreflight.failureStage,
          }
        : {}),
    };
    const publication = recordPublicationInTransaction(
      db,
      recordInput,
      preparePublicationRecord(recordInput),
    );
    if (failedPreflight) {
      return { publication, claim: null, replayed: false };
    }
    const claim = claimPublicationInTransaction(db, publication.id, "draft", lease);
    return { publication: claim.publication, claim, replayed: false };
  });
}

type PublicationOperationState = "succeeded" | "failed";

type FinishPublicationInput = {
  fence: PublicationFence;
  operationState?: PublicationOperationState;
  state:
    | "scheduled"
    | "submitted"
    | "published"
    | "failed"
    | "cancelled"
    | "reconciliation_required"
    | "unknown";
  providerPublicationId?: string | null;
  url?: string | null;
  submittedAt?: number | null;
  publishedAt?: number | null;
  error?: string | null;
  failureStage?: string | null;
  response?: JsonValue | null;
  costUsd?: number | null;
};

export function finishPublicationClaim(
  id: string,
  input: FinishPublicationInput,
): PublicationDto {
  if (
    input.fence.kind !== "submission" &&
    input.fence.kind !== "reconciliation"
  ) {
    throw new Error(
      "Status lookup and cancellation require their dedicated finish API",
    );
  }
  const operationState =
    input.fence.kind === "submission"
      ? submissionOperationState(input.state)
      : checkedOperationState(input.operationState);
  return finishPublicationOperation(id, input, input.fence.kind, operationState);
}

export function finishPublicationStatusLookup(
  id: string,
  input: FinishPublicationInput & { operationState: PublicationOperationState },
): PublicationDto {
  return finishPublicationOperation(
    id,
    input,
    "status-lookup",
    checkedOperationState(input.operationState),
  );
}

export function finishPublicationCancellation(
  id: string,
  input: FinishPublicationInput & { operationState: PublicationOperationState },
): PublicationDto {
  return finishPublicationOperation(
    id,
    input,
    "cancellation",
    checkedOperationState(input.operationState),
  );
}

function finishPublicationOperation(
  id: string,
  input: FinishPublicationInput,
  expectedKind: PublicationClaimKind,
  operationState: PublicationOperationState,
): PublicationDto {
  const submittedAt = checkedOptionalTimestamp(
    input.submittedAt,
    "Publication submittedAt",
  );
  const publishedAt = checkedOptionalTimestamp(
    input.publishedAt,
    "Publication publishedAt",
  );
  const providerUrl = checkedPublicationUrl(input.url);
  return withImmediateTransaction((db) => {
    const publication = requirePublication(db, id);
    if (input.fence.kind !== expectedKind) {
      throw new StoreConflictError("Publication claim kind is invalid");
    }
    assertPublicationFence(db, publication, input.fence);
    if (publication.claimExpiresAt! < Date.now()) {
      throw new StoreConflictError("Publication claim is expired");
    }
    assertPublicationClaimOutcome(
      publication,
      expectedKind,
      input.state,
      operationState,
    );
    if (
      input.state === "submitted" &&
      submittedAt === null &&
      publication.submittedAt === null
    ) {
      throw new Error("Submitted Publication requires submittedAt");
    }
    if (
      input.state === "published" &&
      publishedAt === null &&
      publication.publishedAt === null
    ) {
      throw new Error("Published Publication requires publishedAt");
    }
    const effectiveSubmittedAt = submittedAt ?? publication.submittedAt;
    const effectivePublishedAt = publishedAt ?? publication.publishedAt;
    if (
      effectivePublishedAt !== null &&
      effectiveSubmittedAt !== null &&
      effectivePublishedAt < effectiveSubmittedAt
    ) {
      throw new Error("Publication publishedAt must not precede submittedAt");
    }
    if (
      effectivePublishedAt !== null &&
      publication.scheduledAt !== null &&
      effectivePublishedAt < publication.scheduledAt
    ) {
      throw new Error("Publication publishedAt must not precede scheduledAt");
    }
    const attempt = runningAttempt(db, input.fence.runId);
    const operationError = operationState === "failed" ? input.error : null;
    finishRunAttemptInTransaction(db, attempt.id, {
      state: operationState,
      response: input.response,
      costUsd: input.costUsd,
      error: operationError,
    });
    const now = Date.now();
    const changed = db.prepare(
      `UPDATE publications
       SET state = ?, provider_publication_id = COALESCE(?, provider_publication_id),
           url = COALESCE(?, url), submitted_at = COALESCE(?, submitted_at),
           published_at = COALESCE(?, published_at), error = ?, failure_stage = ?,
           active_claim_run_id = NULL, claim_kind = NULL, claim_token = NULL,
           claim_expires_at = NULL, updated_at = ?
       WHERE id = ? AND claim_epoch = ? AND claim_token = ?`,
    ).run(
      input.state,
      optionalText(input.providerPublicationId, "Provider Publication ID"),
      providerUrl,
      submittedAt,
      publishedAt,
      input.error ?? null,
      input.failureStage ?? null,
      now,
      publication.id,
      input.fence.epoch,
      input.fence.token,
    );
    if (!changed.changes) {
      throw new StoreConflictError("Publication claim fence is stale");
    }
    recordRunResult(db, {
      runId: input.fence.runId,
      position: 0,
      entityType: "publication",
      entityId: publication.id,
    });
    finishRunInTransaction(db, input.fence.runId, {
      state: operationState,
      error: operationError,
    });
    const scope = publicationScope(db, publication.presentationId)!;
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      entityType: "publication",
      entityId: publication.id,
      action: publicationFinishAction(expectedKind),
      payload: { kind: expectedKind, operationState, state: input.state },
      createdAt: now,
    });
    return toPublicationDto(getPublicationRow(db, publication.id)!);
  });
}

export function requestPublicationReconciliation(
  id: string,
  input: {
    fence: PublicationFence;
    state: "reconciliation_required" | "unknown";
    error: string;
  },
): PublicationDto {
  const error = checkedText(input.error, "Publication reconciliation error");
  return withImmediateTransaction((db) => {
    const publication = requirePublication(db, id);
    if (input.fence.kind !== "submission" || publication.state !== "submitting") {
      throw new StoreConflictError(
        "Only an expired submission may request reconciliation",
      );
    }
    assertPublicationFence(db, publication, input.fence);
    if (publication.claimExpiresAt! >= Date.now()) {
      throw new StoreConflictError("Publication claim is still live");
    }
    const attempt = runningAttempt(db, input.fence.runId);
    finishRunAttemptInTransaction(db, attempt.id, {
      state: "failed",
      response: { outcome: "unknown" },
      error,
    });
    const now = Date.now();
    const changed = db.prepare(
      `UPDATE publications
       SET state = ?, active_claim_run_id = NULL, claim_kind = NULL,
           claim_epoch = claim_epoch + 1, claim_token = NULL,
           claim_expires_at = NULL, error = ?, failure_stage = 'provider-outcome',
           updated_at = ?
       WHERE id = ? AND claim_epoch = ? AND claim_token = ?
         AND claim_expires_at < ?`,
    ).run(
      input.state,
      error,
      now,
      publication.id,
      input.fence.epoch,
      input.fence.token,
      now,
    );
    if (!changed.changes) {
      throw new StoreConflictError("Publication claim fence is stale");
    }
    recordRunResult(db, {
      runId: input.fence.runId,
      position: 0,
      entityType: "publication",
      entityId: publication.id,
    });
    finishRunInTransaction(db, input.fence.runId, { state: "failed", error });
    const scope = publicationScope(db, publication.presentationId)!;
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      entityType: "publication",
      entityId: publication.id,
      action: "publication.reconciliation_requested",
      payload: { state: input.state },
      createdAt: now,
    });
    return toPublicationDto(getPublicationRow(db, publication.id)!);
  });
}

export type ExpirePublicationOperationClaimInput =
  | {
      expectedKind: "status-lookup";
      expectedEpoch: number;
      expectedState: "scheduled" | "submitted";
      nextState?: never;
      error: string;
    }
  | {
      expectedKind: "cancellation";
      expectedEpoch: number;
      expectedState: "scheduled" | "submitted";
      nextState: "reconciliation_required" | "unknown";
      error: string;
    }
  | {
      expectedKind: "reconciliation";
      expectedEpoch: number;
      expectedState: "reconciliation_required";
      nextState: "reconciliation_required" | "unknown";
      error: string;
    };

export function expirePublicationOperationClaim(
  id: string,
  input: ExpirePublicationOperationClaimInput,
): PublicationDto {
  if (!Number.isSafeInteger(input.expectedEpoch) || input.expectedEpoch < 1) {
    throw new Error("Publication claim epoch must be a positive integer");
  }
  const error = checkedText(input.error, "Publication operation expiry error");
  return withImmediateTransaction((db) => {
    const publication = requirePublication(db, id);
    if (
      publication.claimKind !== input.expectedKind ||
      publication.claimEpoch !== input.expectedEpoch ||
      publication.state !== input.expectedState ||
      publication.activeClaimRunId === null ||
      publication.claimExpiresAt === null
    ) {
      throw new StoreConflictError("Publication operation claim is stale");
    }
    const now = Date.now();
    if (publication.claimExpiresAt >= now) {
      throw new StoreConflictError("Publication operation claim is still live");
    }
    const nextState =
      input.expectedKind === "status-lookup"
        ? publication.state
        : input.nextState;
    const attempt = runningAttempt(db, publication.activeClaimRunId);
    finishRunAttemptInTransaction(db, attempt.id, {
      state: "failed",
      response: { kind: input.expectedKind, outcome: "claim-expired" },
      error,
    });
    const changed = db.prepare(
      `UPDATE publications
       SET state = ?, active_claim_run_id = NULL, claim_kind = NULL,
           claim_epoch = claim_epoch + 1, claim_token = NULL,
           claim_expires_at = NULL, error = ?, failure_stage = 'claim-expired',
           updated_at = ?
       WHERE id = ? AND claim_kind = ? AND claim_epoch = ? AND state = ?
         AND claim_expires_at < ?`,
    ).run(
      nextState,
      error,
      now,
      publication.id,
      input.expectedKind,
      input.expectedEpoch,
      input.expectedState,
      now,
    );
    if (!changed.changes) {
      throw new StoreConflictError("Publication operation claim is stale");
    }
    recordRunResult(db, {
      runId: publication.activeClaimRunId,
      position: 0,
      entityType: "publication",
      entityId: publication.id,
    });
    finishRunInTransaction(db, publication.activeClaimRunId, {
      state: "failed",
      error,
    });
    const scope = publicationScope(db, publication.presentationId)!;
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      entityType: "publication",
      entityId: publication.id,
      action: "publication.operation_claim_expired",
      payload: {
        epoch: input.expectedEpoch,
        kind: input.expectedKind,
        state: nextState,
      },
      createdAt: now,
    });
    return toPublicationDto(getPublicationRow(db, publication.id)!);
  });
}

export function claimPublicationReconciliation(
  id: string,
  expectedState: "unknown" | "reconciliation_required",
  runId: string,
  leaseMs: number,
): PublicationClaim {
  return claimPublicationOperation(
    id,
    expectedState,
    runId,
    checkedLease(leaseMs),
    "reconciliation",
  );
}

export function claimPublicationStatusLookup(
  id: string,
  expectedState: "scheduled" | "submitted",
  runId: string,
  leaseMs: number,
): PublicationClaim {
  return claimPublicationOperation(
    id,
    expectedState,
    runId,
    checkedLease(leaseMs),
    "status-lookup",
  );
}

export function claimPublicationCancellation(
  id: string,
  expectedState: "scheduled" | "submitted",
  runId: string,
  leaseMs: number,
): PublicationClaim {
  return claimPublicationOperation(
    id,
    expectedState,
    runId,
    checkedLease(leaseMs),
    "cancellation",
  );
}

export function cancelDraftPublication(
  id: string,
  expectedState: "draft",
): PublicationDto {
  return withImmediateTransaction((db) => {
    const publication = requirePublication(db, id);
    if (publication.state !== "draft" || publication.state !== expectedState) {
      throw new StoreConflictError("Publication state conflict");
    }
    const scope = publicationScope(db, publication.presentationId)!;
    assertFreshPendingRun(db, publication.submissionRunId, scope);
    const now = Date.now();
    db.prepare(
      "UPDATE publications SET state = 'cancelled', updated_at = ? WHERE id = ? AND state = 'draft'",
    ).run(now, publication.id);
    recordRunResult(db, {
      runId: publication.submissionRunId,
      position: 0,
      entityType: "publication",
      entityId: publication.id,
    });
    finishRunInTransaction(db, publication.submissionRunId, {
      state: "cancelled",
    });
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      entityType: "publication",
      entityId: publication.id,
      action: "publication.cancelled",
      payload: { kind: "draft" },
      createdAt: now,
    });
    return toPublicationDto(getPublicationRow(db, publication.id)!);
  });
}

function claimPublicationOperation(
  id: string,
  expectedState: "scheduled" | "submitted" | "unknown" | "reconciliation_required",
  runId: string,
  leaseMs: number,
  kind: Exclude<PublicationClaimKind, "submission">,
): PublicationClaim {
  return withImmediateTransaction((db) =>
    claimPublicationOperationInTransaction(
      db,
      id,
      expectedState,
      runId,
      leaseMs,
      kind,
    ),
  );
}

function claimPublicationOperationInTransaction(
  db: Database,
  id: string,
  expectedState: "scheduled" | "submitted" | "unknown" | "reconciliation_required",
  runId: string,
  leaseMs: number,
  kind: Exclude<PublicationClaimKind, "submission">,
): PublicationClaim {
    const publication = requirePublication(db, id);
    if (publication.state !== expectedState || publication.claimKind !== null) {
      throw new StoreConflictError("Publication state or claim conflict");
    }
    assertPublicationClaimSource(kind, expectedState);
    const reservedRun = db
      .query<{ id: string }, [string, string]>(
        `SELECT id FROM publications
         WHERE submission_run_id = ? OR active_claim_run_id = ? LIMIT 1`,
      )
      .get(runId, runId);
    if (reservedRun) {
      throw new Error(
        "Publication follow-up Run is already reserved by another Publication",
      );
    }
    const scope = publicationScope(db, publication.presentationId)!;
    assertFreshPendingRun(db, runId, scope);
    const epoch = publication.claimEpoch + 1;
    const token = randomUUID();
    const now = Date.now();
    const expiresAt = now + leaseMs;
    const state =
      kind === "reconciliation" && publication.state === "unknown"
        ? "reconciliation_required"
        : publication.state;
    const result = db.prepare(
      `UPDATE publications
       SET state = ?, active_claim_run_id = ?, claim_kind = ?,
           claim_epoch = ?, claim_token = ?, claim_expires_at = ?, updated_at = ?
       WHERE id = ? AND state = ? AND claim_token IS NULL`,
    ).run(
      state,
      runId,
      kind,
      epoch,
      token,
      expiresAt,
      now,
      publication.id,
      expectedState,
    );
    if (!result.changes) throw new StoreConflictError("Publication claim conflict");
    startRunAttemptInTransaction(db, {
      runId,
      provider: publication.rail,
      request: {
        publicationId: publication.id,
        providerPublicationId: publication.providerPublicationId,
        operation: kind,
      },
    });
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      entityType: "publication",
      entityId: publication.id,
      action: publicationClaimAction(kind),
      payload: { kind, epoch },
      createdAt: now,
    });
    return {
      publication: toPublicationDto(getPublicationRow(db, publication.id)!),
      fence: {
        kind,
        runId,
        epoch,
        token,
        expiresAt,
      },
    };
}

export function startPublicationFollowUp(input: {
  publicationId: string;
  expectedState: "scheduled" | "submitted" | "unknown" | "reconciliation_required";
  kind: Exclude<PublicationClaimKind, "submission">;
  agentSessionId?: string | null;
  leaseMs: number;
}): PublicationClaim {
  const lease = checkedLease(input.leaseMs);
  return withImmediateTransaction((db) => {
    const publication = requirePublication(db, input.publicationId);
    const scope = publicationScope(db, publication.presentationId)!;
    const run = startRunInTransaction(db, {
      ...(scope.projectId === null
        ? { workspaceId: scope.workspaceId }
        : { projectId: scope.projectId }),
      agentSessionId: input.agentSessionId,
      kind: `publication-${input.kind}`,
      label: scope.platform,
    });
    return claimPublicationOperationInTransaction(
      db,
      publication.id,
      input.expectedState,
      run.id,
      lease,
      input.kind,
    );
  });
}

export function getUnit(input: {
  context: QueryContext;
  unitId: string;
}): UnitDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const unit = getVisibleUnitDto(db, scope, input.unitId);
  if (!unit) throw new Error(`Unit not found: ${input.unitId}`);
  return unit;
}

export function listUnits(input: {
  context: QueryContext;
  after?: string | null;
  limit: number;
}): Page<UnitDto> {
  assertLimit(input.limit);
  const cursor = input.after == null ? null : decodeCursor("c1", input.after);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const visibility = scopeVisibilityClause(
    scope,
    "unit.workspace_id",
    "unit.project_id",
  );
  const rows = db.query<UnitDto, (string | number)[]>(
    `SELECT ${UNIT_DTO_COLUMNS} FROM units unit
     WHERE ${visibility.sql}
       AND (unit.created_at > ? OR
            (unit.created_at = ? AND unit.id > ?))
     ORDER BY unit.created_at ASC, unit.id ASC LIMIT ?`,
  ).all(
    ...visibility.values,
    cursor?.ordinal ?? -1,
    cursor?.ordinal ?? -1,
    cursor?.id ?? "",
    input.limit + 1,
  );
  return buildPage(rows, input.limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

export function getUnitRevision(input: {
  context: QueryContext;
  revisionId: string;
}): UnitRevisionDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const revision = getVisibleRevisionDto(db, scope, input.revisionId);
  if (!revision) throw new Error(`Unit Revision not found: ${input.revisionId}`);
  return revision;
}

export function listUnitRevisions(input: {
  context: QueryContext;
  unitId: string;
  order?: "oldest" | "newest";
  after?: string | null;
  limit: number;
}): Page<UnitRevisionDto> {
  assertLimit(input.limit);
  const order = input.order ?? "oldest";
  if (order !== "oldest" && order !== "newest") {
    throw new Error(`Invalid history order: ${String(order)}`);
  }
  const newest = order === "newest";
  const family = newest ? "v2" : "v1";
  const cursor = input.after == null ? null : decodeCursor(family, input.after);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  if (!getVisibleUnitDto(db, scope, input.unitId)) {
    throw new Error(`Unit not found: ${input.unitId}`);
  }
  const boundary = newest
    ? cursor === null
      ? { sql: "", values: [] }
      : {
          sql: `AND (revision.revision_no < ? OR
                     (revision.revision_no = ? AND revision.id < ?))`,
          values: [cursor.ordinal, cursor.ordinal, cursor.id],
        }
    : {
        sql: `AND (revision.revision_no > ? OR
                   (revision.revision_no = ? AND revision.id > ?))`,
        values: [cursor?.ordinal ?? -1, cursor?.ordinal ?? -1, cursor?.id ?? ""],
      };
  const rows = db.query<UnitRevisionDto, (string | number)[]>(
    `SELECT ${REVISION_DTO_COLUMNS} FROM unit_revisions revision
     WHERE revision.unit_id = ?
       ${boundary.sql}
     ORDER BY revision.revision_no ${newest ? "DESC" : "ASC"},
              revision.id ${newest ? "DESC" : "ASC"} LIMIT ?`,
  ).all(
    input.unitId,
    ...boundary.values,
    input.limit + 1,
  );
  return buildPage(rows, input.limit, family, (row) => ({
    ordinal: row.revisionNo,
    id: row.id,
  }));
}

export function getUnitItem(input: {
  context: QueryContext;
  itemId: string;
}): UnitItemDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const item = getVisibleItemDto(db, scope, input.itemId);
  if (!item) throw new Error(`Unit Item not found: ${input.itemId}`);
  return item;
}

export function listUnitItems(input: {
  context: QueryContext;
  revisionId: string;
  after?: string | null;
  limit: number;
}): Page<UnitItemDto> {
  assertLimit(input.limit);
  const cursor = input.after == null ? null : decodeCursor("p1", input.after);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  if (!getVisibleRevisionDto(db, scope, input.revisionId)) {
    throw new Error(`Unit Revision not found: ${input.revisionId}`);
  }
  const rows = db.query<UnitItemDtoDbRow, (string | number)[]>(
    `SELECT ${ITEM_DTO_COLUMNS} FROM unit_items item
     WHERE item.unit_revision_id = ?
       AND (item.position > ? OR (item.position = ? AND item.id > ?))
     ORDER BY item.position ASC, item.id ASC LIMIT ?`,
  ).all(
    input.revisionId,
    cursor?.ordinal ?? -1,
    cursor?.ordinal ?? -1,
    cursor?.id ?? "",
    input.limit + 1,
  );
  return buildPage(rows.map(toItemDto), input.limit, "p1", (row) => ({
    ordinal: row.position,
    id: row.id,
  }));
}

export function getUnitPresentation(input: {
  context: QueryContext;
  presentationId: string;
}): UnitPresentationDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const presentation = getVisiblePresentationDto(db, scope, input.presentationId);
  if (!presentation) {
    throw new Error(`Unit Presentation not found: ${input.presentationId}`);
  }
  return presentation;
}

export function listUnitPresentations(input: {
  context: QueryContext;
  revisionId: string;
  after?: string | null;
  limit: number;
}): Page<UnitPresentationDto> {
  assertLimit(input.limit);
  const cursor = input.after == null ? null : decodeCursor("p1", input.after);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  if (!getVisibleRevisionDto(db, scope, input.revisionId)) {
    throw new Error(`Unit Revision not found: ${input.revisionId}`);
  }
  const rows = db.query<UnitPresentationDtoDbRow, (string | number)[]>(
    `SELECT ${PRESENTATION_DTO_COLUMNS} FROM unit_presentations presentation
     WHERE presentation.unit_revision_id = ?
       AND (presentation.position > ? OR
            (presentation.position = ? AND presentation.id > ?))
     ORDER BY presentation.position ASC, presentation.id ASC LIMIT ?`,
  ).all(
    input.revisionId,
    cursor?.ordinal ?? -1,
    cursor?.ordinal ?? -1,
    cursor?.id ?? "",
    input.limit + 1,
  );
  return buildPage(rows.map(toPresentationDto), input.limit, "p1", (row) => ({
    ordinal: row.position,
    id: row.id,
  }));
}

export function getPresentationCaptionRevision(input: {
  context: QueryContext;
  captionRevisionId: string;
}): PresentationCaptionRevisionDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const caption = getVisibleCaptionDto(db, scope, input.captionRevisionId);
  if (!caption) {
    throw new Error(`Presentation Caption Revision not found: ${input.captionRevisionId}`);
  }
  return caption;
}

export function listPresentationCaptionRevisions(input: {
  context: QueryContext;
  presentationId: string;
  after?: string | null;
  limit: number;
}): Page<PresentationCaptionRevisionDto> {
  assertLimit(input.limit);
  const cursor = input.after == null ? null : decodeCursor("v1", input.after);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  if (!getVisiblePresentationDto(db, scope, input.presentationId)) {
    throw new Error(`Unit Presentation not found: ${input.presentationId}`);
  }
  const rows = db.query<PresentationCaptionRevisionDto, (string | number)[]>(
    `SELECT ${CAPTION_DTO_COLUMNS}
     FROM presentation_caption_revisions caption
     WHERE caption.presentation_id = ?
       AND (caption.revision_no > ? OR
            (caption.revision_no = ? AND caption.id > ?))
     ORDER BY caption.revision_no ASC, caption.id ASC LIMIT ?`,
  ).all(
    input.presentationId,
    cursor?.ordinal ?? -1,
    cursor?.ordinal ?? -1,
    cursor?.id ?? "",
    input.limit + 1,
  );
  return buildPage(rows, input.limit, "v1", (row) => ({
    ordinal: row.revisionNo,
    id: row.id,
  }));
}

export function getPresentationItem(input: {
  context: QueryContext;
  presentationItemId: string;
}): PresentationItemDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const item = getVisiblePresentationItemDto(db, scope, input.presentationItemId);
  if (!item) {
    throw new Error(`Presentation Item not found: ${input.presentationItemId}`);
  }
  return item;
}

export function listPresentationItems(input: {
  context: QueryContext;
  presentationId: string;
  after?: string | null;
  limit: number;
}): Page<PresentationItemDto> {
  assertLimit(input.limit);
  const cursor = input.after == null ? null : decodeCursor("p1", input.after);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  if (!getVisiblePresentationDto(db, scope, input.presentationId)) {
    throw new Error(`Unit Presentation not found: ${input.presentationId}`);
  }
  const rows = db.query<PresentationItemDtoDbRow, (string | number)[]>(
    `SELECT ${PRESENTATION_ITEM_DTO_COLUMNS} FROM presentation_items item
     WHERE item.presentation_id = ?
       AND (item.position > ? OR (item.position = ? AND item.id > ?))
     ORDER BY item.position ASC, item.id ASC LIMIT ?`,
  ).all(
    input.presentationId,
    cursor?.ordinal ?? -1,
    cursor?.ordinal ?? -1,
    cursor?.id ?? "",
    input.limit + 1,
  );
  return buildPage(rows.map(toPresentationItemDto), input.limit, "p1", (row) => ({
    ordinal: row.position,
    id: row.id,
  }));
}

export function getPublication(input: {
  context: QueryContext;
  publicationId: string;
}): PublicationDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const publication = getVisiblePublicationDto(db, scope, input.publicationId);
  if (!publication) throw new Error(`Publication not found: ${input.publicationId}`);
  return publication;
}

/** Resolve an idempotent publication attempt without exposing its stored key. */
export function findPublicationByIdempotencyKey(input: {
  context: QueryContext;
  presentationId: string;
  idempotencyKey: string;
}): PublicationDto | null {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  if (!getVisiblePresentationDto(db, scope, input.presentationId)) {
    throw new Error(`Unit Presentation not found: ${input.presentationId}`);
  }
  const row = getPublicationByKey(
    db,
    checkedText(input.idempotencyKey, "Publication idempotency key"),
  );
  if (!row) return null;
  if (row.presentationId !== input.presentationId) {
    throw new StoreConflictError(
      "Publication idempotency key belongs to another attempt",
    );
  }
  return toPublicationDto(row);
}

export function listPublications(input: {
  context: QueryContext;
  presentationId: string;
  after?: string | null;
  limit: number;
}): Page<PublicationDto> {
  assertLimit(input.limit);
  const cursor = input.after == null ? null : decodeCursor("c1", input.after);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  if (!getVisiblePresentationDto(db, scope, input.presentationId)) {
    throw new Error(`Unit Presentation not found: ${input.presentationId}`);
  }
  const rows = db.query<PublicationDtoDbRow, (string | number)[]>(
    `SELECT ${PUBLICATION_DTO_COLUMNS} FROM publications publication
     WHERE publication.presentation_id = ?
       AND (publication.created_at > ? OR
            (publication.created_at = ? AND publication.id > ?))
     ORDER BY publication.created_at ASC, publication.id ASC LIMIT ?`,
  ).all(
    input.presentationId,
    cursor?.ordinal ?? -1,
    cursor?.ordinal ?? -1,
    cursor?.id ?? "",
    input.limit + 1,
  );
  return buildPage(rows.map(toPublicationDtoDb), input.limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

export function appendMetricSnapshot(
  input: AppendMetricSnapshotInput,
): MetricSnapshotDto {
  const prepared = prepareMetricSnapshot(input);
  return withImmediateTransaction((db) =>
    appendMetricSnapshotInTransaction(db, input, prepared),
  );
}

function prepareMetricSnapshot(input: AppendMetricSnapshotInput) {
  const source = checkedMetricSource(input.source);
  const asOf = checkedOptionalTimestamp(input.asOf, "Metric asOf")!;
  const windowStart = checkedOptionalTimestamp(
    input.windowStart,
    "Metric windowStart",
  );
  const windowEnd = checkedOptionalTimestamp(input.windowEnd, "Metric windowEnd");
  if ((windowStart === null) !== (windowEnd === null)) {
    throw new Error("Metric windowStart and windowEnd must both be set or both be null");
  }
  if (windowStart !== null && windowEnd! < windowStart) {
    throw new Error("Metric windowEnd must not precede windowStart");
  }
  const position = checkedPosition(input.position, "Metric Run result position");
  const views = checkedMetricCounter(input.views, "Metric views");
  const likes = checkedMetricCounter(input.likes, "Metric likes");
  const comments = checkedMetricCounter(input.comments, "Metric comments");
  const shares = checkedMetricCounter(input.shares, "Metric shares");
  const watchTimeMs = checkedMetricCounter(
    input.watchTimeMs,
    "Metric watchTimeMs",
  );
  const ctr = checkedMetricNumber(input.ctr, "Metric ctr");
  const avgViewDurationSec = checkedMetricNumber(
    input.avgViewDurationSec,
    "Metric avgViewDurationSec",
  );
  const retentionCurve = checkedMetricRetentionCurve(
    input.retentionCurve,
  );
  const raw = canonicalOptionalJson(input.raw, "Metric raw provider JSON");
  const note = input.note == null ? null : checkedText(input.note, "Metric note");
  return {
    source,
    asOf,
    windowStart,
    windowEnd,
    position,
    views,
    likes,
    comments,
    shares,
    watchTimeMs,
    ctr,
    avgViewDurationSec,
    retentionCurve,
    raw,
    note,
  };
}

function appendMetricSnapshotInTransaction(
  db: Database,
  input: AppendMetricSnapshotInput,
  prepared: ReturnType<typeof prepareMetricSnapshot>,
): MetricSnapshotDto {
    const {
      source,
      asOf,
      windowStart,
      windowEnd,
      position,
      views,
      likes,
      comments,
      shares,
      watchTimeMs,
      ctr,
      avgViewDurationSec,
      retentionCurve,
      raw,
      note,
    } = prepared;
    const scope = publicationScopeById(db, input.publicationId);
    if (!scope) throw new Error(`Publication not found: ${input.publicationId}`);
    const id = newDomainId("metric");
    const createdAt = Date.now();
    db.prepare(
      `INSERT INTO metric_snapshots
       (${METRIC_SNAPSHOT_COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.publicationId,
      source,
      asOf,
      windowStart,
      windowEnd,
      views,
      likes,
      comments,
      shares,
      watchTimeMs,
      ctr,
      retentionCurve === null ? null : JSON.stringify(retentionCurve),
      avgViewDurationSec,
      note,
      raw === null ? null : JSON.stringify(raw),
      createdAt,
    );
    recordRunResult(db, {
      runId: input.runId,
      position,
      entityType: "metric_snapshot",
      entityId: id,
    });
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      entityType: "metric_snapshot",
      entityId: id,
      action: "metric_snapshot.appended",
      payload: { publicationId: input.publicationId, source, asOf },
      createdAt,
    });
    return toMetricSnapshotDto(getMetricSnapshotRow(db, id)!);
}

export function startMetricRefresh(input: {
  publicationId: string;
  label: string;
  source: string;
  request: JsonValue;
  agentSessionId?: string | null;
}): { runId: string; claimed: boolean } {
  const label = checkedText(input.label, "Metric refresh label");
  const source = checkedMetricSource(input.source);
  return withImmediateTransaction((db) => {
    const scope = publicationScopeById(db, input.publicationId);
    if (!scope) throw new Error(`Publication not found: ${input.publicationId}`);
    const existing = db
      .query<{ id: string }, [string, string, string | null]>(
        `SELECT id FROM runs
         WHERE kind = 'metric-refresh' AND label = ?
           AND workspace_id = ? AND project_id IS ?
         ORDER BY created_at ASC, id ASC LIMIT 1`,
      )
      .get(label, scope.workspaceId, scope.projectId);
    if (existing) return { runId: existing.id, claimed: false };
    const run = startRunInTransaction(db, {
      ...(scope.projectId === null
        ? { workspaceId: scope.workspaceId }
        : { projectId: scope.projectId }),
      agentSessionId: input.agentSessionId,
      kind: "metric-refresh",
      label,
    });
    startRunAttemptInTransaction(db, {
      runId: run.id,
      provider: source,
      request: input.request,
    });
    return { runId: run.id, claimed: true };
  });
}

export function finishMetricRefresh(input: {
  runId: string;
  snapshots: AppendMetricSnapshotInput[];
}): MetricSnapshotDto[] {
  const prepared = input.snapshots.map(prepareMetricSnapshot);
  return withImmediateTransaction((db) => {
    const attempt = runningAttempt(db, input.runId);
    const snapshots = input.snapshots.map((snapshot, index) =>
      appendMetricSnapshotInTransaction(db, snapshot, prepared[index]!),
    );
    finishRunAttemptInTransaction(db, attempt.id, {
      state: "succeeded",
      response: { snapshotIds: snapshots.map((snapshot) => snapshot.id) },
    });
    finishRunInTransaction(db, input.runId, { state: "succeeded" });
    return snapshots;
  });
}

export function failMetricRefresh(runId: string, error: unknown): void {
  withImmediateTransaction((db) => {
    const attempt = runningAttempt(db, runId);
    finishRunAttemptInTransaction(db, attempt.id, { state: "failed", error });
    finishRunInTransaction(db, runId, { state: "failed", error });
  });
}

export function getMetricSnapshot(input: {
  context: QueryContext;
  metricSnapshotId: string;
}): MetricSnapshotDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const metric = getVisibleMetricDto(db, scope, input.metricSnapshotId);
  if (!metric) {
    throw new Error(`Metric Snapshot not found: ${input.metricSnapshotId}`);
  }
  return metric;
}

export function listMetricSnapshots(
  input: MetricSnapshotFilter & {
    context: QueryContext;
    publicationId: string;
    after?: string | null;
    limit: number;
  },
): Page<MetricSnapshotDto> {
  assertLimit(input.limit);
  const cursor = input.after == null ? null : decodeCursor("c1", input.after);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  if (!getVisiblePublicationDto(db, scope, input.publicationId)) {
    throw new Error(`Publication not found: ${input.publicationId}`);
  }
  const clauses = ["metric.publication_id = ?"];
  const values: Array<string | number> = [input.publicationId];
  if (input.source !== undefined) {
    clauses.push("metric.source = ?");
    values.push(checkedMetricSource(input.source));
  }
  if (input.asOf !== undefined) {
    clauses.push("metric.as_of <= ?");
    values.push(checkedOptionalTimestamp(input.asOf, "Metric asOf")!);
  }
  if (input.windowStart !== undefined) {
    clauses.push("metric.window_start = ?");
    values.push(checkedOptionalTimestamp(input.windowStart, "Metric windowStart")!);
  }
  if (input.windowEnd !== undefined) {
    clauses.push("metric.window_end = ?");
    values.push(checkedOptionalTimestamp(input.windowEnd, "Metric windowEnd")!);
  }
  clauses.push(
    "(metric.created_at > ? OR (metric.created_at = ? AND metric.id > ?))",
  );
  values.push(
    cursor?.ordinal ?? -1,
    cursor?.ordinal ?? -1,
    cursor?.id ?? "",
    input.limit + 1,
  );
  const rows = db.query<MetricSnapshotDtoDbRow, Array<string | number>>(
    `SELECT ${METRIC_DTO_COLUMNS} FROM metric_snapshots metric
     WHERE ${clauses.join(" AND ")}
     ORDER BY metric.created_at ASC, metric.id ASC LIMIT ?`,
  ).all(...values).map(toMetricSnapshotDtoDb);
  return buildPage(rows, input.limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

export function getMetricTotals(
  input: MetricSnapshotFilter & {
    context: QueryContext;
    publicationIds: string[];
  },
): MetricTotals {
  if (
    !Array.isArray(input.publicationIds) ||
    input.publicationIds.length < 1 ||
    input.publicationIds.length > 100
  ) {
    throw new Error("Metric publicationIds must contain 1 through 100 IDs");
  }
  const publicationIds = input.publicationIds.map((id) =>
    checkedText(id, "Metric Publication ID"),
  );
  if (new Set(publicationIds).size !== publicationIds.length) {
    throw new Error("Metric publicationIds must be distinct");
  }
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  for (const publicationId of publicationIds) {
    if (!getVisiblePublicationDto(db, scope, publicationId)) {
      throw new Error(`Publication not found: ${publicationId}`);
    }
  }
  const clauses = [
    `publication_id IN (${publicationIds.map(() => "?").join(", ")})`,
  ];
  const values: Array<string | number> = [...publicationIds];
  if (input.source !== undefined) {
    clauses.push("source = ?");
    values.push(checkedMetricSource(input.source));
  }
  if (input.asOf !== undefined) {
    clauses.push("as_of <= ?");
    values.push(checkedOptionalTimestamp(input.asOf, "Metric asOf")!);
  }
  if ((input.windowStart === undefined) !== (input.windowEnd === undefined)) {
    throw new Error("Metric total windowStart and windowEnd must both be set");
  }
  if (input.windowStart !== undefined && input.windowEnd !== undefined) {
    const windowStart = checkedOptionalTimestamp(
      input.windowStart,
      "Metric windowStart",
    )!;
    const windowEnd = checkedOptionalTimestamp(input.windowEnd, "Metric windowEnd")!;
    if (windowEnd < windowStart) {
      throw new Error("Metric windowEnd must not precede windowStart");
    }
    clauses.push("window_start = ?", "window_end = ?");
    values.push(windowStart, windowEnd);
  }
  type Winner = Pick<
    MetricSnapshotDbRow,
    "views" | "likes" | "comments" | "shares" | "watch_time_ms"
  >;
  const winners = db
    .query<Winner, Array<string | number>>(
      `WITH ranked AS (
         SELECT views, likes, comments, shares, watch_time_ms,
                ROW_NUMBER() OVER (
                  PARTITION BY publication_id
                  ORDER BY as_of DESC, created_at DESC, id DESC
                ) AS winner
         FROM metric_snapshots
         WHERE ${clauses.join(" AND ")}
       )
       SELECT views, likes, comments, shares, watch_time_ms
       FROM ranked WHERE winner = 1`,
    )
    .all(...values);
  return {
    publicationCount: winners.length,
    views: sumMetricWinners(winners, "views"),
    likes: sumMetricWinners(winners, "likes"),
    comments: sumMetricWinners(winners, "comments"),
    shares: sumMetricWinners(winners, "shares"),
    watchTimeMs: sumMetricWinners(winners, "watch_time_ms"),
  };
}

function unitVisibility(
  scope: ResolvedScope,
): { sql: string; values: string[] } {
  return scopeVisibilityClause(scope, "unit.workspace_id", "unit.project_id");
}

function getVisibleUnitDto(
  db: Database,
  scope: ResolvedScope,
  unitId: string,
): UnitDto | null {
  const visibility = unitVisibility(scope);
  return db.query<UnitDto, string[]>(
    `SELECT ${UNIT_DTO_COLUMNS} FROM units unit
     WHERE unit.id = ? AND ${visibility.sql}`,
  ).get(unitId, ...visibility.values);
}

function getVisibleRevisionDto(
  db: Database,
  scope: ResolvedScope,
  revisionId: string,
): UnitRevisionDto | null {
  const visibility = unitVisibility(scope);
  return db.query<UnitRevisionDto, string[]>(
    `SELECT ${REVISION_DTO_COLUMNS} FROM unit_revisions revision
     JOIN units unit ON unit.id = revision.unit_id
     WHERE revision.id = ? AND ${visibility.sql}`,
  ).get(revisionId, ...visibility.values);
}

function getVisibleItemDto(
  db: Database,
  scope: ResolvedScope,
  itemId: string,
): UnitItemDto | null {
  const visibility = unitVisibility(scope);
  const row = db.query<UnitItemDtoDbRow, string[]>(
    `SELECT ${ITEM_DTO_COLUMNS} FROM unit_items item
     JOIN unit_revisions revision ON revision.id = item.unit_revision_id
     JOIN units unit ON unit.id = revision.unit_id
     WHERE item.id = ? AND ${visibility.sql}`,
  ).get(itemId, ...visibility.values);
  return row ? toItemDto(row) : null;
}

function getVisiblePresentationDto(
  db: Database,
  scope: ResolvedScope,
  presentationId: string,
): UnitPresentationDto | null {
  const visibility = unitVisibility(scope);
  const row = db.query<UnitPresentationDtoDbRow, string[]>(
    `SELECT ${PRESENTATION_DTO_COLUMNS} FROM unit_presentations presentation
     JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
     JOIN units unit ON unit.id = revision.unit_id
     WHERE presentation.id = ? AND ${visibility.sql}`,
  ).get(presentationId, ...visibility.values);
  return row ? toPresentationDto(row) : null;
}

function getVisibleCaptionDto(
  db: Database,
  scope: ResolvedScope,
  captionRevisionId: string,
): PresentationCaptionRevisionDto | null {
  const visibility = unitVisibility(scope);
  return db.query<PresentationCaptionRevisionDto, string[]>(
    `SELECT ${CAPTION_DTO_COLUMNS}
     FROM presentation_caption_revisions caption
     JOIN unit_presentations presentation
       ON presentation.id = caption.presentation_id
     JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
     JOIN units unit ON unit.id = revision.unit_id
     WHERE caption.id = ? AND ${visibility.sql}`,
  ).get(captionRevisionId, ...visibility.values);
}

function getVisiblePresentationItemDto(
  db: Database,
  scope: ResolvedScope,
  presentationItemId: string,
): PresentationItemDto | null {
  const visibility = unitVisibility(scope);
  const row = db.query<PresentationItemDtoDbRow, string[]>(
    `SELECT ${PRESENTATION_ITEM_DTO_COLUMNS} FROM presentation_items item
     JOIN unit_presentations presentation ON presentation.id = item.presentation_id
     JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
     JOIN units unit ON unit.id = revision.unit_id
     WHERE item.id = ? AND ${visibility.sql}`,
  ).get(presentationItemId, ...visibility.values);
  return row ? toPresentationItemDto(row) : null;
}

function getVisiblePublicationDto(
  db: Database,
  scope: ResolvedScope,
  publicationId: string,
): PublicationDto | null {
  const visibility = unitVisibility(scope);
  const row = db.query<PublicationDtoDbRow, string[]>(
    `SELECT ${PUBLICATION_DTO_COLUMNS} FROM publications publication
     JOIN unit_presentations presentation
       ON presentation.id = publication.presentation_id
     JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
     JOIN units unit ON unit.id = revision.unit_id
     WHERE publication.id = ? AND ${visibility.sql}`,
  ).get(publicationId, ...visibility.values);
  return row ? toPublicationDtoDb(row) : null;
}

function getVisibleMetricDto(
  db: Database,
  scope: ResolvedScope,
  metricSnapshotId: string,
): MetricSnapshotDto | null {
  const visibility = unitVisibility(scope);
  const row = db.query<MetricSnapshotDtoDbRow, string[]>(
    `SELECT ${METRIC_DTO_COLUMNS} FROM metric_snapshots metric
     JOIN publications publication ON publication.id = metric.publication_id
     JOIN unit_presentations presentation
       ON presentation.id = publication.presentation_id
     JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
     JOIN units unit ON unit.id = revision.unit_id
     WHERE metric.id = ? AND ${visibility.sql}`,
  ).get(metricSnapshotId, ...visibility.values);
  return row ? toMetricSnapshotDtoDb(row) : null;
}

type PublicationScope = {
  presentationId: string;
  platform: string;
  effectiveCaptionRevisionId: string | null;
  options: JsonValue;
  sealedAt: number | null;
  workspaceId: string;
  projectId: string | null;
};

function publicationScopeById(
  db: Database,
  publicationId: string,
): PublicationScope | null {
  const publication = getPublicationRow(db, publicationId);
  return publication ? publicationScope(db, publication.presentationId) : null;
}

function publicationScope(
  db: Database,
  presentationId: string,
): PublicationScope | null {
  const row = db
    .query<
      {
        presentationId: string;
        platform: string;
        effectiveCaptionRevisionId: string | null;
        optionsJson: string;
        sealedAt: number | null;
        workspaceId: string;
        projectId: string | null;
      },
      [string]
    >(
      `SELECT presentation.id AS presentationId, presentation.platform,
              presentation.effective_caption_revision_id AS effectiveCaptionRevisionId,
              presentation.options_json AS optionsJson,
              revision.sealed_at AS sealedAt, unit.workspace_id AS workspaceId,
              unit.project_id AS projectId
       FROM unit_presentations presentation
       JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
       JOIN units unit ON unit.id = revision.unit_id
       WHERE presentation.id = ?`,
    )
    .get(presentationId);
  return row
    ? {
        presentationId: row.presentationId,
        platform: row.platform,
        effectiveCaptionRevisionId: row.effectiveCaptionRevisionId,
        options: parsePublicJson(row.optionsJson, "Presentation options"),
        sealedAt: row.sealedAt,
        workspaceId: row.workspaceId,
        projectId: row.projectId,
      }
    : null;
}

function assertPublicationAccount(
  db: Database,
  input: {
    scope: PublicationScope;
    rail: PublicationRail;
    socialAccountId: string | null;
    failedPreflight: boolean;
  },
): void {
  const requiresAccount = publicationRailRequiresAccount(input.rail);
  if (!requiresAccount) {
    if (input.socialAccountId !== null) {
      throw new Error(`${input.rail} Publication does not accept a social account`);
    }
    return;
  }
  if (input.socialAccountId === null) {
    if (input.failedPreflight) return;
    throw new Error(`${input.rail} Publication requires a social account`);
  }
  const account = db
    .query<{ workspaceId: string; platform: string }, [string]>(
      "SELECT workspace_id AS workspaceId, platform FROM social_accounts WHERE id = ?",
    )
    .get(input.socialAccountId);
  if (!account) throw new Error(`Social Account not found: ${input.socialAccountId}`);
  if (
    account.workspaceId !== input.scope.workspaceId ||
    account.platform !== input.scope.platform
  ) {
    throw new Error("Publication Social Account is outside its platform scope");
  }
}

function publicationRailRequiresAccount(rail: PublicationRail): boolean {
  return rail === "postiz" || rail === "devto" || rail === "hashnode";
}

function requirePublication(db: Database, id: string): PublicationRow {
  const publication = getPublicationRow(db, id);
  if (!publication) throw new Error(`Publication not found: ${id}`);
  return publication;
}

function getPublicationByKey(
  db: Database,
  idempotencyKey: string,
): PublicationRow | null {
  const row = db
    .query<PublicationDbRow, [string]>(
      `SELECT ${PUBLICATION_COLUMNS} FROM publications WHERE idempotency_key = ?`,
    )
    .get(idempotencyKey);
  return row ? toPublicationRow(row) : null;
}

function getPublicationRow(db: Database, id: string): PublicationRow | null {
  const row = db
    .query<PublicationDbRow, [string]>(
      `SELECT ${PUBLICATION_COLUMNS} FROM publications WHERE id = ?`,
    )
    .get(id);
  return row ? toPublicationRow(row) : null;
}

function assertPublicationFence(
  db: Database,
  publication: PublicationRow,
  fence: PublicationFence,
): void {
  if (
    publication.claimKind !== fence.kind ||
    publication.activeClaimRunId !== fence.runId ||
    publication.claimEpoch !== fence.epoch ||
    publication.claimExpiresAt !== fence.expiresAt
  ) {
    throw new StoreConflictError("Publication claim fence is stale");
  }
  const token = db
    .query<{ token: string | null }, [string]>(
      "SELECT claim_token AS token FROM publications WHERE id = ?",
    )
    .get(publication.id)?.token;
  if (token !== fence.token) {
    throw new StoreConflictError("Publication claim fence is stale");
  }
}

function assertPublicationClaimOutcome(
  publication: PublicationRow,
  kind: PublicationFence["kind"],
  state: PublicationState,
  operationState: PublicationOperationState,
): void {
  if (kind === "submission") {
    if (
      publication.state !== "submitting" ||
      state === "draft" ||
      state === "submitting" ||
      state === "cancelled"
    ) {
      throw new StoreConflictError("Publication submission outcome is invalid");
    }
    return;
  }
  if (kind === "reconciliation") {
    const allowed = new Set<PublicationState>([
      "scheduled",
      "submitted",
      "published",
      "failed",
      "cancelled",
      "reconciliation_required",
      "unknown",
    ]);
    if (
      publication.state !== "reconciliation_required" ||
      !allowed.has(state) ||
      (operationState === "failed" &&
        state !== "reconciliation_required" &&
        state !== "unknown")
    ) {
      throw new StoreConflictError("Publication reconciliation outcome is invalid");
    }
    return;
  }
  if (kind === "status-lookup") {
    const authoritative = new Set<PublicationState>([
      publication.state,
      "published",
      "failed",
      "cancelled",
    ]);
    if (
      (publication.state !== "scheduled" && publication.state !== "submitted") ||
      !authoritative.has(state) ||
      (operationState === "failed" && state !== publication.state)
    ) {
      throw new StoreConflictError("Publication status lookup outcome is invalid");
    }
    return;
  }
  const cancellationFailure = new Set<PublicationState>([
    publication.state,
    "reconciliation_required",
    "unknown",
  ]);
  const cancellationSuccess = new Set<PublicationState>([
    "cancelled",
    "published",
    "failed",
  ]);
  if (
    (publication.state !== "scheduled" && publication.state !== "submitted") ||
    !(operationState === "succeeded"
      ? cancellationSuccess.has(state)
      : cancellationFailure.has(state))
  ) {
    throw new StoreConflictError("Publication cancellation outcome is invalid");
  }
}

function assertPublicationClaimSource(
  kind: Exclude<PublicationClaimKind, "submission">,
  state: PublicationState,
): void {
  const valid =
    kind === "reconciliation"
      ? state === "unknown" || state === "reconciliation_required"
      : state === "scheduled" || state === "submitted";
  if (!valid) {
    throw new StoreConflictError(`Publication ${kind} source state is invalid`);
  }
}

function checkedOperationState(
  value: PublicationOperationState | undefined,
): PublicationOperationState {
  if (value !== "succeeded" && value !== "failed") {
    throw new Error("Publication follow-up requires an explicit operationState");
  }
  return value;
}

function submissionOperationState(
  state: FinishPublicationInput["state"],
): PublicationOperationState {
  return state === "scheduled" || state === "submitted" || state === "published"
    ? "succeeded"
    : "failed";
}

function publicationClaimAction(kind: PublicationClaimKind): string {
  return kind === "submission"
    ? "publication.claimed"
    : `publication.${kind.replace("-", "_")}_claimed`;
}

function publicationFinishAction(kind: PublicationClaimKind): string {
  return kind === "submission" || kind === "reconciliation"
    ? "publication.finished"
    : `publication.${kind.replace("-", "_")}_finished`;
}

function runningAttempt(db: Database, runId: string): { id: string } {
  const attempt = db
    .query<{ id: string }, [string]>(
      "SELECT id FROM run_attempts WHERE run_id = ? AND state = 'running'",
    )
    .get(runId);
  if (!attempt) throw new StoreConflictError("Publication claim has no running attempt");
  return attempt;
}

function resolveScope(
  db: Database,
  input: { workspaceId?: string; projectId?: string },
): { workspaceId: string; projectId: string | null } {
  if (input.workspaceId && !input.projectId) {
    const workspace = db
      .query<{ id: string }, [string]>("SELECT id FROM workspaces WHERE id = ?")
      .get(input.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${input.workspaceId}`);
    return { workspaceId: workspace.id, projectId: null };
  }
  if (input.projectId && !input.workspaceId) {
    const project = db
      .query<{ workspaceId: string }, [string]>(
        "SELECT workspace_id AS workspaceId FROM projects WHERE id = ?",
      )
      .get(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);
    return { workspaceId: project.workspaceId, projectId: input.projectId };
  }
  throw new Error("Unit scope requires exactly one workspaceId or projectId");
}

function latestRevision(db: Database, unitId: string): UnitRevisionRow | null {
  const row = db
    .query<UnitRevisionDbRow, [string]>(
      `SELECT ${REVISION_COLUMNS} FROM unit_revisions
       WHERE unit_id = ? ORDER BY revision_no DESC, id DESC LIMIT 1`,
    )
    .get(unitId);
  return row ? toRevisionRow(row) : null;
}

function assertIteration(
  db: Database,
  unit: UnitRow,
  iterationId: string | null,
): void {
  if (iterationId === null) return;
  if (unit.projectId === null) {
    throw new Error("Workspace Unit cannot bind a Project Iteration");
  }
  const iteration = db
    .query<{ projectId: string }, [string]>(
      "SELECT project_id AS projectId FROM project_iterations WHERE id = ?",
    )
    .get(iterationId);
  if (!iteration || iteration.projectId !== unit.projectId) {
    throw new Error("Iteration does not belong to the Unit Project");
  }
}

function assertItemScope(
  db: Database,
  unit: UnitRow,
  item: CheckedUnitItem,
): void {
  let target: { workspaceId: string; projectId: string | null } | null;
  if (item.artifactRevisionId) {
    const row = db
      .query<
        {
          workspaceId: string;
          projectId: string | null;
          objectId: string;
          objectWorkspaceId: string;
          objectProjectId: string | null;
          backend: "local";
          bucket: string;
          key: string;
          sha256: string;
          mime: string;
          bytes: number;
          storageClass: ObjectRow["storageClass"];
          originalName: string | null;
          metadataJson: string | null;
          objectCreatedAt: number;
        },
        [string]
      >(
        `SELECT a.workspace_id AS workspaceId, a.project_id AS projectId,
                o.id AS objectId, o.workspace_id AS objectWorkspaceId,
                o.project_id AS objectProjectId, o.backend, o.bucket, o.key,
                o.sha256, o.mime, o.bytes, o.storage_class AS storageClass,
                o.original_name AS originalName, o.metadata_json AS metadataJson,
                o.created_at AS objectCreatedAt
         FROM artifact_revisions r
         JOIN artifacts a ON a.id = r.artifact_id
         JOIN objects o ON o.id = r.object_id
         WHERE r.id = ?`,
      )
      .get(item.artifactRevisionId);
    if (!row) throw new Error("Unit item target revision not found");
    const object: ObjectRow = {
      id: row.objectId,
      workspaceId: row.objectWorkspaceId,
      projectId: row.objectProjectId,
      backend: row.backend,
      bucket: row.bucket,
      key: row.key,
      sha256: row.sha256,
      mime: row.mime,
      bytes: row.bytes,
      storageClass: row.storageClass,
      originalName: row.originalName,
      metadata:
        row.metadataJson === null
          ? null
          : (JSON.parse(row.metadataJson) as JsonValue),
      createdAt: row.objectCreatedAt,
    };
    const objectVisible =
      object.workspaceId === row.workspaceId &&
      (row.projectId === null
        ? object.projectId === null
        : object.projectId === null || object.projectId === row.projectId);
    if (!objectVisible) {
      throw new Error("Artifact revision Object is outside the Artifact scope");
    }
    resolveObjectPath(object);
    target = row;
  } else {
    target = db
      .query<{ workspaceId: string; projectId: string | null }, [string]>(
        `SELECT d.workspace_id AS workspaceId, d.project_id AS projectId
         FROM document_revisions r JOIN documents d ON d.id = r.document_id
         WHERE r.id = ?`,
      )
      .get(item.documentRevisionId!);
  }
  if (!target) throw new Error("Unit item target revision not found");
  const visible =
    target.workspaceId === unit.workspaceId &&
    (unit.projectId === null
      ? target.projectId === null
      : target.projectId === null || target.projectId === unit.projectId);
  if (!visible) throw new Error("Unit item target is outside the Unit scope");
}

type CheckedUnitItem = {
  artifactRevisionId: string | null;
  documentRevisionId: string | null;
  role: string;
  position: number;
  config: JsonValue | null;
};

function checkedItems(items: UnitItemInput[]): CheckedUnitItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Unit revision requires at least one item");
  }
  const checked = items
    .map((item) => {
      const artifactRevisionId = item.artifactRevisionId ?? null;
      const documentRevisionId = item.documentRevisionId ?? null;
      if ((artifactRevisionId !== null) === (documentRevisionId !== null)) {
        throw new Error("Unit item requires exactly one target revision");
      }
      return {
        artifactRevisionId,
        documentRevisionId,
        role: checkedText(item.role, "Unit item role"),
        position: checkedPosition(item.position, "Unit item position"),
        config: canonicalOptionalPublicJson(item.config, "Unit item config"),
      };
    })
    .sort((left, right) => left.position - right.position);
  checked.forEach((item, position) => {
    if (item.position !== position) {
      throw new Error("Unit item positions must be unique and contiguous");
    }
  });
  return checked;
}

type CheckedPresentation = {
  platform: string;
  position: number;
  captions: Array<{
    revisionNo: number;
    state: PresentationCaptionState;
    text: string;
  }>;
  effectiveCaptionRevisionNo: number | null;
  coverArtifactRevisionId: string | null;
  crop: JsonValue | null;
  safeArea: JsonValue | null;
  options: JsonValue;
  items: Array<{
    unitItemPosition: number;
    position: number;
    config: JsonValue | null;
  }>;
};

const PLATFORM_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CAPTION_STATES = new Set<PresentationCaptionState>([
  "draft",
  "humanized",
  "auto-draft-archived",
  "final",
]);

function checkedPresentations(
  values: UnitPresentationInput[],
  items: CheckedUnitItem[],
): CheckedPresentation[] {
  if (!Array.isArray(values)) throw new Error("Unit presentations must be an array");
  const seenPlatforms = new Set<string>();
  const presentations = values.map((value, index) => {
    const platform = checkedText(value.platform, "Unit presentation platform");
    if (!PLATFORM_SLUG.test(platform) || platform === "reels" || platform === "shorts") {
      throw new Error("Unit presentation platform must be a canonical kebab slug");
    }
    if (seenPlatforms.has(platform)) {
      throw new Error("Unit presentation platforms must be unique");
    }
    seenPlatforms.add(platform);
    const position = checkedPosition(
      value.position ?? index,
      "Unit presentation position",
    );
    if (value.caption != null && value.captions !== undefined) {
      throw new Error("Use either caption or captions for a Unit presentation");
    }
    const captionInputs = value.captions ??
      (value.caption == null ? [] : [{ state: "draft" as const, text: value.caption }]);
    const captions = captionInputs.map((caption, captionIndex) => {
      if (!CAPTION_STATES.has(caption.state)) {
        throw new Error(`Invalid presentation caption state: ${caption.state}`);
      }
      if (typeof caption.text !== "string") {
        throw new Error("Presentation caption text must be a string");
      }
      return {
        revisionNo: captionIndex + 1,
        state: caption.state,
        text: caption.text,
      };
    });
    const effectiveCaptionRevisionNo = Object.hasOwn(
      value,
      "effectiveCaptionRevisionNo",
    )
      ? value.effectiveCaptionRevisionNo ?? null
      : captions.at(-1)?.revisionNo ?? null;
    if (
      effectiveCaptionRevisionNo !== null &&
      !captions.some((caption) => caption.revisionNo === effectiveCaptionRevisionNo)
    ) {
      throw new Error("Effective caption revision must belong to the Presentation");
    }
    const coverArtifactRevisionId = value.coverArtifactRevisionId ?? null;
    if (
      coverArtifactRevisionId !== null &&
      !items.some((item) => item.artifactRevisionId === coverArtifactRevisionId)
    ) {
      throw new Error("Presentation cover must be present among Unit items");
    }
    const presentationItems = (value.items ?? [])
      .map((item) => ({
        unitItemPosition: checkedPosition(
          item.unitItemPosition,
          "Presentation base item position",
        ),
        position: checkedPosition(item.position, "Presentation item position"),
        config: canonicalOptionalPublicJson(item.config, "Presentation item config"),
      }))
      .sort((left, right) => left.position - right.position);
    const seenBasePositions = new Set<number>();
    presentationItems.forEach((item, itemPosition) => {
      if (item.position !== itemPosition) {
        throw new Error("Presentation item positions must be unique and contiguous");
      }
      if (!items.some((base) => base.position === item.unitItemPosition)) {
        throw new Error("Presentation item must reference a base Unit item");
      }
      if (seenBasePositions.has(item.unitItemPosition)) {
        throw new Error("Presentation item base references must be unique");
      }
      seenBasePositions.add(item.unitItemPosition);
    });
    return {
      platform,
      position,
      captions,
      effectiveCaptionRevisionNo,
      coverArtifactRevisionId,
      crop: canonicalOptionalPublicJson(value.crop, "Presentation crop"),
      safeArea: canonicalOptionalPublicJson(value.safeArea, "Presentation safe area"),
      options: canonicalPublicJson(value.options ?? {}, "Presentation options"),
      items: presentationItems,
    };
  });
  presentations.sort((left, right) => left.position - right.position);
  presentations.forEach((presentation, position) => {
    if (presentation.position !== position) {
      throw new Error("Unit presentation positions must be unique and contiguous");
    }
  });
  return presentations;
}

function getUnitRow(db: Database, id: string): UnitRow | null {
  const row = db
    .query<UnitDbRow, [string]>(`SELECT ${UNIT_COLUMNS} FROM units WHERE id = ?`)
    .get(id);
  return row ? toUnitRow(row) : null;
}

function getRevisionRow(db: Database, id: string): UnitRevisionRow | null {
  const row = db
    .query<UnitRevisionDbRow, [string]>(
      `SELECT ${REVISION_COLUMNS} FROM unit_revisions WHERE id = ?`,
    )
    .get(id);
  return row ? toRevisionRow(row) : null;
}

function toUnitRow(row: UnitDbRow): UnitRow {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    slug: row.slug,
    format: row.format,
    latestRevisionId: row.latest_revision_id,
    selectedRevisionId: row.selected_revision_id,
    rowVersion: row.row_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toUnitDto(row: UnitRow): UnitDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    slug: row.slug,
    format: row.format,
    latestRevisionId: row.latestRevisionId,
    selectedRevisionId: row.selectedRevisionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRevisionRow(row: UnitRevisionDbRow): UnitRevisionRow {
  return {
    id: row.id,
    unitId: row.unit_id,
    revisionNo: row.revision_no,
    parentRevisionId: row.parent_revision_id,
    iterationId: row.iteration_id,
    note: row.note,
    metadata: parseJson(row.metadata_json),
    authoredBySessionId: row.authored_by_session_id,
    createdAt: row.created_at,
    sealedAt: row.sealed_at,
  };
}

function toRevisionDto(row: UnitRevisionRow): UnitRevisionDto {
  return {
    id: row.id,
    unitId: row.unitId,
    revisionNo: row.revisionNo,
    parentRevisionId: row.parentRevisionId,
    iterationId: row.iterationId,
    note: row.note,
    authoredBySessionId: row.authoredBySessionId,
    createdAt: row.createdAt,
    sealedAt: row.sealedAt,
  };
}

function toItemDto(row: UnitItemDtoDbRow): UnitItemDto {
  return {
    id: row.id,
    unitRevisionId: row.unitRevisionId,
    artifactRevisionId: row.artifactRevisionId,
    documentRevisionId: row.documentRevisionId,
    role: row.role,
    position: row.position,
    config: parseOptionalPublicJson(row.configJson, "Unit item config"),
    createdAt: row.createdAt,
  };
}

function toPresentationDto(
  row: UnitPresentationDtoDbRow,
): UnitPresentationDto {
  return {
    id: row.id,
    unitRevisionId: row.unitRevisionId,
    platform: row.platform,
    position: row.position,
    effectiveCaptionRevisionId: row.effectiveCaptionRevisionId,
    coverArtifactRevisionId: row.coverArtifactRevisionId,
    crop: parseOptionalPublicJson(row.cropJson, "Presentation crop"),
    safeArea: parseOptionalPublicJson(row.safeAreaJson, "Presentation safe area"),
    options: parsePublicJson(row.optionsJson, "Presentation options"),
    createdAt: row.createdAt,
  };
}

function toPresentationItemDto(
  row: PresentationItemDtoDbRow,
): PresentationItemDto {
  return {
    id: row.id,
    presentationId: row.presentationId,
    unitItemId: row.unitItemId,
    position: row.position,
    config: parseOptionalPublicJson(row.configJson, "Presentation item config"),
    createdAt: row.createdAt,
  };
}

function toPublicationRow(row: PublicationDbRow): PublicationRow {
  return {
    id: row.id,
    presentationId: row.presentation_id,
    effectiveCaptionRevisionId: row.effective_caption_revision_id,
    effectiveOptions: parsePublicJson(
      row.effective_options_json,
      "Publication effective options",
    ),
    socialAccountId: row.social_account_id,
    submissionRunId: row.submission_run_id,
    activeClaimRunId: row.active_claim_run_id,
    revisedFromPublicationId: row.revised_from_publication_id,
    rail: row.rail,
    providerPublicationId: row.provider_publication_id,
    state: row.state,
    url: row.url,
    scheduledAt: row.scheduled_at,
    submittedAt: row.submitted_at,
    publishedAt: row.published_at,
    error: row.error,
    failureStage: row.failure_stage,
    idempotencyKey: row.idempotency_key,
    claimKind: row.claim_kind,
    claimEpoch: row.claim_epoch,
    claimExpiresAt: row.claim_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublicationDto(row: PublicationRow): PublicationDto {
  return {
    id: row.id,
    presentationId: row.presentationId,
    effectiveCaptionRevisionId: row.effectiveCaptionRevisionId,
    effectiveOptions: row.effectiveOptions,
    socialAccountId: row.socialAccountId,
    submissionRunId: row.submissionRunId,
    revisedFromPublicationId: row.revisedFromPublicationId,
    rail: row.rail,
    providerPublicationId: row.providerPublicationId,
    state: row.state,
    url: row.url,
    scheduledAt: row.scheduledAt,
    submittedAt: row.submittedAt,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPublicationDtoDb(row: PublicationDtoDbRow): PublicationDto {
  return {
    id: row.id,
    presentationId: row.presentationId,
    effectiveCaptionRevisionId: row.effectiveCaptionRevisionId,
    effectiveOptions: parsePublicJson(
      row.effectiveOptionsJson,
      "Publication effective options",
    ),
    socialAccountId: row.socialAccountId,
    submissionRunId: row.submissionRunId,
    revisedFromPublicationId: row.revisedFromPublicationId,
    rail: row.rail,
    providerPublicationId: row.providerPublicationId,
    state: row.state,
    url: row.url,
    scheduledAt: row.scheduledAt,
    submittedAt: row.submittedAt,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function getMetricSnapshotRow(
  db: Database,
  id: string,
): MetricSnapshotRow | null {
  const row = db
    .query<MetricSnapshotDbRow, [string]>(
      `SELECT ${METRIC_SNAPSHOT_COLUMNS} FROM metric_snapshots WHERE id = ?`,
    )
    .get(id);
  return row ? toMetricSnapshotRow(row) : null;
}

function toMetricSnapshotRow(row: MetricSnapshotDbRow): MetricSnapshotRow {
  return {
    id: row.id,
    publicationId: row.publication_id,
    source: row.source,
    asOf: row.as_of,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    watchTimeMs: row.watch_time_ms,
    ctr: row.ctr,
    retentionCurve:
      row.retention_curve_json === null
        ? null
        : (JSON.parse(row.retention_curve_json) as MetricRetentionPoint[]),
    avgViewDurationSec: row.avg_view_duration_sec,
    note: row.note,
    raw: parseJson(row.raw_json),
    createdAt: row.created_at,
  };
}

function toMetricSnapshotDto(row: MetricSnapshotRow): MetricSnapshotDto {
  return {
    id: row.id,
    publicationId: row.publicationId,
    source: row.source,
    asOf: row.asOf,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    watchTimeMs: row.watchTimeMs,
    ctr: row.ctr,
    retentionCurve: row.retentionCurve,
    avgViewDurationSec: row.avgViewDurationSec,
    note: row.note,
    createdAt: row.createdAt,
  };
}

function toMetricSnapshotDtoDb(row: MetricSnapshotDtoDbRow): MetricSnapshotDto {
  const { retentionCurveJson, ...snapshot } = row;
  return {
    ...snapshot,
    retentionCurve:
      retentionCurveJson === null
        ? null
        : (JSON.parse(retentionCurveJson) as MetricRetentionPoint[]),
  };
}

function sumMetricWinners<T, K extends keyof T>(rows: T[], key: K): number | null {
  let total: number | null = null;
  for (const row of rows) {
    const value = row[key];
    if (value === null) continue;
    if (typeof value !== "number") throw new Error("Metric total contains invalid data");
    const next: number = (total ?? 0) + value;
    if (!Number.isSafeInteger(next)) {
      throw new Error("Metric total exceeds the safe integer range");
    }
    total = next;
  }
  return total;
}

function checkedText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} must not be empty`);
  return trimmed;
}

function optionalText(
  value: string | null | undefined,
  label: string,
): string | null {
  return value == null ? null : checkedText(value, label);
}

function checkedPublicationUrl(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const text = checkedText(value, "Publication URL");
  if (text.length > 2_048) {
    throw new Error("Publication URL length must not exceed 2048 characters");
  }
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error("Publication URL must be a valid HTTP(S) URL");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    !parsed.hostname
  ) {
    throw new Error("Publication URL must use HTTP(S)");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Publication URL must not contain credentials");
  }
  return text;
}

function checkedPosition(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function checkedOptionalTimestamp(
  value: number | null | undefined,
  label: string,
): number | null {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer timestamp`);
  }
  return value;
}

function checkedLease(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 86_400_000) {
    throw new Error("Publication lease must be 1 through 86400000 milliseconds");
  }
  return value;
}

function checkedMetricSource(value: string): string {
  if (!isValidUnitSlug(value)) {
    throw new Error("Metric source must be a canonical kebab slug");
  }
  return value;
}

function checkedMetricCounter(
  value: number | null | undefined,
  label: string,
): number | null {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function checkedMetricNumber(
  value: number | null | undefined,
  label: string,
): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
  return value;
}

function checkedMetricRetentionCurve(
  value: MetricRetentionPoint[] | null | undefined,
): MetricRetentionPoint[] | null {
  const canonical = canonicalOptionalJson(
    value as unknown as JsonValue | null | undefined,
    "Metric retention curve",
  );
  if (canonical === null) return null;
  if (!Array.isArray(canonical)) {
    throw new Error("Metric retention curve must be an array");
  }
  for (const value of canonical) {
    if (value === null || Array.isArray(value) || typeof value !== "object") {
      throw new Error("Metric retention curve points must be objects");
    }
    const point = value as Record<string, JsonValue>;
    if (
      "pct" in point &&
      (typeof point.pct !== "number" || point.pct < 0 || point.pct > 100)
    ) {
      throw new Error("Metric retention pct must be a finite number from 0 through 100");
    }
    if (
      "watchRatio" in point &&
      (typeof point.watchRatio !== "number" || point.watchRatio < 0)
    ) {
      throw new Error("Metric retention watchRatio must be a finite non-negative number");
    }
  }
  return canonical as unknown as MetricRetentionPoint[];
}

function parseJson(value: string | null): JsonValue | null {
  return value === null ? null : (JSON.parse(value) as JsonValue);
}

function parseOptionalPublicJson(
  value: string | null,
  label: string,
): JsonValue | null {
  return value === null ? null : parsePublicJson(value, label);
}

function parsePublicJson(value: string, label: string): JsonValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} public JSON is invalid`);
  }
  return canonicalPublicJson(parsed, label);
}

function serializeJson(value: JsonValue | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

function canonicalOptionalJson(
  value: JsonValue | null | undefined,
  label: string,
): JsonValue | null {
  return value == null ? null : canonicalJson(value, label);
}

function canonicalOptionalPublicJson(
  value: JsonValue | null | undefined,
  label: string,
): JsonValue | null {
  return value == null ? null : canonicalPublicJson(value, label);
}

function canonicalJson(value: unknown, label: string): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${label} contains a non-finite number`);
    return value;
  }
  if (typeof value !== "object") throw new Error(`${label} must be JSON`);
  if (Array.isArray(value)) return value.map((item) => canonicalJson(item, label));
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} contains a non-JSON object`);
  }
  const result: Record<string, JsonValue> = {};
  for (const key of Object.keys(value).sort()) {
    result[key] = canonicalJson((value as Record<string, unknown>)[key], label);
  }
  return result;
}
