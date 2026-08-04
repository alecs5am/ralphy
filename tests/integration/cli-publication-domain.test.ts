import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  cancelPublication,
  createPostizPublicationAdapter,
  exportMediumPresentation,
  lookupPublication,
  publishPresentation,
  reconcilePublication,
  refreshPublicationMetrics,
  type MetricProviderAdapter,
  type PublicationProviderAdapter,
} from "../../cli/lib/publication.js";
import {
  queryPublicationPerformance,
  queryPublicationPostmortem,
} from "../../cli/lib/analytics/query.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import {
  addArtifactRevision,
  createArtifact,
  resolveArtifactRevisionObject,
} from "../../cli/lib/store/artifacts.js";
import { createDocument, reviseDocument } from "../../cli/lib/store/documents.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import { setCredentialTestSource } from "../../cli/lib/providers/credentials.js";
import {
  finishRun,
  finishRunAttempt,
  listRunResults,
  listRuns,
  recordRunResult,
  startRun,
  startRunAttempt,
} from "../../cli/lib/store/runs.js";
import {
  createProject,
  createWorkspace,
  upsertSocialAccount,
} from "../../cli/lib/store/scopes.js";
import {
  cancelDraftPublication,
  appendMetricSnapshot,
  createUnit,
  getPublication,
  listMetricSnapshots,
  listPublications,
  recordPublication,
  reviseUnit,
} from "../../cli/lib/store/units.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { getRunAggregate } from "../helpers/run-aggregate.js";
import { getUnitAggregate } from "../helpers/unit-aggregate.js";

let roots: TmpRoot[] = [];

afterEach(() => {
  closeDomainDb();
  setCredentialTestSource((_providerId, environmentVariable) =>
    environmentVariable ? process.env[environmentVariable] ?? null : null
  );
  for (const root of roots) root.cleanup();
  roots = [];
});

describe("entity-first Publication controller", () => {
  test("routes manual publish through Medium evidence without a Publication", async () => {
    const fixture = setup("manual-controller", "medium");
    const exported = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      idempotencyKey: "manual-controller",
      rail: "manual",
    });

    expect(listPublications({
      context: fixture.context,
      presentationId: fixture.presentationId,
      limit: 10,
    }).items).toEqual([]);
    expect(getRunAggregate(exported.runId)).toMatchObject({
      kind: "publication-manual-export",
      state: "succeeded",
      objects: [{ purpose: "medium-approval" }],
    });
  });

  test("rejects a social account on manual Medium before creating evidence", async () => {
    const fixture = setup("manual-account", "medium");
    const before = runs(fixture.context).length;

    await expect(publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "manual-account",
      rail: "manual",
    })).rejects.toThrow(/does not accept a social account/);

    expect(runs(fixture.context)).toHaveLength(before);
    expect(listPublications({
      context: fixture.context,
      presentationId: fixture.presentationId,
      limit: 10,
    }).items).toEqual([]);
  });

  test("maps entity presentations to the exact Postiz platform payloads", async () => {
    const previousKey = process.env.POSTIZ_API_KEY;
    const previousBase = process.env.POSTIZ_BASE_URL;
    process.env.POSTIZ_API_KEY = "test-key";
    process.env.POSTIZ_BASE_URL = "https://postiz.test";
    const requests: Array<Record<string, unknown>> = [];
    const adapter = createPostizPublicationAdapter(async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify([{ id: "post-1" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    try {
      for (const platform of ["youtube", "tiktok", "instagram", "x", "telegram"]) {
        await adapter.submit({
          publicationId: `publication-${platform}`,
          platform,
          caption: "Exact caption",
          options: {
            madeWithAi: true,
            youtubeVisibility: "unlisted",
            instagramPostType: "story",
            unsafeProviderSetting: "must-not-pass-through",
          },
          items: [],
          mediaPaths: [],
          socialAccountExternalId: `${platform}-account`,
          scheduledAt: null,
          unitSlug: "exact-post",
          unitFormat: platform === "x" ? "thread" : "post",
          documentBodies: platform === "x"
            ? ['["First post","Second post"]']
            : ["Post body"],
        });
      }
    } finally {
      if (previousKey === undefined) delete process.env.POSTIZ_API_KEY;
      else process.env.POSTIZ_API_KEY = previousKey;
      if (previousBase === undefined) delete process.env.POSTIZ_BASE_URL;
      else process.env.POSTIZ_BASE_URL = previousBase;
    }

    const entries = requests.map((request) => {
      const posts = request.posts as Array<Record<string, unknown>>;
      return posts[0]!;
    });
    expect(entries.map((entry) => entry.settings)).toEqual([
      expect.objectContaining({
        __type: "youtube",
        title: "Exact caption",
        type: "unlisted",
        selfDeclaredMadeForKids: "no",
      }),
      expect.objectContaining({
        __type: "tiktok",
        title: "Exact caption",
        privacy_level: "PUBLIC_TO_EVERYONE",
        video_made_with_ai: true,
      }),
      expect.objectContaining({
        __type: "instagram",
        post_type: "story",
        is_trial_reel: false,
      }),
      expect.objectContaining({
        __type: "x",
        who_can_reply_post: "everyone",
        made_with_ai: true,
      }),
      { __type: "telegram" },
    ]);
    expect(entries.every((entry) =>
      !("unsafeProviderSetting" in (entry.settings as Record<string, unknown>)))
    ).toBe(true);
    expect(entries[3]!.value).toEqual([
      { content: "First post", image: [] },
      { content: "Second post", image: [] },
    ]);
  });

  test("captures the effective presentation and replays a submission without another POST", async () => {
    const fixture = setup("submit-replay", "instagram");
    let submits = 0;
    const adapter = fakeAdapter({
      submit: async (request) => {
        submits += 1;
        expect(request).toMatchObject({
          platform: "instagram",
          caption: "Exact caption",
          options: { placement: "reel" },
          socialAccountExternalId: "instagram-account",
        });
        return {
          state: "submitted",
          providerPublicationId: "post-1",
          url: "https://social.example/post-1",
          submittedAt: Date.now(),
        };
      },
    });

    const first = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "slot-1",
      rail: "postiz",
    }, adapter);
    const replay = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "slot-1",
      rail: "postiz",
    }, adapter);

    expect(submits).toBe(1);
    expect(first.replayed).toBe(false);
    expect(replay).toEqual({ ...first, replayed: true });
    expect(
      listPublications({
        context: fixture.context,
        presentationId: fixture.presentationId,
        limit: 10,
      }).items,
    ).toHaveLength(1);
    expect(getRunAggregate(first.runId)).toMatchObject({
      state: "succeeded",
      attempts: [{ attemptNo: 1, provider: "postiz", state: "succeeded" }],
    });
  });

  test("replays stored submission evidence before resolving disappeared media bytes", async () => {
    const fixture = await setupMedia("replay-missing-media");
    let submits = 0;
    const adapter = fakeAdapter({ submit: async () => {
      submits += 1;
      return { state: "submitted", submittedAt: Date.now(), costUsd: 1 };
    } });
    const input = {
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "replay-missing-media",
      rail: "postiz" as const,
    };
    const first = await publishPresentation(input, adapter);
    fs.rmSync(fixture.objectPath);

    const replay = await publishPresentation(input, adapter);

    expect(replay).toEqual({ ...first, replayed: true });
    expect(submits).toBe(1);
    expect(getRunAggregate(replay.runId).attempts).toHaveLength(1);
  });

  test("retains a validated account when local Object preflight fails", async () => {
    const fixture = await setupMedia("missing-media-preflight");
    fs.rmSync(fixture.objectPath);

    const result = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "missing-media-preflight",
      rail: "postiz",
    }, fakeAdapter());

    expectFailedPreflight(result, fixture.context, {
      failureStage: "preflight",
      socialAccountId: fixture.accountId,
    });
  });

  test("turns a lost submission response into unknown and replay never submits again", async () => {
    const fixture = setup("lost-response", "tiktok");
    let submits = 0;
    const adapter = fakeAdapter({
      submit: async () => {
        submits += 1;
        throw new Error("connection dropped after dispatch");
      },
    });

    const lost = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "lost-slot",
      rail: "postiz",
    }, adapter);
    const replay = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "lost-slot",
      rail: "postiz",
    }, adapter);

    expect(submits).toBe(1);
    expect(lost.publication.state).toBe("unknown");
    expect(replay).toEqual({ ...lost, replayed: true });
    expect(getRunAggregate(lost.runId)).toMatchObject({
      state: "failed",
      attempts: [{ state: "failed" }],
    });
  });

  test("claims an existing draft replay and submits it exactly once", async () => {
    const fixture = setup("draft-replay", "tiktok");
    const run = startRun({ projectId: fixture.projectId, kind: "publication-submit" });
    const draft = recordPublication({
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      submissionRunId: run.id,
      rail: "postiz",
      idempotencyKey: "crash-before-claim",
    });
    let submits = 0;

    const result = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "crash-before-claim",
      rail: "postiz",
    }, fakeAdapter({
      submit: async () => {
        submits += 1;
        return { state: "submitted", submittedAt: Date.now() };
      },
    }));

    expect(result.publication).toMatchObject({ id: draft.id, state: "submitted" });
    expect(result.runId).toBe(run.id);
    expect(submits).toBe(1);
    expect(getRunAggregate(run.id)).toMatchObject({
      state: "succeeded",
      attempts: [{ state: "succeeded" }],
    });
  });

  test("atomically fails an existing draft when local preflight no longer passes", async () => {
    const fixture = await setupMedia("draft-missing-media");
    const run = startRun({
      projectId: fixture.context.projectId,
      kind: "publication-submit",
    });
    const draft = recordPublication({
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      submissionRunId: run.id,
      rail: "postiz",
      idempotencyKey: "draft-missing-media",
    });
    fs.rmSync(fixture.objectPath);
    let submits = 0;

    const result = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "draft-missing-media",
      rail: "postiz",
    }, fakeAdapter({ submit: async () => {
      submits += 1;
      return { state: "submitted", submittedAt: Date.now() };
    } }));

    expect(result).toMatchObject({
      replayed: false,
      publication: { id: draft.id, state: "failed", socialAccountId: fixture.accountId },
    });
    expect(submits).toBe(0);
    expectFailedPreflight(result, fixture.context, {
      failureStage: "preflight",
      socialAccountId: fixture.accountId,
    });
  });

  test("records missing-account preflight failure with exactly one terminal Run", async () => {
    const fixture = setup("missing-account", "tiktok");
    const before = runs(fixture.context).length;
    let submits = 0;

    const result = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      idempotencyKey: "missing-account",
      rail: "postiz",
    }, fakeAdapter({ submit: async () => {
      submits += 1;
      return { state: "submitted", submittedAt: Date.now() };
    } }));

    expect(result.publication).toMatchObject({
      state: "failed",
      socialAccountId: null,
    });
    expect(submits).toBe(0);
    expect(runs(fixture.context)).toHaveLength(before + 1);
    expect(getRunAggregate(result.runId)).toMatchObject({
      state: "failed",
      attempts: [],
    });
    expect(pageItems((after) => listRunResults({
      context: fixture.context,
      runId: result.runId,
      after,
      limit: 100,
    }))).toEqual([
      expect.objectContaining({
        entityType: "publication",
        entityId: result.publication.id,
      }),
    ]);
  });

  test("records invalid account and local rail preflight failures without claims", async () => {
    const fixture = setup("invalid-preflight", "tiktok");
    const other = createWorkspace({ slug: "other-preflight", name: "Other" });
    const wrongAccount = upsertSocialAccount({
      workspaceId: other.id,
      platform: "tiktok",
      externalId: "wrong-account",
    });
    const wrongPlatform = upsertSocialAccount({
      workspaceId: fixture.context.workspaceId,
      platform: "youtube",
      externalId: "wrong-platform",
    });
    const invalidAccounts = await Promise.all([
      wrongAccount.id,
      wrongPlatform.id,
      "acct_missing",
    ].map((socialAccountId, index) => publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId,
      idempotencyKey: `invalid-account-${index}`,
      rail: "postiz",
    })));
    const invalidHashnode = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "invalid-hashnode",
      rail: "hashnode",
    });
    for (const result of invalidAccounts) {
      expectFailedPreflight(result, fixture.context, {
        failureStage: "account-resolution",
        socialAccountId: null,
      });
    }
    await expect(publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: wrongAccount.id,
      idempotencyKey: "invalid-account-0",
      rail: "postiz",
    })).rejects.toThrow(/idempotency key belongs to another attempt/);
    expectFailedPreflight(invalidHashnode, fixture.context, {
      failureStage: "preflight",
      socialAccountId: fixture.accountId,
    });
    const githubFixture = setup("invalid-github", "medium");
    const invalidGithub = await publishPresentation({
      context: githubFixture.context,
      presentationId: githubFixture.presentationId,
      idempotencyKey: "invalid-github",
      rail: "github-pages",
    });
    expectFailedPreflight(invalidGithub, githubFixture.context, {
      failureStage: "preflight",
      socialAccountId: null,
    });
    const platformFixture = setup("invalid-postiz-platform", "mastodon");
    const invalidPlatform = await publishPresentation({
      context: platformFixture.context,
      presentationId: platformFixture.presentationId,
      socialAccountId: platformFixture.accountId,
      idempotencyKey: "invalid-postiz-platform",
      rail: "postiz",
    });
    expectFailedPreflight(invalidPlatform, platformFixture.context, {
      failureStage: "preflight",
      socialAccountId: platformFixture.accountId,
    });
  });

  test("preflights default credentials, Git repositories, and accountless rails before claiming", async () => {
    setCredentialTestSource(() => null);
    for (const rail of ["postiz", "devto", "hashnode"] as const) {
      const fixture = setup(`missing-${rail}-credential`, rail, rail === "hashnode"
        ? { publicationId: "publication-1" }
        : {});
      const result = await publishPresentation({
        context: fixture.context,
        presentationId: fixture.presentationId,
        socialAccountId: fixture.accountId,
        idempotencyKey: `missing-${rail}-credential`,
        rail,
      });
      expectFailedPreflight(result, fixture.context, {
        failureStage: "preflight",
        socialAccountId: fixture.accountId,
      });
    }

    const fakeRepo = path.join(roots[0]!.dir, "fake-repo");
    fs.mkdirSync(path.join(fakeRepo, ".git"), { recursive: true });
    const github = setup("invalid-github-repo", "medium", {
      githubPages: { repoDir: path.relative(process.cwd(), fakeRepo), contentDir: "posts" },
    });
    const invalidRepo = await publishPresentation({
      context: github.context,
      presentationId: github.presentationId,
      idempotencyKey: "invalid-github-repo",
      rail: "github-pages",
    });
    expectFailedPreflight(invalidRepo, github.context, {
      failureStage: "preflight",
      socialAccountId: null,
    });

    const suppliedAccount = await publishPresentation({
      context: github.context,
      presentationId: github.presentationId,
      socialAccountId: github.accountId,
      idempotencyKey: "github-with-account",
      rail: "github-pages",
    });
    expectFailedPreflight(suppliedAccount, github.context, {
      failureStage: "account-resolution",
      socialAccountId: null,
    });
  });

  test("rejects a newly supplied account on an accountless terminal replay", async () => {
    const fixture = setup("github-replay-account", "medium");
    const first = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      idempotencyKey: "github-replay-account",
      rail: "github-pages",
    }, fakeAdapter());
    expect(first.publication.state).toBe("submitted");

    await expect(publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "github-replay-account",
      rail: "github-pages",
    }, fakeAdapter())).rejects.toThrow(/idempotency key belongs to another attempt/);
    expect(getRunAggregate(first.runId).attempts).toHaveLength(1);
  });


  test("supports every advertised non-Medium rail with exact account rules", async () => {
    let submits = 0;
    for (const rail of ["devto", "hashnode", "github-pages"] as const) {
      const fixture = setup(`rail-${rail}`, rail);
      const needsAccount = rail === "devto" || rail === "hashnode";
      const result = await publishPresentation({
        context: fixture.context,
        presentationId: fixture.presentationId,
        ...(needsAccount ? { socialAccountId: fixture.accountId } : {}),
        idempotencyKey: `rail-${rail}`,
        rail,
      }, fakeAdapter({ submit: async () => {
        submits += 1;
        return { state: "submitted", submittedAt: Date.now() };
      } }));
      expect(result.publication).toMatchObject({
        rail,
        state: "submitted",
        socialAccountId: needsAccount ? fixture.accountId : null,
      });
    }
    expect(submits).toBe(3);
  });

  test("expires a submission fence during the provider call without a running row", async () => {
    const fixture = setup("expired-submit", "tiktok");
    const result = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "expired-submit",
      rail: "postiz",
      leaseMs: 1,
    }, fakeAdapter({ submit: async () => {
      await Bun.sleep(5);
      return { state: "submitted", submittedAt: Date.now() };
    } }));

    expect(result.publication.state).toBe("unknown");
    expect(getRunAggregate(result.runId)).toMatchObject({
      state: "failed",
      attempts: [{ state: "failed" }],
    });
  });

  test("lookup, provider cancel, reconciliation, and draft cancel never reuse submission", async () => {
    const fixture = setup("follow-ups", "youtube");
    const calls = { submit: 0, lookup: 0, cancel: 0 };
    const adapter = fakeAdapter({
      submit: async () => {
        calls.submit += 1;
        return {
          state: "scheduled",
          providerPublicationId: "scheduled-1",
          submittedAt: Date.now(),
        };
      },
      lookup: async () => {
        calls.lookup += 1;
        return { state: "scheduled", operationState: "succeeded" };
      },
      cancel: async () => {
        calls.cancel += 1;
        return { state: "cancelled", operationState: "succeeded" };
      },
    });
    const submitted = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "follow-up-slot",
      rail: "postiz",
      scheduledAt: Date.now() + 60_000,
    }, adapter);
    const lookedUp = await lookupPublication({
      context: fixture.context,
      publicationId: submitted.publication.id,
      expectedState: "scheduled",
    }, adapter);
    const cancelled = await cancelPublication({
      context: fixture.context,
      publicationId: submitted.publication.id,
      expectedState: "scheduled",
    }, adapter);

    expect(calls).toEqual({ submit: 1, lookup: 1, cancel: 1 });
    expect(new Set([submitted.runId, lookedUp.runId, cancelled.runId]).size).toBe(3);
    expect(cancelled.publication.state).toBe("cancelled");

    const draftRun = startRun({ projectId: fixture.projectId, kind: "publication-submit" });
    const draft = recordPublication({
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      submissionRunId: draftRun.id,
      rail: "postiz",
      idempotencyKey: "draft-slot",
    });
    const local = await cancelPublication({
      context: fixture.context,
      publicationId: draft.id,
      expectedState: "draft",
    }, adapter);
    expect(local.runId).toBe(draftRun.id);
    expect(getRunAggregate(draftRun.id)).toMatchObject({
      state: "cancelled",
      attempts: [],
    });
    expect(calls).toEqual({ submit: 1, lookup: 1, cancel: 1 });

    const uncertainRun = startRun({ projectId: fixture.projectId, kind: "publication-submit" });
    const uncertain = recordPublication({
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      submissionRunId: uncertainRun.id,
      rail: "postiz",
      idempotencyKey: "reconcile-slot",
    });
    // Create a terminal uncertain submission without involving a provider mock.
    const uncertainClaim = (await import("../../cli/lib/store/units.js")).claimPublication(
      uncertain.id,
      "draft",
      60_000,
    );
    (await import("../../cli/lib/store/units.js")).finishPublicationClaim(uncertain.id, {
      fence: uncertainClaim.fence,
      state: "unknown",
      error: "provider outcome unknown",
    });
    const reconciled = await reconcilePublication({
      context: fixture.context,
      publicationId: uncertain.id,
      expectedState: "unknown",
    }, adapter);
    expect(reconciled.publication.state).toBe("scheduled");
    expect(reconciled.runId).not.toBe(uncertainRun.id);
    expect(calls).toEqual({ submit: 1, lookup: 2, cancel: 1 });

    // Ensure the direct store helper still agrees with the controller's local path.
    expect(() => cancelDraftPublication(draft.id, "draft")).toThrow(/conflict/i);
    expect(getPublication({ context: fixture.context, publicationId: draft.id }).state).toBe("cancelled");
  });

  test("refuses unsupported follow-ups before claiming a non-Postiz Publication", async () => {
    const fixture = setup("unsupported-followup", "tiktok");
    const published = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "devto-submit",
      rail: "devto",
    }, fakeAdapter());
    const before = runs(fixture.context).length;

    await expect(lookupPublication({
      context: fixture.context,
      publicationId: published.publication.id,
      expectedState: "submitted",
    })).rejects.toThrow(/does not support status lookup/);
    expect(runs(fixture.context)).toHaveLength(before);
  });

  test("a rejected follow-up claim creates no orphan Run", async () => {
    const fixture = setup("follow-up-conflict", "tiktok");
    const submitted = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "follow-up-conflict",
      rail: "postiz",
    }, fakeAdapter());
    const before = runs(fixture.context).length;

    await expect(lookupPublication({
      context: fixture.context,
      publicationId: submitted.publication.id,
      expectedState: "scheduled",
    }, fakeAdapter())).rejects.toThrow(/conflict/i);
    expect(runs(fixture.context)).toHaveLength(before);
  });

  test("expires a lookup fence during the provider call and closes its Run", async () => {
    const fixture = setup("expired-lookup", "tiktok");
    const scheduled = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "expired-lookup-submit",
      rail: "postiz",
      scheduledAt: Date.now() + 60_000,
    }, fakeAdapter({ submit: async () => ({
      state: "scheduled",
      providerPublicationId: "scheduled-expiry",
      submittedAt: Date.now(),
    }) }));
    const lookup = await lookupPublication({
      context: fixture.context,
      publicationId: scheduled.publication.id,
      expectedState: "scheduled",
      leaseMs: 1,
    }, fakeAdapter({ lookup: async () => {
      await Bun.sleep(5);
      return { state: "scheduled", operationState: "succeeded" };
    } }));

    expect(lookup.publication.state).toBe("scheduled");
    expect(getRunAggregate(lookup.runId)).toMatchObject({
      state: "failed",
      attempts: [{ state: "failed" }],
    });
  });

  test("exports Medium approval evidence as a RunObject without a Publication", async () => {
    const fixture = setup("medium-export", "medium");
    const exported = await exportMediumPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
    });

    expect(
      listPublications({
        context: fixture.context,
        presentationId: fixture.presentationId,
        limit: 10,
      }).items,
    ).toEqual([]);
    expect(getRunAggregate(exported.runId)).toMatchObject({
      kind: "publication-manual-export",
      state: "succeeded",
      attempts: [],
      objects: [{ purpose: "medium-approval", state: "ready" }],
    });
    expect(getRunAggregate(exported.runId).objects[0]!.objectId).not.toBeNull();
    expect(exported.object).not.toHaveProperty("path");
  });

  test("rolls back Medium Object evidence and closes the Run when completion fails", async () => {
    const fixture = setup("medium-export-rollback", "medium");
    openDomainDb().exec(`
      CREATE TRIGGER reject_medium_success
      BEFORE UPDATE OF state ON runs
      WHEN NEW.kind = 'publication-manual-export' AND NEW.state = 'succeeded'
      BEGIN SELECT RAISE(ABORT, 'injected Medium completion failure'); END;
    `);

    await expect(exportMediumPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
    })).rejects.toThrow(/injected Medium completion failure/);

    const mediumRuns = runs(fixture.context).filter((run) =>
      run.kind === "publication-manual-export"
    );
    expect(mediumRuns).toEqual([expect.objectContaining({ state: "failed" })]);
    expect(getRunAggregate(mediumRuns[0]!.id).objects).toEqual([]);
  });

  test("refresh appends nullable source/window facts and replays the original snapshot IDs", async () => {
    const fixture = setup("metric-refresh", "tiktok");
    const published = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "metric-publication",
      rail: "postiz",
    }, fakeAdapter());
    let fetches = 0;
    const metrics: MetricProviderAdapter = {
      fetch: async () => {
        fetches += 1;
        return {
          views: 12,
          likes: 0,
          comments: null,
          shares: 2,
          ctr: null,
          retentionCurve: null,
          avgViewDurationSec: null,
          note: "provider omitted retention",
          raw: { unknownProviderFact: true },
        };
      },
    };
    const input = {
      context: fixture.context,
      publicationId: published.publication.id,
      source: "postiz",
      asOf: 1_000,
      windowStart: 100,
      windowEnd: 1_000,
      idempotencyKey: "refresh-slot",
    } as const;
    const first = await refreshPublicationMetrics(input, metrics);
    const replay = await refreshPublicationMetrics(input, metrics);

    expect(fetches).toBe(1);
    expect(replay).toEqual({ ...first, replayed: true });
    expect(first.snapshots).toHaveLength(1);
    expect(first.snapshots[0]).toMatchObject({
      publicationId: published.publication.id,
      source: "postiz",
      asOf: 1_000,
      windowStart: 100,
      windowEnd: 1_000,
      views: 12,
      likes: 0,
      comments: null,
      ctr: null,
      retentionCurve: null,
      avgViewDurationSec: null,
      note: "Metric provider diagnostic unavailable",
    });
    expect(first.snapshots[0]).not.toHaveProperty("raw");
  });

  test("concurrent Metric refreshes converge on one fetch and one result set", async () => {
    const fixture = setup("metric-concurrent", "tiktok");
    const published = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "metric-concurrent-publication",
      rail: "postiz",
    }, fakeAdapter());
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let fetches = 0;
    const adapter: MetricProviderAdapter = { fetch: async () => {
      fetches += 1;
      await gate;
      return { views: 20, comments: null };
    } };
    const input = {
      context: fixture.context,
      publicationId: published.publication.id,
      source: "postiz",
      asOf: 2_000,
      idempotencyKey: "metric-concurrent",
    } as const;

    const firstPromise = refreshPublicationMetrics(input, adapter);
    await Bun.sleep(1);
    const secondPromise = refreshPublicationMetrics(input, adapter);
    release();
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(fetches).toBe(1);
    expect(second).toEqual({ ...first, replayed: true });
    expect(first.snapshots).toHaveLength(1);
  });

  test("Metric completion rollback leaves no partial snapshot and closes the Run", async () => {
    const fixture = setup("metric-rollback", "tiktok");
    const published = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "metric-rollback-publication",
      rail: "postiz",
    }, fakeAdapter());
    openDomainDb().exec(`
      CREATE TRIGGER reject_metric_success
      BEFORE UPDATE OF state ON run_attempts
      WHEN NEW.state = 'succeeded'
      BEGIN SELECT RAISE(ABORT, 'injected metric completion failure'); END;
    `);

    await expect(refreshPublicationMetrics({
      context: fixture.context,
      publicationId: published.publication.id,
      source: "postiz",
      asOf: 3_000,
      idempotencyKey: "metric-rollback",
    }, { fetch: async () => ({ views: 30 }) })).rejects.toThrow(
      /injected metric completion failure/,
    );

    expect(pageItems((after) => listMetricSnapshots({
      context: fixture.context,
      publicationId: published.publication.id,
      after,
      limit: 100,
    }))).toEqual([]);
    expect(runs(fixture.context).filter((run) => run.kind === "metric-refresh")).toEqual([
      expect.objectContaining({ state: "failed" }),
    ]);
  });

  test("sanitizes unsafe provider notes before storing public Metric facts", async () => {
    const fixture = setup("metric-safe-note", "tiktok");
    const published = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "metric-safe-note-publication",
      rail: "postiz",
    }, fakeAdapter());
    const unsafe = "Bearer abc API_KEY=secret token=x file:///Users/me/.env /Users/me/key\ncredential text";
    const refreshed = await refreshPublicationMetrics({
      context: fixture.context,
      publicationId: published.publication.id,
      source: "postiz",
      asOf: 4_000,
      idempotencyKey: "metric-safe-note",
    }, { fetch: async () => ({ note: unsafe }) });

    expect(refreshed.snapshots[0]!.note).toBe("Metric provider diagnostic unavailable");
  });

  test("replays a failed Metric refresh as the original failure", async () => {
    const fixture = setup("metric-failed-replay", "tiktok");
    const published = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "metric-failed-publication",
      rail: "postiz",
    }, fakeAdapter());
    const input = {
      context: fixture.context,
      publicationId: published.publication.id,
      source: "postiz",
      asOf: 5_000,
      idempotencyKey: "failed-refresh",
    } as const;
    await expect(refreshPublicationMetrics(input, {
      fetch: async () => { throw new Error("first failure"); },
    })).rejects.toThrow("first failure");
    await expect(refreshPublicationMetrics(input, {
      fetch: async () => ({ views: 999 }),
    })).rejects.toThrow(/Metric refresh failed/);
  });

  test("reports filter-first ROI with submission cost and immutable Unit provenance", async () => {
    const fixture = setup("analytics-roi", "tiktok");
    const published = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "analytics-publication",
      rail: "postiz",
    }, fakeAdapter({
      submit: async () => ({
        state: "submitted",
        submittedAt: Date.now(),
        costUsd: 2.5,
      }),
    }));
    const productionRun = startRun({ projectId: fixture.projectId, kind: "document-generation" });
    const productionAttempt = startRunAttempt({
      runId: productionRun.id,
      provider: "fixture",
    });
    recordRunResult(openDomainDb(), {
      runId: productionRun.id,
      position: 0,
      entityType: "document_revision",
      entityId: fixture.bodyRevisionId,
    });
    finishRunAttempt(productionAttempt.id, { state: "succeeded", costUsd: 1.5 });
    finishRun(productionRun.id, { state: "succeeded" });
    const zeroRun = startRun({ projectId: fixture.projectId, kind: "metric-refresh" });
    appendMetricSnapshot({
      publicationId: published.publication.id,
      runId: zeroRun.id,
      position: 0,
      source: "postiz",
      asOf: 1_000,
      views: 0,
    });
    const tieRuns = [
      startRun({ projectId: fixture.projectId, kind: "metric-refresh" }),
      startRun({ projectId: fixture.projectId, kind: "metric-refresh" }),
    ];
    setSystemTime(2_000);
    const tied = tieRuns.map((run, index) => appendMetricSnapshot({
        publicationId: published.publication.id,
        runId: run.id,
        position: 0,
        source: "postiz",
        asOf: 2_000,
        views: index === 0 ? 500 : 1_000,
      }));
    setSystemTime();
    expect(tied[0]!.createdAt).toBe(tied[1]!.createdAt);
    const winningTie = [...tied].sort((left, right) => right.id.localeCompare(left.id))[0]!;
    reviseUnit({
      unitId: fixture.unitId,
      expectedLatestRevisionId: fixture.revisionId,
      items: [{ documentRevisionId: fixture.bodyRevisionId, role: "body", position: 0 }],
      presentations: [],
      note: "later revision must not replace publication provenance",
    });

    const newest = queryPublicationPerformance({
      context: fixture.context,
      publicationIds: [published.publication.id],
      source: "postiz",
      asOf: 2_000,
    }).publications[0]!;
    expect(newest).toMatchObject({
      snapshot: { id: winningTie.id, views: winningTie.views },
      costUsd: 4,
      costPerThousandViews: (4 * 1_000) / winningTie.views!,
      provenance: {
        unitId: fixture.unitId,
        slug: "post",
        revisionId: fixture.revisionId,
        revisionNo: 1,
        parentRevisionId: null,
      },
    });

    const zero = queryPublicationPerformance({
      context: fixture.context,
      publicationIds: [published.publication.id],
      source: "postiz",
      asOf: 1_000,
    }).publications[0]!;
    expect(zero.snapshot?.views).toBe(0);
    expect(zero.costPerThousandViews).toBeNull();
    const noMatch = queryPublicationPerformance({
      context: fixture.context,
      publicationIds: [published.publication.id],
      source: "missing-source",
    }).publications[0]!;
    expect(noMatch.snapshot).toBeNull();
    expect(noMatch.costPerThousandViews).toBeNull();

    const postmortem = queryPublicationPostmortem({
      context: fixture.context,
      publicationIds: [published.publication.id],
      source: "postiz",
    });
    expect(postmortem.evidence).toEqual([
      expect.objectContaining({
        publicationId: published.publication.id,
        inputRevisionIds: [fixture.bodyRevisionId],
        contributingRuns: expect.arrayContaining([
          expect.objectContaining({ runId: productionRun.id, costUsd: 1.5 }),
        ]),
      }),
    ]);
  });

  test("attributes spend only to the effective ordered Presentation subset", async () => {
    const fixture = setupDocuments("analytics-subset", [2, 0]);
    const published = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "analytics-subset",
      rail: "postiz",
    }, fakeAdapter({ submit: async () => ({
      state: "submitted",
      submittedAt: Date.now(),
      costUsd: 2,
    }) }));
    const firstIncludedRun = costedRevisionRun(fixture.projectId, fixture.bodyRevisionIds[0]!, 3);
    const excludedRun = costedRevisionRun(fixture.projectId, fixture.bodyRevisionIds[1]!, 4);
    const secondIncludedRun = costedRevisionRun(fixture.projectId, fixture.bodyRevisionIds[2]!, 5);

    const result = queryPublicationPerformance({
      context: fixture.context,
      publicationIds: [published.publication.id],
    }).publications[0]!;

    expect(result.costUsd).toBe(10);
    expect(result.spendEvidence.inputRevisionIds).toEqual([
      fixture.bodyRevisionIds[2],
      fixture.bodyRevisionIds[0],
    ]);
    expect(result.spendEvidence.contributingRuns.map((run) => run.runId)).toContain(firstIncludedRun);
    expect(result.spendEvidence.contributingRuns.map((run) => run.runId)).toContain(secondIncludedRun);
    expect(result.spendEvidence.contributingRuns.map((run) => run.runId)).not.toContain(excludedRun);
  });

  test("deduplicates shared contributing Runs across Publication totals", async () => {
    const fixture = setup("analytics-shared-run", "tiktok");
    const publish = (idempotencyKey: string) => publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey,
      rail: "postiz",
    }, fakeAdapter({ submit: async () => ({
      state: "submitted",
      submittedAt: Date.now(),
      costUsd: 2,
    }) }));
    const [first, second] = await Promise.all([publish("shared-1"), publish("shared-2")]);
    costedRevisionRun(fixture.projectId, fixture.bodyRevisionId, 3);

    const result = queryPublicationPerformance({
      context: fixture.context,
      publicationIds: [first.publication.id, second.publication.id],
    });

    expect(result.publications.map((row) => row.costUsd)).toEqual([5, 5]);
    expect(result.totals.costUsd).toBe(7);
  });

  test("marks Publication spend incomplete when any contributing Attempt cost is null", async () => {
    const fixture = setup("analytics-null-cost", "tiktok");
    const published = await publishPresentation({
      context: fixture.context,
      presentationId: fixture.presentationId,
      socialAccountId: fixture.accountId,
      idempotencyKey: "analytics-null-cost",
      rail: "postiz",
    }, fakeAdapter({ submit: async () => ({
      state: "submitted",
      submittedAt: Date.now(),
      costUsd: 2,
    }) }));
    costedRevisionRun(fixture.projectId, fixture.bodyRevisionId, null);

    const result = queryPublicationPerformance({
      context: fixture.context,
      publicationIds: [published.publication.id],
    });

    expect(result.publications[0]!.costUsd).toBeNull();
    expect(result.publications[0]!.spendEvidence.costComplete).toBe(false);
    expect(result.totals.costUsd).toBeNull();
    expect(result.totals.costComplete).toBe(false);
  });
});

function setup(slug: string, platform: string, options: Record<string, unknown> = { placement: "reel" }) {
  roots.push(makeTmpRoot(`ralphy-publication-${slug}`));
  const workspace = createWorkspace({ slug, name: slug });
  const project = createProject({ workspaceId: workspace.id, slug: "delivery", name: "Delivery" });
  const document = createDocument({
    projectId: project.id,
    slug: "body",
    title: "Body",
    kind: "brief",
  });
  const body = reviseDocument({
    documentId: document.id,
    expectedCurrentRevisionId: null,
    format: "text",
    body: "Post body",
  });
  const unit = createUnit({ projectId: project.id, slug: "post", format: "post" });
  const revision = reviseUnit({
    unitId: unit.id,
    expectedLatestRevisionId: null,
    items: [{ documentRevisionId: body.id, role: "body", position: 0 }],
    presentations: [{
      platform,
      caption: "Exact caption",
      options,
    }],
  });
  const presentationId = getUnitAggregate(unit.id).revisions[0]!.presentations[0]!.id;
  const account = upsertSocialAccount({
    workspaceId: workspace.id,
    platform,
    externalId: `${platform}-account`,
  });
  return {
    projectId: project.id,
    unitId: unit.id,
    revisionId: revision.id,
    bodyRevisionId: body.id,
    presentationId,
    accountId: account.id,
    context: { workspaceId: workspace.id, projectId: project.id } as const,
  };
}

async function setupMedia(slug: string) {
  roots.push(makeTmpRoot(`ralphy-publication-${slug}`));
  const root = roots.at(-1)!;
  const workspace = createWorkspace({ slug, name: slug });
  const project = createProject({ workspaceId: workspace.id, slug: "delivery", name: "Delivery" });
  const sourcePath = path.join(root.dir, "media.bin");
  fs.writeFileSync(sourcePath, "media");
  const object = await ingestObject({
    scope: { workspaceId: workspace.id, projectId: project.id },
    sourcePath,
    originalName: "media.bin",
    mime: "application/octet-stream",
    storageClass: "durable",
  });
  const artifact = createArtifact({ projectId: project.id, slug: "media", kind: "video" });
  const artifactRevision = addArtifactRevision({
    artifactId: artifact.id,
    objectId: object.id,
    state: "approved",
  });
  const unit = createUnit({ projectId: project.id, slug: "post", format: "post" });
  reviseUnit({
    unitId: unit.id,
    expectedLatestRevisionId: null,
    items: [{ artifactRevisionId: artifactRevision.id, role: "media", position: 0 }],
    presentations: [{ platform: "tiktok", caption: "Media", options: {} }],
  });
  const presentationId = getUnitAggregate(unit.id).revisions[0]!.presentations[0]!.id;
  const account = upsertSocialAccount({
    workspaceId: workspace.id,
    platform: "tiktok",
    externalId: "tiktok-account",
  });
  return {
    context: { workspaceId: workspace.id, projectId: project.id } as const,
    presentationId,
    accountId: account.id,
    objectPath: resolveArtifactRevisionObject({
      context: { workspaceId: workspace.id, projectId: project.id },
      revisionId: artifactRevision.id,
    }).objectPath,
  };
}

function setupDocuments(slug: string, selectedPositions: number[]) {
  roots.push(makeTmpRoot(`ralphy-publication-${slug}`));
  const workspace = createWorkspace({ slug, name: slug });
  const project = createProject({ workspaceId: workspace.id, slug: "delivery", name: "Delivery" });
  const bodyRevisionIds = ["first", "second", "third"].map((name) => {
    const document = createDocument({
      projectId: project.id,
      slug: name,
      title: name,
      kind: "brief",
    });
    return reviseDocument({
      documentId: document.id,
      expectedCurrentRevisionId: null,
      format: "text",
      body: name,
    }).id;
  });
  const unit = createUnit({ projectId: project.id, slug: "post", format: "post" });
  reviseUnit({
    unitId: unit.id,
    expectedLatestRevisionId: null,
    items: bodyRevisionIds.map((documentRevisionId, position) => ({
      documentRevisionId,
      role: "body",
      position,
    })),
    presentations: [{
      platform: "tiktok",
      caption: "Subset",
      options: {},
      items: selectedPositions.map((unitItemPosition, position) => ({
        unitItemPosition,
        position,
      })),
    }],
  });
  const presentationId = getUnitAggregate(unit.id).revisions[0]!.presentations[0]!.id;
  const account = upsertSocialAccount({
    workspaceId: workspace.id,
    platform: "tiktok",
    externalId: "tiktok-account",
  });
  return {
    projectId: project.id,
    bodyRevisionIds,
    presentationId,
    accountId: account.id,
    context: { workspaceId: workspace.id, projectId: project.id } as const,
  };
}

function costedRevisionRun(projectId: string, revisionId: string, costUsd: number | null): string {
  const run = startRun({ projectId, kind: "document-generation" });
  const attempt = startRunAttempt({ runId: run.id, provider: "fixture" });
  recordRunResult(openDomainDb(), {
    runId: run.id,
    position: 0,
    entityType: "document_revision",
    entityId: revisionId,
  });
  finishRunAttempt(attempt.id, { state: "succeeded", costUsd });
  finishRun(run.id, { state: "succeeded" });
  return run.id;
}

function fakeAdapter(
  overrides: Partial<PublicationProviderAdapter> = {},
): PublicationProviderAdapter {
  return {
    submit: async () => ({ state: "submitted", submittedAt: Date.now() }),
    lookup: async () => ({ state: "submitted", operationState: "succeeded" }),
    cancel: async () => ({ state: "cancelled", operationState: "succeeded" }),
    ...overrides,
  };
}

function expectFailedPreflight(
  result: Awaited<ReturnType<typeof publishPresentation>>,
  context: ReturnType<typeof setup>["context"],
  expected: { failureStage: "account-resolution" | "preflight"; socialAccountId: string | null },
) {
  if (!("publication" in result)) throw new Error("Expected Publication result");
  expect(result.publication).toMatchObject({
    state: "failed",
    socialAccountId: expected.socialAccountId,
  });
  expect(openDomainDb().query<{ failureStage: string | null }, [string]>(
    "SELECT failure_stage AS failureStage FROM publications WHERE id = ?",
  ).get(result.publication.id)).toEqual({ failureStage: expected.failureStage });
  expect(getRunAggregate(result.runId)).toMatchObject({ state: "failed", attempts: [] });
  expect(listRunResults({ context, runId: result.runId, limit: 10 }).items).toEqual([
    expect.objectContaining({ entityType: "publication" }),
  ]);
}

function runs(context: ReturnType<typeof setup>["context"]) {
  return pageItems((after) => listRuns({ context, after, limit: 100 }));
}

function pageItems<T>(
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
