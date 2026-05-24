import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { root } from "../lib/paths.js";
import { out, ok, isPretty } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";

// Guidelines live at <repo>/guidelines/<slug>/ with three files:
//   - guideline.json   metadata (slug, name, kind, models, tags, examples)
//   - guideline.md     LLM-facing body (the actual prompt-writing rules)
//   - examples.json    optional curated media list (rendered on the landing page)
//
// A guideline is NOT a concrete prompt — it is rules for an LLM on how to write
// prompts for a given model / register. See guidelines/README.md for the format
// contract.

function guidelinesDir(): string {
  return path.join(root(), "guidelines");
}

type Meta = {
  slug?: string;
  name?: string;
  kind?: string;
  tag?: string;
  tagline?: string;
  description?: string;
  models?: string[];
  tags?: string[];
  version?: string;
};

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readMeta(slug: string): Promise<Meta | null> {
  const metaPath = path.join(guidelinesDir(), slug, "guideline.json");
  try {
    return JSON.parse(await fs.readFile(metaPath, "utf-8"));
  } catch {
    return null;
  }
}

async function listSlugs(): Promise<string[]> {
  try {
    const ents = await fs.readdir(guidelinesDir(), { withFileTypes: true });
    return ents.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

export function guidelineCmd() {
  const cmd = new Command("guideline").description("Prompt-library guidelines — LLM rules for writing model-specific prompts");

  cmd
    .command("list")
    .description("List every guideline shipped in the repo")
    .action(async () => {
      const slugs = await listSlugs();
      const rows: Array<{ slug: string; name: string; kind: string; models: string[]; tags: string[]; tag: string }> = [];
      for (const slug of slugs) {
        const meta = await readMeta(slug);
        if (!meta) continue;
        rows.push({
          slug,
          name: meta.name ?? slug,
          kind: meta.kind ?? "unknown",
          models: meta.models ?? [],
          tags: meta.tags ?? [],
          tag: meta.tag ?? `@guideline:${slug}`,
        });
      }

      if (!isPretty()) {
        out(rows);
        return;
      }
      const ui = await import("../lib/ui.js");
      const { c, icons, section, table } = ui;
      section(`Guidelines  ${c.muted(`(${rows.length} total)`)}`);
      table(rows, [
        { key: "slug", header: "slug", format: (v) => c.cmd(String(v)) },
        { key: "kind", header: "kind", format: (v) => c.muted(String(v)) },
        { key: "name", header: "name", format: (v) => c.bold(String(v ?? "")) },
        { key: "models", header: "models", format: (v) => c.muted(((v as string[]) ?? []).join(", ")) },
      ]);
      console.log();
      console.log(`  ${icons.bullet} ${c.cmd("ralphy guideline show <slug>")}     read guideline.md`);
      console.log(`  ${icons.bullet} ${c.cmd("ralphy guideline use  <slug>")}     copy the agent tag + print body`);
      console.log();
    });

  cmd
    .command("show <slug>")
    .description("Print guideline.md raw (pipe-friendly for LLM consumers)")
    .option("--json", "Print guideline.json metadata instead of the body")
    .option("--path", "Print the on-disk path only")
    .action(async (slug: string, opts: { json?: boolean; path?: boolean }) => {
      const dir = path.join(guidelinesDir(), slug);
      if (!(await pathExists(dir))) raiseError("E_NOT_FOUND", { kind: "Guideline", id: slug });

      if (opts.path) {
        if (isPretty()) console.log(dir);
        else out({ path: dir });
        return;
      }

      if (opts.json) {
        const meta = await readMeta(slug);
        if (!meta) raiseError("E_FILE_UNREADABLE", { path: path.join(dir, "guideline.json") });
        out(meta);
        return;
      }

      const bodyPath = path.join(dir, "guideline.md");
      try {
        const doc = await fs.readFile(bodyPath, "utf-8");
        process.stdout.write(doc);
      } catch {
        raiseError("E_FILE_UNREADABLE", { path: bodyPath });
      }
    });

  cmd
    .command("use <slug>")
    .description("Resolve a guideline tag — prints the body + the agent tag for the next prompt")
    .option("--tag-only", "Print just the @guideline:<slug> tag (for clipboard piping)")
    .action(async (slug: string, opts: { tagOnly?: boolean }) => {
      const meta = await readMeta(slug);
      if (!meta) raiseError("E_NOT_FOUND", { kind: "Guideline", id: slug });

      const tag = meta!.tag ?? `@guideline:${slug}`;

      if (opts.tagOnly) {
        process.stdout.write(tag + "\n");
        return;
      }

      if (!isPretty()) {
        const bodyPath = path.join(guidelinesDir(), slug, "guideline.md");
        let body = "";
        try { body = await fs.readFile(bodyPath, "utf-8"); } catch { /* fall through */ }
        out({ slug, tag, name: meta!.name, kind: meta!.kind, models: meta!.models ?? [], body });
        return;
      }

      const ui = await import("../lib/ui.js");
      const { c, icons, section } = ui;
      section(`${meta!.name ?? slug}  ${c.muted(`(${meta!.kind ?? "guideline"})`)}`);
      console.log(`  ${icons.bullet} tag    ${c.cmd(tag)}`);
      if (meta!.models?.length) console.log(`  ${icons.bullet} models ${c.muted(meta!.models.join(", "))}`);
      console.log();
      console.log(`  Paste the tag into your coding agent's chat — it will run`);
      console.log(`  ${c.cmd(`ralphy guideline show ${slug}`)} and load the rules.`);
      console.log();
      ok("ready");
    });

  return cmd;
}
