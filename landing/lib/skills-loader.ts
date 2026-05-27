// landing/lib/skills-loader.ts
//
// Build-time loader for the skills shipped under `.agents/skills/<slug>/` in
// the repo root. Walks every skill folder, parses the SKILL.md frontmatter,
// reads the body + any sibling files (references/*, examples, etc.), and
// returns records the marketplace page + detail page render as static HTML.
//
// Replaces the old hand-maintained skills-data.ts (which drifted out of sync
// with the actual skill folders). The source of truth is now the filesystem.

import fs from "node:fs";
import path from "node:path";

// process.cwd() is the `landing/` dir under both `next build` and `next dev`.
const REPO_ROOT = path.resolve(process.cwd(), "..");
const SKILLS_DIR = path.join(REPO_ROOT, ".agents", "skills");
const REPO_BLOB = "https://github.com/alecs5am/ralphy/blob/main/.agents/skills";
// Pre-built icon tiles (see landing/scripts/build-skill-icons.py).
const ICONS_DIR = path.join(process.cwd(), "public", "assets", "skills");

export type SkillCategory =
  | "UGC niches"
  | "Workflow"
  | "Render engine"
  | "Maintainer";

export interface SkillFile {
  /** Path relative to the skill folder, e.g. "SKILL.md" or "references/x.md". */
  path: string;
  /** Raw file contents. */
  content: string;
  /** "md" → render as Markdown; "code" → render in a code block. */
  render: "md" | "code";
}

export interface SkillRecord {
  slug: string;
  name: string;
  namespace: string;
  category: SkillCategory;
  /** First sentence of the description — used on the card. */
  blurb: string;
  /** Full description (frontmatter). */
  description: string;
  tags: string[];
  /** Two-letter monogram for the avatar (fallback when no icon tile exists). */
  monogram: string;
  /** Pre-built icon tile under /public, or null to fall back to the monogram. */
  icon: string | null;
  /** Body of SKILL.md with the frontmatter stripped. */
  body: string;
  /** Every file in the skill folder (SKILL.md first). */
  files: SkillFile[];
  githubUrl: string;
}

const MD_EXT = new Set([".md", ".mdx", ".markdown"]);
const TEXT_EXT = new Set([".md", ".mdx", ".markdown", ".txt", ".json", ".yaml", ".yml"]);

/** Minimal `--- … ---` frontmatter split. Returns [frontmatterRaw, body]. */
function splitFrontmatter(raw: string): [string, string] {
  if (!raw.startsWith("---")) return ["", raw];
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return ["", raw];
  const fm = raw.slice(3, end).trim();
  const body = raw.slice(raw.indexOf("\n", end + 1) + 1).trimStart();
  return [fm, body];
}

/** Pull a scalar or folded (`>-` / `|`) value for a top-level frontmatter key. */
function fmValue(fm: string, key: string): string {
  const lines = fm.split("\n");
  const idx = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (idx === -1) return "";
  const head = lines[idx].slice(key.length + 1).trim();
  if (head && head !== ">-" && head !== ">" && head !== "|" && head !== "|-") {
    return head.replace(/^["']|["']$/g, "");
  }
  // Folded/literal block — collect indented continuation lines.
  const out: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === "") {
      out.push("");
      continue;
    }
    if (/^\s/.test(l)) out.push(l.trim());
    else break;
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

function categoryFor(slug: string, namespace: string): SkillCategory {
  if (namespace === "ralphy-dev") return "Maintainer";
  if (slug.startsWith("ralphy-ugc-")) return "UGC niches";
  if (slug.startsWith("ralphy-")) return "Workflow";
  return "Render engine";
}

function firstSentence(s: string): string {
  const m = s.match(/^.*?[.!](?:\s|$)/);
  const out = (m ? m[0] : s).trim();
  return out.length > 180 ? out.slice(0, 177).trimEnd() + "…" : out;
}

function monogramFor(slug: string): string {
  const core = slug.replace(/^ralphy-(ugc-|dev-)?/, "");
  const parts = core.split("-").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return core.slice(0, 2).toUpperCase();
}

function tagsFor(slug: string, category: SkillCategory): string[] {
  const tags: string[] = [category];
  if (slug.startsWith("ralphy-ugc-")) tags.push("niche");
  if (category === "Render engine") tags.push("engine");
  if (category === "Workflow") tags.push("ops");
  return tags;
}

function walkFiles(dir: string, base = ""): SkillFile[] {
  const out: SkillFile[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(abs, rel));
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!TEXT_EXT.has(ext)) continue;
    out.push({
      path: rel,
      content: fs.readFileSync(abs, "utf8"),
      render: MD_EXT.has(ext) ? "md" : "code",
    });
  }
  return out;
}

let cache: SkillRecord[] | null = null;

export function loadSkills(): SkillRecord[] {
  if (cache) return cache;
  if (!fs.existsSync(SKILLS_DIR)) return (cache = []);

  const records: SkillRecord[] = [];
  for (const slug of fs.readdirSync(SKILLS_DIR)) {
    const folder = path.join(SKILLS_DIR, slug);
    const skillMd = path.join(folder, "SKILL.md");
    if (!fs.statSync(folder).isDirectory() || !fs.existsSync(skillMd)) continue;

    const raw = fs.readFileSync(skillMd, "utf8");
    const [fm, body] = splitFrontmatter(raw);
    const name = fmValue(fm, "name") || slug;
    const namespace = fmValue(fm, "namespace") || "ralphy";
    const description = fmValue(fm, "description");
    const category = categoryFor(slug, namespace);

    // SKILL.md first, then the rest alphabetically.
    const files = walkFiles(folder).sort((a, b) => {
      if (a.path === "SKILL.md") return -1;
      if (b.path === "SKILL.md") return 1;
      return a.path.localeCompare(b.path);
    });

    records.push({
      slug,
      name,
      namespace,
      category,
      blurb: firstSentence(description),
      description,
      tags: tagsFor(slug, category),
      monogram: monogramFor(slug),
      icon: fs.existsSync(path.join(ICONS_DIR, `${slug}.webp`))
        ? `/assets/skills/${slug}.webp`
        : null,
      body,
      files,
      githubUrl: `${REPO_BLOB}/${slug}/SKILL.md`,
    });
  }

  // Order: UGC niches, Workflow, Render engine, Maintainer; alpha within.
  const order: Record<SkillCategory, number> = {
    "UGC niches": 0,
    Workflow: 1,
    "Render engine": 2,
    Maintainer: 3,
  };
  records.sort(
    (a, b) => order[a.category] - order[b.category] || a.slug.localeCompare(b.slug),
  );
  return (cache = records);
}

export const SKILL_CATEGORIES: SkillCategory[] = [
  "UGC niches",
  "Workflow",
  "Render engine",
  "Maintainer",
];

export function listSkillSlugs(): string[] {
  return loadSkills().map((s) => s.slug);
}

export function loadSkill(slug: string): SkillRecord | undefined {
  return loadSkills().find((s) => s.slug === slug);
}
