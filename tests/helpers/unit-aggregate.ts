import type { Database } from "bun:sqlite";
import { openDomainDb } from "../../cli/lib/store/db.js";
import type {
  PresentationCaptionRevisionRow,
  PresentationItemRow,
  PublicationRow,
  UnitAggregate,
  UnitItemRow,
  UnitPresentationAggregate,
  UnitPresentationRow,
  UnitRevisionAggregate,
  UnitRevisionRow,
  UnitRow,
} from "../../cli/lib/store/internal-types.js";
import type {
  JsonValue,
  PresentationCaptionState,
  PublicationClaimKind,
  PublicationRail,
  PublicationState,
} from "../../cli/lib/store/types.js";

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

type RevisionDbRow = {
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

type ItemDbRow = {
  id: string;
  unit_revision_id: string;
  artifact_revision_id: string | null;
  document_revision_id: string | null;
  role: string;
  position: number;
  config_json: string | null;
  created_at: number;
};

type PresentationDbRow = {
  id: string;
  unit_revision_id: string;
  platform: string;
  position: number;
  effective_caption_revision_id: string | null;
  cover_artifact_revision_id: string | null;
  crop_json: string | null;
  safe_area_json: string | null;
  options_json: string;
  created_at: number;
};

type CaptionDbRow = {
  id: string;
  presentation_id: string;
  revision_no: number;
  parent_revision_id: string | null;
  state: PresentationCaptionState;
  text: string;
  created_at: number;
};

type PresentationItemDbRow = {
  id: string;
  presentation_id: string;
  unit_item_id: string;
  position: number;
  config_json: string | null;
  created_at: number;
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
  claim_expires_at: number | null;
  created_at: number;
  updated_at: number;
};

export function getUnitAggregate(id: string): UnitAggregate {
  const db = openDomainDb();
  return db.transaction(() => {
    const row = db.query<UnitDbRow, [string]>(
      `SELECT id, workspace_id, project_id, slug, format, latest_revision_id,
              selected_revision_id, row_version, created_at, updated_at
       FROM units WHERE id = ?`,
    ).get(id);
    if (!row) throw new Error(`Unit not found: ${id}`);
    const unit: UnitRow = {
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
    const revisions = db.query<RevisionDbRow, [string]>(
      `SELECT id, unit_id, revision_no, parent_revision_id, iteration_id, note,
              metadata_json, authored_by_session_id, created_at, sealed_at
       FROM unit_revisions WHERE unit_id = ? ORDER BY revision_no ASC, id ASC`,
    ).all(id).map((revision) => revisionAggregate(db, revision));
    return { ...unit, revisions };
  })();
}

function revisionAggregate(db: Database, row: RevisionDbRow): UnitRevisionAggregate {
  const revision: UnitRevisionRow = {
    id: row.id,
    unitId: row.unit_id,
    revisionNo: row.revision_no,
    parentRevisionId: row.parent_revision_id,
    iterationId: row.iteration_id,
    note: row.note,
    metadata: json(row.metadata_json),
    authoredBySessionId: row.authored_by_session_id,
    createdAt: row.created_at,
    sealedAt: row.sealed_at,
  };
  const items = db.query<ItemDbRow, [string]>(
    `SELECT id, unit_revision_id, artifact_revision_id, document_revision_id,
            role, position, config_json, created_at FROM unit_items
     WHERE unit_revision_id = ? ORDER BY position ASC, id ASC`,
  ).all(row.id).map<UnitItemRow>((item) => ({
    id: item.id,
    unitRevisionId: item.unit_revision_id,
    artifactRevisionId: item.artifact_revision_id,
    documentRevisionId: item.document_revision_id,
    role: item.role,
    position: item.position,
    config: json(item.config_json),
    createdAt: item.created_at,
  }));
  const presentations = db.query<PresentationDbRow, [string]>(
    `SELECT id, unit_revision_id, platform, position,
            effective_caption_revision_id, cover_artifact_revision_id,
            crop_json, safe_area_json, options_json, created_at
     FROM unit_presentations WHERE unit_revision_id = ?
     ORDER BY position ASC, id ASC`,
  ).all(row.id).map((presentation) => presentationAggregate(db, presentation));
  return { ...revision, items, presentations };
}

function presentationAggregate(
  db: Database,
  row: PresentationDbRow,
): UnitPresentationAggregate {
  const presentation: UnitPresentationRow = {
    id: row.id,
    unitRevisionId: row.unit_revision_id,
    platform: row.platform,
    position: row.position,
    effectiveCaptionRevisionId: row.effective_caption_revision_id,
    coverArtifactRevisionId: row.cover_artifact_revision_id,
    crop: json(row.crop_json),
    safeArea: json(row.safe_area_json),
    options: JSON.parse(row.options_json) as JsonValue,
    createdAt: row.created_at,
  };
  const captions = db.query<CaptionDbRow, [string]>(
    `SELECT id, presentation_id, revision_no, parent_revision_id, state, text,
            created_at FROM presentation_caption_revisions
     WHERE presentation_id = ? ORDER BY revision_no ASC, id ASC`,
  ).all(row.id).map<PresentationCaptionRevisionRow>((caption) => ({
    id: caption.id,
    presentationId: caption.presentation_id,
    revisionNo: caption.revision_no,
    parentRevisionId: caption.parent_revision_id,
    state: caption.state,
    text: caption.text,
    createdAt: caption.created_at,
  }));
  const items = db.query<PresentationItemDbRow, [string]>(
    `SELECT id, presentation_id, unit_item_id, position, config_json, created_at
     FROM presentation_items WHERE presentation_id = ? ORDER BY position ASC, id ASC`,
  ).all(row.id).map<PresentationItemRow>((item) => ({
    id: item.id,
    presentationId: item.presentation_id,
    unitItemId: item.unit_item_id,
    position: item.position,
    config: json(item.config_json),
    createdAt: item.created_at,
  }));
  const publications = db.query<PublicationDbRow, [string]>(
    `SELECT id, presentation_id, effective_caption_revision_id,
            effective_options_json, social_account_id, submission_run_id,
            active_claim_run_id, revised_from_publication_id, rail,
            provider_publication_id, state, url, scheduled_at, submitted_at,
            published_at, error, failure_stage, idempotency_key, claim_kind,
            claim_epoch, claim_expires_at, created_at, updated_at
     FROM publications WHERE presentation_id = ? ORDER BY created_at ASC, id ASC`,
  ).all(row.id).map<PublicationRow>((publication) => ({
    id: publication.id,
    presentationId: publication.presentation_id,
    effectiveCaptionRevisionId: publication.effective_caption_revision_id,
    effectiveOptions: JSON.parse(publication.effective_options_json) as JsonValue,
    socialAccountId: publication.social_account_id,
    submissionRunId: publication.submission_run_id,
    activeClaimRunId: publication.active_claim_run_id,
    revisedFromPublicationId: publication.revised_from_publication_id,
    rail: publication.rail,
    providerPublicationId: publication.provider_publication_id,
    state: publication.state,
    url: publication.url,
    scheduledAt: publication.scheduled_at,
    submittedAt: publication.submitted_at,
    publishedAt: publication.published_at,
    error: publication.error,
    failureStage: publication.failure_stage,
    idempotencyKey: publication.idempotency_key,
    claimKind: publication.claim_kind,
    claimEpoch: publication.claim_epoch,
    claimExpiresAt: publication.claim_expires_at,
    createdAt: publication.created_at,
    updatedAt: publication.updated_at,
  }));
  return { ...presentation, captions, items, publications };
}

function json(value: string | null): JsonValue | null {
  return value === null ? null : (JSON.parse(value) as JsonValue);
}
