import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DomainIdPrefix } from "../store/ids.js";
import {
  classifyLegacyPath,
  isLegacyRegistryPath,
  isLegacySecretCandidate,
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
};

type ScopeModel = {
  workspaces: Map<string, WorkspaceModel>;
  projects: Map<string, ProjectModel>;
  primaryWorkspaceBySource: Map<string, string>;
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
            entry.sha256
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
    for (const entry of entries) {
      if (entry.sourceLabel !== source.id) continue;
      const match = entry.sourcePath.match(/^workspaces\/([^/]+)(?:\/|$)/u);
      if (match) workspaceSlugs.add(match[1]!);
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
    const primarySlug = registry?.activeWorkspace && workspaceSlugs.has(registry.activeWorkspace)
      ? registry.activeWorkspace
      : [...workspaceSlugs].sort()[0]!;
    primaryWorkspaceBySource.set(source.id, workspaces.get(`${source.id}\0${primarySlug}`)!.id);
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
  return { workspaces, projects, primaryWorkspaceBySource, issues };
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
        JSON.stringify({ migrationRunId: ctx.runId, migrationSourceLabel: workspace.sourceId }),
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
