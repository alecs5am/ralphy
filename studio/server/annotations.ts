// Studio object annotations (#488) — a file-backed, append-only tag + note layer
// for Studio-selected objects (runs, projects, workflow nodes, artifacts, eval
// findings, Units, publish destinations).
//
// METADATA ONLY (AGENTS.md invariant #14): nothing here writes, renames, or
// deletes a media artifact. Annotations live in a sidecar `annotations.jsonl`
// at the owning scope root — `<project>/annotations.jsonl` for project-scoped
// targets, `runs/<id>/annotations.jsonl` for run-scoped targets. The log is
// APPEND-ONLY: an "add" appends a record, a "remove" appends a tombstone
// referencing a prior id, and the live set is the fold over the log. Studio
// never rewrites the file in place.
//
// Self-contained like the rest of studio/server (it never imports cli/). The
// chat agent reads these annotations as durable, inspectable context — which
// thumbnail is the winner, which finding to repair — instead of guessing from
// prose. The agent-facing handoff (a context pack) is the inbox (#489).

import path from "node:path";
import fs from "node:fs";
import { projectDir } from "./lib.js";

/** The controlled vocabulary — a small fixed tag set, plus a free-text note. */
export const ANNOTATION_TAGS = [
  "winner",
  "reject",
  "needs-regeneration",
  "weak-hook",
  "style-drift",
  "use-as-reference",
  "approved",
  "publish-ready",
  "template-candidate",
] as const;
export type AnnotationTag = (typeof ANNOTATION_TAGS)[number];
const TAG_SET = new Set<string>(ANNOTATION_TAGS);

/** Target object types an annotation can attach to. */
export const ANNOTATION_TARGET_TYPES = [
  "run",
  "project",
  "workflow_node",
  "artifact",
  "eval_finding",
  "unit",
  "destination",
] as const;
export type AnnotationTargetType = (typeof ANNOTATION_TARGET_TYPES)[number];
const TARGET_SET = new Set<string>(ANNOTATION_TARGET_TYPES);

export type AnnotationTarget = {
  type: AnnotationTargetType;
  /** The target identifier, by type: run id / project id / step id / project-
   *  relative artifact path / finding id / unit slug / destination id. */
  ref: string;
};

export type AnnotationRecord = {
  id: string;
  ts: string;
  target: AnnotationTarget;
  tags: AnnotationTag[];
  note: string;
};

/** A scope is the dir whose `annotations.jsonl` an annotation lives in. */
export type AnnotationScope =
  | { kind: "project"; dataRoot: string; workspace: string; id: string }
  | { kind: "run"; dataRoot: string; workspace: string; id: string };

const ANNOTATIONS_FILE = "annotations.jsonl";

function runDirOf(dataRoot: string, workspace: string, runId: string): string {
  return path.join(dataRoot, "workspaces", workspace, "runs", runId);
}

/** The scope root dir, or null when the workspace/project/run root is missing. */
function scopeRoot(scope: AnnotationScope): string | null {
  const dir =
    scope.kind === "project"
      ? projectDir(scope.dataRoot, scope.workspace, scope.id)
      : runDirOf(scope.dataRoot, scope.workspace, scope.id);
  return fs.existsSync(dir) ? dir : null;
}

function annotationsPath(root: string): string {
  return path.join(root, ANNOTATIONS_FILE);
}

function mkId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Fold a project/run's `annotations.jsonl` into its live annotation set. An
 * "add" line introduces a record; a "remove" line tombstones a prior id. Bad
 * lines are skipped. Returns newest-first.
 */
export function readAnnotations(scope: AnnotationScope): AnnotationRecord[] {
  const root = scopeRoot(scope);
  if (!root) return [];
  let raw: string;
  try {
    raw = fs.readFileSync(annotationsPath(root), "utf-8");
  } catch {
    return [];
  }
  const live = new Map<string, AnnotationRecord>();
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    let row: any;
    try {
      row = JSON.parse(t);
    } catch {
      continue;
    }
    if (row?.op === "remove" && typeof row.removes === "string") {
      live.delete(row.removes);
      continue;
    }
    if (typeof row?.id !== "string" || !row.target || typeof row.target.ref !== "string") continue;
    if (!TARGET_SET.has(row.target.type)) continue;
    const tags = Array.isArray(row.tags) ? row.tags.filter((x: unknown) => TAG_SET.has(x as string)) : [];
    live.set(row.id, {
      id: row.id,
      ts: typeof row.ts === "string" ? row.ts : "",
      target: { type: row.target.type, ref: row.target.ref },
      tags,
      note: typeof row.note === "string" ? row.note : "",
    });
  }
  return [...live.values()].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
}

/**
 * Guard an artifact target ref against path traversal: it must resolve INSIDE
 * the project dir. (Existence is NOT required — an annotation may outlive a
 * superseded artifact; this is metadata, never media.)
 */
function artifactRefSafe(projectRoot: string, ref: string): boolean {
  if (!ref || path.isAbsolute(ref)) return false;
  const abs = path.resolve(projectRoot, ref);
  return abs === projectRoot || abs.startsWith(projectRoot + path.sep);
}

export type AddAnnotationInput = {
  target: { type: string; ref: string };
  tags?: string[];
  note?: string;
};

/**
 * Append an annotation to the scope's log and return the new record + the
 * folded live set. Returns `{ error }` on a bad scope / target / tag, mirroring
 * writeBoardChoice's shape so the HTTP layer can map it to a 400.
 */
export function addAnnotation(
  scope: AnnotationScope,
  input: AddAnnotationInput,
): { annotation: AnnotationRecord; annotations: AnnotationRecord[] } | { error: string } {
  const root = scopeRoot(scope);
  if (!root) return { error: "unknown scope" };

  const type = input.target?.type;
  const ref = input.target?.ref;
  if (typeof type !== "string" || !TARGET_SET.has(type)) return { error: "bad target type" };
  if (typeof ref !== "string" || !ref) return { error: "target ref required" };

  // `artifact` is project-scoped only and must not traverse out of the project.
  if (type === "artifact") {
    if (scope.kind !== "project") return { error: "artifact target requires a project scope" };
    if (!artifactRefSafe(root, ref)) return { error: "artifact ref escapes the project" };
  }

  const tagsIn = Array.isArray(input.tags) ? input.tags : [];
  const bad = tagsIn.find((t) => !TAG_SET.has(t));
  if (bad) return { error: `unknown tag: ${bad}` };
  const tags = [...new Set(tagsIn)] as AnnotationTag[];

  const note = typeof input.note === "string" ? input.note.slice(0, 2000) : "";
  if (tags.length === 0 && !note) return { error: "an annotation needs at least one tag or a note" };

  const annotation: AnnotationRecord = {
    id: mkId(),
    ts: new Date().toISOString(),
    target: { type: type as AnnotationTargetType, ref },
    tags,
    note,
  };
  fs.appendFileSync(annotationsPath(root), JSON.stringify(annotation) + "\n");
  return { annotation, annotations: readAnnotations(scope) };
}

/**
 * Append a tombstone removing a prior annotation by id, and return the folded
 * live set. Idempotent — removing an unknown id is a no-op (still appends a
 * tombstone so the intent is recorded).
 */
export function removeAnnotation(
  scope: AnnotationScope,
  id: string,
): { annotations: AnnotationRecord[] } | { error: string } {
  const root = scopeRoot(scope);
  if (!root) return { error: "unknown scope" };
  if (typeof id !== "string" || !id) return { error: "annotation id required" };
  fs.appendFileSync(annotationsPath(root), JSON.stringify({ op: "remove", removes: id, ts: new Date().toISOString() }) + "\n");
  return { annotations: readAnnotations(scope) };
}
