import type { Database } from "bun:sqlite";
import { openDomainDb } from "./db.js";
import { resolveQueryContext, type QueryContext, type ResolvedScope } from "./scope-context.js";
import type { JsonValue } from "./types.js";

/**
 * Outcome reads for performance-linked eval (#558). Read-only joins over the
 * existing Unit → Presentation → Publication → Metric Snapshot chain plus the
 * per-Unit decision-ledger Documents. No schema of its own.
 *
 * Visibility: a Workspace context reads the whole Workspace TREE (Workspace-
 * owned Units and every Project's Units), the same explicit choice
 * `getWorkspaceOverview({ include: "tree" })` makes, because outcome baselines
 * are a property of the account, not of one Project. A Project or Session
 * context narrows to that Project plus Workspace-owned rows.
 *
 * The raw provider JSON of a snapshot never leaves this module: only the
 * whitelisted numeric facts of a `ralphy.analytics-import` envelope are
 * projected.
 */

/** Document kind + slug convention for the per-Unit decision ledger. */
export const DECISION_LEDGER_DOCUMENT_KIND = "custom" as const;
export const DECISION_LEDGER_BODY_KIND = "ralphy.decision-ledger";
export const DECISION_LEDGER_SLUG_PREFIX = "decision-ledger-";
const ANALYTICS_IMPORT_BODY_KIND = "ralphy.analytics-import";

export function decisionLedgerSlug(unitSlug: string): string {
  return `${DECISION_LEDGER_SLUG_PREFIX}${unitSlug}`;
}

export type UnitLocationDto = {
  unitId: string;
  slug: string;
  format: string;
  workspaceId: string;
  projectId: string | null;
  projectSlug: string | null;
  latestRevisionId: string | null;
  selectedRevisionId: string | null;
  matchedBy: "unit-id" | "unit-slug" | "project";
};

export type ImportFactsDto = {
  platform: string | null;
  capturedAt: number | null;
  postedAt: number | null;
  reach: number | null;
  saves: number | null;
  follows: number | null;
  avgWatchTimeSec: number | null;
  totalWatchTimeSec: number | null;
  avgWatchPct: number | null;
  completionPct: number | null;
  videoDurationSec: number | null;
  retention: Array<{ t: number; pct: number }> | null;
  approximateFields: string[];
  extractedBy: string | null;
  screenshotCount: number;
};

export type OutcomeObservationDto = {
  publicationId: string;
  platform: string;
  publicationState: string;
  publishedAt: number | null;
  url: string | null;
  snapshotCount: number;
  snapshot: {
    id: string;
    source: string;
    asOf: number;
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    watchTimeMs: number | null;
    avgViewDurationSec: number | null;
    retentionCurve: JsonValue | null;
    createdAt: number;
  };
  importFacts: ImportFactsDto | null;
};

export type DecisionLedgerDocumentDto = {
  documentId: string;
  currentRevisionId: string | null;
  body: JsonValue | null;
};

export type UnitOutcomeFactsDto = {
  unitId: string;
  slug: string;
  format: string;
  workspaceId: string;
  projectId: string | null;
  projectSlug: string | null;
  createdAt: number;
  ledger: DecisionLedgerDocumentDto | null;
  observations: OutcomeObservationDto[];
};

type UnitLocationDbRecord = Omit<UnitLocationDto, "matchedBy"> & { createdAt: number };

type ObservationDbRecord = {
  unitId: string;
  platform: string;
  publicationId: string;
  publicationState: string;
  publishedAt: number | null;
  url: string | null;
  metricId: string;
  source: string;
  asOf: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  watchTimeMs: number | null;
  avgViewDurationSec: number | null;
  retentionCurveJson: string | null;
  rawJson: string | null;
  createdAt: number;
};

type LedgerDbRecord = {
  documentId: string;
  projectId: string | null;
  currentRevisionId: string | null;
  body: string | null;
};

const UNIT_LOCATION_COLUMNS = `unit.id AS unitId, unit.slug AS slug, unit.format AS format,
  unit.workspace_id AS workspaceId, unit.project_id AS projectId,
  project.slug AS projectSlug, unit.latest_revision_id AS latestRevisionId,
  unit.selected_revision_id AS selectedRevisionId, unit.created_at AS createdAt`;

function unitScopeClause(scope: ResolvedScope): { sql: string; values: string[] } {
  return scope.projectId === null
    ? { sql: "unit.workspace_id = ?", values: [scope.workspaceId] }
    : {
        sql: "unit.workspace_id = ? AND (unit.project_id IS NULL OR unit.project_id = ?)",
        values: [scope.workspaceId, scope.projectId],
      };
}

/**
 * Resolve a Unit reference within the visible tree: a Unit ID, a Unit slug
 * (may match one Unit per Project), or a Project ID/slug (every Unit of that
 * Project). The caller decides what an ambiguous match means.
 */
export function locateUnits(input: { context: QueryContext; ref: string }): UnitLocationDto[] {
  const ref = typeof input.ref === "string" ? input.ref.trim() : "";
  if (!ref) throw new Error("Unit reference must not be empty");
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const visibility = unitScopeClause(scope);
  const query = (match: string, values: string[]) =>
    db
      .query<UnitLocationDbRecord, string[]>(
        `SELECT ${UNIT_LOCATION_COLUMNS}
         FROM units unit LEFT JOIN projects project ON project.id = unit.project_id
         WHERE ${visibility.sql} AND ${match}
         ORDER BY unit.created_at ASC, unit.id ASC LIMIT 101`,
      )
      .all(...visibility.values, ...values);
  const byId = query("unit.id = ?", [ref]);
  if (byId.length > 0) return byId.map((row) => location(row, "unit-id"));
  const bySlug = query("unit.slug = ?", [ref]);
  if (bySlug.length > 0) return bySlug.map((row) => location(row, "unit-slug"));
  return query("(project.id = ? OR project.slug = ?)", [ref, ref]).map((row) => location(row, "project"));
}

function location(row: UnitLocationDbRecord, matchedBy: UnitLocationDto["matchedBy"]): UnitLocationDto {
  return {
    unitId: row.unitId,
    slug: row.slug,
    format: row.format,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    projectSlug: row.projectSlug,
    latestRevisionId: row.latestRevisionId,
    selectedRevisionId: row.selectedRevisionId,
    matchedBy,
  };
}

/**
 * Every visible Unit with its newest Metric Snapshot per Publication and its
 * decision-ledger Document. Units without metrics are included (they count as
 * pending performance, never as zero).
 */
export function listUnitOutcomeFacts(input: { context: QueryContext }): UnitOutcomeFactsDto[] {
  const db = openDomainDb();
  return db.transaction(() => {
    const scope = resolveQueryContext(db, input.context);
    const visibility = unitScopeClause(scope);
    const units = db
      .query<UnitLocationDbRecord, string[]>(
        `SELECT ${UNIT_LOCATION_COLUMNS}
         FROM units unit LEFT JOIN projects project ON project.id = unit.project_id
         WHERE ${visibility.sql}
         ORDER BY unit.created_at ASC, unit.id ASC`,
      )
      .all(...visibility.values);
    const observations = db
      .query<ObservationDbRecord, string[]>(
        `SELECT unit.id AS unitId, presentation.platform AS platform,
                publication.id AS publicationId, publication.state AS publicationState,
                publication.published_at AS publishedAt, publication.url AS url,
                metric.id AS metricId, metric.source AS source, metric.as_of AS asOf,
                metric.views AS views, metric.likes AS likes, metric.comments AS comments,
                metric.shares AS shares, metric.watch_time_ms AS watchTimeMs,
                metric.avg_view_duration_sec AS avgViewDurationSec,
                metric.retention_curve_json AS retentionCurveJson,
                metric.raw_json AS rawJson, metric.created_at AS createdAt
         FROM metric_snapshots metric
         JOIN publications publication ON publication.id = metric.publication_id
         JOIN unit_presentations presentation ON presentation.id = publication.presentation_id
         JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
         JOIN units unit ON unit.id = revision.unit_id
         WHERE ${visibility.sql}`,
      )
      .all(...visibility.values);
    const ledgers = readLedgerDocuments(db, scope);

    const newest = new Map<string, { row: ObservationDbRecord; count: number }>();
    for (const row of observations) {
      const prior = newest.get(row.publicationId);
      if (!prior) {
        newest.set(row.publicationId, { row, count: 1 });
        continue;
      }
      prior.count += 1;
      if (compareNewest(row, prior.row) < 0) prior.row = row;
    }
    const byUnit = new Map<string, OutcomeObservationDto[]>();
    for (const { row, count } of newest.values()) {
      const list = byUnit.get(row.unitId) ?? [];
      list.push(toObservation(row, count));
      byUnit.set(row.unitId, list);
    }
    return units.map((unit) => ({
      unitId: unit.unitId,
      slug: unit.slug,
      format: unit.format,
      workspaceId: unit.workspaceId,
      projectId: unit.projectId,
      projectSlug: unit.projectSlug,
      createdAt: unit.createdAt,
      ledger: ledgers.get(unit.unitId) ?? null,
      observations: (byUnit.get(unit.unitId) ?? []).sort((left, right) =>
        left.platform.localeCompare(right.platform) || left.publicationId.localeCompare(right.publicationId)
      ),
    }));
  })();
}

/** The decision-ledger Document of one Unit, or null when none was written yet. */
export function findUnitLedgerDocument(input: {
  context: QueryContext;
  unitId: string;
}): DecisionLedgerDocumentDto | null {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const visibility = unitScopeClause(scope);
  const unit = db
    .query<{ slug: string; projectId: string | null; workspaceId: string }, string[]>(
      `SELECT unit.slug AS slug, unit.project_id AS projectId, unit.workspace_id AS workspaceId
       FROM units unit WHERE ${visibility.sql} AND unit.id = ?`,
    )
    .get(...visibility.values, input.unitId);
  if (!unit) throw new Error(`Unit not found: ${input.unitId}`);
  const row = db
    .query<LedgerDbRecord, [string, string | null, string, string]>(
      `SELECT d.id AS documentId, d.project_id AS projectId,
              d.current_revision_id AS currentRevisionId, r.body AS body
       FROM documents d
       LEFT JOIN document_revisions r ON r.id = d.current_revision_id
       WHERE d.workspace_id = ? AND d.project_id IS ? AND d.slug = ? AND d.kind = ?`,
    )
    .get(unit.workspaceId, unit.projectId, decisionLedgerSlug(unit.slug), DECISION_LEDGER_DOCUMENT_KIND);
  if (!row) return null;
  return {
    documentId: row.documentId,
    currentRevisionId: row.currentRevisionId,
    body: parseJson(row.body),
  };
}

/** Distinct models recorded on succeeded Run Attempts of one Project. */
export function listProjectAttemptModels(input: {
  context: QueryContext;
  projectId: string;
}): string[] {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  if (scope.projectId !== null && scope.projectId !== input.projectId) {
    throw new Error(`Project not found: ${input.projectId}`);
  }
  return db
    .query<{ model: string }, [string, string]>(
      `SELECT DISTINCT attempt.model AS model
       FROM run_attempts attempt JOIN runs run ON run.id = attempt.run_id
       WHERE run.workspace_id = ? AND run.project_id = ?
         AND attempt.model IS NOT NULL AND attempt.state = 'succeeded'
       ORDER BY attempt.model ASC`,
    )
    .all(scope.workspaceId, input.projectId)
    .map((row) => row.model);
}

function readLedgerDocuments(db: Database, scope: ResolvedScope): Map<string, DecisionLedgerDocumentDto> {
  const projectClause = scope.projectId === null ? "" : " AND (d.project_id IS NULL OR d.project_id = ?)";
  const rows = db
    .query<LedgerDbRecord, string[]>(
      `SELECT d.id AS documentId, d.project_id AS projectId,
              d.current_revision_id AS currentRevisionId, r.body AS body
       FROM documents d
       JOIN document_revisions r ON r.id = d.current_revision_id
       WHERE d.workspace_id = ? AND d.kind = ? AND d.slug LIKE ?${projectClause}`,
    )
    .all(
      scope.workspaceId,
      DECISION_LEDGER_DOCUMENT_KIND,
      `${DECISION_LEDGER_SLUG_PREFIX}%`,
      ...(scope.projectId === null ? [] : [scope.projectId]),
    );
  const out = new Map<string, DecisionLedgerDocumentDto>();
  for (const row of rows) {
    const body = parseJson(row.body);
    if (!body || typeof body !== "object" || Array.isArray(body)) continue;
    const record = body as Record<string, JsonValue>;
    if (record.kind !== DECISION_LEDGER_BODY_KIND || typeof record.unitId !== "string") continue;
    out.set(record.unitId, {
      documentId: row.documentId,
      currentRevisionId: row.currentRevisionId,
      body,
    });
  }
  return out;
}

function toObservation(row: ObservationDbRecord, count: number): OutcomeObservationDto {
  return {
    publicationId: row.publicationId,
    platform: row.platform,
    publicationState: row.publicationState,
    publishedAt: row.publishedAt,
    url: row.url,
    snapshotCount: count,
    snapshot: {
      id: row.metricId,
      source: row.source,
      asOf: row.asOf,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
      watchTimeMs: row.watchTimeMs,
      avgViewDurationSec: row.avgViewDurationSec,
      retentionCurve: parseJson(row.retentionCurveJson),
      createdAt: row.createdAt,
    },
    importFacts: importFacts(parseJson(row.rawJson)),
  };
}

/** Whitelisted projection of an analytics-import envelope; anything else stays private. */
function importFacts(raw: JsonValue | null): ImportFactsDto | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const envelope = raw as Record<string, JsonValue>;
  if (envelope.kind !== ANALYTICS_IMPORT_BODY_KIND || envelope.version !== 1) return null;
  const retention = Array.isArray(envelope.retention)
    ? envelope.retention.flatMap((point) => {
        if (!point || typeof point !== "object" || Array.isArray(point)) return [];
        const { t, pct } = point as Record<string, JsonValue>;
        return typeof t === "number" && typeof pct === "number" ? [{ t, pct }] : [];
      })
    : null;
  return {
    platform: typeof envelope.platform === "string" ? envelope.platform : null,
    capturedAt: num(envelope.capturedAt),
    postedAt: num(envelope.postedAt),
    reach: num(envelope.reach),
    saves: num(envelope.saves),
    follows: num(envelope.follows),
    avgWatchTimeSec: num(envelope.avgWatchTimeSec),
    totalWatchTimeSec: num(envelope.totalWatchTimeSec),
    avgWatchPct: num(envelope.avgWatchPct),
    completionPct: num(envelope.completionPct),
    videoDurationSec: num(envelope.videoDurationSec),
    retention,
    approximateFields: Array.isArray(envelope.approximateFields)
      ? envelope.approximateFields.filter((field): field is string => typeof field === "string")
      : [],
    extractedBy: typeof envelope.extractedBy === "string" ? envelope.extractedBy : null,
    screenshotCount: Array.isArray(envelope.screenshots) ? envelope.screenshots.length : 0,
  };
}

function num(value: JsonValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseJson(value: string | null): JsonValue | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return null;
  }
}

function compareNewest(left: ObservationDbRecord, right: ObservationDbRecord): number {
  return right.asOf - left.asOf || right.createdAt - left.createdAt || right.metricId.localeCompare(left.metricId);
}
