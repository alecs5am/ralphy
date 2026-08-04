import type { Database } from "bun:sqlite";
import { appendActivity } from "./activity.js";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { assertLimit, buildPage, decodeCursor } from "./pagination.js";
import {
  resolveQueryContext,
  type QueryContext,
} from "./scope-context.js";
import { StoreConflictError, type Page } from "./types.js";

const CAMPAIGN_STATES = ["draft", "planned", "active", "completed", "archived"] as const;
const CALENDAR_STATES = ["idea", "queued", "produced", "gated", "scheduled", "published"] as const;

type CampaignState = (typeof CAMPAIGN_STATES)[number];
type CalendarState = (typeof CALENDAR_STATES)[number];

export type CampaignCellDto = {
  id: string;
  campaignId: string;
  thesisId: string;
  format: string;
  angle: string;
  keyword: string;
  channel: string;
  priority: number;
  state: "planned" | "produced" | "published";
  unitRevisionId: string | null;
  presentationId: string | null;
  socialAccountId: string | null;
  publicationId: string | null;
  producedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type CampaignDto = {
  id: string;
  workspaceId: string;
  slug: string;
  title: string;
  state: CampaignState;
  rowVersion: number;
  createdAt: number;
  updatedAt: number;
  cells: CampaignCellDto[];
};

export type CalendarEntryDto = {
  id: string;
  workspaceId: string;
  scheduledAt: string | null;
  unitType: string;
  platforms: string[];
  state: CalendarState;
  campaignId: string | null;
  campaignCellId: string | null;
  unitRevisionId: string | null;
  presentationId: string | null;
  socialAccountId: string | null;
  publicationId: string | null;
  rowVersion: number;
  createdAt: number;
  updatedAt: number;
};

export type CampaignPatch = {
  title?: string;
  state?: CampaignState;
  cells?: Array<{
    id: string;
    state?: CampaignCellDto["state"];
    unitRevisionId?: string | null;
    presentationId?: string | null;
    socialAccountId?: string | null;
    publicationId?: string | null;
  }>;
};

export type CalendarEntryPatch = {
  scheduledAt?: string | null;
  unitType?: string;
  platforms?: string[];
  state?: CalendarState;
  campaignId?: string | null;
  campaignCellId?: string | null;
  unitRevisionId?: string | null;
  presentationId?: string | null;
  socialAccountId?: string | null;
  publicationId?: string | null;
};

export function listCampaigns(input: {
  context: QueryContext;
  state?: CampaignState;
  after?: string | null;
  limit: number;
}): Page<CampaignDto> {
  assertLimit(input.limit);
  if (input.state !== undefined) checkedCampaignState(input.state);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const clauses = ["workspace_id = ?"];
  const values: Array<string | number> = [scope.workspaceId];
  if (input.state !== undefined) {
    clauses.push("state = ?");
    values.push(input.state);
  }
  if (input.after != null) {
    const cursor = decodeCursor("c1", input.after);
    clauses.push("(created_at > ? OR (created_at = ? AND id > ?))");
    values.push(cursor.ordinal, cursor.ordinal, cursor.id);
  }
  values.push(input.limit + 1);
  const rows = db
    .query<CampaignRow, Array<string | number>>(
      `SELECT ${CAMPAIGN_COLUMNS} FROM campaigns
       WHERE ${clauses.join(" AND ")}
       ORDER BY created_at, id LIMIT ?`,
    )
    .all(...values)
    .map((row) => campaignDto(db, row));
  return buildPage(rows, input.limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

export function getCampaign(input: {
  context: QueryContext;
  id: string;
}): CampaignDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const row = db.query<CampaignRow, [string, string]>(
    `SELECT ${CAMPAIGN_COLUMNS} FROM campaigns WHERE workspace_id = ? AND id = ?`,
  ).get(scope.workspaceId, input.id);
  if (!row) throw new Error(`Campaign not found: ${input.id}`);
  return campaignDto(db, row);
}

export function updateCampaign(input: {
  context: QueryContext;
  id: string;
  patch: CampaignPatch;
  expectedRowVersion: number;
}): CampaignDto {
  assertExpectedVersion(input.expectedRowVersion);
  assertAllowedKeys(input.patch, ["title", "state", "cells"], "Campaign patch");
  if (Object.keys(input.patch).length === 0) throw new Error("Campaign patch is empty");
  if (input.patch.title !== undefined) checkedText(input.patch.title, "Campaign title");
  if (input.patch.state !== undefined) checkedCampaignState(input.patch.state);
  return withImmediateTransaction((db) => {
    const scope = resolveQueryContext(db, input.context);
    const current = requireCampaign(db, scope.workspaceId, input.id);
    for (const patch of input.patch.cells ?? []) {
      validateCampaignCellPatch(db, scope.workspaceId, current.id, patch);
    }
    const now = Date.now();
    const result = db.prepare(
      `UPDATE campaigns
       SET title = ?, state = ?, row_version = row_version + 1, updated_at = ?
       WHERE id = ? AND workspace_id = ? AND row_version = ?`,
    ).run(
      input.patch.title ?? current.title,
      input.patch.state ?? current.state,
      now,
      current.id,
      scope.workspaceId,
      input.expectedRowVersion,
    );
    if (!result.changes) throw new StoreConflictError("Campaign row-version conflict");
    for (const patch of input.patch.cells ?? []) updateCampaignCell(db, patch, now);
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      entityType: "campaign",
      entityId: current.id,
      action: "campaign.updated",
      payload: { state: input.patch.state ?? current.state },
      createdAt: now,
    });
    return campaignDto(db, requireCampaign(db, scope.workspaceId, current.id));
  });
}

export function listCalendarEntries(input: {
  context: QueryContext;
  from?: string | null;
  to?: string | null;
  after?: string | null;
  limit: number;
}): Page<CalendarEntryDto> {
  assertLimit(input.limit);
  const from = input.from == null ? null : checkedInstant(input.from, "Calendar from");
  const to = input.to == null ? null : checkedInstant(input.to, "Calendar to");
  if (from !== null && to !== null && from > to) throw new Error("Calendar range is reversed");
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const clauses = ["workspace_id = ?", "kind = 'entry'"];
  const values: Array<string | number> = [scope.workspaceId];
  if (from !== null) {
    clauses.push("scheduled_at >= ?");
    values.push(from);
  }
  if (to !== null) {
    clauses.push("scheduled_at <= ?");
    values.push(to);
  }
  if (input.after != null) {
    const cursor = decodeCursor("c1", input.after);
    clauses.push("(created_at > ? OR (created_at = ? AND id > ?))");
    values.push(cursor.ordinal, cursor.ordinal, cursor.id);
  }
  values.push(input.limit + 1);
  const rows = db
    .query<CalendarRow, Array<string | number>>(
      `SELECT ${CALENDAR_COLUMNS} FROM calendar_entries
       WHERE ${clauses.join(" AND ")}
       ORDER BY created_at, id LIMIT ?`,
    )
    .all(...values)
    .map(calendarDto);
  return buildPage(rows, input.limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

export function updateCalendarEntry(input: {
  context: QueryContext;
  id: string;
  patch: CalendarEntryPatch;
  expectedRowVersion: number;
}): CalendarEntryDto {
  assertExpectedVersion(input.expectedRowVersion);
  assertAllowedKeys(
    input.patch,
    [
      "scheduledAt",
      "unitType",
      "platforms",
      "state",
      "campaignId",
      "campaignCellId",
      "unitRevisionId",
      "presentationId",
      "socialAccountId",
      "publicationId",
    ],
    "Calendar Entry patch",
  );
  if (Object.keys(input.patch).length === 0) throw new Error("Calendar Entry patch is empty");
  return withImmediateTransaction((db) => {
    const scope = resolveQueryContext(db, input.context);
    const current = requireCalendarEntry(db, scope.workspaceId, input.id);
    const next = validateCalendarPatch(db, scope.workspaceId, current, input.patch);
    const now = Date.now();
    const result = db.prepare(
      `UPDATE calendar_entries
       SET scheduled_at = ?, unit_type = ?, platforms_json = ?, state = ?,
           campaign_id = ?, campaign_cell_id = ?, unit_revision_id = ?,
           presentation_id = ?, social_account_id = ?, publication_id = ?,
           row_version = row_version + 1, updated_at = ?
       WHERE id = ? AND workspace_id = ? AND kind = 'entry' AND row_version = ?`,
    ).run(
      next.scheduled_at,
      next.unit_type,
      next.platforms_json,
      next.state,
      next.campaign_id,
      next.campaign_cell_id,
      next.unit_revision_id,
      next.presentation_id,
      next.social_account_id,
      next.publication_id,
      now,
      current.id,
      scope.workspaceId,
      input.expectedRowVersion,
    );
    if (!result.changes) throw new StoreConflictError("Calendar Entry row-version conflict");
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      entityType: "calendar_entry",
      entityId: current.id,
      action: "calendar.entry.updated",
      payload: { state: next.state },
      createdAt: now,
    });
    return calendarDto(requireCalendarEntry(db, scope.workspaceId, current.id));
  });
}

type CampaignRow = {
  id: string;
  workspace_id: string;
  slug: string;
  title: string;
  state: CampaignState;
  row_version: number;
  created_at: number;
  updated_at: number;
};

type CampaignCellRow = {
  id: string;
  campaign_id: string;
  thesis_id: string;
  format: string;
  angle: string;
  keyword: string;
  channel: string;
  priority: number;
  state: CampaignCellDto["state"];
  unit_revision_id: string | null;
  presentation_id: string | null;
  social_account_id: string | null;
  publication_id: string | null;
  produced_at: number | null;
  created_at: number;
  updated_at: number;
};

type CalendarRow = {
  id: string;
  workspace_id: string;
  scheduled_at: number | null;
  unit_type: string;
  platforms_json: string;
  state: CalendarState;
  campaign_id: string | null;
  campaign_cell_id: string | null;
  unit_revision_id: string | null;
  presentation_id: string | null;
  social_account_id: string | null;
  publication_id: string | null;
  row_version: number;
  created_at: number;
  updated_at: number;
};

const CAMPAIGN_COLUMNS =
  "id, workspace_id, slug, title, state, row_version, created_at, updated_at";
const CAMPAIGN_CELL_COLUMNS =
  "id, campaign_id, thesis_id, format, angle, keyword, channel, priority, state, " +
  "unit_revision_id, presentation_id, social_account_id, publication_id, " +
  "produced_at, created_at, updated_at";
const CALENDAR_COLUMNS =
  "id, workspace_id, scheduled_at, unit_type, platforms_json, state, campaign_id, " +
  "campaign_cell_id, unit_revision_id, presentation_id, social_account_id, " +
  "publication_id, row_version, created_at, updated_at";

function campaignDto(db: Database, row: CampaignRow): CampaignDto {
  const cells = db
    .query<CampaignCellRow, [string]>(
      `SELECT ${CAMPAIGN_CELL_COLUMNS} FROM campaign_cells
       WHERE campaign_id = ? ORDER BY created_at, id`,
    )
    .all(row.id)
    .map((cell) => ({
      id: cell.id,
      campaignId: cell.campaign_id,
      thesisId: cell.thesis_id,
      format: cell.format,
      angle: cell.angle,
      keyword: cell.keyword,
      channel: cell.channel,
      priority: cell.priority,
      state: cell.state,
      unitRevisionId: cell.unit_revision_id,
      presentationId: cell.presentation_id,
      socialAccountId: cell.social_account_id,
      publicationId: cell.publication_id,
      producedAt: cell.produced_at,
      createdAt: cell.created_at,
      updatedAt: cell.updated_at,
    }));
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    title: row.title,
    state: row.state,
    rowVersion: row.row_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cells,
  };
}

function calendarDto(row: CalendarRow): CalendarEntryDto {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    scheduledAt: row.scheduled_at === null ? null : new Date(row.scheduled_at).toISOString(),
    unitType: row.unit_type,
    platforms: JSON.parse(row.platforms_json) as string[],
    state: row.state,
    campaignId: row.campaign_id,
    campaignCellId: row.campaign_cell_id,
    unitRevisionId: row.unit_revision_id,
    presentationId: row.presentation_id,
    socialAccountId: row.social_account_id,
    publicationId: row.publication_id,
    rowVersion: row.row_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireCampaign(db: Database, workspaceId: string, id: string): CampaignRow {
  const row = db.query<CampaignRow, [string, string]>(
    `SELECT ${CAMPAIGN_COLUMNS} FROM campaigns WHERE workspace_id = ? AND id = ?`,
  ).get(workspaceId, id);
  if (!row) throw new Error(`Campaign not found: ${id}`);
  return row;
}

function requireCalendarEntry(db: Database, workspaceId: string, id: string): CalendarRow {
  const row = db.query<CalendarRow, [string, string]>(
    `SELECT ${CALENDAR_COLUMNS} FROM calendar_entries
     WHERE workspace_id = ? AND id = ? AND kind = 'entry'`,
  ).get(workspaceId, id);
  if (!row) throw new Error(`Calendar Entry not found: ${id}`);
  return row;
}

function validateCampaignCellPatch(
  db: Database,
  workspaceId: string,
  campaignId: string,
  patch: NonNullable<CampaignPatch["cells"]>[number],
): void {
  assertAllowedKeys(
    patch,
    ["id", "state", "unitRevisionId", "presentationId", "socialAccountId", "publicationId"],
    "Campaign Cell patch",
  );
  const cell = db.query<CampaignCellRow, [string, string]>(
    `SELECT ${CAMPAIGN_CELL_COLUMNS} FROM campaign_cells WHERE campaign_id = ? AND id = ?`,
  ).get(campaignId, patch.id);
  if (!cell) throw new Error(`Campaign Cell not found: ${patch.id}`);
  validateReferences(db, workspaceId, { ...cell, ...toReferenceColumns(patch) });
}

function updateCampaignCell(
  db: Database,
  patch: NonNullable<CampaignPatch["cells"]>[number],
  now: number,
): void {
  const current = db.query<CampaignCellRow, [string]>(
    `SELECT ${CAMPAIGN_CELL_COLUMNS} FROM campaign_cells WHERE id = ?`,
  ).get(patch.id)!;
  const refs = toReferenceColumns(patch);
  db.prepare(
    `UPDATE campaign_cells
     SET state = ?, unit_revision_id = ?, presentation_id = ?, social_account_id = ?,
         publication_id = ?, updated_at = ? WHERE id = ?`,
  ).run(
    patch.state ?? current.state,
    refs.unit_revision_id === undefined ? current.unit_revision_id : refs.unit_revision_id,
    refs.presentation_id === undefined ? current.presentation_id : refs.presentation_id,
    refs.social_account_id === undefined ? current.social_account_id : refs.social_account_id,
    refs.publication_id === undefined ? current.publication_id : refs.publication_id,
    now,
    patch.id,
  );
}

function validateCalendarPatch(
  db: Database,
  workspaceId: string,
  current: CalendarRow,
  patch: CalendarEntryPatch,
): CalendarRow {
  if (patch.state !== undefined) {
    checkedCalendarState(patch.state);
    if (CALENDAR_STATES.indexOf(patch.state) <= CALENDAR_STATES.indexOf(current.state)) {
      throw new Error(`Calendar lifecycle must move forward from ${current.state}`);
    }
  }
  const scheduledAt =
    patch.scheduledAt === undefined
      ? current.scheduled_at
      : patch.scheduledAt === null
        ? null
        : checkedInstant(patch.scheduledAt, "Calendar scheduledAt");
  const platforms = patch.platforms ?? (JSON.parse(current.platforms_json) as string[]);
  if (!Array.isArray(platforms) || platforms.some((item) => typeof item !== "string" || !item)) {
    throw new Error("Calendar platforms are invalid");
  }
  const next = {
    ...current,
    scheduled_at: scheduledAt,
    unit_type: patch.unitType === undefined ? current.unit_type : checkedText(patch.unitType, "Calendar unitType"),
    platforms_json: JSON.stringify(platforms),
    state: patch.state ?? current.state,
    campaign_id: patch.campaignId === undefined ? current.campaign_id : patch.campaignId,
    campaign_cell_id:
      patch.campaignCellId === undefined ? current.campaign_cell_id : patch.campaignCellId,
    unit_revision_id:
      patch.unitRevisionId === undefined ? current.unit_revision_id : patch.unitRevisionId,
    presentation_id:
      patch.presentationId === undefined ? current.presentation_id : patch.presentationId,
    social_account_id:
      patch.socialAccountId === undefined ? current.social_account_id : patch.socialAccountId,
    publication_id:
      patch.publicationId === undefined ? current.publication_id : patch.publicationId,
  };
  validateReferences(db, workspaceId, next);
  return next;
}

function validateReferences(
  db: Database,
  workspaceId: string,
  refs: {
    campaign_id?: string | null;
    campaign_cell_id?: string | null;
    unit_revision_id?: string | null;
    presentation_id?: string | null;
    social_account_id?: string | null;
    publication_id?: string | null;
  },
): void {
  if (refs.campaign_id) requireReferenceWorkspace(db, "campaign", refs.campaign_id, workspaceId);
  if (refs.campaign_cell_id) {
    const cell = requireReferenceWorkspace(db, "campaign_cell", refs.campaign_cell_id, workspaceId);
    if (refs.campaign_id && cell.parentId !== refs.campaign_id) {
      throw new Error("Campaign Cell does not belong to the referenced Campaign");
    }
  }
  if (refs.unit_revision_id) requireReferenceWorkspace(db, "unit_revision", refs.unit_revision_id, workspaceId);
  if (refs.presentation_id) {
    const presentation = requireReferenceWorkspace(db, "presentation", refs.presentation_id, workspaceId);
    if (refs.unit_revision_id && presentation.parentId !== refs.unit_revision_id) {
      throw new Error("Presentation does not belong to the referenced Unit Revision");
    }
  }
  if (refs.social_account_id) requireReferenceWorkspace(db, "social_account", refs.social_account_id, workspaceId);
  if (refs.publication_id) {
    const publication = requireReferenceWorkspace(db, "publication", refs.publication_id, workspaceId);
    if (refs.presentation_id && publication.parentId !== refs.presentation_id) {
      throw new Error("Publication does not belong to the referenced Presentation");
    }
  }
}

function requireReferenceWorkspace(
  db: Database,
  kind: "campaign" | "campaign_cell" | "unit_revision" | "presentation" | "social_account" | "publication",
  id: string,
  workspaceId: string,
): { workspaceId: string; parentId: string | null } {
  const queries = {
    campaign: "SELECT workspace_id AS workspaceId, NULL AS parentId FROM campaigns WHERE id = ?",
    campaign_cell: "SELECT workspace_id AS workspaceId, campaign_id AS parentId FROM campaign_cells WHERE id = ?",
    unit_revision: `SELECT unit.workspace_id AS workspaceId, unit.id AS parentId
      FROM unit_revisions revision JOIN units unit ON unit.id = revision.unit_id WHERE revision.id = ?`,
    presentation: `SELECT unit.workspace_id AS workspaceId, presentation.unit_revision_id AS parentId
      FROM unit_presentations presentation
      JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
      JOIN units unit ON unit.id = revision.unit_id WHERE presentation.id = ?`,
    social_account: "SELECT workspace_id AS workspaceId, NULL AS parentId FROM social_accounts WHERE id = ?",
    publication: `SELECT unit.workspace_id AS workspaceId, publication.presentation_id AS parentId
      FROM publications publication
      JOIN unit_presentations presentation ON presentation.id = publication.presentation_id
      JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
      JOIN units unit ON unit.id = revision.unit_id WHERE publication.id = ?`,
  } as const;
  const row = db.query<{ workspaceId: string; parentId: string | null }, [string]>(queries[kind]).get(id);
  if (!row || row.workspaceId !== workspaceId) {
    throw new Error(`${kind.replaceAll("_", " ")} is outside the Workspace`);
  }
  return row;
}

function toReferenceColumns(patch: {
  unitRevisionId?: string | null;
  presentationId?: string | null;
  socialAccountId?: string | null;
  publicationId?: string | null;
}): {
  unit_revision_id?: string | null;
  presentation_id?: string | null;
  social_account_id?: string | null;
  publication_id?: string | null;
} {
  return {
    ...(patch.unitRevisionId !== undefined ? { unit_revision_id: patch.unitRevisionId } : {}),
    ...(patch.presentationId !== undefined ? { presentation_id: patch.presentationId } : {}),
    ...(patch.socialAccountId !== undefined ? { social_account_id: patch.socialAccountId } : {}),
    ...(patch.publicationId !== undefined ? { publication_id: patch.publicationId } : {}),
  };
}

function checkedCampaignState(value: string): CampaignState {
  if (!(CAMPAIGN_STATES as readonly string[]).includes(value)) throw new Error(`Invalid Campaign state: ${value}`);
  return value as CampaignState;
}

function checkedCalendarState(value: string): CalendarState {
  if (!(CALENDAR_STATES as readonly string[]).includes(value)) throw new Error(`Invalid Calendar state: ${value}`);
  return value as CalendarState;
}

function checkedText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 256) {
    throw new Error(`${label} is invalid`);
  }
  return value.trim();
}

function checkedInstant(value: string, label: string): number {
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) throw new Error(`${label} is invalid`);
  return instant;
}

function assertExpectedVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Expected row version is invalid");
}

function assertAllowedKeys(
  value: object,
  allowed: readonly string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new Error(`${label} contains unsupported field: ${key}`);
  }
}
