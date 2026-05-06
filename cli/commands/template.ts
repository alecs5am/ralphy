import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { addEntity, deleteEntity, listEntities } from "../lib/registry.js";
import { slugify } from "../lib/ids.js";
import { templatesDir, repoTemplatesDir, projectsDir } from "../lib/paths.js";
import { out, ok, err, isPretty } from "../lib/output.js";

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

async function resolveInDir(id: string, baseDir: string, source: TemplateSource): Promise<ResolvedTemplate | null> {
  const dir = path.join(baseDir, id);
  try {
    const st = await fs.stat(dir);
    if (st.isDirectory()) {
      return {
        kind: "dir",
        source,
        dir,
        metaPath: path.join(dir, "template.json"),
        docPath: path.join(dir, "TEMPLATE.md"),
      };
    }
  } catch { /* fall through to flat */ }

  const flat = path.join(baseDir, `${id}.json`);
  try {
    await fs.access(flat);
    return { kind: "flat", source, file: flat };
  } catch {
    return null;
  }
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
    let entries: { name: string; isDir: boolean }[] = [];
    try {
      const dirents = await fs.readdir(base, { withFileTypes: true });
      entries = dirents.map((e) => ({ name: e.name, isDir: e.isDirectory() }));
    } catch { continue; }

    for (const e of entries) {
      const id = e.isDir ? e.name : e.name.replace(/\.json$/, "");
      if (!e.isDir && !e.name.endsWith(".json")) continue;
      if (seen.has(id)) continue;
      if (e.isDir) {
        seen.set(id, {
          kind: "dir",
          source,
          dir: path.join(base, id),
          metaPath: path.join(base, id, "template.json"),
          docPath: path.join(base, id, "TEMPLATE.md"),
        });
      } else {
        seen.set(id, { kind: "flat", source, file: path.join(base, e.name) });
      }
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
      if (!ref) err(`Template dir not found: ${id}`);
      if (ref.kind !== "dir") err(`Not a dir template: ${id} — use 'template create' for flat`);
      const meta = await readTemplateMeta(ref);
      if (!meta) err(`template.json missing or invalid in ${ref.dir}`);
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
        let entries: { name: string; isDir: boolean }[] = [];
        try {
          const dirents = await fs.readdir(base, { withFileTypes: true });
          entries = dirents.map((e) => ({ name: e.name, isDir: e.isDirectory() }));
        } catch { continue; }

        for (const e of entries) {
          if (e.isDir) {
            if (rows.has(e.name)) continue;
            const ref: ResolvedTemplate = {
              kind: "dir",
              source,
              dir: path.join(base, e.name),
              metaPath: path.join(base, e.name, "template.json"),
              docPath: path.join(base, e.name, "TEMPLATE.md"),
            };
            const meta = await readTemplateMeta(ref);
            if (!meta) continue;
            rows.set(e.name, {
              id: e.name,
              name: meta.name || e.name,
              kind: "dir",
              source,
              description: meta.description,
              tags: meta.tags,
            });
          } else if (e.name.endsWith(".json")) {
            const id = e.name.replace(/\.json$/, "");
            if (rows.has(id)) continue;
            try {
              const meta = JSON.parse(await fs.readFile(path.join(base, e.name), "utf-8"));
              rows.set(id, {
                id,
                name: meta.name || id,
                kind: "flat",
                source,
                description: meta.description,
                tags: meta.tags,
              });
            } catch { /* skip unparseable flat */ }
          }
        }
      }

      // Mark unregistered (only meaningful for workspace — repo templates are always
      // discoverable by scan, registry tracking is opt-in via `template register`).
      const registered = new Set((await listEntities("templates")).map((t: any) => t.id));
      for (const row of rows.values()) {
        if (row.source === "workspace" && !registered.has(row.id)) row.unregistered = true;
      }

      out(Array.from(rows.values()));
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
      if (!ref) err(`Template not found: ${id}`);
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
    .description("Rank templates by keyword match against tags + metadata. Returns top-3 with score 0..1.")
    .option("--limit <n>", "Max results", (v) => parseInt(v, 10), 3)
    .action(async (utteranceArgs: string[], opts: { limit: number }) => {
      const utterance = utteranceArgs.join(" ").toLowerCase();
      const tokens = utterance
        .split(/[\s,.;:!?]+/)
        .map((t) => t.replace(/[^a-zа-я0-9-]/giu, "").toLowerCase())
        .filter((t) => t.length >= 2);

      const refs = await discoverAllTemplates();
      const scored = await Promise.all(
        refs.map(async (ref) => {
          const id = ref.kind === "dir" ? path.basename(ref.dir) : path.basename(ref.file).replace(/\.json$/, "");
          const meta = await readTemplateMeta(ref);
          let docText = "";
          if (ref.kind === "dir") {
            docText = await fs.readFile(ref.docPath, "utf-8").catch(() => "");
          }
          const tags: string[] = Array.isArray(meta?.tags) ? meta.tags : [];
          const description: string = typeof meta?.description === "string" ? meta.description : "";
          const name: string = typeof meta?.name === "string" ? meta.name : id;
          const haystack = [
            id,
            name,
            description,
            tags.join(" "),
            docText.slice(0, 500),
          ]
            .join(" ")
            .toLowerCase();

          let hits = 0;
          let tagHits = 0;
          for (const token of tokens) {
            if (!token) continue;
            if (tags.some((tag) => tag.toLowerCase().includes(token))) {
              tagHits += 1;
              hits += 1;
            } else if (haystack.includes(token)) {
              hits += 1;
            }
          }
          const denom = Math.max(1, tokens.length);
          // Tag matches are weighted 2× — they're the most intentional signal.
          const score = Math.min(1, (hits + tagHits) / (denom * 2));

          return {
            id,
            name,
            description,
            tags,
            source: ref.source,
            score: Number(score.toFixed(3)),
            tier:
              score >= 0.7 ? "strong" : score >= 0.5 ? "weak" : "below-threshold",
          };
        }),
      );

      const top = (scored.filter((x): x is NonNullable<typeof x> => x !== null))
        .sort((a, b) => b.score - a.score)
        .slice(0, opts.limit);

      out({
        utterance,
        tokens,
        results: top,
      });
    });

  return cmd;
}
