// Per-workspace custom-evaluator config loader (#468).
//
// Resolution: read the sibling `<workspace>/evaluators.json` FIRST; if absent,
// fall back to an `evaluators` key inside `<workspace>/workspace.json`. If
// neither yields a config, return null — zero behavior change for workspaces
// without a rubric.
//
// A malformed config returns null + a console.warn rather than throwing: a bad
// rubric must NOT crash unrelated verbs (this loader runs opportunistically from
// the eval path), and there is no clean dedicated error code for "optional
// per-workspace config failed to parse". The parse error is surfaced on the
// warning so the workspace owner can fix it.

import fs from "node:fs/promises";
import path from "node:path";
import { workspaceDir, workspaceManifestPath } from "./paths.js";
import {
  parseWorkspaceEvaluators,
  type WorkspaceEvaluatorsConfig,
} from "./schemas/workspace-evaluators.js";

/** Read + JSON-parse a file, or return undefined when it doesn't exist / is unreadable. */
async function readJson(file: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8"));
  } catch {
    return undefined;
  }
}

/**
 * Load the custom-evaluator config for a workspace. Returns null when none is
 * configured OR when the configured one is malformed (with a warning) — callers
 * treat null as "no custom rubric for this workspace".
 */
export async function loadWorkspaceEvaluators(
  workspaceSlug: string,
): Promise<WorkspaceEvaluatorsConfig | null> {
  // 1. Sibling evaluators.json wins.
  const sibling = await readJson(
    path.join(workspaceDir(workspaceSlug), "evaluators.json"),
  );
  // 2. Else the `evaluators` key inside workspace.json.
  const manifest =
    sibling === undefined
      ? ((await readJson(workspaceManifestPath(workspaceSlug))) as
          | Record<string, unknown>
          | undefined)
      : undefined;
  const raw = sibling ?? manifest?.evaluators;
  if (raw === undefined) return null;

  try {
    return parseWorkspaceEvaluators(raw);
  } catch (err) {
    console.warn(
      `[workspace-evaluators] malformed evaluator config for workspace "${workspaceSlug}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}
