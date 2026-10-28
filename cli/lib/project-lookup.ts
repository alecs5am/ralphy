// Store-backed Project lookup for compatibility verbs (#585).
//
// Domain state is authoritative in SQLite (CLAUDE.md, docs/domain-store.md).
// Compatibility verbs (`project log-asset`, `log-prompt`, `timeline`, the
// `ref` and `assets` verbs, ...) take a Project id or slug and then read or
// write the Project's on-disk tree, `.ralphy/workspaces/<workspace>/projects/
// <name>/`. They used to look the Project up in the legacy registry, so a
// Project that exists only in the store resolved its scope (#573) and then
// failed with E_NOT_FOUND.
//
// Resolution:
//   1. A resolved command scope means the data root has a store, and the store
//      decides: the scoped Project answers to its id or its slug; any other
//      reference resolves by exact id, else by its slug (unique per Workspace),
//      inside the scope's Workspace. A miss is E_NOT_FOUND.
//   2. No resolved scope: the data root has no `ralphy.db` (an unmigrated
//      legacy root) or its store holds no Workspace yet. Only then is the
//      Project looked up in the legacy registry (read-only), so those roots
//      behave exactly as before.
//
// The tree of a store Project lives in its store Workspace and is named by the
// reference as given (its slug or its id) when that tree exists, else by the
// other name when that one exists, else by the reference as given (a new tree,
// as before #585). So `log-asset prj_...` finds the tree `log-prompt <slug>`
// wrote, and trees created under either name keep working.
//
// Descriptive fields (`brief`, `refs`, ...) the store metadata does not carry
// yet are read, read-only, from a legacy registry entry for the same Project in
// the same Workspace; store metadata wins on a shared key.

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  assertCommandProject,
  getCommandContext,
  namesCommandProject,
  type ResolvedCommandContext,
} from "./context-state.js";
import { raiseError } from "./errors/index.js";
import { DEFAULT_WORKSPACE, projectDir, workspaceDir } from "./paths.js";
import { getEntity, loadRegistry } from "./registry.js";
import { findProjectRefs, type ProjectRef } from "./scope-ref.js";
import { domainDbPath } from "./store/db.js";

export type CompatibilityProject = {
  /**
   * The reference the path helpers (`projectDir`, the gen-log, ref packs) take:
   * the name of the store Project's tree, or the registry id on a legacy root.
   */
  ref: string;
  /** Store Project id (`prj_...`), or the registry id on a legacy root. */
  id: string;
  slug: string;
  name: string;
  /** Store Workspace id, or the registry Workspace slug on a legacy root. */
  workspaceId: string;
  /** The Project's on-disk compatibility tree. */
  dir: string;
  source: "store" | "registry";
  /** Store row version, for metadata writes; null on a legacy root. */
  rowVersion: number | null;
  /** Store Project metadata as stored; null on a legacy root. */
  metadata: Record<string, unknown> | null;
  /**
   * Descriptive fields the compatibility verbs read (`name`, `brief`, `refs`,
   * `kind`, ...): store metadata over any legacy registry fields, or the
   * registry entry on a legacy root.
   */
  record: Record<string, any>;
};

/** The Project a compatibility verb names, or null when there is none. */
export async function findCompatibilityProject(
  reference: string,
): Promise<CompatibilityProject | null> {
  const context = getCommandContext();
  if (context) return findStoreProject(reference, context);

  // Legacy root: no store scope was resolved for this command.
  const entity = await getEntity("projects", reference);
  if (!entity) return null;
  return {
    ref: reference,
    id: reference,
    slug: reference,
    name: typeof entity.name === "string" ? entity.name : reference,
    workspaceId:
      typeof entity.workspace === "string" && entity.workspace.length > 0
        ? entity.workspace
        : DEFAULT_WORKSPACE,
    dir: projectDir(reference),
    source: "registry",
    rowVersion: null,
    metadata: null,
    record: entity,
  };
}

/** {@link findCompatibilityProject}, raising E_NOT_FOUND on a miss. */
export async function requireCompatibilityProject(
  reference: string,
): Promise<CompatibilityProject> {
  const project = await findCompatibilityProject(reference);
  if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id: reference });
  return project;
}

async function findStoreProject(
  reference: string,
  context: ResolvedCommandContext,
): Promise<CompatibilityProject | null> {
  // Inside a Project scope only that Project is reachable: the same guard the
  // registry adapter applied, with the same error.
  assertCommandProject(reference);
  const lookup = namesCommandProject(reference) ? context.projectId! : reference;
  // A lookup only reads: a read-only handle, like the scope resolver's.
  const db = new Database(domainDbPath(), { readonly: true });
  let match: ProjectRef | undefined;
  let row: { metadata: string | null; rowVersion: number } | null = null;
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    match = findProjectRefs(db, lookup).find(
      (project) =>
        project.workspaceId === context.workspaceId &&
        (project.id === lookup || project.slug === lookup),
    );
    if (!match) return null;
    row = db
      .query<{ metadata: string | null; rowVersion: number }, [string]>(
        "SELECT metadata_json AS metadata, row_version AS rowVersion FROM projects WHERE id = ?",
      )
      .get(match.id);
  } finally {
    db.close();
  }
  const metadata = parseMetadata(row?.metadata ?? null);
  const projectsDir = path.join(workspaceDir(match.workspaceId), "projects");
  const ref = treeName(reference, match, projectsDir);
  const legacy = await legacyFields(match, [ref, match.slug, match.id]);
  return {
    ref,
    id: match.id,
    slug: match.slug,
    name: match.name,
    workspaceId: match.workspaceId,
    dir: path.join(projectsDir, ref),
    source: "store",
    rowVersion: row?.rowVersion ?? null,
    metadata,
    record: { ...legacy, ...(metadata ?? {}), name: match.name },
  };
}

/** The tree name: as given if that tree exists, else the other existing one. */
function treeName(reference: string, match: ProjectRef, projectsDir: string): string {
  const given = reference === match.id ? match.id : match.slug;
  if (existsSync(path.join(projectsDir, given))) return given;
  const other = given === match.id ? match.slug : match.id;
  return existsSync(path.join(projectsDir, other)) ? other : given;
}

/** Legacy registry fields for the same Project in the same Workspace. */
async function legacyFields(
  match: ProjectRef,
  keys: string[],
): Promise<Record<string, unknown>> {
  const projects = (await loadRegistry()).projects;
  for (const key of keys) {
    const entry = projects[key];
    if (!entry || typeof entry !== "object") continue;
    const workspace =
      typeof entry.workspace === "string" && entry.workspace.length > 0
        ? entry.workspace
        : DEFAULT_WORKSPACE;
    if (workspace === match.workspaceId || workspace === match.workspaceSlug) {
      return entry as Record<string, unknown>;
    }
  }
  return {};
}

function parseMetadata(value: string | null): Record<string, unknown> | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
