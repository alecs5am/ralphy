import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ralphDir } from "../paths.js";
import { DomainError } from "../errors/domain.js";
import { appendActivity } from "./activity.js";
import { addArtifactRevisionInTransaction } from "./artifacts.js";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { assertSafeStorePath, hashSafeStoreFile, prepareObject, registerPreparedObject, type PreparedObject } from "./internal-objects.js";
import { resolveQueryContext, type QueryContext } from "./scope-context.js";
import { createUnitWithRevision, getUnit, getUnitRevision, listPresentationCaptionRevisions, listPresentationItems, listUnitItems, listUnitPresentations, reviseUnit, type UnitItemInput, type UnitPresentationInput } from "./units.js";
import { type JsonValue, type Page, type UnitDto } from "./types.js";

type MediaFile = { path: string; name: string; mime: string };
export type SaveUnitMediaInput = {
  context: QueryContext;
  key: string;
  unitId?: string;
  expectedLatestRevisionId?: string | null;
  name?: string;
  kind: "image" | "video" | "audio";
  file: MediaFile;
  references: MediaFile[];
  provenance: JsonValue;
};
export type SavedUnitMedia = { workspaceId: string; projectId: string | null; unitId: string; revisionId: string; revisionNo: number; label: string; alreadySaved: boolean };

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".txt": "text/plain", ".md": "text/markdown", ".json": "application/json" };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const invalid = (reason: string) => new DomainError("E_INPUT_INVALID", reason, { reason });
const conflict = (reason: string) => new DomainError("E_CONFLICT", reason, { reason });
const canonical = (value: JsonValue): JsonValue => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
function all<T>(load: (after?: string) => Page<T>): T[] {
  const rows: T[] = []; let after: string | undefined;
  do { const page = load(after); rows.push(...page.items); after = page.nextCursor ?? undefined; } while (after);
  return rows;
}

/** Copies the immutable presentation graph; publishing/default selection are separate actions. */
function revisionContents(context: QueryContext, unit: UnitDto, kind: string) {
  if (unit.format !== kind) throw invalid(`Choose an existing ${kind} Unit. Other Unit formats cannot be replaced by this result.`);
  const revisionId = unit.latestRevisionId;
  if (!revisionId) return { items: [], presentations: [], position: 0 };
  const items = all((after) => listUnitItems({ context, revisionId, after, limit: 100 }));
  const db = openDomainDb();
  const candidates = items.filter((item) => item.artifactRevisionId && db.query<{ mime: string }, [string]>("SELECT objects.mime FROM artifact_revisions JOIN objects ON objects.id = artifact_revisions.object_id WHERE artifact_revisions.id = ?").get(item.artifactRevisionId)?.mime.startsWith(`${kind}/`));
  const primary = candidates.filter((item) => ["master", "primary"].includes(item.role));
  const chosen = primary.length === 1 ? primary[0] : candidates.length === 1 ? candidates[0] : null;
  if (!chosen) throw invalid("This Unit has multiple primary media items or no compatible media. Save this result as a new Unit.");
  const presentations: UnitPresentationInput[] = all((after) => listUnitPresentations({ context, revisionId, after, limit: 100 })).map((presentation) => {
    const captions = all((after) => listPresentationCaptionRevisions({ context, presentationId: presentation.id, after, limit: 100 })).sort((a, b) => a.revisionNo - b.revisionNo);
    const effective = captions.findIndex((caption) => caption.id === presentation.effectiveCaptionRevisionId);
    return {
      platform: presentation.platform, position: presentation.position, coverArtifactRevisionId: presentation.coverArtifactRevisionId,
      crop: presentation.crop, safeArea: presentation.safeArea, options: presentation.options,
      captions: captions.map(({ state, text }) => ({ state, text })), effectiveCaptionRevisionNo: effective < 0 ? null : effective + 1,
      items: all((after) => listPresentationItems({ context, presentationId: presentation.id, after, limit: 100 })).map((item) => {
        const original = items.find((candidate) => candidate.id === item.unitItemId);
        if (!original) throw invalid("Unit presentation refers to a missing item");
        return { unitItemPosition: original.position, position: item.position, config: item.config };
      }),
    };
  });
  return { items: items.map(({ artifactRevisionId, documentRevisionId, role, position, config }) => ({ artifactRevisionId, documentRevisionId, role, position, config })), presentations, position: chosen.position };
}

/** One transaction owns the receipt, media references, and sealed Unit revision. */
export async function saveUnitMedia(input: SaveUnitMediaInput): Promise<SavedUnitMedia> {
  if (!/^[a-f0-9]{64}$/.test(input.key) || !["image", "video", "audio"].includes(input.kind) || !Array.isArray(input.references) || input.references.length > 100) throw invalid("Invalid generated media save request");
  if (input.unitId !== undefined && (typeof input.unitId !== "string" || !Object.hasOwn(input, "expectedLatestRevisionId"))) throw invalid("Choose a Unit and its current revision");
  const name = input.name?.trim();
  if (!input.unitId && (!name || name.length > 120 || /[\x00-\x1f]/.test(name))) throw invalid("Enter a Unit name between 1 and 120 characters");
  const provenance = canonical(input.provenance);
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance) || JSON.stringify(provenance).length > 1_048_576) throw invalid("Invalid generation provenance");
  const db = openDomainDb(), scope = resolveQueryContext(db, input.context);
  const root = await fs.realpath(ralphDir());
  const base = path.join(root, "media-library", "canvases", scope.workspaceId, "assets");
  await assertSafeStorePath(root, base);
  const files = await Promise.all([input.file, ...input.references].map(async (file) => {
    if (!file || typeof file.path !== "string" || typeof file.name !== "string" || !file.name || file.name.length > 2000 || path.basename(file.name) !== file.name || MIME[path.extname(file.path).toLowerCase()] !== file.mime) throw invalid("Invalid generated media file");
    const local = path.relative(base, file.path);
    if (!local || local.startsWith("..") || path.isAbsolute(local)) throw invalid("Generated files must belong to this workspace's Canvas assets");
    const info = await fs.lstat(file.path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 250 * 1024 * 1024) throw invalid("Generated files must be regular files under 250 MB");
    return { ...file, ...await hashSafeStoreFile(root, file.path) };
  }));
  if (!files[0].mime.startsWith(`${input.kind}/`)) throw invalid("Generated output does not match the Unit format");
  const fingerprint = digest(JSON.stringify({ kind: input.kind, provenance, files: files.map(({ name, mime, bytes, sha256 }) => ({ name, mime, bytes, sha256 })) }));
  const lookup = (): SavedUnitMedia | null => {
    const match = db.query<{ revisionId: string; fingerprint: string; unitId: string }, [string, string | null, string, string, string | null, string | null]>(`SELECT revision.id AS revisionId, unit.id AS unitId, json_extract(revision.metadata_json, '$.generationSave.fingerprint') AS fingerprint
      FROM unit_revisions revision JOIN units unit ON unit.id = revision.unit_id
      WHERE unit.workspace_id = ? AND unit.project_id IS ? AND json_extract(revision.metadata_json, '$.generationSave.key') = ?
      AND json_extract(revision.metadata_json, '$.generationSave.mode') = ? AND (? IS NULL OR unit.id = ?)
      ORDER BY revision.created_at LIMIT 1`).get(scope.workspaceId, scope.projectId, input.key, input.unitId ? "revision" : "new", input.unitId ?? null, input.unitId ?? null);
    if (!match) return null;
    if (match.fingerprint !== fingerprint) throw conflict("This result was already saved with different media or generation details. Keep the saved Unit and choose an unchanged result.");
    return receipt(match.unitId, match.revisionId, true);
  };
  const receipt = (unitId: string, revisionId: string, alreadySaved: boolean): SavedUnitMedia => {
    const unit = getUnit({ context: input.context, unitId }), revision = getUnitRevision({ context: input.context, revisionId });
    return { workspaceId: unit.workspaceId, projectId: unit.projectId, unitId, revisionId, revisionNo: revision.revisionNo, label: unit.slug, alreadySaved };
  };
  const existing = lookup(); if (existing) return existing;
  const target = input.unitId ? getUnit({ context: input.context, unitId: input.unitId }) : null;
  if (target && (target.projectId !== scope.projectId || target.latestRevisionId !== input.expectedLatestRevisionId)) throw conflict("The Unit changed. Refresh its revisions before saving this result.");
  if (target) revisionContents(input.context, target, input.kind);
  const prepared: PreparedObject[] = [];
  try {
    for (const file of files) {
      const object = await prepareObject(db, ralphDir(), { scope: { workspaceId: scope.workspaceId, ...(scope.projectId ? { projectId: scope.projectId } : {}) }, sourcePath: file.path, originalName: file.name, mime: file.mime, storageClass: "durable", transfer: "copy" });
      prepared.push(object);
      if (object.sha256 !== file.sha256 || object.bytes !== file.bytes) throw conflict("A source file changed while saving. Retry with the unchanged result.");
    }
    return withImmediateTransaction(() => {
      resolveQueryContext(db, input.context);
      const previous = lookup(); if (previous) return previous;
      const current = input.unitId ? getUnit({ context: input.context, unitId: input.unitId }) : null;
      if (current && (current.projectId !== scope.projectId || current.latestRevisionId !== input.expectedLatestRevisionId)) throw conflict("The Unit changed. Refresh its revisions before saving this result.");
      const contents = current ? revisionContents(input.context, current, input.kind) : { items: [], presentations: [], position: 0 };
      for (const object of prepared) {
        registerPreparedObject(db, object);
        appendActivity(db, { workspaceId: scope.workspaceId, projectId: scope.projectId, entityType: "object", entityId: object.id, action: "object.registered", payload: { bytes: object.bytes, mime: object.mime, storageClass: "durable" } });
      }
      const metadata = { generationSave: { key: input.key, fingerprint, mode: input.unitId ? "revision" : "new" }, generation: { ...provenance, output: { objectId: prepared[0].id, name: files[0].name, mime: files[0].mime }, references: prepared.slice(1).map((object, index) => ({ objectId: object.id, name: files[index + 1].name, mime: files[index + 1].mime })) } };
      const artifact = addArtifactRevisionInTransaction(db, { ...scope, slug: `generation-${input.key.slice(0, 24)}`, kind: input.kind, objectId: prepared[0].id, state: "candidate", metadata, authoredBySessionId: input.context.sessionId });
      const replacement = { artifactRevisionId: artifact.revision.id, documentRevisionId: null, role: "master", position: contents.position };
      const items: UnitItemInput[] = contents.items.length ? contents.items.map((item) => item.position === contents.position ? { ...item, artifactRevisionId: artifact.revision.id, documentRevisionId: null } : item) : [replacement];
      const replaced = contents.items.find((item) => item.position === contents.position);
      // A presentation's chosen cover remains immutable even when its primary media changes.
      if (replaced?.artifactRevisionId && contents.presentations.some((presentation) => presentation.coverArtifactRevisionId === replaced.artifactRevisionId) && !items.some((item) => item.artifactRevisionId === replaced.artifactRevisionId)) items.push({ ...replaced, role: "cover", position: items.length });
      const values = { items, presentations: contents.presentations, metadata, note: `Saved generated ${input.kind}${typeof provenance.modelId === "string" ? ` · ${provenance.modelId}` : ""}`, authoredBySessionId: input.context.sessionId };
      const revision = current ? reviseUnit({ ...values, unitId: current.id, expectedLatestRevisionId: input.expectedLatestRevisionId!, parentRevisionId: current.latestRevisionId })
        : createUnitWithRevision({ ...values, ...(scope.projectId ? { projectId: scope.projectId } : { workspaceId: scope.workspaceId }), slug: `${name!.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "generation"}-${input.key.slice(0, 8)}`, format: input.kind });
      return receipt(revision.unitId, revision.id, false);
    });
  } finally {
    // Unregistered copies belong to an aborted or concurrently replayed save, never to a Unit.
    for (const object of prepared) if (!db.query("SELECT id FROM objects WHERE id = ?").get(object.id)) { await assertSafeStorePath(root, object.finalPath); await fs.rm(object.finalPath, { force: true }); }
  }
}
