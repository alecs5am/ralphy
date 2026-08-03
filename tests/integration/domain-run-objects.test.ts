import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import {
  getRunObject,
  listRunObjects,
  promoteRunObject,
  recordRunObject,
  startRun,
} from "../../cli/lib/store/runs.js";
import {
  createProject,
  createWorkspace,
} from "../../cli/lib/store/scopes.js";
import {
  endAgentSession,
  startAgentSession,
} from "../../cli/lib/store/sessions.js";
import { decodeCursor } from "../../cli/lib/store/pagination.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let root: TmpRoot | null = null;

afterEach(() => {
  closeDomainDb();
  root?.cleanup();
  root = null;
});

describe("bounded RunObject queries", () => {
  test("returns safe mutation/detail DTOs while retaining private evidence", () => {
    root = makeTmpRoot("ralphy-domain-run-object-safe");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const run = startRun({ workspaceId: workspace.id, kind: "diagnostic" });
    const recorded = recordRunObject({
      runId: run.id,
      path: "tmp/private/output.png",
      purpose: "provider-response",
      state: "diagnostic",
      retention: "keep-on-failure",
      mime: "image/png",
      bytes: 4,
      sha256: "0".repeat(64),
      metadata: { providerResponse: "private" },
    });
    const context = { workspaceId: workspace.id };
    const keys = [
      "bytes",
      "createdAt",
      "id",
      "mime",
      "objectId",
      "projectId",
      "purpose",
      "retention",
      "runId",
      "state",
      "workspaceId",
    ];

    expect(Object.keys(recorded).sort()).toEqual(keys);
    expect(getRunObject({ context, runObjectId: recorded.id })).toEqual(recorded);
    expect(JSON.stringify(recorded)).not.toMatch(/path|sha256|metadata|private/i);
    expect(
      openDomainDb()
        .query<
          { path: string; mime: string; sha256: string; metadata: string },
          [string]
        >(
          `SELECT path, mime, sha256, metadata_json AS metadata
           FROM run_objects WHERE id = ?`,
        )
        .get(recorded.id),
    ).toEqual({
      path: "tmp/private/output.png",
      mime: "image/png",
      sha256: "0".repeat(64),
      metadata: '{"providerResponse":"private"}',
    });
  });

  test("pages by creation time and applies the exact Run visibility", () => {
    root = makeTmpRoot("ralphy-domain-run-object-pages");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const workspaceRun = startRun({ workspaceId: workspace.id, kind: "shared" });
    const projectRun = startRun({ projectId: project.id, kind: "generation" });
    const siblingRun = startRun({ projectId: sibling.id, kind: "generation" });
    const sharedObject = recordRunObject({
      runId: workspaceRun.id,
      path: "tmp/shared.bin",
      purpose: "shared",
      state: "working",
      retention: "keep",
    });
    const objects = ["a", "b", "c"].map((name) =>
      recordRunObject({
        runId: projectRun.id,
        path: `tmp/${name}.bin`,
        purpose: "output",
        state: "working",
        retention: "keep",
        mime: "application/octet-stream",
      }),
    );
    const siblingObject = recordRunObject({
      runId: siblingRun.id,
      path: "tmp/sibling.bin",
      purpose: "output",
      state: "working",
      retention: "keep",
    });
    const chronology = objects.map((item) => item.id).sort().reverse();
    const updateTime = openDomainDb().prepare(
      "UPDATE run_objects SET created_at = ? WHERE id = ?",
    );
    chronology.forEach((id, index) => updateTime.run(100 + index * 100, id));
    const projectContext = {
      workspaceId: workspace.id,
      projectId: project.id,
    };
    const session = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "reader",
    });

    expect(getRunObject({ context: projectContext, runObjectId: sharedObject.id }).id).toBe(
      sharedObject.id,
    );
    expect(
      getRunObject({ context: { sessionId: session.id }, runObjectId: objects[0]!.id }).id,
    ).toBe(objects[0]!.id);
    for (const context of [
      { workspaceId: workspace.id },
      projectContext,
      { sessionId: session.id },
    ] as const) {
      expect(() =>
        getRunObject({ context, runObjectId: siblingObject.id }),
      ).toThrow(`RunObject not found: ${siblingObject.id}`);
    }

    const seen: string[] = [];
    const ordinals: number[] = [];
    let after: string | null | undefined;
    do {
      const page = listRunObjects({
        context: projectContext,
        runId: projectRun.id,
        after,
        limit: 1,
      });
      seen.push(...page.items.map((item) => item.id));
      expect(JSON.stringify(page.items)).not.toMatch(/path|sha256|metadata/i);
      if (page.nextCursor) {
        ordinals.push(decodeCursor("c1", page.nextCursor).ordinal);
      }
      after = page.nextCursor;
    } while (after);
    expect(seen).toEqual(chronology);
    expect(ordinals).toEqual([100, 200]);
    expect(
      listRunObjects({
        context: projectContext,
        runId: workspaceRun.id,
        limit: 10,
      }).items.map((item) => item.id),
    ).toEqual([sharedObject.id]);
    expect(() =>
      listRunObjects({
        context: projectContext,
        runId: siblingRun.id,
        limit: 10,
      }),
    ).toThrow(`Run not found: ${siblingRun.id}`);
    expect(() =>
      listRunObjects({
        context: projectContext,
        runId: projectRun.id,
        after: "p1.WzAsInJvYmoiXQ",
        limit: 1,
      }),
    ).toThrow(/family/i);
    expect(() =>
      listRunObjects({ context: projectContext, runId: projectRun.id, limit: 0 }),
    ).toThrow(/1 through 100/);

    endAgentSession(session.id);
    expect(() =>
      getRunObject({
        context: { sessionId: session.id },
        runObjectId: objects[0]!.id,
      }),
    ).toThrow(/ended/i);
  });

  test("validates and freezes MIME while promotion returns a safe DTO", async () => {
    root = makeTmpRoot("ralphy-domain-run-object-mime");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const run = startRun({ workspaceId: workspace.id, kind: "generation" });
    const source = path.join(root.dir, ".ralphy", "tmp", "output.png");
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, "data");
    const recorded = recordRunObject({
      runId: run.id,
      path: "tmp/output.png",
      purpose: "output",
      state: "working",
      retention: "keep",
      mime: "image/png",
      bytes: 4,
    });
    const second = recordRunObject({
      runId: run.id,
      path: "tmp/second.mp4",
      purpose: "output",
      state: "working",
      retention: "keep",
      mime: "video/mp4",
    });
    for (const mime of ["", "image", "image/", "/png", "image/png;evil", "a/" + "b".repeat(254)]) {
      expect(() =>
        recordRunObject({
          runId: run.id,
          path: "tmp/invalid.bin",
          purpose: "output",
          state: "working",
          retention: "keep",
          mime,
        }),
      ).toThrow(/MIME/i);
    }
    expect(() =>
      openDomainDb()
        .prepare(
          `INSERT INTO run_objects
           (id, run_id, path, purpose, state, retention, mime, created_at)
           VALUES ('robj_nul_mime', ?, 'tmp/nul.bin', 'output', 'working', 'keep', ?, 1)`,
        )
        .run(run.id, "image/png\0evil"),
    ).toThrow(/constraint/i);

    expect(() =>
      openDomainDb().prepare("UPDATE run_objects SET mime = 'video/mp4' WHERE id = ?").run(
        recorded.id,
      ),
    ).toThrow(/MIME|immutable/i);
    expect(() =>
      openDomainDb()
        .prepare(
          `INSERT OR REPLACE INTO run_objects
           (id, run_id, path, purpose, state, retention, mime, created_at)
           SELECT id, run_id, path, purpose, state, retention, 'video/mp4', created_at
           FROM run_objects WHERE id = ?`,
        )
        .run(recorded.id),
    ).toThrow(/MIME|immutable/i);
    expect(() =>
      openDomainDb()
        .prepare("UPDATE OR REPLACE run_objects SET id = ? WHERE id = ?")
        .run(second.id, recorded.id),
    ).toThrow(/identity|immutable/i);
    const otherRun = startRun({ workspaceId: workspace.id, kind: "other" });
    expect(() =>
      openDomainDb()
        .prepare("UPDATE run_objects SET run_id = ? WHERE id = ?")
        .run(otherRun.id, recorded.id),
    ).toThrow(/identity|immutable|provenance/i);
    expect(
      openDomainDb()
        .query<{ id: string; mime: string | null }, []>(
          "SELECT id, mime FROM run_objects ORDER BY id",
        )
        .all(),
    ).toEqual(
      [
        { id: recorded.id, mime: "image/png" },
        { id: second.id, mime: "video/mp4" },
      ].sort((left, right) => left.id.localeCompare(right.id)),
    );
    await expect(
      promoteRunObject({
        runObjectId: recorded.id,
        mime: "video/mp4",
        storageClass: "working",
      }),
    ).rejects.toThrow(/MIME/i);
    expect(fs.existsSync(source)).toBeTrue();

    const promoted = await promoteRunObject({
      runObjectId: recorded.id,
      mime: "image/png",
      storageClass: "working",
    });
    expect(promoted).toMatchObject({
      id: recorded.id,
      mime: "image/png",
      bytes: 4,
      workspaceId: workspace.id,
    });
    expect(promoted.objectId).toMatch(/^obj_/);
    expect(JSON.stringify(promoted)).not.toMatch(/tmp\/|sha256|metadata/i);

    const legacySource = path.join(root.dir, ".ralphy", "tmp", "legacy.bin");
    fs.writeFileSync(legacySource, "legacy");
    const legacy = recordRunObject({
      runId: run.id,
      path: "tmp/legacy.bin",
      purpose: "legacy",
      state: "working",
      retention: "keep",
    });
    await expect(
      promoteRunObject({
        runObjectId: legacy.id,
        mime: null as never,
        storageClass: "working",
      }),
    ).rejects.toThrow(/MIME/i);
    expect(fs.existsSync(legacySource)).toBeTrue();
  });
});
