import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { compareDatabaseSnapshots, snapshotDatabaseFamily } from "../scripts/db-fingerprint.mjs";

describe("database family fingerprint", () => {
  test("fails main and WAL mutation but records SHM without failing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ralphy-db-fingerprint-"));
    const path = join(directory, "ralphy.db");
    try {
      await writeFile(path, "main");
      await writeFile(`${path}-wal`, "wal");
      const before = await snapshotDatabaseFamily(path);
      expect(compareDatabaseSnapshots(before, await snapshotDatabaseFamily(path)).violations).toEqual([]);
      await writeFile(`${path}-shm`, "lock");
      expect(compareDatabaseSnapshots(before, await snapshotDatabaseFamily(path)).violations).toEqual([]);
      await writeFile(`${path}-wal`, "changed");
      expect(compareDatabaseSnapshots(before, await snapshotDatabaseFamily(path)).violations).toContain("ralphy.db-wal changed");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
