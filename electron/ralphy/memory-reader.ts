import type { RalphyBridgeClient } from "./client";
import type {
  MemoryDetailDto,
  MemoryHealthDto,
  MemoryRecallDto,
  MemoryStatus,
  MemoryTier,
  MemoryType,
  MemoryWriteInput,
} from "./types";

type Request = Pick<RalphyBridgeClient, "request">["request"];

export type MemoryListInput = {
  scope?: "effective" | MemoryTier;
  status?: MemoryStatus;
  query?: string;
  types?: MemoryType[];
  order?: "slug" | "name";
};

export type MemoryMutation =
  | ({ action: "create" } & MemoryWriteInput)
  | ({ action: "revise"; memoryEntryId: string; expectedRevisionId: string } & Omit<MemoryWriteInput, "tier" | "slug">)
  | { action: "approve" | "reject" | "retire"; memoryEntryId: string; expectedRevisionId: string };

const TIERS = new Set(["global", "workspace"]);
const STATUSES = new Set(["active", "proposed", "rejected", "archived"]);
const TYPES = new Set(["model", "craft", "tooling", "client", "style", "user", "legacy"]);
const FLAGS = new Set(["missing-rule", "missing-why", "missing-how-to-apply", "missing-negative-scope"]);
const DETAIL_KEYS = new Set([
  "id", "revisionId", "slug", "version", "revisionNo", "tier", "workspace", "status",
  "name", "description", "type", "filed", "source", "body", "rawBody", "qualityFlags",
  "overridesGlobal",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): value is string {
  return typeof value === "string";
}

function id(value: unknown): value is string {
  return text(value) && value.length > 0 && value.length <= 256;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(text);
}

function body(value: unknown): value is MemoryWriteInput["body"] {
  const input = record(value);
  return !!input && Reflect.ownKeys(input).length === 4
    && text(input.rule) && text(input.why)
    && stringArray(input.howToApply) && stringArray(input.doesNotApplyTo);
}

export function parseMemoryListInput(value: unknown): MemoryListInput {
  if (value === undefined) return {};
  const input = record(value);
  if (!input || Reflect.ownKeys(input).some((key) => !["scope", "status", "query", "types", "order"].includes(String(key)))
    || (input.scope !== undefined && input.scope !== "effective" && !TIERS.has(input.scope as string))
    || (input.status !== undefined && !STATUSES.has(input.status as string))
    || (input.query !== undefined && (!text(input.query) || input.query.length > 1_024))
    || (input.types !== undefined && (!Array.isArray(input.types) || input.types.some((type) => !TYPES.has(type as string))))
    || (input.order !== undefined && input.order !== "slug" && input.order !== "name")) {
    throw new Error("Invalid Memory query");
  }
  return input as MemoryListInput;
}

export function parseMemoryMutation(value: unknown): MemoryMutation {
  const input = record(value);
  if (!input || !["create", "revise", "approve", "reject", "retire"].includes(input.action as string)) {
    throw new Error("Invalid Memory mutation");
  }
  const lifecycle = input.action === "approve" || input.action === "reject" || input.action === "retire";
  if (lifecycle) {
    if (Reflect.ownKeys(input).length !== 3 || !id(input.memoryEntryId) || !id(input.expectedRevisionId)) {
      throw new Error("Invalid Memory mutation");
    }
    return input as MemoryMutation;
  }
  const create = input.action === "create";
  const expectedKeys = create
    ? ["action", "tier", "status", "slug", "name", "description", "type", "body", "source"]
    : ["action", "memoryEntryId", "expectedRevisionId", "status", "name", "description", "type", "body", "source"];
  if (Reflect.ownKeys(input).length !== expectedKeys.length || expectedKeys.some((key) => !Object.hasOwn(input, key))
    || (create && (!TIERS.has(input.tier as string) || !id(input.slug)))
    || (!create && (!id(input.memoryEntryId) || !id(input.expectedRevisionId)))
    || (input.status !== "active" && input.status !== "proposed")
    || !text(input.name) || !text(input.description) || !TYPES.has(input.type as string)
    || input.type === "legacy" || !body(input.body) || !text(input.source)) {
    throw new Error("Invalid Memory mutation");
  }
  return input as MemoryMutation;
}

export function validateMemoryDetail(value: unknown): MemoryDetailDto {
  const detail = record(value);
  const body = record(detail?.body);
  if (!detail || !body
    || Reflect.ownKeys(detail).some((key) => typeof key !== "string" || !DETAIL_KEYS.has(key))
    || !["id", "revisionId", "slug", "version", "revisionNo", "tier", "status", "name",
      "description", "type", "filed", "source", "body", "rawBody", "qualityFlags",
      "overridesGlobal"].every((key) => Object.hasOwn(detail, key))
    || !id(detail.id) || !id(detail.revisionId) || !id(detail.slug)
    || !Number.isSafeInteger(detail.version) || (detail.version as number) < 1
    || detail.revisionNo !== detail.version
    || !TIERS.has(detail.tier as string) || !STATUSES.has(detail.status as string)
    || !TYPES.has(detail.type as string)
    || !text(detail.name) || !text(detail.description) || !text(detail.filed)
    || !text(detail.source) || !text(detail.rawBody) || typeof detail.overridesGlobal !== "boolean"
    || (detail.workspace !== undefined && !id(detail.workspace))
    || (detail.tier === "workspace" && !id(detail.workspace))
    || Reflect.ownKeys(body).length !== 4
    || !text(body.rule) || !text(body.why)
    || !stringArray(body.howToApply) || !stringArray(body.doesNotApplyTo)
    || !Array.isArray(detail.qualityFlags)
    || detail.qualityFlags.some((flag) => !FLAGS.has(flag as string))) {
    throw new Error("Invalid Memory detail");
  }
  return value as MemoryDetailDto;
}

function memoryItems(value: unknown): { items: MemoryDetailDto[] } {
  const page = record(value);
  if (!page || Reflect.ownKeys(page).length !== 1 || !Array.isArray(page.items)) {
    throw new Error("Invalid Memory list");
  }
  return { items: page.items.map(validateMemoryDetail) };
}

export function createMemoryReader({ request }: { request: Request }) {
  const context = (workspaceId: string) => {
    if (!id(workspaceId)) throw new Error("Invalid Workspace identifier");
    return { workspaceId };
  };
  return {
    async list(workspaceId: string, input: MemoryListInput = {}) {
      return memoryItems(await request("memory.list", { context: context(workspaceId), ...parseMemoryListInput(input) }));
    },
    async show(workspaceId: string, memoryEntryId: string) {
      if (!id(memoryEntryId)) throw new Error("Invalid Memory identifier");
      return validateMemoryDetail(await request("memory.show", { context: context(workspaceId), memoryEntryId }));
    },
    async mutate(workspaceId: string, input: MemoryMutation): Promise<MemoryDetailDto | void> {
      input = parseMemoryMutation(input);
      const scoped = context(workspaceId);
      if (input.action === "create") {
        const { action: _, ...params } = input;
        return validateMemoryDetail(await request("memory.create", { context: scoped, ...params }));
      }
      if (input.action === "revise") {
        const { action: _, ...params } = input;
        return validateMemoryDetail(await request("memory.revise", { context: scoped, ...params }));
      }
      const { action, ...params } = input;
      await request(`memory.${action}`, { context: scoped, ...params });
    },
    async history(workspaceId: string, memoryEntryId: string) {
      if (!id(memoryEntryId)) throw new Error("Invalid Memory identifier");
      return memoryItems(await request("memory.history", { context: context(workspaceId), memoryEntryId }));
    },
    async recall(workspaceId: string): Promise<MemoryRecallDto> {
      const value = await request("memory.recall", { context: context(workspaceId), full: true });
      const result = record(value);
      if (!result || !Array.isArray(result.entries) || result.workspaceId !== workspaceId
        || !Number.isSafeInteger(result.count) || !Number.isSafeInteger(result.workspaceCount)
        || !Number.isSafeInteger(result.globalCount) || !stringArray(result.overriddenGlobalSlugs)
        || typeof result.truncated !== "boolean" || !text(result.note)) {
        throw new Error("Invalid Memory recall");
      }
      return { ...result, entries: result.entries.map(validateMemoryDetail) } as MemoryRecallDto;
    },
    async health(workspaceId: string): Promise<MemoryHealthDto> {
      const value = await request("memory.health", { context: context(workspaceId) });
      const result = record(value);
      if (!result || !Number.isSafeInteger(result.scanned) || !Array.isArray(result.findings)) {
        throw new Error("Invalid Memory health");
      }
      return value as MemoryHealthDto;
    },
  };
}
