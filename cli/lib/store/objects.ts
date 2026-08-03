import { ingestObjectRow } from "./internal-objects.js";
import type {
  JsonValue,
  ObjectDto,
  ObjectStorageClass,
} from "./types.js";

export type ObjectScope = { workspaceId: string; projectId?: string };

export type ObjectIngestInput = {
  scope: ObjectScope;
  sourcePath: string;
  originalName: string;
  mime: string;
  storageClass: ObjectStorageClass;
  metadata?: JsonValue | null;
};

export async function ingestObject(
  input: ObjectIngestInput & { transfer?: "copy" | "move" },
): Promise<ObjectDto> {
  const row = await ingestObjectRow(input);
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    mime: row.mime,
    bytes: row.bytes,
    storageClass: row.storageClass,
    createdAt: row.createdAt,
  };
}
