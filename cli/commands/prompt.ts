import { Command } from "commander";
import { existsSync } from "fs";
import { layoutMode, workspaceDir, DEFAULT_WORKSPACE } from "../lib/paths.js";
import { out, isPretty } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { lintWorkspacePrompts } from "../lib/prompt-lint.js";

// #515 — the training-path surface over cli/lib/prompt-lint.ts. The same pass
// also runs inside `ralphy workflow lint` (per-workflow issues) and gates
// `ralphy workspace export` (error-level violations are readiness gaps).

function requireRalphyLayout(verb: string) {
  if (layoutMode() === "legacy") raiseError("E_LEGACY_LAYOUT", { verb });
}

export function promptCmd() {
  const cmd = new Command("prompt").description(
    "Prompt-pack tooling (#515) — deterministic model-aware lint over a workspace's prompt files + the workflow nodes that consume them",
  );

  cmd
    .command("lint <slug>")
    .description(
      "Lint a workspace's prompt packs against the model-aware rule set: per-model prompt-char caps (read from the #445 model-constraints table — kling's 2500 included), the kling no-music clause for VO scenes, the ElevenLabs Music artist-name detector, the photoreal negative-cluster check, plus params.guidelines slug validation (unknown slug = error). Every rule carries a documented source (memory slug / MODELS.md); issues name the file, the rule, and the fix. Scans every node-graph workflow's inline prompts and prompt files; ZERO model calls. The same pass runs in `ralphy workflow lint` and refuses `ralphy workspace export` on error-level violations. Example: ralphy prompt lint silent-hill",
    )
    .option("--workflow <name>", "Lint only this workflow's prompts")
    .action(async (slug: string, opts: { workflow?: string }) => {
      requireRalphyLayout("prompt lint");
      if (slug !== DEFAULT_WORKSPACE && !existsSync(workspaceDir(slug))) {
        raiseError("E_NOT_FOUND", { kind: "Workspace", id: slug });
      }
      const result = lintWorkspacePrompts(slug, { workflow: opts.workflow });
      if (!result.ok) process.exitCode = 1;

      if (!isPretty()) {
        out({ ...result });
        return;
      }
      const ui = await import("../lib/ui.js");
      const { c, icons, section, table } = ui;
      section(
        `Prompt lint  ${c.muted(`(${result.workspace} — ${result.workflows.length} workflow(s), ${result.errorCount} error(s), ${result.warningCount} warning(s))`)}`,
      );
      const rows = result.workflows.flatMap((w) =>
        w.issues.map((i) => ({
          level: i.level,
          workflow: w.workflow,
          node: i.node,
          file: i.file,
          rule: i.rule ?? i.code,
          message: i.message,
        })),
      );
      if (rows.length === 0) {
        console.log(`  ${icons.ok} no prompt issues`);
      } else {
        table(rows, [
          { key: "level", header: "level", format: (v) => (v === "error" ? c.err(String(v)) : c.warn(String(v))) },
          { key: "workflow", header: "workflow", format: (v) => c.cmd(String(v)) },
          { key: "node", header: "node" },
          { key: "rule", header: "rule", format: (v) => c.muted(String(v)) },
          { key: "message", header: "message" },
        ]);
        console.log();
        for (const w of result.workflows) {
          for (const i of w.issues) {
            console.log(`  ${icons.bullet} ${c.bold(i.rule ?? i.code)} ${c.muted(`(${w.workflow}/${i.node})`)}`);
            console.log(`    fix: ${i.fix}`);
            if (i.source) console.log(`    ${c.muted(`source: ${i.source}`)}`);
          }
        }
      }
      console.log();
    });

  return cmd;
}
