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

  return cmd;
}
