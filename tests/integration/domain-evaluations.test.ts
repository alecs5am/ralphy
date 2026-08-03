import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  addArtifactRevision,
  createArtifact,
} from "../../cli/lib/store/artifacts.js";
import {
  createComposition,
  reviseComposition,
} from "../../cli/lib/store/compositions.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import {
  createEvaluation,
  getEvaluation,
  listEvaluations,
} from "../../cli/lib/store/evaluations.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import { startRun } from "../../cli/lib/store/runs.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import {
  endAgentSession,
  startAgentSession,
} from "../../cli/lib/store/sessions.js";
import { verifyDomainStore } from "../../cli/lib/store/verify.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let roots: TmpRoot[] = [];

function makeRoot(): TmpRoot {
  const root = makeTmpRoot("ralphy-domain-evaluations");
  roots.push(root);
  return root;
}

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

async function fixture(root: TmpRoot, slug: string) {
  const workspace = createWorkspace({ slug, name: slug });
  const project = createProject({
    workspaceId: workspace.id,
    slug,
    name: slug,
  });
  const filePath = path.join(root.dir, `${slug}.png`);
  fs.writeFileSync(filePath, slug);
  const object = await ingestObject({
    scope: { workspaceId: workspace.id, projectId: project.id },
    sourcePath: filePath,
    originalName: "image.png",
    mime: "image/png",
    storageClass: "durable",
  });
  const artifact = createArtifact({
    projectId: project.id,
    slug: "art",
    kind: "image",
  });
  const revision = addArtifactRevision({
    artifactId: artifact.id,
    objectId: object.id,
    state: "approved",
  });
  const session = startAgentSession({
    workspaceId: workspace.id,
    projectId: project.id,
    agent: "reviewer",
  });
  return { workspace, project, object, artifact, revision, session };
}

describe("domain Evaluations", () => {
  test("derives scope from the target and returns only the safe projection", async () => {
    const root = makeRoot();
    const { workspace, project, revision, session } = await fixture(root, "derive");
    const evaluation = createEvaluation({
      target: { type: "artifact_revision", id: revision.id },
      authoredBySessionId: session.id,
      kind: "review",
      verdict: "approved",
      favorite: true,
      rating: 4,
      tags: ["hook", "pacing"],
      note: "Strong opener.",
      report: { detail: "internal only", provider: "secret-provider" },
    });
    expect(Object.keys(evaluation).sort()).toEqual([
      "authoredBySessionId",
      "createdAt",
      "favorite",
      "id",
      "kind",
      "note",
      "projectId",
      "rating",
      "tags",
      "target",
      "verdict",
      "workspaceId",
    ]);
    expect(evaluation).toMatchObject({
      workspaceId: workspace.id,
      projectId: project.id,
      target: { type: "artifact_revision", id: revision.id },
      kind: "review",
      verdict: "approved",
      favorite: true,
      rating: 4,
      tags: ["hook", "pacing"],
      authoredBySessionId: session.id,
    });
    expect(JSON.stringify(evaluation)).not.toContain("secret-provider");
    expect(
      getEvaluation({ workspaceId: workspace.id, projectId: project.id }, evaluation.id),
    ).toEqual(evaluation);
    expect(verifyDomainStore().integrity).toBe("ok");
  });

  test("accepts a Workspace Evaluation with a null Project", async () => {
    const root = makeRoot();
    const workspace = createWorkspace({ slug: "ws-eval", name: "WS" });
    const filePath = path.join(root.dir, "ws.png");
    fs.writeFileSync(filePath, "ws");
    const object = await ingestObject({
      scope: { workspaceId: workspace.id },
      sourcePath: filePath,
      originalName: "image.png",
      mime: "image/png",
      storageClass: "durable",
    });
    const artifact = createArtifact({
      workspaceId: workspace.id,
      slug: "shared",
      kind: "image",
    });
    const revision = addArtifactRevision({
      artifactId: artifact.id,
      objectId: object.id,
      state: "approved",
    });
    const session = startAgentSession({
      workspaceId: workspace.id,
      agent: "reviewer",
    });
    const evaluation = createEvaluation({
      target: { type: "artifact_revision", id: revision.id },
      authoredBySessionId: session.id,
      kind: "review",
    });
    expect(evaluation.workspaceId).toBe(workspace.id);
    expect(evaluation.projectId).toBeNull();
    expect(verifyDomainStore().integrity).toBe("ok");
  });

  test("supports every target family", async () => {
    const root = makeRoot();
    const { project, revision, session } = await fixture(root, "targets");
    const composition = createComposition({
      projectId: project.id,
      slug: "cut",
      kind: "video",
    });
    const compositionRevision = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "remotion",
    });
    const run = startRun({ projectId: project.id, kind: "evaluation" });
    const targets = [
      { type: "artifact_revision", id: revision.id },
      { type: "composition_revision", id: compositionRevision.id },
      { type: "run", id: run.id },
    ] as const;
    for (const target of targets) {
      const evaluation = createEvaluation({
        target,
        authoredBySessionId: session.id,
        kind: "review",
      });
      expect(evaluation.target).toEqual(target);
    }
    expect(verifyDomainStore().integrity).toBe("ok");
  });

  test("rejects an inactive, missing, or cross-scope author Session", async () => {
    const root = makeRoot();
    const { revision, session } = await fixture(root, "author");
    const other = await fixture(root, "author-other");
    expect(() =>
      createEvaluation({
        target: { type: "artifact_revision", id: revision.id },
        authoredBySessionId: other.session.id,
        kind: "review",
      }),
    ).toThrow(/scope/i);
    expect(() =>
      createEvaluation({
        target: { type: "artifact_revision", id: revision.id },
        authoredBySessionId: "session-missing",
        kind: "review",
      }),
    ).toThrow(/not found/i);
    endAgentSession(session.id);
    expect(() =>
      createEvaluation({
        target: { type: "artifact_revision", id: revision.id },
        authoredBySessionId: session.id,
        kind: "review",
      }),
    ).toThrow(/ended/i);
    expect(verifyDomainStore().integrity).toBe("ok");
  });

  test("rejects invalid ratings, tags, notes, kinds, and targets", async () => {
    const root = makeRoot();
    const { revision, session } = await fixture(root, "validate");
    const base = {
      target: { type: "artifact_revision" as const, id: revision.id },
      authoredBySessionId: session.id,
      kind: "review",
    };
    expect(() => createEvaluation({ ...base, rating: 0 })).toThrow(/rating/i);
    expect(() => createEvaluation({ ...base, rating: 6 })).toThrow(/rating/i);
    expect(() => createEvaluation({ ...base, rating: 2.5 })).toThrow(/rating/i);
    expect(() => createEvaluation({ ...base, tags: ["Bad Tag"] })).toThrow(/tag/i);
    expect(() => createEvaluation({ ...base, tags: ["dup", "dup"] })).toThrow(/unique/i);
    expect(() =>
      createEvaluation({ ...base, tags: Array.from({ length: 17 }, (_, i) => `t${i}`) }),
    ).toThrow(/tags/i);
    expect(() => createEvaluation({ ...base, note: "x".repeat(2_049) })).toThrow(/note/i);
    expect(() => createEvaluation({ ...base, kind: "  " })).toThrow(/kind/i);
    expect(() =>
      createEvaluation({
        ...base,
        target: { type: "artifact_revision", id: "arev_missing" },
      }),
    ).toThrow(/not found/i);
  });

  test("is append-only and rejects target XOR breaks in raw SQL", async () => {
    const root = makeRoot();
    const { project, revision, session } = await fixture(root, "raw");
    const run = startRun({ projectId: project.id, kind: "evaluation" });
    const workspaceSession = startAgentSession({
      workspaceId: project.workspaceId,
      agent: "reviewer",
    });
    const evaluation = createEvaluation({
      target: { type: "artifact_revision", id: revision.id },
      authoredBySessionId: session.id,
      kind: "review",
    });
    const db = openDomainDb();
    db.exec("PRAGMA recursive_triggers = OFF");
    expect(() =>
      db.prepare("UPDATE evaluations SET verdict = 'changed' WHERE id = ?").run(
        evaluation.id,
      ),
    ).toThrow(/immutable/i);
    expect(() =>
      db.prepare("DELETE FROM evaluations WHERE id = ?").run(evaluation.id),
    ).toThrow(/immutable/i);
    expect(() =>
      db
        .prepare(
          `INSERT OR REPLACE INTO evaluations
           (id, workspace_id, project_id, artifact_revision_id, authored_by_session_id,
            kind, report_json, created_at)
           VALUES (?, ?, ?, ?, ?, 'review', '{}', 1)`,
        )
        .run(evaluation.id, project.workspaceId, project.id, revision.id, session.id),
    ).toThrow(/immutable/i);
    expect(() =>
      db
        .prepare(
          `INSERT INTO evaluations
           (id, workspace_id, project_id, artifact_revision_id, run_id,
            authored_by_session_id, kind, report_json, created_at)
           VALUES ('eval_xor', ?, ?, ?, ?, ?, 'review', '{}', 1)`,
        )
        .run(project.workspaceId, project.id, revision.id, run.id, session.id),
    ).toThrow(/constraint/i);
    expect(() =>
      db
        .prepare(
          `INSERT INTO evaluations
           (id, workspace_id, project_id, artifact_revision_id,
            authored_by_session_id, kind, report_json, created_at)
           VALUES ('eval_none', ?, ?, NULL, ?, 'review', '{}', 1)`,
        )
        .run(project.workspaceId, project.id, session.id),
      // No target matches any derived-scope branch, so the scope trigger fires
      // before SQLite reaches the XOR CHECK; both reject the same row.
    ).toThrow(/derived target scope/i);
    expect(
      db
        .query<{ sql: string }, []>(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'evaluations'",
        )
        .get()!.sql.replace(/\s+/g, " "),
    ).toContain(
      "CHECK ( (artifact_revision_id IS NOT NULL) + (composition_revision_id IS NOT NULL)" +
        " + (build_id IS NOT NULL) + (run_id IS NOT NULL) = 1 )",
    );
    expect(() =>
      db
        .prepare(
          `INSERT INTO evaluations
           (id, workspace_id, project_id, artifact_revision_id,
            authored_by_session_id, kind, report_json, created_at)
           VALUES ('eval_scope', ?, NULL, ?, ?, 'review', '{}', 1)`,
        )
        // A Workspace-scoped Session satisfies the authorship trigger, so only
        // the derived-scope trigger can reject this Project-owned target.
        .run(project.workspaceId, revision.id, workspaceSession.id),
    ).toThrow(/derived target scope/i);
    expect(verifyDomainStore().integrity).toBe("ok");
  });

  test("routes a corrupted Evaluation to ownership and provenance separately", async () => {
    const root = makeRoot();
    const { project, revision, session } = await fixture(root, "corrupt");
    const other = await fixture(root, "corrupt-other");
    const db = openDomainDb();
    for (const { name } of db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'evaluations'",
      )
      .all()) {
      db.exec(`DROP TRIGGER "${name}"`);
    }
    db.exec("PRAGMA ignore_check_constraints = ON");
    db.prepare(
      `INSERT INTO evaluations
       (id, workspace_id, project_id, artifact_revision_id, authored_by_session_id,
        kind, report_json, created_at)
       VALUES ('eval_cross_scope', ?, ?, ?, ?, 'review', '{}', 1)`,
    ).run(other.project.workspaceId, other.project.id, revision.id, other.session.id);
    db.prepare(
      `INSERT INTO evaluations
       (id, workspace_id, project_id, artifact_revision_id, authored_by_session_id,
        kind, report_json, created_at)
       VALUES ('eval_bad_author', ?, ?, ?, ?, 'review', '{}', 1)`,
    ).run(project.workspaceId, project.id, revision.id, other.session.id);
    db.exec("PRAGMA ignore_check_constraints = OFF");

    const report = verifyDomainStore();
    expect(report.brokenRevisionChains).toContainEqual({
      entityType: "evaluation",
      entityId: "eval_cross_scope",
      reason: "scope-mismatch",
      relatedId: revision.id,
    });
    expect(report.sessionProvenanceIssues).toContainEqual({
      entityType: "evaluation",
      entityId: "eval_bad_author",
      reason: "project-mismatch",
      relatedId: other.session.id,
    });
    expect(
      report.sessionProvenanceIssues.filter(
        (issue) => issue.entityId === "eval_cross_scope",
      ),
    ).toEqual([]);
    expect(session.id).toBeDefined();
  });

  test("pages by the creation cursor within the visible scope only", async () => {
    const root = makeRoot();
    const { workspace, project, revision, session } = await fixture(root, "page");
    const sibling = await fixture(root, "page-sibling");
    const created = [];
    for (let index = 0; index < 5; index += 1) {
      created.push(
        createEvaluation({
          target: { type: "artifact_revision", id: revision.id },
          authoredBySessionId: session.id,
          kind: "review",
          createdAt: 1_000 + index,
        }),
      );
    }
    createEvaluation({
      target: { type: "artifact_revision", id: sibling.revision.id },
      authoredBySessionId: sibling.session.id,
      kind: "review",
    });

    const seen: string[] = [];
    let after: string | null = null;
    for (;;) {
      const page: { items: { id: string }[]; nextCursor: string | null } =
        listEvaluations({
          context: { workspaceId: workspace.id, projectId: project.id },
          after,
          limit: 2,
        });
      seen.push(...page.items.map((item) => item.id));
      if (page.nextCursor === null) break;
      after = page.nextCursor;
    }
    expect(seen).toEqual(created.map((item) => item.id));

    const workspaceOnly = listEvaluations({
      context: { workspaceId: workspace.id },
      limit: 100,
    });
    expect(workspaceOnly.items).toEqual([]);
    expect(() =>
      listEvaluations({
        context: { workspaceId: workspace.id, projectId: sibling.project.id },
        limit: 10,
      }),
    ).toThrow(/does not belong/i);
    expect(() =>
      listEvaluations({
        context: { workspaceId: workspace.id, projectId: project.id },
        after: "v1.AAAA",
        limit: 10,
      }),
    ).toThrow(/cursor/i);
    expect(() =>
      listEvaluations({
        context: { workspaceId: workspace.id, projectId: project.id },
        limit: 101,
      }),
    ).toThrow(/limit/i);
  });

  test("resolves a Session context to the same visibility", async () => {
    const root = makeRoot();
    const { revision, session } = await fixture(root, "session-context");
    const evaluation = createEvaluation({
      target: { type: "artifact_revision", id: revision.id },
      authoredBySessionId: session.id,
      kind: "review",
    });
    expect(
      listEvaluations({ context: { sessionId: session.id }, limit: 10 }).items,
    ).toEqual([evaluation]);
    endAgentSession(session.id);
    expect(() =>
      listEvaluations({ context: { sessionId: session.id }, limit: 10 }),
    ).toThrow(/ended/i);
  });
});
