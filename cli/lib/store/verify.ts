import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ralphDir } from "../paths.js";
import { domainDbPath } from "./db.js";
import { resolveObjectLocator } from "./objects.js";
import { SCHEMA_VERSION } from "./schema.js";
import type { ObjectRow } from "./types.js";

export type ForeignKeyViolation = {
  table: string;
  rowId: string;
  parent: string;
  foreignKeyIndex: number;
};

export type RowIssue<R extends string> = {
  table: string;
  rowId: string;
  column: string;
  jsonPointer?: string;
  reason: R;
};

export type ChainIssue<E extends string, R extends string> = {
  entityType: E;
  entityId: string;
  reason: R;
  relatedId?: string;
};

export type RunObjectIssueReason =
  | "invalid-locator"
  | "outside-root"
  | "symlink"
  | "not-regular"
  | "unreadable"
  | "size-mismatch"
  | "hash-mismatch"
  | "missing-hash-evidence"
  | "missing-forensic-file";
export type AbsolutePathReason =
  | "posix-absolute"
  | "drive-absolute"
  | "unc-absolute"
  | "file-url";
export type RevisionChainEntity =
  | "document"
  | "document-revision"
  | "artifact"
  | "artifact-revision"
  | "evaluation"
  | "run"
  | "run-attempt"
  | "run-result";
export type RevisionChainReason =
  | "missing-pointer"
  | "foreign-pointer"
  | "latest-not-greatest"
  | "parent-mismatch"
  | "revision-number-mismatch"
  | "scope-mismatch"
  | "missing-target"
  | "run-lifecycle-mismatch"
  | "run-result-mismatch";
export type BuildChainEntity =
  | "composition"
  | "composition-revision"
  | "composition-file"
  | "composition-input"
  | "build"
  | "build-output"
  | "build-binding";
export type BuildChainReason =
  | "missing-pointer"
  | "foreign-pointer"
  | "latest-not-greatest"
  | "selected-unsealed"
  | "parent-mismatch"
  | "revision-number-mismatch"
  | "scope-mismatch"
  | "unsealed-input"
  | "position-gap"
  | "missing-output"
  | "binding-mismatch"
  | "build-lifecycle-mismatch";
export type UnitChainEntity =
  | "unit"
  | "unit-revision"
  | "unit-item"
  | "presentation"
  | "caption-revision"
  | "publication"
  | "metric-snapshot";
export type UnitChainReason =
  | "missing-pointer"
  | "foreign-pointer"
  | "latest-not-greatest"
  | "selected-unsealed"
  | "parent-mismatch"
  | "revision-number-mismatch"
  | "scope-mismatch"
  | "unsealed-graph"
  | "position-gap"
  | "presentation-mismatch"
  | "publication-lifecycle-mismatch"
  | "claim-fence-mismatch"
  | "run-result-mismatch"
  | "metric-window-mismatch";
export type ProvenanceEntity =
  | "document-revision"
  | "artifact-revision"
  | "composition-revision"
  | "unit-revision"
  | "run"
  | "evaluation"
  | "consumer-principal"
  | "agent-session";
export type ProvenanceReason =
  | "missing-session"
  | "ended-session"
  | "workspace-mismatch"
  | "project-mismatch"
  | "invalid-consumer-principal"
  | "consumer-session-ownership-mismatch"
  | "consumer-session-auth-mismatch"
  | "external-provenance-mismatch";
export type ObjectFileIssue = {
  objectId: string;
  reason:
    | "invalid-locator"
    | "outside-root"
    | "symlink"
    | "not-regular"
    | "empty"
    | "size-mismatch"
    | "unreadable";
};
export type FilesystemIssue = {
  relativePath: string;
  reason: "symlink" | "unreadable" | "unexpected-type";
};

export type DomainVerificationReport = {
  integrity: "ok" | "failed";
  hashObjects: boolean;
  integrityCheck: string[];
  foreignKeyViolations: ForeignKeyViolation[];
  missingObjects: string[];
  objectFileIssues: ObjectFileIssue[];
  hashMismatches: string[];
  runObjectIssues: RowIssue<RunObjectIssueReason>[];
  absolutePathRows: RowIssue<AbsolutePathReason>[];
  dataUrlRows: RowIssue<"data-url">[];
  invalidJsonRows: RowIssue<"invalid-json">[];
  binaryPayloadRows: RowIssue<"binary-payload">[];
  brokenRevisionChains: ChainIssue<RevisionChainEntity, RevisionChainReason>[];
  brokenBuildChains: ChainIssue<BuildChainEntity, BuildChainReason>[];
  brokenUnitChains: ChainIssue<UnitChainEntity, UnitChainReason>[];
  sessionProvenanceIssues: ChainIssue<ProvenanceEntity, ProvenanceReason>[];
  unreferencedObjects: string[];
  orphanedObjectPaths: string[];
  filesystemIssues: FilesystemIssue[];
};

type ForeignKeyRow = {
  table: string;
  rowid: number | string | null;
  parent: string;
  fkid: number;
};

type DbRow = Record<string, string | number | Uint8Array | null> & {
  __rowid: number;
};

type JsonTreeRow = {
  id: number;
  parent: number | null;
  key: string | number | null;
  type: string;
  atom: string | number | null;
};

const TEXT_COLUMNS = {
  activity_events: "workspace_id,project_id,entity_type,entity_id,action,payload_json",
  agent_sessions: "id,workspace_id,project_id,agent,metadata_json",
  artifact_relations: "id,from_revision_id,to_revision_id,relation,metadata_json",
  artifact_revisions: "id,artifact_id,object_id,parent_revision_id,iteration_id,state,metadata_json,authored_by_session_id",
  artifact_usages: "id,artifact_revision_id,workspace_id,project_id,feedback_id,context_type,context_id,role,lifecycle",
  artifacts: "id,workspace_id,project_id,slug,kind,selected_revision_id",
  build_document_bindings: "id,build_id,document_revision_id,role",
  build_outputs: "id,build_id,artifact_revision_id,role",
  builds: "id,composition_revision_id,run_id,state,profile_json,error",
  composition_inputs: "id,composition_revision_id,artifact_revision_id,role,config_json",
  composition_revision_files: "id,composition_revision_id,logical_path,object_id",
  composition_revisions: "id,composition_id,parent_revision_id,iteration_id,state,engine,engine_version,engine_config_json,manifest_sha256,authored_by_session_id",
  compositions: "id,project_id,slug,kind,selected_revision_id",
  document_revisions: "id,document_id,parent_revision_id,iteration_id,format,title,body,content_sha256,authored_by_session_id",
  documents: "id,workspace_id,project_id,kind,slug,title,current_revision_id",
  evaluations: "id,project_id,artifact_revision_id,composition_revision_id,build_id,run_id,kind,verdict,report_json",
  feedback_items: "id,iteration_id,target_type,target_id,body,status,resolution_note",
  feedback_resolution_links: "id,feedback_id,entity_type,entity_id",
  job_artifacts: "object_id,kind,path,sha256",
  job_logs: "stream,line",
  jobs: "run_id,kind,status,command,depends_on,error_message,log_path,tag,project_id",
  metric_snapshots: "id,publication_id,source,retention_curve_json,note,raw_json",
  objects: "id,workspace_id,project_id,backend,bucket,key,sha256,mime,storage_class,original_name,metadata_json",
  presentation_caption_revisions: "id,presentation_id,parent_revision_id,state,text",
  presentation_items: "id,presentation_id,unit_item_id,config_json",
  project_document_bindings: "id,project_id,document_revision_id,role",
  project_iterations: "id,project_id,title,reason,state",
  project_stages: "id,project_id,stage,state,entity_type,entity_id,metadata_json",
  projects: "id,workspace_id,slug,name,state,metadata_json",
  publications: "id,presentation_id,effective_caption_revision_id,effective_options_json,social_account_id,submission_run_id,active_claim_run_id,revised_from_publication_id,rail,provider_publication_id,state,url,error,failure_stage,idempotency_key,claim_kind,claim_token",
  run_attempts: "id,run_id,provider,model,state,request_json,response_json,error",
  run_objects: "id,run_id,object_id,path,purpose,state,retention,sha256,metadata_json",
  run_results: "id,run_id,entity_type,entity_id",
  runs: "id,workspace_id,project_id,agent_session_id,kind,label,state,metadata_json,error",
  social_accounts: "id,workspace_id,platform,external_id,display_name,username,config_json",
  storage_transfer_entries: "id,transfer_id,object_id,source_key,destination_key,sha256,state,error",
  storage_transfers: "id,workspace_id,project_id,kind,state,source_bucket,destination_bucket",
  store_metadata: "store_id",
  unit_items: "id,unit_revision_id,artifact_revision_id,document_revision_id,role,config_json",
  unit_presentations: "id,unit_revision_id,platform,effective_caption_revision_id,cover_artifact_revision_id,crop_json,safe_area_json,options_json",
  unit_revisions: "id,unit_id,parent_revision_id,iteration_id,note,metadata_json,authored_by_session_id",
  units: "id,workspace_id,project_id,slug,format,latest_revision_id,selected_revision_id",
  workspaces: "id,slug,name,metadata_json",
} as const;

const JSON_COLUMNS = new Set([
  "jobs.command",
  "jobs.depends_on",
]);
const LOCATOR_COLUMNS = new Set([
  "composition_revision_files.logical_path",
  "job_artifacts.path",
  "jobs.log_path",
  "objects.bucket",
  "objects.key",
  "run_objects.path",
  "storage_transfer_entries.source_key",
  "storage_transfer_entries.destination_key",
  "storage_transfers.source_bucket",
  "storage_transfers.destination_bucket",
]);
const BINARY_KEYS = new Set([
  "base64",
  "b64",
  "binary",
  "blob",
  "bytes",
  "dataurl",
  "filedata",
  "imagedata",
]);
const DATA_URL =
  /data:(?:[a-z][a-z0-9!#$&^_.+-]*\/[a-z0-9!#$&^_.+-]+)?(?:;[a-z0-9!#$&^_.+-]+=[^;,\s]+)*(?:;base64)?,[^\s"'<>]*/i;
const FTS_TABLES = new Set([
  "document_revisions_fts",
  "document_revisions_fts_config",
  "document_revisions_fts_content",
  "document_revisions_fts_data",
  "document_revisions_fts_docsize",
  "document_revisions_fts_idx",
]);

class VerifierSchemaError extends Error {}

export function verifyDomainStore(
  options: { hashObjects?: boolean } = {},
): DomainVerificationReport {
  const databasePath = domainDbPath();
  let databaseStat: fs.Stats;
  try {
    databaseStat = fs.lstatSync(databasePath);
  } catch {
    throw new Error("Domain store is unavailable");
  }
  if (!databaseStat.isFile() || databaseStat.isSymbolicLink()) {
    throw new Error("Domain store is unavailable");
  }
  let db: Database;
  try {
    db = new Database(databasePath, { readonly: true });
  } catch {
    throw new Error("Domain store is unavailable");
  }
  try {
    db.exec("PRAGMA query_only = ON; BEGIN");
    const migration = db
      .query<{ version: number | null }, []>(
        "SELECT MAX(version) AS version FROM schema_migrations",
      )
      .get();
    const metadata = db
      .query<{ singleton: number }, []>(
        "SELECT singleton FROM store_metadata WHERE singleton = 1",
      )
      .get();
    if (migration?.version !== SCHEMA_VERSION || metadata?.singleton !== 1) {
      throw new VerifierSchemaError("Domain store schema is unsupported");
    }
    const rawIntegrity = db
      .query<{ integrity_check: string }, []>("PRAGMA integrity_check")
      .all();
    const integrityCheck =
      rawIntegrity.length === 1 && rawIntegrity[0]?.integrity_check === "ok"
        ? ["ok"]
        : ["failed"];
    const foreignKeyViolations = db
      .query<ForeignKeyRow, []>("PRAGMA foreign_key_check")
      .all()
      .map((row) => ({
        table: row.table,
        rowId: String(row.rowid ?? ""),
        parent: row.parent,
        foreignKeyIndex: row.fkid,
      }));
    const report: DomainVerificationReport = {
      integrity: "ok",
      hashObjects: options.hashObjects ?? false,
      integrityCheck,
      foreignKeyViolations,
      missingObjects: [],
      objectFileIssues: [],
      hashMismatches: [],
      runObjectIssues: [],
      absolutePathRows: [],
      dataUrlRows: [],
      invalidJsonRows: [],
      binaryPayloadRows: [],
      brokenRevisionChains: [],
      brokenBuildChains: [],
      brokenUnitChains: [],
      sessionProvenanceIssues: [],
      unreferencedObjects: [],
      orphanedObjectPaths: [],
      filesystemIssues: [],
    };
    validateTextDescriptors(db);
    scanTextPayloads(db, report);
    const expectedObjectPaths = inspectObjects(db, report);
    inspectRunObjects(db, report);
    inspectObjectReferences(db, report);
    inspectRevisionChains(db, report);
    inspectBuildChains(db, report);
    inspectUnitChains(db, report);
    inspectSessionProvenance(db, report);
    inspectFilesystem(report, expectedObjectPaths);
    finalizeReport(report);
    db.exec("COMMIT");
    return report;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The transaction may not have started.
    }
    if (error instanceof VerifierSchemaError) throw error;
    throw new Error("Domain store verification failed");
  } finally {
    try {
      db.close();
    } catch {
      // Verification is read-only; closing diagnostics are intentionally redacted.
    }
  }
}

function validateTextDescriptors(db: Database): void {
  const actual = new Map<string, string[]>();
  const tables = db
    .query<{ name: string }, []>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all()
    .filter(({ name }) => !FTS_TABLES.has(name));
  for (const { name } of tables) {
    const columns = db
      .query<{ name: string; type: string; hidden: number }, [string]>(
        "SELECT name, type, hidden FROM pragma_table_xinfo(?)",
      )
      .all(name)
      .filter(
        (column) =>
          column.hidden === 0 && column.type.toUpperCase() === "TEXT",
      )
      .map((column) => column.name);
    if (columns.length > 0) actual.set(name, columns);
  }
  const expected = new Map(
    Object.entries(TEXT_COLUMNS).map(([table, columns]) => [
      table,
      columns.split(","),
    ]),
  );
  if (JSON.stringify([...actual]) !== JSON.stringify([...expected])) {
    throw new VerifierSchemaError(
      "Verifier TEXT descriptor registry does not match schema",
    );
  }
}

function scanTextPayloads(
  db: Database,
  report: DomainVerificationReport,
): void {
  for (const [table, serializedColumns] of Object.entries(TEXT_COLUMNS)) {
    const columns = serializedColumns.split(",");
    const rows = db
      .query<DbRow, []>(`SELECT rowid AS __rowid, * FROM "${table}"`)
      .all();
    for (const row of rows) {
      const rowId = String(row.id ?? row.__rowid);
      for (const column of columns) {
        const value = row[column];
        if (value instanceof Uint8Array) {
          report.binaryPayloadRows.push({
            table,
            rowId,
            column,
            reason: "binary-payload",
          });
          continue;
        }
        if (typeof value !== "string") continue;
        const key = `${table}.${column}`;
        if (
          key === "run_objects.path" &&
          typeof row.object_id === "string"
        ) {
          continue;
        }
        const isJson =
          column.endsWith("_json") ||
          JSON_COLUMNS.has(key) ||
          (table === "document_revisions" &&
            column === "body" &&
            row.format === "json");
        if (isJson) {
          if (!isValidJson(db, value)) {
            report.invalidJsonRows.push({
              table,
              rowId,
              column,
              reason: "invalid-json",
            });
            continue;
          }
          scanJsonText(db, report, { table, rowId, column }, value);
          continue;
        }
        if (DATA_URL.test(value)) {
          report.dataUrlRows.push({
            table,
            rowId,
            column,
            reason: "data-url",
          });
        }
        if (LOCATOR_COLUMNS.has(key)) {
          const reason = absolutePathReason(value, true);
          if (reason) {
            report.absolutePathRows.push({ table, rowId, column, reason });
          }
        }
      }
    }
  }
}

function isValidJson(db: Database, value: string): boolean {
  try {
    return db
      .query<{ valid: number }, [string]>("SELECT json_valid(?) AS valid")
      .get(value)?.valid === 1;
  } catch {
    return false;
  }
}

function scanJsonText(
  db: Database,
  report: DomainVerificationReport,
  row: { table: string; rowId: string; column: string },
  value: string,
): void {
  let nodes: JsonTreeRow[];
  try {
    nodes = db
      .query<JsonTreeRow, [string]>(
        "SELECT id, parent, key, type, atom FROM json_tree(?) ORDER BY id",
      )
      .all(value);
  } catch {
    return;
  }
  const context = new Map<
    number,
    { pointer: string; type: string; binary: boolean }
  >();
  for (const node of nodes) {
    const parent = node.parent === null ? null : context.get(node.parent);
    const objectKey =
      parent?.type === "object" && typeof node.key === "string"
        ? node.key
        : null;
    const segment = objectKey === null
      ? node.key === null
        ? null
        : String(node.key)
      : safePointerSegment(objectKey);
    const pointer = parent == null || segment === null
      ? ""
      : `${parent.pointer}/${segment}`;
    const binary =
      (parent?.binary ?? false) ||
      (objectKey !== null && BINARY_KEYS.has(objectKey.toLowerCase()));
    context.set(node.id, { pointer, type: node.type, binary });
    if (objectKey !== null) {
      const keyReason = absolutePathReason(objectKey);
      if (keyReason) {
        report.absolutePathRows.push({
          ...row,
          jsonPointer: pointer,
          reason: keyReason,
        });
      }
      if (DATA_URL.test(objectKey)) {
        report.dataUrlRows.push({
          ...row,
          jsonPointer: pointer,
          reason: "data-url",
        });
      }
    }
    if (node.type !== "text" || typeof node.atom !== "string") continue;
    const pathReason = absolutePathReason(
      node.atom,
      objectKey !== null && /(?:^|[_-])(locator|path|key|bucket)(?:$|[_-])/i.test(objectKey),
    );
    if (pathReason) {
      report.absolutePathRows.push({
        ...row,
        jsonPointer: pointer,
        reason: pathReason,
      });
    }
    if (DATA_URL.test(node.atom)) {
      report.dataUrlRows.push({
        ...row,
        jsonPointer: pointer,
        reason: "data-url",
      });
    }
    if (binary && isStrictBase64(node.atom)) {
      report.binaryPayloadRows.push({
        ...row,
        jsonPointer: pointer,
        reason: "binary-payload",
      });
    }
  }
}

function safePointerSegment(value: string): string {
  const safe = /^[A-Za-z0-9_.-]{1,64}$/.test(value)
    ? value
    : "<redacted>";
  return safe.replaceAll("~", "~0").replaceAll("/", "~1");
}

function absolutePathReason(
  value: string,
  allowInternalSpaces = false,
): AbsolutePathReason | null {
  const tail = allowInternalSpaces ? "[^\\r\\n]" : "[^\\s]";
  if (new RegExp(`^file:(?:\\/\\/)?${tail}+$`, "i").test(value)) return "file-url";
  if (new RegExp(`^[A-Za-z]:[\\\\/]${tail}*$`).test(value)) return "drive-absolute";
  if (new RegExp(`^(?:\\\\\\\\|\\/\\/)[^\\\\/\\r\\n]+[\\\\/]${tail}+$`).test(value)) {
    return "unc-absolute";
  }
  if (new RegExp(`^\\/${tail}*$`).test(value)) return "posix-absolute";
  return null;
}

function isStrictBase64(value: string): boolean {
  return (
    value.length >= 4 &&
    value.length % 4 === 0 &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    ) &&
    Buffer.from(value, "base64").toString("base64") === value
  );
}

function inspectObjects(
  db: Database,
  report: DomainVerificationReport,
): Set<string> {
  const expectedPaths = new Set<string>();
  const rows = db
    .query<
      {
        id: string;
        workspace_id: string;
        project_id: string | null;
        backend: "local";
        bucket: string;
        key: string;
        sha256: string;
        mime: string;
        bytes: number;
        storage_class: ObjectRow["storageClass"];
        original_name: string | null;
        created_at: number;
        project_workspace_id: string | null;
      },
      []
    >(
      `SELECT object.id, object.workspace_id, object.project_id, object.backend,
              object.bucket, object.key, object.sha256, object.mime,
              object.bytes, object.storage_class, object.original_name,
              object.created_at,
              project.workspace_id AS project_workspace_id
       FROM objects object
       LEFT JOIN projects project ON project.id = object.project_id`,
    )
    .all();
  for (const source of rows) {
    const row: ObjectRow = {
      id: source.id,
      workspaceId: source.workspace_id,
      projectId: source.project_id,
      backend: source.backend,
      bucket: source.bucket,
      key: source.key,
      sha256: source.sha256,
      mime: source.mime,
      bytes: source.bytes,
      storageClass: source.storage_class,
      originalName: source.original_name,
      metadata: null,
      createdAt: source.created_at,
    };
    let filePath: string;
    try {
      if (
        row.projectId !== null &&
        source.project_workspace_id !== row.workspaceId
      ) {
        throw new Error("scope");
      }
      filePath = resolveObjectLocator(row);
      expectedPaths.add(toPosix(path.relative(path.resolve(ralphDir()), filePath)));
    } catch (error) {
      report.objectFileIssues.push({
        objectId: row.id,
        reason: error instanceof OutsideRootError ? "outside-root" : "invalid-locator",
      });
      continue;
    }
    const checked = inspectRegularFile(filePath, report.hashObjects, false);
    if (checked.kind === "missing") {
      report.missingObjects.push(row.id);
      continue;
    }
    if (checked.kind !== "ok") {
      report.objectFileIssues.push({ objectId: row.id, reason: checked.kind });
      continue;
    }
    if (checked.bytes === 0) {
      report.objectFileIssues.push({ objectId: row.id, reason: "empty" });
      continue;
    }
    if (checked.bytes !== row.bytes || !checked.stable) {
      report.objectFileIssues.push({ objectId: row.id, reason: "size-mismatch" });
      continue;
    }
    if (report.hashObjects && checked.sha256 !== row.sha256) {
      report.hashMismatches.push(row.id);
    }
  }
  return expectedPaths;
}

function inspectRunObjects(
  db: Database,
  report: DomainVerificationReport,
): void {
  const rows = db
    .query<
      {
        id: string;
        object_id: string | null;
        path: string;
        state: string;
        bytes: number | null;
        sha256: string | null;
      },
      []
    >("SELECT id, object_id, path, state, bytes, sha256 FROM run_objects")
    .all();
  for (const row of rows) {
    if (row.object_id !== null) continue;
    let filePath: string;
    try {
      filePath = runObjectPath(row.path);
    } catch (error) {
      report.runObjectIssues.push({
        table: "run_objects",
        rowId: row.id,
        column: "path",
        reason: error instanceof OutsideRootError ? "outside-root" : "invalid-locator",
      });
      continue;
    }
    const checked = inspectRegularFile(filePath, true, true);
    if (checked.kind === "missing") {
      if (row.state === "forensic" || row.state === "diagnostic") {
        report.runObjectIssues.push({
          table: "run_objects",
          rowId: row.id,
          column: "path",
          reason: "missing-forensic-file",
        });
      }
      continue;
    }
    if (checked.kind !== "ok") {
      report.runObjectIssues.push({
        table: "run_objects",
        rowId: row.id,
        column: "path",
        reason: checked.kind === "empty" ? "size-mismatch" : checked.kind,
      });
      continue;
    }
    if (row.bytes === null || row.sha256 === null) {
      report.runObjectIssues.push({
        table: "run_objects",
        rowId: row.id,
        column: row.sha256 === null ? "sha256" : "bytes",
        reason: "missing-hash-evidence",
      });
    }
    if (row.bytes !== null && (checked.bytes !== row.bytes || !checked.stable)) {
      report.runObjectIssues.push({
        table: "run_objects",
        rowId: row.id,
        column: "bytes",
        reason: "size-mismatch",
      });
    }
    if (row.sha256 !== null && checked.sha256 !== row.sha256) {
      report.runObjectIssues.push({
        table: "run_objects",
        rowId: row.id,
        column: "sha256",
        reason: "hash-mismatch",
      });
    }
  }
}

function inspectObjectReferences(
  db: Database,
  report: DomainVerificationReport,
): void {
  report.unreferencedObjects.push(
    ...db
      .query<{ id: string }, []>(
        `SELECT object.id FROM objects object
         WHERE NOT EXISTS (SELECT 1 FROM artifact_revisions WHERE object_id = object.id)
           AND NOT EXISTS (SELECT 1 FROM composition_revision_files WHERE object_id = object.id)
           AND NOT EXISTS (SELECT 1 FROM run_objects WHERE object_id = object.id)
           AND NOT EXISTS (SELECT 1 FROM job_artifacts WHERE object_id = object.id)
           AND NOT EXISTS (SELECT 1 FROM storage_transfer_entries WHERE object_id = object.id)`,
      )
      .all()
      .map((row) => row.id),
  );
}

type ChainDbRow = { entityId: string; relatedId: string | null };

function appendRevisionChain(
  target: DomainVerificationReport["brokenRevisionChains"],
  entityType: RevisionChainEntity,
  reason: RevisionChainReason,
  rows: ChainDbRow[],
): void {
  for (const row of rows) {
    target.push({
      entityType,
      entityId: row.entityId,
      reason,
      ...(row.relatedId === null ? {} : { relatedId: row.relatedId }),
    });
  }
}

function appendBuildChain(
  target: DomainVerificationReport["brokenBuildChains"],
  entityType: BuildChainEntity,
  reason: BuildChainReason,
  rows: ChainDbRow[],
): void {
  for (const row of rows) {
    target.push({
      entityType,
      entityId: row.entityId,
      reason,
      ...(row.relatedId === null ? {} : { relatedId: row.relatedId }),
    });
  }
}

function appendUnitChain(
  target: DomainVerificationReport["brokenUnitChains"],
  entityType: UnitChainEntity,
  reason: UnitChainReason,
  rows: ChainDbRow[],
): void {
  for (const row of rows) {
    target.push({
      entityType,
      entityId: row.entityId,
      reason,
      ...(row.relatedId === null ? {} : { relatedId: row.relatedId }),
    });
  }
}

function chainRows(db: Database, sql: string): ChainDbRow[] {
  return db.query<ChainDbRow, []>(sql).all();
}

function inspectRevisionChains(
  db: Database,
  report: DomainVerificationReport,
): void {
  const target = report.brokenRevisionChains;
  appendRevisionChain(target, "document", "missing-pointer", chainRows(db, `
    SELECT document.id AS entityId, NULL AS relatedId
    FROM documents document
    WHERE document.current_revision_id IS NULL
      AND EXISTS (SELECT 1 FROM document_revisions revision
                  WHERE revision.document_id = document.id)`));
  appendRevisionChain(target, "document", "foreign-pointer", chainRows(db, `
    SELECT document.id AS entityId, document.current_revision_id AS relatedId
    FROM documents document
    WHERE document.current_revision_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM document_revisions revision
                      WHERE revision.id = document.current_revision_id
                        AND revision.document_id = document.id)`));
  appendRevisionChain(target, "document", "latest-not-greatest", chainRows(db, `
    SELECT document.id AS entityId, document.current_revision_id AS relatedId
    FROM documents document
    JOIN document_revisions current ON current.id = document.current_revision_id
      AND current.document_id = document.id
    WHERE current.revision_no <> (SELECT MAX(revision_no)
                                  FROM document_revisions
                                  WHERE document_id = document.id)`));
  appendRevisionChain(target, "document", "scope-mismatch", chainRows(db, `
    SELECT document.id AS entityId, document.project_id AS relatedId
    FROM documents document JOIN projects project ON project.id = document.project_id
    WHERE project.workspace_id <> document.workspace_id`));
  appendRevisionChain(target, "document-revision", "revision-number-mismatch", chainRows(db, `
    SELECT revision.id AS entityId, NULL AS relatedId
    FROM document_revisions revision
    WHERE revision.revision_no <> (
      SELECT COUNT(*) FROM document_revisions prior
      WHERE prior.document_id = revision.document_id
        AND prior.revision_no <= revision.revision_no)`));
  appendRevisionChain(target, "document-revision", "parent-mismatch", chainRows(db, `
    SELECT revision.id AS entityId, revision.parent_revision_id AS relatedId
    FROM document_revisions revision
    LEFT JOIN document_revisions parent
      ON parent.document_id = revision.document_id
     AND parent.revision_no = revision.revision_no - 1
    WHERE (revision.revision_no = 1 AND revision.parent_revision_id IS NOT NULL)
       OR (revision.revision_no > 1 AND parent.id IS NOT revision.parent_revision_id)`));
  appendRevisionChain(target, "document-revision", "scope-mismatch", chainRows(db, `
    SELECT revision.id AS entityId, revision.iteration_id AS relatedId
    FROM document_revisions revision
    JOIN documents document ON document.id = revision.document_id
    LEFT JOIN project_iterations iteration ON iteration.id = revision.iteration_id
    LEFT JOIN projects project ON project.id = iteration.project_id
    WHERE revision.iteration_id IS NOT NULL AND (
      iteration.id IS NULL OR project.workspace_id <> document.workspace_id OR
      (document.project_id IS NOT NULL AND iteration.project_id <> document.project_id))`));

  appendRevisionChain(target, "artifact", "foreign-pointer", chainRows(db, `
    SELECT artifact.id AS entityId, artifact.selected_revision_id AS relatedId
    FROM artifacts artifact
    WHERE artifact.selected_revision_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM artifact_revisions revision
                      WHERE revision.id = artifact.selected_revision_id
                        AND revision.artifact_id = artifact.id)`));
  appendRevisionChain(target, "artifact", "scope-mismatch", chainRows(db, `
    SELECT artifact.id AS entityId, artifact.project_id AS relatedId
    FROM artifacts artifact JOIN projects project ON project.id = artifact.project_id
    WHERE project.workspace_id <> artifact.workspace_id`));
  appendRevisionChain(target, "artifact-revision", "revision-number-mismatch", chainRows(db, `
    SELECT revision.id AS entityId, NULL AS relatedId
    FROM artifact_revisions revision
    WHERE revision.revision_no <> (
      SELECT COUNT(*) FROM artifact_revisions prior
      WHERE prior.artifact_id = revision.artifact_id
        AND prior.revision_no <= revision.revision_no)`));
  appendRevisionChain(target, "artifact-revision", "parent-mismatch", chainRows(db, `
    SELECT revision.id AS entityId, revision.parent_revision_id AS relatedId
    FROM artifact_revisions revision
    LEFT JOIN artifact_revisions parent ON parent.id = revision.parent_revision_id
    WHERE revision.parent_revision_id IS NOT NULL
      AND (parent.id IS NULL OR parent.artifact_id <> revision.artifact_id
           OR parent.revision_no >= revision.revision_no)`));
  appendRevisionChain(target, "artifact-revision", "scope-mismatch", chainRows(db, `
    SELECT revision.id AS entityId, revision.object_id AS relatedId
    FROM artifact_revisions revision
    JOIN artifacts artifact ON artifact.id = revision.artifact_id
    LEFT JOIN objects object ON object.id = revision.object_id
    WHERE object.id IS NULL OR object.workspace_id <> artifact.workspace_id OR
      (artifact.project_id IS NULL AND object.project_id IS NOT NULL) OR
      (artifact.project_id IS NOT NULL AND object.project_id IS NOT NULL
       AND object.project_id <> artifact.project_id)
    UNION ALL
    SELECT revision.id, revision.iteration_id
    FROM artifact_revisions revision
    JOIN artifacts artifact ON artifact.id = revision.artifact_id
    LEFT JOIN project_iterations iteration ON iteration.id = revision.iteration_id
    LEFT JOIN projects project ON project.id = iteration.project_id
    WHERE revision.iteration_id IS NOT NULL AND (
      iteration.id IS NULL OR project.workspace_id <> artifact.workspace_id OR
      (artifact.project_id IS NOT NULL AND iteration.project_id <> artifact.project_id))`));

  inspectEvaluations(db, report);
  inspectRuns(db, report);
}

function inspectEvaluations(db: Database, report: DomainVerificationReport): void {
  const target = report.brokenRevisionChains;
  appendRevisionChain(target, "evaluation", "missing-target", chainRows(db, `
    SELECT evaluation.id AS entityId, NULL AS relatedId
    FROM evaluations evaluation
    WHERE evaluation.artifact_revision_id IS NULL
      AND evaluation.composition_revision_id IS NULL
      AND evaluation.build_id IS NULL AND evaluation.run_id IS NULL`));
  appendRevisionChain(target, "evaluation", "missing-target", chainRows(db, `
    SELECT evaluation.id, evaluation.artifact_revision_id
    FROM evaluations evaluation LEFT JOIN artifact_revisions revision
      ON revision.id = evaluation.artifact_revision_id
    WHERE evaluation.artifact_revision_id IS NOT NULL AND revision.id IS NULL
    UNION ALL SELECT evaluation.id, evaluation.composition_revision_id
    FROM evaluations evaluation LEFT JOIN composition_revisions revision
      ON revision.id = evaluation.composition_revision_id
    WHERE evaluation.composition_revision_id IS NOT NULL AND revision.id IS NULL
    UNION ALL SELECT evaluation.id, evaluation.build_id
    FROM evaluations evaluation LEFT JOIN builds build ON build.id = evaluation.build_id
    WHERE evaluation.build_id IS NOT NULL AND build.id IS NULL
    UNION ALL SELECT evaluation.id, evaluation.run_id
    FROM evaluations evaluation LEFT JOIN runs run ON run.id = evaluation.run_id
    WHERE evaluation.run_id IS NOT NULL AND run.id IS NULL`));
  appendRevisionChain(target, "evaluation", "scope-mismatch", chainRows(db, `
    SELECT evaluation.id AS entityId, evaluation.artifact_revision_id AS relatedId
    FROM evaluations evaluation
    JOIN artifact_revisions revision ON revision.id = evaluation.artifact_revision_id
    JOIN artifacts artifact ON artifact.id = revision.artifact_id
    JOIN projects project ON project.id = evaluation.project_id
    WHERE artifact.workspace_id <> project.workspace_id
       OR artifact.project_id IS NOT evaluation.project_id
    UNION ALL SELECT evaluation.id, evaluation.composition_revision_id
    FROM evaluations evaluation
    JOIN composition_revisions revision ON revision.id = evaluation.composition_revision_id
    JOIN compositions composition ON composition.id = revision.composition_id
    WHERE composition.project_id <> evaluation.project_id
    UNION ALL SELECT evaluation.id, evaluation.build_id
    FROM evaluations evaluation JOIN builds build ON build.id = evaluation.build_id
    JOIN composition_revisions revision ON revision.id = build.composition_revision_id
    JOIN compositions composition ON composition.id = revision.composition_id
    WHERE composition.project_id <> evaluation.project_id
    UNION ALL SELECT evaluation.id, evaluation.run_id
    FROM evaluations evaluation JOIN runs run ON run.id = evaluation.run_id
    WHERE run.project_id IS NOT evaluation.project_id`));
}

function inspectRuns(db: Database, report: DomainVerificationReport): void {
  const target = report.brokenRevisionChains;
  appendRevisionChain(target, "run", "scope-mismatch", chainRows(db, `
    SELECT run.id AS entityId, run.project_id AS relatedId
    FROM runs run LEFT JOIN projects project ON project.id = run.project_id
    WHERE run.project_id IS NOT NULL
      AND (project.id IS NULL OR run.workspace_id IS NULL
           OR project.workspace_id <> run.workspace_id)`));
  appendRevisionChain(target, "run", "run-lifecycle-mismatch", chainRows(db, `
    SELECT run.id AS entityId, NULL AS relatedId FROM runs run
    WHERE run.state NOT IN ('pending','running','succeeded','failed','cancelled')
       OR run.ended_at IS NOT NULL AND run.ended_at < run.created_at
       OR run.started_at IS NOT NULL AND run.started_at < run.created_at
       OR run.started_at IS NOT NULL AND run.ended_at IS NOT NULL
          AND run.ended_at < run.started_at
       OR run.state = 'pending' AND (run.started_at IS NOT NULL OR run.ended_at IS NOT NULL)
       OR run.state = 'running' AND (run.started_at IS NULL OR run.ended_at IS NOT NULL)
       OR run.state IN ('succeeded', 'failed', 'cancelled') AND run.ended_at IS NULL
       OR run.state = 'succeeded' AND run.error IS NOT NULL
       OR run.state IN ('pending', 'running') AND run.error IS NOT NULL`));
  appendRevisionChain(target, "run-attempt", "revision-number-mismatch", chainRows(db, `
    SELECT attempt.id AS entityId, attempt.run_id AS relatedId
    FROM run_attempts attempt
    WHERE attempt.attempt_no <> (
      SELECT COUNT(*) FROM run_attempts prior
      WHERE prior.run_id = attempt.run_id AND prior.attempt_no <= attempt.attempt_no)`));
  appendRevisionChain(target, "run-attempt", "run-lifecycle-mismatch", chainRows(db, `
    SELECT attempt.id AS entityId, attempt.run_id AS relatedId
    FROM run_attempts attempt JOIN runs run ON run.id = attempt.run_id
    WHERE attempt.state NOT IN ('running','succeeded','failed','cancelled')
       OR attempt.started_at < run.created_at
       OR attempt.ended_at IS NOT NULL AND attempt.ended_at < attempt.started_at
       OR attempt.state = 'running' AND attempt.ended_at IS NOT NULL
       OR attempt.state <> 'running' AND attempt.ended_at IS NULL
       OR run.state IN ('pending', 'succeeded', 'failed', 'cancelled')
          AND attempt.state = 'running'`));
  appendRevisionChain(target, "run-result", "run-result-mismatch", chainRows(db, `
    SELECT result.id AS entityId, result.entity_id AS relatedId
    FROM run_results result JOIN runs run ON run.id = result.run_id
    WHERE result.created_at < run.created_at
       OR run.ended_at IS NOT NULL AND result.created_at > run.ended_at
       OR result.position <> (
      SELECT COUNT(*) - 1 FROM run_results prior
      WHERE prior.run_id = result.run_id AND prior.position <= result.position)
       OR NOT (
         (result.entity_type = 'document_revision' AND EXISTS (
           SELECT 1 FROM document_revisions revision JOIN documents document
             ON document.id = revision.document_id
           WHERE revision.id = result.entity_id
             AND document.workspace_id IS run.workspace_id
             AND document.project_id IS run.project_id))
         OR (result.entity_type = 'artifact_revision' AND EXISTS (
           SELECT 1 FROM artifact_revisions revision JOIN artifacts artifact
             ON artifact.id = revision.artifact_id
           WHERE revision.id = result.entity_id
             AND artifact.workspace_id IS run.workspace_id
             AND artifact.project_id IS run.project_id))
         OR (result.entity_type = 'composition_revision' AND EXISTS (
           SELECT 1 FROM composition_revisions revision
           JOIN compositions composition ON composition.id = revision.composition_id
           JOIN projects project ON project.id = composition.project_id
           WHERE revision.id = result.entity_id AND revision.state = 'sealed'
             AND project.workspace_id IS run.workspace_id
             AND project.id IS run.project_id))
         OR (result.entity_type = 'build' AND EXISTS (
           SELECT 1 FROM builds build JOIN composition_revisions revision
             ON revision.id = build.composition_revision_id
           JOIN compositions composition ON composition.id = revision.composition_id
           JOIN projects project ON project.id = composition.project_id
           WHERE build.id = result.entity_id
             AND build.state IN ('succeeded','failed','cancelled')
             AND project.workspace_id IS run.workspace_id AND project.id IS run.project_id))
         OR (result.entity_type = 'build_output' AND EXISTS (
           SELECT 1 FROM build_outputs output JOIN builds build ON build.id = output.build_id
           JOIN composition_revisions revision ON revision.id = build.composition_revision_id
           JOIN compositions composition ON composition.id = revision.composition_id
           JOIN projects project ON project.id = composition.project_id
           WHERE output.id = result.entity_id AND build.state = 'succeeded'
             AND project.workspace_id IS run.workspace_id AND project.id IS run.project_id))
         OR (result.entity_type IN ('unit_revision','unit_item','unit_presentation','publication','metric_snapshot')
             AND EXISTS (
           SELECT 1 FROM units unit
           WHERE unit.workspace_id IS run.workspace_id AND unit.project_id IS run.project_id
             AND ((result.entity_type = 'unit_revision' AND EXISTS (
                    SELECT 1 FROM unit_revisions revision WHERE revision.id = result.entity_id
                      AND revision.unit_id = unit.id AND revision.sealed_at IS NOT NULL))
               OR (result.entity_type = 'unit_item' AND EXISTS (
                    SELECT 1 FROM unit_items item JOIN unit_revisions revision
                      ON revision.id = item.unit_revision_id
                    WHERE item.id = result.entity_id AND revision.unit_id = unit.id
                      AND revision.sealed_at IS NOT NULL))
               OR (result.entity_type = 'unit_presentation' AND EXISTS (
                    SELECT 1 FROM unit_presentations presentation JOIN unit_revisions revision
                      ON revision.id = presentation.unit_revision_id
                    WHERE presentation.id = result.entity_id AND revision.unit_id = unit.id
                      AND revision.sealed_at IS NOT NULL))
               OR (result.entity_type = 'publication' AND EXISTS (
                    SELECT 1 FROM publications publication
                    JOIN unit_presentations presentation ON presentation.id = publication.presentation_id
                    JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
                    WHERE publication.id = result.entity_id AND revision.unit_id = unit.id))
               OR (result.entity_type = 'metric_snapshot' AND EXISTS (
                    SELECT 1 FROM metric_snapshots metric JOIN publications publication
                      ON publication.id = metric.publication_id
                    JOIN unit_presentations presentation ON presentation.id = publication.presentation_id
                    JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
                    WHERE metric.id = result.entity_id AND revision.unit_id = unit.id)))))
       )`));
}

function inspectBuildChains(
  db: Database,
  report: DomainVerificationReport,
): void {
  const target = report.brokenBuildChains;
  appendBuildChain(target, "composition", "foreign-pointer", chainRows(db, `
    SELECT composition.id AS entityId, composition.selected_revision_id AS relatedId
    FROM compositions composition
    WHERE composition.selected_revision_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM composition_revisions revision
                      WHERE revision.id = composition.selected_revision_id
                        AND revision.composition_id = composition.id)`));
  appendBuildChain(target, "composition", "selected-unsealed", chainRows(db, `
    SELECT composition.id AS entityId, composition.selected_revision_id AS relatedId
    FROM compositions composition JOIN composition_revisions revision
      ON revision.id = composition.selected_revision_id
     AND revision.composition_id = composition.id
    WHERE revision.state <> 'sealed'`));
  appendBuildChain(target, "composition-revision", "revision-number-mismatch", chainRows(db, `
    SELECT revision.id AS entityId, NULL AS relatedId
    FROM composition_revisions revision
    WHERE revision.revision_no <> (
      SELECT COUNT(*) FROM composition_revisions prior
      WHERE prior.composition_id = revision.composition_id
        AND prior.revision_no <= revision.revision_no)`));
  appendBuildChain(target, "composition-revision", "parent-mismatch", chainRows(db, `
    SELECT revision.id AS entityId, revision.parent_revision_id AS relatedId
    FROM composition_revisions revision LEFT JOIN composition_revisions parent
      ON parent.id = revision.parent_revision_id
    WHERE (revision.revision_no = 1 AND revision.parent_revision_id IS NOT NULL)
       OR (revision.revision_no > 1 AND (parent.id IS NULL
           OR parent.composition_id <> revision.composition_id
           OR parent.revision_no >= revision.revision_no))`));
  appendBuildChain(target, "composition-revision", "scope-mismatch", chainRows(db, `
    SELECT revision.id AS entityId, revision.iteration_id AS relatedId
    FROM composition_revisions revision
    JOIN compositions composition ON composition.id = revision.composition_id
    LEFT JOIN project_iterations iteration ON iteration.id = revision.iteration_id
    WHERE revision.iteration_id IS NOT NULL
      AND (iteration.id IS NULL OR iteration.project_id <> composition.project_id)`));
  appendBuildChain(target, "composition-file", "position-gap", chainRows(db, `
    SELECT file.composition_revision_id AS entityId, NULL AS relatedId
    FROM composition_revision_files file GROUP BY file.composition_revision_id
    HAVING MIN(file.position) <> 0 OR MAX(file.position) <> COUNT(*) - 1`));
  appendBuildChain(target, "composition-input", "position-gap", chainRows(db, `
    SELECT input.composition_revision_id AS entityId, NULL AS relatedId
    FROM composition_inputs input GROUP BY input.composition_revision_id
    HAVING MIN(input.position) <> 0 OR MAX(input.position) <> COUNT(*) - 1`));
  appendBuildChain(target, "composition-file", "scope-mismatch", chainRows(db, `
    SELECT file.id AS entityId, file.object_id AS relatedId
    FROM composition_revision_files file
    JOIN composition_revisions revision ON revision.id = file.composition_revision_id
    JOIN compositions composition ON composition.id = revision.composition_id
    JOIN projects project ON project.id = composition.project_id
    LEFT JOIN objects object ON object.id = file.object_id
    WHERE object.id IS NULL OR object.workspace_id <> project.workspace_id OR
      (object.project_id IS NOT NULL AND object.project_id <> project.id)`));
  appendBuildChain(target, "composition-input", "scope-mismatch", chainRows(db, `
    SELECT input.id AS entityId, input.artifact_revision_id AS relatedId
    FROM composition_inputs input
    JOIN composition_revisions revision ON revision.id = input.composition_revision_id
    JOIN compositions composition ON composition.id = revision.composition_id
    JOIN projects project ON project.id = composition.project_id
    LEFT JOIN artifact_revisions artifact_revision
      ON artifact_revision.id = input.artifact_revision_id
    LEFT JOIN artifacts artifact ON artifact.id = artifact_revision.artifact_id
    WHERE artifact.id IS NULL OR artifact.workspace_id <> project.workspace_id OR
      (artifact.project_id IS NOT NULL AND artifact.project_id <> project.id)`));
  appendBuildChain(target, "composition-revision", "unsealed-input", chainRows(db, `
    SELECT revision.id AS entityId, NULL AS relatedId
    FROM composition_revisions revision
    WHERE revision.state = 'sealed'
      AND NOT EXISTS (SELECT 1 FROM composition_revision_files file
                      WHERE file.composition_revision_id = revision.id)
      AND NOT EXISTS (SELECT 1 FROM composition_inputs input
                      WHERE input.composition_revision_id = revision.id)`));

  appendBuildChain(target, "build", "unsealed-input", chainRows(db, `
    SELECT build.id AS entityId, build.composition_revision_id AS relatedId
    FROM builds build LEFT JOIN composition_revisions revision
      ON revision.id = build.composition_revision_id
    WHERE revision.id IS NULL OR revision.state <> 'sealed'`));
  appendBuildChain(target, "build", "scope-mismatch", chainRows(db, `
    SELECT build.id AS entityId, build.run_id AS relatedId
    FROM builds build JOIN composition_revisions revision
      ON revision.id = build.composition_revision_id
    JOIN compositions composition ON composition.id = revision.composition_id
    JOIN projects project ON project.id = composition.project_id
    LEFT JOIN runs run ON run.id = build.run_id
    WHERE build.run_id IS NOT NULL
      AND (run.id IS NULL OR run.workspace_id IS NOT project.workspace_id
           OR run.project_id IS NOT project.id)`));
  appendBuildChain(target, "build", "build-lifecycle-mismatch", chainRows(db, `
    SELECT build.id AS entityId, NULL AS relatedId FROM builds build
    WHERE build.state NOT IN ('pending','running','succeeded','failed','cancelled')
       OR build.started_at IS NOT NULL AND build.started_at < build.created_at
       OR build.ended_at IS NOT NULL AND build.ended_at < build.created_at
       OR build.started_at IS NOT NULL AND build.ended_at IS NOT NULL
          AND build.ended_at < build.started_at
       OR build.state = 'pending' AND (build.started_at IS NOT NULL OR build.ended_at IS NOT NULL)
       OR build.state = 'running' AND (build.started_at IS NULL OR build.ended_at IS NOT NULL)
       OR build.state IN ('succeeded','failed','cancelled') AND build.ended_at IS NULL
       OR build.state = 'succeeded' AND build.error IS NOT NULL
       OR build.state IN ('pending','running') AND build.error IS NOT NULL`));
  appendBuildChain(target, "build", "missing-output", chainRows(db, `
    SELECT build.id AS entityId, NULL AS relatedId FROM builds build
    WHERE build.state = 'succeeded'
      AND NOT EXISTS (SELECT 1 FROM build_outputs output WHERE output.build_id = build.id)`));
  appendBuildChain(target, "build-output", "position-gap", chainRows(db, `
    SELECT output.build_id AS entityId, NULL AS relatedId
    FROM build_outputs output GROUP BY output.build_id
    HAVING MIN(output.position) <> 0 OR MAX(output.position) <> COUNT(*) - 1`));
  appendBuildChain(target, "build-output", "scope-mismatch", chainRows(db, `
    SELECT output.id AS entityId, output.artifact_revision_id AS relatedId
    FROM build_outputs output JOIN builds build ON build.id = output.build_id
    JOIN composition_revisions revision ON revision.id = build.composition_revision_id
    JOIN compositions composition ON composition.id = revision.composition_id
    JOIN projects project ON project.id = composition.project_id
    LEFT JOIN artifact_revisions artifact_revision
      ON artifact_revision.id = output.artifact_revision_id
    LEFT JOIN artifacts artifact ON artifact.id = artifact_revision.artifact_id
    WHERE artifact.id IS NULL OR artifact.workspace_id <> project.workspace_id
       OR artifact.project_id IS NOT project.id`));
  appendBuildChain(target, "build-binding", "binding-mismatch", chainRows(db, `
    SELECT binding.id AS entityId, binding.document_revision_id AS relatedId
    FROM build_document_bindings binding
    JOIN builds build ON build.id = binding.build_id
    JOIN composition_revisions revision ON revision.id = build.composition_revision_id
    JOIN compositions composition ON composition.id = revision.composition_id
    JOIN projects project ON project.id = composition.project_id
    LEFT JOIN document_revisions document_revision
      ON document_revision.id = binding.document_revision_id
    LEFT JOIN documents document ON document.id = document_revision.document_id
    WHERE document.id IS NULL OR document.workspace_id <> project.workspace_id OR
      (document.project_id IS NOT NULL AND document.project_id <> project.id)`));
}

function inspectUnitChains(db: Database, report: DomainVerificationReport): void {
  const target = report.brokenUnitChains;
  appendUnitChain(target, "unit", "scope-mismatch", chainRows(db, `
    SELECT unit.id AS entityId, unit.project_id AS relatedId
    FROM units unit LEFT JOIN projects project ON project.id = unit.project_id
    WHERE unit.project_id IS NOT NULL
      AND (project.id IS NULL OR project.workspace_id <> unit.workspace_id)`));
  appendUnitChain(target, "unit", "missing-pointer", chainRows(db, `
    SELECT unit.id AS entityId, NULL AS relatedId FROM units unit
    WHERE unit.latest_revision_id IS NULL
      AND EXISTS (SELECT 1 FROM unit_revisions revision WHERE revision.unit_id = unit.id)`));
  appendUnitChain(target, "unit", "foreign-pointer", chainRows(db, `
    SELECT unit.id AS entityId, unit.latest_revision_id AS relatedId FROM units unit
    WHERE unit.latest_revision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM unit_revisions revision WHERE revision.id = unit.latest_revision_id
        AND revision.unit_id = unit.id AND revision.sealed_at IS NOT NULL)
    UNION ALL
    SELECT unit.id, unit.selected_revision_id FROM units unit
    WHERE unit.selected_revision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM unit_revisions revision WHERE revision.id = unit.selected_revision_id
        AND revision.unit_id = unit.id)`));
  appendUnitChain(target, "unit", "selected-unsealed", chainRows(db, `
    SELECT unit.id AS entityId, unit.selected_revision_id AS relatedId
    FROM units unit JOIN unit_revisions revision
      ON revision.id = unit.selected_revision_id AND revision.unit_id = unit.id
    WHERE revision.sealed_at IS NULL`));
  appendUnitChain(target, "unit", "latest-not-greatest", chainRows(db, `
    SELECT unit.id AS entityId, unit.latest_revision_id AS relatedId
    FROM units unit JOIN unit_revisions latest
      ON latest.id = unit.latest_revision_id AND latest.unit_id = unit.id
    WHERE latest.sealed_at IS NOT NULL AND latest.revision_no <> (
      SELECT MAX(revision_no) FROM unit_revisions revision
      WHERE revision.unit_id = unit.id AND revision.sealed_at IS NOT NULL)`));
  appendUnitChain(target, "unit-revision", "revision-number-mismatch", chainRows(db, `
    SELECT revision.id AS entityId, NULL AS relatedId FROM unit_revisions revision
    WHERE revision.revision_no <> (
      SELECT COUNT(*) FROM unit_revisions prior WHERE prior.unit_id = revision.unit_id
        AND prior.revision_no <= revision.revision_no)`));
  appendUnitChain(target, "unit-revision", "parent-mismatch", chainRows(db, `
    SELECT revision.id AS entityId, revision.parent_revision_id AS relatedId
    FROM unit_revisions revision LEFT JOIN unit_revisions parent
      ON parent.id = revision.parent_revision_id
    WHERE (revision.revision_no = 1 AND revision.parent_revision_id IS NOT NULL)
       OR (revision.revision_no > 1 AND (parent.id IS NULL
          OR parent.unit_id <> revision.unit_id OR parent.sealed_at IS NULL
          OR parent.revision_no >= revision.revision_no))`));
  appendUnitChain(target, "unit-revision", "scope-mismatch", chainRows(db, `
    SELECT revision.id AS entityId, revision.iteration_id AS relatedId
    FROM unit_revisions revision JOIN units unit ON unit.id = revision.unit_id
    LEFT JOIN project_iterations iteration ON iteration.id = revision.iteration_id
    LEFT JOIN projects project ON project.id = iteration.project_id
    WHERE revision.iteration_id IS NOT NULL AND (
      iteration.id IS NULL OR project.workspace_id <> unit.workspace_id OR
      (unit.project_id IS NOT NULL AND iteration.project_id <> unit.project_id))`));
  appendUnitChain(target, "unit-revision", "unsealed-graph", chainRows(db, `
    SELECT revision.id AS entityId, NULL AS relatedId FROM unit_revisions revision
    WHERE revision.sealed_at IS NULL OR NOT EXISTS (
      SELECT 1 FROM unit_items item WHERE item.unit_revision_id = revision.id)`));
  appendUnitChain(target, "unit-item", "position-gap", chainRows(db, `
    SELECT item.unit_revision_id AS entityId, NULL AS relatedId
    FROM unit_items item GROUP BY item.unit_revision_id
    HAVING MIN(item.position) <> 0 OR MAX(item.position) <> COUNT(*) - 1`));
  appendUnitChain(target, "presentation", "position-gap", chainRows(db, `
    SELECT presentation.unit_revision_id AS entityId, NULL AS relatedId
    FROM unit_presentations presentation GROUP BY presentation.unit_revision_id
    HAVING MIN(presentation.position) <> 0 OR MAX(presentation.position) <> COUNT(*) - 1`));
  appendUnitChain(target, "unit-item", "scope-mismatch", chainRows(db, `
    SELECT item.id AS entityId,
           COALESCE(item.artifact_revision_id, item.document_revision_id) AS relatedId
    FROM unit_items item JOIN unit_revisions revision ON revision.id = item.unit_revision_id
    JOIN units unit ON unit.id = revision.unit_id
    LEFT JOIN artifact_revisions artifact_revision
      ON artifact_revision.id = item.artifact_revision_id
    LEFT JOIN artifacts artifact ON artifact.id = artifact_revision.artifact_id
    LEFT JOIN document_revisions document_revision
      ON document_revision.id = item.document_revision_id
    LEFT JOIN documents document ON document.id = document_revision.document_id
    WHERE (item.artifact_revision_id IS NOT NULL AND (artifact.id IS NULL
      OR artifact.workspace_id <> unit.workspace_id
      OR (unit.project_id IS NULL AND artifact.project_id IS NOT NULL)
      OR (unit.project_id IS NOT NULL AND artifact.project_id IS NOT NULL
          AND artifact.project_id <> unit.project_id)))
       OR (item.document_revision_id IS NOT NULL AND (document.id IS NULL
      OR document.workspace_id <> unit.workspace_id
      OR (unit.project_id IS NULL AND document.project_id IS NOT NULL)
      OR (unit.project_id IS NOT NULL AND document.project_id IS NOT NULL
          AND document.project_id <> unit.project_id)))`));
  appendUnitChain(target, "presentation", "presentation-mismatch", chainRows(db, `
    SELECT presentation.id AS entityId,
           COALESCE(presentation.effective_caption_revision_id,
                    presentation.cover_artifact_revision_id) AS relatedId
    FROM unit_presentations presentation
    WHERE (presentation.effective_caption_revision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM presentation_caption_revisions caption
      WHERE caption.id = presentation.effective_caption_revision_id
        AND caption.presentation_id = presentation.id))
       OR (presentation.cover_artifact_revision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM unit_items item
      WHERE item.unit_revision_id = presentation.unit_revision_id
        AND item.artifact_revision_id = presentation.cover_artifact_revision_id))
       OR EXISTS (
      SELECT 1 FROM presentation_items presentation_item
      LEFT JOIN unit_items item ON item.id = presentation_item.unit_item_id
      WHERE presentation_item.presentation_id = presentation.id
        AND (item.id IS NULL OR item.unit_revision_id <> presentation.unit_revision_id))`));
  appendUnitChain(target, "presentation", "position-gap", chainRows(db, `
    SELECT item.presentation_id AS entityId, NULL AS relatedId
    FROM presentation_items item GROUP BY item.presentation_id
    HAVING MIN(item.position) <> 0 OR MAX(item.position) <> COUNT(*) - 1`));
  appendUnitChain(target, "caption-revision", "revision-number-mismatch", chainRows(db, `
    SELECT caption.id AS entityId, caption.presentation_id AS relatedId
    FROM presentation_caption_revisions caption
    WHERE caption.revision_no <> (
      SELECT COUNT(*) FROM presentation_caption_revisions prior
      WHERE prior.presentation_id = caption.presentation_id
        AND prior.revision_no <= caption.revision_no)`));
  appendUnitChain(target, "caption-revision", "parent-mismatch", chainRows(db, `
    SELECT caption.id AS entityId, caption.parent_revision_id AS relatedId
    FROM presentation_caption_revisions caption
    LEFT JOIN presentation_caption_revisions parent
      ON parent.presentation_id = caption.presentation_id
     AND parent.revision_no = caption.revision_no - 1
    WHERE (caption.revision_no = 1 AND caption.parent_revision_id IS NOT NULL)
       OR (caption.revision_no > 1 AND parent.id IS NOT caption.parent_revision_id)`));
  inspectPublications(db, report);
}

function inspectPublications(
  db: Database,
  report: DomainVerificationReport,
): void {
  const target = report.brokenUnitChains;
  appendUnitChain(target, "publication", "presentation-mismatch", chainRows(db, `
    SELECT publication.id AS entityId, publication.presentation_id AS relatedId
    FROM publications publication
    LEFT JOIN unit_presentations presentation ON presentation.id = publication.presentation_id
    LEFT JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
    WHERE presentation.id IS NULL OR revision.sealed_at IS NULL
       OR publication.effective_caption_revision_id IS NOT presentation.effective_caption_revision_id
       OR publication.effective_options_json IS NOT presentation.options_json`));
  appendUnitChain(target, "publication", "scope-mismatch", chainRows(db, `
    SELECT publication.id AS entityId,
           COALESCE(publication.social_account_id, publication.submission_run_id) AS relatedId
    FROM publications publication
    JOIN unit_presentations presentation ON presentation.id = publication.presentation_id
    JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
    JOIN units unit ON unit.id = revision.unit_id
    LEFT JOIN runs run ON run.id = publication.submission_run_id
    LEFT JOIN social_accounts account ON account.id = publication.social_account_id
    WHERE run.id IS NULL OR run.workspace_id IS NOT unit.workspace_id
       OR run.project_id IS NOT unit.project_id
       OR (publication.rail IN ('github-pages','manual')
           AND publication.social_account_id IS NOT NULL)
       OR (publication.rail IN ('postiz','devto','hashnode')
           AND NOT (publication.state = 'failed'
                    AND publication.social_account_id IS NULL
                    AND publication.failure_stage IN ('account-resolution','preflight')
                    AND publication.error IS NOT NULL)
           AND (account.id IS NULL OR account.workspace_id <> unit.workspace_id
                OR account.platform <> presentation.platform))`));
  inspectPublicationAncestry(db, report);
  appendUnitChain(target, "publication", "publication-lifecycle-mismatch", chainRows(db, `
    SELECT publication.id AS entityId, NULL AS relatedId
    FROM publications publication
    LEFT JOIN runs submission ON submission.id = publication.submission_run_id
    WHERE publication.state NOT IN (
            'draft','submitting','scheduled','submitted','published','failed',
            'cancelled','reconciliation_required','unknown')
       OR publication.submitted_at IS NOT NULL AND publication.submitted_at < publication.created_at
       OR publication.published_at IS NOT NULL AND publication.published_at < publication.created_at
       OR publication.scheduled_at IS NOT NULL AND publication.scheduled_at < publication.created_at
       OR publication.published_at IS NOT NULL AND publication.submitted_at IS NOT NULL
          AND publication.published_at < publication.submitted_at
       OR publication.published_at IS NOT NULL AND publication.scheduled_at IS NOT NULL
          AND publication.published_at < publication.scheduled_at
       OR publication.state = 'submitted' AND publication.submitted_at IS NULL
       OR publication.state = 'published' AND publication.published_at IS NULL
       OR publication.state IN ('draft','submitting')
          AND (publication.submitted_at IS NOT NULL OR publication.published_at IS NOT NULL)
       OR publication.state = 'scheduled' AND publication.published_at IS NOT NULL
       OR publication.state IN ('submitted','published')
          AND publication.rail IN ('postiz','devto','hashnode')
          AND publication.provider_publication_id IS NULL
       OR publication.state = 'draft' AND (submission.state <> 'pending'
          OR EXISTS (SELECT 1 FROM run_attempts attempt
                     WHERE attempt.run_id = submission.id)
          OR EXISTS (SELECT 1 FROM run_results result
                     WHERE result.run_id = submission.id))
       OR publication.state = 'submitting' AND (
          publication.active_claim_run_id IS NOT publication.submission_run_id
          OR submission.state <> 'running')
       OR publication.state = 'failed'
          AND publication.social_account_id IS NULL
          AND publication.failure_stage IN ('account-resolution','preflight')
          AND (publication.provider_publication_id IS NOT NULL
               OR publication.url IS NOT NULL
               OR publication.submitted_at IS NOT NULL
               OR publication.published_at IS NOT NULL
               OR publication.error IS NULL OR trim(publication.error) = ''
               OR EXISTS (SELECT 1 FROM run_attempts attempt
                          WHERE attempt.run_id = submission.id))
       OR publication.state NOT IN ('draft','submitting')
          AND submission.state NOT IN ('succeeded','failed','cancelled')`));
  inspectPublicationFields(db, report);
  appendUnitChain(target, "publication", "claim-fence-mismatch", chainRows(db, `
    SELECT publication.id AS entityId, publication.active_claim_run_id AS relatedId
    FROM publications publication LEFT JOIN runs run ON run.id = publication.active_claim_run_id
    WHERE (publication.claim_kind IS NULL) <> (publication.active_claim_run_id IS NULL)
       OR (publication.claim_kind IS NULL) <> (publication.claim_token IS NULL)
       OR (publication.claim_kind IS NULL) <> (publication.claim_expires_at IS NULL)
       OR publication.claim_kind IS NOT NULL AND (
          publication.claim_epoch < 1 OR publication.claim_expires_at <= publication.updated_at
          OR run.id IS NULL OR run.state <> 'running'
          OR publication.claim_kind NOT IN (
               'submission','reconciliation','status-lookup','cancellation')
          OR NOT EXISTS (
            SELECT 1 FROM unit_presentations presentation
            JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
            JOIN units unit ON unit.id = revision.unit_id
            WHERE presentation.id = publication.presentation_id
              AND run.workspace_id IS unit.workspace_id
              AND run.project_id IS unit.project_id)
          OR (SELECT COUNT(*) FROM run_attempts attempt
              WHERE attempt.run_id = run.id AND attempt.state = 'running') <> 1
          OR (SELECT COUNT(*) FROM run_attempts attempt
              WHERE attempt.run_id = run.id) <> 1
          OR EXISTS (SELECT 1 FROM run_attempts attempt
                     WHERE attempt.run_id = run.id AND attempt.state = 'running'
                       AND attempt.provider IS NOT publication.rail)
          OR EXISTS (SELECT 1 FROM run_results result WHERE result.run_id = run.id)
          OR (SELECT COUNT(*) FROM publications claimed
              WHERE claimed.active_claim_run_id = run.id) <> 1
          OR (publication.claim_kind = 'submission'
              AND (publication.active_claim_run_id <> publication.submission_run_id
                   OR publication.state <> 'submitting'))
          OR (publication.claim_kind = 'reconciliation'
              AND publication.state <> 'reconciliation_required')
          OR (publication.claim_kind IN ('status-lookup','cancellation')
              AND publication.state NOT IN ('scheduled','submitted'))
          OR (publication.claim_kind <> 'submission'
              AND (publication.active_claim_run_id = publication.submission_run_id
                   OR EXISTS (SELECT 1 FROM publications reserved
                              WHERE reserved.submission_run_id = run.id))))`));
  appendUnitChain(target, "publication", "run-result-mismatch", chainRows(db, `
    SELECT publication.id AS entityId, publication.submission_run_id AS relatedId
    FROM publications publication
    WHERE publication.state NOT IN ('draft','submitting') AND (
      (SELECT COUNT(*) FROM run_results result
       WHERE result.run_id = publication.submission_run_id) <> 1
      OR (SELECT COUNT(*) FROM run_results result
          WHERE result.run_id = publication.submission_run_id
            AND result.entity_type = 'publication'
            AND result.entity_id = publication.id) <> 1)`));
  appendUnitChain(target, "publication", "publication-lifecycle-mismatch", chainRows(db, `
    SELECT publication.id AS entityId, result.run_id AS relatedId
    FROM run_results result
    JOIN publications publication
      ON result.entity_type = 'publication' AND result.entity_id = publication.id
    JOIN runs run ON run.id = result.run_id
    WHERE result.run_id <> publication.submission_run_id
      AND result.run_id IS NOT publication.active_claim_run_id
      AND run.state NOT IN ('succeeded','failed','cancelled')`));
  appendUnitChain(target, "metric-snapshot", "metric-window-mismatch", chainRows(db, `
    SELECT metric.id AS entityId, metric.publication_id AS relatedId
    FROM metric_snapshots metric
    WHERE (metric.window_start IS NULL) <> (metric.window_end IS NULL)
       OR metric.window_start IS NOT NULL AND metric.window_end < metric.window_start`));
  appendUnitChain(target, "metric-snapshot", "run-result-mismatch", chainRows(db, `
    SELECT metric.id AS entityId, metric.publication_id AS relatedId
    FROM metric_snapshots metric
    WHERE NOT EXISTS (SELECT 1 FROM run_results result
                      WHERE result.entity_type = 'metric_snapshot'
                        AND result.entity_id = metric.id)`));
}

type PublicationAncestryRow = {
  id: string;
  revisedFromId: string | null;
  workspaceId: string | null;
  createdAt: number;
};

function inspectPublicationAncestry(
  db: Database,
  report: DomainVerificationReport,
): void {
  const rows = db.query<PublicationAncestryRow, []>(`
    SELECT publication.id, publication.revised_from_publication_id AS revisedFromId,
           unit.workspace_id AS workspaceId, publication.created_at AS createdAt
    FROM publications publication
    LEFT JOIN unit_presentations presentation ON presentation.id = publication.presentation_id
    LEFT JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
    LEFT JOIN units unit ON unit.id = revision.unit_id`).all();
  const byId = new Map(rows.map((row) => [row.id, row] as const));
  for (const row of rows) {
    if (row.revisedFromId === null) continue;
    const previous = byId.get(row.revisedFromId);
    if (!previous || previous.workspaceId !== row.workspaceId) {
      report.brokenUnitChains.push({
        entityType: "publication",
        entityId: row.id,
        reason: "scope-mismatch",
        relatedId: row.revisedFromId,
      });
      continue;
    }
    if (previous.id === row.id || previous.createdAt > row.createdAt) {
      report.brokenUnitChains.push({
        entityType: "publication",
        entityId: row.id,
        reason: "publication-lifecycle-mismatch",
        relatedId: row.revisedFromId,
      });
    }
    const seen = new Set([row.id]);
    let ancestor: PublicationAncestryRow | undefined = previous;
    while (ancestor) {
      if (seen.has(ancestor.id)) {
        report.brokenUnitChains.push({
          entityType: "publication",
          entityId: row.id,
          reason: "publication-lifecycle-mismatch",
          relatedId: row.revisedFromId,
        });
        break;
      }
      seen.add(ancestor.id);
      ancestor = ancestor.revisedFromId === null
        ? undefined
        : byId.get(ancestor.revisedFromId);
    }
  }
}

type PublicationFieldRow = {
  id: string;
  state: string;
  socialAccountId: string | null;
  providerPublicationId: string | null;
  url: string | null;
  submittedAt: number | null;
  publishedAt: number | null;
  error: string | null;
  failureStage: string | null;
};

function inspectPublicationFields(
  db: Database,
  report: DomainVerificationReport,
): void {
  const rows = db.query<PublicationFieldRow, []>(`
    SELECT id, state, social_account_id AS socialAccountId,
           provider_publication_id AS providerPublicationId, url,
           submitted_at AS submittedAt, published_at AS publishedAt,
           error, failure_stage AS failureStage
    FROM publications`).all();
  for (const row of rows) {
    const insertOnlyFields = row.providerPublicationId !== null || row.url !== null ||
      row.submittedAt !== null || row.publishedAt !== null;
    const draftShape = row.state === "draft" && (
      insertOnlyFields || row.error !== null || row.failureStage !== null
    );
    const submittingShape = row.state === "submitting" && (
      insertOnlyFields || row.error !== null || row.failureStage !== null
    );
    const preflightFailure = row.state === "failed" &&
      (row.failureStage === "account-resolution" || row.failureStage === "preflight");
    const preflightShape = preflightFailure && (
      row.socialAccountId !== null || insertOnlyFields || row.error === null ||
      typeof row.error !== "string" || row.error.trim() === ""
    );
    const invalidProvider = row.providerPublicationId !== null &&
      !validProviderPublicationId(row.providerPublicationId);
    const invalidUrl = row.url !== null && !validPublicationUrl(row.url);
    const missingPublishedUrl = row.state === "published" && row.url === null;
    if (
      draftShape || submittingShape || preflightShape || invalidProvider ||
      invalidUrl || missingPublishedUrl
    ) {
      report.brokenUnitChains.push({
        entityType: "publication",
        entityId: row.id,
        reason: "publication-lifecycle-mismatch",
      });
    }
  }
}

function validProviderPublicationId(value: unknown): value is string {
  return typeof value === "string" && value === value.trim() &&
    Buffer.byteLength(value) <= 255 &&
    /^[\x20-\x7e]+$/.test(value);
}

function validPublicationUrl(value: unknown): value is string {
  if (
    typeof value !== "string" || value !== value.trim() ||
    value.length > 2_048 || /[\t\n\r ]/.test(value)
  ) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname.length > 0 && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function inspectSessionProvenance(
  db: Database,
  report: DomainVerificationReport,
): void {
  inspectAuthorship(db, report, {
    entityType: "document-revision",
    sql: `SELECT revision.id AS entityId, revision.authored_by_session_id AS sessionId,
                 revision.created_at AS createdAt, document.workspace_id AS workspaceId,
                 document.project_id AS projectId
          FROM document_revisions revision
          JOIN documents document ON document.id = revision.document_id
          WHERE revision.authored_by_session_id IS NOT NULL`,
  });
  inspectAuthorship(db, report, {
    entityType: "artifact-revision",
    sql: `SELECT revision.id AS entityId, revision.authored_by_session_id AS sessionId,
                 revision.created_at AS createdAt, artifact.workspace_id AS workspaceId,
                 artifact.project_id AS projectId
          FROM artifact_revisions revision
          JOIN artifacts artifact ON artifact.id = revision.artifact_id
          WHERE revision.authored_by_session_id IS NOT NULL`,
  });
  inspectAuthorship(db, report, {
    entityType: "composition-revision",
    sql: `SELECT revision.id AS entityId, revision.authored_by_session_id AS sessionId,
                 revision.created_at AS createdAt, project.workspace_id AS workspaceId,
                 project.id AS projectId
          FROM composition_revisions revision
          JOIN compositions composition ON composition.id = revision.composition_id
          JOIN projects project ON project.id = composition.project_id
          WHERE revision.authored_by_session_id IS NOT NULL`,
  });
  inspectAuthorship(db, report, {
    entityType: "unit-revision",
    sql: `SELECT revision.id AS entityId, revision.authored_by_session_id AS sessionId,
                 revision.created_at AS createdAt, unit.workspace_id AS workspaceId,
                 unit.project_id AS projectId
          FROM unit_revisions revision JOIN units unit ON unit.id = revision.unit_id
          WHERE revision.authored_by_session_id IS NOT NULL`,
  });
  inspectAuthorship(db, report, {
    entityType: "run",
    sql: `SELECT run.id AS entityId, run.agent_session_id AS sessionId,
                 run.created_at AS createdAt, run.workspace_id AS workspaceId,
                 run.project_id AS projectId
          FROM runs run WHERE run.agent_session_id IS NOT NULL`,
  });
}

type AuthorshipRow = {
  entityId: string;
  sessionId: string;
  createdAt: number;
  workspaceId: string | null;
  projectId: string | null;
};

function inspectAuthorship<E extends ProvenanceEntity>(
  db: Database,
  report: DomainVerificationReport,
  input: { entityType: E; sql: string },
): void {
  const sessions = new Map(
    db
      .query<
        {
          id: string;
          workspaceId: string;
          projectId: string | null;
          endedAt: number | null;
        },
        []
      >(`SELECT id, workspace_id AS workspaceId, project_id AS projectId,
                 ended_at AS endedAt FROM agent_sessions`)
      .all()
      .map((session) => [session.id, session] as const),
  );
  for (const row of db.query<AuthorshipRow, []>(input.sql).all()) {
    const session = sessions.get(row.sessionId);
    const base = {
      entityType: input.entityType,
      entityId: row.entityId,
      relatedId: row.sessionId,
    };
    if (!session) {
      report.sessionProvenanceIssues.push({ ...base, reason: "missing-session" });
      continue;
    }
    if (session.endedAt !== null && row.createdAt > session.endedAt) {
      report.sessionProvenanceIssues.push({ ...base, reason: "ended-session" });
    }
    if (session.workspaceId !== row.workspaceId) {
      report.sessionProvenanceIssues.push({ ...base, reason: "workspace-mismatch" });
    }
    const projectContained = row.projectId === null
      ? session.projectId === null
      : session.projectId === null || session.projectId === row.projectId;
    if (!projectContained) {
      report.sessionProvenanceIssues.push({ ...base, reason: "project-mismatch" });
    }
  }
}

function inspectFilesystem(
  report: DomainVerificationReport,
  expectedObjectPaths: Set<string>,
): void {
  const root = path.resolve(ralphDir());
  inspectFarmRoot(root, report);
  const buckets = path.join(root, "buckets");
  walkBuckets(buckets, root, null, expectedObjectPaths, report);
}

function inspectFarmRoot(
  root: string,
  report: DomainVerificationReport,
): void {
  const farm = path.join(root, "farm");
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(farm);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    report.filesystemIssues.push({ relativePath: "farm", reason: "unreadable" });
    return;
  }
  if (stat.isSymbolicLink()) {
    report.filesystemIssues.push({ relativePath: "farm", reason: "symlink" });
  } else if (!stat.isDirectory()) {
    report.filesystemIssues.push({
      relativePath: "farm",
      reason: "unexpected-type",
    });
  }
}

function walkBuckets(
  current: string,
  root: string,
  objectsRoot: string | null,
  expected: Set<string>,
  report: DomainVerificationReport,
): void {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(current);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    if (objectsRoot !== null) {
      report.filesystemIssues.push({
        relativePath: toPosix(path.relative(root, current)),
        reason: "unreadable",
      });
    }
    return;
  }
  const relativePath = toPosix(path.relative(root, current));
  if (stat.isSymbolicLink()) {
    if (objectsRoot !== null) {
      report.filesystemIssues.push({ relativePath, reason: "symlink" });
    }
    return;
  }
  if (stat.isFile()) {
    if (objectsRoot !== null && !expected.has(relativePath)) {
      report.orphanedObjectPaths.push(relativePath);
    }
    return;
  }
  if (!stat.isDirectory()) {
    if (objectsRoot !== null) {
      report.filesystemIssues.push({
        relativePath,
        reason: "unexpected-type",
      });
    }
    return;
  }
  if (objectsRoot !== null && current !== objectsRoot) {
    report.filesystemIssues.push({ relativePath, reason: "unexpected-type" });
    return;
  }
  let names: string[];
  try {
    names = fs.readdirSync(current);
  } catch {
    if (objectsRoot !== null) {
      report.filesystemIssues.push({ relativePath, reason: "unreadable" });
    }
    return;
  }
  names.sort(compareUtf8);
  for (const name of names) {
    const child = path.join(current, name);
    walkBuckets(
      child,
      root,
      objectsRoot ?? (name === "objects" ? child : null),
      expected,
      report,
    );
  }
}

class OutsideRootError extends Error {}

function runObjectPath(locator: string): string {
  if (locator.split("/", 1)[0] === "farm") throw new Error("invalid");
  return relativeStorePath(locator);
}

function relativeStorePath(...parts: string[]): string {
  for (const value of parts) {
    const normalized = value.replaceAll("\\", "/");
    const segments = normalized.split("/");
    if (
      path.posix.isAbsolute(value) ||
      path.win32.isAbsolute(value) ||
      segments.includes("..")
    ) {
      throw new OutsideRootError();
    }
    if (
      value.length === 0 ||
      value !== normalized ||
      /^[A-Za-z]:/.test(value) ||
      /^data:/i.test(value) ||
      segments.some((part) => part === "" || part === ".")
    ) {
      throw new Error("invalid");
    }
  }
  const root = path.resolve(ralphDir());
  const resolved = path.resolve(root, ...parts.flatMap((part) => part.split("/")));
  if (!isWithin(root, resolved)) throw new OutsideRootError();
  return resolved;
}

type InspectedFile =
  | { kind: "missing" | "symlink" | "not-regular" | "unreadable" | "empty" }
  | { kind: "ok"; bytes: number; sha256: string; stable: boolean };

function inspectRegularFile(
  filePath: string,
  hashContents: boolean,
  allowEmpty: boolean,
): InspectedFile {
  const openedFile = openContainedFile(filePath);
  if (openedFile.kind !== "ok") return openedFile;
  const descriptor = openedFile.descriptor;
  try {
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile()) return { kind: "not-regular" };
    if (!allowEmpty && opened.size === 0) return { kind: "empty" };
    const hash = hashContents ? createHash("sha256") : null;
    const chunk = hash ? Buffer.allocUnsafe(64 * 1024) : null;
    let bytes = opened.size;
    if (hash && chunk) {
      bytes = 0;
      for (;;) {
        const count = fs.readSync(descriptor, chunk, 0, chunk.length, null);
        if (count === 0) break;
        bytes += count;
        hash.update(chunk.subarray(0, count));
      }
    }
    const afterFd = fs.fstatSync(descriptor);
    const stable = sameFile(opened, afterFd);
    return { kind: "ok", bytes, sha256: hash?.digest("hex") ?? "", stable };
  } catch {
    return { kind: "unreadable" };
  } finally {
    fs.closeSync(descriptor);
  }
}

type OpenedFile =
  | { kind: "ok"; descriptor: number }
  | { kind: "missing" | "symlink" | "unreadable" };

function openContainedFile(filePath: string): OpenedFile {
  const root = path.resolve(ralphDir());
  const relative = path.relative(root, path.resolve(filePath));
  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    return { kind: "unreadable" };
  }
  let canonicalRoot: string;
  try {
    canonicalRoot = fs.realpathSync(root);
  } catch {
    return { kind: "unreadable" };
  }
  const canonicalFile = path.join(canonicalRoot, ...relative.split(path.sep));
  const flags = fs.constants.O_RDONLY | fs.constants.O_NONBLOCK;
  if (process.platform === "darwin") {
    try {
      return {
        kind: "ok",
        descriptor: fs.openSync(canonicalFile, flags | 0x20000000),
      };
    } catch (error) {
      return openFailure(error);
    }
  }
  if (process.platform !== "linux") return { kind: "unreadable" };

  const parts = relative.split(path.sep);
  let directory: number | null = null;
  try {
    directory = fs.openSync(
      canonicalRoot,
      flags | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
    );
    for (const part of parts.slice(0, -1)) {
      const next = fs.openSync(
        `/proc/self/fd/${directory}/${part}`,
        flags | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
      );
      fs.closeSync(directory);
      directory = next;
    }
    return {
      kind: "ok",
      descriptor: fs.openSync(
        `/proc/self/fd/${directory}/${parts.at(-1)!}`,
        flags | fs.constants.O_NOFOLLOW,
      ),
    };
  } catch (error) {
    return openFailure(error);
  } finally {
    if (directory !== null) {
      try {
        fs.closeSync(directory);
      } catch {
        // The descriptor may already have been closed while descending.
      }
    }
  }
}

function openFailure(error: unknown): Exclude<OpenedFile, { kind: "ok" }> {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") return { kind: "missing" };
  if (code === "ELOOP") return { kind: "symlink" };
  return { kind: "unreadable" };
}

function sameFile(left: fs.Stats, right: fs.Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino &&
    left.size === right.size && left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs;
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function finalizeReport(report: DomainVerificationReport): void {
  for (const [key, value] of Object.entries(report)) {
    if (!Array.isArray(value) || key === "integrityCheck") continue;
    const items: unknown[] = value;
    const unique = new Map<string, unknown>();
    for (const item of items) unique.set(JSON.stringify(item), item);
    items.splice(
      0,
      items.length,
      ...[...unique.entries()]
        .sort(([left], [right]) => compareUtf8(left, right))
        .map(([, item]) => item),
    );
  }
  report.integrity =
    report.integrityCheck.length === 1 &&
    report.integrityCheck[0] === "ok" &&
    Object.entries(report).every(
      ([key, value]) =>
        key === "integrity" ||
        key === "hashObjects" ||
        key === "integrityCheck" ||
        !Array.isArray(value) ||
        value.length === 0,
    )
      ? "ok"
      : "failed";
}
