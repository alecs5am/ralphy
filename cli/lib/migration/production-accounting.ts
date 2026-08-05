import type { Database } from "bun:sqlite";

export type ProductionGraphExpectation =
  | {
    kind: "build";
    workspaceId: string;
    projectId: string | null;
    buildId: string;
    compositionRevisionId: string;
    artifactRevisionId: string;
    runId: string;
    attemptId: string;
    outputId: string;
    resultId: string;
    profile: string;
    outputRole: string;
    createdAt: number;
  }
  | {
    kind: "publication";
    workspaceId: string;
    projectId: string | null;
    publicationId: string;
    presentationId: string;
    captionId: string | null;
    options: string;
    account: { id: string; platform: string; externalId: string; createdAt: number } | null;
    runId: string;
    attemptId: string | null;
    resultId: string;
    revisedFromId: string | null;
    rail: string;
    providerId: string | null;
    state: string;
    url: string | null;
    scheduledAt: number | null;
    submittedAt: number | null;
    publishedAt: number | null;
    error: string | null;
    failureStage: string | null;
    idempotencyKey: string;
    createdAt: number;
    startedAt: number | null;
    endedAt: number;
    runState: "succeeded" | "failed";
  }
  | {
    kind: "approval";
    workspaceId: string;
    projectId: string | null;
    artifactId: string;
    revisionId: string;
    runId: string;
    runObjectId: string;
    objectId: string;
    createdAt: number;
  }
  | {
    kind: "idempotent-skip";
    workspaceId: string;
    projectId: string | null;
    publicationId: string;
    sourceRef: string;
    createdAt: number;
  }
  | { kind: "issue"; issueId: string; code: string };

export type ProductionSourceRecord = {
  entryId: string;
  rowOrdinal: number;
  targetSlot: number | null;
  digest: string;
  expected: ProductionGraphExpectation;
};

export type ProductionSourceFingerprintFact = {
  unitRecords: Array<{ entryId: string; revisionNo: number; itemOccurrences: number; digest: string }>;
  productionRecords: ProductionSourceRecord[];
  deliveryRecords: ProductionSourceRecord[];
  deliveryOccurrences: Array<{
    entryId: string;
    rowOrdinal: number;
    nonNullTargetCount: number;
    targets: Array<{ targetSlot: number | null; sourceDigest: string; expandedDigest: string }>;
  }>;
  metricRecords: Array<{
    entryId: string;
    rowOrdinal: number;
    metricId: string;
    winnerKey: string;
    asOf: number;
    createdAt: number;
    digest: string;
  }>;
  metricWinnerIds: string[];
};

export function isProductionSourceFingerprint(value: unknown): value is ProductionSourceFingerprintFact {
  if (!isRecord(value)) return false;
  const candidate = value as Partial<ProductionSourceFingerprintFact>;
  const records = (items: unknown, extra: (row: Record<string, unknown>) => boolean): boolean =>
    Array.isArray(items) && items.every((item) => isRecord(item)
      && typeof item.entryId === "string"
      && isDigest(item.digest)
      && extra(item));
  return records(candidate.unitRecords, (row) =>
    Number.isSafeInteger(row.revisionNo) && Number.isSafeInteger(row.itemOccurrences)
      && (row.itemOccurrences as number) > 0
  )
    && records(candidate.productionRecords, isSourceRecord)
    && records(candidate.deliveryRecords, isSourceRecord)
    && Array.isArray(candidate.deliveryOccurrences)
    && candidate.deliveryOccurrences.every(isDeliveryOccurrence)
    && records(candidate.metricRecords, (row) =>
      Number.isSafeInteger(row.rowOrdinal) && typeof row.metricId === "string"
        && typeof row.winnerKey === "string" && Number.isSafeInteger(row.asOf)
        && Number.isSafeInteger(row.createdAt)
    )
    && Array.isArray(candidate.metricWinnerIds)
    && candidate.metricWinnerIds.every((id) => typeof id === "string")
    && new Set(candidate.metricWinnerIds).size === candidate.metricWinnerIds.length;
}

export function productionSourceGraphMismatches(
  db: Database,
  source: Pick<ProductionSourceFingerprintFact, "productionRecords" | "deliveryRecords" | "deliveryOccurrences">,
): string[] {
  const mismatches = new Set<string>();
  const planned = new Map(source.deliveryRecords.map((record) => [recordKey(record), record]));
  const expectedKeys = new Set<string>();
  for (const inventory of source.deliveryOccurrences) {
    if (inventory.nonNullTargetCount !== inventory.targets.length) mismatches.add(inventory.entryId);
    for (const target of inventory.targets) {
      const key = recordKey({ ...inventory, targetSlot: target.targetSlot });
      expectedKeys.add(key);
      if (planned.get(key)?.digest !== target.expandedDigest) mismatches.add(inventory.entryId);
    }
  }
  for (const record of source.deliveryRecords) {
    if (!expectedKeys.has(recordKey(record))) mismatches.add(record.entryId);
  }
  for (const record of [...source.productionRecords, ...source.deliveryRecords]) {
    if (!matchesExpectation(db, record)) mismatches.add(record.entryId);
  }
  return [...mismatches].sort();
}

function matchesExpectation(db: Database, record: ProductionSourceRecord): boolean {
  const expected = record.expected;
  if (expected.kind === "issue") {
    const entry = db.query<{ sourceLocatorHash: string; runId: string }, [string]>(
      `SELECT source_locator_hash AS sourceLocatorHash, migration_run_id AS runId
       FROM migration_entries WHERE id = ?`,
    ).get(record.entryId);
    if (!entry) return false;
    return (db.query<{ count: number }, [string, string, string, string, number]>(
      `SELECT COUNT(*) AS count FROM migration_issues
       WHERE migration_run_id = ? AND id = ? AND code = ?
         AND json_extract(detail_json, '$.sourceLocatorHash') = ?
         AND line_no = ?`,
    ).get(entry.runId, expected.issueId, expected.code, entry.sourceLocatorHash, record.rowOrdinal)?.count ?? 0) === 1;
  }
  if (expected.kind === "build") return matchesBuild(db, expected);
  if (expected.kind === "publication") return matchesPublication(db, expected);
  if (expected.kind === "approval") return matchesApproval(db, expected);
  const activity = db.query<{ count: number }, [string, string, number, string, string | null]>(
    `SELECT COUNT(*) AS count FROM activity_events
     WHERE entity_type = 'publication' AND entity_id = ?
       AND action = 'publication.idempotent_skip'
       AND json_extract(payload_json, '$.sourceRef') = ? AND created_at = ?
       AND workspace_id = ? AND project_id IS ?`,
  ).get(
    expected.publicationId,
    expected.sourceRef,
    expected.createdAt,
    expected.workspaceId,
    expected.projectId,
  )?.count ?? 0;
  return activity === 1;
}

function matchesBuild(db: Database, expected: Extract<ProductionGraphExpectation, { kind: "build" }>): boolean {
  const row = db.query<Record<string, unknown>, [string]>(
    `SELECT build.composition_revision_id AS compositionRevisionId,
            build.run_id AS runId, build.state, build.profile_json AS profile,
            build.created_at AS buildCreatedAt, build.started_at AS buildStartedAt,
            build.ended_at AS buildEndedAt,
            run.workspace_id AS workspaceId, run.project_id AS projectId,
            run.kind AS runKind, run.state AS runState, run.created_at AS runCreatedAt,
            run.started_at AS runStartedAt, run.ended_at AS runEndedAt,
            attempt.id AS attemptId, attempt.attempt_no AS attemptNo,
            attempt.provider, attempt.state AS attemptState,
            attempt.started_at AS attemptStartedAt, attempt.ended_at AS attemptEndedAt,
            output.id AS outputId, output.artifact_revision_id AS artifactRevisionId,
            output.role AS outputRole, output.position AS outputPosition,
            result.id AS resultId, result.position AS resultPosition,
            result.entity_type AS resultType, result.entity_id AS resultEntityId,
            (SELECT COUNT(*) FROM run_attempts item WHERE item.run_id = run.id) AS attemptCount,
            (SELECT COUNT(*) FROM build_outputs item WHERE item.build_id = build.id) AS outputCount,
            (SELECT COUNT(*) FROM run_results item WHERE item.run_id = run.id) AS resultCount
     FROM builds build JOIN runs run ON run.id = build.run_id
     LEFT JOIN run_attempts attempt ON attempt.run_id = run.id
     LEFT JOIN build_outputs output ON output.build_id = build.id
     LEFT JOIN run_results result ON result.run_id = run.id
     WHERE build.id = ?`,
  ).get(expected.buildId);
  return !!row
    && row.compositionRevisionId === expected.compositionRevisionId
    && row.runId === expected.runId && row.state === "succeeded"
    && row.profile === JSON.stringify({ profile: expected.profile })
    && row.buildCreatedAt === expected.createdAt && row.buildStartedAt === expected.createdAt
    && row.buildEndedAt === expected.createdAt
    && row.workspaceId === expected.workspaceId && row.projectId === expected.projectId
    && row.runKind === "legacy-build" && row.runState === "succeeded"
    && row.runCreatedAt === expected.createdAt && row.runStartedAt === expected.createdAt
    && row.runEndedAt === expected.createdAt
    && row.attemptId === expected.attemptId && row.attemptNo === 1
    && row.provider === "legacy" && row.attemptState === "succeeded"
    && row.attemptStartedAt === expected.createdAt && row.attemptEndedAt === expected.createdAt
    && row.outputId === expected.outputId && row.artifactRevisionId === expected.artifactRevisionId
    && row.outputRole === expected.outputRole && row.outputPosition === 0
    && row.resultId === expected.resultId && row.resultPosition === 0
    && row.resultType === "build" && row.resultEntityId === expected.buildId
    && row.attemptCount === 1 && row.outputCount === 1 && row.resultCount === 1;
}

function matchesPublication(
  db: Database,
  expected: Extract<ProductionGraphExpectation, { kind: "publication" }>,
): boolean {
  const row = db.query<Record<string, unknown>, [string]>(
    `SELECT publication.presentation_id AS presentationId,
            publication.effective_caption_revision_id AS captionId,
            publication.effective_options_json AS options,
            publication.social_account_id AS accountId,
            publication.submission_run_id AS runId,
            publication.revised_from_publication_id AS revisedFromId,
            publication.rail, publication.provider_publication_id AS providerId,
            publication.state, publication.url, publication.scheduled_at AS scheduledAt,
            publication.submitted_at AS submittedAt, publication.published_at AS publishedAt,
            publication.error, publication.failure_stage AS failureStage,
            publication.idempotency_key AS idempotencyKey,
            publication.created_at AS createdAt, publication.updated_at AS updatedAt,
            run.workspace_id AS workspaceId, run.project_id AS projectId,
            run.kind AS runKind, run.state AS runState,
            run.created_at AS runCreatedAt, run.started_at AS runStartedAt,
            run.ended_at AS runEndedAt, run.error AS runError,
            attempt.id AS attemptId, attempt.attempt_no AS attemptNo,
            attempt.provider AS attemptProvider, attempt.state AS attemptState,
            attempt.started_at AS attemptStartedAt, attempt.ended_at AS attemptEndedAt,
            result.id AS resultId, result.position AS resultPosition,
            result.entity_type AS resultType, result.entity_id AS resultEntityId,
            (SELECT COUNT(*) FROM run_attempts item WHERE item.run_id = run.id) AS attemptCount,
            (SELECT COUNT(*) FROM run_results item WHERE item.run_id = run.id) AS resultCount
     FROM publications publication JOIN runs run ON run.id = publication.submission_run_id
     LEFT JOIN run_attempts attempt ON attempt.run_id = run.id
     LEFT JOIN run_results result ON result.run_id = run.id
     WHERE publication.id = ?`,
  ).get(expected.publicationId);
  if (!row
    || row.presentationId !== expected.presentationId || row.captionId !== expected.captionId
    || row.options !== expected.options || row.accountId !== (expected.account?.id ?? null)
    || row.runId !== expected.runId || row.revisedFromId !== expected.revisedFromId
    || row.rail !== expected.rail || row.providerId !== expected.providerId
    || row.state !== expected.state || row.url !== expected.url
    || row.scheduledAt !== expected.scheduledAt || row.submittedAt !== expected.submittedAt
    || row.publishedAt !== expected.publishedAt || row.error !== expected.error
    || row.failureStage !== expected.failureStage || row.idempotencyKey !== expected.idempotencyKey
    || row.createdAt !== expected.createdAt || row.updatedAt !== expected.endedAt
    || row.workspaceId !== expected.workspaceId || row.projectId !== expected.projectId
    || row.runKind !== "legacy-publication" || row.runState !== expected.runState
    || row.runCreatedAt !== expected.createdAt || row.runStartedAt !== expected.startedAt
    || row.runEndedAt !== expected.endedAt
    || row.runError !== (expected.runState === "failed" ? expected.error : null)
    || row.resultId !== expected.resultId || row.resultPosition !== 0
    || row.resultType !== "publication" || row.resultEntityId !== expected.publicationId
    || row.resultCount !== 1) return false;
  if (expected.attemptId === null) {
    if (row.attemptId !== null || row.attemptCount !== 0) return false;
  } else if (row.attemptId !== expected.attemptId || row.attemptNo !== 1
    || row.attemptProvider !== expected.rail
    || row.attemptState !== (expected.state === "failed" ? "failed" : "succeeded")
    || row.attemptStartedAt !== expected.createdAt || row.attemptEndedAt !== expected.endedAt
    || row.attemptCount !== 1) return false;
  if (expected.account === null) return true;
  const account = db.query<Record<string, unknown>, [string]>(
    `SELECT workspace_id AS workspaceId, platform, external_id AS externalId,
            created_at AS createdAt, updated_at AS updatedAt
     FROM social_accounts WHERE id = ?`,
  ).get(expected.account.id);
  return !!account && account.workspaceId === expected.workspaceId
    && account.platform === expected.account.platform && account.externalId === expected.account.externalId
    && account.createdAt === expected.account.createdAt && account.updatedAt === expected.account.createdAt;
}

function matchesApproval(db: Database, expected: Extract<ProductionGraphExpectation, { kind: "approval" }>): boolean {
  const row = db.query<Record<string, unknown>, [string, string, string]>(
    `SELECT artifact.workspace_id AS workspaceId, artifact.project_id AS projectId,
            artifact.kind, artifact.selected_revision_id AS selectedRevisionId,
            artifact.created_at AS artifactCreatedAt,
            revision.id AS revisionId, revision.object_id AS objectId,
            revision.revision_no AS revisionNo, revision.state AS revisionState,
            revision.created_at AS revisionCreatedAt,
            run.id AS runId, run.kind AS runKind, run.state AS runState,
            run.workspace_id AS runWorkspaceId, run.project_id AS runProjectId,
            run.created_at AS runCreatedAt, run.started_at AS runStartedAt,
            run.ended_at AS runEndedAt,
            runObject.id AS runObjectId, runObject.object_id AS runObjectObjectId,
            runObject.run_id AS runObjectRunId, runObject.purpose,
            runObject.state AS runObjectState, runObject.retention,
            runObject.created_at AS runObjectCreatedAt,
            (SELECT COUNT(*) FROM artifact_revisions item WHERE item.artifact_id = artifact.id) AS revisionCount,
            (SELECT COUNT(*) FROM run_objects item WHERE item.run_id = run.id) AS runObjectCount,
            (SELECT COUNT(*) FROM run_attempts item WHERE item.run_id = run.id) AS attemptCount,
            (SELECT COUNT(*) FROM run_results item WHERE item.run_id = run.id) AS resultCount
     FROM artifacts artifact
     JOIN artifact_revisions revision ON revision.artifact_id = artifact.id
     JOIN runs run ON run.id = ?
     JOIN run_objects runObject ON runObject.run_id = run.id AND runObject.id = ?
     WHERE artifact.id = ?`,
  ).get(expected.runId, expected.runObjectId, expected.artifactId);
  return !!row && row.workspaceId === expected.workspaceId && row.projectId === expected.projectId
    && row.kind === "approval" && row.selectedRevisionId === expected.revisionId
    && row.artifactCreatedAt === expected.createdAt
    && row.revisionId === expected.revisionId && row.objectId === expected.objectId
    && row.revisionNo === 1 && row.revisionState === "approved" && row.revisionCreatedAt === expected.createdAt
    && row.runId === expected.runId && row.runKind === "legacy-medium-approval"
    && row.runState === "succeeded" && row.runWorkspaceId === expected.workspaceId
    && row.runProjectId === expected.projectId && row.runCreatedAt === expected.createdAt
    && row.runStartedAt === null && row.runEndedAt === expected.createdAt && row.runObjectId === expected.runObjectId
    && row.runObjectObjectId === expected.objectId && row.runObjectRunId === expected.runId
    && row.purpose === "approval-evidence" && row.runObjectState === "promoted"
    && row.retention === "diagnostic" && row.runObjectCreatedAt === expected.createdAt
    && row.revisionCount === 1 && row.runObjectCount === 1
    && row.attemptCount === 0 && row.resultCount === 0;
}

function isSourceRecord(row: Record<string, unknown>): boolean {
  return Number.isSafeInteger(row.rowOrdinal)
    && (row.targetSlot === null || Number.isSafeInteger(row.targetSlot))
    && isExpectation(row.expected);
}

function isDeliveryOccurrence(value: unknown): boolean {
  if (!isRecord(value) || typeof value.entryId !== "string" || !Number.isSafeInteger(value.rowOrdinal)
    || !Number.isSafeInteger(value.nonNullTargetCount) || (value.nonNullTargetCount as number) < 1
    || !Array.isArray(value.targets) || value.targets.length !== value.nonNullTargetCount) return false;
  const slots = new Set<string>();
  for (const target of value.targets) {
    if (!isRecord(target) || (target.targetSlot !== null && !Number.isSafeInteger(target.targetSlot))
      || !isDigest(target.sourceDigest) || !isDigest(target.expandedDigest)) return false;
    const slot = String(target.targetSlot);
    if (slots.has(slot)) return false;
    slots.add(slot);
  }
  return true;
}

function recordKey(record: { entryId: string; rowOrdinal: number; targetSlot: number | null }): string {
  return `${record.entryId}\0${record.rowOrdinal}\0${record.targetSlot ?? "single"}`;
}

function isExpectation(value: unknown): value is ProductionGraphExpectation {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "issue") return strings(value, ["issueId", "code"]);
  if (value.kind === "idempotent-skip") {
    return strings(value, ["workspaceId", "publicationId", "sourceRef"])
      && nullableString(value.projectId) && nullableTime(value.createdAt);
  }
  if (value.kind === "approval") {
    return strings(value, ["workspaceId", "artifactId", "revisionId", "runId", "runObjectId", "objectId"])
      && nullableString(value.projectId) && nullableTime(value.createdAt);
  }
  if (value.kind === "build") {
    return strings(value, ["workspaceId", "buildId", "compositionRevisionId", "artifactRevisionId", "runId",
      "attemptId", "outputId", "resultId", "profile", "outputRole"])
      && nullableString(value.projectId) && nullableTime(value.createdAt);
  }
  if (value.kind !== "publication") return false;
  return strings(value, ["workspaceId", "publicationId", "presentationId", "options", "runId", "resultId",
    "rail", "state", "idempotencyKey", "runState"])
    && nullableString(value.projectId) && nullableString(value.captionId)
    && nullableString(value.attemptId) && nullableString(value.revisedFromId)
    && nullableString(value.providerId) && nullableString(value.url)
    && nullableString(value.error) && nullableString(value.failureStage)
    && [value.createdAt, value.startedAt, value.endedAt, value.scheduledAt, value.submittedAt, value.publishedAt]
      .every(nullableTime)
    && (value.account === null || (isRecord(value.account)
      && strings(value.account, ["id", "platform", "externalId"])
      && nullableTime(value.account.createdAt)));
}

function strings(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => typeof value[key] === "string");
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function nullableTime(value: unknown): boolean {
  return value === null || Number.isSafeInteger(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}
