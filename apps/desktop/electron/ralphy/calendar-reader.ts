import type { RalphyBridgeClient } from "./client";
import { isAbsolute } from "node:path";
import type { ProjectPreview } from "../media/types";
import type {
  CalendarChannelInput,
  CalendarEventDto,
  CalendarWorkspaceDto,
  JsonValue,
} from "./types";

type Request = Pick<RalphyBridgeClient, "request">["request"];
type Mint = (absolutePath: string, mime: string | null, expectedBytes: number) => Promise<ProjectPreview>;

export type CalendarRangeInput = { from: string; to: string; timezone: string };
export type CalendarMutation =
  | { action: "create"; unitRevisionId: string; at: number | null; draftAt: number; timezone: string; channels: CalendarChannelInput[] }
  | { action: "submit" | "reschedule"; eventId: string; expectedRowVersion: number; at: number }
  | { action: "remove" | "retry"; eventId: string; expectedRowVersion: number };
export type CalendarReconnectInput = { accountId: string; expectedRowVersion: number; credential: string };

const EVENT_STATUSES = new Set(["draft", "scheduled", "uploading", "published", "partial", "failed"]);
const CHANNEL_STATUSES = new Set(["draft", "scheduled", "uploading", "published", "failed", "disconnected"]);
const READY_STATUSES = new Set(["ready", "review", "blocked", "draft"]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function id(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function nullableId(value: unknown): value is string | null {
  return value === null || id(value);
}

function integer(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

function nullableInteger(value: unknown): value is number | null {
  return value === null || integer(value);
}

function json(value: unknown, depth = 0): value is JsonValue {
  if (depth > 16) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 100 && value.every((item) => json(item, depth + 1));
  const input = record(value);
  return !!input && Reflect.ownKeys(input).length <= 100
    && Reflect.ownKeys(input).every((key) => typeof key === "string" && json(input[key], depth + 1));
}

function event(value: unknown): value is CalendarEventDto {
  const input = record(value);
  if (!input || !exact(input, ["id", "rowVersion", "unitId", "unitRevisionId", "title", "projectId", "project", "kind", "thumbnail", "at", "draftAt", "timezone", "pinnedRevision", "unitSelectedRevision", "status", "channels", "metrics"])) return false;
  const thumbnail = record(input.thumbnail);
  const metrics = record(input.metrics);
  return id(input.id) && integer(input.rowVersion, 1) && id(input.unitId) && id(input.unitRevisionId)
    && typeof input.title === "string" && nullableId(input.projectId) && typeof input.project === "string"
    && typeof input.kind === "string" && (input.thumbnail === null || (!!thumbnail && exact(thumbnail, ["type", "id"]) && thumbnail.type === "artifact-revision" && id(thumbnail.id)))
    && nullableInteger(input.at) && nullableInteger(input.draftAt) && typeof input.timezone === "string" && integer(input.pinnedRevision, 1)
    && nullableInteger(input.unitSelectedRevision) && EVENT_STATUSES.has(input.status as string)
    && Array.isArray(input.channels) && input.channels.every((channel) => {
      const item = record(channel);
      return !!item && exact(item, ["id", "platform", "accountId", "account", "status", "at", "postUrl", "error", "settings"])
        && nullableId(item.id) && typeof item.platform === "string" && nullableId(item.accountId)
        && typeof item.account === "string" && CHANNEL_STATUSES.has(item.status as string)
        && nullableInteger(item.at) && (item.postUrl === null || typeof item.postUrl === "string")
        && (item.error === null || typeof item.error === "string") && json(item.settings);
    })
    && (input.metrics === null || (!!metrics && exact(metrics, ["views", "likes", "comments", "shares", "syncedAt"])
      && nullableInteger(metrics.views) && nullableInteger(metrics.likes) && nullableInteger(metrics.comments)
      && nullableInteger(metrics.shares) && integer(metrics.syncedAt)));
}

export function validateCalendarEvent(value: unknown): CalendarEventDto {
  if (!event(value)) throw new Error("Invalid Calendar event");
  return value;
}

export function validateCalendarWorkspace(value: unknown): CalendarWorkspaceDto {
  const input = record(value);
  const postiz = record(input?.postiz);
  if (!input || !exact(input, ["timezone", "postiz", "events", "readyUnits", "projects", "accounts"])
    || typeof input.timezone !== "string" || !postiz || !exact(postiz, ["available", "lastSyncedAt", "error"])
    || typeof postiz.available !== "boolean" || !nullableInteger(postiz.lastSyncedAt)
    || (postiz.error !== null && typeof postiz.error !== "string") || !Array.isArray(input.events) || !input.events.every(event)
    || !Array.isArray(input.readyUnits) || !input.readyUnits.every((unit) => {
      const item = record(unit);
      const thumbnail = record(item?.thumbnail);
      const validChannel = (channel: unknown) => {
        const value = record(channel); return !!value && exact(value, ["presentationId", "socialAccountId", "platform", "account", "settings"])
          && id(value.presentationId) && id(value.socialAccountId) && typeof value.platform === "string"
          && typeof value.account === "string" && json(value.settings);
      };
      return !!item && exact(item, ["unitId", "unitRevisionId", "title", "projectId", "project", "revision", "kind", "thumbnail", "platforms", "channels", "revisions", "readiness", "note"])
        && id(item.unitId) && nullableId(item.unitRevisionId) && typeof item.title === "string" && nullableId(item.projectId)
        && typeof item.project === "string" && nullableInteger(item.revision) && typeof item.kind === "string"
        && (item.thumbnail === null || (!!thumbnail && exact(thumbnail, ["type", "id"]) && thumbnail.type === "artifact-revision" && id(thumbnail.id)))
        && Array.isArray(item.platforms) && item.platforms.every((platform) => typeof platform === "string")
        && Array.isArray(item.channels) && item.channels.every(validChannel)
        && Array.isArray(item.revisions) && item.revisions.every((revision) => {
          const value = record(revision); const revisionThumbnail = record(value?.thumbnail);
          return !!value && exact(value, ["unitRevisionId", "revision", "thumbnail", "platforms", "channels"])
            && id(value.unitRevisionId) && integer(value.revision, 1)
            && (value.thumbnail === null || (!!revisionThumbnail && exact(revisionThumbnail, ["type", "id"])
              && revisionThumbnail.type === "artifact-revision" && id(revisionThumbnail.id)))
            && Array.isArray(value.platforms) && value.platforms.every((platform) => typeof platform === "string")
            && Array.isArray(value.channels) && value.channels.every(validChannel);
        })
        && READY_STATUSES.has(item.readiness as string) && (item.note === null || typeof item.note === "string");
    })
    || !Array.isArray(input.projects) || !input.projects.every((project) => {
      const item = record(project); return !!item && exact(item, ["id", "name"]) && id(item.id) && typeof item.name === "string";
    })
    || !Array.isArray(input.accounts) || !input.accounts.every((account) => {
      const item = record(account); return !!item && exact(item, ["id", "platform", "handle", "disconnected", "rowVersion"])
        && id(item.id) && typeof item.platform === "string" && typeof item.handle === "string" && typeof item.disconnected === "boolean" && integer(item.rowVersion, 1);
    })) throw new Error("Invalid Calendar workspace");
  return value as CalendarWorkspaceDto;
}

function parseRange(value: CalendarRangeInput): CalendarRangeInput {
  const input = record(value);
  if (!input || !exact(input, ["from", "to", "timezone"]) || typeof input.from !== "string" || !Number.isFinite(Date.parse(input.from))
    || typeof input.to !== "string" || !Number.isFinite(Date.parse(input.to)) || typeof input.timezone !== "string" || input.timezone.length > 100) {
    throw new Error("Invalid Calendar range");
  }
  try { new Intl.DateTimeFormat("en", { timeZone: input.timezone }); } catch { throw new Error("Invalid Calendar range"); }
  return value;
}

function parseMutation(value: CalendarMutation): CalendarMutation {
  const input = record(value);
  if (!input || !["create", "submit", "reschedule", "remove", "retry"].includes(input.action as string)) throw new Error("Invalid Calendar mutation");
  if (input.action === "create") {
    if (!exact(input, ["action", "unitRevisionId", "at", "draftAt", "timezone", "channels"]) || !id(input.unitRevisionId)
      || !nullableInteger(input.at) || !integer(input.draftAt) || typeof input.timezone !== "string" || !Array.isArray(input.channels) || input.channels.length < 1 || input.channels.length > 20
      || !input.channels.every((channel) => {
        const item = record(channel); return !!item && exact(item, ["presentationId", "socialAccountId", "settings"])
          && id(item.presentationId) && id(item.socialAccountId) && json(item.settings);
      })) throw new Error("Invalid Calendar mutation");
    return value;
  }
  const timed = input.action === "submit" || input.action === "reschedule";
  if (!exact(input, timed ? ["action", "eventId", "expectedRowVersion", "at"] : ["action", "eventId", "expectedRowVersion"])
    || !id(input.eventId) || !integer(input.expectedRowVersion, 1) || (timed && !integer(input.at))) throw new Error("Invalid Calendar mutation");
  return value;
}

export function createCalendarReader({ request, mint }: { request: Request; mint?: Mint }) {
  const context = (workspaceId: string, projectId?: string | null) => {
    if (!id(workspaceId)) throw new Error("Invalid Workspace identifier");
    if (projectId !== undefined && projectId !== null && !id(projectId)) throw new Error("Invalid Project identifier");
    return projectId ? { workspaceId, projectId } : { workspaceId };
  };
  return {
    async load(workspaceId: string, input: CalendarRangeInput) {
      return validateCalendarWorkspace(await request("calendar.overview", { context: context(workspaceId), ...parseRange(input) }));
    },
    async mutate(workspaceId: string, value: CalendarMutation) {
      const input = parseMutation(value);
      const { action, ...params } = input;
      return validateCalendarEvent(await request(`calendar.${action}`, { context: context(workspaceId), ...params } as never));
    },
    async reconnect(workspaceId: string, value: CalendarReconnectInput) {
      const input = record(value);
      if (!input || !exact(input, ["accountId", "expectedRowVersion", "credential"]) || !id(input.accountId)
        || !integer(input.expectedRowVersion, 1) || typeof input.credential !== "string" || input.credential.trim().length < 8 || input.credential.length > 4096) {
        throw new Error("Invalid Calendar reconnect request");
      }
      await request("agent.credential.set", {
        context: context(workspaceId), provider: "postiz", value: input.credential,
        accountId: input.accountId, expectedRowVersion: input.expectedRowVersion,
      });
    },
    async resolvePreview(workspaceId: string, projectId: string | null, ref: { type: "artifact-revision"; id: string }) {
      const scoped = context(workspaceId, projectId);
      if (!ref || ref.type !== "artifact-revision" || !id(ref.id)) throw new Error("Invalid Calendar preview");
      const revision = await request("media.revision.show", { context: scoped, revisionId: ref.id });
      if (!revision || revision.id !== ref.id || !id(revision.objectId)) throw new Error("Invalid Artifact revision");
      if (!mint) throw new Error("Calendar previews are unavailable");
      const locator = await request("locator.resolve", {
        context: scoped,
        target: { type: "object", id: revision.objectId },
        purpose: "preview",
      });
      if (!locator || typeof locator.absolutePath !== "string" || !isAbsolute(locator.absolutePath)
        || !Number.isSafeInteger(locator.bytes) || locator.bytes < 0
        || (locator.mime !== null && typeof locator.mime !== "string")) throw new Error("Invalid preview locator");
      return mint(locator.absolutePath, locator.mime, locator.bytes);
    },
  };
}
