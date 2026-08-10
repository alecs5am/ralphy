import { randomUUID } from "node:crypto";
import { lstatSync } from "node:fs";
import { lstat } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { resolveContainedPath, validateLibraryRoot } from "./catalog";
import type {
  MediaKind,
  TrashResult,
} from "./types";

const PREVIEWABLE_KINDS = new Set<MediaKind>(["image", "video", "audio", "pdf"]);
const DEFAULT_MAX_ASSET_BYTES = 8 * 1024 * 1024 * 1024;
const DEFAULT_MAX_TOKENS = 4096;

function selectedFilePath(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 4096) {
    throw new Error("Invalid selected project file path");
  }
  return value;
}

export interface MediaByteRange {
  start: number;
  end: number;
}

export interface MintedMedia {
  token: string;
  sizeBytes: number;
}

export function resolveMediaByteRange(
  value: string | null,
  size: number,
): MediaByteRange | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(requestedEnd)
    || start < 0
    || start >= size
    || requestedEnd < start
  ) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

export class MediaProtocolAccess {
  readonly #maxAssetBytes: number;
  readonly #maxTokens: number;
  readonly #allowedPaths = new Map<string, MediaKind>();
  readonly #pathsByToken = new Map<string, string>();
  readonly #tokensByPath = new Map<string, string>();
  #rootPath: string | null = null;

  constructor(options: { maxAssetBytes?: number; maxTokens?: number } = {}) {
    this.#maxAssetBytes = Math.max(1, Math.floor(
      options.maxAssetBytes ?? DEFAULT_MAX_ASSET_BYTES,
    ));
    this.#maxTokens = Math.max(1, Math.floor(options.maxTokens ?? DEFAULT_MAX_TOKENS));
  }

  clear(): void {
    this.#rootPath = null;
    this.#allowedPaths.clear();
    this.#pathsByToken.clear();
    this.#tokensByPath.clear();
  }

  async mint(
    rootPath: string,
    requestedPath: string,
    assertCurrent: () => void = () => undefined,
  ): Promise<MintedMedia> {
    assertCurrent();
    const path = await this.resolveFile(rootPath, requestedPath);
    assertCurrent();
    const sizeBytes = await this.#validatePreview(path);
    assertCurrent();
    const existing = this.#tokensByPath.get(path);
    if (existing) return { token: existing, sizeBytes };

    const token = randomUUID();
    this.#pathsByToken.set(token, path);
    this.#tokensByPath.set(path, token);
    while (this.#pathsByToken.size > this.#maxTokens) {
      const oldest = this.#pathsByToken.entries().next().value as [string, string] | undefined;
      if (!oldest) break;
      this.#pathsByToken.delete(oldest[0]);
      this.#tokensByPath.delete(oldest[1]);
    }
    return { token, sizeBytes };
  }

  async mintTrustedLocator(
    rootPath: string,
    requestedPath: string,
    mime: string | null,
    expectedBytes: number,
    assertCurrent: () => void = () => undefined,
  ): Promise<MintedMedia> {
    assertCurrent();
    const root = await validateLibraryRoot(rootPath);
    assertCurrent();
    if (this.#rootPath !== root) this.clear();
    this.#rootPath = root;
    const path = await resolveContainedPath(rootPath, requestedPath).catch(() => {
      throw new Error("Locator is outside the active library");
    });
    assertCurrent();
    const kind = mime?.startsWith("image/") ? "image"
      : mime?.startsWith("video/") ? "video"
      : mime?.startsWith("audio/") ? "audio"
      : mime === "application/pdf" ? "pdf"
      : null;
    if (!kind) throw new Error("Unsupported preview locator");
    const info = await lstat(path);
    assertCurrent();
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Locator is not a regular file");
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || info.size !== expectedBytes) {
      throw new Error("Locator size changed");
    }
    this.#allowedPaths.set(path, kind);
    const minted = await this.mint(rootPath, path, assertCurrent);
    assertCurrent();
    return minted;
  }

  async resolve(
    rootPath: string,
    token: string,
    assertCurrent: () => void = () => undefined,
  ): Promise<string> {
    assertCurrent();
    const path = this.#pathsByToken.get(token);
    if (!path) throw new Error("Unknown media token");
    const resolved = await this.resolveFile(rootPath, path);
    assertCurrent();
    await this.#validatePreview(resolved);
    assertCurrent();
    return resolved;
  }

  async resolveFile(
    rootPath: string,
    requestedPath: unknown,
    allowedKinds?: readonly MediaKind[],
  ): Promise<string> {
    const requested = selectedFilePath(requestedPath);
    const root = await validateLibraryRoot(rootPath);
    if (root !== this.#rootPath) throw new Error("Media scan is no longer active");
    const path = await resolveContainedPath(rootPath, requested).catch(() => {
      throw new Error("Path is not selected project media");
    });
    this.#assertAllowed(path, allowedKinds);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Media path is not a regular file");
    return path;
  }

  resolveFileForDrag(rootPath: string, requestedPath: unknown): string {
    const path = selectedFilePath(requestedPath);
    if (rootPath !== this.#rootPath) throw new Error("Media scan is no longer active");
    this.#assertAllowed(path);

    const relativePath = relative(rootPath, path);
    if (
      !relativePath
      || relativePath === ".."
      || relativePath.startsWith(`..${sep}`)
      || isAbsolute(relativePath)
    ) {
      throw new Error("Path is not selected project media");
    }

    let current = rootPath;
    let leaf: ReturnType<typeof lstatSync> | null = null;
    for (const segment of relativePath.split(sep)) {
      current = join(current, segment);
      try {
        leaf = lstatSync(current);
      } catch {
        throw new Error("Media path is not a regular file");
      }
      if (leaf.isSymbolicLink()) {
        throw new Error("Media path contains a symbolic link");
      }
    }
    if (!leaf?.isFile()) throw new Error("Media path is not a regular file");
    return path;
  }

  #assertAllowed(path: string, allowedKinds?: readonly MediaKind[]): void {
    const kind = this.#allowedPaths.get(path);
    if (!kind) throw new Error("Path is not selected project media");
    if (allowedKinds && !allowedKinds.includes(kind)) {
      throw new Error("Unsupported selected project file type");
    }
  }

  async #validatePreview(path: string): Promise<number> {
    const kind = this.#allowedPaths.get(path);
    if (!kind || !PREVIEWABLE_KINDS.has(kind)) throw new Error("Unsupported media kind");
    const info = await lstat(path);
    if (info.size > this.#maxAssetBytes) throw new Error("Media exceeds the size limit");
    return info.size;
  }
}

export async function trashAuthorizedItems(
  rootPath: string,
  paths: string[],
  access: MediaProtocolAccess,
  trashItem: (path: string) => Promise<void>,
  assertCurrent: () => void = () => undefined,
): Promise<TrashResult> {
  const result: TrashResult = { trashed: [], failed: [] };
  for (const path of paths) {
    let authorizedPath: string;
    try {
      authorizedPath = await access.resolveFile(rootPath, path);
    } catch (error) {
      result.failed.push({
        path,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    assertCurrent();
    try {
      await trashItem(authorizedPath);
      result.trashed.push(authorizedPath);
    } catch (error) {
      result.failed.push({
        path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    assertCurrent();
  }
  assertCurrent();
  return result;
}
