import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Database } from "bun:sqlite";
import { appendActivity } from "../store/activity.js";
import { withImmediateTransaction } from "../store/db.js";
import { newDomainId } from "../store/ids.js";
import { normalizeRelativePath } from "./inventory.js";
import { classifyLegacyPath, normalizeLegacyDocumentBody, parseLegacyJsonl } from "./legacy.js";
import type { MigrationContext } from "./types.js";

export type MigrationImportSummary = {
  workspaces: number;
  projects: number;
  documents: number;
  revisions: number;
  issues: number;
};

export function importScopesAndDocuments(ctx: MigrationContext): MigrationImportSummary {
  const summary = { workspaces: 0, projects: 0, documents: 0, revisions: 0, issues: 0 };
  const now = Date.now();
  withImmediateTransaction((db) => {
    const workspaceBySource = new Map<string, string>();
    const projectByKey = new Map<string, string>();
    for (const source of ctx.sourceRoots) {
      const workspaceId = newDomainId("ws");
      const slug = `migration-${source.kind}-${ctx.runId.slice(-8)}`;
      db.prepare(
        `INSERT INTO workspaces (id, slug, name, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(workspaceId, slug, `Imported ${source.kind}`, JSON.stringify({ migrationRunId: ctx.runId, sourceKind: source.kind }), now, now);
      appendActivity(db, { workspaceId, projectId: null, entityType: "workspace", entityId: workspaceId, action: "workspace.created", payload: { slug }, createdAt: now });
      workspaceBySource.set(source.id, workspaceId);
      summary.workspaces += 1;
    }
    const entries = db.query<{
      id: string;
      migrationSourceId: string;
      sourceKind: string;
      sourcePath: string;
      disposition: string;
      state: string;
    }, [string]>(
      `SELECT id, migration_source_id AS migrationSourceId, source_kind AS sourceKind,
              source_path AS sourcePath, disposition, state
       FROM migration_entries WHERE migration_run_id = ? ORDER BY migration_source_id, source_path`,
    ).all(ctx.runId);
    for (const entry of entries) {
      if (entry.state !== "inventoried" || entry.disposition !== "domain") continue;
      const source = ctx.sourceRoots.find((candidate) => candidate.kind === entry.sourceKind || candidate.id === entry.sourceKind);
      if (!source) continue;
      const absolute = safeSourceFile(source.path, entry.sourcePath);
      const stat = fs.lstatSync(absolute);
      if (!stat.isFile()) continue;
      const body = normalizeLegacyDocumentBody(fs.readFileSync(absolute));
      if (!body) {
        insertIssue(db, ctx.runId, entry.id, "MIGRATION_DOCUMENT_UNREADABLE", "review", { sourcePath: entry.sourcePath });
        summary.issues += 1;
        continue;
      }
      const workspaceId = workspaceBySource.get(source.id) ?? workspaceBySource.get(source.kind)!;
      const projectKey = projectPath(entry.sourcePath);
      let projectId: string | null = null;
      if (projectKey) {
        const key = `${source.id}\0${projectKey}`;
        projectId = projectByKey.get(key) ?? null;
        if (!projectId) {
          projectId = newDomainId("prj");
          const slug = safeSlug(projectKey);
          db.prepare(
            `INSERT INTO projects (id, workspace_id, slug, name, state, metadata_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
          ).run(projectId, workspaceId, slug, projectKey, JSON.stringify({ migrationRunId: ctx.runId, migrationSourcePath: entry.sourcePath }), now, now);
          projectByKey.set(key, projectId);
          summary.projects += 1;
        }
      }
      const fileSlug = safeSlug(path.posix.basename(entry.sourcePath).replace(/\.[^.]+$/, ""));
      const kind = documentKind(entry.sourcePath);
      const documentId = newDomainId("doc");
      const title = path.posix.basename(entry.sourcePath);
      try {
        db.prepare(
          `INSERT INTO documents
           (id, workspace_id, project_id, kind, slug, title, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(documentId, workspaceId, projectId, kind, `${fileSlug}-${entry.id.slice(-8)}`, title, now, now);
      } catch {
        insertIssue(db, ctx.runId, entry.id, "MIGRATION_DOCUMENT_CONFLICT", "review", { sourcePath: entry.sourcePath });
        summary.issues += 1;
        continue;
      }
      const revisionId = newDomainId("drev");
      const contentSha = createHash("sha256").update(JSON.stringify({ format: body.format, title: null, body: body.body })).digest("hex");
      db.prepare(
        `INSERT INTO document_revisions
         (id, document_id, revision_no, format, title, body, content_sha256, created_at)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
      ).run(revisionId, documentId, body.format, null, body.body, contentSha, now);
      db.prepare("UPDATE documents SET current_revision_id = ?, row_version = 2 WHERE id = ?").run(revisionId, documentId);
      if (body.format !== "json") db.prepare("INSERT INTO document_revisions_fts (revision_id, title, body) VALUES (?, ?, ?)").run(revisionId, title, body.body);
      appendActivity(db, { workspaceId, projectId, entityType: "document", entityId: documentId, action: "document.created", payload: { kind, slug: fileSlug }, createdAt: now });
      db.prepare(
        `UPDATE migration_entries SET state = 'imported', target_refs_json = ?, terminal_at = ?, updated_at = ?
         WHERE id = ? AND state = 'inventoried'`,
      ).run(JSON.stringify([documentId, revisionId].sort()), now, now, entry.id);
      summary.documents += 1;
      summary.revisions += 1;
    }
    db.prepare("UPDATE migration_runs SET phase = 'import', updated_at = ? WHERE id = ?").run(now, ctx.runId);
  });
  return summary;
}

export function importExecutionAndOperations(ctx: MigrationContext): { records: number; issues: number } {
  let records = 0;
  let issues = 0;
  const db = ctx.db;
  for (const source of ctx.sourceRoots) {
    const entries = db.query<{ id: string; sourcePath: string }, [string, string]>(
      `SELECT id, source_path AS sourcePath FROM migration_entries
       WHERE migration_run_id = ? AND source_kind = ? AND state = 'inventoried' AND disposition = 'domain'`,
    ).all(ctx.runId, source.kind);
    for (const entry of entries) {
      if (classifyLegacyPath(entry.sourcePath) !== "jsonl") continue;
      const raw = fs.readFileSync(safeSourceFile(source.path, entry.sourcePath));
      for (const record of parseLegacyJsonl(raw, entry.sourcePath)) {
        records += 1;
        if (!record.issue) continue;
        issues += 1;
        withImmediateTransaction((tx) => insertIssue(tx, ctx.runId, entry.id, record.issue!.code, record.issue!.severity, record.issue!.detail));
      }
    }
  }
  return { records, issues };
}

function safeSourceFile(root: string, relative: string): string {
  const normalized = normalizeRelativePath(relative);
  const absolute = path.resolve(root, ...normalized.split("/"));
  const canonicalRoot = fs.realpathSync(root);
  const canonical = fs.realpathSync(absolute);
  if (canonical !== canonicalRoot && !canonical.startsWith(`${canonicalRoot}${path.sep}`)) throw new Error("Migration source path escapes its source root");
  return canonical;
}

function projectPath(relative: string): string | null {
  const parts = relative.split("/");
  const index = parts.indexOf("projects");
  return index >= 0 && parts[index + 1] ? parts[index + 1]! : null;
}

function safeSlug(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return slug || "imported";
}

function documentKind(relative: string): "brief" | "style-guide" | "production-plan" | "scenario" | "storyboard" | "research" | "postmortem" | "memory" | "note" | "custom" {
  const name = path.posix.basename(relative).toLowerCase();
  if (name.includes("brief")) return "brief";
  if (name.includes("style")) return "style-guide";
  if (name.includes("plan")) return "production-plan";
  if (name.includes("scenario")) return "scenario";
  if (name.includes("story")) return "storyboard";
  if (name.includes("research")) return "research";
  if (name.includes("postmortem")) return "postmortem";
  if (name.includes("memory")) return "memory";
  return "custom";
}

function insertIssue(db: Database, runId: string, entryId: string | null, code: string, severity: "info" | "review" | "block", detail: Record<string, unknown>): void {
  db.prepare(
    `INSERT INTO migration_issues
     (id, migration_run_id, migration_entry_id, code, severity, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(newDomainId("miss"), runId, entryId, code, severity, JSON.stringify(detail), Date.now());
}
