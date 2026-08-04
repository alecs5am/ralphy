import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { exportWorkspacePackage, importWorkspacePackage } from "../../cli/lib/store/portable.js";
import { createProject, createWorkspace, upsertSocialAccount } from "../../cli/lib/store/scopes.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let tmp: TmpRoot;

beforeEach(() => { tmp = makeTmpRoot("ralphy-portable"); });
afterEach(() => { closeDomainDb(); tmp.cleanup(); });

describe("portable Workspace package", () => {
  test("exports safe entities and imports with a stable replay page", async () => {
    const source = createWorkspace({ slug: "source", name: "Source" });
    createProject({ workspaceId: source.id, slug: "project", name: "Project" });
    upsertSocialAccount({ workspaceId: source.id, platform: "x", externalId: "account-1", username: "@source" });

    const exported = await exportWorkspacePackage({ workspaceId: source.id });
    expect(exported.manifestSummary.entityCounts).toMatchObject({ workspace: 1, project: 1, socialAccount: 1 });
    expect(exported).not.toHaveProperty("path");

    const imported = await importWorkspacePackage({
      packageObjectId: exported.packageObjectId,
      idempotencyKey: "portable-import-1",
      workspaceSlug: "imported",
      limit: 1,
    });
    expect(imported.workspaceId).not.toBe(source.id);
    expect(imported.entityMapPage.items.length).toBe(1);
    expect(imported.entityMapPage.nextCursor).toBeTruthy();
    expect(imported.relinkPage.items[0]).toMatchObject({ platform: "x", handle: "@source" });

    const replay = await importWorkspacePackage({
      packageObjectId: exported.packageObjectId,
      idempotencyKey: "portable-import-1",
      entityAfter: "1",
      relinkAfter: "1",
      limit: 100,
    });
    expect(replay.workspaceId).toBe(imported.workspaceId);
    expect(replay.entityMapPage.items.length).toBeGreaterThan(0);
  });
});
