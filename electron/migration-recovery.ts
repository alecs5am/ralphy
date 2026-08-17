import { lstat, readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const JOURNAL = /^\.ralphy-migration-([A-Za-z0-9_-]{1,128})\.journal\.json$/;
const INTERRUPTED_PHASES = new Set([
  "prepared",
  "source-moved",
  "rollback-new-moved",
]);
const MAX_JOURNAL_BYTES = 64 * 1024;

export interface MigrationRecovery {
  runId: string;
  phase: string;
}

export interface MainMigrationRecovery extends MigrationRecovery {
  journalPath: string;
}

export async function findMigrationRecovery(
  rootPath: string,
): Promise<MainMigrationRecovery | null> {
  const root = resolve(rootPath);
  const parent = dirname(root);
  const names = (await readdir(parent).catch(() => []))
    .filter((name) => JOURNAL.test(name))
    .sort();
  for (const name of names) {
    const runId = JOURNAL.exec(name)?.[1];
    if (!runId) continue;
    const journalPath = resolve(parent, name);
    const info = await lstat(journalPath).catch(() => null);
    if (
      !info?.isFile()
      || info.isSymbolicLink()
      || info.size > MAX_JOURNAL_BYTES
      || (info.mode & 0o777) !== 0o600
    ) continue;
    try {
      const value = JSON.parse(await readFile(journalPath, "utf8")) as Record<string, unknown>;
      if (
        value.version !== 1
        || value.runId !== runId
        || value.journalPath !== journalPath
        || typeof value.sourcePath !== "string"
        || resolve(value.sourcePath) !== root
        || typeof value.state !== "string"
      ) continue;
      if (INTERRUPTED_PHASES.has(value.state)) {
        return { runId, phase: value.state, journalPath };
      }
    } catch {
      // A malformed unrelated file cannot supply recovery UI data.
    }
  }
  return null;
}

export function migrationRecoveryFromError(error: unknown): MainMigrationRecovery | null {
  if (
    !(error instanceof Error)
    || !("code" in error)
    || error.code !== "E_MIGRATION_INCOMPLETE"
  ) return null;
  const details = "details" in error && error.details !== null
    && typeof error.details === "object" && !Array.isArray(error.details)
    ? error.details as Record<string, unknown>
    : {};
  const runId = typeof details.runId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(details.runId)
    ? details.runId
    : "unknown";
  const phase = typeof details.phase === "string" && /^[a-z-]{1,64}$/.test(details.phase)
    ? details.phase
    : "migration-incomplete";
  const journalPath = typeof details.journalPath === "string"
    ? resolve(details.journalPath)
    : "";
  return { runId, phase, journalPath };
}

export function recoveryCommand(recovery: MainMigrationRecovery): string {
  if (!recovery.journalPath || recovery.runId === "unknown") {
    return "ralphy migrate domain verify";
  }
  const quotedJournal = `'${recovery.journalPath.replaceAll("'", `'\\''`)}'`;
  return [
    "ralphy migrate domain recover",
    `--run-id ${recovery.runId}`,
    `--confirm ${recovery.runId}`,
    `--journal ${quotedJournal}`,
  ].join(" ");
}
