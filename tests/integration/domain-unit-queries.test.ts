import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  addArtifactRevision,
  createArtifact,
} from "../../cli/lib/store/artifacts.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { createDocument, reviseDocument } from "../../cli/lib/store/documents.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import { encodeCursor } from "../../cli/lib/store/pagination.js";
import {
  createProject,
  createWorkspace,
  upsertSocialAccount,
} from "../../cli/lib/store/scopes.js";
import { startRun } from "../../cli/lib/store/runs.js";
import { getProjectOverview } from "../../cli/lib/store/overviews.js";
import {
  appendMetricSnapshot,
  claimPublication,
  createUnit,
  finishPublicationClaim,
  getMetricSnapshot,
  getMetricTotals,
  getPresentationCaptionRevision,
  getPresentationItem,
  getPublication,
  getUnit,
  getUnitItem,
  getUnitPresentation,
  getUnitRevision,
  listMetricSnapshots,
  listPresentationCaptionRevisions,
  listPresentationItems,
  listPublications,
  listUnitItems,
  listUnitPresentations,
  listUnitRevisions,
  listUnits,
  recordPublication,
  reviseUnit,
  selectUnitRevision,
} from "../../cli/lib/store/units.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { withPoisonFarmReadTrap } from "../helpers/poison-farm.js";

const UNIT_KEYS = [
  "createdAt",
  "format",
  "id",
  "latestRevisionId",
  "projectId",
  "selectedRevisionId",
  "slug",
  "updatedAt",
  "workspaceId",
] as const;
const REVISION_KEYS = [
  "authoredBySessionId",
  "createdAt",
  "id",
  "iterationId",
  "note",
  "parentRevisionId",
  "revisionNo",
  "sealedAt",
  "unitId",
] as const;
const ITEM_KEYS = [
  "artifactRevisionId",
  "config",
  "createdAt",
  "documentRevisionId",
  "id",
  "position",
  "role",
  "unitRevisionId",
] as const;
const PRESENTATION_KEYS = [
  "coverArtifactRevisionId",
  "createdAt",
  "crop",
  "effectiveCaptionRevisionId",
  "id",
  "options",
  "platform",
  "position",
  "safeArea",
  "unitRevisionId",
] as const;
const CAPTION_KEYS = [
  "createdAt",
  "id",
  "parentRevisionId",
  "presentationId",
  "revisionNo",
  "state",
  "text",
] as const;
const PRESENTATION_ITEM_KEYS = [
  "config",
  "createdAt",
  "id",
  "position",
  "presentationId",
  "unitItemId",
] as const;
const PUBLICATION_KEYS = [
  "createdAt",
  "effectiveCaptionRevisionId",
  "effectiveOptions",
  "id",
  "presentationId",
  "providerPublicationId",
  "publishedAt",
  "rail",
  "revisedFromPublicationId",
  "scheduledAt",
  "socialAccountId",
  "state",
  "submissionRunId",
  "submittedAt",
  "updatedAt",
  "url",
] as const;
const METRIC_KEYS = [
  "asOf",
  "avgViewDurationSec",
  "comments",
  "createdAt",
  "ctr",
  "id",
  "likes",
  "note",
  "publicationId",
  "retentionCurve",
  "shares",
  "source",
  "views",
  "watchTimeMs",
  "windowEnd",
  "windowStart",
] as const;

let roots: TmpRoot[] = [];

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

function makeRoot(label: string): TmpRoot {
  const root = makeTmpRoot(`ralphy-unit-queries-${label}`);
  roots.push(root);
  return root;
}

function expectKeys(value: object, keys: readonly string[]): void {
  expect(Object.keys(value).sort()).toEqual([...keys].sort());
}

async function artifactRevision(
  root: TmpRoot,
  workspaceId: string,
  projectId: string | null,
  slug: string,
) {
  const sourcePath = path.join(root.dir, `${slug}.bin`);
  fs.writeFileSync(sourcePath, `bytes:${slug}`);
  const object = await ingestObject({
    scope: { workspaceId, projectId },
    sourcePath,
    originalName: `${slug}.bin`,
    mime: "application/octet-stream",
    storageClass: "working",
  });
  const artifact = createArtifact(
    projectId === null
      ? { workspaceId, slug, kind: "image" }
      : { projectId, slug, kind: "image" },
  );
  return addArtifactRevision({
    artifactId: artifact.id,
    objectId: object.id,
    state: "approved",
  });
}

async function mediaFixture(label: string) {
  const root = makeRoot(label);
  const workspace = createWorkspace({ slug: `${label}-workspace`, name: label });
  const project = createProject({
    workspaceId: workspace.id,
    slug: `${label}-project`,
    name: label,
  });
  const shared = await artifactRevision(root, workspace.id, null, `${label}-shared`);
  const unit = createUnit({ projectId: project.id, slug: `${label}-pack`, format: "sticker-pack" });
  const revision = reviseUnit({
    unitId: unit.id,
    expectedLatestRevisionId: null,
    metadata: { privateRevisionFact: "stored-only" },
    items: Array.from({ length: 32 }, (_, position) => ({
      artifactRevisionId: shared.id,
      role: "sticker",
      position,
      config: { sticker: position },
    })),
    presentations: [
      {
        platform: "tiktok",
        position: 0,
        captions: [
          { state: "draft", text: "Draft caption" },
          { state: "final", text: "Final caption" },
        ],
        effectiveCaptionRevisionNo: 2,
        crop: { mode: "cover" },
        safeArea: { bottom: 24 },
        options: { chrome: "tiktok" },
        items: [
          { unitItemPosition: 2, position: 0, config: { crop: "square" } },
          { unitItemPosition: 0, position: 1, config: { crop: "wide" } },
        ],
      },
      {
        platform: "instagram",
        position: 1,
        caption: "Instagram caption",
        options: { chrome: "reels" },
      },
      {
        platform: "youtube",
        position: 2,
        options: { chrome: "shorts" },
      },
    ],
  });
  selectUnitRevision({
    unitId: unit.id,
    revisionId: revision.id,
    expectedSelectedRevisionId: null,
  });
  const context = { workspaceId: workspace.id, projectId: project.id } as const;
  const presentations = listUnitPresentations({ context, revisionId: revision.id, limit: 10 }).items;
  return { root, workspace, project, shared, unit, revision, presentations, context };
}

describe("bounded Unit graph queries", () => {
  test("projects exact safe DTOs while retaining legitimate preview configuration", async () => {
    const value = await mediaFixture("safe-shapes");
    const unit = getUnit({ context: value.context, unitId: value.unit.id });
    const revision = getUnitRevision({ context: value.context, revisionId: value.revision.id });
    const items = listUnitItems({ context: value.context, revisionId: value.revision.id, limit: 100 });
    const tiktok = value.presentations[0]!;
    const captions = listPresentationCaptionRevisions({
      context: value.context,
      presentationId: tiktok.id,
      limit: 10,
    });
    const presentationItems = listPresentationItems({
      context: value.context,
      presentationId: tiktok.id,
      limit: 10,
    });

    expectKeys(unit, UNIT_KEYS);
    expectKeys(revision, REVISION_KEYS);
    expect(items.items).toHaveLength(32);
    expect(new Set(items.items.map((item) => item.artifactRevisionId))).toEqual(
      new Set([value.shared.id]),
    );
    expectKeys(items.items[0]!, ITEM_KEYS);
    expect(items.items[0]!.config).toEqual({ sticker: 0 });
    expect(value.presentations.map((item) => item.platform)).toEqual([
      "tiktok",
      "instagram",
      "youtube",
    ]);
    for (const presentation of value.presentations) expectKeys(presentation, PRESENTATION_KEYS);
    expect(tiktok).toMatchObject({
      crop: { mode: "cover" },
      safeArea: { bottom: 24 },
      options: { chrome: "tiktok" },
    });
    expect(captions.items).toHaveLength(2);
    expectKeys(captions.items[0]!, CAPTION_KEYS);
    expect(presentationItems.items).toHaveLength(2);
    expectKeys(presentationItems.items[0]!, PRESENTATION_ITEM_KEYS);
    expect(presentationItems.items[0]!.config).toEqual({ crop: "square" });
    expect(openDomainDb().query<{ metadata: string }, [string]>(
      "SELECT metadata_json AS metadata FROM unit_revisions WHERE id = ?",
    ).get(value.revision.id)).toEqual({ metadata: '{"privateRevisionFact":"stored-only"}' });
    expect("metadata" in revision).toBe(false);
  });

  test("round-trips deep benign public JSON through every projected Unit family", async () => {
    const value = await mediaFixture("deep-safe-json");
    const unit = createUnit({
      projectId: value.project.id,
      slug: "deep-safe-json-unit",
      format: "carousel",
    });
    const revision = reviseUnit({
      unitId: unit.id,
      expectedLatestRevisionId: null,
      items: [
        {
          artifactRevisionId: value.shared.id,
          role: "sticker",
          position: 0,
          config: {
            sticker: { mode: "overlay", profile: "spark" },
            previewText: "Open https://example.test/docs and continue",
          },
        },
      ],
      presentations: [
        {
          platform: "instagram",
          crop: { mode: "cover", config: { profile: "portrait" } },
          safeArea: { bottom: 24, chrome: { mode: "compact" } },
          options: {
            requestId: "request-42",
            errorStyle: "quiet",
            profile: {
              platformId: "a".repeat(64),
              previewText: "Visit https://example.test/profile for details",
            },
          },
          items: [
            {
              unitItemPosition: 0,
              position: 0,
              config: { crop: { mode: "square" }, sticker: "spark" },
            },
          ],
        },
      ],
    });
    const presentation = listUnitPresentations({
      context: value.context,
      revisionId: revision.id,
      limit: 10,
    }).items[0]!;
    const item = listUnitItems({
      context: value.context,
      revisionId: revision.id,
      limit: 10,
    }).items[0]!;
    const presentationItem = listPresentationItems({
      context: value.context,
      presentationId: presentation.id,
      limit: 10,
    }).items[0]!;
    const account = upsertSocialAccount({
      workspaceId: value.workspace.id,
      platform: "instagram",
      externalId: "deep-safe-json-account",
    });
    const publication = recordPublication({
      presentationId: presentation.id,
      socialAccountId: account.id,
      submissionRunId: startRun({
        projectId: value.project.id,
        kind: "publication",
      }).id,
      rail: "postiz",
      idempotencyKey: "deep-safe-json-publication",
    });

    expect(item.config).toEqual({
      previewText: "Open https://example.test/docs and continue",
      sticker: { mode: "overlay", profile: "spark" },
    });
    expect(presentation).toMatchObject({
      crop: { config: { profile: "portrait" }, mode: "cover" },
      safeArea: { bottom: 24, chrome: { mode: "compact" } },
      options: {
        errorStyle: "quiet",
        profile: {
          platformId: "a".repeat(64),
          previewText: "Visit https://example.test/profile for details",
        },
        requestId: "request-42",
      },
    });
    expect(presentationItem.config).toEqual({
      crop: { mode: "square" },
      sticker: "spark",
    });
    expect(publication.effectiveOptions).toEqual(presentation.options);
    expect(
      openDomainDb()
        .query<{ options: string }, [string]>(
          "SELECT options_json AS options FROM unit_presentations WHERE id = ?",
        )
        .get(presentation.id)?.options,
    ).toBe(
      `{"errorStyle":"quiet","profile":{"platformId":"${"a".repeat(64)}","previewText":"Visit https://example.test/profile for details"},"requestId":"request-42"}`,
    );
  });

  test("fails closed on poisoned Unit JSON projections and Publication derivation", async () => {
    const value = await mediaFixture("public-json-poison");
    const presentation = value.presentations[0]!;
    const item = listUnitItems({
      context: value.context,
      revisionId: value.revision.id,
      limit: 1,
    }).items[0]!;
    const presentationItem = listPresentationItems({
      context: value.context,
      presentationId: presentation.id,
      limit: 1,
    }).items[0]!;
    const account = upsertSocialAccount({
      workspaceId: value.workspace.id,
      platform: "tiktok",
      externalId: "public-json-poison-account",
    });
    const publication = recordPublication({
      presentationId: presentation.id,
      socialAccountId: account.id,
      submissionRunId: startRun({
        projectId: value.project.id,
        kind: "publication",
      }).id,
      rail: "postiz",
      idempotencyKey: "public-json-poison-publication",
    });
    const db = openDomainDb();
    db.exec(`
      DROP TRIGGER unit_items_no_update;
      DROP TRIGGER presentation_items_no_update;
      DROP TRIGGER unit_presentations_update_guard;
      DROP TRIGGER publications_identity_update_guard;
    `);
    const poison = '{"nested":{"access-token":"must-not-escape"}}';
    const unitItemReads = [
      () => getUnitItem({ context: value.context, itemId: item.id }),
      () =>
        listUnitItems({
          context: value.context,
          revisionId: value.revision.id,
          limit: 100,
        }),
    ];
    const cells = [
      {
        table: "unit_items",
        column: "config_json",
        id: item.id,
        reads: unitItemReads,
      },
      {
        table: "unit_items",
        column: "config_json",
        id: item.id,
        poison: '{"data_url":"SGVsbG8"}',
        reads: unitItemReads,
      },
      {
        table: "unit_items",
        column: "config_json",
        id: item.id,
        poison: '{"__proto__":{"token":"must-not-escape"}}',
        reads: unitItemReads,
      },
      {
        table: "presentation_items",
        column: "config_json",
        id: presentationItem.id,
        reads: [
          () =>
            getPresentationItem({
              context: value.context,
              presentationItemId: presentationItem.id,
            }),
          () =>
            listPresentationItems({
              context: value.context,
              presentationId: presentation.id,
              limit: 100,
            }),
        ],
      },
      ...(["crop_json", "safe_area_json", "options_json"] as const).map(
        (column) => ({
          table: "unit_presentations",
          column,
          id: presentation.id,
          reads: [
            () =>
              getUnitPresentation({
                context: value.context,
                presentationId: presentation.id,
              }),
            () =>
              listUnitPresentations({
                context: value.context,
                revisionId: value.revision.id,
                limit: 100,
              }),
          ],
        }),
      ),
      {
        table: "publications",
        column: "effective_options_json",
        id: publication.id,
        reads: [
          () =>
            getPublication({
              context: value.context,
              publicationId: publication.id,
            }),
          () =>
            listPublications({
              context: value.context,
              presentationId: presentation.id,
              limit: 100,
            }),
        ],
      },
    ];
    const missed: string[] = [];

    for (const cell of cells) {
      const original = db
        .query<{ value: string | null }, [string]>(
          `SELECT ${cell.column} AS value FROM ${cell.table} WHERE id = ?`,
        )
        .get(cell.id)!.value;
      db.prepare(`UPDATE ${cell.table} SET ${cell.column} = ? WHERE id = ?`).run(
        "poison" in cell ? cell.poison : poison,
        cell.id,
      );
      for (const read of cell.reads) {
        try {
          read();
          missed.push(`${cell.table}.${cell.column}`);
        } catch (error) {
          if (!/public JSON/i.test(String(error))) throw error;
        }
      }
      expect(
        getProjectOverview({
          context: value.context,
          projectId: value.project.id,
          sections: { units: { limit: 10 } },
        }).units?.items.map((row) => row.id),
      ).toContain(value.unit.id);
      db.prepare(`UPDATE ${cell.table} SET ${cell.column} = ? WHERE id = ?`).run(
        original,
        cell.id,
      );
    }

    const derivationRun = startRun({
      projectId: value.project.id,
      kind: "publication",
    });
    db.prepare("UPDATE unit_presentations SET options_json = ? WHERE id = ?").run(
      poison,
      presentation.id,
    );
    const beforeCount = db
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM publications")
      .get()!.count;
    try {
      recordPublication({
        presentationId: presentation.id,
        socialAccountId: account.id,
        submissionRunId: derivationRun.id,
        rail: "postiz",
        idempotencyKey: "public-json-poison-derived",
      });
      missed.push("Publication derivation");
    } catch (error) {
      if (!/public JSON/i.test(String(error))) throw error;
    }
    expect(
      getProjectOverview({
        context: value.context,
        projectId: value.project.id,
        sections: { units: { limit: 10 } },
      }).units?.items.map((row) => row.id),
    ).toContain(value.unit.id);
    expect(missed).toEqual([]);
    expect(
      db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM publications").get()!
        .count,
    ).toBe(beforeCount);
  });

  test("keeps sticker packs, carousels, repeated media, and text-only Units flexible", async () => {
    const value = await mediaFixture("formats");
    const carousel = createUnit({
      projectId: value.project.id,
      slug: "formats-carousel",
      format: "carousel",
    });
    const carouselRevision = reviseUnit({
      unitId: carousel.id,
      expectedLatestRevisionId: null,
      items: Array.from({ length: 8 }, (_, position) => ({
        artifactRevisionId: value.shared.id,
        role: "slide",
        position,
      })),
      presentations: [{ platform: "instagram", options: { count: 8 } }],
    });
    const document = createDocument({
      projectId: value.project.id,
      kind: "note",
      slug: "formats-copy",
      title: "Copy",
    });
    const documentRevision = reviseDocument({
      documentId: document.id,
      expectedCurrentRevisionId: null,
      format: "markdown",
      body: "Text only",
    });
    const text = createUnit({
      projectId: value.project.id,
      slug: "formats-text",
      format: "article",
    });
    const textRevision = reviseUnit({
      unitId: text.id,
      expectedLatestRevisionId: null,
      items: [{ documentRevisionId: documentRevision.id, role: "body", position: 0 }],
    });

    expect(listUnitItems({ context: value.context, revisionId: carouselRevision.id, limit: 100 }).items)
      .toHaveLength(8);
    expect(listUnitItems({ context: value.context, revisionId: textRevision.id, limit: 10 }).items)
      .toEqual([expect.objectContaining({
        artifactRevisionId: null,
        documentRevisionId: documentRevision.id,
      })]);
  });

  test("uses c1, v1, and p1 without gaps and rejects wrong cursors and limits", async () => {
    const value = await mediaFixture("pages");
    const db = openDomainDb();
    const insert = db.prepare(
      `INSERT INTO units
       (id, workspace_id, slug, format, created_at, updated_at)
       VALUES (?, ?, ?, 'video', 1, 1)`,
    );
    const ids = Array.from({ length: 101 }, (_, index) =>
      `unit-page-${String(100 - index).padStart(3, "0")}`,
    );
    db.transaction(() => {
      for (const id of ids) insert.run(id, value.workspace.id, id);
    })();
    const seen: string[] = [];
    let after: string | null | undefined;
    do {
      const page = listUnits({
        context: { workspaceId: value.workspace.id },
        after,
        limit: 17,
      });
      seen.push(...page.items.map((item) => item.id));
      after = page.nextCursor;
    } while (after !== null);
    expect(seen).toEqual([...ids].sort());

    const secondRevision = reviseUnit({
      unitId: value.unit.id,
      expectedLatestRevisionId: value.revision.id,
      items: [{ artifactRevisionId: value.shared.id, role: "sticker", position: 0 }],
    });
    const revisions = listUnitRevisions({
      context: value.context,
      unitId: value.unit.id,
      limit: 1,
    });
    expect(revisions.nextCursor?.startsWith("v1.")).toBe(true);
    expect(listUnitRevisions({
      context: value.context,
      unitId: value.unit.id,
      after: revisions.nextCursor,
      limit: 1,
    }).items[0]?.id).toBe(secondRevision.id);

    const items = listUnitItems({ context: value.context, revisionId: value.revision.id, limit: 1 });
    expect(items.nextCursor?.startsWith("p1.")).toBe(true);
    expect(listUnitItems({
      context: value.context,
      revisionId: value.revision.id,
      after: items.nextCursor,
      limit: 1,
    }).items[0]?.position).toBe(1);

    const wrong = {
      c1: encodeCursor("c1", { ordinal: 1, id: "x" }),
      v1: encodeCursor("v1", { ordinal: 1, id: "x" }),
      p1: encodeCursor("p1", { ordinal: 1, id: "x" }),
    };
    expect(() => listUnits({ context: value.context, after: wrong.v1, limit: 1 })).toThrow(/cursor/i);
    expect(() => listUnitRevisions({
      context: value.context,
      unitId: value.unit.id,
      after: wrong.c1,
      limit: 1,
    })).toThrow(/cursor/i);
    expect(() => listUnitItems({
      context: value.context,
      revisionId: value.revision.id,
      after: wrong.c1,
      limit: 1,
    })).toThrow(/cursor/i);

    const tiktok = value.presentations[0]!;
    const lists = [
      (limit: number) => listUnits({ context: value.context, limit }),
      (limit: number) => listUnitRevisions({ context: value.context, unitId: value.unit.id, limit }),
      (limit: number) => listUnitItems({ context: value.context, revisionId: value.revision.id, limit }),
      (limit: number) => listUnitPresentations({ context: value.context, revisionId: value.revision.id, limit }),
      (limit: number) => listPresentationCaptionRevisions({ context: value.context, presentationId: tiktok.id, limit }),
      (limit: number) => listPresentationItems({ context: value.context, presentationId: tiktok.id, limit }),
      (limit: number) => listPublications({ context: value.context, presentationId: tiktok.id, limit }),
      (limit: number) => listMetricSnapshots({ context: value.context, publicationId: "missing", limit }),
    ];
    for (const list of lists) {
      for (const limit of [0, 1.5, 101]) expect(() => list(limit)).toThrow(/limit/i);
    }
  });

  test("newest history pages traverse 55 Unit revisions", async () => {
    const value = await mediaFixture("newest-history");
    const revisions = [value.revision];
    for (let index = 1; index < 55; index += 1) {
      revisions.push(reviseUnit({
        unitId: value.unit.id,
        expectedLatestRevisionId: revisions.at(-1)!.id,
        items: [{
          artifactRevisionId: value.shared.id,
          role: "item",
          position: 0,
        }],
      }));
    }

    const oldest = listUnitRevisions({
      context: value.context,
      unitId: value.unit.id,
      limit: 50,
    });
    expect(oldest.items.map((item) => item.revisionNo))
      .toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
    expect(oldest.nextCursor?.startsWith("v1.")).toBe(true);
    expect(listUnitRevisions({
      context: value.context,
      unitId: value.unit.id,
      order: "oldest",
      after: oldest.nextCursor,
      limit: 50,
    })).toMatchObject({
      items: [51, 52, 53, 54, 55].map((revisionNo) => ({ revisionNo })),
      nextCursor: null,
    });

    const newest = listUnitRevisions({
      context: value.context,
      unitId: value.unit.id,
      order: "newest",
      limit: 50,
    });
    expect(newest.items.map((item) => item.revisionNo))
      .toEqual(Array.from({ length: 50 }, (_, index) => 55 - index));
    expect(newest.nextCursor?.startsWith("v2.")).toBe(true);
    expect(listUnitRevisions({
      context: value.context,
      unitId: value.unit.id,
      order: "newest",
      after: newest.nextCursor,
      limit: 50,
    })).toMatchObject({
      items: [5, 4, 3, 2, 1].map((revisionNo) => ({ revisionNo })),
      nextCursor: null,
    });

    expect(() => listUnitRevisions({
      context: value.context,
      unitId: value.unit.id,
      order: "newest",
      after: oldest.nextCursor,
      limit: 1,
    })).toThrow(/cursor/i);
    expect(() => listUnitRevisions({
      context: value.context,
      unitId: value.unit.id,
      after: newest.nextCursor,
      limit: 1,
    })).toThrow(/cursor/i);
    expect(() => listUnitRevisions({
      context: value.context,
      unitId: value.unit.id,
      order: "sideways" as never,
      limit: 1,
    })).toThrow(/order/i);
  });

  test("authorizes every depth and validates a parent before returning an empty page", async () => {
    const value = await mediaFixture("visibility");
    const shared = createUnit({
      workspaceId: value.workspace.id,
      slug: "visibility-shared",
      format: "video",
    });
    const sibling = createProject({
      workspaceId: value.workspace.id,
      slug: "visibility-sibling",
      name: "Sibling",
    });
    const foreignWorkspace = createWorkspace({ slug: "visibility-foreign", name: "Foreign" });
    const foreignProject = createProject({
      workspaceId: foreignWorkspace.id,
      slug: "visibility-foreign",
      name: "Foreign",
    });
    const siblingContext = { workspaceId: value.workspace.id, projectId: sibling.id } as const;
    const tiktok = value.presentations[0]!;
    const caption = listPresentationCaptionRevisions({
      context: value.context,
      presentationId: tiktok.id,
      limit: 10,
    }).items[0]!;
    const presentationItem = listPresentationItems({
      context: value.context,
      presentationId: tiktok.id,
      limit: 10,
    }).items[0]!;
    const item = listUnitItems({ context: value.context, revisionId: value.revision.id, limit: 1 }).items[0]!;

    expect(listUnits({ context: { workspaceId: value.workspace.id }, limit: 10 }).items.map((row) => row.id))
      .toEqual([shared.id]);
    expect(listUnits({ context: value.context, limit: 10 }).items.map((row) => row.id).sort())
      .toEqual([shared.id, value.unit.id].sort());
    expect(listUnits({ context: siblingContext, limit: 10 }).items.map((row) => row.id))
      .toEqual([shared.id]);
    expect(() => getUnit({
      context: { workspaceId: foreignWorkspace.id, projectId: foreignProject.id },
      unitId: value.unit.id,
    })).toThrow(/not found/i);

    const forbidden = [
      () => getUnit({ context: siblingContext, unitId: value.unit.id }),
      () => getUnitRevision({ context: siblingContext, revisionId: value.revision.id }),
      () => getUnitItem({ context: siblingContext, itemId: item.id }),
      () => getUnitPresentation({ context: siblingContext, presentationId: tiktok.id }),
      () => getPresentationCaptionRevision({ context: siblingContext, captionRevisionId: caption.id }),
      () => getPresentationItem({ context: siblingContext, presentationItemId: presentationItem.id }),
      () => listUnitRevisions({ context: siblingContext, unitId: value.unit.id, limit: 10 }),
      () => listUnitItems({ context: siblingContext, revisionId: value.revision.id, limit: 10 }),
      () => listUnitPresentations({ context: siblingContext, revisionId: value.revision.id, limit: 10 }),
      () => listPresentationCaptionRevisions({ context: siblingContext, presentationId: tiktok.id, limit: 10 }),
      () => listPresentationItems({ context: siblingContext, presentationId: tiktok.id, limit: 10 }),
    ];
    for (const query of forbidden) expect(query).toThrow(/not found/i);

    expect(listUnitRevisions({ context: value.context, unitId: value.unit.id, limit: 10 }).items)
      .not.toHaveLength(0);
    expect(listPresentationItems({
      context: value.context,
      presentationId: value.presentations[1]!.id,
      limit: 10,
    }).items).toEqual([]);
  });
});

describe("bounded Publication and Metric queries", () => {
  test("keeps multiple attempts and snapshots without exposing operational raw facts", async () => {
    const value = await mediaFixture("publication-metrics");
    const presentation = value.presentations[0]!;
    const account = upsertSocialAccount({
      workspaceId: value.workspace.id,
      platform: "tiktok",
      externalId: "publication-metrics-account",
    });
    const firstRun = startRun({ projectId: value.project.id, kind: "publication" });
    const first = recordPublication({
      presentationId: presentation.id,
      socialAccountId: account.id,
      submissionRunId: firstRun.id,
      rail: "postiz",
      idempotencyKey: "publication-metrics-first",
    });
    expectKeys(first, PUBLICATION_KEYS);
    const claim = claimPublication(first.id, "draft", 60_000);
    expectKeys(claim.publication, PUBLICATION_KEYS);
    const finished = finishPublicationClaim(first.id, {
      fence: claim.fence,
      state: "submitted",
      providerPublicationId: "postiz-123",
      url: "https://example.test/posts/123",
      submittedAt: Date.now(),
      response: { providerResponse: "stored-only" },
    });
    expectKeys(finished, PUBLICATION_KEYS);
    expect(finished).toMatchObject({
      state: "submitted",
      providerPublicationId: "postiz-123",
      url: "https://example.test/posts/123",
    });
    const second = recordPublication({
      presentationId: presentation.id,
      socialAccountId: account.id,
      submissionRunId: startRun({ projectId: value.project.id, kind: "publication" }).id,
      rail: "postiz",
      idempotencyKey: "publication-metrics-second",
      revisedFromPublicationId: first.id,
    });
    const failed = recordPublication({
      presentationId: presentation.id,
      submissionRunId: startRun({ projectId: value.project.id, kind: "publication" }).id,
      rail: "postiz",
      idempotencyKey: "publication-metrics-failed",
      state: "failed",
      failureStage: "preflight",
      error: "private provider error",
    });
    expectKeys(failed, PUBLICATION_KEYS);

    const publications = listPublications({
      context: value.context,
      presentationId: presentation.id,
      limit: 2,
    });
    expect(publications.items).toHaveLength(2);
    expect(publications.nextCursor?.startsWith("c1.")).toBe(true);
    expect(listPublications({
      context: value.context,
      presentationId: presentation.id,
      after: publications.nextCursor,
      limit: 2,
    }).items).toHaveLength(1);
    expectKeys(getPublication({ context: value.context, publicationId: second.id }), PUBLICATION_KEYS);

    const refresh = startRun({ projectId: value.project.id, kind: "metric-refresh" });
    const unknown = appendMetricSnapshot({
      publicationId: first.id,
      runId: refresh.id,
      position: 0,
      source: "postiz",
      asOf: 100,
      views: undefined,
      note: "unknown sample",
      raw: { privateProviderPayload: true },
    });
    const zero = appendMetricSnapshot({
      publicationId: first.id,
      runId: refresh.id,
      position: 1,
      source: "postiz",
      asOf: 200,
      views: 0,
      likes: 0,
      retentionCurve: [{ pct: 0, watchRatio: 1, providerPoint: "kept" }],
      raw: { privateProviderPayload: 0 },
    });
    expectKeys(unknown, METRIC_KEYS);
    expectKeys(zero, METRIC_KEYS);
    expect(unknown.views).toBeNull();
    expect(zero.views).toBe(0);
    expect("raw" in zero).toBe(false);
    expectKeys(getMetricSnapshot({ context: value.context, metricSnapshotId: zero.id }), METRIC_KEYS);
    const orderedMetricIds = [unknown, zero]
      .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
      .map((row) => row.id);
    const metrics = listMetricSnapshots({
      context: value.context,
      publicationId: first.id,
      limit: 1,
    });
    expect(metrics.items.map((row) => row.id)).toEqual([orderedMetricIds[0]]);
    expect(metrics.nextCursor?.startsWith("c1.")).toBe(true);
    expect(listMetricSnapshots({
      context: value.context,
      publicationId: first.id,
      after: metrics.nextCursor,
      limit: 1,
    }).items.map((row) => row.id)).toEqual([orderedMetricIds[1]]);
    expect(listMetricSnapshots({
      context: value.context,
      publicationId: first.id,
      asOf: 150,
      limit: 10,
    }).items.map((row) => row.id)).toEqual([unknown.id]);
    expect(getMetricTotals({
      context: value.context,
      publicationIds: [first.id],
    })).toMatchObject({ publicationCount: 1, views: 0, likes: 0 });
    expect(() => getMetricTotals({
      context: value.context,
      publicationIds: [first.id, first.id],
    })).toThrow(/distinct|duplicate/i);

    const raw = openDomainDb().query<{
      error: string;
      failureStage: string;
      idempotencyKey: string;
      raw: string;
    }, [string, string]>(
      `SELECT publication.error, publication.failure_stage AS failureStage,
              publication.idempotency_key AS idempotencyKey, metric.raw_json AS raw
       FROM publications publication, metric_snapshots metric
       WHERE publication.id = ? AND metric.id = ?`,
    ).get(failed.id, zero.id)!;
    expect(raw).toEqual({
      error: "private provider error",
      failureStage: "preflight",
      idempotencyKey: "publication-metrics-failed",
      raw: '{"privateProviderPayload":0}',
    });
    expect(JSON.stringify([finished, failed, zero])).not.toMatch(
      /private provider error|idempotencyKey|claimToken|privateProviderPayload/,
    );
  });

  test("enforces Publication and Metric visibility through their Unit", async () => {
    const value = await mediaFixture("deep-visibility");
    const presentation = value.presentations[0]!;
    const account = upsertSocialAccount({
      workspaceId: value.workspace.id,
      platform: "tiktok",
      externalId: "deep-visibility-account",
    });
    const publication = recordPublication({
      presentationId: presentation.id,
      socialAccountId: account.id,
      submissionRunId: startRun({ projectId: value.project.id, kind: "publication" }).id,
      rail: "postiz",
      idempotencyKey: "deep-visibility-publication",
    });
    const metric = appendMetricSnapshot({
      publicationId: publication.id,
      runId: startRun({ projectId: value.project.id, kind: "metric-refresh" }).id,
      position: 0,
      source: "postiz",
      asOf: 1,
    });
    const sibling = createProject({
      workspaceId: value.workspace.id,
      slug: "deep-visibility-sibling",
      name: "Sibling",
    });
    const context = { workspaceId: value.workspace.id, projectId: sibling.id } as const;
    for (const query of [
      () => getPublication({ context, publicationId: publication.id }),
      () => listPublications({ context, presentationId: presentation.id, limit: 10 }),
      () => getMetricSnapshot({ context, metricSnapshotId: metric.id }),
      () => listMetricSnapshots({ context, publicationId: publication.id, limit: 10 }),
      () => getMetricTotals({ context, publicationIds: [publication.id] }),
    ]) expect(query).toThrow(/not found/i);
  });

  test("query paths never inspect Farm files or resolve bucket locators", async () => {
    const value = await mediaFixture("poison");
    const before = {
      unit: getUnit({ context: value.context, unitId: value.unit.id }),
      revisions: listUnitRevisions({ context: value.context, unitId: value.unit.id, limit: 10 }),
      items: listUnitItems({ context: value.context, revisionId: value.revision.id, limit: 100 }),
      presentations: listUnitPresentations({ context: value.context, revisionId: value.revision.id, limit: 10 }),
    };
    const trapped = withPoisonFarmReadTrap(value.root.dir, () => ({
        unit: getUnit({ context: value.context, unitId: value.unit.id }),
        revisions: listUnitRevisions({ context: value.context, unitId: value.unit.id, limit: 10 }),
        items: listUnitItems({ context: value.context, revisionId: value.revision.id, limit: 100 }),
        presentations: listUnitPresentations({ context: value.context, revisionId: value.revision.id, limit: 10 }),
      }));
    expect(trapped.result).toEqual(before);
    expect(trapped.touched).toEqual([]);
  });
});
