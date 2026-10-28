// `ralphy analytics comments import` (#582) — comments on our OWN posts into
// the domain store, per Unit.
//
// FREE FIRST: the agent reads comment screenshots with its own vision and
// passes the JSON with --data, the owner pastes text (one comment per line), or
// a YouTube video WE posted is pulled with `yt-dlp --write-comments`
// (`--from-ytdlp <url>`, passed explicitly, single video only).
//
// CLASSIFY: agent-given labels win; otherwise deterministic rules
// (cli/lib/analytics/comment-rules.ts); `--llm` optionally labels what the
// rules left unlabeled through callLLM() — never on a dry-run.
//
// CONFIRM BEFORE WRITE: without `write: true` nothing is written. The preview
// shows the parsed comments, class counts, moments, and the merge plan.
//
// WHAT A WRITE DOES (append-only, store APIs only):
//   1. Screenshots → durable Objects (copied, never moved), each referenced by
//      an image Artifact revision; the same image bytes reuse their Artifact.
//   2. One revision of the Unit's `post-comments-<unit-slug>` JSON Document
//      holding the merged comment set and the import record. Re-running the
//      same input replays (no new revision).
// Nothing is posted, replied to, pinned, or deleted on any platform.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import { DomainError } from "../errors/domain.js";
import { callLLM } from "../providers/llm.js";
import { addArtifactRevision, createArtifact, resolveLatestArtifactObject } from "../store/artifacts.js";
import { createDocument, reviseDocument } from "../store/documents.js";
import { ingestObject } from "../store/objects.js";
import {
  findUnitCommentsDocument,
  POST_COMMENTS_DOCUMENT_KIND,
  postCommentsSlug,
} from "../store/outcomes.js";
import type { QueryContext } from "../store/scope-context.js";
import { StoreConflictError } from "../store/types.js";
import { listPublications, listUnitPresentations, listUnitRevisions } from "../store/units.js";
import { allPages, resolveUnitReference, unitContext } from "../unit-revision.js";
import {
  COMMENT_CLASSES,
  MAX_COMMENTS_PER_IMPORT,
  MAX_COMMENT_TEXT,
  MAX_STORED_COMMENTS,
  parseCommentsPayload,
  parsePostCommentsBody,
  POST_COMMENT_PLATFORMS,
  POST_COMMENTS_BODY_KIND,
  POST_COMMENTS_VERSION,
  type CommentClass,
  type CommentImportRecord,
  type CommentInput,
  type CommentMoment,
  type LabelSource,
  type PostCommentPlatform,
  type PostCommentsBody,
  type StoredComment,
} from "../schemas/post-comments.js";
import {
  classifyComment,
  clip,
  COMMENT_RULES_VERSION,
  extractMoments,
  formatMoment,
  momentLabel,
  normalizeCommentText,
} from "./comment-rules.js";
import { DEFAULT_YTDLP_MAX_COMMENTS, fetchYoutubeComments, youtubeVideoId, type CommentYtdlpRunner } from "./comment-ytdlp.js";
import { checkScreenshot, type LLMImpl } from "./import.js";
import { MetricParseError, parseInstant } from "./metric-parse.js";

/** Per MODELS.md "LLM" table: the cheap model, used only with --llm. */
export const COMMENT_CLASSIFY_MODEL = "google/gemini-2.5-flash";
const LLM_BATCH = 100;
const LLM_MAX_COMMENTS = 500;

export type CommentSource = StoredComment["source"];

export function isCommentPlatform(value: unknown): value is PostCommentPlatform {
  return typeof value === "string" && (POST_COMMENT_PLATFORMS as readonly string[]).includes(value);
}

// ─── reading --data ──────────────────────────────────────────────────────────

/**
 * `--data` accepts inline JSON, a JSON file, or pasted text (inline or a file).
 * Anything starting with `{` or `[` must be valid JSON — a broken JSON file is
 * an error, never silently read as pasted lines.
 */
export function readCommentsData(value: string): { data: unknown; format: "json" | "paste" } {
  const trimmed = value.trim();
  let text = trimmed;
  let label = "--data";
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    const file = path.resolve(trimmed);
    if (!trimmed.includes("\n") && fs.existsSync(file) && fs.statSync(file).isFile()) {
      text = fs.readFileSync(file, "utf8").trim();
      label = file;
    }
  }
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      return { data: JSON.parse(text) as unknown, format: "json" };
    } catch (error) {
      throw new DomainError("E_INPUT_INVALID", undefined, {
        field: "data",
        detail: `${label} is not valid JSON: ${(error as Error).message}`.slice(0, 500),
      });
    }
  }
  if (label === "--data" && !text.includes("\n") && /\.(?:json|txt|md)$/iu.test(text)) {
    throw new DomainError("E_FILE_UNREADABLE", undefined, { path: path.resolve(text) });
  }
  return { data: parsePastedComments(text), format: "paste" };
}

/**
 * Pasted text → comment entries: one comment per non-empty line; list bullets
 * are stripped; a leading `@handle:` or `@handle -` is taken as the author.
 */
export function parsePastedComments(text: string): Array<{ author?: string; text: string }> {
  const out: Array<{ author?: string; text: string }> = [];
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim().replace(/^(?:[-*•]\s+|\d{1,4}[.)]\s+)/u, "").trim();
    if (!line) continue;
    const handle = /^@([A-Za-z0-9._]{1,40})\s*(?::|\s-\s)\s*(.+)$/u.exec(line);
    out.push(handle ? { author: handle[1]!, text: handle[2]!.trim() } : { text: line });
  }
  if (out.length === 0) {
    throw new DomainError("E_INPUT_INVALID", undefined, { field: "data", detail: "no comments found in the pasted text" });
  }
  return out;
}

// ─── normalization ───────────────────────────────────────────────────────────

/** Author handle → a short hash salted with the Workspace ID; the handle itself is never stored. */
export function hashAuthor(workspaceId: string, platform: string, handle: string): string {
  const normalized = handle.trim().replace(/^@/u, "").toLowerCase();
  return `a_${createHash("sha256").update(`${workspaceId}\u0000${platform}\u0000${normalized}`).digest("hex").slice(0, 16)}`;
}

const RELATIVE_UNITS: Record<string, number> = {
  s: 1_000, sec: 1_000, secs: 1_000, second: 1_000, seconds: 1_000,
  m: 60_000, min: 60_000, mins: 60_000, minute: 60_000, minutes: 60_000,
  h: 3_600_000, hr: 3_600_000, hrs: 3_600_000, hour: 3_600_000, hours: 3_600_000,
  d: 86_400_000, day: 86_400_000, days: 86_400_000,
  w: 604_800_000, wk: 604_800_000, wks: 604_800_000, week: 604_800_000, weeks: 604_800_000,
  mo: 2_592_000_000, mos: 2_592_000_000, month: 2_592_000_000, months: 2_592_000_000,
  y: 31_536_000_000, yr: 31_536_000_000, yrs: 31_536_000_000, year: 31_536_000_000, years: 31_536_000_000,
};

/**
 * A comment's post time: epoch ms, ISO date / datetime, or the relative age the
 * app prints ("2d", "5h ago", "3 weeks ago", "yesterday", "just now"), resolved
 * against the capture time and flagged approximate.
 */
export function parseCommentTime(value: number | string, capturedAt: number): { at: number; approximate: boolean } {
  if (typeof value === "number") return { at: parseInstant(value), approximate: false };
  const raw = value.trim().toLowerCase();
  if (raw === "just now" || raw === "now" || raw === "today") return { at: capturedAt, approximate: true };
  if (raw === "yesterday") return { at: capturedAt - 86_400_000, approximate: true };
  const relative = /^(\d+(?:\.\d+)?)\s*([a-z]+)(?:\s+ago)?$/u.exec(raw);
  if (relative && RELATIVE_UNITS[relative[2]!] !== undefined) {
    return { at: Math.round(capturedAt - Number(relative[1]) * RELATIVE_UNITS[relative[2]!]!), approximate: true };
  }
  return { at: parseInstant(value), approximate: false };
}

export interface NormalizedComment extends StoredComment {
  /** Rule ids that matched (preview only; recomputed by the report). */
  rules: string[];
}

interface SourcedInput {
  input: CommentInput;
  source: CommentSource;
}

/** Build stored-shape comments with stable ids, author hashes, moments, and labels. */
export function normalizeComments(input: {
  workspaceId: string;
  platform: PostCommentPlatform;
  entries: SourcedInput[];
  capturedAt: number;
  importKey: string;
}): { comments: NormalizedComment[]; warnings: string[] } {
  const warnings: string[] = [];
  const occurrences = new Map<string, number>();
  const byLocalRef = new Map<string, string>();
  const built: Array<{ comment: NormalizedComment; replyTo: string | undefined }> = [];
  const issues: string[] = [];
  for (const [index, { input: entry, source }] of input.entries.entries()) {
    const authorHash = entry.author ? hashAuthor(input.workspaceId, input.platform, entry.author) : null;
    const normalizedText = normalizeCommentText(entry.text);
    let key: string;
    if (entry.id) key = `${input.platform}:id:${entry.id}`;
    else if (authorHash) key = `${input.platform}:a:${authorHash}:${normalizedText}`;
    else {
      const seen = occurrences.get(normalizedText) ?? 0;
      occurrences.set(normalizedText, seen + 1);
      key = `${input.platform}:t:${normalizedText}#${seen}`;
    }
    const id = stableCommentId(key);
    let postedAt: { at: number; approximate: boolean } | null = null;
    if (entry.postedAt !== undefined) {
      try {
        postedAt = parseCommentTime(entry.postedAt, input.capturedAt);
      } catch (error) {
        issues.push(`comments.${index}.postedAt: ${(error as Error).message}`);
      }
    }
    const moments: CommentMoment[] = extractMoments(entry.text);
    for (const seconds of entry.timestamps ?? []) {
      if (!moments.some((moment) => moment.t !== null && Math.abs(moment.t - seconds) < 0.5)) {
        moments.push({ t: seconds, cue: null, raw: formatMoment(seconds), source: "agent" });
      }
    }
    const byCreator = entry.byCreator === true;
    let labels: CommentClass[] = [];
    let labelSource: LabelSource = "rules";
    let rules: string[] = [];
    if (entry.labels && entry.labels.length > 0) {
      labels = COMMENT_CLASSES.filter((label) => entry.labels!.includes(label));
      labelSource = "agent";
    } else if (!byCreator) {
      const classified = classifyComment(entry.text, { hasMoment: moments.length > 0 });
      labels = classified.labels;
      rules = classified.rules;
    }
    const comment: NormalizedComment = {
      id,
      platform: input.platform,
      source,
      platformId: entry.id ?? null,
      authorHash,
      byCreator,
      pinned: entry.pinned === true,
      text: entry.text.slice(0, MAX_COMMENT_TEXT),
      likes: entry.likes ?? null,
      replies: entry.replies ?? null,
      postedAt: postedAt?.at ?? null,
      postedAtApproximate: postedAt?.approximate ?? false,
      replyTo: null,
      moments,
      labels,
      labelSource,
      capturedAt: input.capturedAt,
      firstImport: input.importKey,
      lastImport: input.importKey,
      rules,
    };
    if (entry.ref) byLocalRef.set(entry.ref, id);
    if (entry.id) byLocalRef.set(entry.id, id);
    built.push({ comment, replyTo: entry.replyTo });
  }
  if (issues.length > 0) {
    throw new DomainError("E_VALIDATION_FAILED", undefined, { target: "comments data", detail: issues.join("; ").slice(0, 1800) });
  }
  const byId = new Map<string, NormalizedComment>();
  for (const { comment, replyTo } of built) {
    if (replyTo) comment.replyTo = byLocalRef.get(replyTo) ?? stableCommentId(`${input.platform}:id:${replyTo}`);
    if (byId.has(comment.id)) warnings.push(`comment ${comment.id} appears twice in this import; the last reading is kept`);
    byId.set(comment.id, comment);
  }
  return { comments: [...byId.values()], warnings };
}

function stableCommentId(key: string): string {
  return `c_${createHash("sha256").update(key).digest("hex").slice(0, 12)}`;
}

// ─── merge ───────────────────────────────────────────────────────────────────

const LABEL_RANK: Record<LabelSource, number> = { rules: 0, llm: 1, agent: 2 };

/**
 * Merge an import into the stored set: new ids are appended; a known id takes
 * the newer reading's counts and text, the higher-ranked labels (agent > llm >
 * rules), and the union of moments. Order is stable (stored first).
 */
export function mergeComments(stored: StoredComment[], incoming: StoredComment[]) {
  const out = stored.map((comment) => ({ ...comment }));
  const index = new Map(out.map((comment, position) => [comment.id, position]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const next of incoming) {
    const position = index.get(next.id);
    if (position === undefined) {
      index.set(next.id, out.length);
      out.push({ ...next });
      added += 1;
      continue;
    }
    const prior = out[position]!;
    const newer = next.capturedAt >= prior.capturedAt;
    const merged: StoredComment = {
      ...prior,
      text: newer ? next.text : prior.text,
      likes: newer ? next.likes ?? prior.likes : prior.likes ?? next.likes,
      replies: newer ? next.replies ?? prior.replies : prior.replies ?? next.replies,
      postedAt: prior.postedAt !== null && !prior.postedAtApproximate ? prior.postedAt : next.postedAt ?? prior.postedAt,
      postedAtApproximate: prior.postedAt !== null && !prior.postedAtApproximate ? false : next.postedAt !== null ? next.postedAtApproximate : prior.postedAtApproximate,
      replyTo: prior.replyTo ?? next.replyTo,
      byCreator: prior.byCreator || next.byCreator,
      pinned: newer ? next.pinned : prior.pinned,
      moments: unionMoments(prior.moments, next.moments),
      ...(LABEL_RANK[next.labelSource] >= LABEL_RANK[prior.labelSource]
        ? { labels: next.labels, labelSource: next.labelSource }
        : {}),
      capturedAt: Math.max(prior.capturedAt, next.capturedAt),
      lastImport: next.lastImport,
    };
    const strip = (comment: StoredComment) => JSON.stringify({ ...comment, lastImport: "", capturedAt: 0 });
    const changed = strip(merged) !== strip(prior);
    out[position] = changed ? merged : prior;
    if (changed) updated += 1;
    else unchanged += 1;
  }
  return { comments: out, added, updated, unchanged };
}

function unionMoments(left: CommentMoment[], right: CommentMoment[]): CommentMoment[] {
  const out = [...left];
  for (const moment of right) {
    if (!out.some((entry) => entry.t === moment.t && entry.cue === moment.cue)) out.push(moment);
  }
  return out;
}

// ─── optional LLM labels (--llm) ─────────────────────────────────────────────

const CLASSIFY_PROMPT = `You label viewer comments on a short video the creator posted.
Classes (zero or more per comment): ${COMMENT_CLASSES.join(", ")}.
- question: asks something. request-more: asks for a part 2, a follow-up, or a video on a topic.
- objection: disputes a claim, the value, or the title/cover (clickbait). confusion: did not understand something.
- praise: compliments. delivery-criticism: pace, audio, on-screen text, visuals, synthetic voice/look.
- spam: links, self-promotion, scams (spam excludes every other class).
Return ONLY JSON: {"labels": {"<comment id>": ["class", ...]}}. Use [] when nothing fits.`;

/**
 * Label comments through one callLLM() pass per batch of 100 (max 500 per
 * import). Unknown classes are dropped; a batch that does not return JSON is
 * reported as a warning and its comments keep their rule labels.
 */
export async function classifyWithLLM(input: {
  comments: Array<{ id: string; text: string }>;
  llmImpl?: LLMImpl;
  projectId?: string | null;
}): Promise<{ labels: Map<string, CommentClass[]>; calls: number; warnings: string[] }> {
  const llm = input.llmImpl ?? callLLM;
  const labels = new Map<string, CommentClass[]>();
  const warnings: string[] = [];
  const queue = input.comments.slice(0, LLM_MAX_COMMENTS);
  if (input.comments.length > LLM_MAX_COMMENTS) {
    warnings.push(`--llm labels at most ${LLM_MAX_COMMENTS} comments per import; ${input.comments.length - LLM_MAX_COMMENTS} kept their rule labels`);
  }
  let calls = 0;
  for (let start = 0; start < queue.length; start += LLM_BATCH) {
    const batch = queue.slice(start, start + LLM_BATCH);
    calls += 1;
    const result = await llm({
      model: COMMENT_CLASSIFY_MODEL,
      jsonMode: true,
      temperature: 0,
      messages: [
        { role: "system", content: CLASSIFY_PROMPT },
        { role: "user", content: JSON.stringify(batch.map((comment) => ({ id: comment.id, text: comment.text.slice(0, 1000) }))) },
      ],
      endpoint: "analytics-comments-classify",
      ...(input.projectId ? { projectId: input.projectId } : {}),
    });
    const text = result.text.trim().replace(/^```(?:json)?\s*/u, "").replace(/```\s*$/u, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      warnings.push(`LLM batch ${calls} did not return JSON; its comments keep their rule labels`);
      continue;
    }
    const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    const map = record.labels && typeof record.labels === "object" && !Array.isArray(record.labels)
      ? (record.labels as Record<string, unknown>)
      : record;
    for (const comment of batch) {
      const value = map[comment.id];
      if (!Array.isArray(value)) continue;
      const classes = COMMENT_CLASSES.filter((label) => value.includes(label));
      labels.set(comment.id, classes.includes("spam") ? ["spam"] : classes);
    }
  }
  return { labels, calls, warnings };
}

// ─── ownership of a yt-dlp URL ───────────────────────────────────────────────

/** Post URLs recorded on the Unit's Publications for one platform. */
export function unitPublicationUrls(context: QueryContext, unitId: string, platform: string): string[] {
  const urls = new Set<string>();
  const revisions = allPages((after) => listUnitRevisions({ context, unitId, order: "newest", after, limit: 100 }));
  for (const revision of revisions) {
    const presentations = allPages((after) => listUnitPresentations({ context, revisionId: revision.id, after, limit: 100 }))
      .filter((presentation) => presentation.platform === platform);
    for (const presentation of presentations) {
      for (const publication of allPages((after) => listPublications({ context, presentationId: presentation.id, after, limit: 100 }))) {
        if (publication.url) urls.add(publication.url);
      }
    }
  }
  return [...urls];
}

// ─── import ──────────────────────────────────────────────────────────────────

export interface CommentImportRequest {
  context: QueryContext;
  ref: string;
  platform: PostCommentPlatform;
  /** Parsed `--data` (a JSON payload or pasted entries). */
  data?: unknown;
  dataFormat?: "json" | "paste";
  screenshots?: string[];
  ytdlp?: { url: string; maxComments?: number; runner?: CommentYtdlpRunner };
  llm?: boolean;
  llmImpl?: LLMImpl;
  /** False = preview only (the default); true = write. */
  write: boolean;
  now?: number;
}

export async function importComments(request: CommentImportRequest) {
  if (request.data === undefined && !request.ytdlp) {
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "data",
      detail: "pass --data <json|file|pasted text> or --from-ytdlp <our youtube video url>",
    });
  }
  const location = resolveUnitReference(request.context, request.ref);
  const context = unitContext(request.context, location);
  const now = request.now ?? Date.now();
  const warnings: string[] = [];
  const screenshots = (request.screenshots ?? []).map((file) => {
    const shot = checkScreenshot(file);
    return { ...shot, sha256: createHash("sha256").update(fs.readFileSync(shot.file)).digest("hex") };
  });

  // 1. Payload from --data.
  const entries: SourcedInput[] = [];
  let capturedAt = now;
  let givenCapturedAt: number | null = null;
  let postUrl: string | null = null;
  let notes: string | null = null;
  if (request.data !== undefined) {
    const payload = validatePayload(request.data, request.platform);
    if (payload.capturedAt !== undefined) {
      try {
        capturedAt = parseInstant(payload.capturedAt);
        givenCapturedAt = capturedAt;
      } catch (error) {
        throw new DomainError("E_VALIDATION_FAILED", undefined, { target: "comments data", detail: `capturedAt: ${(error as Error).message}` });
      }
    }
    postUrl = payload.postUrl ?? null;
    notes = payload.notes ?? null;
    const source: CommentSource = request.dataFormat === "paste" ? "paste" : screenshots.length > 0 ? "screenshot" : "manual";
    for (const comment of payload.comments) entries.push({ input: comment, source });
  } else if (screenshots.length > 0) {
    warnings.push("screenshots are kept as provenance only; the comments themselves come from --from-ytdlp");
  }

  // 2. Free YouTube pull for our own video.
  let ytdlp: { url: string; videoId: string; ownership: "verified" | "unverified"; fetched: number; commentCount: number | null } | null = null;
  if (request.ytdlp) {
    if (request.platform !== "youtube") {
      throw new DomainError("E_INPUT_INVALID", undefined, { field: "from-ytdlp", detail: "--from-ytdlp pulls YouTube comments; pass --platform youtube" });
    }
    const videoId = youtubeVideoId(request.ytdlp.url);
    if (!videoId) {
      throw new DomainError("E_INPUT_INVALID", undefined, {
        field: "from-ytdlp",
        detail: "expected one YouTube video URL (watch?v=, youtu.be/, or /shorts/); playlists and channels are refused",
      });
    }
    const recorded = unitPublicationUrls(context, location.unitId, "youtube")
      .map((url) => youtubeVideoId(url))
      .filter((id): id is string => id !== null);
    if (recorded.length > 0 && !recorded.includes(videoId)) {
      throw new DomainError("E_INPUT_INVALID", undefined, {
        field: "from-ytdlp",
        detail: `video ${videoId} is not this Unit's YouTube post (recorded: ${recorded.join(", ")}); comments are pulled only for our own posts`,
      });
    }
    const maxComments = request.ytdlp.maxComments ?? DEFAULT_YTDLP_MAX_COMMENTS;
    if (!Number.isInteger(maxComments) || maxComments < 1 || maxComments > MAX_COMMENTS_PER_IMPORT) {
      throw new DomainError("E_INPUT_INVALID", undefined, { field: "max-comments", detail: `expected 1..${MAX_COMMENTS_PER_IMPORT}` });
    }
    const pulled = await fetchYoutubeComments({ url: request.ytdlp.url, maxComments, ...(request.ytdlp.runner ? { runner: request.ytdlp.runner } : {}) });
    const converted = pulled.comments.slice(0, MAX_COMMENTS_PER_IMPORT).map((entry) => ({
      ...entry,
      text: typeof entry.text === "string" ? entry.text.slice(0, MAX_COMMENT_TEXT) : entry.text,
    }));
    if (converted.length > 0) {
      const payload = validatePayload({ comments: converted }, "youtube");
      for (const comment of payload.comments) entries.push({ input: comment, source: "ytdlp" });
    } else {
      warnings.push("yt-dlp returned no comments for this video");
    }
    ytdlp = {
      url: pulled.url,
      videoId,
      ownership: recorded.length > 0 ? "verified" : "unverified",
      fetched: converted.length,
      commentCount: pulled.commentCount,
    };
    if (recorded.length === 0) {
      warnings.push("no YouTube Publication URL is recorded on this Unit, so ownership was not verified; the URL was passed explicitly");
    }
    postUrl ??= pulled.url;
  }
  if (entries.length > MAX_COMMENTS_PER_IMPORT) {
    throw new DomainError("E_INPUT_INVALID", undefined, { field: "data", detail: `at most ${MAX_COMMENTS_PER_IMPORT} comments per import (got ${entries.length})` });
  }

  // 3. Import key from the input alone (a defaulted capture time is not
  //    input): the same input replays instead of appending a revision.
  const importKey = createHash("sha256")
    .update(JSON.stringify({
      unitId: location.unitId,
      platform: request.platform,
      llm: Boolean(request.llm),
      capturedAt: givenCapturedAt,
      entries: entries.map((entry) => ({ source: entry.source, input: sortedJson(entry.input) })),
      screenshots: screenshots.map((shot) => shot.sha256),
    }))
    .digest("hex")
    .slice(0, 24);

  // 4. Normalize + rule labels.
  const normalized = normalizeComments({
    workspaceId: location.workspaceId,
    platform: request.platform,
    entries,
    capturedAt,
    importKey,
  });
  warnings.push(...normalized.warnings);
  const comments = normalized.comments;

  // 5. Stored state.
  const document = findUnitCommentsDocument({ context, unitId: location.unitId });
  const stored = document?.body ? parsePostCommentsBody(document.body) : null;
  if (document?.body && !stored) {
    throw new DomainError("E_VALIDATION_FAILED", undefined, {
      target: `post comments of ${location.slug}`,
      detail: "the stored comment Document does not match the ralphy.post-comments v1 shape",
    });
  }
  const replayed = stored?.imports.some((entry) => entry.importKey === importKey) ?? false;

  // 6. LLM labels (write only, never on a dry-run or a replay).
  const llmCandidates = comments.filter((comment) => comment.labelSource === "rules" && comment.labels.length === 0 && !comment.byCreator);
  let llmSummary: { requested: boolean; model: string | null; candidates: number; classified: number | null; calls: number } = {
    requested: Boolean(request.llm),
    model: request.llm ? COMMENT_CLASSIFY_MODEL : null,
    candidates: request.llm ? Math.min(llmCandidates.length, LLM_MAX_COMMENTS) : 0,
    classified: null,
    calls: 0,
  };
  if (request.llm && request.write && !replayed && llmCandidates.length > 0) {
    const result = await classifyWithLLM({
      comments: llmCandidates.map((comment) => ({ id: comment.id, text: comment.text })),
      ...(request.llmImpl ? { llmImpl: request.llmImpl } : {}),
      projectId: location.projectId,
    });
    for (const comment of comments) {
      const labels = result.labels.get(comment.id);
      if (!labels) continue;
      comment.labels = labels;
      comment.labelSource = "llm";
      comment.rules = [];
    }
    warnings.push(...result.warnings);
    llmSummary = { ...llmSummary, classified: result.labels.size, calls: result.calls };
  } else if (request.llm && !request.write) {
    warnings.push(`--llm runs on --yes only: ${llmSummary.candidates} comment(s) the rules left unlabeled would go to ${COMMENT_CLASSIFY_MODEL}`);
  }

  const storedComments = comments.map(({ rules: _rules, ...comment }) => comment);
  const merge = mergeComments(stored?.comments ?? [], storedComments);
  if (merge.comments.length > MAX_STORED_COMMENTS) {
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "data",
      detail: `a Unit keeps at most ${MAX_STORED_COMMENTS} comments (this import would make ${merge.comments.length})`,
    });
  }

  const classes = Object.fromEntries(COMMENT_CLASSES.map((label) => [label, 0])) as Record<CommentClass, number>;
  const labelSources: Record<LabelSource, number> = { agent: 0, rules: 0, llm: 0 };
  let unclassified = 0;
  let creator = 0;
  for (const comment of comments) {
    if (comment.byCreator) {
      creator += 1;
      continue;
    }
    labelSources[comment.labelSource] += 1;
    if (comment.labels.length === 0) unclassified += 1;
    for (const label of comment.labels) classes[label] += 1;
  }
  const withMoments = comments.filter((comment) => comment.moments.length > 0);
  const sources = [...new Set(entries.map((entry) => entry.source))].sort();
  const base = {
    kind: "comment-import" as const,
    unit: {
      id: location.unitId,
      slug: location.slug,
      format: location.format,
      projectId: location.projectId,
      projectSlug: location.projectSlug,
    },
    platform: request.platform,
    sources,
    capturedAt: new Date(capturedAt).toISOString(),
    received: comments.length,
    creatorComments: creator,
    classes,
    unclassified,
    labelSources,
    moments: {
      comments: withMoments.length,
      mentions: withMoments.flatMap((comment) => comment.moments.map(momentLabel)).slice(0, 30),
    },
    sample: comments.slice(0, 5).map((comment) => ({
      id: comment.id,
      text: clip(comment.text, 140),
      labels: comment.labels,
      labelSource: comment.labelSource,
      rules: comment.rules,
      moments: comment.moments.map(momentLabel),
    })),
    merge: {
      storedBefore: stored?.comments.length ?? 0,
      added: merge.added,
      updated: merge.updated,
      unchanged: merge.unchanged,
      storedAfter: merge.comments.length,
    },
    llm: llmSummary,
    ytdlp,
    screenshots: screenshots.map((shot) => ({ file: shot.file, bytes: shot.bytes })),
    warnings,
    importKey,
    plan: {
      document: replayed ? "none (replay of a recorded import)" : document ? "revise" : "create",
      slug: postCommentsSlug(location.slug),
      rulesVersion: COMMENT_RULES_VERSION,
    },
  };
  if (!request.write) {
    return {
      ...base,
      written: false,
      next: "Show these comments and labels to the owner; re-run the same command with --yes to store them. Nothing is posted or replied to.",
    };
  }
  if (replayed && document) {
    return {
      ...base,
      written: true,
      replayed: true,
      writes: {
        documentId: document.documentId,
        revisionId: document.currentRevisionId,
        screenshotArtifactRevisions: (stored?.imports.find((entry) => entry.importKey === importKey)?.screenshots ?? [])
          .map((entry) => entry.artifactRevisionId),
      },
    };
  }

  // 7. Screenshots → Objects + image Artifact revisions (deduped by bytes).
  const sessionAuthor = request.context.sessionId ? { authoredBySessionId: request.context.sessionId } : {};
  const artifactScope = location.projectId ? { projectId: location.projectId } : { workspaceId: location.workspaceId };
  const objectScope = location.projectId
    ? { workspaceId: location.workspaceId, projectId: location.projectId }
    : { workspaceId: location.workspaceId };
  const screenshotRecords: CommentImportRecord["screenshots"] = [];
  for (const shot of screenshots) {
    const slug = `comments-screenshot-${request.platform}-${shot.sha256.slice(0, 12)}`;
    const fileName = path.basename(shot.file);
    let existing: { revisionId: string; objectId: string } | null = null;
    try {
      const found = resolveLatestArtifactObject({ context: artifactScope, slug, kind: "image" });
      existing = { revisionId: found.revision.id, objectId: found.revision.objectId };
    } catch {
      existing = null;
    }
    if (existing) {
      screenshotRecords.push({ objectId: existing.objectId, artifactRevisionId: existing.revisionId, fileName, bytes: shot.bytes });
      continue;
    }
    const object = await ingestObject({
      scope: objectScope,
      sourcePath: shot.file,
      originalName: fileName,
      mime: shot.mime,
      storageClass: "durable",
      metadata: { purpose: "comments-screenshot", platform: request.platform },
      transfer: "copy",
    });
    const artifact = createArtifact({ ...artifactScope, slug, kind: "image" });
    const revision = addArtifactRevision({
      artifactId: artifact.id,
      objectId: object.id,
      state: "approved",
      metadata: { purpose: "comments-screenshot", platform: request.platform, unitId: location.unitId },
      ...sessionAuthor,
    });
    screenshotRecords.push({ objectId: object.id, artifactRevisionId: revision.id, fileName, bytes: object.bytes });
  }

  // 8. One Document revision with the merged set + this import's record.
  const at = new Date(now).toISOString();
  const record: CommentImportRecord = {
    importKey,
    platform: request.platform,
    sources,
    capturedAt,
    at,
    received: comments.length,
    added: merge.added,
    updated: merge.updated,
    unchanged: merge.unchanged,
    labelers: (Object.keys(labelSources) as LabelSource[]).filter((source) => labelSources[source] > 0).sort(),
    screenshots: screenshotRecords,
    ytdlpUrl: ytdlp?.url ?? null,
    postUrl,
    notes,
  };
  const body: PostCommentsBody = {
    kind: POST_COMMENTS_BODY_KIND,
    version: POST_COMMENTS_VERSION,
    unitId: location.unitId,
    unitSlug: location.slug,
    projectId: location.projectId,
    rulesVersion: COMMENT_RULES_VERSION,
    comments: merge.comments,
    imports: [...(stored?.imports ?? []), record],
    updatedAt: at,
  };
  const title = `Post comments: ${location.slug}`;
  const documentId = document?.documentId ?? createDocument(
    location.projectId
      ? { projectId: location.projectId, kind: POST_COMMENTS_DOCUMENT_KIND, slug: postCommentsSlug(location.slug), title }
      : { workspaceId: location.workspaceId, kind: POST_COMMENTS_DOCUMENT_KIND, slug: postCommentsSlug(location.slug), title },
  ).id;
  let revisionId: string;
  try {
    revisionId = reviseDocument({
      documentId,
      expectedHeadId: document?.currentRevisionId ?? null,
      format: "json",
      title,
      body: JSON.stringify(body),
      ...sessionAuthor,
    }).id;
  } catch (error) {
    if (error instanceof StoreConflictError) {
      throw new DomainError("E_CONFLICT", undefined, { kind: "Post comments document", id: documentId });
    }
    throw error;
  }
  return {
    ...base,
    written: true,
    replayed: false,
    writes: {
      documentId,
      revisionId,
      screenshotArtifactRevisions: screenshotRecords.map((entry) => entry.artifactRevisionId),
    },
  };
}

/** Validate a payload; parse failures become E_VALIDATION_FAILED with every issue listed. */
export function validatePayload(raw: unknown, platform: PostCommentPlatform) {
  let payload;
  try {
    payload = parseCommentsPayload(raw);
  } catch (error) {
    const detail = error instanceof ZodError
      ? error.issues.map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message)).join("; ")
      : error instanceof MetricParseError
        ? error.message
        : String(error);
    throw new DomainError("E_VALIDATION_FAILED", undefined, { target: "comments data", detail: detail.slice(0, 1800) });
  }
  if (payload.platform && payload.platform !== platform) {
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "platform",
      detail: `--platform ${platform} conflicts with data.platform ${payload.platform}`,
    });
  }
  return payload;
}

function sortedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortedJson(item)]),
    );
  }
  return value;
}

export type CommentImportResult = Awaited<ReturnType<typeof importComments>>;
