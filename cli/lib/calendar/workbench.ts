import type { Database } from "bun:sqlite";
import {
  cancelPublication,
  publishPresentation,
  type PublicationProviderAdapter,
} from "../publication.js";
import { postizAvailable } from "../providers/postiz.js";
import { appendActivity } from "../store/activity.js";
import { openDomainDb, withImmediateTransaction } from "../store/db.js";
import { newDomainId } from "../store/ids.js";
import { resolveQueryContext, type QueryContext } from "../store/scope-context.js";
import {
  StoreConflictError,
  type JsonValue,
  type PublicationState,
} from "../store/types.js";

export type CalendarChannelStatus =
  | "draft"
  | "scheduled"
  | "uploading"
  | "published"
  | "failed"
  | "disconnected";

export type CalendarEventStatus =
  | "draft"
  | "scheduled"
  | "uploading"
  | "published"
  | "partial"
  | "failed";

export type CalendarPreviewRef = {
  type: "artifact-revision";
  id: string;
};

export type CalendarChannelPublicationDto = {
  id: string | null;
  platform: string;
  accountId: string | null;
  account: string;
  status: CalendarChannelStatus;
  at: number | null;
  postUrl: string | null;
  error: string | null;
  settings: JsonValue;
};

export type CalendarMetricsDto = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  syncedAt: number;
};

export type CalendarEventDto = {
  id: string;
  rowVersion: number;
  unitId: string;
  unitRevisionId: string;
  title: string;
  projectId: string | null;
  project: string;
  kind: string;
  thumbnail: CalendarPreviewRef | null;
  at: number | null;
  draftAt: number | null;
  timezone: string;
  pinnedRevision: number;
  unitSelectedRevision: number | null;
  status: CalendarEventStatus;
  channels: CalendarChannelPublicationDto[];
  metrics: CalendarMetricsDto | null;
};

export type CalendarReadyUnitDto = {
  unitId: string;
  unitRevisionId: string | null;
  title: string;
  projectId: string | null;
  project: string;
  revision: number | null;
  kind: string;
  thumbnail: CalendarPreviewRef | null;
  platforms: string[];
  channels: Array<CalendarChannelInput & { platform: string; account: string }>;
  revisions: CalendarReadyRevisionDto[];
  readiness: "ready" | "review" | "blocked" | "draft";
  note: string | null;
};

export type CalendarReadyRevisionDto = {
  unitRevisionId: string;
  revision: number;
  thumbnail: CalendarPreviewRef | null;
  platforms: string[];
  channels: Array<CalendarChannelInput & { platform: string; account: string }>;
};

export type CalendarAccountDto = {
  id: string;
  platform: string;
  handle: string;
  disconnected: boolean;
  rowVersion: number;
};

export type CalendarProjectDto = {
  id: string;
  name: string;
};

export type CalendarWorkspaceDto = {
  timezone: string;
  postiz: {
    available: boolean;
    lastSyncedAt: number | null;
    error: string | null;
  };
  events: CalendarEventDto[];
  readyUnits: CalendarReadyUnitDto[];
  projects: CalendarProjectDto[];
  accounts: CalendarAccountDto[];
};

type CalendarRow = {
  id: string;
  rowVersion: number;
  scheduledAt: number | null;
  timezone: string | null;
  unitType: string;
  unitRevisionId: string;
  unitId: string;
  slug: string;
  format: string;
  projectId: string | null;
  project: string | null;
  pinnedRevision: number;
  selectedRevisionId: string | null;
  unitSelectedRevision: number | null;
  metadataJson: string | null;
  createdAt: number;
};

type PresentationRow = {
  id: string;
  platform: string;
  position: number;
  coverArtifactRevisionId: string | null;
  optionsJson: string;
};

type PublicationRow = {
  id: string;
  presentationId: string;
  platform: string;
  socialAccountId: string | null;
  state: PublicationState;
  scheduledAt: number | null;
  url: string | null;
  error: string | null;
  settingsJson: string;
  createdAt: number;
  displayName: string | null;
  username: string | null;
  externalId: string | null;
  relinkRequired: number;
  revisedFromPublicationId: string | null;
};

type ReadyRow = {
  unitId: string;
  slug: string;
  format: string;
  projectId: string | null;
  project: string | null;
  latestRevisionId: string | null;
  selectedRevisionId: string | null;
  selectedRevision: number | null;
  createdAt: number;
};

export type CalendarChannelInput = {
  presentationId: string;
  socialAccountId: string;
  settings: JsonValue;
};

type CalendarMetadata = {
  timezone?: string;
  channels?: CalendarChannelInput[];
  draftAt?: number;
};

const EVENT_COLUMNS = `entry.id AS id, entry.row_version AS rowVersion,
  entry.scheduled_at AS scheduledAt, entry.timezone AS timezone,
  entry.unit_type AS unitType, entry.unit_revision_id AS unitRevisionId,
  unit.id AS unitId, unit.slug AS slug, unit.format AS format,
  unit.project_id AS projectId, project.name AS project,
  pinned.revision_no AS pinnedRevision,
  unit.selected_revision_id AS selectedRevisionId,
  selected.revision_no AS unitSelectedRevision,
  entry.metadata_json AS metadataJson, entry.created_at AS createdAt`;

export function getCalendarWorkspace(input: {
  context: QueryContext;
  from: string;
  to: string;
  timezone: string;
}): CalendarWorkspaceDto {
  const from = instant(input.from, "Calendar from");
  const to = instant(input.to, "Calendar to");
  if (from >= to) throw new Error("Calendar range is reversed");
  if (to - from > 370 * 86_400_000) throw new Error("Calendar range is too large");
  checkedTimezone(input.timezone);
  const db = openDomainDb();
  return db.transaction(() => {
    const scope = resolveQueryContext(db, input.context);
    const eventRows = db.query<CalendarRow, [string, number, number, number, number]>(
      `SELECT ${EVENT_COLUMNS}
       FROM calendar_entries entry
       JOIN unit_revisions pinned ON pinned.id = entry.unit_revision_id
       JOIN units unit ON unit.id = pinned.unit_id
       LEFT JOIN projects project ON project.id = unit.project_id
       LEFT JOIN unit_revisions selected ON selected.id = unit.selected_revision_id
       WHERE entry.workspace_id = ? AND entry.kind = 'entry'
         AND ((entry.scheduled_at IS NULL
               AND COALESCE(json_extract(entry.metadata_json, '$.draftAt'), entry.created_at) >= ?
               AND COALESCE(json_extract(entry.metadata_json, '$.draftAt'), entry.created_at) < ?)
              OR (entry.scheduled_at >= ? AND entry.scheduled_at < ?))
       ORDER BY entry.scheduled_at IS NULL, entry.scheduled_at, entry.created_at, entry.id`,
    ).all(scope.workspaceId, from, to, from, to);
    const events = eventRows.map((row) => eventDto(db, row, input.timezone));
    return {
      timezone: input.timezone,
      postiz: {
        available: postizAvailable(),
        lastSyncedAt: latestMetricSync(db, scope.workspaceId),
        error: null,
      },
      events,
      readyUnits: readyUnits(db, scope.workspaceId),
      projects: db.query<CalendarProjectDto, [string]>(
        "SELECT id, name FROM projects WHERE workspace_id = ? ORDER BY created_at, id",
      ).all(scope.workspaceId),
      accounts: db.query<{
        id: string;
        platform: string;
        displayName: string | null;
        username: string | null;
        externalId: string;
        disconnected: number;
        rowVersion: number;
      }, [string]>(
        `SELECT id, platform, display_name AS displayName, username,
                external_id AS externalId, relink_required AS disconnected,
                row_version AS rowVersion
         FROM social_accounts WHERE workspace_id = ? ORDER BY created_at, id`,
      ).all(scope.workspaceId).map((account) => ({
        id: account.id,
        platform: account.platform,
        handle: account.displayName ?? account.username ?? account.externalId,
        disconnected: account.disconnected === 1,
        rowVersion: account.rowVersion,
      })),
    };
  })();
}

export function createCalendarEvent(input: {
  context: QueryContext;
  unitRevisionId: string;
  at: number | null;
  draftAt?: number;
  timezone: string;
  channels: CalendarChannelInput[];
}): CalendarEventDto {
  checkedTimezone(input.timezone);
  if (input.at !== null && (!Number.isInteger(input.at) || input.at < 0)) {
    throw new Error("Calendar event time is invalid");
  }
  if (input.draftAt !== undefined && (!Number.isInteger(input.draftAt) || input.draftAt < 0)) {
    throw new Error("Calendar draft date is invalid");
  }
  if (!Array.isArray(input.channels) || input.channels.length === 0 || input.channels.length > 20) {
    throw new Error("Calendar event requires 1 to 20 channels");
  }
  return withImmediateTransaction((db) => {
    const scope = resolveQueryContext(db, input.context);
    const revision = db.query<{
      id: string;
      unitId: string;
      workspaceId: string;
      projectId: string | null;
      format: string;
    }, [string]>(
      `SELECT revision.id AS id, unit.id AS unitId,
              unit.workspace_id AS workspaceId, unit.project_id AS projectId,
              unit.format AS format
       FROM unit_revisions revision JOIN units unit ON unit.id = revision.unit_id
       WHERE revision.id = ?`,
    ).get(input.unitRevisionId);
    if (
      !revision
      || revision.workspaceId !== scope.workspaceId
      || (scope.projectId !== null && revision.projectId !== scope.projectId)
    ) throw new Error("Calendar Unit revision is outside the active scope");

    const seen = new Set<string>();
    const channels = input.channels.map((channel) => {
      if (
        !channel
        || typeof channel.presentationId !== "string"
        || typeof channel.socialAccountId !== "string"
      ) throw new Error("Calendar channel is invalid");
      const key = `${channel.presentationId}\0${channel.socialAccountId}`;
      if (seen.has(key)) throw new Error("Calendar channel is duplicated");
      seen.add(key);
      const binding = db.query<{
        platform: string;
        unitRevisionId: string;
        accountWorkspaceId: string | null;
        accountPlatform: string | null;
        relinkRequired: number;
      }, [string, string]>(
        `SELECT presentation.platform AS platform,
                presentation.unit_revision_id AS unitRevisionId,
                account.workspace_id AS accountWorkspaceId,
                account.platform AS accountPlatform,
                COALESCE(account.relink_required, 0) AS relinkRequired
         FROM unit_presentations presentation
         LEFT JOIN social_accounts account ON account.id = ?
         WHERE presentation.id = ?`,
      ).get(channel.socialAccountId, channel.presentationId);
      if (!binding || binding.unitRevisionId !== revision.id) {
        throw new Error("Calendar presentation is outside the pinned Unit revision");
      }
      if (
        binding.accountWorkspaceId !== scope.workspaceId
        || binding.accountPlatform !== binding.platform
      ) throw new Error("Calendar account platform does not match the presentation");
      if (binding.relinkRequired === 1) throw new Error("Calendar account requires reconnecting");
      return {
        presentationId: channel.presentationId,
        socialAccountId: channel.socialAccountId,
        settings: checkedPlatformSettings(binding.platform, channel.settings),
      };
    });
    const now = Date.now();
    const id = newDomainId("calendar");
    const metadata: CalendarMetadata = { timezone: input.timezone, channels, ...(input.at === null && input.draftAt !== undefined ? { draftAt: input.draftAt } : {}) };
    db.prepare(
      `INSERT INTO calendar_entries
       (id, workspace_id, kind, scheduled_at, unit_type, platforms_json,
        state, unit_revision_id, metadata_json, created_at, updated_at)
       VALUES (?, ?, 'entry', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      scope.workspaceId,
      input.at,
      revision.format,
      JSON.stringify([...new Set(channels.map((channel) => db.query<{ platform: string }, [string]>(
        "SELECT platform FROM unit_presentations WHERE id = ?",
      ).get(channel.presentationId)!.platform))]),
      input.at === null ? "queued" : "scheduled",
      revision.id,
      JSON.stringify(metadata),
      now,
      now,
    );
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: revision.projectId,
      entityType: "calendar_entry",
      entityId: id,
      action: "calendar.entry.created",
      payload: { state: input.at === null ? "queued" : "scheduled" },
      createdAt: now,
    });
    return eventDto(db, requireEventRow(db, scope.workspaceId, id), input.timezone);
  });
}

export async function submitCalendarEvent(input: {
  context: QueryContext;
  eventId: string;
  expectedRowVersion: number;
  at: number;
}, adapter?: PublicationProviderAdapter): Promise<CalendarEventDto> {
  if (!Number.isInteger(input.expectedRowVersion) || input.expectedRowVersion < 1) {
    throw new Error("Calendar event row version is invalid");
  }
  if (!Number.isInteger(input.at) || input.at < 0) {
    throw new Error("Calendar event time is invalid");
  }
  const prepared = withImmediateTransaction((db) => {
    const scope = resolveQueryContext(db, input.context);
    const event = requireEventRow(db, scope.workspaceId, input.eventId);
    if (scope.projectId !== null && event.projectId !== scope.projectId) {
      throw new Error("Calendar event is outside the active scope");
    }
    const channels = calendarMetadata(event.metadataJson).channels ?? [];
    if (channels.length === 0) throw new Error("Calendar event has no selected channels");
    const now = Date.now();
    const result = db.prepare(
      `UPDATE calendar_entries
       SET scheduled_at = ?, state = 'scheduled', row_version = row_version + 1,
           updated_at = ?
       WHERE id = ? AND workspace_id = ? AND kind = 'entry' AND row_version = ?`,
    ).run(input.at, now, event.id, scope.workspaceId, input.expectedRowVersion);
    if (!result.changes) throw new StoreConflictError("Calendar event row-version conflict");
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: event.projectId,
      entityType: "calendar_entry",
      entityId: event.id,
      action: "calendar.entry.scheduled",
      payload: { scheduledAt: input.at },
      createdAt: now,
    });
    return {
      workspaceId: scope.workspaceId,
      projectId: event.projectId,
      eventId: event.id,
      channels,
      timezone: calendarMetadata(event.metadataJson).timezone ?? "UTC",
    };
  });
  const context: QueryContext = prepared.projectId === null
    ? { workspaceId: prepared.workspaceId }
    : { workspaceId: prepared.workspaceId, projectId: prepared.projectId };
  for (const channel of prepared.channels) {
    await publishPresentation({
      context,
      presentationId: channel.presentationId,
      socialAccountId: channel.socialAccountId,
      rail: "postiz",
      scheduledAt: input.at,
      options: channel.settings,
      idempotencyKey: [
        "calendar", prepared.eventId, channel.presentationId,
        channel.socialAccountId, input.at,
      ].join(":"),
    }, adapter);
  }
  const db = openDomainDb();
  return db.transaction(() => eventDto(
    db,
    requireEventRow(db, prepared.workspaceId, prepared.eventId),
    prepared.timezone,
  ))();
}

export async function retryCalendarEvent(input: {
  context: QueryContext;
  eventId: string;
  expectedRowVersion: number;
}, adapter?: PublicationProviderAdapter): Promise<CalendarEventDto> {
  const prepared = reserveEventMutation(input, "calendar.entry.retried", (event, publications) => {
    if (!publications.some((publication) => channelStatus(publication.state) === "failed")) {
      throw new Error("Calendar event has no failed channels");
    }
    return {
      scheduledAt: event.scheduledAt,
      state: event.scheduledAt === null ? "queued" : "scheduled",
    };
  });
  const failed = prepared.publications.filter((publication) =>
    channelStatus(publication.state) === "failed"
  );
  for (const publication of failed) {
    await publishPresentation({
      context: prepared.context,
      presentationId: publication.presentationId,
      socialAccountId: publication.socialAccountId,
      rail: "postiz",
      scheduledAt: prepared.event.scheduledAt,
      revisedFromPublicationId: publication.id,
      options: JSON.parse(publication.settingsJson) as JsonValue,
      idempotencyKey: `calendar:retry:${prepared.event.id}:${publication.id}`,
    }, adapter);
  }
  return refreshedEvent(prepared);
}

export async function rescheduleCalendarEvent(input: {
  context: QueryContext;
  eventId: string;
  expectedRowVersion: number;
  at: number;
}, adapter?: PublicationProviderAdapter): Promise<CalendarEventDto> {
  if (!Number.isInteger(input.at) || input.at < 0) {
    throw new Error("Calendar event time is invalid");
  }
  const prepared = reserveEventMutation(input, "calendar.entry.rescheduled", () => ({
    scheduledAt: input.at,
    state: "scheduled",
  }));
  await cancelScheduledPublications(prepared, adapter);
  const channels = eventChannelInputs(prepared.event, prepared.publications);
  for (const channel of channels) {
    const previous = prepared.publications.find((publication) =>
      publication.presentationId === channel.presentationId
      && publication.socialAccountId === channel.socialAccountId
    );
    await publishPresentation({
      context: prepared.context,
      presentationId: channel.presentationId,
      socialAccountId: channel.socialAccountId,
      rail: "postiz",
      scheduledAt: input.at,
      revisedFromPublicationId: previous?.id ?? null,
      options: channel.settings,
      idempotencyKey: `calendar:move:${prepared.event.id}:${channel.presentationId}:${channel.socialAccountId}:${input.at}`,
    }, adapter);
  }
  return refreshedEvent(prepared);
}

export async function removeCalendarEvent(input: {
  context: QueryContext;
  eventId: string;
  expectedRowVersion: number;
}, adapter?: PublicationProviderAdapter): Promise<CalendarEventDto> {
  const prepared = reserveEventMutation(input, "calendar.entry.removed", () => ({
    scheduledAt: null,
    state: "queued",
  }));
  await cancelScheduledPublications(prepared, adapter);
  return refreshedEvent(prepared);
}

export function deriveCalendarEventStatus(
  at: number | null,
  channels: CalendarChannelPublicationDto[],
): CalendarEventStatus {
  if (at === null) return "draft";
  if (channels.length === 0) return "scheduled";
  if (channels.every((channel) => channel.status === "published")) return "published";
  const broken = channels.some((channel) =>
    channel.status === "failed" || channel.status === "disconnected"
  );
  if (broken && channels.some((channel) => channel.status === "published")) return "partial";
  if (broken) return "failed";
  if (channels.some((channel) => channel.status === "uploading")) return "uploading";
  return "scheduled";
}

function eventDto(
  db: Database,
  row: CalendarRow,
  fallbackTimezone: string,
): CalendarEventDto {
  const presentations = presentationsFor(db, row.unitRevisionId);
  const publications = publicationsFor(db, row.unitRevisionId);
  const publishedChannels = currentPublications(publications).map(channelDto);
  const metadata = calendarMetadata(row.metadataJson);
  const channels = mergeDraftChannels(db, publishedChannels, metadata.channels ?? []);
  const cover = presentations.find((item) => item.coverArtifactRevisionId)?.coverArtifactRevisionId ?? null;
  return {
    id: row.id,
    rowVersion: row.rowVersion,
    unitId: row.unitId,
    unitRevisionId: row.unitRevisionId,
    title: title(row.slug),
    projectId: row.projectId,
    project: row.project ?? "Workspace",
    kind: row.format || row.unitType,
    thumbnail: cover ? { type: "artifact-revision", id: cover } : null,
    at: row.scheduledAt,
    draftAt: row.scheduledAt === null ? metadata.draftAt ?? row.createdAt : null,
    timezone: metadata.timezone ?? row.timezone ?? fallbackTimezone,
    pinnedRevision: row.pinnedRevision,
    unitSelectedRevision: row.unitSelectedRevision,
    status: deriveCalendarEventStatus(row.scheduledAt, channels),
    channels,
    metrics: metricsFor(db, publications),
  };
}

function readyUnits(
  db: Database,
  workspaceId: string,
): CalendarReadyUnitDto[] {
  const entries = db.query<{ unitId: string; scheduledAt: number | null }, [string]>(
    `SELECT revision.unit_id AS unitId, entry.scheduled_at AS scheduledAt
     FROM calendar_entries entry
     JOIN unit_revisions revision ON revision.id = entry.unit_revision_id
     WHERE entry.workspace_id = ? AND entry.kind = 'entry'`,
  ).all(workspaceId);
  const scheduled = new Set(entries.filter((entry) => entry.scheduledAt !== null).map((entry) => entry.unitId));
  const drafts = new Set(entries.filter((entry) => entry.scheduledAt === null).map((entry) => entry.unitId));
  const rows = db.query<ReadyRow, [string]>(
    `SELECT unit.id AS unitId, unit.slug AS slug, unit.format AS format,
            unit.project_id AS projectId, project.name AS project,
            unit.latest_revision_id AS latestRevisionId,
            unit.selected_revision_id AS selectedRevisionId,
            selected.revision_no AS selectedRevision, unit.created_at AS createdAt
     FROM units unit
     LEFT JOIN projects project ON project.id = unit.project_id
     LEFT JOIN unit_revisions selected ON selected.id = unit.selected_revision_id
     WHERE unit.workspace_id = ? ORDER BY unit.created_at, unit.id`,
  ).all(workspaceId);
  return rows.flatMap((row) => {
    if (scheduled.has(row.unitId)) return [];
    const revisionId = row.selectedRevisionId;
    const revisions = db.query<{ id: string; revision: number }, [string]>(
      `SELECT id, revision_no AS revision FROM unit_revisions
       WHERE unit_id = ? AND sealed_at IS NOT NULL ORDER BY revision_no`,
    ).all(row.unitId).map((revision) => readyRevision(db, workspaceId, revision));
    const selected = revisions.find((revision) => revision.unitRevisionId === revisionId) ?? null;
    const presentations = revisionId ? presentationsFor(db, revisionId) : [];
    const platforms = selected?.platforms ?? [];
    const channels = selected?.channels ?? [];
    const connected = new Set(db.query<{ id: string }, [string]>(
      "SELECT id FROM social_accounts WHERE workspace_id = ? AND relink_required = 0",
    ).all(workspaceId).map((account) => account.id));
    const hasAccount = presentations.every((presentation) => channels.some((channel) =>
      channel.presentationId === presentation.id && connected.has(channel.socialAccountId)
    ));
    const draft = drafts.has(row.unitId);
    const readiness = draft
      ? "draft"
      : revisionId === null || presentations.length === 0 || !hasAccount
        ? "blocked"
        : revisionId !== row.latestRevisionId
          ? "review"
          : "ready";
    return [{
      unitId: row.unitId,
      unitRevisionId: revisionId,
      title: title(row.slug),
      projectId: row.projectId,
      project: row.project ?? "Workspace",
      revision: row.selectedRevision,
      kind: row.format,
      thumbnail: selected?.thumbnail ?? null,
      platforms,
      channels,
      revisions,
      readiness,
      note: readiness === "blocked"
        ? revisionId === null
          ? "Select a revision in Units"
          : presentations.length === 0
            ? "Add a channel presentation"
            : "Connect a publishing account"
        : readiness === "review"
          ? "A newer Unit revision is available"
          : null,
    }];
  });
}

function readyRevision(
  db: Database,
  workspaceId: string,
  revision: { id: string; revision: number },
): CalendarReadyRevisionDto {
  const presentations = presentationsFor(db, revision.id);
  const cover = presentations.find((item) => item.coverArtifactRevisionId)?.coverArtifactRevisionId ?? null;
  return {
    unitRevisionId: revision.id,
    revision: revision.revision,
    thumbnail: cover ? { type: "artifact-revision", id: cover } : null,
    platforms: [...new Set(presentations.map((item) => item.platform))],
    channels: presentations.flatMap((presentation) => db.query<{
      id: string;
      handle: string;
    }, [string, string]>(
      `SELECT id, COALESCE(display_name, username, external_id) AS handle
       FROM social_accounts WHERE workspace_id = ? AND platform = ?
       ORDER BY created_at, id`,
    ).all(workspaceId, presentation.platform).map((account) => ({
      presentationId: presentation.id,
      socialAccountId: account.id,
      platform: presentation.platform,
      account: account.handle,
      settings: JSON.parse(presentation.optionsJson) as JsonValue,
    }))),
  };
}

function presentationsFor(db: Database, revisionId: string): PresentationRow[] {
  return db.query<PresentationRow, [string]>(
    `SELECT id, platform, position,
            cover_artifact_revision_id AS coverArtifactRevisionId,
            options_json AS optionsJson
     FROM unit_presentations WHERE unit_revision_id = ? ORDER BY position, id`,
  ).all(revisionId);
}

function publicationsFor(db: Database, revisionId: string): PublicationRow[] {
  return db.query<PublicationRow, [string]>(
    `SELECT publication.id AS id, publication.presentation_id AS presentationId,
            presentation.platform AS platform,
            publication.social_account_id AS socialAccountId,
            publication.state AS state, publication.scheduled_at AS scheduledAt,
            publication.url AS url, publication.error AS error,
            publication.effective_options_json AS settingsJson,
            publication.created_at AS createdAt,
            account.display_name AS displayName, account.username AS username,
            account.external_id AS externalId,
            COALESCE(account.relink_required, 0) AS relinkRequired,
            publication.revised_from_publication_id AS revisedFromPublicationId
     FROM publications publication
     JOIN unit_presentations presentation ON presentation.id = publication.presentation_id
     LEFT JOIN social_accounts account ON account.id = publication.social_account_id
     WHERE presentation.unit_revision_id = ?
     ORDER BY publication.created_at, publication.id`,
  ).all(revisionId);
}

function currentPublications(rows: PublicationRow[]): PublicationRow[] {
  const latest = new Map<string, PublicationRow>();
  for (const row of rows) {
    const key = `${row.presentationId}\0${row.socialAccountId ?? ""}`;
    const current = latest.get(key);
    if (
      !current
      || row.revisedFromPublicationId === current.id
      || (current.revisedFromPublicationId !== row.id && row.createdAt >= current.createdAt)
    ) latest.set(key, row);
  }
  return [...latest.values()];
}

type PreparedEventMutation = {
  workspaceId: string;
  event: CalendarRow;
  context: QueryContext;
  publications: PublicationRow[];
  timezone: string;
};

function reserveEventMutation(
  input: {
    context: QueryContext;
    eventId: string;
    expectedRowVersion: number;
  },
  action: string,
  next: (event: CalendarRow, publications: PublicationRow[]) => { scheduledAt: number | null; state: "queued" | "scheduled" },
): PreparedEventMutation {
  if (!Number.isInteger(input.expectedRowVersion) || input.expectedRowVersion < 1) {
    throw new Error("Calendar event row version is invalid");
  }
  return withImmediateTransaction((db) => {
    const scope = resolveQueryContext(db, input.context);
    const event = requireEventRow(db, scope.workspaceId, input.eventId);
    if (scope.projectId !== null && event.projectId !== scope.projectId) {
      throw new Error("Calendar event is outside the active scope");
    }
    const publications = currentPublications(publicationsFor(db, event.unitRevisionId));
    const target = next(event, publications);
    const now = Date.now();
    const result = db.prepare(
      `UPDATE calendar_entries
       SET scheduled_at = ?, state = ?, row_version = row_version + 1,
           updated_at = ?
       WHERE id = ? AND workspace_id = ? AND kind = 'entry' AND row_version = ?`,
    ).run(
      target.scheduledAt,
      target.state,
      now,
      event.id,
      scope.workspaceId,
      input.expectedRowVersion,
    );
    if (!result.changes) throw new StoreConflictError("Calendar event row-version conflict");
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: event.projectId,
      entityType: "calendar_entry",
      entityId: event.id,
      action,
      payload: { scheduledAt: target.scheduledAt },
      createdAt: now,
    });
    const refreshed = requireEventRow(db, scope.workspaceId, event.id);
    return {
      workspaceId: scope.workspaceId,
      event: refreshed,
      context: refreshed.projectId === null
        ? { workspaceId: scope.workspaceId }
        : { workspaceId: scope.workspaceId, projectId: refreshed.projectId },
      publications,
      timezone: calendarMetadata(refreshed.metadataJson).timezone ?? "UTC",
    };
  });
}

async function cancelScheduledPublications(
  prepared: PreparedEventMutation,
  adapter?: PublicationProviderAdapter,
): Promise<void> {
  for (const publication of prepared.publications) {
    if (publication.state !== "scheduled" && publication.state !== "submitted") continue;
    await cancelPublication({
      context: prepared.context,
      publicationId: publication.id,
      expectedState: publication.state,
    }, adapter);
  }
}

function eventChannelInputs(
  event: CalendarRow,
  publications: PublicationRow[],
): CalendarChannelInput[] {
  const stored = calendarMetadata(event.metadataJson).channels;
  if (stored?.length) return stored;
  return publications.flatMap((publication) => publication.socialAccountId === null ? [] : [{
    presentationId: publication.presentationId,
    socialAccountId: publication.socialAccountId,
    settings: JSON.parse(publication.settingsJson) as JsonValue,
  }]);
}

function refreshedEvent(prepared: PreparedEventMutation): CalendarEventDto {
  const db = openDomainDb();
  return db.transaction(() => eventDto(
    db,
    requireEventRow(db, prepared.workspaceId, prepared.event.id),
    prepared.timezone,
  ))();
}

function channelDto(row: PublicationRow): CalendarChannelPublicationDto {
  return {
    id: row.id,
    platform: row.platform,
    accountId: row.socialAccountId,
    account: row.displayName ?? row.username ?? row.externalId ?? row.platform,
    status: row.relinkRequired === 1 ? "disconnected" : channelStatus(row.state),
    at: row.scheduledAt,
    postUrl: row.url,
    error: row.error,
    settings: JSON.parse(row.settingsJson) as JsonValue,
  };
}

function channelStatus(state: PublicationState): CalendarChannelStatus {
  if (state === "published") return "published";
  if (state === "scheduled") return "scheduled";
  if (state === "draft" || state === "cancelled") return "draft";
  if (state === "submitting" || state === "submitted") return "uploading";
  return "failed";
}

function metricsFor(db: Database, publications: PublicationRow[]): CalendarMetricsDto | null {
  if (publications.length === 0) return null;
  let views: number | null = null;
  let likes: number | null = null;
  let comments: number | null = null;
  let shares: number | null = null;
  let syncedAt = 0;
  for (const publication of publications) {
    const metric = db.query<{
      asOf: number;
      views: number | null;
      likes: number | null;
      comments: number | null;
      shares: number | null;
    }, [string]>(
      `SELECT as_of AS asOf, views, likes, comments, shares
       FROM metric_snapshots WHERE publication_id = ?
       ORDER BY as_of DESC, created_at DESC, id DESC LIMIT 1`,
    ).get(publication.id);
    if (!metric) continue;
    views = sum(views, metric.views);
    likes = sum(likes, metric.likes);
    comments = sum(comments, metric.comments);
    shares = sum(shares, metric.shares);
    syncedAt = Math.max(syncedAt, metric.asOf);
  }
  return syncedAt === 0 ? null : { views, likes, comments, shares, syncedAt };
}

function latestMetricSync(db: Database, workspaceId: string): number | null {
  return db.query<{ value: number | null }, [string]>(
    `SELECT MAX(metric.as_of) AS value
     FROM metric_snapshots metric
     JOIN publications publication ON publication.id = metric.publication_id
     JOIN unit_presentations presentation ON presentation.id = publication.presentation_id
     JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
     JOIN units unit ON unit.id = revision.unit_id
     WHERE unit.workspace_id = ?`,
  ).get(workspaceId)?.value ?? null;
}

function requireEventRow(db: Database, workspaceId: string, id: string): CalendarRow {
  const row = db.query<CalendarRow, [string, string]>(
    `SELECT ${EVENT_COLUMNS}
     FROM calendar_entries entry
     JOIN unit_revisions pinned ON pinned.id = entry.unit_revision_id
     JOIN units unit ON unit.id = pinned.unit_id
     LEFT JOIN projects project ON project.id = unit.project_id
     LEFT JOIN unit_revisions selected ON selected.id = unit.selected_revision_id
     WHERE entry.workspace_id = ? AND entry.id = ? AND entry.kind = 'entry'`,
  ).get(workspaceId, id);
  if (!row) throw new Error("Calendar event not found");
  return row;
}

function calendarMetadata(value: string | null): CalendarMetadata {
  if (value === null) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as CalendarMetadata
      : {};
  } catch {
    return {};
  }
}

function mergeDraftChannels(
  db: Database,
  published: CalendarChannelPublicationDto[],
  drafts: CalendarChannelInput[],
): CalendarChannelPublicationDto[] {
  const channels = new Map(published.map((channel) => [
    `${channel.accountId ?? ""}\0${channel.platform}`,
    channel,
  ]));
  for (const draft of drafts) {
    const row = db.query<{
      platform: string;
      displayName: string | null;
      username: string | null;
      externalId: string;
      relinkRequired: number;
    }, [string, string]>(
      `SELECT presentation.platform AS platform,
              account.display_name AS displayName, account.username AS username,
              account.external_id AS externalId,
              account.relink_required AS relinkRequired
       FROM unit_presentations presentation
       JOIN social_accounts account ON account.id = ?
       WHERE presentation.id = ?`,
    ).get(draft.socialAccountId, draft.presentationId);
    if (!row) continue;
    const key = `${draft.socialAccountId}\0${row.platform}`;
    if (channels.has(key)) continue;
    channels.set(key, {
      id: null,
      platform: row.platform,
      accountId: draft.socialAccountId,
      account: row.displayName ?? row.username ?? row.externalId,
      status: row.relinkRequired === 1 ? "disconnected" : "draft",
      at: null,
      postUrl: null,
      error: null,
      settings: draft.settings,
    });
  }
  return [...channels.values()];
}

const SETTINGS_KEYS: Record<string, ReadonlySet<string>> = {
  tiktok: new Set([
    "privacy", "comments", "duet", "stitch", "brandedContent", "trendingAudio",
  ]),
  instagram: new Set([
    "publishAs", "shareToFeed", "collaborator", "location",
  ]),
  youtube: new Set([
    "title", "description", "visibility", "madeForKids", "playlist",
  ]),
  x: new Set([
    "replyAudience", "thread", "copyAltText",
  ]),
};

function checkedPlatformSettings(platform: string, value: JsonValue): JsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Calendar platform settings must be an object");
  }
  const allowed = SETTINGS_KEYS[platform];
  if (!allowed) throw new Error(`Calendar platform settings are unsupported: ${platform}`);
  const keys = Object.keys(value);
  const unknown = keys.find((key) => !allowed.has(key));
  if (unknown) throw new Error(`Unknown Calendar platform setting: ${unknown}`);
  const encoded = JSON.stringify(value);
  if (encoded.length > 16_384) throw new Error("Calendar platform settings are too large");
  return JSON.parse(encoded) as JsonValue;
}

function sum(current: number | null, value: number | null): number | null {
  return value === null ? current : (current ?? 0) + value;
}

function title(slug: string): string {
  const value = slug.replace(/[-_]+/gu, " ").trim();
  return value ? value[0]!.toUpperCase() + value.slice(1) : "Untitled unit";
}

function instant(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be an ISO datetime`);
  return parsed;
}

function checkedTimezone(value: string): void {
  if (!value || value.length > 128) throw new Error("Calendar timezone is invalid");
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
  } catch {
    throw new Error("Calendar timezone is invalid");
  }
}
