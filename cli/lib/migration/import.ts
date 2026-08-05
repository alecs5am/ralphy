import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { credentialSecretRef } from "../providers/credentials.js";
import { appendActivity } from "../store/activity.js";
import type { DomainIdPrefix } from "../store/ids.js";
import { createSecretStore, type KeyProvider } from "../store/secrets.js";
import {
  classifyLegacyPath,
  isLegacyAssetManifestName,
  isLegacyDesktopDocumentPath,
  isLegacyDesktopReviewPath,
  isLegacyPublishLedgerName,
  isLegacyRegistryPath,
  isLegacyRootConfigPath,
  isLegacySecretCandidate,
  isLegacyUnitManifestName,
  LegacySanitizationCollisionError,
  normalizeLegacyDocumentBody,
  normalizeLegacyValue,
  normalizeRelativePath,
  parseLegacyJsonl,
  parseLegacyRegistry,
  redactLegacyOperationalText,
  sanitizeLegacyPayload,
} from "./legacy.js";
import type { MigrationContext, MigrationSourceRoot } from "./types.js";

export type MigrationImportSummary = {
  workspaces: number;
  projects: number;
  documents: number;
  revisions: number;
  issues: number;
};

export type ProductionImportSummary = {
  artifacts: number;
  compositions: number;
  builds: number;
  units: number;
  publications: number;
  metrics: number;
  issues: number;
};

export type DesktopStateImportSummary = {
  reviews: number;
  feedback: number;
  secrets: number;
  documents: number;
  issues: number;
};

type ProductionScope = {
  workspaceId: string;
  projectId: string | null;
  prefix: string;
};

type UnitEvidence = {
  entry: Entry;
  source: MigrationSourceRoot;
  scope: ProductionScope;
  value: Record<string, unknown>;
  unitKey: string;
  legacyId: string;
  slug: string;
  revisionNo: number;
};

type LegacyRecord = {
  entry: Entry;
  source: MigrationSourceRoot;
  scope: ProductionScope;
  rowOrdinal: number;
  targetSlot: number | null;
  value: Record<string, unknown>;
  unitKeyHint: string | null;
  unitRevisionHint: number | null;
};

type PublicationRail = "postiz" | "github-pages" | "devto" | "hashnode" | "manual";

type LegacyDeliverySemantics = {
  kind: "approval" | "idempotent-skip" | "partial" | "publication";
  rail: PublicationRail | null;
  state: "scheduled" | "submitted" | "published" | "failed" | null;
  providerExecuted: boolean;
  createdAt: number;
  scheduledAt: number | null;
  submittedAt: number | null;
  publishedAt: number | null;
  providerId: string | null;
  accountExternalId: string | null;
  url: string | null;
  error: string | null;
  failureStage: string | null;
};

type LegacyDeliveryValidation =
  | { ok: true; value: LegacyDeliverySemantics }
  | { ok: false; issueCode: string };

type PublicationCandidate = {
  record: LegacyRecord;
  legacyId: string;
  referenceKey: string;
  publicationId: string;
  runId: string;
  attemptId: string;
  resultId: string;
  presentationId: string;
  captionId: string | null;
  options: string;
  platform: string;
  rail: PublicationRail;
  account: { id: string; externalId: string } | null;
  providerId: string | null;
  state: "scheduled" | "submitted" | "published" | "failed";
  providerExecuted: boolean;
  createdAt: number;
  scheduledAt: number | null;
  submittedAt: number | null;
  publishedAt: number | null;
  url: string | null;
  error: string | null;
  failureStage: string | null;
  idempotencyKey: string;
  revisedFromId: string | null;
};

type ProductionPrepared = {
  entries: Entry[];
  sources: Map<string, MigrationSourceRoot>;
  files: Map<string, { entry: Entry; source: MigrationSourceRoot; raw: Buffer; scope: ProductionScope }>;
  units: UnitEvidence[];
  productions: LegacyRecord[];
  deliveries: LegacyRecord[];
  metrics: LegacyRecord[];
  issues: PreparedIssue[];
  pendingEntryIds: Set<string>;
};

type Entry = {
  id: string;
  sourceId: string;
  sourceKind: MigrationSourceRoot["kind"];
  sourceLabel: string;
  sourcePath: string;
  sourceLocatorHash: string;
  entryKind: string;
  disposition: string;
  state: string;
  device: string;
  inode: string;
  mode: number;
  bytes: number;
  mtimeMs: number;
  sha256: string | null;
  targetRefs: string | null;
  rawEvidenceObjectId: string | null;
};

type ScopeModel = {
  workspaces: Map<string, WorkspaceModel>;
  projects: Map<string, ProjectModel>;
  primaryWorkspaceBySource: Map<string, string>;
  authoritativePrimaryWorkspaceBySource: Map<string, string>;
  issues: PreparedIssue[];
};

type WorkspaceModel = {
  id: string;
  sourceId: string;
  slug: string;
  name: string;
};

type ProjectModel = {
  id: string;
  sourceId: string;
  workspaceId: string;
  slug: string;
  name: string;
  physical: boolean;
  registered: boolean;
  workspaceMismatch: boolean;
  duplicateAcrossWorkspaces: boolean;
};

type PreparedDocument = {
  entryId: string;
  documentId: string;
  revisionId: string;
  workspaceId: string;
  projectId: string | null;
  kind: DocumentKind;
  slug: string;
  title: string;
  format: "markdown" | "text" | "json";
  body: string;
  createdAt: number;
  sourcePath: string;
  bindingId: string | null;
  bindingRole: string | null;
};

type DocumentKind =
  | "brief"
  | "style-guide"
  | "production-plan"
  | "scenario"
  | "storyboard"
  | "research"
  | "postmortem"
  | "memory"
  | "note"
  | "custom";

export function importScopesAndDocuments(ctx: MigrationContext): MigrationImportSummary {
  const entries = migrationEntries(ctx);
  const sourceById = new Map(ctx.sourceRoots.map((source) => [source.id, source]));
  const prepared = prepareEntries(entries, sourceById);
  const scopes = buildScopeModel(ctx, entries, prepared);
  const documents: PreparedDocument[] = [];
  const refs = new Map<string, Set<string>>();
  const evidence = new Map<string, { targetPath: string; sha256: string }>();
  const secrets = new Set<string>();
  const issues: PreparedIssue[] = [];

  for (const item of prepared) {
    const { entry, source, raw } = item;
    if (entry.sourceKind === "desktop") continue;
    const kind = classifyLegacyPath(entry.sourcePath);
    if (kind === "job-database") continue;
    if (isLegacySecretCandidate(entry.sourcePath, raw)) {
      secrets.add(entry.id);
      continue;
    }
    if (entry.bytes > 0) {
      evidence.set(entry.id, {
        targetPath: evidencePath(entry),
        sha256: sha256(raw),
      });
    }
    if (kind === "raw-evidence") continue;
    const scope = scopeForPath(scopes, entry, source);
    if (!scope) continue;
    if (kind === "jsonl") {
      for (const record of parseLegacyJsonl(raw, entry.sourcePath)) {
        if (record.issue) {
          issues.push({
            entryId: null,
            issueKey: `jsonl:${entry.sourceLabel}:${entry.sourceLocatorHash}:${record.lineNo}`,
            code: record.issue.code,
            severity: record.issue.severity,
            lineNo: record.lineNo,
            detail: {
              ...record.issue.detail,
              evidenceTargetPath: `migration-evidence/diagnostics/${stableKey(entry.sourceLabel)}/${entry.sourceLocatorHash}-${record.lineNo}.raw`,
            },
          });
          continue;
        }
        if (record.value === null) continue;
        try {
          documents.push(preparedJsonDocument(
            ctx,
            entry,
            scope,
            record.value,
            `line-${record.lineNo}`,
            entry.mtimeMs,
            source.path,
          ));
        } catch (error) {
          if (!(error instanceof LegacySanitizationCollisionError)) throw error;
          issues.push({
            entryId: null,
            issueKey: `document-key-collision:${entry.sourceLabel}:${entry.sourceLocatorHash}:${record.lineNo}`,
            code: "MIGRATION_DOCUMENT_KEY_COLLISION",
            severity: "review",
            lineNo: record.lineNo,
            detail: { sourceLocatorHash: entry.sourceLocatorHash },
          });
        }
      }
      continue;
    }
    if (!["workspace", "project", "document"].includes(kind)) continue;
    let body: ReturnType<typeof normalizeLegacyDocumentBody>;
    try {
      body = normalizeLegacyDocumentBody(raw, source.path);
    } catch (error) {
      if (!(error instanceof LegacySanitizationCollisionError)) throw error;
      issues.push({
        entryId: null,
        issueKey: `document-key-collision:${entry.sourceLabel}:${entry.sourceLocatorHash}`,
        code: "MIGRATION_DOCUMENT_KEY_COLLISION",
        severity: "review",
        lineNo: null,
        detail: { sourceLocatorHash: entry.sourceLocatorHash },
      });
      continue;
    }
    if (!body) {
      issues.push({
        entryId: null,
        issueKey: `document:${entry.sourceLabel}:${entry.sourceLocatorHash}`,
        code: "MIGRATION_DOCUMENT_UNREADABLE",
        severity: "review",
        lineNo: null,
        detail: { sourceLocatorHash: entry.sourceLocatorHash },
      });
      continue;
    }
    documents.push(preparedDocument(ctx, entry, scope, body, entry.mtimeMs));
  }
  selectProjectDocumentBindings(ctx, documents, issues);

  ctx.db.transaction(() => {
    insertScopes(ctx, scopes, refs);
    for (const document of documents) {
      insertDocument(ctx, document);
      addRefs(
        refs,
        document.entryId,
        document.documentId,
        document.revisionId,
        ...(document.bindingId ? [document.bindingId] : []),
      );
      importDocumentSemantics(ctx, document, refs);
    }
    for (const entryId of secrets) {
      updateSecretEntry(ctx, entryId);
    }
    for (const entry of entries) {
      if (secrets.has(entry.id)) continue;
      const allocation = evidence.get(entry.id);
      const targetRefs = [...(refs.get(entry.id) ?? [])].sort();
      if (!allocation && targetRefs.length === 0) continue;
      updatePreparedEntry(
        ctx,
        entry.id,
        null,
        allocation?.targetPath ?? null,
        allocation?.sha256 ?? null,
        targetRefs,
      );
    }
    for (const issue of [...scopes.issues, ...issues]) insertIssue(ctx, issue);
    const blockers = ctx.db.query<{ count: number }, [string]>(
      `SELECT COUNT(*) AS count FROM migration_issues
       WHERE migration_run_id = ? AND severity = 'block' AND resolved_at IS NULL`,
    ).get(ctx.runId)?.count ?? 0;
    if (blockers === 0) {
      ctx.db.prepare("UPDATE migration_runs SET phase = 'import', updated_at = ? WHERE id = ?")
        .run(Date.now(), ctx.runId);
    }
  }).immediate();

  return {
    workspaces: scopes.workspaces.size,
    projects: scopes.projects.size,
    documents: ctx.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM documents").get()?.count ?? 0,
    revisions: ctx.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM document_revisions").get()?.count ?? 0,
    issues: ctx.db.query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM migration_issues WHERE migration_run_id = ? AND code LIKE 'MIGRATION_%'",
    ).get(ctx.runId)?.count ?? 0,
  };
}

export function importExecutionAndOperations(
  ctx: MigrationContext,
): { jobs: number; logs: number; artifacts: number; issues: number } {
  const entries = migrationEntries(ctx);
  const sourceById = new Map(ctx.sourceRoots.map((source) => [source.id, source]));
  const triplets = new Map<string, JobSourceFile[]>();
  for (const entry of entries) {
    if (classifyLegacyPath(entry.sourcePath) !== "job-database") continue;
    const source = sourceById.get(entry.sourceLabel);
    if (!source) throw new Error("Migration source identity is missing");
    const absolute = checkedSourceFile(source, entry);
    const group = triplets.get(source.id) ?? [];
    group.push({ entry, source, absolute });
    triplets.set(source.id, group);
  }
  const prepared = [...triplets.entries()]
    .sort(([left], [right]) => left < right ? -1 : left === right ? 0 : 1)
    .map(([sourceId, files]) => prepareJobSource(ctx, sourceId, files))
    .filter((source): source is PreparedJobSource => source !== null);
  let issues = 0;
  ctx.db.transaction(() => {
    for (const source of prepared) {
      for (const row of source.jobs) {
        const runId = stableId("run", ctx, `job:${source.sourceId}:${row.id}`);
        const resolvedProject = resolveLegacyJobProject(ctx.db, source.sourceId, row.projectId);
        const projectId = resolvedProject.projectId;
        if (resolvedProject.issueCode) {
          issues += 1;
          insertIssue(ctx, {
            entryId: null,
            issueKey: `job-project:${source.sourceId}:${row.id}`,
            code: resolvedProject.issueCode,
            severity: "review",
            lineNo: null,
            detail: { legacyJobId: row.id, sourceLabelHash: stableKey(source.sourceId) },
          });
        }
        insertOrValidateLegacyRun(ctx, source.sourceId, row, runId, projectId);
        insertOrValidateJob(ctx, row, runId, projectId);
      }
      for (const row of source.logs) insertOrValidateLog(ctx.db, row);
      for (const row of source.artifacts) insertOrValidateArtifact(ctx.db, row);
      for (const [jobId, fields] of source.redactedJobs) {
        issues += 1;
        insertIssue(ctx, {
          entryId: null,
          issueKey: `job-secret:${source.sourceId}:${jobId}`,
          code: "MIGRATION_JOB_SECRET_REDACTED",
          severity: "review",
          lineNo: null,
          detail: { legacyJobId: jobId, fields: [...fields].sort(), sourceLabelHash: stableKey(source.sourceId) },
        });
      }
      for (const file of source.files) {
        if (source.redactedJobs.size > 0) updateSecretEntry(ctx, file.entry.id);
        else updatePreparedEntry(ctx, file.entry.id, null, evidencePath(file.entry), file.sha256, []);
      }
      reconcileIds(ctx.db, "jobs", source.jobs.map((row) => row.id));
      reconcileIds(ctx.db, "job_logs", source.logs.map((row) => row.id));
      reconcileIds(ctx.db, "job_artifacts", source.artifacts.map((row) => row.id));
    }
  }).immediate();
  return {
    jobs: prepared.reduce((total, source) => total + source.jobs.length, 0),
    logs: prepared.reduce((total, source) => total + source.logs.length, 0),
    artifacts: prepared.reduce((total, source) => total + source.artifacts.length, 0),
    issues,
  };
}

export function importProductionAndDelivery(ctx: MigrationContext): ProductionImportSummary {
  const prepared = prepareProduction(ctx);
  const refs = new Map<string, Set<string>>();
  const issues = [...prepared.issues];
  const artifactBySourcePath = new Map<string, string>();
  const compositionBySourcePath = new Map<string, string>();
  const unitIds = new Map<string, string>();
  const presentations = new Map<string, string>();
  const publicationIds = new Map<string, string[]>();

  ctx.db.transaction(() => {
    importLegacyArtifacts(ctx, prepared, refs, artifactBySourcePath, issues);
    importLegacyCompositions(ctx, prepared, refs, compositionBySourcePath, issues);
    importLegacyBuilds(ctx, prepared, refs, artifactBySourcePath, compositionBySourcePath, issues);
    importLegacyUnits(ctx, prepared, refs, artifactBySourcePath, unitIds, presentations, issues);
    importLegacyPublications(ctx, prepared, refs, unitIds, presentations, publicationIds, issues);
    importLegacyMetrics(ctx, prepared, refs, publicationIds, issues);
    for (const issue of issues) insertIssue(ctx, issue);
    finalizeTaskFiveEntries(ctx, prepared.entries, refs, prepared.pendingEntryIds);
    const blockers = ctx.db.query<{ count: number }, [string]>(
      `SELECT COUNT(*) AS count FROM migration_issues
       WHERE migration_run_id = ? AND severity = 'block' AND resolved_at IS NULL`,
    ).get(ctx.runId)?.count ?? 0;
    if (blockers === 0) {
      ctx.db.prepare("UPDATE migration_runs SET phase = 'relations', updated_at = ? WHERE id = ?")
        .run(Date.now(), ctx.runId);
    }
  }).immediate();

  return {
    artifacts: countRows(ctx.db, "artifacts"),
    compositions: countRows(ctx.db, "compositions"),
    builds: countRows(ctx.db, "builds"),
    units: countRows(ctx.db, "units"),
    publications: countRows(ctx.db, "publications"),
    metrics: countRows(ctx.db, "metric_snapshots"),
    issues: ctx.db.query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM migration_issues WHERE migration_run_id = ? AND code LIKE 'MIGRATION_%'",
    ).get(ctx.runId)?.count ?? 0,
  };
}

export async function importDesktopStateAndSecrets(
  ctx: MigrationContext,
  options: { keyProvider?: KeyProvider } = {},
): Promise<DesktopStateImportSummary> {
  const entries = migrationEntries(ctx);
  const sources = new Map(ctx.sourceRoots.map((source) => [source.id, source]));
  const store = createSecretStore({ dataRoot: ctx.storeRoot, keyProvider: options.keyProvider });

  for (const entry of entries) {
    if (entry.state !== "inventoried" || entry.entryKind !== "file") continue;
    if (!isPotentialSecretEntry(entry)) continue;
    const source = sources.get(entry.sourceLabel);
    if (!source) throw new Error("Migration source identity is missing");
    const known = knownSecretShape(entry);
    if (known === "desktop-handoff") {
      const plan = desktopSecretHandoffPlan(ctx, entry);
      if (!plan) {
        insertIssue(ctx, secretIssue(entry, "MIGRATION_SECRET_UNKNOWN"));
        continue;
      }
      ctx.db.transaction(() => {
        recordDesktopSecretHandoffPlan(ctx, entry, plan);
        insertIssue(ctx, secretIssue(entry, "MIGRATION_DESKTOP_SECRET_HANDOFF_REQUIRED"));
      }).immediate();
      continue;
    }
    if (known === null) {
      insertIssue(ctx, secretIssue(entry, "MIGRATION_SECRET_UNKNOWN"));
      continue;
    }
    const absolute = checkedSourceFile(source, entry);
    if (known === "instagram-cookie") {
      if (entry.bytes !== 667_395) {
        insertIssue(ctx, secretIssue(entry, "MIGRATION_SECRET_UNKNOWN"));
        continue;
      }
      const workspaceId = workspaceForSource(ctx, entry.sourceLabel, null);
      const ref = `provider/instagram/workspace/${workspaceId}/cookies`;
      assertMigrationSecretImportable(ctx.db, {
        runId: ctx.runId,
        sourceEntryId: entry.id,
        refs: [ref],
        kind: "file",
      });
      await store.setSecretFile(ref, fs.readFileSync(absolute));
      completeMigrationSecretImport(ctx.db, {
        runId: ctx.runId,
        sourceEntryId: entry.id,
        refs: [ref],
        kind: "file",
      });
      continue;
    }
    const parsed = parseKnownCredentialFile(ctx, entry, source, fs.readFileSync(absolute), known);
    if (parsed === null) {
      insertIssue(ctx, secretIssue(entry, "MIGRATION_SECRET_UNKNOWN"));
      continue;
    }
    assertMigrationSecretImportable(ctx.db, {
      runId: ctx.runId,
      sourceEntryId: entry.id,
      refs: parsed.map((secret) => secret.ref),
      kind: "text",
    });
    for (const secret of parsed) await store.set(secret.ref, secret.value);
    ctx.db.transaction(() => {
      for (const secret of parsed) if (secret.account) insertSecretAccount(ctx, secret.account, secret.ref, entry.mtimeMs);
      completeMigrationSecretImport(ctx.db, {
        runId: ctx.runId,
        sourceEntryId: entry.id,
        refs: parsed.map((secret) => secret.ref),
        kind: "text",
      });
    }).immediate();
  }

  for (const entry of entries) {
    if (entry.sourceKind !== "desktop" || entry.state !== "inventoried" || entry.entryKind !== "file") continue;
    if (entry.disposition.startsWith("secret-") || isLegacySecretCandidate(entry.sourcePath)) continue;
    const source = sources.get(entry.sourceLabel);
    if (!source) throw new Error("Migration source identity is missing");
    if (isLegacyDesktopReviewPath(entry.sourcePath)) {
      ctx.db.transaction(() => importDesktopReviewFile(ctx, entry, source)).immediate();
    } else if (isLegacyDesktopDocumentPath(entry.sourcePath)) {
      ctx.db.transaction(() => importDesktopDocumentFile(ctx, entry, source)).immediate();
    }
  }

  return desktopImportSummary(ctx);
}

function prepareProduction(ctx: MigrationContext): ProductionPrepared {
  const entries = migrationEntries(ctx);
  const sources = new Map(ctx.sourceRoots.map((source) => [source.id, source]));
  const files = new Map<string, { entry: Entry; source: MigrationSourceRoot; raw: Buffer; scope: ProductionScope }>();
  const issues: PreparedIssue[] = [];
  const pendingEntryIds = new Set<string>();
  for (const entry of entries) {
    if (entry.sourceKind === "desktop" || entry.entryKind !== "file") continue;
    if (!isTaskFiveSource(entry.sourcePath, entry.disposition)) continue;
    if (entry.sourcePath === "farm" || entry.sourcePath.startsWith("farm/")) continue;
    const source = sources.get(entry.sourceLabel);
    if (!source) throw new Error("Migration source identity is missing");
    const scope = productionScope(ctx, entry);
    if (!scope) continue;
    const raw = fs.readFileSync(checkedSourceFile(source, entry));
    files.set(sourcePathKey(entry.sourceLabel, entry.sourcePath), { entry, source, raw, scope });
  }

  const units: UnitEvidence[] = [];
  for (const file of files.values()) {
    if (!isLegacyUnitManifestName(path.posix.basename(file.entry.sourcePath).toLowerCase())) continue;
    const value = parseJsonObject(file.raw);
    if (!value || !validLegacyUnitManifest(value, file.entry.mtimeMs)) {
      pendingEntryIds.add(file.entry.id);
      issues.push(productionIssue(file.entry, "unit-manifest", "MIGRATION_UNIT_MANIFEST_INVALID", "block"));
      continue;
    }
    const legacyId = typeof value.id === "string" && value.id.trim() ? value.id.trim() : path.posix.basename(path.posix.dirname(file.entry.sourcePath));
    const slug = safeSlug(legacyId);
    const revisionNo = positiveInteger(value.revision) ?? 1;
    units.push({
      ...file,
      value,
      legacyId,
      slug,
      revisionNo,
      unitKey: unitIdentityKey(file.entry.sourceLabel, file.scope, legacyId),
    });
  }

  const productions: LegacyRecord[] = [];
  const deliveries: LegacyRecord[] = [];
  const metrics: LegacyRecord[] = [];
  for (const file of files.values()) {
    const relative = file.entry.sourcePath.toLowerCase();
    const name = path.posix.basename(relative);
    if (isLegacyAssetManifestName(name)) {
      const root = parseJsonObject(file.raw);
      if (!root || !validLegacyAssetManifest(root)) {
        pendingEntryIds.add(file.entry.id);
        issues.push(productionIssue(file.entry, "asset-manifest", "MIGRATION_ASSET_MANIFEST_INVALID", "block"));
      }
    } else if (name === "captions.json") {
      const root = parseJsonObject(file.raw);
      if (!root || !validLegacyCaptionsManifest(root)) {
        pendingEntryIds.add(file.entry.id);
        issues.push(productionIssue(file.entry, "captions-manifest", "MIGRATION_CAPTIONS_MANIFEST_INVALID", "block"));
      }
    } else if (name === "production.json") {
      const root = parseJsonObject(file.raw);
      if (!root || !Array.isArray(root.productions) || !root.productions.every(validLegacyProductionRecord)) {
        pendingEntryIds.add(file.entry.id);
        issues.push(productionIssue(file.entry, "production-manifest", "MIGRATION_PRODUCTION_MANIFEST_INVALID", "block"));
      } else {
        collectObjectRecords(productions, file, root.productions, null, issues, "MIGRATION_PRODUCTION_RECORD_INVALID", validLegacyProductionRecord);
      }
    } else if (/(?:^|\/)production\/[^/]+\.jsonl$/u.test(relative)) {
      collectJsonlRecords(productions, file, null, issues, "MIGRATION_PRODUCTION_RECORD_INVALID", validLegacyProductionRecord);
    } else if (name === "delivery.json") {
      const root = parseJsonObject(file.raw);
      if (!root || !Array.isArray(root.attempts)
        || !root.attempts.every((value) => validateLegacyDeliverySemantics(value, false, file.entry.mtimeMs).ok)) {
        pendingEntryIds.add(file.entry.id);
        issues.push(productionIssue(file.entry, "delivery-manifest", "MIGRATION_DELIVERY_MANIFEST_INVALID", "block"));
      } else {
        collectObjectRecords(deliveries, file, root.attempts, null, issues, "MIGRATION_DELIVERY_RECORD_INVALID", validLegacyDeliveryShape);
      }
    } else if (/(?:^|\/)delivery\/[^/]+\.jsonl$/u.test(relative) || isLegacyPublishLedgerName(name)) {
      collectJsonlRecords(deliveries, file, null, issues, "MIGRATION_PUBLISH_RECORD_INVALID", validLegacyDeliveryShape);
    } else if (name === "analytics.jsonl") {
      collectJsonlRecords(metrics, file, null, issues, "MIGRATION_METRIC_RECORD_INVALID", isLegacyObjectRecord);
    }
  }
  for (const unit of units) {
    if (isRecord(unit.value.manifestOnlyAttempt)
      && validateLegacyDeliverySemantics(unit.value.manifestOnlyAttempt, true, unit.entry.mtimeMs).ok) {
      deliveries.push({
        entry: unit.entry,
        source: unit.source,
        scope: unit.scope,
        rowOrdinal: 1,
        targetSlot: null,
        value: unit.value.manifestOnlyAttempt,
        unitKeyHint: unit.unitKey,
        unitRevisionHint: unit.revisionNo,
      });
    }
  }
  return { entries, sources, files, units, productions, deliveries, metrics, issues, pendingEntryIds };
}

function collectObjectRecords(
  output: LegacyRecord[],
  file: { entry: Entry; source: MigrationSourceRoot; scope: ProductionScope },
  values: unknown[],
  unitKeyHint: string | null,
  issues: PreparedIssue[],
  code: string,
  valid: (value: unknown, hasUnitHint: boolean) => boolean,
): void {
  values.forEach((value, index) => {
    if (!isRecord(value) || !valid(value, unitKeyHint !== null)) {
      issues.push(productionIssue(file.entry, `${code}:${index + 1}`, code, "review", index + 1));
      return;
    }
    output.push({ ...file, rowOrdinal: index + 1, targetSlot: null, value, unitKeyHint, unitRevisionHint: null });
  });
}

function collectJsonlRecords(
  output: LegacyRecord[],
  file: { entry: Entry; source: MigrationSourceRoot; scope: ProductionScope; raw: Buffer },
  unitKeyHint: string | null,
  issues: PreparedIssue[],
  code: string,
  valid: (value: unknown, hasUnitHint: boolean) => boolean,
): void {
  for (const record of parseLegacyJsonl(file.raw, file.entry.sourcePath)) {
    if (record.issue || !isRecord(record.value) || !valid(record.value, unitKeyHint !== null)) {
      issues.push(productionIssue(file.entry, `${code}:${record.lineNo}`, code, "review", record.lineNo));
      continue;
    }
    output.push({ ...file, rowOrdinal: record.lineNo, targetSlot: null, value: record.value, unitKeyHint, unitRevisionHint: null });
  }
}

function importLegacyArtifacts(
  ctx: MigrationContext,
  prepared: ProductionPrepared,
  refs: Map<string, Set<string>>,
  artifactBySourcePath: Map<string, string>,
  issues: PreparedIssue[],
): void {
  const candidates = [...prepared.files.values()].filter((file) =>
    file.entry.disposition === "object"
    && !isCompositionSource(file.entry.sourcePath)
    && file.entry.bytes > 0
  );
  const candidatePaths = new Set(candidates.map((file) => sourcePathKey(file.entry.sourceLabel, file.entry.sourcePath)));
  const explicit = explicitArtifactPaths(prepared);
  const families = new Map<string, Array<{ file: typeof candidates[number]; revisionNo: number; familyPath: string }>>();
  for (const file of candidates) {
    const proven = provenRevisionPath(file.entry, candidatePaths);
    const familyKey = `${file.entry.sourceLabel}\0${file.scope.workspaceId}\0${file.scope.projectId ?? ""}\0${proven.familyPath}\0${proven.revisionStyle}`;
    const family = families.get(familyKey) ?? [];
    family.push({ file, revisionNo: proven.revisionNo, familyPath: proven.familyPath });
    families.set(familyKey, family);
  }
  const usedSlugs = new Set<string>();
  for (const [familyKey, family] of [...families].sort(([left], [right]) => left.localeCompare(right))) {
    family.sort((left, right) => left.revisionNo - right.revisionNo || left.file.entry.sourcePath.localeCompare(right.file.entry.sourcePath));
    const first = family[0]!;
    let slug = safeSlug(first.familyPath.replaceAll("/", "-"));
    const slugKey = `${first.file.scope.workspaceId}\0${first.file.scope.projectId ?? ""}\0${slug}`;
    if (usedSlugs.has(slugKey)) slug = `${slug}-${stableKey(familyKey).slice(0, 8)}`;
    usedSlugs.add(`${first.file.scope.workspaceId}\0${first.file.scope.projectId ?? ""}\0${slug}`);
    const artifactId = stableId("art", ctx, `artifact:${familyKey}`);
    const selected = family.filter((item) => explicit.has(sourcePathKey(item.file.entry.sourceLabel, item.file.entry.sourcePath)));
    const selectedRevisionId = selected.length === 1
      ? stableId("arev", ctx, `artifact-revision:${familyKey}:${selected[0]!.revisionNo}:${selected[0]!.file.entry.sourceLocatorHash}`)
      : null;
    if (selected.length > 1) {
      issues.push(productionIssue(first.file.entry, `artifact-selection:${familyKey}`, "MIGRATION_ARTIFACT_SELECTION_AMBIGUOUS", "review"));
    }
    insertArtifactIdentity(ctx.db, {
      id: artifactId,
      workspaceId: first.file.scope.workspaceId,
      projectId: first.file.scope.projectId,
      slug,
      kind: artifactKind(first.file.entry.sourcePath),
      createdAt: first.file.entry.mtimeMs,
    });
    let parentId: string | null = null;
    for (const item of family) {
      const objectId = objectIdForEntry(ctx.db, item.file.entry);
      const revisionId = stableId(
        "arev",
        ctx,
        `artifact-revision:${familyKey}:${item.revisionNo}:${item.file.entry.sourceLocatorHash}`,
      );
      insertExact(
        ctx.db,
        "artifact_revisions",
        revisionId,
        `INSERT INTO artifact_revisions
         (id, artifact_id, object_id, revision_no, parent_revision_id, iteration_id,
          state, metadata_json, authored_by_session_id, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?)`,
        [
          revisionId,
          artifactId,
          objectId,
          item.revisionNo,
          parentId,
          revisionId === selectedRevisionId ? "approved" : "candidate",
          JSON.stringify({
            migrationRunId: ctx.runId,
            sourceIdentityId: item.file.entry.sourceId,
            sourceLocatorHash: item.file.entry.sourceLocatorHash,
          }),
          item.file.entry.mtimeMs,
        ],
      );
      artifactBySourcePath.set(sourcePathKey(item.file.entry.sourceLabel, item.file.entry.sourcePath), revisionId);
      addRefs(refs, item.file.entry.id, artifactId, revisionId);
      parentId = revisionId;
    }
    setSelectedRevision(ctx.db, "artifacts", artifactId, selectedRevisionId, first.file.entry.mtimeMs);
    if (selected.length === 0 && family.some((item) => ambiguousRevisionName(item.file.entry.sourcePath))) {
      issues.push(productionIssue(first.file.entry, `artifact-head:${familyKey}`, "MIGRATION_ARTIFACT_HEAD_UNPROVEN", "review"));
    }
  }
}

function importLegacyCompositions(
  ctx: MigrationContext,
  prepared: ProductionPrepared,
  refs: Map<string, Set<string>>,
  compositionBySourcePath: Map<string, string>,
  issues: PreparedIssue[],
): void {
  const candidates = [...prepared.files.values()].filter((file) =>
    isCompositionSource(file.entry.sourcePath) && file.entry.bytes > 0 && file.entry.disposition === "object"
  );
  const candidatePaths = new Set(candidates.map((file) => sourcePathKey(file.entry.sourceLabel, file.entry.sourcePath)));
  const selectedPaths = new Set<string>();
  for (const record of prepared.productions) {
    if (record.value.selected !== true || typeof record.value.sourceRevision !== "string") continue;
    const resolved = resolveEvidencePath(prepared, record, record.value.sourceRevision, "project");
    if (resolved) selectedPaths.add(resolved);
  }
  const families = new Map<string, Array<{ file: typeof candidates[number]; revisionNo: number; familyPath: string }>>();
  for (const file of candidates) {
    const proven = provenRevisionPath(file.entry, candidatePaths);
    const familyKey = `${file.entry.sourceLabel}\0${file.scope.projectId ?? ""}\0${proven.familyPath}\0${proven.revisionStyle}`;
    const family = families.get(familyKey) ?? [];
    family.push({ file, revisionNo: proven.revisionNo, familyPath: proven.familyPath });
    families.set(familyKey, family);
  }
  const usedSlugs = new Set<string>();
  for (const [familyKey, family] of [...families].sort(([left], [right]) => left.localeCompare(right))) {
    family.sort((left, right) => left.revisionNo - right.revisionNo || left.file.entry.sourcePath.localeCompare(right.file.entry.sourcePath));
    const first = family[0]!;
    if (!first.file.scope.projectId) continue;
    let slug = safeSlug(path.posix.basename(first.familyPath));
    const slugKey = `${first.file.scope.projectId}\0${slug}`;
    if (usedSlugs.has(slugKey)) slug = `${slug}-${stableKey(familyKey).slice(0, 8)}`;
    usedSlugs.add(`${first.file.scope.projectId}\0${slug}`);
    const compositionId = stableId("comp", ctx, `composition:${familyKey}`);
    const selected = family.filter((item) => selectedPaths.has(sourcePathKey(item.file.entry.sourceLabel, item.file.entry.sourcePath)));
    const selectedRevisionId = selected.length === 1
      ? stableId("crev", ctx, `composition-revision:${familyKey}:${selected[0]!.revisionNo}:${selected[0]!.file.entry.sourceLocatorHash}`)
      : null;
    if (selected.length > 1) {
      issues.push(productionIssue(first.file.entry, `composition-selection:${familyKey}`, "MIGRATION_COMPOSITION_SELECTION_AMBIGUOUS", "review"));
    }
    insertCompositionIdentity(
      ctx.db,
      compositionId,
      first.file.scope.projectId,
      slug,
      first.file.entry.mtimeMs,
    );
    let parentId: string | null = null;
    for (const item of family) {
      const objectId = objectIdForEntry(ctx.db, item.file.entry);
      const objectDigest = ctx.db.query<{ sha256: string }, [string]>("SELECT sha256 FROM objects WHERE id = ?").get(objectId)?.sha256;
      if (!objectDigest) throw new Error("Migration Composition Object disappeared");
      const revisionId = stableId(
        "crev",
        ctx,
        `composition-revision:${familyKey}:${item.revisionNo}:${item.file.entry.sourceLocatorHash}`,
      );
      const sourceId = stableId("cfile", ctx, `composition-source:${revisionId}`);
      const existingRevision = ctx.db.query<{ state: string; compositionId: string; revisionNo: number; parentId: string | null }, [string]>(
        `SELECT state, composition_id AS compositionId, revision_no AS revisionNo,
                parent_revision_id AS parentId FROM composition_revisions WHERE id = ?`,
      ).get(revisionId);
      if (!existingRevision) {
        ctx.db.prepare(
          `INSERT INTO composition_revisions
           (id, composition_id, revision_no, parent_revision_id, iteration_id, state,
            engine, engine_version, engine_config_json, manifest_sha256,
            authored_by_session_id, created_at, sealed_at)
           VALUES (?, ?, ?, ?, NULL, 'draft', 'legacy-html', NULL, '{}', NULL, NULL, ?, NULL)`,
        ).run(revisionId, compositionId, item.revisionNo, parentId, item.file.entry.mtimeMs);
        ctx.db.prepare(
          `INSERT INTO composition_revision_files
           (id, composition_revision_id, logical_path, object_id, position, created_at)
           VALUES (?, ?, ?, ?, 0, ?)`,
        ).run(sourceId, revisionId, path.posix.basename(item.file.entry.sourcePath), objectId, item.file.entry.mtimeMs);
        ctx.db.prepare(
          `UPDATE composition_revisions
           SET state = 'sealed', manifest_sha256 = ?, sealed_at = ? WHERE id = ? AND state = 'draft'`,
        ).run(objectDigest, item.file.entry.mtimeMs, revisionId);
      } else {
        if (existingRevision.state !== "sealed" || existingRevision.compositionId !== compositionId
          || existingRevision.revisionNo !== item.revisionNo || existingRevision.parentId !== parentId) {
          throw new Error("Migration Composition revision replay conflict");
        }
        const existingSource = ctx.db.query<{ objectId: string }, [string]>(
          "SELECT object_id AS objectId FROM composition_revision_files WHERE id = ?",
        ).get(sourceId);
        if (existingSource?.objectId !== objectId) throw new Error("Migration Composition source replay conflict");
      }
      compositionBySourcePath.set(sourcePathKey(item.file.entry.sourceLabel, item.file.entry.sourcePath), revisionId);
      addRefs(refs, item.file.entry.id, compositionId, revisionId, sourceId);
      parentId = revisionId;
    }
    setSelectedRevision(ctx.db, "compositions", compositionId, selectedRevisionId, first.file.entry.mtimeMs);
    if (selected.length === 0 && family.some((item) => ambiguousRevisionName(item.file.entry.sourcePath))) {
      issues.push(productionIssue(first.file.entry, `composition-head:${familyKey}`, "MIGRATION_COMPOSITION_HEAD_UNPROVEN", "review"));
    }
  }
}

function importLegacyBuilds(
  ctx: MigrationContext,
  prepared: ProductionPrepared,
  refs: Map<string, Set<string>>,
  artifactBySourcePath: ReadonlyMap<string, string>,
  compositionBySourcePath: ReadonlyMap<string, string>,
  issues: PreparedIssue[],
): void {
  for (const record of prepared.productions) {
    if (!validLegacyProductionRecord(record.value)) {
      issues.push(productionIssue(record.entry, `build-record:${record.rowOrdinal}`, "MIGRATION_PRODUCTION_RECORD_INVALID", "review", record.rowOrdinal));
      continue;
    }
    const sourceValue = typeof record.value.sourceRevision === "string" ? record.value.sourceRevision : null;
    const outputValue = typeof record.value.output === "string" ? record.value.output : null;
    const sourcePath = sourceValue ? resolveEvidencePath(prepared, record, sourceValue, "project") : null;
    const outputPath = outputValue ? resolveEvidencePath(prepared, record, outputValue, "project") : null;
    const revisionId = sourcePath ? compositionBySourcePath.get(sourcePath) : null;
    const artifactRevisionId = outputPath ? artifactBySourcePath.get(outputPath) : null;
    if (!revisionId || !artifactRevisionId) {
      issues.push(productionIssue(record.entry, `build-binding:${record.rowOrdinal}`, "MIGRATION_BUILD_BINDING_AMBIGUOUS", "review", record.rowOrdinal));
      continue;
    }
    const key = `${record.entry.sourceId}:${record.entry.sourceLocatorHash}:${record.rowOrdinal}`;
    const runId = stableId("run", ctx, `legacy-build:${key}`);
    const buildId = stableId("build", ctx, `legacy-build:${key}`);
    const outputId = stableId("output", ctx, `legacy-build-output:${key}`);
    const attemptId = stableId("attempt", ctx, `legacy-build-attempt:${key}`);
    const resultId = stableId("result", ctx, `legacy-build-result:${key}`);
    const createdAt = legacyTime(record.value.completedAt, record.entry.mtimeMs);
    const existing = ctx.db.query<{ id: string }, [string]>("SELECT id FROM builds WHERE id = ?").get(buildId);
    if (!existing) {
      insertPendingRun(ctx, runId, record.scope, "legacy-build", `Legacy build ${stableKey(key)}`, createdAt, {
        migrationRunId: ctx.runId,
        sourceLocatorHash: record.entry.sourceLocatorHash,
      });
      ctx.db.prepare(
        `INSERT INTO builds
         (id, composition_revision_id, run_id, state, profile_json, created_at)
         VALUES (?, ?, ?, 'pending', ?, ?)`,
      ).run(buildId, revisionId, runId, JSON.stringify({ profile: safeToken(record.value.profile, "legacy") }), createdAt);
      ctx.db.prepare("UPDATE builds SET state = 'running', started_at = ? WHERE id = ?").run(createdAt, buildId);
      ctx.db.prepare("UPDATE runs SET state = 'running', started_at = ? WHERE id = ?").run(createdAt, runId);
      ctx.db.prepare(
        `INSERT INTO run_attempts
         (id, run_id, attempt_no, provider, model, state, started_at, ended_at)
         VALUES (?, ?, 1, 'legacy', NULL, 'succeeded', ?, ?)`,
      ).run(attemptId, runId, createdAt, createdAt);
      ctx.db.prepare(
        `INSERT INTO build_outputs (id, build_id, artifact_revision_id, role, position, created_at)
         VALUES (?, ?, ?, ?, 0, ?)`,
      ).run(outputId, buildId, artifactRevisionId, safeToken(record.value.profile, "output"), createdAt);
      ctx.db.prepare("UPDATE builds SET state = 'succeeded', ended_at = ? WHERE id = ?").run(createdAt, buildId);
      ctx.db.prepare(
        `INSERT INTO run_results (id, run_id, position, entity_type, entity_id, created_at)
         VALUES (?, ?, 0, 'build', ?, ?)`,
      ).run(resultId, runId, buildId, createdAt);
      ctx.db.prepare("UPDATE runs SET state = 'succeeded', ended_at = ? WHERE id = ?").run(createdAt, runId);
    } else {
      assertBuildReplay(ctx.db, buildId, revisionId, artifactRevisionId, runId);
    }
    addRefs(refs, record.entry.id, revisionId, artifactRevisionId, runId, attemptId, buildId, outputId, resultId);
  }
}

function importLegacyUnits(
  ctx: MigrationContext,
  prepared: ProductionPrepared,
  refs: Map<string, Set<string>>,
  artifactBySourcePath: ReadonlyMap<string, string>,
  unitIds: Map<string, string>,
  presentations: Map<string, string>,
  issues: PreparedIssue[],
): void {
  const grouped = new Map<string, UnitEvidence[]>();
  for (const unit of prepared.units) {
    const list = grouped.get(unit.unitKey) ?? [];
    list.push(unit);
    grouped.set(unit.unitKey, list);
  }
  for (const [unitKey, revisions] of [...grouped].sort(([left], [right]) => left.localeCompare(right))) {
    revisions.sort((left, right) => left.revisionNo - right.revisionNo || left.entry.sourcePath.localeCompare(right.entry.sourcePath));
    const first = revisions[0]!;
    const duplicateRevision = revisions.find((revision, index) => revisions[index - 1]?.revisionNo === revision.revisionNo);
    if (duplicateRevision) {
      issues.push(productionIssue(duplicateRevision.entry, `unit-revision:${unitKey}:${duplicateRevision.revisionNo}`, "MIGRATION_UNIT_REVISION_AMBIGUOUS", "block"));
      continue;
    }
    const unitId = stableId("unit", ctx, `unit:${unitKey}`);
    unitIds.set(unitKey, unitId);
    const format = safeToken(first.value.format, "post");
    insertOrValidateUnitIdentity(ctx.db, {
      id: unitId,
      workspaceId: first.scope.workspaceId,
      projectId: first.scope.projectId,
      slug: first.slug,
      format,
      createdAt: first.entry.mtimeMs,
    });
    let parentId: string | null = null;
    const selected: string[] = [];
    for (const revision of revisions) {
      const revisionId = stableId("urev", ctx, `unit-revision:${unitKey}:${revision.revisionNo}:${revision.entry.sourceLocatorHash}`);
      const existing = ctx.db.query<{ sealedAt: number | null }, [string]>(
        "SELECT sealed_at AS sealedAt FROM unit_revisions WHERE id = ?",
      ).get(revisionId);
      if (!existing) {
        ctx.db.prepare(
          `INSERT INTO unit_revisions
           (id, unit_id, revision_no, parent_revision_id, iteration_id, note,
            metadata_json, authored_by_session_id, created_at, sealed_at)
           VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL, ?, NULL)`,
        ).run(
          revisionId,
          unitId,
          revision.revisionNo,
          parentId,
          JSON.stringify({
            migrationRunId: ctx.runId,
            sourceIdentityId: revision.entry.sourceId,
            sourceLocatorHash: revision.entry.sourceLocatorHash,
          }),
          revision.entry.mtimeMs,
        );
        const itemIds = insertLegacyUnitItems(ctx, prepared, revision, revisionId, artifactBySourcePath, refs, issues);
        insertLegacyPresentations(
          ctx,
          prepared,
          revision,
          revisionId,
          itemIds,
          presentations,
          refs,
          issues,
        );
        ctx.db.prepare("UPDATE unit_revisions SET sealed_at = ? WHERE id = ? AND sealed_at IS NULL")
          .run(revision.entry.mtimeMs, revisionId);
      } else {
        assertUnitRevisionReplay(ctx.db, revisionId, unitId, revision.revisionNo, parentId);
        const graph = existingUnitGraph(ctx.db, revisionId);
        for (const presentation of graph.presentations) {
          presentations.set(`${unitKey}\0${revision.revisionNo}\0${presentation.platform}`, presentation.id);
        }
        addRefs(refs, revision.entry.id, ...graph.refs);
      }
      if (revision.value.selected === true) selected.push(revisionId);
      addRefs(refs, revision.entry.id, unitId, revisionId);
      parentId = revisionId;
    }
    if (selected.length === 1) {
      const current = ctx.db.query<{ selected: string | null }, [string]>(
        "SELECT selected_revision_id AS selected FROM units WHERE id = ?",
      ).get(unitId)?.selected ?? null;
      if (current === null) {
        ctx.db.prepare("UPDATE units SET selected_revision_id = ?, row_version = row_version + 1, updated_at = ? WHERE id = ?")
          .run(selected[0]!, revisions.at(-1)!.entry.mtimeMs, unitId);
      } else if (current !== selected[0]) throw new Error("Migration Unit selection replay conflict");
    } else if (selected.length > 1) {
      issues.push(productionIssue(first.entry, `unit-selection:${unitKey}`, "MIGRATION_UNIT_SELECTION_AMBIGUOUS", "review"));
    }
  }
}

function insertLegacyUnitItems(
  ctx: MigrationContext,
  prepared: ProductionPrepared,
  unit: UnitEvidence,
  revisionId: string,
  artifactBySourcePath: ReadonlyMap<string, string>,
  refs: Map<string, Set<string>>,
  issues: PreparedIssue[],
): string[] {
  const itemIds: string[] = [];
  const media = Array.isArray(unit.value.media) ? unit.value.media : [];
  for (const [position, value] of media.entries()) {
    if (typeof value !== "string") {
      issues.push(productionIssue(unit.entry, `unit-media:${unit.unitKey}:${unit.revisionNo}:${position}`, "MIGRATION_UNIT_ITEM_AMBIGUOUS", "review"));
      continue;
    }
    const sourcePath = resolveEvidencePath(prepared, unit, value, "project");
    const artifactRevisionId = sourcePath
      ? resolveUnitArtifactRevision(ctx, prepared, unit, sourcePath, artifactBySourcePath)
      : null;
    if (!artifactRevisionId) {
      issues.push(productionIssue(unit.entry, `unit-media:${unit.unitKey}:${unit.revisionNo}:${position}`, "MIGRATION_UNIT_ITEM_AMBIGUOUS", "review"));
      continue;
    }
    const itemId = stableId("item", ctx, `unit-item:${revisionId}:${position}`);
    insertExact(
      ctx.db,
      "unit_items",
      itemId,
      `INSERT INTO unit_items
       (id, unit_revision_id, artifact_revision_id, document_revision_id,
        role, position, config_json, created_at)
       VALUES (?, ?, ?, NULL, 'media', ?, NULL, ?)`,
      [itemId, revisionId, artifactRevisionId, itemIds.length, unit.entry.mtimeMs],
    );
    itemIds.push(itemId);
    addRefs(refs, unit.entry.id, itemId);
  }
  const documentRevisionId = unitDocumentRevision(ctx, prepared, unit, refs, issues);
  if (documentRevisionId) {
    const itemId = stableId("item", ctx, `unit-item:${revisionId}:${itemIds.length}`);
    insertExact(
      ctx.db,
      "unit_items",
      itemId,
      `INSERT INTO unit_items
       (id, unit_revision_id, artifact_revision_id, document_revision_id,
        role, position, config_json, created_at)
       VALUES (?, ?, NULL, ?, ?, ?, NULL, ?)`,
      [
        itemId,
        revisionId,
        documentRevisionId,
        Array.isArray(unit.value.items) ? "thread" : "body",
        itemIds.length,
        unit.entry.mtimeMs,
      ],
    );
    itemIds.push(itemId);
    addRefs(refs, unit.entry.id, itemId);
  }
  if (itemIds.length === 0) {
    const fallback = createInlineUnitDocument(ctx, unit, "", refs);
    const itemId = stableId("item", ctx, `unit-item:${revisionId}:0`);
    insertExact(
      ctx.db,
      "unit_items",
      itemId,
      `INSERT INTO unit_items
       (id, unit_revision_id, artifact_revision_id, document_revision_id,
        role, position, config_json, created_at)
       VALUES (?, ?, NULL, ?, 'body', 0, NULL, ?)`,
      [itemId, revisionId, fallback, unit.entry.mtimeMs],
    );
    itemIds.push(itemId);
    addRefs(refs, unit.entry.id, itemId);
    issues.push(productionIssue(unit.entry, `unit-empty:${unit.unitKey}:${unit.revisionNo}`, "MIGRATION_UNIT_EMPTY_REVIEW", "review"));
  }
  return itemIds;
}

function resolveUnitArtifactRevision(
  ctx: MigrationContext,
  prepared: ProductionPrepared,
  unit: UnitEvidence,
  sourceKey: string,
  artifactBySourcePath: ReadonlyMap<string, string>,
): string | null {
  const exact = artifactBySourcePath.get(sourceKey) ?? null;
  const source = prepared.files.get(sourceKey);
  if (!exact || !source) return exact;
  const digest = ctx.db.query<{ sha256: string }, [string]>(
    "SELECT sha256 FROM objects WHERE id = ?",
  ).get(objectIdForEntry(ctx.db, source.entry))?.sha256;
  if (!digest) return exact;
  const proven = provenArtifactPaths(prepared);
  const aliases = new Set<string>();
  for (const [candidateKey, revisionId] of artifactBySourcePath) {
    if (candidateKey === sourceKey || !proven.has(candidateKey)) continue;
    const candidate = prepared.files.get(candidateKey);
    if (!candidate || candidate.scope.workspaceId !== unit.scope.workspaceId
      || candidate.scope.projectId !== unit.scope.projectId) continue;
    const candidateDigest = ctx.db.query<{ sha256: string }, [string]>(
      "SELECT sha256 FROM objects WHERE id = ?",
    ).get(objectIdForEntry(ctx.db, candidate.entry))?.sha256;
    if (candidateDigest === digest) aliases.add(revisionId);
  }
  if (aliases.size === 0) return exact;
  return aliases.size === 1 ? [...aliases][0]! : null;
}

function unitDocumentRevision(
  ctx: MigrationContext,
  prepared: ProductionPrepared,
  unit: UnitEvidence,
  refs: Map<string, Set<string>>,
  issues: PreparedIssue[],
): string | null {
  if (typeof unit.value.body === "string") return createInlineUnitDocument(ctx, unit, unit.value.body, refs);
  if (Array.isArray(unit.value.items)) {
    const sanitized = sanitizeLegacyPayload(unit.value.items, unit.source.path, true);
    return createInlineUnitDocument(ctx, unit, JSON.stringify(sanitized.value), refs);
  }
  if (typeof unit.value.bodyPath !== "string") return null;
  const key = resolveEvidencePath(prepared, unit, unit.value.bodyPath, "adjacent");
  const entry = key ? prepared.entries.find((candidate) => sourcePathKey(candidate.sourceLabel, candidate.sourcePath) === key) : null;
  const documentRevisionId = entry ? entryRefs(entry).find((id) => id.startsWith("drev_")) : null;
  if (!documentRevisionId) {
    issues.push(productionIssue(unit.entry, `unit-body:${unit.unitKey}:${unit.revisionNo}`, "MIGRATION_UNIT_DOCUMENT_AMBIGUOUS", "review"));
    return null;
  }
  return documentRevisionId;
}

function createInlineUnitDocument(
  ctx: MigrationContext,
  unit: UnitEvidence,
  body: string,
  refs: Map<string, Set<string>>,
): string {
  const key = `${unit.unitKey}:${unit.revisionNo}:body`;
  const documentId = stableId("doc", ctx, `unit-document:${key}`);
  const revisionId = stableId("drev", ctx, `unit-document-revision:${key}`);
  const normalizedValue = normalizeLegacyValue(body, unit.source.path);
  const normalized = typeof normalizedValue === "string" ? normalizedValue : JSON.stringify(normalizedValue);
  insertDocumentIdentity(ctx.db, {
    id: documentId,
    workspaceId: unit.scope.workspaceId,
    projectId: unit.scope.projectId,
    slug: safeSlug(`unit-${unit.slug}-r${unit.revisionNo}-body`),
    title: `${titleCase(unit.slug)} body`,
    createdAt: unit.entry.mtimeMs,
  });
  insertExact(
    ctx.db,
    "document_revisions",
    revisionId,
    `INSERT INTO document_revisions
     (id, document_id, revision_no, parent_revision_id, iteration_id, format,
      title, body, content_sha256, authored_by_session_id, created_at)
     VALUES (?, ?, 1, NULL, NULL, 'text', NULL, ?, ?, NULL, ?)`,
    [revisionId, documentId, normalized, sha256(normalized), unit.entry.mtimeMs],
  );
  const current = ctx.db.query<{ currentId: string | null }, [string]>(
    "SELECT current_revision_id AS currentId FROM documents WHERE id = ?",
  ).get(documentId)?.currentId ?? null;
  if (current === null) {
    ctx.db.prepare("UPDATE documents SET current_revision_id = ?, updated_at = ? WHERE id = ?")
      .run(revisionId, unit.entry.mtimeMs, documentId);
  } else if (current !== revisionId) throw new Error("Migration Unit Document replay conflict");
  addRefs(refs, unit.entry.id, documentId, revisionId);
  return revisionId;
}

function insertLegacyPresentations(
  ctx: MigrationContext,
  prepared: ProductionPrepared,
  unit: UnitEvidence,
  revisionId: string,
  itemIds: readonly string[],
  presentations: Map<string, string>,
  refs: Map<string, Set<string>>,
  issues: PreparedIssue[],
): void {
  const manifestPresentations = Array.isArray(unit.value.presentations)
    ? unit.value.presentations.filter(isRecord)
    : [];
  const byPlatform = new Map<string, Record<string, unknown>>();
  for (const value of manifestPresentations) {
    if (typeof value.platform !== "string") continue;
    byPlatform.set(canonicalPlatform(value.platform), value);
  }
  for (const record of expandedDeliveryRecords(prepared.deliveries)) {
    const legacyUnit = typeof record.value.unitId === "string" ? record.value.unitId : null;
    const key = record.unitKeyHint ?? (legacyUnit ? unitIdentityKey(record.entry.sourceLabel, record.scope, legacyUnit) : null);
    if (key !== unit.unitKey || typeof record.value.platform !== "string") continue;
    const matching = prepared.units.filter((candidate) => candidate.unitKey === unit.unitKey);
    const targetRevision = recordUnitRevision(record) ?? (matching.length === 1 ? matching[0]!.revisionNo : null);
    if (targetRevision !== unit.revisionNo) continue;
    const platform = canonicalPlatform(record.value.platform);
    if (!byPlatform.has(platform)) byPlatform.set(platform, { platform });
  }
  const captions = captionEvidence(prepared, unit, issues);
  let position = 0;
  for (const [platform, value] of [...byPlatform].sort(([left], [right]) => left.localeCompare(right))) {
    const presentationId = stableId("pres", ctx, `presentation:${revisionId}:${platform}`);
    const options = sanitizeJson(value.options ?? {}, unit.source.path);
    insertExact(
      ctx.db,
      "unit_presentations",
      presentationId,
      `INSERT INTO unit_presentations
       (id, unit_revision_id, platform, position, effective_caption_revision_id,
        cover_artifact_revision_id, crop_json, safe_area_json, options_json, created_at)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`,
      [
        presentationId,
        revisionId,
        platform,
        position,
        jsonOrNull(value.crop, unit.source.path),
        jsonOrNull(value.safeArea, unit.source.path),
        JSON.stringify(options),
        unit.entry.mtimeMs,
      ],
    );
    let parentCaptionId: string | null = null;
    const captionIds = new Map<number, string>();
    for (const caption of captions.values) {
      const captionId = stableId("caption", ctx, `caption:${presentationId}:${caption.revisionNo}`);
      insertExact(
        ctx.db,
        "presentation_caption_revisions",
        captionId,
        `INSERT INTO presentation_caption_revisions
         (id, presentation_id, revision_no, parent_revision_id, state, text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          captionId,
          presentationId,
          caption.revisionNo,
          parentCaptionId,
          caption.state,
          normalizeLegacyValue(caption.text, unit.source.path) as string,
          unit.entry.mtimeMs,
        ],
      );
      captionIds.set(caption.revisionNo, captionId);
      parentCaptionId = captionId;
      addRefs(refs, unit.entry.id, captionId);
      if (captions.entry) addRefs(refs, captions.entry.id, captionId);
    }
    const explicitEffective = positiveInteger(value.effectiveCaptionVersion)
      ?? positiveInteger(captions.effectiveRevision);
    if (explicitEffective !== null) {
      const effectiveId = captionIds.get(explicitEffective);
      if (effectiveId) {
        ctx.db.prepare(
          "UPDATE unit_presentations SET effective_caption_revision_id = ? WHERE id = ? AND effective_caption_revision_id IS NULL",
        ).run(effectiveId, presentationId);
      } else {
        issues.push(productionIssue(unit.entry, `caption-effective:${unit.unitKey}:${unit.revisionNo}:${platform}`, "MIGRATION_CAPTION_SELECTION_AMBIGUOUS", "review"));
      }
    }
    const presentationItemIds: string[] = [];
    for (const [itemPosition, itemId] of itemIds.entries()) {
      const presentationItemId = stableId("pitem", ctx, `presentation-item:${presentationId}:${itemPosition}`);
      insertExact(
        ctx.db,
        "presentation_items",
        presentationItemId,
        `INSERT INTO presentation_items
         (id, presentation_id, unit_item_id, position, config_json, created_at)
         VALUES (?, ?, ?, ?, NULL, ?)`,
        [presentationItemId, presentationId, itemId, itemPosition, unit.entry.mtimeMs],
      );
      presentationItemIds.push(presentationItemId);
    }
    presentations.set(`${unit.unitKey}\0${unit.revisionNo}\0${platform}`, presentationId);
    addRefs(refs, unit.entry.id, presentationId, ...itemIds, ...presentationItemIds);
    position += 1;
  }
}

function captionEvidence(
  prepared: ProductionPrepared,
  unit: UnitEvidence,
  issues: PreparedIssue[],
): {
  entry: Entry | null;
  effectiveRevision: unknown;
  values: Array<{ revisionNo: number; state: string; text: string }>;
} {
  const key = sourcePathKey(unit.entry.sourceLabel, path.posix.join(path.posix.dirname(unit.entry.sourcePath), "captions.json"));
  const file = prepared.files.get(key);
  if (!file) return { entry: null, effectiveRevision: null, values: [] };
  if (prepared.pendingEntryIds.has(file.entry.id)) {
    return { entry: file.entry, effectiveRevision: null, values: [] };
  }
  const value = parseJsonObject(file.raw);
  if (!value || !Array.isArray(value.caption_versions)) {
    issues.push(productionIssue(file.entry, "captions-json", "MIGRATION_CAPTION_RECORD_INVALID", "review"));
    return { entry: file.entry, effectiveRevision: null, values: [] };
  }
  const values: Array<{ revisionNo: number; state: string; text: string }> = [];
  for (const [index, candidate] of value.caption_versions.entries()) {
    const state = isRecord(candidate) ? canonicalCaptionState(candidate.state) : null;
    if (!isRecord(candidate) || typeof candidate.text !== "string" || state === null) {
      issues.push(productionIssue(file.entry, `caption:${index + 1}`, "MIGRATION_CAPTION_RECORD_INVALID", "review", index + 1));
      return { entry: file.entry, effectiveRevision: null, values: [] };
    }
    values.push({
      revisionNo: positiveInteger(candidate.version) ?? index + 1,
      state,
      text: candidate.text,
    });
  }
  values.sort((left, right) => left.revisionNo - right.revisionNo);
  return { entry: file.entry, effectiveRevision: value.effective_version, values };
}

function preparePublicationCandidate(
  ctx: MigrationContext,
  record: LegacyRecord,
  semantics: LegacyDeliverySemantics,
  unitIds: ReadonlyMap<string, string>,
  presentations: ReadonlyMap<string, string>,
  issues: PreparedIssue[],
): PublicationCandidate | null {
  const legacyUnitId = typeof record.value.unitId === "string" ? record.value.unitId : null;
  const unitKey = record.unitKeyHint
    ?? (legacyUnitId ? unitIdentityKey(record.entry.sourceLabel, record.scope, legacyUnitId) : null);
  const unitId = unitKey ? unitIds.get(unitKey) : null;
  const platform = typeof record.value.platform === "string" ? canonicalPlatform(record.value.platform) : null;
  if (!unitKey || !unitId || !platform) {
    issues.push(productionIssue(record.entry, `publication-binding:${recordPosition(record)}`, "MIGRATION_PUBLICATION_BINDING_AMBIGUOUS", "block", record.rowOrdinal));
    return null;
  }
  const revisions = ctx.db.query<{ revisionNo: number }, [string]>(
    "SELECT revision_no AS revisionNo FROM unit_revisions WHERE unit_id = ? ORDER BY revision_no",
  ).all(unitId);
  const revisionNo = recordUnitRevision(record) ?? (revisions.length === 1 ? revisions[0]!.revisionNo : null);
  const presentationId = revisionNo === null
    ? null
    : presentations.get(`${unitKey}\0${revisionNo}\0${platform}`) ?? null;
  if (!presentationId) {
    issues.push(productionIssue(record.entry, `publication-presentation:${recordPosition(record)}`, "MIGRATION_PUBLICATION_BINDING_AMBIGUOUS", "block", record.rowOrdinal));
    return null;
  }
  if (semantics.kind !== "publication" || semantics.rail === null || semantics.state === null) {
    throw new Error("Migration Publication semantic preflight mismatch");
  }
  const error = semantics.error === null
    ? null
    : redactLegacyOperationalText(semantics.error, record.source.path).value;
  const presentation = ctx.db.query<{ captionId: string | null; options: string }, [string]>(
    `SELECT effective_caption_revision_id AS captionId, options_json AS options
     FROM unit_presentations WHERE id = ?`,
  ).get(presentationId);
  if (!presentation) throw new Error("Migration Presentation disappeared");
  if (record.value.options !== undefined) {
    const supplied = sanitizeJson(record.value.options, record.source.path);
    if (canonicalJsonText(supplied) !== canonicalJsonText(JSON.parse(presentation.options))) {
      issues.push(productionIssue(record.entry, `publication-options:${recordPosition(record)}`, "MIGRATION_PUBLICATION_OPTIONS_INVALID", "block", record.rowOrdinal));
      return null;
    }
  }
  const captionVersion = record.value.captionVersion === undefined
    ? record.value.effectiveCaptionVersion === undefined ? null : positiveInteger(record.value.effectiveCaptionVersion)
    : positiveInteger(record.value.captionVersion);
  if ((record.value.captionVersion !== undefined || record.value.effectiveCaptionVersion !== undefined)
    && captionVersion === null) {
    issues.push(productionIssue(record.entry, `publication-caption:${recordPosition(record)}`, "MIGRATION_PUBLICATION_CAPTION_INVALID", "block", record.rowOrdinal));
    return null;
  }
  if (captionVersion !== null) {
    const captionId = ctx.db.query<{ id: string }, [string, number]>(
      `SELECT id FROM presentation_caption_revisions
       WHERE presentation_id = ? AND revision_no = ?`,
    ).get(presentationId, captionVersion)?.id ?? null;
    if (!captionId || captionId !== presentation.captionId) {
      issues.push(productionIssue(record.entry, `publication-caption:${recordPosition(record)}`, "MIGRATION_PUBLICATION_CAPTION_INVALID", "block", record.rowOrdinal));
      return null;
    }
  }
  const account = semantics.accountExternalId === null ? null : {
    id: stableId("acct", ctx, `social-account:${record.scope.workspaceId}:${platform}:${semantics.accountExternalId}`),
    externalId: semantics.accountExternalId,
  };
  const key = deliveryRecordKey(record);
  const legacyId = legacyRecordId(record);
  return {
    record,
    legacyId,
    referenceKey: publicationIdentityKey(record, legacyId),
    publicationId: stableId("pub", ctx, `legacy-publication:${key}`),
    runId: stableId("run", ctx, `legacy-publication:${key}`),
    attemptId: stableId("attempt", ctx, `legacy-publication:${key}`),
    resultId: stableId("result", ctx, `legacy-publication:${key}`),
    presentationId,
    captionId: presentation.captionId,
    options: presentation.options,
    platform,
    rail: semantics.rail,
    account,
    providerId: semantics.providerId,
    state: semantics.state,
    providerExecuted: semantics.providerExecuted,
    createdAt: semantics.createdAt,
    scheduledAt: semantics.scheduledAt,
    submittedAt: semantics.submittedAt,
    publishedAt: semantics.publishedAt,
    url: semantics.url,
    error,
    failureStage: semantics.failureStage,
    idempotencyKey: `migration-${stableKey(key)}`,
    revisedFromId: null,
  };
}

function importLegacyPublications(
  ctx: MigrationContext,
  prepared: ProductionPrepared,
  refs: Map<string, Set<string>>,
  unitIds: ReadonlyMap<string, string>,
  presentations: ReadonlyMap<string, string>,
  publicationIds: Map<string, string[]>,
  issues: PreparedIssue[],
): void {
  const validatedRecords: Array<{ record: LegacyRecord; semantics: LegacyDeliverySemantics }> = [];
  for (const record of prepared.deliveries) {
    const validation = validateLegacyDeliverySemantics(
      record.value,
      record.unitKeyHint !== null,
      record.entry.mtimeMs,
    );
    if (!validation.ok) {
      issues.push(productionIssue(record.entry, `publication-record:${record.rowOrdinal}`, validation.issueCode, "block", record.rowOrdinal));
      continue;
    }
    if (validation.value.kind !== "partial") {
      validatedRecords.push({ record, semantics: validation.value });
      continue;
    }
    for (const expanded of expandedDeliveryRecords([record])) {
      const targetValidation = validateLegacyDeliverySemantics(
        expanded.value,
        expanded.unitKeyHint !== null,
        expanded.entry.mtimeMs,
      );
      if (!targetValidation.ok || targetValidation.value.kind !== "publication") {
        throw new Error("Migration Delivery target semantic preflight mismatch");
      }
      validatedRecords.push({ record: expanded, semantics: targetValidation.value });
    }
  }
  const candidates: PublicationCandidate[] = [];
  const skips: Array<{ record: LegacyRecord; semantics: LegacyDeliverySemantics }> = [];
  for (const { record, semantics } of validatedRecords) {
    if (semantics.kind === "approval") {
      importMediumApprovalEvidence(ctx, record, refs, semantics.createdAt);
      continue;
    }
    if (semantics.kind === "idempotent-skip") {
      skips.push({ record, semantics });
      continue;
    }
    const candidate = preparePublicationCandidate(
      ctx,
      record,
      semantics,
      unitIds,
      presentations,
      issues,
    );
    if (candidate) candidates.push(candidate);
  }

  const byReference = new Map<string, PublicationCandidate[]>();
  for (const candidate of candidates) {
    const matches = byReference.get(candidate.referenceKey) ?? [];
    matches.push(candidate);
    byReference.set(candidate.referenceKey, matches);
  }
  const invalid = new Set<string>();
  for (const candidate of candidates) {
    if (typeof candidate.record.value.revisedFrom !== "string") continue;
    const target = resolvePublicationReference(
      candidate.record,
      candidate.record.value.revisedFrom,
      byReference,
      "revisedFrom",
    );
    if (!target || target.record.scope.workspaceId !== candidate.record.scope.workspaceId
      || target.publicationId === candidate.publicationId || target.createdAt > candidate.createdAt) {
      invalid.add(candidate.publicationId);
      issues.push(productionIssue(candidate.record.entry, `publication-revised:${recordPosition(candidate.record)}`, "MIGRATION_PUBLICATION_REVISED_FROM_INVALID", "block", candidate.record.rowOrdinal));
      continue;
    }
    candidate.revisedFromId = target.publicationId;
  }
  let propagated = true;
  while (propagated) {
    propagated = false;
    for (const candidate of candidates) {
      if (!invalid.has(candidate.publicationId) && candidate.revisedFromId
        && invalid.has(candidate.revisedFromId)) {
        invalid.add(candidate.publicationId);
        issues.push(productionIssue(candidate.record.entry, `publication-revised-dependency:${recordPosition(candidate.record)}`, "MIGRATION_PUBLICATION_REVISED_FROM_INVALID", "block", candidate.record.rowOrdinal));
        propagated = true;
      }
    }
  }
  const remaining = candidates.filter((candidate) => !invalid.has(candidate.publicationId)).sort((left, right) =>
    left.createdAt - right.createdAt || left.publicationId.localeCompare(right.publicationId)
  );
  const ordered: PublicationCandidate[] = [];
  const orderedIds = new Set<string>();
  while (remaining.length > 0) {
    const next = remaining.findIndex((candidate) =>
      candidate.revisedFromId === null || orderedIds.has(candidate.revisedFromId)
    );
    if (next === -1) {
      for (const candidate of remaining) {
        issues.push(productionIssue(candidate.record.entry, `publication-revised-cycle:${recordPosition(candidate.record)}`, "MIGRATION_PUBLICATION_REVISED_FROM_INVALID", "block", candidate.record.rowOrdinal));
      }
      break;
    }
    const candidate = remaining.splice(next, 1)[0]!;
    ordered.push(candidate);
    orderedIds.add(candidate.publicationId);
  }
  const inserted = new Set<string>();
  for (const candidate of ordered) {
    if (candidate.revisedFromId && !inserted.has(candidate.revisedFromId)) {
      issues.push(productionIssue(candidate.record.entry, `publication-revised-order:${recordPosition(candidate.record)}`, "MIGRATION_PUBLICATION_REVISED_FROM_INVALID", "block", candidate.record.rowOrdinal));
      continue;
    }
    const { record } = candidate;
    const accountId = materializePublicationAccount(ctx, candidate, refs);
    const existing = ctx.db.query<Record<string, unknown>, [string]>("SELECT * FROM publications WHERE id = ?").get(candidate.publicationId);
    if (!existing) {
      insertPendingRun(ctx, candidate.runId, record.scope, "legacy-publication", `Legacy publication ${stableKey(deliveryRecordKey(record))}`, candidate.createdAt, {
        migrationRunId: ctx.runId,
        legacyPublicationId: candidate.legacyId,
        sourceLocatorHash: record.entry.sourceLocatorHash,
      });
      const preAccountFailure = candidate.state === "failed" && accountId === null
        && candidate.failureStage === "account-resolution" && !candidate.providerExecuted;
      if (!candidate.providerExecuted && !preAccountFailure) {
        throw new Error("Migration Publication has no proven terminal path");
      }
      ctx.db.prepare(
        `INSERT INTO publications
         (id, presentation_id, effective_caption_revision_id, effective_options_json,
          social_account_id, submission_run_id, active_claim_run_id,
          revised_from_publication_id, rail, provider_publication_id, state, url,
          scheduled_at, submitted_at, published_at, error, failure_stage,
          idempotency_key, claim_kind, claim_epoch, claim_token, claim_expires_at,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, NULL, ?, NULL, NULL, ?, ?, ?, NULL, 0, NULL, NULL, ?, ?)`,
      ).run(
        candidate.publicationId,
        candidate.presentationId,
        candidate.captionId,
        candidate.options,
        accountId,
        candidate.runId,
        candidate.revisedFromId,
        candidate.rail,
        preAccountFailure ? "failed" : "draft",
        candidate.scheduledAt,
        preAccountFailure ? candidate.error : null,
        preAccountFailure ? candidate.failureStage : null,
        candidate.idempotencyKey,
        candidate.createdAt,
        candidate.createdAt,
      );
      if (candidate.providerExecuted) {
        const claimToken = `migration-${stableKey(deliveryRecordKey(record))}`;
        ctx.db.prepare(
          `UPDATE publications
           SET state = 'submitting', active_claim_run_id = submission_run_id,
               claim_kind = 'submission', claim_epoch = 1, claim_token = ?,
               claim_expires_at = ?, updated_at = ? WHERE id = ? AND state = 'draft'`,
        ).run(claimToken, Number.MAX_SAFE_INTEGER, candidate.createdAt, candidate.publicationId);
        ctx.db.prepare("UPDATE runs SET state = 'running', started_at = ? WHERE id = ? AND state = 'pending'")
          .run(candidate.createdAt, candidate.runId);
        const endedAt = candidate.publishedAt ?? candidate.submittedAt ?? candidate.scheduledAt ?? candidate.createdAt;
        ctx.db.prepare(
          `INSERT INTO run_attempts
           (id, run_id, attempt_no, provider, model, state, request_json,
            response_json, cost_usd, error, started_at, ended_at)
           VALUES (?, ?, 1, ?, NULL, ?, NULL, NULL, NULL, ?, ?, ?)`,
        ).run(
          candidate.attemptId,
          candidate.runId,
          candidate.rail,
          candidate.state === "failed" ? "failed" : "succeeded",
          candidate.error,
          candidate.createdAt,
          endedAt,
        );
        ctx.db.prepare(
          `UPDATE publications
           SET state = ?, provider_publication_id = ?, url = ?, submitted_at = ?,
               published_at = ?, error = ?, failure_stage = ?, active_claim_run_id = NULL,
               claim_kind = NULL, claim_token = NULL, claim_expires_at = NULL, updated_at = ?
           WHERE id = ? AND claim_token = ?`,
        ).run(
          candidate.state,
          candidate.providerId,
          candidate.url,
          candidate.submittedAt,
          candidate.publishedAt,
          candidate.error,
          candidate.failureStage,
          endedAt,
          candidate.publicationId,
          claimToken,
        );
      }
      ctx.db.prepare(
        `INSERT INTO run_results (id, run_id, position, entity_type, entity_id, created_at)
         VALUES (?, ?, 0, 'publication', ?, ?)`,
      ).run(
        candidate.resultId,
        candidate.runId,
        candidate.publicationId,
        candidate.publishedAt ?? candidate.submittedAt ?? candidate.createdAt,
      );
      const runState = candidate.state === "failed" ? "failed" : "succeeded";
      ctx.db.prepare("UPDATE runs SET state = ?, ended_at = ?, error = ? WHERE id = ? AND state IN ('pending', 'running')")
        .run(
          runState,
          candidate.publishedAt ?? candidate.submittedAt ?? candidate.scheduledAt ?? candidate.createdAt,
          runState === "failed" ? candidate.error : null,
          candidate.runId,
        );
    } else {
      assertPublicationReplay(
        ctx.db,
        candidate.publicationId,
        candidate.presentationId,
        candidate.runId,
        candidate.rail,
        candidate.idempotencyKey,
        candidate.revisedFromId,
      );
    }
    inserted.add(candidate.publicationId);
    const ids = publicationIds.get(candidate.referenceKey) ?? [];
    ids.push(candidate.publicationId);
    publicationIds.set(candidate.referenceKey, ids);
    addRefs(
      refs,
      record.entry.id,
      candidate.publicationId,
      candidate.runId,
      candidate.resultId,
      ...(candidate.providerExecuted ? [candidate.attemptId] : []),
    );
  }

  for (const { record, semantics } of skips) {
    const original = typeof record.value.originalPublicationId === "string"
      ? resolvePublicationReference(record, record.value.originalPublicationId, byReference, "original")
      : null;
    const publicationId = original?.publicationId ?? null;
    const createdAt = semantics.createdAt;
    const originalCreatedAt = publicationId === null ? null : ctx.db.query<{ createdAt: number }, [string]>(
      "SELECT created_at AS createdAt FROM publications WHERE id = ?",
    ).get(publicationId)?.createdAt ?? null;
    if (!publicationId || original?.record.scope.workspaceId !== record.scope.workspaceId
      || originalCreatedAt === null || originalCreatedAt > createdAt) {
      issues.push(productionIssue(record.entry, `idempotent-skip:${recordPosition(record)}`, "MIGRATION_PUBLICATION_ORIGINAL_MISSING", "block", record.rowOrdinal));
      continue;
    }
    insertIdempotentSkipActivity(ctx, record, publicationId, createdAt);
    addRefs(refs, record.entry.id, publicationId);
  }
}

function importLegacyMetrics(
  ctx: MigrationContext,
  prepared: ProductionPrepared,
  refs: Map<string, Set<string>>,
  publicationIds: ReadonlyMap<string, string[]>,
  issues: PreparedIssue[],
): void {
  const known = new Set([
    "publicationId", "source", "asOf", "createdAt", "windowStart", "windowEnd",
    "views", "likes", "comments", "shares", "watchTimeMs", "ctr",
    "retentionCurve", "avgViewDurationSec", "note", "raw",
  ]);
  for (const record of prepared.metrics) {
    if (typeof record.value.publicationId !== "string") {
      issues.push(productionIssue(record.entry, `metric-publication:${record.rowOrdinal}`, "MIGRATION_METRIC_PUBLICATION_MISSING", "review", record.rowOrdinal));
      continue;
    }
    const matches = publicationIds.get(publicationReferenceKey(record, record.value.publicationId)) ?? [];
    if (matches.length !== 1) {
      issues.push(productionIssue(record.entry, `metric-publication:${record.rowOrdinal}`, "MIGRATION_METRIC_PUBLICATION_MISSING", "review", record.rowOrdinal));
      continue;
    }
    const publicationId = matches[0]!;
    const source = safeSlug(typeof record.value.source === "string" ? record.value.source : "legacy");
    const asOf = legacyTime(record.value.asOf, legacyTime(record.value.createdAt, record.entry.mtimeMs));
    const createdAt = legacyTime(record.value.createdAt, record.entry.mtimeMs);
    const windowStart = optionalLegacyTime(record.value.windowStart);
    const windowEnd = optionalLegacyTime(record.value.windowEnd);
    if ((windowStart === null) !== (windowEnd === null) || (windowStart !== null && windowEnd! < windowStart)) {
      issues.push(productionIssue(record.entry, `metric-window:${record.rowOrdinal}`, "MIGRATION_METRIC_RECORD_INVALID", "review", record.rowOrdinal));
      continue;
    }
    const unknown = Object.fromEntries(Object.entries(record.value).filter(([key]) => !known.has(key)));
    const rawValue = {
      ...(isRecord(record.value.raw) ? record.value.raw : {}),
      ...unknown,
    };
    const raw = Object.keys(rawValue).length > 0 ? JSON.stringify(sanitizeJson(rawValue, record.source.path)) : null;
    const retention = Array.isArray(record.value.retentionCurve)
      ? JSON.stringify(sanitizeJson(record.value.retentionCurve, record.source.path))
      : null;
    const metricId = stableId("metric", ctx, `legacy-metric:${record.entry.sourceId}:${record.entry.sourceLocatorHash}:${record.rowOrdinal}`);
    insertExact(
      ctx.db,
      "metric_snapshots",
      metricId,
      `INSERT INTO metric_snapshots
       (id, publication_id, source, as_of, window_start, window_end, views,
        likes, comments, shares, watch_time_ms, ctr, retention_curve_json,
        avg_view_duration_sec, note, raw_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        metricId,
        publicationId,
        source,
        asOf,
        windowStart,
        windowEnd,
        nullableCounter(record.value.views),
        nullableCounter(record.value.likes),
        nullableCounter(record.value.comments),
        nullableCounter(record.value.shares),
        nullableCounter(record.value.watchTimeMs),
        nullableNumber(record.value.ctr),
        retention,
        nullableNumber(record.value.avgViewDurationSec),
        typeof record.value.note === "string"
          ? normalizeLegacyValue(record.value.note, record.source.path) as string
          : null,
        raw,
        createdAt,
      ],
    );
    addRefs(refs, record.entry.id, publicationId, metricId);
  }
}

function finalizeTaskFiveEntries(
  ctx: MigrationContext,
  entries: readonly Entry[],
  addedRefs: ReadonlyMap<string, Set<string>>,
  pendingEntryIds: ReadonlySet<string>,
): void {
  const now = Date.now();
  for (const entry of entries) {
    if (!isTaskFiveSource(entry.sourcePath, entry.disposition)) continue;
    if (pendingEntryIds.has(entry.id)) continue;
    const refs = [...new Set([...entryRefs(entry), ...(addedRefs.get(entry.id) ?? [])])].sort();
    verifyProductionTargetRefs(ctx.db, refs);
    const serialized = JSON.stringify(refs);
    if (entry.state === "staged" || entry.state === "inventoried") {
      const state = entry.disposition === "object" ? "verified" : "imported";
      const updated = ctx.db.prepare(
        `UPDATE migration_entries
         SET target_refs_json = ?, state = ?, terminal_at = ?, updated_at = ?
         WHERE id = ? AND state = ? RETURNING id`,
      ).get(serialized, state, now, now, entry.id, entry.state) as { id: string } | null;
      if (updated?.id !== entry.id) throw new Error("Migration production ledger transition failed");
      continue;
    }
    if (["verified", "imported"].includes(entry.state)) {
      const current = ctx.db.query<{ refs: string | null }, [string]>(
        "SELECT target_refs_json AS refs FROM migration_entries WHERE id = ?",
      ).get(entry.id)?.refs ?? "[]";
      if (current !== serialized) {
        const currentRefs = JSON.parse(current) as string[];
        const missing = currentRefs.filter((ref) => !refs.includes(ref)).map((ref) => ref.slice(0, ref.indexOf("_")));
        const added = refs.filter((ref) => !currentRefs.includes(ref)).map((ref) => ref.slice(0, ref.indexOf("_")));
        throw new Error(`Migration production ledger replay conflict: ${entry.sourceLocatorHash}:${missing.join(",")}:${added.join(",")}`);
      }
    }
  }
}

function countRows(db: Database, table: string): number {
  return db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count ?? 0;
}

function isTaskFiveSource(relative: string, disposition: string): boolean {
  if (disposition === "object") return true;
  const lower = relative.toLowerCase();
  const name = path.posix.basename(lower);
  return isLegacyUnitManifestName(name)
    || name === "captions.json"
    || isLegacyAssetManifestName(name)
    || name === "production.json"
    || name === "delivery.json"
    || isLegacyPublishLedgerName(name)
    || name === "analytics.jsonl"
    || /(?:^|\/)production\/[^/]+\.jsonl$/u.test(lower)
    || /(?:^|\/)delivery\/[^/]+\.jsonl$/u.test(lower);
}

function productionScope(ctx: MigrationContext, entry: Entry): ProductionScope | null {
  const current = entry.sourcePath.match(/^(workspaces\/([^/]+)\/projects\/([^/]+))(?:\/|$)/u);
  const legacy = entry.sourcePath.match(/^(projects\/([^/]+))(?:\/|$)/u);
  if (current || legacy) {
    const prefix = (current?.[1] ?? legacy?.[1])!;
    const projectSlug = current?.[3] ?? legacy?.[2]!;
    const rows = ctx.db.query<{ id: string; workspaceId: string }, [string, string]>(
      `SELECT project.id, project.workspace_id AS workspaceId
       FROM projects project JOIN workspaces workspace ON workspace.id = project.workspace_id
       WHERE json_extract(project.metadata_json, '$.migrationSourceLabel') = ?
         AND project.slug = ? ORDER BY project.id`,
    ).all(entry.sourceLabel, safeSlug(projectSlug));
    if (rows.length !== 1) return null;
    return { workspaceId: rows[0]!.workspaceId, projectId: rows[0]!.id, prefix };
  }
  const workspacePath = entry.sourcePath.match(/^(workspaces\/([^/]+))(?:\/|$)/u);
  const workspaceSlug = workspacePath?.[2] ?? "default";
  const rows = ctx.db.query<{ id: string }, [string, string]>(
    `SELECT id FROM workspaces
     WHERE json_extract(metadata_json, '$.migrationSourceLabel') = ? AND slug = ? ORDER BY id`,
  ).all(entry.sourceLabel, workspaceSlug);
  if (rows.length !== 1) return null;
  return { workspaceId: rows[0]!.id, projectId: null, prefix: workspacePath?.[1] ?? "" };
}

function sourcePathKey(sourceId: string, relative: string): string {
  return `${sourceId}\0${normalizeRelativePath(relative)}`;
}

function parseJsonObject(raw: Buffer): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw.toString("utf8")) as unknown;
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function isLegacyObjectRecord(value: unknown): boolean {
  return isRecord(value);
}

function validLegacyProductionRecord(value: unknown): boolean {
  if (!isRecord(value)
    || !nonEmptyString(value.sourceRevision)
    || !nonEmptyString(value.output)) return false;
  return [value.id, value.compositionId, value.profile]
    .every(validOptionalNonEmptyString)
    && (value.selected === undefined || typeof value.selected === "boolean")
    && validOptionalLegacyTime(value.completedAt);
}

function validLegacyDeliveryShape(value: unknown, hasUnitHint = false): boolean {
  if (!isRecord(value)
    || (!hasUnitHint && !nonEmptyString(value.unitId))
    || (value.unitId !== undefined && !nonEmptyString(value.unitId))
    || !nonEmptyString(value.provider)
    || !nonEmptyString(value.status)) return false;
  if (![value.id, value.platform, value.presentation, value.slot, value.revisedFrom, value.originalPublicationId]
    .every(validOptionalNonEmptyString)) return false;
  if (![value.accountId, value.providerPublicationId, value.url]
    .every(validOptionalNullableString)) return false;
  if (![value.error, value.failureStage]
    .every((candidate) => candidate === undefined || typeof candidate === "string")) return false;
  if (![value.unitRevision, value.unitRevisionNo, value.revision, value.captionVersion, value.effectiveCaptionVersion]
    .every((candidate) => candidate === undefined || positiveInteger(candidate) !== null)) return false;
  if (![value.createdAt, value.scheduledAt, value.submittedAt, value.publishedAt,
    value.revisedFromCreatedAt, value.originalCreatedAt]
    .every(validOptionalLegacyTime)) return false;
  if (![value.revisedFromSourceLocatorHash, value.originalSourceLocatorHash]
    .every((candidate) => candidate === undefined
      || (typeof candidate === "string" && /^[0-9a-f]{64}$/u.test(candidate)))) return false;
  if (![value.revisedFromProviderPublicationId, value.originalProviderPublicationId]
    .every(validOptionalNonEmptyString)) return false;

  if (value.targets === undefined) {
    return value.status.toLowerCase() !== "partial"
      && [value.platform, value.presentation, value.slot].some(nonEmptyString);
  }
  if (value.status.toLowerCase() !== "partial" || !Array.isArray(value.targets)) return false;
  const targets = value.targets.filter((target) => target !== null);
  return targets.length > 0 && targets.every((target) => {
    if (!isRecord(target) || !nonEmptyString(target.platform) || target.targets !== undefined) return false;
    return validLegacyDeliveryShape({ ...value, ...target, targets: undefined }, hasUnitHint);
  });
}

function validateLegacyDeliverySemantics(
  value: unknown,
  hasUnitHint: boolean,
  fallbackCreatedAt: number,
): LegacyDeliveryValidation {
  if (!validLegacyDeliveryShape(value, hasUnitHint) || !isRecord(value)) {
    return { ok: false, issueCode: "MIGRATION_PUBLISH_RECORD_INVALID" };
  }
  const createdAt = value.createdAt === undefined || value.createdAt === null
    ? Math.max(0, Math.trunc(fallbackCreatedAt))
    : optionalLegacyTime(value.createdAt);
  const scheduledAt = optionalLegacyTime(value.scheduledAt);
  const submittedAt = optionalLegacyTime(value.submittedAt);
  const publishedAt = optionalLegacyTime(value.publishedAt);
  if (createdAt === null || !validTimeline(createdAt, scheduledAt, submittedAt, publishedAt)) {
    return { ok: false, issueCode: "MIGRATION_PUBLICATION_TIMELINE_INVALID" };
  }
  const url = value.url === undefined || value.url === null ? null : canonicalHttpsUrl(value.url);
  if (value.url !== undefined && value.url !== null && url === null) {
    return { ok: false, issueCode: "MIGRATION_PUBLICATION_URL_INVALID" };
  }
  const providerId = value.providerPublicationId === undefined || value.providerPublicationId === null
    ? null
    : typeof value.providerPublicationId === "string"
      ? boundedProviderValue(value.providerPublicationId)
      : null;
  if (value.providerPublicationId !== undefined && value.providerPublicationId !== null && providerId === null) {
    return { ok: false, issueCode: "MIGRATION_PUBLICATION_PROVIDER_ID_INVALID" };
  }
  let accountExternalId: string | null = null;
  if (value.accountId !== undefined && value.accountId !== null) {
    if (typeof value.accountId !== "string" || boundedProviderValue(value.accountId) === null) {
      return { ok: false, issueCode: "MIGRATION_PUBLICATION_ACCOUNT_MISSING" };
    }
    accountExternalId = canonicalLegacyIdentifier(value.accountId, "legacy-account");
  }
  const provider = (value.provider as string).toLowerCase();
  const status = (value.status as string).toLowerCase();
  const failureStage = nonEmptyString(value.failureStage) ? safeToken(value.failureStage, "provider") : null;
  const error = nonEmptyString(value.error) ? value.error : null;
  const base = {
    createdAt,
    scheduledAt,
    submittedAt,
    publishedAt,
    providerId,
    accountExternalId,
    url,
    error,
    failureStage,
  };

  if (provider === "medium") {
    if (status !== "approval-exported" || scheduledAt !== null || submittedAt !== null
      || publishedAt !== null || providerId !== null || accountExternalId !== null
      || url !== null || error !== null || failureStage !== null) {
      return { ok: false, issueCode: "MIGRATION_PUBLICATION_STATUS_INVALID" };
    }
    return { ok: true, value: { kind: "approval", rail: null, state: null, providerExecuted: false, ...base } };
  }
  const rail = canonicalRail(provider);
  if (rail === null) return { ok: false, issueCode: "MIGRATION_PUBLICATION_RAIL_AMBIGUOUS" };

  if (status === "partial") {
    if (!Array.isArray(value.targets) || providerId !== null || url !== null
      || error !== null || failureStage !== null) {
      return { ok: false, issueCode: "MIGRATION_PUBLICATION_STATUS_INVALID" };
    }
    for (const target of value.targets) {
      if (target === null) continue;
      const targetResult = validateLegacyDeliverySemantics(
        { ...value, ...(target as Record<string, unknown>), targets: undefined },
        hasUnitHint,
        fallbackCreatedAt,
      );
      if (!targetResult.ok) return targetResult;
      if (targetResult.value.kind !== "publication") {
        return { ok: false, issueCode: "MIGRATION_PUBLICATION_STATUS_INVALID" };
      }
    }
    return { ok: true, value: { kind: "partial", rail, state: null, providerExecuted: false, ...base } };
  }

  if (status === "idempotent-skip") {
    if (!nonEmptyString(value.originalPublicationId) || scheduledAt !== null || submittedAt !== null
      || publishedAt !== null || providerId !== null || accountExternalId !== null
      || url !== null || error !== null || failureStage !== null) {
      return { ok: false, issueCode: "MIGRATION_PUBLICATION_STATUS_INVALID" };
    }
    return { ok: true, value: { kind: "idempotent-skip", rail, state: null, providerExecuted: false, ...base } };
  }

  const state = validatedPublicationState({
    status,
    rail,
    scheduledAt,
    submittedAt,
    publishedAt,
    providerId,
    url,
    error,
    failureStage,
    accountValue: accountExternalId,
  });
  const local = rail === "github-pages" || rail === "manual";
  const preAccountFailure = status === "failed" && failureStage === "account-resolution";
  if (!state || (!local && !preAccountFailure && accountExternalId === null)) {
    return { ok: false, issueCode: accountExternalId === null && !local && !preAccountFailure
      ? "MIGRATION_PUBLICATION_ACCOUNT_MISSING"
      : "MIGRATION_PUBLICATION_STATUS_INVALID" };
  }
  return {
    ok: true,
    value: {
      kind: "publication",
      rail,
      state: state.state,
      providerExecuted: state.providerExecuted,
      ...base,
      accountExternalId: local ? null : accountExternalId,
    },
  };
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && !!value.trim();
}

function validOptionalNonEmptyString(value: unknown): boolean {
  return value === undefined || nonEmptyString(value);
}

function validOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function validOptionalLegacyTime(value: unknown): boolean {
  return value === undefined || value === null || optionalLegacyTime(value) !== null;
}

function validLegacyUnitManifest(value: Record<string, unknown>, fallbackCreatedAt: number): boolean {
  if ((value.id !== undefined && (typeof value.id !== "string" || !value.id.trim()))
    || (value.slug !== undefined && (typeof value.slug !== "string" || !value.slug.trim()))
    || (value.format !== undefined && (typeof value.format !== "string" || !value.format.trim()))
    || (value.revision !== undefined && positiveInteger(value.revision) === null)
    || !Array.isArray(value.media) || !value.media.every((item) => typeof item === "string")
    || (value.items !== undefined && (!Array.isArray(value.items) || !value.items.every((item) => typeof item === "string")))
    || (value.body !== undefined && typeof value.body !== "string")
    || (value.bodyPath !== undefined && (typeof value.bodyPath !== "string" || !value.bodyPath.trim()))
    || (value.selected !== undefined && typeof value.selected !== "boolean")
    || (value.manifestOnlyAttempt !== undefined
      && !validateLegacyDeliverySemantics(value.manifestOnlyAttempt, true, fallbackCreatedAt).ok)) return false;
  if (value.presentations === undefined) return true;
  return Array.isArray(value.presentations) && value.presentations.every((presentation) =>
    isRecord(presentation)
      && typeof presentation.platform === "string" && !!presentation.platform.trim()
      && (presentation.media === undefined
        || (Array.isArray(presentation.media) && presentation.media.every((item) => typeof item === "string")))
      && (presentation.effectiveCaptionVersion === undefined
        || positiveInteger(presentation.effectiveCaptionVersion) !== null)
  );
}

function validLegacyAssetManifest(value: Record<string, unknown>): boolean {
  return Array.isArray(value.assets) && value.assets.every((asset) => {
    if (!isRecord(asset)) return false;
    const refs = [asset.path, asset.file, asset.dataUrl].filter((candidate) => candidate !== undefined);
    return refs.length > 0 && refs.every((candidate) => typeof candidate === "string" && !!candidate.trim())
      && [asset.selected, asset.current, asset.head]
        .every((candidate) => candidate === undefined || typeof candidate === "boolean");
  });
}

function validLegacyCaptionsManifest(value: Record<string, unknown>): boolean {
  if (!Array.isArray(value.caption_versions)) return false;
  let previous = 0;
  for (const caption of value.caption_versions) {
    if (!isRecord(caption) || positiveInteger(caption.version) === null
      || canonicalCaptionState(caption.state) === null
      || typeof caption.text !== "string" || (caption.version as number) <= previous) return false;
    previous = caption.version as number;
  }
  if (value.effective_version === undefined) return true;
  const effective = positiveInteger(value.effective_version);
  return effective !== null
    && value.caption_versions.some((caption) => isRecord(caption) && caption.version === effective);
}

function productionIssue(
  entry: Entry,
  key: string,
  code: string,
  severity: "info" | "review" | "block",
  lineNo: number | null = null,
): PreparedIssue {
  return {
    entryId: null,
    issueKey: `production:${entry.sourceId}:${entry.sourceLocatorHash}:${key}`,
    code,
    severity,
    lineNo,
    detail: { sourceLocatorHash: entry.sourceLocatorHash, ...(lineNo === null ? {} : { lineNo }) },
  };
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function unitIdentityKey(sourceId: string, scope: ProductionScope, legacyId: string): string {
  return `${sourceId}\0${scope.workspaceId}\0${scope.projectId ?? ""}\0${legacyId}`;
}

function isCompositionSource(relative: string): boolean {
  return /^(?:workspaces\/[^/]+\/projects\/[^/]+|projects\/[^/]+)\/composition\/[^/]+\.html$/iu.test(relative);
}

function pathWithoutExtension(value: string): string {
  const extension = path.posix.extname(value);
  return extension ? value.slice(0, -extension.length) : value;
}

function provenRevisionPath(
  entry: Entry,
  candidates: ReadonlySet<string>,
): { familyPath: string; revisionNo: number; revisionStyle: "" | "." | "-" } {
  const extension = path.posix.extname(entry.sourcePath);
  const stem = pathWithoutExtension(entry.sourcePath);
  const match = stem.match(/^(.*?)([.-])v(\d+)$/iu);
  if (!match) return { familyPath: stem, revisionNo: 1, revisionStyle: "" };
  const revisionNo = Number(match[3]);
  const base = `${match[1]}${extension}`;
  const styles = new Set<"." | "-">();
  const siblings = [...candidates].filter((candidate) => {
    const prefix = `${entry.sourceLabel}\0`;
    if (!candidate.startsWith(prefix)) return false;
    const candidatePath = candidate.slice(prefix.length);
    if (path.posix.extname(candidatePath).toLowerCase() !== extension.toLowerCase()) return false;
    const sibling = pathWithoutExtension(candidatePath).match(/^(.*?)([.-])v(\d+)$/iu);
    if (sibling?.[1] === match[1]) styles.add(sibling[2] as "." | "-");
    return sibling?.[1] === match[1] && sibling[2] === match[2];
  });
  const hasBase = candidates.has(sourcePathKey(entry.sourceLabel, base));
  return Number.isSafeInteger(revisionNo) && revisionNo > 1
      && (hasBase || siblings.length > 1)
    ? {
      familyPath: match[1]!,
      revisionNo,
      revisionStyle: hasBase && styles.size === 1 ? "" : match[2] as "." | "-",
    }
    : { familyPath: stem, revisionNo: 1, revisionStyle: "" };
}

function artifactKind(relative: string): string {
  const extension = path.posix.extname(relative).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(extension)) return "image";
  if ([".mp4", ".mov", ".mkv", ".avi", ".webm"].includes(extension)) return "video";
  if ([".mp3", ".wav", ".m4a", ".aac", ".ogg"].includes(extension)) return "audio";
  if (extension === ".zip") return "archive";
  return "binary";
}

function objectIdForEntry(db: Database, entry: Entry): string {
  const objects = entryRefs(entry).filter((id) => id.startsWith("obj_") && db.query("SELECT id FROM objects WHERE id = ?").get(id));
  if (objects.length !== 1) throw new Error(`Migration Object binding is ambiguous: ${entry.sourceLocatorHash}`);
  return objects[0]!;
}

function entryRefs(entry: Pick<Entry, "targetRefs">): string[] {
  return entry.targetRefs ? JSON.parse(entry.targetRefs) as string[] : [];
}

function ambiguousRevisionName(relative: string): boolean {
  const stem = pathWithoutExtension(path.posix.basename(relative));
  return /(?:[.-]v\d+|(?:^|[.-])r\d+|final\d*)$/iu.test(stem);
}

function explicitArtifactPaths(prepared: ProductionPrepared): Set<string> {
  const selected = new Set<string>();
  for (const file of prepared.files.values()) {
    if (!isLegacyAssetManifestName(path.posix.basename(file.entry.sourcePath).toLowerCase())) continue;
    if (prepared.pendingEntryIds.has(file.entry.id)) continue;
    const root = parseJsonObject(file.raw);
    for (const asset of Array.isArray(root?.assets) ? root.assets : []) {
      if (!isRecord(asset) || typeof asset.path !== "string"
        || (asset.selected !== true && asset.current !== true && asset.head !== true)) continue;
      const resolved = resolveEvidencePath(prepared, file, asset.path, "project");
      if (resolved) selected.add(resolved);
    }
  }
  for (const record of prepared.productions) {
    if (record.value.selected !== true || typeof record.value.output !== "string") continue;
    const resolved = resolveEvidencePath(prepared, record, record.value.output, "project");
    if (resolved) selected.add(resolved);
  }
  return selected;
}

function provenArtifactPaths(prepared: ProductionPrepared): Set<string> {
  const proven = new Set<string>();
  for (const file of prepared.files.values()) {
    if (!isLegacyAssetManifestName(path.posix.basename(file.entry.sourcePath).toLowerCase())) continue;
    if (prepared.pendingEntryIds.has(file.entry.id)) continue;
    const root = parseJsonObject(file.raw);
    for (const asset of Array.isArray(root?.assets) ? root.assets : []) {
      if (!isRecord(asset) || typeof asset.path !== "string") continue;
      const resolved = resolveEvidencePath(prepared, file, asset.path, "project");
      if (resolved) proven.add(resolved);
    }
  }
  for (const record of prepared.productions) {
    if (typeof record.value.output !== "string") continue;
    const resolved = resolveEvidencePath(prepared, record, record.value.output, "project");
    if (resolved) proven.add(resolved);
  }
  return proven;
}

type EvidenceOrigin = {
  entry: Entry;
  source: MigrationSourceRoot;
  scope: ProductionScope;
};

function resolveEvidencePath(
  prepared: ProductionPrepared,
  origin: EvidenceOrigin,
  value: string,
  mode: "project" | "adjacent",
): string | null {
  let relative: string;
  if (path.isAbsolute(value)) {
    const candidate = path.relative(origin.source.path, value);
    if (candidate.startsWith("..") || path.isAbsolute(candidate)) return null;
    relative = normalizeRelativePath(candidate);
  } else {
    try {
      const base = mode === "adjacent" ? path.posix.dirname(origin.entry.sourcePath) : origin.scope.prefix;
      relative = normalizeRelativePath(path.posix.join(base, value));
    } catch {
      return null;
    }
  }
  const key = sourcePathKey(origin.entry.sourceLabel, relative);
  return prepared.entries.some((entry) => sourcePathKey(entry.sourceLabel, entry.sourcePath) === key) ? key : null;
}

function safeToken(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return safeSlug(value) || fallback;
}

function legacyTime(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
  }
  return Math.max(0, Math.trunc(fallback));
}

function optionalLegacyTime(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = legacyTime(value, -1);
  return parsed >= 0 ? parsed : null;
}

function insertPendingRun(
  ctx: MigrationContext,
  runId: string,
  scope: ProductionScope,
  kind: string,
  label: string,
  createdAt: number,
  metadata: Record<string, unknown>,
): void {
  insertExact(
    ctx.db,
    "runs",
    runId,
    `INSERT INTO runs
     (id, workspace_id, project_id, agent_session_id, kind, label, state,
      metadata_json, created_at, started_at, ended_at, error)
     VALUES (?, ?, ?, NULL, ?, ?, 'pending', ?, ?, NULL, NULL, NULL)`,
    [runId, scope.workspaceId, scope.projectId, kind, label, JSON.stringify(metadata), createdAt],
  );
}

function assertBuildReplay(
  db: Database,
  buildId: string,
  revisionId: string,
  artifactRevisionId: string,
  runId: string,
): void {
  const row = db.query<{ revisionId: string; runId: string; state: string; outputRevisionId: string }, [string]>(
    `SELECT build.composition_revision_id AS revisionId, build.run_id AS runId,
            build.state, output.artifact_revision_id AS outputRevisionId
     FROM builds build JOIN build_outputs output ON output.build_id = build.id
     WHERE build.id = ?`,
  ).get(buildId);
  if (!row || row.revisionId !== revisionId || row.runId !== runId
    || row.state !== "succeeded" || row.outputRevisionId !== artifactRevisionId) {
    throw new Error("Migration Build replay conflict");
  }
}

function insertOrValidateUnitIdentity(
  db: Database,
  value: { id: string; workspaceId: string; projectId: string | null; slug: string; format: string; createdAt: number },
): void {
  const existing = db.query<{ workspaceId: string; projectId: string | null; slug: string; format: string; createdAt: number }, [string]>(
    `SELECT workspace_id AS workspaceId, project_id AS projectId, slug, format,
            created_at AS createdAt FROM units WHERE id = ?`,
  ).get(value.id);
  if (existing) {
    if (existing.workspaceId !== value.workspaceId || existing.projectId !== value.projectId
      || existing.slug !== value.slug || existing.format !== value.format || existing.createdAt !== value.createdAt) {
      throw new Error("Migration Unit replay conflict");
    }
    return;
  }
  db.prepare(
    `INSERT INTO units
     (id, workspace_id, project_id, slug, format, latest_revision_id,
      selected_revision_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
  ).run(value.id, value.workspaceId, value.projectId, value.slug, value.format, value.createdAt, value.createdAt);
}

function insertArtifactIdentity(
  db: Database,
  value: { id: string; workspaceId: string; projectId: string | null; slug: string; kind: string; createdAt: number },
): void {
  const existing = db.query<{ workspaceId: string; projectId: string | null; slug: string; kind: string; createdAt: number }, [string]>(
    `SELECT workspace_id AS workspaceId, project_id AS projectId, slug, kind,
            created_at AS createdAt FROM artifacts WHERE id = ?`,
  ).get(value.id);
  if (existing) {
    if (existing.workspaceId !== value.workspaceId || existing.projectId !== value.projectId
      || existing.slug !== value.slug || existing.kind !== value.kind || existing.createdAt !== value.createdAt) {
      throw new Error("Migration Artifact replay conflict");
    }
    return;
  }
  db.prepare(
    `INSERT INTO artifacts
     (id, workspace_id, project_id, slug, kind, selected_revision_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(value.id, value.workspaceId, value.projectId, value.slug, value.kind, value.createdAt, value.createdAt);
}

function insertCompositionIdentity(
  db: Database,
  id: string,
  projectId: string,
  slug: string,
  createdAt: number,
): void {
  const existing = db.query<{ projectId: string; slug: string; createdAt: number }, [string]>(
    "SELECT project_id AS projectId, slug, created_at AS createdAt FROM compositions WHERE id = ?",
  ).get(id);
  if (existing) {
    if (existing.projectId !== projectId || existing.slug !== slug || existing.createdAt !== createdAt) {
      throw new Error("Migration Composition replay conflict");
    }
    return;
  }
  db.prepare(
    `INSERT INTO compositions
     (id, project_id, slug, kind, selected_revision_id, created_at, updated_at)
     VALUES (?, ?, ?, 'video', NULL, ?, ?)`,
  ).run(id, projectId, slug, createdAt, createdAt);
}

function insertDocumentIdentity(
  db: Database,
  value: { id: string; workspaceId: string; projectId: string | null; slug: string; title: string; createdAt: number },
): void {
  const existing = db.query<{ workspaceId: string; projectId: string | null; slug: string; title: string }, [string]>(
    `SELECT workspace_id AS workspaceId, project_id AS projectId, slug, title
     FROM documents WHERE id = ?`,
  ).get(value.id);
  if (existing) {
    if (existing.workspaceId !== value.workspaceId || existing.projectId !== value.projectId
      || existing.slug !== value.slug || existing.title !== value.title) {
      throw new Error("Migration Unit Document replay conflict");
    }
    return;
  }
  db.prepare(
    `INSERT INTO documents
     (id, workspace_id, project_id, kind, slug, title, current_revision_id, created_at, updated_at)
     VALUES (?, ?, ?, 'custom', ?, ?, NULL, ?, ?)`,
  ).run(value.id, value.workspaceId, value.projectId, value.slug, value.title, value.createdAt, value.createdAt);
}

function setSelectedRevision(
  db: Database,
  table: "artifacts" | "compositions",
  id: string,
  revisionId: string | null,
  updatedAt: number,
): void {
  const current = db.query<{ selectedId: string | null }, [string]>(
    `SELECT selected_revision_id AS selectedId FROM ${table} WHERE id = ?`,
  ).get(id)?.selectedId ?? null;
  if (revisionId === null || current === revisionId) return;
  if (current !== null) throw new Error(`Migration ${table} selection replay conflict`);
  db.prepare(
    `UPDATE ${table} SET selected_revision_id = ?, row_version = row_version + 1, updated_at = ? WHERE id = ?`,
  ).run(revisionId, updatedAt, id);
}

function assertUnitRevisionReplay(
  db: Database,
  revisionId: string,
  unitId: string,
  revisionNo: number,
  parentId: string | null,
): void {
  const row = db.query<{ unitId: string; revisionNo: number; parentId: string | null; sealedAt: number | null }, [string]>(
    `SELECT unit_id AS unitId, revision_no AS revisionNo,
            parent_revision_id AS parentId, sealed_at AS sealedAt
     FROM unit_revisions WHERE id = ?`,
  ).get(revisionId);
  if (!row || row.unitId !== unitId || row.revisionNo !== revisionNo
    || row.parentId !== parentId || row.sealedAt === null) {
    throw new Error("Migration Unit revision replay conflict");
  }
}

function existingUnitGraph(
  db: Database,
  revisionId: string,
): { presentations: Array<{ id: string; platform: string }>; refs: string[] } {
  const items = db.query<{ id: string }, [string]>(
    "SELECT id FROM unit_items WHERE unit_revision_id = ? ORDER BY position",
  ).all(revisionId).map((row) => row.id);
  const presentations = db.query<{ id: string; platform: string }, [string]>(
    "SELECT id, platform FROM unit_presentations WHERE unit_revision_id = ? ORDER BY position",
  ).all(revisionId);
  const presentationIds = presentations.map((row) => row.id);
  const captions = presentationIds.flatMap((id) => db.query<{ id: string }, [string]>(
    "SELECT id FROM presentation_caption_revisions WHERE presentation_id = ? ORDER BY revision_no",
  ).all(id).map((row) => row.id));
  const presentationItems = presentationIds.flatMap((id) => db.query<{ id: string }, [string]>(
    "SELECT id FROM presentation_items WHERE presentation_id = ? ORDER BY position",
  ).all(id).map((row) => row.id));
  return { presentations, refs: [...items, ...presentationIds, ...captions, ...presentationItems] };
}

function sanitizeJson(value: unknown, sourceRoot: string): unknown {
  return sanitizeLegacyPayload(value, sourceRoot, true).value;
}

function jsonOrNull(value: unknown, sourceRoot: string): string | null {
  return value === null || value === undefined ? null : JSON.stringify(sanitizeJson(value, sourceRoot));
}

function canonicalPlatform(value: string): string {
  const platform = safeSlug(value);
  if (platform === "reels") return "instagram";
  if (platform === "shorts") return "youtube";
  return platform;
}

function canonicalCaptionState(value: unknown): "draft" | "humanized" | "auto-draft-archived" | "final" | null {
  if (value === "draft") return "draft";
  if (value === "humanized") return "humanized";
  if (value === "auto_draft_archived" || value === "auto-draft-archived") return "auto-draft-archived";
  if (value === "final") return "final";
  return null;
}

function expandedDeliveryRecords(records: readonly LegacyRecord[]): LegacyRecord[] {
  const expanded: LegacyRecord[] = [];
  for (const record of records) {
    if (!Array.isArray(record.value.targets)) {
      expanded.push(record);
      continue;
    }
    for (const [index, target] of record.value.targets.entries()) {
      if (!isRecord(target)) continue;
      const platform = typeof target.platform === "string" ? canonicalPlatform(target.platform) : `target-${index + 1}`;
      expanded.push({
        ...record,
        targetSlot: index,
        value: {
          ...record.value,
          ...target,
          id: `${typeof record.value.id === "string" ? record.value.id : `row-${record.rowOrdinal}`}:${platform}`,
          targets: undefined,
        },
      });
    }
  }
  return expanded;
}

function deliveryRecordKey(record: LegacyRecord): string {
  return `${record.entry.sourceId}:${record.entry.sourceLocatorHash}:${record.rowOrdinal}:${record.targetSlot ?? "single"}:${safeToken(record.value.platform, "unknown")}`;
}

function recordPosition(record: LegacyRecord): string {
  return record.targetSlot === null ? String(record.rowOrdinal) : `${record.rowOrdinal}:${record.targetSlot}`;
}

function legacyRecordId(record: LegacyRecord): string {
  const fallback = `row-${record.entry.sourceLocatorHash.slice(0, 12)}-${record.rowOrdinal}-${record.targetSlot ?? "single"}`;
  return typeof record.value.id === "string" && record.value.id.trim()
    ? canonicalLegacyIdentifier(record.value.id, fallback)
    : fallback;
}

function publicationIdentityKey(record: LegacyRecord, legacyId: string): string {
  return `${record.entry.sourceId}\0${record.scope.workspaceId}\0${legacyId}`;
}

function publicationReferenceKey(record: LegacyRecord, legacyId: string): string {
  return publicationIdentityKey(record, canonicalLegacyIdentifier(legacyId, `invalid-${stableKey(legacyId)}`));
}

function resolvePublicationReference(
  record: LegacyRecord,
  legacyId: string,
  index: ReadonlyMap<string, PublicationCandidate[]>,
  prefix: "revisedFrom" | "original",
): PublicationCandidate | null {
  let matches = index.get(publicationReferenceKey(record, legacyId)) ?? [];
  const locator = record.value[`${prefix}SourceLocatorHash`];
  if (locator !== undefined) {
    if (typeof locator !== "string" || !/^[0-9a-f]{64}$/u.test(locator)) return null;
    matches = matches.filter((candidate) => candidate.record.entry.sourceLocatorHash === locator);
  }
  const providerId = record.value[`${prefix}ProviderPublicationId`];
  if (providerId !== undefined) {
    if (typeof providerId !== "string" || boundedProviderValue(providerId) !== providerId.trim()) return null;
    matches = matches.filter((candidate) => candidate.providerId === providerId.trim());
  }
  const createdAt = record.value[`${prefix}CreatedAt`];
  if (createdAt !== undefined) {
    const timestamp = optionalLegacyTime(createdAt);
    if (timestamp === null) return null;
    matches = matches.filter((candidate) => candidate.createdAt === timestamp);
  }
  return matches.length === 1 ? matches[0]! : null;
}

function recordUnitRevision(record: LegacyRecord): number | null {
  return record.unitRevisionHint
    ?? positiveInteger(record.value.unitRevision)
    ?? positiveInteger(record.value.unitRevisionNo)
    ?? positiveInteger(record.value.revision);
}

function canonicalRail(value: string): PublicationRail | null {
  if (value === "dev.to" || value === "devto") return "devto";
  if (["postiz", "github-pages", "hashnode", "manual"].includes(value)) {
    return value as PublicationRail;
  }
  return null;
}

function validTimeline(
  createdAt: number,
  scheduledAt: number | null,
  submittedAt: number | null,
  publishedAt: number | null,
): boolean {
  return [scheduledAt, submittedAt, publishedAt].every((value) => value === null || value >= createdAt)
    && (submittedAt === null || scheduledAt === null || submittedAt >= scheduledAt)
    && (publishedAt === null || submittedAt === null || publishedAt >= submittedAt)
    && (publishedAt === null || scheduledAt === null || publishedAt >= scheduledAt);
}

function canonicalHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function boundedProviderValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 512 && !/[\u0000-\u001f\u007f]/u.test(trimmed) ? trimmed : null;
}

function validatedPublicationState(value: {
  status: string;
  rail: PublicationRail;
  scheduledAt: number | null;
  submittedAt: number | null;
  publishedAt: number | null;
  providerId: string | null;
  url: string | null;
  error: string | null;
  failureStage: string | null;
  accountValue: unknown;
}): { state: "scheduled" | "submitted" | "published" | "failed"; providerExecuted: boolean } | null {
  const local = value.rail === "github-pages" || value.rail === "manual";
  if (value.status === "failed") {
    if (!value.error || !value.failureStage || value.publishedAt !== null
      || value.providerId !== null || value.url !== null) return null;
    if (value.failureStage === "account-resolution") {
      if (local || value.accountValue != null || value.scheduledAt !== null || value.submittedAt !== null) return null;
      return { state: "failed", providerExecuted: false };
    }
    return { state: "failed", providerExecuted: true };
  }
  if (value.error !== null || value.failureStage !== null) return null;
  if (value.status === "scheduled") {
    if (value.scheduledAt === null || value.submittedAt !== null || value.publishedAt !== null
      || (local ? value.url === null : value.providerId === null)) return null;
    return { state: "scheduled", providerExecuted: true };
  }
  if (value.status === "submitted") {
    if (value.submittedAt === null || value.publishedAt !== null
      || (local ? value.url === null : value.providerId === null)) return null;
    return { state: "submitted", providerExecuted: true };
  }
  if (value.status === "published") {
    if (value.publishedAt === null || (local ? value.url === null : value.providerId === null)) return null;
    return { state: "published", providerExecuted: true };
  }
  return null;
}

function canonicalLegacyIdentifier(value: string, fallback: string): string {
  const trimmed = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._@-]{0,127}$/u.test(trimmed)
      && !/(?:secret|token|password|api[-_]?key|credential|authorization|bearer)/iu.test(trimmed)
    ? trimmed
    : `legacy-${stableKey(value || fallback)}`;
}

function canonicalJsonText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJsonText).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJsonText(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function materializePublicationAccount(
  ctx: MigrationContext,
  candidate: PublicationCandidate,
  refs: Map<string, Set<string>>,
): string | null {
  if (!candidate.account) return null;
  insertExact(
    ctx.db,
    "social_accounts",
    candidate.account.id,
    `INSERT INTO social_accounts
     (id, workspace_id, platform, external_id, display_name, username,
      config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
    [
      candidate.account.id,
      candidate.record.scope.workspaceId,
      candidate.platform,
      candidate.account.externalId,
      candidate.record.entry.mtimeMs,
      candidate.record.entry.mtimeMs,
    ],
  );
  addRefs(refs, candidate.record.entry.id, candidate.account.id);
  return candidate.account.id;
}

function assertPublicationReplay(
  db: Database,
  publicationId: string,
  presentationId: string,
  runId: string,
  rail: string,
  idempotencyKey: string,
  revisedFromId: string | null,
): void {
  const row = db.query<{
    presentationId: string;
    runId: string;
    rail: string;
    idempotencyKey: string;
    revisedFromId: string | null;
    runState: string;
  }, [string]>(
    `SELECT publication.presentation_id AS presentationId,
            publication.submission_run_id AS runId, publication.rail,
            publication.idempotency_key AS idempotencyKey,
            publication.revised_from_publication_id AS revisedFromId,
            run.state AS runState
     FROM publications publication JOIN runs run ON run.id = publication.submission_run_id
     WHERE publication.id = ?`,
  ).get(publicationId);
  if (!row || row.presentationId !== presentationId || row.runId !== runId
    || row.rail !== rail || row.idempotencyKey !== idempotencyKey
    || row.revisedFromId !== revisedFromId || !["succeeded", "failed"].includes(row.runState)) {
    throw new Error("Migration Publication replay conflict");
  }
}

function insertIdempotentSkipActivity(
  ctx: MigrationContext,
  record: LegacyRecord,
  publicationId: string,
  createdAt: number,
): void {
  const existing = ctx.db.query<{ count: number }, [string, string]>(
    `SELECT COUNT(*) AS count FROM activity_events
     WHERE entity_type = 'publication' AND entity_id = ?
       AND action = 'publication.idempotent_skip'
       AND json_extract(payload_json, '$.sourceRef') = ?`,
  ).get(publicationId, stableKey(deliveryRecordKey(record)))?.count ?? 0;
  if (existing > 0) return;
  appendActivity(ctx.db, {
    workspaceId: record.scope.workspaceId,
    projectId: record.scope.projectId,
    entityType: "publication",
    entityId: publicationId,
    action: "publication.idempotent_skip",
    payload: { sourceRef: stableKey(deliveryRecordKey(record)) },
    createdAt,
  });
}

function importMediumApprovalEvidence(
  ctx: MigrationContext,
  record: LegacyRecord,
  refs: Map<string, Set<string>>,
  createdAt: number,
): void {
  if (!record.entry.rawEvidenceObjectId) return;
  const key = deliveryRecordKey(record);
  const artifactId = stableId("art", ctx, `medium-approval:${key}`);
  const revisionId = stableId("arev", ctx, `medium-approval:${key}`);
  const runId = stableId("run", ctx, `medium-approval:${key}`);
  const runObjectId = stableId("robj", ctx, `medium-approval:${key}`);
  insertArtifactIdentity(ctx.db, {
    id: artifactId,
    workspaceId: record.scope.workspaceId,
    projectId: record.scope.projectId,
    slug: `medium-approval-${stableKey(key)}`,
    kind: "approval",
    createdAt,
  });
  insertExact(
    ctx.db,
    "artifact_revisions",
    revisionId,
    `INSERT INTO artifact_revisions
     (id, artifact_id, object_id, revision_no, parent_revision_id, iteration_id,
      state, metadata_json, authored_by_session_id, created_at)
     VALUES (?, ?, ?, 1, NULL, NULL, 'approved', ?, NULL, ?)`,
    [revisionId, artifactId, record.entry.rawEvidenceObjectId, JSON.stringify({ migrationRunId: ctx.runId }), createdAt],
  );
  setSelectedRevision(ctx.db, "artifacts", artifactId, revisionId, createdAt);
  const run = ctx.db.query<{ id: string }, [string]>("SELECT id FROM runs WHERE id = ?").get(runId);
  if (!run) {
    insertPendingRun(ctx, runId, record.scope, "legacy-medium-approval", "Legacy Medium approval", createdAt, {
      migrationRunId: ctx.runId,
      sourceLocatorHash: record.entry.sourceLocatorHash,
    });
    ctx.db.prepare("UPDATE runs SET state = 'succeeded', ended_at = ? WHERE id = ?").run(createdAt, runId);
  }
  const existingRunObject = ctx.db.query<{ runId: string; objectId: string | null }, [string]>(
    "SELECT run_id AS runId, object_id AS objectId FROM run_objects WHERE id = ?",
  ).get(runObjectId);
  if (!existingRunObject) {
    ctx.db.prepare(
      `INSERT INTO run_objects
       (id, run_id, object_id, path, purpose, state, retention, bytes, sha256,
        mime, metadata_json, created_at)
       SELECT ?, ?, object.id, object.bucket || '/' || object.key,
              'approval-evidence', 'promoted', 'diagnostic', object.bytes,
              object.sha256, object.mime, ?, ? FROM objects object WHERE object.id = ?`,
    ).run(
      runObjectId,
      runId,
      JSON.stringify({ migrationRunId: ctx.runId }),
      createdAt,
      record.entry.rawEvidenceObjectId,
    );
  } else if (existingRunObject.runId !== runId || existingRunObject.objectId !== record.entry.rawEvidenceObjectId) {
    throw new Error("Migration Medium approval replay conflict");
  }
  addRefs(refs, record.entry.id, artifactId, revisionId, runId, runObjectId);
}

function nullableCounter(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

const PRODUCTION_REF_TABLES: Readonly<Record<string, string>> = {
  ws: "workspaces",
  acct: "social_accounts",
  prj: "projects",
  iter: "project_iterations",
  fb: "feedback_items",
  fblink: "feedback_resolution_links",
  stage: "project_stages",
  doc: "documents",
  drev: "document_revisions",
  bind: "project_document_bindings",
  obj: "objects",
  art: "artifacts",
  arev: "artifact_revisions",
  rel: "artifact_relations",
  usage: "artifact_usages",
  comp: "compositions",
  crev: "composition_revisions",
  cfile: "composition_revision_files",
  input: "composition_inputs",
  build: "builds",
  output: "build_outputs",
  eval: "evaluations",
  unit: "units",
  urev: "unit_revisions",
  item: "unit_items",
  pres: "unit_presentations",
  caption: "presentation_caption_revisions",
  pitem: "presentation_items",
  pub: "publications",
  metric: "metric_snapshots",
  session: "agent_sessions",
  consumer: "consumer_principals",
  run: "runs",
  attempt: "run_attempts",
  robj: "run_objects",
  result: "run_results",
  mig: "migration_runs",
  mentry: "migration_entries",
  miss: "migration_issues",
  setting: "workspace_settings",
  brand: "brand_profiles",
  persona: "personas",
  tmpl: "workspace_templates",
  memory: "memories",
  mrev: "memory_revisions",
  campaign: "campaigns",
  cell: "campaign_cells",
  calendar: "calendar_entries",
};

function verifyProductionTargetRefs(db: Database, refs: readonly string[]): void {
  for (const ref of refs) {
    if (ref.startsWith("provider/")) continue;
    const split = ref.indexOf("_");
    const table = PRODUCTION_REF_TABLES[ref.slice(0, split)];
    if (!table || !db.query(`SELECT id FROM ${table} WHERE id = ?`).get(ref)) {
      throw new Error(`Migration production target ref is unresolved: ${ref.slice(0, Math.max(split, 0))}`);
    }
  }
}

function insertOrValidateLegacyRun(
  ctx: MigrationContext,
  sourceId: string,
  row: LegacyJob,
  runId: string,
  projectId: string | null,
): void {
  const state = runState(row.status);
  const startedAt = state === "running" || (state !== "pending" && row.startedAt !== null)
    ? Math.max(row.startedAt ?? row.createdAt, row.createdAt)
    : null;
  const endedAt = ["succeeded", "failed", "cancelled"].includes(state)
    ? Math.max(row.endedAt ?? startedAt ?? row.createdAt, startedAt ?? row.createdAt)
    : null;
  const error = state === "failed" ? row.error : null;
  const metadata = JSON.stringify({ migrationRunId: ctx.runId, legacyJobId: row.id });
  const workspaceId = projectId ? workspaceForProject(ctx.db, projectId) : null;
  const sql = `INSERT INTO runs
    (id, workspace_id, project_id, kind, label, state, metadata_json,
     created_at, started_at, ended_at, error)
    VALUES (?, ?, ?, 'legacy-job', ?, ?, ?, ?, ?, ?, ?)`;
  const values: SqlValue[] = [
    runId,
    workspaceId,
    projectId,
    `Legacy job ${row.id}`,
    state,
    metadata,
    row.createdAt,
    startedAt,
    endedAt,
    error,
  ];
  const existing = ctx.db.query<Record<string, unknown>, [string]>("SELECT * FROM runs WHERE id = ?").get(runId);
  if (existing) {
    if (!matchesInsert(existing, sql, values)) throw new Error("Migration runs replay conflict");
    return;
  }
  ctx.db.prepare(
    `INSERT INTO runs
     (id, workspace_id, project_id, kind, label, state, metadata_json,
      created_at, started_at, ended_at, error)
     VALUES (?, ?, ?, 'legacy-job', ?, 'pending', ?, ?, NULL, NULL, NULL)`,
  ).run(runId, workspaceId, projectId, `Legacy job ${row.id}`, metadata, row.createdAt);
  if (state === "running" || (state !== "pending" && startedAt !== null)) {
    ctx.db.prepare("UPDATE runs SET state = 'running', started_at = ? WHERE id = ? AND state = 'pending'")
      .run(startedAt, runId);
  }
  if (["succeeded", "failed", "cancelled"].includes(state)) {
    const expectedState = startedAt === null ? "pending" : "running";
    const updated = ctx.db.prepare(
      "UPDATE runs SET state = ?, ended_at = ?, error = ? WHERE id = ? AND state = ? RETURNING id",
    ).get(state, endedAt, error, runId, expectedState) as { id: string } | null;
    if (updated?.id !== runId) throw new Error(`Migration Run transition failed for ${sourceId}`);
  }
}

type JobSourceFile = { entry: Entry; source: MigrationSourceRoot; absolute: string };
type PreparedJobSource = {
  sourceId: string;
  files: Array<{ entry: Entry; sha256: string }>;
  jobs: LegacyJob[];
  logs: LegacyLog[];
  artifacts: LegacyJobArtifact[];
  redactedJobs: Map<number, Set<string>>;
};

function prepareJobSource(
  ctx: MigrationContext,
  sourceId: string,
  files: JobSourceFile[],
): PreparedJobSource | null {
  const database = files.find((file) => path.posix.basename(file.entry.sourcePath) === "jobs.db");
  if (!database) return null;
  const before = new Map(files.map((file) => [file.entry.id, fileFingerprint(file.absolute)]));
  const workingRoot = path.join(ctx.storeRoot, "migration-working", ctx.runId, stableKey(sourceId));
  fs.rmSync(workingRoot, { recursive: true, force: true });
  fs.mkdirSync(workingRoot, { recursive: true, mode: 0o700 });
  try {
    for (const file of files) {
      fs.copyFileSync(file.absolute, path.join(workingRoot, path.basename(file.absolute)), fs.constants.COPYFILE_FICLONE_FORCE);
    }
    for (const file of files) {
      if (fileFingerprint(file.absolute) !== before.get(file.entry.id)) {
        throw new Error(`Migration source changed after inventory: ${file.entry.sourceLocatorHash}`);
      }
    }
    const workingDb = new Database(path.join(workingRoot, "jobs.db"));
    try {
      workingDb.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      const integrity = workingDb.query<{ integrity_check: string }, []>("PRAGMA integrity_check").get();
      if (integrity?.integrity_check !== "ok") throw new Error("Legacy jobs clone failed integrity check");
      const foreignKeyFailures = workingDb.query<Record<string, unknown>, []>("PRAGMA foreign_key_check").all();
      if (foreignKeyFailures.length > 0) throw new Error("Legacy jobs clone failed foreign-key check");
      const jobs = readLegacyJobs(workingDb, database.source.path);
      const logs = readLegacyJobLogs(workingDb, jobs, database.source.path);
      const artifacts = readLegacyJobArtifacts(workingDb, database.source.path);
      const redactedJobs = new Map<number, Set<string>>();
      for (const row of jobs) {
        if (row.redactedFields.length > 0) redactedJobs.set(row.id, new Set(row.redactedFields));
      }
      for (const row of logs) addRedactedJobField(redactedJobs, row.jobId, "log", row.redacted);
      for (const row of artifacts) addRedactedJobField(redactedJobs, row.jobId, "artifact", row.redacted);
      return {
        sourceId,
        files: files.map((file) => ({ entry: file.entry, sha256: sha256(fs.readFileSync(file.absolute)) })),
        jobs,
        logs,
        artifacts,
        redactedJobs,
      };
    } finally {
      workingDb.close();
    }
  } finally {
    fs.rmSync(workingRoot, { recursive: true, force: true });
  }
}

function addRedactedJobField(
  jobs: Map<number, Set<string>>,
  jobId: number,
  field: string,
  redacted: boolean,
): void {
  if (!redacted) return;
  const fields = jobs.get(jobId) ?? new Set<string>();
  fields.add(field);
  jobs.set(jobId, fields);
}

type KnownSecretShape = "config" | "workspace" | "instagram-cookie" | "desktop-handoff";

type DesktopSecretHandoffPlan = {
  ref: string;
  kind: "text" | "file";
};

type PreparedSecret = {
  ref: string;
  value: string;
  account: {
    id: string;
    workspaceId: string;
    platform: string;
    externalId: string;
    displayName: string | null;
    username: string | null;
  } | null;
};

type DesktopReview = {
  id: string;
  source: string | null;
  sourcePath: string;
  sha256: string | null;
  state: "Approved" | "Shortlist" | "Reject" | "Needs Work";
  note: string | null;
  tags: string[];
  rating: number | null;
  favorite: boolean;
};

type DesktopReviewTarget = {
  type: "artifact_revision" | "composition_revision";
  id: string;
  workspaceId: string;
  projectId: string;
  match: "path" | "hash";
};

function isPotentialSecretEntry(entry: Entry): boolean {
  return entry.disposition === "secret-recovery-only"
    || entry.disposition === "secret-imported"
    || isLegacyRootConfigPath(entry.sourcePath)
    || /(?:^|\/)workspace\.json$/iu.test(entry.sourcePath);
}

function knownSecretShape(entry: Entry): KnownSecretShape | null {
  if (entry.sourceKind === "desktop" && /(?:^|\/)safestorage(?:\/|$)/iu.test(entry.sourcePath)) {
    return "desktop-handoff";
  }
  if (entry.sourceKind === "ralphy" && entry.sourcePath === "tmp/ig-cookies.txt") {
    return "instagram-cookie";
  }
  if (entry.sourceKind !== "desktop" && isLegacyRootConfigPath(entry.sourcePath)) return "config";
  if (entry.sourceKind !== "desktop" && /(?:^|\/)workspace\.json$/iu.test(entry.sourcePath)) return "workspace";
  return null;
}

function secretIssue(entry: Entry, code: string): PreparedIssue {
  return {
    entryId: null,
    issueKey: `secret:${entry.sourceLabel}:${entry.sourceLocatorHash}:${code}`,
    code,
    severity: "block",
    lineNo: null,
    detail: { sourceLocatorHash: entry.sourceLocatorHash },
  };
}

function desktopSecretHandoffPlan(
  ctx: MigrationContext,
  entry: Entry,
): DesktopSecretHandoffPlan | null {
  const workspaceId = currentPrimaryWorkspace(ctx);
  if (/^safestorage\/credentials\.bin$/iu.test(entry.sourcePath)) {
    return {
      ref: credentialSecretRef("desktop", { kind: "scope", workspaceId }),
      kind: "text",
    };
  }
  if (/^safestorage\/cookies\.bin$/iu.test(entry.sourcePath)) {
    return {
      ref: credentialSecretRef("instagram", { kind: "scope", workspaceId }),
      kind: "file",
    };
  }
  return null;
}

function currentPrimaryWorkspace(ctx: MigrationContext): string {
  const rows = ctx.db.query<{ id: string }, [string]>(
    `SELECT workspace.id
     FROM workspaces workspace JOIN migration_sources source
       ON source.source_label = json_extract(workspace.metadata_json, '$.migrationSourceLabel')
      AND source.migration_run_id = ?
     WHERE source.source_kind = 'ralphy'
       AND json_extract(workspace.metadata_json, '$.migrationPrimary') = 1
     ORDER BY workspace.id`,
  ).all(ctx.runId);
  if (rows.length !== 1) throw new Error("Desktop secret primary Workspace is ambiguous");
  return rows[0]!.id;
}

function recordDesktopSecretHandoffPlan(
  ctx: MigrationContext,
  entry: Entry,
  plan: DesktopSecretHandoffPlan,
): void {
  const refs = JSON.stringify([plan.ref]);
  const owner = ctx.db.query<{ id: string }, [string, string, string]>(
    `SELECT entry.id FROM migration_entries entry, json_each(entry.target_refs_json)
     WHERE entry.migration_run_id = ? AND entry.id <> ? AND value = ? LIMIT 1`,
  ).get(ctx.runId, entry.id, plan.ref);
  if (owner) throw new Error("Desktop secret ref is owned by another migration entry");
  const current = ctx.db.query<{ refs: string | null }, [string, string]>(
    `SELECT target_refs_json AS refs FROM migration_entries
     WHERE migration_run_id = ? AND id = ? AND state = 'inventoried'
       AND disposition = 'secret-recovery-only'`,
  ).get(ctx.runId, entry.id);
  if (!current) throw new Error("Desktop secret handoff entry is not plannable");
  if (current.refs !== refs) {
    if ((current.refs ?? "[]") !== "[]") throw new Error("Desktop secret handoff plan conflicts with ledger refs");
    const result = ctx.db.prepare(
      `UPDATE migration_entries SET target_refs_json = ?, updated_at = ?
       WHERE migration_run_id = ? AND id = ? AND state = 'inventoried'
         AND disposition = 'secret-recovery-only' AND COALESCE(target_refs_json, '[]') = '[]'`,
    ).run(refs, Date.now(), ctx.runId, entry.id);
    if (result.changes !== 1) throw new Error("Desktop secret handoff plan affected no entry");
  }
  insertIssue(ctx, {
    entryId: null,
    issueKey: `desktop-secret-plan:${entry.sourceLocatorHash}`,
    code: "MIGRATION_DESKTOP_SECRET_HANDOFF_PLANNED",
    severity: "info",
    lineNo: null,
    detail: { kind: plan.kind, refs: [plan.ref], sourceLocatorHash: entry.sourceLocatorHash },
  });
}

function parseKnownCredentialFile(
  ctx: MigrationContext,
  entry: Entry,
  source: MigrationSourceRoot,
  raw: Buffer,
  shape: "config" | "workspace",
): PreparedSecret[] | null {
  const text = raw.toString("utf8");
  if (Buffer.from(text, "utf8").compare(raw) !== 0) return null;
  let value: unknown;
  try { value = JSON.parse(text) as unknown; } catch { return null; }
  if (!isRecord(value)) return null;
  const workspaceSlug = shape === "workspace"
    ? entry.sourcePath.match(/(?:^|\/)workspaces\/([^/]+)\/workspace\.json$/u)?.[1] ?? null
    : null;
  const workspaceId = workspaceForSource(ctx, entry.sourceLabel, workspaceSlug);
  const providers = shape === "config"
    ? [["x", "accessToken"], ["postiz", "apiKey"]] as const
    : [["telegram", "botToken"]] as const;
  const secrets: PreparedSecret[] = [];
  const remainder: Record<string, unknown> = { ...value };
  for (const [provider, field] of providers) {
    const candidate = value[provider];
    if (candidate === undefined) continue;
    if (!isRecord(candidate) || typeof candidate[field] !== "string" || !(candidate[field] as string).trim()) return null;
    const metadata = { ...candidate };
    const secretValue = metadata[field] as string;
    delete metadata[field];
    if (sanitizeLegacyPayload(metadata, source.path, true).redacted) return null;
    const accountExternal = safeAccountIdentifier(metadata.accountId, metadata.chatId, metadata.username);
    if (accountExternal === undefined) return null;
    const accountId = accountExternal
      ? stableId("acct", ctx, `secret-account:${entry.sourceLabel}:${workspaceId}:${provider}:${accountExternal}`)
      : null;
    const ref = credentialSecretRef(provider, {
      kind: "scope",
      workspaceId,
      ...(accountId ? { accountId } : {}),
    });
    secrets.push({
      ref,
      value: secretValue,
      account: accountId && accountExternal ? {
        id: accountId,
        workspaceId,
        platform: provider,
        externalId: accountExternal,
        displayName: safeAccountLabel(metadata.displayName, metadata.name),
        username: safeAccountIdentifier(metadata.username) ?? null,
      } : null,
    });
    remainder[provider] = metadata;
  }
  if (secrets.length === 0 || sanitizeLegacyPayload(remainder, source.path, true).redacted) return null;
  return secrets;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function safeAccountIdentifier(...values: unknown[]): string | null | undefined {
  const value = firstNonEmptyString(...values);
  if (value === null) return null;
  return /^[A-Za-z0-9][A-Za-z0-9._@:-]{0,127}$/u.test(value)
    && !/(?:secret|token|password|credential|authorization|bearer)/iu.test(value)
    ? value
    : undefined;
}

function safeAccountLabel(...values: unknown[]): string | null {
  const value = firstNonEmptyString(...values);
  return value !== null
      && Buffer.byteLength(value) <= 256
      && !/[\u0000-\u001f\u007f]/u.test(value)
      && !/(?:secret|token|password|credential|authorization|bearer|data:|file:\/\/|[\\/])/iu.test(value)
    ? value
    : null;
}

function workspaceForSource(ctx: MigrationContext, sourceLabel: string, requestedSlug: string | null): string {
  const rows = ctx.db.query<{ id: string; slug: string; isPrimary: number }, [string]>(
    `SELECT id, slug, COALESCE(json_extract(metadata_json, '$.migrationPrimary'), 0) AS isPrimary
     FROM workspaces
     WHERE json_extract(metadata_json, '$.migrationSourceLabel') = ? ORDER BY slug`,
  ).all(sourceLabel);
  const exact = requestedSlug ? rows.find((row) => row.slug === requestedSlug) : null;
  if (exact) return exact.id;
  const primary = rows.filter((row) => row.isPrimary === 1);
  if (requestedSlug === null && primary.length === 1) return primary[0]!.id;
  throw new Error("Migration secret Workspace scope is ambiguous");
}

function insertSecretAccount(
  ctx: MigrationContext,
  account: NonNullable<PreparedSecret["account"]>,
  ref: string,
  createdAt: number,
): void {
  insertExact(
    ctx.db,
    "social_accounts",
    account.id,
    `INSERT INTO social_accounts
     (id, workspace_id, platform, external_id, display_name, username,
      config_json, created_at, updated_at, credential_ref)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    [
      account.id,
      account.workspaceId,
      account.platform,
      account.externalId,
      account.displayName,
      account.username,
      createdAt,
      createdAt,
      ref,
    ],
  );
}

export function completeMigrationSecretImport(
  db: Database,
  input: {
    runId: string;
    sourceEntryId: string;
    refs: readonly string[];
    kind: "text" | "file";
    requiredSourceKind?: "desktop";
  },
): void {
  const row = assertMigrationSecretImportable(db, input);
  const refs = JSON.stringify([...new Set(input.refs)].sort());
  if (row.state !== "excluded") {
    const now = Date.now();
    const result = db.prepare(
      `UPDATE migration_entries
       SET disposition = 'secret-imported', target_refs_json = ?, state = 'excluded',
           terminal_at = ?, updated_at = ?
       WHERE migration_run_id = ? AND id = ? AND state = 'inventoried'`,
    ).run(refs, now, now, input.runId, input.sourceEntryId);
    if (result.changes !== 1) throw new Error("Migration secret completion affected no entry");
  }
  const detail = JSON.stringify({
    completed: true,
    kind: input.kind,
    refs: JSON.parse(refs) as string[],
    sourceLocatorHash: row.sourceLocatorHash,
  });
  const recordId = stableId("miss", {
    db,
    storeRoot: "",
    sourceRoots: [],
    runId: input.runId,
  }, `secret-import:${row.sourceLocatorHash}`);
  const existing = db.query<{ detail: string }, [string]>(
    "SELECT detail_json AS detail FROM migration_issues WHERE id = ?",
  ).get(recordId);
  if (existing && existing.detail !== detail) throw new Error("Migration secret import kind conflict");
  if (!existing) {
    const now = Date.now();
    db.prepare(
      `INSERT INTO migration_issues
       (id, migration_run_id, code, severity, detail_json, resolved_at, created_at)
       VALUES (?, ?, 'MIGRATION_SECRET_IMPORTED', 'info', ?, ?, ?)`,
    ).run(recordId, input.runId, detail, now, now);
  }
  db.prepare(
    `UPDATE migration_issues SET resolved_at = ?
     WHERE migration_run_id = ? AND migration_entry_id IS NULL
       AND code = 'MIGRATION_DESKTOP_SECRET_HANDOFF_REQUIRED'
       AND json_extract(detail_json, '$.sourceLocatorHash') = ? AND resolved_at IS NULL`,
  ).run(Date.now(), input.runId, row.sourceLocatorHash);
}

export function assertMigrationSecretImportable(
  db: Database,
  input: {
    runId: string;
    sourceEntryId: string;
    refs: readonly string[];
    kind: "text" | "file";
    requiredSourceKind?: "desktop";
  },
): { sourceLocatorHash: string; state: string } {
  const row = db.query<{
    sourceKind: string;
    sourceLocatorHash: string;
    disposition: string;
    state: string;
    refs: string | null;
    phase: string;
  }, [string, string]>(
    `SELECT entry.source_kind AS sourceKind,
            entry.source_locator_hash AS sourceLocatorHash,
            entry.disposition, entry.state,
            entry.target_refs_json AS refs, migration.phase
     FROM migration_entries entry JOIN migration_runs migration
       ON migration.id = entry.migration_run_id
     WHERE entry.migration_run_id = ? AND entry.id = ?`,
  ).get(input.runId, input.sourceEntryId);
  if (!row) throw new Error("Migration secret entry not found");
  if (input.requiredSourceKind && row.sourceKind !== input.requiredSourceKind) {
    throw new Error("Migration secret source kind is invalid");
  }
  if (!["inventory", "import", "objects", "relations"].includes(row.phase)) {
    throw new Error("Migration secret import phase is closed");
  }
  const refs = JSON.stringify([...new Set(input.refs)].sort());
  if (input.requiredSourceKind === "desktop") {
    const plans = db.query<{ detail: string }, [string, string]>(
      `SELECT detail_json AS detail FROM migration_issues
       WHERE migration_run_id = ? AND code = 'MIGRATION_DESKTOP_SECRET_HANDOFF_PLANNED'
         AND json_extract(detail_json, '$.sourceLocatorHash') = ?
       ORDER BY id`,
    ).all(input.runId, row.sourceLocatorHash);
    if (plans.length !== 1) throw new Error("Desktop secret handoff plan is missing or ambiguous");
    const plan = JSON.parse(plans[0]!.detail) as { kind?: unknown; refs?: unknown };
    if (plan.kind !== input.kind || JSON.stringify(plan.refs) !== refs || row.refs !== refs) {
      throw new Error("Desktop secret handoff does not match its immutable plan");
    }
  }
  for (const ref of input.refs) {
    const conflictingOwner = db.query<{ id: string }, [string, string, string]>(
      `SELECT entry.id FROM migration_entries entry, json_each(entry.target_refs_json)
       WHERE entry.migration_run_id = ? AND entry.id <> ? AND value = ? LIMIT 1`,
    ).get(input.runId, input.sourceEntryId, ref);
    if (conflictingOwner) throw new Error("Migration secret ref is owned by another migration entry");
  }
  if (row.state === "excluded" && row.disposition === "secret-imported") {
    if ((row.refs ?? "[]") !== refs) throw new Error("Migration secret import replay conflict");
  } else if (row.state !== "inventoried" || row.disposition !== "secret-recovery-only") {
    throw new Error("Migration secret entry is not importable");
  }
  const recordId = stableId("miss", {
    db,
    storeRoot: "",
    sourceRoots: [],
    runId: input.runId,
  }, `secret-import:${row.sourceLocatorHash}`);
  const existing = db.query<{ detail: string }, [string]>(
    "SELECT detail_json AS detail FROM migration_issues WHERE id = ?",
  ).get(recordId);
  if (existing) {
    const detail = JSON.parse(existing.detail) as { kind?: unknown; refs?: unknown };
    if (detail.kind !== input.kind || JSON.stringify(detail.refs) !== refs) {
      throw new Error("Migration secret import kind conflict");
    }
  }
  return { sourceLocatorHash: row.sourceLocatorHash, state: row.state };
}

function importDesktopReviewFile(ctx: MigrationContext, entry: Entry, source: MigrationSourceRoot): void {
  const raw = fs.readFileSync(checkedSourceFile(source, entry));
  if (isLegacySecretCandidate(entry.sourcePath, raw)) {
    insertIssue(ctx, secretIssue(entry, "MIGRATION_SECRET_UNKNOWN"));
    return;
  }
  const parsed = parseDesktopReviewExport(raw);
  if (parsed === null) {
    insertIssue(ctx, {
      entryId: entry.id,
      issueKey: `desktop-review-invalid:${entry.sourceLocatorHash}`,
      code: "MIGRATION_DESKTOP_REVIEW_INVALID",
      severity: "review",
      lineNo: null,
      detail: { sourceLocatorHash: entry.sourceLocatorHash },
    });
    return;
  }
  const refs = new Set<string>();
  const sessions = new Set<string>();
  for (const unsafeReview of parsed.reviews) {
    const review = {
      ...unsafeReview,
      source: unsafeReview.source ?? parsed.source,
      note: unsafeReview.note === null
        ? null
        : String(normalizeLegacyValue(unsafeReview.note, source.path)),
    };
    const match = matchDesktopReview(ctx, review);
    if (match.kind === "collision") {
      insertIssue(ctx, desktopReviewIssue(entry, review, match.code));
      const projectId = resolveDesktopProject(ctx, parsed.workspace, parsed.project, review.source);
      const feedbackId = projectId
        ? insertDesktopFeedback(ctx, entry, review, projectId, null)
        : insertDesktopOrphanReview(ctx, entry, review);
      refs.add(feedbackId);
      continue;
    }
    if (match.kind === "unmatched") {
      insertIssue(ctx, desktopReviewIssue(entry, review, "MIGRATION_DESKTOP_REVIEW_UNMATCHED"));
      const projectId = resolveDesktopProject(ctx, parsed.workspace, parsed.project, review.source);
      const feedbackId = projectId
        ? insertDesktopFeedback(ctx, entry, review, projectId, null)
        : insertDesktopOrphanReview(ctx, entry, review);
      refs.add(feedbackId);
      continue;
    }
    const target = match.target;
    const sessionId = ensureDesktopSession(ctx, target.workspaceId, target.projectId, entry.mtimeMs);
    sessions.add(sessionId);
    const evaluationId = stableId("eval", ctx, `desktop-review:${entry.id}:${review.id}`);
    const verdict = ({
      Approved: "approved",
      Shortlist: "candidate",
      Reject: "rejected",
      "Needs Work": "open",
    } as const)[review.state];
    insertExact(
      ctx.db,
      "evaluations",
      evaluationId,
      `INSERT INTO evaluations
       (id, workspace_id, project_id, artifact_revision_id, composition_revision_id,
        build_id, run_id, authored_by_session_id, kind, verdict, favorite, rating,
        tags_json, note, report_json, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, 'desktop-review', ?, ?, ?, ?, ?, ?, ?)`,
      [
        evaluationId,
        target.workspaceId,
        target.projectId,
        target.type === "artifact_revision" ? target.id : null,
        target.type === "composition_revision" ? target.id : null,
        sessionId,
        verdict,
        review.favorite ? 1 : 0,
        review.rating,
        JSON.stringify(review.tags),
        review.note,
        JSON.stringify({ match: target.match, reviewIdHash: stableKey(review.id), sourceLocatorHash: entry.sourceLocatorHash }),
        entry.mtimeMs,
      ],
    );
    refs.add(evaluationId);
    if (review.state === "Needs Work") {
      refs.add(insertDesktopFeedback(ctx, entry, review, target.projectId, target));
    }
  }
  for (const sessionId of sessions) {
    ctx.db.prepare("UPDATE agent_sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL")
      .run(entry.mtimeMs, sessionId);
  }
  completeDesktopDomainEntry(ctx, entry, refs);
}

function parseDesktopReviewExport(raw: Buffer): {
  workspace: string | null;
  project: string;
  source: string | null;
  reviews: DesktopReview[];
} | null {
  let value: unknown;
  try { value = JSON.parse(raw.toString("utf8")) as unknown; } catch { return null; }
  if (!isRecord(value) || value.version !== 1 || typeof value.project !== "string" || !Array.isArray(value.reviews)) return null;
  const reviews: DesktopReview[] = [];
  for (const item of value.reviews) {
    if (!isRecord(item)
      || typeof item.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(item.id)
      || typeof item.sourcePath !== "string"
      || !["Approved", "Shortlist", "Reject", "Needs Work"].includes(String(item.state))) return null;
    let sourcePath: string;
    try { sourcePath = normalizeRelativePath(item.sourcePath); } catch { return null; }
    const sha = item.sha256 === undefined ? null : item.sha256;
    if (sha !== null && (typeof sha !== "string" || !/^[0-9a-f]{64}$/u.test(sha))) return null;
    const tags = item.tags === undefined ? [] : item.tags;
    if (!Array.isArray(tags) || tags.length > 16
      || tags.some((tag) => typeof tag !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(tag))) return null;
    if (new Set(tags).size !== tags.length) return null;
    const note = item.note === undefined ? null : item.note;
    if (note !== null && (typeof note !== "string" || !note || Buffer.byteLength(note) > 2_048)) return null;
    const rating = item.rating === undefined ? null : item.rating;
    if (rating !== null && (!Number.isInteger(rating) || Number(rating) < 1 || Number(rating) > 5)) return null;
    if (item.favorite !== undefined && typeof item.favorite !== "boolean") return null;
    if (item.source !== undefined && (typeof item.source !== "string" || !item.source)) return null;
    reviews.push({
      id: item.id,
      source: typeof item.source === "string" ? item.source : null,
      sourcePath,
      sha256: sha,
      state: item.state as DesktopReview["state"],
      note,
      tags: tags as string[],
      rating: rating as number | null,
      favorite: item.favorite === true,
    });
  }
  return {
    workspace: typeof value.workspace === "string" && value.workspace ? value.workspace : null,
    project: value.project,
    source: typeof value.source === "string" && value.source ? value.source : null,
    reviews,
  };
}

function matchDesktopReview(
  ctx: MigrationContext,
  review: DesktopReview,
): { kind: "matched"; target: DesktopReviewTarget }
  | { kind: "collision"; code: string }
  | { kind: "unmatched" } {
  const entries = migrationEntries(ctx).filter((entry) =>
    entry.sourceKind !== "desktop"
    && (!review.source || entry.sourceLabel === review.source)
    && reviewableEntryRefs(entry).length > 0,
  );
  const pathTargets = reviewTargets(ctx, entries.filter((entry) => entry.sourcePath === review.sourcePath), "path");
  if (pathTargets.length === 1) return { kind: "matched", target: pathTargets[0]! };
  if (pathTargets.length > 1) return { kind: "collision", code: "MIGRATION_DESKTOP_REVIEW_PATH_COLLISION" };
  if (review.sha256) {
    const hashTargets = reviewTargets(ctx, entries.filter((entry) =>
      entry.sha256 === review.sha256
      && ["staged", "verified", "imported"].includes(entry.state),
    ), "hash");
    if (hashTargets.length === 1) return { kind: "matched", target: hashTargets[0]! };
    if (hashTargets.length > 1) return { kind: "collision", code: "MIGRATION_DESKTOP_REVIEW_HASH_COLLISION" };
  }
  return { kind: "unmatched" };
}

function reviewableEntryRefs(entry: Entry): Array<{ type: DesktopReviewTarget["type"]; id: string }> {
  const refs = entry.targetRefs ? JSON.parse(entry.targetRefs) as unknown : [];
  if (!Array.isArray(refs)) return [];
  const reviewable: Array<{ type: DesktopReviewTarget["type"]; id: string }> = [];
  for (const ref of refs) {
    if (typeof ref !== "string") continue;
    if (ref.startsWith("arev_")) reviewable.push({ type: "artifact_revision", id: ref });
    else if (ref.startsWith("crev_")) reviewable.push({ type: "composition_revision", id: ref });
  }
  return reviewable;
}

function reviewTargets(
  ctx: MigrationContext,
  entries: Entry[],
  match: "path" | "hash",
): DesktopReviewTarget[] {
  const targets = new Map<string, DesktopReviewTarget>();
  for (const entry of entries) {
    for (const ref of reviewableEntryRefs(entry)) {
      const scope = ref.type === "artifact_revision"
        ? ctx.db.query<{ workspaceId: string; projectId: string | null }, [string]>(
          `SELECT artifact.workspace_id AS workspaceId, artifact.project_id AS projectId
           FROM artifact_revisions revision JOIN artifacts artifact ON artifact.id = revision.artifact_id
           WHERE revision.id = ?`,
        ).get(ref.id)
        : ctx.db.query<{ workspaceId: string; projectId: string }, [string]>(
          `SELECT project.workspace_id AS workspaceId, project.id AS projectId
           FROM composition_revisions revision
           JOIN compositions composition ON composition.id = revision.composition_id
           JOIN projects project ON project.id = composition.project_id WHERE revision.id = ?`,
        ).get(ref.id);
      if (!scope?.projectId) continue;
      targets.set(ref.id, { ...ref, workspaceId: scope.workspaceId, projectId: scope.projectId, match });
    }
  }
  return [...targets.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function desktopReviewIssue(entry: Entry, review: DesktopReview, code: string): PreparedIssue {
  return {
    entryId: null,
    issueKey: `desktop-review:${entry.sourceLocatorHash}:${review.id}:${code}`,
    code,
    severity: "review",
    lineNo: null,
    detail: { reviewIdHash: stableKey(review.id), sourceLocatorHash: entry.sourceLocatorHash },
  };
}

function resolveDesktopProject(
  ctx: MigrationContext,
  workspaceSlug: string | null,
  projectSlug: string,
  sourceLabel: string | null,
): string | null {
  const clauses = ["project.slug = ?"];
  const values: string[] = [projectSlug];
  if (workspaceSlug) {
    clauses.push("workspace.slug = ?");
    values.push(workspaceSlug);
  }
  if (sourceLabel) {
    clauses.push("json_extract(project.metadata_json, '$.migrationSourceLabel') = ?");
    values.push(sourceLabel);
  }
  const rows = ctx.db.query<{ id: string }, string[]>(
    `SELECT project.id FROM projects project JOIN workspaces workspace ON workspace.id = project.workspace_id
     WHERE ${clauses.join(" AND ")} ORDER BY project.id`,
  ).all(...values);
  return rows.length === 1 ? rows[0]!.id : null;
}

function ensureDesktopSession(
  ctx: MigrationContext,
  workspaceId: string,
  projectId: string,
  createdAt: number,
): string {
  const id = stableId("session", ctx, `desktop-review-session:${workspaceId}:${projectId}`);
  const existing = ctx.db.query<{ workspaceId: string; projectId: string | null }, [string]>(
    "SELECT workspace_id AS workspaceId, project_id AS projectId FROM agent_sessions WHERE id = ?",
  ).get(id);
  if (existing) {
    if (existing.workspaceId !== workspaceId || existing.projectId !== projectId) throw new Error("Desktop review Session replay conflict");
    return id;
  }
  ctx.db.prepare(
    `INSERT INTO agent_sessions
     (id, workspace_id, project_id, agent, metadata_json, started_at)
     VALUES (?, ?, ?, 'ralphy-desktop-migration', ?, ?)`,
  ).run(id, workspaceId, projectId, JSON.stringify({ migrationRunId: ctx.runId }), createdAt);
  return id;
}

function insertDesktopFeedback(
  ctx: MigrationContext,
  entry: Entry,
  review: DesktopReview,
  projectId: string,
  target: DesktopReviewTarget | null,
): string {
  const iterationId = stableId("iter", ctx, `desktop-review-iteration:${projectId}`);
  const existing = ctx.db.query<{ number: number }, [string]>(
    "SELECT number FROM project_iterations WHERE id = ?",
  ).get(iterationId);
  if (!existing) {
    const number = (ctx.db.query<{ value: number }, [string]>(
      "SELECT COALESCE(MAX(number), 0) + 1 AS value FROM project_iterations WHERE project_id = ?",
    ).get(projectId)?.value ?? 1);
    insertExact(
      ctx.db,
      "project_iterations",
      iterationId,
      `INSERT INTO project_iterations
       (id, project_id, number, title, reason, state, created_at)
       VALUES (?, ?, ?, 'Desktop migration review', 'Imported Desktop annotation', 'active', ?)`,
      [iterationId, projectId, number, entry.mtimeMs],
    );
  }
  const id = stableId("fb", ctx, `desktop-review-feedback:${entry.id}:${review.id}`);
  insertExact(
    ctx.db,
    "feedback_items",
    id,
    `INSERT INTO feedback_items
     (id, iteration_id, target_type, target_id, body, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?)`,
    [
      id,
      iterationId,
      target?.type ?? null,
      target?.id ?? null,
      `Desktop review: ${review.note ?? review.state}`,
      entry.mtimeMs,
    ],
  );
  return id;
}

function insertDesktopOrphanReview(
  ctx: MigrationContext,
  entry: Entry,
  review: DesktopReview,
): string {
  const issueKey = `desktop-review-orphan:${entry.sourceLocatorHash}:${review.id}`;
  insertIssue(ctx, {
    entryId: null,
    issueKey,
    code: "MIGRATION_DESKTOP_REVIEW_ORPHANED",
    severity: "review",
    lineNo: null,
    detail: {
      needsReview: true,
      feedbackStatus: "open",
      state: review.state,
      note: review.note,
      tags: review.tags,
      rating: review.rating,
      favorite: review.favorite,
      reviewIdHash: stableKey(review.id),
      sourceLocatorHash: entry.sourceLocatorHash,
    },
  });
  return stableId("miss", ctx, `issue:${issueKey}:MIGRATION_DESKTOP_REVIEW_ORPHANED`);
}

function importDesktopDocumentFile(ctx: MigrationContext, entry: Entry, source: MigrationSourceRoot): void {
  const raw = fs.readFileSync(checkedSourceFile(source, entry));
  if (isLegacySecretCandidate(entry.sourcePath, raw)) {
    insertIssue(ctx, secretIssue(entry, "MIGRATION_SECRET_UNKNOWN"));
    return;
  }
  let value: unknown;
  try { value = JSON.parse(raw.toString("utf8")) as unknown; } catch {
    insertDesktopDocumentIssue(ctx, entry);
    return;
  }
  const parsed = parseDesktopDocumentExport(value, source.path);
  if (!parsed) {
    insertDesktopDocumentIssue(ctx, entry);
    return;
  }
  const workspace = ctx.db.query<{ id: string }, [string]>(
    "SELECT id FROM workspaces WHERE slug = ?",
  ).get(parsed.workspace);
  if (!workspace) {
    insertDesktopDocumentIssue(ctx, entry);
    return;
  }
  const projectId = parsed.project !== null
    ? ctx.db.query<{ id: string }, [string, string]>(
      "SELECT id FROM projects WHERE workspace_id = ? AND slug = ?",
    ).get(workspace.id, parsed.project)?.id ?? null
    : null;
  if (parsed.project !== null && projectId === null) {
    insertDesktopDocumentIssue(ctx, entry);
    return;
  }
  const kind = parsed.kind;
  const suffix = entry.sourceLocatorHash.slice(0, 12);
  const documentId = stableId("doc", ctx, `desktop-document:${entry.id}`);
  const revisionId = stableId("drev", ctx, `desktop-document-revision:${entry.id}`);
  const body = canonicalJsonText(parsed);
  insertExact(
    ctx.db,
    "documents",
    documentId,
    `INSERT INTO documents
     (id, workspace_id, project_id, kind, slug, title, created_at, updated_at)
     VALUES (?, ?, ?, 'custom', ?, ?, ?, ?)`,
    [
      documentId,
      workspace.id,
      projectId,
      `desktop-${kind}-${suffix}`,
      kind === "agent-session-history" ? "Desktop Agent Session history" : "Desktop Agent Session preferences",
      entry.mtimeMs,
      entry.mtimeMs,
    ],
  );
  insertExact(
    ctx.db,
    "document_revisions",
    revisionId,
    `INSERT INTO document_revisions
     (id, document_id, revision_no, format, body, content_sha256, created_at)
     VALUES (?, ?, 1, 'json', ?, ?, ?)`,
    [revisionId, documentId, body, sha256(JSON.stringify({ format: "json", title: null, body })), entry.mtimeMs],
  );
  const current = ctx.db.query<{ id: string | null }, [string]>(
    "SELECT current_revision_id AS id FROM documents WHERE id = ?",
  ).get(documentId)?.id ?? null;
  if (current === null) ctx.db.prepare("UPDATE documents SET current_revision_id = ?, row_version = 2 WHERE id = ?").run(revisionId, documentId);
  else if (current !== revisionId) throw new Error("Desktop Document replay conflict");
  completeDesktopDomainEntry(ctx, entry, new Set([documentId, revisionId]));
}

type DesktopDocumentExport = {
  version: 1;
  kind: "agent-session-preferences" | "agent-session-history";
  workspace: string;
  project: string | null;
  preferences?: { theme: "light" | "dark" | "system"; density: "compact" | "comfortable" };
  sessions?: Array<{ agent: string; turns: Array<{ role: "user" | "assistant" | "system"; text: string }> }>;
};

function parseDesktopDocumentExport(value: unknown, sourceRoot: string): DesktopDocumentExport | null {
  if (!isRecord(value) || value.version !== 1 || !safeDesktopScopeName(value.workspace)) return null;
  if (value.kind === "agent-session-preferences") {
    if (!exactObjectKeys(value, ["version", "kind", "workspace", "project", "preferences"], ["project"])) return null;
    if (value.project !== undefined && !safeDesktopScopeName(value.project)) return null;
    if (!isRecord(value.preferences)
      || !exactObjectKeys(value.preferences, ["theme", "density"])
      || !["light", "dark", "system"].includes(String(value.preferences.theme))
      || !["compact", "comfortable"].includes(String(value.preferences.density))) return null;
    return {
      version: 1,
      kind: value.kind,
      workspace: value.workspace,
      project: typeof value.project === "string" ? value.project : null,
      preferences: {
        theme: value.preferences.theme as "light" | "dark" | "system",
        density: value.preferences.density as "compact" | "comfortable",
      },
    };
  }
  if (value.kind !== "agent-session-history"
    || !exactObjectKeys(value, ["version", "kind", "workspace", "project", "sessions"])
    || !safeDesktopScopeName(value.project)
    || !Array.isArray(value.sessions) || value.sessions.length === 0 || value.sessions.length > 100) return null;
  const sessions: NonNullable<DesktopDocumentExport["sessions"]> = [];
  let turnCount = 0;
  for (const session of value.sessions) {
    if (!isRecord(session) || !exactObjectKeys(session, ["agent", "turns"])
      || typeof session.agent !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(session.agent)
      || !Array.isArray(session.turns) || session.turns.length === 0) return null;
    const turns: NonNullable<DesktopDocumentExport["sessions"]>[number]["turns"] = [];
    for (const turn of session.turns) {
      turnCount += 1;
      if (turnCount > 1_000 || !isRecord(turn) || !exactObjectKeys(turn, ["role", "text"])
        || !["user", "assistant", "system"].includes(String(turn.role))
        || typeof turn.text !== "string" || !safeDesktopDocumentText(turn.text, sourceRoot)) return null;
      turns.push({
        role: turn.role as "user" | "assistant" | "system",
        text: turn.text,
      });
    }
    sessions.push({ agent: session.agent, turns });
  }
  return {
    version: 1,
    kind: value.kind,
    workspace: value.workspace,
    project: value.project,
    sessions,
  };
}

function exactObjectKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return keys.every((key) => allowed.includes(key))
    && allowed.every((key) => optional.includes(key) || Object.hasOwn(value, key));
}

function safeDesktopScopeName(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value);
}

function safeDesktopDocumentText(value: string, sourceRoot: string): boolean {
  if (!value || Buffer.byteLength(value) > 16_384 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) return false;
  const sanitized = sanitizeLegacyPayload(value, sourceRoot, true);
  return !sanitized.redacted
    && sanitized.value === value
    && !/(?:^|\W)(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/u.test(value);
}

function insertDesktopDocumentIssue(ctx: MigrationContext, entry: Entry): void {
  insertIssue(ctx, {
    entryId: null,
    issueKey: `desktop-document:${entry.sourceLocatorHash}`,
    code: "MIGRATION_DESKTOP_DOCUMENT_INVALID",
    severity: "review",
    lineNo: null,
    detail: { sourceLocatorHash: entry.sourceLocatorHash },
  });
}

function completeDesktopDomainEntry(ctx: MigrationContext, entry: Entry, refs: ReadonlySet<string>): void {
  const serialized = JSON.stringify([...refs].sort());
  const current = ctx.db.query<{ state: string; refs: string | null }, [string]>(
    "SELECT state, target_refs_json AS refs FROM migration_entries WHERE id = ?",
  ).get(entry.id);
  if (!current) throw new Error("Desktop migration entry disappeared");
  if (current.state === "imported") {
    if ((current.refs ?? "[]") !== serialized) throw new Error("Desktop migration entry replay conflict");
    return;
  }
  const now = Date.now();
  const result = ctx.db.prepare(
    `UPDATE migration_entries
     SET disposition = 'domain', target_refs_json = ?, state = 'imported', terminal_at = ?, updated_at = ?
     WHERE id = ? AND state = 'inventoried'`,
  ).run(serialized, now, now, entry.id);
  if (result.changes !== 1) throw new Error("Desktop migration ledger update affected no entry");
}

function desktopImportSummary(ctx: MigrationContext): DesktopStateImportSummary {
  const reviews = ctx.db.query<{ count: number }, []>(
    "SELECT COUNT(*) AS count FROM evaluations WHERE kind = 'desktop-review'",
  ).get()?.count ?? 0;
  const feedback = ctx.db.query<{ count: number }, []>(
    "SELECT COUNT(*) AS count FROM feedback_items WHERE body LIKE 'Desktop review:%'",
  ).get()?.count ?? 0;
  const secretRows = ctx.db.query<{ refs: string }, [string]>(
    `SELECT COALESCE(target_refs_json, '[]') AS refs FROM migration_entries
     WHERE migration_run_id = ? AND disposition = 'secret-imported'`,
  ).all(ctx.runId);
  const secrets = secretRows.reduce((count, row) => count + (JSON.parse(row.refs) as unknown[]).length, 0);
  const documents = ctx.db.query<{ count: number }, []>(
    "SELECT COUNT(*) AS count FROM documents WHERE title LIKE 'Desktop Agent Session %'",
  ).get()?.count ?? 0;
  const issues = ctx.db.query<{ count: number }, [string]>(
    `SELECT COUNT(*) AS count FROM migration_issues
     WHERE migration_run_id = ?
       AND (code LIKE 'MIGRATION_DESKTOP_%' OR code = 'MIGRATION_SECRET_UNKNOWN')`,
  ).get(ctx.runId)?.count ?? 0;
  return { reviews, feedback, secrets, documents, issues };
}

type PreparedEntry = { entry: Entry; source: MigrationSourceRoot; raw: Buffer };

function prepareEntries(
  entries: readonly Entry[],
  sourceById: ReadonlyMap<string, MigrationSourceRoot>,
): PreparedEntry[] {
  const prepared: PreparedEntry[] = [];
  for (const entry of entries) {
    if (entry.state !== "inventoried" || entry.entryKind !== "file" || entry.disposition !== "domain") continue;
    const source = sourceById.get(entry.sourceLabel);
    if (!source) throw new Error("Migration source identity is missing");
    const absolute = checkedSourceFile(source, entry);
    prepared.push({ entry, source, raw: fs.readFileSync(absolute) });
  }
  return prepared;
}

function migrationEntries(ctx: MigrationContext): Entry[] {
  return ctx.db.query<Entry & { entryKind: string }, [string]>(
    `SELECT entry.id, entry.migration_source_id AS sourceId,
            entry.source_kind AS sourceKind, source.source_label AS sourceLabel,
            entry.source_path AS sourcePath, entry.source_locator_hash AS sourceLocatorHash,
            entry.entry_kind AS entryKind, entry.disposition, entry.state,
            entry.source_device AS device, entry.source_inode AS inode,
            entry.source_mode AS mode, entry.bytes, entry.mtime_ms AS mtimeMs,
            entry.sha256, entry.target_refs_json AS targetRefs,
            entry.raw_evidence_object_id AS rawEvidenceObjectId
     FROM migration_entries entry
     JOIN migration_sources source ON source.id = entry.migration_source_id
     WHERE entry.migration_run_id = ?
     ORDER BY entry.migration_source_id, entry.source_path`,
  ).all(ctx.runId) as Entry[];
}

function buildScopeModel(
  ctx: MigrationContext,
  entries: readonly Entry[],
  prepared: readonly PreparedEntry[],
): ScopeModel {
  const workspaces = new Map<string, WorkspaceModel>();
  const projects = new Map<string, ProjectModel>();
  const primaryWorkspaceBySource = new Map<string, string>();
  const authoritativePrimaryWorkspaceBySource = new Map<string, string>();
  const issues: PreparedIssue[] = [];
  const registries = new Map<string, ReturnType<typeof parseLegacyRegistry>>();
  for (const item of prepared) {
    if (item.entry.sourceKind === "desktop" || !isLegacyRegistryPath(item.entry.sourcePath)) continue;
    if (isLegacySecretCandidate(item.entry.sourcePath, item.raw)) continue;
    registries.set(item.source.id, parseLegacyRegistry(item.raw));
  }

  for (const source of ctx.sourceRoots) {
    if (source.kind === "desktop") continue;
    const workspaceSlugs = new Set<string>();
    let hasPhysicalDefault = source.kind === "legacy-workspace";
    for (const entry of entries) {
      if (entry.sourceLabel !== source.id) continue;
      const match = entry.sourcePath.match(/^workspaces\/([^/]+)(?:\/|$)/u);
      if (match) workspaceSlugs.add(match[1]!);
      if (/^projects\/[^/]+(?:\/|$)/u.test(entry.sourcePath)) hasPhysicalDefault = true;
    }
    const registry = registries.get(source.id);
    for (const workspace of registry?.projects.values() ?? []) workspaceSlugs.add(workspace);
    if (source.kind === "legacy-workspace") workspaceSlugs.add("default");
    if (workspaceSlugs.size === 0) workspaceSlugs.add(registry?.activeWorkspace ?? "default");
    for (const slug of [...workspaceSlugs].sort()) {
      const key = `${source.id}\0${slug}`;
      workspaces.set(key, {
        id: stableId("ws", ctx, `workspace:${key}`),
        sourceId: source.id,
        slug: uniqueSlug(source.id, slug, workspaces),
        name: titleCase(slug),
      });
    }
    const authoritativePrimarySlug = registry?.activeWorkspace && workspaceSlugs.has(registry.activeWorkspace)
      ? registry.activeWorkspace
      : hasPhysicalDefault && workspaceSlugs.has("default")
        ? "default"
        : null;
    const primarySlug = authoritativePrimarySlug ?? [...workspaceSlugs].sort()[0]!;
    primaryWorkspaceBySource.set(source.id, workspaces.get(`${source.id}\0${primarySlug}`)!.id);
    if (authoritativePrimarySlug) {
      authoritativePrimaryWorkspaceBySource.set(
        source.id,
        workspaces.get(`${source.id}\0${authoritativePrimarySlug}`)!.id,
      );
    }
  }

  for (const source of ctx.sourceRoots) {
    if (source.kind === "desktop") continue;
    const physical = new Map<string, Set<string>>();
    for (const entry of entries) {
      if (entry.sourceLabel !== source.id) continue;
      const current = entry.sourcePath.match(/^workspaces\/([^/]+)\/projects\/([^/]+)(?:\/|$)/u);
      const legacy = entry.sourcePath.match(/^projects\/([^/]+)(?:\/|$)/u);
      const projectSlug = current?.[2] ?? legacy?.[1];
      const workspaceSlug = current?.[1] ?? (legacy ? "default" : null);
      if (!projectSlug || !workspaceSlug) continue;
      const locations = physical.get(projectSlug) ?? new Set<string>();
      locations.add(workspaceSlug);
      physical.set(projectSlug, locations);
    }
    const registered = registries.get(source.id)?.projects ?? new Map<string, string>();
    for (const projectSlug of [...new Set([...physical.keys(), ...registered.keys()])].sort()) {
      const physicalLocations = physical.get(projectSlug) ?? new Set<string>();
      const registeredLocation = registered.get(projectSlug);
      const locations = new Set(physicalLocations);
      if (registeredLocation) locations.add(registeredLocation);
      const workspaceMismatch = Boolean(
        registeredLocation
        && physicalLocations.size > 0
        && !physicalLocations.has(registeredLocation),
      );
      const duplicateAcrossWorkspaces = locations.size > 1;
      for (const workspaceSlug of [...locations].sort()) {
        const workspace = workspaces.get(`${source.id}\0${workspaceSlug}`);
        if (!workspace) throw new Error("Legacy Project references a missing Workspace");
        const key = `${source.id}\0${workspaceSlug}\0${projectSlug}`;
        projects.set(key, {
          id: stableId("prj", ctx, `project:${key}`),
          sourceId: source.id,
          workspaceId: workspace.id,
          slug: projectSlug,
          name: titleCase(projectSlug),
          physical: physicalLocations.has(workspaceSlug),
          registered: registeredLocation === workspaceSlug,
          workspaceMismatch,
          duplicateAcrossWorkspaces,
        });
      }
      if (workspaceMismatch) {
        issues.push({
          entryId: null,
          issueKey: `project-workspace:${source.id}:${projectSlug}`,
          code: "MIGRATION_PROJECT_WORKSPACE_MISMATCH",
          severity: "review",
          lineNo: null,
          detail: { sourceLabelHash: stableKey(source.id), projectSlug },
        });
      }
      if (duplicateAcrossWorkspaces && !workspaceMismatch) {
        issues.push({
          entryId: null,
          issueKey: `project-duplicate:${source.id}:${projectSlug}`,
          code: "MIGRATION_PROJECT_DUPLICATE",
          severity: "review",
          lineNo: null,
          detail: { sourceLabelHash: stableKey(source.id), projectSlug },
        });
      }
    }
  }
  return { workspaces, projects, primaryWorkspaceBySource, authoritativePrimaryWorkspaceBySource, issues };
}

function insertScopes(ctx: MigrationContext, scopes: ScopeModel, refs: Map<string, Set<string>>): void {
  const now = ctx.db.query<{ createdAt: number }, [string]>(
    "SELECT created_at AS createdAt FROM migration_runs WHERE id = ?",
  ).get(ctx.runId)?.createdAt;
  if (now === undefined) throw new Error("Migration Run disappeared");
  for (const workspace of scopes.workspaces.values()) {
    insertExact(
      ctx.db,
      "workspaces",
      workspace.id,
      `INSERT INTO workspaces (id, slug, name, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        workspace.id,
        workspace.slug,
        workspace.name,
        JSON.stringify({
          migrationRunId: ctx.runId,
          migrationSourceLabel: workspace.sourceId,
          ...(scopes.authoritativePrimaryWorkspaceBySource.get(workspace.sourceId) === workspace.id
            ? { migrationPrimary: true }
            : {}),
        }),
        now,
        now,
      ],
    );
  }
  for (const project of scopes.projects.values()) {
    const needsReview = project.physical !== project.registered
      || project.workspaceMismatch
      || project.duplicateAcrossWorkspaces;
    const metadata = {
      migrationRunId: ctx.runId,
      migrationSourceLabel: project.sourceId,
      ...(needsReview ? { needsReview: true } : {}),
      ...(project.workspaceMismatch ? { migrationWorkspaceMismatch: true } : {}),
      ...(project.duplicateAcrossWorkspaces ? { migrationDuplicateAcrossWorkspaces: true } : {}),
      ...(!project.physical ? { migrationSourceMissing: true } : {}),
      ...(!project.registered ? { migrationRegistryMissing: true } : {}),
    };
    insertExact(
      ctx.db,
      "projects",
      project.id,
      `INSERT INTO projects
       (id, workspace_id, slug, name, state, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project.id,
        project.workspaceId,
        project.slug,
        project.name,
        project.physical ? "active" : "archived",
        JSON.stringify(metadata),
        now,
        now,
      ],
    );
  }
  for (const entry of migrationEntries(ctx)) {
    if (entry.sourceKind === "desktop" || entry.disposition.startsWith("secret-")) continue;
    const workspacePath = entry.sourcePath.match(/^workspaces\/([^/]+)\/workspace\.json$/u);
    const currentProject = entry.sourcePath.match(/^workspaces\/([^/]+)\/projects\/([^/]+)\/project\.json$/u);
    const legacyProject = entry.sourcePath.match(/^projects\/([^/]+)\/project\.json$/u);
    if (workspacePath) {
      const workspace = scopes.workspaces.get(`${entry.sourceLabel}\0${workspacePath[1]}`);
      if (workspace) addRefs(refs, entry.id, workspace.id);
    } else if (currentProject) {
      const project = scopes.projects.get(`${entry.sourceLabel}\0${currentProject[1]}\0${currentProject[2]}`);
      if (project) addRefs(refs, entry.id, project.id);
    } else if (legacyProject) {
      const project = scopes.projects.get(`${entry.sourceLabel}\0default\0${legacyProject[1]}`);
      if (project) addRefs(refs, entry.id, project.id);
    } else if (isLegacyRegistryPath(entry.sourcePath)) {
      for (const workspace of scopes.workspaces.values()) if (workspace.sourceId === entry.sourceLabel) addRefs(refs, entry.id, workspace.id);
      for (const project of scopes.projects.values()) if (project.sourceId === entry.sourceLabel) addRefs(refs, entry.id, project.id);
    }
  }
}

function scopeForPath(
  scopes: ScopeModel,
  entry: Entry,
  source: MigrationSourceRoot,
): { workspaceId: string; projectId: string | null } | null {
  const current = entry.sourcePath.match(/^workspaces\/([^/]+)\/projects\/([^/]+)(?:\/|$)/u);
  if (current) {
    const project = scopes.projects.get(`${source.id}\0${current[1]}\0${current[2]}`);
    return project ? { workspaceId: project.workspaceId, projectId: project.id } : null;
  }
  const legacy = entry.sourcePath.match(/^projects\/([^/]+)(?:\/|$)/u);
  if (legacy) {
    const project = scopes.projects.get(`${source.id}\0default\0${legacy[1]}`);
    return project ? { workspaceId: project.workspaceId, projectId: project.id } : null;
  }
  const workspace = entry.sourcePath.match(/^workspaces\/([^/]+)(?:\/|$)/u);
  if (workspace) {
    const target = scopes.workspaces.get(`${source.id}\0${workspace[1]}`);
    return target ? { workspaceId: target.id, projectId: null } : null;
  }
  const workspaceId = scopes.primaryWorkspaceBySource.get(source.id);
  return workspaceId ? { workspaceId, projectId: null } : null;
}

function preparedDocument(
  ctx: MigrationContext,
  entry: Entry,
  scope: { workspaceId: string; projectId: string | null },
  body: { format: "markdown" | "text" | "json"; body: string },
  createdAt: number,
): PreparedDocument {
  const locator = `${entry.sourceLabel}:${entry.sourceLocatorHash}`;
  const suffix = sha256(locator).slice(0, 12);
  const bindingRole = scope.projectId ? recognizedProjectDocumentRole(entry.sourcePath) : null;
  return {
    entryId: entry.id,
    documentId: stableId("doc", ctx, `document:${locator}`),
    revisionId: stableId("drev", ctx, `document-revision:${locator}`),
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    kind: documentKind(entry.sourcePath),
    slug: `${safeSlug(path.posix.basename(entry.sourcePath).replace(/\.[^.]+$/u, ""))}-${suffix}`,
    title: path.posix.basename(entry.sourcePath),
    format: body.format,
    body: body.body,
    createdAt,
    sourcePath: entry.sourcePath,
    bindingId: null,
    bindingRole,
  };
}

function preparedJsonDocument(
  ctx: MigrationContext,
  entry: Entry,
  scope: { workspaceId: string; projectId: string | null },
  value: unknown,
  suffix: string,
  createdAt: number,
  sourceRoot: string,
): PreparedDocument {
  const locator = `${entry.sourceLabel}:${entry.sourceLocatorHash}:${suffix}`;
  return {
    entryId: entry.id,
    documentId: stableId("doc", ctx, `document:${locator}`),
    revisionId: stableId("drev", ctx, `document-revision:${locator}`),
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    kind: documentKind(entry.sourcePath),
    slug: `${safeSlug(path.posix.basename(entry.sourcePath).replace(/\.[^.]+$/u, ""))}-${suffix}-${entry.sourceLocatorHash.slice(0, 8)}`,
    title: `${path.posix.basename(entry.sourcePath)} ${suffix}`,
    format: "json",
    body: JSON.stringify(normalizeLegacyValue(value, sourceRoot)),
    createdAt,
    sourcePath: entry.sourcePath,
    bindingId: null,
    bindingRole: null,
  };
}

function selectProjectDocumentBindings(
  ctx: MigrationContext,
  documents: PreparedDocument[],
  issues: PreparedIssue[],
): void {
  const candidates = new Map<string, PreparedDocument[]>();
  for (const document of documents) {
    if (!document.projectId || !document.bindingRole) continue;
    const key = `${document.projectId}\0${document.bindingRole}`;
    const values = candidates.get(key) ?? [];
    values.push(document);
    candidates.set(key, values);
  }
  for (const [key, values] of candidates) {
    values.sort(compareBindingCandidates);
    const selected = values[0]!;
    selected.bindingId = stableId("bind", ctx, `binding:${key}`);
    if (values.length === 1) continue;
    issues.push({
      entryId: null,
      issueKey: `project-document:${key}`,
      code: "MIGRATION_PROJECT_DOCUMENT_AMBIGUOUS",
      severity: "review",
      lineNo: null,
      detail: {
        projectId: selected.projectId,
        role: selected.bindingRole,
        selectedDocumentId: selected.documentId,
        candidateDocumentIds: values.map((document) => document.documentId),
      },
    });
  }
}

function compareBindingCandidates(left: PreparedDocument, right: PreparedDocument): number {
  const leftDepth = left.sourcePath.split("/").length;
  const rightDepth = right.sourcePath.split("/").length;
  if (leftDepth !== rightDepth) return leftDepth - rightDepth;
  const leftFormat = bindingFormatRank(left.sourcePath);
  const rightFormat = bindingFormatRank(right.sourcePath);
  if (leftFormat !== rightFormat) return leftFormat - rightFormat;
  if (left.sourcePath !== right.sourcePath) return left.sourcePath < right.sourcePath ? -1 : 1;
  return left.documentId < right.documentId ? -1 : left.documentId === right.documentId ? 0 : 1;
}

function bindingFormatRank(sourcePath: string): number {
  const extension = path.posix.extname(sourcePath).toLowerCase();
  if (extension === ".json") return 0;
  if (extension === ".md" || extension === ".markdown") return 1;
  return 2;
}

function insertDocument(ctx: MigrationContext, document: PreparedDocument): void {
  insertExact(
    ctx.db,
    "documents",
    document.documentId,
    `INSERT INTO documents
     (id, workspace_id, project_id, kind, slug, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      document.documentId,
      document.workspaceId,
      document.projectId,
      document.kind,
      document.slug,
      document.title,
      document.createdAt,
      document.createdAt,
    ],
  );
  const contentSha = sha256(JSON.stringify({ format: document.format, title: null, body: document.body }));
  insertExact(
    ctx.db,
    "document_revisions",
    document.revisionId,
    `INSERT INTO document_revisions
     (id, document_id, revision_no, format, title, body, content_sha256, created_at)
     VALUES (?, ?, 1, ?, NULL, ?, ?, ?)`,
    [document.revisionId, document.documentId, document.format, document.body, contentSha, document.createdAt],
  );
  const current = ctx.db.query<{ revisionId: string | null }, [string]>(
    "SELECT current_revision_id AS revisionId FROM documents WHERE id = ?",
  ).get(document.documentId);
  if (current?.revisionId === null) {
    ctx.db.prepare("UPDATE documents SET current_revision_id = ?, row_version = 2 WHERE id = ?")
      .run(document.revisionId, document.documentId);
    if (document.format !== "json") {
      ctx.db.prepare("INSERT INTO document_revisions_fts (revision_id, title, body) VALUES (?, ?, ?)")
        .run(document.revisionId, document.title, document.body);
    }
  } else if (current?.revisionId !== document.revisionId) {
    throw new Error("Migration Document replay conflicts with its stable revision");
  }
  if (document.projectId && document.bindingId && document.bindingRole) {
    insertExact(
      ctx.db,
      "project_document_bindings",
      document.bindingId,
      `INSERT INTO project_document_bindings
       (id, project_id, document_revision_id, role, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [document.bindingId, document.projectId, document.revisionId, document.bindingRole, document.createdAt],
    );
  }
}

function importDocumentSemantics(
  ctx: MigrationContext,
  document: PreparedDocument,
  refs: Map<string, Set<string>>,
): void {
  if (document.projectId && /(?:^|\/)feedback\/r(\d+)\.json$/iu.test(document.title === "" ? "" : sourcePathForEntry(ctx, document.entryId))) {
    const match = sourcePathForEntry(ctx, document.entryId).match(/(?:^|\/)feedback\/r(\d+)\.json$/iu)!;
    const round = Number(match[1]);
    if (Number.isSafeInteger(round) && round > 0) importFeedback(ctx, document, round, refs);
  }
  const sourcePath = sourcePathForEntry(ctx, document.entryId);
  if (document.projectId && path.posix.basename(sourcePath).toLowerCase() === "stage-state.json") {
    importStages(ctx, document, refs);
  }
  if (document.kind === "memory") importMemory(ctx, document, refs);
  if (path.posix.basename(sourcePath).toLowerCase() === "settings.json") importSettings(ctx, document, refs);
  if (/^campaigns?\.json$/iu.test(path.posix.basename(sourcePath))) importCampaigns(ctx, document, refs);
  if (path.posix.basename(sourcePath).toLowerCase() === "calendar.json") importCalendar(ctx, document, refs);
}

function importFeedback(
  ctx: MigrationContext,
  document: PreparedDocument,
  round: number,
  refs: Map<string, Set<string>>,
): void {
  const parsed = JSON.parse(document.body) as unknown;
  if (!isRecord(parsed)) return;
  const iterationId = stableId("iter", ctx, `iteration:${document.projectId}:${round}`);
  insertExact(
    ctx.db,
    "project_iterations",
    iterationId,
    `INSERT INTO project_iterations
     (id, project_id, number, title, reason, state, created_at, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      iterationId,
      document.projectId,
      round,
      `Feedback round ${round}`,
      typeof parsed.verdict === "string" ? parsed.verdict : null,
      parsed.verdict === "approved" ? "closed" : "active",
      document.createdAt,
      parsed.verdict === "approved" ? document.createdAt : null,
    ],
  );
  addRefs(refs, document.entryId, iterationId);
  const notes = Array.isArray(parsed.notes)
    ? parsed.notes.filter((note): note is string => typeof note === "string" && note.length > 0)
    : [];
  const bodies = notes.length > 0
    ? notes
    : [typeof parsed.verdict === "string" ? `Legacy verdict: ${parsed.verdict}` : "Legacy feedback evidence"];
  for (const [index, body] of bodies.entries()) {
    const feedbackId = stableId("fb", ctx, `feedback:${document.entryId}:${index}`);
    insertExact(
      ctx.db,
      "feedback_items",
      feedbackId,
      `INSERT INTO feedback_items
       (id, iteration_id, body, status, created_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        feedbackId,
        iterationId,
        body,
        parsed.verdict === "approved" ? "resolved" : "open",
        document.createdAt,
        parsed.verdict === "approved" ? document.createdAt : null,
      ],
    );
    addRefs(refs, document.entryId, feedbackId);
  }
}

function importStages(ctx: MigrationContext, document: PreparedDocument, refs: Map<string, Set<string>>): void {
  const parsed = JSON.parse(document.body) as unknown;
  if (!isRecord(parsed)) return;
  for (const [stage, value] of Object.entries(parsed).sort(([left], [right]) => left.localeCompare(right))) {
    if (typeof value !== "string" || !value) continue;
    const id = stableId("stage", ctx, `stage:${document.projectId}:${stage}`);
    insertExact(
      ctx.db,
      "project_stages",
      id,
      `INSERT INTO project_stages (id, project_id, stage, state, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, document.projectId, stage, value, document.createdAt],
    );
    addRefs(refs, document.entryId, id);
  }
}

function importMemory(ctx: MigrationContext, document: PreparedDocument, refs: Map<string, Set<string>>): void {
  const id = stableId("memory", ctx, `memory:${document.documentId}`);
  const revisionId = stableId("mrev", ctx, `memory-revision:${document.revisionId}`);
  const description = document.body.trim().slice(0, 2_000) || "Imported legacy memory";
  insertExact(
    ctx.db,
    "memory_entries",
    id,
    `INSERT INTO memory_entries
     (id, workspace_id, slug, name, description, type, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'legacy', 'active', ?, ?)`,
    [id, document.workspaceId, document.slug, document.title, description, document.createdAt, document.createdAt],
  );
  insertExact(
    ctx.db,
    "memory_revisions",
    revisionId,
    `INSERT INTO memory_revisions
     (id, workspace_id, memory_entry_id, revision_no, document_revision_id,
      name, description, type, status, filed_at, source, created_at)
     VALUES (?, ?, ?, 1, ?, ?, ?, 'legacy', 'active', ?, 'migration', ?)`,
    [
      revisionId,
      document.workspaceId,
      id,
      document.revisionId,
      document.title,
      description,
      new Date(document.createdAt).toISOString(),
      document.createdAt,
    ],
  );
  const current = ctx.db.query<{ current: string | null }, [string]>(
    "SELECT current_revision_id AS current FROM memory_entries WHERE id = ?",
  ).get(id)?.current;
  if (current === null) ctx.db.prepare("UPDATE memory_entries SET current_revision_id = ? WHERE id = ?").run(revisionId, id);
  else if (current !== revisionId) throw new Error("Migration Memory replay conflict");
  addRefs(refs, document.entryId, id, revisionId);
}

function importSettings(ctx: MigrationContext, document: PreparedDocument, refs: Map<string, Set<string>>): void {
  const parsed = JSON.parse(document.body) as unknown;
  if (!isRecord(parsed)) return;
  for (const [key, value] of Object.entries(parsed).sort(([left], [right]) => left.localeCompare(right))) {
    if (!key || key.length > 128) continue;
    const id = stableId("setting", ctx, `setting:${document.workspaceId}:${key}`);
    insertExact(
      ctx.db,
      "settings",
      id,
      `INSERT INTO settings (id, workspace_id, key, value_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, document.workspaceId, key, JSON.stringify(value), document.createdAt, document.createdAt],
    );
    addRefs(refs, document.entryId, id);
  }
}

function importCampaigns(ctx: MigrationContext, document: PreparedDocument, refs: Map<string, Set<string>>): void {
  const parsed = JSON.parse(document.body) as unknown;
  const values = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.campaigns) ? parsed.campaigns : [parsed];
  for (const [index, value] of values.entries()) {
    if (!isRecord(value)) continue;
    const slug = safeSlug(typeof value.slug === "string" ? value.slug : typeof value.id === "string" ? value.id : `campaign-${index + 1}`);
    const id = stableId("campaign", ctx, `campaign:${document.workspaceId}:${slug}`);
    insertExact(
      ctx.db,
      "campaigns",
      id,
      `INSERT INTO campaigns
       (id, workspace_id, slug, title, state, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        document.workspaceId,
        slug,
        typeof value.title === "string" ? value.title.slice(0, 256) : titleCase(slug),
        campaignState(value.state),
        JSON.stringify({ migrationRunId: ctx.runId }),
        document.createdAt,
        document.createdAt,
      ],
    );
    addRefs(refs, document.entryId, id);
  }
}

function importCalendar(ctx: MigrationContext, document: PreparedDocument, refs: Map<string, Set<string>>): void {
  const parsed = JSON.parse(document.body) as unknown;
  const values = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.entries) ? parsed.entries : [];
  for (const [index, value] of values.entries()) {
    if (!isRecord(value)) continue;
    const id = stableId("calendar", ctx, `calendar:${document.workspaceId}:${index}`);
    insertExact(
      ctx.db,
      "calendar_entries",
      id,
      `INSERT INTO calendar_entries
       (id, workspace_id, kind, scheduled_at, unit_type, platforms_json, state,
        metadata_json, created_at, updated_at)
       VALUES (?, ?, 'entry', ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        document.workspaceId,
        typeof value.scheduledAt === "string" ? Date.parse(value.scheduledAt) || null : null,
        typeof value.unitType === "string" ? value.unitType : "legacy",
        JSON.stringify(Array.isArray(value.platforms) ? value.platforms.filter((item) => typeof item === "string") : []),
        calendarState(value.state),
        JSON.stringify({ migrationRunId: ctx.runId }),
        document.createdAt,
        document.createdAt,
      ],
    );
    addRefs(refs, document.entryId, id);
  }
}

function updatePreparedEntry(
  ctx: MigrationContext,
  entryId: string,
  disposition: string | null,
  targetPath: string | null,
  digest: string | null,
  targetRefs: readonly string[],
): void {
  const current = ctx.db.query<{
    disposition: string;
    targetPath: string | null;
    sha256: string | null;
    targetRefs: string | null;
  }, [string]>(
    `SELECT disposition, target_path AS targetPath, sha256,
            target_refs_json AS targetRefs FROM migration_entries WHERE id = ?`,
  ).get(entryId);
  if (!current) throw new Error("Migration entry disappeared");
  const nextDisposition = disposition ?? current.disposition;
  const nextTargetPath = targetPath ?? current.targetPath;
  const nextDigest = digest ?? current.sha256;
  const nextRefs = JSON.stringify([...new Set([
    ...(current.targetRefs ? JSON.parse(current.targetRefs) as string[] : []),
    ...targetRefs,
  ])].sort());
  if (
    current.disposition === nextDisposition
    && current.targetPath === nextTargetPath
    && current.sha256 === nextDigest
    && (current.targetRefs ?? "[]") === nextRefs
  ) return;
  const updated = ctx.db.prepare(
    `UPDATE migration_entries
     SET disposition = ?, target_path = ?, sha256 = ?, target_refs_json = ?, updated_at = ?
     WHERE id = ? AND state = 'inventoried'
     RETURNING id`,
  ).get(nextDisposition, nextTargetPath, nextDigest, nextRefs, Date.now(), entryId) as { id: string } | null;
  if (updated?.id !== entryId) throw new Error("Migration ledger update affected no inventoried entry");
}

function updateSecretEntry(ctx: MigrationContext, entryId: string): void {
  const current = ctx.db.query<{ disposition: string; targetPath: string | null; targetRefs: string | null }, [string]>(
    `SELECT disposition, target_path AS targetPath, target_refs_json AS targetRefs
     FROM migration_entries WHERE id = ?`,
  ).get(entryId);
  if (!current) throw new Error("Migration secret entry disappeared");
  if (
    current.disposition === "secret-recovery-only"
    && current.targetPath === null
    && (current.targetRefs ?? "[]") === "[]"
  ) return;
  const updated = ctx.db.prepare(
    `UPDATE migration_entries
     SET disposition = 'secret-recovery-only', target_path = NULL,
         target_refs_json = '[]', updated_at = ?
     WHERE id = ? AND state = 'inventoried'
     RETURNING id`,
  ).get(Date.now(), entryId) as { id: string } | null;
  if (updated?.id !== entryId) throw new Error("Migration ledger update affected no inventoried entry");
}

type PreparedIssue = {
  entryId: string | null;
  issueKey: string;
  code: string;
  severity: "info" | "review" | "block";
  lineNo: number | null;
  detail: Record<string, unknown>;
};

function insertIssue(ctx: MigrationContext, issue: PreparedIssue): void {
  const id = stableId("miss", ctx, `issue:${issue.issueKey}:${issue.code}`);
  const existing = ctx.db.query<{ detail: string; severity: string }, [string]>(
    "SELECT detail_json AS detail, severity FROM migration_issues WHERE id = ?",
  ).get(id);
  const detail = JSON.stringify(issue.detail);
  if (existing) {
    if (existing.detail !== detail || existing.severity !== issue.severity) throw new Error("Migration issue replay conflict");
    return;
  }
  ctx.db.prepare(
    `INSERT INTO migration_issues
     (id, migration_run_id, migration_entry_id, code, severity, line_no, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, ctx.runId, issue.entryId, issue.code, issue.severity, issue.lineNo, detail, Date.now());
}

function insertExact(
  db: Database,
  table: string,
  id: string | number,
  sql: string,
  values: readonly SqlValue[],
): void {
  const existing = db.query<Record<string, unknown>, [string | number]>(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (existing) {
    if (!matchesInsert(existing, sql, values)) throw new Error(`Migration ${table} replay conflict`);
    return;
  }
  db.prepare(sql).run(...values);
}

type SqlValue = string | number | bigint | boolean | null | Uint8Array;

function matchesInsert(
  row: Record<string, unknown>,
  sql: string,
  bindings: readonly SqlValue[],
): boolean {
  const match = sql.match(/INSERT INTO\s+\w+\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/iu);
  if (!match) return false;
  const columns = match[1]!.split(",").map((value) => value.trim());
  const values = match[2]!.split(",").map((value) => value.trim());
  if (columns.length !== values.length) return false;
  let binding = 0;
  for (let index = 0; index < columns.length; index += 1) {
    const token = values[index]!;
    let expected: SqlValue | undefined;
    if (token === "?") expected = bindings[binding++];
    else if (/^NULL$/iu.test(token)) expected = null;
    else if (/^'.*'$/su.test(token)) expected = token.slice(1, -1).replaceAll("''", "'");
    else if (/^-?\d+$/u.test(token)) expected = Number(token);
    else continue;
    const actual = row[columns[index]!];
    if (actual instanceof Uint8Array && expected instanceof Uint8Array) {
      if (Buffer.from(actual).compare(Buffer.from(expected)) !== 0) return false;
    } else if (actual !== expected) return false;
  }
  return binding === bindings.length;
}

type LegacyJob = {
  id: number;
  status: string;
  command: string;
  dependsOn: string;
  priority: number;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  exitCode: number | null;
  error: string | null;
  retryCount: number;
  logPath: string | null;
  tag: string | null;
  projectId: string | null;
  redactedFields: string[];
};

type LegacyLog = { id: number; jobId: number; ts: number; stream: string; line: string; redacted: boolean };
type LegacyJobArtifact = {
  id: number;
  jobId: number;
  kind: string;
  path: string;
  bytes: number | null;
  sha256: string | null;
  redacted: boolean;
};

function readLegacyJobs(db: Database, sourceRoot: string): LegacyJob[] {
  if (!tableExists(db, "jobs")) return [];
  const columns = tableColumns(db, "jobs");
  return db.query<Record<string, unknown>, []>("SELECT * FROM jobs ORDER BY id").all().map((row) => {
    const id = checkedInteger(row.id, "Legacy job ID");
    const createdAt = optionalInteger(row.created_at) ?? 0;
    const command = canonicalCommand(row.command, sourceRoot);
    const error = redactOptionalOperationalText(row.error_message, sourceRoot);
    const tag = redactOptionalOperationalText(row.tag, sourceRoot);
    const logPath = safeLegacyLogPath(row.log_path, sourceRoot);
    const dependencies = columns.has("depends_on")
      ? canonicalLegacyDependencies(row.depends_on, sourceRoot)
      : { value: "[]", redacted: false };
    return {
      id,
      status: typeof row.status === "string" ? row.status : "failed",
      command: command.value,
      dependsOn: dependencies.value,
      priority: optionalInteger(row.priority) ?? 0,
      createdAt,
      startedAt: optionalInteger(row.started_at),
      endedAt: optionalInteger(row.ended_at),
      exitCode: optionalInteger(row.exit_code),
      error: error.value,
      retryCount: Math.max(0, optionalInteger(row.retry_count) ?? 0),
      logPath: logPath.value,
      tag: tag.value,
      projectId: typeof row.project_id === "string" ? row.project_id : null,
      redactedFields: [
        ...(command.redacted ? ["command"] : []),
        ...(error.redacted ? ["error"] : []),
        ...(tag.redacted ? ["tag"] : []),
        ...(logPath.redacted ? ["logPath"] : []),
        ...(dependencies.redacted ? ["dependsOn"] : []),
      ],
    };
  });
}

function readLegacyJobLogs(db: Database, jobs: readonly LegacyJob[], sourceRoot: string): LegacyLog[] {
  if (!tableExists(db, "job_logs")) return [];
  const created = new Map(jobs.map((job) => [job.id, job.createdAt]));
  return db.query<Record<string, unknown>, []>("SELECT * FROM job_logs ORDER BY id").all().map((row) => {
    const line = redactLegacyOperationalText(
      typeof row.line === "string" ? row.line : String(row.line ?? ""),
      sourceRoot,
    );
    return {
      id: checkedInteger(row.id, "Legacy log ID"),
      jobId: checkedInteger(row.job_id, "Legacy log job ID"),
      ts: optionalInteger(row.ts) ?? created.get(Number(row.job_id)) ?? 0,
      stream: ["stdout", "stderr", "system"].includes(String(row.stream)) ? String(row.stream) : "system",
      line: line.value,
      redacted: line.redacted,
    };
  });
}

function readLegacyJobArtifacts(db: Database, sourceRoot: string): LegacyJobArtifact[] {
  if (!tableExists(db, "job_artifacts")) return [];
  return db.query<Record<string, unknown>, []>("SELECT * FROM job_artifacts ORDER BY id").all().map((row) => {
    const locator = safeLegacyArtifactPath(row.path, sourceRoot);
    const kind = safeLegacyArtifactKind(row.kind, sourceRoot);
    return {
      id: checkedInteger(row.id, "Legacy artifact ID"),
      jobId: checkedInteger(row.job_id, "Legacy artifact job ID"),
      kind: kind.value,
      path: locator.value,
      bytes: optionalInteger(row.bytes),
      sha256: typeof row.sha256 === "string" && /^[0-9a-f]{64}$/u.test(row.sha256) ? row.sha256 : null,
      redacted: locator.redacted || kind.redacted,
    };
  });
}

function insertOrValidateJob(ctx: MigrationContext, row: LegacyJob, runId: string, projectId: string | null): void {
  const status = jobStatus(row.status);
  const hold = status === "pending" ? ctx.runId : null;
  insertExact(
    ctx.db,
    "jobs",
    row.id,
    `INSERT INTO jobs
     (id, run_id, kind, status, command, depends_on, priority, created_at,
      started_at, ended_at, exit_code, error_message, retry_count, log_path,
      tag, project_id, migration_hold_run_id)
     VALUES (?, ?, 'legacy', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      runId,
      status,
      row.command,
      row.dependsOn,
      row.priority,
      row.createdAt,
      row.startedAt,
      row.endedAt,
      row.exitCode,
      row.error,
      row.retryCount,
      row.logPath,
      row.tag,
      projectId,
      hold,
    ],
  );
}

function insertOrValidateLog(db: Database, row: LegacyLog): void {
  insertExact(
    db,
    "job_logs",
    row.id,
    "INSERT INTO job_logs (id, job_id, ts, stream, line) VALUES (?, ?, ?, ?, ?)",
    [row.id, row.jobId, row.ts, row.stream, row.line],
  );
}

function insertOrValidateArtifact(db: Database, row: LegacyJobArtifact): void {
  insertExact(
    db,
    "job_artifacts",
    row.id,
    `INSERT INTO job_artifacts (id, job_id, object_id, kind, path, bytes, sha256)
     VALUES (?, ?, NULL, ?, ?, ?, ?)`,
    [row.id, row.jobId, row.kind, row.path, row.bytes, row.sha256],
  );
}

function reconcileIds(db: Database, table: string, ids: readonly number[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.query<{ id: number }, number[]>(
    `SELECT id FROM ${table} WHERE id IN (${placeholders}) ORDER BY id`,
  ).all(...ids).map((row) => row.id);
  const expected = [...ids].sort((left, right) => left - right);
  if (JSON.stringify(rows) !== JSON.stringify(expected)) {
    throw new Error(`Legacy ${table} reconciliation failed`);
  }
}

function checkedSourceFile(source: MigrationSourceRoot, entry: Entry): string {
  const relative = normalizeRelativePath(entry.sourcePath);
  const root = fs.realpathSync(source.path);
  const absolute = path.resolve(root, ...relative.split("/"));
  const canonical = fs.realpathSync(absolute);
  if (canonical !== root && !canonical.startsWith(`${root}${path.sep}`)) throw new Error("Migration source path escapes its source root");
  const stat = fs.lstatSync(canonical);
  if (
    !stat.isFile()
    || String(stat.dev) !== entry.device
    || String(stat.ino) !== entry.inode
    || stat.mode !== entry.mode
    || stat.size !== entry.bytes
    || Math.trunc(stat.mtimeMs) !== entry.mtimeMs
  ) throw new Error(`Migration source changed after inventory: ${entry.sourceLocatorHash}`);
  if (entry.sha256 !== null && sha256(fs.readFileSync(canonical)) !== entry.sha256) {
    throw new Error(`Migration source changed after inventory: ${entry.sourceLocatorHash}`);
  }
  return canonical;
}

function fileFingerprint(file: string): string {
  const stat = fs.lstatSync(file);
  return `${stat.dev}\0${stat.ino}\0${stat.mode}\0${stat.size}\0${stat.mtimeMs}\0${sha256(fs.readFileSync(file))}`;
}

function sourcePathForEntry(ctx: MigrationContext, entryId: string): string {
  const value = ctx.db.query<{ sourcePath: string }, [string]>(
    "SELECT source_path AS sourcePath FROM migration_entries WHERE id = ?",
  ).get(entryId)?.sourcePath;
  if (!value) throw new Error("Migration entry source path is missing");
  return value;
}

function resolveLegacyJobProject(
  db: Database,
  sourceId: string,
  reference: string | null,
): { projectId: string | null; issueCode: string | null } {
  if (!reference) return { projectId: null, issueCode: null };
  const rows = db.query<{ id: string }, [string, string, string]>(
    `SELECT project.id
     FROM projects project
     JOIN workspaces workspace ON workspace.id = project.workspace_id
     WHERE json_extract(workspace.metadata_json, '$.migrationSourceLabel') = ?
       AND (project.id = ? OR project.slug = ?)
     ORDER BY project.id`,
  ).all(sourceId, reference, reference);
  if (rows.length === 1) return { projectId: rows[0]!.id, issueCode: null };
  return {
    projectId: null,
    issueCode: rows.length === 0 ? "MIGRATION_JOB_PROJECT_MISSING" : "MIGRATION_JOB_PROJECT_AMBIGUOUS",
  };
}

function workspaceForProject(db: Database, projectId: string): string {
  const workspaceId = db.query<{ workspaceId: string }, [string]>(
    "SELECT workspace_id AS workspaceId FROM projects WHERE id = ?",
  ).get(projectId)?.workspaceId;
  if (!workspaceId) throw new Error("Migration Project Workspace is missing");
  return workspaceId;
}

function stableId(prefix: DomainIdPrefix, ctx: MigrationContext, key: string): string {
  const hex = createHash("sha256").update(`${ctx.runId}\0${key}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = "8";
  const value = hex.join("");
  return `${prefix}_${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function stableKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function evidencePath(entry: Entry): string {
  return `migration-evidence/${stableKey(entry.sourceLabel)}/${entry.sourceLocatorHash}.raw`;
}

function addRefs(refs: Map<string, Set<string>>, entryId: string, ...ids: string[]): void {
  const values = refs.get(entryId) ?? new Set<string>();
  for (const id of ids) values.add(id);
  refs.set(entryId, values);
}

function uniqueSlug(sourceId: string, slug: string, workspaces: ReadonlyMap<string, WorkspaceModel>): string {
  const candidate = safeSlug(slug);
  if (![...workspaces.values()].some((workspace) => workspace.slug === candidate)) return candidate;
  return `${candidate}-${stableKey(sourceId).slice(0, 8)}`;
}

function safeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 80) || "imported";
}

function titleCase(value: string): string {
  return value.split(/[-_\s]+/u).filter(Boolean).map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`).join(" ") || "Imported";
}

function documentKind(relative: string): DocumentKind {
  const lower = relative.toLowerCase();
  const name = path.posix.basename(lower);
  if (name.includes("brief")) return "brief";
  if (name.includes("style")) return "style-guide";
  if (name.includes("plan")) return "production-plan";
  if (name.includes("scenario")) return "scenario";
  if (name.includes("story")) return "storyboard";
  if (lower.includes("research")) return "research";
  if (name.includes("postmortem")) return "postmortem";
  if (lower.includes("memory")) return "memory";
  if (lower.includes("notes/") || name.includes("note")) return "note";
  return "custom";
}

function recognizedProjectDocumentRole(relative: string): string | null {
  const name = path.posix.basename(relative).toLowerCase();
  if (name === "brief.md") return "brief";
  if (name === "style_lock.md" || name === "style-guide.md") return "style-guide";
  if (name === "production_plan.md" || name === "production-plan.md") return "production-plan";
  if (name === "scenario.json" || name === "scenario.md") return "scenario";
  if (name === "storyboard.json" || name === "storyboard.md") return "storyboard";
  return null;
}

function campaignState(value: unknown): "draft" | "planned" | "active" | "completed" | "archived" {
  return ["draft", "planned", "active", "completed", "archived"].includes(String(value))
    ? value as "draft" | "planned" | "active" | "completed" | "archived"
    : "draft";
}

function calendarState(value: unknown): "idea" | "queued" | "produced" | "gated" | "scheduled" | "published" {
  return ["idea", "queued", "produced", "gated", "scheduled", "published"].includes(String(value))
    ? value as "idea" | "queued" | "produced" | "gated" | "scheduled" | "published"
    : "idea";
}

function jobStatus(value: string): "pending" | "blocked" | "running" | "completed" | "failed" | "cancelled" {
  return ["pending", "blocked", "running", "completed", "failed", "cancelled"].includes(value)
    ? value as "pending" | "blocked" | "running" | "completed" | "failed" | "cancelled"
    : "failed";
}

function runState(value: string): "pending" | "running" | "succeeded" | "failed" | "cancelled" {
  if (value === "completed") return "succeeded";
  if (value === "failed") return "failed";
  if (value === "cancelled") return "cancelled";
  if (value === "running") return "running";
  return "pending";
}

function canonicalCommand(value: unknown, sourceRoot: string): { value: string; redacted: boolean } {
  let normalized: unknown;
  if (typeof value === "string") {
    try {
      normalized = JSON.parse(value) as unknown;
    } catch {
      normalized = { legacyCommand: value };
    }
  } else normalized = value ?? {};
  try {
    const sanitized = sanitizeLegacyPayload(normalized, sourceRoot, true);
    return { value: JSON.stringify(sanitized.value), redacted: sanitized.redacted };
  } catch (error) {
    if (!(error instanceof LegacySanitizationCollisionError)) throw error;
    return { value: "{}", redacted: true };
  }
}

function redactOptionalOperationalText(
  value: unknown,
  sourceRoot: string,
): { value: string | null; redacted: boolean } {
  if (typeof value !== "string") return { value: null, redacted: false };
  return redactLegacyOperationalText(value, sourceRoot);
}

function canonicalLegacyDependencies(
  value: unknown,
  sourceRoot: string,
): { value: string; redacted: boolean } {
  if (value === null || value === undefined) return { value: "[]", redacted: false };
  if (typeof value !== "string") return { value: "[]", redacted: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return { value: "[]", redacted: true };
  }
  if (!Array.isArray(parsed)) return { value: "[]", redacted: true };
  const dependencies: number[] = [];
  let redacted = false;
  for (const item of parsed) {
    let sanitized: ReturnType<typeof sanitizeLegacyPayload>;
    try {
      sanitized = sanitizeLegacyPayload(item, sourceRoot, true);
    } catch (error) {
      if (!(error instanceof LegacySanitizationCollisionError)) throw error;
      redacted = true;
      continue;
    }
    if (sanitized.redacted || JSON.stringify(sanitized.value) !== JSON.stringify(item)) redacted = true;
    if (typeof sanitized.value === "number" && Number.isSafeInteger(sanitized.value) && sanitized.value > 0) {
      dependencies.push(sanitized.value);
    } else redacted = true;
  }
  return { value: JSON.stringify(dependencies), redacted };
}

function safeLegacyLogPath(value: unknown, sourceRoot: string): { value: string | null; redacted: boolean } {
  if (typeof value !== "string" || value.length === 0) return { value: null, redacted: false };
  const sanitized = sanitizeLegacyPayload(value, sourceRoot, true);
  return { value: safeLegacyLocator(sanitized.value, "legacy-log"), redacted: sanitized.redacted };
}

function safeLegacyArtifactPath(value: unknown, sourceRoot: string): { value: string; redacted: boolean } {
  if (typeof value !== "string" || value.length === 0) {
    return { value: "legacy-job-artifact/unknown", redacted: false };
  }
  const sanitized = sanitizeLegacyPayload(value, sourceRoot, true);
  return { value: safeLegacyLocator(sanitized.value, "legacy-job-artifact"), redacted: sanitized.redacted };
}

function safeLegacyArtifactKind(value: unknown, sourceRoot: string): { value: string; redacted: boolean } {
  if (typeof value !== "string" || value.length === 0) return { value: "legacy", redacted: false };
  const sanitized = sanitizeLegacyPayload(value, sourceRoot, true);
  const safe = typeof sanitized.value === "string" && /^[a-z][a-z0-9._-]{0,63}$/u.test(sanitized.value);
  return {
    value: safe ? sanitized.value as string : "legacy",
    redacted: sanitized.redacted || sanitized.value !== value || !safe,
  };
}

function safeLegacyLocator(value: unknown, prefix: string): string {
  if (typeof value !== "string" || value.length === 0) return `${prefix}/unknown`;
  try {
    return normalizeRelativePath(value);
  } catch {
    return `${prefix}/${sha256(value)}`;
  }
}

function tableExists(db: Database, table: string): boolean {
  return db.query<{ count: number }, [string]>(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(table)?.count === 1;
}

function tableColumns(db: Database, table: string): Set<string> {
  return new Set(db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all().map((row) => row.name));
}

function checkedInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`${label} is invalid`);
  return value;
}

function optionalInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
