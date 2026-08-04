// Template extraction (issue #033).
//
// Promotes a finished `<project>/` into a reusable template at
// `templates/<category>/<slug>/`. Pure helpers live here so the unit tests
// can exercise them without touching disk; the CLI wiring in
// `cli/commands/template.ts → template extract` orchestrates these against
// the real filesystem.
//
// Discipline (AGENTS.md invariant #14):
//  - The source project is NEVER modified by extraction.
//  - Default behavior COPIES refs into the template; only `--lift-heavy`
//    MOVES heavy files (>1MB) to the ralphy-assets pool.
//  - All writes go under `templates/<category>/<slug>/` (this repo) and
//    optionally `ralphy-assets/pool/<slug>/` (companion repo).
//  - Records the extraction in the source project's `generations.jsonl` so
//    postmortems can see when a project was templatized (kind: "other",
//    endpoint: "template.extract").

import path from "node:path";
import { getCommandContext } from "../context-state.js";
import { addEntity, getEntity, updateEntity } from "../registry.js";
import { createDocument, reviseDocument } from "../store/documents.js";
import { openDomainDb } from "../store/db.js";
import {
  TEMPLATE_KINDS,
  TEMPLATE_CATEGORIES,
  TEMPLATE_FORMATS,
  validateSlug,
  type TemplateCategory,
  type TemplateFormat,
  type TemplateKind,
  type TemplateYaml,
} from "../schemas/template.js";

/** Threshold for heavy-asset pool migration. 1 MiB. */
export const HEAVY_REF_BYTES = 1024 * 1024;

/** Names we treat as the canonical scenario file in the source project. */
export const SCENARIO_FILENAMES = ["scenario.json"];

export type SlotMap = Record<string, string>;

export type WorkspaceTemplateBody = Record<string, unknown>;

export async function saveWorkspaceTemplate(input: {
  manifest: TemplateYaml;
  body: WorkspaceTemplateBody;
  artifactRevisionId?: string | null;
}): Promise<Record<string, unknown>> {
  const workspaceId = getCommandContext()?.workspaceId;
  if (!workspaceId) throw new Error("Workspace Template requires an explicit Workspace scope");
  const existing = await getEntity("templates", input.manifest.id);
  let documentId: string;
  let expectedHeadId: string | null;
  if (existing) {
    const revisionId = String(existing.documentRevisionId);
    const row = openDomainDb()
      .query<{ documentId: string }, [string]>(
        "SELECT document_id AS documentId FROM document_revisions WHERE id = ?",
      )
      .get(revisionId);
    if (!row) throw new Error(`Template Document Revision not found: ${revisionId}`);
    documentId = row.documentId;
    expectedHeadId = revisionId;
  } else {
    const document = createDocument({
      workspaceId,
      kind: "custom",
      slug: `workspace-template-${input.manifest.id}`,
      title: input.manifest.name,
    });
    documentId = document.id;
    expectedHeadId = null;
  }
  const revision = reviseDocument({
    documentId,
    expectedHeadId,
    format: "json",
    title: input.manifest.name,
    body: JSON.stringify({ manifest: input.manifest, ...input.body }),
  });
  const record = {
    name: input.manifest.name,
    description: input.manifest.description,
    kind: input.manifest.kind,
    format: input.manifest.format,
    category: input.manifest.category,
    tags: input.manifest.tags,
    documentRevisionId: revision.id,
    ...(input.artifactRevisionId
      ? { artifactRevisionId: input.artifactRevisionId }
      : {}),
  };
  return existing
    ? (await updateEntity("templates", input.manifest.id, record))!
    : addEntity("templates", input.manifest.id, record);
}

export async function loadWorkspaceTemplate(
  idOrSlug: string,
): Promise<(Record<string, unknown> & { body: WorkspaceTemplateBody }) | null> {
  const record = await getEntity("templates", idOrSlug);
  if (!record) return null;
  const row = openDomainDb()
    .query<{ body: string }, [string]>(
      "SELECT body FROM document_revisions WHERE id = ? AND format = 'json'",
    )
    .get(String(record.documentRevisionId));
  if (!row) throw new Error(`Template Document Revision not found: ${record.documentRevisionId}`);
  return { ...record, body: JSON.parse(row.body) as WorkspaceTemplateBody };
}

export async function extractWorkspaceTemplateFromProject(input: {
  projectId: string;
  slug: string;
  category: TemplateCategory;
  kind?: TemplateKind;
  format?: TemplateFormat;
  name?: string;
  description?: string;
  tags?: string[];
  force?: boolean;
}): Promise<Record<string, unknown>> {
  const workspaceId = getCommandContext()?.workspaceId;
  if (!workspaceId) throw new Error("Template extraction requires an explicit Workspace scope");
  const db = openDomainDb();
  const project = db
    .query<{ id: string }, [string, string, string, string]>(
      `SELECT id FROM projects
       WHERE workspace_id = ? AND (id = ? OR slug = ?)
       ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1`,
    )
    .get(workspaceId, input.projectId, input.projectId, input.projectId);
  if (!project) throw new Error(`Project not found: ${input.projectId}`);
  const existing = await getEntity("templates", input.slug);
  if (existing && !input.force) throw new Error(`Template already exists: ${input.slug}`);

  const documents = db
    .query<{
      id: string;
      kind: string;
      slug: string;
      revisionId: string;
      format: string;
      body: string;
    }, [string]>(
      `SELECT document.id, document.kind, document.slug,
              revision.id AS revisionId, revision.format, revision.body
       FROM documents document
       JOIN document_revisions revision ON revision.id = document.current_revision_id
       WHERE document.project_id = ?
       ORDER BY document.created_at, document.id`,
    )
    .all(project.id);
  const scenarioDocument = documents.find((document) => document.kind === "scenario");
  let scenario: unknown = null;
  if (scenarioDocument) {
    try { scenario = JSON.parse(scenarioDocument.body); } catch { scenario = null; }
  }
  const { scenario: patchedScenario, slots } = extractSlotsFromScenario(scenario);
  const manifest = buildTemplateManifest({
    slug: input.slug,
    category: input.category,
    kind: input.kind,
    format: input.format,
    name: input.name,
    description: input.description,
    tags: input.tags,
    scenario: patchedScenario,
  });
  const postmortem = documents.find((document) => document.kind === "postmortem")?.body;
  const readme = readmeFromPostmortem({
    slug: input.slug,
    category: input.category,
    postmortem,
    projectId: project.id,
  });
  const templateMarkdown = [
    `# ${manifest.name}`,
    "",
    manifest.description,
    "",
    `> Extracted from Project \`${project.id}\`.`,
    "",
  ].join("\n");
  const artifactRevisionIds = db
    .query<{ id: string }, [string]>(
      `SELECT artifact.selected_revision_id AS id FROM artifacts artifact
       WHERE artifact.project_id = ? AND artifact.selected_revision_id IS NOT NULL
       ORDER BY artifact.created_at, artifact.id`,
    )
    .all(project.id)
    .map((row) => row.id);
  const saved = await saveWorkspaceTemplate({
    manifest,
    artifactRevisionId: artifactRevisionIds[0] ?? null,
    body: {
      sourceProjectId: project.id,
      sourceDocumentRevisionIds: documents.map((document) => document.revisionId),
      sourceArtifactRevisionIds: artifactRevisionIds,
      scenario: scenarioDocument ? { value: patchedScenario, slots } : null,
      prompts: documents
        .filter((document) => document.slug.startsWith("prompt-"))
        .map((document) => ({ slug: document.slug, documentRevisionId: document.revisionId })),
      readme,
      templateMarkdown,
      sampleRemixMarkdown: sampleRemixDoc({ slug: input.slug, category: input.category }),
    },
  });
  return {
    ...saved,
    sourceProjectId: project.id,
    hasScenario: scenarioDocument !== undefined,
    slots: Object.keys(slots),
    sourceDocumentRevisionIds: documents.map((document) => document.revisionId),
    sourceArtifactRevisionIds: artifactRevisionIds,
  };
}

/**
 * Inspect a scenario object and propose `{{slot}}` substitutions for the
 * brand-specific bits that the template should leave for the consumer to
 * fill. The algorithm is intentionally conservative: it only proposes slots
 * for top-level scalar fields the schema declares as project-identifying
 * (`brand`, `persona`, `name`) plus any `voiceover.text` strings on scenes
 * (since those carry the bespoke copy for the original project).
 *
 * Returns the patched scenario plus the slot map so callers can record what
 * was substituted in the template manifest.
 */
export function extractSlotsFromScenario(
  scenario: unknown,
): { scenario: unknown; slots: SlotMap } {
  if (!scenario || typeof scenario !== "object") {
    return { scenario, slots: {} };
  }
  const src = scenario as Record<string, unknown>;
  const slots: SlotMap = {};
  const patched: Record<string, unknown> = { ...src };

  const stringSlot = (key: string, slotName: string) => {
    const raw = src[key];
    if (typeof raw === "string" && raw.trim().length > 0) {
      slots[slotName] = raw;
      patched[key] = `{{${slotName}}}`;
    }
  };

  stringSlot("brand", "brand");
  stringSlot("persona", "persona");
  stringSlot("name", "project_name");

  // Per-scene voiceover.text — the bespoke copy that won't generalize across
  // remixes. Substitute on a per-scene basis so the slot names stay readable
  // (`{{scene_01_voiceover}}` is much friendlier than `{{scenes_0_vo}}`).
  if (Array.isArray(src.scenes)) {
    const newScenes = src.scenes.map((scene: unknown, i: number) => {
      if (!scene || typeof scene !== "object") return scene;
      const s = scene as Record<string, unknown>;
      const vo = s.voiceover;
      if (vo && typeof vo === "object" && typeof (vo as Record<string, unknown>).text === "string") {
        const id = typeof s.id === "string" ? s.id.replace(/[^a-z0-9]+/giu, "_") : `scene_${String(i + 1).padStart(2, "0")}`;
        const slotName = `${id}_voiceover`;
        slots[slotName] = String((vo as Record<string, unknown>).text);
        return {
          ...s,
          voiceover: { ...(vo as Record<string, unknown>), text: `{{${slotName}}}` },
        };
      }
      return scene;
    });
    patched.scenes = newScenes;
  }

  return { scenario: patched, slots };
}

/**
 * Build the v1 `TemplateYaml` manifest for an extracted template. Everything
 * here is derived from project inputs; the caller is responsible for writing
 * the file (this function never touches disk).
 */
export function buildTemplateManifest(args: {
  slug: string;
  category: TemplateCategory;
  kind?: TemplateKind;
  format?: TemplateFormat;
  name?: string;
  description?: string;
  tags?: string[];
  scenario?: unknown;
}): TemplateYaml {
  const slugResult = validateSlug(args.slug);
  if (!slugResult.ok) {
    throw new Error(`invalid slug '${args.slug}': ${slugResult.reason}`);
  }
  if (!TEMPLATE_CATEGORIES.includes(args.category)) {
    throw new Error(`invalid category '${args.category}'`);
  }
  const kind: TemplateKind = args.kind ?? "vibe-style";
  if (!TEMPLATE_KINDS.includes(kind)) {
    throw new Error(`invalid kind '${kind}'`);
  }
  // Primary-axis format (issue 052). Defaults to `video` — extraction promotes
  // a rendered project, which is overwhelmingly a video. Caller can override.
  const format: TemplateFormat = args.format ?? "video";
  if (!TEMPLATE_FORMATS.includes(format)) {
    throw new Error(`invalid format '${format}'`);
  }

  // Default name / description derive from the slug if the caller didn't
  // supply one (extraction is meant to bootstrap, not finalize).
  const name =
    args.name ??
    args.slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  const description =
    args.description ??
    `Extracted template '${args.slug}' — promoted from a project render. Edit this description before publishing.`;

  // Scene skeleton: only derive when the source scenario has the right shape.
  // We deliberately keep this conservative — the loader validates strict
  // scene-id / role / duration shapes, so any malformed source scenes are
  // dropped rather than passed through and tripping the lint.
  let scenes: TemplateYaml["scenes"] = [];
  if (args.scenario && typeof args.scenario === "object") {
    const src = (args.scenario as Record<string, unknown>).scenes;
    if (Array.isArray(src)) {
      scenes = src
        .map((scene, i): TemplateYaml["scenes"][number] | null => {
          if (!scene || typeof scene !== "object") return null;
          const s = scene as Record<string, unknown>;
          const idRaw = typeof s.id === "string" ? s.id : `scene-${String(i + 1).padStart(2, "0")}`;
          if (!/^scene-\d{2,3}$/u.test(idRaw)) return null;
          const typeStr = typeof s.type === "string" ? s.type : "";
          const role: "hook" | "body" | "cta" =
            typeStr === "hook" ? "hook" : typeStr === "cta" || typeStr === "outro" ? "cta" : "body";
          const durationRaw = typeof s.durationSec === "number"
            ? s.durationSec
            : typeof s.duration_s === "number"
              ? s.duration_s
              : 0;
          if (durationRaw <= 0 || durationRaw > 120) return null;
          const direction = typeof s.label === "string" ? s.label : undefined;
          return { id: idRaw, role, duration_s: durationRaw, ...(direction ? { direction } : {}) };
        })
        .filter((x): x is TemplateYaml["scenes"][number] => x !== null);
    }
  }

  return {
    version: 1,
    id: args.slug,
    aliases: [],
    kind,
    category: args.category,
    format,
    name,
    description,
    tags: args.tags ?? [],
    requires: {},
    scenes,
    references: [],
  };
}

/**
 * Render the manifest as a stable JSON string suitable for
 * `templates/<slug>/template.json`. Sorted keys so commits are diff-friendly.
 */
export function manifestToJson(manifest: TemplateYaml): string {
  // Match the existing repo style: pretty-printed, key order as authored, no
  // alphabetical sort (otherwise downstream readers that grep for "name" at
  // the top would have to follow a moving target).
  return JSON.stringify(manifest, null, 2) + "\n";
}

/**
 * Carve "Lessons learned" out of a POSTMORTEM markdown blob. Falls back to a
 * starter README skeleton when no lessons section exists. The result is the
 * complete README.md body (frontmatter-free; consumers concat as-is).
 */
export function readmeFromPostmortem(args: {
  slug: string;
  category: TemplateCategory;
  postmortem?: string;
  projectId?: string;
}): string {
  const header = [
    `# ${args.slug}`,
    ``,
    `> Extracted template — \`templates/${args.category}/${args.slug}/\`.`,
    `${args.projectId ? `> Source project: \`${args.projectId}\`.` : ""}`,
    ``,
    `## Usage`,
    ``,
    "```bash",
    `ralphy template use ${args.slug} --project <new-id> --brief "<one-line brief>"`,
    "```",
    ``,
  ].filter((l) => l !== "");

  const stub = [
    ...header,
    `## Lessons learned`,
    ``,
    `_TODO: run \`/postmortem\` on the source project, then re-extract so this section is populated._`,
    ``,
  ].join("\n");

  if (!args.postmortem || args.postmortem.trim().length === 0) {
    return stub;
  }

  // Match a `Lessons learned` section header (any heading depth, case-insensitive).
  // Capture everything up to the next same-or-shallower heading.
  const re = /(^|\n)#{1,6}\s+lessons?\s+learned\b[^\n]*\n([\s\S]*?)(?=\n#{1,6}\s|\s*$)/iu;
  const m = args.postmortem.match(re);
  if (!m) {
    return stub;
  }
  const body = m[2].trim();
  if (body.length === 0) {
    return stub;
  }
  return [
    ...header,
    `## Lessons learned`,
    ``,
    `_Pulled from the source project's POSTMORTEM.md._`,
    ``,
    body,
    ``,
  ].join("\n");
}

/**
 * Build a one-page `sample-remix.md` showing how a future agent would
 * consume the extracted template.
 */
export function sampleRemixDoc(args: { slug: string; category: TemplateCategory }): string {
  return [
    `# Remix \`${args.slug}\``,
    ``,
    `> Quick-start: scaffold a new project that re-uses this template.`,
    ``,
    `## Scaffold`,
    ``,
    "```bash",
    `ralphy template use ${args.slug} \\`,
    `  --project <new-id> \\`,
    `  --brief "<one-line brief: what changes vs the original render>"`,
    "```",
    ``,
    `The scaffold step writes \`TEMPLATE_ORIGIN.md\` into the new project and copies any required assets from \`template.json:assets\`.`,
    ``,
    `## Slots to fill`,
    ``,
    `Open the new project's \`scenario.json\` and replace every \`{{slot}}\` with the value for your remix.`,
    ``,
    `## Render`,
    ``,
    "```bash",
    `ralphy render <new-id>`,
    "```",
    ``,
  ].join("\n");
}

/**
 * Parse `data-composition-variables` from an `index.html` blob and return
 * the variable list (or null when the attribute is absent / malformed).
 */
export function extractCompositionVariables(html: string): Array<Record<string, unknown>> | null {
  const m = html.match(/data-composition-variables\s*=\s*(['"])([\s\S]*?)\1/u);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[2]);
    if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
    return null;
  } catch {
    return null;
  }
}

/** Filename helper — true when this path is a "heavy" ref (>1MB). */
export function isHeavyRef(sizeBytes: number): boolean {
  return sizeBytes >= HEAVY_REF_BYTES;
}

/** Compute the destination dir under ralphy-assets for a lifted asset. */
export function poolDestForSlug(assetsRoot: string, slug: string, basename: string): string {
  return path.join(assetsRoot, "pool", slug, basename);
}
