import { Command } from "commander";
import path from "node:path";
import { out } from "../lib/output.js";
import {
  cutoverMigration,
  migrationStatus,
  recoverCutover,
  rollbackCutover,
  resumeMigration,
  startMigration,
  verifyOrFreezeMigration,
} from "../lib/migration/service.js";
import { auditMigration as auditMigrationReadOnly } from "../lib/migration/inventory.js";
import { assertStartupJournalReady } from "../lib/migration/cutover-journal.js";

export function migrateCmd() {
  const command = new Command("migrate")
    .description("Audit, stage, verify, and recover the SQLite domain-store migration")
    .hook("preAction", (_migration, action) => {
      if (action.name() === "recover" || action.name() === "rollback") return;
      const source = (action.opts() as { source?: string }).source;
      if (source) assertStartupJournalReady(path.resolve(source));
    });
  command.addCommand(new Command("audit")
    .requiredOption("--source <path>", "Exact source root to audit")
    .option("--legacy-source <path>", "Additional legacy workspace source root")
    .option("--desktop-source <path>", "Additional Desktop export source root")
    .action((opts: { source: string; legacySource?: string; desktopSource?: string }) => {
      out(startMigrationAudit(opts));
    }));
  command.addCommand(new Command("run")
    .requiredOption("--source <path>", "Exact source root to migrate")
    .option("--legacy-source <path>", "Additional legacy workspace source root")
    .option("--desktop-source <path>", "Additional Desktop export source root")
    .option("--desktop-executable <path>", "Exact packaged Desktop safeStorage executable")
    .action(async (opts: { source: string; legacySource?: string; desktopSource?: string; desktopExecutable?: string }) => {
      if (opts.desktopSource && !opts.desktopExecutable) {
        throw new Error("migrate run with --desktop-source requires --desktop-executable before creating a recoverable Run");
      }
      const started = startMigration({
        sourceRoots: sourceRoots(opts),
      });
      const resumed = await resumeMigration({
        runId: started.runId,
        sourceRoots: sourceRoots(opts),
        lock: started.lock,
        desktopExecutable: opts.desktopExecutable,
      });
      out({
        runId: started.runId,
        audit: started.audit,
        cloneSupport: started.cloneSupport,
        status: resumed.status,
        inventory: resumed.inventory,
      });
    }));
  command.addCommand(new Command("resume")
    .requiredOption("--run-id <id>", "Migration Run ID")
    .requiredOption("--source <path>", "Exact source root to resume")
    .option("--legacy-source <path>", "Additional legacy workspace source root")
    .option("--desktop-source <path>", "Additional Desktop export source root")
    .option("--desktop-executable <path>", "Exact packaged Desktop safeStorage executable")
    .action(async (opts: { runId: string; source: string; legacySource?: string; desktopSource?: string; desktopExecutable?: string }) => {
      out(await resumeMigration({
        runId: opts.runId,
        sourceRoots: sourceRoots(opts),
        desktopExecutable: opts.desktopExecutable,
      }));
    }));
  command.addCommand(new Command("status")
    .requiredOption("--run-id <id>", "Migration Run ID")
    .requiredOption("--source <path>", "Exact source root used to derive the staged Run")
    .action((opts: { runId: string; source: string }) => out(migrationStatus({
      runId: opts.runId,
      sourcePath: opts.source,
    }))));
  command.addCommand(new Command("verify")
    .requiredOption("--run-id <id>", "Migration Run ID")
    .requiredOption("--source <path>", "Exact source root used to derive the staged Run")
    .requiredOption("--verification-dir <path>", "Directory outside source/stage roots for the report")
    .action(async (opts: { runId: string; source: string; verificationDir: string }) => {
      out(await verifyOrFreezeMigration({
        runId: opts.runId,
        sourcePath: opts.source,
        verificationDir: opts.verificationDir,
      }));
      }));
  command.addCommand(new Command("cutover")
    .requiredOption("--run-id <id>", "Migration Run ID")
    .requiredOption("--confirm <id>", "Repeat the Migration Run ID as an explicit destructive-action confirmation")
    .requiredOption("--verification-id <id>", "Read-only verification ID")
    .requiredOption("--verification-dir <path>", "Directory containing the bound verification and freeze records")
    .requiredOption("--source <path>", "Exact existing .ralphy source root")
    .action((opts: { runId: string; confirm: string; verificationId: string; verificationDir: string; source: string }) => {
      if (opts.confirm !== opts.runId) throw new Error("Cutover confirmation does not match the Migration Run ID");
      out(cutoverMigration({
        runId: opts.runId,
        verificationId: opts.verificationId,
        verificationDir: opts.verificationDir,
        sourcePath: opts.source,
      }));
    }));
  for (const name of ["recover", "rollback"] as const) {
    command.addCommand(new Command(name)
      .requiredOption("--run-id <id>", "Migration Run ID")
      .requiredOption("--confirm <id>", "Repeat the Migration Run ID as an explicit confirmation")
      .requiredOption("--source <path>", "Exact .ralphy source path used to derive the cutover journal")
      .action((opts: { runId: string; confirm: string; source: string }) => {
        if (opts.confirm !== opts.runId) throw new Error(`${name} confirmation does not match the Migration Run ID`);
        out(name === "recover"
          ? recoverCutover({ runId: opts.runId, sourcePath: opts.source })
          : rollbackCutover({ runId: opts.runId, sourcePath: opts.source }));
      }));
  }
  return command;
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
