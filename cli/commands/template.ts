import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { addEntity, deleteEntity, listEntities } from "../lib/registry.js";
import { slugify } from "../lib/ids.js";
import { templatesDir, ARTIFACT_KINDS, artifactKindDir, resolveArtifactKindDirs, projectDir } from "../lib/paths.js";
import { out, ok, err, isPretty } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { suggestTemplates, type Candidate } from "../lib/templater/suggest.js";
import { classifyContentMode } from "../lib/content-modes.js";
import {
  loadTemplateManifest,
  diagnoseRequiredInputs,
} from "../lib/templater/loader.js";
import { getBlocks, getBlock } from "../lib/library/client.js";
import type { Block } from "../lib/library/types.js";
import { templateCloneCmd } from "./clone.js";
import { getCommandContext } from "../lib/context-state.js";

// Templates source from two tiers (both readable transparently):
//   - public                      → Supabase content library (template blocks),
//                                    read via cli/lib/library/client.ts
//   - <workspace>/templates/      → user-local, gitignored (.ralphy/workspaces/<ws>/templates/)
// Workspace overrides public if both define the same id (so a user can locally
// edit / shadow a published template without touching the library).
//
// The repo-public `templates/<category>/<slug>/` folder is retired — public
// templates now live in the library. This file no longer reads it.
//
// A workspace template supports two layouts:
//   Flat:   <workspace>/templates/<id>.json
//   Dir:    <workspace>/templates/<id>/template.json + TEMPLATE.md + *.md
//
// Dir-based templates are preferred for reusable video blueprints because the
// LLM-consumable doc (TEMPLATE.md) lives next to metadata, and the template
// can include supplementary fragments (prompt library, scene skeleton,
// composition pattern, model stack rationale).

type TemplateSource = "workspace" | "public";

type ResolvedTemplate =
  | { kind: "domain"; source: "workspace"; record: Record<string, unknown>; body: Record<string, unknown> }
  | { kind: "dir"; source: TemplateSource; dir: string; metaPath: string; docPath: string }
  | { kind: "flat"; source: TemplateSource; file: string }
  | { kind: "public"; source: "public"; block: Block };

// Fetch the public-tier template blocks from the library, degrading gracefully:
// any network / library error returns [] plus a warning emitted via onWarn so
// the calling command still works off the workspace tier alone.
async function fetchPublicTemplates(
  onWarn?: (msg: string) => void,
): Promise<Block[]> {
  try {
    return await getBlocks("template");
  } catch (e) {
    onWarn?.(
      `public library unreachable (${e instanceof Error ? e.message : String(e)}); listing workspace templates only`,
    );
    return [];
  }
}

// Map a public template block into the keyword/LLM ranker Candidate shape.
function publicBlockToCandidate(block: Block): Candidate {
  const format = typeof block.format === "string" ? block.format : undefined;
  const tags = Array.isArray(block.tags) ? (block.tags as unknown[]).map(String) : [];
  return {
    slug: block.id,
    name: block.name || block.id,
    description: block.blurb || "",
    tags,
    doc: "",
    meta: { source: "public", kind: "template", ...(format ? { format } : {}) },
  };
}

function dirRef(
  base: string,
  id: string,
  source: TemplateSource,
  parent?: string,
): Extract<ResolvedTemplate, { kind: "dir" }> {
  const dir = parent ? path.join(base, parent, id) : path.join(base, id);
  return {
    kind: "dir",
    source,
    dir,
    metaPath: path.join(dir, "template.json"),
    docPath: path.join(dir, "TEMPLATE.md"),
  };
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

// #062: a dir is a recognized template when it carries EITHER manifest —
// `template.yaml` (the #052 schema, now the single source of truth) OR the
// legacy `template.json` (auto-migrated form). Discovery used to require
// `template.json`, so a yaml-only template lint-passed yet stayed invisible to
// list / show / suggest / use. We no longer require template.json — yaml-only
// is a first-class template.
async function hasTemplateManifest(dir: string): Promise<boolean> {
  return (
    (await pathExists(path.join(dir, "template.yaml"))) ||
    (await pathExists(path.join(dir, "template.json")))
  );
}

async function* walkTemplateRoot(
  base: string,
  source: TemplateSource,
): AsyncGenerator<{ id: string; ref: ResolvedTemplate }> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(base, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const direct = path.join(base, entry.name);
      if (await hasTemplateManifest(direct)) {
        yield { id: entry.name, ref: dirRef(base, entry.name, source) };
        continue;
      }
      let children: import("node:fs").Dirent[];
      try {
        children = await fs.readdir(direct, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const child of children) {
        if (!child.isDirectory()) continue;
        const nested = path.join(direct, child.name);
        if (await hasTemplateManifest(nested)) {
          yield { id: child.name, ref: dirRef(base, child.name, source, entry.name) };
        }
      }
    } else if (entry.name.endsWith(".json")) {
      yield {
        id: entry.name.slice(0, -5),
        ref: { kind: "flat", source, file: path.join(base, entry.name) },
      };
    }
  }
}

async function resolveInDir(
  id: string,
  baseDir: string,
  source: TemplateSource,
): Promise<ResolvedTemplate | null> {
  const direct = path.join(baseDir, id);
  if (await hasTemplateManifest(direct)) return dirRef(baseDir, id, source);
  const flat = path.join(baseDir, `${id}.json`);
  if (await pathExists(flat)) return { kind: "flat", source, file: flat };
  for await (const entry of walkTemplateRoot(baseDir, source)) {
    if (entry.id === id) return entry.ref;
  }
  return null;
}

// Resolve a template id across the two tiers: workspace first (it overrides /
// shadows public on id collision), else the public library. `onWarn` surfaces a
// library-unreachable warning without crashing the resolve.
async function resolveTemplate(
  id: string,
  onWarn?: (msg: string) => void,
): Promise<ResolvedTemplate | null> {
  const { loadWorkspaceTemplate } = await import("../lib/templater/extract.js");
  let local: Awaited<ReturnType<typeof loadWorkspaceTemplate>> = null;
  try {
    local = await loadWorkspaceTemplate(id);
  } catch {
    // No command scope means the SQL store cannot resolve a workspace; the
    // legacy directory is the explicit compatibility read model in that case.
  }
  if (local) {
    const { body, ...record } = local;
    return { kind: "domain", source: "workspace", record, body };
  }
  if (!getCommandContext()) {
    const legacy = await resolveInDir(id, templatesDir(), "workspace");
    if (legacy) return legacy;
  }
  let block: Block | null = null;
  try {
    block = await getBlock("template", id);
  } catch (e) {
    onWarn?.(
      `public library unreachable (${e instanceof Error ? e.message : String(e)})`,
    );
    return null;
  }
  if (block) return { kind: "public", source: "public", block };
  return null;
}

async function readTemplateMeta(ref: ResolvedTemplate) {
  if (ref.kind === "public") {
    return {
      name: ref.block.name || ref.block.id,
      description: ref.block.blurb || "",
      tags: Array.isArray(ref.block.tags) ? (ref.block.tags as unknown[]).map(String) : [],
    };
  }
  if (ref.kind === "domain") {
    const manifest = ref.body.manifest;
    return manifest && typeof manifest === "object"
      ? manifest as Record<string, unknown>
      : ref.record;
  }
  if (ref.kind === "dir") {
    try {
      return JSON.parse(await fs.readFile(ref.metaPath, "utf-8"));
    } catch {
      // #062: template.json is no longer required. When it's absent (a
      // template.yaml-only dir), derive the loader `meta` from the yaml so
      // readers that assume template.json exists (list / show / suggest /
      // register) still see name/description/tags rather than treating the
      // template as malformed. Reuse the defensive yaml read used by
      // readTemplateTaxonomy/readTemplateFacets — no parallel parser.
      return await readMetaFromYaml(ref.dir);
    }
  }
  try {
    return JSON.parse(await fs.readFile(ref.file, "utf-8"));
  } catch {
    return null;
  }
}

// #062: derive the loader `meta` ({ name, description, tags, kind, createdAt? })
// from a template.yaml when no template.json is present. Same graceful-degrade
// contract as readTemplateTaxonomy/readTemplateFacets — returns null on a
// missing / unparseable yaml so callers fall back to their own defaults.
async function readMetaFromYaml(dir: string): Promise<Record<string, unknown> | null> {
  const yamlPath = path.join(dir, "template.yaml");
  try {
    const raw = await fs.readFile(yamlPath, "utf-8");
    const YAML = (await import("yaml")).default;
    const value = YAML.parse(raw);
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    const meta: Record<string, unknown> = {};
    if (typeof v.name === "string") meta.name = v.name;
    if (typeof v.description === "string") meta.description = v.description;
    if (Array.isArray(v.tags)) meta.tags = (v.tags as unknown[]).map(String);
    if (typeof v.kind === "string") meta.kind = v.kind;
    return meta;
  } catch {
    return null;
  }
}

// `format` + `style_of` live in the typed YAML manifest (issue 052), not in the
// legacy template.json. Read them from the yaml when present so format-aware
// surfaces (list/suggest --format, show) can key off the primary axis. Returns
// nulls for flat/legacy templates that ship no template.yaml.
//
// This deliberately does NOT go through `loadTemplateManifest`: that path calls
// `raiseError("E_TEMPLATE_VERSION_UNSUPPORTED")` (process.exit) on a legacy /
// version-less workspace template, which would abort `list`/`suggest` over a
// single stray manifest. Taxonomy enrichment must degrade gracefully, so we
// read + parse the yaml defensively and bail to nulls on anything unexpected.
async function readTemplateTaxonomy(
  ref: ResolvedTemplate,
): Promise<{ format: string | null; style_of: string | null }> {
  if (ref.kind === "domain") {
    const manifest = ref.body.manifest as Record<string, unknown> | undefined;
    return {
      format: typeof manifest?.format === "string" ? manifest.format : null,
      style_of: typeof manifest?.style_of === "string" ? manifest.style_of : null,
    };
  }
  if (ref.kind !== "dir") return { format: null, style_of: null };
  const yamlPath = path.join(ref.dir, "template.yaml");
  try {
    const raw = await fs.readFile(yamlPath, "utf-8");
    const YAML = (await import("yaml")).default;
    const value = YAML.parse(raw);
    if (!value || typeof value !== "object") return { format: null, style_of: null };
    const v = value as Record<string, unknown>;
    const format = typeof v.format === "string" ? v.format : null;
    const style_of = typeof v.style_of === "string" ? v.style_of : null;
    return { format, style_of };
  } catch {
    return { format: null, style_of: null };
  }
}

// #075: the structured facets that make a Template a generic "how to make this
// content type" guide — its `requires` block (which brand/persona/ref/voice/
// music inputs it needs), its `scenes` composition skeleton, the estimated
// cost, and reference exemplars. These live ONLY in the typed YAML manifest
// (issue 052), not in the legacy template.json that `show --json` reads. We
// surface them so `ralphy template show <slug> --json` reports the full Template
// entity, not just the legacy metadata. Read defensively (same graceful-degrade
// contract as `readTemplateTaxonomy`): a legacy/version-less workspace template
// returns an empty object rather than aborting.
async function readTemplateFacets(
  ref: ResolvedTemplate,
): Promise<Record<string, unknown>> {
  if (ref.kind === "domain") {
    const manifest = ref.body.manifest as Record<string, unknown> | undefined;
    if (!manifest) return {};
    return Object.fromEntries(
      ["requires", "scenes", "estimated_cost_usd", "estimated_duration_s", "references"]
        .filter((key) => manifest[key] !== undefined)
        .map((key) => [key, manifest[key]]),
    );
  }
  if (ref.kind !== "dir") return {};
  const yamlPath = path.join(ref.dir, "template.yaml");
  try {
    const raw = await fs.readFile(yamlPath, "utf-8");
    const YAML = (await import("yaml")).default;
    const value = YAML.parse(raw);
    if (!value || typeof value !== "object") return {};
    const v = value as Record<string, unknown>;
    const facets: Record<string, unknown> = {};
    if (v.requires && typeof v.requires === "object") facets.requires = v.requires;
    if (Array.isArray(v.scenes) && v.scenes.length > 0) facets.scenes = v.scenes;
    if (typeof v.estimated_cost_usd === "number") facets.estimated_cost_usd = v.estimated_cost_usd;
    if (typeof v.estimated_duration_s === "number") facets.estimated_duration_s = v.estimated_duration_s;
    if (Array.isArray(v.references) && v.references.length > 0) facets.references = v.references;
    return facets;
  } catch {
    return {};
  }
}

async function extractLegacyTemplate(projectId: string, opts: any): Promise<void> {
  const ex = await import("../lib/templater/extract.js");
  const { logGeneration } = await import("../lib/gen-log.js");
  const projDir = projectDir(projectId);
  try { await fs.access(projDir); } catch {
    raiseError("E_NOT_FOUND", { kind: "Project", id: projectId });
  }
  const targetDir = path.join(templatesDir(), opts.slug);
  if (await pathExists(targetDir) && !opts.force) {
    raiseError("E_ALREADY_EXISTS", { kind: "Template", id: `${opts.category}/${opts.slug}` });
  }
  const scenarioPath = path.join(projDir, "scenario.json");
  let scenario: unknown = null;
  let hasScenario = false;
  const rawScenario = await fs.readFile(scenarioPath, "utf8").catch(() => null);
  if (rawScenario !== null) {
    try { scenario = JSON.parse(rawScenario); hasScenario = true; } catch {
      raiseError("E_FILE_MALFORMED", { format: "JSON", path: scenarioPath, detail: "scenario.json is present but not valid JSON" });
    }
  }
  const postmortem = await fs.readFile(path.join(projDir, "postmortem", "02-lessons.md"), "utf8")
    .catch(() => fs.readFile(path.join(projDir, "POSTMORTEM.md"), "utf8").catch(() => ""));
  const compositionVars = await fs.readFile(path.join(projDir, "index.html"), "utf8")
    .then((html) => ex.extractCompositionVariables(html)).catch(() => null);
  const { scenario: patchedScenario, slots } = ex.extractSlotsFromScenario(scenario);
  let manifest;
  try {
    manifest = ex.buildTemplateManifest({
      slug: opts.slug,
      category: opts.category,
      kind: opts.kind,
      format: opts.format,
      name: opts.name,
      description: opts.description,
      tags: typeof opts.tags === "string" ? opts.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean) : [],
      scenario: patchedScenario,
    });
  } catch (error) {
    raiseError("E_INPUT_INVALID", { field: "--slug/--category/--kind", detail: (error as Error).message, verb: "template extract" });
  }
  await fs.mkdir(path.join(targetDir, "prompts"), { recursive: true });
  await fs.mkdir(path.join(targetDir, "refs"), { recursive: true });
  const promptsCopied: string[] = [];
  try {
    for (const entry of await fs.readdir(path.join(projDir, "prompts"), { withFileTypes: true })) {
      if (!entry.isFile() || !/\.(txt|md|json)$/iu.test(entry.name)) continue;
      await fs.copyFile(path.join(projDir, "prompts", entry.name), path.join(targetDir, "prompts", entry.name));
      promptsCopied.push(entry.name);
    }
  } catch { /* optional source prompts */ }
  const refsCopied: Array<{ name: string; dest: string; sizeBytes: number }> = [];
  const refsLifted: Array<{ name: string; pooledTo: string; sizeBytes: number }> = [];
  let assetsRoot = opts.assetsRepo as string | undefined;
  if (opts.liftHeavy && !assetsRoot) {
    const candidate = path.join(process.env.HOME || "", "github", "ralphy-assets");
    if (await pathExists(path.join(candidate, "manifest.json"))) assetsRoot = candidate;
    else raiseError("E_INPUT_INVALID", { field: "--assets-repo", detail: "--lift-heavy requires --assets-repo pointing at a checkout of the ralphy-assets companion repo", verb: "template extract" });
  }
  const seenRefs = new Set<string>();
  for (const sourceDir of resolveArtifactKindDirs(projectId, "refs")) {
    try {
      for (const entry of await fs.readdir(sourceDir, { withFileTypes: true })) {
        if (!entry.isFile() || seenRefs.has(entry.name)) continue;
        seenRefs.add(entry.name);
        const source = path.join(sourceDir, entry.name);
        const sizeBytes = (await fs.stat(source)).size;
        if (opts.liftHeavy && assetsRoot && ex.isHeavyRef(sizeBytes)) {
          const pooledTo = ex.poolDestForSlug(assetsRoot, opts.slug, entry.name);
          await fs.mkdir(path.dirname(pooledTo), { recursive: true });
          await fs.copyFile(source, pooledTo);
          refsLifted.push({ name: entry.name, pooledTo: path.relative(process.cwd(), pooledTo), sizeBytes });
        } else {
          const dest = path.join(targetDir, "refs", entry.name);
          await fs.copyFile(source, dest);
          refsCopied.push({ name: entry.name, dest: path.relative(process.cwd(), dest), sizeBytes });
        }
      }
    } catch { /* optional refs */ }
  }
  if (compositionVars?.length) await fs.writeFile(path.join(targetDir, "composition-variables.json"), JSON.stringify(compositionVars, null, 2) + "\n");
  await fs.writeFile(path.join(targetDir, "template.json"), ex.manifestToJson(manifest!));
  let assetSlots: string[] = [];
  try {
    const value = JSON.parse(await fs.readFile(path.join(projDir, "asset-manifest.json"), "utf8"));
    if (value?.slots && typeof value.slots === "object") assetSlots = Object.keys(value.slots);
  } catch { /* optional asset manifest */ }
  if (hasScenario) await fs.writeFile(path.join(targetDir, "scenario-template.json"), JSON.stringify({ scenario: patchedScenario, slots }, null, 2) + "\n");
  await fs.writeFile(path.join(targetDir, "README.md"), ex.readmeFromPostmortem({ slug: opts.slug, category: opts.category, postmortem, projectId }));
  await fs.writeFile(path.join(targetDir, "TEMPLATE.md"), [
    `# ${manifest!.name}`, "", manifest!.description, "",
    `> Extracted from project \`${projectId}\` on ${new Date().toISOString().slice(0, 10)}.`, "",
    hasScenario ? "See `README.md` for usage + lessons; `prompts/` for the original prompts; `scenario-template.json` for the slot-substituted scenario." : "See `README.md` for usage + lessons; `prompts/` for the original prompts. This template was extracted from a scenario-less project (asset-based still-set / HyperFrames ad), so there is no scene table or `scenario-template.json`.", "",
  ].join("\n"));
  await fs.writeFile(path.join(targetDir, "sample-remix.md"), ex.sampleRemixDoc({ slug: opts.slug, category: opts.category }));
  try {
    await logGeneration(projectId, {
      provider: "other", model: "template.extract", endpoint: "template.extract", kind: "other",
      input: { slot: "template.extract", category: opts.category, slug: opts.slug, target_dir: path.relative(process.cwd(), targetDir), lift_heavy: !!opts.liftHeavy, has_scenario: hasScenario, prompts_copied: promptsCopied.length, refs_copied: refsCopied.length, refs_lifted: refsLifted.length, asset_slots: assetSlots.length },
      status: "ok", note: `templatized as ${opts.category}/${opts.slug}`,
    });
  } catch { /* logging is best-effort */ }
  ok(`Extracted ${projectId} → ${path.relative(process.cwd(), targetDir)}/`);
  out({ project_id: projectId, template_dir: path.relative(process.cwd(), targetDir), slug: opts.slug, category: opts.category, kind: manifest!.kind, has_scenario: hasScenario, prompts_copied: promptsCopied, refs_copied: refsCopied, refs_lifted: refsLifted, slots: Object.keys(slots), asset_slots: assetSlots, composition_variables: compositionVars?.length ?? 0 });
}

export function templateCmd() {
  const cmd = new Command("template").description("Manage scenario/video templates");

  // #030: mount the style-lift verb under `template clone` to remove the name
  // collision with `voice clone` (Instant Voice Cloning). The legacy
  // `ralphy clone` still works as a deprecation alias for one release.
  cmd.addCommand(templateCloneCmd());

  cmd
    .command("create")
    .description("Create a template (flat JSON) from a project or file")
    .requiredOption("--name <name>", "Template name")
    .option("--from-project <id>", "Create from existing project scenario")
    .option("--from-file <path>", "Create from JSON file")
    .action(async (opts) => {
      const id = slugify(opts.name);
      let data: any = { name: opts.name };

      if (opts.fromProject) {
        const scenarioPath = path.join(projectDir(opts.fromProject), "scenario.json");
        try {
          data.scenario = JSON.parse(await fs.readFile(scenarioPath, "utf-8"));
        } catch {
          raiseError("E_FILE_UNREADABLE", { path: scenarioPath });
        }
      } else if (opts.fromFile) {
        try {
          data = { ...data, ...JSON.parse(await fs.readFile(opts.fromFile, "utf-8")) };
        } catch {
          raiseError("E_FILE_UNREADABLE", { path: opts.fromFile });
        }
      }

      const ex = await import("../lib/templater/extract.js");
      const saved = await ex.saveWorkspaceTemplate({
        manifest: ex.buildTemplateManifest({
          slug: id,
          category: "b2b-saas",
          name: opts.name,
          scenario: data.scenario,
        }),
        body: { imported: data },
      });
      ok(`Template created: ${id}`);
      out({ id: saved.id, slug: id, name: opts.name, documentRevisionId: saved.documentRevisionId });
    });

  cmd
    .command("register <id>")
    .description("Import an existing legacy workspace template into the domain store")
    .action(async (id: string) => {
      const ref = dirRef(templatesDir(), id, "workspace");
      if (!(await hasTemplateManifest(ref.dir))) {
        raiseError("E_NOT_FOUND", { kind: "Legacy workspace Template", id });
      }
      const meta = await readTemplateMeta(ref);
      if (!meta) raiseError("E_FILE_MALFORMED", { format: "JSON", path: `${(ref as { dir: string }).dir}/template.json`, detail: "missing or invalid" });
      let manifest;
      try {
        manifest = await loadTemplateManifest(ref.dir, id);
      } catch (e) {
        if (e instanceof Error && !e.message.startsWith("E_")) {
          raiseError("E_FILE_MALFORMED", { format: "YAML", path: `${ref.dir}/template.yaml`, detail: e.message });
        }
        throw e;
      }
      if (!manifest) {
        raiseError("E_FILE_MALFORMED", { format: "YAML", path: `${ref.dir}/template.yaml`, detail: "missing or invalid" });
      }
      const readText = (name: string) => fs.readFile(path.join(ref.dir, name), "utf-8").catch(() => undefined);
      const ex = await import("../lib/templater/extract.js");
      const saved = await ex.saveWorkspaceTemplate({
        manifest,
        body: {
          templateMarkdown: await readText("TEMPLATE.md"),
          readme: await readText("README.md"),
          scenarioTemplate: await readText("scenario-template.json"),
          importedFromLegacy: true,
        },
      });
      ok(`Registered: ${id}`);
      out({ id: saved.id, slug: saved.slug, documentRevisionId: saved.documentRevisionId });
    });

  cmd
    .command("list")
    .description("List all templates (public library templates + the active workspace's templates/)")
    .option("--format <f>", "Filter to a single media format (video|image|carousel|fb-creative|motion-design|poster|sticker-pack)")
    .action(async (opts: { format?: string }) => {
      type Row = {
        id: string;
        name: string;
        kind: "dir" | "flat" | "public";
        source: TemplateSource;
        format?: string;
        style_of?: string;
        description?: string;
        tags?: string[];
        unregistered?: boolean;
      };
      const rows = new Map<string, Row>();

      // Workspace first so it overrides public on id collision (matches resolveTemplate).
      for (const entity of await listEntities("templates")) {
        const id = String(entity.slug ?? entity.id);
        const format = typeof entity.format === "string" ? entity.format : undefined;
        if (opts.format && format !== opts.format) continue;
        rows.set(id, {
          id,
          name: String(entity.name ?? id),
          kind: "dir",
          source: "workspace",
          format,
          description: typeof entity.description === "string" ? entity.description : undefined,
          tags: Array.isArray(entity.tags) ? entity.tags.map(String) : undefined,
        });
      }

      // Read-only compatibility for templates created before the SQL store.
      for await (const { id, ref } of walkTemplateRoot(templatesDir(), "workspace")) {
        if (rows.has(id)) continue;
        const meta = await readTemplateMeta(ref);
        if (!meta) continue;
        const tax = await readTemplateTaxonomy(ref);
        if (opts.format && tax.format !== opts.format) continue;
        rows.set(id, {
          id,
          name: typeof meta.name === "string" ? meta.name : id,
          kind: ref.kind === "dir" ? "dir" : "flat",
          source: "workspace",
          format: tax.format ?? undefined,
          style_of: tax.style_of ?? undefined,
          description: typeof meta.description === "string" ? meta.description : undefined,
          tags: Array.isArray(meta.tags) ? meta.tags.map(String) : undefined,
        });
      }

      // Public tier — Supabase library template blocks. Degrades to an empty
      // list + a warning if the library is unreachable.
      const warnings: string[] = [];
      const publicBlocks = await fetchPublicTemplates((m) => warnings.push(m));
      for (const block of publicBlocks) {
        if (rows.has(block.id)) continue; // workspace shadows public
        const format = typeof block.format === "string" ? block.format : undefined;
        if (opts.format && format !== opts.format) continue;
        rows.set(block.id, {
          id: block.id,
          name: block.name || block.id,
          kind: "public",
          source: "public",
          format,
          style_of: typeof block.style_of === "string" ? block.style_of : undefined,
          description: block.blurb || undefined,
          tags: Array.isArray(block.tags) ? (block.tags as unknown[]).map(String) : undefined,
        });
      }

      const data = Array.from(rows.values()).sort((a, b) => a.id.localeCompare(b.id));
      const ui = await import("../lib/ui.js");
      if (!ui.isPrettyMode()) {
        out(warnings.length ? { templates: data, warnings } : data);
        return;
      }
      const { c, icons, section, table } = ui;
      for (const w of warnings) console.log(`  ${icons.warn} ${c.warn(w)}`);
      section(`Templates  ${c.muted(`(${data.length} total)`)}`);
      table(data, [
        {
          key: "id",
          header: "slug",
          format: (v) => c.cmd(String(v)),
        },
        {
          key: "format",
          header: "format",
          format: (v) => (v ? c.brand(String(v)) : c.muted("—")),
        },
        {
          key: "kind",
          header: "kind",
          format: (v) => (v === "dir" ? c.brand(String(v)) : c.muted(String(v))),
        },
        {
          key: "source",
          header: "src",
          format: (v) => (v === "public" ? c.muted("public") : c.accent("ws")),
        },
        {
          key: "name",
          header: "name",
          format: (v) => c.bold(String(v ?? "")),
        },
        {
          key: "description",
          header: "description",
          format: (v) => {
            const s = String(v ?? "");
            return s.length > 70 ? s.slice(0, 67) + "…" : s;
          },
        },
      ]);
      console.log();
      console.log(`  ${icons.bullet} ${c.cmd("ralphy template show <slug>")}     read TEMPLATE.md`);
      console.log(`  ${icons.bullet} ${c.cmd("ralphy template suggest \"<brief>\"")}  rank for a brief`);
      console.log(`  ${icons.bullet} ${c.cmd("ralphy template use <slug>")}      scaffold a project`);
      console.log();
    });

  cmd
    .command("show <id>")
    .description("Show template — prints TEMPLATE.md (the prompt-cookbook) for dir templates, JSON for flat. `--meta` prints the structured manifest facets (#075) for dir templates.")
    .option("--path", "Print the on-disk path only")
    .option(
      "--meta",
      "Print structured manifest metadata (dir templates only): template.json + the YAML facets — format/style_of/requires/scenes/estimated_cost_usd/references (#075). Was `--json`, renamed to avoid the global `--json` output-mode flag.",
    )
    .action(async (id: string, opts: any) => {
      const ref = await resolveTemplate(id);
      if (!ref) raiseError("E_NOT_FOUND", { kind: "Template", id });

      // Public library template — no on-disk doc. Emit the library entity +
      // a pointer to the full library view / reproduce path.
      if (ref!.kind === "public") {
        const block = ref!.block;
        if (opts.path) {
          const pointer = `library:template/${block.id}`;
          if (isPretty()) console.log(pointer);
          else out({ path: pointer });
          return;
        }
        out({
          source: "public",
          ...block,
          reproduce_tag: `@template:${block.id}`,
          library_show: `ralphy library templates show ${block.id}`,
        });
        return;
      }

      if (opts.path) {
        if (ref!.kind === "domain") {
          out({
            id: ref!.record.id,
            documentRevisionId: ref!.record.documentRevisionId,
            artifactRevisionId: ref!.record.artifactRevisionId ?? null,
          });
          return;
        }
        const p = ref!.kind === "dir" ? ref!.dir : ref!.file;
        if (isPretty()) console.log(p);
        else out({ path: p });
        return;
      }

      if (ref.kind === "flat") {
        try {
          out(JSON.parse(await fs.readFile(ref.file, "utf-8")));
        } catch {
          err(`Cannot read: ${ref.file}`);
        }
        return;
      }

      if (ref.kind === "domain") {
        if (opts.meta) {
          out({ ...ref.record, ...ref.body.manifest as object });
          return;
        }
        const markdown = ref.body.templateMarkdown;
        if (typeof markdown === "string") process.stdout.write(markdown);
        else out(ref.body);
        return;
      }

      // dir template
      if (opts.meta) {
        const meta = await readTemplateMeta(ref);
        if (!meta) err(`No template.json in ${ref.dir}`);
        // Surface the primary-axis taxonomy (issue 052) AND the structured
        // facets (#075 — requires/scenes/cost/references) alongside the legacy
        // template.json metadata. Both live in the YAML manifest, not in
        // template.json, so a `show --json` reports the full Template entity.
        const tax = await readTemplateTaxonomy(ref);
        const facets = await readTemplateFacets(ref);
        out({
          ...meta,
          ...(tax.format ? { format: tax.format } : {}),
          ...(tax.style_of ? { style_of: tax.style_of } : {}),
          ...facets,
        });
        return;
      }

      // default: print TEMPLATE.md raw (for LLM consumers piping to stdin)
      try {
        const doc = await fs.readFile(ref.docPath, "utf-8");
        // raw markdown, no JSON wrapping — this is intentionally pipe-friendly
        process.stdout.write(doc);
      } catch {
        err(`No TEMPLATE.md in ${ref.dir} (check --json for metadata or --path)`);
      }
    });

  cmd
    .command("use <id>")
    .description("Create a new project scaffolded from a template")
    .requiredOption("--project <project-id>", "New project ID")
    .option("--name <name>", "New project name (defaults to project-id)")
    .option("--brief <text>", "Initial user brief")
    .option("--brand <slug>", "Brand slug (satisfies requires.brand)")
    .option("--persona <slug>", "Persona slug (satisfies requires.persona)")
    .option("--ref <path...>", "Reference file paths (count satisfies requires.refs)")
    .action(async (id: string, opts: any) => {
      const ref = await resolveTemplate(id);
      if (!ref) raiseError("E_NOT_FOUND", { kind: "Template", id });

      const projectId = opts.project;
      const projDir = projectDir(projectId);
      try {
        await fs.access(projDir);
        raiseError("E_ALREADY_EXISTS", { kind: "Project", id: projectId });
      } catch { /* good, doesn't exist */ }

      const meta = ref.kind === "dir" ? await readTemplateMeta(ref) : null;
      const isPublic = ref.kind === "public";

      // 02.05.02 — validate the typed YAML manifest (if present) BEFORE
      // scaffolding the project. Falls back silently for legacy templates
      // that haven't been migrated; the migration script is one-shot
      // additive (template.yaml AND template.json coexist), so this is the
      // common path for shipped templates.
      if (ref.kind === "dir") {
        try {
          const yamlMeta = await loadTemplateManifest(ref.dir, id);
          if (yamlMeta) {
            const refCount = Array.isArray(opts.ref) ? opts.ref.length : (opts.ref ? 1 : 0);
            const missing = diagnoseRequiredInputs(yamlMeta, {
              brand: opts.brand,
              persona: opts.persona,
              refCount,
            });
            if (missing) {
              raiseError("E_TEMPLATE_INPUT_MISSING", { id, requirement: missing.requirement });
            }
          }
        } catch (e) {
          // Unsupported version or malformed YAML — propagate as a structured
          // error. raiseError() in loader.ts already exits on E_TEMPLATE_VERSION_UNSUPPORTED;
          // anything else surfaces as a malformed-file error.
          if (e instanceof Error && !e.message.startsWith("E_")) {
            raiseError("E_FILE_MALFORMED", {
              format: "YAML",
              path: `${ref.dir}/template.yaml`,
              detail: e.message,
            });
          }
          throw e;
        }
      }

      await fs.mkdir(projDir, { recursive: true });
      // #105: one artifacts/<kind>/ tree per project (refs is a kind).
      for (const k of ARTIFACT_KINDS) {
        await fs.mkdir(artifactKindDir(projectId, k), { recursive: true });
      }
      await fs.mkdir(path.join(projDir, "render"), { recursive: true });
      await fs.mkdir(path.join(projDir, "logs"), { recursive: true });
      await fs.mkdir(path.join(projDir, "scripts"), { recursive: true });

      // Write TEMPLATE_ORIGIN.md so future readers (and the LLM in the next chat) know
      // where conventions came from. Intentionally does NOT write scenario.json — the
      // scenario should be authored fresh by /ralph-ugc:create-scenario skill using the template
      // as a vibe reference, not mechanically filled from a skeleton.
      const originLines = [
        `# Template origin`,
        ``,
        `This project was scaffolded from template \`${id}\`.`,
      ];
      if (isPublic && ref.kind === "public") {
        // Public library template — there are no repo files to copy. Record the
        // library entity + the reproduce path so the next chat can pull the full
        // structure (unit + blueprint) on demand.
        const block = ref.block;
        originLines.push(
          ``,
          `**Source: public content library** (not an on-disk template folder).`,
          ``,
          `- Library entity: \`template/${block.id}\`${block.name ? ` — ${block.name}` : ""}`,
          ...(block.blurb ? [`- Blurb: ${block.blurb}`] : []),
          `- Reproduce tag: \`@template:${block.id}\` (use the remix path in docs/skills-vs-templates.md)`,
          `- Inspect the full block: \`ralphy library templates show ${block.id}\``,
          `- The unit + per-unit blueprint that back this template carry the reproducible structure; pull them via the library before authoring the scenario.`,
          ``,
          `The scenario should be authored fresh by \`/ralph-ugc:create-scenario\` using this template as a vibe reference — do not mechanically copy structure.`,
        );
      }
      if (ref.kind === "dir") {
        // Only reference files that ACTUALLY EXIST in the template dir. Earlier
        // versions hardcoded the vibe-reference 4-file list (reference-example /
        // fragments / model-stack / composition .md) even for vibe-style templates
        // that don't ship those files. Detected in render-test 2026-05-11 §3.4.
        const relPath = path.relative(projDir, ref.dir);
        const candidates: Array<[string, string]> = [
          ["TEMPLATE.md", "vibe, narrative shape, required inputs"],
          ["hooks.md", "0-2s hook patterns + anti-patterns"],
          ["prompt-cookbook.md", "model-layer prompts + worked examples + camera vocabulary"],
          ["characters.md", "canonical character roster (italian-brainrot only)"],
          ["composition.md", "HyperFrames composition pattern (vibe-reference)"],
          ["fragments.md", "reusable prompt fragments (vibe-reference)"],
          ["model-stack.md", "model choices + what to avoid (vibe-reference)"],
          ["reference-example.md", "concrete reference from the original project (vibe-reference)"],
          ["examples.md", "worked variant examples"],
        ];
        const present: Array<[string, string]> = [];
        for (const [fname, desc] of candidates) {
          try {
            await fs.access(path.join(ref.dir, fname));
            present.push([fname, desc]);
          } catch { /* file not in this template — skip */ }
        }
        if (present.length > 0) {
          originLines.push(``, `**Read these before writing the scenario:**`, ``);
          for (const [fname, desc] of present) {
            originLines.push(`- \`${relPath}/${fname}\` — ${desc}`);
          }
          originLines.push(``);
        }
        originLines.push(
          `Template kind: \`${(meta as any)?.kind ?? "dir"}\`. The scenario should be written by \`/ralph-ugc:create-scenario\` using the template as vibe reference — do not mechanically copy structure. Line count, clip count, and beat structure can vary per project.`,
        );
      }
      await fs.writeFile(path.join(projDir, "TEMPLATE_ORIGIN.md"), originLines.join("\n") + "\n");

      // Copy required assets from the template (e.g. trend music tracks, brand
      // sound signatures) into the project's artifacts/ tree. template.json
      // declares these under `assets: { <key>: { path?, remote?, required, destSubdir?, manifestKey? } }`:
      //   - `path` (relative to template dir) → file already in the repo, copy directly.
      //   - `remote` truthy + `manifestKey` → file lives in ralphy-assets, fetch via ensureRequired and copy from cache.
      const copiedAssets: Array<{ key: string; src: string; dest: string; note?: string; from?: "repo" | "remote" }> = [];
      if (ref.kind === "dir" && meta?.assets && typeof meta.assets === "object") {
        const { loadManifest, ensureRequired } = await import("../lib/assets-repo.js");
        let manifestPromise: Promise<Awaited<ReturnType<typeof loadManifest>>> | null = null;
        const manifest = () => (manifestPromise ??= loadManifest());

        for (const [key, raw] of Object.entries(meta.assets as Record<string, any>)) {
          if (!raw || typeof raw !== "object") continue;
          if (!raw.required) continue;

          const baseName = path.basename(raw.path ?? raw.manifestKey ?? key);
          const ext = path.extname(baseName).toLowerCase();
          const defaultSub =
            [".mp3", ".wav", ".m4a", ".ogg"].includes(ext) ? "artifacts/music" :
            [".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? "artifacts/images" :
            [".mp4", ".mov", ".webm"].includes(ext) ? "artifacts/videos" :
            "artifacts";
          const sub = raw.destSubdir || defaultSub;
          const destDir = path.join(projDir, sub);
          await fs.mkdir(destDir, { recursive: true });

          // Local file in the template dir takes precedence (works offline).
          if (raw.path) {
            const src = path.join(ref.dir, raw.path);
            try {
              await fs.access(src);
              const dest = path.join(destDir, baseName);
              await fs.copyFile(src, dest);
              copiedAssets.push({ key, src, dest: path.relative(projDir, dest), note: raw.note, from: "repo" });
              continue;
            } catch { /* fall through to remote */ }
          }

          // Remote pull from ralphy-assets companion repo.
          if (raw.remote && raw.manifestKey) {
            try {
              const m = await manifest();
              const { cachedPath } = await ensureRequired(m, raw.manifestKey);
              const dest = path.join(destDir, baseName);
              await fs.copyFile(cachedPath, dest);
              copiedAssets.push({ key, src: cachedPath, dest: path.relative(projDir, dest), note: raw.note, from: "remote" });
            } catch (e) {
              // Don't fail scaffold over a missing companion-repo asset — surface and continue.
              ok(`Warning: failed to pull remote asset '${raw.manifestKey}' (${(e as Error).message}). Run \`ralphy assets install ${projectId} ${id}\` later.`);
            }
          }
        }
      }

      if (opts.brief) {
        await fs.writeFile(path.join(projDir, "BRIEF.md"), `# Brief\n\n${opts.brief}\n`);
      }

      const createdAt = new Date().toISOString();
      const project = await addEntity("projects", projectId, {
        name: opts.name || projectId,
        platform: meta?.platform || "tiktok",
        aspectRatio: meta?.aspectRatio || "9:16",
        duration: meta?.duration,
        template: id,
        status: "draft",
        createdAt,
        ...(opts.brief ? { brief: opts.brief } : {}),
      });

      ok(`Project ${projectId} scaffolded from template ${id}`);
      if (copiedAssets.length > 0) {
        ok(`Copied ${copiedAssets.length} required asset(s) from template`);
      }
      out({ id: projectId, from_template: id, path: projDir, project, copied_assets: copiedAssets });
    });

  cmd
    .command("extract <project-id>")
    .description(
      "Promote a finished workspace project into a reusable user-local template at the active workspace's templates/<slug>/ (.ralphy/workspaces/<ws>/templates/). Copies prompts/, scenario, composition variables, and refs; substitutes brand/persona/VO with {{slots}}; drafts a README from POSTMORTEM 'Lessons learned'. To publish it to the public library, use the templater / dev-publish-template path.",
    )
    .requiredOption("--category <c>", "Template category (b2b-saas|dtc-commerce|creator-lifestyle|entertainment-viral|cinematic-narrative)")
    .requiredOption("--slug <s>", "Target template slug (kebab-case)")
    .option("--kind <k>", "Template kind (vibe-reference|vibe-style)", "vibe-style")
    .option("--format <f>", "Media format (video|image|carousel|fb-creative|motion-design|poster|sticker-pack)", "video")
    .option("--name <n>", "Human-readable template name (defaults from slug)")
    .option("--description <d>", "One-line description (defaults to extracted-template stub)")
    .option("--tags <list>", "Comma-separated tags (default: empty)")
    .option(
      "--lift-heavy",
      "Move refs >1MB into ralphy-assets/pool/<slug>/. Default is to COPY everything in place (per AGENTS.md invariant #14).",
    )
    .option(
      "--assets-repo <path>",
      "Path to the ralphy-assets companion repo. Required when --lift-heavy is set.",
    )
    .option("--force", "Overwrite the target template directory if it already exists.")
    .action(async (projectId: string, opts: any) => {
      const allowedCats = [
        "b2b-saas",
        "dtc-commerce",
        "creator-lifestyle",
        "entertainment-viral",
        "cinematic-narrative",
      ];
      if (!allowedCats.includes(opts.category)) {
        raiseError("E_INPUT_INVALID", {
          field: "--category",
          detail: `expected one of ${allowedCats.join("|")}, got '${opts.category}'`,
          verb: "template extract",
        });
      }
      if (!getCommandContext()) {
        await extractLegacyTemplate(projectId, opts);
        return;
      }

      try {
        const ex = await import("../lib/templater/extract.js");
        const extracted = await ex.extractWorkspaceTemplateFromProject({
          projectId,
          slug: opts.slug,
          category: opts.category,
          kind: opts.kind,
          format: opts.format,
          name: opts.name,
          description: opts.description,
          tags: typeof opts.tags === "string"
            ? opts.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean)
            : [],
          force: Boolean(opts.force),
        });

        ok(`Extracted ${projectId} → ${String(extracted.id)}`);
        out({
          projectId: extracted.sourceProjectId,
          templateId: extracted.id,
          slug: extracted.slug,
          documentRevisionId: extracted.documentRevisionId,
          artifactRevisionId: extracted.artifactRevisionId ?? null,
          hasScenario: extracted.hasScenario,
          slots: extracted.slots,
          sourceDocumentRevisionIds: extracted.sourceDocumentRevisionIds,
          sourceArtifactRevisionIds: extracted.sourceArtifactRevisionIds,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (detail.includes("already exists")) {
          raiseError("E_ALREADY_EXISTS", { kind: "Template", id: opts.slug });
        }
        if (detail.includes("Project not found")) {
          raiseError("E_NOT_FOUND", { kind: "Project", id: projectId });
        }
        raiseError("E_INPUT_INVALID", { field: "project/template", detail, verb: "template extract" });
      }
    });

  cmd
    .command("delete <id>")
    .description("Delete a workspace template (flat file or whole dir). Public library templates are read-only — they live in the published library.json (Bunny CDN), not on disk.")
    .action(async (id: string) => {
      const ref = await resolveTemplate(id);
      if (!ref) raiseError("E_NOT_FOUND", { kind: "Template", id });
      if (ref!.kind === "public") {
        err(`Refusing to delete public library template '${id}' — it is read-only here. Shadow it by creating templates/${id}/ in your active workspace (.ralphy/workspaces/<ws>/templates/).`);
        return;
      }
      if (ref.kind === "dir") {
        await fs.rm(ref.dir, { recursive: true, force: true });
      } else if (ref.kind === "flat") {
        await fs.rm(ref.file, { force: true });
      }
      await deleteEntity("templates", id);
      ok(`Template deleted: ${id}`);
      out({ deleted: id });
    });

  cmd
    .command("suggest <utterance...>")
    .description(
      "Rank templates for a user utterance. Hybrid: substring scorer first (fast, free); if top-1 score is below threshold (default 0.7), fall through to an LLM-rerank pass that handles Russian / paraphrase / concept-level / typo queries. Returns top-N with reasoning when LLM fires.",
    )
    .option("--limit <n>", "Max results", (v) => parseInt(v, 10), 3)
    .option("--threshold <n>", "Min keyword score before falling through to LLM (default 0.7)", (v) => parseFloat(v), 0.7)
    .option("--no-llm", "Force keyword-only — skip the LLM fallback even if the keyword scorer comes back below threshold")
    .option("--llm-model <id>", "LLM model id for the rerank pass (default google/gemini-2.5-flash)")
    .option("--format <f>", "Restrict ranking to a single media format (video|image|carousel|fb-creative|motion-design|poster|sticker-pack)")
    .action(async (utteranceArgs: string[], opts: { limit: number; threshold: number; llm: boolean; llmModel?: string; format?: string }) => {
      const utterance = utteranceArgs.join(" ");

      // Build the Candidate[] from BOTH tiers: workspace templates (on-disk) +
      // public library template blocks. The on-disk walk is lifted into a pure
      // data shape the ranker scores without touching fs again. The public tier
      // degrades gracefully — a library error returns [] + a warning, and the
      // ranker still runs over the workspace tier alone.
      const warnings: string[] = [];

      // Workspace tier is persisted as typed JSON Document revisions.
      const { loadWorkspaceTemplate } = await import("../lib/templater/extract.js");
      const built = await Promise.all(
        (await listEntities("templates")).map(async (entity) => {
          const id = String(entity.slug ?? entity.id);
          const loaded = await loadWorkspaceTemplate(id);
          const body = loaded?.body ?? {};
          const manifest = body.manifest && typeof body.manifest === "object"
            ? body.manifest as Record<string, unknown>
            : {};
          const format = typeof entity.format === "string"
            ? entity.format
            : typeof manifest.format === "string" ? manifest.format : undefined;
          return {
            candidate: {
              slug: id,
              name: String(entity.name ?? manifest.name ?? id),
              description: String(entity.description ?? manifest.description ?? ""),
              tags: Array.isArray(entity.tags)
                ? entity.tags.map(String)
                : Array.isArray(manifest.tags) ? manifest.tags.map(String) : [],
              doc: typeof body.templateMarkdown === "string" ? body.templateMarkdown : "",
              meta: {
                source: "workspace",
                kind: entity.kind ?? manifest.kind,
                format,
                style_of: typeof manifest.style_of === "string" ? manifest.style_of : undefined,
              },
            } satisfies Candidate,
            format,
          };
        }),
      );
      const seen = new Set(built.map((b) => b.candidate.slug));
      const legacyBuilt: Array<{ candidate: Candidate; format?: string }> = [];
      for await (const { id, ref } of walkTemplateRoot(templatesDir(), "workspace")) {
        if (seen.has(id)) continue;
        const meta = await readTemplateMeta(ref);
        if (!meta) continue;
        const tax = await readTemplateTaxonomy(ref);
        const doc = ref.kind === "dir"
          ? await fs.readFile(ref.docPath, "utf8").catch(() => "")
          : "";
        legacyBuilt.push({
          candidate: {
            slug: id,
            name: typeof meta.name === "string" ? meta.name : id,
            description: typeof meta.description === "string" ? meta.description : "",
            tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
            doc,
            meta: { source: "workspace", kind: meta.kind ?? "dir", format: tax.format ?? undefined },
          },
          format: tax.format ?? undefined,
        });
        seen.add(id);
      }

      // Public tier — Supabase library template blocks.
      const publicBlocks = await fetchPublicTemplates((m) => warnings.push(m));
      const publicBuilt = publicBlocks
        .filter((block) => !seen.has(block.id)) // workspace shadows public
        .map((block) => ({
          candidate: publicBlockToCandidate(block),
          format: typeof block.format === "string" ? block.format : undefined,
        }));

      const candidates: Candidate[] = [...built, ...legacyBuilt, ...publicBuilt]
        .filter((b) => !opts.format || b.format === opts.format)
        .map((b) => b.candidate);

      const ui = await import("../lib/ui.js");
      const result = ui.isPrettyMode()
        ? await ui.withSpinner(
            `Matching against ${candidates.length} templates…`,
            () =>
              suggestTemplates(utterance, candidates, {
                limit: opts.limit,
                threshold: opts.threshold,
                disableLlm: opts.llm === false,
                llmModel: opts.llmModel,
              }),
            {
              successText: (r) =>
                `Matched via ${r.source === "keyword" ? "keyword scorer" : r.source === "llm" ? "LLM rerank (multilingual)" : "fallback (LLM failed)"}`,
            },
          )
        : await suggestTemplates(utterance, candidates, {
            limit: opts.limit,
            threshold: opts.threshold,
            disableLlm: opts.llm === false,
            llmModel: opts.llmModel,
          });

      // Surface the deterministic content-mode pre-classification (#412) so an
      // agent reads the production-intent label alongside the template ranking.
      // No LLM — `classifyContentMode` is keyword-only.
      const modeClass = classifyContentMode(utterance);

      const payload = {
        utterance: result.utterance,
        source: result.source,
        content_mode: {
          mode: modeClass.mode,
          confidence: modeClass.confidence,
          ambiguous: modeClass.ambiguous,
          alternatives: modeClass.alternatives,
        },
        llmNote: result.llmNote,
        results: result.results.map((r) => ({
          id: r.slug,
          name: r.name,
          description: r.description,
          tags: r.tags,
          source: (r.meta?.source as string | undefined) ?? "public",
          score: r.score,
          tier: r.tier,
          ...(r.reasoning ? { reasoning: r.reasoning } : {}),
        })),
        ...(warnings.length ? { warnings } : {}),
      };

      if (!ui.isPrettyMode()) {
        out(payload);
        return;
      }

      const { c, icons, bar } = ui;
      for (const w of warnings) console.log(`  ${icons.warn} ${c.warn(w)}`);
      console.log();
      console.log(`${icons.spark} ${c.bold("Query:")} ${c.value('"' + utterance + '"')}`);
      const sourceColors: Record<string, string> = {
        keyword: c.muted("substring keyword"),
        llm: c.brand("LLM rerank (semantic / multilingual)"),
        "keyword-fallback": c.warn("keyword fallback — LLM failed"),
      };
      console.log(`  ${c.label("matched via")}  ${sourceColors[result.source]}`);
      if (modeClass.mode) {
        const modeLabel = modeClass.ambiguous
          ? `${c.warn(modeClass.mode)} ${c.muted(`(ambiguous — confirm with user${modeClass.alternatives.length ? `; also: ${modeClass.alternatives.slice(0, 2).join(", ")}` : ""})`)}`
          : `${c.brand(modeClass.mode)} ${c.muted(`(${modeClass.confidence.toFixed(2)})`)}`;
        console.log(`  ${c.label("content mode")}  ${modeLabel}`);
      }
      console.log();

      if (payload.results.length === 0) {
        console.log(`  ${icons.fail} ${c.warn("No matches.")} Try rephrasing or check ${c.cmd("ralphy template list")}.`);
        return;
      }

      for (let i = 0; i < payload.results.length; i++) {
        const r = payload.results[i];
        const tierIcon = r.tier === "strong" ? icons.ok : r.tier === "weak" ? icons.warn : icons.empty;
        const tierColor =
          r.tier === "strong" ? c.ok : r.tier === "weak" ? c.warn : c.muted;
        console.log(
          `  ${c.bold(`${i + 1}.`)} ${tierIcon} ${c.cmd(r.id)}  ${bar(r.score, 1, { width: 16 })}  ${tierColor(r.score.toFixed(2))}  ${c.brand(r.tier)}`,
        );
        if (r.name && r.name !== r.id) console.log(`     ${c.label(r.name)}`);
        if (r.description) {
          const s = r.description.length > 100 ? r.description.slice(0, 97) + "…" : r.description;
          console.log(`     ${c.muted(s)}`);
        }
        if (r.reasoning) {
          console.log(`     ${icons.info} ${c.info(r.reasoning)}`);
        }
        console.log();
      }
      console.log(`  ${icons.bullet} ${c.cmd("ralphy template use " + payload.results[0].id + " --project <id>")}  scaffold a project from the top pick`);
      console.log();
    });

  cmd.addHelpText(
    "after",
    `
Examples:
  ralphy template suggest "unboxing video for my skincare brand"
  ralphy template list --format video
  ralphy template use <slug> --project <id> --brief "<the swap>"
`,
  );

  return cmd;
}
