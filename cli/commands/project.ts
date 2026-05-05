import { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import { addEntity, getEntity, updateEntity, deleteEntity, listEntities } from "../lib/registry.js";
import { slugify, generateId } from "../lib/ids.js";
import { projectsDir } from "../lib/paths.js";
import { out, ok, err } from "../lib/output.js";
import { readLog, logUserPrompt, logUserAsset, logGeneration, type GenerationEntry, type UserPromptEntry, type UserAssetEntry } from "../lib/gen-log.js";
import { transcribe, DEFAULT_MODEL, WHISPER_VERSION, type TranscribeLanguage } from "../lib/transcribe.js";
import { scoreScenario, type Scenario } from "../lib/score.js";

async function safeJson(fp: string) {
  try { return JSON.parse(await fs.readFile(fp, "utf-8")); } catch { return null; }
}

async function getProjectStatus(id: string) {
  const dir = path.join(projectsDir(), id);
  const hasScenario = !!(await safeJson(path.join(dir, "scenario.json")));
  const hasPrompts = !!(await safeJson(path.join(dir, "prompts.json")));
  const hasManifest = !!(await safeJson(path.join(dir, "asset-manifest.json")));
  const hasRender = await fs.access(path.join(dir, "render", "final.mp4")).then(() => true).catch(() => false);
  if (hasRender) return "done";
  if (hasManifest) return "assets";
  if (hasPrompts) return "prompts";
  if (hasScenario) return "scenario";
  return "draft";
}

export function projectCmd() {
  const cmd = new Command("project").description("Manage video projects");

  cmd
    .command("create")
    .description("Create a new project")
    .requiredOption("--name <name>", "Project name")
    .option("--brand <id>", "Brand ID")
    .option("--persona <id>", "Persona ID")
    .option("--template <id>", "Template ID")
    .option("--brief <text>", "Project brief")
    .option("--platform <platform>", "Target platform", "tiktok")
    .option("--aspect-ratio <ratio>", "Aspect ratio", "9:16")
    .option("--duration <seconds>", "Target duration in seconds", parseInt)
    .option("--id <id>", "Custom project ID")
    .action(async (opts) => {
      const id = opts.id || slugify(opts.name) || generateId("proj");
      const dir = path.join(projectsDir(), id);
      await fs.mkdir(dir, { recursive: true });
      await fs.mkdir(path.join(dir, "assets", "images"), { recursive: true });
      await fs.mkdir(path.join(dir, "assets", "videos"), { recursive: true });
      await fs.mkdir(path.join(dir, "assets", "voiceover"), { recursive: true });
      await fs.mkdir(path.join(dir, "assets", "music"), { recursive: true });
      await fs.mkdir(path.join(dir, "assets", "captions"), { recursive: true });
      await fs.mkdir(path.join(dir, "render"), { recursive: true });

      const data: Record<string, unknown> = {
        name: opts.name,
        platform: opts.platform,
        aspectRatio: opts.aspectRatio,
        status: "draft",
        createdAt: new Date().toISOString(),
      };
      if (opts.brand) data.brand = opts.brand;
      if (opts.persona) data.persona = opts.persona;
      if (opts.template) data.template = opts.template;
      if (opts.brief) data.brief = opts.brief;
      if (opts.duration) data.duration = opts.duration;

      const project = await addEntity("projects", id, data);
      ok(`Project created: ${id}`);
      out(project);
    });

  cmd
    .command("list")
    .description("List all projects")
    .option("--status <status>", "Filter by status")
    .option("--brand <id>", "Filter by brand")
    .action(async (opts: any) => {
      let projects = await listEntities("projects");

      // Enrich with actual status from filesystem
      projects = await Promise.all(
        projects.map(async (p: any) => ({
          ...p,
          status: await getProjectStatus(p.id),
        }))
      );

      if (opts.status) projects = projects.filter((p: any) => p.status === opts.status);
      if (opts.brand) projects = projects.filter((p: any) => p.brand === opts.brand);

      out(
        projects.map((p: any) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          brand: p.brand || "—",
          persona: p.persona || "—",
          platform: p.platform || "—",
        }))
      );
    });

  cmd
    .command("show <id>")
    .description("Show project details")
    .option("--scenario", "Show scenario JSON")
    .option("--assets", "Show asset manifest")
    .option("--prompts", "Show prompts")
    .option("--status", "Show pipeline status only")
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) err(`Project not found: ${id}`);

      const dir = path.join(projectsDir(), id);

      if (opts.scenario) {
        const scenario = await safeJson(path.join(dir, "scenario.json"));
        if (!scenario) err("No scenario.json found");
        out(scenario);
        return;
      }
      if (opts.prompts) {
        const prompts = await safeJson(path.join(dir, "prompts.json"));
        if (!prompts) err("No prompts.json found");
        out(prompts);
        return;
      }
      if (opts.assets) {
        const manifest = await safeJson(path.join(dir, "asset-manifest.json"));
        if (!manifest) err("No asset-manifest.json found");
        out(manifest);
        return;
      }

      const status = await getProjectStatus(id);
      if (opts.status) {
        const scenario = !!(await safeJson(path.join(dir, "scenario.json")));
        const prompts = !!(await safeJson(path.join(dir, "prompts.json")));
        const manifest = !!(await safeJson(path.join(dir, "asset-manifest.json")));
        const render = await fs.access(path.join(dir, "render", "final.mp4")).then(() => true).catch(() => false);
        out({ id, status, steps: { scenario, prompts, assets: manifest, render } });
        return;
      }

      out({ ...project, status });
    });

  cmd
    .command("update <id>")
    .description("Update project")
    .option("--name <name>")
    .option("--brand <id>")
    .option("--persona <id>")
    .option("--brief <text>")
    .action(async (id: string, opts: any) => {
      const updates: Record<string, unknown> = {};
      if (opts.name) updates.name = opts.name;
      if (opts.brand) updates.brand = opts.brand;
      if (opts.persona) updates.persona = opts.persona;
      if (opts.brief) updates.brief = opts.brief;
      const project = await updateEntity("projects", id, updates);
      if (!project) err(`Project not found: ${id}`);
      ok(`Project updated: ${id}`);
      out(project);
    });

  cmd
    .command("delete <id>")
    .description("Delete a project")
    .option("--keep-render", "Keep the final rendered video")
    .action(async (id: string, opts: any) => {
      const dir = path.join(projectsDir(), id);
      try {
        if (opts.keepRender) {
          // Delete everything except render/
          for (const entry of await fs.readdir(dir)) {
            if (entry !== "render") {
              await fs.rm(path.join(dir, entry), { recursive: true, force: true });
            }
          }
        } else {
          await fs.rm(dir, { recursive: true, force: true });
        }
      } catch { /* dir may not exist */ }
      await deleteEntity("projects", id);
      ok(`Project deleted: ${id}`);
      out({ deleted: id });
    });

  cmd
    .command("log <id>")
    .description("Tail project logs (generations / user-prompts / user-assets)")
    .option("--type <type>", "Log type: generations | user-prompts | user-assets | all", "generations")
    .option("--limit <n>", "Max entries (newest last)", (v) => parseInt(v, 10), 50)
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) err(`Project not found: ${id}`);

      const types: Array<"generations" | "user-prompts" | "user-assets"> =
        opts.type === "all" ? ["user-prompts", "user-assets", "generations"] : [opts.type];

      const combined: any[] = [];
      for (const t of types) {
        const entries = await readLog(id, t);
        for (const e of entries) combined.push({ _type: t, ...(e as object) });
      }
      combined.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
      const sliced = combined.slice(-opts.limit);
      out(sliced);
    });

  cmd
    .command("timeline <id>")
    .description("Merged project timeline (user requests + assets + generations) as pretty chronological log")
    .action(async (id: string) => {
      const project = await getEntity("projects", id);
      if (!project) err(`Project not found: ${id}`);
      const [prompts, assets, gens] = await Promise.all([
        readLog<UserPromptEntry>(id, "user-prompts"),
        readLog<UserAssetEntry>(id, "user-assets"),
        readLog<GenerationEntry>(id, "generations"),
      ]);
      type Row = { timestamp: string; kind: string; summary: string };
      const rows: Row[] = [];
      for (const p of prompts) rows.push({
        timestamp: p.timestamp,
        kind: "user:prompt" + (p.stage ? `[${p.stage}]` : ""),
        summary: p.text.replace(/\s+/g, " ").slice(0, 120),
      });
      for (const a of assets) rows.push({
        timestamp: a.timestamp,
        kind: "user:asset[" + a.kind + "]",
        summary: (a.purpose ? `${a.purpose} — ` : "") + (a.dest || a.source).slice(-80),
      });
      for (const g of gens) rows.push({
        timestamp: g.timestamp,
        kind: `gen:${g.kind}[${g.provider}]`,
        summary: `${g.endpoint} ${g.status === "ok" ? "✓" : "✗"}${g.note ? " — " + g.note : ""}`,
      });
      rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      out(rows);
    });

  cmd
    .command("log-prompt <id>")
    .description("Append a user-prompt entry to project logs")
    .requiredOption("--text <text>", "Prompt text")
    .option("--stage <stage>", "Stage label (brief | feedback | ...)")
    .option("--note <note>", "Free-form note")
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) err(`Project not found: ${id}`);
      await logUserPrompt(id, { text: opts.text, stage: opts.stage, note: opts.note });
      ok(`Prompt logged for ${id}`);
      out({ project: id, logged: "user-prompt" });
    });

  cmd
    .command("log-asset <id>")
    .description("Append a user-asset entry to project logs")
    .requiredOption("--kind <kind>", "screenshot | photo | video | audio | doc | ref-url | other")
    .requiredOption("--source <source>", "Original path or URL")
    .option("--dest <dest>", "Stored path inside project")
    .option("--purpose <purpose>", "character-ref | product-ref | brand-screenshot | ...")
    .option("--note <note>", "Free-form note")
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) err(`Project not found: ${id}`);
      await logUserAsset(id, {
        kind: opts.kind,
        source: opts.source,
        dest: opts.dest,
        purpose: opts.purpose,
        note: opts.note,
      });
      ok(`Asset logged for ${id}`);
      out({ project: id, logged: "user-asset", kind: opts.kind });
    });

  cmd
    .command("score <id>")
    .description("Run virality rubric over scenario.json (Hard fails + warnings, no LLM)")
    .option("--strict", "Exit with code 1 if any failure")
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) err(`Project not found: ${id}`);
      const scenario = (await safeJson(
        path.join(projectsDir(), id, "scenario.json")
      )) as Scenario | null;
      if (!scenario) err(`No scenario.json found for ${id}`);

      const result = scoreScenario(scenario as Scenario);
      out({
        project: id,
        passed: result.passed,
        failures: result.failures,
        warnings: result.warnings,
      });
      if (opts.strict && !result.passed) {
        process.exit(1);
      }
    });

  cmd
    .command("transcribe <id>")
    .description("Transcribe an audio file via local whisper.cpp; writes captions.json (Caption[])")
    .requiredOption("--audio <path>", "Path to audio file (mp3/m4a/wav)")
    .option("--language <lang>", "ru | en | auto", "ru")
    .option("--model <model>", "whisper.cpp model name", DEFAULT_MODEL)
    .option("--out <path>", "Output JSON path (default: <project>/captions.json)")
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) err(`Project not found: ${id}`);

      const audioPath = path.resolve(opts.audio);
      const projectDir = path.join(projectsDir(), id);
      const outPath = opts.out
        ? path.resolve(opts.out)
        : path.join(projectDir, "captions.json");

      const language = (opts.language || "ru") as TranscribeLanguage;

      const t0 = Date.now();
      try {
        const result = await transcribe({
          audioPath,
          language,
          model: opts.model,
        });
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, JSON.stringify(result.captions, null, 2) + "\n");

        await logGeneration(id, {
          provider: "whisper-cpp",
          endpoint: `whisper-cpp/${result.model}`,
          kind: "text",
          input: { audio: audioPath, language, model: result.model, version: WHISPER_VERSION },
          output: { local: outPath },
          status: "ok",
          latency_ms: result.durationMs,
          cost_usd: 0,
          note: `transcribed ${result.captions.length} captions, lang=${result.language}`,
        });

        ok(`Transcribed ${result.captions.length} captions → ${outPath}`);
        out({
          project: id,
          captions: result.captions.length,
          language: result.language,
          model: result.model,
          durationMs: result.durationMs,
          out: outPath,
        });
      } catch (e: any) {
        await logGeneration(id, {
          provider: "whisper-cpp",
          endpoint: `whisper-cpp/${opts.model || DEFAULT_MODEL}`,
          kind: "text",
          input: { audio: audioPath, language },
          status: "error",
          error: e?.message || String(e),
          latency_ms: Date.now() - t0,
        });
        err(`Transcription failed: ${e?.message || e}`);
      }
    });

  cmd
    .command("clone <id>")
    .description("Clone a project")
    .requiredOption("--name <name>", "New project name")
    .action(async (id: string, opts: any) => {
      const src = path.join(projectsDir(), id);
      const newId = slugify(opts.name) || generateId("proj");
      const dst = path.join(projectsDir(), newId);
      await fs.cp(src, dst, { recursive: true });

      const project = await getEntity("projects", id);
      await addEntity("projects", newId, { ...(project || {}), name: opts.name, id: newId, createdAt: new Date().toISOString() });
      ok(`Project cloned: ${id} → ${newId}`);
      out({ id: newId, clonedFrom: id });
    });

  return cmd;
}
