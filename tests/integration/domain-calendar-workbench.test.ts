import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  createCalendarEvent,
  getCalendarWorkspace,
  removeCalendarEvent,
  rescheduleCalendarEvent,
  retryCalendarEvent,
  submitCalendarEvent,
} from "../../cli/lib/calendar/workbench.js";
import type { PublicationProviderAdapter } from "../../cli/lib/publication.js";
import { clearCommandContext, setCommandContext } from "../../cli/lib/context-state.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { createDocument, reviseDocument } from "../../cli/lib/store/documents.js";
import { newDomainId } from "../../cli/lib/store/ids.js";
import { startRun } from "../../cli/lib/store/runs.js";
import {
  createProject,
  createWorkspace,
  upsertSocialAccount,
} from "../../cli/lib/store/scopes.js";
import {
  appendMetricSnapshot,
  claimPublication,
  createUnitWithRevision,
  finishPublicationClaim,
  listUnitPresentations,
  recordPublication,
  reviseUnit,
  selectUnitRevision,
} from "../../cli/lib/store/units.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let root: TmpRoot;
let restoreClock = () => {};

/* The fixture schedules against absolute instants, and the schema requires
   scheduled_at >= created_at. Anchor the clock just before `at` so every row
   this test writes is created before the instants it schedules, whatever the
   real date is, and keep it monotonic so creation order stays deterministic. */
const at = Date.parse("2026-08-20T07:00:00.000Z");
/* Month windows come off the same anchor: 0 is the month holding `at`, 1 the
   month after it. */
const monthStart = (offset: number) => {
  const anchor = new Date(at);
  return new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + offset, 1))
    .toISOString();
};

beforeEach(() => {
  root = makeTmpRoot("ralphy-calendar-workbench");
  let ms = at - 10_000;
  const clock = spyOn(Date, "now").mockImplementation(() => ms++);
  restoreClock = () => clock.mockRestore();
});

afterEach(() => {
  restoreClock();
  clearCommandContext();
  closeDomainDb();
  root.cleanup();
});

describe("Calendar workbench projection", () => {
  test("groups channel publications, derives ready states, and submits a local draft", async () => {
    const workspace = createWorkspace({ slug: "ux-lab", name: "UX Testing Lab" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "autumn-drop",
      name: "Autumn drop",
    });
    setCommandContext({ kind: "scope", workspaceId: workspace.id });
    const document = createDocument({
      projectId: project.id,
      kind: "custom",
      slug: "calendar-caption",
      title: "Calendar caption",
    });
    const documentRevision = reviseDocument({
      documentId: document.id,
      expectedHeadId: null,
      format: "markdown",
      body: "Calendar content",
    });
    const items = [{
      documentRevisionId: documentRevision.id,
      role: "primary",
      position: 0,
    }];

    const eventRevision = createUnitWithRevision({
      projectId: project.id,
      slug: "beach-vacation-remix",
      format: "video",
      items,
      presentations: [
        { platform: "instagram", caption: "Beach vacation" },
        { platform: "youtube", caption: "Beach vacation" },
      ],
    });
    selectUnitRevision({
      unitId: eventRevision.unitId,
      revisionId: eventRevision.id,
      expectedSelectedRevisionId: null,
    });
    const presentations = listUnitPresentations({
      context: { workspaceId: workspace.id, projectId: project.id },
      revisionId: eventRevision.id,
      limit: 10,
    }).items;
    const instagram = upsertSocialAccount({
      workspaceId: workspace.id,
      platform: "instagram",
      externalId: "instagram-ralphy-ai",
      displayName: "@ralphy.ai",
      username: "ralphy.ai",
    });
    const disconnectedInstagram = upsertSocialAccount({
      workspaceId: workspace.id,
      platform: "instagram",
      externalId: "instagram-studio",
      displayName: "@ralphy.studio",
      username: "ralphy.studio",
    });
    openDomainDb().prepare(
      "UPDATE social_accounts SET relink_required = 1 WHERE id = ?",
    ).run(disconnectedInstagram.id);
    const youtube = upsertSocialAccount({
      workspaceId: workspace.id,
      platform: "youtube",
      externalId: "youtube-ralphy",
      displayName: "Ralphy",
    });
    const publishedRun = startRun({ projectId: project.id, kind: "publication-submit" });
    const publishedDraft = recordPublication({
      presentationId: presentations.find((item) => item.platform === "instagram")!.id,
      socialAccountId: instagram.id,
      submissionRunId: publishedRun.id,
      rail: "postiz",
      idempotencyKey: "calendar-instagram",
      scheduledAt: at,
    });
    const publishedClaim = claimPublication(publishedDraft.id, "draft", 60_000);
    const published = finishPublicationClaim(publishedDraft.id, {
      fence: publishedClaim.fence,
      state: "published",
      providerPublicationId: "postiz-instagram",
      url: "https://example.test/instagram",
      submittedAt: at - 1_000,
      publishedAt: at,
    });
    const failedRun = startRun({ projectId: project.id, kind: "publication-submit" });
    recordPublication({
      presentationId: presentations.find((item) => item.platform === "youtube")!.id,
      socialAccountId: youtube.id,
      submissionRunId: failedRun.id,
      rail: "postiz",
      idempotencyKey: "calendar-youtube",
      scheduledAt: at,
      state: "failed",
      error: "Thumbnail missing",
      failureStage: "preflight",
    });
    const metricRun = startRun({ projectId: project.id, kind: "metric-refresh" });
    appendMetricSnapshot({
      publicationId: published.id,
      runId: metricRun.id,
      position: 0,
      source: "postiz",
      asOf: at + 60_000,
      views: 1_200,
      likes: 84,
    });
    openDomainDb().prepare(
      `INSERT INTO calendar_entries
       (id, workspace_id, kind, scheduled_at, unit_type,
        platforms_json, state, unit_revision_id, metadata_json,
        created_at, updated_at)
       VALUES (?, ?, 'entry', ?, ?, ?, 'scheduled', ?, '{}', ?, ?)`,
    ).run(
      newDomainId("calendar"),
      workspace.id,
      at,
      "video",
      JSON.stringify(["instagram", "youtube"]),
      eventRevision.id,
      at - 10_000,
      at - 10_000,
    );

    const readyRevision = createUnitWithRevision({
      projectId: project.id,
      slug: "ready-unit",
      format: "video",
      items,
      presentations: [
        { platform: "instagram", caption: "Ready" },
        { platform: "youtube", caption: "Ready" },
      ],
    });
    selectUnitRevision({
      unitId: readyRevision.unitId,
      revisionId: readyRevision.id,
      expectedSelectedRevisionId: null,
    });

    const reviewRevision = createUnitWithRevision({
      projectId: project.id,
      slug: "review-unit",
      format: "video",
      items,
      presentations: [{ platform: "instagram", caption: "Review" }],
    });
    reviseUnit({
      unitId: reviewRevision.unitId,
      expectedLatestRevisionId: reviewRevision.id,
      items,
      presentations: [{ platform: "instagram", caption: "Review v2" }],
    });
    selectUnitRevision({
      unitId: reviewRevision.unitId,
      revisionId: reviewRevision.id,
      expectedSelectedRevisionId: null,
    });

    createUnitWithRevision({
      projectId: project.id,
      slug: "blocked-unit",
      format: "video",
      items,
      presentations: [],
    });

    const draftRevision = createUnitWithRevision({
      projectId: project.id,
      slug: "draft-unit",
      format: "video",
      items,
      presentations: [{ platform: "instagram", caption: "Draft" }],
    });
    selectUnitRevision({
      unitId: draftRevision.unitId,
      revisionId: draftRevision.id,
      expectedSelectedRevisionId: null,
    });
    openDomainDb().prepare(
      `INSERT INTO calendar_entries
       (id, workspace_id, kind, scheduled_at, unit_type,
        platforms_json, state, unit_revision_id, metadata_json,
        created_at, updated_at)
       VALUES (?, ?, 'entry', NULL, ?, ?, 'queued', ?, '{}', ?, ?)`,
    ).run(
      newDomainId("calendar"),
      workspace.id,
      "video",
      JSON.stringify(["instagram"]),
      draftRevision.id,
      at - 9_000,
      at - 9_000,
    );

    const calendar = getCalendarWorkspace({
      context: { workspaceId: workspace.id },
      from: monthStart(0),
      to: monthStart(1),
      timezone: "Europe/Berlin",
    });

    expect(calendar.events).toHaveLength(2);
    expect(calendar.events.find((event) => event.unitId === eventRevision.unitId)).toMatchObject({
      title: "Beach vacation remix",
      project: "Autumn drop",
      pinnedRevision: 1,
      unitSelectedRevision: 1,
      status: "partial",
      at,
      channels: [
        expect.objectContaining({ platform: "instagram", status: "published" }),
        expect.objectContaining({ platform: "youtube", status: "failed", error: "Thumbnail missing" }),
      ],
      metrics: expect.objectContaining({ views: 1_200, likes: 84, syncedAt: at + 60_000 }),
    });
    expect(Object.fromEntries(
      calendar.readyUnits.map((unit) => [unit.title, unit.readiness]),
    )).toEqual({
      "Ready unit": "ready",
      "Review unit": "review",
      "Blocked unit": "blocked",
      "Draft unit": "draft",
    });
    expect(calendar.readyUnits.find((unit) => unit.title === "Ready unit")?.channels).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: "instagram", socialAccountId: instagram.id }),
      expect.objectContaining({ platform: "instagram", socialAccountId: disconnectedInstagram.id }),
      expect.objectContaining({ platform: "youtube", socialAccountId: youtube.id }),
    ]));
    expect(calendar.accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: disconnectedInstagram.id, disconnected: true, rowVersion: 1 }),
    ]));
    expect(calendar.readyUnits.find((unit) => unit.title === "Review unit")?.revisions)
      .toEqual([
        expect.objectContaining({ unitRevisionId: reviewRevision.id, revision: 1 }),
        expect.objectContaining({ revision: 2 }),
      ]);

    const outsideRange = getCalendarWorkspace({
      context: { workspaceId: workspace.id },
      from: monthStart(1),
      to: monthStart(2),
      timezone: "Europe/Berlin",
    });
    expect(outsideRange.events.some((event) => event.unitId === eventRevision.unitId)).toBe(false);
    expect(outsideRange.readyUnits.some((unit) => unit.unitId === eventRevision.unitId)).toBe(false);

    const readyPresentations = listUnitPresentations({
      context: { workspaceId: workspace.id, projectId: project.id },
      revisionId: readyRevision.id,
      limit: 10,
    }).items;
    const readyPresentation = readyPresentations.find((item) => item.platform === "instagram")!;
    const readyYoutube = readyPresentations.find((item) => item.platform === "youtube")!;
    const publicationsBefore = openDomainDb()
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM publications")
      .get()!.count;
    const draft = createCalendarEvent({
      context: { workspaceId: workspace.id },
      unitRevisionId: readyRevision.id,
      at: null,
      draftAt: at - 2 * 86_400_000,
      timezone: "Europe/Berlin",
      channels: [{
        presentationId: readyPresentation.id,
        socialAccountId: instagram.id,
        settings: { publishAs: "reel", shareToFeed: true },
      }, {
        presentationId: readyYoutube.id,
        socialAccountId: youtube.id,
        settings: { visibility: "public", madeForKids: false },
      }],
    });
    expect(draft).toMatchObject({
      unitId: readyRevision.unitId,
      status: "draft",
      channels: [
        expect.objectContaining({
          platform: "instagram",
          account: "@ralphy.ai",
          status: "draft",
          settings: { publishAs: "reel", shareToFeed: true },
        }),
        expect.objectContaining({
          platform: "youtube",
          account: "Ralphy",
          status: "draft",
        }),
      ],
    });
    expect(openDomainDb()
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM publications")
      .get()!.count).toBe(publicationsBefore);
    expect(getCalendarWorkspace({
      context: { workspaceId: workspace.id },
      from: monthStart(1),
      to: monthStart(2),
      timezone: "Europe/Berlin",
    }).events.some((event) => event.id === draft.id)).toBe(false);
    expect(() => createCalendarEvent({
      context: { workspaceId: workspace.id },
      unitRevisionId: readyRevision.id,
      at: null,
      timezone: "Europe/Berlin",
      channels: [{
        presentationId: readyPresentation.id,
        socialAccountId: youtube.id,
        settings: {},
      }],
    })).toThrow(/platform|account/i);
    expect(() => createCalendarEvent({
      context: { workspaceId: workspace.id },
      unitRevisionId: readyRevision.id,
      at: null,
      timezone: "Europe/Berlin",
      channels: [{
        presentationId: readyPresentation.id,
        socialAccountId: instagram.id,
        settings: { unknown: true },
      }],
    })).toThrow(/setting|unknown/i);

    const submittedRequests: Parameters<PublicationProviderAdapter["submit"]>[0][] = [];
    const adapter: PublicationProviderAdapter = {
      async submit(request) {
        submittedRequests.push(request);
        return request.platform === "youtube"
          ? { state: "failed", error: "Thumbnail missing", failureStage: "provider" }
          : { state: "scheduled", providerPublicationId: "postiz-instagram" };
      },
      async lookup(request) {
        return { state: request.publication.state === "scheduled" ? "scheduled" : "failed" };
      },
      async cancel() {
        return { state: "cancelled" };
      },
    };
    const submitted = await submitCalendarEvent({
      context: { workspaceId: workspace.id },
      eventId: draft.id,
      expectedRowVersion: draft.rowVersion,
      at,
    }, adapter);
    expect(submitted.status).toBe("failed");
    expect(submitted.channels.map((channel) => channel.status)).toEqual([
      "scheduled",
      "failed",
    ]);
    expect(submittedRequests).toHaveLength(2);
    expect(submittedRequests.find((request) => request.platform === "instagram")!.options)
      .toEqual({ publishAs: "reel", shareToFeed: true });

    const retryRequests: Parameters<PublicationProviderAdapter["submit"]>[0][] = [];
    const cancelled: string[] = [];
    const healingAdapter: PublicationProviderAdapter = {
      async submit(request) {
        retryRequests.push(request);
        return {
          state: "scheduled",
          providerPublicationId: `postiz-${request.platform}-${retryRequests.length}`,
        };
      },
      async lookup(request) {
        return { state: request.publication.state === "scheduled" ? "scheduled" : "failed" };
      },
      async cancel(request) {
        cancelled.push(request.publication.id);
        return { state: "cancelled" };
      },
    };
    const retried = await retryCalendarEvent({
      context: { workspaceId: workspace.id },
      eventId: submitted.id,
      expectedRowVersion: submitted.rowVersion,
    }, healingAdapter);
    expect(retryRequests.map((request) => request.platform)).toEqual(["youtube"]);
    expect(retried.status).toBe("scheduled");

    await expect(retryCalendarEvent({
      context: { workspaceId: workspace.id },
      eventId: retried.id,
      expectedRowVersion: retried.rowVersion,
    }, healingAdapter)).rejects.toThrow("no failed channels");
    const unchanged = getCalendarWorkspace({
      context: { workspaceId: workspace.id },
      from: monthStart(0),
      to: monthStart(1),
      timezone: "Europe/Berlin",
    }).events.find((event) => event.id === retried.id)!;
    expect(unchanged.rowVersion).toBe(retried.rowVersion);

    retryRequests.length = 0;
    const movedAt = at + 86_400_000;
    const moved = await rescheduleCalendarEvent({
      context: { workspaceId: workspace.id },
      eventId: retried.id,
      expectedRowVersion: retried.rowVersion,
      at: movedAt,
    }, healingAdapter);
    expect(cancelled).toHaveLength(2);
    expect(retryRequests.map((request) => request.platform).sort()).toEqual([
      "instagram",
      "youtube",
    ]);
    expect(moved).toMatchObject({ at: movedAt, status: "scheduled" });

    const removed = await removeCalendarEvent({
      context: { workspaceId: workspace.id },
      eventId: moved.id,
      expectedRowVersion: moved.rowVersion,
    }, healingAdapter);
    expect(cancelled).toHaveLength(4);
    expect(removed).toMatchObject({ at: null, status: "draft" });
  });
});
