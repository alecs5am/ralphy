// `ralphy new "<brief>"` — create a project under ~/.ralphy/projects/<id>/
// (01.09.01).
//
// CWD-independent. Project lives under $RALPHY_HOME (default $HOME/.ralphy).
// Output: { project_id, path, brief? }. Pretty mode prints a "what next" hint.

import { Command } from "commander";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { out } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { c, isPrettyMode } from "../lib/ui.js";

function ralphyHome(): string {
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

function autoId(): string {
  // Stable, short, sortable: YYMMDD-HHMMSS — collision-free for the same-second case
  // is the user's problem (they'll see E_ALREADY_EXISTS and supply --id).
  const d = new Date();
  const pad = (n: number): string => (n < 10 ? "0" + n : String(n));
  return `${d.getFullYear() % 100}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function newCmd(): Command {
  const cmd = new Command("new")
    .argument("[brief...]", "Brief — free-form text describing the video to make")
    .option("--id <slug>", "Project id slug (default: derived from brief or YYMMDD-HHMMSS)")
    .description(
      "Create a new project under ~/.ralphy/projects/<id>/ with a canonical layout. " +
        "CWD-independent. Pass a brief to seed BRIEF.md or just --id <slug> for an empty shell.",
    )
    .action((briefTokens: string[] = [], opts) => {
      const brief = briefTokens.join(" ").trim();
      const id = (opts.id as string | undefined) ?? (brief ? slugify(brief) : autoId());
      const home = ralphyHome();
      const projectsDir = path.join(home, "projects");
      const projectDir = path.join(projectsDir, id);
      if (fs.existsSync(projectDir)) {
        raiseError("E_ALREADY_EXISTS", { kind: "Project", id });
      }
      fs.mkdirSync(projectDir, { recursive: true });
      fs.mkdirSync(path.join(projectDir, "assets"), { recursive: true });
      fs.mkdirSync(path.join(projectDir, "render"), { recursive: true });
      fs.mkdirSync(path.join(projectDir, "logs"), { recursive: true });
      if (brief) {
        fs.writeFileSync(path.join(projectDir, "BRIEF.md"), brief + "\n");
      }
      // Touch the append-only logs so downstream tools can stat them.
      for (const f of ["generations.jsonl", "user-prompts.jsonl", "user-assets.jsonl"]) {
        fs.writeFileSync(path.join(projectDir, "logs", f), "");
      }
      const payload = {
        project_id: id,
        path: projectDir,
        ...(brief ? { brief } : {}),
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
