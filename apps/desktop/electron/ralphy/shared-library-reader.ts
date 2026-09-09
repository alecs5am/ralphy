import { isAbsolute } from "node:path";
import { assertTrustedSender, toIpcResult } from "../ipc-security";
import {
  MEDIA_CHANNELS,
  type ProjectPreview,
} from "../media/types";
import type { RalphyBridgeClient } from "./client";
import type { RalphySession } from "./session";
import type {
  ArtifactMediaCardDto,
  ArtifactRevisionDto,
  BridgeMethod,
  MediaKind,
  MediaProvenance,
  Page,
  ParamsFor,
  ResultFor,
} from "./types";

const PAGE_LIMIT = 50;
const MEDIA_KINDS = new Set<MediaKind>(["image", "video", "audio", "document", "other"]);
const MEDIA_PROVENANCE = new Set<MediaProvenance>(["generation", "not-generation", "unknown"]);
const REVISION_STATES = new Set(["working", "candidate", "approved", "rejected", "superseded", "archived"]);

type Request = Pick<RalphyBridgeClient, "request">["request"];
type Mint = (absolutePath: string, mime: string | null, expectedBytes: number) => Promise<ProjectPreview>;
type Locator = { absolutePath: string; mime: string | null; bytes: number };

export type SharedLibraryQuery = {
  after?: string | null;
  mediaKind?: MediaKind;
  provenance?: MediaProvenance;
};
export type SharedLibraryAction = "open" | "finder";

export interface SharedLibraryReader {
  loadPage(workspaceId: string, query?: SharedLibraryQuery): Promise<Page<ArtifactMediaCardDto>>;
  loadArtifact(workspaceId: string, artifactId: string): Promise<ArtifactMediaCardDto>;
  loadRevisions(workspaceId: string, artifactId: string, after?: string | null): Promise<Page<ArtifactRevisionDto>>;
  selectRevision(workspaceId: string, artifactId: string, revisionId: string, expectedSelectedRevisionId: string | null): Promise<ArtifactMediaCardDto>;
  resolvePreview(workspaceId: string, artifactId: string): Promise<ProjectPreview | null>;
}

export interface SharedLibraryMainReader extends SharedLibraryReader {
  resolveActionLocator(workspaceId: string, artifactId: string, action: SharedLibraryAction): Promise<Locator>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function validId(value: unknown, max = 256): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function sequence(value: unknown, positive = false): value is number {
  return Number.isSafeInteger(value) && (value as number) >= (positive ? 1 : 0);
}

function workspaceContext(workspaceId: unknown): { workspaceId: string } {
  if (!validId(workspaceId)) throw new Error("Invalid Workspace identifier");
  return { workspaceId };
}

function cursor(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (!validId(value, 4096)) throw new Error("Invalid page cursor");
  return value;
}

function query(value: unknown): SharedLibraryQuery {
  if (value === undefined) return {};
  const input = record(value);
  if (!input || !Reflect.ownKeys(input).every((key) => (
    key === "after" || key === "mediaKind" || key === "provenance"
  )) || (input.mediaKind !== undefined && !MEDIA_KINDS.has(input.mediaKind as MediaKind))
    || (input.provenance !== undefined && !MEDIA_PROVENANCE.has(input.provenance as MediaProvenance))) {
    throw new Error("Invalid Shared Library query");
  }
  cursor(input.after);
  return input as SharedLibraryQuery;
}

function artifactCard(
  value: unknown,
  workspaceId: string,
  expectedArtifactId?: string,
  expectedRevisionId?: string,
): ArtifactMediaCardDto {
  const card = record(value);
  const ref = record(card?.ref);
  const target = card?.target === null ? null : record(card?.target);
  const selected = card?.selectedRevisionId !== null;
  if (!card || !exactKeys(card, [
    "ref", "workspaceId", "projectId", "slug", "kind", "selectedRevisionId", "selectedState",
    "mime", "bytes", "selectedAt", "revisionCount", "selectedObjectId", "storageClass", "usageRoles", "target",
    "mediaKind", "provenance",
  ]) || !ref || !exactKeys(ref, ["type", "id"]) || ref.type !== "artifact" || !validId(ref.id, 128)
    || (expectedArtifactId !== undefined && ref.id !== expectedArtifactId)
    || card.workspaceId !== workspaceId || card.projectId !== null
    || !validId(card.slug) || !validId(card.kind)
    || (selected ? !validId(card.selectedRevisionId, 128) : card.selectedRevisionId !== null)
    || (expectedRevisionId !== undefined && card.selectedRevisionId !== expectedRevisionId)
    || (card.selectedState !== null && !validId(card.selectedState, 128))
    || (card.mime !== null && !validId(card.mime, 1024))
    || (card.bytes !== null && !sequence(card.bytes))
    || (card.selectedAt !== null && !sequence(card.selectedAt))
    || !sequence(card.revisionCount)
    || (card.selectedObjectId !== null && !validId(card.selectedObjectId, 128))
    || selected !== (card.selectedObjectId !== null)
    || (card.storageClass !== null && !validId(card.storageClass, 128))
    || !Array.isArray(card.usageRoles)
    || !card.usageRoles.every((role) => validId(role, 256))
    || !MEDIA_KINDS.has(card.mediaKind as MediaKind)
    || !MEDIA_PROVENANCE.has(card.provenance as MediaProvenance)
    || (card.selectedObjectId === null
      ? target !== null
      : !target || !exactKeys(target, ["type", "id"])
        || target.type !== "object" || target.id !== card.selectedObjectId)) {
    throw new Error("Invalid workspace shared Artifact");
  }
  return value as ArtifactMediaCardDto;
}

function artifactPage(value: unknown, workspaceId: string): Page<ArtifactMediaCardDto> {
  const page = record(value);
  if (!page || !exactKeys(page, ["items", "nextCursor"]) || !Array.isArray(page.items)
    || page.items.length > PAGE_LIMIT
    || (page.nextCursor !== null && !validId(page.nextCursor, 4096))) {
    throw new Error("Invalid workspace shared Artifact page");
  }
  try {
    page.items.forEach((item) => artifactCard(item, workspaceId));
  } catch {
    throw new Error("Invalid workspace shared Artifact page");
  }
  return value as Page<ArtifactMediaCardDto>;
}

function artifactRevision(value: unknown, artifactId: string): value is ArtifactRevisionDto {
  const revision = record(value);
  return !!revision && exactKeys(revision, [
    "id", "artifactId", "objectId", "revisionNo", "parentRevisionId", "iterationId",
    "state", "authoredBySessionId", "createdAt",
  ]) && validId(revision.id, 128) && revision.artifactId === artifactId
    && validId(revision.objectId, 128) && sequence(revision.revisionNo, true)
    && (revision.parentRevisionId === null || validId(revision.parentRevisionId, 128))
    && (revision.iterationId === null || validId(revision.iterationId, 128))
    && REVISION_STATES.has(revision.state as string)
    && (revision.authoredBySessionId === null || validId(revision.authoredBySessionId, 128))
    && sequence(revision.createdAt);
}

function revisionPage(value: unknown, artifactId: string): Page<ArtifactRevisionDto> {
  const page = record(value);
  if (!page || !exactKeys(page, ["items", "nextCursor"]) || !Array.isArray(page.items)
    || page.items.length > PAGE_LIMIT || !page.items.every((item) => artifactRevision(item, artifactId))
    || (page.nextCursor !== null && !validId(page.nextCursor, 4096))) {
    throw new Error("Invalid Artifact revision page");
  }
  return value as Page<ArtifactRevisionDto>;
}

function locator(value: unknown, label: "preview" | "action"): Locator {
  const result = record(value);
  if (!result || !exactKeys(result, ["absolutePath", "mime", "bytes"])
    || !validId(result.absolutePath, 4096) || !isAbsolute(result.absolutePath)
    || (result.mime !== null && !validId(result.mime, 1024))
    || !sequence(result.bytes)) {
    throw new Error(`Invalid ${label} locator`);
  }
  return result as Locator;
}

export function createSharedLibraryReader({
  request,
  mint,
}: {
  request: Request;
  mint?: Mint;
}): SharedLibraryMainReader {
  async function loadArtifact(workspaceId: string, artifactId: string): Promise<ArtifactMediaCardDto> {
    const context = workspaceContext(workspaceId);
    if (!validId(artifactId, 128)) throw new Error("Invalid Artifact identifier");
    return artifactCard(await request("media.show", {
      context, ref: { type: "artifact", id: artifactId },
    }), context.workspaceId, artifactId);
  }

  return {
    async loadPage(workspaceId, rawQuery) {
      const context = workspaceContext(workspaceId);
      const input = query(rawQuery);
      const after = cursor(input.after);
      return artifactPage(await request("media.list", {
        context,
        ...(after ? { after } : {}),
        ...(input.mediaKind === undefined ? {} : { mediaKind: input.mediaKind }),
        ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
        limit: PAGE_LIMIT,
        types: ["artifact"],
      }), context.workspaceId);
    },

    loadArtifact,

    async loadRevisions(workspaceId, artifactId, after) {
      const context = workspaceContext(workspaceId);
      if (!validId(artifactId, 128)) throw new Error("Invalid Artifact identifier");
      const next = cursor(after);
      return revisionPage(await request("media.revisions", {
        context,
        ref: { type: "artifact", id: artifactId },
        ...(next ? { after: next } : {}),
        limit: PAGE_LIMIT,
      }), artifactId);
    },

    async selectRevision(workspaceId, artifactId, revisionId, expectedSelectedRevisionId) {
      const context = workspaceContext(workspaceId);
      if (!validId(artifactId, 128) || !validId(revisionId, 128)
        || (expectedSelectedRevisionId !== null && !validId(expectedSelectedRevisionId, 128))) {
        throw new Error("Invalid Artifact selection");
      }
      return artifactCard(await request("media.select", {
        context,
        ref: { type: "artifact", id: artifactId },
        revisionId,
        expectedSelectedRevisionId,
      }), context.workspaceId, artifactId, revisionId);
    },

    async resolvePreview(workspaceId, artifactId) {
      const card = await loadArtifact(workspaceId, artifactId);
      if (!card.target) return null;
      if (!mint) throw new Error("Shared Library previews are unavailable");
      const context = workspaceContext(workspaceId);
      const resolved = locator(await request("locator.resolve", {
        context, target: card.target, purpose: "preview",
      }), "preview");
      return mint(resolved.absolutePath, resolved.mime, resolved.bytes);
    },

    async resolveActionLocator(workspaceId, artifactId, action) {
      if (action !== "open" && action !== "finder") throw new Error("Invalid Shared Library action");
      const card = await loadArtifact(workspaceId, artifactId);
      if (!card.target) throw new Error("Shared Library Artifact has no resolvable target");
      const context = workspaceContext(workspaceId);
      return locator(await request("locator.resolve", {
        context, target: card.target, purpose: action,
      }), "action");
    },
  };
}

interface SharedLibraryIpcEvent {
  sender: unknown;
  senderFrame: unknown;
}

interface SharedLibraryIpcWindow {
  isDestroyed(): boolean;
  webContents: { mainFrame: unknown };
}

export function registerSharedLibraryIpc<Root>({
  handle,
  getWindow,
  captureRoot,
  assertRoot,
  session,
  mintTrustedLocator,
  authorizeTrustedLocator,
  openPath,
  showItemInFolder,
}: {
  handle(
    channel: string,
    listener: (event: SharedLibraryIpcEvent, ...args: unknown[]) => Promise<unknown>,
  ): void;
  getWindow(): SharedLibraryIpcWindow | null;
  captureRoot(): Root;
  assertRoot(root: Root): void;
  session: Pick<RalphySession, "client">;
  mintTrustedLocator(
    root: Root,
    absolutePath: string,
    mime: string | null,
    expectedBytes: number,
    assertCurrent: () => void,
  ): Promise<ProjectPreview>;
  authorizeTrustedLocator(
    root: Root,
    absolutePath: string,
    mime: string | null,
    expectedBytes: number,
    assertCurrent: () => void,
  ): Promise<string>;
  openPath(path: string): unknown;
  showItemInFolder(path: string): unknown;
}): void {
  const secured = (
    listener: (
      reader: SharedLibraryMainReader,
      root: Root,
      assertCurrent: () => void,
      ...args: unknown[]
    ) => unknown,
  ): ((event: SharedLibraryIpcEvent, ...args: unknown[]) => Promise<unknown>) => (
    (event, ...args) => toIpcResult(async () => {
      assertTrustedSender(event, getWindow());
      const root = captureRoot();
      const assertCurrent = () => {
        assertTrustedSender(event, getWindow());
        assertRoot(root);
      };
      assertCurrent();
      const request: Request = async <Method extends BridgeMethod>(
        method: Method,
        params: ParamsFor<Method>,
      ): Promise<ResultFor<Method>> => {
        assertCurrent();
        const result = await session.client.request(method, params);
        assertCurrent();
        return result;
      };
      const reader = createSharedLibraryReader({
        request,
        mint: (absolutePath, mime, expectedBytes) => mintTrustedLocator(
          root, absolutePath, mime, expectedBytes, assertCurrent,
        ),
      });
      const result = await listener(reader, root, assertCurrent, ...args);
      assertCurrent();
      return result;
    })
  );

  handle(MEDIA_CHANNELS.loadSharedLibraryPage, secured((reader, _root, _assertCurrent, rawWorkspaceId, rawQuery) => (
    reader.loadPage(rawWorkspaceId as string, rawQuery as SharedLibraryQuery | undefined)
  )));
  handle(MEDIA_CHANNELS.loadSharedLibraryArtifact, secured((reader, _root, _assertCurrent, rawWorkspaceId, rawArtifactId) => (
    reader.loadArtifact(rawWorkspaceId as string, rawArtifactId as string)
  )));
  handle(MEDIA_CHANNELS.loadSharedLibraryRevisions, secured((reader, _root, _assertCurrent, rawWorkspaceId, rawArtifactId, rawAfter) => (
    reader.loadRevisions(rawWorkspaceId as string, rawArtifactId as string, rawAfter as string | null | undefined)
  )));
  handle(MEDIA_CHANNELS.selectSharedLibraryRevision, secured((reader, _root, _assertCurrent, rawWorkspaceId, rawArtifactId, rawRevisionId, rawExpectedSelectedRevisionId) => (
    reader.selectRevision(
      rawWorkspaceId as string,
      rawArtifactId as string,
      rawRevisionId as string,
      rawExpectedSelectedRevisionId as string | null,
    )
  )));
  handle(MEDIA_CHANNELS.resolveSharedLibraryPreview, secured((reader, _root, _assertCurrent, rawWorkspaceId, rawArtifactId) => (
    reader.resolvePreview(rawWorkspaceId as string, rawArtifactId as string)
  )));
  handle(MEDIA_CHANNELS.performSharedLibraryAction, secured(async (reader, root, assertCurrent, rawWorkspaceId, rawArtifactId, rawAction) => {
    const action = rawAction as SharedLibraryAction;
    const resolved = await reader.resolveActionLocator(
      rawWorkspaceId as string,
      rawArtifactId as string,
      action,
    );
    assertCurrent();
    const path = await authorizeTrustedLocator(
      root, resolved.absolutePath, resolved.mime, resolved.bytes, assertCurrent,
    );
    assertCurrent();
    if (action === "open") await openPath(path);
    else showItemInFolder(path);
    return undefined;
  }));
}
