// Storyboard review (#570) — where the scenes come from.
//
// The scenes are derived on every read, never copied by hand:
//   • scenario  — `<project>/scenario.json` (the scenarist's working file), else
//                 the JSON Document revision bound to the Project's `scenario`
//                 stage. Record (`scenes{}`) and legacy array shapes both read.
//   • frame     — the newest revision of the image Artifact `storyboard-<scene>`
//                 (or `<scene>-storyboard` / `<scene>-sketch`), else a file of
//                 that name under `artifacts/images/` or `storyboard/`, else a
//                 `frame` path on the scenario scene.
//   • models    — the scene's entries in `prompts.json`, else the production
//                 plan's `modelStack`, else the `ralphy generate` defaults.
//   • cost      — one image + `durationSec` of video at those models.
//
// The Project is resolved through the domain store (id or slug), and its
// on-disk compatibility tree through the store Workspace's slug, so the CLI,
// the bridge and the contract ledger all read the same scenes without a
// registry or a current-Workspace pointer.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getCommandContext } from "../context-state.js";
import { imageCostUsd } from "../generate-batch.js";
import { estimateVideoCostUsd } from "../or-catalog.js";
import { workspaceDir } from "../paths.js";
import { resolveLatestArtifactObject } from "../store/artifacts.js";
import { openDomainDb } from "../store/db.js";
import {
  RAW_FOOTAGE_MODES,
  sceneFingerprint,
  type StoryboardFrame,
  type StoryboardModels,
  type StoryboardSceneDraft,
} from "./model.js";

export const DEFAULT_IMAGE_MODEL = "google/gemini-3-pro-image";
export const DEFAULT_VIDEO_MODEL = "kwaivgi/kling-v3.0-pro";

const FRAME_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];
const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export interface StoryboardProject {
  id: string;
  slug: string;
  workspaceId: string;
  workspaceSlug: string;
  /** The Project's on-disk compatibility tree. */
  dir: string;
  metadata: Record<string, unknown> | null;
}

type ProjectRow = {
  id: string;
  slug: string;
  workspaceId: string;
  workspaceSlug: string;
  metadataJson: string | null;
};

/**
 * Resolve a Project by id or slug through the store. Inside a resolved command
 * scope only that scope's Workspace is searched. Returns null when there is no
 * store or no such Project.
 */
export function findStoryboardProject(
  reference: string,
  options: { workspaceId?: string } = {},
): StoryboardProject | null {
  let row: ProjectRow | null = null;
  try {
    const workspaceId = options.workspaceId ?? getCommandContext()?.workspaceId;
    const select = `SELECT project.id, project.slug, project.workspace_id AS workspaceId,
        workspace.slug AS workspaceSlug, project.metadata_json AS metadataJson
      FROM projects project JOIN workspaces workspace ON workspace.id = project.workspace_id`;
    row = workspaceId
      ? openDomainDb().query<ProjectRow, [string, string, string, string, string]>(
          `${select} WHERE (project.workspace_id = ? OR workspace.slug = ?) AND (project.id = ? OR project.slug = ?)
           ORDER BY CASE WHEN project.id = ? THEN 0 ELSE 1 END LIMIT 1`,
        ).get(workspaceId, workspaceId, reference, reference, reference)
      : openDomainDb().query<ProjectRow, [string, string, string]>(
          `${select} WHERE project.id = ? OR project.slug = ?
           ORDER BY CASE WHEN project.id = ? THEN 0 ELSE 1 END LIMIT 1`,
        ).get(reference, reference, reference);
  } catch {
    return null;
  }
  if (!row) return null;
  const projectsDir = path.join(workspaceDir(row.workspaceSlug), "projects");
  const names = [reference, row.slug, row.id];
  const existing = names.find((name) => fs.existsSync(path.join(projectsDir, name)));
  return {
    id: row.id,
    slug: row.slug,
    workspaceId: row.workspaceId,
    workspaceSlug: row.workspaceSlug,
    dir: path.join(projectsDir, existing ?? row.slug),
    metadata: parseObject(row.metadataJson),
  };
}

/** {@link findStoryboardProject}, throwing when the Project is unknown. */
export function requireStoryboardProject(
  reference: string,
  options: { workspaceId?: string } = {},
): StoryboardProject {
  const project = findStoryboardProject(reference, options);
  if (!project) throw new Error(`Project not found: ${reference}`);
  return project;
}

export interface DerivedStoryboard {
  scenes: StoryboardSceneDraft[];
  scenarioSource: string | null;
  contentMode: string | null;
  aiProduction: boolean;
  aiProductionReason: string;
}

/** Derive the storyboard scenes of a Project. Reads only; never writes. */
export function deriveStoryboard(project: StoryboardProject): DerivedStoryboard {
  const scenario = readScenario(project);
  const plan = readJson(path.join(project.dir, "production-plan.json"));
  const prompts = readJson(path.join(project.dir, "prompts.json"));
  const contentMode =
    stringAt(plan, ["contentMode", "mode"]) ??
    stringAt(scenario?.value, ["content_mode"]) ??
    (typeof project.metadata?.contentMode === "string" ? project.metadata.contentMode : null);
  const rawScenes = scenario ? normalizeScenes(scenario.value) : [];
  const promptEntries = promptsBySlot(prompts);
  const planModels = planModelDefaults(plan);

  const scenes = rawScenes.map((raw, index): StoryboardSceneDraft => {
    const id = raw.id;
    const vo = firstString(raw.vo_text, (raw.voiceover as Record<string, unknown> | undefined)?.text, raw.vo) ?? "";
    const durationSec = firstNumber(raw.target_duration_s, raw.durationSec, raw.duration_s, raw.duration) ?? 0;
    const camera = firstString(raw.camera, raw.shot, raw.framing) ?? "";
    const frame = resolveFrame(project, id, firstString(raw.frame, raw.storyboard_frame));
    const models = sceneModels(id, promptEntries, planModels);
    const estimatedCostUsd = Number(
      ((models.image ? imageCostUsd(models.image) : 0) +
        (models.video ? estimateVideoCostUsd(models.video, durationSec) : 0)).toFixed(4),
    );
    const draft = {
      id,
      order: index + 1,
      role: typeof raw.role === "string" ? raw.role : null,
      vo,
      durationSec,
      camera,
      frame,
      models,
      estimatedCostUsd,
    };
    return { ...draft, fingerprint: sceneFingerprint(draft) };
  });

  const explicit = firstString(stringAt(scenario?.value, ["production"]), stringAt(plan, ["production"]));
  let aiProduction = scenes.length > 0;
  let aiProductionReason = scenes.length > 0
    ? `AI production: ${scenes.length} scenario scene(s) will be generated`
    : "no scenario scenes: nothing to review";
  if (explicit === "raw-footage") {
    aiProduction = false;
    aiProductionReason = "the project declares production: raw-footage (edits of existing footage need no storyboard approval)";
  } else if (contentMode && RAW_FOOTAGE_MODES.includes(contentMode)) {
    aiProduction = false;
    aiProductionReason = `content mode ${contentMode} edits raw footage: no storyboard approval step`;
  }
  return {
    scenes,
    scenarioSource: scenario?.source ?? null,
    contentMode,
    aiProduction,
    aiProductionReason,
  };
}

type RawScene = Record<string, unknown> & { id: string };

function readScenario(project: StoryboardProject): { value: unknown; source: string } | null {
  const file = path.join(project.dir, "scenario.json");
  const fromFile = readJson(file);
  if (fromFile && typeof fromFile === "object") return { value: fromFile, source: "scenario.json" };
  try {
    const row = openDomainDb().query<{ body: string }, [string]>(
      `SELECT revision.body FROM project_stages stage
       JOIN document_revisions revision ON revision.id = stage.entity_id
       JOIN documents document ON document.id = revision.document_id
       WHERE stage.project_id = ? AND stage.stage = 'scenario'
         AND stage.entity_type = 'document_revision' AND revision.format = 'json'
         AND document.project_id = stage.project_id`,
    ).get(project.id);
    if (!row) return null;
    const value = JSON.parse(row.body) as unknown;
    return value && typeof value === "object" ? { value, source: "document:scenario" } : null;
  } catch {
    return null;
  }
}

function normalizeScenes(scenario: unknown): RawScene[] {
  const scenes = (scenario as { scenes?: unknown } | null)?.scenes;
  const list: RawScene[] = [];
  if (Array.isArray(scenes)) {
    scenes.forEach((scene, index) => {
      if (!scene || typeof scene !== "object") return;
      const value = scene as Record<string, unknown>;
      const id = typeof value.id === "string" && value.id ? value.id : `scene-${String(index + 1).padStart(2, "0")}`;
      list.push({ ...value, id });
    });
  } else if (scenes && typeof scenes === "object") {
    for (const [key, scene] of Object.entries(scenes)) {
      if (!scene || typeof scene !== "object") continue;
      const value = scene as Record<string, unknown>;
      list.push({ ...value, id: typeof value.id === "string" && value.id ? value.id : key });
    }
  }
  return list;
}

function resolveFrame(project: StoryboardProject, sceneId: string, scenarioFrame: string | null): StoryboardFrame | null {
  const slots = [`storyboard-${sceneId}`, `${sceneId}-storyboard`, `${sceneId}-sketch`];
  for (const slot of slots) {
    try {
      const found = resolveLatestArtifactObject({ context: { projectId: project.id }, slug: slot, kind: "image" });
      return {
        slot,
        source: "artifact",
        artifactId: found.artifact.id,
        revisionId: found.revision.id,
        objectId: found.revision.objectId,
        path: found.objectPath,
        mime: objectMime(found.revision.objectId) ?? mimeOf(found.objectPath),
        key: found.revision.id,
      };
    } catch {
      // Not an Artifact under this slot; try the next convention.
    }
  }
  const candidates: string[] = [];
  for (const slot of slots) {
    for (const extension of FRAME_EXTENSIONS) {
      candidates.push(path.join(project.dir, "artifacts", "images", `${slot}${extension}`));
      candidates.push(path.join(project.dir, "storyboard", `${slot}${extension}`));
    }
  }
  for (const extension of FRAME_EXTENSIONS) {
    candidates.push(path.join(project.dir, "storyboard", `${sceneId}${extension}`));
  }
  if (scenarioFrame) {
    const resolved = path.resolve(project.dir, scenarioFrame);
    if (resolved.startsWith(project.dir + path.sep)) candidates.unshift(resolved);
  }
  for (const file of candidates) {
    if (!isFile(file)) continue;
    return {
      slot: path.relative(project.dir, file),
      source: "file",
      artifactId: null,
      revisionId: null,
      objectId: null,
      path: file,
      mime: mimeOf(file),
      key: `sha256:${createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 16)}`,
    };
  }
  return null;
}

type PromptEntry = { slot: string; model: string | null; kind: string | null };

function promptsBySlot(prompts: unknown): PromptEntry[] {
  const entries: PromptEntry[] = [];
  const push = (slot: unknown, value: unknown) => {
    if (typeof slot !== "string" || !value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    entries.push({
      slot,
      model: typeof record.model === "string" ? record.model : null,
      kind: firstString(record.kind, record.type, record.capability),
    });
  };
  if (Array.isArray(prompts)) {
    for (const entry of prompts) push((entry as Record<string, unknown> | null)?.slot, entry);
  } else if (prompts && typeof prompts === "object") {
    const container = (prompts as Record<string, unknown>).slots;
    const record = container && typeof container === "object" ? container : prompts;
    if (Array.isArray(record)) {
      for (const entry of record) push((entry as Record<string, unknown> | null)?.slot, entry);
    } else {
      for (const [slot, entry] of Object.entries(record as Record<string, unknown>)) {
        push((entry as Record<string, unknown> | null)?.slot ?? slot, entry);
      }
    }
  }
  return entries;
}

function planModelDefaults(plan: unknown): StoryboardModels {
  const stack = (plan as { modelStack?: unknown } | null)?.modelStack;
  const models: StoryboardModels = { image: null, video: null };
  if (!Array.isArray(stack)) return models;
  for (const entry of stack) {
    const role = (entry as Record<string, unknown> | null)?.role;
    const model = (entry as Record<string, unknown> | null)?.model;
    if (typeof model !== "string") continue;
    if (role === "image" && !models.image) models.image = model;
    if (role === "video" && !models.video) models.video = model;
  }
  return models;
}

function sceneModels(sceneId: string, prompts: PromptEntry[], plan: StoryboardModels): StoryboardModels {
  const own = prompts.filter((entry) => {
    const slot = entry.slot.toLowerCase();
    return (slot === sceneId || slot.startsWith(`${sceneId}-`)) && !/(?:^|-)(storyboard|sketch)(?:-|$)/.test(slot);
  });
  const isVideo = (entry: PromptEntry) => entry.kind === "video" || /(?:^|-)(vid|video|i2v|t2v|motion)(?:-|$)/.test(entry.slot);
  const image = own.find((entry) => entry.model && !isVideo(entry) && entry.kind !== "voiceover")?.model ?? null;
  const video = own.find((entry) => entry.model && isVideo(entry))?.model ?? null;
  return {
    image: image ?? plan.image ?? DEFAULT_IMAGE_MODEL,
    video: video ?? plan.video ?? DEFAULT_VIDEO_MODEL,
  };
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function parseObject(value: string | null): Record<string, unknown> | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function stringAt(value: unknown, keys: string[]): string | null {
  let cursor: unknown = value;
  for (const key of keys) {
    if (!cursor || typeof cursor !== "object") return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === "string" && cursor.length > 0 ? cursor : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return null;
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function mimeOf(file: string): string | null {
  return MIME_BY_EXTENSION[path.extname(file).toLowerCase()] ?? null;
}

function objectMime(objectId: string): string | null {
  try {
    return openDomainDb().query<{ mime: string | null }, [string]>("SELECT mime FROM objects WHERE id = ?")
      .get(objectId)?.mime ?? null;
  } catch {
    return null;
  }
}
