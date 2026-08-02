import type { Page } from "./types.js";

/**
 * Cursor families are deliberately non-interchangeable so a creation cursor can
 * never be replayed against a semantic ordinal:
 *
 * - `c1` pages creation-ordered roots by `(created_at, id)`.
 * - `v1` pages revision histories by `(revision_no, id)`.
 * - `p1` pages ordered children and Run results by `(position, id)`.
 */
export type CursorFamily = "c1" | "v1" | "p1";
export type CursorValue = { ordinal: number; id: string };

const MAX_CURSOR_BYTES = 256;
const MAX_ID_BYTES = 128;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

export function encodeCursor(family: CursorFamily, value: CursorValue): string {
  assertOrdinal(value.ordinal);
  assertId(value.id);
  const payload = Buffer.from(
    JSON.stringify([value.ordinal, value.id]),
    "utf8",
  ).toString("base64url");
  return `${family}.${payload}`;
}

export function decodeCursor(
  family: CursorFamily,
  cursor: string,
): CursorValue {
  if (typeof cursor !== "string" || Buffer.byteLength(cursor) > MAX_CURSOR_BYTES) {
    throw new Error("Cursor is malformed");
  }
  const prefix = `${family}.`;
  if (!cursor.startsWith(prefix)) throw new Error("Cursor family is invalid");
  const payload = cursor.slice(prefix.length);
  if (!BASE64URL.test(payload)) throw new Error("Cursor is malformed");
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Cursor is malformed");
  }
  if (!Array.isArray(decoded) || decoded.length !== 2) {
    throw new Error("Cursor is malformed");
  }
  const [ordinal, id] = decoded as [unknown, unknown];
  if (typeof ordinal !== "number" || typeof id !== "string") {
    throw new Error("Cursor is malformed");
  }
  assertOrdinal(ordinal);
  assertId(id);
  const value = { ordinal, id };
  // Canonical form only: anything that does not re-encode byte-for-byte was
  // hand-crafted rather than issued by this codec.
  if (encodeCursor(family, value) !== cursor) {
    throw new Error("Cursor is not canonical");
  }
  return value;
}

/**
 * Callers query `LIMIT limit + 1` ascending; the extra row is the only proof
 * that another page exists. Pages promise stable-set traversal, not snapshot
 * isolation.
 */
export function buildPage<T>(
  rows: T[],
  limit: number,
  family: CursorFamily,
  cursorOf: (row: T) => CursorValue,
): Page<T> {
  assertLimit(limit);
  const items = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  return {
    items,
    nextCursor: hasMore ? encodeCursor(family, cursorOf(items.at(-1)!)) : null,
  };
}

export function assertLimit(limit: number, max = 100): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    throw new Error(`Limit must be an integer from 1 through ${max}`);
  }
}

function assertOrdinal(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Cursor ordinal must be a non-negative safe integer");
  }
}

function assertId(value: string): void {
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes < 1 || bytes > MAX_ID_BYTES || !PRINTABLE_ASCII.test(value)) {
    throw new Error("Cursor identifier must be 1..128 printable ASCII bytes");
  }
}
