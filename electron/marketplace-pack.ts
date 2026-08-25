/* The Marketplace's local shelf: the catalog the routing pack carries.
 *
 * A user who downloads only the desktop app has no CLI checkout and may have no
 * network, so Skills, Prompts, Components, Templates, and Recipes cannot depend
 * on the public library CDN to exist at all. `ralphy prompts export` writes a
 * `catalog.json` beside the pack it produces, indexing every document that
 * actually travelled; scripts/vendor-prompt-pack.mjs vendors both into
 * resources/, and this module serves them to the renderer.
 *
 * Read from the BUNDLE, never from the installed copy under the user's library:
 * the installed copy is a directory the user can write to, and a marketplace
 * that renders whatever landed there would be rendering user input as catalog.
 *
 * The renderer never names a path. It asks for a catalog entry by id, and main
 * resolves the id against its own copy of the catalog -- so the reachable set is
 * exactly "the documents this pack indexed" with no traversal surface at all.
 */
import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { assertTrustedSender, toIpcResult } from "./ipc-security";
import {
  MEDIA_CHANNELS,
  type MarketplacePackCatalogDto,
  type MarketplacePackCategory,
  type MarketplacePackDocumentDto,
  type MarketplacePackEntryDto,
} from "./media/types";

const CATALOG_FILE = "catalog.json";
const MAX_ENTRIES = 1_024;
const MAX_ID = 256;
const MAX_TEXT = 1_024;
const MAX_TAGS = 16;
const MAX_PATH = 512;
const MAX_DOCUMENT = 512 * 1024;

const CATEGORIES = new Set<MarketplacePackCategory>([
  "skill", "prompt", "template", "recipe", "component",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}

/** A pack-relative document path: no absolute form, no traversal, no drive letter. */
function packPath(value: unknown): string | null {
  const raw = text(value, MAX_PATH);
  if (raw === null || raw.startsWith("/") || raw.includes("\\") || raw.includes("\0")) return null;
  const normalized = normalize(raw).split(sep).join("/");
  return normalized === raw && !raw.split("/").some((part) => part === "." || part === "..")
    ? raw
    : null;
}

function projectEntry(value: unknown): MarketplacePackEntryDto | null {
  const row = record(value);
  if (row === null) return null;
  const id = text(row.id, MAX_ID);
  const slug = text(row.slug, MAX_ID);
  const title = text(row.title, MAX_TEXT);
  const summary = text(row.summary, MAX_TEXT);
  const category = row.category as MarketplacePackCategory;
  if (id === null || slug === null || title === null || summary === null) return null;
  if (!CATEGORIES.has(category)) return null;
  /* `path: null` is a real state -- a template row indexed from the snapshot has
     no body here -- but a present path that does not project is a broken row. */
  const path = row.path === null ? null : packPath(row.path);
  if (row.path !== null && path === null) return null;
  const tags = Array.isArray(row.tags)
    ? row.tags.flatMap((tag) => {
      const value = text(tag, MAX_ID);
      return value === null ? [] : [value];
    }).slice(0, MAX_TAGS)
    : [];
  return { id, category, slug, title, summary, path, tags };
}

/** The bundled catalog, or a stated reason. A missing pack is a build fault, not a user state. */
export async function readMarketplacePackCatalog(bundled: string): Promise<MarketplacePackCatalogDto> {
  const raw = await readFile(join(bundled, CATALOG_FILE), "utf8").catch(() => null);
  if (raw === null) {
    return { schemaVersion: 1, cliVersion: null, entries: [], unavailable: "This build carries no bundled catalog" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { schemaVersion: 1, cliVersion: null, entries: [], unavailable: "The bundled catalog could not be read" };
  }
  const row = record(parsed);
  const source = Array.isArray(row?.entries) ? row.entries.slice(0, MAX_ENTRIES) : [];
  const seen = new Set<string>();
  const entries: MarketplacePackEntryDto[] = [];
  for (const candidate of source) {
    const entry = projectEntry(candidate);
    if (entry === null || seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  return {
    schemaVersion: 1,
    cliVersion: text(row?.cliVersion, MAX_ID),
    entries,
    unavailable: entries.length === 0 ? "The bundled catalog is empty" : null,
  };
}

/**
 * One catalog entry's document. The id is resolved against the catalog rather
 * than trusted as a path, so the renderer cannot reach a file the pack did not
 * index even if it asks for one.
 */
export async function readMarketplacePackDocument(
  bundled: string,
  id: string,
): Promise<MarketplacePackDocumentDto | null> {
  const catalog = await readMarketplacePackCatalog(bundled);
  const entry = catalog.entries.find((candidate) => candidate.id === id);
  if (entry === undefined || entry.path === null) return null;
  const body = await readFile(join(bundled, entry.path), "utf8").catch(() => null);
  if (body === null) return null;
  return {
    id: entry.id,
    path: entry.path,
    markdown: body.slice(0, MAX_DOCUMENT),
    truncated: body.length > MAX_DOCUMENT,
  };
}

interface PackIpcEvent {
  sender: unknown;
  senderFrame: unknown;
}

interface PackIpcWindow {
  isDestroyed(): boolean;
  webContents: { mainFrame: unknown };
}

export function registerMarketplacePackIpc(options: {
  handle(
    channel: string,
    listener: (event: PackIpcEvent, ...args: unknown[]) => Promise<unknown>,
  ): void;
  getWindow(): PackIpcWindow | null;
  bundledPack(): string;
}): void {
  options.handle(MEDIA_CHANNELS.loadMarketplacePackCatalog, (event, ...args) => toIpcResult(async () => {
    assertTrustedSender(event, options.getWindow());
    if (args.length !== 0) throw new Error("The bundled catalog accepts no input");
    return await readMarketplacePackCatalog(options.bundledPack());
  }));
  options.handle(MEDIA_CHANNELS.loadMarketplacePackDocument, (event, ...args) => toIpcResult(async () => {
    assertTrustedSender(event, options.getWindow());
    const id = typeof args[0] === "string" && args[0].length > 0 && args[0].length <= MAX_ID ? args[0] : null;
    if (args.length !== 1 || id === null) throw new Error("A catalog entry id is required");
    const document = await readMarketplacePackDocument(options.bundledPack(), id);
    if (document === null) throw new Error("That catalog entry carries no document in this build");
    return document;
  }));
}
