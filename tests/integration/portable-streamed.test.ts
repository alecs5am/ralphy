// #584 streamed portable packages: row chunks with per-chunk digests, a
// manifest that does not grow with row count, row-identical round trips for
// every exported table, and import of packages written by the version 2
// (inline-manifest) writer.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import type { Database } from "bun:sqlite";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import { startRun, finishRun } from "../../cli/lib/store/runs.js";
import { exportWorkspacePackage, importWorkspaceArchiveFile, importWorkspacePackage } from "../../cli/lib/store/portable.js";
import { getObjectRow, resolveObjectPath } from "../../cli/lib/store/internal-objects.js";
import { PORTABLE_TABLES, type PortableRecord } from "../../cli/lib/store/internal-portable-data.js";
import { readPortableArchive, loadPortableTables } from "../../cli/lib/store/internal-portable-files.js";
import { CHUNK_ROWS } from "../../cli/lib/store/internal-portable-archive.js";
import { seedSyntheticTrendCorpus } from "../helpers/synthetic-trend-corpus.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

// The 120k-video acceptance corpus runs with RALPHY_PORTABLE_LARGE=1 (about a
// minute); the default suite round-trips 20k videos.
const LARGE = process.env.RALPHY_PORTABLE_LARGE === "1";
const VIDEOS = LARGE ? 120_000 : 20_000;
// Written by the pre-#584 writer (inline tables, manifest version 2, schema 12).
// A migration that changes SCHEMA_VERSION makes this package unsupported, as it
// does every older package; decide old-package handling explicitly at that point.
const V2_FIXTURE = path.join(import.meta.dir, "..", "fixtures", "portable", "v2-workspace.tar");

let tmp: TmpRoot;
beforeEach(() => { tmp = makeTmpRoot("ralphy-portable-streamed"); });
afterEach(() => { closeDomainDb(); tmp.cleanup(); });

const domainId = /\b[a-z][a-z0-9]*_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;
type Table = (typeof PORTABLE_TABLES)[number];
const tableByName = new Map(PORTABLE_TABLES.map((table) => [table.name, table]));

function scope(table: Table): string {
  if (table.name === "workspaces") return "id = ?";
  if (table.workspace) return "workspace_id = ?";
  const [column, owner] = table.owner!;
  return `"${column}" IN (SELECT id FROM "${owner}" WHERE ${scope(tableByName.get(owner)!)})`;
}

/** Every exported table of a workspace as sorted canonical rows. */
function snapshot(db: Database, workspaceId: string, translate: (table: Table, row: PortableRecord) => PortableRecord = (_table, row) => row): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const packageObjects = new Set(db.query<{ id: string }, [string]>("SELECT id FROM objects WHERE workspace_id = ? AND mime LIKE 'application/vnd.ralphy.workspace%'").all(workspaceId).map((row) => row.id));
  const exportedRuns = new Set(db.query<{ id: string }, [string]>("SELECT id FROM runs WHERE workspace_id = ? AND kind NOT IN ('workspace.export', 'workspace.import')").all(workspaceId).map((row) => row.id));
  for (const table of PORTABLE_TABLES) {
    let rows = db.query<PortableRecord, string[]>(`SELECT * FROM "${table.name}" WHERE ${scope(table)}`).all(workspaceId);
    if (table.name === "runs") rows = rows.filter((row) => exportedRuns.has(String(row.id)));
    if (table.name === "objects") rows = rows.filter((row) => !String(row.mime).startsWith("application/vnd.ralphy.workspace"));
    if (table.name === "activity_events") rows = rows.filter((row) => !/^workspace\.(?:export|import)/.test(String(row.action)) && (row.entity_type !== "run" || exportedRuns.has(String(row.entity_id)))
      && (row.entity_type !== "object" || !packageObjects.has(String(row.entity_id))));
    out[table.name] = rows.map((row) => {
      const value = translate(table, row);
      if (table.name === "workspaces") { delete value.slug; delete value.name; }
      return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
    }).sort();
  }
  return out;
}

/** Maps imported identities back to the source through the import receipt. */
function backTranslator(db: Database, idempotencyKey: string) {
  const row = db.query<{ metadata: string }, [string]>("SELECT metadata_json AS metadata FROM runs WHERE json_extract(metadata_json, '$.idempotencyKey') = ? AND state = 'succeeded'").get(idempotencyKey)!;
  const mapping = (JSON.parse(row.metadata) as { mapping: Array<{ oldType: string; oldId: string; newId: string }> }).mapping;
  const strings = new Map<string, string>();
  const numbers = new Map<string, number>();
  for (const item of mapping) {
    if (/^[a-z]+_/.test(item.oldId)) strings.set(item.newId, item.oldId);
    else numbers.set(`${item.oldType}:${item.newId}`, Number(item.oldId));
  }
  return (table: Table, input: PortableRecord): PortableRecord => {
    const row: PortableRecord = {};
    for (const [key, value] of Object.entries(input)) row[key] = typeof value === "string" ? value.replace(domainId, (id) => strings.get(id) ?? id) : value;
    if (!table.prefix && typeof input.id === "number") row.id = numbers.get(`${table.type}:${input.id}`) ?? -1;
    return row;
  };
}

describe("streamed portable package (#584)", () => {
  test(`round-trips a ${VIDEOS.toLocaleString("en-US")}-video trend corpus row-identically with a manifest that does not grow with rows`, async () => {
    const workspace = createWorkspace({ slug: "corpus", name: "Corpus" });
    const run = startRun({ workspaceId: workspace.id, kind: "trends.ingest", label: "Synthetic corpus" });
    finishRun(run.id, { state: "succeeded" });
    const db = openDomainDb();
    const counts = seedSyntheticTrendCorpus(db, { workspaceId: workspace.id, runId: run.id, videos: VIDEOS });
    const started = performance.now();
    const exported = await exportWorkspacePackage({ workspaceId: workspace.id });
    const exportMs = performance.now() - started;
    expect(exported.manifestSummary.version).toBe(3);
    expect(exported.manifestSummary.entityCounts).toMatchObject({ trend_video: counts.videos, trend_metric_snapshot: counts.snapshots, trend_cohort_label: counts.labels, trend_creator: counts.creators, trend_niche_member: counts.members });

    const packagePath = resolveObjectPath(getObjectRow(db, exported.packageObjectId)!);
    const archive = await readPortableArchive(packagePath);
    try {
      expect(archive.manifest.version).toBe(3);
      if (archive.manifest.version !== 3) throw new Error("unreachable");
      const manifestBytes = archive.reader.size("manifest.json")!;
      // Roughly 150 bytes per chunk entry; the 64 MiB cap no longer binds.
      expect(manifestBytes).toBeLessThan(64 * 1024);
      expect(Math.max(...archive.manifest.rows.map((chunk) => chunk.rows))).toBeLessThanOrEqual(CHUNK_ROWS);
      expect(archive.manifest.rows.filter((chunk) => chunk.table === "trend_videos").reduce((total, chunk) => total + chunk.rows, 0)).toBe(counts.videos);
    } finally { archive.reader.close(); }

    const importStarted = performance.now();
    const imported = await importWorkspacePackage({ packageObjectId: exported.packageObjectId, idempotencyKey: "streamed-roundtrip", workspaceSlug: "corpus-copy" });
    const importMs = performance.now() - importStarted;
    const source = snapshot(db, workspace.id);
    const target = snapshot(db, imported.workspaceId, backTranslator(db, "streamed-roundtrip"));
    for (const { name } of PORTABLE_TABLES) {
      expect(target[name].length, name).toBe(source[name].length);
      expect(target[name], name).toEqual(source[name]);
    }
    expect(source.trend_videos.length).toBe(counts.videos);
    // Baseline caches stay out of the package, as before.
    expect(exported.manifestSummary.entityCounts).not.toHaveProperty("trend_baseline");
    console.log(`#584 ${VIDEOS} videos: export ${Math.round(exportMs)} ms, import ${Math.round(importMs)} ms, package ${fs.statSync(packagePath).size} bytes, rss ${Math.round(process.memoryUsage().rss / 1024 ** 2)} MiB`);
  }, LARGE ? 600_000 : 120_000);

  test("imports a version 2 package from the previous writer with its rows intact", async () => {
    const archive = await readPortableArchive(V2_FIXTURE);
    let expected: Record<string, PortableRecord[]>;
    try {
      expect(archive.manifest.version).toBe(2);
      expected = loadPortableTables(archive, true);
    } finally { archive.reader.close(); }
    const imported = await importWorkspaceArchiveFile({ filePath: V2_FIXTURE, idempotencyKey: "v2-fixture" });
    const db = openDomainDb();
    const back = backTranslator(db, "v2-fixture");
    const target = snapshot(db, imported.workspaceId, back);
    for (const table of PORTABLE_TABLES.filter(({ name }) => name.startsWith("trend_"))) {
      const rows = expected[table.name].map((row) => JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))))).sort();
      expect(rows.length, table.name).toBeGreaterThan(0);
      expect(target[table.name], table.name).toEqual(rows);
    }
    for (const { name } of PORTABLE_TABLES) expect(target[name].length, name).toBe(expected[name].length);
    const object = db.query<{ id: string }, [string]>("SELECT id FROM objects WHERE workspace_id = ?").get(imported.workspaceId)!;
    expect(fs.readFileSync(resolveObjectPath(getObjectRow(db, object.id)!), "utf8")).toBe("v2 object bytes");
  });

  test("refuses a package whose row chunk does not match its digest", async () => {
    const workspace = createWorkspace({ slug: "tamper", name: "Tamper" });
    const run = startRun({ workspaceId: workspace.id, kind: "trends.ingest" });
    finishRun(run.id, { state: "succeeded" });
    seedSyntheticTrendCorpus(openDomainDb(), { workspaceId: workspace.id, runId: run.id, videos: 50 });
    const exported = await exportWorkspacePackage({ workspaceId: workspace.id });
    const copy = path.join(tmp.dir, "tampered.workspace.tar");
    fs.copyFileSync(resolveObjectPath(getObjectRow(openDomainDb(), exported.packageObjectId)!), copy);
    const bytes = fs.readFileSync(copy);
    const at = bytes.indexOf("v77000000000007");
    expect(at).toBeGreaterThan(0);
    bytes[at + 3] = "9".charCodeAt(0);
    fs.writeFileSync(copy, bytes);
    const before = openDomainDb().query("SELECT id FROM workspaces ORDER BY id").all();
    await expect(importWorkspaceArchiveFile({ filePath: copy, idempotencyKey: "tampered" })).rejects.toThrow("checksum");
    expect(openDomainDb().query("SELECT id FROM workspaces ORDER BY id").all()).toEqual(before);
  });
});
