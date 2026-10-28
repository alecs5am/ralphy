// Workspace / Project reference resolution for explicit command scope (#573).
//
// Agents pass whatever they last saw: a stable id (`ws_...`, `prj_...`) or a
// human slug (`ai-native-offer`). Both are explicit, so both resolve, but only
// to exactly one row inside the explicit data root. A slug that matches more
// than one Project is refused with the candidates listed; nothing here ever
// falls back to an implicit "current" Workspace.
//
// Every helper takes the caller's read-only `Database` handle (context.ts opens
// the identity database itself) and returns plain values, so the same lookups
// back both the resolution and the error text that lists valid choices.

import type { Database } from "bun:sqlite";
import { GLOBAL_MEMORY_WORKSPACE_ID } from "./store/schema.js";

export type WorkspaceRef = { id: string; slug: string; name: string };

export type ProjectRef = {
  id: string;
  slug: string;
  name: string;
  workspaceId: string;
  workspaceSlug: string;
};

/** How many candidates an error lists before it says "+N more". */
export const CHOICE_LIMIT = 8;

/** Detail strings are single-line and bounded (DomainError caps them at 2 KiB). */
const MAX_LIST_BYTES = 1_400;

const PROJECT_COLUMNS = `project.id AS id, project.slug AS slug, project.name AS name,
  project.workspace_id AS workspaceId, workspace.slug AS workspaceSlug`;

/** Exact id first, then the unique Workspace slug. `null` when neither exists. */
export function findWorkspaceRef(db: Database, ref: string): WorkspaceRef | null {
  const byId = db
    .query<WorkspaceRef, [string]>("SELECT id, slug, name FROM workspaces WHERE id = ?")
    .get(ref);
  if (byId) return byId;
  return db
    .query<WorkspaceRef, [string, string]>(
      "SELECT id, slug, name FROM workspaces WHERE slug = ? AND id <> ?",
    )
    .get(ref, GLOBAL_MEMORY_WORKSPACE_ID) ?? null;
}

/** User-visible Workspaces (the global memory tier excluded), by slug. */
export function listWorkspaceRefs(db: Database, limit = CHOICE_LIMIT): WorkspaceRef[] {
  return db
    .query<WorkspaceRef, [string, number]>(
      "SELECT id, slug, name FROM workspaces WHERE id <> ? ORDER BY slug, id LIMIT ?",
    )
    .all(GLOBAL_MEMORY_WORKSPACE_ID, limit);
}

export function countWorkspaces(db: Database): number {
  return db
    .query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM workspaces WHERE id <> ?",
    )
    .get(GLOBAL_MEMORY_WORKSPACE_ID)?.count ?? 0;
}

/**
 * Every Project the reference can name: the exact id when it exists (ids are
 * unique, so that is the whole answer), otherwise each Project whose slug
 * matches, across Workspaces, ordered by Workspace slug.
 */
export function findProjectRefs(db: Database, ref: string): ProjectRef[] {
  const byId = db
    .query<ProjectRef, [string]>(
      `SELECT ${PROJECT_COLUMNS}
       FROM projects project JOIN workspaces workspace ON workspace.id = project.workspace_id
       WHERE project.id = ?`,
    )
    .get(ref);
  if (byId) return [byId];
  return db
    .query<ProjectRef, [string]>(
      `SELECT ${PROJECT_COLUMNS}
       FROM projects project JOIN workspaces workspace ON workspace.id = project.workspace_id
       WHERE project.slug = ?
       ORDER BY workspace.slug, project.id`,
    )
    .all(ref);
}

export function findProjectRefById(db: Database, id: string): ProjectRef | null {
  const [found] = findProjectRefs(db, id);
  return found?.id === id ? found : null;
}

/** Most recently updated Projects, optionally inside one Workspace. */
export function listProjectRefs(
  db: Database,
  workspaceId?: string,
  limit = CHOICE_LIMIT,
): ProjectRef[] {
  if (workspaceId === undefined) {
    return db
      .query<ProjectRef, [number]>(
        `SELECT ${PROJECT_COLUMNS}
         FROM projects project JOIN workspaces workspace ON workspace.id = project.workspace_id
         ORDER BY project.updated_at DESC, project.id LIMIT ?`,
      )
      .all(limit);
  }
  return db
    .query<ProjectRef, [string, number]>(
      `SELECT ${PROJECT_COLUMNS}
       FROM projects project JOIN workspaces workspace ON workspace.id = project.workspace_id
       WHERE project.workspace_id = ?
       ORDER BY project.updated_at DESC, project.id LIMIT ?`,
    )
    .all(workspaceId, limit);
}

export function countProjects(db: Database, workspaceId?: string): number {
  const row = workspaceId === undefined
    ? db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM projects").get()
    : db
      .query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM projects WHERE workspace_id = ?",
      )
      .get(workspaceId);
  return row?.count ?? 0;
}

/** `alpha (ws_..., "Alpha Brand")` — slug to scan, id to copy, name to confirm. */
export function describeWorkspace(workspace: WorkspaceRef): string {
  const slug = printable(workspace.slug, 64);
  const name = printable(workspace.name, 48);
  return name && name !== slug
    ? `${slug} (${workspace.id}, "${name}")`
    : `${slug} (${workspace.id})`;
}

/** `promo (prj_..., "Promo A", Workspace alpha)`. */
export function describeProject(project: ProjectRef): string {
  const slug = printable(project.slug, 64);
  const name = printable(project.name, 48);
  const named = name && name !== slug ? `, "${name}"` : "";
  return `${slug} (${project.id}${named}, Workspace ${printable(project.workspaceSlug, 64)})`;
}

/** Join descriptions into one bounded line, noting how many were left out. */
export function describeChoices(entries: string[], total = entries.length): string {
  const kept: string[] = [];
  let bytes = 0;
  for (const entry of entries) {
    const size = Buffer.byteLength(entry, "utf8") + 2;
    if (bytes + size > MAX_LIST_BYTES) break;
    kept.push(entry);
    bytes += size;
  }
  const omitted = total - kept.length;
  return omitted > 0 ? `${kept.join(", ")} (+${omitted} more)` : kept.join(", ");
}

/** A user-supplied value made safe for a one-line error detail. */
export function quoteRef(value: string): string {
  return `"${printable(value, 80)}"`;
}

/** A stored slug made safe for a one-line error detail, unquoted. */
export function plainRef(value: string): string {
  return printable(value, 64);
}

function printable(value: string, max: number): string {
  const flat = value.replace(/[\p{Cc}\p{Cs}\u2028\u2029]+/gu, " ").replaceAll('"', "'").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}...` : flat;
}
