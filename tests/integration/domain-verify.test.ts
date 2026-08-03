import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  addArtifactRevision,
  createArtifact,
} from "../../cli/lib/store/artifacts.js";
import {
  completeBuild,
  createComposition,
  putCompositionSource,
  reviseComposition,
  sealCompositionRevision,
  selectCompositionRevision,
  startBuild,
} from "../../cli/lib/store/compositions.js";
import {
  closeDomainDb,
  domainDbPath,
  openDomainDb,
} from "../../cli/lib/store/db.js";
import {
  createDocument,
  reviseDocument,
} from "../../cli/lib/store/documents.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import {
  finishRun,
  recordRunObject,
  recordRunResult,
  startRun,
} from "../../cli/lib/store/runs.js";
import {
  createProject,
  createWorkspace,
  upsertSocialAccount,
} from "../../cli/lib/store/scopes.js";
import { StoreConflictError } from "../../cli/lib/store/types.js";
import { startAgentSession } from "../../cli/lib/store/sessions.js";
import {
  claimPublication,
  claimPublicationStatusLookup,
  createUnit,
  finishPublicationClaim,
  finishPublicationStatusLookup,
  recordPublication,
  reviseUnit,
  selectUnitRevision,
} from "../../cli/lib/store/units.js";
import {
  verifyDomainStore,
  type BuildChainEntity,
  type BuildChainReason,
  type DomainVerificationReport,
  type RevisionChainEntity,
  type RevisionChainReason,
  type UnitChainEntity,
  type UnitChainReason,
} from "../../cli/lib/store/verify.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { storedObjectPath } from "../helpers/stored-object.js";
import { getUnitAggregate as getUnit } from "../helpers/unit-aggregate.js";

let roots: TmpRoot[] = [];

function makeRoot(): TmpRoot {
  const root = makeTmpRoot("ralphy-domain-verify");
  roots.push(root);
  return root;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function writeFile(root: TmpRoot, relativePath: string, value: string): string {
  const filePath = path.join(root.dir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
  return filePath;
}

async function publicationFixture(root: TmpRoot, slug: string) {
  const workspace = createWorkspace({ slug: `${slug}-workspace`, name: slug });
  const project = createProject({
    workspaceId: workspace.id,
    slug: `${slug}-project`,
    name: slug,
  });
  const object = await ingestObject({
    scope: { workspaceId: workspace.id, projectId: project.id },
    sourcePath: writeFile(root, `${slug}/image.png`, slug),
    originalName: "image.png",
    mime: "image/png",
    storageClass: "durable",
  });
  const artifact = createArtifact({
    projectId: project.id,
    slug: `${slug}-artifact`,
    kind: "image",
  });
  const artifactRevision = addArtifactRevision({
    artifactId: artifact.id,
    objectId: object.id,
    state: "approved",
  });
  const unit = createUnit({
    projectId: project.id,
    slug: `${slug}-unit`,
    format: "image",
  });
  const unitRevision = reviseUnit({
    unitId: unit.id,
    expectedLatestRevisionId: null,
    items: [{ artifactRevisionId: artifactRevision.id, role: "image", position: 0 }],
    presentations: [{ platform: "tiktok", items: [] }],
  });
  selectUnitRevision({
    unitId: unit.id,
    revisionId: unitRevision.id,
    expectedSelectedRevisionId: null,
  });
  const presentation = getUnit(unit.id).revisions[0]!.presentations[0]!;
  const account = upsertSocialAccount({
    workspaceId: workspace.id,
    platform: "tiktok",
    externalId: `${slug}-account`,
  });
  const submissionRun = startRun({
    projectId: project.id,
    kind: "publication-submit",
  });
  const publication = recordPublication({
    presentationId: presentation.id,
    socialAccountId: account.id,
    submissionRunId: submissionRun.id,
    rail: "postiz",
    idempotencyKey: `${slug}-publication`,
  });
  return {
    workspace,
    project,
    presentation,
    account,
    submissionRun,
    publication,
  };
}

function dropPublicationTriggers(db: ReturnType<typeof openDomainDb>): void {
  for (const { name } of db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'publications'",
    )
    .all()) {
    db.exec(`DROP TRIGGER "${name}"`);
  }
}

type Covers<Union, Values extends readonly unknown[]> =
  Exclude<Union, Values[number]> extends never ? true : false;

const revisionChainEntities = [
  "document",
  "document-revision",
  "artifact",
  "artifact-revision",
  "evaluation",
  "run",
  "run-attempt",
  "run-result",
] as const satisfies readonly RevisionChainEntity[];
const revisionChainReasons = [
  "missing-pointer",
  "foreign-pointer",
  "latest-not-greatest",
  "parent-mismatch",
  "revision-number-mismatch",
  "scope-mismatch",
  "missing-target",
  "run-lifecycle-mismatch",
  "run-result-mismatch",
] as const satisfies readonly RevisionChainReason[];
const buildChainEntities = [
  "composition",
  "composition-revision",
  "composition-file",
  "composition-input",
  "build",
  "build-output",
  "build-binding",
] as const satisfies readonly BuildChainEntity[];
const buildChainReasons = [
  "missing-pointer",
  "foreign-pointer",
  "latest-not-greatest",
  "selected-unsealed",
  "parent-mismatch",
  "revision-number-mismatch",
  "scope-mismatch",
  "unsealed-input",
  "position-gap",
  "missing-output",
  "binding-mismatch",
  "build-lifecycle-mismatch",
] as const satisfies readonly BuildChainReason[];
const unitChainEntities = [
  "unit",
  "unit-revision",
  "unit-item",
  "presentation",
  "caption-revision",
  "publication",
  "metric-snapshot",
] as const satisfies readonly UnitChainEntity[];
const unitChainReasons = [
  "missing-pointer",
  "foreign-pointer",
  "latest-not-greatest",
  "selected-unsealed",
  "parent-mismatch",
  "revision-number-mismatch",
  "scope-mismatch",
  "unsealed-graph",
  "position-gap",
  "presentation-mismatch",
  "publication-lifecycle-mismatch",
  "claim-fence-mismatch",
  "run-result-mismatch",
  "metric-window-mismatch",
] as const satisfies readonly UnitChainReason[];

const chainVocabularyCoverage: {
  revisionEntities: Covers<RevisionChainEntity, typeof revisionChainEntities>;
  revisionReasons: Covers<RevisionChainReason, typeof revisionChainReasons>;
  buildEntities: Covers<BuildChainEntity, typeof buildChainEntities>;
  buildReasons: Covers<BuildChainReason, typeof buildChainReasons>;
  unitEntities: Covers<UnitChainEntity, typeof unitChainEntities>;
  unitReasons: Covers<UnitChainReason, typeof unitChainReasons>;
} = {
  revisionEntities: true,
  revisionReasons: true,
  buildEntities: true,
  buildReasons: true,
  unitEntities: true,
  unitReasons: true,
};

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

describe("domain store verification", () => {
  test("locks the closed chain routing vocabularies", () => {
    expect({
      revision: {
        entities: revisionChainEntities,
        reasons: revisionChainReasons,
      },
      build: { entities: buildChainEntities, reasons: buildChainReasons },
      unit: { entities: unitChainEntities, reasons: unitChainReasons },
      coverage: chainVocabularyCoverage,
    }).toEqual({
      revision: {
        entities: [
          "document",
          "document-revision",
          "artifact",
          "artifact-revision",
          "evaluation",
          "run",
          "run-attempt",
          "run-result",
        ],
        reasons: [
          "missing-pointer",
          "foreign-pointer",
          "latest-not-greatest",
          "parent-mismatch",
          "revision-number-mismatch",
          "scope-mismatch",
          "missing-target",
          "run-lifecycle-mismatch",
          "run-result-mismatch",
        ],
      },
      build: {
        entities: [
          "composition",
          "composition-revision",
          "composition-file",
          "composition-input",
          "build",
          "build-output",
          "build-binding",
        ],
        reasons: [
          "missing-pointer",
          "foreign-pointer",
          "latest-not-greatest",
          "selected-unsealed",
          "parent-mismatch",
          "revision-number-mismatch",
          "scope-mismatch",
          "unsealed-input",
          "position-gap",
          "missing-output",
          "binding-mismatch",
          "build-lifecycle-mismatch",
        ],
      },
      unit: {
        entities: [
          "unit",
          "unit-revision",
          "unit-item",
          "presentation",
          "caption-revision",
          "publication",
          "metric-snapshot",
        ],
        reasons: [
          "missing-pointer",
          "foreign-pointer",
          "latest-not-greatest",
          "selected-unsealed",
          "parent-mismatch",
          "revision-number-mismatch",
          "scope-mismatch",
          "unsealed-graph",
          "position-gap",
          "presentation-mismatch",
          "publication-lifecycle-mismatch",
          "claim-fence-mismatch",
          "run-result-mismatch",
          "metric-window-mismatch",
        ],
      },
      coverage: {
        revisionEntities: true,
        revisionReasons: true,
        buildEntities: true,
        buildReasons: true,
        unitEntities: true,
        unitReasons: true,
      },
    });
  });

  test("does not create or migrate an absent store", () => {
    const root = makeRoot();
    closeDomainDb();
    const before = fs.readdirSync(path.join(root.dir, ".ralphy"));

    expect(() => verifyDomainStore()).toThrow("Domain store is unavailable");
    expect(fs.existsSync(domainDbPath())).toBe(false);
    expect(fs.readdirSync(path.join(root.dir, ".ralphy"))).toEqual(before);
  });

  test("redacts SQLite diagnostics for an unreadable store", () => {
    const root = makeRoot();
    closeDomainDb();
    fs.writeFileSync(domainDbPath(), "customer-secret-database-bytes");

    expect(() => verifyDomainStore()).toThrow("Domain store verification failed");
    try {
      verifyDomainStore();
    } catch (error) {
      expect(String(error)).not.toContain("customer-secret");
      expect(String(error)).not.toContain(root.dir);
    }
  });

  test("returns the exact redacted report for a healthy empty store", () => {
    makeRoot();
    const db = openDomainDb();
    const before = {
      migrations: db
        .query<{ version: number; appliedAt: number }, []>(
          "SELECT version, applied_at AS appliedAt FROM schema_migrations ORDER BY version",
        )
        .all(),
      metadata: db
        .query<{ singleton: number; storeId: string }, []>(
          "SELECT singleton, store_id AS storeId FROM store_metadata",
        )
        .all(),
    };

    const expected: DomainVerificationReport = {
      integrity: "ok",
      hashObjects: false,
      integrityCheck: ["ok"],
      foreignKeyViolations: [],
      missingObjects: [],
      objectFileIssues: [],
      hashMismatches: [],
      runObjectIssues: [],
      absolutePathRows: [],
      dataUrlRows: [],
      invalidJsonRows: [],
      binaryPayloadRows: [],
      brokenRevisionChains: [],
      brokenBuildChains: [],
      brokenUnitChains: [],
      sessionProvenanceIssues: [],
      unreferencedObjects: [],
      orphanedObjectPaths: [],
      filesystemIssues: [],
    };

    expect(verifyDomainStore()).toEqual(expected);
    expect({
      migrations: db
        .query<{ version: number; appliedAt: number }, []>(
          "SELECT version, applied_at AS appliedAt FROM schema_migrations ORDER BY version",
        )
        .all(),
      metadata: db
        .query<{ singleton: number; storeId: string }, []>(
          "SELECT singleton, store_id AS storeId FROM store_metadata",
        )
        .all(),
    }).toEqual(before);
  });

  test("maps foreign-key diagnostics to the exact redacted fields", () => {
    makeRoot();
    const db = openDomainDb();
    db.exec("PRAGMA foreign_keys = OFF");
    try {
      db.prepare(
        `INSERT INTO projects
         (id, workspace_id, slug, name, created_at, updated_at)
         VALUES ('project-orphan', 'workspace-secret-missing', 'orphan',
                 'Orphan', 1, 1)`,
      ).run();
    } finally {
      db.exec("PRAGMA foreign_keys = ON");
    }
    const rowId = db
      .query<{ rowId: number }, []>(
        "SELECT rowid AS rowId FROM projects WHERE id = 'project-orphan'",
      )
      .get()!.rowId;

    const report = verifyDomainStore();
    expect(report.foreignKeyViolations).toContainEqual({
      table: "projects",
      rowId: String(rowId),
      parent: "workspaces",
      foreignKeyIndex: 0,
    });
    expect(JSON.stringify(report)).not.toContain("workspace-secret-missing");
  });

  test("checks Object and unpromoted RunObject bytes without buffering durable files", async () => {
    const root = makeRoot();
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const object = await ingestObject({
      scope: { workspaceId: workspace.id, projectId: project.id },
      sourcePath: writeFile(root, "source/object.bin", "object"),
      originalName: "object.bin",
      mime: "application/octet-stream",
      storageClass: "durable",
    });

    fs.writeFileSync(storedObjectPath(object.id), "tamper");
    const mutableFs = fs as unknown as {
      readSync: (...args: unknown[]) => number;
    };
    const originalRead = mutableFs.readSync;
    let durableReads = 0;
    mutableFs.readSync = (...args: unknown[]): number => {
      durableReads += 1;
      return originalRead(...args);
    };
    try {
      expect(verifyDomainStore().hashMismatches).toEqual([]);
    } finally {
      mutableFs.readSync = originalRead;
    }
    expect(durableReads).toBe(0);
    expect(verifyDomainStore({ hashObjects: true }).hashMismatches).toEqual([
      object.id,
    ]);

    const run = startRun({ projectId: project.id, kind: "generation" });
    writeFile(root, ".ralphy/tmp/run/evidence.bin", "evidence");
    writeFile(root, ".ralphy/tmp/run/no-hash.bin", "no-hash");
    const mismatched = recordRunObject({
      runId: run.id,
      path: "tmp/run/evidence.bin",
      purpose: "provider-response",
      state: "diagnostic",
      retention: "keep-on-failure",
      bytes: 8,
      sha256: "0".repeat(64),
    });
    const missingEvidence = recordRunObject({
      runId: run.id,
      path: "tmp/run/no-hash.bin",
      purpose: "provider-response",
      state: "diagnostic",
      retention: "keep-on-failure",
    });
    const missing = recordRunObject({
      runId: run.id,
      path: "tmp/run/missing.bin",
      purpose: "provider-response",
      state: "diagnostic",
      retention: "keep-on-failure",
      bytes: 7,
      sha256: sha256("missing"),
    });
    const disposable = recordRunObject({
      runId: run.id,
      path: "tmp/run/disposable.bin",
      purpose: "scratch",
      state: "working",
      retention: "ephemeral",
      bytes: 10,
      sha256: sha256("disposable"),
    });
    const promoted = recordRunObject({
      runId: run.id,
      path: "tmp/run/promoted-history-is-gone.bin",
      purpose: "source",
      state: "diagnostic",
      retention: "durable",
      bytes: 999,
      sha256: "9".repeat(64),
    });
    const db = openDomainDb();
    db.prepare("UPDATE run_objects SET object_id = ? WHERE id = ?").run(
      object.id,
      promoted.id,
    );
    db.exec("PRAGMA ignore_check_constraints = ON");
    try {
      db.prepare("UPDATE run_objects SET path = '/historical-secret.bin' WHERE id = ?")
        .run(promoted.id);
      db.prepare(
        `INSERT INTO run_objects
         (id, run_id, path, purpose, state, retention, created_at)
         VALUES ('escaped-run-object', ?, '../outside.bin', 'debug',
                 'diagnostic', 'keep-on-failure', 1)`,
      ).run(run.id);
    } finally {
      db.exec("PRAGMA ignore_check_constraints = OFF");
    }
    const runObjectReport = verifyDomainStore();
    const runObjectIssues = runObjectReport.runObjectIssues;

    expect(runObjectIssues).toContainEqual({
      table: "run_objects",
      rowId: mismatched.id,
      column: "sha256",
      reason: "hash-mismatch",
    });
    expect(runObjectIssues).toContainEqual({
      table: "run_objects",
      rowId: missingEvidence.id,
      column: "sha256",
      reason: "missing-hash-evidence",
    });
    expect(runObjectIssues).toContainEqual({
      table: "run_objects",
      rowId: missing.id,
      column: "path",
      reason: "missing-forensic-file",
    });
    expect(runObjectIssues.some((issue) => issue.rowId === disposable.id)).toBe(
      false,
    );
    expect(runObjectIssues.some((issue) => issue.rowId === promoted.id)).toBe(
      false,
    );
    expect(
      runObjectReport.absolutePathRows.some(
        (issue) => issue.table === "run_objects" && issue.rowId === promoted.id,
      ),
    ).toBe(false);
    expect(runObjectIssues).toContainEqual({
      table: "run_objects",
      rowId: "escaped-run-object",
      column: "path",
      reason: "outside-root",
    });

    db.prepare("DELETE FROM run_objects WHERE id IN (?, 'escaped-run-object')").run(
      promoted.id,
    );

    fs.rmSync(storedObjectPath(object.id));
    const orphan = writeFile(
      root,
      `.ralphy/buckets/${workspace.id}/shared/objects/orphan.bin`,
      "orphan",
    );
    const missingReport = verifyDomainStore({ hashObjects: true });
    expect(missingReport.missingObjects).toEqual([object.id]);
    expect(missingReport.orphanedObjectPaths).toContain(
      path.relative(path.join(root.dir, ".ralphy"), orphan).split(path.sep).join("/"),
    );
    expect(missingReport.unreferencedObjects).toContain(object.id);
  });

  test("treats farm as one reserved lstat-only boundary", () => {
    const root = makeRoot();
    openDomainDb();
    const farm = path.join(root.dir, ".ralphy", "farm");
    writeFile(root, ".ralphy/farm/buckets/x/objects/orphan.bin", "poison");
    writeFile(root, ".ralphy/farm/tmp/cache/legacy.json", "data:,poison");
    fs.symlinkSync("missing-target", path.join(farm, "child-link"));
    writeFile(root, ".ralphy/buckets/ignored-cache/file.bin", "cache");
    fs.symlinkSync(
      "missing-target",
      path.join(root.dir, ".ralphy", "buckets", "ignored-cache", "child-link"),
    );

    const healthy = verifyDomainStore();
    expect(healthy.orphanedObjectPaths).toEqual([]);
    expect(healthy.filesystemIssues).toEqual([]);

    fs.rmSync(farm, { recursive: true, force: true });
    fs.symlinkSync("missing-target", farm);
    expect(verifyDomainStore().filesystemIssues).toEqual([
      { relativePath: "farm", reason: "symlink" },
    ]);
  });

  test("rejects RunObject farm locators without touching a farm child", () => {
    const root = makeRoot();
    const workspace = createWorkspace({ slug: "farm-run-object", name: "Farm" });
    const run = startRun({ workspaceId: workspace.id, kind: "diagnostic" });
    const value = "private";
    writeFile(root, ".ralphy/farm/private.bin", value);
    const runObject = recordRunObject({
      runId: run.id,
      path: "farm/private.bin",
      purpose: "diagnostic",
      state: "diagnostic",
      retention: "keep-on-failure",
      bytes: Buffer.byteLength(value),
      sha256: sha256(value),
    });
    const farm = path.join(root.dir, ".ralphy", "farm");
    const mutableFs = fs as unknown as {
      lstatSync: typeof fs.lstatSync;
      openSync: typeof fs.openSync;
    };
    const originalLstat = mutableFs.lstatSync;
    const originalOpen = mutableFs.openSync;
    let childAccesses = 0;
    const isFarmChild = (value: unknown): boolean =>
      typeof value === "string" && value.startsWith(`${farm}${path.sep}`);
    mutableFs.lstatSync = ((...args: Parameters<typeof fs.lstatSync>) => {
      if (isFarmChild(args[0])) childAccesses += 1;
      return originalLstat(...args);
    }) as typeof fs.lstatSync;
    mutableFs.openSync = ((...args: Parameters<typeof fs.openSync>) => {
      if (isFarmChild(args[0])) childAccesses += 1;
      return originalOpen(...args);
    }) as typeof fs.openSync;
    let report: DomainVerificationReport;
    try {
      report = verifyDomainStore();
    } finally {
      mutableFs.lstatSync = originalLstat;
      mutableFs.openSync = originalOpen;
    }

    expect(childAccesses).toBe(0);
    expect(report.runObjectIssues).toContainEqual({
      table: "run_objects",
      rowId: runObject.id,
      column: "path",
      reason: "invalid-locator",
    });
  });

  test("accepts exact zero-byte RunObject evidence but not an empty durable Object", async () => {
    const root = makeRoot();
    const workspace = createWorkspace({ slug: "empty-files", name: "Empty" });
    const run = startRun({ workspaceId: workspace.id, kind: "diagnostic" });
    writeFile(root, ".ralphy/tmp/empty.bin", "");
    const runObject = recordRunObject({
      runId: run.id,
      path: "tmp/empty.bin",
      purpose: "diagnostic",
      state: "diagnostic",
      retention: "keep-on-failure",
      bytes: 0,
      sha256: sha256(""),
    });
    const object = await ingestObject({
      scope: { workspaceId: workspace.id },
      sourcePath: writeFile(root, "source/non-empty.bin", "x"),
      originalName: "non-empty.bin",
      mime: "application/octet-stream",
      storageClass: "durable",
    });
    fs.truncateSync(storedObjectPath(object.id), 0);

    const report = verifyDomainStore({ hashObjects: true });
    expect(report.runObjectIssues.filter((issue) => issue.rowId === runObject.id)).toEqual([]);
    expect(report.objectFileIssues).toContainEqual({
      objectId: object.id,
      reason: "empty",
    });
  });

  test("recursively scans classified JSON with RFC 6901 pointers and anchored locators", () => {
    makeRoot();
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const document = createDocument({
      projectId: project.id,
      kind: "note",
      slug: "safe-prose",
      title: "Safe prose",
    });
    reviseDocument({
      documentId: document.id,
      expectedHeadId: null,
      format: "markdown",
      body: "The example /Users/example is embedded in a sentence.",
    });
    const db = openDomainDb();
    db.exec("PRAGMA ignore_check_constraints = ON");
    try {
      db.prepare(
        `INSERT INTO project_stages
         (id, project_id, stage, state, metadata_json, updated_at)
         VALUES (?, ?, ?, 'ready', ?, 1)`,
      ).run(
        "z",
        project.id,
        "unsafe-z",
        JSON.stringify({
          "customer/secret~key": {
            locator: "C:/secret.txt",
            blob: "aGVsbG8=",
          },
          binary: "aGVsbG8=",
          payload: "data:text/plain;base64,eA==",
          prose: "/Users/example is mentioned in prose",
        }),
      );
      db.prepare(
        `INSERT INTO project_stages
         (id, project_id, stage, state, metadata_json, updated_at)
         VALUES (?, ?, ?, 'ready', ?, 1)`,
      ).run("\u00e9", project.id, "unsafe-e", JSON.stringify({ path: "/tmp/x" }));
      db.prepare(
        `INSERT INTO project_stages
         (id, project_id, stage, state, metadata_json, updated_at)
         VALUES ('bad', ?, 'invalid-json', 'ready', '{', 1)`,
      ).run(project.id);
      db.prepare(
        `INSERT INTO project_stages
         (id, project_id, stage, state, metadata_json, updated_at)
         VALUES ('duplicate', ?, 'duplicate-json-key', 'ready',
           '{"payload":"data:text/plain;base64,eA==","payload":"safe"}', 1)`,
      ).run(project.id);
      db.prepare(
        `INSERT INTO workspaces
         (id, slug, name, created_at, updated_at)
         VALUES ('blob-text', 'blob-text', X'0001', 1, 1)`,
      ).run();
    } finally {
      db.exec("PRAGMA ignore_check_constraints = OFF");
    }

    const report = verifyDomainStore();
    expect(report.absolutePathRows).toContainEqual({
      table: "project_stages",
      rowId: "z",
      column: "metadata_json",
      jsonPointer: "/<redacted>/locator",
      reason: "drive-absolute",
    });
    expect(report.absolutePathRows.map((issue) => issue.rowId)).toEqual([
      "z",
      "\u00e9",
    ]);
    expect(report.binaryPayloadRows).toContainEqual({
      table: "project_stages",
      rowId: "z",
      column: "metadata_json",
      jsonPointer: "/<redacted>/blob",
      reason: "binary-payload",
    });
    expect(report.binaryPayloadRows).toContainEqual({
      table: "project_stages",
      rowId: "z",
      column: "metadata_json",
      jsonPointer: "/binary",
      reason: "binary-payload",
    });
    expect(JSON.stringify(report)).not.toContain("customer/secret~key");
    expect(report.dataUrlRows).toContainEqual({
      table: "project_stages",
      rowId: "z",
      column: "metadata_json",
      jsonPointer: "/payload",
      reason: "data-url",
    });
    expect(report.dataUrlRows).toContainEqual({
      table: "project_stages",
      rowId: "duplicate",
      column: "metadata_json",
      jsonPointer: "/payload",
      reason: "data-url",
    });
    expect(report.binaryPayloadRows).toContainEqual({
      table: "workspaces",
      rowId: "blob-text",
      column: "name",
      reason: "binary-payload",
    });
    expect(report.invalidJsonRows).toContainEqual({
      table: "project_stages",
      rowId: "bad",
      column: "metadata_json",
      reason: "invalid-json",
    });
    expect(
      report.absolutePathRows.some(
        (issue) => issue.table === "document_revisions" && issue.column === "body",
      ),
    ).toBe(false);
    expect(
      report.absolutePathRows.some((issue) => issue.jsonPointer === "/prose"),
    ).toBe(false);
  });

  test("fails closed when a new TEXT column lacks a verifier descriptor", () => {
    makeRoot();
    const db = openDomainDb();
    db.exec("ALTER TABLE workspaces ADD COLUMN surprise TEXT");

    expect(() => verifyDomainStore()).toThrow(/TEXT descriptor/i);
  });

  test("does not exempt application tables that merely share the FTS prefix", () => {
    makeRoot();
    const db = openDomainDb();
    db.exec("CREATE TABLE document_revisions_fts_payload (secret TEXT)");

    expect(() => verifyDomainStore()).toThrow(/TEXT descriptor/i);
  });

  test("recognizes whole absolute locators containing spaces", () => {
    makeRoot();
    const db = openDomainDb();
    const insert = db.prepare(
      `INSERT INTO jobs (kind, status, command, depends_on, created_at, log_path)
       VALUES ('render', 'pending', '[]', '[]', 1, ?)`,
    );
    insert.run("/tmp/My File.log");
    insert.run("C:\\Users\\Example User\\run.log");
    insert.run("\\\\server\\Shared Folder\\run.log");

    expect(
      verifyDomainStore().absolutePathRows
        .filter((issue) => issue.table === "jobs" && issue.column === "log_path")
        .map((issue) => issue.reason),
    ).toEqual(["posix-absolute", "drive-absolute", "unc-absolute"]);
  });

  test("rejects an Object whose Project belongs to another Workspace", () => {
    const root = makeRoot();
    const first = createWorkspace({ slug: "object-scope-a", name: "A" });
    const second = createWorkspace({ slug: "object-scope-b", name: "B" });
    const project = createProject({
      workspaceId: second.id,
      slug: "foreign-project",
      name: "Foreign",
    });
    const objectId = "object-cross-workspace";
    const bytes = "x";
    writeFile(
      root,
      `.ralphy/buckets/${first.id}/projects/${project.id}/objects/${objectId}`,
      bytes,
    );
    const db = openDomainDb();
    db.prepare(
      `INSERT INTO objects
       (id, workspace_id, project_id, backend, bucket, key, sha256, mime,
        bytes, storage_class, created_at)
       VALUES (?, ?, ?, 'local', ?, ?, ?, 'application/octet-stream', 1,
               'durable', 1)`,
    ).run(
      objectId,
      first.id,
      project.id,
      `buckets/${first.id}/projects/${project.id}`,
      `objects/${objectId}`,
      sha256(bytes),
    );
    const job = db.prepare(
      `INSERT INTO jobs (kind, status, command, depends_on, created_at)
       VALUES ('render', 'pending', '[]', '[]', 1)`,
    ).run();
    db.prepare(
      "INSERT INTO job_artifacts (job_id, object_id, kind, path) VALUES (?, ?, 'output', 'safe.bin')",
    ).run(job.lastInsertRowid, objectId);

    expect(verifyDomainStore().objectFileIssues).toContainEqual({
      objectId,
      reason: "invalid-locator",
    });
  });

  test("treats directories inside a flat Object namespace as terminal issues", () => {
    const root = makeRoot();
    openDomainDb();
    const nested = path.join(
      root.dir,
      ".ralphy",
      "buckets",
      "ghost",
      "shared",
      "objects",
      "unexpected-directory",
    );
    fs.mkdirSync(nested, { recursive: true });
    fs.symlinkSync("missing-target", path.join(nested, "child-link"));

    const report = verifyDomainStore();
    expect(report.filesystemIssues).toEqual([
      {
        relativePath: "buckets/ghost/shared/objects/unexpected-directory",
        reason: "unexpected-type",
      },
    ]);
    expect(report.orphanedObjectPaths).toEqual([]);
  });

  test("routes revision, build, unit, run, and Session invariant failures", () => {
    makeRoot();
    const db = openDomainDb();
    for (const { name } of db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'trigger'",
      )
      .all()) {
      db.exec(`DROP TRIGGER "${name}"`);
    }
    db.exec("PRAGMA foreign_keys = OFF; PRAGMA ignore_check_constraints = ON");
    try {
      db.exec(`
        INSERT INTO workspaces (id, slug, name, created_at, updated_at)
          VALUES ('ws-a', 'ws-a', 'A', 1, 1), ('ws-b', 'ws-b', 'B', 1, 1);
        INSERT INTO projects (id, workspace_id, slug, name, created_at, updated_at)
          VALUES ('project-a', 'ws-a', 'a', 'A', 1, 1),
                 ('project-b', 'ws-b', 'b', 'B', 1, 1);
        INSERT INTO agent_sessions
          (id, workspace_id, project_id, agent, started_at, ended_at)
          VALUES ('session-wrong', 'ws-b', 'project-b', 'agent', 1, 10);

        INSERT INTO documents
          (id, workspace_id, project_id, kind, slug, title, current_revision_id,
           created_at, updated_at)
          VALUES ('document-a', 'ws-a', 'project-a', 'note', 'doc', 'Doc',
                  'document-revision-1', 1, 1);
        INSERT INTO document_revisions
          (id, document_id, revision_no, parent_revision_id, format, body,
           content_sha256, authored_by_session_id, created_at)
          VALUES
            ('document-revision-1', 'document-a', 1, NULL, 'text', 'one',
             '1111111111111111111111111111111111111111111111111111111111111111',
             'session-wrong', 20),
            ('document-revision-3', 'document-a', 3, 'document-revision-1',
             'text', 'three',
             '3333333333333333333333333333333333333333333333333333333333333333',
             NULL, 30);

        INSERT INTO objects
          (id, workspace_id, project_id, backend, bucket, key, sha256, mime,
           bytes, storage_class, created_at)
          VALUES ('object-a', 'ws-a', 'project-a', 'local',
                  'buckets/ws-a/projects/project-a', 'objects/object-a',
                  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                  'application/octet-stream', 1, 'durable', 1);
        INSERT INTO artifacts
          (id, workspace_id, project_id, slug, kind, selected_revision_id,
           created_at, updated_at)
          VALUES ('artifact-a', 'ws-a', 'project-a', 'a', 'video',
                  'artifact-revision-b', 1, 1),
                 ('artifact-b', 'ws-a', 'project-a', 'b', 'video', NULL, 1, 1);
        INSERT INTO artifact_revisions
          (id, artifact_id, object_id, revision_no, state, created_at)
          VALUES ('artifact-revision-a', 'artifact-a', 'object-a', 1,
                  'approved', 1),
                 ('artifact-revision-b', 'artifact-b', 'object-a', 1,
                  'approved', 1);

        INSERT INTO compositions
          (id, project_id, slug, kind, selected_revision_id, created_at, updated_at)
          VALUES ('composition-a', 'project-a', 'composition', 'video',
                  'composition-revision-a', 1, 1);
        INSERT INTO composition_revisions
          (id, composition_id, revision_no, state, engine, engine_config_json,
           created_at)
          VALUES ('composition-revision-a', 'composition-a', 2, 'draft',
                  'remotion', '{}', 1);
        INSERT INTO runs
          (id, workspace_id, project_id, agent_session_id, kind, state,
           created_at, ended_at)
          VALUES ('run-a', 'ws-a', 'project-a', 'session-wrong', 'build',
                  'succeeded', 20, NULL),
                 ('run-b', 'ws-b', 'project-b', NULL, 'other', 'pending', 1, NULL);
        INSERT INTO builds
          (id, composition_revision_id, run_id, state, profile_json, created_at,
           started_at, ended_at)
          VALUES ('build-a', 'composition-revision-a', 'run-a', 'succeeded',
                  '{}', 1, 1, 2),
                 ('build-without-run', 'composition-revision-a', NULL, 'running',
                  '{}', 1, 1, NULL);
        INSERT INTO evaluations
          (id, workspace_id, project_id, run_id, authored_by_session_id, kind,
           report_json, created_at)
          VALUES ('evaluation-a', 'ws-a', 'project-a', 'run-b', 'session-wrong',
                  'qa', '{}', 1);

        INSERT INTO units
          (id, workspace_id, project_id, slug, format, latest_revision_id,
           selected_revision_id, created_at, updated_at)
          VALUES ('unit-a', 'ws-a', 'project-a', 'unit', 'video',
                  'unit-revision-a', 'unit-revision-a', 1, 1);
        INSERT INTO unit_revisions
          (id, unit_id, revision_no, created_at, sealed_at)
          VALUES ('unit-revision-a', 'unit-a', 2, 1, 2);
        INSERT INTO unit_presentations
          (id, unit_revision_id, platform, position, options_json, created_at)
          VALUES ('presentation-a', 'unit-revision-a', 'tiktok', 1, '{}', 1);
        INSERT INTO publications
          (id, presentation_id, effective_options_json, submission_run_id, rail,
           state, idempotency_key, created_at, updated_at)
          VALUES ('publication-a', 'presentation-a', '{}', 'run-a', 'manual',
                  'published', 'publication-a', 1, 1);
        INSERT INTO metric_snapshots
          (id, publication_id, source, as_of, window_start, window_end, created_at)
          VALUES ('metric-a', 'publication-a', 'manual', 10, 9, 8, 10);
        INSERT INTO run_results
          (id, run_id, position, entity_type, entity_id, created_at)
          VALUES ('result-a', 'run-a', 1, 'publication', 'publication-a', 1);
      `);
    } finally {
      db.exec("PRAGMA ignore_check_constraints = OFF; PRAGMA foreign_keys = ON");
    }

    const report = verifyDomainStore();
    expect(report.brokenRevisionChains).toContainEqual({
      entityType: "document",
      entityId: "document-a",
      reason: "latest-not-greatest",
      relatedId: "document-revision-1",
    });
    expect(report.brokenRevisionChains).toContainEqual({
      entityType: "evaluation",
      entityId: "evaluation-a",
      reason: "scope-mismatch",
      relatedId: "run-b",
    });
    expect(report.brokenRevisionChains).toContainEqual({
      entityType: "run",
      entityId: "run-a",
      reason: "run-lifecycle-mismatch",
    });
    expect(report.brokenBuildChains).toContainEqual({
      entityType: "composition",
      entityId: "composition-a",
      reason: "selected-unsealed",
      relatedId: "composition-revision-a",
    });
    expect(report.brokenBuildChains).toContainEqual({
      entityType: "build",
      entityId: "build-a",
      reason: "missing-output",
    });
    expect(report.brokenBuildChains).not.toContainEqual({
      entityType: "build",
      entityId: "build-without-run",
      reason: "scope-mismatch",
    });
    expect(report.brokenUnitChains).toContainEqual({
      entityType: "unit-revision",
      entityId: "unit-revision-a",
      reason: "unsealed-graph",
    });
    expect(report.brokenUnitChains).toContainEqual({
      entityType: "publication",
      entityId: "publication-a",
      reason: "publication-lifecycle-mismatch",
    });
    expect(report.brokenUnitChains).toContainEqual({
      entityType: "metric-snapshot",
      entityId: "metric-a",
      reason: "metric-window-mismatch",
      relatedId: "publication-a",
    });
    expect(report.sessionProvenanceIssues).toContainEqual({
      entityType: "run",
      entityId: "run-a",
      reason: "ended-session",
      relatedId: "session-wrong",
    });
  });

  test("rejects Run results outside their Run lifetime", () => {
    makeRoot();
    const workspace = createWorkspace({ slug: "late-result", name: "Late" });
    const document = createDocument({
      workspaceId: workspace.id,
      kind: "note",
      slug: "result",
      title: "Result",
    });
    const revision = reviseDocument({
      documentId: document.id,
      expectedHeadId: null,
      format: "text",
      body: "result",
    });
    const run = startRun({ workspaceId: workspace.id, kind: "generation" });
    const db = openDomainDb();
    const result = recordRunResult(db, {
      runId: run.id,
      position: 0,
      entityType: "document_revision",
      entityId: revision.id,
    });
    const finished = finishRun(run.id, { state: "succeeded" });
    db.exec("DROP TRIGGER run_results_no_update");
    db.prepare("UPDATE run_results SET created_at = ? WHERE id = ?").run(
      finished.endedAt! + 1,
      result.id,
    );

    expect(verifyDomainStore().brokenRevisionChains).toContainEqual({
      entityType: "run-result",
      entityId: result.id,
      reason: "run-result-mismatch",
      relatedId: revision.id,
    });
  });

  test("accepts Builds without a Run and rejects dangling or cross-scope Runs", async () => {
    const root = makeRoot();
    const workspace = createWorkspace({ slug: "build-run", name: "Build Run" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "build-run",
      name: "Build Run",
    });
    const object = await ingestObject({
      scope: { workspaceId: workspace.id, projectId: project.id },
      sourcePath: writeFile(root, "build-run/video.mp4", "video"),
      originalName: "video.mp4",
      mime: "video/mp4",
      storageClass: "durable",
    });
    const composition = createComposition({
      projectId: project.id,
      slug: "cut",
      kind: "video",
    });
    const revision = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "remotion",
    });
    putCompositionSource({
      revisionId: revision.id,
      logicalPath: "video.mp4",
      objectId: object.id,
    });
    sealCompositionRevision({ revisionId: revision.id });

    const otherWorkspace = createWorkspace({
      slug: "build-run-other",
      name: "Other",
    });
    const otherProject = createProject({
      workspaceId: otherWorkspace.id,
      slug: "build-run-other",
      name: "Other",
    });
    const crossScopeRun = startRun({
      projectId: otherProject.id,
      kind: "build",
    });

    const db = openDomainDb();
    const insert = db.prepare(
      `INSERT INTO builds
         (id, composition_revision_id, run_id, state, profile_json, created_at)
       VALUES (?, ?, ?, 'pending', '{}', 1)`,
    );
    insert.run("build-null-run", revision.id, null);
    db.exec("DROP TRIGGER builds_scope_state_insert");
    db.exec("PRAGMA foreign_keys = OFF");
    try {
      insert.run("build-dangling-run", revision.id, "run-missing");
      insert.run("build-cross-scope-run", revision.id, crossScopeRun.id);
    } finally {
      db.exec("PRAGMA foreign_keys = ON");
    }

    const chains = verifyDomainStore().brokenBuildChains;
    expect(chains).not.toContainEqual({
      entityType: "build",
      entityId: "build-null-run",
      reason: "scope-mismatch",
    });
    expect(chains.filter((entry) => entry.entityId === "build-null-run")).toEqual(
      [],
    );
    expect(chains).toContainEqual({
      entityType: "build",
      entityId: "build-dangling-run",
      reason: "scope-mismatch",
      relatedId: "run-missing",
    });
    expect(chains).toContainEqual({
      entityType: "build",
      entityId: "build-cross-scope-run",
      reason: "scope-mismatch",
      relatedId: crossScopeRun.id,
    });
  });

  test("rejects cross-Workspace Publication ancestry and unsafe draft fields", async () => {
    const root = makeRoot();
    const first = await publicationFixture(root, "publication-fields-a");
    const second = await publicationFixture(root, "publication-fields-b");
    const db = openDomainDb();
    dropPublicationTriggers(db);
    db.exec("PRAGMA ignore_check_constraints = ON");
    try {
      db.prepare(
        `UPDATE publications
         SET revised_from_publication_id = ?, provider_publication_id = ?, url = ?
         WHERE id = ?`,
      ).run(
        second.publication.id,
        "bad\u0001provider",
        "https://user:password@example.test/post",
        first.publication.id,
      );
    } finally {
      db.exec("PRAGMA ignore_check_constraints = OFF");
    }

    const report = verifyDomainStore();
    expect(report.brokenUnitChains).toContainEqual({
      entityType: "publication",
      entityId: first.publication.id,
      reason: "scope-mismatch",
      relatedId: second.publication.id,
    });
    expect(report.brokenUnitChains).toContainEqual({
      entityType: "publication",
      entityId: first.publication.id,
      reason: "publication-lifecycle-mismatch",
    });
  });

  test("rejects extra attempts and results on live Publication claims", async () => {
    const root = makeRoot();
    const fixture = await publicationFixture(root, "publication-live-claim");
    claimPublication(fixture.publication.id, "draft", 60_000);
    const db = openDomainDb();
    const now = Date.now();
    db.prepare(
      `INSERT INTO run_attempts
       (id, run_id, attempt_no, provider, state, started_at, ended_at)
       VALUES ('attempt-extra-terminal', ?, 2, 'postiz', 'failed', ?, ?)`,
    ).run(fixture.submissionRun.id, now, now);

    expect(verifyDomainStore().brokenUnitChains).toContainEqual({
      entityType: "publication",
      entityId: fixture.publication.id,
      reason: "claim-fence-mismatch",
      relatedId: fixture.submissionRun.id,
    });

    db.prepare("DELETE FROM run_attempts WHERE id = 'attempt-extra-terminal'").run();
    db.prepare(
      `INSERT INTO run_results
       (id, run_id, position, entity_type, entity_id, created_at)
       VALUES ('result-during-live-claim', ?, 0, 'publication', ?, ?)`,
    ).run(fixture.submissionRun.id, fixture.publication.id, now);

    expect(verifyDomainStore().brokenUnitChains).toContainEqual({
      entityType: "publication",
      entityId: fixture.publication.id,
      reason: "claim-fence-mismatch",
      relatedId: fixture.submissionRun.id,
    });
  });

  test("rejects attempts on terminal-at-insert Publication failures", async () => {
    const root = makeRoot();
    const fixture = await publicationFixture(root, "publication-preflight");
    const run = startRun({ projectId: fixture.project.id, kind: "preflight" });
    const publication = recordPublication({
      presentationId: fixture.presentation.id,
      submissionRunId: run.id,
      rail: "postiz",
      idempotencyKey: "publication-preflight-failed",
      state: "failed",
      error: "account unavailable",
      failureStage: "account-resolution",
    });
    const db = openDomainDb();
    const endedAt = db
      .query<{ endedAt: number }, [string]>(
        "SELECT ended_at AS endedAt FROM runs WHERE id = ?",
      )
      .get(run.id)!.endedAt;
    db.prepare(
      `INSERT INTO run_attempts
       (id, run_id, attempt_no, provider, state, started_at, ended_at)
       VALUES ('attempt-illegal-preflight', ?, 1, 'postiz', 'failed', ?, ?)`,
    ).run(run.id, endedAt, endedAt);

    expect(verifyDomainStore().brokenUnitChains).toContainEqual({
      entityType: "publication",
      entityId: publication.id,
      reason: "publication-lifecycle-mismatch",
    });
  });

  test("validates Publication provider IDs and HTTP(S) URLs", async () => {
    const root = makeRoot();
    const fixture = await publicationFixture(root, "publication-provider-fields");
    const claim = claimPublication(fixture.publication.id, "draft", 60_000);
    finishPublicationClaim(fixture.publication.id, {
      fence: claim.fence,
      state: "submitted",
      submittedAt: Date.now(),
      providerPublicationId: "provider-id",
      url: "http://example.test/post",
    });
    const db = openDomainDb();
    dropPublicationTriggers(db);
    const lifecycleIssue = () => verifyDomainStore().brokenUnitChains.some(
      (issue) => issue.entityType === "publication" &&
        issue.entityId === fixture.publication.id &&
        issue.reason === "publication-lifecycle-mismatch",
    );

    expect(lifecycleIssue()).toBe(false);
    db.prepare("UPDATE publications SET provider_publication_id = ? WHERE id = ?")
      .run("bad\u0001provider", fixture.publication.id);
    expect(lifecycleIssue()).toBe(true);

    db.prepare("UPDATE publications SET provider_publication_id = ? WHERE id = ?")
      .run("p".repeat(256), fixture.publication.id);
    expect(lifecycleIssue()).toBe(true);

    db.exec("PRAGMA ignore_check_constraints = ON");
    try {
      db.prepare(
        "UPDATE publications SET provider_publication_id = 'provider-id', url = ? WHERE id = ?",
      ).run("http://", fixture.publication.id);
      expect(lifecycleIssue()).toBe(true);

      db.prepare("UPDATE publications SET url = ? WHERE id = ?").run(
        "https://user:password@example.test/post",
        fixture.publication.id,
      );
      expect(lifecycleIssue()).toBe(true);

      db.prepare("UPDATE publications SET url = ? WHERE id = ?").run(
        `https://example.test/${"x".repeat(2_030)}`,
        fixture.publication.id,
      );
      expect(lifecycleIssue()).toBe(true);

      db.prepare("UPDATE publications SET url = ? WHERE id = ?").run(
        "http://example.test/@creator/video/123",
        fixture.publication.id,
      );
      expect(lifecycleIssue()).toBe(false);

      db.prepare("UPDATE publications SET url = ? WHERE id = ?").run(
        "https://www.tiktok.com/@creator/video/123",
        fixture.publication.id,
      );
      expect(lifecycleIssue()).toBe(false);
    } finally {
      db.exec("PRAGMA ignore_check_constraints = OFF");
    }
  });

  test("rejects non-canonical draft and preflight Publication shapes", async () => {
    const root = makeRoot();
    const fixture = await publicationFixture(root, "publication-insert-shapes");
    const preflightRun = startRun({
      projectId: fixture.project.id,
      kind: "publication-preflight",
    });
    const preflight = recordPublication({
      presentationId: fixture.presentation.id,
      submissionRunId: preflightRun.id,
      rail: "postiz",
      idempotencyKey: "publication-insert-shapes-preflight",
      state: "failed",
      error: "account unavailable",
      failureStage: "account-resolution",
    });
    const db = openDomainDb();
    dropPublicationTriggers(db);
    db.exec("PRAGMA ignore_check_constraints = ON");
    try {
      db.prepare(
        `UPDATE publications
         SET provider_publication_id = 'draft-provider', url = 'https://example.test/draft',
             submitted_at = created_at - 1, error = 'draft error', failure_stage = 'preflight'
         WHERE id = ?`,
      ).run(fixture.publication.id);
      db.prepare(
        `UPDATE publications
         SET social_account_id = ?, provider_publication_id = 'preflight-provider',
             url = 'https://example.test/preflight', submitted_at = created_at
         WHERE id = ?`,
      ).run(fixture.account.id, preflight.id);
    } finally {
      db.exec("PRAGMA ignore_check_constraints = OFF");
    }

    const issues = verifyDomainStore().brokenUnitChains;
    expect(issues).toContainEqual({
      entityType: "publication",
      entityId: fixture.publication.id,
      reason: "publication-lifecycle-mismatch",
    });
    expect(issues).toContainEqual({
      entityType: "publication",
      entityId: preflight.id,
      reason: "publication-lifecycle-mismatch",
    });
  });

  test("rejects another Publication submission Run as a follow-up claim", async () => {
    const root = makeRoot();
    const fixture = await publicationFixture(root, "publication-follow-up");
    const submission = claimPublication(fixture.publication.id, "draft", 60_000);
    finishPublicationClaim(fixture.publication.id, {
      fence: submission.fence,
      state: "submitted",
      submittedAt: Date.now(),
      providerPublicationId: "provider-id",
      url: "http://example.test/post",
    });
    const reservedRun = startRun({
      projectId: fixture.project.id,
      kind: "second-publication-submit",
    });
    recordPublication({
      presentationId: fixture.presentation.id,
      socialAccountId: fixture.account.id,
      submissionRunId: reservedRun.id,
      rail: "postiz",
      idempotencyKey: "publication-follow-up-reserved-run",
    });
    const db = openDomainDb();
    const now = Date.now();
    dropPublicationTriggers(db);
    db.prepare(
      "UPDATE runs SET state = 'running', started_at = ? WHERE id = ?",
    ).run(now, reservedRun.id);
    db.prepare(
      `INSERT INTO run_attempts
       (id, run_id, attempt_no, provider, state, started_at)
       VALUES ('attempt-reserved-follow-up', ?, 1, 'postiz', 'running', ?)`,
    ).run(reservedRun.id, now);
    db.prepare(
      `UPDATE publications
       SET active_claim_run_id = ?, claim_kind = 'status-lookup',
           claim_epoch = claim_epoch + 1, claim_token = 'reserved-follow-up',
           claim_expires_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(reservedRun.id, now + 60_000, now, fixture.publication.id);

    expect(verifyDomainStore().brokenUnitChains).toContainEqual({
      entityType: "publication",
      entityId: fixture.publication.id,
      reason: "claim-fence-mismatch",
      relatedId: reservedRun.id,
    });
  });

  test("accepts a complete graph created through the domain APIs", async () => {
    const root = makeRoot();
    const workspace = createWorkspace({ slug: "healthy", name: "Healthy" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const session = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "codex",
    });
    const document = createDocument({
      projectId: project.id,
      kind: "brief",
      slug: "brief",
      title: "Brief",
    });
    const documentRevision = reviseDocument({
      documentId: document.id,
      expectedHeadId: null,
      format: "markdown",
      body: "# Brief",
      authoredBySessionId: session.id,
    });
    const object = await ingestObject({
      scope: { workspaceId: workspace.id, projectId: project.id },
      sourcePath: writeFile(root, "healthy/video.mp4", "video"),
      originalName: "video.mp4",
      mime: "video/mp4",
      storageClass: "durable",
    });
    const artifact = createArtifact({
      projectId: project.id,
      slug: "video",
      kind: "video",
    });
    const artifactRevision = addArtifactRevision({
      artifactId: artifact.id,
      objectId: object.id,
      state: "approved",
      authoredBySessionId: session.id,
    });
    const composition = createComposition({
      projectId: project.id,
      slug: "cut",
      kind: "video",
    });
    const compositionRevision = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "remotion",
      authoredBySessionId: session.id,
    });
    putCompositionSource({
      revisionId: compositionRevision.id,
      logicalPath: "video.mp4",
      objectId: object.id,
    });
    sealCompositionRevision({ revisionId: compositionRevision.id });
    selectCompositionRevision({
      compositionId: composition.id,
      revisionId: compositionRevision.id,
      expectedSelectedRevisionId: null,
    });
    const buildRun = startRun({ projectId: project.id, kind: "build" });
    const build = startBuild({
      compositionRevisionId: compositionRevision.id,
      runId: buildRun.id,
      profile: { quality: "preview" },
    });
    completeBuild({
      buildId: build.id,
      outputs: [
        { artifactRevisionId: artifactRevision.id, role: "preview", position: 0 },
      ],
    });
    const unit = createUnit({
      projectId: project.id,
      slug: "post",
      format: "video",
    });
    const unitRevision = reviseUnit({
      unitId: unit.id,
      expectedLatestRevisionId: null,
      authoredBySessionId: session.id,
      items: [
        {
          artifactRevisionId: artifactRevision.id,
          role: "video",
          position: 0,
        },
        {
          documentRevisionId: documentRevision.id,
          role: "caption-source",
          position: 1,
        },
      ],
      presentations: [
        {
          platform: "tiktok",
          caption: "Healthy caption",
          options: { privacy: "public" },
          items: [{ unitItemPosition: 0, position: 0 }],
        },
      ],
    });
    selectUnitRevision({
      unitId: unit.id,
      revisionId: unitRevision.id,
      expectedSelectedRevisionId: null,
    });
    startRun({
      projectId: project.id,
      agentSessionId: session.id,
      kind: "generation",
    });

    const presentation = getUnit(unit.id).revisions[0]!.presentations[0]!;
    const account = upsertSocialAccount({
      workspaceId: workspace.id,
      platform: "tiktok",
      externalId: "healthy-account",
    });
    const submissionRun = startRun({
      projectId: project.id,
      agentSessionId: session.id,
      kind: "publication-submit",
    });
    const publication = recordPublication({
      presentationId: presentation.id,
      socialAccountId: account.id,
      submissionRunId: submissionRun.id,
      rail: "postiz",
      idempotencyKey: "healthy-publication",
    });
    const activeClaim = claimPublication(publication.id, "draft", 60_000);

    expect(verifyDomainStore().brokenUnitChains).toEqual([]);
    finishPublicationClaim(publication.id, {
      fence: activeClaim.fence,
      state: "submitted",
      providerPublicationId: "provider-publication",
      url: "https://example.test/post",
      submittedAt: Date.now(),
      response: { accepted: true },
    });
    const statusRun = startRun({
      projectId: project.id,
      kind: "publication-status",
    });
    const statusClaim = claimPublicationStatusLookup(
      publication.id,
      "submitted",
      statusRun.id,
      60_000,
    );
    expect(verifyDomainStore().brokenUnitChains).toEqual([]);
    finishPublicationStatusLookup(publication.id, {
      fence: statusClaim.fence,
      operationState: "succeeded",
      state: "published",
      publishedAt: Date.now(),
      response: { state: "published" },
    });
    const preflightRun = startRun({
      projectId: project.id,
      kind: "publication-preflight",
    });
    recordPublication({
      presentationId: presentation.id,
      submissionRunId: preflightRun.id,
      rail: "postiz",
      idempotencyKey: "healthy-preflight-failure",
      state: "failed",
      error: "account unavailable",
      failureStage: "account-resolution",
    });

    const report = verifyDomainStore();
    expect(report.brokenRevisionChains).toEqual([]);
    expect(report.brokenBuildChains).toEqual([]);
    expect(report.brokenUnitChains).toEqual([]);
    expect(report.sessionProvenanceIssues).toEqual([]);
  });

  test("uses a read-only WAL snapshot while a writer is reserved and preserves head conflicts", () => {
    makeRoot();
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const document = createDocument({
      workspaceId: workspace.id,
      kind: "note",
      slug: "snapshot",
      title: "Snapshot",
    });
    reviseDocument({
      documentId: document.id,
      expectedHeadId: null,
      format: "text",
      body: "committed",
    });
    const writer = openDomainDb();
    writer.exec("BEGIN IMMEDIATE");
    try {
      writer.prepare(
        `INSERT INTO workspaces
         (id, slug, name, created_at, updated_at)
         VALUES ('ws_uncommitted', 'uncommitted', 'Uncommitted', 1, 1)`,
      ).run();
      expect(verifyDomainStore().integrityCheck).toEqual(["ok"]);
    } finally {
      writer.exec("ROLLBACK");
    }

    expect(fs.existsSync(`${domainDbPath()}-wal`)).toBe(true);
    expect(() =>
      reviseDocument({
        documentId: document.id,
        expectedHeadId: null,
        format: "text",
        body: "stale",
      }),
    ).toThrow(StoreConflictError);
  });

  test("pins one WAL snapshot across database and filesystem phases", async () => {
    const root = makeRoot();
    const workspace = createWorkspace({ slug: "snapshot", name: "Snapshot" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "project",
      name: "Project",
    });
    const object = await ingestObject({
      scope: { workspaceId: workspace.id, projectId: project.id },
      sourcePath: writeFile(root, "snapshot/object.bin", "object"),
      originalName: "object.bin",
      mime: "application/octet-stream",
      storageClass: "durable",
    });
    const objectPath = storedObjectPath(object.id);
    const writer = openDomainDb();
    const mutableFs = fs as unknown as {
      lstatSync: (...args: unknown[]) => fs.Stats;
    };
    const originalLstat = mutableFs.lstatSync;
    let committed = false;
    mutableFs.lstatSync = (...args: unknown[]): fs.Stats => {
      const result = originalLstat(...args);
      if (!committed && args[0] === objectPath) {
        committed = true;
        writer.prepare(
          `INSERT INTO objects
           (id, workspace_id, project_id, backend, bucket, key, sha256, mime,
            bytes, storage_class, created_at)
           VALUES ('late-object', ?, ?, 'local', ?, 'objects/late-object', ?,
                   'application/octet-stream', 1, 'durable', 1)`,
        ).run(
          workspace.id,
          project.id,
          `buckets/${workspace.id}/projects/${project.id}`,
          "f".repeat(64),
        );
      }
      return result;
    };
    let first: DomainVerificationReport;
    try {
      first = verifyDomainStore();
    } finally {
      mutableFs.lstatSync = originalLstat;
    }

    expect(committed).toBe(true);
    expect(first.unreferencedObjects).not.toContain("late-object");
    const second = verifyDomainStore();
    expect(second.unreferencedObjects).toContain("late-object");
    expect(JSON.stringify(verifyDomainStore())).toBe(JSON.stringify(second));
  });

  test("never opens an Object or RunObject through a swapped ancestor", async () => {
    const root = makeRoot();
    const workspace = createWorkspace({ slug: "race", name: "Race" });
    const object = await ingestObject({
      scope: { workspaceId: workspace.id },
      sourcePath: writeFile(root, "race/object.bin", "stable-content"),
      originalName: "object.bin",
      mime: "application/octet-stream",
      storageClass: "durable",
    });
    const objectPath = storedObjectPath(object.id);
    const run = startRun({ workspaceId: workspace.id, kind: "diagnostic" });
    const runObjectPath = writeFile(
      root,
      ".ralphy/tmp/race/run-object.bin",
      "stable-content",
    );
    const runObject = recordRunObject({
      runId: run.id,
      path: "tmp/race/run-object.bin",
      purpose: "diagnostic",
      state: "diagnostic",
      retention: "keep-on-failure",
      bytes: Buffer.byteLength("stable-content"),
      sha256: sha256("stable-content"),
    });
    const attacks = [
      { target: objectPath, ancestor: path.dirname(objectPath) },
      { target: runObjectPath, ancestor: path.dirname(runObjectPath) },
    ].map((attack, index) => {
      const external = path.join(root.dir, `outside-${index}`);
      const leafName = path.basename(attack.target);
      fs.mkdirSync(external, { recursive: true });
      fs.writeFileSync(path.join(external, leafName), "external-content");
      const decoy = fs.statSync(path.join(external, leafName));
      return {
        ...attack,
        external,
        leafName,
        ancestorName: path.basename(attack.ancestor),
        decoy: { dev: decoy.dev, ino: decoy.ino },
        attempts: 0,
        outsideOpens: 0,
        active: false,
      };
    });
    const mutableFs = fs as unknown as { openSync: typeof fs.openSync };
    const originalOpen = mutableFs.openSync;
    const swap = (attack: (typeof attacks)[number]): void => {
      fs.renameSync(attack.ancestor, `${attack.ancestor}.contained`);
      fs.symlinkSync(attack.external, attack.ancestor);
      attack.active = true;
    };
    const restore = (attack: (typeof attacks)[number]): void => {
      if (!attack.active) return;
      fs.rmSync(attack.ancestor);
      fs.renameSync(`${attack.ancestor}.contained`, attack.ancestor);
      attack.active = false;
    };
    // Swap the ancestor into a symlink inside the open() call itself: the
    // narrowest window the containment primitive has to defend.
    mutableFs.openSync = ((...args: Parameters<typeof fs.openSync>) => {
      const name = path.basename(String(args[0]));
      const attack = attacks.find(
        (candidate) =>
          candidate.attempts === 0 &&
          (name === candidate.leafName ||
            (process.platform === "linux" && name === candidate.ancestorName)),
      );
      if (!attack) return originalOpen(...args);
      attack.attempts += 1;
      swap(attack);
      try {
        const descriptor = originalOpen(...args);
        const opened = fs.fstatSync(descriptor);
        if (opened.dev === attack.decoy.dev && opened.ino === attack.decoy.ino) {
          attack.outsideOpens += 1;
        }
        return descriptor;
      } finally {
        restore(attack);
      }
    }) as typeof fs.openSync;
    let report: DomainVerificationReport;
    try {
      report = verifyDomainStore({ hashObjects: true });
    } finally {
      mutableFs.openSync = originalOpen;
      for (const attack of attacks) restore(attack);
    }

    // The swap must have fired, or the proof below is vacuous.
    expect(attacks.map((attack) => attack.attempts)).toEqual([1, 1]);
    expect(attacks.map((attack) => attack.outsideOpens)).toEqual([0, 0]);
    expect(report.hashMismatches).not.toContain(object.id);
    expect(
      report.runObjectIssues.some(
        (issue) => issue.rowId === runObject.id && issue.reason === "hash-mismatch",
      ),
    ).toBe(false);
    expect(
      report.objectFileIssues.filter((issue) => issue.objectId === object.id),
    ).toEqual([{ objectId: object.id, reason: "symlink" }]);
    expect(
      report.runObjectIssues.filter((issue) => issue.rowId === runObject.id),
    ).toEqual([
      {
        table: "run_objects",
        rowId: runObject.id,
        column: "path",
        reason: "symlink",
      },
    ]);
    expect(JSON.stringify(report)).not.toContain(root.dir);
  });
});
