import type { Database } from "bun:sqlite";
import { latestActivitySequence, listActivity } from "./activity.js";
import { openDomainDb } from "./db.js";
import { assertLimit, buildPage, decodeCursor } from "./pagination.js";
import { resolveQueryContext } from "./scope-context.js";
import type {
  ActivityDto,
  DocumentBindingDto,
  OverviewAccountDto,
  OverviewBuildDto,
  OverviewCompositionDto,
  OverviewDocumentDto,
  OverviewFeedbackDto,
  OverviewIterationDto,
  OverviewMediaCounts,
  OverviewRunDto,
  OverviewStageDto,
  OverviewUnitDto,
  Page,
  ProjectOverview,
  ProjectOverviewRequest,
  ProjectSummaryDto,
  WorkspaceOverview,
  WorkspaceOverviewRequest,
  WorkspaceSummaryDto,
} from "./types.js";

const MAX_SECTION_LIMIT = 50;

/**
 * Overviews have no implicit sections: the response always carries exactly one
 * root summary and only the sections the caller asked for. Each section is one
 * independent bounded page with its own cursor, and every projection is an
 * explicit column list rather than a row spread.
 */
export function getWorkspaceOverview(
  request: WorkspaceOverviewRequest,
): WorkspaceOverview {
  if (!request.sections) {
    throw new Error("Workspace overview sections are required");
  }
  const db = openDomainDb();
  return db.transaction(() => {
    const scope = resolveQueryContext(db, request.context);
    if (scope.workspaceId !== request.workspaceId) {
      throw new Error(`Workspace not found: ${request.workspaceId}`);
    }
    const workspace = db
      .query<WorkspaceSummaryDto, [string]>(
        `SELECT id, slug, name, row_version AS rowVersion,
                created_at AS createdAt, updated_at AS updatedAt
         FROM workspaces WHERE id = ?`,
      )
      .get(request.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${request.workspaceId}`);

    const sections = request.sections;
    const overview: WorkspaceOverview = { workspace };
    if (sections.documents) {
      overview.documents = pageDocuments(db, sections.documents, {
        sql: "workspace_id = ? AND project_id IS NULL",
        values: [request.workspaceId],
      });
    }
    if (sections.units) {
      overview.units = pageUnits(db, sections.units, {
        sql: "workspace_id = ? AND project_id IS NULL",
        values: [request.workspaceId],
      });
    }
    if (sections.accounts) {
      overview.accounts = pageAccounts(db, sections.accounts, request.workspaceId);
    }
    if (sections.projects) {
      overview.projects = pageProjects(db, sections.projects, request.workspaceId);
    }
    if (sections.activity) {
      overview.activity = pageActivity(sections.activity, (event) =>
        event.workspaceId === request.workspaceId,
      );
    }
    return overview;
  })();
}

export function getProjectOverview(
  request: ProjectOverviewRequest,
): ProjectOverview {
  if (!request.sections) {
    throw new Error("Project overview sections are required");
  }
  const db = openDomainDb();
  return db.transaction(() => {
    const scope = resolveQueryContext(db, request.context);
    const project = db
      .query<ProjectSummaryDto, [string]>(
        `SELECT id, workspace_id AS workspaceId, slug, name, state,
                row_version AS rowVersion, created_at AS createdAt,
                updated_at AS updatedAt
         FROM projects WHERE id = ?`,
      )
      .get(request.projectId);
    if (!project || project.workspaceId !== scope.workspaceId) {
      throw new Error(`Project not found: ${request.projectId}`);
    }
    if (scope.projectId !== null && scope.projectId !== request.projectId) {
      throw new Error(`Project not found: ${request.projectId}`);
    }

    const sections = request.sections;
    const overview: ProjectOverview = { project };
    if (sections.documents) {
      const page = pageDocuments(db, sections.documents, {
        sql: `(project_id = ? OR (
          project_id IS NULL AND workspace_id = ?
          AND NOT EXISTS (
            SELECT 1 FROM documents project_document
            WHERE project_document.project_id = ?
              AND project_document.slug = documents.slug
          )
        ))`,
        values: [request.projectId, project.workspaceId, request.projectId],
      });
      overview.documents = {
        items: page.items.map((document) => ({
          ...document,
          binding: readProjectBinding(db, request.projectId, document.id),
        })),
        nextCursor: page.nextCursor,
      };
    }
    if (sections.iterations) {
      overview.iterations = pageIterations(db, sections.iterations, request.projectId);
    }
    if (sections.feedback) {
      overview.feedback = pageFeedback(db, sections.feedback, request.projectId);
    }
    if (sections.stages) {
      overview.stages = pageStages(db, sections.stages, request.projectId);
    }
    if (sections.compositions) {
      overview.compositions = pageCompositions(
        db,
        sections.compositions,
        request.projectId,
      );
    }
    if (sections.builds) {
      overview.builds = pageBuilds(db, sections.builds, request.projectId);
    }
    if (sections.units) {
      overview.units = pageUnits(db, sections.units, {
        sql: "project_id = ?",
        values: [request.projectId],
      });
    }
    if (sections.runs) {
      overview.runs = pageRuns(db, sections.runs, request.projectId);
    }
    if (sections.activity) {
      overview.activity = pageActivity(sections.activity, (event) =>
        event.projectId === request.projectId,
      );
    }
    if (sections.mediaCounts) {
      overview.mediaCounts = readMediaCounts(db, project);
    }
    return overview;
  })();
}

type SectionRequest = { after?: string | null; limit: number };
type Filter = { sql: string; values: (string | number)[] };

function creationPage<T extends { id: string; createdAt: number }>(
  db: Database,
  request: SectionRequest,
  columns: string,
  table: string,
  filter: Filter,
): Page<T> {
  assertLimit(request.limit, MAX_SECTION_LIMIT);
  const clauses = [filter.sql];
  const values: (string | number)[] = [...filter.values];
  if (request.after != null) {
    const cursor = decodeCursor("c1", request.after);
    clauses.push("(created_at > ? OR (created_at = ? AND id > ?))");
    values.push(cursor.ordinal, cursor.ordinal, cursor.id);
  }
  values.push(request.limit + 1);
  const rows = db
    .query<T, (string | number)[]>(
      `SELECT ${columns} FROM ${table} WHERE ${clauses.join(" AND ")}
       ORDER BY created_at ASC, id ASC LIMIT ?`,
    )
    .all(...values);
  return buildPage(rows, request.limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

function pageDocuments(
  db: Database,
  request: SectionRequest,
  filter: Filter,
): Page<OverviewDocumentDto> {
  return creationPage<OverviewDocumentDto>(
    db,
    request,
    `id, workspace_id AS workspaceId, project_id AS projectId, slug, title, kind,
     current_revision_id AS currentRevisionId, row_version AS rowVersion,
     created_at AS createdAt, updated_at AS updatedAt`,
    "documents",
    filter,
  );
}

function pageUnits(
  db: Database,
  request: SectionRequest,
  filter: Filter,
): Page<OverviewUnitDto> {
  return creationPage<OverviewUnitDto>(
    db,
    request,
    `id, workspace_id AS workspaceId, project_id AS projectId, slug, format,
     latest_revision_id AS latestRevisionId,
     selected_revision_id AS selectedRevisionId,
     created_at AS createdAt, updated_at AS updatedAt`,
    "units",
    filter,
  );
}

function pageAccounts(
  db: Database,
  request: SectionRequest,
  workspaceId: string,
): Page<OverviewAccountDto> {
  // Credential status is deliberately absent: the entity/credential task adds
  // it from real columns rather than guessing it here.
  return creationPage<OverviewAccountDto>(
    db,
    request,
    `id, workspace_id AS workspaceId, platform, external_id AS externalId,
     display_name AS displayName, username,
     created_at AS createdAt, updated_at AS updatedAt`,
    "social_accounts",
    { sql: "workspace_id = ?", values: [workspaceId] },
  );
}

function pageProjects(
  db: Database,
  request: SectionRequest,
  workspaceId: string,
): Page<ProjectSummaryDto> {
  return creationPage<ProjectSummaryDto>(
    db,
    request,
    `id, workspace_id AS workspaceId, slug, name, state,
     row_version AS rowVersion, created_at AS createdAt, updated_at AS updatedAt`,
    "projects",
    { sql: "workspace_id = ?", values: [workspaceId] },
  );
}

function pageIterations(
  db: Database,
  request: SectionRequest,
  projectId: string,
): Page<OverviewIterationDto> {
  return creationPage<OverviewIterationDto>(
    db,
    request,
    `id, project_id AS projectId, number, title, state,
     created_at AS createdAt, closed_at AS closedAt`,
    "project_iterations",
    { sql: "project_id = ?", values: [projectId] },
  );
}

function pageFeedback(
  db: Database,
  request: SectionRequest,
  projectId: string,
): Page<OverviewFeedbackDto> {
  assertLimit(request.limit, MAX_SECTION_LIMIT);
  const clauses = ["iteration.project_id = ?"];
  const values: (string | number)[] = [projectId];
  if (request.after != null) {
    const cursor = decodeCursor("c1", request.after);
    clauses.push(
      "(feedback.created_at > ? OR (feedback.created_at = ? AND feedback.id > ?))",
    );
    values.push(cursor.ordinal, cursor.ordinal, cursor.id);
  }
  values.push(request.limit + 1);
  const rows = db
    .query<OverviewFeedbackDto, (string | number)[]>(
      `SELECT feedback.id AS id, iteration.project_id AS projectId,
              feedback.iteration_id AS iterationId, feedback.status AS status,
              feedback.target_type AS targetType, feedback.target_id AS targetId,
              feedback.created_at AS createdAt, feedback.resolved_at AS resolvedAt
       FROM feedback_items feedback
       JOIN project_iterations iteration ON iteration.id = feedback.iteration_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY feedback.created_at ASC, feedback.id ASC LIMIT ?`,
    )
    .all(...values);
  return buildPage(rows, request.limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

/**
 * `project_stages` has no creation time, so this section pages by last update.
 * It is a current-state snapshot of a small bounded per-project set, not the
 * stable-set traversal a creation cursor promises.
 */
function pageStages(
  db: Database,
  request: SectionRequest,
  projectId: string,
): Page<OverviewStageDto> {
  assertLimit(request.limit, MAX_SECTION_LIMIT);
  const clauses = ["project_id = ?"];
  const values: (string | number)[] = [projectId];
  if (request.after != null) {
    const cursor = decodeCursor("c1", request.after);
    clauses.push("(updated_at > ? OR (updated_at = ? AND id > ?))");
    values.push(cursor.ordinal, cursor.ordinal, cursor.id);
  }
  values.push(request.limit + 1);
  const rows = db
    .query<OverviewStageDto, (string | number)[]>(
      `SELECT id, project_id AS projectId, stage, state,
              entity_type AS entityType, entity_id AS entityId,
              row_version AS rowVersion, updated_at AS updatedAt
       FROM project_stages WHERE ${clauses.join(" AND ")}
       ORDER BY updated_at ASC, id ASC LIMIT ?`,
    )
    .all(...values);
  return buildPage(rows, request.limit, "c1", (row) => ({
    ordinal: row.updatedAt,
    id: row.id,
  }));
}

/** Compositions store only a selected revision, so latest is derived. */
function pageCompositions(
  db: Database,
  request: SectionRequest,
  projectId: string,
): Page<OverviewCompositionDto> {
  assertLimit(request.limit, MAX_SECTION_LIMIT);
  const clauses = ["composition.project_id = ?"];
  const values: (string | number)[] = [projectId];
  if (request.after != null) {
    const cursor = decodeCursor("c1", request.after);
    clauses.push(
      "(composition.created_at > ? OR (composition.created_at = ? AND composition.id > ?))",
    );
    values.push(cursor.ordinal, cursor.ordinal, cursor.id);
  }
  values.push(request.limit + 1);
  const rows = db
    .query<OverviewCompositionDto, (string | number)[]>(
      `SELECT composition.id AS id, composition.project_id AS projectId,
              composition.slug AS slug, composition.kind AS kind,
              (SELECT revision.id FROM composition_revisions revision
               WHERE revision.composition_id = composition.id
               ORDER BY revision.revision_no DESC, revision.id DESC
               LIMIT 1) AS latestRevisionId,
              composition.selected_revision_id AS selectedRevisionId,
              composition.created_at AS createdAt,
              composition.updated_at AS updatedAt
       FROM compositions composition WHERE ${clauses.join(" AND ")}
       ORDER BY composition.created_at ASC, composition.id ASC LIMIT ?`,
    )
    .all(...values);
  return buildPage(rows, request.limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

function pageBuilds(
  db: Database,
  request: SectionRequest,
  projectId: string,
): Page<OverviewBuildDto> {
  assertLimit(request.limit, MAX_SECTION_LIMIT);
  const clauses = ["composition.project_id = ?"];
  const values: (string | number)[] = [projectId];
  if (request.after != null) {
    const cursor = decodeCursor("c1", request.after);
    clauses.push(
      "(build.created_at > ? OR (build.created_at = ? AND build.id > ?))",
    );
    values.push(cursor.ordinal, cursor.ordinal, cursor.id);
  }
  values.push(request.limit + 1);
  const rows = db
    .query<OverviewBuildDto, (string | number)[]>(
      `SELECT build.id AS id,
              build.composition_revision_id AS compositionRevisionId,
              build.run_id AS runId, build.state AS state,
              build.created_at AS createdAt, build.ended_at AS finishedAt
       FROM builds build
       JOIN composition_revisions revision
         ON revision.id = build.composition_revision_id
       JOIN compositions composition ON composition.id = revision.composition_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY build.created_at ASC, build.id ASC LIMIT ?`,
    )
    .all(...values);
  return buildPage(rows, request.limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

function pageRuns(
  db: Database,
  request: SectionRequest,
  projectId: string,
): Page<OverviewRunDto> {
  return creationPage<OverviewRunDto>(
    db,
    request,
    `id, workspace_id AS workspaceId, project_id AS projectId, kind, label, state,
     created_at AS createdAt, started_at AS startedAt, ended_at AS endedAt`,
    "runs",
    { sql: "project_id = ?", values: [projectId] },
  );
}

function pageActivity(
  request: { afterSequence: number; limit: number },
  visible: (event: ActivityDto) => boolean,
): Page<ActivityDto, number> {
  if (!Number.isSafeInteger(request.afterSequence) || request.afterSequence < 0) {
    throw new Error("Activity afterSequence must be a non-negative integer");
  }
  assertLimit(request.limit, MAX_SECTION_LIMIT);
  // Activity is one global sequence; a scoped view is a local filter over it,
  // so the cursor stays the store-wide sequence the caller can resume from.
  const items: ActivityDto[] = [];
  let afterSequence = request.afterSequence;
  const ceiling = latestActivitySequence();
  while (items.length < request.limit && afterSequence < ceiling) {
    const page = listActivity({ afterSequence, limit: 100 });
    if (page.items.length === 0) break;
    for (const event of page.items) {
      if (items.length >= request.limit) break;
      afterSequence = event.sequence;
      if (visible(event)) items.push(event);
    }
    if (page.nextCursor === null && items.length < request.limit) {
      afterSequence = ceiling;
      break;
    }
  }
  return {
    items,
    nextCursor: afterSequence < ceiling ? afterSequence : null,
  };
}

function readProjectBinding(
  db: Database,
  projectId: string,
  documentId: string,
): DocumentBindingDto | null {
  const row = db
    .query<
      {
        role: string;
        boundRevisionId: string;
        currentHeadRevisionId: string | null;
        boundRevisionNo: number;
        headRevisionNo: number | null;
      },
      [string, string]
    >(
      `SELECT binding.role AS role,
              binding.document_revision_id AS boundRevisionId,
              document.current_revision_id AS currentHeadRevisionId,
              bound.revision_no AS boundRevisionNo,
              head.revision_no AS headRevisionNo
       FROM project_document_bindings binding
       JOIN document_revisions bound ON bound.id = binding.document_revision_id
       JOIN documents document ON document.id = bound.document_id
       LEFT JOIN document_revisions head ON head.id = document.current_revision_id
       WHERE binding.project_id = ? AND document.id = ?
       ORDER BY binding.role ASC LIMIT 1`,
    )
    .get(projectId, documentId);
  if (!row) return null;
  return {
    ownerType: "project",
    ownerId: projectId,
    role: row.role,
    documentId,
    boundRevisionId: row.boundRevisionId,
    currentHeadRevisionId: row.currentHeadRevisionId,
    hasNewerHead:
      row.headRevisionNo !== null && row.headRevisionNo > row.boundRevisionNo,
  };
}

function readMediaCounts(
  db: Database,
  project: ProjectSummaryDto,
): OverviewMediaCounts {
  const artifacts = db
    .query<{ total: number }, [string]>(
      "SELECT COUNT(*) AS total FROM artifacts WHERE project_id = ?",
    )
    .get(project.id)!.total;
  const objects = db
    .query<{ total: number }, [string]>(
      "SELECT COUNT(*) AS total FROM objects WHERE project_id = ?",
    )
    .get(project.id)!.total;
  const runObjects = db
    .query<{ total: number }, [string]>(
      `SELECT COUNT(*) AS total FROM run_objects runObject
       JOIN runs run ON run.id = runObject.run_id
       WHERE run.project_id = ?`,
    )
    .get(project.id)!.total;
  return { artifacts, objects, runObjects };
}
