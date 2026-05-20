#!/usr/bin/env tsx
// scripts/lint-motion-graphics.ts — 04.0A.02
//
// Scans every `workspace/projects/<id>/prompts.json` for tell-tale motion-
// graphics descriptions ("animated text", "kinetic typography", "lower
// third", "chart animates in", "logo slides in") that landed in a
// `video.prompt` field — i.e. someone is about to ask `ralphy generate video`
// to produce code-composited motion. That's the wrong route. Per
// `04.0A.02`, motion graphics belong in a Remotion React component under
// `src/lib/` (or `~/.ralphy/render-cache/<id>/components/`), not in a video
// model's prompt.
//
// This is a **warning lint**, not a hard error — sometimes a kinetic-
// typography pass actually IS the right pixel content (e.g. a real text-
// stamped frame the model needs to render verbatim). The lint surfaces the
// pattern so the editor playbook decision tree can be revisited; humans
// suppress with an inline `<!-- motion-graphics-allow -->` comment in the
// prompt string.
//
// Exit codes:
//   0 — clean OR only warnings (the default; lint passes)
//   1 — only when `--strict` is passed AND at least one hit was found

import fs from "node:fs";
import path from "node:path";

export interface MotionGraphicsHit {
  project: string;
  slot: string | null;
  field: string;
  phrase: string;
  snippet: string;
}

export interface LintReport {
  ok: boolean;
  scanned: number;
  hits: MotionGraphicsHit[];
}

// Phrases that strongly suggest "this should be a Remotion component".
export const MOTION_GRAPHICS_TELLS = [
  "animated text",
  "kinetic typography",
  "lower third",
  "lower-third",
  "chart animates in",
  "logo slides in",
  "logo flies in",
  "text slams in",
  "text pops in",
  "title card animates",
  "transition wipe",
  "kinetic title",
] as const;

const ALLOW_MARKER = /<!--\s*motion-graphics-allow\s*-->/i;

/** Recursively walk a prompts.json blob, collecting hits in any string field. */
export function scanPromptsBlob(blob: unknown, project: string): MotionGraphicsHit[] {
  const hits: MotionGraphicsHit[] = [];
  walk(blob, "", null);
  return hits;

  function walk(node: unknown, fieldPath: string, slot: string | null): void {
    if (node == null) return;
    if (typeof node === "string") {
      if (ALLOW_MARKER.test(node)) return;
      const lower = node.toLowerCase();
      for (const tell of MOTION_GRAPHICS_TELLS) {
        if (lower.includes(tell)) {
          hits.push({
            project,
            slot,
            field: fieldPath || "(root)",
            phrase: tell,
            snippet: node.trim().slice(0, 200),
          });
          break;
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${fieldPath}[${i}]`, slot));
      return;
    }
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      // Pick up a slot id if present at this level so hits below carry it.
      const localSlot =
        typeof obj.slot === "string"
          ? obj.slot
          : typeof obj.id === "string"
            ? obj.id
            : slot;
      for (const [k, v] of Object.entries(obj)) {
        walk(v, fieldPath ? `${fieldPath}.${k}` : k, localSlot);
      }
    }
  }
}

/** Walk every `workspace/projects/<id>/prompts.json` under repoRoot. */
export function lintMotionGraphics(repoRoot: string): LintReport {
  const projectsRoot = path.join(repoRoot, "workspace", "projects");
  const hits: MotionGraphicsHit[] = [];
  let scanned = 0;
  if (!fs.existsSync(projectsRoot)) {
    return { ok: true, scanned: 0, hits: [] };
  }
  for (const entry of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const promptsPath = path.join(projectsRoot, entry.name, "prompts.json");
    if (!fs.existsSync(promptsPath)) continue;
    scanned++;
    let blob: unknown;
    try {
      blob = JSON.parse(fs.readFileSync(promptsPath, "utf8"));
    } catch {
      continue; // malformed JSON is somebody else's lint (lint-templates)
    }
    hits.push(...scanPromptsBlob(blob, entry.name));
  }
  return { ok: true, scanned, hits };
}

async function main(): Promise<void> {
  const repo = path.resolve(import.meta.dir, "..");
  const strict = process.argv.includes("--strict");
  const report = lintMotionGraphics(repo);
  if (report.hits.length === 0) {
    process.stdout.write(
      JSON.stringify({ ok: true, scanned: report.scanned, hits: 0 }) + "\n",
    );
    process.exit(0);
  }
  process.stdout.write(
    JSON.stringify(
      {
        ok: !strict,
        scanned: report.scanned,
        hits: report.hits.length,
        details: report.hits.slice(0, 50),
      },
      null,
      2,
    ) + "\n",
  );
  for (const h of report.hits) {
    process.stderr.write(
      `  • ${h.project}/${h.slot ?? "?"}  ${h.field}  "${h.phrase}"\n    ${h.snippet}\n`,
    );
  }
  process.stderr.write(
    `\n${report.hits.length} motion-graphics signal(s). Re-route to a Remotion component (docs/playbooks/editor.md#pixels-vs-code) or suppress with <!-- motion-graphics-allow -->.\n`,
  );
  process.exit(strict ? 1 : 0);
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("lint-motion-graphics.ts") ||
    process.argv[1].endsWith("lint-motion-graphics.js"));
if (isDirect) {
  void main();
}
