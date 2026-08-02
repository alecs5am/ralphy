import { Database } from "bun:sqlite";
import { openDomainDb } from "./db.js";
import { assertLimit } from "./pagination.js";
import type { ActivityDto, JsonValue, Page } from "./types.js";

export { assertLimit };

export type ActivityInput = {
  workspaceId?: string | null;
  projectId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  payload?: JsonValue;
  createdAt?: number;
};

type ActivityDbRow = {
  id: number;
  workspace_id: string | null;
  project_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  created_at: number;
};

export function appendActivity(db: Database, input: ActivityInput): number {
  const payload = assertSafeActivityPayload(input.payload ?? {});
  const result = db
    .prepare(
      "INSERT INTO activity_events (workspace_id, project_id, entity_type, entity_id, action, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.workspaceId ?? null,
      input.projectId ?? null,
      input.entityType,
      input.entityId,
      input.action,
      JSON.stringify(payload),
      input.createdAt ?? Date.now(),
    );
  return Number(result.lastInsertRowid);
}

/**
 * Activity is the one global sequence: an exclusive integer cursor, never an
 * opaque creation cursor, and never scoped by Workspace or Project.
 */
export function listActivity(input: {
  afterSequence: number;
  limit: number;
}): Page<ActivityDto, number> {
  if (!Number.isSafeInteger(input.afterSequence) || input.afterSequence < 0) {
    throw new Error("Activity afterSequence must be a non-negative integer");
  }
  assertLimit(input.limit);
  const rows = openDomainDb()
    .query<ActivityDbRow, [number, number]>(
      `SELECT id, workspace_id, project_id, entity_type, entity_id, action, created_at
       FROM activity_events WHERE id > ? ORDER BY id ASC LIMIT ?`,
    )
    .all(input.afterSequence, input.limit + 1);
  const items = rows.slice(0, input.limit).map(toActivityDto);
  return {
    items,
    nextCursor: rows.length > input.limit ? items.at(-1)!.sequence : null,
  };
}

export function latestActivitySequence(): number {
  return (
    openDomainDb()
      .query<{ sequence: number | null }, []>(
        "SELECT MAX(id) AS sequence FROM activity_events",
      )
      .get()?.sequence ?? 0
  );
}

function toActivityDto(row: ActivityDbRow): ActivityDto {
  return {
    sequence: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    createdAt: row.created_at,
  };
}

const MAX_PAYLOAD_DEPTH = 1;
const MAX_PAYLOAD_ENTRIES = 32;
const MAX_PAYLOAD_STRING_BYTES = 128;
const PAYLOAD_KEY = /^[a-z][A-Za-z0-9]{0,63}$/;
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;
const HEX_DIGEST = /^[0-9a-f]{32,}$/;
const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const MIME = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/;

/**
 * Activity payloads are a public projection, so they carry only bounded stable
 * IDs, safe enums, booleans, finite numbers, and counts. Anything that could be
 * raw metadata, config, a provider response, an error, body text, a path or
 * locator, or a credential is rejected before it reaches SQLite.
 */
const FORBIDDEN_KEY_PARTS = [
  "auth", "body", "bucket", "command", "config", "credential", "digest",
  "dir", "env", "error", "file", "hash", "header", "key", "locator",
  "message", "metadata", "nonce", "options", "params", "password", "path",
  "payload", "profile", "prompt", "report", "request", "response", "secret",
  "sha", "signature", "text", "token", "uri", "url",
];

export function assertSafeActivityPayload(payload: JsonValue): JsonValue {
  if (!isPlainObject(payload)) {
    throw new Error("Activity payload must be a plain object");
  }
  assertSafeObject(payload, 0);
  return payload;
}

function assertSafeObject(value: Record<string, unknown>, depth: number): void {
  if (depth > MAX_PAYLOAD_DEPTH) {
    throw new Error("Activity payload is nested too deeply");
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_PAYLOAD_ENTRIES) {
    throw new Error("Activity payload has too many fields");
  }
  for (const [key, field] of entries) {
    if (!PAYLOAD_KEY.test(key)) {
      throw new Error(`Activity payload key is not allowed: ${key}`);
    }
    const lowered = key.toLowerCase();
    if (FORBIDDEN_KEY_PARTS.some((part) => lowered.includes(part))) {
      throw new Error(`Activity payload key is not allowed: ${key}`);
    }
    assertSafeField(key, field, depth);
  }
}

function assertSafeField(key: string, value: unknown, depth: number): void {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Activity payload number is not finite: ${key}`);
    }
    return;
  }
  if (typeof value === "string") {
    assertSafeString(key, value);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_PAYLOAD_ENTRIES) {
      throw new Error(`Activity payload list is too long: ${key}`);
    }
    for (const item of value) {
      if (isPlainObject(item) || Array.isArray(item)) {
        throw new Error(`Activity payload list must hold scalars: ${key}`);
      }
      assertSafeField(key, item, depth + 1);
    }
    return;
  }
  if (isPlainObject(value)) {
    assertSafeObject(value, depth + 1);
    return;
  }
  throw new Error(`Activity payload value is not allowed: ${key}`);
}

function assertSafeString(key: string, value: string): void {
  if (
    Buffer.byteLength(value, "utf8") > MAX_PAYLOAD_STRING_BYTES ||
    !PRINTABLE_ASCII.test(value)
  ) {
    throw new Error(`Activity payload string is not bounded ASCII: ${key}`);
  }
  if (HEX_DIGEST.test(value)) {
    throw new Error(`Activity payload string looks like a digest: ${key}`);
  }
  if (URL_SCHEME.test(value) || value.includes("\\")) {
    throw new Error(`Activity payload string looks like a locator: ${key}`);
  }
  // A single slash is a MIME type under the `mime` key and a path everywhere else.
  if (value.includes("/") && !(key === "mime" && MIME.test(value))) {
    throw new Error(`Activity payload string looks like a locator: ${key}`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}
