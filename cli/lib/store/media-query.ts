import { createHash } from "node:crypto";
import { decodeCursor, encodeCursor } from "./pagination.js";

export type MediaSort = "oldest" | "newest" | "name" | "size" | "selected";
export type MediaCursor = { value: string | number; id: string };
export const MEDIA_SORTS: readonly MediaSort[] = ["oldest", "newest", "name", "size", "selected"];
export const descendingMediaSort = (sort: MediaSort = "oldest") => sort !== "oldest" && sort !== "name";

export function mediaCursorScope(query: unknown): string {
  return createHash("sha256").update(JSON.stringify(query)).digest("hex");
}

export function encodeMediaCursor(cursor: MediaCursor, scope: string | null): string {
  if (scope === null) return encodeCursor("c1", { ordinal: cursor.value as number, id: cursor.id });
  return `m1.${Buffer.from(JSON.stringify([scope, cursor.value, cursor.id])).toString("base64url")}`;
}

export function decodeMediaCursor(cursor: string, scope: string | null, sort: MediaSort): MediaCursor {
  if (scope === null) {
    const legacy = decodeCursor("c1", cursor);
    return { value: legacy.ordinal, id: legacy.id };
  }
  try {
    if (typeof cursor !== "string" || cursor.length > 8_192 || !cursor.startsWith("m1.")) throw new Error();
    const value: unknown = JSON.parse(Buffer.from(cursor.slice(3), "base64url").toString("utf8"));
    if (!Array.isArray(value) || value.length !== 3 || value[0] !== scope
      || (sort === "name" ? typeof value[1] !== "string" : !Number.isSafeInteger(value[1]) || value[1] < (sort === "size" || sort === "selected" ? -1 : 0))
      || typeof value[2] !== "string" || !value[2] || value[2].length > 128) throw new Error();
    const result = { value: value[1] as string | number, id: value[2] };
    if (encodeMediaCursor(result, scope) !== cursor) throw new Error();
    return result;
  } catch {
    throw new Error("Invalid Media cursor for this query");
  }
}
