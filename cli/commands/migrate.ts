// `ralphy migrate` — one-pass migration of the current root to the final
// layout: `.ralphy/` root + workspaces grouping (#108) + per-project
// `artifacts/` media tree (#105). Idempotent, dry-runnable, top-level (it
// migrates the whole root, not one workspace). Issue #106.
//
// Append-only rationale (AGENTS.md invariant #14): the migration rewrites
// path strings inside `asset-manifest.json`, `logs/generations.jsonl`,
// `logs/user-assets.jsonl`, `units/*/unit.json`, `index.html` and
// `compositions/*.html` — this is a STRUCTURAL RELOCATION, the path strings
// follow the files they point at; it is NOT a log edit. JSONL logs are
// rewritten strictly line-by-line: no line is ever dropped, filtered, or
// reordered. Failed/rejected generations, `.vN` version siblings, and `old/`
// archives all move byte-identically. POSTMORTEM.md and `postmortem/`
// (historical citations) are left untouched.
//
// Refuses while generation jobs are in flight (invariant #17: a background
// `ralphy generate` reads its prompt/ref files lazily — moving them mid-run
// fails silently). Never auto-run this from another command.

import { Command } from "commander";
import { root, setLegacyAllowed } from "../lib/paths.js";
import { runMigration, MigrateRefusal } from "../lib/migrate.js";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";

export function migrateCmd() {
  return new Command("migrate")
    .description(
      "One-pass migration of this root to the final layout: workspace/ tree → .ralphy/ root + workspaces (#108), per-project assets/ + refs/ → artifacts/ (#105). Idempotent; refuses while generation jobs are in flight. Structural relocation: path strings in manifests/logs/HTML follow their files (NOT a log edit — invariant #14).",
    )
    .option("--dry-run", "Print the full move + rewrite plan without touching disk")
    .option(
      "--project <id>",
      "Scope to one project's inner artifacts/ move only (requires the root move to be done already)",
    )
    .action(async (opts: { dryRun?: boolean; project?: string }) => {
      // The migration must READ the legacy tree — opt out of the #106
      // fail-fast guard (this and `doctor` are the only verbs that do).
      setLegacyAllowed(true);
      try {
        const report = await runMigration({
          rootDir: root(),
          dryRun: Boolean(opts.dryRun),
          projectId: opts.project,
        });
        if (report.already_migrated) {
          ok("Already migrated — nothing to do.");
        } else if (report.mode === "dry-run") {
          ok(
            `Dry-run plan: ${report.root_moves.length} root move(s), ${report.projects.length} project(s). Nothing was written.`,
          );
        } else {
          ok(
            `Migrated: ${report.root_moves.length} root move(s), ${report.projects.length} project(s).`,
          );
        }
        out(report);
      } catch (e) {
        if (e instanceof MigrateRefusal) {
          raiseError(e.errorCode, e.ctx);
        }
        throw e;
      }
    });
}
