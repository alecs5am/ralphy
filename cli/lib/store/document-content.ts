import type { Database } from "bun:sqlite";
import { appendActivity } from "./activity.js";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { newDomainId } from "./ids.js";
import { assertLimit, buildPage, decodeCursor } from "./pagination.js";
import { resolveQueryContext, type QueryContext } from "./scope-context.js";
import type {
  DocumentBindingDto,
  DocumentContentPage,
  DocumentFormat,
  Page,
} from "./types.js";
import { StoreConflictError } from "./types.js";

const MAX_LIMIT_BYTES = 65_536;
const MAX_CODE_POINT_BYTES = 3;

type RevisionScope = {
  documentId: string;
  workspaceId: string;
  projectId: string | null;
  format: DocumentFormat;
};

type BindingOwner = {
  workspaceId: string;
  projectId: string;
};

type BindingDbRow = {
  id: string;
  role: string;
  createdAt: number;
  documentId: string;
  boundRevisionId: string;
  currentHeadRevisionId: string | null;
  boundRevisionNo: number;
  headRevisionNo: number | null;
};

/**
 * The only consumer read of a Document body. Callers page and concatenate; no
 * other Document projection contains a body, locator, bucket, key, or path.
 */
export function getDocumentContent(input: {
  context: QueryContext;
  revisionId: string;
  afterByte: number;
  limitBytes: number;
}): DocumentContentPage {
  if (!Number.isSafeInteger(input.afterByte) || input.afterByte < 0) {
    throw new Error("Document afterByte must be a non-negative safe integer");
  }
  if (
    !Number.isInteger(input.limitBytes) ||
    input.limitBytes < 1 ||
    input.limitBytes > MAX_LIMIT_BYTES
  ) {
    throw new Error(`Document limitBytes must be an integer from 1 through ${MAX_LIMIT_BYTES}`);
  }
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const revision = db
    .query<
      { documentId: string; workspaceId: string; projectId: string | null; format: DocumentFormat; body: string },
      [string]
    >(
      `SELECT revision.document_id AS documentId,
              document.workspace_id AS workspaceId,
              document.project_id AS projectId,
              revision.format AS format, revision.body AS body
       FROM document_revisions revision
       JOIN documents document ON document.id = revision.document_id
       WHERE revision.id = ?`,
    )
    .get(input.revisionId);
  if (!revision || !visible(scope, revision)) {
    throw new Error(`Document Revision not found: ${input.revisionId}`);
  }

  const bytes = Buffer.from(revision.body, "utf8");
  if (input.afterByte > bytes.byteLength) {
    throw new Error("Document afterByte is beyond the end of the revision");
  }
  if (input.afterByte === bytes.byteLength) {
    return {
      revisionId: input.revisionId,
      format: revision.format,
      text: "",
      nextByte: null,
    };
  }
  if (isContinuation(bytes[input.afterByte]!)) {
    throw new Error("Document afterByte splits a UTF-8 code point");
  }
  // Extend the nominal end through the code point it lands inside, by at most
  // three bytes, so even limitBytes: 1 always makes progress.
  let end = Math.min(input.afterByte + input.limitBytes, bytes.byteLength);
  const ceiling = Math.min(end + MAX_CODE_POINT_BYTES, bytes.byteLength);
  while (end < ceiling && isContinuation(bytes[end]!)) end += 1;
  return {
    revisionId: input.revisionId,
    format: revision.format,
    text: bytes.subarray(input.afterByte, end).toString("utf8"),
    nextByte: end < bytes.byteLength ? end : null,
  };
}

export function replaceProjectDocumentBinding(input: {
  context: QueryContext;
  projectId: string;
  role: string;
  revisionId: string;
  expectedRevisionId: string | null;
}): DocumentBindingDto {
  return withImmediateTransaction((db) => {
    const owner = requireVisibleOwner(db, input.context, "project", input.projectId);
    return replaceBinding(db, owner, {
      ownerType: "project",
      table: "project_document_bindings",
      ownerColumn: "project_id",
      ownerId: input.projectId,
      role: input.role,
      revisionId: input.revisionId,
      expectedRevisionId: input.expectedRevisionId,
    });
  });
}

export function replaceBuildDocumentBinding(input: {
  context: QueryContext;
  buildId: string;
  role: string;
  revisionId: string;
  expectedRevisionId: string | null;
}): DocumentBindingDto {
  return withImmediateTransaction((db) => {
    const owner = requireVisibleOwner(db, input.context, "build", input.buildId);
    return replaceBinding(db, owner, {
      ownerType: "build",
      table: "build_document_bindings",
      ownerColumn: "build_id",
      ownerId: input.buildId,
      role: input.role,
      revisionId: input.revisionId,
      expectedRevisionId: input.expectedRevisionId,
    });
  });
}

export function getProjectDocumentBinding(
  context: QueryContext,
  input: { projectId: string; role: string },
): DocumentBindingDto | null {
  const db = openDomainDb();
  if (!visibleOwner(db, context, "project", input.projectId)) return null;
  return readBinding(db, "project", "project_document_bindings", "project_id", input.projectId, input.role);
}

export function getBuildDocumentBinding(
  context: QueryContext,
  input: { buildId: string; role: string },
): DocumentBindingDto | null {
  const db = openDomainDb();
  if (!visibleOwner(db, context, "build", input.buildId)) return null;
  return readBinding(
    db,
    "build",
    "build_document_bindings",
    "build_id",
    input.buildId,
    input.role,
  );
}

export function listProjectDocumentBindings(
  context: QueryContext,
  input: { projectId: string; after?: string | null; limit: number },
): Page<DocumentBindingDto> {
  return listBindings(context, {
    ownerType: "project",
    table: "project_document_bindings",
    ownerColumn: "project_id",
    ownerId: input.projectId,
    after: input.after,
    limit: input.limit,
  });
}

export function listBuildDocumentBindings(
  context: QueryContext,
  input: { buildId: string; after?: string | null; limit: number },
): Page<DocumentBindingDto> {
  return listBindings(context, {
    ownerType: "build",
    table: "build_document_bindings",
    ownerColumn: "build_id",
    ownerId: input.buildId,
    after: input.after,
    limit: input.limit,
  });
}

function replaceBinding(
  db: Database,
  owner: BindingOwner,
  input: {
    ownerType: "project" | "build";
    table: "project_document_bindings" | "build_document_bindings";
    ownerColumn: "project_id" | "build_id";
    ownerId: string;
    role: string;
    revisionId: string;
    expectedRevisionId: string | null;
  },
): DocumentBindingDto {
  if (!Object.hasOwn(input, "expectedRevisionId")) {
    throw new Error("Document binding requires expectedRevisionId");
  }
  const role = input.role.trim();
  if (!role || role.length > 64) {
    throw new Error("Document binding role must be 1..64 characters");
  }
  const existing = db
    .query<{ id: string; documentRevisionId: string }, [string, string]>(
      `SELECT id, document_revision_id AS documentRevisionId FROM ${input.table}
       WHERE ${input.ownerColumn} = ? AND role = ?`,
    )
    .get(input.ownerId, role);
  const currentId = existing?.documentRevisionId ?? null;
  if (currentId !== input.expectedRevisionId) {
    throw new StoreConflictError("Document binding revision conflict");
  }
  const now = Date.now();
  if (existing) {
    // A newer Document head never rewrites a binding implicitly: only this
    // explicit, expectation-checked replacement moves it.
    const result = db
      .prepare(
        `UPDATE ${input.table} SET document_revision_id = ?
         WHERE id = ? AND document_revision_id = ?`,
      )
      .run(input.revisionId, existing.id, currentId!);
    if (!result.changes) {
      throw new StoreConflictError("Document binding revision conflict");
    }
  } else {
    db.prepare(
      `INSERT INTO ${input.table} (id, ${input.ownerColumn}, document_revision_id, role, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(newDomainId("bind"), input.ownerId, input.revisionId, role, now);
  }
  const binding = readBinding(
    db,
    input.ownerType,
    input.table,
    input.ownerColumn,
    input.ownerId,
    role,
  );
  if (!binding) throw new Error("Document binding was not persisted");
  appendActivity(db, {
    workspaceId: owner.workspaceId,
    projectId: owner.projectId,
    entityType: `${input.ownerType}_document_binding`,
    entityId: binding.documentId,
    action: existing ? "document.rebound" : "document.bound",
    payload: { role, revisionId: input.revisionId, replaced: existing !== undefined },
    createdAt: now,
  });
  return binding;
}

function readBinding(
  db: Database,
  ownerType: "project" | "build",
  table: string,
  ownerColumn: string,
  ownerId: string,
  role: string,
): DocumentBindingDto | null {
  const row = db
    .query<BindingDbRow, [string, string]>(
      `${bindingSelect(table)}
       WHERE binding.${ownerColumn} = ? AND binding.role = ?`,
    )
    .get(ownerId, role);
  return row ? toBindingDto(row, ownerType, ownerId) : null;
}

function listBindings(
  context: QueryContext,
  input: {
    ownerType: "project" | "build";
    table: "project_document_bindings" | "build_document_bindings";
    ownerColumn: "project_id" | "build_id";
    ownerId: string;
    after?: string | null;
    limit: number;
  },
): Page<DocumentBindingDto> {
  assertLimit(input.limit);
  const db = openDomainDb();
  requireVisibleOwner(db, context, input.ownerType, input.ownerId);
  const cursor = input.after == null ? null : decodeCursor("c1", input.after);
  const afterCreatedAt = cursor?.ordinal ?? -1;
  const afterId = cursor?.id ?? "";
  const rows = db
    .query<BindingDbRow, [string, number, number, string, number]>(
      `${bindingSelect(input.table)}
       WHERE binding.${input.ownerColumn} = ?
         AND (binding.created_at > ? OR (binding.created_at = ? AND binding.id > ?))
       ORDER BY binding.created_at ASC, binding.id ASC LIMIT ?`,
    )
    .all(
      input.ownerId,
      afterCreatedAt,
      afterCreatedAt,
      afterId,
      input.limit + 1,
    );
  const page = buildPage(rows, input.limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
  return {
    items: page.items.map((row) => toBindingDto(row, input.ownerType, input.ownerId)),
    nextCursor: page.nextCursor,
  };
}

function bindingSelect(table: string): string {
  return `SELECT binding.id AS id, binding.role AS role,
              binding.created_at AS createdAt,
              document.id AS documentId,
              binding.document_revision_id AS boundRevisionId,
              document.current_revision_id AS currentHeadRevisionId,
              bound.revision_no AS boundRevisionNo,
              head.revision_no AS headRevisionNo
       FROM ${table} binding
       JOIN document_revisions bound ON bound.id = binding.document_revision_id
       JOIN documents document ON document.id = bound.document_id
       LEFT JOIN document_revisions head ON head.id = document.current_revision_id`;
}

function toBindingDto(
  row: BindingDbRow,
  ownerType: "project" | "build",
  ownerId: string,
): DocumentBindingDto {
  return {
    ownerType,
    ownerId,
    role: row.role,
    documentId: row.documentId,
    boundRevisionId: row.boundRevisionId,
    currentHeadRevisionId: row.currentHeadRevisionId,
    hasNewerHead:
      row.headRevisionNo !== null && row.headRevisionNo > row.boundRevisionNo,
  };
}

function requireVisibleOwner(
  db: Database,
  context: QueryContext,
  ownerType: "project" | "build",
  ownerId: string,
): BindingOwner {
  const owner = visibleOwner(db, context, ownerType, ownerId);
  if (!owner) {
    throw new Error(`${ownerType === "project" ? "Project" : "Build"} not found: ${ownerId}`);
  }
  return owner;
}

function visibleOwner(
  db: Database,
  context: QueryContext,
  ownerType: "project" | "build",
  ownerId: string,
): BindingOwner | null {
  const scope = resolveQueryContext(db, context);
  const owner = ownerScope(db, ownerType, ownerId);
  if (
    !owner ||
    owner.workspaceId !== scope.workspaceId ||
    (scope.projectId !== null && owner.projectId !== scope.projectId)
  ) {
    return null;
  }
  return owner;
}

function ownerScope(
  db: Database,
  ownerType: "project" | "build",
  ownerId: string,
): BindingOwner | null {
  const row =
    ownerType === "project"
      ? db
          .query<{ workspaceId: string; projectId: string }, [string]>(
            "SELECT workspace_id AS workspaceId, id AS projectId FROM projects WHERE id = ?",
          )
          .get(ownerId)
      : db
          .query<{ workspaceId: string; projectId: string }, [string]>(
            `SELECT project.workspace_id AS workspaceId, project.id AS projectId
             FROM builds build
             JOIN composition_revisions revision
               ON revision.id = build.composition_revision_id
             JOIN compositions composition ON composition.id = revision.composition_id
             JOIN projects project ON project.id = composition.project_id
             WHERE build.id = ?`,
          )
          .get(ownerId);
  return row ?? null;
}

function visible(
  scope: { workspaceId: string; projectId: string | null },
  revision: Pick<RevisionScope, "workspaceId" | "projectId">,
): boolean {
  if (revision.workspaceId !== scope.workspaceId) return false;
  return scope.projectId === null
    ? revision.projectId === null
    : revision.projectId === null || revision.projectId === scope.projectId;
}

function isContinuation(byte: number): boolean {
  return (byte & 0b1100_0000) === 0b1000_0000;
}
