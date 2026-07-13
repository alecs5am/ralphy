import { z } from "zod";

export const WORKSPACE_CHANNELS = ["telegram", "x", "threads", "devto", "medium"] as const;

const WorkspaceChannelSchema = z
  .object({
    handle: z.string().trim().min(1).optional(),
  })
  .strict();

export const WorkspaceProfileSchema = z
  .object({
    displayName: z.string().default(""),
    bio: z.string().default(""),
    language: z.string().default("English"),
    timezone: z.string().default("UTC"),
  })
  .strict();

export const WorkspaceChannelsSchema = z
  .object({
    telegram: WorkspaceChannelSchema.optional(),
    x: WorkspaceChannelSchema.optional(),
    threads: WorkspaceChannelSchema.optional(),
    devto: WorkspaceChannelSchema.optional(),
    medium: WorkspaceChannelSchema.optional(),
  })
  .strict();

export const WorkspaceManifestSchema = z
  .object({
    version: z.literal(1).default(1),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    name: z.string().trim().min(1),
    created: z.string().optional(),
    description: z.string().default(""),
    profile: WorkspaceProfileSchema.default({}),
    channels: WorkspaceChannelsSchema.default({}),
  })
  .passthrough();

export type WorkspaceManifest = z.infer<typeof WorkspaceManifestSchema>;
export type WorkspaceChannel = (typeof WORKSPACE_CHANNELS)[number];

export function parseWorkspaceManifest(value: unknown): WorkspaceManifest {
  const parsed = WorkspaceManifestSchema.parse(value);
  if (parsed.profile.displayName) return parsed;
  return {
    ...parsed,
    profile: { ...parsed.profile, displayName: parsed.name },
  };
}
