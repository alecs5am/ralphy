import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  acquireMaintenanceLock,
  inventoryLegacySource,
  releaseMaintenanceLock,
} from "../../cli/lib/migration/inventory.js";
import {
  importProductionAndDelivery,
  importScopesAndDocuments,
} from "../../cli/lib/migration/import.js";
import { stageInventoryObjects } from "../../cli/lib/migration/staging.js";
import type { MigrationContext, MigrationLock } from "../../cli/lib/migration/types.js";
import { openDomainDbAt } from "../../cli/lib/store/db.js";
import {
  buildLegacyLibrary,
  type LegacyFixture,
} from "../fixtures/migration/build-legacy-library.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let root: TmpRoot | null = null;
let fixture: LegacyFixture | null = null;
let lock: MigrationLock | null = null;
let ctx: MigrationContext | null = null;
let fixtureDir: string | null = null;

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
  test("reconstructs immutable production history from explicit provenance", async () => {
    await setupFixture();

    expect(entryState("workspaces/studio/projects/registered-project/production.json")).toBe("inventoried");
    expect(entryState("workspaces/studio/projects/registered-project/composition/index.html")).toBe("staged");

    const first = importProductionAndDelivery(ctx!);
    const replay = importProductionAndDelivery(ctx!);

    expect(replay).toEqual(first);
    expect(first).toMatchObject({ units: 10, publications: 13, metrics: 4 });

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
    ).get()?.count).toBeGreaterThan(0);

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
});

async function setupFixture(): Promise<void> {
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
    JSON.stringify({ id: "accountless-failure", unitId: "campaign", platform: "instagram", provider: "postiz", status: "failed", error: "account missing", failureStage: "account-resolution", createdAt: 100 }),
    JSON.stringify({ id: "slot-failed", unitId: "campaign", platform: "instagram", provider: "postiz", accountId: "postiz-main", status: "failed", error: "provider rejected", failureStage: "provider", createdAt: 150 }),
    JSON.stringify({ id: "slot-success", unitId: "campaign", platform: "instagram", provider: "postiz", accountId: "postiz-main", status: "published", providerPublicationId: "postiz-101", url: "https://social.example/101", createdAt: 200, submittedAt: 210, publishedAt: 220 }),
    JSON.stringify({ id: "partial-targets", unitId: "campaign", provider: "postiz", status: "partial", createdAt: 230, targets: [
      { platform: "x", accountId: "postiz-x", status: "published", providerPublicationId: "postiz-x-1", url: "https://x.example/post/1", submittedAt: 240, publishedAt: 250 },
      { platform: "telegram", accountId: "postiz-telegram", status: "failed", error: "provider rejected", failureStage: "provider" },
    ] }),
    JSON.stringify({ id: "ledger-only", unitId: "campaign", platform: "instagram", provider: "postiz", accountId: "postiz-main", status: "submitted", providerPublicationId: "postiz-104", createdAt: 260, submittedAt: 270 }),
    JSON.stringify({ id: "github-pages", unitId: "article", platform: "web", provider: "github-pages", status: "published", url: "https://site.example/article", createdAt: 300, publishedAt: 320 }),
    JSON.stringify({ id: "devto", unitId: "article", platform: "devto", provider: "dev.to", accountId: "devto-main", status: "published", providerPublicationId: "devto-1", url: "https://dev.to/example/post", createdAt: 330, submittedAt: 340, publishedAt: 350 }),
    JSON.stringify({ id: "hashnode", unitId: "article", platform: "hashnode", provider: "hashnode", accountId: "hashnode-main", status: "published", providerPublicationId: "hashnode-1", url: "https://blog.example/post", createdAt: 360, submittedAt: 370, publishedAt: 380 }),
    JSON.stringify({ id: "medium", unitId: "article", platform: "medium", provider: "medium", status: "approval-exported", createdAt: 400 }),
    JSON.stringify({ id: "manual", unitId: "article", platform: "web", provider: "manual", status: "published", url: "https://site.example/manual", createdAt: 500, publishedAt: 520 }),
    JSON.stringify({ id: "revision", unitId: "campaign", platform: "instagram", provider: "postiz", accountId: "postiz-main", status: "published", providerPublicationId: "postiz-102", url: "https://social.example/102", revisedFrom: "slot-success", createdAt: 600, submittedAt: 610, publishedAt: 620 }),
    JSON.stringify({ id: "tiktok-path", unitId: "campaign", platform: "tiktok", provider: "postiz", accountId: "postiz-tiktok", status: "submitted", providerPublicationId: "postiz-103", url: "https://www.tiktok.com/@creator/video/42", createdAt: 700, submittedAt: 710 }),
    JSON.stringify({ id: "skip", unitId: "campaign", platform: "instagram", provider: "postiz", status: "idempotent-skip", originalPublicationId: "slot-success", createdAt: 800 }),
    "{malformed",
  ].join("\n") + "\n");
  fs.writeFileSync(path.join(project, "analytics.jsonl"), [
    JSON.stringify({ publicationId: "slot-success", source: "postiz", asOf: 1000, createdAt: 1001, views: 101, likes: 7, ctr: 0.25, retentionCurve: [{ pct: 50, watchRatio: 0.5 }], avgViewDurationSec: 3.5, note: "first", unknown: "kept" }),
    JSON.stringify({ publicationId: "github-pages", source: "manual", asOf: 1000, createdAt: 1002, views: null, raw: { rank: 2 } }),
    JSON.stringify({ publicationId: "slot-success", source: "postiz", asOf: 1000, createdAt: 1003, views: 102 }),
    JSON.stringify({ publicationId: "slot-success", source: "manual", asOf: 1000, createdAt: 1003, views: 50 }),
    "not-json",
  ].join("\n") + "\n");

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

function ledgerEntry(sourcePath: string): { refs: string[] } {
  const row = ctx!.db.query<{ refs: string }, [string, string]>(
    `SELECT target_refs_json AS refs FROM migration_entries
     WHERE migration_run_id = ? AND source_path = ?`,
  ).get(ctx!.runId, sourcePath);
  if (!row) throw new Error(`Missing migration entry: ${sourcePath}`);
  return { refs: JSON.parse(row.refs) as string[] };
}

function entryState(sourcePath: string): string {
  const row = ctx!.db.query<{ state: string }, [string, string]>(
    `SELECT state FROM migration_entries
     WHERE migration_run_id = ? AND source_path = ?`,
  ).get(ctx!.runId, sourcePath);
  if (!row) throw new Error(`Missing migration entry: ${sourcePath}`);
  return row.state;
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
