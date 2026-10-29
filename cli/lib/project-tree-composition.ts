// The video Composition a store Project renders from its on-disk tree (#591).
//
// `ralphy new` and `ralphy project create` create a store Project with an
// on-disk tree (`.ralphy/workspaces/<ws>/projects/<slug>/`) and no Composition,
// and agents then write the HyperFrames sources into that tree: `index.html`
// plus the stylesheets, scripts, sub-compositions, and media it loads. On a
// store root `ralphy render` builds a Composition revision, so such a Project
// could not be rendered at all.
//
// `render` (and its `hyperframes render` alias) therefore records the tree as
// the Project's video Composition:
//   - no video Composition yet (or one without revisions): create it and
//     record the tree as its first revision;
//   - the latest revision was recorded from the tree: record a new child
//     revision when the tree changed since, else build that sealed revision
//     again;
//   - the latest revision was authored any other way (Desktop, `composition
//     revise`, `hyperframes save-version`, migration): build it as it is; the
//     tree is not consulted.
// Each recording is an ordinary append-only, sealed Composition revision with
// engine `hyperframes` and engine config `{ "source": "project-tree" }`;
// unchanged files keep the Object of the revision they were recorded in.
//
// Why at render and not at creation: at creation there is no `index.html` yet
// (agents write it afterwards), `project create` makes no tree at all, and a
// creation-time Composition could not follow later edits of the tree. Render
// is the first moment the sources exist, and every render sees the tree as it
// is then.
//
// Sources are the tree's non-empty regular files, except render outputs and
// bookkeeping that no composition loads: `render/`, `logs/`, `units/`,
// `postmortem/`, `compositions/snapshots/`, `compositions/frames/`, and
// dot-entries (hidden auto-versions, `.DS_Store`). Symbolic links are not
// followed.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DomainError } from "./errors/domain.js";
import {
  createComposition,
  listCompositions,
  putCompositionSource,
  removeCompositionSource,
  reviseComposition,
  sealCompositionRevision,
} from "./store/compositions.js";
import { openDomainDb } from "./store/db.js";
import { ingestObject } from "./store/objects.js";
import type { QueryContext } from "./store/scope-context.js";
import type { CompositionDto } from "./store/types.js";

/** Engine config marker of a revision recorded from the Project tree. */
export const PROJECT_TREE_SOURCE = "project-tree";

const EXCLUDED_TOP_LEVEL = new Set(["render", "logs", "units", "postmortem"]);
const EXCLUDED_PATHS = new Set(["compositions/snapshots", "compositions/frames"]);

export type ProjectTreeRevision = "create" | "revise" | "unchanged";

export type RenderComposition = {
  compositionId: string | null;
  /** The revision to build; null only in a dry run that would record one. */
  revisionId: string | null;
  /** Set when the revision comes (or would come) from the Project tree. */
  projectTree: { path: string; files: number; revision: ProjectTreeRevision } | null;
};

type TreeFile = { logicalPath: string; absolutePath: string; bytes: number };
type RecordedSource = { logicalPath: string; objectId: string; sha256: string; bytes: number };
type RevisionFacts = { id: string; state: "draft" | "sealed"; fromTree: boolean };

/**
 * The video Composition revision `render` builds for a store Project, recording
 * it from the Project tree when the Project has none or its tree changed. A dry
 * run reports the plan and records nothing.
 */
export async function renderCompositionForProject(input: {
  context: QueryContext;
  workspaceId: string;
  projectId: string;
  /** The Project's on-disk tree; null when there is none. */
  treeDir: string | null;
  /** The Project reference as the user gave it, for error text. */
  reference: string;
  verb: string;
  dryRun?: boolean;
  authoredBySessionId?: string | null;
}): Promise<RenderComposition> {
  const compositions = listCompositions({ context: input.context, projectId: input.projectId, limit: 100 }).items;
  const composition = compositions.find((item) => item.kind === "video") ?? null;
  const latest = composition?.latestRevisionId ? revisionFacts(composition.latestRevisionId) : null;
  if (composition && latest && !latest.fromTree) {
    return { compositionId: composition.id, revisionId: latest.id, projectTree: null };
  }

  const tree = input.treeDir !== null && isRegularFile(path.join(input.treeDir, "index.html"))
    ? projectTreeFiles(input.treeDir)
    : null;
  if (tree === null || input.treeDir === null) {
    // A tree-recorded revision stays buildable after its tree is gone.
    if (composition && latest?.state === "sealed") {
      return { compositionId: composition.id, revisionId: latest.id, projectTree: null };
    }
    const where = input.treeDir === null ? "it has no Project tree" : `${path.join(input.treeDir, "index.html")} does not exist`;
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "project",
      detail: `Project ${input.reference} has no video Composition to build and ${where}; write the HyperFrames index.html into the Project tree and retry`,
      verb: input.verb,
    });
  }

  const recorded = latest ? recordedSources(latest.id) : [];
  const digests = new Map<string, string>();
  const digest = async (file: TreeFile) => {
    let value = digests.get(file.absolutePath);
    if (value === undefined) digests.set(file.absolutePath, (value = await sha256File(file.absolutePath)));
    return value;
  };
  const describe = (revision: ProjectTreeRevision) => ({ path: input.treeDir!, files: tree.length, revision });
  if (latest?.state === "sealed" && (await sameSources(tree, recorded, digest))) {
    return { compositionId: composition!.id, revisionId: latest.id, projectTree: describe("unchanged") };
  }
  const revision: ProjectTreeRevision = latest ? "revise" : "create";
  if (input.dryRun) {
    return { compositionId: composition?.id ?? null, revisionId: null, projectTree: describe(revision) };
  }

  const compositionId = composition?.id ??
    createComposition({ projectId: input.projectId, slug: freeSlug(compositions), kind: "video" }).id;
  // A tree draft left by an interrupted render is completed, not stacked on.
  const revisionId = latest?.state === "draft"
    ? latest.id
    : reviseComposition({
        context: input.context,
        compositionId,
        expectedLatestRevisionId: latest?.id ?? null,
        engine: "hyperframes",
        engineConfig: { source: PROJECT_TREE_SOURCE },
        authoredBySessionId: input.authoredBySessionId ?? null,
      }).id;
  // The revision mirrors the tree exactly: drop what it carries over from its
  // parent, then record every tree file in path order.
  for (const source of recordedSources(revisionId)) {
    removeCompositionSource({ revisionId, logicalPath: source.logicalPath });
  }
  const reusable = new Map(recorded.map((source) => [source.logicalPath, source]));
  for (const [position, file] of tree.entries()) {
    const previous = reusable.get(file.logicalPath);
    const objectId = previous && previous.bytes === file.bytes && previous.sha256 === (await digest(file))
      ? previous.objectId
      : (await ingestObject({
          scope: { workspaceId: input.workspaceId, projectId: input.projectId },
          sourcePath: file.absolutePath,
          originalName: path.posix.basename(file.logicalPath),
          mime: mimeFor(file.logicalPath),
          storageClass: "durable",
          transfer: "copy",
        })).id;
    putCompositionSource({ revisionId, logicalPath: file.logicalPath, objectId, position });
  }
  sealCompositionRevision({ revisionId });
  return { compositionId, revisionId, projectTree: describe(revision) };
}

/** The tree's HyperFrames sources, sorted by logical path. */
function projectTreeFiles(treeDir: string): TreeFile[] {
  const files: TreeFile[] = [];
  const walk = (directory: string, prefix: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name.includes("\\")) continue;
      const logicalPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if ((!prefix && EXCLUDED_TOP_LEVEL.has(entry.name)) || EXCLUDED_PATHS.has(logicalPath)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath, logicalPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const bytes = fs.lstatSync(absolutePath).size;
      if (bytes > 0) files.push({ logicalPath, absolutePath, bytes });
    }
  };
  walk(treeDir, "");
  return files.sort((left, right) => (left.logicalPath < right.logicalPath ? -1 : left.logicalPath > right.logicalPath ? 1 : 0));
}

/** Same paths, sizes, and bytes; sizes first, so a changed tree is rarely hashed. */
async function sameSources(
  tree: TreeFile[],
  recorded: RecordedSource[],
  digest: (file: TreeFile) => Promise<string>,
): Promise<boolean> {
  if (tree.length !== recorded.length) return false;
  const byPath = new Map(recorded.map((source) => [source.logicalPath, source]));
  if (tree.some((file) => byPath.get(file.logicalPath)?.bytes !== file.bytes)) return false;
  for (const file of tree) {
    if ((await digest(file)) !== byPath.get(file.logicalPath)!.sha256) return false;
  }
  return true;
}

function revisionFacts(revisionId: string): RevisionFacts {
  const row = openDomainDb().query<{ id: string; state: "draft" | "sealed"; engine: string; config: string }, [string]>(
    `SELECT id, state, engine, engine_config_json AS config
     FROM composition_revisions WHERE id = ?`,
  ).get(revisionId);
  if (!row) throw new Error(`Composition Revision not found: ${revisionId}`);
  let source: unknown = null;
  try {
    source = (JSON.parse(row.config) as { source?: unknown } | null)?.source ?? null;
  } catch {
    source = null;
  }
  return { id: row.id, state: row.state, fromTree: row.engine === "hyperframes" && source === PROJECT_TREE_SOURCE };
}

function recordedSources(revisionId: string): RecordedSource[] {
  return openDomainDb().query<RecordedSource, [string]>(
    `SELECT file.logical_path AS logicalPath, file.object_id AS objectId,
            object.sha256 AS sha256, object.bytes AS bytes
     FROM composition_revision_files file
     JOIN objects object ON object.id = file.object_id
     WHERE file.composition_revision_id = ?
     ORDER BY file.position, file.logical_path, file.id`,
  ).all(revisionId);
}

/** `video`, or the first free `video-<n>` when another Composition holds it. */
function freeSlug(compositions: CompositionDto[]): string {
  const taken = new Set(compositions.map((item) => item.slug));
  let slug = "video";
  for (let n = 2; taken.has(slug); n += 1) slug = `video-${n}`;
  return slug;
}

function isRegularFile(file: string): boolean {
  try {
    return fs.lstatSync(file).isFile();
  } catch {
    return false;
  }
}

async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function mimeFor(filename: string): string {
  return ({
    ".html": "text/html", ".htm": "text/html", ".css": "text/css", ".js": "text/javascript",
    ".mjs": "text/javascript", ".json": "application/json", ".txt": "text/plain", ".md": "text/markdown",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".webm": "video/webm",
    ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
    ".srt": "text/plain", ".vtt": "text/vtt", ".woff": "font/woff", ".woff2": "font/woff2",
    ".ttf": "font/ttf", ".otf": "font/otf",
  } as Record<string, string>)[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
}
