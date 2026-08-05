import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { openDomainDbAt } from "../../cli/lib/store/db.js";
import {
  acquireMaintenanceLock,
  inventoryLegacySource,
  releaseMaintenanceLock,
} from "../../cli/lib/migration/inventory.js";
import {
  importExecutionAndOperations,
  importScopesAndDocuments,
} from "../../cli/lib/migration/import.js";
import {
  classifyLegacyPath,
  isLegacySecretCandidate,
  parseLegacyJsonl,
} from "../../cli/lib/migration/legacy.js";
import type { MigrationContext, MigrationLock } from "../../cli/lib/migration/types.js";
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

describe("legacy semantic migration", () => {
  test("parses JSONL as exact byte records and classifies secrets before JSON parsing", () => {
    const raw = Buffer.concat([
      Buffer.from('{"id":"before"}\r\n'),
      Buffer.from([0xff, 0xfe, 0x0a]),
      Buffer.from('{"id":"after"}'),
    ]);

    const records = parseLegacyJsonl(raw, "events.jsonl");

    expect(records.map((record) => [record.byteOffset, record.byteLength])).toEqual([
      [0, 17],
      [17, 3],
      [20, 14],
    ]);
    expect((records[0]!.value as { id: string }).id).toBe("before");
    expect(records[0]!.delimiter).toBe("crlf");
    expect(records[1]!.raw).toEqual(Buffer.from([0xff, 0xfe, 0x0a]));
    expect(records[1]!.issue?.detail.sha256).toBe(
      createHash("sha256").update(Buffer.from([0xff, 0xfe, 0x0a])).digest("hex"),
    );
    expect((records[2]!.value as { id: string }).id).toBe("after");
    expect(isLegacySecretCandidate(
      "config.json",
      Buffer.from('{"postiz":{"apiKey":"must-not-parse"}}'),
    )).toBe(true);
    expect(isLegacySecretCandidate("state.json", Buffer.from('{"token":"opaque"}'))).toBe(true);
    expect(isLegacySecretCandidate("settings.yaml", Buffer.from("api_key: opaque\n"))).toBe(true);
    expect(isLegacySecretCandidate("settings.txt", Buffer.from("OPENAI_API_KEY=opaque\n"))).toBe(true);
    for (const value of [
      "'api_key': plaintext\n",
      '"bot_token": plaintext\n',
      "AWS_SECRET_ACCESS_KEY=plaintext\n",
      "export OPENAI_API_KEY=plaintext\n",
      "private_key=plaintext\n",
      "Authorization: Basic dXNlcjpwYXNz\n",
      "https://alice:plaintext@example.test/resource\n",
      "-----BEGIN RSA PRIVATE KEY-----\nplaintext\n-----END RSA PRIVATE KEY-----\n",
    ]) {
      expect(isLegacySecretCandidate("settings.txt", Buffer.from(value))).toBe(true);
    }
    expect(isLegacySecretCandidate("README.md", Buffer.from("Authorization: Bearer opaque\n"))).toBe(true);
    expect(isLegacySecretCandidate("certificate.txt", Buffer.from("-----BEGIN PRIVATE KEY-----\n"))).toBe(true);
    expect(isLegacySecretCandidate("state.json", Buffer.from('{"token":"opaque"}', "utf16le"))).toBe(true);
    expect(isLegacySecretCandidate("state.json", Buffer.from([0, 255, 0, 1]))).toBe(true);
    expect(isLegacySecretCandidate("state.json", Buffer.from([1, 2, 3]))).toBe(true);
    expect(isLegacySecretCandidate("claude-api-key.bin")).toBe(true);
    expect(isLegacySecretCandidate("openrouter-api-key.bin")).toBe(true);
    expect(isLegacySecretCandidate("foo-api-key.bin")).toBe(false);
    expect(isLegacySecretCandidate("nested/claude-api-key.bin")).toBe(false);
    expect(isLegacySecretCandidate("README.md", Buffer.from("Keep the token budget small.\n"))).toBe(false);
    expect(classifyLegacyPath("farm/events/lifecycle.json")).toBe("raw-evidence");
  });

  test("imports stable scope, feedback, document, and raw-evidence rows without source paths", async () => {
    await setupFixture();

    const first = importScopesAndDocuments(ctx!);
    const second = importScopesAndDocuments(ctx!);

    expect(first.workspaces).toBe(2);
    expect(first.projects).toBe(6);
    expect(second).toEqual(first);
    expect(ctx!.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM workspaces").get()?.count).toBe(2);
    expect(ctx!.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM projects").get()?.count).toBe(6);
    const projects = ctx!.db.query<{ slug: string; state: string; metadata: string }, []>(
      "SELECT slug, state, metadata_json AS metadata FROM projects ORDER BY slug",
    ).all().map((row) => ({ ...row, metadata: JSON.parse(row.metadata) as Record<string, unknown> }));
    expect(projects.find((project) => project.slug === "registry-only-project")).toMatchObject({
      state: "archived",
      metadata: { needsReview: true, migrationSourceMissing: true },
    });
    expect(projects.find((project) => project.slug === "physical-only-project")).toMatchObject({
      state: "active",
      metadata: { needsReview: true, migrationRegistryMissing: true },
    });
    expect(ctx!.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM project_iterations").get()?.count).toBe(2);
    expect(ctx!.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM feedback_items").get()?.count).toBe(3);
    expect(ctx!.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM documents").get()?.count).toBeGreaterThan(10);

    const leaked = ctx!.db.query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM document_revisions WHERE instr(body, ?) > 0",
    ).get(fixture!.root)?.count ?? 0;
    expect(leaked).toBe(0);
    const bindings = ctx!.db.query<{ id: string; role: string }, []>(
      "SELECT id, role FROM project_document_bindings ORDER BY role",
    ).all();
    expect(bindings.some((binding) => binding.id.startsWith("bind_") && binding.role === "brief")).toBe(true);
    const briefRefs = JSON.parse(entry("workspaces/studio/projects/registered-project/BRIEF.md").targetRefs) as string[];
    expect(briefRefs.some((ref) => ref.startsWith("bind_"))).toBe(true);

    const farm = entry("farm/events/lifecycle.json");
    expect(farm).toMatchObject({ state: "inventoried", targetRefs: "[]" });
    expect(farm.targetPath).toMatch(/^migration-evidence\/[0-9a-f]{16}\/[0-9a-f]{64}\.raw$/);

    for (const sourcePath of ["config.json", "workspaces/studio/workspace.json"]) {
      expect(entry(sourcePath)).toMatchObject({
        disposition: "secret-recovery-only",
        state: "inventoried",
        targetPath: null,
        targetRefs: "[]",
      });
    }

    ctx!.db.prepare("UPDATE workspaces SET name = 'Conflicting replay' WHERE slug = 'studio'").run();
    expect(() => importScopesAndDocuments(ctx!)).toThrow(/replay conflict/i);
  });

  test("continues around malformed JSONL and allocates byte-exact diagnostics", async () => {
    await setupFixture();
    importScopesAndDocuments(ctx!);

    const jsonl = entry("workspaces/studio/projects/registered-project/generations.jsonl");
    const refs = JSON.parse(jsonl.targetRefs) as string[];
    expect(refs.filter((value) => value.startsWith("doc_"))).toHaveLength(2);
    const issue = ctx!.db.query<{ lineNo: number; detail: string }, []>(
      `SELECT line_no AS lineNo, detail_json AS detail FROM migration_issues
       WHERE code = 'MIGRATION_MALFORMED_JSONL'`,
    ).get();
    expect(issue?.lineNo).toBe(2);
    const detail = JSON.parse(issue!.detail) as Record<string, unknown>;
    expect(detail).toMatchObject({ byteOffset: 34, byteLength: 19, delimiter: "lf" });
    expect(detail.sha256).toBe(
      createHash("sha256").update(Buffer.from('{"id":"malformed",\n')).digest("hex"),
    );
    expect(detail.evidenceTargetPath).toMatch(/^migration-evidence\/diagnostics\/[0-9a-f]{16}\/[0-9a-f]{64}-2\.raw$/);
  });

  test("forced-clones and reconciles legacy jobs while holding pending work", async () => {
    await setupFixture({ jobSecrets: true });
    importScopesAndDocuments(ctx!);

    const first = importExecutionAndOperations(ctx!);
    const second = importExecutionAndOperations(ctx!);

    expect(first).toMatchObject({ jobs: 1, logs: 1, artifacts: 1, issues: 1 });
    expect(second).toEqual(first);
    expect(ctx!.db.query<{ hold: string; status: string; runId: string }, []>(
      "SELECT migration_hold_run_id AS hold, status, run_id AS runId FROM jobs WHERE id = 1",
    ).get()).toEqual({ hold: ctx!.runId, status: "pending", runId: expect.stringMatching(/^run_/u) });
    expect(ctx!.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM job_logs").get()?.count).toBe(1);
    const artifact = ctx!.db.query<{ count: number; path: string }, []>(
      "SELECT COUNT(*) AS count, path FROM job_artifacts",
    ).get();
    expect(artifact?.count).toBe(1);
    expect(artifact?.path).not.toStartWith("/");
    expect(ctx!.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM runs WHERE kind = 'legacy-job'").get()?.count).toBe(1);
    expect(ctx!.db.query<{ command: string }, []>("SELECT command FROM jobs WHERE id = 1").get()?.command)
      .not.toContain(fixtureDir!);
    const serialized = ctx!.db.serialize().toString("utf8");
    for (const secret of ["command-secret", "error-secret", "tag-secret", "log-secret"]) {
      expect(serialized).not.toContain(secret);
    }
    expect(ctx!.db.query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM migration_issues WHERE code = ?",
    ).get("MIGRATION_JOB_SECRET_REDACTED")?.count).toBe(1);
    const accounting = ctx!.db.query<{ detail: string }, []>(
      "SELECT detail_json AS detail FROM migration_issues WHERE code = 'MIGRATION_JOB_ACCOUNTING_FACT'",
    ).get();
    expect(accounting).toBeDefined();
    expect(JSON.parse(accounting!.detail)).toMatchObject({
      jobs: [{ id: 1, status: "pending", hold: ctx!.runId }],
      logs: [{ id: 1, jobId: 1 }],
      artifacts: [{ id: 1, jobId: 1 }],
    });
    expect(entry("jobs.db")).toMatchObject({
      disposition: "secret-recovery-only",
      targetPath: null,
      targetRefs: "[]",
    });

  });

  test("uses one recursive fail-closed sanitizer for every imported text sink", async () => {
    await setupFixture({
      adversarialJobs: true,
      mutate(value) {
        fs.writeFileSync(
          path.join(value.paths.registeredProject, "notes", "recursive.json"),
          JSON.stringify({
            nested: {
              file: "file:///Users/alice/private/file",
              html: '<img src="/Volumes/secret/a.png">',
              data: "data:text/plain,document-secret",
              "/Users/alice/private/object-key": "absolute-key-value",
              "data:text/plain,object-key": "data-key-value",
            },
          }),
        );
        const collisionRelative = "workspaces/studio/projects/registered-project/collision-key";
        fs.writeFileSync(
          path.join(value.paths.registeredProject, "notes", "collision.json"),
          JSON.stringify({
            [path.join(value.paths.currentRoot, collisionRelative)]: "absolute",
            [collisionRelative]: "relative",
          }),
        );
      },
    });
    const scopes = importScopesAndDocuments(ctx!);
    expect(importScopesAndDocuments(ctx!)).toEqual(scopes);
    const imported = importExecutionAndOperations(ctx!);
    const replayed = importExecutionAndOperations(ctx!);

    expect(imported).toMatchObject({ jobs: 2, logs: 2, artifacts: 2, issues: 2 });
    expect(replayed).toEqual(imported);
    const serialized = ctx!.db.serialize().toString("utf8");
    for (const plaintext of [
      "private-object-secret",
      "fallback-flag-secret",
      "pem-secret",
      "basic-log-secret",
      "private-tag-secret",
      "document-secret",
      "depends-secret",
      "kind-secret",
      "dep-data",
      "kind-data",
      "file:///Users/alice/private/file",
      "/Volumes/secret/a.png",
      "data:text/plain",
    ]) {
      expect(serialized).not.toContain(plaintext);
    }
    const liveText = JSON.stringify(ctx!.db.query<{ value: string | null }, []>(`
      SELECT body AS value FROM document_revisions
      UNION ALL SELECT label FROM runs
      UNION ALL SELECT error FROM runs
      UNION ALL SELECT metadata_json FROM runs
      UNION ALL SELECT command FROM jobs
      UNION ALL SELECT depends_on FROM jobs
      UNION ALL SELECT error_message FROM jobs
      UNION ALL SELECT tag FROM jobs
      UNION ALL SELECT log_path FROM jobs
      UNION ALL SELECT line FROM job_logs
      UNION ALL SELECT kind FROM job_artifacts
      UNION ALL SELECT path FROM job_artifacts
    `).all());
    expect(liveText).not.toMatch(/(?:file:\/{3}|data:|\/Users\/|\/Volumes\/)/u);
    expect(ctx!.db.query<{ command: string }, []>("SELECT command FROM jobs WHERE id = 1").get()?.command)
      .not.toContain("private_key");
    const recursiveBody = ctx!.db.query<{ body: string }, []>(
      "SELECT body FROM document_revisions revision JOIN documents document ON document.id = revision.document_id WHERE document.title = 'recursive.json'",
    ).get()?.body ?? "{}";
    const nestedKeys = Object.keys((JSON.parse(recursiveBody) as { nested: Record<string, unknown> }).nested);
    expect(nestedKeys).toEqual([...nestedKeys].sort());
    expect(ctx!.db.query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM migration_issues WHERE code = ?",
    ).get("MIGRATION_JOB_SECRET_REDACTED")?.count).toBe(2);
    expect(ctx!.db.query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM migration_issues WHERE code = ?",
    ).get("MIGRATION_DOCUMENT_KEY_COLLISION")?.count).toBe(1);
    expect(ctx!.db.query<{ dependsOn: string }, []>(
      "SELECT depends_on AS dependsOn FROM jobs WHERE id = 1",
    ).get()?.dependsOn).toBe("[1]");
    expect(ctx!.db.query<{ kind: string }, []>(
      "SELECT kind FROM job_artifacts ORDER BY id LIMIT 1",
    ).get()?.kind).toBe("legacy");
    expect(ctx!.db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM documents WHERE title = 'collision.json'",
    ).get()?.count).toBe(0);
    expect(entry("jobs.db")).toMatchObject({
      disposition: "secret-recovery-only",
      targetPath: null,
      targetRefs: "[]",
    });
  });

  test("rejects source drift before importing semantic bytes", async () => {
    await setupFixture();
    fs.appendFileSync(fixture!.paths.jsonl, '{"id":"drift"}\n');

    expect(() => importScopesAndDocuments(ctx!)).toThrow(/changed after inventory/i);
    expect(ctx!.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM documents").get()?.count).toBe(0);
  });

  test("sanitizes absolute paths and data URLs in Markdown and text Documents", async () => {
    await setupFixture({
      mutate(value) {
        fs.writeFileSync(
          path.join(value.paths.registeredProject, "notes", "sensitive.md"),
          `Source: ${value.paths.registeredProject}/BRIEF.md\nWindows: C:\\Users\\alice\\secret.txt\nImage: data:image/png;base64,U0VDUkVU\nText: data:text/plain,secret%20value\n`,
        );
      },
    });

    importScopesAndDocuments(ctx!);

    const body = ctx!.db.query<{ body: string }, []>(
      "SELECT body FROM document_revisions WHERE body LIKE '%migration-%omitted%' LIMIT 1",
    ).get()?.body ?? "";
    expect(body).not.toContain(fixture!.root);
    expect(body).not.toContain("data:image/png;base64");
    expect(body).not.toContain("U0VDUkVU");
    expect(body).not.toContain("C:\\Users");
    expect(body).not.toContain("secret%20value");
    expect(body).toContain("migration-data-omitted");
  });

  test("selects one stable Project Document binding and reviews duplicate candidates", async () => {
    await setupFixture({
      mutate(value) {
        fs.writeFileSync(path.join(value.paths.registeredProject, "scenario.json"), '{"title":"canonical"}\n');
        fs.writeFileSync(path.join(value.paths.registeredProject, "scenario.md"), "archived scenario\n");
        const archive = path.join(value.paths.registeredProject, "archive");
        fs.mkdirSync(archive, { recursive: true });
        fs.writeFileSync(path.join(archive, "BRIEF.md"), "archived brief\n");
      },
    });

    const first = importScopesAndDocuments(ctx!);
    const second = importScopesAndDocuments(ctx!);

    expect(second).toEqual(first);
    expect(ctx!.db.query<{ count: number }, []>(
      `SELECT COUNT(*) AS count FROM documents document
       JOIN projects project ON project.id = document.project_id
       WHERE project.slug = 'registered-project' AND document.kind IN ('brief', 'scenario')`,
    ).get()?.count).toBe(4);
    const selected = ctx!.db.query<{ title: string }, []>(
      `SELECT document.title
       FROM project_document_bindings binding
       JOIN document_revisions revision ON revision.id = binding.document_revision_id
       JOIN documents document ON document.id = revision.document_id
       JOIN projects project ON project.id = document.project_id
       WHERE binding.role = 'scenario' AND project.slug = 'registered-project'`,
    ).get()?.title;
    expect(selected).toBe("scenario.json");
    expect(ctx!.db.query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM migration_issues WHERE code = ?",
    ).get("MIGRATION_PROJECT_DOCUMENT_AMBIGUOUS")?.count).toBe(2);
  });

  test("keeps same-slug Projects source-bound and reviews registry workspace drift", async () => {
    await setupFixture({
      mutate(value) {
        const registry = JSON.parse(fs.readFileSync(value.paths.registry, "utf8")) as {
          projects: Record<string, unknown>;
        };
        registry.projects["cross-workspace"] = {
          workspace: "other",
          path: "workspaces/other/projects/cross-workspace",
        };
        fs.writeFileSync(value.paths.registry, `${JSON.stringify(registry, null, 2)}\n`);
        for (const workspace of ["studio", "other"]) {
          const project = path.join(value.paths.currentRoot, "workspaces", workspace, "projects", "shared");
          fs.mkdirSync(project, { recursive: true });
          fs.writeFileSync(path.join(project, "project.json"), '{"id":"shared"}\n');
        }
        const mismatched = path.join(value.paths.currentRoot, "workspaces", "studio", "projects", "cross-workspace");
        fs.mkdirSync(mismatched, { recursive: true });
        fs.writeFileSync(path.join(mismatched, "project.json"), '{"id":"cross-workspace"}\n');
      },
      jobProjectId: "shared",
    });

    importScopesAndDocuments(ctx!);
    const shared = ctx!.db.query<{ workspace: string }, []>(
      `SELECT workspace.slug AS workspace FROM projects project
       JOIN workspaces workspace ON workspace.id = project.workspace_id
       WHERE project.slug = 'shared' ORDER BY workspace.slug`,
    ).all();
    expect(shared.map((row) => row.workspace)).toEqual(["other", "studio"]);
    expect(ctx!.db.query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM migration_issues WHERE code = ?",
    ).get("MIGRATION_PROJECT_WORKSPACE_MISMATCH")?.count).toBe(1);

    const imported = importExecutionAndOperations(ctx!);
    expect(imported.issues).toBe(1);
    expect(ctx!.db.query<{ projectId: string | null }, []>(
      "SELECT project_id AS projectId FROM jobs WHERE id = 1",
    ).get()?.projectId).toBeNull();
    expect(entry("jobs.db")).toMatchObject({ disposition: "domain" });
    expect(entry("jobs.db").targetPath).toMatch(/^migration-evidence\/[0-9a-f]{16}\/[0-9a-f]{64}\.raw$/);
  });

  test("rolls back the jobs batch when its ledger allocation cannot advance", async () => {
    await setupFixture();
    importScopesAndDocuments(ctx!);
    const jobsEntry = ctx!.db.query<{ id: string }, []>(
      "SELECT id FROM migration_entries WHERE source_path = 'jobs.db'",
    ).get()!;
    const now = Date.now();
    ctx!.db.prepare(
      `UPDATE migration_entries
       SET disposition = 'recovery-only', state = 'excluded', terminal_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(now, now, jobsEntry.id);

    expect(() => importExecutionAndOperations(ctx!)).toThrow(/ledger update/i);
    expect(ctx!.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM jobs").get()?.count).toBe(0);
    expect(ctx!.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM runs WHERE kind = 'legacy-job'").get()?.count).toBe(0);
  });

  test("rolls back all source triplets when the last source cannot advance", async () => {
    await setupFixture({
      mutate(value) {
        createLegacyJobsDb(path.join(value.paths.legacyRoot, "jobs.db"), 2);
      },
    });
    importScopesAndDocuments(ctx!);
    const lastEntry = ctx!.db.query<{ id: string }, []>(
      `SELECT entry.id
       FROM migration_entries entry
       JOIN migration_sources source ON source.id = entry.migration_source_id
       WHERE source.source_label = 'source-legacy' AND entry.source_path = 'jobs.db'`,
    ).get()!;
    const now = Date.now();
    ctx!.db.prepare(
      `UPDATE migration_entries
       SET disposition = 'recovery-only', state = 'excluded', terminal_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(now, now, lastEntry.id);

    expect(() => importExecutionAndOperations(ctx!)).toThrow(/ledger update/i);
    expect(ctx!.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM jobs").get()?.count).toBe(0);
    expect(ctx!.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM runs WHERE kind = 'legacy-job'").get()?.count).toBe(0);
  });
});

async function setupFixture(options: {
  mutate?: (value: LegacyFixture) => void;
  jobSecrets?: boolean;
  adversarialJobs?: boolean;
  jobProjectId?: string;
} = {}): Promise<void> {
  root = makeTmpRoot("ralphy-migration-import");
  fixtureDir = fs.realpathSync(fs.mkdtempSync("/tmp/ralphy-mi-"));
  fixture = buildLegacyLibrary(fixtureDir);
  options.mutate?.(fixture);
  const jobs = new Database(fixture.paths.jobsDb);
  jobs.exec("ALTER TABLE jobs ADD COLUMN error_message TEXT");
  jobs.exec("ALTER TABLE jobs ADD COLUMN tag TEXT");
  jobs.exec("ALTER TABLE jobs ADD COLUMN project_id TEXT");
  jobs.exec("ALTER TABLE jobs ADD COLUMN depends_on TEXT");
  jobs.exec(`
    CREATE TABLE job_artifacts (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      path TEXT NOT NULL,
      bytes INTEGER,
      sha256 TEXT
    );
  `);
  jobs.prepare(
    "INSERT INTO job_artifacts (id, job_id, kind, path, bytes, sha256) VALUES (1, 1, 'log', ?, 18, NULL)",
  ).run(path.join(fixtureDir, "job-output.bin"));
  jobs.prepare("UPDATE jobs SET command = ?, error_message = ?, tag = ?, project_id = ? WHERE id = 1").run(
    JSON.stringify({
      argv: options.jobSecrets
        ? ["render", "--api-key", "command-secret"]
        : ["render", "registered-project"],
      cwd: fixtureDir,
    }),
    options.jobSecrets ? "Authorization: Bearer error-secret" : null,
    options.jobSecrets ? "token=tag-secret" : null,
    options.jobProjectId ?? null,
  );
  if (options.jobSecrets) {
    jobs.prepare("UPDATE job_logs SET line = ? WHERE id = 1").run("Bearer log-secret");
  }
  if (options.adversarialJobs) {
    jobs.prepare("UPDATE jobs SET status = 'failed', command = ?, depends_on = ?, error_message = ?, tag = ? WHERE id = 1").run(
      JSON.stringify({
        private_key: "private-object-secret",
        argv: ["render", "--bot-token", "object-flag-secret"],
        input: "file:///Users/alice/private/file",
      }),
      JSON.stringify([1, "private_key=depends-secret", "data:text/plain,dep-data", "file:///Users/alice/dep"]),
      "-----BEGIN PRIVATE KEY-----\npem-secret\n-----END PRIVATE KEY-----",
      "private_key=private-tag-secret",
    );
    jobs.prepare(
      `INSERT INTO jobs
       (id, status, command, created_at, error_message, tag, project_id)
       VALUES (2, 'failed', ?, 1700000001000, ?, NULL, NULL)`,
    ).run(
      "render --bot-token fallback-flag-secret file:///Users/alice/private/file",
      "Authorization: Basic fallback-basic-secret",
    );
    jobs.prepare("INSERT INTO job_logs (id, job_id, line) VALUES (2, 2, ?)")
      .run("Authorization: Basic basic-log-secret /Volumes/secret/log.txt");
    jobs.prepare(
      "INSERT INTO job_artifacts (id, job_id, kind, path, bytes, sha256) VALUES (2, 2, 'log', ?, 1, NULL)",
    ).run("file:///Volumes/secret/a.png");
    jobs.prepare("UPDATE job_artifacts SET kind = ? WHERE id = 1").run("private_key=kind-secret");
    jobs.prepare("UPDATE job_artifacts SET kind = ? WHERE id = 2").run("data:text/plain,kind-data");
  }
  jobs.close();
  const runId = "mig_00000000-0000-4000-8000-000000000003";
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
}

function entry(sourcePath: string): {
  disposition: string;
  state: string;
  targetPath: string | null;
  targetRefs: string;
} {
  const row = ctx!.db.query<{
    disposition: string;
    state: string;
    targetPath: string | null;
    targetRefs: string | null;
  }, [string]>(
    `SELECT disposition, state, target_path AS targetPath, target_refs_json AS targetRefs
     FROM migration_entries WHERE migration_run_id = ? AND source_path = ?`,
  ).get(ctx!.runId, sourcePath);
  if (!row) throw new Error(`Missing migration entry: ${sourcePath}`);
  return { ...row, targetRefs: row.targetRefs ?? "[]" };
}

function createLegacyJobsDb(file: string, id: number): void {
  const db = new Database(file, { create: true });
  try {
    db.exec(`
      CREATE TABLE jobs (
        id INTEGER PRIMARY KEY,
        status TEXT NOT NULL,
        command TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE job_logs (
        id INTEGER PRIMARY KEY,
        job_id INTEGER NOT NULL,
        line TEXT NOT NULL
      );
    `);
    db.prepare("INSERT INTO jobs (id, status, command, created_at) VALUES (?, 'pending', '{}', 1700000000000)")
      .run(id);
    db.prepare("INSERT INTO job_logs (id, job_id, line) VALUES (?, ?, 'legacy')").run(id, id);
  } finally {
    db.close();
  }
}
