import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compareDatabaseSnapshots, snapshotDatabaseFamily } from "./db-fingerprint.mjs";

const RECORD_ROOT = resolve(".superpowers/sdd/nothing-instrument/db");
const json = (value) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2);

export async function withDatabaseFingerprint(label, launch, databasePath) {
  const before = await snapshotDatabaseFamily(databasePath);
  let outcome;
  let failure = null;
  try { outcome = await launch(); } catch (error) { failure = error; }
  const after = await snapshotDatabaseFamily(databasePath);
  const comparison = compareDatabaseSnapshots(before, after);
  const record = { label, databasePath: databasePath ?? "/Users/maximovchinnikov/.ralphy/ralphy.db", before, after, comparison, outcome: outcome ?? null, failure: failure instanceof Error ? failure.message : failure ? String(failure) : null };
  await mkdir(RECORD_ROOT, { recursive: true });
  const path = resolve(RECORD_ROOT, `${label}.json`);
  await writeFile(path, `${json(record)}\n`);
  if (failure) throw failure;
  if (comparison.violations.length) throw new Error(comparison.violations.join("; "));
  return { outcome, record, path };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const divider = process.argv.indexOf("--");
  const labelIndex = process.argv.indexOf("--label");
  if (labelIndex < 0 || divider < 0 || divider === process.argv.length - 1) throw new Error("Usage: bun scripts/with-db-fingerprint.mjs --label <label> -- <command>");
  const label = process.argv[labelIndex + 1];
  const [command, ...args] = process.argv.slice(divider + 1);
  const result = await withDatabaseFingerprint(label, async () => {
    const child = Bun.spawn([command, ...args], { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    const exitCode = await child.exited;
    if (exitCode !== 0) throw new Error(`${command} exited ${exitCode}`);
    return { exitCode };
  });
  console.log(result.path);
}
