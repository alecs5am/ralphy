import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  acquireMaintenanceLock,
  inventoryLegacySource,
  releaseMaintenanceLock,
} from "../../cli/lib/migration/inventory.js";
import {
  importDesktopStateAndSecrets,
  importProductionAndDelivery,
  importScopesAndDocuments,
} from "../../cli/lib/migration/import.js";
import {
  isLegacyDesktopDocumentPath,
  isLegacyDesktopReviewPath,
  isLegacyRootConfigPath,
} from "../../cli/lib/migration/legacy.js";
import { stageInventoryObjects } from "../../cli/lib/migration/staging.js";
import type { MigrationContext, MigrationLock } from "../../cli/lib/migration/types.js";
import { createBridgeMethods } from "../../cli/lib/bridge/methods.js";
import { openDomainDbAt } from "../../cli/lib/store/db.js";
import { createSecretStore, type KeyProvider } from "../../cli/lib/store/secrets.js";
import { newDomainId } from "../../cli/lib/store/ids.js";
import {
  buildLegacyLibrary,
  type LegacyFixture,
} from "../fixtures/migration/build-legacy-library.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const FIXED_KEY = Buffer.alloc(32, 19);
const keyProvider: KeyProvider = {
  lookupKey: async () => FIXED_KEY,
  createKey: async () => FIXED_KEY,
};

let root: TmpRoot | null = null;
let fixture: LegacyFixture | null = null;
let fixtureDir: string | null = null;
let lock: MigrationLock | null = null;
let ctx: MigrationContext | null = null;

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

describe("Desktop state and credential migration", () => {
  test("keeps Desktop legacy filenames behind migration-only classifiers", () => {
    expect(isLegacyRootConfigPath("config.json")).toBe(true);
    expect(isLegacyRootConfigPath("nested/config.json")).toBe(false);
    expect(isLegacyDesktopReviewPath("review/annotations.json")).toBe(true);
    expect(isLegacyDesktopReviewPath("reviews/annotations.json")).toBe(true);
    expect(isLegacyDesktopReviewPath("project/annotations.json")).toBe(false);
    for (const sourcePath of [
      "state.json",
      "settings.json",
      "chat.json",
      "chats.json",
      "localStorage.json",
      "localStorage-export.json",
    ]) {
      expect(isLegacyDesktopDocumentPath(sourcePath)).toBe(true);
    }
    expect(isLegacyDesktopDocumentPath("ordinary.json")).toBe(false);
  });

  test("binds root credentials and cookies to the registry primary among thirty Workspaces", async () => {
    await setupFixture({ extraWorkspaces: 29 });

    expect(await importDesktopStateAndSecrets(ctx!, { keyProvider })).toBeDefined();
    const primary = workspace("studio");
    expect(JSON.parse(ledger("config.json").refs)).toEqual([
      `provider/postiz/workspace/${primary}/workspace/${primary}`,
      expect.stringMatching(new RegExp(`^provider/x/workspace/${primary}/account/`, "u")),
    ]);
    expect(JSON.parse(ledger("tmp/ig-cookies.txt").refs)).toEqual([
      `provider/instagram/workspace/${primary}/cookies`,
    ]);
  });

  test("rejects non-versioned Desktop document fields, missing Projects, and opaque secret shapes", async () => {
    await setupFixture({ invalidDesktopDocuments: true });

    const summary = await importDesktopStateAndSecrets(ctx!, { keyProvider });
    expect(summary.documents).toBe(2);
    expect(issueCount("MIGRATION_DESKTOP_DOCUMENT_INVALID")).toBe(3);
  });

  test("retains missing and ambiguous Project reviews as sanitized orphan needsReview evidence", async () => {
    await setupFixture({ orphanReviews: true });

    await expect(importDesktopStateAndSecrets(ctx!, { keyProvider })).resolves.toBeDefined();
    const details = ctx!.db.query<{ detail: string }, [string]>(
      `SELECT detail_json AS detail FROM migration_issues
       WHERE migration_run_id = ? AND code = 'MIGRATION_DESKTOP_REVIEW_ORPHANED'
       ORDER BY id`,
    ).all(ctx!.runId).map((row) => JSON.parse(row.detail) as Record<string, unknown>);
    expect(details).toHaveLength(2);
    expect(details).toEqual(expect.arrayContaining([
      expect.objectContaining({
        needsReview: true,
        state: "Needs Work",
        note: "Missing Project note",
        tags: ["orphan"],
        rating: 2,
        favorite: true,
      }),
      expect.objectContaining({
        needsReview: true,
        state: "Shortlist",
        note: "Ambiguous Project note",
        tags: ["ambiguous"],
        rating: 4,
        favorite: false,
      }),
    ]));
    expect(JSON.stringify(details)).not.toContain("missing/orphan.mp4");
  });

  test("refuses a direct credential ref already owned by another migration entry before writing", async () => {
    await setupFixture();
    const workspaceId = workspace("studio");
    const ref = `provider/postiz/workspace/${workspaceId}/workspace/${workspaceId}`;
    const owner = ledger("secrets/unknown.bin", "desktop");
    ctx!.db.prepare("UPDATE migration_entries SET target_refs_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify([ref]), Date.now(), owner.id);
    const store = createSecretStore({ dataRoot: ctx!.storeRoot, keyProvider });
    await store.set(ref, "preexisting-secret");

    await expect(importDesktopStateAndSecrets(ctx!, { keyProvider })).rejects.toThrow(/owned/u);
    expect(await store.read(ref)).toBe("preexisting-secret");
    expect(ledger("config.json").state).toBe("inventoried");
  });

  test("imports typed reviews, documents, and known credentials without plaintext persistence", async () => {
    await setupFixture();

    const first = await importDesktopStateAndSecrets(ctx!, { keyProvider });
    const replay = await importDesktopStateAndSecrets(ctx!, { keyProvider });
    expect(replay).toEqual(first);
    expect(first).toMatchObject({ reviews: 5, feedback: 2, secrets: 4, documents: 2 });

    const evaluations = ctx!.db.query<{
      verdict: string;
      favorite: number;
      rating: number | null;
      tags: string;
      note: string | null;
      target: string;
    }, []>(
      `SELECT verdict, favorite, rating, tags_json AS tags, note,
              COALESCE(artifact_revision_id, composition_revision_id) AS target
       FROM evaluations WHERE kind = 'desktop-review' ORDER BY verdict`,
    ).all();
    expect(evaluations.map((row) => row.verdict)).toEqual([
      "approved",
      "approved",
      "candidate",
      "open",
      "rejected",
    ]);
    expect(evaluations.find((row) => row.verdict === "approved")).toMatchObject({
      favorite: 1,
      rating: 5,
      note: "Ready to publish",
      tags: '["final","hero"]',
    });
    expect(evaluations.every((row) => /^(?:arev|crev)_/u.test(row.target))).toBe(true);

    const feedback = ctx!.db.query<{
      body: string;
      targetType: string | null;
      targetId: string | null;
      status: string;
    }, []>(
      `SELECT body, target_type AS targetType, target_id AS targetId, status
       FROM feedback_items WHERE body LIKE 'Desktop review:%' ORDER BY body`,
    ).all();
    expect(feedback).toHaveLength(2);
    expect(feedback.find((row) => row.body.includes("Tighten pacing"))).toMatchObject({
      targetType: "artifact_revision",
      status: "open",
    });
    expect(feedback.find((row) => row.body.includes("Unmatched"))).toMatchObject({
      targetType: null,
      targetId: null,
      status: "open",
    });

    expect(issueCount("MIGRATION_DESKTOP_REVIEW_PATH_COLLISION")).toBe(0);
    expect(issueCount("MIGRATION_DESKTOP_REVIEW_UNMATCHED")).toBe(1);
    expect(issueCount("MIGRATION_DESKTOP_SECRET_HANDOFF_REQUIRED")).toBe(2);
    expect(issueCount("MIGRATION_SECRET_UNKNOWN")).toBe(1);

    const documents = ctx!.db.query<{ title: string; body: string }, []>(
      `SELECT document.title, revision.body
       FROM documents document JOIN document_revisions revision
         ON revision.id = document.current_revision_id
       WHERE document.title LIKE 'Desktop %' ORDER BY document.title`,
    ).all();
    expect(documents.map((row) => row.title)).toEqual([
      "Desktop Agent Session history",
      "Desktop Agent Session preferences",
    ]);
    expect(JSON.parse(documents[0]!.body)).toMatchObject({ kind: "agent-session-history" });
    expect(JSON.parse(documents[1]!.body)).toMatchObject({ kind: "agent-session-preferences" });

    const workspaceId = workspace("studio");
    const xAccount = ctx!.db.query<{ id: string; externalId: string; username: string; ref: string }, []>(
      `SELECT id, external_id AS externalId, username, credential_ref AS ref
       FROM social_accounts WHERE platform = 'x'`,
    ).get()!;
    expect(xAccount).toMatchObject({ externalId: "x-account-42", username: "fixture_creator" });
    const refs = {
      x: xAccount.ref,
      postiz: `provider/postiz/workspace/${workspaceId}/workspace/${workspaceId}`,
      telegram: `provider/telegram/workspace/${workspaceId}/workspace/${workspaceId}`,
      instagram: `provider/instagram/workspace/${workspaceId}/cookies`,
    };
    const store = createSecretStore({ dataRoot: ctx!.storeRoot, keyProvider });
    expect(await store.read(refs.x)).toBe("fixture-x-plaintext-token");
    expect(await store.read(refs.postiz)).toBe("fixture-postiz-plaintext-key");
    expect(await store.read(refs.telegram)).toBe("fixture-telegram-plaintext-token");
    expect(await store.has(refs.instagram)).toBe(true);

    for (const sourcePath of ["config.json", "workspaces/studio/workspace.json", "tmp/ig-cookies.txt"]) {
      expect(ledger(sourcePath)).toMatchObject({ disposition: "secret-imported", state: "excluded" });
    }
    expect(JSON.parse(ledger("config.json").refs)).toEqual([refs.postiz, refs.x].sort());

    assertNoPlaintext(ctx!.storeRoot, [
      "fixture-x-plaintext-token",
      "fixture-postiz-plaintext-key",
      "fixture-telegram-plaintext-token",
      "fixture-instagram-cookie",
    ]);

    const oldStoreRoot = ctx!.storeRoot;
    ctx!.db.close();
    ctx = null;
    const liveStoreRoot = path.join(fixtureDir!, "live", ".ralphy");
    fs.mkdirSync(path.dirname(liveStoreRoot), { recursive: true });
    fs.renameSync(oldStoreRoot, liveStoreRoot);
    const liveDb = openDomainDbAt(liveStoreRoot);
    const runId = newDomainId("run");
    liveDb.prepare(
      `INSERT INTO runs (id, workspace_id, kind, state, created_at)
       VALUES (?, ?, 'secret-materialization-test', 'pending', ?)`,
    ).run(runId, workspaceId, Date.now());
    liveDb.prepare("UPDATE runs SET state = 'running', started_at = ? WHERE id = ?")
      .run(Date.now(), runId);
    liveDb.close();
    const liveStore = createSecretStore({ dataRoot: liveStoreRoot, keyProvider });
    expect(await liveStore.read(refs.x)).toBe("fixture-x-plaintext-token");
    const materialized = path.join(
      liveStoreRoot,
      await liveStore.materializeSecretFile(refs.instagram, runId),
    );
    expect(fs.statSync(materialized).mode & 0o777).toBe(0o600);
    expect(materialized).toContain(path.join("tmp", runId, "secrets"));
    expect(fs.statSync(materialized).size).toBe(667_395);
  });

  test("the safeStorage handoff is exact-shape, write-only, and completes only its Desktop entry", async () => {
    await setupFixture();
    await importDesktopStateAndSecrets(ctx!, { keyProvider });
    const safeEntry = ledger("safeStorage/credentials.bin", "desktop");
    const workspaceId = workspace("studio");
    const ref = `provider/desktop/workspace/${workspaceId}/workspace/${workspaceId}`;
    expect(JSON.parse(safeEntry.refs)).toEqual([ref]);
    expect(secretPlan(safeEntry.id)).toEqual({ kind: "text", refs: [ref] });
    const methods = createBridgeMethods({ dataRoot: ctx!.storeRoot, keyProvider });
    const method = methods.get("migration.secret.import")!;
    const fileEntry = ledger("safeStorage/cookies.bin", "desktop");
    const fileRef = `provider/instagram/workspace/${workspaceId}/workspace/${workspaceId}`;
    expect(JSON.parse(fileEntry.refs)).toEqual([fileRef]);
    expect(secretPlan(fileEntry.id)).toEqual({ kind: "file", refs: [fileRef] });
    await expect(method.handle({
      runId: ctx!.runId,
      sourceEntryId: safeEntry.id,
      ref: fileRef,
      kind: "file",
      base64: "YQ==",
    }, bridgeContext())).rejects.toThrow();
    await expect(method.handle({
      runId: ctx!.runId,
      sourceEntryId: fileEntry.id,
      ref,
      kind: "text",
      value: "cross-entry-secret",
    }, bridgeContext())).rejects.toThrow();
    await expect(method.handle({
      runId: ctx!.runId,
      sourceEntryId: fileEntry.id,
      ref: fileRef,
      kind: "file",
      base64: "YR==",
    }, bridgeContext())).rejects.toThrow();
    expect(ledger("safeStorage/cookies.bin", "desktop").state).toBe("inventoried");
    await expect(method.handle({
      runId: ctx!.runId,
      sourceEntryId: fileEntry.id,
      ref: fileRef,
      kind: "file",
      base64: Buffer.alloc(1024 * 1024 + 1).toString("base64"),
    }, bridgeContext())).rejects.toThrow();
    expect(ledger("safeStorage/cookies.bin", "desktop").state).toBe("inventoried");
    const redirectedRef = `provider/postiz/workspace/${workspaceId}/workspace/${workspaceId}`;
    const secretStore = createSecretStore({ dataRoot: ctx!.storeRoot, keyProvider });
    const redirectedBefore = await secretStore.read(redirectedRef);
    await expect(method.handle({
      runId: ctx!.runId,
      sourceEntryId: safeEntry.id,
      ref: redirectedRef,
      kind: "text",
      value: "redirected-secret",
    }, bridgeContext())).rejects.toThrow();
    expect(await secretStore.read(redirectedRef)).toBe(redirectedBefore);
    const secret = "fixture-safeStorage-decrypted-token";
    const request = JSON.stringify({
      v: 1,
      id: "secret-import",
      method: "migration.secret.import",
      params: {
        runId: ctx!.runId,
        sourceEntryId: safeEntry.id,
        ref,
        kind: "text",
        value: secret,
      },
    });

    const bridgeServerUrl = pathToFileURL(path.join(import.meta.dir, "../../cli/lib/bridge/server.ts")).href;
    const bridgeMethodsUrl = pathToFileURL(path.join(import.meta.dir, "../../cli/lib/bridge/methods.ts")).href;
    const bridgeSource = `
      import { runBridge } from ${JSON.stringify(bridgeServerUrl)};
      import { createBridgeMethods } from ${JSON.stringify(bridgeMethodsUrl)};
      const keyProvider = {
        lookupKey: async () => Buffer.alloc(32, 19),
        createKey: async () => Buffer.alloc(32, 19),
      };
      await runBridge({
        dataRoot: ${JSON.stringify(ctx!.storeRoot)},
        methods: createBridgeMethods({ dataRoot: ${JSON.stringify(ctx!.storeRoot)}, keyProvider }),
      });
    `;
    const helperSource = `
      import fs from "node:fs";
      fs.watch = () => { throw new Error("watcher forbidden"); };
      globalThis.setInterval = () => { throw new Error("timer forbidden"); };
      const request = await Bun.stdin.text();
      let children = 0;
      const bridge = Bun.spawn({
        cmd: ["bun", "-e", ${JSON.stringify(bridgeSource)}],
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
      children += 1;
      bridge.stdin.write('{"v":1,"id":"hello","method":"system.hello"}\\n');
      bridge.stdin.write(request.endsWith("\\n") ? request : request + "\\n");
      bridge.stdin.end();
      const [output, errorOutput, exitCode] = await Promise.all([
        new Response(bridge.stdout).text(),
        new Response(bridge.stderr).text(),
        bridge.exited,
      ]);
      if (children !== 1 || exitCode !== 0 || errorOutput !== "") throw new Error("bridge helper lifecycle failed");
      const expected = JSON.parse(request).params;
      const response = JSON.parse(output.trim().split("\\n").at(-1));
      const result = response.result;
      if (!response.ok || result.ref !== expected.ref || result.kind !== expected.kind
        || result.completed !== true || Object.keys(result).sort().join(",") !== "completed,kind,ref") {
        throw new Error("bridge helper response contract failed");
      }
    `;
    const helper = Bun.spawn({
      cmd: ["bun", "-e", helperSource],
      stdin: new Blob([request]),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [helperOutput, helperError, helperExit] = await Promise.all([
      new Response(helper.stdout).text(),
      new Response(helper.stderr).text(),
      helper.exited,
    ]);
    expect(helperError).toBe("");
    expect(helperExit).toBe(0);
    expect(helperOutput).toBe("");
    expect(`${helperOutput}${helperError}`).not.toContain(secret);
    expect(ledger("safeStorage/credentials.bin", "desktop")).toMatchObject({
      disposition: "secret-imported",
      state: "excluded",
      refs: JSON.stringify([ref]),
    });
    expect(resolvedIssueCount("MIGRATION_DESKTOP_SECRET_HANDOFF_REQUIRED")).toBe(1);
    expect(await createSecretStore({ dataRoot: ctx!.storeRoot, keyProvider }).read(ref)).toBe(secret);

    await expect(method.handle({
      runId: ctx!.runId,
      sourceEntryId: safeEntry.id,
      ref,
      kind: "text",
      value: "different-replay-secret",
    }, bridgeContext())).resolves.toEqual({ ref, kind: "text", completed: true });
    expect(await createSecretStore({ dataRoot: ctx!.storeRoot, keyProvider }).read(ref)).toBe(secret);

    const fileSecret = Buffer.from("fixture-safeStorage-file-secret");
    await expect(method.handle({
      runId: ctx!.runId,
      sourceEntryId: fileEntry.id,
      ref: fileRef,
      kind: "file",
      base64: fileSecret.toString("base64"),
    }, bridgeContext())).resolves.toEqual({ ref: fileRef, kind: "file", completed: true });
    expect(await createSecretStore({ dataRoot: ctx!.storeRoot, keyProvider }).has(fileRef)).toBe(true);
    expect(ledger("safeStorage/cookies.bin", "desktop")).toMatchObject({
      disposition: "secret-imported",
      state: "excluded",
      refs: JSON.stringify([fileRef]),
    });
    expect(resolvedIssueCount("MIGRATION_DESKTOP_SECRET_HANDOFF_REQUIRED")).toBe(2);
    assertNoPlaintext(ctx!.storeRoot, [secret, fileSecret.toString("utf8")]);

    const base = {
      runId: ctx!.runId,
      sourceEntryId: safeEntry.id,
      ref,
    };
    for (const params of [
      { ...base, kind: "unknown", value: secret },
      { ...base, kind: "text", value: secret, base64: "YQ==" },
      { ...base, kind: "file", base64: "%%%" },
      { ...base, kind: "file", base64: "YQ==" },
      { ...base, kind: "file", base64: "YQ==", value: secret },
      { ...base, kind: "text", value: secret, ref: "provider/../escape" },
      { ...base, kind: "text", value: secret, sourceEntryId: "mentry_missing" },
    ]) {
      await expect(method.handle(params, bridgeContext())).rejects.toThrow();
    }
  });
});

async function setupFixture(options: {
  extraWorkspaces?: number;
  invalidDesktopDocuments?: boolean;
  orphanReviews?: boolean;
} = {}): Promise<void> {
  root = makeTmpRoot("ralphy-migration-desktop");
  fixtureDir = fs.realpathSync(fs.mkdtempSync("/tmp/ralphy-md-"));
  fixture = buildLegacyLibrary(fixtureDir);
  writeJson(path.join(fixture.paths.currentRoot, "config.json"), {
    x: {
      accessToken: "fixture-x-plaintext-token",
      accountId: "x-account-42",
      username: "fixture_creator",
      displayName: "Fixture Creator",
    },
    postiz: { apiKey: "fixture-postiz-plaintext-key" },
  });
  for (let index = 0; index < (options.extraWorkspaces ?? 0); index += 1) {
    const slug = `extra-${String(index + 1).padStart(2, "0")}`;
    writeJson(path.join(fixture.paths.currentRoot, "workspaces", slug, "workspace.json"), { slug });
  }
  const projectPrefix = "workspaces/studio/projects/registered-project";
  const project = fixture.paths.registeredProject;
  const digest = (relative: string) => Bun.SHA256.hash(fs.readFileSync(path.join(fixture!.paths.currentRoot, relative)), "hex");

  writeJson(path.join(fixture.paths.desktopRoot, "reviews", "registered-project.json"), {
    version: 1,
    source: "source-ralphy",
    project: "registered-project",
    reviews: [
      {
        id: "approved",
        source: "source-ralphy",
        sourcePath: `${projectPrefix}/render/master.v2.mp4`,
        state: "Approved",
        note: "Ready to publish",
        tags: ["final", "hero"],
        rating: 5,
        favorite: true,
      },
      {
        id: "shortlist",
        source: "source-ralphy",
        sourcePath: "missing/shortlist.mp4",
        sha256: digest(`${projectPrefix}/render/social.v3.mp4`),
        state: "Shortlist",
        tags: ["candidate"],
      },
      {
        id: "reject",
        source: "source-ralphy",
        sourcePath: `${projectPrefix}/composition/index.r3.html`,
        state: "Reject",
        note: "Wrong branch",
      },
      {
        id: "needs-work",
        source: "source-ralphy",
        sourcePath: `${projectPrefix}/render/final.mp4`,
        state: "Needs Work",
        note: "Tighten pacing",
        rating: 2,
      },
      {
        id: "collision",
        sourcePath: `${projectPrefix}/render/master.v2.mp4`,
        state: "Approved",
        note: "Collision must remain reviewable",
      },
      {
        id: "unmatched",
        source: "source-ralphy",
        sourcePath: "missing/unmatched.mp4",
        sha256: "a".repeat(64),
        state: "Needs Work",
        note: "Unmatched annotation",
      },
    ],
  });
  if (options.orphanReviews) {
    writeJson(path.join(fixture.paths.legacyRoot, "projects", "registered-project", "project.json"), {
      id: "registered-project",
    });
    writeJson(path.join(fixture.paths.desktopRoot, "reviews", "missing-project.json"), {
      version: 1,
      source: "source-ralphy",
      project: "missing-project",
      reviews: [{
        id: "missing-project-review",
        sourcePath: "missing/orphan.mp4",
        state: "Needs Work",
        note: "Missing Project note",
        tags: ["orphan"],
        rating: 2,
        favorite: true,
      }],
    });
    writeJson(path.join(fixture.paths.desktopRoot, "reviews", "ambiguous-project.json"), {
      version: 1,
      project: "registered-project",
      reviews: [{
        id: "ambiguous-project-review",
        sourcePath: "missing/ambiguous.mp4",
        state: "Shortlist",
        note: "Ambiguous Project note",
        tags: ["ambiguous"],
        rating: 4,
        favorite: false,
      }],
    });
  }
  writeJson(path.join(fixture.paths.desktopRoot, "state.json"), {
    version: 1,
    kind: "agent-session-preferences",
    workspace: "studio",
    preferences: { theme: "dark", density: "compact" },
  });
  writeJson(path.join(fixture.paths.desktopRoot, "chat.json"), {
    version: 1,
    kind: "agent-session-history",
    workspace: "studio",
    project: "registered-project",
    sessions: [{ agent: "codex", turns: [{ role: "user", text: "Keep the stronger hook" }] }],
  });
  if (options.invalidDesktopDocuments) {
    writeJson(path.join(fixture.paths.desktopRoot, "settings.json"), {
      version: 1,
      kind: "agent-session-preferences",
      workspace: "studio",
      preferences: { theme: "dark", density: "compact", label: "sk-opaque-secret-value" },
    });
    writeJson(path.join(fixture.paths.desktopRoot, "chats.json"), {
      version: 1,
      kind: "agent-session-history",
      workspace: "studio",
      project: "missing-project",
      sessions: [{ agent: "codex", turns: [{ role: "user", text: "Hello" }] }],
    });
    writeJson(path.join(fixture.paths.desktopRoot, "localStorage-export.json"), {
      version: 1,
      kind: "agent-session-history",
      workspace: "studio",
      project: "registered-project",
      sessions: [{ agent: "codex", turns: [{ role: "user", text: "data:text/plain,opaque" }] }],
    });
  }
  const unknown = path.join(fixture.paths.desktopRoot, "secrets", "unknown.bin");
  fs.mkdirSync(path.dirname(unknown), { recursive: true });
  fs.writeFileSync(unknown, "unknown-secret-must-not-be-read");
  fs.chmodSync(unknown, 0o000);
  fs.writeFileSync(path.join(fixture.paths.desktopRoot, "safeStorage", "cookies.bin"), Buffer.from([6, 7, 8]));

  const runId = "mig_00000000-0000-4000-8000-000000000006";
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
  importProductionAndDelivery(ctx);
  const collisionPath = `${projectPrefix}/render/master.v2.mp4`;
  const candidates = ctx.db.query<{ ref: string }, [string]>(
    `SELECT value AS ref FROM migration_entries, json_each(target_refs_json)
     WHERE source_path LIKE '%/render/%' AND value LIKE 'arev_%' AND source_path <> ?
     ORDER BY source_path LIMIT 1`,
  ).get(collisionPath);
  if (!candidates) throw new Error("Missing collision fixture Artifact revision");
  const now2 = Date.now();
  ctx.db.prepare(
    `INSERT INTO migration_sources
     (id, migration_run_id, source_kind, source_label, canonical_path_hash,
      source_device, source_inode, source_mode, inventory_digest, created_at)
     VALUES ('source-collision', ?, 'ralphy', 'source-collision', ?, '999', '999', 16877, ?, ?)`,
  ).run(ctx.runId, "b".repeat(64), "c".repeat(64), now2);
  ctx.db.prepare(
    `INSERT INTO migration_entries
     (id, migration_run_id, migration_source_id, source_path, source_locator_hash,
      entry_kind, source_kind, disposition, source_device, source_inode, source_mode,
      bytes, mtime_ms, sha256, target_refs_json, state, terminal_at, created_at, updated_at)
     VALUES (?, ?, 'source-collision', ?, ?, 'file', 'ralphy', 'domain', '999', '1000',
      33188, 1, ?, ?, ?, 'imported', ?, ?, ?)`,
  ).run(
    "mentry_00000000-0000-4000-8000-000000000099",
    ctx.runId,
    collisionPath,
    "d".repeat(64),
    now2,
    "e".repeat(64),
    JSON.stringify([candidates.ref]),
    now2,
    now2,
    now2,
  );
}

function workspace(slug: string): string {
  return ctx!.db.query<{ id: string }, [string]>("SELECT id FROM workspaces WHERE slug = ?").get(slug)!.id;
}

function ledger(sourcePath: string, sourceKind = "ralphy") {
  const row = ctx!.db.query<{
    id: string;
    disposition: string;
    state: string;
    refs: string;
  }, [string, string, string]>(
    `SELECT entry.id, entry.disposition, entry.state,
            COALESCE(entry.target_refs_json, '[]') AS refs
     FROM migration_entries entry JOIN migration_sources source
       ON source.id = entry.migration_source_id
     WHERE entry.migration_run_id = ? AND entry.source_path = ?
       AND source.source_kind = ?`,
  ).get(ctx!.runId, sourcePath, sourceKind);
  if (!row) throw new Error(`Missing ledger entry: ${sourceKind}:${sourcePath}`);
  return row;
}

function issueCount(code: string): number {
  return ctx!.db.query<{ count: number }, [string, string]>(
    `SELECT COUNT(*) AS count FROM migration_issues
     WHERE migration_run_id = ? AND code = ? AND resolved_at IS NULL`,
  ).get(ctx!.runId, code)?.count ?? 0;
}

function resolvedIssueCount(code: string): number {
  return ctx!.db.query<{ count: number }, [string, string]>(
    `SELECT COUNT(*) AS count FROM migration_issues
     WHERE migration_run_id = ? AND code = ? AND resolved_at IS NOT NULL`,
  ).get(ctx!.runId, code)?.count ?? 0;
}

function secretPlan(entryId: string): { kind: string; refs: string[] } {
  const detail = ctx!.db.query<{ detail: string }, [string, string]>(
    `SELECT issue.detail_json AS detail
     FROM migration_issues issue JOIN migration_entries entry
       ON entry.migration_run_id = issue.migration_run_id
      AND entry.source_locator_hash = json_extract(issue.detail_json, '$.sourceLocatorHash')
     WHERE issue.migration_run_id = ? AND entry.id = ?
       AND issue.code = 'MIGRATION_DESKTOP_SECRET_HANDOFF_PLANNED'`,
  ).get(ctx!.runId, entryId)?.detail;
  if (!detail) throw new Error("Missing Desktop secret handoff plan");
  const parsed = JSON.parse(detail) as { kind: string; refs: string[] };
  return { kind: parsed.kind, refs: parsed.refs };
}

function assertNoPlaintext(storeRoot: string, needles: string[]): void {
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const name of fs.readdirSync(directory)) {
      const entry = path.join(directory, name);
      const stat = fs.lstatSync(entry);
      if (stat.isDirectory()) walk(entry);
      else if (stat.isFile()) files.push(entry);
    }
  };
  walk(storeRoot);
  for (const file of files) {
    const bytes = fs.readFileSync(file);
    for (const needle of needles) expect(bytes.includes(Buffer.from(needle))).toBe(false);
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function bridgeContext() {
  return {
    consumerSessions: new Set<string>(),
    activitySubscriptions: new Map<string, { sequence: number; ready: boolean }>(),
    helloComplete: true,
    markHello() {},
    setAuthority() {},
  };
}
