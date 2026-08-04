import type { GenerationDestination } from "./generation-destination.js";
import path from "node:path";
import { workspaceDir } from "./paths.js";
import { getProject, getWorkspace, listWorkspaces } from "./store/scopes.js";

/** Resolve a legacy CLI Workspace ID-or-slug to the stable domain ID without active fallback. */
export function generationRunScope(
  destination: GenerationDestination,
): { projectId: string } | { workspaceId: string } {
  if (destination.kind === "project") return { projectId: destination.id };
  try {
    return { workspaceId: getWorkspace(destination.id).id };
  } catch {
    let cursor: string | null | undefined;
    do {
      const page = listWorkspaces({ cursor, limit: 100 });
      const workspace = page.items.find((item) => item.slug === destination.id);
      if (workspace) return { workspaceId: workspace.id };
      cursor = page.nextCursor;
    } while (cursor);
  }
  throw new Error(`Workspace not found: ${destination.id}`);
}

/** Filesystem compatibility path for the explicit legacy-output flags only. */
export function generationProjectCompatibilityDir(projectId: string): string {
  let cursor: string | null | undefined;
  do {
    const page = listWorkspaces({ cursor, limit: 100 });
    for (const workspace of page.items) {
      try {
        getProject({ workspaceId: workspace.id, projectId });
        return path.join(workspaceDir(workspace.slug), "projects", projectId);
      } catch {
        // Continue across the explicit public Workspace pages.
      }
    }
    cursor = page.nextCursor;
  } while (cursor);
  throw new Error(`Project not found: ${projectId}`);
}
