import type { QueryContext } from "../store/scope-context.js";
import {
  getMetricTotals,
  getPublication,
  getUnit,
  getUnitPresentation,
  getUnitRevision,
  listPresentationItems,
  listUnitItems,
  listMetricSnapshots,
} from "../store/units.js";
import { getArtifactRevision } from "../store/artifacts.js";
import { getDocumentRevision } from "../store/documents.js";
import { listRunAttempts, listRunResults, listRuns } from "../store/runs.js";
import type { MetricSnapshotDto } from "../store/types.js";

export type AnalyticsQueryFilter = {
  source?: string;
  asOf?: number;
  windowStart?: number;
  windowEnd?: number;
};

/** One filter-first, newest snapshot per Publication. */
export function queryPublicationPerformance(input: AnalyticsQueryFilter & {
  context: QueryContext;
  publicationIds: string[];
}) {
  const publications = input.publicationIds.map((publicationId) => {
    const publication = getPublication({ context: input.context, publicationId });
    const candidates = allPages((after) => listMetricSnapshots({
      context: input.context,
      publicationId,
      source: input.source,
      asOf: input.asOf,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      after,
      limit: 100,
    }));
    candidates.sort(compareNewest);
    const snapshot = candidates[0] ?? null;
    const presentation = getUnitPresentation({
      context: input.context,
      presentationId: publication.presentationId,
    });
    const revision = getUnitRevision({
      context: input.context,
      revisionId: presentation.unitRevisionId,
    });
    const unit = getUnit({ context: input.context, unitId: revision.unitId });
    const evidence = publicationSpendEvidence(
      input.context,
      publication.submissionRunId,
      revision.id,
      presentation.id,
    );
    const costUsd = evidence.costUsd;
    return {
      publication,
      snapshot,
      costUsd,
      costPerThousandViews: costPerThousandViews(costUsd, snapshot?.views ?? null),
      provenance: {
        unitId: unit.id,
        slug: unit.slug,
        format: unit.format,
        revisionId: revision.id,
        revisionNo: revision.revisionNo,
        parentRevisionId: revision.parentRevisionId,
        iterationId: revision.iterationId,
        authoredBySessionId: revision.authoredBySessionId,
      },
      spendEvidence: evidence,
    };
  });
  const metricTotals = getMetricTotals(input);
  const uniqueRuns = new Map(publications.flatMap((row) =>
    row.spendEvidence.contributingRuns.map((run) => [run.runId, run] as const)
  ));
  const contributingRuns = [...uniqueRuns.values()];
  const costComplete = contributingRuns.length > 0 &&
    contributingRuns.every((run) => run.costComplete);
  const costUsd = costComplete
    ? contributingRuns.reduce((sum, run) => sum + run.costUsd!, 0)
    : null;
  return {
    publications,
    totals: {
      ...metricTotals,
      costUsd,
      costComplete,
      costPerThousandViews: costPerThousandViews(costUsd, metricTotals.views),
    },
  };
}

/** Postmortem evidence keeps the immutable inputs and contributing Run ledger explicit. */
export function queryPublicationPostmortem(input: AnalyticsQueryFilter & {
  context: QueryContext;
  publicationIds: string[];
}) {
  const performance = queryPublicationPerformance(input);
  return {
    publications: performance.publications.map(({ publication, snapshot, provenance }) => ({
      publication,
      snapshot,
      provenance,
    })),
    evidence: performance.publications.map((row) => ({
      publicationId: row.publication.id,
      inputRevisionIds: row.spendEvidence.inputRevisionIds,
      contributingRuns: row.spendEvidence.contributingRuns,
    })),
  };
}

function publicationSpendEvidence(
  context: QueryContext,
  submissionRunId: string,
  unitRevisionId: string,
  presentationId: string,
) {
  const allItems = allPages((after) => listUnitItems({
    context,
    revisionId: unitRevisionId,
    after,
    limit: 100,
  }));
  const selected = allPages((after) => listPresentationItems({
    context,
    presentationId,
    after,
    limit: 100,
  }));
  const byId = new Map(allItems.map((item) => [item.id, item]));
  const items = selected.length === 0
    ? allItems
    : selected.map((item) => byId.get(item.unitItemId)!);
  const revisionIds = new Set<string>();
  for (const item of items) {
    let artifactId = item.artifactRevisionId;
    while (artifactId !== null && !revisionIds.has(artifactId)) {
      revisionIds.add(artifactId);
      artifactId = getArtifactRevision({ context, revisionId: artifactId }).parentRevisionId;
    }
    let documentId = item.documentRevisionId;
    while (documentId !== null && !revisionIds.has(documentId)) {
      revisionIds.add(documentId);
      documentId = getDocumentRevision({ context, revisionId: documentId }).parentRevisionId;
    }
  }
  const runs = allPages((after) => listRuns({ context, after, limit: 100 }));
  const contributingRuns = runs.flatMap((run) => {
    const results = allPages((after) => listRunResults({
      context,
      runId: run.id,
      after,
      limit: 100,
    }));
    const contributes = run.id === submissionRunId || results.some((result) =>
      (result.entityType === "artifact_revision" || result.entityType === "document_revision") &&
      revisionIds.has(result.entityId)
    );
    if (!contributes) return [];
    const attempts = allPages((after) => listRunAttempts({
      context,
      runId: run.id,
      after,
      limit: 100,
    }));
    const costComplete = attempts.length > 0 &&
      attempts.every((attempt) => attempt.costUsd !== null);
    return [{
      runId: run.id,
      kind: run.kind,
      costUsd: costComplete
        ? attempts.reduce((sum, attempt) => sum + attempt.costUsd!, 0)
        : null,
      costComplete,
      resultRevisionIds: results.flatMap((result) =>
        revisionIds.has(result.entityId) ? [result.entityId] : []
      ),
    }];
  });
  const costComplete = contributingRuns.length > 0 &&
    contributingRuns.every((run) => run.costComplete);
  return {
    inputRevisionIds: [...revisionIds],
    contributingRuns,
    costUsd: costComplete
      ? contributingRuns.reduce((sum, run) => sum + run.costUsd!, 0)
      : null,
    costComplete,
  };
}

function costPerThousandViews(costUsd: number | null, views: number | null): number | null {
  if (costUsd === null || views === null || views <= 0) return null;
  return Number(((costUsd * 1_000) / views).toFixed(6));
}

function compareNewest(left: MetricSnapshotDto, right: MetricSnapshotDto): number {
  return right.asOf - left.asOf ||
    right.createdAt - left.createdAt ||
    right.id.localeCompare(left.id);
}

function allPages<T>(
  read: (after: string | null) => { items: T[]; nextCursor: string | null },
): T[] {
  const items: T[] = [];
  let after: string | null = null;
  do {
    const page = read(after);
    items.push(...page.items);
    after = page.nextCursor;
  } while (after !== null);
  return items;
}
