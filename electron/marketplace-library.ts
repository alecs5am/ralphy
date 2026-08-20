import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { parseDocument } from "htmlparser2";
import { assertTrustedSender, toIpcResult } from "./ipc-security";
import { guardedAtomicWrite } from "./media/atomic-write";
import {
  MEDIA_CHANNELS,
  type MarketplaceJsonValue,
  type MarketplacePublicItemDto,
  type MarketplacePublicSnapshotDto,
  type MarketplaceRecipeDto,
  type MarketplaceRecipeKind,
} from "./media/types";

const PUBLIC_LIBRARY_URL = "https://ralphy.b-cdn.net/library/library.json";
const PUBLIC_LIBRARY_ORIGIN = "https://ralphy.b-cdn.net";
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_BLOCKS = 1_024;
const MAX_ITEMS = 512;
const MAX_OBJECT_KEYS = 64;
const MAX_JSON_ENTRIES = 64;
const MAX_JSON_DEPTH = 4;
const MAX_JSON_STRING = 4_096;
const MAX_BODY = 64 * 1024;
const CACHE_WRITE_WARNING = "Catalog loaded, but its local cache could not be updated";
const UNAVAILABLE_ERROR = "Marketplace catalog is unavailable";
const RECIPE_KINDS = new Set<MarketplaceRecipeKind>([
  "ffmpeg", "encode", "overlay", "bake", "hyperframes", "prompt",
]);

export interface MarketplaceLibraryOptions {
  fetcher: typeof fetch;
  cachePath: string;
  now(): number;
}

type RecordValue = Record<string, unknown>;
type HtmlNode = {
  type?: string;
  name?: string;
  data?: string;
  children?: HtmlNode[];
};

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function boundedRecord(value: unknown): RecordValue | null {
  const result = record(value);
  if (!result || Reflect.ownKeys(result).length > MAX_OBJECT_KEYS) return null;
  return result;
}

function stripHtml(value: string): string {
  const dropped = new Set(["script", "style", "iframe", "object", "embed", "template"]);
  const visit = (node: HtmlNode): string => {
    if (node.name && dropped.has(node.name.toLocaleLowerCase())) return "";
    if (node.type === "text") return node.data ?? "";
    const text = node.children?.map(visit).join("") ?? "";
    return node.name?.toLocaleLowerCase() === "br" ? `${text}\n` : text;
  };
  return visit(parseDocument(value, { decodeEntities: false }) as unknown as HtmlNode);
}

function sanitizeMarketplaceProse(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" || value.length > maxLength) return null;
  const sanitized = stripHtml(value).trim();
  return sanitized.length > 0 && sanitized.length <= maxLength ? sanitized : null;
}

function sanitizeMarketplaceMarkdown(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" || value.length > maxLength) return null;
  const sanitized = stripHtml(value);
  return sanitized.length <= maxLength ? sanitized : null;
}

function projectMarketplaceArtifact(value: unknown): string | null {
  return typeof value === "string" && value.length <= MAX_BODY ? value : null;
}

function validateMarketplaceAssetUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048 || value.includes("\\")) {
    return null;
  }
  const rawPath = value.match(/^https:\/\/[^/?#]+([^?#]*)$/)?.[1];
  if (
    rawPath === undefined
    || rawPath.includes("//")
    || rawPath.split("/").some((part) => part === "." || part === "..")
    || /%(?:25)*(?:00|2e|2f|5c)/i.test(rawPath)
  ) return null;
  try {
    const url = new URL(value);
    decodeURIComponent(url.pathname);
    if (
      url.protocol !== "https:"
      || url.origin !== PUBLIC_LIBRARY_ORIGIN
      || url.username !== ""
      || url.password !== ""
      || (url.port !== "" && url.port !== "443")
      || url.search !== ""
      || url.hash !== ""
      || !(url.pathname.startsWith("/blocks/") || url.pathname.startsWith("/units/"))
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

type JsonProjection =
  | { valid: true; value: MarketplaceJsonValue }
  | { valid: false };

function projectJsonValue(value: unknown, depth = 0): JsonProjection {
  if (value === null || typeof value === "boolean") return { valid: true, value };
  if (typeof value === "number") {
    return Number.isFinite(value) ? { valid: true, value } : { valid: false };
  }
  if (typeof value === "string") {
    return value.length <= MAX_JSON_STRING ? { valid: true, value } : { valid: false };
  }
  if (depth >= MAX_JSON_DEPTH) return { valid: false };
  if (Array.isArray(value)) {
    if (value.length > MAX_JSON_ENTRIES) return { valid: false };
    const result: MarketplaceJsonValue[] = [];
    for (const entry of value) {
      const projected = projectJsonValue(entry, depth + 1);
      if (!projected.valid) return projected;
      result.push(projected.value);
    }
    return { valid: true, value: result };
  }
  const source = boundedRecord(value);
  if (!source) return { valid: false };
  const result: { [key: string]: MarketplaceJsonValue } = {};
  for (const [key, entry] of Object.entries(source)) {
    if (key.length > MAX_JSON_STRING) return { valid: false };
    const projected = projectJsonValue(entry, depth + 1);
    if (!projected.valid) return projected;
    Object.defineProperty(result, key, {
      value: projected.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return { valid: true, value: result };
}

function projectDemo(value: unknown): MarketplaceRecipeDto["demo"] {
  const source = boundedRecord(value);
  if (!source || (source.kind !== "hyperframes" && source.kind !== "media")) return null;
  return {
    kind: source.kind,
    storageUrl: validateMarketplaceAssetUrl(source.storageUrl),
    beforeUrl: validateMarketplaceAssetUrl(source.beforeUrl),
    afterUrl: validateMarketplaceAssetUrl(source.afterUrl),
    posterUrl: validateMarketplaceAssetUrl(source.posterUrl),
  };
}

function projectRecipe(source: RecordValue): MarketplaceRecipeDto {
  const parameters = projectJsonValue(source.params);
  return {
    kind: typeof source.recipeKind === "string" && RECIPE_KINDS.has(source.recipeKind as MarketplaceRecipeKind)
      ? source.recipeKind as MarketplaceRecipeKind
      : null,
    body: sanitizeMarketplaceMarkdown(source.body, MAX_BODY),
    artifact: projectMarketplaceArtifact(source.artifact),
    parameters: parameters.valid ? parameters.value : null,
    demo: projectDemo(source.demo),
  };
}

export function projectMarketplacePublicDocument(value: unknown): MarketplacePublicItemDto[] {
  const source = boundedRecord(value);
  if (!source || source.schemaVersion !== 1 || !Array.isArray(source.blocks) || source.blocks.length > MAX_BLOCKS) {
    throw new Error("Invalid Marketplace catalog");
  }
  const items: MarketplacePublicItemDto[] = [];
  const ids = new Set<string>();
  for (const rawBlock of source.blocks) {
    const block = boundedRecord(rawBlock);
    if (!block) throw new Error("Invalid Marketplace catalog block");
    if (block.kind !== "template" && block.kind !== "recipe") continue;
    const id = typeof block.id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(block.id)
      ? block.id
      : null;
    const name = sanitizeMarketplaceProse(block.name, 160);
    const summary = sanitizeMarketplaceProse(block.blurb, 2_048);
    if (!id || !name || !summary) continue;
    if (ids.has(id)) throw new Error("Duplicate Marketplace catalog identifier");
    ids.add(id);
    const referenceUrls = Array.isArray(block.refs)
      ? block.refs.map(validateMarketplaceAssetUrl).filter((url): url is string => url !== null).slice(0, 8)
      : [];
    items.push({
      id,
      category: block.kind,
      name,
      summary,
      referenceUrls,
      recipe: block.kind === "recipe" ? projectRecipe(block) : null,
    });
    if (items.length > MAX_ITEMS) throw new Error("Marketplace catalog has too many items");
  }
  return items;
}

function boundedHeader(headers: Headers, name: string): string | null {
  const value = headers.get(name);
  if (value === null) return null;
  if (value.length > 128) throw new Error("Marketplace catalog header is too large");
  return value;
}

function boundedLastModified(headers: Headers): string | null {
  const value = boundedHeader(headers, "last-modified");
  return value !== null && Number.isFinite(Date.parse(value)) ? value : null;
}

async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const rawLength = boundedHeader(response.headers, "content-length");
  let declaredLength: number | null = null;
  if (rawLength !== null) {
    if (!/^(?:0|[1-9]\d*)$/.test(rawLength)) throw new Error("Invalid Marketplace catalog length");
    declaredLength = Number(rawLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength > maxBytes) {
      throw new Error("Marketplace catalog is too large");
    }
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Marketplace catalog body is unavailable");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Marketplace catalog is too large");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  if (declaredLength !== null && size !== declaredLength) {
    throw new Error("Marketplace catalog length mismatch");
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function strictRecipe(value: unknown): MarketplaceRecipeDto | null | undefined {
  if (value === null) return null;
  const recipe = boundedRecord(value);
  if (!recipe || !exactKeys(recipe, ["kind", "body", "artifact", "parameters", "demo"])) return undefined;
  if (recipe.kind !== null && (typeof recipe.kind !== "string" || !RECIPE_KINDS.has(recipe.kind as MarketplaceRecipeKind))) return undefined;
  const body = recipe.body === null ? null : sanitizeMarketplaceMarkdown(recipe.body, MAX_BODY);
  if (body !== recipe.body) return undefined;
  const artifact = projectMarketplaceArtifact(recipe.artifact);
  if (artifact !== recipe.artifact) return undefined;
  const parameters = projectJsonValue(recipe.parameters);
  if (!parameters.valid || JSON.stringify(parameters.value) !== JSON.stringify(recipe.parameters)) return undefined;
  let demo: MarketplaceRecipeDto["demo"] = null;
  if (recipe.demo !== null) {
    const rawDemo = boundedRecord(recipe.demo);
    if (!rawDemo || !exactKeys(rawDemo, ["kind", "storageUrl", "beforeUrl", "afterUrl", "posterUrl"])) return undefined;
    demo = projectDemo(rawDemo);
    if (!demo || JSON.stringify(demo) !== JSON.stringify(rawDemo)) return undefined;
  }
  return {
    kind: recipe.kind as MarketplaceRecipeKind | null,
    body,
    artifact,
    parameters: parameters.value,
    demo,
  };
}

function strictCachedSnapshot(value: unknown): MarketplacePublicSnapshotDto {
  const snapshot = boundedRecord(value);
  if (!snapshot || !exactKeys(snapshot, [
    "schemaVersion", "source", "refreshedAt", "sourceUpdatedAt", "warning", "items",
  ])) throw new Error("Invalid Marketplace cache");
  if (
    snapshot.schemaVersion !== 1
    || snapshot.source !== "live"
    || typeof snapshot.refreshedAt !== "string"
    || new Date(snapshot.refreshedAt).toISOString() !== snapshot.refreshedAt
    || (snapshot.sourceUpdatedAt !== null && (
      typeof snapshot.sourceUpdatedAt !== "string"
      || snapshot.sourceUpdatedAt.length > 128
      || !Number.isFinite(Date.parse(snapshot.sourceUpdatedAt))
    ))
    || snapshot.warning !== null
    || !Array.isArray(snapshot.items)
    || snapshot.items.length > MAX_ITEMS
  ) throw new Error("Invalid Marketplace cache");
  const ids = new Set<string>();
  const items = snapshot.items.map((value): MarketplacePublicItemDto => {
    const item = boundedRecord(value);
    if (!item || !exactKeys(item, ["id", "category", "name", "summary", "referenceUrls", "recipe"])) {
      throw new Error("Invalid Marketplace cache item");
    }
    if (
      typeof item.id !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(item.id)
      || ids.has(item.id)
      || (item.category !== "template" && item.category !== "recipe")
      || sanitizeMarketplaceProse(item.name, 160) !== item.name
      || sanitizeMarketplaceProse(item.summary, 2_048) !== item.summary
      || !Array.isArray(item.referenceUrls)
      || item.referenceUrls.length > 8
      || item.referenceUrls.some((url) => validateMarketplaceAssetUrl(url) !== url)
    ) throw new Error("Invalid Marketplace cache item");
    const recipe = strictRecipe(item.recipe);
    if (recipe === undefined || (item.category === "template" ? recipe !== null : recipe === null)) {
      throw new Error("Invalid Marketplace cache recipe");
    }
    ids.add(item.id);
    return {
      id: item.id,
      category: item.category,
      name: item.name as string,
      summary: item.summary as string,
      referenceUrls: item.referenceUrls as string[],
      recipe,
    };
  });
  return {
    schemaVersion: 1,
    source: "live",
    refreshedAt: snapshot.refreshedAt,
    sourceUpdatedAt: snapshot.sourceUpdatedAt as string | null,
    warning: null,
    items,
  };
}

async function readCache(cachePath: string): Promise<MarketplacePublicSnapshotDto> {
  const info = await lstat(cachePath);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw new Error("Invalid Marketplace cache");
  const file = await open(cachePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const current = await file.stat();
    if (!current.isFile() || current.size > MAX_BYTES) throw new Error("Invalid Marketplace cache");
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let size = 0;
    while (size <= MAX_BYTES) {
      const { bytesRead } = await file.read(buffer, size, buffer.length - size, size);
      if (bytesRead === 0) break;
      size += bytesRead;
    }
    if (size > MAX_BYTES) throw new Error("Invalid Marketplace cache");
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size)));
    return strictCachedSnapshot(parsed);
  } finally {
    await file.close();
  }
}

export async function loadMarketplacePublicLibrary(
  options: MarketplaceLibraryOptions,
): Promise<MarketplacePublicSnapshotDto> {
  try {
    const response = await options.fetcher(PUBLIC_LIBRARY_URL, {
      headers: { accept: "application/json" },
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (
      response.status !== 200
      || response.redirected
      || response.url !== PUBLIC_LIBRARY_URL
    ) throw new Error("Invalid Marketplace catalog response");
    const contentType = boundedHeader(response.headers, "content-type");
    if (!contentType || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
      throw new Error("Invalid Marketplace catalog content type");
    }
    const sourceUpdatedAt = boundedLastModified(response.headers);
    const items = projectMarketplacePublicDocument(await readBoundedJson(response, MAX_BYTES));
    const snapshot = {
      schemaVersion: 1,
      source: "live",
      refreshedAt: new Date(options.now()).toISOString(),
      sourceUpdatedAt,
      warning: null,
      items,
    } satisfies MarketplacePublicSnapshotDto;
    try {
      await guardedAtomicWrite(options.cachePath, JSON.stringify(snapshot), { maxBytes: MAX_BYTES });
      return snapshot;
    } catch {
      return { ...snapshot, warning: CACHE_WRITE_WARNING };
    }
  } catch {
    try {
      const cached = await readCache(options.cachePath);
      return { ...cached, source: "cache" };
    } catch {
      throw new Error(UNAVAILABLE_ERROR);
    }
  }
}

interface MarketplaceIpcWindow {
  isDestroyed(): boolean;
  webContents: { mainFrame: unknown };
}

interface MarketplaceIpcEvent {
  sender: unknown;
  senderFrame: unknown;
}

export function registerMarketplaceLibraryIpc<Root>(options: {
  handle(
    channel: string,
    listener: (event: MarketplaceIpcEvent, ...args: unknown[]) => Promise<unknown>,
  ): void;
  getWindow(): MarketplaceIpcWindow | null;
  captureRoot(): Root;
  assertRoot(root: Root): void;
  fetcher: typeof fetch;
  cachePath: string;
  now(): number;
}): void {
  options.handle(MEDIA_CHANNELS.loadMarketplacePublicLibrary, (event, ...args) => toIpcResult(async () => {
    assertTrustedSender(event, options.getWindow());
    if (args.length !== 0) throw new Error("Marketplace catalog accepts no input");
    const root = options.captureRoot();
    const snapshot = await loadMarketplacePublicLibrary(options);
    options.assertRoot(root);
    return snapshot;
  }));
}
