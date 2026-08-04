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
import path from "node:path";
import {
  cutoverMigration,
  migrationStatus,
  recoverCutover,
  rollbackCutover,
  resumeMigration,
  startMigration,
} from "../lib/migration/service.js";
import { auditMigration as auditMigrationReadOnly } from "../lib/migration/inventory.js";
import { verifyMigration } from "../lib/migration/verify.js";

export function migrateCmd() {
  const command = new Command("migrate")
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
  command.addCommand(domainMigrationCmd());
  return command;
}

function domainMigrationCmd(): Command {
  const domain = new Command("domain").description("Audit and resume the SQLite domain-store migration");
  domain.addCommand(new Command("audit")
    .requiredOption("--source <path>", "Exact source root to audit")
    .option("--legacy-source <path>", "Additional legacy workspace source root")
    .option("--desktop-source <path>", "Additional Desktop export source root")
    .action((opts: { source: string; legacySource?: string; desktopSource?: string }) => {
      out(startMigrationAudit(opts));
    }));
  domain.addCommand(new Command("run")
    .requiredOption("--source <path>", "Exact source root to migrate")
    .option("--legacy-source <path>", "Additional legacy workspace source root")
    .option("--desktop-source <path>", "Additional Desktop export source root")
    .action((opts: { source: string; legacySource?: string; desktopSource?: string }) => {
      const started = startMigration({
        storeRoot: path.join(root(), ".ralphy"),
        sourceRoots: sourceRoots(opts),
      });
      const resumed = resumeMigration({
        runId: started.runId,
        storeRoot: path.join(root(), ".ralphy"),
        sourceRoots: sourceRoots(opts),
      });
      out({ runId: started.runId, audit: started.audit, status: resumed.status, inventory: resumed.inventory });
    }));
  domain.addCommand(new Command("resume")
    .requiredOption("--run-id <id>", "Migration Run ID")
    .requiredOption("--source <path>", "Exact source root to resume")
    .option("--legacy-source <path>", "Additional legacy workspace source root")
    .option("--desktop-source <path>", "Additional Desktop export source root")
    .action((opts: { runId: string; source: string; legacySource?: string; desktopSource?: string }) => {
      out(resumeMigration({
        runId: opts.runId,
        storeRoot: path.join(root(), ".ralphy"),
        sourceRoots: sourceRoots(opts),
      }));
    }));
  domain.addCommand(new Command("status")
    .requiredOption("--run-id <id>", "Migration Run ID")
    .action((opts: { runId: string }) => out(migrationStatus(opts.runId))));
  domain.addCommand(new Command("verify")
    .requiredOption("--run-id <id>", "Migration Run ID")
    .option("--store-root <path>", "Staged .ralphy root; defaults to the current root")
    .requiredOption("--verification-dir <path>", "Directory outside source/stage roots for the report")
    .action((opts: { runId: string; storeRoot?: string; verificationDir: string }) => {
      out(verifyMigration({
        runId: opts.runId,
        storeRoot: opts.storeRoot ?? path.join(root(), ".ralphy"),
        verificationDir: opts.verificationDir,
      }));
      }));
  domain.addCommand(new Command("cutover")
    .requiredOption("--run-id <id>", "Migration Run ID")
    .requiredOption("--confirm <id>", "Repeat the Migration Run ID as an explicit destructive-action confirmation")
    .requiredOption("--verification-id <id>", "Read-only verification ID")
    .requiredOption("--verification-record <path>", "Mode-0600 verification record")
    .requiredOption("--source <path>", "Exact existing .ralphy source root")
    .requiredOption("--stage <path>", "Exact staged .ralphy root")
    .action((opts: { runId: string; confirm: string; verificationId: string; verificationRecord: string; source: string; stage: string }) => {
      if (opts.confirm !== opts.runId) throw new Error("Cutover confirmation does not match the Migration Run ID");
      out(cutoverMigration({
        runId: opts.runId,
        verificationId: opts.verificationId,
        verificationPath: opts.verificationRecord,
        sourcePath: opts.source,
        stagePath: opts.stage,
      }));
    }));
  for (const name of ["recover", "rollback"] as const) {
    domain.addCommand(new Command(name)
      .requiredOption("--run-id <id>", "Migration Run ID")
      .requiredOption("--confirm <id>", "Repeat the Migration Run ID as an explicit confirmation")
      .requiredOption("--journal <path>", "External mode-0600 cutover journal")
      .action((opts: { runId: string; confirm: string; journal: string }) => {
        if (opts.confirm !== opts.runId) throw new Error(`${name} confirmation does not match the Migration Run ID`);
        out(name === "recover"
          ? recoverCutover({ runId: opts.runId, journalPath: opts.journal })
          : rollbackCutover({ runId: opts.runId, journalPath: opts.journal }));
      }));
  }
  return domain;
}

function sourceRoots(opts: { source: string; legacySource?: string; desktopSource?: string }): Array<{ id: string; kind: "ralphy" | "legacy-workspace" | "desktop"; path: string }> {
  return [
    { id: "ralphy", kind: "ralphy", path: opts.source },
    ...(opts.legacySource ? [{ id: "legacy-workspace", kind: "legacy-workspace" as const, path: opts.legacySource }] : []),
    ...(opts.desktopSource ? [{ id: "desktop", kind: "desktop" as const, path: opts.desktopSource }] : []),
  ];
}

function startMigrationAudit(opts: { source: string; legacySource?: string; desktopSource?: string }) {
  // `startMigration` records a durable Run; audit is intentionally read-only.
  // Keep this helper independent so `domain audit` never creates the journal.
  return auditMigrationReadOnly({ sourceRoots: sourceRoots(opts) });
}
