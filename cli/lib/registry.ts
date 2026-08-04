import fs from "fs/promises";
import path from "path";
import {
  registryPath,
  ralphDir,
  brandsDir,
  personasDir,
  refsDir,
  projectWorkspace,
  DEFAULT_WORKSPACE,
  configPath,
} from "./paths.js";
import { loadConfig } from "./config.js";
import {
  assertCommandProject,
  getCommandContext,
} from "./context-state.js";
import { appendActivity } from "./store/activity.js";
import { canonicalPublicJson } from "./store/canonical-json.js";
import { openDomainDb, withImmediateTransaction } from "./store/db.js";
import { newDomainId } from "./store/ids.js";

export type RegistryData = {
  brands: Record<string, any>;
  personas: Record<string, any>;
  refs: Record<string, any>;
  projects: Record<string, any>;
  templates: Record<string, any>;
  batches: Record<string, any>;
};

const EMPTY: RegistryData = {
  brands: {},
  personas: {},
  refs: {},
  projects: {},
  templates: {},
  batches: {},
};

export async function loadRegistry(): Promise<RegistryData> {
  try {
    const data = await fs.readFile(registryPath(), "utf-8");
    return { ...EMPTY, ...JSON.parse(data) };
  } catch {
    return { ...EMPTY };
  }
}

export async function saveRegistry(reg: RegistryData) {
  await fs.mkdir(ralphDir(), { recursive: true });
  await fs.writeFile(registryPath(), JSON.stringify(reg, null, 2) + "\n");
}

// Generic entity CRUD on a specific collection
export async function addEntity(
  collection: keyof RegistryData,
  id: string,
  data: Record<string, unknown>
) {
  if (isStructuredCollection(collection)) {
    return addStructuredEntity(collection, id, data);
  }
  const reg = await loadRegistry();
  if (collection === "projects") {
    const explicit = data.workspace;
    const workspaceId =
      typeof explicit === "string" && explicit.length > 0
        ? explicit
        : projectWorkspace(id);
    assertCommandProject(id, workspaceId);
    data = { ...data, workspace: workspaceId };
  }
  reg[collection][id] = { id, ...data };
  await saveRegistry(reg);

  // Also write individual JSON file for brands/personas/refs
  const dirMap: Partial<Record<keyof RegistryData, () => string>> = {
    brands: brandsDir,
    personas: personasDir,
    refs: refsDir,
  };
  const dirFn = dirMap[collection];
  if (dirFn) {
    const dir = dirFn();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `${id}.json`),
      JSON.stringify({ id, ...data }, null, 2) + "\n"
    );
  }
  return reg[collection][id];
}

export async function getEntity(collection: keyof RegistryData, id: string) {
  if (isStructuredCollection(collection)) {
    return getStructuredEntity(collection, id);
  }
  const reg = await loadRegistry();
  const entity = reg[collection][id] || null;
  if (collection === "projects") {
    const workspaceId = entity?.workspace;
    assertCommandProject(
      id,
      typeof workspaceId === "string" && workspaceId.length > 0
        ? workspaceId
        : entity
          ? DEFAULT_WORKSPACE
          : undefined,
    );
  }
  return entity;
}

export async function updateEntity(
  collection: keyof RegistryData,
  id: string,
  updates: Record<string, unknown>
) {
  if (isStructuredCollection(collection)) {
    return updateStructuredEntity(collection, id, updates);
  }
  const reg = await loadRegistry();
  if (!reg[collection][id]) return null;
  if (collection === "projects") {
    assertCommandProject(id, reg.projects[id]?.workspace ?? DEFAULT_WORKSPACE);
  }
  reg[collection][id] = { ...reg[collection][id], ...updates, updatedAt: new Date().toISOString() };
  await saveRegistry(reg);

  // Also update individual file
  const dirMap: Partial<Record<keyof RegistryData, () => string>> = {
    brands: brandsDir,
    personas: personasDir,
    refs: refsDir,
  };
  const dirFn = dirMap[collection];
  if (dirFn) {
    const fp = path.join(dirFn(), `${id}.json`);
    await fs.writeFile(fp, JSON.stringify(reg[collection][id], null, 2) + "\n");
  }
  return reg[collection][id];
}

export async function deleteEntity(collection: keyof RegistryData, id: string) {
  if (isStructuredCollection(collection)) {
    return deleteStructuredEntity(collection, id);
  }
  const reg = await loadRegistry();
  if (!reg[collection][id]) return false;
  if (collection === "projects") {
    assertCommandProject(id, reg.projects[id]?.workspace ?? DEFAULT_WORKSPACE);
  }
  delete reg[collection][id];
  await saveRegistry(reg);

  const dirMap: Partial<Record<keyof RegistryData, () => string>> = {
    brands: brandsDir,
    personas: personasDir,
    refs: refsDir,
  };
  const dirFn = dirMap[collection];
  if (dirFn) {
    await fs.rm(path.join(dirFn(), `${id}.json`), { force: true });
  }
  return true;
}

export async function listEntities(collection: keyof RegistryData) {
  if (isStructuredCollection(collection)) {
    return listStructuredEntities(collection);
  }
  const reg = await loadRegistry();
  const entities = Object.values(reg[collection]);
  if (collection !== "projects") return entities;
  const context = getCommandContext();
  if (!context) return entities;
  return entities.filter((entity) => {
    if (context.projectId !== undefined && entity.id !== context.projectId) {
      return false;
    }
    return (entity.workspace ?? DEFAULT_WORKSPACE) === context.workspaceId;
  });
}

/** @internal Read-only staged compatibility adapter. */
export async function getActiveWorkspace(): Promise<string> {
  const cfg = await loadConfig();
  const ws = cfg.activeWorkspace;
  if (typeof ws === "string" && ws.length > 0) return ws;
  try {
    const legacy = JSON.parse(await fs.readFile(configPath(), "utf8")) as {
      activeWorkspace?: unknown;
    };
    return typeof legacy.activeWorkspace === "string" && legacy.activeWorkspace.length > 0
      ? legacy.activeWorkspace
      : DEFAULT_WORKSPACE;
  } catch {
    return DEFAULT_WORKSPACE;
  }
}

type StructuredCollection = "brands" | "personas" | "templates";

function isStructuredCollection(
  collection: keyof RegistryData,
): collection is StructuredCollection {
  return collection === "brands" || collection === "personas" || collection === "templates";
}

function structuredWorkspaceId(): string {
  const workspaceId = getCommandContext()?.workspaceId;
  if (!workspaceId) {
    throw new Error("Structured entities require an explicit Workspace scope");
  }
  return workspaceId;
}

function addStructuredEntity(
  collection: StructuredCollection,
  slug: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const workspaceId = structuredWorkspaceId();
  const now = Date.now();
  return withImmediateTransaction((db) => {
    if (collection === "brands") {
      const id = newDomainId("brand");
      const record = brandRecord(id, slug, data, now, now);
      db.prepare(
        `INSERT INTO brands
         (id, workspace_id, slug, name, url, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        workspaceId,
        slug,
        String(record.name),
        optionalRecordText(record, "url"),
        jsonOrNull({ colors: record.colors, font: record.font }),
        now,
        now,
      );
      appendStructuredActivity(db, workspaceId, "brand", id, "created", slug, now);
      return record;
    }
    if (collection === "personas") {
      const id = newDomainId("persona");
      const record = personaRecord(id, slug, data, now, now);
      db.prepare(
        `INSERT INTO personas
         (id, workspace_id, slug, name, language, archetype, tone, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        workspaceId,
        slug,
        String(record.name),
        optionalRecordText(record, "language"),
        optionalRecordText(record, "archetype"),
        optionalRecordText(record, "tone"),
        jsonOrNull(personaMetadata(record)),
        now,
        now,
      );
      appendStructuredActivity(db, workspaceId, "persona", id, "created", slug, now);
      return record;
    }

    const id = newDomainId("tmpl");
    const record = templateRecord(id, slug, data, now, now);
    assertDocumentRevisionWorkspace(db, record.documentRevisionId, workspaceId);
    if (record.artifactRevisionId) {
      assertArtifactRevisionWorkspace(db, record.artifactRevisionId, workspaceId);
    }
    db.prepare(
      `INSERT INTO workspace_templates
       (id, workspace_id, slug, name, description, kind, format, category,
        document_revision_id, artifact_revision_id, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      workspaceId,
      slug,
      String(record.name),
      optionalRecordText(record, "description"),
      String(record.kind),
      optionalRecordText(record, "format"),
      optionalRecordText(record, "category"),
      String(record.documentRevisionId),
      optionalRecordText(record, "artifactRevisionId"),
      jsonOrNull(templateMetadata(record)),
      now,
      now,
    );
    appendStructuredActivity(db, workspaceId, "workspace_template", id, "created", slug, now);
    return record;
  });
}

function getStructuredEntity(
  collection: StructuredCollection,
  idOrSlug: string,
): Record<string, unknown> | null {
  const workspaceId = structuredWorkspaceId();
  const db = openDomainDb();
  if (collection === "brands") {
    const row = db.query<Record<string, unknown>, [string, string, string]>(
      "SELECT * FROM brands WHERE workspace_id = ? AND (id = ? OR slug = ?)",
    ).get(workspaceId, idOrSlug, idOrSlug);
    return row ? brandFromRow(row) : null;
  }
  if (collection === "personas") {
    const row = db.query<Record<string, unknown>, [string, string, string]>(
      "SELECT * FROM personas WHERE workspace_id = ? AND (id = ? OR slug = ?)",
    ).get(workspaceId, idOrSlug, idOrSlug);
    return row ? personaFromRow(row) : null;
  }
  const row = db.query<Record<string, unknown>, [string, string, string]>(
    "SELECT * FROM workspace_templates WHERE workspace_id = ? AND (id = ? OR slug = ?)",
  ).get(workspaceId, idOrSlug, idOrSlug);
  return row ? templateFromRow(row) : null;
}

function listStructuredEntities(
  collection: StructuredCollection,
): Record<string, unknown>[] {
  const context = getCommandContext();
  if (!context) return [];
  const workspaceId = context.workspaceId;
  const table = collection === "templates" ? "workspace_templates" : collection;
  const rows = openDomainDb()
    .query<Record<string, unknown>, [string]>(
      `SELECT * FROM ${table} WHERE workspace_id = ? ORDER BY created_at, id`,
    )
    .all(workspaceId);
  return rows.map((row) =>
    collection === "brands"
      ? brandFromRow(row)
      : collection === "personas"
        ? personaFromRow(row)
        : templateFromRow(row),
  );
}

function updateStructuredEntity(
  collection: StructuredCollection,
  idOrSlug: string,
  updates: Record<string, unknown>,
): Record<string, unknown> | null {
  const current = getStructuredEntity(collection, idOrSlug);
  if (!current) return null;
  const workspaceId = structuredWorkspaceId();
  const now = Date.now();
  return withImmediateTransaction((db) => {
    const merged = { ...current, ...updates };
    const id = String(current.id);
    const slug = String(current.slug);
    if (collection === "brands") {
      const record = brandRecord(id, slug, merged, Date.parse(String(current.createdAt)), now);
      db.prepare(
        "UPDATE brands SET name = ?, url = ?, metadata_json = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
      ).run(
        String(record.name),
        optionalRecordText(record, "url"),
        jsonOrNull({ colors: record.colors, font: record.font }),
        now,
        id,
        workspaceId,
      );
      appendStructuredActivity(db, workspaceId, "brand", id, "updated", slug, now);
      return record;
    }
    if (collection === "personas") {
      const record = personaRecord(id, slug, merged, Date.parse(String(current.createdAt)), now);
      db.prepare(
        "UPDATE personas SET name = ?, language = ?, archetype = ?, tone = ?, metadata_json = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
      ).run(
        String(record.name),
        optionalRecordText(record, "language"),
        optionalRecordText(record, "archetype"),
        optionalRecordText(record, "tone"),
        jsonOrNull(personaMetadata(record)),
        now,
        id,
        workspaceId,
      );
      appendStructuredActivity(db, workspaceId, "persona", id, "updated", slug, now);
      return record;
    }
    const record = templateRecord(id, slug, merged, Date.parse(String(current.createdAt)), now);
    assertDocumentRevisionWorkspace(db, record.documentRevisionId, workspaceId);
    if (record.artifactRevisionId) {
      assertArtifactRevisionWorkspace(db, record.artifactRevisionId, workspaceId);
    }
    db.prepare(
      `UPDATE workspace_templates
       SET name = ?, description = ?, kind = ?, format = ?, category = ?,
           document_revision_id = ?, artifact_revision_id = ?, metadata_json = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
    ).run(
      String(record.name),
      optionalRecordText(record, "description"),
      String(record.kind),
      optionalRecordText(record, "format"),
      optionalRecordText(record, "category"),
      String(record.documentRevisionId),
      optionalRecordText(record, "artifactRevisionId"),
      jsonOrNull(templateMetadata(record)),
      now,
      id,
      workspaceId,
    );
    appendStructuredActivity(db, workspaceId, "workspace_template", id, "updated", slug, now);
    return record;
  });
}

function deleteStructuredEntity(
  collection: StructuredCollection,
  idOrSlug: string,
): boolean {
  const current = getStructuredEntity(collection, idOrSlug);
  if (!current) return false;
  const workspaceId = structuredWorkspaceId();
  const table = collection === "templates" ? "workspace_templates" : collection;
  return withImmediateTransaction((db) => {
    const id = String(current.id);
    db.prepare(`DELETE FROM ${table} WHERE id = ? AND workspace_id = ?`).run(
      id,
      workspaceId,
    );
    const entityType = collection === "templates" ? "workspace_template" : collection.slice(0, -1);
    appendStructuredActivity(
      db,
      workspaceId,
      entityType,
      id,
      "deleted",
      String(current.slug),
      Date.now(),
    );
    return true;
  });
}

function brandRecord(
  id: string,
  slug: string,
  data: Record<string, unknown>,
  createdAt: number,
  updatedAt: number,
): Record<string, unknown> {
  const name = requiredText(data.name, "Brand name");
  const url = optionalText(data.url, "Brand URL");
  if (url && !/^https?:\/\/[^\s]+$/iu.test(url)) throw new Error("Brand URL is invalid");
  const metadata = canonicalPublicJson(
    { ...(data.colors !== undefined ? { colors: data.colors } : {}), ...(data.font !== undefined ? { font: data.font } : {}) },
    "Brand",
  ) as Record<string, unknown>;
  return {
    id,
    slug,
    name,
    ...(url ? { url } : {}),
    ...metadata,
    createdAt: new Date(createdAt).toISOString(),
    ...(updatedAt !== createdAt ? { updatedAt: new Date(updatedAt).toISOString() } : {}),
  };
}

function personaRecord(
  id: string,
  slug: string,
  data: Record<string, unknown>,
  createdAt: number,
  updatedAt: number,
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    id,
    slug,
    name: requiredText(data.name, "Persona name"),
    createdAt: new Date(createdAt).toISOString(),
  };
  for (const field of ["language", "archetype", "tone"] as const) {
    const value = optionalText(data[field], `Persona ${field}`);
    if (value) record[field] = value;
  }
  const metadata = canonicalPublicJson(
    Object.fromEntries(
      ["voice", "demographics", "appearance", "personality", "context"]
        .filter((field) => data[field] !== undefined)
        .map((field) => [field, data[field]]),
    ),
    "Persona",
  ) as Record<string, unknown>;
  Object.assign(record, metadata);
  if (updatedAt !== createdAt) record.updatedAt = new Date(updatedAt).toISOString();
  return record;
}

function templateRecord(
  id: string,
  slug: string,
  data: Record<string, unknown>,
  createdAt: number,
  updatedAt: number,
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    id,
    slug,
    name: requiredText(data.name, "Workspace Template name"),
    kind: requiredText(data.kind, "Workspace Template kind"),
    documentRevisionId: requiredText(
      data.documentRevisionId,
      "Workspace Template Document Revision",
    ),
    createdAt: new Date(createdAt).toISOString(),
  };
  for (const field of ["description", "format", "category", "artifactRevisionId"] as const) {
    const value = optionalText(data[field], `Workspace Template ${field}`);
    if (value) record[field] = value;
  }
  const metadata = canonicalPublicJson(
    Object.fromEntries(
      ["tags", "requires", "scenes", "estimated_cost_usd", "estimated_duration_s", "references"]
        .filter((field) => data[field] !== undefined)
        .map((field) => [field, data[field]]),
    ),
    "Workspace Template",
  ) as Record<string, unknown>;
  Object.assign(record, metadata);
  if (updatedAt !== createdAt) record.updatedAt = new Date(updatedAt).toISOString();
  return record;
}

function brandFromRow(row: Record<string, unknown>): Record<string, unknown> {
  return brandRecord(
    String(row.id),
    String(row.slug),
    {
      name: row.name,
      url: row.url,
      ...parseMetadata(row.metadata_json),
    },
    Number(row.created_at),
    Number(row.updated_at),
  );
}

function personaFromRow(row: Record<string, unknown>): Record<string, unknown> {
  return personaRecord(
    String(row.id),
    String(row.slug),
    {
      name: row.name,
      language: row.language,
      archetype: row.archetype,
      tone: row.tone,
      ...parseMetadata(row.metadata_json),
    },
    Number(row.created_at),
    Number(row.updated_at),
  );
}

function templateFromRow(row: Record<string, unknown>): Record<string, unknown> {
  return templateRecord(
    String(row.id),
    String(row.slug),
    {
      name: row.name,
      description: row.description,
      kind: row.kind,
      format: row.format,
      category: row.category,
      documentRevisionId: row.document_revision_id,
      artifactRevisionId: row.artifact_revision_id,
      ...parseMetadata(row.metadata_json),
    },
    Number(row.created_at),
    Number(row.updated_at),
  );
}

function personaMetadata(record: Record<string, unknown>): Record<string, unknown> {
  return pick(record, ["voice", "demographics", "appearance", "personality", "context"]);
}

function templateMetadata(record: Record<string, unknown>): Record<string, unknown> {
  return pick(record, ["tags", "requires", "scenes", "estimated_cost_usd", "estimated_duration_s", "references"]);
}

function pick(record: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(
    keys.filter((key) => record[key] !== undefined).map((key) => [key, record[key]]),
  );
}

function parseMetadata(value: unknown): Record<string, unknown> {
  return typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : {};
}

function jsonOrNull(value: Record<string, unknown>): string | null {
  return Object.keys(value).length === 0 ? null : JSON.stringify(value);
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function optionalText(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${label} must be text`);
  return value;
}

function optionalRecordText(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function assertDocumentRevisionWorkspace(
  db: import("bun:sqlite").Database,
  revisionId: unknown,
  workspaceId: string,
): void {
  const row = db.query<{ workspaceId: string }, [string]>(
    `SELECT document.workspace_id AS workspaceId
     FROM document_revisions revision
     JOIN documents document ON document.id = revision.document_id
     WHERE revision.id = ?`,
  ).get(String(revisionId));
  if (!row || row.workspaceId !== workspaceId) {
    throw new Error("Workspace Template Document Revision is outside the Workspace");
  }
}

function assertArtifactRevisionWorkspace(
  db: import("bun:sqlite").Database,
  revisionId: unknown,
  workspaceId: string,
): void {
  const row = db.query<{ workspaceId: string }, [string]>(
    `SELECT artifact.workspace_id AS workspaceId
     FROM artifact_revisions revision
     JOIN artifacts artifact ON artifact.id = revision.artifact_id
     WHERE revision.id = ?`,
  ).get(String(revisionId));
  if (!row || row.workspaceId !== workspaceId) {
    throw new Error("Workspace Template Artifact Revision is outside the Workspace");
  }
}

function appendStructuredActivity(
  db: import("bun:sqlite").Database,
  workspaceId: string,
  entityType: string,
  entityId: string,
  verb: string,
  slug: string,
  createdAt: number,
): void {
  appendActivity(db, {
    workspaceId,
    entityType,
    entityId,
    action: `${entityType}.${verb}`,
    payload: { slug },
    createdAt,
  });
}
