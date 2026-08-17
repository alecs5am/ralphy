import {
  lstat,
  mkdir,
  readFile,
} from "node:fs/promises";
import { join } from "node:path";
import {
  guardedAtomicWrite,
  type RenameFile,
} from "./atomic-write";
import { resolveContainedPath, validateLibraryRoot } from "./catalog";
import type {
  AnnotationInput,
  AnnotationStore,
  MediaAnnotation,
  ReviewStatus,
} from "./types";

const CURRENT_VERSION = 1;
const STORE_LIMIT_BYTES = 16 * 1024 * 1024;
const UPDATE_LIMIT_BYTES = 4 * 1024 * 1024;
const UPDATE_LIMIT_ITEMS = 1000;
const NOTES_LIMIT_CHARS = 2 * 1024 * 1024;
const REVIEW_STATUSES = new Set<ReviewStatus>([
  "Unreviewed",
  "Approved",
  "Shortlist",
  "Needs Work",
  "Reject",
]);
const writes = new Map<string, Promise<unknown>>();

export interface AnnotationOperationOptions {
  assertCurrent?: () => void;
  renameFile?: RenameFile;
}

function assertCurrent(options: AnnotationOperationOptions): void {
  options.assertCurrent?.();
}

function assertWritableVersion(version: number): void {
  if (version > CURRENT_VERSION) {
    throw new Error(`Cannot write newer annotation schema version ${version}`);
  }
}

export function validateAnnotationUpdates(
  value: unknown,
): Record<string, AnnotationInput> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid annotation updates");
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > UPDATE_LIMIT_ITEMS) {
    throw new Error("Annotation updates are limited to 1,000 items");
  }

  const updates: Record<string, AnnotationInput> = {};
  let encodedBytes = 2;
  for (const [id, raw] of entries) {
    if (!id || id.length > 256 || raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid annotation update");
    }
    const row = raw as Record<string, unknown>;
    if (
      typeof row.reviewStatus !== "string"
      || !REVIEW_STATUSES.has(row.reviewStatus as ReviewStatus)
      || typeof row.favorite !== "boolean"
      || typeof row.rating !== "number"
      || !Number.isFinite(row.rating)
      || row.rating < 0
      || row.rating > 5
      || !Array.isArray(row.tags)
      || row.tags.length > 100
      || !row.tags.every((tag) => typeof tag === "string" && tag.length <= 256)
      || typeof row.notes !== "string"
      || row.notes.length > NOTES_LIMIT_CHARS
    ) {
      throw new Error(`Invalid annotation for ${id}`);
    }
    const annotation: AnnotationInput = {
      reviewStatus: row.reviewStatus as ReviewStatus,
      favorite: row.favorite,
      rating: row.rating,
      tags: row.tags as string[],
      notes: row.notes,
    };
    encodedBytes += Buffer.byteLength(JSON.stringify(id))
      + Buffer.byteLength(JSON.stringify(annotation))
      + 2;
    if (encodedBytes > UPDATE_LIMIT_BYTES) {
      throw new Error("Annotation update payload is too large");
    }
    updates[id] = annotation;
  }
  return updates;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeAnnotation(value: unknown): MediaAnnotation {
  const row = objectValue(value);
  const reviewStatus = typeof row.reviewStatus === "string"
    && REVIEW_STATUSES.has(row.reviewStatus as ReviewStatus)
    ? row.reviewStatus as ReviewStatus
    : "Unreviewed";
  const rawRating = typeof row.rating === "number" && Number.isFinite(row.rating)
    ? row.rating
    : 0;
  const updatedAt = typeof row.updatedAt === "string"
    && Number.isFinite(Date.parse(row.updatedAt))
    ? row.updatedAt
    : new Date().toISOString();
  return {
    reviewStatus,
    favorite: typeof row.favorite === "boolean" ? row.favorite : false,
    rating: Math.min(5, Math.max(0, Math.round(rawRating))),
    tags: Array.isArray(row.tags)
      ? row.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    notes: typeof row.notes === "string" ? row.notes : "",
    updatedAt,
  };
}

function normalizeStore(value: unknown): AnnotationStore {
  const store = objectValue(value);
  const rawItems = objectValue(store.items);
  const items: Record<string, MediaAnnotation> = {};
  for (const [id, annotation] of Object.entries(rawItems)) {
    if (id) items[id] = normalizeAnnotation(annotation);
  }
  return {
    version: typeof store.version === "number"
      && Number.isInteger(store.version)
      && store.version > 0
      ? store.version
      : CURRENT_VERSION,
    items,
  };
}

async function paths(rootPath: string): Promise<{
  root: string;
  directory: string;
  store: string;
}> {
  const root = await validateLibraryRoot(rootPath);
  const directory = join(root, "media-library");
  return { root, directory, store: join(directory, "library.json") };
}

async function ensureStoreDirectory(
  rootPath: string,
  directory: string,
  options: AnnotationOperationOptions,
): Promise<void> {
  const info = await lstat(directory).catch(() => null);
  assertCurrent(options);
  if (info?.isSymbolicLink() || (info && !info.isDirectory())) {
    throw new Error("Annotation directory must be a real directory");
  }
  if (!info) {
    assertCurrent(options);
    await mkdir(directory);
  }
  await resolveContainedPath(rootPath, directory);
  assertCurrent(options);
}

export async function loadAnnotations(
  rootPath: string,
  options: AnnotationOperationOptions = {},
): Promise<AnnotationStore> {
  assertCurrent(options);
  const { root, store } = await paths(rootPath);
  assertCurrent(options);
  const info = await lstat(store).catch(() => null);
  assertCurrent(options);
  if (!info) return { version: CURRENT_VERSION, items: {} };
  const safeStore = await resolveContainedPath(root, store);
  assertCurrent(options);
  if (!info.isFile() || info.size > STORE_LIMIT_BYTES) {
    return { version: CURRENT_VERSION, items: {} };
  }
  let result: AnnotationStore;
  try {
    const data = await readFile(safeStore, "utf8");
    result = normalizeStore(JSON.parse(data));
  } catch {
    result = { version: CURRENT_VERSION, items: {} };
  }
  assertCurrent(options);
  return result;
}

export async function saveAnnotations(
  rootPath: string,
  value: AnnotationStore,
  options: AnnotationOperationOptions = {},
): Promise<AnnotationStore> {
  assertCurrent(options);
  assertWritableVersion(value.version);
  const normalized = normalizeStore(value);
  const { root, directory, store } = await paths(rootPath);
  assertCurrent(options);
  await ensureStoreDirectory(root, directory, options);
  const existing = await lstat(store).catch(() => null);
  assertCurrent(options);
  if (existing?.isSymbolicLink() || (existing && !existing.isFile())) {
    throw new Error("Annotation store must be a regular file");
  }

  const data = `${JSON.stringify(normalized, null, 2)}\n`;
  if (Buffer.byteLength(data) > STORE_LIMIT_BYTES) {
    throw new Error("Annotation store is too large");
  }
  await guardedAtomicWrite(store, data, {
    maxBytes: STORE_LIMIT_BYTES,
    assertCurrent: options.assertCurrent,
    renameFile: options.renameFile,
  });
  assertCurrent(options);
  return normalized;
}

export async function updateAnnotations(
  rootPath: string,
  value: unknown,
  options: AnnotationOperationOptions = {},
): Promise<AnnotationStore> {
  assertCurrent(options);
  const updates = validateAnnotationUpdates(value);
  const root = await validateLibraryRoot(rootPath);
  assertCurrent(options);
  const previous = writes.get(root) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    assertCurrent(options);
    const current = await loadAnnotations(root, options);
    assertWritableVersion(current.version);
    assertCurrent(options);
    const updatedAt = new Date().toISOString();
    for (const [id, annotation] of Object.entries(updates)) {
      if (!id) continue;
      current.items[id] = normalizeAnnotation({ ...annotation, updatedAt });
    }
    return saveAnnotations(root, current, options);
  });
  writes.set(root, next);
  try {
    const result = await next;
    assertCurrent(options);
    return result;
  } finally {
    if (writes.get(root) === next) writes.delete(root);
  }
}
