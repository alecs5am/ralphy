import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import {
  addArtifactRevision,
  createArtifact,
} from "../../cli/lib/store/artifacts.js";
import {
  closeDomainDb,
  domainDbPath,
  openDomainDb,
} from "../../cli/lib/store/db.js";
import { createDocument, reviseDocument } from "../../cli/lib/store/documents.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import {
  createIteration,
  createProject,
  createWorkspace,
  upsertSocialAccount,
} from "../../cli/lib/store/scopes.js";
import {
  finishRun,
  recordRunResult,
  startRun,
} from "../../cli/lib/store/runs.js";
import { getRunAggregate as getRun } from "../helpers/run-aggregate.js";
import {
  endAgentSession,
  startAgentSession,
} from "../../cli/lib/store/sessions.js";
import {
  appendMetricSnapshot,
  cancelDraftPublication,
  createUnit,
  expirePublicationOperationClaim,
  claimPublication,
  claimPublicationCancellation,
  claimPublicationReconciliation,
  claimPublicationStatusLookup,
  finishPublicationCancellation,
  finishPublicationClaim,
  finishPublicationStatusLookup,
  getMetricTotals,
  listMetricSnapshots,
  recordPublication,
  requestPublicationReconciliation,
  reviseUnit,
  selectUnitRevision,
} from "../../cli/lib/store/units.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { scopedActivity } from "../helpers/activity.js";
import { getUnitAggregate as getUnit } from "../helpers/unit-aggregate.js";

let roots: TmpRoot[] = [];

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

describe("domain Unit store", () => {
  test("creates and selects an immutable text-only Unit revision", () => {
    roots.push(makeTmpRoot("ralphy-domain-units-create"));
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "article",
      name: "Article",
    });
    const document = createDocument({
      projectId: project.id,
      kind: "brief",
      slug: "body",
      title: "Body",
    });
    const body = reviseDocument({
      documentId: document.id,
      expectedCurrentRevisionId: null,
      format: "markdown",
      body: "# Body",
    });
    const unit = createUnit({
      projectId: project.id,
      slug: "article",
      format: "article",
    });
    const revision = reviseUnit({
      unitId: unit.id,
      expectedLatestRevisionId: null,
      items: [
        {
          documentRevisionId: body.id,
          role: "body",
          position: 0,
        },
      ],
    });

    selectUnitRevision({
      unitId: unit.id,
      revisionId: revision.id,
      expectedSelectedRevisionId: null,
    });

    expect(getUnit(unit.id)).toMatchObject({
      id: unit.id,
      workspaceId: workspace.id,
      projectId: project.id,
      latestRevisionId: revision.id,
      selectedRevisionId: revision.id,
      revisions: [
        {
          id: revision.id,
          sealedAt: expect.any(Number),
          items: [
            expect.objectContaining({
              documentRevisionId: body.id,
              artifactRevisionId: null,
              role: "body",
              position: 0,
            }),
          ],
        },
      ],
    });
  });

  test("requires canonical kebab slugs for Unit identity and format", () => {
    roots.push(makeTmpRoot("ralphy-domain-units-slugs"));
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "project",
      name: "Project",
    });
    for (const value of ["", "Bad", "bad_slug", "-bad", "bad-", "bad--slug", "has space"]) {
      expect(() =>
        createUnit({ projectId: project.id, slug: value, format: "video" }),
      ).toThrow(/slug/i);
      expect(() =>
        createUnit({ projectId: project.id, slug: "valid", format: value }),
      ).toThrow(/format/i);
    }
    const db = openDomainDb();
    expect(() =>
      db.prepare(
        `INSERT INTO units
         (id, workspace_id, project_id, slug, format, created_at, updated_at)
         VALUES ('unit_bad_slug', ?, ?, 'Bad', 'video', ?, ?)`,
      ).run(workspace.id, project.id, Date.now(), Date.now()),
    ).toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO units
         (id, workspace_id, project_id, slug, format, created_at, updated_at)
         VALUES ('unit_bad_format', ?, ?, 'valid', 'bad_format', ?, ?)`,
      ).run(workspace.id, project.id, Date.now(), Date.now()),
    ).toThrow();
  });

  test("round-trips repeated media and ordered platform presentation graphs", async () => {
    const { root, workspace, project } = setupProject("presentation-graph");
    const shared = await artifactRevision(
      root,
      workspace.id,
      null,
      "shared-video",
    );
    const pack = createUnit({
      projectId: project.id,
      slug: "pack",
      format: "sticker-pack",
    });
    const revision = reviseUnit({
      unitId: pack.id,
      expectedLatestRevisionId: null,
      items: Array.from({ length: 40 }, (_, position) => ({
        artifactRevisionId: shared.id,
        role: "sticker",
        position,
        config: { base: position },
      })),
      presentations: [
        {
          platform: "telegram",
          position: 0,
          captions: [
            { state: "draft", text: "First draft" },
            { state: "auto-draft-archived", text: "Archived draft" },
            { state: "humanized", text: "Human caption" },
          ],
          effectiveCaptionRevisionNo: 3,
          coverArtifactRevisionId: shared.id,
          crop: { mode: "contain" },
          safeArea: { bottom: 24 },
          options: { silent: true },
          items: [
            { unitItemPosition: 2, position: 0, config: { crop: "square" } },
            { unitItemPosition: 0, position: 1, config: { crop: "wide" } },
          ],
        },
        {
          platform: "instagram",
          position: 1,
          caption: "Instagram caption",
          options: {},
        },
        {
          platform: "youtube",
          position: 2,
          options: { visibility: "private" },
        },
      ],
    });

    const graph = getUnit(pack.id).revisions[0]!;
    expect(graph.items).toHaveLength(40);
    expect(new Set(graph.items.map((item) => item.artifactRevisionId))).toEqual(
      new Set([shared.id]),
    );
    expect(graph.presentations.map((presentation) => presentation.platform)).toEqual([
      "telegram",
      "instagram",
      "youtube",
    ]);
    expect(graph.presentations[0]!.captions).toHaveLength(3);
    expect(graph.presentations[0]!.captions.map((caption) => caption.id)).toContain(
      graph.presentations[0]!.effectiveCaptionRevisionId,
    );
    expect(graph.presentations[0]).toMatchObject({
      coverArtifactRevisionId: shared.id,
      crop: { mode: "contain" },
      safeArea: { bottom: 24 },
      options: { silent: true },
      captions: [
        expect.objectContaining({ revisionNo: 1, state: "draft", text: "First draft" }),
        expect.objectContaining({ revisionNo: 2, state: "auto-draft-archived" }),
        expect.objectContaining({ revisionNo: 3, state: "humanized", text: "Human caption" }),
      ],
      items: [
        expect.objectContaining({
          unitItemId: graph.items[2]!.id,
          position: 0,
          config: { crop: "square" },
        }),
        expect.objectContaining({
          unitItemId: graph.items[0]!.id,
          position: 1,
          config: { crop: "wide" },
        }),
      ],
    });
    expect(graph.presentations[1]!.captions).toEqual([
      expect.objectContaining({ revisionNo: 1, state: "draft", text: "Instagram caption" }),
    ]);
    expect(graph.presentations[1]!.items).toEqual([]);
    expect(graph.presentations[2]!.captions).toEqual([]);
    expect(revision.sealedAt).toEqual(expect.any(Number));
  });

  test("supports Workspace Units and keeps latest independent from manual selection", async () => {
    const { root, workspace, project } = setupProject("workspace-branch");
    const shared = await artifactRevision(
      root,
      workspace.id,
      null,
      "workspace-image",
    );
    const unit = createUnit({
      workspaceId: workspace.id,
      slug: "account-post",
      format: "post",
    });
    const v1 = reviseUnit({
      unitId: unit.id,
      expectedLatestRevisionId: null,
      items: [{ artifactRevisionId: shared.id, role: "primary", position: 0 }],
    });
    selectUnitRevision({
      unitId: unit.id,
      revisionId: v1.id,
      expectedSelectedRevisionId: null,
    });
    const v2 = reviseUnit({
      unitId: unit.id,
      expectedLatestRevisionId: v1.id,
      items: [{ artifactRevisionId: shared.id, role: "primary", position: 0 }],
    });
    const branch = reviseUnit({
      unitId: unit.id,
      expectedLatestRevisionId: v2.id,
      parentRevisionId: v1.id,
      items: [{ artifactRevisionId: shared.id, role: "primary", position: 0 }],
    });

    expect(branch).toMatchObject({ revisionNo: 3, parentRevisionId: v1.id });
    expect(getUnit(unit.id)).toMatchObject({
      workspaceId: workspace.id,
      projectId: null,
      latestRevisionId: branch.id,
      selectedRevisionId: v1.id,
    });
    expect(() =>
      reviseUnit({
        unitId: unit.id,
        expectedLatestRevisionId: v2.id,
        items: [{ artifactRevisionId: shared.id, role: "primary", position: 0 }],
      }),
    ).toThrow(/conflict/i);
    expect(() =>
      selectUnitRevision({
        unitId: unit.id,
        revisionId: branch.id,
        expectedSelectedRevisionId: null,
      }),
    ).toThrow(/conflict/i);

    const projectUnit = createUnit({
      projectId: project.id,
      slug: "project-post",
      format: "post",
    });
    expect(projectUnit.workspaceId).toBe(workspace.id);
  });

  test("validates Unit target, Iteration, and active Session scope atomically", async () => {
    const { root, workspace, project } = setupProject("scope");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const own = await artifactRevision(root, workspace.id, project.id, "own");
    const siblingRevision = await artifactRevision(
      root,
      workspace.id,
      sibling.id,
      "sibling",
    );
    const iteration = createIteration({ projectId: project.id, title: "Round" });
    const siblingIteration = createIteration({
      projectId: sibling.id,
      title: "Sibling round",
    });
    const workspaceSession = startAgentSession({
      workspaceId: workspace.id,
      agent: "workspace-agent",
    });
    const siblingSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: sibling.id,
      agent: "sibling-agent",
    });
    const endedSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "ended-agent",
    });
    endAgentSession(endedSession.id);
    const unit = createUnit({ projectId: project.id, slug: "unit", format: "video" });

    for (const input of [
      {
        iterationId: siblingIteration.id,
        authoredBySessionId: workspaceSession.id,
        artifactRevisionId: own.id,
      },
      {
        iterationId: iteration.id,
        authoredBySessionId: siblingSession.id,
        artifactRevisionId: own.id,
      },
      {
        iterationId: iteration.id,
        authoredBySessionId: endedSession.id,
        artifactRevisionId: own.id,
      },
      {
        iterationId: iteration.id,
        authoredBySessionId: workspaceSession.id,
        artifactRevisionId: siblingRevision.id,
      },
    ]) {
      expect(() =>
        reviseUnit({
          unitId: unit.id,
          expectedLatestRevisionId: null,
          iterationId: input.iterationId,
          authoredBySessionId: input.authoredBySessionId,
          items: [
            {
              artifactRevisionId: input.artifactRevisionId,
              role: "primary",
              position: 0,
            },
          ],
        }),
      ).toThrow(/Iteration|Session|scope/i);
    }
    const valid = reviseUnit({
      unitId: unit.id,
      expectedLatestRevisionId: null,
      iterationId: iteration.id,
      authoredBySessionId: workspaceSession.id,
      items: [{ artifactRevisionId: own.id, role: "primary", position: 0 }],
    });
    expect(valid.authoredBySessionId).toBe(workspaceSession.id);
    expect(openDomainDb().query("SELECT COUNT(*) AS count FROM unit_revisions").get()).toEqual({
      count: 1,
    });
  });

  test("accepts only a Workspace Session for Workspace Unit authorship", async () => {
    const { root, workspace, project } = setupProject("workspace-session");
    const shared = await artifactRevision(root, workspace.id, null, "shared");
    const workspaceSession = startAgentSession({
      workspaceId: workspace.id,
      agent: "workspace-agent",
    });
    const projectSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "project-agent",
    });
    const unit = createUnit({
      workspaceId: workspace.id,
      slug: "workspace-unit",
      format: "post",
    });
    expect(() =>
      reviseUnit({
        unitId: unit.id,
        expectedLatestRevisionId: null,
        authoredBySessionId: projectSession.id,
        items: [{ artifactRevisionId: shared.id, role: "primary", position: 0 }],
      }),
    ).toThrow(/Session/i);
    const revision = reviseUnit({
      unitId: unit.id,
      expectedLatestRevisionId: null,
      authoredBySessionId: workspaceSession.id,
      items: [{ artifactRevisionId: shared.id, role: "primary", position: 0 }],
    });
    expect(revision.authoredBySessionId).toBe(workspaceSession.id);
  });

  test("revalidates every Artifact item backing file inside the Unit transaction", async () => {
    const { root, workspace, project } = setupProject("backing-files");
    const cases = [
      {
        name: "missing",
        mutate(file: string) {
          fs.unlinkSync(file);
        },
      },
      {
        name: "symlink",
        mutate(file: string) {
          const target = path.join(root.dir, "symlink-target.bin");
          fs.writeFileSync(target, "target");
          fs.unlinkSync(file);
          fs.symlinkSync(target, file);
        },
      },
      {
        name: "directory",
        mutate(file: string) {
          fs.unlinkSync(file);
          fs.mkdirSync(file);
        },
      },
      {
        name: "empty",
        mutate(file: string) {
          fs.truncateSync(file, 0);
        },
      },
      {
        name: "size-mismatch",
        mutate(file: string) {
          fs.appendFileSync(file, "changed");
        },
      },
    ];

    for (const fixtureCase of cases) {
      const fixture = await artifactFixture(
        root,
        workspace.id,
        project.id,
        fixtureCase.name,
      );
      const objectPath = path.join(
        root.dir,
        ".ralphy",
        fixture.object.bucket,
        fixture.object.key,
      );
      fixtureCase.mutate(objectPath);
      const unit = createUnit({
        projectId: project.id,
        slug: `unit-${fixtureCase.name}`,
        format: "video",
      });
      expect(() =>
        reviseUnit({
          unitId: unit.id,
          expectedLatestRevisionId: null,
          items: [
            {
              artifactRevisionId: fixture.revision.id,
              role: "primary",
              position: 0,
            },
          ],
        }),
      ).toThrow(/Object bytes|regular file|empty|byte count/i);
      expect(getUnit(unit.id)).toMatchObject({
        latestRevisionId: null,
        revisions: [],
      });
    }
  });

  test("rejects a Unit item when Object metadata changes while it waits for the writer lock", async () => {
    const { root, workspace, project } = setupProject("backing-race");
    const fixture = await artifactFixture(
      root,
      workspace.id,
      project.id,
      "race-media",
    );
    const unit = createUnit({
      projectId: project.id,
      slug: "race-unit",
      format: "video",
    });
    const result = await runUnitRevisionAfterObjectMutation(root, fixture.object.id, {
      unitId: unit.id,
      expectedLatestRevisionId: null,
      items: [
        {
          artifactRevisionId: fixture.revision.id,
          role: "primary",
          position: 0,
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Object bytes are missing|Object key is invalid/i);
    expect(getUnit(unit.id)).toMatchObject({ latestRevisionId: null, revisions: [] });
  });

  test("persists sealed graph and pointer invariants with recursive triggers disabled", async () => {
    const { root, workspace, project } = setupProject("sql-guards");
    const media = await artifactRevision(root, workspace.id, project.id, "media");
    const firstUnit = createUnit({
      projectId: project.id,
      slug: "first",
      format: "video",
    });
    const firstRevision = reviseUnit({
      unitId: firstUnit.id,
      expectedLatestRevisionId: null,
      items: [{ artifactRevisionId: media.id, role: "primary", position: 0 }],
      presentations: [
        {
          platform: "tiktok",
          caption: "Caption",
          items: [{ unitItemPosition: 0, position: 0 }],
        },
      ],
    });
    const secondUnit = createUnit({
      projectId: project.id,
      slug: "second",
      format: "video",
    });
    const secondRevision = reviseUnit({
      unitId: secondUnit.id,
      expectedLatestRevisionId: null,
      items: [{ artifactRevisionId: media.id, role: "primary", position: 0 }],
    });
    const db = openDomainDb();
    db.exec("PRAGMA recursive_triggers = OFF");
    const item = db
      .query<Record<string, string | number | null>, [string]>(
        "SELECT * FROM unit_items WHERE unit_revision_id = ?",
      )
      .get(firstRevision.id)!;
    const presentation = db
      .query<Record<string, string | number | null>, [string]>(
        "SELECT * FROM unit_presentations WHERE unit_revision_id = ?",
      )
      .get(firstRevision.id)!;
    const caption = db
      .query<Record<string, string | number | null>, [string]>(
        "SELECT * FROM presentation_caption_revisions WHERE presentation_id = ?",
      )
      .get(String(presentation.id))!;
    const presentationItem = db
      .query<Record<string, string | number | null>, [string]>(
        "SELECT * FROM presentation_items WHERE presentation_id = ?",
      )
      .get(String(presentation.id))!;

    const mutations = [
      () => db.prepare("UPDATE units SET latest_revision_id = NULL WHERE id = ?").run(firstUnit.id),
      () =>
        db
          .prepare("UPDATE units SET latest_revision_id = ? WHERE id = ?")
          .run(secondRevision.id, firstUnit.id),
      () =>
        db
          .prepare("UPDATE units SET selected_revision_id = ? WHERE id = ?")
          .run(secondRevision.id, firstUnit.id),
      () => db.prepare("UPDATE unit_revisions SET note = 'changed' WHERE id = ?").run(firstRevision.id),
      () => db.prepare("DELETE FROM unit_revisions WHERE id = ?").run(firstRevision.id),
      () => db.prepare("UPDATE unit_items SET role = 'changed' WHERE id = ?").run(item.id),
      () => db.prepare("DELETE FROM unit_items WHERE id = ?").run(item.id),
      () =>
        db
          .prepare(
            `INSERT OR REPLACE INTO unit_items
             (id, unit_revision_id, artifact_revision_id, document_revision_id,
              role, position, config_json, created_at)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
          )
          .run(
            item.id,
            item.unit_revision_id,
            item.artifact_revision_id,
            item.role,
            item.position,
            item.config_json,
            item.created_at,
          ),
      () =>
        db
          .prepare("UPDATE unit_presentations SET options_json = '{}' WHERE id = ?")
          .run(presentation.id),
      () =>
        db
          .prepare("UPDATE unit_presentations SET effective_caption_revision_id = NULL WHERE id = ?")
          .run(presentation.id),
      () => db.prepare("UPDATE presentation_caption_revisions SET text = 'changed' WHERE id = ?").run(caption.id),
      () => db.prepare("DELETE FROM presentation_caption_revisions WHERE id = ?").run(caption.id),
      () => db.prepare("UPDATE presentation_items SET position = 1 WHERE id = ?").run(presentationItem.id),
      () => db.prepare("DELETE FROM presentation_items WHERE id = ?").run(presentationItem.id),
    ];
    for (const mutate of mutations) expect(mutate).toThrow();

    for (const [table, id] of [
      ["unit_revisions", firstRevision.id],
      ["unit_items", String(item.id)],
      ["unit_presentations", String(presentation.id)],
      ["presentation_caption_revisions", String(caption.id)],
      ["presentation_items", String(presentationItem.id)],
    ]) {
      expect(() =>
        db.prepare(`INSERT OR REPLACE INTO ${table} SELECT * FROM ${table} WHERE id = ?`).run(id),
      ).toThrow();
    }

    expect(() =>
      db.prepare(
        `INSERT INTO unit_revisions
         (id, unit_id, revision_no, parent_revision_id, created_at, sealed_at)
         VALUES ('urev_sql_presealed', ?, 2, ?, ?, ?)`,
      ).run(firstUnit.id, firstRevision.id, Date.now(), Date.now()),
    ).toThrow(/open|seal|graph/i);
    expect(() =>
      db.prepare(
        `INSERT INTO unit_revisions
         (id, unit_id, revision_no, parent_revision_id, created_at)
         VALUES ('urev_sql_parentless', ?, 2, NULL, ?)`,
      ).run(firstUnit.id, Date.now()),
    ).toThrow(/parent|topology/i);
    expect(() =>
      db.prepare(
        `INSERT INTO unit_revisions
         (id, unit_id, revision_no, parent_revision_id, created_at)
         VALUES ('urev_sql_gap', ?, 99, ?, ?)`,
      ).run(firstUnit.id, firstRevision.id, Date.now()),
    ).toThrow(/revision|sequence|topology/i);

    const draftId = "urev_sql_incomplete";
    db.prepare(
      `INSERT INTO unit_revisions
       (id, unit_id, revision_no, parent_revision_id, created_at)
       VALUES (?, ?, 2, ?, ?)`,
    ).run(draftId, firstUnit.id, firstRevision.id, Date.now());
    expect(() =>
      db.prepare("UPDATE unit_revisions SET sealed_at = ? WHERE id = ?").run(Date.now(), draftId),
    ).toThrow(/item|graph|contiguous|seal/i);
    expect(getUnit(firstUnit.id)).toMatchObject({
      latestRevisionId: firstRevision.id,
      selectedRevisionId: null,
    });
  });

  test("rejects a Unit whose Project does not belong to its stored Workspace", () => {
    roots.push(makeTmpRoot("ralphy-domain-units-sql-scope"));
    const first = createWorkspace({ slug: "first", name: "First" });
    const second = createWorkspace({ slug: "second", name: "Second" });
    const project = createProject({
      workspaceId: first.id,
      slug: "project",
      name: "Project",
    });
    expect(() =>
      openDomainDb()
        .prepare(
          `INSERT INTO units
           (id, workspace_id, project_id, slug, format, created_at, updated_at)
           VALUES ('unit_bad_scope', ?, ?, 'bad', 'post', ?, ?)`,
        )
        .run(second.id, project.id, Date.now(), Date.now()),
    ).toThrow(/Workspace|Project|scope/i);
  });

  test("guards Unit identity and canonical Presentation platforms in raw SQL", async () => {
    const { root, workspace, project } = setupProject("unit-sql-identity");
    const media = await artifactRevision(root, workspace.id, project.id, "media");
    const unit = createUnit({
      projectId: project.id,
      slug: "identity-unit",
      format: "video",
    });
    const db = openDomainDb();
    db.exec("PRAGMA recursive_triggers = OFF");
    expectSqlRejected(
      db,
      `DELETE FROM units WHERE id = '${unit.id}'`,
      /immutable|delete|Unit/i,
    );
    expectSqlRejected(
      db,
      `INSERT OR REPLACE INTO units
       SELECT * FROM units WHERE id = '${unit.id}'`,
      /identity|immutable|Unit/i,
    );
    expectSqlRejected(
      db,
      `INSERT OR REPLACE INTO units
       (id, workspace_id, project_id, slug, format, created_at, updated_at)
       VALUES ('unit_replace_logical', '${workspace.id}', '${project.id}',
               'identity-unit', 'video', ${Date.now()}, ${Date.now()})`,
      /identity|slug|conflict|Unit/i,
    );

    const now = Date.now();
    db.prepare(
      `INSERT INTO unit_revisions
       (id, unit_id, revision_no, parent_revision_id, created_at)
       VALUES ('urev_platform_guard', ?, 1, NULL, ?)`,
    ).run(unit.id, now);
    db.prepare(
      `INSERT INTO unit_items
       (id, unit_revision_id, artifact_revision_id, role, position, created_at)
       VALUES ('item_platform_guard', 'urev_platform_guard', ?, 'primary', 0, ?)`,
    ).run(media.id, now);
    for (const [id, platform] of [
      ["pres_platform_reels", "reels"],
      ["pres_platform_shorts", "shorts"],
      ["pres_platform_noncanonical", "YouTube_Shorts"],
    ]) {
      expect(() =>
        db
          .prepare(
            `INSERT INTO unit_presentations
             (id, unit_revision_id, platform, position, options_json, created_at)
             VALUES (?, 'urev_platform_guard', ?, 0, '{}', ?)`,
          )
          .run(id, platform, now),
      ).toThrow(/platform|CHECK|constraint/i);
    }
    db.prepare(
      "UPDATE unit_revisions SET sealed_at = ? WHERE id = 'urev_platform_guard'",
    ).run(now);
    expect(getUnit(unit.id).revisions[0]!.presentations).toEqual([]);
  });

  test("records immutable ordered Run result identities in the exact Run scope", async () => {
    const { root, workspace, project } = setupProject("run-results");
    const media = await artifactRevision(root, workspace.id, project.id, "media");
    const unit = createUnit({ projectId: project.id, slug: "unit", format: "video" });
    const revision = reviseUnit({
      unitId: unit.id,
      expectedLatestRevisionId: null,
      items: [{ artifactRevisionId: media.id, role: "primary", position: 0 }],
      presentations: [{ platform: "tiktok", caption: "Caption" }],
    });
    const presentation = getUnit(unit.id).revisions[0]!.presentations[0]!;
    const run = startRun({ projectId: project.id, kind: "unit-result" });
    const db = openDomainDb();
    const first = recordRunResult(db, {
      runId: run.id,
      position: 0,
      entityType: "unit_revision",
      entityId: revision.id,
    });
    const second = recordRunResult(db, {
      runId: run.id,
      position: 1,
      entityType: "unit_presentation",
      entityId: presentation.id,
    });
    expect([first, second].map((result) => result.position)).toEqual([0, 1]);

    const workspaceRun = startRun({ workspaceId: workspace.id, kind: "wrong-scope" });
    expect(() =>
      recordRunResult(db, {
        runId: workspaceRun.id,
        position: 0,
        entityType: "unit_revision",
        entityId: revision.id,
      }),
    ).toThrow(/scope/i);
    expect(() =>
      recordRunResult(db, {
        runId: run.id,
        position: 2,
        entityType: "unit_revision",
        entityId: "urev_missing",
      }),
    ).toThrow(/not found/i);

    db.exec("PRAGMA recursive_triggers = OFF");
    for (const mutate of [
      () => db.prepare("UPDATE run_results SET entity_id = 'changed' WHERE id = ?").run(first.id),
      () => db.prepare("DELETE FROM run_results WHERE id = ?").run(first.id),
      () =>
        db
          .prepare("INSERT OR REPLACE INTO run_results SELECT * FROM run_results WHERE id = ?")
          .run(first.id),
      () =>
        db
          .prepare(
            `INSERT OR REPLACE INTO run_results
             (id, run_id, position, entity_type, entity_id, created_at)
             VALUES ('result_replaced', ?, 1, 'unit_presentation', ?, ?)`,
          )
          .run(run.id, presentation.id, Date.now()),
    ]) {
      expect(mutate).toThrow();
    }
  });

  test("rejects unstable Run results from an open Unit graph", async () => {
    const { root, workspace, project } = setupProject("run-results-open");
    const media = await artifactRevision(root, workspace.id, project.id, "media");
    const unit = createUnit({ projectId: project.id, slug: "open", format: "video" });
    const db = openDomainDb();
    const now = Date.now();
    db.prepare(
      `INSERT INTO unit_revisions
       (id, unit_id, revision_no, parent_revision_id, created_at)
       VALUES ('urev_open_result', ?, 1, NULL, ?)`,
    ).run(unit.id, now);
    db.prepare(
      `INSERT INTO unit_items
       (id, unit_revision_id, artifact_revision_id, role, position, created_at)
       VALUES ('item_open_result', 'urev_open_result', ?, 'primary', 0, ?)`,
    ).run(media.id, now);
    const run = startRun({ projectId: project.id, kind: "unstable-result" });
    expect(() =>
      recordRunResult(db, {
        runId: run.id,
        position: 0,
        entityType: "unit_item",
        entityId: "item_open_result",
      }),
    ).toThrow(/stable|sealed|result/i);
    db.prepare("DELETE FROM unit_items WHERE id = 'item_open_result'").run();
    expect(
      db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM run_results").get(),
    ).toEqual({ count: 0 });
  });

  test("rejects Run results appended after their Run is terminal", async () => {
    const { root, workspace, project } = setupProject("run-results-terminal");
    const media = await artifactRevision(root, workspace.id, project.id, "media");
    const unit = createUnit({
      projectId: project.id,
      slug: "terminal-result",
      format: "video",
    });
    const revision = reviseUnit({
      unitId: unit.id,
      expectedLatestRevisionId: null,
      items: [{ artifactRevisionId: media.id, role: "primary", position: 0 }],
    });
    const run = startRun({ projectId: project.id, kind: "terminal-result" });
    finishRun(run.id, { state: "succeeded" });
    const db = openDomainDb();

    expect(() =>
      recordRunResult(db, {
        runId: run.id,
        position: 0,
        entityType: "unit_revision",
        entityId: revision.id,
      }),
    ).toThrow(/pending|running|terminal|Run result/i);
    expect(() =>
      db
        .prepare(
          `INSERT INTO run_results
           (id, run_id, position, entity_type, entity_id, created_at)
           VALUES ('result_late_sql', ?, 0, 'unit_revision', ?, ?)`,
        )
        .run(run.id, revision.id, Date.now()),
    ).toThrow(/pending|running|terminal|Run result/i);
  });

  test("records an idempotent Publication and finishes one exclusive submission claim", async () => {
    const { root, workspace, project } = setupProject("publication-submit");
    const media = await artifactRevision(root, workspace.id, project.id, "video");
    const unit = createUnit({ projectId: project.id, slug: "short", format: "video" });
    reviseUnit({
      unitId: unit.id,
      expectedLatestRevisionId: null,
      items: [{ artifactRevisionId: media.id, role: "primary", position: 0 }],
      presentations: [
        {
          platform: "tiktok",
          caption: "Publish me",
          options: { privacy: "public" },
        },
      ],
    });
    const presentation = getUnit(unit.id).revisions[0]!.presentations[0]!;
    const account = upsertSocialAccount({
      workspaceId: workspace.id,
      platform: "tiktok",
      externalId: "creator",
    });
    const run = startRun({ projectId: project.id, kind: "publication-submit" });
    const scheduledAt = Date.now() + 60_000;
    const publication = recordPublication({
      presentationId: presentation.id,
      socialAccountId: account.id,
      submissionRunId: run.id,
      rail: "postiz",
      idempotencyKey: "pub-1",
      scheduledAt,
    });
    expect(publication).toMatchObject({
      presentationId: presentation.id,
      effectiveCaptionRevisionId: presentation.effectiveCaptionRevisionId,
      effectiveOptions: { privacy: "public" },
      socialAccountId: account.id,
      submissionRunId: run.id,
      revisedFromPublicationId: null,
      rail: "postiz",
      state: "draft",
      scheduledAt,
    });
    expect(publicationOperational(publication.id).activeClaimRunId).toBeNull();
    expect(JSON.stringify(publication)).not.toContain("claimToken");
    expect(
      recordPublication({
        presentationId: presentation.id,
        socialAccountId: account.id,
        submissionRunId: run.id,
        rail: "postiz",
        idempotencyKey: "pub-1",
        scheduledAt: scheduledAt + 1000,
      }),
    ).toEqual(publication);

    const claim = claimPublication(publication.id, "draft", 60_000);
    const fence = { ...claim.fence };
    expect(claim.publication.state).toBe("submitting");
    expect(claim.fence).toMatchObject({
      kind: "submission",
      runId: run.id,
      epoch: 1,
      token: expect.any(String),
      expiresAt: expect.any(Number),
    });
    expect(() => claimPublication(publication.id, "draft", 60_000)).toThrow(/conflict|state|claim/i);
    expect(getRun(run.id)).toMatchObject({
      state: "running",
      attempts: [
        expect.objectContaining({
          attemptNo: 1,
          state: "running",
          provider: "postiz",
          request: expect.objectContaining({
            publicationId: publication.id,
            presentationId: presentation.id,
          }),
        }),
      ],
    });

    const finished = finishPublicationClaim(publication.id, {
      fence,
      state: "submitted",
      providerPublicationId: "postiz-123",
      url: "https://example.test/post/123",
      submittedAt: Date.now(),
      response: { accepted: true },
    });
    expect(finished).toMatchObject({
      state: "submitted",
      providerPublicationId: "postiz-123",
      url: "https://example.test/post/123",
    });
    expect(publicationOperational(publication.id).activeClaimRunId).toBeNull();
    expect(() =>
      finishPublicationClaim(publication.id, {
        fence,
        state: "published",
        publishedAt: Date.now(),
      }),
    ).toThrow(/stale|claim|fence/i);
    expect(getRun(run.id)).toMatchObject({
      state: "succeeded",
      attempts: [expect.objectContaining({ state: "succeeded" })],
    });
    expect(
      openDomainDb()
        .query<{ entityId: string }, [string]>(
          "SELECT entity_id AS entityId FROM run_results WHERE run_id = ?",
        )
        .all(run.id),
    ).toEqual([{ entityId: publication.id }]);
    expect(
      scopedActivity({ projectId: project.id,}).filter(
        (event) => event.entityId === publication.id,
      ).map((event) => event.action),
    ).toEqual([
      "publication.recorded",
      "publication.idempotent_skip",
      "publication.claimed",
      "publication.finished",
    ]);
    expect(getUnit(unit.id).revisions[0]!.presentations[0]!.publications).toEqual([
      expect.objectContaining(finished),
    ]);
  });

  test("validates Publication rails, dedicated Runs, revisions, and preflight failures", async () => {
    const { root, workspace, project } = setupProject("publication-rails");
    const media = await artifactRevision(root, workspace.id, project.id, "media");
    const unit = createUnit({ projectId: project.id, slug: "multi", format: "bundle" });
    reviseUnit({
      unitId: unit.id,
      expectedLatestRevisionId: null,
      items: [{ artifactRevisionId: media.id, role: "primary", position: 0 }],
      presentations: ["tiktok", "devto", "hashnode", "github-pages", "manual"].map(
        (platform, position) => ({ platform, position, caption: platform }),
      ),
    });
    const presentations = getUnit(unit.id).revisions[0]!.presentations;
    const byPlatform = new Map(
      presentations.map((presentation) => [presentation.platform, presentation]),
    );
    const accounts = new Map(
      ["tiktok", "devto", "hashnode"].map((platform) => [
        platform,
        upsertSocialAccount({
          workspaceId: workspace.id,
          platform,
          externalId: `${platform}-account`,
        }),
      ]),
    );

    const first = recordPublication({
      presentationId: byPlatform.get("tiktok")!.id,
      socialAccountId: accounts.get("tiktok")!.id,
      submissionRunId: startRun({ projectId: project.id, kind: "postiz" }).id,
      rail: "postiz",
      idempotencyKey: "postiz-first",
    });
    for (const rail of ["devto", "hashnode"] as const) {
      expect(
        recordPublication({
          presentationId: byPlatform.get(rail)!.id,
          socialAccountId: accounts.get(rail)!.id,
          submissionRunId: startRun({ projectId: project.id, kind: rail }).id,
          rail,
          idempotencyKey: `${rail}-first`,
        }).rail,
      ).toBe(rail);
    }
    for (const rail of ["github-pages", "manual"] as const) {
      expect(
        recordPublication({
          presentationId: byPlatform.get(rail)!.id,
          submissionRunId: startRun({ projectId: project.id, kind: rail }).id,
          rail,
          idempotencyKey: `${rail}-first`,
        }).socialAccountId,
      ).toBeNull();
    }

    const retry = recordPublication({
      presentationId: byPlatform.get("tiktok")!.id,
      socialAccountId: accounts.get("tiktok")!.id,
      submissionRunId: startRun({ projectId: project.id, kind: "postiz-retry" }).id,
      rail: "postiz",
      idempotencyKey: "postiz-retry",
      revisedFromPublicationId: first.id,
    });
    expect(retry.revisedFromPublicationId).toBe(first.id);

    const preflightRun = startRun({ projectId: project.id, kind: "preflight" });
    const preflight = recordPublication({
      presentationId: byPlatform.get("tiktok")!.id,
      submissionRunId: preflightRun.id,
      rail: "postiz",
      idempotencyKey: "postiz-account-missing",
      state: "failed",
      failureStage: "account-resolution",
      error: "No matching account",
    });
    expect(preflight).toMatchObject({
      state: "failed",
      socialAccountId: null,
    });
    expect(publicationOperational(preflight.id)).toMatchObject({
      error: "No matching account",
      failureStage: "account-resolution",
    });
    expect(getRun(preflightRun.id)).toMatchObject({ state: "failed", attempts: [] });
    expect(
      openDomainDb()
        .query<{ entityId: string }, [string]>(
          "SELECT entity_id AS entityId FROM run_results WHERE run_id = ?",
        )
        .get(preflightRun.id),
    ).toEqual({ entityId: preflight.id });

    const outsideWorkspace = createWorkspace({ slug: "outside-rails", name: "Outside" });
    const outsideProject = createProject({
      workspaceId: outsideWorkspace.id,
      slug: "outside",
      name: "Outside",
    });
    const outsideAccount = upsertSocialAccount({
      workspaceId: outsideWorkspace.id,
      platform: "tiktok",
      externalId: "outside",
    });
    const outsideMedia = await artifactRevision(
      root,
      outsideWorkspace.id,
      outsideProject.id,
      "outside-media",
    );
    const outsideUnit = createUnit({
      projectId: outsideProject.id,
      slug: "outside-unit",
      format: "post",
    });
    reviseUnit({
      unitId: outsideUnit.id,
      expectedLatestRevisionId: null,
      items: [{ artifactRevisionId: outsideMedia.id, role: "primary", position: 0 }],
      presentations: [{ platform: "manual" }],
    });
    const outsidePresentation = getUnit(outsideUnit.id).revisions[0]!.presentations[0]!;
    const outsidePublication = recordPublication({
      presentationId: outsidePresentation.id,
      submissionRunId: startRun({ projectId: outsideProject.id, kind: "outside" }).id,
      rail: "manual",
      idempotencyKey: "outside-publication",
    });
    const invalidCases = [
      () =>
        recordPublication({
          presentationId: byPlatform.get("tiktok")!.id,
          socialAccountId: accounts.get("devto")!.id,
          submissionRunId: startRun({ projectId: project.id, kind: "wrong-platform" }).id,
          rail: "postiz",
          idempotencyKey: "wrong-platform",
        }),
      () =>
        recordPublication({
          presentationId: byPlatform.get("tiktok")!.id,
          socialAccountId: outsideAccount.id,
          submissionRunId: startRun({ projectId: project.id, kind: "wrong-account" }).id,
          rail: "postiz",
          idempotencyKey: "wrong-account",
        }),
      () =>
        recordPublication({
          presentationId: byPlatform.get("manual")!.id,
          socialAccountId: accounts.get("tiktok")!.id,
          submissionRunId: startRun({ projectId: project.id, kind: "manual-account" }).id,
          rail: "manual",
          idempotencyKey: "manual-account",
        }),
      () =>
        recordPublication({
          presentationId: byPlatform.get("manual")!.id,
          submissionRunId: startRun({ projectId: outsideProject.id, kind: "wrong-run" }).id,
          rail: "manual",
          idempotencyKey: "wrong-run",
        }),
      () =>
        recordPublication({
          presentationId: byPlatform.get("manual")!.id,
          submissionRunId: startRun({ projectId: project.id, kind: "foreign-revision" }).id,
          rail: "manual",
          idempotencyKey: "foreign-revision",
          revisedFromPublicationId: outsidePublication.id,
        }),
      () =>
        recordPublication({
          presentationId: byPlatform.get("manual")!.id,
          submissionRunId: first.submissionRunId,
          rail: "manual",
          idempotencyKey: "reuse-run",
        }),
      () =>
        recordPublication({
          presentationId: byPlatform.get("manual")!.id,
          submissionRunId: first.submissionRunId,
          rail: "manual",
          idempotencyKey: "postiz-first",
        }),
    ];
    for (const invalid of invalidCases) {
      expect(invalid).toThrow(/account|platform|scope|Run|Workspace|idempotency|identity/i);
    }
  });

  test("rejects another Publication submission Run as follow-up work without mutation", async () => {
    const fixture = await publicationFixture("publication-cross-run");
    const secondRun = startRun({
      projectId: fixture.project.id,
      kind: "publication-submit-second",
    });
    const second = recordPublication({
      presentationId: fixture.presentation.id,
      socialAccountId: fixture.account.id,
      submissionRunId: secondRun.id,
      rail: "postiz",
      idempotencyKey: "publication-cross-run-second",
    });
    const submission = claimPublication(fixture.publication.id, "draft", 60_000);
    const scheduled = finishPublicationClaim(fixture.publication.id, {
      fence: { ...submission.fence },
      state: "scheduled",
      providerPublicationId: "cross-run-provider",
    });

    expect(() =>
      claimPublicationStatusLookup(
        scheduled.id,
        "scheduled",
        secondRun.id,
        60_000,
      ),
    ).toThrow(/submission Run|follow-up|Publication/i);
    const publications =
      getUnit(fixture.unit.id).revisions[0]!.presentations[0]!.publications;
    expect(publications.find((publication) => publication.id === scheduled.id)).toMatchObject({
      state: "scheduled",
      claimKind: null,
    });
    expect(publications.find((publication) => publication.id === second.id)).toMatchObject({
      state: "draft",
      claimKind: null,
    });
    expect(getRun(secondRun.id)).toMatchObject({ state: "pending", attempts: [] });
  });

  test("invalidates an expired submission and resolves it through a distinct reconciliation fence", async () => {
    const fixture = await publicationFixture("publication-reconcile");
    const claim = claimPublication(fixture.publication.id, "draft", 1);
    const staleFence = { ...claim.fence };
    await Bun.sleep(5);

    const uncertain = requestPublicationReconciliation(fixture.publication.id, {
      fence: staleFence,
      state: "reconciliation_required",
      error: "Provider response was not durably observed",
    });
    expect(uncertain).toMatchObject({
      state: "reconciliation_required",
    });
    expect(publicationOperational(uncertain.id)).toMatchObject({
      activeClaimRunId: null,
      claimEpoch: 2,
    });
    expect(getRun(fixture.run.id)).toMatchObject({
      state: "failed",
      attempts: [expect.objectContaining({ state: "failed" })],
    });
    expect(() =>
      finishPublicationClaim(fixture.publication.id, {
        fence: staleFence,
        state: "published",
        publishedAt: Date.now(),
      }),
    ).toThrow(/stale|claim|fence/i);

    const reconciliationRun = startRun({
      projectId: fixture.project.id,
      kind: "publication-reconciliation",
    });
    const reconciliation = claimPublicationReconciliation(
      fixture.publication.id,
      "reconciliation_required",
      reconciliationRun.id,
      60_000,
    );
    const reconciliationFence = { ...reconciliation.fence };
    expect(reconciliationFence).toMatchObject({
      kind: "reconciliation",
      runId: reconciliationRun.id,
      epoch: 3,
    });
    expect(getRun(reconciliationRun.id).attempts[0]).toMatchObject({
      state: "running",
      request: expect.objectContaining({ operation: "reconciliation" }),
    });
    const published = finishPublicationClaim(fixture.publication.id, {
      fence: reconciliationFence,
      operationState: "succeeded",
      state: "published",
      providerPublicationId: "provider-resolved",
      url: "https://example.test/resolved",
      publishedAt: Date.now(),
      response: { found: true },
    });
    expect(published.state).toBe("published");
    expect(getRun(reconciliationRun.id)).toMatchObject({
      state: "succeeded",
      attempts: [expect.objectContaining({ state: "succeeded" })],
    });

    const unknownFixture = await publicationFixture("publication-unknown");
    const unknownClaim = claimPublication(unknownFixture.publication.id, "draft", 1);
    const unknownFence = { ...unknownClaim.fence };
    await Bun.sleep(5);
    requestPublicationReconciliation(unknownFixture.publication.id, {
      fence: unknownFence,
      state: "unknown",
      error: "No provider lookup was available",
    });
    const unknownRun = startRun({
      projectId: unknownFixture.project.id,
      kind: "manual-reconciliation",
    });
    const unknownReconciliation = claimPublicationReconciliation(
      unknownFixture.publication.id,
      "unknown",
      unknownRun.id,
      60_000,
    );
    expect(unknownReconciliation.publication.state).toBe("reconciliation_required");
  });

  test("uses a distinct status-lookup fence and retains known state on provider failure", async () => {
    const fixture = await publicationFixture("publication-status-failure");
    const submit = claimPublication(fixture.publication.id, "draft", 60_000);
    const scheduled = finishPublicationClaim(fixture.publication.id, {
      fence: { ...submit.fence },
      state: "scheduled",
      providerPublicationId: "scheduled-provider-id",
    });
    const statusRun = startRun({
      projectId: fixture.project.id,
      kind: "publication-status-lookup",
    });
    const status = claimPublicationStatusLookup(
      scheduled.id,
      "scheduled",
      statusRun.id,
      60_000,
    );
    const statusFence = { ...status.fence };
    expect(statusFence.kind).toBe("status-lookup");
    expect(status.publication).toMatchObject({
      state: "scheduled",
    });
    expect(publicationOperational(status.publication.id)).toMatchObject({
      claimKind: "status-lookup",
      activeClaimRunId: statusRun.id,
    });
    expect(getRun(statusRun.id).attempts[0]?.request).toMatchObject({
      operation: "status-lookup",
    });
    const retained = finishPublicationStatusLookup(scheduled.id, {
      fence: statusFence,
      operationState: "failed",
      state: "scheduled",
      error: "Provider timed out",
    });
    expect(retained).toMatchObject({ state: "scheduled" });
    expect(publicationOperational(retained.id).claimKind).toBeNull();
    expect(getRun(statusRun.id)).toMatchObject({
      state: "failed",
      attempts: [expect.objectContaining({ state: "failed" })],
    });
  });

  test("lets a successful lookup prove failure while its operation Run succeeds", async () => {
    const fixture = await publicationFixture("publication-status-failed");
    const submission = claimPublication(fixture.publication.id, "draft", 60_000);
    const submitted = finishPublicationClaim(fixture.publication.id, {
      fence: { ...submission.fence },
      state: "submitted",
      submittedAt: Date.now(),
      providerPublicationId: "status-failed-provider-id",
    });
    const lookupRun = startRun({
      projectId: fixture.project.id,
      kind: "publication-status-lookup",
    });
    const lookup = claimPublicationStatusLookup(
      submitted.id,
      "submitted",
      lookupRun.id,
      60_000,
    );
    const failed = finishPublicationStatusLookup(submitted.id, {
      fence: { ...lookup.fence },
      operationState: "succeeded",
      state: "failed",
      error: "Provider reports a rejected post",
      failureStage: "provider-status",
      response: { providerState: "failed" },
    });
    expect(failed.state).toBe("failed");
    expect(getRun(lookupRun.id)).toMatchObject({
      state: "succeeded",
      attempts: [expect.objectContaining({ state: "succeeded" })],
    });
  });

  test("uses a distinct cancellation fence for scheduled and submitted Publications", async () => {
    for (const initialState of ["scheduled", "submitted"] as const) {
      const fixture = await publicationFixture(`publication-cancel-${initialState}`);
      const submission = claimPublication(fixture.publication.id, "draft", 60_000);
      const publication = finishPublicationClaim(fixture.publication.id, {
        fence: { ...submission.fence },
        state: initialState,
        ...(initialState === "submitted" ? { submittedAt: Date.now() } : {}),
        providerPublicationId: `${initialState}-provider-id`,
      });
      const cancellationRun = startRun({
        projectId: fixture.project.id,
        kind: "publication-cancellation",
      });
      const cancellation = claimPublicationCancellation(
        publication.id,
        initialState,
        cancellationRun.id,
        60_000,
      );
      expect(cancellation.fence.kind).toBe("cancellation");
      expect(cancellation.publication).toMatchObject({
        state: initialState,
      });
      expect(publicationOperational(cancellation.publication.id)).toMatchObject({
        claimKind: "cancellation",
        activeClaimRunId: cancellationRun.id,
      });
      expect(getRun(cancellationRun.id).attempts[0]?.request).toMatchObject({
        operation: "cancellation",
      });
      expect(
        finishPublicationCancellation(publication.id, {
          fence: { ...cancellation.fence },
          operationState: "succeeded",
          state: "cancelled",
          response: { cancelled: true },
        }).state,
      ).toBe("cancelled");
      expect(getRun(cancellationRun.id).state).toBe("succeeded");
    }
  });

  test("moves an uncertain cancellation to reconciliation with a failed operation Run", async () => {
    const fixture = await publicationFixture("publication-cancel-uncertain");
    const submission = claimPublication(fixture.publication.id, "draft", 60_000);
    const scheduled = finishPublicationClaim(fixture.publication.id, {
      fence: { ...submission.fence },
      state: "scheduled",
      providerPublicationId: "uncertain-provider-id",
    });
    const cancellationRun = startRun({
      projectId: fixture.project.id,
      kind: "publication-cancellation",
    });
    const cancellation = claimPublicationCancellation(
      scheduled.id,
      "scheduled",
      cancellationRun.id,
      60_000,
    );
    const uncertain = finishPublicationCancellation(scheduled.id, {
      fence: { ...cancellation.fence },
      operationState: "failed",
      state: "reconciliation_required",
      error: "Cancellation response was not observed",
    });
    expect(uncertain.state).toBe("reconciliation_required");
    expect(getRun(cancellationRun.id)).toMatchObject({
      state: "failed",
      attempts: [expect.objectContaining({ state: "failed" })],
    });
  });

  test("recovers expired follow-up claims atomically without their secret token", async () => {
    const liveFixture = await publicationFixture("publication-live-invalidation");
    const liveSubmit = claimPublication(liveFixture.publication.id, "draft", 60_000);
    const liveScheduled = finishPublicationClaim(liveFixture.publication.id, {
      fence: { ...liveSubmit.fence },
      state: "scheduled",
      providerPublicationId: "live-invalidation-provider",
    });
    const liveRun = startRun({
      projectId: liveFixture.project.id,
      kind: "publication-status-live",
    });
    const liveClaim = claimPublicationStatusLookup(
      liveScheduled.id,
      "scheduled",
      liveRun.id,
      60_000,
    );
    const db = openDomainDb();
    expectSqlRejected(
      db,
      `UPDATE publications
       SET active_claim_run_id = NULL, claim_kind = NULL,
           claim_epoch = claim_epoch + 1, claim_token = NULL,
           claim_expires_at = NULL, updated_at = ${Date.now()}
       WHERE id = '${liveScheduled.id}'`,
      /fence|transition|expiry/i,
    );
    expect(publicationOperational(liveClaim.publication.id).claimKind).toBe(
      "status-lookup",
    );

    const statusFixture = await publicationFixture("publication-expired-status");
    const statusSubmit = claimPublication(statusFixture.publication.id, "draft", 60_000);
    const statusScheduled = finishPublicationClaim(statusFixture.publication.id, {
      fence: { ...statusSubmit.fence },
      state: "scheduled",
      providerPublicationId: "expired-status-provider",
    });
    const statusRun = startRun({
      projectId: statusFixture.project.id,
      kind: "publication-status-expired",
    });
    const statusClaim = claimPublicationStatusLookup(
      statusScheduled.id,
      "scheduled",
      statusRun.id,
      1,
    );
    const staleStatusFence = { ...statusClaim.fence };
    await Bun.sleep(5);
    expectSqlRejected(
      openDomainDb(),
      `UPDATE publications
       SET active_claim_run_id = NULL, claim_kind = NULL,
           claim_token = NULL, claim_expires_at = NULL, updated_at = ${Date.now()}
       WHERE id = '${statusScheduled.id}'`,
      /expired|expiry|fence|transition/i,
    );
    const recoveredStatus = expirePublicationOperationClaim(statusScheduled.id, {
      expectedKind: "status-lookup",
      expectedEpoch: staleStatusFence.epoch,
      expectedState: "scheduled",
      error: "Status lookup lease expired",
    });
    expect(recoveredStatus).toMatchObject({
      state: "scheduled",
    });
    expect(publicationOperational(recoveredStatus.id)).toMatchObject({
      claimKind: null,
      claimEpoch: staleStatusFence.epoch + 1,
    });
    expect(getRun(statusRun.id)).toMatchObject({
      state: "failed",
      attempts: [expect.objectContaining({ state: "failed" })],
    });
    expect(() =>
      finishPublicationStatusLookup(statusScheduled.id, {
        fence: staleStatusFence,
        operationState: "succeeded",
        state: "scheduled",
      }),
    ).toThrow(/stale|claim|fence/i);

    const cancellationFixture = await publicationFixture(
      "publication-expired-cancellation",
    );
    const cancellationSubmit = claimPublication(
      cancellationFixture.publication.id,
      "draft",
      60_000,
    );
    const cancellationScheduled = finishPublicationClaim(
      cancellationFixture.publication.id,
      {
        fence: { ...cancellationSubmit.fence },
        state: "scheduled",
        providerPublicationId: "expired-cancellation-provider",
      },
    );
    const cancellationRun = startRun({
      projectId: cancellationFixture.project.id,
      kind: "publication-cancellation-expired",
    });
    const cancellationClaim = claimPublicationCancellation(
      cancellationScheduled.id,
      "scheduled",
      cancellationRun.id,
      1,
    );
    await Bun.sleep(5);
    expect(
      expirePublicationOperationClaim(cancellationScheduled.id, {
        expectedKind: "cancellation",
        expectedEpoch: cancellationClaim.fence.epoch,
        expectedState: "scheduled",
        nextState: "reconciliation_required",
        error: "Cancellation lease expired",
      }).state,
    ).toBe("reconciliation_required");
    expect(getRun(cancellationRun.id).state).toBe("failed");

    const reconciliationFixture = await publicationFixture(
      "publication-expired-reconciliation",
    );
    const originalClaim = claimPublication(
      reconciliationFixture.publication.id,
      "draft",
      1,
    );
    await Bun.sleep(5);
    requestPublicationReconciliation(reconciliationFixture.publication.id, {
      fence: { ...originalClaim.fence },
      state: "unknown",
      error: "Submission response was lost",
    });
    const reconciliationRun = startRun({
      projectId: reconciliationFixture.project.id,
      kind: "publication-reconciliation-expired",
    });
    const reconciliationClaim = claimPublicationReconciliation(
      reconciliationFixture.publication.id,
      "unknown",
      reconciliationRun.id,
      1,
    );
    await Bun.sleep(5);
    expect(
      expirePublicationOperationClaim(reconciliationFixture.publication.id, {
        expectedKind: "reconciliation",
        expectedEpoch: reconciliationClaim.fence.epoch,
        expectedState: "reconciliation_required",
        nextState: "unknown",
        error: "Reconciliation lease expired",
      }).state,
    ).toBe("unknown");
    expect(getRun(reconciliationRun.id).state).toBe("failed");
  });

  test("cancels a draft locally without a provider cancellation Run", async () => {
    const fixture = await publicationFixture("publication-cancel-draft");
    expect(cancelDraftPublication(fixture.publication.id, "draft").state).toBe(
      "cancelled",
    );
    expect(getRun(fixture.run.id)).toMatchObject({
      state: "cancelled",
      attempts: [],
    });
    expect(() =>
      cancelDraftPublication(fixture.publication.id, "draft"),
    ).toThrow(/state|conflict/i);
  });

  test("validates Publication URLs, canonical inserts, and timestamp timelines", async () => {
    const urlFixture = await publicationFixture("publication-url-validation");
    const urlClaim = claimPublication(urlFixture.publication.id, "draft", 60_000);
    for (const invalidUrl of [
      "file:///tmp/post",
      "data:text/plain,post",
      "javascript:alert(1)",
      "ftp://example.test/post",
      "https://user:password@example.test/post",
      "http://user@example.test/post",
      `https://example.test/${"x".repeat(2_048)}`,
    ]) {
      expect(() =>
        finishPublicationClaim(urlFixture.publication.id, {
          fence: { ...urlClaim.fence },
          state: "scheduled",
          url: invalidUrl,
        }),
      ).toThrow(/URL|http|credential|length/i);
    }
    expect(
      finishPublicationClaim(urlFixture.publication.id, {
        fence: { ...urlClaim.fence },
        state: "scheduled",
        url: "https://www.tiktok.com/@creator/video/123",
      }).url,
    ).toBe("https://www.tiktok.com/@creator/video/123");

    const timelineFixture = await publicationFixture("publication-timeline");
    const timelineRun = startRun({
      projectId: timelineFixture.project.id,
      kind: "publication-timeline-submit",
    });
    const scheduledAt = Date.now() + 1_000;
    const timelinePublication = recordPublication({
      presentationId: timelineFixture.presentation.id,
      socialAccountId: timelineFixture.account.id,
      submissionRunId: timelineRun.id,
      rail: "postiz",
      idempotencyKey: "publication-timeline-attempt",
      scheduledAt,
    });
    const timelineClaim = claimPublication(
      timelinePublication.id,
      "draft",
      60_000,
    );
    expect(() =>
      finishPublicationClaim(timelinePublication.id, {
        fence: { ...timelineClaim.fence },
        state: "published",
        publishedAt: scheduledAt - 1,
      }),
    ).toThrow(/publishedAt|scheduledAt|timeline/i);
    expect(() =>
      finishPublicationClaim(timelinePublication.id, {
        fence: { ...timelineClaim.fence },
        state: "published",
        submittedAt: scheduledAt + 200,
        publishedAt: scheduledAt + 100,
      }),
    ).toThrow(/publishedAt|submittedAt|timeline/i);

    const db = openDomainDb();
    expectSqlRejected(
      db,
      `UPDATE publications
       SET state = 'scheduled', url = 'http://', active_claim_run_id = NULL,
           claim_kind = NULL, claim_token = NULL, claim_expires_at = NULL,
           updated_at = ${Date.now()}
       WHERE id = '${timelinePublication.id}'`,
      /URL|CHECK|constraint|authority|host/i,
    );
    const rawRun = startRun({
      projectId: timelineFixture.project.id,
      kind: "publication-invalid-insert",
    });
    const rawNow = Date.now();
    expect(() =>
      db
        .prepare(
          `INSERT INTO publications
           (id, presentation_id, effective_caption_revision_id,
            effective_options_json, social_account_id, submission_run_id,
            rail, provider_publication_id, state, idempotency_key, claim_epoch,
            created_at, updated_at)
           VALUES ('pub_invalid_draft_shape', ?, ?, ?, ?, ?, 'postiz',
                   'provider-too-early', 'draft', 'invalid-draft-shape', 0, ?, ?)`,
        )
        .run(
          timelineFixture.presentation.id,
          timelineFixture.presentation.effectiveCaptionRevisionId,
          JSON.stringify(timelineFixture.presentation.options),
          timelineFixture.account.id,
          rawRun.id,
          rawNow,
          rawNow,
        ),
    ).toThrow(/Publication|draft|provider|scope/i);
    const preflightRun = startRun({
      projectId: timelineFixture.project.id,
      kind: "publication-invalid-preflight",
    });
    expect(() =>
      db
        .prepare(
          `INSERT INTO publications
           (id, presentation_id, effective_caption_revision_id,
            effective_options_json, social_account_id, submission_run_id,
            rail, state, url, error, failure_stage, idempotency_key, claim_epoch,
            created_at, updated_at)
           VALUES ('pub_invalid_preflight_shape', ?, ?, ?, NULL, ?, 'postiz',
                   'failed', 'file:///tmp/post', 'Missing account',
                   'account-resolution', 'invalid-preflight-shape', 0, ?, ?)`,
        )
        .run(
          timelineFixture.presentation.id,
          timelineFixture.presentation.effectiveCaptionRevisionId,
          JSON.stringify(timelineFixture.presentation.options),
          preflightRun.id,
          rawNow,
          rawNow,
        ),
    ).toThrow(/Publication|failed|URL|scope/i);
    expectSqlRejected(
      db,
      `UPDATE publications
       SET state = 'published', submitted_at = ${scheduledAt + 200},
           published_at = ${scheduledAt + 100}, active_claim_run_id = NULL,
           claim_kind = NULL, claim_token = NULL, claim_expires_at = NULL,
           updated_at = ${Date.now()}
       WHERE id = '${timelinePublication.id}'`,
      /timeline|timestamp|published|fence|transition/i,
    );
    expect(
      finishPublicationClaim(timelinePublication.id, {
        fence: { ...timelineClaim.fence },
        state: "published",
        submittedAt: scheduledAt,
        publishedAt: scheduledAt + 100,
        url: "https://example.test/post/ok",
      }).state,
    ).toBe("published");
  });

  test("persists Publication identity and fenced transition guards with recursive triggers disabled", async () => {
    const fixture = await publicationFixture("publication-sql-guards");
    const updatedAccount = upsertSocialAccount({
      workspaceId: fixture.workspace.id,
      platform: "tiktok",
      externalId: "publication-sql-guards-account",
      displayName: "Updated account name",
      config: { profile: "safe" },
    });
    expect(updatedAccount).toMatchObject({
      id: fixture.account.id,
      displayName: "Updated account name",
    });
    const draftRun = startRun({
      projectId: fixture.project.id,
      kind: "publication-draft",
    });
    const draftPublication = recordPublication({
      presentationId: fixture.presentation.id,
      socialAccountId: fixture.account.id,
      submissionRunId: draftRun.id,
      rail: "postiz",
      idempotencyKey: "publication-sql-draft",
    });
    const claim = claimPublication(fixture.publication.id, "draft", 60_000);
    const submitted = finishPublicationClaim(fixture.publication.id, {
      fence: { ...claim.fence },
      state: "submitted",
      submittedAt: Date.now(),
      providerPublicationId: "provider-locked",
      url: "https://example.test/locked",
    });
    const db = openDomainDb();
    db.exec("PRAGMA recursive_triggers = OFF");
    const rawClaimAt = Date.now();
    expectSqlRejected(
      db,
      `UPDATE publications
       SET active_claim_run_id = '${draftRun.id}', claim_kind = 'status-lookup',
           claim_epoch = claim_epoch + 1, claim_token = 'raw-cross-run-token',
           claim_expires_at = ${rawClaimAt + 60_000}, updated_at = ${rawClaimAt}
       WHERE id = '${submitted.id}'`,
      /Run|claim|fence/i,
    );
    const lookupRun = startRun({
      projectId: fixture.project.id,
      kind: "publication-status-lookup",
    });
    const lookup = claimPublicationStatusLookup(
      submitted.id,
      "submitted",
      lookupRun.id,
      60_000,
    );
    expect(lookup.publication).toMatchObject({
      state: "submitted",
    });
    expect(publicationOperational(lookup.publication.id)).toMatchObject({
      claimKind: "status-lookup",
      activeClaimRunId: lookupRun.id,
    });
    const cancellationSubmission = startRun({
      projectId: fixture.project.id,
      kind: "publication-submit-for-cancellation-guard",
    });
    const cancellationPublication = recordPublication({
      presentationId: fixture.presentation.id,
      socialAccountId: fixture.account.id,
      submissionRunId: cancellationSubmission.id,
      rail: "postiz",
      idempotencyKey: "publication-sql-cancellation-guard",
    });
    const cancellationSubmissionClaim = claimPublication(
      cancellationPublication.id,
      "draft",
      60_000,
    );
    const cancellationScheduled = finishPublicationClaim(
      cancellationPublication.id,
      {
        fence: { ...cancellationSubmissionClaim.fence },
        state: "scheduled",
        providerPublicationId: "cancellation-guard-provider",
      },
    );
    const cancellationRun = startRun({
      projectId: fixture.project.id,
      kind: "publication-cancellation-guard",
    });
    const cancellation = claimPublicationCancellation(
      cancellationScheduled.id,
      "scheduled",
      cancellationRun.id,
      60_000,
    );
    expect(publicationOperational(cancellation.publication.id).claimKind).toBe(
      "cancellation",
    );
    const mutations = [
      () => db.prepare("DELETE FROM publications WHERE id = ?").run(submitted.id),
      () =>
        db
          .prepare("INSERT OR REPLACE INTO publications SELECT * FROM publications WHERE id = ?")
          .run(submitted.id),
      () => db.prepare("UPDATE publications SET presentation_id = 'pres_missing' WHERE id = ?").run(submitted.id),
      () => db.prepare("UPDATE publications SET effective_options_json = '{}' WHERE id = ?").run(submitted.id),
      () => db.prepare("UPDATE publications SET social_account_id = NULL WHERE id = ?").run(submitted.id),
      () => db.prepare("UPDATE publications SET submission_run_id = ? WHERE id = ?").run(draftRun.id, submitted.id),
      () => db.prepare("UPDATE publications SET rail = 'manual' WHERE id = ?").run(submitted.id),
      () => db.prepare("UPDATE publications SET idempotency_key = 'changed' WHERE id = ?").run(submitted.id),
      () => db.prepare("UPDATE publications SET scheduled_at = ? WHERE id = ?").run(Date.now() + 100_000, submitted.id),
      () => db.prepare("UPDATE publications SET state = 'scheduled' WHERE id = ?").run(submitted.id),
      () => db.prepare("UPDATE publications SET state = 'published', published_at = ? WHERE id = ?").run(Date.now(), submitted.id),
      () => db.prepare("UPDATE publications SET provider_publication_id = 'changed' WHERE id = ?").run(submitted.id),
      () => db.prepare("UPDATE publications SET url = NULL WHERE id = ?").run(submitted.id),
      () => db.prepare("UPDATE publications SET submitted_at = ? WHERE id = ?").run(Date.now() + 1, submitted.id),
      () => db.prepare("UPDATE publications SET state = 'failed', error = 'direct' WHERE id = ?").run(draftPublication.id),
      () => db.prepare("UPDATE publications SET state = 'cancelled' WHERE id = ?").run(submitted.id),
      () => db.prepare("UPDATE publications SET claim_kind = 'reconciliation' WHERE id = ?").run(submitted.id),
      () => db.prepare("UPDATE publications SET claim_kind = 'not-a-kind' WHERE id = ?").run(submitted.id),
      () =>
        db
          .prepare("UPDATE publications SET active_claim_run_id = submission_run_id WHERE id = ?")
          .run(submitted.id),
      () => db.prepare("UPDATE publications SET claim_epoch = claim_epoch + 1 WHERE id = ?").run(submitted.id),
      () =>
        db
          .prepare(
            `UPDATE publications
             SET state = 'submitted', submitted_at = ?,
                 active_claim_run_id = NULL, claim_kind = NULL,
                 claim_token = NULL, claim_expires_at = NULL, updated_at = ?
             WHERE id = ?`,
          )
          .run(Date.now(), Date.now(), cancellationScheduled.id),
      () =>
        db
          .prepare("UPDATE social_accounts SET external_id = 'changed' WHERE id = ?")
          .run(fixture.account.id),
      () =>
        db
          .prepare("UPDATE social_accounts SET platform = 'youtube' WHERE id = ?")
          .run(fixture.account.id),
      () => db.prepare("DELETE FROM social_accounts WHERE id = ?").run(fixture.account.id),
      () =>
        db
          .prepare(
            "INSERT OR REPLACE INTO social_accounts SELECT * FROM social_accounts WHERE id = ?",
          )
          .run(fixture.account.id),
    ];
    for (const mutate of mutations) expect(mutate).toThrow();
  });

  test("appends ordered Metric snapshots without collapsing unknown values into zero", async () => {
    const fixture = await publicationFixture("metric-history");
    const run = startRun({ projectId: fixture.project.id, kind: "metric-refresh" });
    const unknown = appendMetricSnapshot({
      publicationId: fixture.publication.id,
      runId: run.id,
      position: 0,
      source: "postiz",
      asOf: 100,
      windowStart: 10,
      windowEnd: 90,
      raw: { providerViews: "unavailable", extra: { reach: 12 } },
      note: "Initial provider sample",
    });
    const measuredZero = appendMetricSnapshot({
      publicationId: fixture.publication.id,
      runId: run.id,
      position: 1,
      source: "postiz",
      asOf: 200,
      windowStart: 10,
      windowEnd: 90,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      watchTimeMs: 0,
      ctr: 0,
      avgViewDurationSec: 0,
      retentionCurve: [{ pct: 0, watchRatio: 1, providerPoint: "kept" }],
      raw: { providerViews: 0, providerOnly: true },
    });

    expect(unknown).toMatchObject({
      source: "postiz",
      views: null,
      ctr: null,
      retentionCurve: null,
      avgViewDurationSec: null,
    });
    expect(metricRaw(unknown.id)).toEqual({
      extra: { reach: 12 },
      providerViews: "unavailable",
    });
    expect(measuredZero).toMatchObject({
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      watchTimeMs: 0,
      ctr: 0,
      avgViewDurationSec: 0,
      retentionCurve: [{ pct: 0, providerPoint: "kept", watchRatio: 1 }],
    });
    expect(
      listMetricSnapshots({
        context: { workspaceId: fixture.workspace.id, projectId: fixture.project.id },
        publicationId: fixture.publication.id,
        source: "postiz",
        asOf: 150,
        windowStart: 10,
        windowEnd: 90,
        limit: 10,
      }).items,
    ).toEqual([unknown]);
    expect(
      openDomainDb()
        .query<{ entityId: string }, [string]>(
          "SELECT entity_id AS entityId FROM run_results WHERE run_id = ? ORDER BY position",
        )
        .all(run.id),
    ).toEqual([{ entityId: unknown.id }, { entityId: measuredZero.id }]);
  });

  test("rejects malformed Metric values and protects snapshots with recursive triggers disabled", async () => {
    const fixture = await publicationFixture("metric-validation");
    const run = startRun({ projectId: fixture.project.id, kind: "metric-refresh" });
    const invalid: Array<Record<string, unknown>> = [
      { source: "" },
      { source: "Bad_Source" },
      { asOf: -1 },
      { asOf: 1.5 },
      { windowStart: 10 },
      { windowStart: 20, windowEnd: 10 },
      { views: -1 },
      { likes: 0.5 },
      { comments: Number.POSITIVE_INFINITY },
      { shares: Number.NaN },
      { watchTimeMs: -1 },
      { ctr: -0.1 },
      { ctr: Number.POSITIVE_INFINITY },
      { avgViewDurationSec: -0.1 },
      { retentionCurve: "not-an-array" },
      { retentionCurve: [{ pct: 101, watchRatio: 1 }] },
      { retentionCurve: [{ pct: 50, watchRatio: -0.1 }] },
      { raw: { providerValue: Number.POSITIVE_INFINITY } },
    ];
    invalid.forEach((override, position) => {
      expect(() =>
        appendMetricSnapshot({
          publicationId: fixture.publication.id,
          runId: run.id,
          position,
          source: "postiz",
          asOf: 100,
          ...override,
        }),
      ).toThrow();
    });

    const snapshot = appendMetricSnapshot({
      publicationId: fixture.publication.id,
      runId: run.id,
      position: invalid.length,
      source: "postiz",
      asOf: 100,
      views: 0,
      raw: { providerValue: "NaN", providerOnly: 7 },
    });
    const db = openDomainDb();
    db.exec("PRAGMA recursive_triggers = OFF");
    for (const mutate of [
      () => db.prepare("UPDATE metric_snapshots SET views = 1 WHERE id = ?").run(snapshot.id),
      () => db.prepare("DELETE FROM metric_snapshots WHERE id = ?").run(snapshot.id),
      () =>
        db
          .prepare("INSERT OR REPLACE INTO metric_snapshots SELECT * FROM metric_snapshots WHERE id = ?")
          .run(snapshot.id),
    ]) {
      expect(mutate).toThrow();
    }

    const insert = db.prepare(
      `INSERT INTO metric_snapshots
       (id, publication_id, source, as_of, window_start, window_end, views, ctr,
        retention_curve_json, raw_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const directInvalid: Array<[string, unknown, unknown, unknown, unknown, unknown, unknown, unknown]> = [
      ["Bad_Source", 100, null, null, 1, 0.1, null, "{}"],
      ["postiz", 1.5, null, null, 1, 0.1, null, "{}"],
      ["postiz", 100, 10, null, 1, 0.1, null, "{}"],
      ["postiz", 100, 20, 10, 1, 0.1, null, "{}"],
      ["postiz", 100, null, null, 1.5, 0.1, null, "{}"],
      ["postiz", 100, null, null, 1, Number.POSITIVE_INFINITY, null, "{}"],
      ["postiz", 100, null, null, 1, 0.1, '[{"pct":101}]', "{}"],
      ["postiz", 100, null, null, 1, 0.1, null, "{"],
      ["postiz", 100, null, null, 1, 0.1, null, '{"value":1e999}'],
    ];
    directInvalid.forEach((values, index) => {
      expect(() =>
        insert.run(
          `metric_invalid_${index}`,
          fixture.publication.id,
          ...values,
          100,
        ),
      ).toThrow();
    });
  });

  test("totals choose one deterministic filtered winner per Publication", async () => {
    const fixture = await publicationFixture("metric-totals");
    const secondSubmission = startRun({
      projectId: fixture.project.id,
      kind: "publication-submit",
    });
    const secondPublication = recordPublication({
      presentationId: fixture.presentation.id,
      socialAccountId: fixture.account.id,
      submissionRunId: secondSubmission.id,
      rail: "postiz",
      idempotencyKey: "metric-totals-second-publication",
    });
    const refresh = startRun({ projectId: fixture.project.id, kind: "metric-refresh" });
    const append = (
      publicationId: string,
      position: number,
      source: string,
      asOf: number,
      views: number | null,
      likes: number | null,
      windowStart = 0,
      windowEnd = 1_000,
    ) =>
      appendMetricSnapshot({
        publicationId,
        runId: refresh.id,
        position,
        source,
        asOf,
        windowStart,
        windowEnd,
        views,
        likes,
      });

    append(fixture.publication.id, 0, "postiz", 100, 100, null);
    append(fixture.publication.id, 1, "youtube-analytics", 200, 200, 0);
    await Bun.sleep(2);
    append(fixture.publication.id, 2, "youtube-analytics", 200, 210, 0);
    append(secondPublication.id, 3, "postiz", 150, 50, 3);
    append(secondPublication.id, 4, "postiz", 300, 999, 9, 200, 300);
    const publicationIds = [fixture.publication.id, secondPublication.id];
    const context = {
      workspaceId: fixture.workspace.id,
      projectId: fixture.project.id,
    };

    expect(
      getMetricTotals({ context, publicationIds, windowStart: 0, windowEnd: 1_000 }),
    ).toMatchObject({ publicationCount: 2, views: 260, likes: 3 });
    expect(getMetricTotals({ context, publicationIds, source: "postiz" })).toMatchObject({
      publicationCount: 2,
      views: 1_099,
      likes: 9,
    });
    expect(getMetricTotals({ context, publicationIds, asOf: 125 })).toMatchObject({
      publicationCount: 1,
      views: 100,
      likes: null,
    });
    expect(
      getMetricTotals({
        context,
        publicationIds: [fixture.publication.id],
        source: "postiz",
      }),
    ).toMatchObject({ views: 100, likes: null });
    expect(
      getMetricTotals({
        context,
        publicationIds: [fixture.publication.id],
        source: "youtube-analytics",
        asOf: 200,
      }),
    ).toMatchObject({ views: 210, likes: 0 });

    const db = openDomainDb();
    const insertTie = db.prepare(
      `INSERT INTO metric_snapshots
       (id, publication_id, source, as_of, window_start, window_end, views, created_at)
       VALUES (?, ?, 'youtube-analytics', 400, 0, 1000, ?, 500)`,
    );
    insertTie.run("metric_equal_a", fixture.publication.id, 400);
    insertTie.run("metric_equal_z", fixture.publication.id, 450);
    expect(
      getMetricTotals({ context, publicationIds, windowStart: 0, windowEnd: 1_000 }),
    ).toMatchObject({ publicationCount: 2, views: 500, likes: 3 });

    expect(() => getMetricTotals({ context, publicationIds: [] })).toThrow(/1 through 100/i);
    expect(() =>
      getMetricTotals({
        context,
        publicationIds: Array.from({ length: 101 }, (_, i) => `pub_${i}`),
      }),
    ).toThrow(/1 through 100/i);
    expect(() =>
      listMetricSnapshots({
        context,
        publicationId: fixture.publication.id,
        limit: 0,
      }),
    ).toThrow(/1 through 100/i);
  });

  test("rolls back a Metric snapshot when its ordered Run result cannot be recorded", async () => {
    const fixture = await publicationFixture("metric-run-rollback");
    const otherProject = createProject({
      workspaceId: fixture.workspace.id,
      slug: "metric-run-rollback-other-project",
      name: "Other Project",
    });
    const wrongScopeRun = startRun({
      projectId: otherProject.id,
      kind: "metric-refresh",
    });
    expect(() =>
      appendMetricSnapshot({
        publicationId: fixture.publication.id,
        runId: wrongScopeRun.id,
        position: 0,
        source: "postiz",
        asOf: 100,
        views: 1,
      }),
    ).toThrow(/scope/i);
    expect(
      listMetricSnapshots({
        context: { workspaceId: fixture.workspace.id, projectId: fixture.project.id },
        publicationId: fixture.publication.id,
        limit: 100,
      }).items,
    ).toEqual([]);

    const run = startRun({ projectId: fixture.project.id, kind: "metric-refresh" });
    appendMetricSnapshot({
      publicationId: fixture.publication.id,
      runId: run.id,
      position: 0,
      source: "postiz",
      asOf: 100,
      views: 1,
    });
    expect(() =>
      appendMetricSnapshot({
        publicationId: fixture.publication.id,
        runId: run.id,
        position: 0,
        source: "postiz",
        asOf: 200,
        views: 2,
      }),
    ).toThrow();
    expect(
      listMetricSnapshots({
        context: { workspaceId: fixture.workspace.id, projectId: fixture.project.id },
        publicationId: fixture.publication.id,
        limit: 100,
      }).items.map(
        (snapshot) => snapshot.views,
      ),
    ).toEqual([1]);
  });
});

function publicationOperational(id: string): {
  activeClaimRunId: string | null;
  error: string | null;
  failureStage: string | null;
  idempotencyKey: string;
  claimKind: string | null;
  claimEpoch: number;
} {
  const row = openDomainDb()
    .query<
      {
        activeClaimRunId: string | null;
        error: string | null;
        failureStage: string | null;
        idempotencyKey: string;
        claimKind: string | null;
        claimEpoch: number;
      },
      [string]
    >(
      `SELECT active_claim_run_id AS activeClaimRunId, error,
              failure_stage AS failureStage, idempotency_key AS idempotencyKey,
              claim_kind AS claimKind, claim_epoch AS claimEpoch
       FROM publications WHERE id = ?`,
    )
    .get(id);
  if (!row) throw new Error(`Publication not found in test fixture: ${id}`);
  return row;
}

function metricRaw(id: string): unknown {
  const row = openDomainDb()
    .query<{ rawJson: string | null }, [string]>(
      "SELECT raw_json AS rawJson FROM metric_snapshots WHERE id = ?",
    )
    .get(id);
  if (!row) throw new Error(`Metric Snapshot not found in test fixture: ${id}`);
  return row.rawJson === null ? null : JSON.parse(row.rawJson);
}

function setupProject(label: string) {
  const root = makeTmpRoot(`ralphy-domain-units-${label}`);
  roots.push(root);
  const workspace = createWorkspace({ slug: `${label}-workspace`, name: "Workspace" });
  const project = createProject({
    workspaceId: workspace.id,
    slug: `${label}-project`,
    name: "Project",
  });
  return { root, workspace, project };
}

function expectSqlRejected(db: Database, sql: string, message: RegExp): void {
  db.exec("SAVEPOINT unit_guard_test");
  let error: unknown = null;
  try {
    db.exec(sql);
  } catch (caught) {
    error = caught;
  } finally {
    db.exec("ROLLBACK TO unit_guard_test");
    db.exec("RELEASE unit_guard_test");
  }
  expect(error).toBeInstanceOf(Error);
  expect((error as Error | null)?.message ?? "").toMatch(message);
}

async function artifactRevision(
  root: TmpRoot,
  workspaceId: string,
  projectId: string | null,
  slug: string,
) {
  return (await artifactFixture(root, workspaceId, projectId, slug)).revision;
}

async function artifactFixture(
  root: TmpRoot,
  workspaceId: string,
  projectId: string | null,
  slug: string,
) {
  const source = path.join(root.dir, `${slug}.bin`);
  fs.writeFileSync(source, slug);
  const object = await ingestObject({
    scope: { workspaceId, ...(projectId ? { projectId } : {}) },
    sourcePath: source,
    originalName: `${slug}.bin`,
    mime: "application/octet-stream",
    storageClass: "durable",
  });
  const artifact = createArtifact({
    ...(projectId ? { projectId } : { workspaceId }),
    slug,
    kind: "data",
  });
  const revision = addArtifactRevision({
    artifactId: artifact.id,
    objectId: object.id,
    state: "approved",
  });
  return { object, revision };
}

async function runUnitRevisionAfterObjectMutation(
  root: TmpRoot,
  objectId: string,
  input: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const readyPath = path.join(root.dir, `${crypto.randomUUID()}.ready`);
  const blocker = new Database(domainDbPath(), { create: true });
  blocker.exec("PRAGMA busy_timeout = 5000");
  blocker.exec("BEGIN IMMEDIATE");
  blocker
    .prepare("UPDATE objects SET key = ?, original_name = ? WHERE id = ?")
    .run(`objects/${objectId}.gone`, "missing.gone", objectId);

  const workerSource = `
    import fs from "node:fs";
    import { setRoot } from ${JSON.stringify(path.join(process.cwd(), "cli/lib/paths.ts"))};
    import { openDomainDb } from ${JSON.stringify(path.join(process.cwd(), "cli/lib/store/db.ts"))};
    import { reviseUnit } from ${JSON.stringify(path.join(process.cwd(), "cli/lib/store/units.ts"))};

    const root = process.env.RALPHY_TEST_ROOT;
    const readyPath = process.env.RALPHY_TEST_READY;
    const input = JSON.parse(process.env.RALPHY_TEST_INPUT ?? "null");
    if (!root || !readyPath || !input) throw new Error("missing race fixture");
    setRoot(root);
    const db = openDomainDb();
    const transaction = db.transaction.bind(db);
    db.transaction = (callback) => {
      const current = transaction(callback);
      return {
        immediate(...args) {
          fs.writeFileSync(readyPath, "ready");
          return current.immediate(...args);
        },
      };
    };
    try {
      console.log(JSON.stringify({ ok: true, value: reviseUnit(input) }));
    } catch (error) {
      console.log(JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  `;
  const worker = Bun.spawn({
    cmd: ["bun", "-e", workerSource],
    cwd: process.cwd(),
    env: {
      ...process.env,
      RALPHY_TEST_ROOT: root.dir,
      RALPHY_TEST_READY: readyPath,
      RALPHY_TEST_INPUT: JSON.stringify(input),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  let committed = false;
  try {
    const deadline = Date.now() + 2_000;
    while (!fs.existsSync(readyPath)) {
      if (Date.now() >= deadline) {
        worker.kill();
        throw new Error("Unit race worker missed the transaction barrier");
      }
      await Bun.sleep(5);
    }
    blocker.exec("COMMIT");
    committed = true;
    const [exitCode, stdout, stderr] = await Promise.all([
      worker.exited,
      new Response(worker.stdout).text(),
      new Response(worker.stderr).text(),
    ]);
    if (exitCode !== 0) throw new Error(`Unit race worker failed: ${stderr}`);
    return JSON.parse(stdout.trim()) as { ok: boolean; error?: string };
  } finally {
    if (!committed) blocker.exec("ROLLBACK");
    blocker.close();
  }
}

async function publicationFixture(label: string) {
  const { root, workspace, project } = setupProject(label);
  const media = await artifactRevision(root, workspace.id, project.id, `${label}-media`);
  const unit = createUnit({ projectId: project.id, slug: "unit", format: "video" });
  reviseUnit({
    unitId: unit.id,
    expectedLatestRevisionId: null,
    items: [{ artifactRevisionId: media.id, role: "primary", position: 0 }],
    presentations: [
      {
        platform: "tiktok",
        caption: "Caption",
        options: { privacy: "public" },
      },
    ],
  });
  const presentation = getUnit(unit.id).revisions[0]!.presentations[0]!;
  const account = upsertSocialAccount({
    workspaceId: workspace.id,
    platform: "tiktok",
    externalId: `${label}-account`,
  });
  const run = startRun({ projectId: project.id, kind: "publication-submit" });
  const publication = recordPublication({
    presentationId: presentation.id,
    socialAccountId: account.id,
    submissionRunId: run.id,
    rail: "postiz",
    idempotencyKey: `${label}-publication`,
  });
  return { root, workspace, project, unit, presentation, account, run, publication };
}
