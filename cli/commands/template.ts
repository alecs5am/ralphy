import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { addEntity, deleteEntity, listEntities } from "../lib/registry.js";
import { slugify } from "../lib/ids.js";
import { templatesDir, projectsDir } from "../lib/paths.js";
import { out, ok, err, isPretty } from "../lib/output.js";

// Template storage supports two layouts (both read transparently):
//   Flat:   workspace/templates/<id>.json
//   Dir:    workspace/templates/<id>/template.json + TEMPLATE.md + *.md
//
// Dir-based templates are preferred for reusable video blueprints because the
// LLM-consumable doc (TEMPLATE.md) lives next to metadata, and the template
// can include supplementary fragments (prompt library, scene skeleton,
// composition pattern, model stack rationale).

async function resolveTemplate(id: string): Promise<
  | { kind: "dir"; dir: string; metaPath: string; docPath: string }
  | { kind: "flat"; file: string }
  | null
> {
  const dir = path.join(templatesDir(), id);
  try {
    const st = await fs.stat(dir);
    if (st.isDirectory()) {
      return {
        kind: "dir",
        dir,
        metaPath: path.join(dir, "template.json"),
        docPath: path.join(dir, "TEMPLATE.md"),
      };
    }
  } catch { /* fall through to flat */ }

  const flat = path.join(templatesDir(), `${id}.json`);
  try {
    await fs.access(flat);
    return { kind: "flat", file: flat };
  } catch {
    return null;
  }
}

async function readTemplateMeta(ref: NonNullable<Awaited<ReturnType<typeof resolveTemplate>>>) {
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
          err(`Cannot read scenario from project: ${opts.fromProject}`);
        }
      } else if (opts.fromFile) {
        try {
          data = { ...data, ...JSON.parse(await fs.readFile(opts.fromFile, "utf-8")) };
        } catch {
          err(`Cannot read file: ${opts.fromFile}`);
        }
      }

      data.createdAt = new Date().toISOString();

      await fs.mkdir(templatesDir(), { recursive: true });
      await fs.writeFile(path.join(templatesDir(), `${id}.json`), JSON.stringify(data, null, 2) + "\n");
      await addEntity("templates", id, { name: opts.name, createdAt: data.createdAt, kind: "flat" });
      ok(`Template created: ${id}`);
      out({ id, name: opts.name, path: path.join(templatesDir(), `${id}.json`) });
    });

  cmd
    .command("register <id>")
    .description("Register an existing dir template (workspace/templates/<id>/) in the registry")
    .action(async (id: string) => {
      const ref = await resolveTemplate(id);
      if (!ref) err(`Template dir not found: ${id}`);
      if (ref.kind !== "dir") err(`Not a dir template: ${id} — use 'template create' for flat`);
      const meta = await readTemplateMeta(ref);
      if (!meta) err(`template.json missing or invalid in ${ref.dir}`);
      await addEntity("templates", id, {
        name: meta.name || id,
        createdAt: meta.createdAt || new Date().toISOString(),
        kind: "dir",
        description: meta.description,
        tags: meta.tags,
      });
      ok(`Registered: ${id}`);
      out({ id, name: meta.name, dir: ref.dir });
    });

  cmd
    .command("list")
    .description("List all templates")
    .action(async () => {
      const templates = await listEntities("templates");
      // Also scan dir templates not in registry (e.g. freshly added by hand).
      const tdir = templatesDir();
      try {
        const entries = await fs.readdir(tdir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory()) {
            const already = templates.find((t: any) => t.id === e.name);
            if (!already) {
              const meta = await readTemplateMeta({
                kind: "dir",
                dir: path.join(tdir, e.name),
                metaPath: path.join(tdir, e.name, "template.json"),
                docPath: path.join(tdir, e.name, "TEMPLATE.md"),
              });
              if (meta) {
                templates.push({ id: e.name, name: meta.name || e.name, kind: "dir", unregistered: true });
              }
            }
          }
        }
      } catch { /* no templates dir yet */ }
      out(
        templates.map((t: any) => ({
          id: t.id,
          name: t.name || t.id,
          kind: t.kind || "flat",
          ...(t.unregistered ? { unregistered: true } : {}),
        }))
      );
    });

  cmd
    .command("show <id>")
    .description("Show template — prints TEMPLATE.md for dir templates, JSON for flat")
    .option("--path", "Print the on-disk path only")
    .option("--json", "Print template.json metadata (dir templates only)")
    .action(async (id: string, opts: any) => {
      const ref = await resolveTemplate(id);
      if (!ref) err(`Template not found: ${id}`);

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
    .action(async (id: string, opts: any) => {
      const ref = await resolveTemplate(id);
      if (!ref) err(`Template not found: ${id}`);

      const projectId = opts.project;
      const projDir = path.join(projectsDir(), projectId);
      try {
        await fs.access(projDir);
        err(`Project already exists: ${projectId}`);
      } catch { /* good, doesn't exist */ }

      const meta = ref.kind === "dir" ? await readTemplateMeta(ref) : null;

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
        originLines.push(
          ``,
          `**Read these before writing the scenario:**`,
          ``,
          `- \`${path.relative(projDir, ref.dir)}/TEMPLATE.md\` — vibe, narrative shape, required inputs`,
          `- \`${path.relative(projDir, ref.dir)}/reference-example.md\` — concrete reference from the original project (if present)`,
          `- \`${path.relative(projDir, ref.dir)}/fragments.md\` — reusable prompt fragments`,
          `- \`${path.relative(projDir, ref.dir)}/model-stack.md\` — model choices + what to avoid`,
          `- \`${path.relative(projDir, ref.dir)}/composition.md\` — Remotion composition pattern`,
          ``,
          `The scenario should be written by \`/ralph-ugc:create-scenario\` using the template as vibe reference — do not mechanically copy structure. Line count, clip count, and beat structure can vary per project.`,
        );
      }
      await fs.writeFile(path.join(projDir, "TEMPLATE_ORIGIN.md"), originLines.join("\n") + "\n");

      // Copy required assets from the template (e.g. trend music tracks, brand
      // sound signatures) into the project's assets/ tree. template.json can
      // declare these under `assets: { <key>: { path, required, destSubdir? } }`.
      const copiedAssets: Array<{ key: string; src: string; dest: string; note?: string }> = [];
      if (ref.kind === "dir" && meta?.assets && typeof meta.assets === "object") {
        for (const [key, raw] of Object.entries(meta.assets as Record<string, any>)) {
          if (!raw || typeof raw !== "object") continue;
          if (!raw.required) continue;
          const src = path.join(ref.dir, raw.path);
          try {
            await fs.access(src);
          } catch {
            continue;
          }
          // default dest: assets/music/ for .mp3/.wav, assets/images/ for images, else assets/
          const ext = path.extname(raw.path).toLowerCase();
          const defaultSub =
            [".mp3", ".wav", ".m4a", ".ogg"].includes(ext) ? "assets/music" :
            [".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? "assets/images" :
            [".mp4", ".mov", ".webm"].includes(ext) ? "assets/videos" :
            "assets";
          const sub = raw.destSubdir || defaultSub;
          const destDir = path.join(projDir, sub);
          await fs.mkdir(destDir, { recursive: true });
          const dest = path.join(destDir, path.basename(raw.path));
          await fs.copyFile(src, dest);
          copiedAssets.push({ key, src, dest: path.relative(projDir, dest), note: raw.note });
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
    .command("delete <id>")
    .description("Delete a template (flat file or whole dir)")
    .action(async (id: string) => {
      const ref = await resolveTemplate(id);
      if (!ref) err(`Template not found: ${id}`);
      if (ref.kind === "dir") {
        await fs.rm(ref.dir, { recursive: true, force: true });
      } else {
        await fs.rm(ref.file, { force: true });
      }
      await deleteEntity("templates", id);
      ok(`Template deleted: ${id}`);
      out({ deleted: id });
    });

  return cmd;
}
