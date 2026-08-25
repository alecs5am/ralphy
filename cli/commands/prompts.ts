// `ralphy prompts` — agent-facing entrypoint into the prompt cookbook +
// library (02.03.04 stretch + 02.0L.03). Two subcommands shipped in v1.0:
//
//   `ralphy prompts library lookup --goal "<text>"`
//      Returns the top-N library entries matching the goal phrase, scored
//      by substring overlap against entry.md frontmatter + body. Pure
//      keyword scorer — no LLM call. Per 02.0L.03 the verb returns
//      `{ matches: [{ slug, goal, score, path }] }`.
//
//   `ralphy prompts modes --kind <video|voice|music>` (stretch)
//      Lists the cookbook mode files under `docs/prompts/<kind>/` so the
//      agent can pick a mode without parsing markdown. Returns a flat list
//      of `{ kind, mode, path }` triples.

import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";
import { out } from "../lib/output.js";
import { installPack, packFiles, packRoot, packSource, readManifest } from "../lib/prompt-pack.js";
import { VERSION } from "../lib/version.js";

// Library + cookbook docs live in the repo, not the user's workspace. Resolve
// the repo root from this module's location (cli/commands/prompts.ts → ../..).
function repoRootFromHere(): string {
  return path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..");
}

type LibraryEntry = {
  slug: string;
  goal: string;
  appliesTo: string[];
  tags: string[];
  body: string;
  path: string;
};

async function readLibraryEntries(repoRoot: string): Promise<LibraryEntry[]> {
  const libDir = path.join(repoRoot, "docs", "prompts", "library");
  let dirs: string[] = [];
  try {
    dirs = (await fs.readdir(libDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch { return []; }
  const out: LibraryEntry[] = [];
  for (const slug of dirs) {
    const file = path.join(libDir, slug, "entry.md");
    try {
      const raw = await fs.readFile(file, "utf-8");
      const fm = parseFrontmatter(raw);
      out.push({
        slug,
        goal: typeof fm.goal === "string" ? fm.goal : "",
        appliesTo: Array.isArray(fm.applies_to) ? (fm.applies_to as string[]) : [],
        tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
        body: raw.replace(/^---[\s\S]*?---\n/u, ""),
        path: file,
      });
    } catch { /* skip unreadable */ }
  }
  return out;
}

// Minimal frontmatter parser — supports `key: value`, `key: [a, b]`, and
// `key: <text spanning to next key>`. Same shape as scripts/lint-skills.ts uses.
function parseFrontmatter(raw: string): Record<string, unknown> {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const body = m[1]!;
  const out: Record<string, unknown> = {};
  for (const line of body.split("\n")) {
    const inline = line.match(/^([\w-]+):\s*(.*)$/);
    if (!inline) continue;
    const key = inline[1]!;
    let v = inline[2]!.trim();
    if (v.startsWith("[") && v.endsWith("]")) {
      // crude array parse
      out[key] = v
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else if (v) {
      out[key] = v.replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

function scoreEntry(entry: LibraryEntry, goal: string): number {
  const tokens = goal
    .toLowerCase()
    .split(/[\s,.;:!?]+/u)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return 0;
  const haystack = [
    entry.slug,
    entry.goal,
    entry.tags.join(" "),
    entry.body.slice(0, 800),
  ].join(" ").toLowerCase();
  let hits = 0;
  for (const t of tokens) {
    if (haystack.includes(t)) hits += 1;
  }
  return Number((hits / tokens.length).toFixed(3));
}

export function promptsCmd(): Command {
  const cmd = new Command("prompts").description("Prompt cookbook + library lookup (02.03 / 02.0L)");

  const lib = cmd.command("library").description("Library by goal/situation");

  lib
    .command("lookup")
    .description("Rank library entries against a goal phrase. Pure keyword scorer.")
    .requiredOption("--goal <text>", "Goal phrase to match against entry frontmatter + body")
    .option("--limit <n>", "Max results", (v) => parseInt(v, 10), 5)
    .action(async (opts) => {
      const repoRoot = repoRootFromHere();
      const entries = await readLibraryEntries(repoRoot);
      const scored = entries
        .map((e) => ({ slug: e.slug, goal: e.goal, score: scoreEntry(e, opts.goal), path: e.path }))
        .sort((a, b) => b.score - a.score)
        .slice(0, opts.limit);
      out({ matches: scored });
    })
    .addHelpText("after", `
Examples:
  $ ralphy prompts library lookup --goal "hook for a SaaS video"
  $ ralphy prompts library lookup --goal "music bed under deadpan vo" --limit 3
  $ ralphy prompts library lookup --goal "captions for storytime"
`);

  // `prompts modes` — kind=video|voice|music. Lists cookbook mode files.
  cmd
    .command("modes")
    .description("List cookbook mode files for video / voice / music")
    .requiredOption("--kind <kind>", "video | voice | music")
    .action(async (opts) => {
      const repoRoot = repoRootFromHere();
      const dir = path.join(repoRoot, "docs", "prompts", opts.kind);
      let files: string[] = [];
      try {
        files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md") && f !== "README.md");
      } catch { /* missing kind */ }
      out({
        kind: opts.kind,
        modes: files.map((f) => ({
          mode: f.replace(/\.md$/u, ""),
          path: path.join("docs", "prompts", opts.kind, f),
        })),
      });
    })
    .addHelpText("after", `
Examples:
  $ ralphy prompts modes --kind video
  $ ralphy prompts modes --kind voice
  $ ralphy prompts modes --kind music
`);

  /* `prompts install` / `prompts status` — the routing pack, in the library.
     The router and its playbooks live in this package; an agent runs in the
     user's home. Without this copy the block `skill install` writes points at
     repo-relative paths that resolve nowhere, which is the whole reason the
     pack existed only for people with a checkout. */
  cmd
    .command("install")
    .description("Copy the AGENTS.md router and its playbooks into <root>/.ralphy/prompts")
    .action(async () => {
      const result = await installPack({ cliVersion: VERSION });
      out({
        root: result.root,
        router: path.join(result.root, "AGENTS.md"),
        files: result.files.length,
        bytes: result.totalBytes,
        written: result.written,
        removed: result.removed,
        cli_version: result.cliVersion,
      });
    })
    .addHelpText("after", `
Examples:
  $ ralphy prompts install
  $ ralphy prompts install --json
`);

  /* `prompts export` — the same copy, into a directory the caller names. The
     desktop app has no checkout to read and must not reach into one, so it
     vendors the pack through this verb at build time and ships the result
     inside its own bundle. */
  cmd
    .command("export")
    .description("Write the routing pack into a directory of your choosing (for bundling)")
    .requiredOption("--out <dir>", "Destination directory")
    .action(async (opts) => {
      const result = await installPack({ cliVersion: VERSION, root: path.resolve(opts.out) });
      out({
        root: result.root,
        router: path.join(result.root, "AGENTS.md"),
        files: result.files.length,
        bytes: result.totalBytes,
        written: result.written,
        removed: result.removed,
        cli_version: result.cliVersion,
      });
    });

  cmd
    .command("status")
    .description("Report whether the routing pack is installed, and whether it matches this CLI")
    .action(async () => {
      const root = packRoot();
      const manifest = await readManifest(root);
      const available = await packFiles(packSource());
      out({
        root,
        router: path.join(root, "AGENTS.md"),
        installed: manifest !== null,
        cli_version: VERSION,
        installed_version: manifest?.cliVersion ?? null,
        /* Stale means "this CLI ships something else", which is the only kind
           of staleness the user can act on -- `prompts install` fixes it. */
        stale: manifest !== null
          && (manifest.cliVersion !== VERSION || manifest.files.length !== available.length),
        files: manifest?.files.length ?? 0,
        bytes: manifest?.totalBytes ?? 0,
        available: available.length,
      });
    });

  return cmd;
}
