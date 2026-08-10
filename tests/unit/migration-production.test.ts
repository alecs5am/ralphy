import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  acquireMaintenanceLock,
  inventoryLegacySource,
  releaseMaintenanceLock,
  sourceLocatorHash,
} from "../../cli/lib/migration/inventory.js";
import {
  importProductionAndDelivery,
  importScopesAndDocuments,
  type ProductionImportSummary,
} from "../../cli/lib/migration/import.js";
import { productionSourceGraphMismatches } from "../../cli/lib/migration/production-accounting.js";
import { stageInventoryObjects } from "../../cli/lib/migration/staging.js";
import type { MigrationContext, MigrationLock } from "../../cli/lib/migration/types.js";
import { openDomainDbAt } from "../../cli/lib/store/db.js";
import {
  buildRealLegacyCompositionLayout,
  buildLegacyLibrary,
  type LegacyFixture,
} from "../fixtures/migration/build-legacy-library.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let root: TmpRoot | null = null;
let fixture: LegacyFixture | null = null;
let lock: MigrationLock | null = null;
let ctx: MigrationContext | null = null;
let fixtureDir: string | null = null;

type FixtureMutation = (value: { project: string; fixture: LegacyFixture }) => void;

afterEach(() => {
  ctx?.db.close();
  ctx = null;
  if (lock) releaseMaintenanceLock(lock);
  lock = null;
  fixture?.cleanup();
  fixture = null;
  if (fixtureDir) fs.rmSync(fixtureDir, { recursive: true, force: true });
  fixtureDir = null;
  root?.cleanup();
  root = null;
});

describe("legacy production and delivery migration", () => {
  test("imports the real HyperFrames Composition and Build layout without production manifests", async () => {
    await setupFixture(({ project }) => {
      fs.rmSync(path.join(project, "production.json"));
      fs.rmSync(path.join(project, "production"), { recursive: true });
      buildRealLegacyCompositionLayout(project);
    });

    expect(fs.existsSync(path.join(fixture!.paths.registeredProject, "production.json"))).toBe(false);
    expect(fs.existsSync(path.join(fixture!.paths.registeredProject, "production"))).toBe(false);

    const generationPath = "workspaces/studio/projects/registered-project/logs/generations.jsonl";
    const before = generationLedger(generationPath);
    expect(before).toMatchObject({ state: "inventoried", terminalAt: null });
    expect(before.rawEvidenceObjectId).toMatch(/^obj_/u);
    expect(before.refs).toContain(before.rawEvidenceObjectId!);
    expect(before.refs.some((ref) => ref.startsWith("doc_"))).toBe(true);
    expect(before.refs.some((ref) => ref.startsWith("drev_"))).toBe(true);
    expect(before.refs.some((ref) => ref.startsWith("run_"))).toBe(true);
    expect(before.refs.some((ref) => ref.startsWith("robj_"))).toBe(true);

    const first = importProductionAndDelivery(ctx!);
    const after = generationLedger(generationPath);
    expect(after.state).toBe("imported");
    expect(after.terminalAt).toBeNumber();
    expect(after.refs.length).toBeGreaterThan(before.refs.length);
    for (const ref of before.refs) expect(after.refs).toContain(ref);
    const firstDomain = productionDomainIds();

    const replay = importProductionAndDelivery(ctx!);
    expect(replay).toEqual(first);
    expect(generationLedger(generationPath)).toEqual(after);
    expect(productionDomainIds()).toEqual(firstDomain);

    for (const relative of ["index.html", "compositions/variant-1.html", "compositions/title-card.html"]) {
      const refs = ledgerEntry(`workspaces/studio/projects/registered-project/${relative}`).refs;
      expect(refs.some((ref) => ref.startsWith("obj_"))).toBe(true);
      expect(refs.some((ref) => ref.startsWith("comp_"))).toBe(true);
      expect(refs.some((ref) => ref.startsWith("crev_"))).toBe(true);
      expect(refs.some((ref) => ref.startsWith("cfile_"))).toBe(true);
    }
    const variant = revisionBinding(
      "workspaces/studio/projects/registered-project/compositions/variant-1.html",
      "composition",
    );
    const versionLooking = revisionBinding(
      "workspaces/studio/projects/registered-project/compositions/variant-1.v2.html",
      "composition",
    );
    expect(versionLooking).toMatchObject({ revisionNo: 1 });
    expect(versionLooking.identityId).not.toBe(variant.identityId);
    const expectedRows = [
      { compositionPath: "index.html", renderPath: "render/root.mp4", bytes: 11 },
      { compositionPath: "compositions/variant-1.html", renderPath: "render/variant-1.mp4", bytes: 18 },
      { compositionPath: "compositions/title-card.html", renderPath: "render/title-card.mp4", bytes: 17 },
    ] as const;
    for (const expected of expectedRows) assertExactBuildBinding(expected);
    const generationRefs = after.refs;
    const buildChains = ctx!.db.query<{
      runId: string;
      attemptId: string;
      buildId: string;
      outputId: string;
      resultId: string;
    }, []>(
      `SELECT run.id AS runId, attempt.id AS attemptId, build.id AS buildId,
              output.id AS outputId, result.id AS resultId
       FROM builds build
       JOIN runs run ON run.id = build.run_id
       JOIN run_attempts attempt ON attempt.run_id = run.id
       JOIN build_outputs output ON output.build_id = build.id
       JOIN run_results result ON result.run_id = run.id
       JOIN projects project ON project.id = run.project_id
       JOIN workspaces workspace ON workspace.id = project.workspace_id
       WHERE project.slug = 'registered-project' AND workspace.slug = 'studio'
       ORDER BY build.id`,
    ).all();
    expect(buildChains).toHaveLength(3);
    for (const chain of buildChains) {
      for (const ref of Object.values(chain)) expect(generationRefs).toContain(ref);
    }
    for (const relative of [
      "render/wrong-scope.mp4",
      "render/deeper.mp4",
      "render/unsafe.mp4",
      "render/wrong-bytes.mp4",
      "render/duplicate.mp4",
    ]) {
      const refs = ledgerEntry(`workspaces/studio/projects/registered-project/${relative}`).refs;
      expect(refs.filter((ref) => ref.startsWith("build_"))).toEqual([]);
      expect(refs.filter((ref) => ref.startsWith("output_"))).toEqual([]);
      const artifactRevisionId = refs.find((ref) => ref.startsWith("arev_"));
      expect(artifactRevisionId).toBeString();
      expect(ctx!.db.query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM build_outputs WHERE artifact_revision_id = ?",
      ).get(artifactRevisionId!)?.count).toBe(0);
    }
  });

  test("production reconciliation rejects an Artifact-only graph for recognized HyperFrames provenance", async () => {
    await setupFixture(({ project }) => {
      fs.rmSync(path.join(project, "production.json"));
      fs.rmSync(path.join(project, "production"), { recursive: true });
      buildRealLegacyCompositionLayout(project);
    });
    importProductionAndDelivery(ctx!);
    const entryId = ctx!.db.query<{ id: string }, [string, string]>(
      "SELECT id FROM migration_entries WHERE migration_run_id = ? AND source_path = ?",
    ).get(ctx!.runId, "workspaces/studio/projects/registered-project/logs/generations.jsonl")?.id;
    expect(entryId).toBeString();

    expect(productionSourceGraphMismatches(ctx!.db, {
      productionRecords: [],
      deliveryRecords: [],
      deliveryOccurrences: [],
    })).toContain(entryId!);
  });

  test("materializes the production graph once per import", async () => {
    await setupFixture();
    let materializations = 0;
    const importWithSeam = importProductionAndDelivery as unknown as (
      input: MigrationContext,
      options: { onMaterializeForTesting: () => void },
    ) => ProductionImportSummary;

    importWithSeam(ctx!, { onMaterializeForTesting: () => { materializations += 1; } });

    expect(materializations).toBe(1);
  });

  test("blocks a 40-to-39 Unit occurrence omission against source-derived accounting", async () => {
    await setupFixture();
    const sourcePath = "workspaces/studio/projects/registered-project/units/repeated-pack/unit.json";
    const entryId = ctx!.db.query<{ id: string }, [string, string]>(
      "SELECT id FROM migration_entries WHERE migration_run_id = ? AND source_path = ?",
    ).get(ctx!.runId, sourcePath)?.id;
    expect(entryId).toBeString();

    const importWithSeam = importProductionAndDelivery as unknown as (
      input: MigrationContext,
      options: { omitLastRepeatedUnitItemForTesting: boolean },
    ) => ProductionImportSummary;
    expect(() => importWithSeam(ctx!, { omitLastRepeatedUnitItemForTesting: true }))
      .toThrow(entryId!);
    expect(ctx!.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM units").get()?.count).toBe(0);
  });

  test("blocks a Build omission against source-derived accounting", async () => {
    await setupFixture();
    const sourcePath = "workspaces/studio/projects/registered-project/production.json";
    const entryId = ctx!.db.query<{ id: string }, [string, string]>(
      "SELECT id FROM migration_entries WHERE migration_run_id = ? AND source_path = ?",
    ).get(ctx!.runId, sourcePath)?.id;
    expect(entryId).toBeString();

    const importWithSeam = importProductionAndDelivery as unknown as (
      input: MigrationContext,
      options: { omitBuildEntryIdForTesting: string },
    ) => ProductionImportSummary;
    expect(() => importWithSeam(ctx!, { omitBuildEntryIdForTesting: entryId! }))
      .toThrow(entryId!);
    expect(ctx!.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM builds").get()?.count).toBe(0);
  });

  test("blocks a partial Delivery target omitted by every shared expander", async () => {
    await setupFixture();
    const sourcePath = "workspaces/studio/projects/registered-project/publish-ledger.jsonl";
    const entryId = ctx!.db.query<{ id: string }, [string, string]>(
      "SELECT id FROM migration_entries WHERE migration_run_id = ? AND source_path = ?",
    ).get(ctx!.runId, sourcePath)?.id;
    expect(entryId).toBeString();

    const importWithSeam = importProductionAndDelivery as unknown as (
      input: MigrationContext,
      options: { omitLastDeliveryTargetForTesting: boolean },
    ) => ProductionImportSummary;
    expect(() => importWithSeam(ctx!, { omitLastDeliveryTargetForTesting: true }))
      .toThrow(entryId!);
    expect(ctx!.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM publications").get()?.count).toBe(0);
  });

  test("reconstructs immutable production history from explicit provenance", async () => {
    await setupFixture();

    expect(entryState("workspaces/studio/projects/registered-project/production.json")).toBe("inventoried");
    expect(entryState("workspaces/studio/projects/registered-project/composition/index.html")).toBe("staged");

    const first = importProductionAndDelivery(ctx!);
    const replay = importProductionAndDelivery(ctx!);

    expect(replay).toEqual(first);
    expect(first).toMatchObject({ units: 10, publications: 13, metrics: 4 });
    const accounting = ctx!.db.query<{ facts: number; indexes: number }, []>(
      `SELECT
         SUM(code = 'MIGRATION_PRODUCTION_ACCOUNTING_FACT') AS facts,
         SUM(code = 'MIGRATION_PRODUCTION_ACCOUNTING_INDEX') AS indexes
       FROM migration_issues`,
    ).get()!;
    expect(accounting.facts).toBeGreaterThan(0);
    expect(accounting.indexes).toBe(1);

    const units = ctx!.db.query<{
      slug: string;
      latest: string | null;
      selected: string | null;
      revisionNo: number | null;
    }, []>(
      `SELECT unit.slug, unit.latest_revision_id AS latest,
              unit.selected_revision_id AS selected, revision.revision_no AS revisionNo
       FROM units unit
       LEFT JOIN unit_revisions revision ON revision.id = unit.latest_revision_id
       ORDER BY unit.slug`,
    ).all();
    expect(units.find((unit) => unit.slug === "campaign")).toMatchObject({
      revisionNo: 2,
      selected: null,
    });
    expect(units.find((unit) => unit.slug === "foo-v2")?.revisionNo).toBe(1);
    expect(units.find((unit) => unit.slug === "text-post")?.latest).toMatch(/^urev_/u);
    expect(ctx!.db.query<{ count: number }, []>(
      `SELECT COUNT(*) AS count FROM unit_items item
       JOIN unit_revisions revision ON revision.id = item.unit_revision_id
       JOIN units unit ON unit.id = revision.unit_id
       WHERE unit.slug = 'repeated-pack'`,
    ).get()?.count).toBe(40);
    expect(ctx!.db.query<{ count: number; distinctTargets: number }, []>(
      `SELECT COUNT(*) AS count, COUNT(DISTINCT artifact_revision_id) AS distinctTargets
       FROM unit_items item
       JOIN unit_revisions revision ON revision.id = item.unit_revision_id
       JOIN units unit ON unit.id = revision.unit_id
       WHERE unit.slug = 'repeated-pack'`,
    ).get()).toEqual({ count: 40, distinctTargets: 10 });
    expect(ctx!.db.query<{ count: number }, []>(
      `SELECT COUNT(*) AS count FROM unit_items item
       JOIN unit_revisions revision ON revision.id = item.unit_revision_id
       JOIN units unit ON unit.id = revision.unit_id
       WHERE unit.slug IN ('text-post', 'text-thread')
         AND item.document_revision_id IS NOT NULL`,
    ).get()?.count).toBe(2);

    const compositionFamilies = ctx!.db.query<{ slug: string; revisions: number }, []>(
      `SELECT composition.slug, COUNT(revision.id) AS revisions
       FROM compositions composition
       LEFT JOIN composition_revisions revision ON revision.composition_id = composition.id
       GROUP BY composition.id ORDER BY composition.slug`,
    ).all();
    expect(compositionFamilies.find((item) => item.slug === "index")?.revisions).toBe(2);
    expect(compositionFamilies.find((item) => item.slug === "index-branch-a")?.revisions).toBe(2);
    expect(compositionFamilies.some((item) => item.slug.startsWith("index-r3"))).toBe(true);
    expect(ctx!.db.query<{ count: number }, []>(
      `SELECT COUNT(*) AS count FROM project_iterations iteration
       JOIN composition_revisions revision ON revision.iteration_id = iteration.id`,
    ).get()?.count).toBe(0);
    expect(ctx!.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM builds").get()?.count).toBe(4);
    expect(ctx!.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM build_outputs").get()?.count).toBe(4);

    const captions = ctx!.db.query<{ revisionNo: number; state: string; text: string }, []>(
      `SELECT caption.revision_no AS revisionNo, caption.state, caption.text
       FROM presentation_caption_revisions caption
       JOIN unit_presentations presentation ON presentation.id = caption.presentation_id
       JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
       JOIN units unit ON unit.id = revision.unit_id
       WHERE unit.slug = 'campaign' AND presentation.platform = 'instagram'
       ORDER BY caption.revision_no`,
    ).all();
    expect(captions).toEqual([
      { revisionNo: 1, state: "auto-draft-archived", text: "Draft caption" },
      { revisionNo: 2, state: "humanized", text: "Humanized caption" },
    ]);

    const publications = ctx!.db.query<{
      legacyId: string;
      rail: string;
      state: string;
      platform: string;
      revisedFrom: string | null;
      url: string | null;
    }, []>(
      `SELECT json_extract(run.metadata_json, '$.legacyPublicationId') AS legacyId,
              publication.rail, publication.state, presentation.platform,
              publication.revised_from_publication_id AS revisedFrom, publication.url
       FROM publications publication
       JOIN runs run ON run.id = publication.submission_run_id
       JOIN unit_presentations presentation ON presentation.id = publication.presentation_id
       ORDER BY publication.created_at, publication.id`,
    ).all();
    expect(publications.some((item) => item.legacyId === "medium")).toBe(false);
    expect(publications.find((item) => item.legacyId === "github-pages")).toMatchObject({
      rail: "github-pages",
      platform: "web",
    });
    expect(publications.find((item) => item.legacyId === "accountless-failure")).toMatchObject({
      rail: "postiz",
      state: "failed",
    });
    expect(publications.find((item) => item.legacyId === "revision")?.revisedFrom).toMatch(/^pub_/u);
    expect(publications.find((item) => item.legacyId === "tiktok-path")?.url)
      .toBe("https://www.tiktok.com/@creator/video/42");
    expect(ctx!.db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM run_attempts WHERE state = 'running'",
    ).get()?.count).toBe(0);
    expect(ctx!.db.query<{ count: number }, []>(
      `SELECT COUNT(*) AS count FROM publications publication
       WHERE NOT EXISTS (
         SELECT 1 FROM run_results result
         WHERE result.run_id = publication.submission_run_id
           AND result.entity_type = 'publication'
           AND result.entity_id = publication.id
       )`,
    ).get()?.count).toBe(0);

    const metrics = ctx!.db.query<{
      source: string;
      views: number | null;
      ctr: number | null;
      retention: string | null;
      average: number | null;
      note: string | null;
      raw: string | null;
    }, []>(
      `SELECT source, views, ctr, retention_curve_json AS retention,
              avg_view_duration_sec AS average, note, raw_json AS raw
       FROM metric_snapshots ORDER BY created_at, id`,
    ).all();
    expect(metrics.some((metric) => metric.views === null)).toBe(true);
    expect(metrics.some((metric) => metric.ctr === 0.25 && metric.average === 3.5)).toBe(true);
    expect(metrics.some((metric) => metric.retention?.includes('"pct":50'))).toBe(true);
    expect(metrics.some((metric) => metric.raw?.includes('"unknown":"kept"'))).toBe(true);

    const malformed = ctx!.db.query<{ count: number }, []>(
      `SELECT COUNT(*) AS count FROM migration_issues
       WHERE code IN ('MIGRATION_PUBLISH_RECORD_INVALID', 'MIGRATION_METRIC_RECORD_INVALID')`,
    ).get()?.count ?? 0;
    expect(malformed).toBe(2);
    expect(ctx!.db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM migration_issues WHERE code = 'MIGRATION_DELIVERY_AMBIGUOUS'",
    ).get()?.count).toBe(0);

    const productionEntry = ledgerEntry("workspaces/studio/projects/registered-project/production.json");
    expect(productionEntry.refs.length).toBeGreaterThan(4);
    expect(productionEntry.refs).toEqual([...productionEntry.refs].sort());
    for (const ref of productionEntry.refs) expect(domainRowExists(ref)).toBe(true);
    const farmRefs = ctx!.db.query<{ refs: string }, []>(
      `SELECT target_refs_json AS refs FROM migration_entries
       WHERE source_path LIKE 'farm/%'`,
    ).all().flatMap((row) => JSON.parse(row.refs) as Array<string | null>)
      .filter((ref): ref is string => ref !== null);
    expect(farmRefs.every((ref) => /^(?:obj|run|robj)_/u.test(ref))).toBe(true);

    expect(entryState("workspaces/studio/projects/registered-project/production.json")).toBe("imported");
    expect(entryState("workspaces/studio/projects/registered-project/composition/index.html")).toBe("verified");
    expect(() => ctx!.db.prepare(
      `UPDATE migration_entries SET target_refs_json = '[]'
       WHERE migration_run_id = ? AND source_path = ?`,
    ).run(ctx!.runId, "workspaces/studio/projects/registered-project/production.json"))
      .toThrow(/Terminal migration entry is immutable/u);

    const migratedMetadata = JSON.stringify({
      artifacts: ctx!.db.query("SELECT metadata_json FROM artifact_revisions").all(),
      units: ctx!.db.query("SELECT metadata_json FROM unit_revisions").all(),
      presentations: ctx!.db.query("SELECT options_json FROM unit_presentations").all(),
      publications: ctx!.db.query("SELECT url, effective_options_json FROM publications").all(),
      metrics: ctx!.db.query("SELECT raw_json FROM metric_snapshots").all(),
    });
    expect(migratedMetadata).not.toContain(fixtureDir!);
    expect(migratedMetadata).not.toContain("data:");
    expect(migratedMetadata).not.toContain("fixture-postiz-plaintext-key");
  });

  test("keeps publication attempts distinct and binds exact immutable delivery provenance", async () => {
    await setupFixture(({ project }) => {
      const campaignV2 = path.join(project, "units", "campaign.v2", "unit.json");
      const manifest = JSON.parse(fs.readFileSync(campaignV2, "utf8")) as Record<string, unknown>;
      manifest.presentations = [{
        platform: "instagram",
        options: { campaign: "B" },
        effectiveCaptionVersion: 2,
      }];
      fs.writeFileSync(campaignV2, `${JSON.stringify(manifest, null, 2)}\n`);
      fs.writeFileSync(path.join(project, "publish-ledger.jsonl"), [
        { id: "shared-attempt", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", accountId: "postiz-main", status: "failed", error: "provider rejected", failureStage: "provider", createdAt: 100 },
        { id: "shared-attempt", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", accountId: "postiz-main", status: "published", providerPublicationId: "shared-ok", url: "https://social.example/shared", createdAt: 200, submittedAt: 210, publishedAt: 220, options: { campaign: "B" }, captionVersion: 2 },
        { id: "revision-first", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", accountId: "postiz-main", status: "published", providerPublicationId: "revision-ok", url: "https://social.example/revision", revisedFrom: "original-later", createdAt: 400, submittedAt: 410, publishedAt: 420 },
        { id: "skip-first", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", status: "idempotent-skip", originalPublicationId: "original-later", createdAt: 500 },
        { id: "original-later", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", accountId: "postiz-main", status: "published", providerPublicationId: "original-ok", url: "https://social.example/original", createdAt: 300, submittedAt: 310, publishedAt: 320 },
        { id: "ambiguous-revision", unitId: "campaign", platform: "instagram", provider: "postiz", accountId: "postiz-main", status: "published", providerPublicationId: "ambiguous", url: "https://social.example/ambiguous", createdAt: 600, submittedAt: 610, publishedAt: 620 },
        { id: "options-mismatch", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", accountId: "options-invalid-only", status: "published", providerPublicationId: "bad-options", url: "https://social.example/options", createdAt: 700, submittedAt: 710, publishedAt: 720, options: { campaign: "wrong" } },
        { id: "timeline-invalid", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", accountId: "postiz-main", status: "published", providerPublicationId: "bad-time", url: "https://social.example/time", createdAt: 800, scheduledAt: 840, submittedAt: 830, publishedAt: 850 },
        { id: "failed-success-facts", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", accountId: "postiz-main", status: "failed", error: "failed", failureStage: "provider", publishedAt: 910, createdAt: 900 },
        { id: "provider-id-invalid", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", accountId: "postiz-main", status: "submitted", providerPublicationId: `bad-${"x".repeat(600)}`, createdAt: 1000, submittedAt: 1010 },
        { id: "submitted-unproven", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", accountId: "postiz-main", status: "submitted", createdAt: 1100 },
        { id: "draft-terminal-run", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", accountId: "postiz-main", status: "draft", createdAt: 1200 },
        { id: "data:text/plain,publication-secret", unitId: "article", unitRevision: 1, platform: "web", provider: "manual", status: "published", url: "https://site.example/safe-id", createdAt: 1300, publishedAt: 1310 },
        { id: "unsafe-account", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", accountId: "api_key=plaintext-secret", status: "published", providerPublicationId: "unsafe-account-ok", url: "https://social.example/account", createdAt: 1400, submittedAt: 1410, publishedAt: 1420 },
      ].map((row) => JSON.stringify(row)).join("\n") + "\n");
    });

    const first = importProductionAndDelivery(ctx!);
    expect(importProductionAndDelivery(ctx!)).toEqual(first);

    const shared = ctx!.db.query<{ state: string }, []>(
      `SELECT publication.state FROM publications publication
       JOIN runs run ON run.id = publication.submission_run_id
       WHERE json_extract(run.metadata_json, '$.legacyPublicationId') = 'shared-attempt'
       ORDER BY publication.created_at`,
    ).all();
    expect(shared).toEqual([{ state: "failed" }, { state: "published" }]);
    const revision = ctx!.db.query<{ revisedFrom: string | null }, []>(
      `SELECT publication.revised_from_publication_id AS revisedFrom
       FROM publications publication JOIN runs run ON run.id = publication.submission_run_id
       WHERE json_extract(run.metadata_json, '$.legacyPublicationId') = 'revision-first'`,
    ).get();
    expect(revision?.revisedFrom).toMatch(/^pub_/u);
    expect(ctx!.db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM activity_events WHERE action = 'publication.idempotent_skip'",
    ).get()?.count).toBe(1);
    const exact = ctx!.db.query<{ revisionNo: number; captionNo: number | null; options: string }, []>(
      `SELECT revision.revision_no AS revisionNo, caption.revision_no AS captionNo,
              publication.effective_options_json AS options
       FROM publications publication
       JOIN runs run ON run.id = publication.submission_run_id
       JOIN unit_presentations presentation ON presentation.id = publication.presentation_id
       JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
       LEFT JOIN presentation_caption_revisions caption
         ON caption.id = publication.effective_caption_revision_id
       WHERE json_extract(run.metadata_json, '$.legacyPublicationId') = 'shared-attempt'
         AND publication.state = 'published'`,
    ).get();
    expect(exact).toEqual({ revisionNo: 2, captionNo: 2, options: '{"campaign":"B"}' });
    expect(issueCount("MIGRATION_PUBLICATION_BINDING_AMBIGUOUS")).toBeGreaterThan(0);
    expect(issueCount("MIGRATION_PUBLICATION_OPTIONS_INVALID")).toBe(1);
    expect(issueCount("MIGRATION_PUBLICATION_TIMELINE_INVALID")).toBeGreaterThan(0);
    expect(issueCount("MIGRATION_PUBLICATION_STATUS_INVALID")).toBeGreaterThanOrEqual(2);
    expect(issueCount("MIGRATION_PUBLICATION_PROVIDER_ID_INVALID")).toBe(1);
    expect(ctx!.db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM social_accounts WHERE external_id = 'options-invalid-only'",
    ).get()?.count).toBe(0);
    const stored = JSON.stringify({
      runs: ctx!.db.query("SELECT metadata_json FROM runs").all(),
      accounts: ctx!.db.query("SELECT external_id FROM social_accounts").all(),
    });
    expect(stored).not.toContain("data:text/plain,publication-secret");
    expect(stored).not.toContain("api_key=plaintext-secret");
    expect(stored).toMatch(/legacy-[0-9a-f]{16}/u);
  });

  test("keeps malformed controls pending and preserves lineage, hash aliases, and work evidence", async () => {
    await setupFixture(({ project, fixture: built }) => {
      fs.writeFileSync(path.join(project, "production.json"), '{"wrong":[]}\n');
      fs.writeFileSync(path.join(project, "delivery.json"), '[]\n');
      for (const relative of [
        "composition/solo.v2.html",
        "composition/solo.v3.html",
        "artifacts/images/family.v2.png",
        "artifacts/images/family.v3.png",
        "artifacts/images/chosen.v2.png",
        "artifacts/images/chosen.v3.png",
      ]) {
        const file = path.join(project, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `fixture:${relative}`);
      }
      const aliasBytes = "scope-aware-alias";
      const aliasSource = path.join(project, "artifacts", "images", "alias-source.png");
      const aliasCopy = path.join(project, "units", "hash-alias", "media-copy.png");
      fs.mkdirSync(path.dirname(aliasSource), { recursive: true });
      fs.mkdirSync(path.dirname(aliasCopy), { recursive: true });
      fs.writeFileSync(aliasSource, aliasBytes);
      fs.writeFileSync(aliasCopy, aliasBytes);
      const crossScope = path.join(built.paths.physicalOnlyProject, "artifacts", "images", "alias-source.png");
      fs.mkdirSync(path.dirname(crossScope), { recursive: true });
      fs.writeFileSync(crossScope, aliasBytes);
      fs.writeFileSync(path.join(project, "units", "hash-alias", "unit.json"), `${JSON.stringify({
        id: "hash-alias",
        revision: 1,
        format: "post",
        media: ["units/hash-alias/media-copy.png"],
      }, null, 2)}\n`);
      const ambiguousBytes = "ambiguous-scope-alias";
      for (const relative of [
        "artifacts/images/ambiguous-a.png",
        "artifacts/images/ambiguous-b.png",
        "units/ambiguous-alias/media-copy.png",
      ]) {
        const file = path.join(project, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, ambiguousBytes);
      }
      fs.writeFileSync(path.join(project, "units", "ambiguous-alias", "unit.json"), `${JSON.stringify({
        id: "ambiguous-alias",
        revision: 1,
        format: "post",
        media: ["units/ambiguous-alias/media-copy.png"],
      }, null, 2)}\n`);
      const manifestPath = path.join(project, "asset-manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { assets: unknown[] };
      manifest.assets.push(
        { path: "artifacts/images/family.v2.png" },
        { path: "artifacts/images/family.v3.png" },
        { path: "artifacts/images/chosen.v2.png" },
        { path: "artifacts/images/chosen.v3.png", selected: true },
        { path: "artifacts/images/alias-source.png" },
        { path: "artifacts/images/ambiguous-a.png" },
        { path: "artifacts/images/ambiguous-b.png" },
      );
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    });

    expect(workEntry("workspaces/studio/projects/registered-project/render/work-001/frames.txt"))
      .toMatchObject({ disposition: "run-object", state: "verified" });
    expect(workEntry("workspaces/studio/projects/registered-project/render/work-crashed/stderr.log"))
      .toMatchObject({ disposition: "run-object", state: "verified" });

    importProductionAndDelivery(ctx!);

    expect(entryState("workspaces/studio/projects/registered-project/production.json")).toBe("inventoried");
    expect(entryState("workspaces/studio/projects/registered-project/delivery.json")).toBe("inventoried");
    expect(issueCount("MIGRATION_PRODUCTION_MANIFEST_INVALID")).toBe(1);
    expect(issueCount("MIGRATION_DELIVERY_MANIFEST_INVALID")).toBe(2);

    const soloV2 = ledgerEntry("workspaces/studio/projects/registered-project/composition/solo.v2.html").refs;
    const soloV3 = ledgerEntry("workspaces/studio/projects/registered-project/composition/solo.v3.html").refs;
    expect(soloV2.find((ref) => ref.startsWith("comp_")))
      .toBe(soloV3.find((ref) => ref.startsWith("comp_")));
    const familyV2 = ledgerEntry("workspaces/studio/projects/registered-project/artifacts/images/family.v2.png").refs;
    const familyV3 = ledgerEntry("workspaces/studio/projects/registered-project/artifacts/images/family.v3.png").refs;
    const familyId = familyV2.find((ref) => ref.startsWith("art_"));
    expect(familyId).toBe(familyV3.find((ref) => ref.startsWith("art_")));
    expect(ctx!.db.query<{ selected: string | null }, [string]>(
      "SELECT selected_revision_id AS selected FROM artifacts WHERE id = ?",
    ).get(familyId!)?.selected).toBeNull();
    const chosenV2 = ledgerEntry("workspaces/studio/projects/registered-project/artifacts/images/chosen.v2.png").refs;
    const chosenV3 = ledgerEntry("workspaces/studio/projects/registered-project/artifacts/images/chosen.v3.png").refs;
    const chosenId = chosenV2.find((ref) => ref.startsWith("art_"));
    expect(chosenId).toBe(chosenV3.find((ref) => ref.startsWith("art_")));
    expect(ctx!.db.query<{ selected: string | null }, [string]>(
      "SELECT selected_revision_id AS selected FROM artifacts WHERE id = ?",
    ).get(chosenId!)?.selected).toBe(chosenV3.find((ref) => ref.startsWith("arev_"))!);

    const aliasRevision = ledgerEntry("workspaces/studio/projects/registered-project/artifacts/images/alias-source.png")
      .refs.find((ref) => ref.startsWith("arev_"));
    const unitRevision = ctx!.db.query<{ artifactRevisionId: string }, []>(
      `SELECT item.artifact_revision_id AS artifactRevisionId
       FROM unit_items item
       JOIN unit_revisions revision ON revision.id = item.unit_revision_id
       JOIN units unit ON unit.id = revision.unit_id
       WHERE unit.slug = 'hash-alias' AND item.artifact_revision_id IS NOT NULL`,
    ).get()?.artifactRevisionId;
    expect(unitRevision).toBe(aliasRevision);
    expect(ctx!.db.query<{ count: number }, []>(
      `SELECT COUNT(*) AS count FROM unit_items item
       JOIN unit_revisions revision ON revision.id = item.unit_revision_id
       JOIN units unit ON unit.id = revision.unit_id
       WHERE unit.slug = 'ambiguous-alias' AND item.artifact_revision_id IS NOT NULL`,
    ).get()?.count).toBe(0);
    expect(issueCount("MIGRATION_UNIT_ITEM_AMBIGUOUS")).toBeGreaterThan(0);
    const workRefs = workEntry("workspaces/studio/projects/registered-project/render/work-001/frames.txt").refs;
    expect(workRefs.some((ref) => ref.startsWith("robj_"))).toBe(true);
    expect(workRefs.some((ref) => ref.startsWith("art_"))).toBe(false);
  });

  test("uses migration source identity for same-kind Build and Metric IDs", async () => {
    await setupFixture(({ fixture: built }) => {
      const original = built.paths.legacyRoot;
      addSameKindProduction(original, "https://site.example/legacy-one");
      const sibling = path.join(built.root, "same-kind", ".ralph");
      addSameKindProduction(sibling, "https://site.example/legacy-two", true);
      const stat = fs.lstatSync(sibling, { bigint: true });
      built.sourceRoots.push({
        id: "source-legacy-two",
        kind: "legacy-workspace",
        path: sibling,
        device: stat.dev,
        inode: stat.ino,
      });
    });

    expect(() => importProductionAndDelivery(ctx!)).not.toThrow();
    const refs = ctx!.db.query<{ sourceLabel: string; refs: string }, []>(
      `SELECT source.source_label AS sourceLabel, entry.target_refs_json AS refs
       FROM migration_entries entry
       JOIN migration_sources source ON source.id = entry.migration_source_id
       WHERE entry.source_kind = 'legacy-workspace'
         AND entry.source_path = 'projects/legacy-registered/production.json'
       ORDER BY source.source_label`,
    ).all().map((row) => ({
      sourceLabel: row.sourceLabel,
      buildId: (JSON.parse(row.refs) as string[]).find((ref) => ref.startsWith("build_")),
    }));
    expect(refs).toHaveLength(2);
    expect(new Set(refs.map((row) => row.buildId)).size).toBe(2);
    expect(ctx!.db.query<{ count: number }, []>(
      `SELECT COUNT(*) AS count FROM metric_snapshots metric
       JOIN publications publication ON publication.id = metric.publication_id
       JOIN runs run ON run.id = publication.submission_run_id
       WHERE json_extract(run.metadata_json, '$.legacyPublicationId') = 'same-kind-pub'`,
    ).get()?.count).toBe(2);
  });

  test("resolves publication references across one Workspace without leaking invalid accounts", async () => {
    await setupFixture(({ project, fixture: built }) => {
      addPublicationProject(built.paths.currentRoot, "studio", "source-project-a", [
        publicationRow("cross-project-original", "https://site.example/cross-project", 100),
        publicationRow("duplicate-target", "https://site.example/duplicate-a", 200, "duplicate-a"),
      ]);
      addPublicationProject(built.paths.currentRoot, "studio", "source-project-b", [
        publicationRow("duplicate-target", "https://site.example/duplicate-b", 210, "duplicate-b"),
      ]);
      addPublicationProject(built.paths.currentRoot, "other", "source-project-c", [
        publicationRow("other-workspace-only", "https://site.example/other", 300),
      ]);
      const delivery = path.join(project, "delivery");
      fs.mkdirSync(delivery, { recursive: true });
      writeJsonl(path.join(delivery, "cross-project.jsonl"), [{
        id: "cross-project-child", unitId: "article", unitRevision: 1,
        platform: "web", provider: "postiz", accountId: "cross-project-account",
        status: "published", providerPublicationId: "cross-project-child-provider",
        url: "https://social.example/cross-project-child", revisedFrom: "cross-project-original",
        createdAt: 500, submittedAt: 510, publishedAt: 520,
      }]);
      writeJsonl(path.join(delivery, "cross-project-skip.jsonl"), [{
        id: "cross-project-skip", unitId: "article", unitRevision: 1,
        platform: "web", provider: "manual", status: "idempotent-skip",
        originalPublicationId: "cross-project-original", createdAt: 550,
      }]);
      writeJsonl(path.join(delivery, "disambiguated.jsonl"), [{
        id: "disambiguated-child", unitId: "article", unitRevision: 1,
        platform: "web", provider: "manual", status: "published",
        url: "https://site.example/disambiguated", revisedFrom: "duplicate-target",
        revisedFromSourceLocatorHash: sourceLocatorHash(
          "ralphy",
          "workspaces/studio/projects/source-project-b/publish-ledger.jsonl",
        ),
        revisedFromProviderPublicationId: "duplicate-b",
        revisedFromCreatedAt: 210,
        createdAt: 600, publishedAt: 610,
      }]);
      writeJsonl(path.join(delivery, "missing.jsonl"), [{
        id: "missing-child", unitId: "article", unitRevision: 1,
        platform: "web", provider: "postiz", accountId: "missing-ref-account",
        status: "published", providerPublicationId: "missing-child-provider",
        url: "https://social.example/missing", revisedFrom: "does-not-exist",
        createdAt: 700, submittedAt: 710, publishedAt: 720,
      }]);
      writeJsonl(path.join(delivery, "ambiguous.jsonl"), [{
        id: "ambiguous-child", unitId: "article", unitRevision: 1,
        platform: "web", provider: "postiz", accountId: "ambiguous-ref-account",
        status: "published", providerPublicationId: "ambiguous-child-provider",
        url: "https://social.example/ambiguous", revisedFrom: "duplicate-target",
        createdAt: 800, submittedAt: 810, publishedAt: 820,
      }]);
      writeJsonl(path.join(delivery, "cross-workspace.jsonl"), [{
        id: "cross-workspace-child", unitId: "article", unitRevision: 1,
        platform: "web", provider: "postiz", accountId: "cross-workspace-account",
        status: "published", providerPublicationId: "cross-workspace-child-provider",
        url: "https://social.example/cross-workspace", revisedFrom: "other-workspace-only",
        createdAt: 900, submittedAt: 910, publishedAt: 920,
      }]);
    });

    importProductionAndDelivery(ctx!);

    expect(revisedProviderId("cross-project-child")).toBeNull();
    expect(revisedProviderId("disambiguated-child")).toBe("duplicate-b");
    expect(ctx!.db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM activity_events WHERE action = 'publication.idempotent_skip'",
    ).get()?.count).toBe(2);
    for (const externalId of ["missing-ref-account", "ambiguous-ref-account", "cross-workspace-account"]) {
      expect(ctx!.db.query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM social_accounts WHERE external_id = ?",
      ).get(externalId)?.count).toBe(0);
    }
    for (const relative of ["missing.jsonl", "ambiguous.jsonl", "cross-workspace.jsonl"]) {
      expect(ledgerEntry(`workspaces/studio/projects/registered-project/delivery/${relative}`).refs
        .some((ref) => ref.startsWith("acct_"))).toBe(false);
    }
    expect(issueCount("MIGRATION_PUBLICATION_REVISED_FROM_INVALID")).toBeGreaterThanOrEqual(3);
  });

  test("imports only the exact account-resolution failure shape", async () => {
    await setupFixture(({ project }) => {
      const delivery = path.join(project, "delivery", "account-resolution.jsonl");
      fs.mkdirSync(path.dirname(delivery), { recursive: true });
      writeJsonl(delivery, [
        { id: "pre-account-valid", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", status: "failed", error: "account missing", failureStage: "account-resolution", createdAt: 1500 },
        { id: "pre-account-with-account", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", accountId: "contradictory-account", status: "failed", error: "account missing", failureStage: "account-resolution", createdAt: 1510 },
        { id: "pre-account-scheduled", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", status: "failed", error: "account missing", failureStage: "account-resolution", createdAt: 1520, scheduledAt: 1521 },
        { id: "pre-account-submitted", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", status: "failed", error: "account missing", failureStage: "account-resolution", createdAt: 1530, submittedAt: 1531 },
        { id: "pre-account-provider", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", status: "failed", error: "account missing", failureStage: "account-resolution", providerPublicationId: "contradictory-provider", createdAt: 1540 },
      ]);
    });

    expect(() => importProductionAndDelivery(ctx!)).not.toThrow();
    expect(publicationStates("pre-account-valid")).toEqual([{ publication: "failed", run: "failed", attempts: 0 }]);
    for (const legacyId of [
      "pre-account-with-account", "pre-account-scheduled", "pre-account-submitted", "pre-account-provider",
    ]) {
      expect(publicationStates(legacyId)).toEqual([]);
    }
    expect(ctx!.db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM social_accounts WHERE external_id = 'contradictory-account'",
    ).get()?.count).toBe(0);
    expect(ctx!.db.query<{ count: number }, []>(
      `SELECT COUNT(*) AS count FROM publications publication
       JOIN runs run ON run.id = publication.submission_run_id
       WHERE publication.state = 'draft' AND run.state IN ('succeeded', 'failed', 'cancelled')`,
    ).get()?.count).toBe(0);
  });

  test("keeps malformed Task 5 manifests pending and normalizes observed revision numbers", async () => {
    await setupFixture(({ project, fixture: built }) => {
      const brokenUnit = path.join(project, "units", "broken", "unit.json");
      fs.mkdirSync(path.dirname(brokenUnit), { recursive: true });
      fs.writeFileSync(brokenUnit, "[]\n");
      const badCaptionsUnit = path.join(project, "units", "bad-captions");
      fs.mkdirSync(badCaptionsUnit, { recursive: true });
      fs.writeFileSync(path.join(badCaptionsUnit, "unit.json"), '{"id":"valid-sibling","format":"post","media":[]}\n');
      fs.writeFileSync(path.join(badCaptionsUnit, "captions.json"), '{"wrong":[]}\n');
      fs.writeFileSync(path.join(built.paths.physicalOnlyProject, "asset-manifest.json"), '[]\n');
      for (const relative of [
        "composition/observed.v2.html",
        "composition/observed.v3.html",
        "artifacts/images/observed.v2.png",
        "artifacts/images/observed.v3.png",
      ]) {
        const file = path.join(project, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `fixture:${relative}`);
      }
    });

    importProductionAndDelivery(ctx!);

    for (const relative of [
      "workspaces/studio/projects/registered-project/units/broken/unit.json",
      "workspaces/studio/projects/registered-project/units/bad-captions/captions.json",
      "workspaces/studio/projects/physical-only-project/asset-manifest.json",
    ]) {
      expect(entryState(relative)).toBe("inventoried");
      expect(ledgerEntry(relative).refs.some((ref) => ref.startsWith("obj_"))).toBe(true);
    }
    expect(issueCount("MIGRATION_UNIT_MANIFEST_INVALID")).toBe(1);
    expect(issueCount("MIGRATION_CAPTIONS_MANIFEST_INVALID")).toBe(1);
    expect(issueCount("MIGRATION_ASSET_MANIFEST_INVALID")).toBe(1);
    expect(ctx!.db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM units WHERE slug = 'valid-sibling'",
    ).get()?.count).toBe(1);
    expect(revisionNumbers("artifact", "artifacts-images-observed")).toEqual([1, 2]);
    expect(revisionNumbers("composition", "observed")).toEqual([1, 2]);
  });

  test("keeps dot and dash version families distinct with contiguous revision numbers", async () => {
    await setupFixture(({ project }) => {
      for (const relative of [
        "composition/mixed.v1.html",
        "composition/mixed.v2.html",
        "composition/mixed.v3.html",
        "composition/mixed-v1.html",
        "composition/mixed-v2.html",
        "composition/mixed-v3.html",
        "artifacts/images/mixed.v1.png",
        "artifacts/images/mixed.v2.png",
        "artifacts/images/mixed.v3.png",
        "artifacts/images/mixed-v1.png",
        "artifacts/images/mixed-v2.png",
        "artifacts/images/mixed-v3.png",
      ]) {
        const file = path.join(project, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `fixture:${relative}`);
      }
    });

    const first = importProductionAndDelivery(ctx!);
    expect(importProductionAndDelivery(ctx!)).toEqual(first);

    for (const kind of ["artifact", "composition"] as const) {
      const prefix = kind === "artifact" ? "artifacts/images/" : "composition/";
      const extension = kind === "artifact" ? ".png" : ".html";
      const dot = [2, 3].map((revision) => revisionBinding(
        `workspaces/studio/projects/registered-project/${prefix}mixed.v${revision}${extension}`,
        kind,
      ));
      const dash = [2, 3].map((revision) => revisionBinding(
        `workspaces/studio/projects/registered-project/${prefix}mixed-v${revision}${extension}`,
        kind,
      ));
      expect(dot.map((value) => value.revisionNo)).toEqual([1, 2]);
      expect(dash.map((value) => value.revisionNo)).toEqual([1, 2]);
      expect(new Set(dot.map((value) => value.identityId)).size).toBe(1);
      expect(new Set(dash.map((value) => value.identityId)).size).toBe(1);
      expect(dot[0]!.identityId).not.toBe(dash[0]!.identityId);
    }
  });

  test("blocks whole malformed Task 5 manifests without partial semantic rows", async () => {
    await setupFixture(({ project, fixture: built }) => {
      const badUnit = path.join(project, "units", "bad-field", "unit.json");
      fs.mkdirSync(path.dirname(badUnit), { recursive: true });
      fs.writeFileSync(badUnit, '{"id":42,"format":"post","media":[]}\n');

      const badCaptions = path.join(project, "units", "bad-caption-element");
      fs.mkdirSync(badCaptions, { recursive: true });
      fs.writeFileSync(path.join(badCaptions, "unit.json"), JSON.stringify({
        id: "bad-caption-element",
        format: "post",
        media: [],
        presentations: [{ platform: "x", effectiveCaptionVersion: 1 }],
      }) + "\n");
      fs.writeFileSync(path.join(badCaptions, "captions.json"), JSON.stringify({
        caption_versions: [
          { version: 1, state: "humanized", text: "Valid prefix must not import" },
          { version: 2, state: "humanized", text: 42 },
        ],
      }) + "\n");

      const badCaptionOrder = path.join(project, "units", "bad-caption-order");
      fs.mkdirSync(badCaptionOrder, { recursive: true });
      fs.writeFileSync(path.join(badCaptionOrder, "unit.json"), JSON.stringify({
        id: "bad-caption-order",
        format: "post",
        media: [],
        presentations: [{ platform: "x" }],
      }) + "\n");
      fs.writeFileSync(path.join(badCaptionOrder, "captions.json"), JSON.stringify({
        caption_versions: [
          { version: 2, state: "humanized", text: "Second" },
          { version: 1, state: "auto_draft_archived", text: "First" },
        ],
      }) + "\n");

      const badCaptionState = path.join(project, "units", "bad-caption-state");
      fs.mkdirSync(badCaptionState, { recursive: true });
      fs.writeFileSync(path.join(badCaptionState, "unit.json"), JSON.stringify({
        id: "bad-caption-state",
        format: "post",
        media: [],
        presentations: [{ platform: "x" }],
      }) + "\n");
      fs.writeFileSync(path.join(badCaptionState, "captions.json"), JSON.stringify({
        caption_versions: [
          { version: 1, state: "humanized", text: "Valid sibling must not import" },
          { version: 2, state: "future-state", text: "Unknown state" },
        ],
      }) + "\n");

      const badManifestAttempt = path.join(project, "units", "bad-manifest-attempt");
      fs.mkdirSync(badManifestAttempt, { recursive: true });
      fs.writeFileSync(path.join(badManifestAttempt, "unit.json"), JSON.stringify({
        id: "bad-manifest-attempt",
        format: "post",
        media: [],
        manifestOnlyAttempt: {
          provider: "manual",
          platform: "web",
          status: "future-state",
          createdAt: 1_500,
          url: "https://site.example/future-manifest-attempt",
        },
      }) + "\n");

      fs.writeFileSync(
        path.join(built.paths.physicalOnlyProject, "asset-manifest.json"),
        '{"assets":[42]}\n',
      );
      fs.writeFileSync(path.join(project, "production.json"), JSON.stringify({
        productions: [
          {
            sourceRevision: "composition/index.html",
            output: "render/master.mp4",
            profile: "deep-invalid-control",
            completedAt: 1_600,
          },
          {
            sourceRevision: 42,
            output: "render/master.mp4",
            profile: "invalid-field-types",
            completedAt: "not-a-time",
          },
        ],
      }) + "\n");
      fs.writeFileSync(path.join(project, "delivery.json"), JSON.stringify({
        attempts: [
          {
            id: "deep-invalid-attempt",
            unitId: "article",
            unitRevision: 1,
            platform: "web",
            provider: "manual",
            status: "published",
            url: "https://site.example/deep-invalid-attempt",
            createdAt: 1_700,
            publishedAt: 1_710,
          },
          {
            id: "invalid-future-status",
            unitId: "article",
            platform: "web",
            provider: "manual",
            status: "future-state",
            createdAt: 1_720,
          },
          {
            id: "invalid-timeline",
            unitId: "article",
            platform: "web",
            provider: "manual",
            status: "submitted",
            url: "https://site.example/invalid-timeline",
            createdAt: 1_730,
            submittedAt: 1_720,
          },
          {
            id: "invalid-url",
            unitId: "article",
            platform: "web",
            provider: "manual",
            status: "published",
            url: "https://user@site.example/invalid-url",
            createdAt: 1_740,
            publishedAt: 1_750,
          },
          {
            id: "invalid-provider-id",
            unitId: "campaign",
            unitRevision: 2,
            platform: "instagram",
            provider: "postiz",
            accountId: "valid-account",
            status: "published",
            providerPublicationId: "x".repeat(513),
            createdAt: 1_760,
            publishedAt: 1_770,
          },
          {
            id: "invalid-account-id",
            unitId: "campaign",
            unitRevision: 2,
            platform: "instagram",
            provider: "postiz",
            accountId: "",
            status: "published",
            providerPublicationId: "valid-provider-id",
            createdAt: 1_780,
            publishedAt: 1_790,
          },
          {
            id: "invalid-status-facts",
            unitId: "campaign",
            unitRevision: 2,
            platform: "instagram",
            provider: "postiz",
            accountId: "valid-account",
            status: "failed",
            error: "failed",
            failureStage: "provider",
            createdAt: 1_800,
            publishedAt: 1_810,
          },
        ],
      }) + "\n");
      const productionDir = path.join(project, "production");
      fs.mkdirSync(productionDir, { recursive: true });
      writeJsonl(path.join(productionDir, "deep-valid-sibling.jsonl"), [{
        sourceRevision: "composition/index.html",
        output: "render/master.mp4",
        profile: "deep-valid-sibling",
        completedAt: 1_750,
      }]);
      const deliveryDir = path.join(project, "delivery");
      fs.mkdirSync(deliveryDir, { recursive: true });
      writeJsonl(path.join(deliveryDir, "deep-valid-sibling.jsonl"), [{
        id: "deep-valid-sibling",
        unitId: "article",
        unitRevision: 1,
        platform: "web",
        provider: "manual",
        status: "published",
        url: "https://site.example/deep-valid-sibling",
        createdAt: 1_800,
        publishedAt: 1_810,
      }]);
    });

    importProductionAndDelivery(ctx!);

    for (const relative of [
      "workspaces/studio/projects/registered-project/units/bad-field/unit.json",
      "workspaces/studio/projects/registered-project/units/bad-caption-element/captions.json",
      "workspaces/studio/projects/registered-project/units/bad-caption-order/captions.json",
      "workspaces/studio/projects/registered-project/units/bad-caption-state/captions.json",
      "workspaces/studio/projects/registered-project/units/bad-manifest-attempt/unit.json",
      "workspaces/studio/projects/physical-only-project/asset-manifest.json",
      "workspaces/studio/projects/registered-project/production.json",
      "workspaces/studio/projects/registered-project/delivery.json",
    ]) {
      expect(entryState(relative)).toBe("inventoried");
      expect(ledgerEntry(relative).refs.some((ref) => ref.startsWith("obj_"))).toBe(true);
    }
    expect(issueCount("MIGRATION_UNIT_MANIFEST_INVALID")).toBe(2);
    expect(issueCount("MIGRATION_CAPTIONS_MANIFEST_INVALID")).toBe(3);
    expect(issueCount("MIGRATION_ASSET_MANIFEST_INVALID")).toBe(1);
    expect(issueCount("MIGRATION_PRODUCTION_MANIFEST_INVALID")).toBe(1);
    expect(issueCount("MIGRATION_DELIVERY_MANIFEST_INVALID")).toBe(2);
    expect(ctx!.db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM units WHERE slug = 'bad-field'",
    ).get()?.count).toBe(0);
    expect(ctx!.db.query<{ count: number }, []>(
      `SELECT COUNT(*) AS count FROM presentation_caption_revisions caption
       JOIN unit_presentations presentation ON presentation.id = caption.presentation_id
       JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
       JOIN units unit ON unit.id = revision.unit_id
       WHERE unit.slug IN ('bad-caption-element', 'bad-caption-order', 'bad-caption-state')`,
    ).get()?.count).toBe(0);
    expect(ctx!.db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM units WHERE slug = 'bad-manifest-attempt'",
    ).get()?.count).toBe(0);
    expect(ctx!.db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM builds WHERE profile_json LIKE '%deep-invalid-control%'",
    ).get()?.count).toBe(0);
    expect(ctx!.db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM builds WHERE profile_json LIKE '%deep-valid-sibling%'",
    ).get()?.count).toBe(1);
    expect(ctx!.db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM publications WHERE url = 'https://site.example/deep-invalid-attempt'",
    ).get()?.count).toBe(0);
    expect(publicationStates("deep-valid-sibling"))
      .toEqual([{ publication: "published", run: "succeeded", attempts: 1 }]);
  });

  test("orders equal-time publication edges and blocks equal-time cycles", async () => {
    await setupFixture(({ project }) => {
      const deliveryDir = path.join(project, "delivery");
      fs.mkdirSync(deliveryDir, { recursive: true });
      writeJsonl(path.join(deliveryDir, "equal-time.jsonl"), [
        {
          id: "equal-child", unitId: "campaign", unitRevision: 2,
          platform: "instagram", provider: "postiz", accountId: "equal-child-account",
          status: "published", providerPublicationId: "equal-child-provider",
          revisedFrom: "equal-parent", createdAt: 2_000, submittedAt: 2_000, publishedAt: 2_000,
        },
        {
          id: "equal-skip", unitId: "campaign", unitRevision: 2,
          platform: "instagram", provider: "postiz", status: "idempotent-skip",
          originalPublicationId: "equal-parent", createdAt: 2_000,
        },
        {
          id: "equal-parent", unitId: "campaign", unitRevision: 2,
          platform: "instagram", provider: "postiz", accountId: "equal-parent-account",
          status: "published", providerPublicationId: "equal-parent-provider",
          createdAt: 2_000, submittedAt: 2_000, publishedAt: 2_000,
        },
        {
          id: "equal-cycle-a", unitId: "campaign", unitRevision: 2,
          platform: "instagram", provider: "postiz", accountId: "equal-cycle-a-account",
          status: "published", providerPublicationId: "equal-cycle-a-provider",
          revisedFrom: "equal-cycle-b", createdAt: 2_100, submittedAt: 2_100, publishedAt: 2_100,
        },
        {
          id: "equal-cycle-b", unitId: "campaign", unitRevision: 2,
          platform: "instagram", provider: "postiz", accountId: "equal-cycle-b-account",
          status: "published", providerPublicationId: "equal-cycle-b-provider",
          revisedFrom: "equal-cycle-a", createdAt: 2_100, submittedAt: 2_100, publishedAt: 2_100,
        },
      ]);
    });

    const first = importProductionAndDelivery(ctx!);
    expect(importProductionAndDelivery(ctx!)).toEqual(first);
    expect(revisedProviderId("equal-child")).toBe("equal-parent-provider");
    expect(ctx!.db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM activity_events WHERE action = 'publication.idempotent_skip'",
    ).get()?.count).toBe(2);
    for (const legacyId of ["equal-cycle-a", "equal-cycle-b"]) {
      expect(publicationStates(legacyId)).toEqual([]);
    }
    for (const externalId of ["equal-cycle-a-account", "equal-cycle-b-account"]) {
      expect(ctx!.db.query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM social_accounts WHERE external_id = ?",
      ).get(externalId)?.count).toBe(0);
    }
    expect(issueCount("MIGRATION_PUBLICATION_REVISED_FROM_INVALID")).toBeGreaterThanOrEqual(2);
  });

  test("keeps row ordinals and target slots collision-free at legacy boundaries", async () => {
    await setupFixture(({ project }) => {
      const targets = Array.from({ length: 1001 }, () => null) as Array<Record<string, unknown> | null>;
      targets[0] = { platform: "web", status: "published", url: "https://site.example/boundary-slot-0", publishedAt: 110 };
      targets[1000] = { platform: "web", status: "published", url: "https://site.example/boundary-slot-1000", createdAt: 120, publishedAt: 130 };
      const rows = [JSON.stringify({
        id: "boundary-target", unitId: "article", unitRevision: 1,
        provider: "manual", status: "partial", createdAt: 100, targets,
      })];
      rows.push(...Array.from({ length: 999 }, () => "null"));
      rows.push(JSON.stringify({
        id: "boundary-row-1001", unitId: "article", unitRevision: 1,
        platform: "web", provider: "manual", status: "published",
        url: "https://site.example/boundary-row-1001", createdAt: 200, publishedAt: 210,
      }));
      fs.writeFileSync(path.join(project, "publish-ledger.jsonl"), `${rows.join("\n")}\n`);
    });

    const first = importProductionAndDelivery(ctx!);
    expect(importProductionAndDelivery(ctx!)).toEqual(first);
    expect(ctx!.db.query<{ url: string }, []>(
      "SELECT url FROM publications WHERE url LIKE 'https://site.example/boundary-%' ORDER BY url",
    ).all()).toEqual([
      { url: "https://site.example/boundary-row-1001" },
      { url: "https://site.example/boundary-slot-0" },
      { url: "https://site.example/boundary-slot-1000" },
    ]);
  });
});

function publicationRow(
  id: string,
  url: string,
  createdAt: number,
  providerPublicationId?: string,
): Record<string, unknown> {
  return {
    id,
    unitId: "article",
    unitRevision: 1,
    platform: "web",
    provider: "manual",
    status: "published",
    url,
    ...(providerPublicationId ? { providerPublicationId } : {}),
    createdAt,
    publishedAt: createdAt + 10,
  };
}

function addPublicationProject(
  dataRoot: string,
  workspace: string,
  projectSlug: string,
  rows: readonly Record<string, unknown>[],
): void {
  const workspaceRoot = path.join(dataRoot, "workspaces", workspace);
  const project = path.join(workspaceRoot, "projects", projectSlug);
  fs.mkdirSync(project, { recursive: true });
  const workspaceManifest = path.join(workspaceRoot, "workspace.json");
  if (!fs.existsSync(workspaceManifest)) {
    fs.writeFileSync(workspaceManifest, `${JSON.stringify({ slug: workspace, name: workspace }, null, 2)}\n`);
  }
  fs.writeFileSync(path.join(project, "project.json"), `${JSON.stringify({ id: projectSlug, workspace }, null, 2)}\n`);
  const unit = path.join(project, "units", "article");
  fs.mkdirSync(unit, { recursive: true });
  fs.writeFileSync(path.join(unit, "unit.json"), '{"id":"article","revision":1,"format":"article","media":[],"body":"Reference"}\n');
  writeJsonl(path.join(project, "publish-ledger.jsonl"), rows);
}

function writeJsonl(file: string, rows: readonly Record<string, unknown>[]): void {
  fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

function revisedProviderId(legacyId: string): string | null | undefined {
  return ctx!.db.query<{ providerId: string | null }, [string]>(
    `SELECT original.provider_publication_id AS providerId
     FROM publications publication
     JOIN runs run ON run.id = publication.submission_run_id
     JOIN publications original ON original.id = publication.revised_from_publication_id
     WHERE json_extract(run.metadata_json, '$.legacyPublicationId') = ?`,
  ).get(legacyId)?.providerId;
}

function publicationStates(legacyId: string): Array<{ publication: string; run: string; attempts: number }> {
  return ctx!.db.query<{ publication: string; run: string; attempts: number }, [string]>(
    `SELECT publication.state AS publication, run.state AS run,
            (SELECT COUNT(*) FROM run_attempts attempt WHERE attempt.run_id = run.id) AS attempts
     FROM publications publication JOIN runs run ON run.id = publication.submission_run_id
     WHERE json_extract(run.metadata_json, '$.legacyPublicationId') = ?`,
  ).all(legacyId);
}

function revisionNumbers(kind: "artifact" | "composition", slug: string): number[] {
  if (kind === "artifact") {
    return ctx!.db.query<{ revisionNo: number }, [string]>(
      `SELECT revision.revision_no AS revisionNo
       FROM artifact_revisions revision JOIN artifacts artifact ON artifact.id = revision.artifact_id
       WHERE artifact.slug LIKE '%' || ? ORDER BY revision.revision_no`,
    ).all(slug).map((row) => row.revisionNo);
  }
  return ctx!.db.query<{ revisionNo: number }, [string]>(
    `SELECT revision.revision_no AS revisionNo
     FROM composition_revisions revision JOIN compositions composition ON composition.id = revision.composition_id
     WHERE composition.slug = ? ORDER BY revision.revision_no`,
  ).all(slug).map((row) => row.revisionNo);
}

function revisionBinding(
  sourcePath: string,
  kind: "artifact" | "composition",
): { identityId: string; revisionNo: number } {
  const refs = ledgerEntry(sourcePath).refs;
  const revisionId = refs.find((ref) => ref.startsWith(kind === "artifact" ? "arev_" : "crev_"));
  if (!revisionId) throw new Error(`Missing ${kind} revision ref for ${sourcePath}`);
  if (kind === "artifact") {
    const row = ctx!.db.query<{ identityId: string; revisionNo: number }, [string]>(
      "SELECT artifact_id AS identityId, revision_no AS revisionNo FROM artifact_revisions WHERE id = ?",
    ).get(revisionId);
    if (!row) throw new Error(`Missing Artifact revision ${revisionId}`);
    return row;
  }
  const row = ctx!.db.query<{ identityId: string; revisionNo: number }, [string]>(
    "SELECT composition_id AS identityId, revision_no AS revisionNo FROM composition_revisions WHERE id = ?",
  ).get(revisionId);
  if (!row) throw new Error(`Missing Composition revision ${revisionId}`);
  return row;
}

function addSameKindProduction(rootPath: string, url: string, createRoot = false): void {
  const project = path.join(rootPath, "projects", "legacy-registered");
  if (createRoot) {
    fs.mkdirSync(rootPath, { recursive: true });
    fs.writeFileSync(path.join(rootPath, "registry.json"), `${JSON.stringify({
      projects: { "legacy-registered": { path: "projects/legacy-registered" } },
    }, null, 2)}\n`);
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, "project.json"), '{"id":"legacy-registered","workspace":"default"}\n');
    fs.mkdirSync(path.join(project, "composition"), { recursive: true });
    fs.mkdirSync(path.join(project, "render"), { recursive: true });
    fs.writeFileSync(path.join(project, "composition", "production-source.html"), "<html>sibling</html>\n");
    fs.writeFileSync(path.join(project, "render", "production-master.mp4"), "sibling-output");
    fs.writeFileSync(path.join(project, "production.json"), `${JSON.stringify({ productions: [{
      sourceRevision: "composition/production-source.html",
      output: "render/production-master.mp4",
      profile: "master",
      completedAt: 100,
    }] }, null, 2)}\n`);
  }
  const unit = path.join(project, "units", "article");
  fs.mkdirSync(unit, { recursive: true });
  fs.writeFileSync(path.join(unit, "unit.json"), `${JSON.stringify({
    id: "article",
    revision: 1,
    format: "article",
    media: [],
    body: "Same-kind source",
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(project, "publish-ledger.jsonl"), `${JSON.stringify({
    id: "same-kind-pub",
    unitId: "article",
    unitRevision: 1,
    platform: "web",
    provider: "manual",
    status: "published",
    url,
    createdAt: 200,
    publishedAt: 210,
  })}\n`);
  fs.writeFileSync(path.join(project, "analytics.jsonl"), `${JSON.stringify({
    publicationId: "same-kind-pub",
    source: "manual",
    asOf: 300,
    createdAt: 301,
    views: 1,
  })}\n`);
}

async function setupFixture(mutate?: FixtureMutation): Promise<void> {
  root = makeTmpRoot("ralphy-migration-production");
  fixtureDir = fs.realpathSync(fs.mkdtempSync("/tmp/ralphy-mp-"));
  fixture = buildLegacyLibrary(fixtureDir);
  const project = fixture.paths.registeredProject;
  const articleManifest = path.join(project, "units", "article", "unit.json");
  const article = JSON.parse(fs.readFileSync(articleManifest, "utf8")) as Record<string, unknown>;
  article.manifestOnlyAttempt = {
    id: "manifest-only",
    platform: "web",
    provider: "manual",
    status: "published",
    url: "https://site.example/manifest-only",
    createdAt: 50,
    publishedAt: 60,
  };
  fs.writeFileSync(articleManifest, `${JSON.stringify(article, null, 2)}\n`);
  fs.writeFileSync(path.join(project, "publish-ledger.jsonl"), [
    JSON.stringify({ id: "accountless-failure", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", status: "failed", error: "account missing", failureStage: "account-resolution", createdAt: 100 }),
    JSON.stringify({ id: "slot-failed", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", accountId: "postiz-main", status: "failed", error: "provider rejected", failureStage: "provider", createdAt: 150 }),
    JSON.stringify({ id: "slot-success", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", accountId: "postiz-main", status: "published", providerPublicationId: "postiz-101", url: "https://social.example/101", createdAt: 200, submittedAt: 210, publishedAt: 220 }),
    JSON.stringify({ id: "partial-targets", unitId: "campaign", unitRevision: 2, provider: "postiz", status: "partial", createdAt: 230, targets: [
      { platform: "x", accountId: "postiz-x", status: "published", providerPublicationId: "postiz-x-1", url: "https://x.example/post/1", submittedAt: 240, publishedAt: 250 },
      { platform: "telegram", accountId: "postiz-telegram", status: "failed", error: "provider rejected", failureStage: "provider" },
    ] }),
    JSON.stringify({ id: "ledger-only", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", accountId: "postiz-main", status: "submitted", providerPublicationId: "postiz-104", createdAt: 260, submittedAt: 270 }),
    JSON.stringify({ id: "github-pages", unitId: "article", platform: "web", provider: "github-pages", status: "published", url: "https://site.example/article", createdAt: 300, publishedAt: 320 }),
    JSON.stringify({ id: "devto", unitId: "article", platform: "devto", provider: "dev.to", accountId: "devto-main", status: "published", providerPublicationId: "devto-1", url: "https://dev.to/example/post", createdAt: 330, submittedAt: 340, publishedAt: 350 }),
    JSON.stringify({ id: "hashnode", unitId: "article", platform: "hashnode", provider: "hashnode", accountId: "hashnode-main", status: "published", providerPublicationId: "hashnode-1", url: "https://blog.example/post", createdAt: 360, submittedAt: 370, publishedAt: 380 }),
    JSON.stringify({ id: "medium", unitId: "article", platform: "medium", provider: "medium", status: "approval-exported", createdAt: 400 }),
    JSON.stringify({ id: "manual", unitId: "article", platform: "web", provider: "manual", status: "published", url: "https://site.example/manual", createdAt: 500, publishedAt: 520 }),
    JSON.stringify({ id: "revision", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", accountId: "postiz-main", status: "published", providerPublicationId: "postiz-102", url: "https://social.example/102", revisedFrom: "slot-success", createdAt: 600, submittedAt: 610, publishedAt: 620 }),
    JSON.stringify({ id: "tiktok-path", unitId: "campaign", unitRevision: 2, platform: "tiktok", provider: "postiz", accountId: "postiz-tiktok", status: "submitted", providerPublicationId: "postiz-103", url: "https://www.tiktok.com/@creator/video/42", createdAt: 700, submittedAt: 710 }),
    JSON.stringify({ id: "skip", unitId: "campaign", unitRevision: 2, platform: "instagram", provider: "postiz", status: "idempotent-skip", originalPublicationId: "slot-success", createdAt: 800 }),
    "{malformed",
  ].join("\n") + "\n");
  fs.writeFileSync(path.join(project, "analytics.jsonl"), [
    JSON.stringify({ publicationId: "slot-success", source: "postiz", asOf: 1000, createdAt: 1001, views: 101, likes: 7, ctr: 0.25, retentionCurve: [{ pct: 50, watchRatio: 0.5 }], avgViewDurationSec: 3.5, note: "first", unknown: "kept" }),
    JSON.stringify({ publicationId: "github-pages", source: "manual", asOf: 1000, createdAt: 1002, views: null, raw: { rank: 2 } }),
    JSON.stringify({ publicationId: "slot-success", source: "postiz", asOf: 1000, createdAt: 1003, views: 102 }),
    JSON.stringify({ publicationId: "slot-success", source: "manual", asOf: 1000, createdAt: 1003, views: 50 }),
    "not-json",
  ].join("\n") + "\n");
  mutate?.({ project, fixture });

  const runId = "mig_00000000-0000-4000-8000-000000000005";
  const storeRoot = path.join(fixtureDir, "stage", ".ralphy");
  fs.mkdirSync(storeRoot, { recursive: true });
  const db = openDomainDbAt(storeRoot);
  const now = Date.now();
  db.prepare(
    `INSERT INTO migration_runs
     (id, stage_root_rel, recovery_root_rel, phase, created_at, updated_at)
     VALUES (?, 'stage', 'recovery', 'audited', ?, ?)`,
  ).run(runId, now, now);
  lock = acquireMaintenanceLock({ sourcePath: fixture.paths.currentRoot, runId });
  ctx = { db, storeRoot, sourceRoots: fixture.sourceRoots, runId };
  await inventoryLegacySource(ctx);
  importScopesAndDocuments(ctx);
  await stageInventoryObjects(ctx, { copyMode: "copy", freeBytes: 4 * 1024 ** 3 });
}

function issueCount(code: string): number {
  return ctx!.db.query<{ count: number }, [string, string]>(
    "SELECT COUNT(*) AS count FROM migration_issues WHERE migration_run_id = ? AND code = ?",
  ).get(ctx!.runId, code)?.count ?? 0;
}

function ledgerEntry(sourcePath: string): { refs: string[] } {
  const row = ctx!.db.query<{ refs: string }, [string, string]>(
    `SELECT target_refs_json AS refs FROM migration_entries
     WHERE migration_run_id = ? AND source_path = ?`,
  ).get(ctx!.runId, sourcePath);
  if (!row) throw new Error(`Missing migration entry: ${sourcePath}`);
  return { refs: JSON.parse(row.refs) as string[] };
}

function generationLedger(sourcePath: string): {
  state: string;
  terminalAt: number | null;
  refs: string[];
  rawEvidenceObjectId: string | null;
} {
  const row = ctx!.db.query<{
    state: string;
    terminalAt: number | null;
    refs: string;
    rawEvidenceObjectId: string | null;
  }, [string, string]>(
    `SELECT state, terminal_at AS terminalAt, target_refs_json AS refs,
            raw_evidence_object_id AS rawEvidenceObjectId
     FROM migration_entries WHERE migration_run_id = ? AND source_path = ?`,
  ).get(ctx!.runId, sourcePath);
  if (!row) throw new Error(`Missing migration entry: ${sourcePath}`);
  return { ...row, refs: JSON.parse(row.refs) as string[] };
}

function productionDomainIds(): Record<string, string[]> {
  return Object.fromEntries([
    "compositions", "composition_revisions", "composition_revision_files", "artifacts",
    "artifact_revisions", "builds", "build_outputs", "runs", "run_attempts", "run_results",
  ].map((table) => [
    table,
    ctx!.db.query<{ id: string }, []>(`SELECT id FROM ${table} ORDER BY id`).all().map(({ id }) => id),
  ]));
}

function assertExactBuildBinding(expected: {
  compositionPath: string;
  renderPath: string;
  bytes: number;
}): void {
  const prefix = "workspaces/studio/projects/registered-project/";
  const sourceRefs = ledgerEntry(prefix + expected.compositionPath).refs;
  const renderRefs = ledgerEntry(prefix + expected.renderPath).refs;
  const sourceObjectId = sourceRefs.find((ref) => ref.startsWith("obj_"));
  const compositionRevisionId = sourceRefs.find((ref) => ref.startsWith("crev_"));
  const compositionFileId = sourceRefs.find((ref) => ref.startsWith("cfile_"));
  const renderObjectId = renderRefs.find((ref) => ref.startsWith("obj_"));
  const artifactRevisionId = renderRefs.find((ref) => ref.startsWith("arev_"));
  const buildId = renderRefs.find((ref) => ref.startsWith("build_"));
  const outputId = renderRefs.find((ref) => ref.startsWith("output_"));
  expect([
    sourceObjectId, compositionRevisionId, compositionFileId, renderObjectId,
    artifactRevisionId, buildId, outputId,
  ].every((value) => value !== undefined)).toBe(true);
  const row = ctx!.db.query<{
    compositionRevisionId: string;
    compositionFileId: string;
    sourceObjectId: string;
    outputId: string;
    artifactRevisionId: string;
    outputObjectId: string;
    position: number;
    bytes: number;
  }, [string]>(
    `SELECT build.composition_revision_id AS compositionRevisionId,
            file.id AS compositionFileId,
            file.object_id AS sourceObjectId, output.id AS outputId,
            output.artifact_revision_id AS artifactRevisionId,
            artifact.object_id AS outputObjectId, output.position, object.bytes
     FROM builds build
     JOIN composition_revision_files file
       ON file.composition_revision_id = build.composition_revision_id
     JOIN build_outputs output ON output.build_id = build.id
     JOIN artifact_revisions artifact ON artifact.id = output.artifact_revision_id
     JOIN objects object ON object.id = artifact.object_id
     WHERE build.id = ?`,
  ).get(buildId!);
  expect(row).toEqual({
    compositionRevisionId,
    compositionFileId,
    sourceObjectId,
    outputId,
    artifactRevisionId,
    outputObjectId: renderObjectId,
    position: 0,
    bytes: expected.bytes,
  });
}

function entryState(sourcePath: string): string {
  const row = ctx!.db.query<{ state: string }, [string, string]>(
    `SELECT state FROM migration_entries
     WHERE migration_run_id = ? AND source_path = ?`,
  ).get(ctx!.runId, sourcePath);
  if (!row) throw new Error(`Missing migration entry: ${sourcePath}`);
  return row.state;
}

function workEntry(sourcePath: string): { disposition: string; state: string; refs: string[] } {
  const row = ctx!.db.query<{ disposition: string; state: string; refs: string }, [string, string]>(
    `SELECT disposition, state, target_refs_json AS refs FROM migration_entries
     WHERE migration_run_id = ? AND source_path = ?`,
  ).get(ctx!.runId, sourcePath);
  if (!row) throw new Error(`Missing migration entry: ${sourcePath}`);
  return { disposition: row.disposition, state: row.state, refs: JSON.parse(row.refs) as string[] };
}

function domainRowExists(id: string): boolean {
  const prefix = id.slice(0, id.indexOf("_"));
  const table = ({
    art: "artifacts",
    arev: "artifact_revisions",
    comp: "compositions",
    crev: "composition_revisions",
    cfile: "composition_revision_files",
    build: "builds",
    output: "build_outputs",
    run: "runs",
  } as Record<string, string>)[prefix];
  if (!table) return true;
  return (ctx!.db.query<{ count: number }, [string]>(
    `SELECT COUNT(*) AS count FROM ${table} WHERE id = ?`,
  ).get(id)?.count ?? 0) === 1;
}
