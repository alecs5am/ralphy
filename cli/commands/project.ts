import { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import { addEntity, getEntity, updateEntity, deleteEntity, listEntities } from "../lib/registry.js";
import { slugify, generateId } from "../lib/ids.js";
import { projectsDir } from "../lib/paths.js";
import { out, ok, err } from "../lib/output.js";
import { readLog, logUserPrompt, logUserAsset, logGeneration, type GenerationEntry, type UserPromptEntry, type UserAssetEntry } from "../lib/gen-log.js";
import { transcribe, DEFAULT_MODEL, WHISPER_MODEL, type TranscribeLanguage, type TranscribeBackend } from "../lib/transcribe.js";
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
    .option("--tree", "Print the project directory tree (file paths + sizes, max depth 4). appstore postmortem asked for this.")
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) err(`Project not found: ${id}`);

      const dir = path.join(projectsDir(), id);

      if (opts.tree) {
        // Walk the project tree up to depth 4, emit { path, size_bytes } per file.
        async function walk(d: string, depth: number): Promise<Array<{ path: string; bytes?: number }>> {
          if (depth > 4) return [];
          const entries: Array<{ path: string; bytes?: number }> = [];
          let items: import("fs").Dirent[] = [];
          try {
            items = await fs.readdir(d, { withFileTypes: true });
          } catch {
            return [];
          }
          for (const it of items) {
            const full = path.join(d, it.name);
            const rel = path.relative(dir, full);
            if (it.isDirectory()) {
              entries.push({ path: rel + "/" });
              entries.push(...(await walk(full, depth + 1)));
            } else if (it.isFile()) {
              try {
                const st = await fs.stat(full);
                entries.push({ path: rel, bytes: st.size });
              } catch {
                entries.push({ path: rel });
              }
            }
          }
          return entries;
        }
        const tree = await walk(dir, 1);
        const totalBytes = tree.reduce((s, e) => s + (e.bytes ?? 0), 0);
        out({ project: id, root: dir, fileCount: tree.filter((e) => !e.path.endsWith("/")).length, totalBytes, tree });
        return;
      }

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
    .description(
      "Append a user-asset entry to project logs. With --copy-from <src>, copies the file into <project>/refs/ first (auto-detects disposable macOS NSIRD / /tmp paths and rescues them before they evaporate). Sanitizes U+202F NARROW NO-BREAK SPACE in filenames.",
    )
    .requiredOption("--kind <kind>", "screenshot | photo | video | audio | doc | ref-url | other")
    .requiredOption("--source <source>", "Original path or URL")
    .option("--dest <dest>", "Stored path inside project (used as-is if no --copy-from)")
    .option(
      "--copy-from <src>",
      "Local file to copy into <project>/refs/ before logging. NSIRD / NSTemporaryDirectory paths get rescued before macOS auto-deletes them (skater + appstore postmortems).",
    )
    .option("--purpose <purpose>", "character-ref | product-ref | brand-screenshot | ...")
    .option("--note <note>", "Free-form note")
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) err(`Project not found: ${id}`);

      let dest = opts.dest;
      if (opts.copyFrom) {
        const src = path.resolve(opts.copyFrom);
        // Sanitize the basename: replace U+202F NARROW NO-BREAK SPACE / U+00A0 NBSP /
        // U+200B ZERO-WIDTH SPACE with a regular hyphen. macOS NSIRD paths contain
        // these (appstore postmortem hit ENOENT on `ls` showed the file but `cp`
        // failed because of invisible U+202F between words).
        const rawBase = path.basename(src);
        const sanitized = rawBase
          .replace(/[   ​]/g, "-")
          .replace(/\s+/g, "-");
        const refsDir = path.join(projectsDir(), id, "refs");
        await fs.mkdir(refsDir, { recursive: true });
        dest = path.join(refsDir, sanitized);
        // Detect disposable paths and surface a breadcrumb so the user knows we rescued.
        const isDisposable =
          src.includes("/var/folders/") ||
          src.includes("NSIRD_") ||
          src.startsWith("/tmp/") ||
          src.includes("/TemporaryItems/");
        try {
          await fs.copyFile(src, dest);
          if (isDisposable) {
            // eslint-disable-next-line no-console
            console.error(
              `ralphy: rescued disposable path → ${dest} (source was under ${src.split("/").slice(0, 5).join("/")}/...)`,
            );
          }
          if (sanitized !== rawBase) {
            // eslint-disable-next-line no-console
            console.error(
              `ralphy: filename sanitized: "${rawBase}" → "${sanitized}"`,
            );
          }
        } catch (e) {
          err(`Failed to copy ${src} → ${dest}: ${(e as Error).message}`);
        }
      }

      await logUserAsset(id, {
        kind: opts.kind,
        source: opts.source,
        dest,
        purpose: opts.purpose,
        note: opts.note,
      });
      ok(`Asset logged for ${id}${dest ? ` (saved at ${dest})` : ""}`);
      out({ project: id, logged: "user-asset", kind: opts.kind, dest });
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
    .description("Transcribe an audio file → captions.json (Caption[]). Default backend: ElevenLabs Scribe v1 (word-level).")
    .requiredOption("--audio <path>", "Path to audio file (mp3/m4a/wav, ≤25MB)")
    .option("--language <lang>", "ru | en | auto", "ru")
    .option("--backend <backend>", "elevenlabs | openrouter | gemini", "elevenlabs")
    .option("--model <model>", "(advanced; only honored for backend=openrouter)", DEFAULT_MODEL)
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
      const backend = (opts.backend || "elevenlabs") as TranscribeBackend;

      const t0 = Date.now();
      try {
        const result = await transcribe({
          audioPath,
          language,
          backend,
          model: opts.model,
        });
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, JSON.stringify(result.captions, null, 2) + "\n");

        await logGeneration(id, {
          provider: result.backend === "elevenlabs" ? "elevenlabs" : "openrouter",
          endpoint: result.model,
          kind: "text",
          input: { audio: audioPath, language, backend: result.backend },
          output: { local: outPath },
          status: "ok",
          latency_ms: result.durationMs,
          cost_usd: result.costUsd,
          note: `transcribed ${result.captions.length} captions, lang=${result.language}, audio=${result.audioDurationSec.toFixed(1)}s`,
        });

        ok(`Transcribed ${result.captions.length} captions → ${outPath}`);
        out({
          project: id,
          captions: result.captions.length,
          language: result.language,
          backend: result.backend,
          model: result.model,
          durationMs: result.durationMs,
          audioDurationSec: result.audioDurationSec,
          costUsd: result.costUsd,
          out: outPath,
        });
      } catch (e: any) {
        await logGeneration(id, {
          provider: backend === "elevenlabs" ? "elevenlabs" : "openrouter",
          endpoint: backend === "openrouter" ? WHISPER_MODEL : `transcribe/${backend}`,
          kind: "text",
          input: { audio: audioPath, language, backend },
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

  // ── verify ─────────────────────────────────────────────────────────────
  // Postmortem-driven: tokyo + kbo flagged that asset-manifest.json claims
  // can drift from on-disk reality (wrong aspect, wrong duration, truncated
  // codec). Probes every slot file with ffprobe and reports divergences.
  cmd
    .command("verify <id>")
    .description(
      "ffprobe every slot in asset-manifest.json + flag divergences (missing file, wrong duration, wrong dimensions, broken codec). Exit non-zero on any red.",
    )
    .option("--strict", "Treat warnings (missing optional metadata) as errors too", false)
    .action(async (id: string, opts: { strict?: boolean }) => {
      const { spawnSync } = await import("node:child_process");
      const dir = path.join(projectsDir(), id);
      try { await fs.access(dir); } catch { err(`Project not found: ${id}`); }
      const manifest = await safeJson(path.join(dir, "asset-manifest.json"));
      if (!manifest || !manifest.slots) {
        err(`asset-manifest.json missing or invalid at ${path.join(dir, "asset-manifest.json")}`);
      }

      type SlotReport = {
        slot: string;
        path: string | null;
        exists: boolean;
        kind?: string;
        durationSec?: number;
        width?: number;
        height?: number;
        codec?: string;
        bytes?: number;
        issues: string[];
      };
      const reports: SlotReport[] = [];
      let red = 0;

      for (const [slot, meta] of Object.entries((manifest as { slots: Record<string, any> }).slots)) {
        const issues: string[] = [];
        const localPath = (meta as { path?: string }).path;
        const r: SlotReport = { slot, path: localPath ?? null, exists: false, kind: (meta as any).kind, issues };
        if (!localPath) {
          issues.push("manifest slot has no `path` field");
          red += 1;
          reports.push(r);
          continue;
        }
        try {
          const st = await fs.stat(localPath);
          r.exists = true;
          r.bytes = st.size;
        } catch {
          issues.push(`file missing on disk: ${localPath}`);
          red += 1;
          reports.push(r);
          continue;
        }

        // ffprobe the file for shape. Skip if it's a non-media slot.
        const ext = path.extname(localPath).toLowerCase();
        if ([".png", ".jpg", ".jpeg", ".webp", ".mp4", ".mov", ".webm", ".mp3", ".wav", ".m4a", ".ogg"].includes(ext)) {
          const probe = spawnSync(
            "ffprobe",
            [
              "-v", "error",
              "-show_entries", "format=duration:stream=width,height,codec_name",
              "-of", "default=nw=1",
              localPath,
            ],
            { encoding: "utf8" },
          );
          if (probe.status === 0) {
            for (const line of (probe.stdout || "").split("\n")) {
              const [k, v] = line.split("=");
              if (k === "duration") r.durationSec = Number(v);
              if (k === "width") r.width = Number(v);
              if (k === "height") r.height = Number(v);
              if (k === "codec_name") r.codec = r.codec || v;
            }
          } else {
            issues.push(`ffprobe failed: ${(probe.stderr || "").slice(0, 200)}`);
            red += 1;
          }
        }

        if (opts.strict && r.exists && !r.codec) {
          issues.push("strict: file has no decodable codec");
          red += 1;
        }
        reports.push(r);
      }

      out({
        project: id,
        slotCount: reports.length,
        redCount: red,
        verdict: red === 0 ? "ok" : "fail",
        slots: reports,
      });
      if (red > 0) {
        // Non-zero exit so CI / scripts can chain
        process.exitCode = 1;
      }
    });

  return cmd;
}
