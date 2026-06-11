// `ralphy new "<brief>"` — create a project under <workspace>/projects/<id>/
// (01.09.01).
//
// Unified path with `ralphy project create` (issue #031). Both verbs write to
// the SAME canonical location (`.ralphy/workspaces/<ws>/projects/<id>/`) and register the
// project in the workspace registry so `ralphy generate` / `ralphy render`
// can find it. `ralphy new` keeps its lightweight ergonomics (positional
// brief, no required flags); `project create` keeps the fuller flag surface.
//
// History: pre-#031, `ralphy new` wrote to `~/.ralphy/projects/<id>/` which
// was invisible to every downstream verb. Orphan projects from that era are
// left in place per AGENTS.md invariant #14 — we never delete user output.
// On first run we emit a one-shot migration hint to stderr.

import { Command } from "commander";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { out } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { c, isPrettyMode } from "../lib/ui.js";
import { addEntity } from "../lib/registry.js";
import { ARTIFACT_KINDS, artifactKindDir, projectDir } from "../lib/paths.js";

function legacyRalphyHome(): string {
  return process.env.RALPHY_HOME || path.join(os.homedir(), ".ralphy");
}

function slugify(brief: string): string {
  return (
    brief
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "project"
  );
}

// "kbo-broadcast-001" → "Kbo Broadcast 001"
function titleCaseFromId(id: string): string {
  return id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}

function autoId(): string {
  // Stable, short, sortable: YYMMDD-HHMMSS — collision-free for the same-second case
  // is the user's problem (they'll see E_ALREADY_EXISTS and supply --id).
  const d = new Date();
  const pad = (n: number): string => (n < 10 ? "0" + n : String(n));
  return `${d.getFullYear() % 100}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// One-shot stderr hint if any orphan project exists under the legacy
// `~/.ralphy/projects/` from the pre-#031 era. We do not delete them
// (invariant #14) — just tell the user where they are.
function legacyOrphanHint(): void {
  if (process.env.RALPHY_SKIP_LEGACY_HINT === "1") return;
  const legacyProjects = path.join(legacyRalphyHome(), "projects");
  if (!fs.existsSync(legacyProjects)) return;
  let entries: string[] = [];
  try {
    entries = fs
      .readdirSync(legacyProjects, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return;
  }
  if (entries.length === 0) return;
  // eslint-disable-next-line no-console
  console.error(
    `ralphy: note — ${entries.length} legacy project${entries.length === 1 ? "" : "s"} found under ${legacyProjects} ` +
      `(from a pre-v0.3 ralphy build). They are NOT auto-migrated and are invisible to generate / render. ` +
      `Either ignore them or copy the bits you still need into a project under .ralphy/workspaces/<ws>/projects/. ` +
      `Set RALPHY_SKIP_LEGACY_HINT=1 to silence this notice. (issue #031)`,
  );
}

export function newCmd(): Command {
  const cmd = new Command("new")
    .argument("[brief...]", "Brief — free-form text describing the video to make")
    .option("--id <slug>", "Project id slug (default: derived from brief or YYMMDD-HHMMSS)")
    .option("--name <name>", "Display name (default: title-cased id)")
    .option("--brand <id>", "Brand id (registry lookup)")
    .option("--persona <id>", "Persona id (registry lookup)")
    .option("--template <id>", "Template id")
    .option("--platform <platform>", "Target platform", "tiktok")
    .option("--aspect-ratio <ratio>", "Aspect ratio", "9:16")
    .option("--duration <seconds>", "Target duration in seconds", (v: string) => parseInt(v, 10))
    .description(
      "Create a new project under <workspace>/projects/<id>/ with a canonical layout. " +
        "Lightweight on-ramp — pass a brief to seed BRIEF.md or just --id <slug> for an empty shell. " +
        "Equivalent to `ralphy project create` but with positional brief + auto-defaulted --name (issue #031).",
    )
    .action(async (briefTokens: string[] = [], opts) => {
      const brief = briefTokens.join(" ").trim();
      const id = (opts.id as string | undefined) ?? (brief ? slugify(brief) : autoId());
      const name = (opts.name as string | undefined) ?? titleCaseFromId(id);
      const projDir = projectDir(id);
      if (fs.existsSync(projDir)) {
        raiseError("E_ALREADY_EXISTS", { kind: "Project", id });
      }

      // Canonical layout (mirrors `project create`). #105: one
      // artifacts/<kind>/ tree per project (refs is a kind).
      await fsp.mkdir(projDir, { recursive: true });
      for (const k of ARTIFACT_KINDS) {
        await fsp.mkdir(artifactKindDir(id, k), { recursive: true });
      }
      await fsp.mkdir(path.join(projDir, "render"), { recursive: true });
      await fsp.mkdir(path.join(projDir, "logs"), { recursive: true });

      if (brief) {
        await fsp.writeFile(path.join(projDir, "BRIEF.md"), brief + "\n");
      }
      // Touch the append-only logs so downstream tools can stat them.
      for (const f of ["generations.jsonl", "user-prompts.jsonl", "user-assets.jsonl"]) {
        await fsp.writeFile(path.join(projDir, "logs", f), "");
      }

      const data: Record<string, unknown> = {
        name,
        platform: opts.platform,
        aspectRatio: opts.aspectRatio,
        status: "draft",
        createdAt: new Date().toISOString(),
      };
      if (opts.brand) data.brand = opts.brand;
      if (opts.persona) data.persona = opts.persona;
      if (opts.template) data.template = opts.template;
      if (brief) data.brief = brief;
      if (opts.duration) data.duration = opts.duration;

      const project = await addEntity("projects", id, data);

      legacyOrphanHint();

      const payload = {
        project_id: id,
        path: projDir,
        name,
        ...(brief ? { brief } : {}),
        ...project,
      };
      out(payload);
      if (isPrettyMode()) {
        process.stdout.write(
          `\n  ${c.muted("next:")} ${c.cmd(`ralphy render ${id}`)} ${c.muted("once assets are in place")}\n`,
        );
      }
    });
  cmd.addHelpText(
    "after",
    `
Examples:
  ralphy new "Spring 2026 ad for Acme dental floss"
  ralphy new --id summer-launch-001
  ralphy new "office-set walkthrough" --id office-walk-001
`,
  );
  return cmd;
}
