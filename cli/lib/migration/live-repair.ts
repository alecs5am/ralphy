import type { Database } from "bun:sqlite";

const TASK_2D2_TARGET_TABLES: Readonly<Record<string, string>> = {
  comp: "compositions",
  crev: "composition_revisions",
  cfile: "composition_revision_files",
  run: "runs",
  attempt: "run_attempts",
  build: "builds",
  output: "build_outputs",
  result: "run_results",
};
const TASK_2D2_TARGET_REF =
  /^(comp|crev|cfile|run|attempt|build|output|result)_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function insertTask2d2SupplementalRef(
  db: Database,
  input: {
    migrationEntryId: string;
    targetRef: string;
    createdAt: number;
  },
): void {
  const prefix = TASK_2D2_TARGET_REF.exec(input.targetRef)?.[1];
  const table = prefix ? TASK_2D2_TARGET_TABLES[prefix] : null;
  if (!table) throw new Error("Supplemental ref is not a canonical Task 2D2 target");
  if (!db.query<{ found: number }, [string]>(
    `SELECT 1 AS found FROM ${table} WHERE id = ?`,
  ).get(input.targetRef)) {
    throw new Error(`Task 2D2 target does not exist: ${input.targetRef}`);
  }
  db.prepare(
    `INSERT INTO migration_entry_supplemental_refs
     (migration_entry_id, target_ref, repair_key, created_at)
     VALUES (?, ?, 'task-2d2-v1', ?)`,
  ).run(input.migrationEntryId, input.targetRef, input.createdAt);
}
