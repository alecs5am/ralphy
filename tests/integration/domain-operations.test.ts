import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { addSlot, upsertEntry } from "../../cli/lib/calendar/store.js";
import { commitPlan, createCampaign } from "../../cli/lib/campaign/store.js";
import { saveConfig } from "../../cli/lib/config.js";
import {
  clearCommandContext,
  setCommandContext,
} from "../../cli/lib/context-state.js";
import {
  approveEntry,
  getEntry,
  rejectEntry,
  writeEntry,
} from "../../cli/lib/memory/store.js";
import { workspaceDir } from "../../cli/lib/paths.js";
import { addEntity } from "../../cli/lib/registry.js";
import {
  loadWorkspaceEvaluators,
  saveWorkspaceEvaluators,
} from "../../cli/lib/workspace-evaluators.js";
import { createDocument, reviseDocument } from "../../cli/lib/store/documents.js";
import { createEvaluation } from "../../cli/lib/store/evaluations.js";
import {
  closeDomainDb,
  openDomainDb,
  withImmediateTransaction,
} from "../../cli/lib/store/db.js";
import { recordRunResult, finishRun, startRun } from "../../cli/lib/store/runs.js";
import {
  createProject,
  createWorkspace,
  updateProjectStage,
} from "../../cli/lib/store/scopes.js";
import { startAgentSession } from "../../cli/lib/store/sessions.js";
import { SCHEMA_VERSION } from "../../cli/lib/store/schema.js";
import { evaluateContract } from "../../cli/lib/contract.js";
import {
  recordWorkspaceEvalResult,
  runWorkspaceEval,
} from "../../cli/lib/eval/workspace-evaluators.js";
import { recordResearchResult } from "../../cli/lib/research/orchestrator.js";
import { recordProfileScrapeResult } from "../../cli/lib/research/scrape-profile-orchestrator.js";
import {
  buildTemplateManifest,
  loadWorkspaceTemplate,
  saveWorkspaceTemplate,
} from "../../cli/lib/templater/extract.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const TASK_7_TABLES = [
  "settings",
  "brands",
  "personas",
  "workspace_templates",
  "memory_entries",
  "memory_revisions",
  "campaigns",
  "campaign_cells",
  "calendar_entries",
] as const;

let tmp: TmpRoot;
let workspace: ReturnType<typeof createWorkspace>;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-domain-operations");
  workspace = createWorkspace({ slug: "primary", name: "Primary" });
  setCommandContext({ kind: "scope", workspaceId: workspace.id });
});

afterEach(() => {
  clearCommandContext();
  closeDomainDb();
  tmp.cleanup();
});

describe("migration 3 structured domain schema", () => {
  test("installs the exact Task 7 tables", () => {
    const db = openDomainDb();
    const tables = new Set(
      db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type = 'table'",
        )
        .all()
        .map((row) => row.name),
    );

    expect(SCHEMA_VERSION).toBe(9);
    expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: SCHEMA_VERSION });
    expect([...TASK_7_TABLES].filter((table) => !tables.has(table))).toEqual([]);
  });
});

describe("structured feature round trips", () => {
  test("stores one row per existing feature without control files", async () => {
    await saveConfig({
      activeWorkspace: workspace.id,
      defaults: { template: "launch-short" },
    });
    const brand = await addEntity("brands", "acme", {
      name: "Acme",
      url: "https://example.test",
      colors: ["#112233"],
      font: "Inter",
    });
    const persona = await addEntity("personas", "maker", {
      name: "Maker",
      language: "en",
      archetype: "builder",
      tone: "direct",
      voice: { pace: "fast" },
    });
    expect(brand.id).toBe("acme");
    expect(String(brand.entityId)).toStartWith("brand_");
    expect(persona.id).toBe("maker");
    expect(String(persona.entityId)).toStartWith("persona_");

    const templateDocument = createDocument({
      workspaceId: workspace.id,
      kind: "custom",
      slug: "workspace-template-launch-short",
      title: "Launch Short",
    });
    const templateRevision = reviseDocument({
      documentId: templateDocument.id,
      expectedHeadId: null,
      format: "json",
      body: { version: 1, scenes: [{ id: "scene-01", role: "hook" }] },
    });
    await addEntity("templates", "launch-short", {
      name: "Launch Short",
      description: "A concise launch video",
      kind: "dir",
      format: "video",
      category: "product",
      documentRevisionId: templateRevision.id,
    });

    await writeEntry({
      ref: { tier: "workspace", ws: workspace.id },
      status: "active",
      slug: "keep-hooks-specific",
      type: "craft",
      text: "Keep hooks specific.\n\nWhy: generic hooks lose attention.",
    });
    await writeEntry({
      ref: { tier: "workspace", ws: workspace.id },
      status: "active",
      slug: "keep-hooks-specific",
      type: "craft",
      text: "Keep hooks specific to the audience.\n\nWhy: relevance earns attention.",
    });

    const workspacePath = workspaceDir(workspace.id);
    createCampaign(workspacePath, {
      id: "launch",
      title: "Launch",
      theses: [{ id: "proof", statement: "Specific demos build trust" }],
      keywords: { head: ["product demo"], longTail: [], questions: [] },
    });
    commitPlan(workspacePath, "launch", {
      keywords: { head: ["product demo"], longTail: [], questions: [] },
      inventory: [
        {
          id: "proof-short",
          thesisId: "proof",
          format: "video",
          angle: "Show the product",
          keyword: "product demo",
          channel: "youtube",
          priority: 1,
          status: "planned",
        },
      ],
    });
    addSlot(workspacePath, {
      id: "monday-nine",
      weekday: "mon",
      time: "09:00",
      timezone: "UTC",
      unitType: "short",
      targetPlatforms: ["youtube"],
    });
    upsertEntry(workspacePath, {
      id: "launch-monday",
      at: "2026-08-10T09:00:00.000Z",
      slotId: "monday-nine",
      unitType: "short",
      platforms: ["youtube"],
      status: "queued",
    });

    const session = startAgentSession({
      workspaceId: workspace.id,
      agent: "domain-operations-test",
    });
    saveWorkspaceEvaluators(workspace.id, {
      version: "1.0",
      criteria: [],
    }, {
      authoredBySessionId: session.id,
    });
    saveWorkspaceEvaluators(workspace.id, {
      version: "1.0",
      criteria: [{
        id: "specific-hook",
        label: "Specific hook",
        category: "message",
        check: "deterministic",
      }],
    }, {
      authoredBySessionId: session.id,
    });
    expect((await loadWorkspaceEvaluators(workspace.id))?.criteria[0]?.id).toBe(
      "specific-hook",
    );
    const evaluationRun = startRun({
      workspaceId: workspace.id,
      agentSessionId: session.id,
      kind: "workspace-evaluation",
    });
    createEvaluation({
      target: { type: "run", id: evaluationRun.id },
      authoredBySessionId: session.id,
      kind: "workspace",
      verdict: "pass",
      report: { score: 92 },
    });
    finishRun(evaluationRun.id, { state: "succeeded" });

    const researchRun = startRun({
      workspaceId: workspace.id,
      agentSessionId: session.id,
      kind: "research",
    });
    const researchDocument = createDocument({
      workspaceId: workspace.id,
      kind: "research",
      slug: "launch-research",
      title: "Launch research",
    });
    const researchRevision = reviseDocument({
      documentId: researchDocument.id,
      expectedHeadId: null,
      format: "markdown",
      body: "# Findings\n\nSpecific demos increase trust.",
      authoredBySessionId: session.id,
    });
    withImmediateTransaction((db) => {
      recordRunResult(db, {
        runId: researchRun.id,
        position: 0,
        entityType: "document_revision",
        entityId: researchRevision.id,
      });
    });
    finishRun(researchRun.id, { state: "succeeded" });

    const db = openDomainDb();
    for (const table of TASK_7_TABLES) {
      expect(
        db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`).get()
          ?.count ?? 0,
        table,
      ).toBeGreaterThan(0);
    }
    expect(
      db
        .query<{ count: number }, []>(
          "SELECT COUNT(*) AS count FROM memory_revisions",
        )
        .get()?.count,
    ).toBe(2);
    expect(
      db
        .query<{ count: number }, [string]>(
          "SELECT COUNT(*) AS count FROM evaluations WHERE run_id = ?",
        )
        .get(evaluationRun.id)?.count,
    ).toBe(1);
    expect(
      db
        .query<{ count: number }, [string]>(
          "SELECT COUNT(*) AS count FROM run_results WHERE run_id = ? AND entity_type = 'document_revision'",
        )
        .get(researchRun.id)?.count,
    ).toBe(1);
    expect(controlFiles(path.join(tmp.dir, ".ralphy"))).toEqual([]);
  });

  test("rejects secret-bearing workspace settings precisely", async () => {
    await expect(
      saveConfig({
        defaults: { template: "launch-short" },
        api_keys: { openrouter: "sk-test-secret" },
      }),
    ).rejects.toThrow(/secret|credential/i);

    await expect(
      saveConfig({ defaults: { keyboardShortcut: "ctrl+k" } }),
    ).resolves.toBeUndefined();
  });

  test("keeps proposals as immutable revisions of one stable Memory Entry", async () => {
    const ref = { tier: "workspace" as const, ws: workspace.id };
    const active = await writeEntry({
      ref,
      status: "active",
      slug: "specific-hooks",
      text: "Use specific hooks.",
    });
    const proposed = await writeEntry({
      ref,
      status: "proposed",
      slug: "specific-hooks",
      text: "Use audience-specific hooks.",
    });

    const db = openDomainDb();
    expect(
      db
        .query<{ count: number }, [string, string]>(
          "SELECT COUNT(*) AS count FROM memory_entries WHERE workspace_id = ? AND slug = ?",
        )
        .get(workspace.id, "specific-hooks")?.count,
    ).toBe(1);
    expect(
      db
        .query<{ status: string }, [string]>(
          "SELECT status FROM memory_revisions WHERE memory_entry_id = (SELECT id FROM memory_entries WHERE workspace_id = ? AND slug = 'specific-hooks') ORDER BY revision_no",
        )
        .all(workspace.id),
    ).toEqual([{ status: "active" }, { status: "proposed" }]);
    expect((await getEntry("specific-hooks", ref, "active"))?.body).toContain(
      "Use specific hooks.",
    );
    expect((await getEntry("specific-hooks", ref, "proposed"))?.body).toContain(
      "Use audience-specific hooks.",
    );

    const approved = await approveEntry("specific-hooks", ref);
    expect((await getEntry("specific-hooks", ref, "active"))?.body).toContain(
      "Use audience-specific hooks.",
    );
    expect(
      db
        .query<{ status: string }, [string]>(
          "SELECT status FROM memory_revisions WHERE memory_entry_id = (SELECT id FROM memory_entries WHERE workspace_id = ? AND slug = 'specific-hooks') ORDER BY revision_no",
        )
        .all(workspace.id),
    ).toEqual([{ status: "archived" }, { status: "active" }]);

    const rejected = await writeEntry({
      ref,
      status: "proposed",
      slug: "specific-hooks",
      text: "Use a generic hook.",
    });
    await rejectEntry("specific-hooks", ref);
    expect((await getEntry("specific-hooks", ref, "active"))?.body).toContain(
      "Use audience-specific hooks.",
    );
    expect((await getEntry("specific-hooks", ref, "rejected"))?.body).toContain(
      "Use a generic hook.",
    );

    await writeEntry({
      ref,
      status: "proposed",
      slug: "specific-hooks",
      text: "This proposal will become stale.",
    });
    const newerActive = await writeEntry({
      ref,
      status: "active",
      slug: "specific-hooks",
      text: "A newer explicit active edit.",
    });
    await expect(approveEntry("specific-hooks", ref)).rejects.toThrow(
      /stale|head|latest/i,
    );
    expect((await getEntry("specific-hooks", ref, "active"))?.body).toContain(
      "A newer explicit active edit.",
    );
    expect(active.entry).not.toHaveProperty("file");
    expect(active.entry).not.toHaveProperty("path");
    expect(active.entry.workspace).toBe("primary");
    expect(active.entry.id).toBe(proposed.entry.id);
    expect(active.entry.revisionId).not.toBe(proposed.entry.revisionId);
    expect(rejected.entry.id).toBe(newerActive.entry.id);
    expect(approved).toEqual({
      slug: "specific-hooks",
      entryId: active.entry.id,
      revisionId: proposed.entry.revisionId,
      versioned: false,
    });
    expect(controlFiles(path.join(tmp.dir, ".ralphy"))).toEqual([]);
  });

  test("derives lifecycle from optimistic Project Stage rows", () => {
    const project = createProject({
      workspaceId: workspace.id,
      slug: "stage-ledger",
      name: "Stage ledger",
      metadata: { kind: "video" },
    });
    const intakeDocument = createDocument({
      projectId: project.id,
      kind: "custom",
      slug: "contract-intake",
      title: "Contract intake",
    });
    const intakeRevision = reviseDocument({
      documentId: intakeDocument.id,
      expectedHeadId: null,
      format: "json",
      body: {},
    });
    const intake = updateProjectStage({
      projectId: project.id,
      stage: "intake",
      state: "complete",
      entityType: "document_revision",
      entityId: intakeRevision.id,
      expectedRowVersion: null,
    });
    expect(evaluateContract(project.id).phases.find((phase) => phase.id === "intake"))
      .toMatchObject({ present: true, satisfied: true });

    const active = updateProjectStage({
      projectId: project.id,
      stage: "intake",
      state: "active",
      entityType: "document_revision",
      entityId: intakeRevision.id,
      expectedRowVersion: intake.rowVersion,
    });
    expect(active.rowVersion).toBe(2);
    expect(evaluateContract(project.id).phases.find((phase) => phase.id === "intake"))
      .toMatchObject({ present: true, satisfied: false });
    expect(() => updateProjectStage({
      projectId: project.id,
      stage: "intake",
      state: "complete",
      entityType: "document_revision",
      entityId: intakeRevision.id,
      expectedRowVersion: intake.rowVersion,
    })).toThrow(/conflict/i);
  });

  test("records evaluator results as a Run and Evaluation without report files", () => {
    const project = createProject({
      workspaceId: workspace.id,
      slug: "evaluated",
      name: "Evaluated",
    });
    const recorded = recordWorkspaceEvalResult({
      schemaVersion: "1.0",
      workspace: workspace.id,
      projectId: project.id,
      evaluatedAt: "2026-08-04T00:00:00.000Z",
      video: "/private/tmp/control-path/final.mp4",
      criteria: [],
      overall: { verdict: "ship", score: 100, summary: "Ready." },
    });
    const db = openDomainDb();
    expect(recorded.runId).toStartWith("run_");
    expect(recorded.evaluationId).toStartWith("eval_");
    expect(
      db.query<{ state: string }, [string]>("SELECT state FROM runs WHERE id = ?")
        .get(recorded.runId)?.state,
    ).toBe("succeeded");
    const report = db
      .query<{ report: string }, [string]>(
        "SELECT report_json AS report FROM evaluations WHERE id = ?",
      )
      .get(recorded.evaluationId)?.report ?? "";
    expect(report).not.toContain("/private/tmp");
    expect(controlFiles(path.join(tmp.dir, ".ralphy"))).toEqual([]);
  });

  test("rejects cross-Project evaluation under an immutable Project scope", async () => {
    const first = createProject({ workspaceId: workspace.id, slug: "scope-first", name: "First" });
    const second = createProject({ workspaceId: workspace.id, slug: "scope-second", name: "Second" });
    setCommandContext({ kind: "scope", workspaceId: workspace.id, projectId: first.id });

    expect(() => evaluateContract(second.id)).toThrow();
    await expect(runWorkspaceEval(second.id, { noVision: true })).rejects.toThrow();
  });

  test("binds research Documents to a Run without job control files", () => {
    const project = createProject({
      workspaceId: workspace.id,
      slug: "researched",
      name: "Researched",
    });
    setCommandContext({
      kind: "scope",
      workspaceId: workspace.id,
      projectId: project.id,
    });
    const recorded = recordResearchResult({
      query: "specific demos",
      plan: { intent: "Find proof" },
      sources: [{ url: "https://example.test/proof", text: "Evidence" }],
      report: "# Findings\n\nSpecific demos build trust.",
      verify: { matched: ["https://example.test/proof"], unmatched: [] },
    });
    expect(recorded.runId).toStartWith("run_");
    expect(recorded.reportDocumentId).toStartWith("doc_");
    expect(
      openDomainDb()
        .query<{ count: number }, [string]>(
          "SELECT COUNT(*) AS count FROM run_results WHERE run_id = ? AND entity_type = 'document_revision'",
        )
        .get(recorded.runId)?.count,
    ).toBe(3);
    expect(controlFiles(path.join(tmp.dir, ".ralphy"))).toEqual([]);
  });

  test("records profile scrape output as stable Research identities", () => {
    const recorded = recordProfileScrapeResult({
      profileUrl: "https://example.test/@maker",
      creatorHandle: "@maker",
      videosListed: 0,
      videosPulled: 0,
      videoSummaries: [],
      sources: [],
      report: "# Creator style\n\nLead with proof.",
      verify: {
        rate: 0,
        matched: [],
        unmatched: [],
        byLevel: {
          exact: 0,
          truncation: 0,
          prefix: 0,
          "child-path": 0,
          "query-subset": 0,
        },
      },
    });
    expect(recorded.runId).toStartWith("run_");
    expect(recorded.reportRevisionId).toStartWith("drev_");
    const plan = openDomainDb()
      .query<{ body: string }, [string]>(
        `SELECT revision.body
         FROM run_results result
         JOIN document_revisions revision ON revision.id = result.entity_id
         WHERE result.run_id = ? AND result.position = 0`,
      )
      .get(recorded.runId);
    expect(JSON.parse(plan!.body).plan.kind).toBe("creator-profile");
    expect(controlFiles(path.join(tmp.dir, ".ralphy"))).toEqual([]);
  });

  test("stores a Workspace Template body as a typed JSON Document", async () => {
    setCommandContext({ kind: "scope", workspaceId: workspace.id });
    const manifest = buildTemplateManifest({
      slug: "proof-short",
      category: "b2b-saas",
      name: "Proof Short",
    });
    const saved = await saveWorkspaceTemplate({
      manifest,
      body: {
        templateMarkdown: "# Proof Short\n\nLead with evidence.",
        scenario: { scenes: [] },
      },
    });
    expect(saved.id).toStartWith("tmpl_");
    expect(saved.documentRevisionId).toStartWith("drev_");
    expect((await loadWorkspaceTemplate("proof-short"))?.body)
      .toMatchObject({ templateMarkdown: expect.stringContaining("Lead with evidence") });
    expect(controlFiles(path.join(tmp.dir, ".ralphy"))).toEqual([]);
  });
});

describe("bounded campaign and calendar operations", () => {
  test("publishes only the five Task 7 bridge sources", async () => {
    const operations = await import("../../cli/lib/store/operations.js");
    expect(Object.keys(operations).sort()).toEqual([
      "getCampaign",
      "listCalendarEntries",
      "listCampaigns",
      "updateCalendarEntry",
      "updateCampaign",
    ]);
  });

  test("pages exact Workspace campaigns and conflicts on a stale update", async () => {
    const workspacePath = workspaceDir(workspace.id);
    createCampaign(workspacePath, {
      id: "campaign-a",
      title: "Campaign A",
      theses: [{ id: "proof", statement: "Proof matters" }],
    });
    createCampaign(workspacePath, {
      id: "campaign-b",
      title: "Campaign B",
      theses: [{ id: "proof", statement: "Proof matters" }],
    });
    const foreign = createWorkspace({ slug: "foreign", name: "Foreign" });
    setCommandContext({ kind: "scope", workspaceId: foreign.id });
    createCampaign(workspaceDir(foreign.id), {
      id: "foreign-campaign",
      title: "Foreign Campaign",
      theses: [{ id: "proof", statement: "Proof matters" }],
    });
    setCommandContext({ kind: "scope", workspaceId: workspace.id });

    const operations = await import("../../cli/lib/store/operations.js");
    expect(() =>
      operations.listCampaigns({
        context: { workspaceId: workspace.id },
        limit: 0,
      }),
    ).toThrow(/limit/i);
    expect(() =>
      operations.listCampaigns({
        context: { workspaceId: workspace.id },
        limit: 101,
      }),
    ).toThrow(/limit/i);

    const first = operations.listCampaigns({
      context: { workspaceId: workspace.id },
      state: "draft",
      limit: 1,
    });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = operations.listCampaigns({
      context: { workspaceId: workspace.id },
      state: "draft",
      after: first.nextCursor,
      limit: 1,
    });
    expect(
      [...first.items, ...second.items].map((item) => item.slug).sort(),
    ).toEqual(["campaign-a", "campaign-b"]);
    expect(
      operations.listCampaigns({
        context: { workspaceId: foreign.id },
        limit: 10,
      }).items.map((item) => item.slug),
    ).toEqual(["foreign-campaign"]);
    expect(() =>
      operations.getCampaign({
        context: { workspaceId: foreign.id },
        id: first.items[0]!.id,
      }),
    ).toThrow(/not found/i);

    const updated = operations.updateCampaign({
      context: { workspaceId: workspace.id },
      id: first.items[0]!.id,
      patch: { title: "Campaign A revised", state: "active" },
      expectedRowVersion: first.items[0]!.rowVersion,
    });
    expect(updated).toMatchObject({
      id: first.items[0]!.id,
      title: "Campaign A revised",
      state: "active",
      rowVersion: first.items[0]!.rowVersion + 1,
    });
    expect(() =>
      operations.updateCampaign({
        context: { workspaceId: workspace.id },
        id: updated.id,
        patch: { title: "stale" },
        expectedRowVersion: first.items[0]!.rowVersion,
      }),
    ).toThrow(/conflict|stale|version/i);
    expectSafeDto(updated);
  });

  test("lists inclusive UTC dates and rejects a foreign Campaign reference", async () => {
    const workspacePath = workspaceDir(workspace.id);
    upsertEntry(workspacePath, {
      id: "at-start",
      at: "2026-08-10T09:00:00.000Z",
      unitType: "short",
      status: "queued",
    });
    upsertEntry(workspacePath, {
      id: "at-end",
      at: "2026-08-10T10:00:00.000Z",
      unitType: "short",
      status: "queued",
    });
    const foreign = createWorkspace({ slug: "calendar-foreign", name: "Calendar Foreign" });
    setCommandContext({ kind: "scope", workspaceId: foreign.id });
    createCampaign(workspaceDir(foreign.id), {
      id: "foreign-calendar-campaign",
      title: "Foreign Calendar Campaign",
      theses: [{ id: "proof", statement: "Proof matters" }],
    });
    const foreignCampaignId = openDomainDb()
      .query<{ id: string }, [string]>(
        "SELECT id FROM campaigns WHERE workspace_id = ?",
      )
      .get(foreign.id)!.id;
    setCommandContext({ kind: "scope", workspaceId: workspace.id });

    const operations = await import("../../cli/lib/store/operations.js");
    const page = operations.listCalendarEntries({
      context: { workspaceId: workspace.id },
      from: "2026-08-10T09:00:00.000Z",
      to: "2026-08-10T10:00:00.000Z",
      limit: 10,
    });
    expect(page.items.map((item) => item.scheduledAt).sort()).toEqual([
      "2026-08-10T09:00:00.000Z",
      "2026-08-10T10:00:00.000Z",
    ]);
    expect(page.items.every((item) => item.workspaceId === workspace.id)).toBe(true);
    expectSafeDto(page);

    const entry = page.items[0]!;
    expect(() =>
      operations.updateCalendarEntry({
        context: { workspaceId: workspace.id },
        id: entry.id,
        patch: { campaignId: foreignCampaignId },
        expectedRowVersion: entry.rowVersion,
      }),
    ).toThrow(/workspace|campaign/i);
    const updated = operations.updateCalendarEntry({
      context: { workspaceId: workspace.id },
      id: entry.id,
      patch: { state: "scheduled" },
      expectedRowVersion: entry.rowVersion,
    });
    expect(updated).toMatchObject({
      id: entry.id,
      state: "scheduled",
      rowVersion: entry.rowVersion + 1,
    });
    expect(() =>
      operations.updateCalendarEntry({
        context: { workspaceId: workspace.id },
        id: entry.id,
        patch: { state: "published" },
        expectedRowVersion: entry.rowVersion,
      }),
    ).toThrow(/conflict|stale|version/i);
  });
});

function controlFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const found: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (/\.(?:json|jsonl|md)$/u.test(entry.name)) {
        found.push(path.relative(root, absolute).split(path.sep).join("/"));
      }
    }
  };
  visit(root);
  return found.sort();
}

function expectSafeDto(value: unknown): void {
  const forbidden = new Set([
    "metadata",
    "metadatajson",
    "path",
    "filepath",
    "providerpayload",
    "error",
    "credential",
    "secret",
  ]);
  const visit = (item: unknown): void => {
    if (item === null || typeof item !== "object") return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    for (const [key, nested] of Object.entries(item)) {
      expect(forbidden.has(key.toLowerCase().replace(/[^a-z0-9]/gu, ""))).toBe(false);
      visit(nested);
    }
  };
  visit(value);
}
