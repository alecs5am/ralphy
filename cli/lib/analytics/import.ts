// `ralphy analytics import` (#558) — feed metrics the owner provides as
// platform analytics SCREENSHOTS into the domain store.
//
// FREE FIRST: the default path is the agent reading the screenshot with its
// own vision, filling the JSON payload (cli/lib/schemas/analytics-import.ts),
// and passing it with --data. `--extract` optionally pre-fills the payload
// through ONE callLLM() vision pass; the result is still validated and still
// needs --yes before anything is written.
//
// CONFIRM BEFORE WRITE: without `write: true` this module only previews —
// parsed numbers, derived rates, plausibility warnings, and the exact writes
// it WOULD make. The agent shows that to the owner, then re-runs with --yes.
//
// WHAT A WRITE DOES (all append-only, all through the store APIs):
//   1. The Unit's Presentation for the platform — reused, or appended in a new
//      sealed Unit revision when the Unit has none for that platform.
//   2. A Publication — the existing published/submitted one, or a `manual`-
//      rail record ("the owner posted it"): `published` when the post URL is
//      known, else `submitted`. Its lifecycle times are record times; the real
//      post date travels with the snapshot.
//   3. A metric-refresh Run claimed under a key derived from the numbers, so
//      the same numbers for the same Unit + platform replay, never duplicate.
//   4. Screenshots → durable Objects (copied, never moved), each referenced by
//      an image Artifact revision.
//   5. One Metric Snapshot (shared columns + the import envelope).
//   6. The Unit's decision ledger, derived and stored when it has none yet, so
//      the outcome is pinned to the choices that produced it.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import { DomainError } from "../errors/domain.js";
import { callLLM } from "../providers/llm.js";
import type { CallLLMOptions, CallLLMResult } from "../providers/llm.js";
import { ingestObject } from "../store/objects.js";
import type { UnitLocationDto } from "../store/outcomes.js";
import { getRun, listRunResults } from "../store/runs.js";
import { addArtifactRevision, createArtifact } from "../store/artifacts.js";
import type { QueryContext } from "../store/scope-context.js";
import type { JsonValue, MetricSnapshotDto, PublicationDto } from "../store/types.js";
import {
  failMetricRefresh,
  finishMetricRefresh,
  finishPublicationClaim,
  getMetricSnapshot,
  getUnit,
  listPublications,
  listUnitPresentations,
  listUnitRevisions,
  reviseUnit,
  startMetricRefresh,
  startPublicationSubmission,
} from "../store/units.js";
import { allPages, resolveUnitReference, unitContext, unitRevisionInput } from "../unit-revision.js";
import {
  ANALYTICS_IMPORT_KIND,
  ANALYTICS_IMPORT_PLATFORMS,
  ANALYTICS_IMPORT_VERSION,
  parseAnalyticsImport,
  type AnalyticsImportData,
  type AnalyticsImportEnvelope,
  type AnalyticsImportPlatform,
} from "../schemas/analytics-import.js";
import { MetricParseError } from "./metric-parse.js";
import { previewLedger, writeLedger } from "./ledger.js";

/** Per MODELS.md "LLM" table: cheap vision for screenshot reading. */
export const ANALYTICS_EXTRACT_MODEL = "google/gemini-2.5-flash";

const SCREENSHOT_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};
const MAX_SCREENSHOT_BYTES = 25 * 1024 * 1024;
const USABLE_PUBLICATION_STATES = new Set(["published", "submitted", "scheduled"]);

export type LLMImpl = (opts: CallLLMOptions) => Promise<CallLLMResult>;

export function isImportPlatform(value: unknown): value is AnalyticsImportPlatform {
  return typeof value === "string" && (ANALYTICS_IMPORT_PLATFORMS as readonly string[]).includes(value);
}

/** `--data` accepts inline JSON or a path to a JSON file. */
export function readImportData(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) return parseJsonOrThrow(trimmed, "--data");
  const file = path.resolve(trimmed);
  if (!fs.existsSync(file)) {
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "data",
      detail: "expected inline JSON or a path to a JSON file",
    });
  }
  return parseJsonOrThrow(fs.readFileSync(file, "utf8"), file);
}

function parseJsonOrThrow(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "data",
      detail: `${label} is not valid JSON: ${(error as Error).message}`.slice(0, 500),
    });
  }
}

/** Validate a payload; maps parse failures to E_VALIDATION_FAILED with every issue listed. */
export function validateImportData(raw: unknown, platform: AnalyticsImportPlatform) {
  let parsed;
  try {
    parsed = parseAnalyticsImport(raw);
  } catch (error) {
    const detail = error instanceof ZodError
      ? error.issues.map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message)).join("; ")
      : error instanceof MetricParseError
        ? error.message
        : String(error);
    throw new DomainError("E_VALIDATION_FAILED", undefined, {
      target: "analytics import data",
      detail: detail.slice(0, 1800),
    });
  }
  if (parsed.data.platform && parsed.data.platform !== platform) {
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "platform",
      detail: `--platform ${platform} conflicts with data.platform ${parsed.data.platform}`,
    });
  }
  return parsed;
}

export interface ImportTargetPlan {
  presentation:
    | { action: "reuse"; presentationId: string; revisionId: string }
    | { action: "create"; baseRevisionId: string };
  publication:
    | { action: "reuse"; publicationId: string; state: string; rail: string }
    | { action: "record-manual"; note: string };
}

/** Decide (read-only) which Presentation + Publication a snapshot attaches to. */
export function planImportTarget(
  context: QueryContext,
  location: UnitLocationDto,
  platform: AnalyticsImportPlatform,
  data: AnalyticsImportData,
): ImportTargetPlan {
  const unit = getUnit({ context, unitId: location.unitId });
  if (!unit.latestRevisionId) {
    throw new DomainError("E_VALIDATION_FAILED", undefined, {
      target: `Unit ${unit.id}`,
      detail: "the Unit has no sealed revision yet; create one before importing analytics",
    });
  }
  const revisions = allPages((after) =>
    listUnitRevisions({ context, unitId: unit.id, order: "newest", after, limit: 100 })
  ).filter((revision) => revision.sealedAt !== null);
  let firstCandidate: { presentationId: string; revisionId: string } | null = null;
  for (const revision of revisions) {
    const presentation = allPages((after) =>
      listUnitPresentations({ context, revisionId: revision.id, after, limit: 100 })
    ).find((candidate) => candidate.platform === platform);
    if (!presentation) continue;
    firstCandidate ??= { presentationId: presentation.id, revisionId: revision.id };
    const publication = newestUsablePublication(context, presentation.id);
    if (publication) {
      return {
        presentation: { action: "reuse", presentationId: presentation.id, revisionId: revision.id },
        publication: { action: "reuse", publicationId: publication.id, state: publication.state, rail: publication.rail },
      };
    }
  }
  const publication = {
    action: "record-manual" as const,
    note: [
      data.url
        ? "records a manual-rail Publication as published (with the post URL)"
        : "records a manual-rail Publication as submitted (pass url to record it as published)",
      data.postedAt !== undefined
        ? "the post date is kept with the snapshot"
        : "pass postedAt so baselines order this post correctly",
    ].join("; "),
  };
  return firstCandidate
    ? { presentation: { action: "reuse", ...firstCandidate }, publication }
    : { presentation: { action: "create", baseRevisionId: unit.latestRevisionId }, publication };
}

function newestUsablePublication(context: QueryContext, presentationId: string): PublicationDto | null {
  const publications = allPages((after) => listPublications({ context, presentationId, after, limit: 100 }))
    .filter((publication) => USABLE_PUBLICATION_STATES.has(publication.state))
    .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  return publications[0] ?? null;
}

/** Rates the owner can sanity-check against the screen before confirming. */
export function previewRates(data: AnalyticsImportData) {
  const views = data.views;
  const rate = (value: number | undefined) =>
    views && views > 0 && value !== undefined ? Math.round((value / views) * 1_000_000) / 10_000 : null;
  const engagement = [data.likes, data.comments, data.shares, data.saves].filter((value): value is number => value !== undefined);
  return {
    engagementRatePct: views && views > 0 && engagement.length > 0
      ? Math.round((engagement.reduce((sum, value) => sum + value, 0) / views) * 1_000_000) / 10_000
      : null,
    saveRatePct: rate(data.saves),
    shareRatePct: rate(data.shares),
    avgWatchPct: data.avgWatchPct ??
      (data.avgWatchTimeSec !== undefined && data.videoDurationSec
        ? Math.round((data.avgWatchTimeSec / data.videoDurationSec) * 1_000_000) / 10_000
        : null),
  };
}

export interface ImportRequest {
  context: QueryContext;
  ref: string;
  platform: AnalyticsImportPlatform;
  data: unknown;
  screenshots?: string[];
  /** Metric source slug; default `screenshot` when screenshots are attached, else `manual`. */
  source?: string;
  extractedBy?: "agent" | "vision-extract";
  /** False = preview only (the default); true = write. */
  write: boolean;
  /** Project working directory for ledger derivation (else conventional). */
  fromDir?: string;
  now?: number;
}

export async function importAnalytics(request: ImportRequest) {
  const parsed = validateImportData(request.data, request.platform);
  const screenshots = (request.screenshots ?? []).map(checkScreenshot);
  const source = request.source ?? (screenshots.length > 0 ? "screenshot" : "manual");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(source)) {
    throw new DomainError("E_INPUT_INVALID", undefined, { field: "source", detail: "expected a kebab-case slug" });
  }
  const location = resolveUnitReference(request.context, request.ref);
  const context = unitContext(request.context, location);
  const now = request.now ?? Date.now();
  const capturedAt = parsed.data.capturedAt ?? now;
  const plan = planImportTarget(context, location, request.platform, parsed.data);
  const digest = createHash("sha256")
    .update(JSON.stringify({ unitId: location.unitId, platform: request.platform, data: sortedJson(parsed.data) }))
    .digest("hex");
  const retentionInColumn = parsed.data.retention?.every((point) => point.pct <= 100) ?? false;
  const base = {
    kind: "analytics-import" as const,
    unit: {
      id: location.unitId,
      slug: location.slug,
      format: location.format,
      projectId: location.projectId,
      projectSlug: location.projectSlug,
    },
    platform: request.platform,
    source,
    metrics: {
      ...parsed.data,
      ...(parsed.data.capturedAt !== undefined ? { capturedAt: new Date(parsed.data.capturedAt).toISOString() } : {}),
      ...(parsed.data.postedAt !== undefined ? { postedAt: new Date(parsed.data.postedAt).toISOString() } : {}),
    },
    rates: previewRates(parsed.data),
    approximations: parsed.approximations,
    warnings: [
      ...parsed.warnings,
      ...(parsed.data.retention && !retentionInColumn
        ? ["retention above 100% is kept with the import record only (the curve column holds 0-100)"]
        : []),
    ],
    plan,
    screenshots: screenshots.map((shot) => ({ file: shot.file, bytes: shot.bytes })),
    importKey: digest.slice(0, 24),
  };
  if (!request.write) {
    return {
      ...base,
      written: false,
      next: "Show these numbers to the owner; re-run the same command with --yes to write them.",
    };
  }

  // 1. Presentation for the platform.
  const sessionAuthor = request.context.sessionId ? { authoredBySessionId: request.context.sessionId } : {};
  let presentationId: string;
  let createdRevisionId: string | null = null;
  if (plan.presentation.action === "reuse") {
    presentationId = plan.presentation.presentationId;
  } else {
    const prior = unitRevisionInput(context, plan.presentation.baseRevisionId);
    const revision = reviseUnit({
      unitId: location.unitId,
      expectedLatestRevisionId: plan.presentation.baseRevisionId,
      note: `analytics import: add ${request.platform} presentation`,
      items: prior.items,
      presentations: [
        ...prior.presentations,
        {
          platform: request.platform,
          position: prior.presentations.length,
          captions: [],
          effectiveCaptionRevisionNo: null,
          coverArtifactRevisionId: null,
          crop: null,
          safeArea: null,
          options: {},
          items: [],
        },
      ],
      ...sessionAuthor,
    });
    createdRevisionId = revision.id;
    const created = allPages((after) => listUnitPresentations({ context, revisionId: revision.id, after, limit: 100 }))
      .find((candidate) => candidate.platform === request.platform);
    if (!created) throw new Error("Presentation was not created");
    presentationId = created.id;
  }

  // 2. Publication: reuse, or record that the owner posted it manually.
  let publication: PublicationDto;
  let publicationRecorded = false;
  if (plan.publication.action === "reuse") {
    publication = findPublication(context, presentationId, plan.publication.publicationId);
  } else {
    // Lifecycle times are store record times (submitted_at >= created_at); the
    // real post date travels in the import envelope. A published Publication
    // must carry its URL, so without one the record stays `submitted`.
    const started = startPublicationSubmission({
      presentationId,
      rail: "manual",
      idempotencyKey: `owner-posted:${presentationId}`,
      agentSessionId: request.context.sessionId ?? null,
      leaseMs: 60_000,
    });
    if (started.claim) {
      const recordedAt = Date.now();
      publication = finishPublicationClaim(started.publication.id, {
        fence: started.claim.fence,
        state: parsed.data.url ? "published" : "submitted",
        submittedAt: recordedAt,
        ...(parsed.data.url ? { publishedAt: recordedAt, url: parsed.data.url } : {}),
        providerPublicationId: parsed.data.postId ?? null,
        response: { recordedBy: "analytics.import", platform: request.platform },
      });
      publicationRecorded = true;
    } else {
      publication = started.publication;
    }
  }

  // 3. Claim an idempotent metric-refresh Run: the same numbers for the same
  //    Unit + platform replay; a failed earlier attempt gets a fresh label.
  const importKey = digest.slice(0, 24);
  let refresh: { runId: string; claimed: boolean } | null = null;
  for (let attempt = 0; attempt < 5 && refresh === null; attempt += 1) {
    const started = startMetricRefresh({
      publicationId: publication.id,
      label: `analytics-import:${importKey}${attempt === 0 ? "" : `:retry-${attempt}`}`,
      source,
      request: { platform: request.platform, importKey, screenshots: screenshots.length },
      agentSessionId: request.context.sessionId ?? null,
    });
    if (started.claimed) {
      refresh = started;
      break;
    }
    const state = getRun({ context, runId: started.runId }).state;
    if (state === "succeeded") refresh = started;
    else if (state !== "failed" && state !== "cancelled") {
      throw new DomainError("E_CONFLICT", undefined, { kind: "Analytics import", id: importKey });
    }
  }
  if (refresh === null) {
    throw new DomainError("E_CONFLICT", undefined, { kind: "Analytics import", id: importKey });
  }

  let snapshots: MetricSnapshotDto[];
  const screenshotRecords: AnalyticsImportEnvelope["screenshots"] = [];
  const replayed = !refresh.claimed;
  if (refresh.claimed) {
    try {
      // 4. Screenshots → durable Objects (copies; the source files stay
      //    untouched), each referenced by an image Artifact revision.
      const scope = location.projectId
        ? { workspaceId: location.workspaceId, projectId: location.projectId }
        : { workspaceId: location.workspaceId };
      for (const [index, shot] of screenshots.entries()) {
        const fileName = path.basename(shot.file);
        const object = await ingestObject({
          scope,
          sourcePath: shot.file,
          originalName: fileName,
          mime: shot.mime,
          storageClass: "durable",
          metadata: { purpose: "analytics-screenshot", platform: request.platform },
          transfer: "copy",
        });
        const artifact = createArtifact({
          ...(location.projectId ? { projectId: location.projectId } : { workspaceId: location.workspaceId }),
          slug: `analytics-screenshot-${request.platform}-${importKey.slice(0, 12)}-${index + 1}`,
          kind: "image",
        });
        const revision = addArtifactRevision({
          artifactId: artifact.id,
          objectId: object.id,
          state: "approved",
          metadata: { purpose: "analytics-screenshot", platform: request.platform, unitId: location.unitId },
          ...sessionAuthor,
        });
        screenshotRecords.push({ objectId: object.id, artifactRevisionId: revision.id, fileName, bytes: object.bytes });
      }

      // 5. One Metric Snapshot: columns for the shared facts, the envelope for the rest.
      const envelope: AnalyticsImportEnvelope = {
        kind: ANALYTICS_IMPORT_KIND,
        version: ANALYTICS_IMPORT_VERSION,
        platform: request.platform,
        capturedAt,
        postedAt: parsed.data.postedAt ?? null,
        reach: parsed.data.reach ?? null,
        saves: parsed.data.saves ?? null,
        follows: parsed.data.follows ?? null,
        avgWatchTimeSec: parsed.data.avgWatchTimeSec ?? null,
        totalWatchTimeSec: parsed.data.totalWatchTimeSec ?? null,
        avgWatchPct: parsed.data.avgWatchPct ?? null,
        completionPct: parsed.data.completionPct ?? null,
        videoDurationSec: parsed.data.videoDurationSec ?? null,
        retention: parsed.data.retention ?? null,
        approximateFields: parsed.approximations.map((entry) => entry.field),
        extractedBy: request.extractedBy ?? "agent",
        screenshots: screenshotRecords,
        postId: parsed.data.postId ?? null,
        notes: parsed.data.notes ?? null,
      };
      snapshots = finishMetricRefresh({
        runId: refresh.runId,
        snapshots: [{
          publicationId: publication.id,
          runId: refresh.runId,
          position: 0,
          source,
          asOf: capturedAt,
          views: parsed.data.views ?? null,
          likes: parsed.data.likes ?? null,
          comments: parsed.data.comments ?? null,
          shares: parsed.data.shares ?? null,
          watchTimeMs: parsed.data.totalWatchTimeSec !== undefined ? Math.round(parsed.data.totalWatchTimeSec * 1000) : null,
          avgViewDurationSec: parsed.data.avgWatchTimeSec ?? null,
          retentionCurve: parsed.data.retention && retentionInColumn ? parsed.data.retention : null,
          note: `${request.platform} analytics import (${envelope.extractedBy})`,
          raw: envelope as unknown as JsonValue,
        }],
      });
    } catch (error) {
      failMetricRefresh(refresh.runId, error);
      throw error;
    }
  } else {
    snapshots = allPages((after) => listRunResults({ context, runId: refresh!.runId, after, limit: 100 }))
      .filter((result) => result.entityType === "metric_snapshot")
      .map((result) => getMetricSnapshot({ context, metricSnapshotId: result.entityId }));
  }

  // 6. Pin the decisions that produced this outcome (best effort, never fatal).
  const warnings = [...base.warnings];
  let ledger: { documentId: string; revisionId: string | null; written: boolean } | null = null;
  try {
    const preview = previewLedger(context, location, request.fromDir);
    if (!preview.stored?.body) {
      const written = writeLedger({
        context,
        location,
        derived: preview.derived,
        manual: {},
        derivedFrom: preview.derivedFrom,
        ...sessionAuthor,
      });
      ledger = { documentId: written.documentId, revisionId: written.revisionId, written: written.written };
    } else {
      ledger = { documentId: preview.stored.documentId, revisionId: preview.stored.revisionId, written: false };
    }
  } catch (error) {
    warnings.push(`decision ledger not written: ${(error as Error).message}`);
  }

  return {
    ...base,
    warnings,
    written: true,
    replayed,
    writes: {
      screenshotArtifactRevisions: screenshotRecords.map((record) => record.artifactRevisionId),
      presentationId,
      createdUnitRevisionId: createdRevisionId,
      publicationId: publication.id,
      publicationRecorded,
      metricRunId: refresh.runId,
      snapshotIds: snapshots.map((snapshot) => snapshot.id),
      ledger,
    },
  };
}

function findPublication(context: QueryContext, presentationId: string, publicationId: string): PublicationDto {
  const found = allPages((after) => listPublications({ context, presentationId, after, limit: 100 }))
    .find((publication) => publication.id === publicationId);
  if (!found) throw new DomainError("E_NOT_FOUND", undefined, { kind: "Publication", id: publicationId });
  return found;
}

/** Validate one screenshot path (.png / .jpg / .jpeg / .webp, non-empty, under 25 MiB). */
export function checkScreenshot(file: string): { file: string; mime: string; bytes: number } {
  const resolved = path.resolve(file);
  const mime = SCREENSHOT_MIME[path.extname(resolved).toLowerCase()];
  if (!mime) {
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "screenshot",
      detail: `${path.basename(resolved)}: expected a .png, .jpg, .jpeg, or .webp image`,
    });
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new DomainError("E_FILE_UNREADABLE", undefined, { path: resolved });
  }
  if (!stat.isFile() || stat.size === 0 || stat.size > MAX_SCREENSHOT_BYTES) {
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "screenshot",
      detail: `${path.basename(resolved)} must be a non-empty image under 25 MiB`,
    });
  }
  return { file: resolved, mime, bytes: stat.size };
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

// ─── optional vision pre-fill (--extract) ─────────────────────────────────────

const EXTRACT_PROMPT = (platform: AnalyticsImportPlatform) => `You read ${platform} analytics screenshots for one post.
Return ONLY a JSON object with the numbers you can see, using these keys and nothing else:
views, reach, likes, comments, shares, saves, follows, avgWatchTimeSec, totalWatchTimeSec,
avgWatchPct, completionPct, retention (array of {"t": seconds, "pct": percent}),
videoDurationSec, capturedAt (ISO), postedAt (ISO), url, notes.
Rules: copy numbers exactly as printed (keep "12.3K" as the string "12.3K"; keep "0:12" as a string);
percentages are 0-100; omit any key you cannot read; never estimate a value that is not on screen.`;

/**
 * One callLLM() vision pass that pre-fills the import payload from screenshots.
 * The caller still validates the result and still requires --yes to write.
 */
export async function extractFromScreenshots(input: {
  platform: AnalyticsImportPlatform;
  screenshots: string[];
  projectId?: string;
  llmImpl?: LLMImpl;
}): Promise<Record<string, unknown>> {
  if (input.screenshots.length === 0) {
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "extract",
      detail: "--extract needs at least one --screenshot",
    });
  }
  const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
    { type: "text", text: EXTRACT_PROMPT(input.platform) },
  ];
  for (const file of input.screenshots) {
    const shot = checkScreenshot(file);
    content.push({
      type: "image_url",
      image_url: { url: `data:${shot.mime};base64,${fs.readFileSync(shot.file).toString("base64")}` },
    });
  }
  const llm = input.llmImpl ?? callLLM;
  const result = await llm({
    model: ANALYTICS_EXTRACT_MODEL,
    jsonMode: true,
    temperature: 0,
    messages: [{ role: "user", content }],
    endpoint: "analytics-import-extract",
    ...(input.projectId ? { projectId: input.projectId } : {}),
  });
  const text = result.text.trim().replace(/^```(?:json)?\s*/u, "").replace(/```\s*$/u, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DomainError("E_VALIDATION_FAILED", undefined, {
      target: "vision extract",
      detail: "the model did not return JSON; read the screenshot yourself and pass --data",
    });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DomainError("E_VALIDATION_FAILED", undefined, {
      target: "vision extract",
      detail: "the model did not return a JSON object; pass --data instead",
    });
  }
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).filter(([, value]) => value !== null && value !== ""),
  );
}
