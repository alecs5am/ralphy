import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { DomainError } from "../errors/domain.js";
import { appendActivity } from "./activity.js";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { newDomainId } from "./ids.js";
import { buildPage, decodeCursor, assertLimit } from "./pagination.js";
import {
  resolveQueryContext,
  type QueryContext,
  type ResolvedScope,
} from "./scope-context.js";
import { assertActiveSessionScope } from "./sessions.js";
import {
  type DocumentDetailDto,
  type DocumentDto,
  type DocumentFormat,
  type DocumentKind,
  type DocumentRevisionDto,
  type DocumentSearchDto,
  type JsonValue,
  type Page,
  StoreConflictError,
} from "./types.js";
import type { DocumentRevisionRow } from "./internal-types.js";

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
  /** Parseable strings are serialized JSON; other strings are scalar JSON values. */
  body: string | JsonValue;
  authoredBySessionId?: string | null;
};

/** Narrows broad Workspace authority to the stable Document's immutable scope. */
export function documentMutationContext(
  context: QueryContext,
  documentId: string,
): QueryContext {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, context);
  const row = db
    .query<{ workspaceId: string; projectId: string | null }, [string]>(
      "SELECT workspace_id AS workspaceId, project_id AS projectId FROM documents WHERE id = ?",
    )
    .get(documentId);
  if (
    !row ||
    row.workspaceId !== scope.workspaceId ||
    (scope.projectId !== null && row.projectId !== null && row.projectId !== scope.projectId)
  ) {
    throw new Error(`Document not found: ${documentId}`);
  }
  if (context.sessionId !== undefined || row.projectId === null) return context;
  return { workspaceId: row.workspaceId, projectId: row.projectId };
}

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

type PublicDocumentRevisionDbRow = Omit<
  DocumentRevisionDbRow,
  "body" | "content_sha256"
>;

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
  authored_by_session_id: string | null;
  revision_created_at: number;
};

const DOCUMENT_COLUMNS =
  "id, workspace_id, project_id, kind, slug, title, current_revision_id, row_version, created_at, updated_at";
const REVISION_COLUMNS =
  "id, document_id, revision_no, parent_revision_id, iteration_id, format, title, body, content_sha256, authored_by_session_id, created_at";
const PUBLIC_REVISION_COLUMNS =
  "id, document_id, revision_no, parent_revision_id, iteration_id, format, title, authored_by_session_id, created_at";
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

export function createDocument(input: CreateDocumentInput): DocumentDto {
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
): DocumentRevisionDto {
  return withImmediateTransaction((db) => {
    const document = getDocumentRow(db, input.documentId);
    if (!document) throw new Error(`Document not found: ${input.documentId}`);
    const expectedHeadId = input.expectedHeadId ?? null;
    if (expectedHeadId !== document.currentRevisionId)
      throw new StoreConflictError("Document head conflict");
    assertIterationScope(db, document, input.iterationId ?? null);
    if (input.authoredBySessionId != null) {
      assertActiveSessionScope(db, input.authoredBySessionId, document);
    }

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
    return toDocumentRevisionDto(getDocumentRevisionRow(db, id)!);
  });
}

export function getDocument(input: {
  context: QueryContext;
  documentId: string;
}): DocumentDetailDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const document = getVisibleDocument(db, scope, input.documentId);
  if (!document) throw new Error(`Document not found: ${input.documentId}`);
  return withCurrentRevision(db, document);
}

export function listDocuments(
  input: { context: QueryContext; after?: string | null; limit: number },
): Page<DocumentDto> {
  const db = openDomainDb();
  assertLimit(input.limit);
  const cursor =
    input.after === undefined || input.after === null
      ? null
      : decodeCursor("c1", input.after);
  const afterCreatedAt = cursor?.ordinal ?? -1;
  const afterId = cursor?.id ?? "";
  const scope = resolveQueryContext(db, input.context);
  const rows = scope.projectId
    ? db
        .query<
          DocumentDbRow,
          [number, number, string, string, string, string, number]
        >(
          `SELECT ${DOCUMENT_COLUMNS} FROM documents d
           WHERE (d.created_at > ? OR (d.created_at = ? AND d.id > ?)) AND (
             d.project_id = ? OR (
               d.project_id IS NULL AND d.workspace_id = ?
               AND NOT EXISTS (SELECT 1 FROM documents p WHERE p.project_id = ? AND p.slug = d.slug)
             )
           ) ORDER BY d.created_at ASC, d.id ASC LIMIT ?`,
        )
        .all(
          afterCreatedAt,
          afterCreatedAt,
          afterId,
          scope.projectId,
          scope.workspaceId,
          scope.projectId,
          input.limit + 1,
        )
    : db
        .query<DocumentDbRow, [string, number, number, string, number]>(
          `SELECT ${DOCUMENT_COLUMNS} FROM documents
           WHERE workspace_id = ? AND project_id IS NULL
             AND (created_at > ? OR (created_at = ? AND id > ?))
           ORDER BY created_at ASC, id ASC LIMIT ?`,
        )
        .all(
          scope.workspaceId,
          afterCreatedAt,
          afterCreatedAt,
          afterId,
          input.limit + 1,
        );
  return buildPage(
    rows.map(toDocumentDto),
    input.limit,
    "c1",
    (document) => ({ ordinal: document.createdAt, id: document.id }),
  );
}

export function getDocumentRevision(input: {
  context: QueryContext;
  revisionId: string;
}): DocumentRevisionDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const revision = getPublicDocumentRevisionRow(db, input.revisionId);
  const document = revision
    ? getVisibleDocument(db, scope, revision.document_id)
    : null;
  if (!revision || !document) {
    throw new Error(`Document Revision not found: ${input.revisionId}`);
  }
  return toPublicDocumentRevisionDto(revision);
}

export function listDocumentRevisions(input: {
  context: QueryContext;
  documentId: string;
  after?: string | null;
  limit: number;
}): Page<DocumentRevisionDto> {
  const db = openDomainDb();
  assertLimit(input.limit);
  const scope = resolveQueryContext(db, input.context);
  if (!getVisibleDocument(db, scope, input.documentId)) {
    throw new Error(`Document not found: ${input.documentId}`);
  }
  const cursor =
    input.after === undefined || input.after === null
      ? null
      : decodeCursor("v1", input.after);
  const afterRevisionNo = cursor?.ordinal ?? 0;
  const afterId = cursor?.id ?? "";
  const rows = db
    .query<
      PublicDocumentRevisionDbRow,
      [string, number, number, string, number]
    >(
      `SELECT ${PUBLIC_REVISION_COLUMNS} FROM document_revisions
       WHERE document_id = ?
         AND (revision_no > ? OR (revision_no = ? AND id > ?))
       ORDER BY revision_no ASC, id ASC LIMIT ?`,
    )
    .all(
      input.documentId,
      afterRevisionNo,
      afterRevisionNo,
      afterId,
      input.limit + 1,
    );
  return buildPage(
    rows.map(toPublicDocumentRevisionDto),
    input.limit,
    "v1",
    (revision) => ({ ordinal: revision.revisionNo, id: revision.id }),
  );
}

function literalDocumentSearchQuery(query: string): string {
  const literal = query.trim();
  if (!literal || Buffer.byteLength(literal, "utf8") > 1_024) {
    throw new DomainError("E_VALIDATION_FAILED", undefined, {
      target: "document search",
      detail: "query must contain 1 to 1024 UTF-8 bytes",
    });
  }
  return `"${literal.replaceAll('"', '""')}"`;
}

export function searchDocuments(
  input: {
    context: QueryContext;
    query: string;
    after?: string | null;
    limit: number;
  },
): Page<DocumentSearchDto> {
  const query = literalDocumentSearchQuery(input.query);
  const db = openDomainDb();
  assertLimit(input.limit);
  const cursor =
    input.after === undefined || input.after === null
      ? null
      : decodeCursor("c1", input.after);
  const afterCreatedAt = cursor?.ordinal ?? -1;
  const afterId = cursor?.id ?? "";
  const scope = resolveQueryContext(db, input.context);
  const select = `SELECT
      d.id AS document_id, r.id AS revision_id, d.workspace_id, d.project_id, d.kind, d.slug,
      d.title AS document_title, r.revision_no, r.parent_revision_id, r.iteration_id, r.format,
      r.title AS revision_title, r.authored_by_session_id,
      r.created_at AS revision_created_at
    FROM document_revisions_fts
    JOIN document_revisions r ON r.id = document_revisions_fts.revision_id
    JOIN documents d ON d.id = r.document_id AND d.current_revision_id = r.id`;
  const rows = scope.projectId
    ? db
        .query<
          SearchDbRow,
          [string, number, number, string, string, string, string, number]
        >(
          `${select}
           WHERE document_revisions_fts MATCH ?
             AND (r.created_at > ? OR (r.created_at = ? AND r.id > ?)) AND (
             d.project_id = ? OR (
               d.project_id IS NULL AND d.workspace_id = ?
               AND NOT EXISTS (SELECT 1 FROM documents p WHERE p.project_id = ? AND p.slug = d.slug)
             )
           ) ORDER BY r.created_at ASC, r.id ASC LIMIT ?`,
        )
        .all(
          query,
          afterCreatedAt,
          afterCreatedAt,
          afterId,
          scope.projectId,
          scope.workspaceId,
          scope.projectId,
          input.limit + 1,
        )
    : db
        .query<
          SearchDbRow,
          [string, number, number, string, string, number]
        >(
          `${select}
           WHERE document_revisions_fts MATCH ?
             AND (r.created_at > ? OR (r.created_at = ? AND r.id > ?))
             AND d.workspace_id = ? AND d.project_id IS NULL
           ORDER BY r.created_at ASC, r.id ASC LIMIT ?`,
        )
        .all(
          query,
          afterCreatedAt,
          afterCreatedAt,
          afterId,
          scope.workspaceId,
          input.limit + 1,
        );
  return buildPage(rows.map(toSearchDto), input.limit, "c1", (revision) => ({
    ordinal: revision.createdAt,
    id: revision.revisionId,
  }));
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
  document: DocumentDto,
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
      value = input;
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
    const result = Object.create(null) as Record<string, JsonValue>;
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

function getDocumentRow(db: Database, id: string): DocumentDto | null {
  const row = db
    .query<
      DocumentDbRow,
      [string]
    >(`SELECT ${DOCUMENT_COLUMNS} FROM documents WHERE id = ?`)
    .get(id);
  return row ? toDocumentDto(row) : null;
}

function getDocumentRevisionRow(
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

function getPublicDocumentRevisionRow(
  db: Database,
  id: string,
): PublicDocumentRevisionDbRow | null {
  return db
    .query<
      PublicDocumentRevisionDbRow,
      [string]
    >(`SELECT ${PUBLIC_REVISION_COLUMNS} FROM document_revisions WHERE id = ?`)
    .get(id);
}

function getVisibleDocument(
  db: Database,
  scope: ResolvedScope,
  id: string,
): DocumentDto | null {
  const document = getDocumentRow(db, id);
  if (!document || !isDocumentVisible(scope, document)) return null;
  return document;
}

function isDocumentVisible(
  scope: ResolvedScope,
  document: Pick<DocumentDto, "workspaceId" | "projectId">,
): boolean {
  if (document.workspaceId !== scope.workspaceId) return false;
  return scope.projectId === null
    ? document.projectId === null
    : document.projectId === null || document.projectId === scope.projectId;
}

function withCurrentRevision(
  db: Database,
  document: DocumentDto,
): DocumentDetailDto {
  return {
    ...document,
    currentRevision: document.currentRevisionId
      ? toPublicDocumentRevisionDto(
          getPublicDocumentRevisionRow(db, document.currentRevisionId)!,
        )
      : null,
  };
}

function toDocumentDto(row: DocumentDbRow): DocumentDto {
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

function toDocumentRevisionDto(
  revision: DocumentRevisionRow,
): DocumentRevisionDto {
  return {
    id: revision.id,
    documentId: revision.documentId,
    revisionNo: revision.revisionNo,
    parentRevisionId: revision.parentRevisionId,
    iterationId: revision.iterationId,
    format: revision.format,
    title: revision.title,
    authoredBySessionId: revision.authoredBySessionId,
    createdAt: revision.createdAt,
  };
}

function toPublicDocumentRevisionDto(
  revision: PublicDocumentRevisionDbRow,
): DocumentRevisionDto {
  return {
    id: revision.id,
    documentId: revision.document_id,
    revisionNo: revision.revision_no,
    parentRevisionId: revision.parent_revision_id,
    iterationId: revision.iteration_id,
    format: revision.format,
    title: revision.title,
    authoredBySessionId: revision.authored_by_session_id,
    createdAt: revision.created_at,
  };
}

function toSearchDto(row: SearchDbRow): DocumentSearchDto {
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
    authoredBySessionId: row.authored_by_session_id,
    createdAt: row.revision_created_at,
  };
}
