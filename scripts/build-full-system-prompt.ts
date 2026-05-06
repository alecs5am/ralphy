#!/usr/bin/env bun
/**
 * build-full-system-prompt.ts — concatenate everything Claude sees on session
 * start into docs/runtime-context.md. Used as a before/after metric for the
 * Sprint 5 skill restructure (target: ≥40% character drop with same coverage).
 *
 * Run: bun run scripts/build-full-system-prompt.ts
 */

import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, relative, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

type Section = { path: string; content: string; lines: number; chars: number };

async function readIfExists(absPath: string): Promise<string | null> {
  if (!existsSync(absPath)) return null;
  const s = await stat(absPath);
  if (!s.isFile()) return null;
  return readFile(absPath, "utf8");
}

async function collectMarkdown(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectMarkdown(full)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out.sort();
}

async function loadSection(absPath: string): Promise<Section | null> {
  const content = await readIfExists(absPath);
  if (content === null) return null;
  return {
    path: relative(ROOT, absPath),
    content,
    lines: content.split("\n").length,
    chars: content.length,
  };
}

async function main() {
  const sections: Section[] = [];

  // Top-level orchestration files (order matters — this is what Claude sees first)
  const topLevel = ["CLAUDE.md", "AGENTS.md", "MODELS.md", "MEMORY.md"];
  for (const name of topLevel) {
    const sec = await loadSection(resolve(ROOT, name));
    if (sec) sections.push(sec);
  }

  // Skills — SKILL.md + rules/*.md per skill
  const skillsDir = resolve(ROOT, ".agents/skills");
  if (existsSync(skillsDir)) {
    const skillEntries = (await readdir(skillsDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    for (const skill of skillEntries) {
      const skillMd = resolve(skillsDir, skill, "SKILL.md");
      const sec = await loadSection(skillMd);
      if (sec) sections.push(sec);
      const rulesDir = resolve(skillsDir, skill, "rules");
      const rules = await collectMarkdown(rulesDir);
      for (const rule of rules) {
        const r = await loadSection(rule);
        if (r) sections.push(r);
      }
    }
  }

  // Summary
  const totalChars = sections.reduce((a, s) => a + s.chars, 0);
  const totalLines = sections.reduce((a, s) => a + s.lines, 0);

  const summary: string[] = [
    "# Runtime context dump",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `**Files: ${sections.length}**, **lines: ${totalLines}**, **chars: ${totalChars.toLocaleString()}**`,
    "",
    "Per-file breakdown (chars desc):",
    "",
    "| File | Lines | Chars |",
    "|---|---:|---:|",
  ];
  const byChars = [...sections].sort((a, b) => b.chars - a.chars);
  for (const s of byChars) {
    summary.push(`| \`${s.path}\` | ${s.lines} | ${s.chars.toLocaleString()} |`);
  }
  summary.push("", "---", "");

  const body = sections
    .map(
      (s) =>
        `\n\n${"=".repeat(80)}\n# FILE: ${s.path}\n${"=".repeat(80)}\n\n${s.content}`,
    )
    .join("\n");

  const out = summary.join("\n") + body;
  const outPath = resolve(ROOT, "docs/runtime-context.md");
  await writeFile(outPath, out, "utf8");

  console.log(`Wrote ${relative(ROOT, outPath)}`);
  console.log(`Files: ${sections.length}`);
  console.log(`Lines: ${totalLines}`);
  console.log(`Chars: ${totalChars.toLocaleString()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
