import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

import { RalphyBridgeClient } from "../electron/ralphy/client";
import { createProjectReader } from "../electron/ralphy/project-reader";

const bundledCore = process.env.RALPHY_BUNDLED_CORE_BIN
  ?? join(process.cwd(), "release/Ralphy Media.app/Contents/Resources/bin/ralphy");
const sourceStore = process.env.RALPHY_CORE_REVIEW_SOURCE
  ?? join(homedir(), ".ralphy", "ralphy.db");
const runIntegration = existsSync(bundledCore) && existsSync(sourceStore) ? test : test.skip;
let temporaryRoot: string | null = null;

afterEach(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = null;
});

describe("bundled Core media review integration", () => {
  runIntegration("approves and rejects through a main-process-owned Session context", async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "ralphy-bundled-review-"));
    await mkdir(join(temporaryRoot, "buckets"), { recursive: true });
    const destination = join(temporaryRoot, "ralphy.db");
    const backup = spawnSync("sqlite3", [sourceStore, `.backup ${destination}`], { encoding: "utf8" });
    expect(backup.status, backup.stderr).toBe(0);
    const normalize = spawnSync("sqlite3", [destination, "PRAGMA journal_mode=DELETE;"], { encoding: "utf8" });
    expect(normalize.status, normalize.stderr).toBe(0);

    const client = new RalphyBridgeClient({ bin: bundledCore, root: temporaryRoot });
    await client.start();
    let stage = "fixture selection";
    try {
      const selected = spawnSync("sqlite3", [destination,
        "SELECT workspace_id, project_id, id, selected_revision_id FROM artifacts WHERE project_id IS NOT NULL AND selected_revision_id IS NOT NULL ORDER BY rowid LIMIT 1;",
      ], { encoding: "utf8" });
      expect(selected.status, selected.stderr).toBe(0);
      const [workspaceId, projectId, artifactId, revisionId] = selected.stdout.trim().split("|");
      expect([workspaceId, projectId, artifactId, revisionId].every(Boolean)).toBe(true);

      const reader = createProjectReader({ request: client.request.bind(client) });
      let expectedRevisionId = revisionId!;
      for (const verdict of ["approved", "rejected"] as const) {
        stage = `projectReader.reviewMedia:${verdict}`;
        const reviewed = await reader.reviewMedia(
          { workspaceId: workspaceId!, projectId: projectId! },
          artifactId!,
          expectedRevisionId,
          verdict,
        );
        expect(reviewed.selectedState).toBe(verdict);
        expectedRevisionId = reviewed.selectedRevisionId!;
      }
    } catch (error) {
      throw new Error(`${stage}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    } finally {
      await client.close();
    }
  }, 30_000);
});
