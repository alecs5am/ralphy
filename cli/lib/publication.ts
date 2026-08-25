import {
  postizCreatePost,
  postizDeletePost,
  postizListPosts,
  postizMetrics,
  postizUpload,
  postizAvailable,
  type FetchLike,
} from "./providers/postiz.js";
import { buildPostEntry, isPublishTarget } from "./publish/mapping.js";
import {
  articleChildEnvironment,
  commitToGithubPages,
  type GithubPagesConfig,
} from "./publish/article.js";
import { devtoAvailable, devtoPublish } from "./providers/devto.js";
import { hashnodeAvailable, hashnodePublish } from "./providers/hashnode.js";
import type { UnitManifest } from "./schemas/unit.js";
import { listSocialAccounts } from "./store/scopes.js";
import { resolveArtifactRevisionObject } from "./store/artifacts.js";
import { getDocumentContent } from "./store/document-content.js";
import {
  completeRunObject,
  finishRun,
  getRun,
  listRunResults,
  startRun,
} from "./store/runs.js";
import { ralphDir } from "./paths.js";
import type { QueryContext } from "./store/scope-context.js";
import {
  cancelDraftPublication,
  expirePublicationOperationClaim,
  finishPublicationCancellation,
  finishPublicationClaim,
  finishPublicationStatusLookup,
  failMetricRefresh,
  finishMetricRefresh,
  findPublicationByIdempotencyKey,
  getMetricSnapshot,
  getPresentationCaptionRevision,
  getPublication,
  getUnit,
  getUnitPresentation,
  getUnitRevision,
  listPresentationItems,
  listUnitItems,
  requestPublicationReconciliation,
  startPublicationFollowUp,
  startPublicationSubmission,
  startMetricRefresh,
} from "./store/units.js";
import type {
  JsonValue,
  PublicationDto,
  PublicationRail,
  PublicationState,
  UnitItemDto,
  MetricRetentionPoint,
  MetricSnapshotDto,
} from "./store/types.js";

const DEFAULT_LEASE_MS = 60_000;

export type PublicationSubmitRequest = {
  publicationId: string;
  platform: string;
  caption: string | null;
  options: JsonValue;
  items: UnitItemDto[];
  mediaPaths: string[];
  socialAccountExternalId: string | null;
  scheduledAt: number | null;
  unitSlug: string;
  unitFormat: string;
  documentBodies: string[];
};

export type PublicationOperationRequest = {
  publication: PublicationDto;
  platform: string;
  socialAccountExternalId: string | null;
};

type PublicationOutcome = {
  state: Extract<PublicationState, "scheduled" | "submitted" | "published" | "failed" | "cancelled" | "reconciliation_required" | "unknown">;
  operationState?: "succeeded" | "failed";
  providerPublicationId?: string | null;
  url?: string | null;
  submittedAt?: number | null;
  publishedAt?: number | null;
  error?: string | null;
  failureStage?: string | null;
  response?: JsonValue | null;
  costUsd?: number | null;
};

export type PublicationProviderAdapter = {
  submit(request: PublicationSubmitRequest): Promise<PublicationOutcome>;
  lookup(request: PublicationOperationRequest): Promise<PublicationOutcome>;
  cancel(request: PublicationOperationRequest): Promise<PublicationOutcome>;
};

export type PublicationOperationResult = {
  publication: PublicationDto;
  runId: string;
  replayed: boolean;
};

export type MetricProviderFacts = {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  watchTimeMs?: number | null;
  ctr?: number | null;
  retentionCurve?: MetricRetentionPoint[] | null;
  avgViewDurationSec?: number | null;
  note?: string | null;
  raw?: JsonValue | null;
};

export type MetricProviderAdapter = {
  fetch(request: {
    publication: PublicationDto;
    source: string;
    asOf: number;
    windowStart: number | null;
    windowEnd: number | null;
  }): Promise<MetricProviderFacts>;
};

export type MetricRefreshResult = {
  runId: string;
  snapshots: MetricSnapshotDto[];
  replayed: boolean;
};

export async function refreshPublicationMetrics(
  input: {
    context: QueryContext;
    publicationId: string;
    source: string;
    asOf: number;
    windowStart?: number | null;
    windowEnd?: number | null;
    idempotencyKey: string;
  },
  adapter: MetricProviderAdapter = postizMetricAdapter,
): Promise<MetricRefreshResult> {
  const publication = getPublication(input);
  const label = metricRefreshLabel(input);
  const request = {
    publicationId: publication.id,
    source: input.source,
    asOf: input.asOf,
    windowStart: input.windowStart ?? null,
    windowEnd: input.windowEnd ?? null,
    idempotencyKey: input.idempotencyKey,
  };
  const started = startMetricRefresh({
    publicationId: publication.id,
    label,
    source: input.source,
    request,
    agentSessionId: input.context.sessionId,
  });
  if (!started.claimed) {
    await waitForRun(input.context, started.runId);
    if (getRun({ context: input.context, runId: started.runId }).state === "failed") {
      throw new Error("Metric refresh failed");
    }
    return {
      runId: started.runId,
      snapshots: metricRunSnapshots(input.context, started.runId),
      replayed: true,
    };
  }
  try {
    const facts = sanitizeMetricFacts(await adapter.fetch({
      publication,
      source: input.source,
      asOf: input.asOf,
      windowStart: input.windowStart ?? null,
      windowEnd: input.windowEnd ?? null,
    }));
    const snapshots = finishMetricRefresh({
      runId: started.runId,
      snapshots: [{
      publicationId: publication.id,
      runId: started.runId,
      position: 0,
      source: input.source,
      asOf: input.asOf,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      ...facts,
      }],
    });
    return { runId: started.runId, snapshots, replayed: false };
  } catch (error) {
    failMetricRefresh(started.runId, error);
    throw error;
  }
}

export async function exportMediumPresentation(input: {
  context: QueryContext;
  presentationId: string;
}) {
  const binding = presentationBinding(input.context, input.presentationId);
  if (binding.presentation.platform !== "medium") {
    throw new Error("Manual Medium export requires a Medium presentation");
  }
  const run = startRun({
    ...(binding.unit.projectId
      ? { projectId: binding.unit.projectId }
      : { workspaceId: binding.unit.workspaceId }),
    kind: "publication-manual-export",
    label: "medium",
    ...(input.context.sessionId ? { agentSessionId: input.context.sessionId } : {}),
  });
  const bodies: string[] = [];
  for (const item of binding.items) {
    if (item.documentRevisionId !== null) {
      bodies.push(readDocument(input.context, item.documentRevisionId));
    }
  }
  const content = [
    binding.caption ? `# ${binding.caption}` : null,
    ...bodies,
  ].filter((part): part is string => part !== null).join("\n\n");
  const locator = path.posix.join("runs", run.id, "medium-export.md");
  const destination = path.join(ralphDir(), ...locator.split("/"));
  try {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, content, "utf8");
    const object = await completeRunObject({
      runId: run.id,
      sourcePath: destination,
      originalName: "medium-export.md",
      purpose: "medium-approval",
      state: "ready",
      retention: "approval",
      mime: "text/markdown",
      storageClass: "durable",
      metadata: { presentationId: input.presentationId, platform: "medium" },
    });
    return { runId: run.id, object };
  } catch (error) {
    try { finishRun(run.id, { state: "failed", error }); } catch { /* already terminal */ }
    throw error;
  } finally {
    await fs.rm(destination, { force: true });
  }
}

type PublishPresentationInput = {
  context: QueryContext;
  presentationId: string;
  socialAccountId?: string | null;
  idempotencyKey: string;
  rail: PublicationRail;
  scheduledAt?: number | null;
  revisedFromPublicationId?: string | null;
  options?: JsonValue;
  leaseMs?: number;
};

export function publishPresentation(
  input: PublishPresentationInput & { rail: "manual" },
  adapter?: PublicationProviderAdapter,
): ReturnType<typeof exportMediumPresentation>;
export function publishPresentation(
  input: PublishPresentationInput & { rail: Exclude<PublicationRail, "manual"> },
  adapter?: PublicationProviderAdapter,
): Promise<PublicationOperationResult>;
export function publishPresentation(
  input: PublishPresentationInput,
  adapter?: PublicationProviderAdapter,
): Promise<PublicationOperationResult | Awaited<ReturnType<typeof exportMediumPresentation>>>;
export async function publishPresentation(
  input: {
    context: QueryContext;
    presentationId: string;
    socialAccountId?: string | null;
    idempotencyKey: string;
    rail: PublicationRail;
    scheduledAt?: number | null;
    revisedFromPublicationId?: string | null;
    options?: JsonValue;
    leaseMs?: number;
  },
  adapter?: PublicationProviderAdapter,
): Promise<PublicationOperationResult | Awaited<ReturnType<typeof exportMediumPresentation>>> {
  if (input.rail === "manual") {
    if (input.socialAccountId != null) {
      throw new Error("manual does not accept a social account");
    }
    return exportMediumPresentation({
      context: input.context,
      presentationId: input.presentationId,
    });
  }
  const existing = findPublicationByIdempotencyKey({
    context: input.context,
    presentationId: input.presentationId,
    idempotencyKey: input.idempotencyKey,
  });
  if (existing !== null && existing.state !== "draft") {
    const replay = startPublicationSubmission({
      presentationId: input.presentationId,
      socialAccountId: input.socialAccountId,
      rail: input.rail,
      idempotencyKey: input.idempotencyKey,
      scheduledAt: input.scheduledAt,
      revisedFromPublicationId: input.revisedFromPublicationId,
      effectiveOptions: input.options,
      agentSessionId: input.context.sessionId,
      leaseMs: input.leaseMs ?? DEFAULT_LEASE_MS,
    });
    return {
      publication: replay.publication,
      runId: replay.publication.submissionRunId,
      replayed: replay.replayed,
    };
  }
  const binding = presentationBinding(input.context, input.presentationId);
  let preparedRequest: Omit<PublicationSubmitRequest, "publicationId" | "scheduledAt"> | null = null;
  let failedPreflight: { error: string; failureStage: "account-resolution" | "preflight" } | null = null;
  let socialAccountExternalId: string | null = null;
  try {
    if (!publicationRailRequiresAccount(input.rail) && input.socialAccountId != null) {
      throw new Error(`${input.rail} does not accept a social account`);
    }
    if (publicationRailRequiresAccount(input.rail) && input.socialAccountId == null) {
      throw new Error(`${input.rail} requires a social account`);
    }
    socialAccountExternalId = accountExternalId(
      binding.unit.workspaceId,
      binding.presentation.platform,
      input.socialAccountId ?? null,
    );
  } catch {
    failedPreflight = {
      error: "Publication account resolution failed",
      failureStage: "account-resolution",
    };
  }
  if (failedPreflight === null) try {
    preparedRequest = {
      platform: binding.presentation.platform,
      caption: binding.caption,
      options: input.options ?? binding.presentation.options,
      items: binding.items,
      mediaPaths: binding.items.flatMap((item) =>
        item.artifactRevisionId === null
          ? []
          : [resolveArtifactRevisionObject({
              context: input.context,
              revisionId: item.artifactRevisionId,
            }).objectPath],
      ),
      socialAccountExternalId,
      unitSlug: binding.unit.slug,
      unitFormat: binding.unit.format,
      documentBodies: binding.items.flatMap((item) =>
        item.documentRevisionId === null
          ? []
          : [readDocument(input.context, item.documentRevisionId)],
      ),
    };
    if (adapter === undefined) assertDefaultPublicationPreflight(input.rail, preparedRequest);
  } catch {
    failedPreflight = {
      error: "Publication preflight failed",
      failureStage: "preflight",
    };
  }
  const started = startPublicationSubmission({
    presentationId: input.presentationId,
    socialAccountId: failedPreflight?.failureStage === "account-resolution"
      ? null
      : input.socialAccountId,
    rail: input.rail,
    idempotencyKey: input.idempotencyKey,
    scheduledAt: input.scheduledAt,
    revisedFromPublicationId: input.revisedFromPublicationId,
    effectiveOptions: input.options,
    agentSessionId: input.context.sessionId,
    leaseMs: input.leaseMs ?? DEFAULT_LEASE_MS,
    ...(failedPreflight ? { failedPreflight } : {}),
  });
  if (started.claim === null) {
    return {
      publication: started.publication,
      runId: started.publication.submissionRunId,
      replayed: started.replayed,
    };
  }
  const claim = started.claim;
  const publication = claim.publication;
  const provider = adapter ?? publicationAdapterForRail(input.rail);
  let outcome: PublicationOutcome;
  try {
    outcome = await provider.submit({
      publicationId: publication.id,
      ...preparedRequest!,
      options: claim.publication.effectiveOptions,
      scheduledAt: publication.scheduledAt,
    });
  } catch {
    outcome = {
      state: "unknown",
      error: "Provider submission outcome is unknown",
      failureStage: "provider-outcome",
      response: { outcome: "unknown" },
    };
  }
  if (Date.now() > claim.fence.expiresAt) {
    return {
      publication: requestPublicationReconciliation(publication.id, {
        fence: claim.fence,
        state: "unknown",
        error: "Provider submission outcome is unknown",
      }),
      runId: claim.fence.runId,
      replayed: false,
    };
  }
  try {
    return {
      publication: finishPublicationClaim(publication.id, {
        fence: claim.fence,
        ...outcome,
      }),
      runId: claim.fence.runId,
      replayed: false,
    };
  } catch (error) {
    if (Date.now() <= claim.fence.expiresAt) throw error;
    return {
      publication: requestPublicationReconciliation(publication.id, {
        fence: claim.fence,
        state: "unknown",
        error: "Provider submission outcome is unknown",
      }),
      runId: claim.fence.runId,
      replayed: false,
    };
  }
}

export async function lookupPublication(
  input: {
    context: QueryContext;
    publicationId: string;
    expectedState: "scheduled" | "submitted";
    leaseMs?: number;
  },
  adapter?: PublicationProviderAdapter,
): Promise<PublicationOperationResult> {
  return followUp(input, "status-lookup", adapter);
}

export async function cancelPublication(
  input: {
    context: QueryContext;
    publicationId: string;
    expectedState: "draft" | "scheduled" | "submitted";
    leaseMs?: number;
  },
  adapter?: PublicationProviderAdapter,
): Promise<PublicationOperationResult> {
  const publication = getPublication(input);
  if (input.expectedState === "draft") {
    return {
      publication: cancelDraftPublication(input.publicationId, "draft"),
      runId: publication.submissionRunId,
      replayed: false,
    };
  }
  return followUp({
    context: input.context,
    publicationId: input.publicationId,
    expectedState: input.expectedState,
    leaseMs: input.leaseMs,
  }, "cancellation", adapter);
}

export async function reconcilePublication(
  input: {
    context: QueryContext;
    publicationId: string;
    expectedState: "unknown" | "reconciliation_required";
    leaseMs?: number;
    resolution?: PublicationOutcome;
  },
  adapter?: PublicationProviderAdapter,
): Promise<PublicationOperationResult> {
  return followUp(input, "reconciliation", adapter);
}

async function followUp(
  input: {
    context: QueryContext;
    publicationId: string;
    expectedState: "scheduled" | "submitted" | "unknown" | "reconciliation_required";
    leaseMs?: number;
    resolution?: PublicationOutcome;
  },
  kind: "status-lookup" | "cancellation" | "reconciliation",
  adapter?: PublicationProviderAdapter,
): Promise<PublicationOperationResult> {
  const current = getPublication(input);
  const provider = adapter ?? (input.resolution
    ? null
    : followUpAdapter(current.rail, kind));
  const binding = presentationBinding(input.context, current.presentationId);
  const claim = startPublicationFollowUp({
    publicationId: current.id,
    expectedState: input.expectedState,
    kind,
    agentSessionId: input.context.sessionId,
    leaseMs: input.leaseMs ?? DEFAULT_LEASE_MS,
  });
  const request = {
    publication: claim.publication,
    platform: binding.presentation.platform,
    socialAccountExternalId: accountExternalId(
      binding.unit.workspaceId,
      binding.presentation.platform,
      current.socialAccountId,
    ),
  };
  let outcome: PublicationOutcome;
  try {
    outcome = input.resolution ?? (kind === "cancellation"
      ? await provider!.cancel(request)
      : await provider!.lookup(request));
  } catch {
    const error = `Provider ${kind} outcome is unknown`;
    const retainedState = kind === "status-lookup"
      ? input.expectedState as "scheduled" | "submitted"
      : "unknown";
    outcome = {
      state: retainedState,
      operationState: "failed",
      error,
      ...(kind === "status-lookup" ? {} : { failureStage: "provider-outcome" }),
      response: { outcome: "unknown" },
    };
  }
  if (Date.now() > claim.fence.expiresAt) {
    const publication = expirePublicationOperationClaim(current.id, {
      expectedKind: kind,
      expectedEpoch: claim.fence.epoch,
      expectedState: input.expectedState as never,
      ...(kind === "status-lookup" ? {} : { nextState: "unknown" as const }),
      error: `Provider ${kind} claim expired`,
    } as Parameters<typeof expirePublicationOperationClaim>[1]);
    return { publication, runId: claim.fence.runId, replayed: false };
  }
  const operationState = outcome.operationState ?? "succeeded";
  try {
    const publication = kind === "status-lookup"
      ? finishPublicationStatusLookup(current.id, {
          fence: claim.fence,
          ...outcome,
          operationState,
        })
      : kind === "cancellation"
        ? finishPublicationCancellation(current.id, {
            fence: claim.fence,
            ...outcome,
            operationState,
          })
        : finishPublicationClaim(current.id, {
            fence: claim.fence,
            ...outcome,
            operationState,
          });
    return { publication, runId: claim.fence.runId, replayed: false };
  } catch (error) {
    if (Date.now() <= claim.fence.expiresAt) throw error;
    const publication = expirePublicationOperationClaim(current.id, {
      expectedKind: kind,
      expectedEpoch: claim.fence.epoch,
      expectedState: input.expectedState as never,
      ...(kind === "status-lookup" ? {} : { nextState: "unknown" as const }),
      error: `Provider ${kind} claim expired`,
    } as Parameters<typeof expirePublicationOperationClaim>[1]);
    return { publication, runId: claim.fence.runId, replayed: false };
  }
}

function followUpAdapter(
  rail: PublicationRail,
  kind: "status-lookup" | "cancellation" | "reconciliation",
): PublicationProviderAdapter {
  if (rail === "postiz") return postizPublicationAdapter;
  throw new Error(`${rail} does not support ${kind.replace("-", " ")}`);
}

function presentationBinding(context: QueryContext, presentationId: string) {
  const presentation = getUnitPresentation({ context, presentationId });
  const revision = getUnitRevision({ context, revisionId: presentation.unitRevisionId });
  const unit = getUnit({ context, unitId: revision.unitId });
  const allItems = allPages((after) =>
    listUnitItems({ context, revisionId: revision.id, after, limit: 100 }),
  );
  const selected = allPages((after) =>
    listPresentationItems({ context, presentationId, after, limit: 100 }),
  );
  const byId = new Map(allItems.map((item) => [item.id, item]));
  const items = selected.length === 0
    ? allItems
    : selected.map((item) => byId.get(item.unitItemId)!);
  const caption = presentation.effectiveCaptionRevisionId
    ? getPresentationCaptionRevision({
        context,
        captionRevisionId: presentation.effectiveCaptionRevisionId,
      }).text
    : null;
  return { unit, presentation, items, caption };
}

function accountExternalId(
  workspaceId: string,
  platform: string,
  accountId: string | null,
): string | null {
  if (accountId === null) return null;
  const account = allPages((after) =>
    listSocialAccounts({ workspaceId, cursor: after, limit: 100 }),
  ).find((candidate) => candidate.id === accountId);
  if (!account || account.workspaceId !== workspaceId || account.platform !== platform) {
    throw new Error("Social account is outside the Presentation platform scope");
  }
  return account.externalId;
}

function assertDefaultPublicationPreflight(
  rail: Exclude<PublicationRail, "manual">,
  request: Omit<PublicationSubmitRequest, "publicationId" | "scheduledAt">,
): void {
  if (publicationRailRequiresAccount(rail) && !request.socialAccountExternalId) {
    throw new Error(`${rail} requires a social account`);
  }
  if (rail === "postiz" && !isPublishTarget(request.platform)) {
    throw new Error("Postiz platform is unsupported");
  }
  if (rail === "postiz" && !postizAvailable()) {
    throw new Error("Postiz credentials are not configured");
  }
  if (rail === "devto" && !devtoAvailable()) {
    throw new Error("dev.to credentials are not configured");
  }
  if (rail === "hashnode" && !stringOption(recordOptions(request.options), "publicationId")) {
    throw new Error("Hashnode requires publicationId");
  }
  if (rail === "hashnode" && !hashnodeAvailable()) {
    throw new Error("Hashnode credentials are not configured");
  }
  if (rail === "github-pages") assertGithubPagesRepo(githubPagesConfig(recordOptions(request.options)));
}

function assertGithubPagesRepo(config: GithubPagesConfig): void {
  const check = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: config.repoDir,
    encoding: "utf8",
    env: articleChildEnvironment(),
  });
  if (check.status !== 0 || check.stdout.trim() !== "true") {
    throw new Error("github-pages requires an existing Git repository");
  }
}

function publicationRailRequiresAccount(rail: PublicationRail): boolean {
  return rail === "postiz" || rail === "devto" || rail === "hashnode";
}

function allPages<T>(
  read: (after: string | null) => { items: T[]; nextCursor: string | null },
): T[] {
  const items: T[] = [];
  let after: string | null = null;
  do {
    const page = read(after);
    items.push(...page.items);
    after = page.nextCursor;
  } while (after !== null);
  return items;
}

function readDocument(context: QueryContext, revisionId: string): string {
  let afterByte = 0;
  let text = "";
  while (true) {
    const page = getDocumentContent({
      context,
      revisionId,
      afterByte,
      limitBytes: 65_536,
    });
    text += page.text;
    if (page.nextByte === null) return text;
    afterByte = page.nextByte;
  }
}

export function createPostizPublicationAdapter(
  fetchImpl: FetchLike = fetch,
): PublicationProviderAdapter {
  return {
    async submit(request) {
      if (!request.socialAccountExternalId) {
        throw new Error("Postiz submission requires a social account");
      }
      const scheduled = request.scheduledAt !== null;
      if (!isPublishTarget(request.platform)) {
        throw new Error(`Postiz does not support platform: ${request.platform}`);
      }
      const media = [];
      for (const objectPath of request.mediaPaths) {
        const uploaded = await postizUpload(objectPath, fetchImpl);
        media.push({ id: uploaded.id, path: uploaded.path });
      }
      const optionDefaults = isRecord(request.options) ? request.options : {};
      const manifest: UnitManifest = {
        slug: request.unitSlug,
        format: request.unitFormat as UnitManifest["format"],
        media: [],
        created: new Date().toISOString(),
        title: request.caption ?? request.unitSlug,
        caption: request.caption === null
          ? undefined
          : {
              platform: {
                tiktok: request.caption,
                reels: request.caption,
                shorts: request.caption,
              },
              hashtags: [],
              language: "English",
            },
      };
      const post = buildPostEntry(
        request.platform,
        request.socialAccountExternalId,
        manifest,
        media,
        request.platform,
        request.documentBodies[0],
        {
          ...(typeof optionDefaults.madeWithAi === "boolean"
            ? { madeWithAi: optionDefaults.madeWithAi }
            : {}),
          ...(optionDefaults.youtubeVisibility === "public"
            || optionDefaults.youtubeVisibility === "unlisted"
            || optionDefaults.youtubeVisibility === "private"
            ? { youtubeVisibility: optionDefaults.youtubeVisibility }
            : {}),
          ...(optionDefaults.instagramPostType === "post"
            || optionDefaults.instagramPostType === "story"
            ? { instagramPostType: optionDefaults.instagramPostType }
            : {}),
        },
      );
      const rows = await postizCreatePost({
        type: scheduled ? "schedule" : "now",
        date: scheduled
          ? new Date(request.scheduledAt!).toISOString()
          : new Date().toISOString(),
        shortLink: false,
        tags: [],
        posts: [post],
      }, fetchImpl);
      const providerPublicationId = rows[0]?.postId ?? rows[0]?.id ?? null;
      return {
        state: scheduled ? "scheduled" : "submitted",
        providerPublicationId,
        submittedAt: Date.now(),
        response: { accepted: true },
      };
    },
    async lookup(request) {
      const publication = request.publication;
      if (!publication.providerPublicationId) {
        throw new Error("Postiz lookup requires a provider Publication ID");
      }
      const center = publication.scheduledAt ?? publication.submittedAt ?? publication.createdAt;
      const rows = await postizListPosts(
        new Date(center - 86_400_000).toISOString(),
        new Date(center + 86_400_000).toISOString(),
        fetchImpl,
      );
      const row = rows.find((candidate) => candidate.id === publication.providerPublicationId);
      if (!row) {
        return { state: "failed", operationState: "succeeded", error: "Publication was not found" };
      }
      if (row.releaseURL) {
        return {
          state: "published",
          operationState: "succeeded",
          url: row.releaseURL,
          publishedAt: Date.now(),
        };
      }
      return { state: publication.state, operationState: "succeeded" } as PublicationOutcome;
    },
    async cancel(request) {
      const id = request.publication.providerPublicationId;
      if (!id) throw new Error("Postiz cancellation requires a provider Publication ID");
      await postizDeletePost(id, fetchImpl);
      return { state: "cancelled", operationState: "succeeded", response: { cancelled: true } };
    },
  };
}

const postizPublicationAdapter = createPostizPublicationAdapter();

const devtoPublicationAdapter: PublicationProviderAdapter = submissionOnlyAdapter(
  async (request) => {
    const options = recordOptions(request.options);
    const result = await devtoPublish({
      title: stringOption(options, "title") ?? request.caption ?? request.unitSlug,
      body_markdown: request.documentBodies.join("\n\n"),
      published: booleanOption(options, "published") ?? false,
      ...(stringOption(options, "canonicalUrl")
        ? { canonical_url: stringOption(options, "canonicalUrl")! }
        : {}),
      ...(stringArrayOption(options, "tags")
        ? { tags: stringArrayOption(options, "tags")! }
        : {}),
      ...(stringOption(options, "description")
        ? { description: stringOption(options, "description")! }
        : {}),
    });
    return providerArticleOutcome(result.id, result.url);
  },
);

const hashnodePublicationAdapter: PublicationProviderAdapter = submissionOnlyAdapter(
  async (request) => {
    const options = recordOptions(request.options);
    const publicationId = stringOption(options, "publicationId");
    if (!publicationId) throw new Error("Hashnode requires publicationId");
    const result = await hashnodePublish({
      title: stringOption(options, "title") ?? request.caption ?? request.unitSlug,
      contentMarkdown: request.documentBodies.join("\n\n"),
      publicationId,
      ...(stringArrayOption(options, "tags")
        ? { tags: stringArrayOption(options, "tags")! }
        : {}),
      ...(stringOption(options, "canonicalUrl")
        ? { canonicalUrl: stringOption(options, "canonicalUrl")! }
        : {}),
    }, booleanOption(options, "draft") ?? true);
    return providerArticleOutcome(result.id, result.url);
  },
);

const githubPagesPublicationAdapter: PublicationProviderAdapter = submissionOnlyAdapter(
  async (request) => {
    const options = recordOptions(request.options);
    const config = githubPagesConfig(options);
    const scratch = await fs.mkdtemp(path.join(path.dirname(ralphDir()), "ralphy-github-pages-"));
    const bodyName = "body.md";
    try {
      await fs.writeFile(path.join(scratch, bodyName), request.documentBodies.join("\n\n"), "utf8");
      const article = {
        title: stringOption(options, "title") ?? request.caption ?? request.unitSlug,
        description: stringOption(options, "description") ?? request.caption ?? "",
        slug: request.unitSlug,
        tags: stringArrayOption(options, "tags") ?? [],
        canonicalUrl: stringOption(options, "canonicalUrl") ?? "",
        body: bodyName,
      };
      const result = await commitToGithubPages(
        config,
        scratch,
        article,
        article.canonicalUrl,
      );
      return providerArticleOutcome(result.commit, null);
    } finally {
      await fs.rm(scratch, { recursive: true, force: true });
    }
  },
);

function publicationAdapterForRail(rail: PublicationRail): PublicationProviderAdapter {
  if (rail === "postiz") return postizPublicationAdapter;
  if (rail === "devto") return devtoPublicationAdapter;
  if (rail === "hashnode") return hashnodePublicationAdapter;
  if (rail === "github-pages") return githubPagesPublicationAdapter;
  throw new Error(`No default Publication adapter is configured for ${rail}`);
}

function submissionOnlyAdapter(
  submit: PublicationProviderAdapter["submit"],
): PublicationProviderAdapter {
  return {
    submit,
    lookup: async (request) => ({
      state: request.publication.state,
      operationState: "succeeded",
    }) as PublicationOutcome,
    cancel: async () => ({
      state: "failed",
      operationState: "failed",
      error: "Provider cancellation is unavailable",
    }),
  };
}

function providerArticleOutcome(
  id: string | number | null | undefined,
  url: string | null | undefined,
): PublicationOutcome {
  return {
    state: "submitted",
    providerPublicationId: id === null || id === undefined ? null : String(id),
    url: url ?? null,
    submittedAt: Date.now(),
    response: { accepted: true },
  };
}

function recordOptions(value: JsonValue): Record<string, JsonValue> {
  return isRecord(value) ? value as Record<string, JsonValue> : {};
}

function stringOption(options: Record<string, JsonValue>, key: string): string | null {
  const value = options[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function booleanOption(options: Record<string, JsonValue>, key: string): boolean | null {
  const value = options[key];
  return typeof value === "boolean" ? value : null;
}

function stringArrayOption(
  options: Record<string, JsonValue>,
  key: string,
): string[] | null {
  const value = options[key];
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function githubPagesConfig(options: Record<string, JsonValue>): GithubPagesConfig {
  const raw = options.githubPages;
  if (!isRecord(raw)) throw new Error("github-pages requires options.githubPages");
  const repoDir = stringOption(raw as Record<string, JsonValue>, "repoDir");
  const contentDir = stringOption(raw as Record<string, JsonValue>, "contentDir");
  if (!repoDir || !contentDir) {
    throw new Error("github-pages requires repoDir and contentDir");
  }
  return {
    repoDir,
    contentDir,
    ...(stringOption(raw as Record<string, JsonValue>, "branch")
      ? { branch: stringOption(raw as Record<string, JsonValue>, "branch")! }
      : {}),
    ...(stringOption(raw as Record<string, JsonValue>, "filename")
      ? { filename: stringOption(raw as Record<string, JsonValue>, "filename")! }
      : {}),
  };
}

const postizMetricAdapter: MetricProviderAdapter = {
  async fetch(request) {
    const id = request.publication.providerPublicationId;
    if (!id) throw new Error("Metric refresh requires a provider Publication ID");
    const days = request.windowStart === null || request.windowEnd === null
      ? 7
      : Math.max(1, Math.ceil((request.windowEnd - request.windowStart) / 86_400_000));
    const result = await postizMetrics(id, days);
    if (!result.ok) return { note: result.note };
    return {
      views: result.metrics.views,
      likes: result.metrics.likes,
      comments: result.metrics.comments,
      shares: result.metrics.shares,
      ctr: result.metrics.ctr,
      raw: JSON.parse(JSON.stringify(result.raw)) as JsonValue,
    };
  },
};

function metricRefreshLabel(input: {
  publicationId: string;
  source: string;
  asOf: number;
  windowStart?: number | null;
  windowEnd?: number | null;
  idempotencyKey: string;
}): string {
  const digest = createHash("sha256").update(JSON.stringify([
    input.publicationId,
    input.source,
    input.asOf,
    input.windowStart ?? null,
    input.windowEnd ?? null,
    input.idempotencyKey,
  ])).digest("hex");
  return `refresh:${digest}`;
}

async function waitForRun(context: QueryContext, runId: string): Promise<void> {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    if (getRun({ context, runId }).state !== "running") return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Metric refresh is still running");
}

function metricRunSnapshots(context: QueryContext, runId: string): MetricSnapshotDto[] {
  return allPages((after) =>
    listRunResults({ context, runId, after, limit: 100 }),
  ).filter((result) => result.entityType === "metric_snapshot")
    .map((result) => getMetricSnapshot({
      context,
      metricSnapshotId: result.entityId,
    }));
}

function sanitizeMetricFacts(facts: MetricProviderFacts): MetricProviderFacts {
  return facts.note == null
    ? facts
    : { ...facts, note: "Metric provider diagnostic unavailable" };
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
