import fs from "node:fs/promises";
import path from "node:path";
import { ingestObjectRow, getObjectRow, resolveObjectPath } from "./internal-objects.js";
import { openDomainDb } from "./db.js";
import { ralphDir } from "../paths.js";
import { canonicalRequestJson } from "./canonical-json.js";
import { createWorkspace, createProject, upsertSocialAccount } from "./scopes.js";
import { startRun, finishRun } from "./runs.js";
import type { JsonValue } from "./types.js";

type PortableEntity = { type: string; id: string };

type PortableManifest = {
  version: 1;
  workspace: Record<string, unknown>;
  projects: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  artifacts: Record<string, unknown>[];
  objects: Record<string, unknown>[];
  compositions: Record<string, unknown>[];
  builds: Record<string, unknown>[];
  evaluations: Record<string, unknown>[];
  units: Record<string, unknown>[];
  presentations: Record<string, unknown>[];
  campaigns: Record<string, unknown>[];
  calendar: Record<string, unknown>[];
  socialAccounts: Record<string, unknown>[];
  entities: PortableEntity[];
};

export type PortableExportResult = {
  runId: string;
  packageObjectId: string;
  manifestSummary: { version: 1; workspaceId: string; entityCounts: Record<string, number> };
};

export type PortablePage<T> = { items: T[]; nextCursor: string | null };

export type PortableImportResult = {
  workspaceId: string;
  entityMapPage: PortablePage<{ oldType: string; oldId: string; newType: string; newId: string }>;
  relinkPage: PortablePage<{ oldId: string; newId: string; platform: string; provider: string; handle: string | null }>;
};

export async function exportWorkspacePackage(input: {
  workspaceId: string;
  projectId?: string | null;
}): Promise<PortableExportResult> {
  const manifest = readManifest(input.workspaceId, input.projectId ?? null);
  const run = startRun({
    workspaceId: input.workspaceId,
    projectId: input.projectId ?? null,
    kind: "workspace.export",
    label: "Portable Workspace export",
    metadata: { version: 1, workspaceId: input.workspaceId } as JsonValue,
  });
  const exportDir = path.join(ralphDir(), "exports");
  const file = path.join(exportDir, `${run.id}.workspace.json`);
  try {
    await fs.mkdir(exportDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(file, canonicalRequestJson(manifest as unknown as JsonValue), { mode: 0o600 });
    const object = await ingestObjectRow({
      scope: { workspaceId: input.workspaceId },
      sourcePath: file,
      originalName: `${run.id}.workspace.json`,
      mime: "application/vnd.ralphy.workspace+json",
      storageClass: "durable",
    });
    finishRun(run.id, { state: "succeeded" });
    return {
      runId: run.id,
      packageObjectId: object.id,
      manifestSummary: {
        version: 1,
        workspaceId: input.workspaceId,
        entityCounts: entityCounts(manifest),
      },
    };
  } catch (error) {
    finishRun(run.id, { state: "failed", error });
    throw error;
  } finally {
    await fs.rm(file, { force: true });
  }
}

export async function importWorkspacePackage(input: {
  packageObjectId: string;
  idempotencyKey: string;
  workspaceSlug?: string;
  workspaceName?: string;
  entityAfter?: string | null;
  relinkAfter?: string | null;
  limit?: number;
}): Promise<PortableImportResult> {
  const db = openDomainDb();
  const existing = db.query<{ metadataJson: string }, [string, string]>(
    `SELECT metadata_json AS metadataJson FROM runs
     WHERE kind = 'workspace.import' AND json_extract(metadata_json, '$.idempotencyKey') = ?
       AND json_extract(metadata_json, '$.packageObjectId') = ?
     ORDER BY created_at DESC LIMIT 1`,
  ).get(input.idempotencyKey, input.packageObjectId);
  if (existing) {
    const stored = JSON.parse(existing.metadataJson) as {
      workspaceId: string;
      mapping?: PortableImportResult["entityMapPage"]["items"];
      relinks?: PortableImportResult["relinkPage"]["items"];
      result?: PortableImportResult;
    };
    if (stored.mapping && stored.relinks) {
      return {
        workspaceId: stored.workspaceId,
        entityMapPage: page(stored.mapping, input.entityAfter, input.limit),
        relinkPage: page(stored.relinks, input.relinkAfter, input.limit),
      };
    }
    return stored.result!;
  }

  const object = getObjectRow(db, input.packageObjectId);
  if (!object || object.storageClass !== "durable") throw new Error("Portable package Object not found");
  const packagePath = resolveObjectPath(object);
  const manifest = JSON.parse(await fs.readFile(packagePath, "utf8")) as PortableManifest;
  if (manifest.version !== 1 || !manifest.workspace || !Array.isArray(manifest.entities)) {
    throw new Error("Portable package manifest is invalid");
  }
  const sourceWorkspace = stringValue(manifest.workspace.id, "workspace.id");
  const run = startRun({
    workspaceId: sourceWorkspace,
    kind: "workspace.import",
    label: "Portable Workspace import",
    metadata: {
      version: 1,
      packageObjectId: input.packageObjectId,
      idempotencyKey: input.idempotencyKey,
    } as JsonValue,
  });
  try {
    const workspace = createWorkspace({
      slug: input.workspaceSlug ?? `${stringValue(manifest.workspace.slug, "workspace.slug")}-imported`,
      name: input.workspaceName ?? `${stringValue(manifest.workspace.name, "workspace.name")} (imported)`,
    });
    const mapping = new Map<string, { oldType: string; oldId: string; newType: string; newId: string }>();
    mapping.set(`workspace\0${sourceWorkspace}`, { oldType: "workspace", oldId: sourceWorkspace, newType: "workspace", newId: workspace.id });
    for (const project of manifest.projects) {
      const oldId = stringValue(project.id, "project.id");
      const created = createProject({
        workspaceId: workspace.id,
        slug: stringValue(project.slug, "project.slug"),
        name: stringValue(project.name, "project.name"),
      });
      mapping.set(`project\0${oldId}`, { oldType: "project", oldId, newType: "project", newId: created.id });
    }
    const relinks: PortableImportResult["relinkPage"]["items"] = [];
    for (const account of manifest.socialAccounts) {
      const created = upsertSocialAccount({
        workspaceId: workspace.id,
        platform: stringValue(account.platform, "account.platform"),
        externalId: stringValue(account.externalId, "account.externalId"),
        displayName: nullableString(account.displayName),
        username: nullableString(account.username),
      });
      const oldId = stringValue(account.id, "account.id");
      mapping.set(`social_account\0${oldId}`, { oldType: "social_account", oldId, newType: "social_account", newId: created.id });
      relinks.push({ oldId, newId: created.id, platform: created.platform, provider: created.platform, handle: created.username });
    }
    for (const entity of manifest.entities) {
      const key = `${entity.type}\0${entity.id}`;
      if (!mapping.has(key)) mapping.set(key, { oldType: entity.type, oldId: entity.id, newType: entity.type, newId: entity.id });
    }
    const result = {
      workspaceId: workspace.id,
      entityMapPage: page([...mapping.values()], input.entityAfter, input.limit),
      relinkPage: page(relinks, input.relinkAfter, input.limit),
    } satisfies PortableImportResult;
    finishRun(run.id, { state: "succeeded" });
    db.prepare("UPDATE runs SET metadata_json = ? WHERE id = ?").run(
      canonicalRequestJson({
        version: 1,
        packageObjectId: input.packageObjectId,
        idempotencyKey: input.idempotencyKey,
        workspaceId: workspace.id,
        mapping: [...mapping.values()],
        relinks,
      } as JsonValue),
      run.id,
    );
    return result;
  } catch (error) {
    finishRun(run.id, { state: "failed", error });
    throw error;
  }
}

function readManifest(workspaceId: string, projectId: string | null): PortableManifest {
  const db = openDomainDb();
  const workspace = db.query<Record<string, unknown>, [string]>(
    "SELECT id, slug, name, created_at AS createdAt, updated_at AS updatedAt FROM workspaces WHERE id = ?",
  ).get(workspaceId);
  if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);
  const projects = db.query<Record<string, unknown>, (string | null)[]>(
    `SELECT id, workspace_id AS workspaceId, slug, name, state, created_at AS createdAt, updated_at AS updatedAt
     FROM projects WHERE workspace_id = ? AND (? IS NULL OR id = ?) ORDER BY id`,
  ).all(workspaceId, projectId, projectId);
  const projectIds = projects.map((row) => row.id as string);
  const inScope = (column: string) => projectIds.length === 0 ? "0" : `${column} IN (${projectIds.map(() => "?").join(",")})`;
  const documents = db.query<Record<string, unknown>, (string | null)[]>(
    `SELECT id, workspace_id AS workspaceId, project_id AS projectId, kind, slug, title, current_revision_id AS currentRevisionId
     FROM documents WHERE workspace_id = ? AND (project_id IS NULL OR ${inScope("project_id")}) ORDER BY id`,
  ).all(workspaceId, ...projectIds);
  const socialAccounts = db.query<Record<string, unknown>, [string]>(
    "SELECT id, platform, external_id AS externalId, display_name AS displayName, username FROM social_accounts WHERE workspace_id = ? ORDER BY id",
  ).all(workspaceId);
  const entities: PortableEntity[] = [
    { type: "workspace", id: workspaceId },
    ...projects.map((row) => ({ type: "project", id: row.id as string })),
    ...documents.map((row) => ({ type: "document", id: row.id as string })),
    ...socialAccounts.map((row) => ({ type: "social_account", id: row.id as string })),
  ];
  return {
    version: 1,
    workspace,
    projects,
    documents,
    artifacts: [],
    objects: [],
    compositions: [],
    builds: [],
    evaluations: [],
    units: [],
    presentations: [],
    campaigns: [],
    calendar: [],
    socialAccounts,
    entities,
  };
}

function entityCounts(manifest: PortableManifest): Record<string, number> {
  return Object.fromEntries([
    ["workspace", 1], ["project", manifest.projects.length], ["document", manifest.documents.length],
    ["artifact", manifest.artifacts.length], ["object", manifest.objects.length], ["composition", manifest.compositions.length],
    ["build", manifest.builds.length], ["evaluation", manifest.evaluations.length], ["unit", manifest.units.length],
    ["presentation", manifest.presentations.length], ["campaign", manifest.campaigns.length], ["calendar", manifest.calendar.length],
    ["socialAccount", manifest.socialAccounts.length],
  ]);
}

function page<T>(items: T[], after: string | null | undefined, rawLimit: number | undefined): PortablePage<T> {
  const limit = Math.min(100, Math.max(1, rawLimit ?? 50));
  const start = after === undefined || after === null ? 0 : Number.parseInt(after, 10);
  if (!Number.isSafeInteger(start) || start < 0) throw new Error("Portable page cursor is invalid");
  const selected = items.slice(start, start + limit);
  return { items: selected, nextCursor: start + selected.length < items.length ? String(start + selected.length) : null };
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is invalid`);
  return value;
}

function nullableString(value: unknown): string | null {
  return value === undefined || value === null ? null : stringValue(value, "value");
}
