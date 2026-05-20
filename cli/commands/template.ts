import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { addEntity, deleteEntity, listEntities } from "../lib/registry.js";
import { slugify } from "../lib/ids.js";
import { templatesDir, repoTemplatesDir, projectsDir } from "../lib/paths.js";
import { out, ok, err, isPretty } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { suggestTemplates, type Candidate } from "../lib/templater/suggest.js";
import {
  loadTemplateManifest,
  diagnoseRequiredInputs,
} from "../lib/templater/loader.js";

// Templates live in two places (both readable transparently):
//   - templates/                  → repo-public, committed to git, shipped on clone
//   - workspace/templates/        → user-local, gitignored (lives under workspace/)
// Workspace overrides repo if both define the same id (so a user can locally
// edit a published template without touching the repo copy).
//
// Each location supports two layouts:
//   Flat:   <root>/<id>.json
//   Dir:    <root>/<id>/template.json + TEMPLATE.md + *.md
//
// Dir-based templates are preferred for reusable video blueprints because the
// LLM-consumable doc (TEMPLATE.md) lives next to metadata, and the template
// can include supplementary fragments (prompt library, scene skeleton,
// composition pattern, model stack rationale).

type TemplateSource = "workspace" | "repo";

type ResolvedTemplate =
  | { kind: "dir"; source: TemplateSource; dir: string; metaPath: string; docPath: string }
  | { kind: "flat"; source: TemplateSource; file: string };

function dirRef(base: string, id: string, source: TemplateSource, parent?: string): ResolvedTemplate {
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

// Walk one root and yield { id, ref } for every template found, supporting
// both layouts simultaneously:
//   - templates/<id>/template.json                   (flat — legacy + workspace)
//   - templates/<category>/<id>/template.json        (categorized — repo)
// A top-level dirent is treated as a category folder when it does NOT contain
// its own template.json. Flat *.json files at the root are still supported for
// user-authored workspace templates created via `ralphy template create`.
async function* walkTemplateRoot(
  base: string,
  source: TemplateSource,
): AsyncGenerator<{ id: string; ref: ResolvedTemplate }> {
  let topLevel: Array<{ name: string; isDir: boolean }> = [];
  try {
    const dirents = await fs.readdir(base, { withFileTypes: true });
    topLevel = dirents.map((d) => ({ name: d.name, isDir: d.isDirectory() }));
  } catch { return; }

  for (const e of topLevel) {
    if (e.isDir) {
      // Self-template at top level?
      if (await pathExists(path.join(base, e.name, "template.json"))) {
        yield { id: e.name, ref: dirRef(base, e.name, source) };
        continue;
      }
      // Otherwise treat as category folder, descend one level.
      let children: Array<{ name: string; isDir: boolean }> = [];
      try {
        const inner = await fs.readdir(path.join(base, e.name), { withFileTypes: true });
        children = inner.map((d) => ({ name: d.name, isDir: d.isDirectory() }));
      } catch { continue; }
      for (const c of children) {
        if (!c.isDir) continue;
        if (await pathExists(path.join(base, e.name, c.name, "template.json"))) {
          yield { id: c.name, ref: dirRef(base, c.name, source, e.name) };
        }
      }
    } else if (e.name.endsWith(".json")) {
      const id = e.name.replace(/\.json$/, "");
      yield { id, ref: { kind: "flat", source, file: path.join(base, e.name) } };
    }
  }
}

async function resolveInDir(id: string, baseDir: string, source: TemplateSource): Promise<ResolvedTemplate | null> {
  // Fast path: flat layout (workspace) — <base>/<id>/ or <base>/<id>.json.
  const flatDir = path.join(baseDir, id);
  if (await pathExists(path.join(flatDir, "template.json"))) {
    return dirRef(baseDir, id, source);
  }
  const flatFile = path.join(baseDir, `${id}.json`);
  if (await pathExists(flatFile)) {
    return { kind: "flat", source, file: flatFile };
  }
  // Categorized layout: scan one-deep for a matching id.
  for await (const entry of walkTemplateRoot(baseDir, source)) {
    if (entry.id === id) return entry.ref;
  }
  return null;
}

async function resolveTemplate(id: string): Promise<ResolvedTemplate | null> {
  return (
    (await resolveInDir(id, templatesDir(), "workspace")) ??
    (await resolveInDir(id, repoTemplatesDir(), "repo"))
  );
}

// Discover all templates across both roots. Workspace overrides repo on id collision.
async function discoverAllTemplates(): Promise<ResolvedTemplate[]> {
  const seen = new Map<string, ResolvedTemplate>();
  for (const [base, source] of [
    [templatesDir(), "workspace" as const],
    [repoTemplatesDir(), "repo" as const],
  ] as const) {
    for await (const { id, ref } of walkTemplateRoot(base, source)) {
      if (!seen.has(id)) seen.set(id, ref);
    }
  }
  return Array.from(seen.values());
}

async function readTemplateMeta(ref: ResolvedTemplate) {
  if (ref.kind === "dir") {
    try {
      return JSON.parse(await fs.readFile(ref.metaPath, "utf-8"));
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(await fs.readFile(ref.file, "utf-8"));
  } catch {
    return null;
  }
}

export function templateCmd() {
  const cmd = new Command("template").description("Manage scenario/video templates");

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
        const scenarioPath = path.join(projectsDir(), opts.fromProject, "scenario.json");
        try {
          data.scenario = JSON.parse(await fs.readFile(scenarioPath, "utf-8"));
        } catch {
          raiseError("E_FILE_UNREADABLE", { path: `workspace/projects/${opts.fromProject}/scenario.json` });
        }
      } else if (opts.fromFile) {
        try {
          data = { ...data, ...JSON.parse(await fs.readFile(opts.fromFile, "utf-8")) };
        } catch {
          raiseError("E_FILE_UNREADABLE", { path: opts.fromFile });
        }
      }

      data.createdAt = new Date().toISOString();

      // Warn if a repo template with the same id will be shadowed.
      const repoCollision = await resolveInDir(id, repoTemplatesDir(), "repo");

      await fs.mkdir(templatesDir(), { recursive: true });
      await fs.writeFile(path.join(templatesDir(), `${id}.json`), JSON.stringify(data, null, 2) + "\n");
      await addEntity("templates", id, { name: opts.name, createdAt: data.createdAt, kind: "flat", source: "workspace" });
      ok(`Template created: ${id}${repoCollision ? " (overrides repo template with same id)" : ""}`);
      out({ id, name: opts.name, path: path.join(templatesDir(), `${id}.json`), shadows_repo: !!repoCollision });
    });

  cmd
    .command("register <id>")
    .description("Register an existing dir template in the local registry (workspace or repo)")
    .action(async (id: string) => {
      const ref = await resolveTemplate(id);
      if (!ref) raiseError("E_NOT_FOUND", { kind: "Template", id });
      if (ref!.kind !== "dir") raiseError("E_INPUT_INVALID", { field: "template-kind", detail: `'${id}' is flat; use 'template create' for that layout`, verb: "template" });
      const meta = await readTemplateMeta(ref!);
      if (!meta) raiseError("E_FILE_MALFORMED", { format: "JSON", path: `${(ref as { dir: string }).dir}/template.json`, detail: "missing or invalid" });
      // 02.05.02 — validate the typed YAML manifest before registering
      // (if the template ships one). Unsupported versions raise.
      try {
        await loadTemplateManifest((ref as { dir: string }).dir, id);
      } catch (e) {
        if (e instanceof Error && !e.message.startsWith("E_")) {
          raiseError("E_FILE_MALFORMED", { format: "YAML", path: `${(ref as { dir: string }).dir}/template.yaml`, detail: e.message });
        }
        throw e;
      }
      await addEntity("templates", id, {
        name: meta.name || id,
        createdAt: meta.createdAt || new Date().toISOString(),
        kind: "dir",
        source: ref.source,
        description: meta.description,
        tags: meta.tags,
      });
      ok(`Registered: ${id} (${ref.source})`);
      out({ id, name: meta.name, dir: ref.dir, source: ref.source });
    });

  cmd
    .command("list")
    .description("List all templates (both repo-public templates/ and local workspace/templates/)")
    .action(async () => {
      type Row = {
        id: string;
        name: string;
        kind: "dir" | "flat";
        source: TemplateSource;
        description?: string;
        tags?: string[];
        unregistered?: boolean;
      };
      const rows = new Map<string, Row>();

      // Workspace first so it overrides repo on id collision (matches resolveTemplate).
      for (const [base, source] of [
        [templatesDir(), "workspace" as const],
        [repoTemplatesDir(), "repo" as const],
      ] as const) {
        for await (const { id, ref } of walkTemplateRoot(base, source)) {
          if (rows.has(id)) continue;
          const meta = await readTemplateMeta(ref);
          if (!meta) continue;
          rows.set(id, {
            id,
            name: meta.name || id,
            kind: ref.kind,
            source,
            description: meta.description,
            tags: meta.tags,
          });
        }
      }

      // Mark unregistered (only meaningful for workspace — repo templates are always
      // discoverable by scan, registry tracking is opt-in via `template register`).
      const registered = new Set((await listEntities("templates")).map((t: any) => t.id));
      for (const row of rows.values()) {
        if (row.source === "workspace" && !registered.has(row.id)) row.unregistered = true;
      }

      const data = Array.from(rows.values()).sort((a, b) => a.id.localeCompare(b.id));
      const ui = await import("../lib/ui.js");
      if (!ui.isPrettyMode()) {
        out(data);
        return;
      }
      const { c, icons, section, table } = ui;
      section(`Templates  ${c.muted(`(${data.length} total)`)}`);
      table(data, [
        {
          key: "id",
          header: "slug",
          format: (v) => c.cmd(String(v)),
        },
        {
          key: "kind",
          header: "kind",
          format: (v) => (v === "dir" ? c.brand(String(v)) : c.muted(String(v))),
        },
        {
          key: "source",
          header: "src",
          format: (v) => (v === "repo" ? c.muted("repo") : c.accent("ws")),
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
    .description("Show template — prints TEMPLATE.md for dir templates, JSON for flat")
    .option("--path", "Print the on-disk path only")
    .option("--json", "Print template.json metadata (dir templates only)")
    .action(async (id: string, opts: any) => {
      const ref = await resolveTemplate(id);
      if (!ref) raiseError("E_NOT_FOUND", { kind: "Template", id });

      if (opts.path) {
        const p = ref.kind === "dir" ? ref.dir : ref.file;
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

      // dir template
      if (opts.json) {
        const meta = await readTemplateMeta(ref);
        if (!meta) err(`No template.json in ${ref.dir}`);
        out(meta);
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
      const projDir = path.join(projectsDir(), projectId);
      try {
        await fs.access(projDir);
        raiseError("E_ALREADY_EXISTS", { kind: "Project", id: projectId });
      } catch { /* good, doesn't exist */ }

      const meta = ref.kind === "dir" ? await readTemplateMeta(ref) : null;

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
      await fs.mkdir(path.join(projDir, "assets", "images"), { recursive: true });
      await fs.mkdir(path.join(projDir, "assets", "videos"), { recursive: true });
      await fs.mkdir(path.join(projDir, "assets", "voiceover"), { recursive: true });
      await fs.mkdir(path.join(projDir, "assets", "music"), { recursive: true });
      await fs.mkdir(path.join(projDir, "assets", "captions"), { recursive: true });
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
          ["composition.md", "Remotion composition pattern (vibe-reference)"],
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
      // sound signatures) into the project's assets/ tree. template.json
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
            [".mp3", ".wav", ".m4a", ".ogg"].includes(ext) ? "assets/music" :
            [".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? "assets/images" :
            [".mp4", ".mov", ".webm"].includes(ext) ? "assets/videos" :
            "assets";
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

      // composition-props.json skeleton — wires `ralphy render <project>` to the
      // generic per-template Remotion composition in src/lib/templates/. Templates
      // declare `compositionTemplate.id` and an optional `compositionTemplate.defaults`
      // map in template.json. Skipped if template.json doesn't declare it (legacy
      // templates that hand-author per-project Remotion still work as before).
      const compTemplate = (meta as any)?.compositionTemplate as
        | { id: string; defaults?: Record<string, unknown> }
        | undefined;
      if (compTemplate?.id) {
        const compProps: Record<string, unknown> = {
          compositionId: compTemplate.id,
          projectSlug: projectId,
          ...(compTemplate.defaults ?? {}),
        };
        await fs.writeFile(
          path.join(projDir, "composition-props.json"),
          JSON.stringify(compProps, null, 2) + "\n",
        );
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
    .command("delete <id>")
    .description("Delete a workspace template (flat file or whole dir). Repo templates are read-only — edit templates/ in the repo directly.")
    .action(async (id: string) => {
      const ref = await resolveTemplate(id);
      if (!ref) raiseError("E_NOT_FOUND", { kind: "Template", id });
      if (ref.source === "repo") {
        err(`Refusing to delete repo template '${id}' — edit templates/${id} in the repo directly (or shadow it by creating a workspace/templates/${id}/).`);
      }
      if (ref.kind === "dir") {
        await fs.rm(ref.dir, { recursive: true, force: true });
      } else {
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
    .action(async (utteranceArgs: string[], opts: { limit: number; threshold: number; llm: boolean; llmModel?: string }) => {
      const utterance = utteranceArgs.join(" ");

      // Build the Candidate[] from the on-disk template catalog. This is the
      // same disk walk the legacy implementation did; it's lifted up into a
      // pure-data shape that the new suggest.ts can score without touching fs.
      const refs = await discoverAllTemplates();
      const candidates: Candidate[] = await Promise.all(
        refs.map(async (ref) => {
          const id = ref.kind === "dir" ? path.basename(ref.dir) : path.basename(ref.file).replace(/\.json$/, "");
          const meta = await readTemplateMeta(ref);
          let docText = "";
          if (ref.kind === "dir") {
            docText = await fs.readFile(ref.docPath, "utf-8").catch(() => "");
          }
          return {
            slug: id,
            name: typeof meta?.name === "string" ? meta.name : id,
            description: typeof meta?.description === "string" ? meta.description : "",
            tags: Array.isArray(meta?.tags) ? meta.tags : [],
            doc: docText,
            meta: { source: ref.source, kind: meta?.kind },
          };
        }),
      );

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

      const payload = {
        utterance: result.utterance,
        source: result.source,
        llmNote: result.llmNote,
        results: result.results.map((r) => ({
          id: r.slug,
          name: r.name,
          description: r.description,
          tags: r.tags,
          source: (r.meta?.source as string | undefined) ?? "repo",
          score: r.score,
          tier: r.tier,
          ...(r.reasoning ? { reasoning: r.reasoning } : {}),
        })),
      };

      if (!ui.isPrettyMode()) {
        out(payload);
        return;
      }

      const { c, icons, section, bar } = ui;
      console.log();
      console.log(`${icons.spark} ${c.bold("Query:")} ${c.value('"' + utterance + '"')}`);
      const sourceColors: Record<string, string> = {
        keyword: c.muted("substring keyword"),
        llm: c.brand("LLM rerank (semantic / multilingual)"),
        "keyword-fallback": c.warn("keyword fallback — LLM failed"),
      };
      console.log(`  ${c.label("matched via")}  ${sourceColors[result.source]}`);
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

  return cmd;
}
