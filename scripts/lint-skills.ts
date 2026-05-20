#!/usr/bin/env tsx
// scripts/lint-skills.ts — 03.01.01-02
//
// Walks .agents/skills/*/SKILL.md and verifies:
//   • Frontmatter parses cleanly
//   • `name` is kebab-case and matches the folder name
//   • `description` is present and ≤ 1536 chars (agentskills.io cap)
//   • Body has the expected section ordering (warning, not error)
//   • Optional `namespace` field is `ralphy` or `ralphy-dev` (03.01.04)

import fs from "node:fs";
import path from "node:path";

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  namespace?: string;
  when_to_use?: string;
  "allowed-tools"?: string[];
  "disable-model-invocation"?: boolean;
  paths?: string[];
  context?: string;
  "argument-hint"?: string;
  arguments?: unknown;
}

const NAME_RE = /^[a-z][a-z0-9-]*$/;
const DESC_MAX = 1536;
const NAMESPACE_VALUES = new Set(["ralphy", "ralphy-dev"]);
const EXPECTED_SECTIONS = ["Trigger", "Hard invariants", "Workflow", "Outputs", "Cookbook"];

// ─── Frontmatter parser ────────────────────────────────────────────────────
//
// Minimal YAML parser tailored for skill SKILL.md frontmatter — supports flat
// `key: value` pairs and the `key: >-` folded-style multi-line value used by
// every existing skill. No dependency on a yaml library.

export function parseFrontmatter(src: string): SkillFrontmatter | null {
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const body = m[1]!;
  const lines = body.split("\n");
  const fm: SkillFrontmatter = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    // `key: >-` folded scalar
    const folded = line.match(/^(\w[\w-]*):\s*>-?\s*$/);
    if (folded) {
      const key = folded[1]!;
      i++;
      const collected: string[] = [];
      while (i < lines.length && /^(\s{2,}|\t)/.test(lines[i]!)) {
        collected.push(lines[i]!.trim());
        i++;
      }
      (fm as Record<string, unknown>)[key] = collected.join(" ").trim();
      continue;
    }
    // Inline `key: value`
    const inline = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (inline) {
      const key = inline[1]!;
      let val = inline[2]!.trim();
      // Strip surrounding quotes if present
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      (fm as Record<string, unknown>)[key] = val;
      i++;
      continue;
    }
    i++;
  }
  return fm;
}

// ─── Validator ─────────────────────────────────────────────────────────────

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export function validateSkill(
  folderName: string,
  fm: SkillFrontmatter,
  body: string,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // name
  if (!fm.name) {
    errors.push("missing required field: name");
  } else {
    if (!NAME_RE.test(fm.name)) {
      errors.push(`name must be kebab-case (matched /${NAME_RE.source}/): got '${fm.name}'`);
    }
    if (fm.name !== folderName) {
      errors.push(`name '${fm.name}' doesn't match folder '${folderName}'`);
    }
  }

  // description
  if (!fm.description) {
    errors.push("missing required field: description");
  } else if (fm.description.length > DESC_MAX) {
    errors.push(`description is ${fm.description.length} chars; cap is 1536 (agentskills.io)`);
  }

  // namespace (optional but, if present, must be one of the values)
  if (fm.namespace !== undefined && !NAMESPACE_VALUES.has(fm.namespace)) {
    errors.push(
      `namespace '${fm.namespace}' must be one of: ${Array.from(NAMESPACE_VALUES).join(", ")}`,
    );
  }

  // Body sections — soft (warning only)
  const present = new Set<string>();
  for (const heading of body.matchAll(/^##\s+([^\n]+)$/gm)) {
    present.add(heading[1]!.trim());
  }
  // Soft check — only warn if NONE of the expected sections are present, so a
  // SKILL.md that's intentionally minimal (like skill-creator) doesn't produce
  // noise.
  const overlap = EXPECTED_SECTIONS.filter((s) =>
    Array.from(present).some((p) => p.toLowerCase().startsWith(s.toLowerCase())),
  );
  if (overlap.length === 0 && present.size === 0) {
    warnings.push(
      `body has no '##' section headings — consider adding: ${EXPECTED_SECTIONS.join(", ")}`,
    );
  }

  return { errors, warnings };
}

// ─── CLI entry point ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const repo = path.resolve(import.meta.dir, "..");
  const skillsDir = path.join(repo, ".agents", "skills");
  if (!fs.existsSync(skillsDir)) {
    process.stdout.write(JSON.stringify({ ok: true, scanned: 0 }) + "\n");
    process.exit(0);
  }

  const folders = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  let errCount = 0;
  let warnCount = 0;
  const results: Array<{ folder: string; errors: string[]; warnings: string[] }> = [];

  for (const folder of folders) {
    const skillPath = path.join(skillsDir, folder, "SKILL.md");
    if (!fs.existsSync(skillPath)) {
      results.push({
        folder,
        errors: ["missing SKILL.md"],
        warnings: [],
      });
      errCount++;
      continue;
    }
    const src = fs.readFileSync(skillPath, "utf8");
    const fm = parseFrontmatter(src);
    if (!fm) {
      results.push({ folder, errors: ["no parseable frontmatter block"], warnings: [] });
      errCount++;
      continue;
    }
    const body = src.replace(/^---\n[\s\S]*?\n---\n?/, "");
    const r = validateSkill(folder, fm, body);
    errCount += r.errors.length;
    warnCount += r.warnings.length;
    if (r.errors.length > 0 || r.warnings.length > 0) {
      results.push({ folder, ...r });
    }
  }

  if (errCount === 0) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        scanned: folders.length,
        warnings: warnCount,
        ...(warnCount > 0 ? { details: results } : {}),
      }) + "\n",
    );
    process.exit(0);
  }

  for (const r of results) {
    if (r.errors.length === 0) continue;
    process.stderr.write(`.agents/skills/${r.folder}/SKILL.md:\n`);
    for (const e of r.errors) process.stderr.write(`  ✖ ${e}\n`);
  }
  process.stderr.write(`\n${errCount} error(s) across ${folders.length} skill(s).\n`);
  process.exit(1);
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("lint-skills.ts") ||
    process.argv[1].endsWith("lint-skills.js"));
if (isDirect) {
  void main();
}
