// Post comment import payload + stored body (#582).
//
// The comments on our OWN posts, read by the agent off a screenshot with its
// own vision, pasted by the owner, or pulled for free from a YouTube video we
// published (`yt-dlp --write-comments`). The payload is validated HERE before
// anything is written; human-format numbers ("1.2K" likes) reuse the #558
// metric parsers.
//
// Storage (no schema migration): one JSON Document per Unit, kind `custom`,
// slug `post-comments-<unit-slug>`, in the Unit's own scope, next to the #558
// decision ledger. Every import appends a revision holding the merged comment
// set, so history is append-only and portable export carries it unchanged.
//
// Privacy: an author handle is never stored. It is hashed with the Workspace
// ID (so the same handle stays linkable inside one account only) and the hash
// is used to count distinct commenters.

import { z } from "zod";
import { MetricParseError, parseCountDetailed, parseSeconds } from "../analytics/metric-parse.js";
import { ANALYTICS_IMPORT_PLATFORMS, type AnalyticsImportPlatform } from "./analytics-import.js";

export const POST_COMMENT_PLATFORMS = ANALYTICS_IMPORT_PLATFORMS;
export type PostCommentPlatform = AnalyticsImportPlatform;

/** `kind` of the stored Document body. */
export const POST_COMMENTS_BODY_KIND = "ralphy.post-comments";
export const POST_COMMENTS_VERSION = 1;

/** Comment classes, in report order. A comment can carry several. */
export const COMMENT_CLASSES = [
  "question",
  "request-more",
  "objection",
  "confusion",
  "praise",
  "delivery-criticism",
  "spam",
] as const;
export type CommentClass = (typeof COMMENT_CLASSES)[number];

export const MAX_COMMENTS_PER_IMPORT = 2000;
export const MAX_STORED_COMMENTS = 10_000;
export const MAX_COMMENT_TEXT = 5000;

/**
 * Accepted spellings → canonical key. yt-dlp, platform exports and agents use
 * different names; unknown keys are still rejected so a typo never silently
 * drops a field.
 */
const COMMENT_KEY_ALIASES: Record<string, string> = {
  handle: "author",
  username: "author",
  user: "author",
  content: "text",
  body: "text",
  comment: "text",
  like_count: "likes",
  likeCount: "likes",
  reply_count: "replies",
  replyCount: "replies",
  parent: "replyTo",
  reply_to: "replyTo",
  parentId: "replyTo",
  posted_at: "postedAt",
  date: "postedAt",
  age: "postedAt",
  is_pinned: "pinned",
  author_is_uploader: "byCreator",
  isCreator: "byCreator",
  by_creator: "byCreator",
  classes: "labels",
  moments: "timestamps",
};

const PAYLOAD_KEY_ALIASES: Record<string, string> = {
  captured_at: "capturedAt",
  post_url: "postUrl",
  url: "postUrl",
};

function countField() {
  return z.union([z.number(), z.string()]).transform((value, ctx) => {
    try {
      return parseCountDetailed(value).value;
    } catch (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: (error as Error).message });
      return z.NEVER;
    }
  });
}

function momentField() {
  return z.union([z.number(), z.string()]).transform((value, ctx) => {
    try {
      return parseSeconds(value);
    } catch (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: (error as Error).message });
      return z.NEVER;
    }
  });
}

export const CommentInputSchema = z
  .object({
    /** The platform's own comment id, when visible (yt-dlp always gives one). */
    id: z.string().trim().min(1).max(256).optional(),
    /** A local label other comments in THIS payload can name in `replyTo`; not stored. */
    ref: z.string().trim().min(1).max(64).optional(),
    /** Handle as shown; hashed on import, never stored. */
    author: z.string().trim().min(1).max(200).optional(),
    text: z.string().trim().min(1).max(MAX_COMMENT_TEXT),
    likes: countField().optional(),
    replies: countField().optional(),
    /** ISO date/datetime, epoch ms, or the relative age the app prints ("2d", "3 weeks ago"). */
    postedAt: z.union([z.number(), z.string().trim().min(1).max(64)]).optional(),
    /** A `ref` / `id` in this payload, or the platform id of the parent comment. */
    replyTo: z.string().trim().min(1).max(256).optional(),
    pinned: z.boolean().optional(),
    /** True for the creator's own comments and replies; they are kept but never classified. */
    byCreator: z.boolean().optional(),
    /** Classes the agent assigned itself; they win over the rules and the LLM. */
    labels: z.array(z.enum(COMMENT_CLASSES)).max(COMMENT_CLASSES.length).optional(),
    /** Moments the comment refers to ("0:12", 12); added to those found in the text. */
    timestamps: z.array(momentField()).max(20).optional(),
  })
  .strict();
export type CommentInput = z.infer<typeof CommentInputSchema>;

export const CommentsPayloadSchema = z
  .object({
    platform: z.enum(POST_COMMENT_PLATFORMS).optional(),
    /** When the comments were read (defaults to import time); relative ages resolve against it. */
    capturedAt: z.union([z.number(), z.string().trim().min(1)]).optional(),
    postUrl: z
      .string()
      .url()
      .max(2048)
      .refine((value) => /^https?:\/\//iu.test(value), "postUrl must be an http(s) link")
      .optional(),
    notes: z.string().max(2000).optional(),
    comments: z.array(CommentInputSchema).min(1).max(MAX_COMMENTS_PER_IMPORT),
  })
  .strict();
export type CommentsPayload = z.infer<typeof CommentsPayloadSchema>;

/** Fold alias keys; a key given twice (alias + canonical) is an error. */
function foldKeys(input: Record<string, unknown>, aliases: Record<string, string>, label: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const canonical = aliases[key] ?? key;
    if (Object.hasOwn(out, canonical)) {
      throw new MetricParseError(`${label}: "${key}" duplicates "${canonical}"; pass it once`);
    }
    out[canonical] = value;
  }
  return out;
}

/**
 * Normalize the accepted payload shapes before validation: a bare array of
 * comments, or `{ comments: [...] }` with optional metadata. Comment keys are
 * alias-folded; `null` values are dropped (yt-dlp prints them for absent
 * fields); a single string label becomes a one-element list.
 */
export function normalizeCommentsPayload(input: unknown): Record<string, unknown> {
  const root = Array.isArray(input) ? { comments: input } : input;
  if (root === null || typeof root !== "object" || Array.isArray(root)) {
    throw new MetricParseError("comments data must be a JSON array of comments or an object with a `comments` array");
  }
  const payload = foldKeys(root as Record<string, unknown>, PAYLOAD_KEY_ALIASES, "payload");
  if (Array.isArray(payload.comments)) {
    payload.comments = payload.comments.map((entry, index) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const folded = foldKeys(
        Object.fromEntries(Object.entries(entry as Record<string, unknown>).filter(([, value]) => value !== null)),
        COMMENT_KEY_ALIASES,
        `comments.${index}`,
      );
      if (typeof folded.labels === "string") folded.labels = [folded.labels];
      if (typeof folded.timestamps === "string" || typeof folded.timestamps === "number") folded.timestamps = [folded.timestamps];
      if (typeof folded.likes === "string" && folded.likes.trim() === "") delete folded.likes;
      return folded;
    });
  }
  return payload;
}

/** Validate a normalized payload. Throws ZodError or MetricParseError. */
export function parseCommentsPayload(input: unknown): CommentsPayload {
  return CommentsPayloadSchema.parse(normalizeCommentsPayload(input));
}

// ─── stored body ─────────────────────────────────────────────────────────────

export const CommentMomentSchema = z.object({
  /** Seconds into the video; null for a position cue ("the ending"). */
  t: z.number().nonnegative().nullable(),
  cue: z.enum(["start", "end"]).nullable(),
  /** The text that matched, or the agent-given value. */
  raw: z.string(),
  source: z.enum(["text", "agent"]),
});
export type CommentMoment = z.infer<typeof CommentMomentSchema>;

export const LABEL_SOURCES = ["rules", "llm", "agent"] as const;
export type LabelSource = (typeof LABEL_SOURCES)[number];

export const StoredCommentSchema = z.object({
  id: z.string(),
  platform: z.enum(POST_COMMENT_PLATFORMS),
  source: z.enum(["screenshot", "paste", "ytdlp", "manual"]),
  platformId: z.string().nullable(),
  authorHash: z.string().nullable(),
  byCreator: z.boolean(),
  pinned: z.boolean(),
  text: z.string(),
  likes: z.number().nullable(),
  replies: z.number().nullable(),
  postedAt: z.number().nullable(),
  postedAtApproximate: z.boolean(),
  replyTo: z.string().nullable(),
  moments: z.array(CommentMomentSchema),
  labels: z.array(z.enum(COMMENT_CLASSES)),
  labelSource: z.enum(LABEL_SOURCES),
  capturedAt: z.number(),
  firstImport: z.string(),
  lastImport: z.string(),
});
export type StoredComment = z.infer<typeof StoredCommentSchema>;

export const CommentImportRecordSchema = z.object({
  importKey: z.string(),
  platform: z.enum(POST_COMMENT_PLATFORMS),
  sources: z.array(z.string()),
  capturedAt: z.number(),
  at: z.string(),
  received: z.number(),
  added: z.number(),
  updated: z.number(),
  unchanged: z.number(),
  labelers: z.array(z.enum(LABEL_SOURCES)),
  screenshots: z.array(
    z.object({ objectId: z.string(), artifactRevisionId: z.string(), fileName: z.string(), bytes: z.number() }),
  ),
  ytdlpUrl: z.string().nullable(),
  postUrl: z.string().nullable(),
  notes: z.string().nullable(),
});
export type CommentImportRecord = z.infer<typeof CommentImportRecordSchema>;

export const PostCommentsBodySchema = z.object({
  kind: z.literal(POST_COMMENTS_BODY_KIND),
  version: z.literal(POST_COMMENTS_VERSION),
  unitId: z.string(),
  unitSlug: z.string(),
  projectId: z.string().nullable(),
  rulesVersion: z.number(),
  comments: z.array(StoredCommentSchema),
  imports: z.array(CommentImportRecordSchema),
  updatedAt: z.string(),
});
export type PostCommentsBody = z.infer<typeof PostCommentsBodySchema>;

export function parsePostCommentsBody(body: unknown): PostCommentsBody | null {
  const parsed = PostCommentsBodySchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}
