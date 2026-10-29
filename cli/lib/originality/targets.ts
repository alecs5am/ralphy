// Target resolution for `ralphy unit originality` (#561): turn Unit
// references, Projects, and paths into fingerprintable targets. Store reads go
// through the public store APIs only (Unit revision items, Artifact revision
// objects, bounded Document content); nothing here writes.

import fs from "node:fs";
import path from "node:path";
import { classifyFile, MEDIA_EXTS } from "../ffprobe.js";
import { resolveProjectDirectory } from "../analytics/ledger.js";
import { getArtifact, getArtifactRevision, resolveArtifactRevisionObject } from "../store/artifacts.js";
import { getDocumentContent } from "../store/document-content.js";
import { listUnitOutcomeFacts, locateUnits, type UnitLocationDto } from "../store/outcomes.js";
import type { QueryContext } from "../store/scope-context.js";
import { getUnit, getUnitRevision } from "../store/units.js";
import { unitContext, unitRevisionView } from "../unit-revision.js";
import { textFromFileContent, textFromJson, textFromSubtitles } from "./script-similarity.js";

export type TargetOrigin = "subject" | "against" | "workspace-unit" | "source-link" | "project-refs" | "sibling";

/** One thing to fingerprint and compare. */
export interface OriginalityTarget {
  /** The reference as the user would type it (Unit slug, path). */
  ref: string;
  label: string;
  origin: TargetOrigin;
  unitId: string | null;
  /** Media file, or null for a text-only target. */
  path: string | null;
  kind?: "video" | "image" | "audio";
  script: string | null;
  scriptSource: string | null;
}

export interface SkippedTarget {
  ref: string;
  reason: string;
}

const MEDIA_ROLE_PREFERENCE = ["master", "primary", "final", "media", "hero", "video", "render"];
const SCRIPT_ROLE_RE = /script|transcript|caption|subtitle|vo|voice|narration|scenario|body|copy|text/u;
const MAX_DIRECTORY_FILES = 50;

/** A file path target (media or text). */
export function pathTarget(file: string, origin: TargetOrigin, ref = file): OriginalityTarget {
  return { ref, label: path.basename(file), origin, unitId: null, path: path.resolve(file), script: null, scriptSource: null };
}

/** Media files directly inside a directory (sorted, capped). */
export function directoryTargets(dir: string, origin: TargetOrigin): OriginalityTarget[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && MEDIA_EXTS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"))
    .slice(0, MAX_DIRECTORY_FILES);
  return entries.map((name) => pathTarget(path.join(dir, name), origin, path.join(dir, name)));
}

/**
 * Resolve one Unit revision into a target: the primary picture / sound item
 * (role master / primary / final / media first, then video > image > audio)
 * plus any script text carried by Document items or caption Artifacts.
 */
export function unitTarget(
  context: QueryContext,
  location: Pick<UnitLocationDto, "unitId" | "slug" | "workspaceId" | "projectId">,
  origin: TargetOrigin,
  revisionId: string | null,
): OriginalityTarget | SkippedTarget {
  const ref = location.slug;
  if (!revisionId) return { ref, reason: "Unit has no sealed revision yet" };
  const scoped = unitContext(context, location as UnitLocationDto);
  const view = unitRevisionView(scoped, location.unitId, revisionId);
  const media: Array<{ path: string; kind: "video" | "image" | "audio"; role: string; position: number }> = [];
  const scripts: Array<{ text: string; source: string }> = [];
  for (const item of view.items) {
    if (item.artifactRevisionId) {
      try {
        const revision = getArtifactRevision({ context: scoped, revisionId: item.artifactRevisionId });
        const artifact = getArtifact({ context: scoped, artifactId: revision.artifactId });
        const { objectPath } = resolveArtifactRevisionObject({ context: scoped, revisionId: item.artifactRevisionId });
        if (artifact.kind === "video" || artifact.kind === "image" || artifact.kind === "audio") {
          media.push({ path: objectPath, kind: artifact.kind, role: item.role, position: item.position });
        } else if (artifact.kind === "captions" || artifact.kind === "document") {
          const text = readTextObject(objectPath);
          if (text) scripts.push({ text, source: `artifact:${artifact.slug}` });
        }
      } catch {
        /* an unreadable item is not evidence */
      }
    } else if (item.documentRevisionId && SCRIPT_ROLE_RE.test(item.role.toLowerCase())) {
      const text = readDocumentText(scoped, item.documentRevisionId);
      if (text) scripts.push({ text, source: `document:${item.role}` });
    }
  }
  const kindOrder = { video: 0, image: 1, audio: 2 } as const;
  media.sort((a, b) => {
    const ra = rolePreference(a.role);
    const rb = rolePreference(b.role);
    return ra - rb || kindOrder[a.kind] - kindOrder[b.kind] || a.position - b.position;
  });
  const primary = media[0];
  const script = scripts.length > 0 ? scripts.map((s) => s.text).join(" ") : null;
  if (!primary && !script) return { ref, reason: "Unit revision has no picture, sound, or script items" };
  return {
    ref,
    label: location.slug,
    origin,
    unitId: location.unitId,
    path: primary?.path ?? null,
    ...(primary ? { kind: primary.kind } : {}),
    script,
    scriptSource: scripts.length > 0 ? scripts.map((s) => s.source).join(" + ") : null,
  };
}

/** Targets for one Unit location (selected revision, else latest). */
export function locationTarget(
  context: QueryContext,
  location: UnitLocationDto,
  origin: TargetOrigin,
): OriginalityTarget | SkippedTarget {
  return unitTarget(context, location, origin, location.selectedRevisionId ?? location.latestRevisionId);
}

/** Every other Unit in the Workspace, newest first, capped. */
export function workspaceUnitTargets(
  context: QueryContext,
  workspaceId: string,
  excludeUnitIds: Set<string>,
  limit: number,
): { targets: OriginalityTarget[]; skipped: SkippedTarget[] } {
  const facts = listUnitOutcomeFacts({ context: { workspaceId } })
    .filter((unit) => !excludeUnitIds.has(unit.unitId))
    .sort((a, b) => b.createdAt - a.createdAt || a.unitId.localeCompare(b.unitId))
    .slice(0, limit);
  const targets: OriginalityTarget[] = [];
  const skipped: SkippedTarget[] = [];
  for (const fact of facts) {
    const unitScope: QueryContext = fact.projectId ? { workspaceId, projectId: fact.projectId } : { workspaceId };
    const scope = context.sessionId !== undefined ? context : unitScope;
    try {
      const unit = getUnit({ context: scope, unitId: fact.unitId });
      const resolved = unitTarget(scope, { unitId: unit.id, slug: unit.slug, workspaceId: unit.workspaceId, projectId: unit.projectId }, "workspace-unit", unit.selectedRevisionId ?? unit.latestRevisionId);
      if ("reason" in resolved) skipped.push(resolved);
      else targets.push(resolved);
    } catch (error) {
      skipped.push({ ref: fact.slug, reason: (error as Error).message.slice(0, 200) });
    }
  }
  return { targets, skipped };
}

/** The Unit's linked original (`ralphy unit source`), when one is set. */
export function sourceLinkTarget(context: QueryContext, location: UnitLocationDto): OriginalityTarget | SkippedTarget | null {
  const scoped = unitContext(context, location);
  const unit = getUnit({ context: scoped, unitId: location.unitId });
  if (!unit.sourceRevisionId) return null;
  const revision = getUnitRevision({ context: scoped, revisionId: unit.sourceRevisionId });
  const sourceUnit = getUnit({ context: scoped, unitId: revision.unitId });
  const target = unitTarget(
    scoped,
    { unitId: sourceUnit.id, slug: sourceUnit.slug, workspaceId: sourceUnit.workspaceId, projectId: sourceUnit.projectId },
    "source-link",
    revision.id,
  );
  if ("reason" in target) return target;
  return { ...target, label: unit.sourceLabel ? `${sourceUnit.slug} (${unit.sourceLabel})` : sourceUnit.slug };
}

/** Reference media pulled into the Unit's Project (`artifacts/refs/`), when on disk. */
export function projectRefTargets(location: UnitLocationDto): OriginalityTarget[] {
  let dir: string | null = null;
  try {
    dir = resolveProjectDirectory(location);
  } catch {
    dir = null;
  }
  if (!dir) return [];
  const refs = path.join(dir, "artifacts", "refs");
  if (!fs.existsSync(refs)) return [];
  const files: string[] = [];
  const walk = (current: string, depth: number) => {
    if (depth > 2 || files.length >= 20) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile() && (classifyFile(full) === "video" || classifyFile(full) === "image")) files.push(full);
    }
  };
  walk(refs, 0);
  return files.slice(0, 20).map((file) => pathTarget(file, "project-refs", path.relative(dir!, file)));
}

/** Resolve an `--against` value: a file, a directory, or Unit / Project refs. */
export function resolveAgainst(
  value: string,
  context: QueryContext | null,
  excludeUnitIds: Set<string>,
): { targets: OriginalityTarget[]; skipped: SkippedTarget[] } {
  if (fs.existsSync(value)) {
    const stat = fs.statSync(value);
    if (stat.isDirectory()) {
      const targets = directoryTargets(value, "against");
      return targets.length > 0
        ? { targets, skipped: [] }
        : { targets: [], skipped: [{ ref: value, reason: "directory has no media files" }] };
    }
    return { targets: [pathTarget(value, "against")], skipped: [] };
  }
  if (!context) return { targets: [], skipped: [{ ref: value, reason: "not a file, and no Workspace store to resolve a Unit" }] };
  let locations: UnitLocationDto[];
  try {
    locations = locateUnits({ context, ref: value });
  } catch (error) {
    return { targets: [], skipped: [{ ref: value, reason: (error as Error).message.slice(0, 200) }] };
  }
  if (locations.length === 0) return { targets: [], skipped: [{ ref: value, reason: "no Unit, Project, or file matches" }] };
  const targets: OriginalityTarget[] = [];
  const skipped: SkippedTarget[] = [];
  for (const location of locations) {
    if (excludeUnitIds.has(location.unitId)) continue;
    const resolved = locationTarget(context, location, "against");
    if ("reason" in resolved) skipped.push(resolved);
    else targets.push(resolved);
  }
  return { targets, skipped };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function rolePreference(role: string): number {
  const index = MEDIA_ROLE_PREFERENCE.indexOf(role.toLowerCase());
  return index < 0 ? MEDIA_ROLE_PREFERENCE.length : index;
}

function readTextObject(file: string): string | null {
  try {
    const stat = fs.statSync(file);
    if (stat.size > 2_000_000) return null;
    const raw = fs.readFileSync(file, "utf8");
    const ext = path.extname(file).toLowerCase();
    if (ext) return textFromFileContent(raw, ext) || null;
    const trimmed = raw.trimStart();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return textFromJson(JSON.parse(raw)) || null;
      } catch {
        /* not JSON */
      }
    }
    return textFromSubtitles(raw) || null;
  } catch {
    return null;
  }
}

/** Document revision text through the bounded content seam (<= 1 MiB). */
function readDocumentText(context: QueryContext, revisionId: string): string | null {
  let text = "";
  let after = 0;
  let format: string | null = null;
  for (let page = 0; page < 16; page += 1) {
    try {
      const chunk = getDocumentContent({ context, revisionId, afterByte: after, limitBytes: 65_536 });
      format = chunk.format;
      text += chunk.text;
      if (chunk.nextByte === null) break;
      after = chunk.nextByte;
    } catch {
      return null;
    }
  }
  if (!text.trim()) return null;
  if (format === "json") {
    try {
      return textFromJson(JSON.parse(text)) || null;
    } catch {
      return null;
    }
  }
  return textFromFileContent(text, format === "markdown" ? ".md" : ".txt") || null;
}
