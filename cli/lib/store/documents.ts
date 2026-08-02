import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { appendActivity, assertLimit } from "./activity.js";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { newDomainId } from "./ids.js";
import {
  type DocumentFormat,
  type DocumentKind,
  type DocumentRevisionRow,
  type DocumentRow,
  type DocumentSearchRow,
  type DocumentWithCurrentRevision,
  type JsonValue,
  type Page,
  StoreConflictError,
} from "./types.js";

type DocumentScope =
  | { workspaceId: string; projectId?: never }
  | { workspaceId?: never; projectId: string };

export type CreateDocumentInput = DocumentScope & {
  kind: DocumentKind;
  slug: string;
  title: string;
};

export type ReviseDocumentInput = {
  documentId: string;
  expectedHeadId?: string | null;
  iterationId?: string | null;
  format: DocumentFormat;
  title?: string | null;
  body: string | JsonValue;
  authoredBySessionId?: string | null;
};

export type DocumentBindingRow = {
  id: string;
  documentRevisionId: string;
  role: string;
  createdAt: number;
} & (
  | { projectId: string; buildId?: never }
  | { projectId?: never; buildId: string }
);

type DocumentDbRow = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  kind: DocumentKind;
  slug: string;
  title: string;
  current_revision_id: string | null;
  row_version: number;
  created_at: number;
  updated_at: number;
};

type DocumentRevisionDbRow = {
  id: string;
  document_id: string;
  revision_no: number;
  parent_revision_id: string | null;
  iteration_id: string | null;
  format: DocumentFormat;
  title: string | null;
  body: string;
  content_sha256: string;
  authored_by_session_id: string | null;
  created_at: number;
};

type SearchDbRow = {
  document_id: string;
  revision_id: string;
  workspace_id: string;
  project_id: string | null;
  kind: DocumentKind;
  slug: string;
  document_title: string;
  revision_no: number;
  parent_revision_id: string | null;
  iteration_id: string | null;
  format: DocumentFormat;
  revision_title: string | null;
  body: string;
  content_sha256: string;
  authored_by_session_id: string | null;
  revision_created_at: number;
};

const DOCUMENT_COLUMNS =
  "id, workspace_id, project_id, kind, slug, title, current_revision_id, row_version, created_at, updated_at";
const REVISION_COLUMNS =
  "id, document_id, revision_no, parent_revision_id, iteration_id, format, title, body, content_sha256, authored_by_session_id, created_at";
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

export function createDocument(input: CreateDocumentInput): DocumentRow {
  return withImmediateTransaction((db) => {
    const scope = resolveScope(db, input);
    assertNoDataUrl(input.title);
    const id = newDomainId("doc");
    const now = Date.now();
    db.prepare(
      "INSERT INTO documents (id, workspace_id, project_id, kind, slug, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      scope.workspaceId,
      scope.projectId,
      input.kind,
      input.slug,
      input.title,
      now,
      now,
    );
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      entityType: "document",
      entityId: id,
      action: "document.created",
      payload: { kind: input.kind, slug: input.slug },
      createdAt: now,
    });
    return getDocumentRow(db, id)!;
  });
}

export function reviseDocument(
  input: ReviseDocumentInput,
): DocumentRevisionRow {
  return withImmediateTransaction((db) => {
    const document = getDocumentRow(db, input.documentId);
    if (!document) throw new Error(`Document not found: ${input.documentId}`);
    const expectedHeadId = input.expectedHeadId ?? null;
    if (expectedHeadId !== document.currentRevisionId)
      throw new StoreConflictError("Document head conflict");
    assertIterationScope(db, document, input.iterationId ?? null);

    const body = canonicalBody(input.format, input.body);
    const title = input.title ?? null;
    if (title !== null) assertNoDataUrl(title);
    const contentSha256 = createHash("sha256")
      .update(JSON.stringify({ format: input.format, title, body }))
      .digest("hex");
    const revisionNo =
      db
        .query<
          { revisionNo: number },
          [string]
        >("SELECT COALESCE(MAX(revision_no), 0) + 1 AS revisionNo FROM document_revisions WHERE document_id = ?")
        .get(document.id)?.revisionNo ?? 1;
    const id = newDomainId("drev");
    const now = Date.now();
    db.prepare(
      `INSERT INTO document_revisions
       (id, document_id, revision_no, parent_revision_id, iteration_id, format, title, body, content_sha256, authored_by_session_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      document.id,
      revisionNo,
      document.currentRevisionId,
      input.iterationId ?? null,
      input.format,
      title,
      body,
      contentSha256,
      input.authoredBySessionId ?? null,
      now,
    );
    const result = db
      .prepare(
        "UPDATE documents SET current_revision_id = ?, row_version = row_version + 1, updated_at = ? WHERE id = ? AND current_revision_id IS ?",
      )
      .run(id, now, document.id, expectedHeadId);
    if (!result.changes) throw new StoreConflictError("Document head conflict");
    if (document.currentRevisionId) {
      db.prepare(
        "DELETE FROM document_revisions_fts WHERE revision_id = ?",
      ).run(document.currentRevisionId);
    }
    if (input.format !== "json") {
      db.prepare(
        "INSERT INTO document_revisions_fts (revision_id, title, body) VALUES (?, ?, ?)",
      ).run(id, title ?? "", body);
    }
    appendActivity(db, {
      workspaceId: document.workspaceId,
      projectId: document.projectId,
      entityType: "document",
      entityId: document.id,
      action: "document.revised",
      payload: { revisionId: id, revisionNo, format: input.format },
      createdAt: now,
    });
    return getDocumentRevision(db, id)!;
  });
}

export function getDocument(id: string): DocumentWithCurrentRevision {
  const db = openDomainDb();
  const document = getDocumentRow(db, id);
  if (!document) throw new Error(`Document not found: ${id}`);
  return {
    ...document,
    currentRevision: document.currentRevisionId
      ? getDocumentRevision(db, document.currentRevisionId)
      : null,
  };
}

export function listDocuments(
  input: DocumentScope & { cursor?: string | null; limit?: number },
): Page<DocumentWithCurrentRevision> {
  const db = openDomainDb();
  const limit = input.limit ?? 50;
  assertLimit(limit);
  const cursor = checkedCursor(input.cursor);
  const scope = resolveScope(db, input);
  const rows = scope.projectId
    ? db
        .query<DocumentDbRow, [string, string, string, string, number]>(
          `SELECT ${DOCUMENT_COLUMNS} FROM documents d
           WHERE d.id > ? AND (
             d.project_id = ? OR (
               d.project_id IS NULL AND d.workspace_id = ?
               AND NOT EXISTS (SELECT 1 FROM documents p WHERE p.project_id = ? AND p.slug = d.slug)
             )
           ) ORDER BY d.id ASC LIMIT ?`,
        )
        .all(
          cursor,
          scope.projectId,
          scope.workspaceId,
          scope.projectId,
          limit + 1,
        )
    : db
        .query<DocumentDbRow, [string, string, number]>(
          `SELECT ${DOCUMENT_COLUMNS} FROM documents
           WHERE workspace_id = ? AND project_id IS NULL AND id > ? ORDER BY id ASC LIMIT ?`,
        )
        .all(scope.workspaceId, cursor, limit + 1);
  return page(
    rows.map((row) => withCurrentRevision(db, toDocumentRow(row))),
    limit,
    (row) => row.id,
  );
}

export function searchDocuments(
  input: DocumentScope & {
    query: string;
    cursor?: string | null;
    limit?: number;
  },
): Page<DocumentSearchRow> {
  if (!input.query.trim())
    throw new Error("Document search query must not be empty");
  const db = openDomainDb();
  const limit = input.limit ?? 50;
  assertLimit(limit);
  const cursor = checkedCursor(input.cursor);
  const scope = resolveScope(db, input);
  const select = `SELECT
      d.id AS document_id, r.id AS revision_id, d.workspace_id, d.project_id, d.kind, d.slug,
      d.title AS document_title, r.revision_no, r.parent_revision_id, r.iteration_id, r.format,
      r.title AS revision_title, r.body, r.content_sha256, r.authored_by_session_id,
      r.created_at AS revision_created_at
    FROM document_revisions_fts
    JOIN document_revisions r ON r.id = document_revisions_fts.revision_id
    JOIN documents d ON d.id = r.document_id AND d.current_revision_id = r.id`;
  const rows = scope.projectId
    ? db
        .query<SearchDbRow, [string, string, string, string, string, number]>(
          `${select}
           WHERE document_revisions_fts MATCH ? AND r.id > ? AND (
             d.project_id = ? OR (
               d.project_id IS NULL AND d.workspace_id = ?
               AND NOT EXISTS (SELECT 1 FROM documents p WHERE p.project_id = ? AND p.slug = d.slug)
             )
           ) ORDER BY r.id ASC LIMIT ?`,
        )
        .all(
          input.query,
          cursor,
          scope.projectId,
          scope.workspaceId,
          scope.projectId,
          limit + 1,
        )
    : db
        .query<SearchDbRow, [string, string, string, number]>(
          `${select}
           WHERE document_revisions_fts MATCH ? AND r.id > ?
             AND d.workspace_id = ? AND d.project_id IS NULL
           ORDER BY r.id ASC LIMIT ?`,
        )
        .all(input.query, cursor, scope.workspaceId, limit + 1);
  return page(rows.map(toSearchRow), limit, (row) => row.revisionId);
}

export function bindProjectDocument(input: {
  projectId: string;
  documentRevisionId: string;
  role: string;
}): DocumentBindingRow {
  return withImmediateTransaction((db) => {
    const project = projectScope(db, input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);
    const revision = revisionScope(db, input.documentRevisionId);
    if (!revision)
      throw new Error(
        `Document revision not found: ${input.documentRevisionId}`,
      );
    assertDocumentVisibleToProject(revision, project);
    assertBindingRoleAvailable(
      db,
      "project_document_bindings",
      "project_id",
      project.projectId,
      input.role,
    );
    const binding = insertBinding(
      db,
      "project_document_bindings",
      "project_id",
      project.projectId,
      input.documentRevisionId,
      input.role,
    );
    appendBindingActivity(db, project, binding, "project");
    return { ...binding, projectId: project.projectId };
  });
}

export function bindBuildDocument(input: {
  buildId: string;
  documentRevisionId: string;
  role: string;
}): DocumentBindingRow {
  return withImmediateTransaction((db) => {
    const build = buildScope(db, input.buildId);
    if (!build) throw new Error(`Build not found: ${input.buildId}`);
    const revision = revisionScope(db, input.documentRevisionId);
    if (!revision)
      throw new Error(
        `Document revision not found: ${input.documentRevisionId}`,
      );
    assertDocumentVisibleToProject(revision, build);
    assertBindingRoleAvailable(
      db,
      "build_document_bindings",
      "build_id",
      input.buildId,
      input.role,
    );
    const binding = insertBinding(
      db,
      "build_document_bindings",
      "build_id",
      input.buildId,
      input.documentRevisionId,
      input.role,
    );
    appendBindingActivity(db, build, binding, "build");
    return { ...binding, buildId: input.buildId };
  });
}

function resolveScope(
  db: Database,
  input: { workspaceId?: string; projectId?: string },
): { workspaceId: string; projectId: string | null } {
  if (input.workspaceId && !input.projectId) {
    const workspace = db
      .query<{ id: string }, [string]>("SELECT id FROM workspaces WHERE id = ?")
      .get(input.workspaceId);
    if (!workspace)
      throw new Error(`Workspace not found: ${input.workspaceId}`);
    return { workspaceId: workspace.id, projectId: null };
  }
  if (input.projectId && !input.workspaceId) {
    const project = projectScope(db, input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);
    return { workspaceId: project.workspaceId, projectId: input.projectId };
  }
  throw new Error(
    "Document scope requires exactly one workspaceId or projectId",
  );
}

function assertIterationScope(
  db: Database,
  document: DocumentRow,
  iterationId: string | null,
): void {
  if (!iterationId) return;
  const iteration = db
    .query<{ workspaceId: string; projectId: string }, [string]>(
      `SELECT p.workspace_id AS workspaceId, p.id AS projectId
       FROM project_iterations i JOIN projects p ON p.id = i.project_id WHERE i.id = ?`,
    )
    .get(iterationId);
  const valid =
    iteration &&
    (document.projectId
      ? iteration.projectId === document.projectId
      : iteration.workspaceId === document.workspaceId);
  if (!valid)
    throw new Error(
      `Iteration does not belong to the Document scope: ${iterationId}`,
    );
}

function canonicalBody(
  format: DocumentFormat,
  input: string | JsonValue,
): string {
  if (format !== "json") {
    if (typeof input !== "string")
      throw new Error(`${format} Document body must be text`);
    assertNoDataUrl(input);
    return input;
  }
  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch {
      throw new Error("JSON Document body must be valid JSON");
    }
  }
  return JSON.stringify(canonicalJson(value, false, new Set<object>()));
}

function canonicalJson(
  value: unknown,
  binaryContext: boolean,
  seen: Set<object>,
): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("JSON Document body contains a non-finite number");
    return value;
  }
  if (typeof value === "string") {
    assertNoDataUrl(value);
    if (binaryContext && isStrictBase64(value))
      throw new Error(
        "JSON Document body contains base64 beneath a binary key",
      );
    return value;
  }
  if (typeof value !== "object")
    throw new Error("JSON Document body contains a non-JSON value");
  if (seen.has(value))
    throw new Error("JSON Document body must not contain cycles");
  seen.add(value);
  try {
    if (Array.isArray(value))
      return value.map((item) => canonicalJson(item, binaryContext, seen));
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new Error("JSON Document body contains a non-JSON object");
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      assertNoDataUrl(key);
      result[key] = canonicalJson(
        (value as Record<string, unknown>)[key],
        binaryContext || BINARY_KEYS.has(key.toLowerCase()),
        seen,
      );
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

function assertNoDataUrl(value: string): void {
  if (DATA_URL.test(value))
    throw new Error("Document body must not contain a data URL");
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

function projectScope(
  db: Database,
  projectId: string,
): { workspaceId: string; projectId: string } | null {
  return db
    .query<
      { workspaceId: string; projectId: string },
      [string]
    >("SELECT workspace_id AS workspaceId, id AS projectId FROM projects WHERE id = ?")
    .get(projectId);
}

function buildScope(
  db: Database,
  buildId: string,
): { workspaceId: string; projectId: string } | null {
  return db
    .query<{ workspaceId: string; projectId: string }, [string]>(
      `SELECT p.workspace_id AS workspaceId, p.id AS projectId
       FROM builds b
       JOIN composition_revisions r ON r.id = b.composition_revision_id
       JOIN compositions c ON c.id = r.composition_id
       JOIN projects p ON p.id = c.project_id
       WHERE b.id = ?`,
    )
    .get(buildId);
}

function revisionScope(
  db: Database,
  revisionId: string,
): { workspaceId: string; projectId: string | null } | null {
  return db
    .query<{ workspaceId: string; projectId: string | null }, [string]>(
      `SELECT d.workspace_id AS workspaceId, d.project_id AS projectId
       FROM document_revisions r JOIN documents d ON d.id = r.document_id WHERE r.id = ?`,
    )
    .get(revisionId);
}

function assertDocumentVisibleToProject(
  revision: { workspaceId: string; projectId: string | null },
  project: { workspaceId: string; projectId: string },
): void {
  if (
    revision.workspaceId !== project.workspaceId ||
    (revision.projectId !== null && revision.projectId !== project.projectId)
  ) {
    throw new Error("Document revision is outside the target Project scope");
  }
}

function assertBindingRoleAvailable(
  db: Database,
  table: "project_document_bindings" | "build_document_bindings",
  ownerColumn: "project_id" | "build_id",
  ownerId: string,
  role: string,
): void {
  if (
    db
      .query(`SELECT id FROM ${table} WHERE ${ownerColumn} = ? AND role = ?`)
      .get(ownerId, role)
  ) {
    throw new Error(`Document binding role already exists: ${role}`);
  }
}

function insertBinding(
  db: Database,
  table: "project_document_bindings" | "build_document_bindings",
  ownerColumn: "project_id" | "build_id",
  ownerId: string,
  revisionId: string,
  role: string,
): Omit<DocumentBindingRow, "projectId" | "buildId"> {
  const id = newDomainId("bind");
  const createdAt = Date.now();
  db.prepare(
    `INSERT INTO ${table} (id, ${ownerColumn}, document_revision_id, role, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, ownerId, revisionId, role, createdAt);
  return { id, documentRevisionId: revisionId, role, createdAt };
}

function appendBindingActivity(
  db: Database,
  scope: { workspaceId: string; projectId: string },
  binding: Omit<DocumentBindingRow, "projectId" | "buildId">,
  target: "project" | "build",
): void {
  appendActivity(db, {
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    entityType: "document_binding",
    entityId: binding.id,
    action: "document.bound",
    payload: {
      target,
      role: binding.role,
      documentRevisionId: binding.documentRevisionId,
    },
    createdAt: binding.createdAt,
  });
}

function getDocumentRow(db: Database, id: string): DocumentRow | null {
  const row = db
    .query<
      DocumentDbRow,
      [string]
    >(`SELECT ${DOCUMENT_COLUMNS} FROM documents WHERE id = ?`)
    .get(id);
  return row ? toDocumentRow(row) : null;
}

function getDocumentRevision(
  db: Database,
  id: string,
): DocumentRevisionRow | null {
  const row = db
    .query<
      DocumentRevisionDbRow,
      [string]
    >(`SELECT ${REVISION_COLUMNS} FROM document_revisions WHERE id = ?`)
    .get(id);
  return row ? toDocumentRevisionRow(row) : null;
}

function withCurrentRevision(
  db: Database,
  document: DocumentRow,
): DocumentWithCurrentRevision {
  return {
    ...document,
    currentRevision: document.currentRevisionId
      ? getDocumentRevision(db, document.currentRevisionId)
      : null,
  };
}

function toDocumentRow(row: DocumentDbRow): DocumentRow {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    currentRevisionId: row.current_revision_id,
    rowVersion: row.row_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDocumentRevisionRow(
  row: DocumentRevisionDbRow,
): DocumentRevisionRow {
  return {
    id: row.id,
    documentId: row.document_id,
    revisionNo: row.revision_no,
    parentRevisionId: row.parent_revision_id,
    iterationId: row.iteration_id,
    format: row.format,
    title: row.title,
    body: row.body,
    contentSha256: row.content_sha256,
    authoredBySessionId: row.authored_by_session_id,
    createdAt: row.created_at,
  };
}

function toSearchRow(row: SearchDbRow): DocumentSearchRow {
  return {
    documentId: row.document_id,
    revisionId: row.revision_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    kind: row.kind,
    slug: row.slug,
    documentTitle: row.document_title,
    revisionNo: row.revision_no,
    parentRevisionId: row.parent_revision_id,
    iterationId: row.iteration_id,
    format: row.format,
    title: row.revision_title,
    body: row.body,
    contentSha256: row.content_sha256,
    authoredBySessionId: row.authored_by_session_id,
    createdAt: row.revision_created_at,
  };
}

function checkedCursor(cursor: string | null | undefined): string {
  if (cursor !== undefined && cursor !== null && !cursor)
    throw new Error("Cursor must be a non-empty ID");
  return cursor ?? "";
}

function page<T>(items: T[], limit: number, id: (item: T) => string): Page<T> {
  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  return {
    items: pageItems,
    nextCursor: hasMore ? id(pageItems.at(-1)!) : null,
  };
}
