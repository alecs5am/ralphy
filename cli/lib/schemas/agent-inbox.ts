// Studio → agent context-inbox pack schema (#489).
//
// When the user reviews objects in Studio and clicks an action (repair, approve,
// compare, use-as-reference, publish), Studio writes a paired Markdown + JSON
// context pack under the active run or project: `agent-inbox/<ts>-<action>.json`
// (this shape) plus a human-readable `.md` sibling. Claude Code reads the pack
// from chat (or via `ralphy studio inbox`) to learn the EXACT selection, tags,
// note, and requested outcome — removing copy-paste ambiguity.
//
// The pack is CONTEXT, never an instruction to spend money: the agent still
// decides and runs the actual ralphy verbs, behind the usual paid-generation
// gate (AGENTS.md #4 / the production contract). Studio only prepares the
// selection; it never executes production logic.
//
// Storage mirrors the run manifest (file-on-disk under the owning scope, opaque
// path strings, English-only). Schema style mirrors cli/lib/schemas/run.ts.

import { z } from "zod";

/** The user-chosen action a pack carries. NOT auto-executed — agent context. */
export const INBOX_ACTIONS = ["repair", "approve", "compare", "use-as-reference", "publish"] as const;
export const InboxActionSchema = z.enum(INBOX_ACTIONS);
export type InboxAction = z.infer<typeof InboxActionSchema>;

/** Selectable object types — mirrors the #488 annotation target vocabulary. */
export const INBOX_SELECTION_TYPES = [
  "run",
  "project",
  "workflow_node",
  "artifact",
  "eval_finding",
  "unit",
  "destination",
] as const;
export const InboxSelectionTypeSchema = z.enum(INBOX_SELECTION_TYPES);

export const InboxSelectionSchema = z.object({
  /** Object type (artifact / eval_finding / unit / …). */
  type: InboxSelectionTypeSchema,
  /** The object identifier: artifact path / finding id / unit slug / node id / … */
  ref: z.string(),
  /** A workspace-relative path the agent can paste as `@` context (artifacts). */
  path: z.string().optional(),
  /** Controlled-vocab tags carried over from the object's #488 annotation. */
  tags: z.array(z.string()).default([]),
  /** Free-text note carried over from the annotation. */
  note: z.string().optional(),
});
export type InboxSelection = z.infer<typeof InboxSelectionSchema>;

export const InboxPackSchema = z.object({
  /** Schema version — bump when a field becomes required. */
  version: z.literal(1).default(1),
  /** Discriminator so a glob of mixed JSON can be filtered. */
  kind: z.literal("agent-inbox").default("agent-inbox"),
  /** Pack id == the file basename, `<ts>-<action>`. */
  id: z.string(),
  /** The chosen action (agent context, not an auto-run command). */
  action: InboxActionSchema,
  /** ISO timestamp the pack was written. */
  createdAt: z.string().default(() => new Date().toISOString()),
  /** Workspace the pack lives under. */
  workspace: z.string(),
  /** Owning run id, or null when the pack is project-scoped. */
  run: z.string().nullable().default(null),
  /** Owning project id, or null when the pack is run-scoped. */
  project: z.string().nullable().default(null),
  /** The selected objects (≥1). */
  selected: z.array(InboxSelectionSchema).default([]),
  /** Aggregate controlled-vocab tags across the selection. */
  tags: z.array(z.string()).default([]),
  /** A free-text note the user added when sending. */
  note: z.string().default(""),
  /** What the user wants to happen — drives the agent's plan, not auto-run. */
  requestedOutcome: z.string().default(""),
});
export type InboxPack = z.infer<typeof InboxPackSchema>;

/** Pack JSON / Markdown filenames live under `<scope>/agent-inbox/`. */
export const AGENT_INBOX_DIR = "agent-inbox" as const;

/** Parse + validate an unknown value into an InboxPack (throws a ZodError). */
export function parseInboxPack(raw: unknown): InboxPack {
  return InboxPackSchema.parse(raw);
}
