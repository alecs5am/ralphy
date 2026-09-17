import type { Database } from "bun:sqlite";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { redactLegacyCredentialText, isLegacyCredentialName } from "../migration/legacy.js";
import { newDomainId, type DomainIdPrefix } from "./ids.js";
import { compositionManifestSha256 } from "./compositions.js";

export type PortableRecord = Record<string, string | number | null>;
type Table = { name: string; type: string; prefix?: DomainIdPrefix; owner?: [string, string]; workspace?: boolean };
export const PORTABLE_TABLES: Table[] = [
  { name: "workspaces", type: "workspace", prefix: "ws" },
  { name: "projects", type: "project", prefix: "prj", workspace: true },
  { name: "social_accounts", type: "social_account", prefix: "acct", workspace: true },
  { name: "agent_sessions", type: "agent_session", prefix: "session", workspace: true },
  { name: "project_iterations", type: "iteration", prefix: "iter", owner: ["project_id", "projects"] },
  { name: "feedback_items", type: "feedback", prefix: "fb", owner: ["iteration_id", "project_iterations"] },
  { name: "feedback_resolution_links", type: "feedback_resolution_link", prefix: "fblink", owner: ["feedback_id", "feedback_items"] },
  { name: "project_stages", type: "project_stage", prefix: "stage", owner: ["project_id", "projects"] },
  { name: "documents", type: "document", prefix: "doc", workspace: true },
  { name: "document_revisions", type: "document_revision", prefix: "drev", owner: ["document_id", "documents"] },
  { name: "project_document_bindings", type: "project_document_binding", prefix: "bind", owner: ["project_id", "projects"] },
  { name: "objects", type: "object", prefix: "obj", workspace: true },
  { name: "artifacts", type: "artifact", prefix: "art", workspace: true },
  { name: "artifact_revisions", type: "artifact_revision", prefix: "arev", owner: ["artifact_id", "artifacts"] },
  { name: "artifact_relations", type: "artifact_relation", prefix: "rel", owner: ["from_revision_id", "artifact_revisions"] },
  { name: "artifact_usages", type: "artifact_usage", prefix: "usage", owner: ["artifact_revision_id", "artifact_revisions"] },
  { name: "compositions", type: "composition", prefix: "comp", owner: ["project_id", "projects"] },
  { name: "composition_revisions", type: "composition_revision", prefix: "crev", owner: ["composition_id", "compositions"] },
  { name: "composition_revision_files", type: "composition_file", prefix: "cfile", owner: ["composition_revision_id", "composition_revisions"] },
  { name: "composition_inputs", type: "composition_input", prefix: "input", owner: ["composition_revision_id", "composition_revisions"] },
  { name: "runs", type: "run", prefix: "run", workspace: true },
  { name: "run_attempts", type: "run_attempt", prefix: "attempt", owner: ["run_id", "runs"] },
  { name: "run_objects", type: "run_object", prefix: "robj", owner: ["run_id", "runs"] },
  { name: "run_results", type: "run_result", prefix: "result", owner: ["run_id", "runs"] },
  { name: "builds", type: "build", prefix: "build", owner: ["composition_revision_id", "composition_revisions"] },
  { name: "build_outputs", type: "build_output", prefix: "output", owner: ["build_id", "builds"] },
  { name: "build_document_bindings", type: "build_document_binding", prefix: "bind", owner: ["build_id", "builds"] },
  { name: "evaluations", type: "evaluation", prefix: "eval", workspace: true },
  { name: "units", type: "unit", prefix: "unit", workspace: true },
  { name: "unit_revisions", type: "unit_revision", prefix: "urev", owner: ["unit_id", "units"] },
  { name: "unit_items", type: "unit_item", prefix: "item", owner: ["unit_revision_id", "unit_revisions"] },
  { name: "unit_presentations", type: "unit_presentation", prefix: "pres", owner: ["unit_revision_id", "unit_revisions"] },
  { name: "presentation_caption_revisions", type: "caption_revision", prefix: "caption", owner: ["presentation_id", "unit_presentations"] },
  { name: "presentation_items", type: "presentation_item", prefix: "pitem", owner: ["presentation_id", "unit_presentations"] },
  { name: "publications", type: "publication", prefix: "pub", owner: ["presentation_id", "unit_presentations"] },
  { name: "metric_snapshots", type: "metric_snapshot", prefix: "metric", owner: ["publication_id", "publications"] },
  { name: "jobs", type: "job", owner: ["run_id", "runs"] },
  { name: "job_logs", type: "job_log", owner: ["job_id", "jobs"] },
  { name: "job_artifacts", type: "job_artifact", owner: ["job_id", "jobs"] },
  { name: "activity_events", type: "activity", workspace: true },
  { name: "settings", type: "setting", prefix: "setting", workspace: true },
  { name: "brands", type: "brand", prefix: "brand", workspace: true },
  { name: "personas", type: "persona", prefix: "persona", workspace: true },
  { name: "workspace_templates", type: "workspace_template", prefix: "tmpl", workspace: true },
  { name: "memory_entries", type: "memory_entry", prefix: "mentry", workspace: true },
  { name: "memory_revisions", type: "memory_revision", prefix: "mrev", workspace: true },
  { name: "campaigns", type: "campaign", prefix: "campaign", workspace: true },
  { name: "campaign_cells", type: "campaign_cell", prefix: "cell", workspace: true },
  { name: "calendar_entries", type: "calendar_entry", prefix: "calendar", workspace: true },
  { name: "agent_turns", type: "agent_turn", owner: ["run_id", "runs"] },
  { name: "agent_turn_events", type: "agent_turn_event", owner: ["run_id", "runs"] },
];
export type PortableTables = Record<string, PortableRecord[]>;
export type PortableMapping = { oldType: string; oldId: string; newType: string; newId: string };
const domainId = /\b[a-z][a-z0-9]*_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;
export const hash = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
export const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`;
const sensitive = /(?:secret|credential|password|api[_-]?key|access[_-]?token|refresh[_-]?token)/i;

export function redactPortableText(value: string): string {
  return redactLegacyCredentialText(value).value.replace(/\bsk-(?:or-v1-|ant-[A-Za-z0-9]+-)?[A-Za-z0-9_-]{12,}\b/g, "[portable-secret-redacted]");
}
export function redactPortableValue(value: unknown): unknown {
  if (typeof value === "string") return redactPortableText(value);
  if (Array.isArray(value)) return value.map((item, index) => {
    const previous = value[index - 1];
    return typeof previous === "string" && previous.startsWith("--") && isLegacyCredentialName(previous.slice(2))
      ? "[portable-secret-redacted]" : redactPortableValue(item);
  });
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitive.test(key) || isLegacyCredentialName(key) ? "[portable-secret-redacted]" : redactPortableValue(item)]));
  return value;
}

export function normalizePortableTables(tables: PortableTables): PortableTables {
  const normalized = Object.fromEntries(PORTABLE_TABLES.map(({ name }) => [name, tables[name].map((row) => sanitizeRecord(name, row))]));
  normalized.settings = normalized.settings.filter((row) => !sensitive.test(String(row.key)));
  freezeOperations(normalized);
  return normalized;
}

export function readPortableTables(db: Database, workspaceId: string, projectId: string | null): PortableTables {
  const tables: PortableTables = {};
  for (const table of PORTABLE_TABLES) {
    const columns = db.query<{ name: string }, []>(`PRAGMA table_info(${quoted(table.name)})`).all();
    let rows: PortableRecord[];
    if (table.name === "workspaces") rows = db.query<PortableRecord, [string]>("SELECT * FROM workspaces WHERE id = ?").all(workspaceId);
    else if (table.workspace) {
      const projectColumn = table.name === "projects" ? "id" : columns.some(({ name }) => name === "project_id") ? "project_id" : null;
      const where = projectId && projectColumn ? ` AND (${projectColumn} IS NULL OR ${projectColumn} = ?)` : "";
      rows = db.query<PortableRecord, string[]>(`SELECT * FROM ${quoted(table.name)} WHERE workspace_id = ?${where}`).all(...(where ? [workspaceId, projectId!] : [workspaceId]));
    } else {
      const [column, owner] = table.owner!;
      const ids = tables[owner].map((row) => row.id!);
      rows = [];
      for (let index = 0; index < ids.length; index += 500) {
        const group = ids.slice(index, index + 500);
        rows.push(...db.query<PortableRecord, (string | number)[]>(`SELECT * FROM ${quoted(table.name)} WHERE ${quoted(column)} IN (${group.map(() => "?").join(",")})`).all(...group));
      }
    }
    if (table.name === "objects") rows = rows.filter((row) => !String(row.mime).startsWith("application/vnd.ralphy.workspace"));
    if (table.name === "runs") rows = rows.filter((row) => row.kind !== "workspace.export" && row.kind !== "workspace.import");
    if (table.name === "activity_events") {
      const runs = new Set(tables.runs.map((row) => row.id)), objects = new Set(tables.objects.map((row) => row.id));
      rows = rows.filter((row) => !String(row.action).startsWith("workspace.export") && !String(row.action).startsWith("workspace.import")
        && (row.entity_type !== "run" || runs.has(row.entity_id)) && (row.entity_type !== "object" || objects.has(row.entity_id)));
    }
    if (table.name === "settings") rows = rows.filter((row) => !sensitive.test(String(row.key)));
    tables[table.name] = rows.map((row) => sanitizeRecord(table.name, row));
  }
  if (tables.workspaces.length !== 1) throw new Error("Workspace not found");
  if (projectId && tables.projects.length !== 1) throw new Error("Project does not belong to this workspace");
  freezeOperations(tables);
  return tables;
}

function freezeOperations(tables: PortableTables): void {
  const now = Date.now();
  const draftRuns = new Set(tables.publications.filter((row) => row.state === "draft").map((row) => row.submission_run_id));
  for (const run of tables.runs) if (["pending", "running"].includes(String(run.state)) && !draftRuns.has(run.id)) {
    run.state = "cancelled"; run.ended_at = Math.max(now, Number(run.started_at ?? run.created_at)); run.error = "Execution is not resumed by a workspace import.";
  }
  for (const attempt of tables.run_attempts) if (attempt.state === "running") { attempt.state = "cancelled"; attempt.ended_at = Math.max(now, Number(attempt.started_at)); }
  for (const build of tables.builds) if (["pending", "running"].includes(String(build.state))) {
    build.state = "cancelled"; build.started_at ??= build.created_at; build.ended_at = Math.max(now, Number(build.started_at)); build.error = "Imported build history.";
  }
  for (const publication of tables.publications) {
    publication.active_claim_run_id = null; publication.claim_kind = null; publication.claim_token = null; publication.claim_expires_at = null;
    if (publication.state !== "submitting") continue;
    publication.state = "reconciliation_required";
    publication.error = "Imported while submission was in progress; reconnect the account and reconcile before publishing.";
    const results = tables.run_results.filter((row) => row.run_id === publication.submission_run_id);
    if (!results.some((row) => row.entity_id === publication.id)) tables.run_results.push({
      id: newDomainId("result"), run_id: publication.submission_run_id, position: results.length,
      entity_type: "publication", entity_id: publication.id, created_at: now,
    });
  }
}

function sanitizeRecord(table: string, source: PortableRecord): PortableRecord {
  const row = { ...source };
  for (const [key, value] of Object.entries(row)) {
    if (typeof value !== "string") continue;
    row[key] = key.endsWith("_json") ? JSON.stringify(redactPortableValue(JSON.parse(value))) : redactPortableText(value);
  }
  if (table === "social_accounts") { row.credential_ref = null; row.relink_required = 1; }
  if (table === "agent_sessions") {
    row.consumer_principal_id = null;
    if (String(row.agent).startsWith("consumer:")) row.agent = "portable-import";
  }
  if (table === "runs") for (const column of ["external_system", "external_run_id", "external_node_id", "external_attempt", "external_operation", "idempotency_key", "request_digest", "consumer_principal_id"]) row[column] = null;
  if (table === "agent_turns") row.provider_resume_id = null;
  if (table === "jobs") {
    row.migration_hold_run_id = null;
    row.command = JSON.stringify(redactPortableValue(JSON.parse(String(row.command))));
    if (["pending", "blocked", "running"].includes(String(row.status))) {
      row.status = "cancelled";
      row.ended_at = Date.now();
      row.error_message = "Imported job history; automatic execution is disabled.";
    }
  }
  return row;
}

export function remapPortableTables(db: Database, source: PortableTables, options: { workspaceSlug?: string; workspaceName?: string }) {
  const ids = new Map<string, string>();
  const byTable = new Map<string, Map<string | number, string | number>>();
  const mapping: PortableMapping[] = [];
  for (const table of PORTABLE_TABLES) {
    const entries = new Map<string | number, string | number>();
    for (const row of source[table.name]) {
      if (!Object.hasOwn(row, "id")) continue;
      const oldId = row.id;
      if (oldId === null || (typeof oldId !== "string" && typeof oldId !== "number") || entries.has(oldId)) throw new Error("Invalid or duplicate portable identity");
      if (table.prefix ? typeof oldId !== "string" || !new RegExp(`^${table.prefix}_[A-Za-z0-9_-]{1,128}$`).test(oldId)
        : typeof oldId !== "number" || !Number.isSafeInteger(oldId) || oldId <= 0) throw new Error("Invalid portable entity identity");
      const newId = table.prefix ? newDomainId(table.prefix) : randomInt(1, 2 ** 48 - 1);
      entries.set(oldId, newId);
      ids.set(`${table.name}:${oldId}`, String(newId));
      if (typeof oldId === "string") {
        if (ids.has(oldId)) throw new Error("Portable entity identities must be unique");
        ids.set(oldId, String(newId));
      }
      mapping.push({ oldType: table.type, oldId: String(oldId), newType: table.type, newId: String(newId) });
    }
    byTable.set(table.name, entries);
  }
  const remapText = (text: string) => ids.get(text) ?? text.replace(domainId, (id) => ids.get(id) ?? id);
  const remapValue = (value: unknown): unknown => typeof value === "string" ? remapText(value)
    : Array.isArray(value) ? value.map(remapValue)
      : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remapValue(item)])) : value;
  const tables: PortableTables = {};
  for (const table of PORTABLE_TABLES) {
    const foreignKeys = db.query<{ table: string; from: string }, []>(`PRAGMA foreign_key_list(${quoted(table.name)})`).all();
    tables[table.name] = source[table.name].map((input) => {
      const row = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, typeof value === "string"
        ? key.endsWith("_json") ? JSON.stringify(remapValue(JSON.parse(value))) : remapText(value) : value])) as PortableRecord;
      if (Object.hasOwn(input, "id")) row.id = byTable.get(table.name)!.get(input.id!)!;
      for (const foreign of foreignKeys) {
        const old = input[foreign.from];
        if (old === null || old === undefined) continue;
        const id = byTable.get(foreign.table)?.get(old);
        // Agent turns use their run ID as the primary key.
        const target = foreign.table === "agent_turns" ? byTable.get("runs")?.get(old) : id;
        if (target === undefined) throw new Error(`Portable ${table.name}.${foreign.from} references an entity outside the package`);
        row[foreign.from] = target;
      }
      if (table.name === "activity_events" && input.entity_type === "job") {
        const id = byTable.get("jobs")!.get(Number(input.entity_id));
        if (id !== undefined) row.entity_id = String(id);
      }
      if (table.name === "publications") row.idempotency_key = `portable-${randomUUID()}`;
      if (table.name === "jobs") row.depends_on = JSON.stringify((JSON.parse(String(input.depends_on)) as number[]).map((id) => byTable.get("jobs")!.get(id)).filter((id) => id !== undefined));
      if (table.name === "objects") {
        row.bucket = row.project_id ? `buckets/${row.workspace_id}/projects/${row.project_id}` : `buckets/${row.workspace_id}/shared`;
        row.key = remapText(String(input.key));
      }
      if (table.name === "document_revisions") row.content_sha256 = hash(String(row.body));
      return row;
    });
  }
  const workspace = tables.workspaces[0];
  workspace.slug = options.workspaceSlug ?? `${workspace.slug}-imported-${randomUUID().slice(0, 8)}`;
  workspace.name = options.workspaceName ?? `${workspace.name} (imported)`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(workspace.slug)) || String(workspace.name).trim().length === 0) throw new Error("Invalid imported workspace name or slug");
  for (const revision of tables.composition_revisions) if (revision.state === "sealed") {
    const composition = tables.compositions.find((row) => row.id === revision.composition_id)!;
    revision.manifest_sha256 = compositionManifestSha256({
      kind: composition.kind, engine: revision.engine, engineVersion: revision.engine_version,
      engineConfig: JSON.parse(String(revision.engine_config_json)),
      sources: tables.composition_revision_files.filter((row) => row.composition_revision_id === revision.id).sort((a, b) => Number(a.position) - Number(b.position)).map((row) => ({
        logicalPath: row.logical_path, position: row.position, objectId: row.object_id,
        sha256: tables.objects.find((object) => object.id === row.object_id)!.sha256,
      })),
      inputs: tables.composition_inputs.filter((row) => row.composition_revision_id === revision.id).sort((a, b) => Number(a.position) - Number(b.position)).map((row) => ({
        position: row.position, artifactRevisionId: row.artifact_revision_id, role: row.role, config: row.config_json === null ? null : JSON.parse(String(row.config_json)),
      })),
    } as Parameters<typeof compositionManifestSha256>[0]);
  }
  return { tables, mapping, ids, remapText, workspaceId: String(workspace.id) };
}

/** Restore a verified snapshot atomically; historical terminal states cannot be replayed as live writes. */
export function insertPortableTables(db: Database, tables: PortableTables): void {
  const names = new Set(PORTABLE_TABLES.map(({ name }) => name));
  const triggers = db.query<{ name: string; tbl_name: string; sql: string }, []>("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger'").all().filter((trigger) => names.has(trigger.tbl_name));
  db.exec("PRAGMA defer_foreign_keys = ON");
  for (const trigger of triggers) db.exec(`DROP TRIGGER ${quoted(trigger.name)}`);
  for (const { name } of PORTABLE_TABLES) {
    const columns = db.query<{ name: string }, []>(`PRAGMA table_info(${quoted(name)})`).all().map(({ name }) => name);
    for (const row of tables[name]) {
      if (Object.keys(row).some((key) => !columns.includes(key))) throw new Error(`Unknown portable ${name} field`);
      const keys = Object.keys(row);
      db.prepare(`INSERT INTO ${quoted(name)} (${keys.map(quoted).join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(...keys.map((key) => row[key]));
    }
  }
  for (const row of tables.document_revisions) db.prepare("INSERT INTO document_revisions_fts (revision_id,title,body) VALUES (?,?,?)").run(row.id, row.title, row.body);
  for (const trigger of triggers) db.exec(trigger.sql);
  if (db.query("PRAGMA foreign_key_check").all().length) throw new Error("Portable package contains broken references");
}
