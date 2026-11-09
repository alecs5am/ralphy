import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { accountsSnapshot, profileUrl, shapeAccounts, viewsMultiplier } from "../../cli/lib/panel/accounts.js";
import { panelHandler } from "../../cli/lib/panel/server.js";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import {
  addOwnedAccount,
  appendUploadMetrics,
  approveUploads,
  cancelUpload,
  claimNextUpload,
  enqueueUpload,
  finishUpload,
  markUploadSubmitted,
  setAccountSession,
  type OwnedAccountSummaryDto,
  type UploadDto,
} from "../../cli/lib/store/uploads.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const HOST = { host: "127.0.0.1:4777" };

function account(patch: Partial<OwnedAccountSummaryDto> = {}): OwnedAccountSummaryDto {
  return {
    id: "acct_1", workspaceId: "ws_1", platform: "instagram", handle: "mind.notes", displayName: null, niche: "psychology",
    purpose: "test", connection: "browser", sessionState: "ok", sessionCheckedAt: null, paused: false, platformUserId: null,
    createdAt: 1, updatedAt: 1, uploads: 0, published: 0, pending: 0, needsUser: 0, lastPublishedAt: null,
    bestViews: null, medianViews: null, followers: null, followersAsOf: null, ...patch,
  };
}

function upload(patch: Partial<UploadDto> = {}): UploadDto {
  return {
    id: "upl_1", workspaceId: "ws_1", accountId: "acct_1", platform: "instagram", handle: "mind.notes", niche: "psychology",
    mediaObjectId: "obj_1", coverObjectId: null, caption: "", options: {}, unitRevisionId: null, artifactRevisionId: null,
    state: "queued", approvedAt: null, notBefore: null, attempts: 0, failureStage: null, error: null, postUrl: null,
    postExternalId: null, publishedAt: null, evidenceObjectId: null, createdAt: 1, updatedAt: 1, metrics: null, ...patch,
  };
}

const metrics = (views: number | null) => ({ asOf: 5, source: "browser", views, likes: 10, comments: 2, shares: null, saves: null });

describe("profileUrl", () => {
  test("builds the profile link per platform and strips a leading @", () => {
    expect(profileUrl("instagram", "mind.notes")).toBe("https://www.instagram.com/mind.notes/");
    expect(profileUrl("tiktok", "@fit.daily")).toBe("https://www.tiktok.com/@fit.daily");
    expect(profileUrl("youtube", "calm")).toBe("https://www.youtube.com/@calm");
    expect(profileUrl("x", "someone")).toBe("https://x.com/someone");
    expect(profileUrl("threads", "someone")).toBeNull();
  });
});

describe("viewsMultiplier", () => {
  test("is views over the median, and null when either side is missing or the median is zero", () => {
    expect(viewsMultiplier(3000, 1000)).toBe(3);
    expect(viewsMultiplier(1500, 1000)).toBe(1.5);
    expect(viewsMultiplier(null, 1000)).toBeNull();
    expect(viewsMultiplier(10, null)).toBeNull();
    expect(viewsMultiplier(10, 0)).toBeNull();
  });
});

describe("shapeAccounts", () => {
  const workspaces = new Map([["ws_1", "niche-lab"]]);

  test("groups uploads into sections and drops cancelled ones", () => {
    const shaped = shapeAccounts([account({ medianViews: 1000 })], [
      upload({ id: "needs", state: "needs_user", failureStage: "login", error: "checkpoint", updatedAt: 9 }),
      upload({ id: "lost", state: "unknown", updatedAt: 8 }),
      upload({ id: "ready", state: "queued", approvedAt: 3 }),
      upload({ id: "waiting", state: "queued" }),
      upload({ id: "busy", state: "uploading" }),
      upload({ id: "bad", state: "failed", error: "boom" }),
      upload({ id: "gone", state: "cancelled" }),
    ], workspaces, 123);
    const { uploads } = shaped;
    expect(shaped.serverTime).toBe(123);
    expect(uploads.needsYou.map((u) => u.id)).toEqual(["needs", "lost"]);
    expect(uploads.needsYou[0]).toMatchObject({ failureStage: "login", error: "checkpoint", workspace: "niche-lab" });
    expect(uploads.queued.approved.map((u) => u.id)).toEqual(["ready"]);
    expect(uploads.queued.approved[0]!.approved).toBe(true);
    expect(uploads.queued.waiting.map((u) => u.id)).toEqual(["waiting"]);
    expect(uploads.uploading.map((u) => u.id)).toEqual(["busy"]);
    expect(uploads.failed.map((u) => u.id)).toEqual(["bad"]);
    expect(uploads.published).toEqual([]);
  });

  test("copied actions carry the root, workspace and account id despite duplicate handles", () => {
    const shaped = shapeAccounts([
      account({ sessionState: "needs_login" }),
      account({ id: "acct_2", workspaceId: "ws_2", sessionState: "needs_login" }),
    ], [upload()], workspaces, 123, { dataRoot: "/tmp/owner's library", command: ["/tmp/local ralphy"] });
    expect(shaped.accounts[0]!.nextCommand).toContain(String.raw`'--root' '/tmp/owner'\''s library' '--workspace' 'ws_1'`);
    expect(shaped.accounts[0]!.nextCommand).toContain("'account' 'login' 'acct_1'");
    expect(shaped.accounts[1]!.nextCommand).toContain("'--workspace' 'ws_2'");
    expect(shaped.uploads.queued.waiting[0]!.nextCommand).toContain("'--workspace' 'ws_1' 'upload' 'approve' 'upl_1'");
  });

  test("device hand-off copies manual completion instead of opening a browser profile", () => {
    const shaped = shapeAccounts([account({ connection: "device" })], [upload({ state: "needs_user" })], workspaces, 123);
    expect(shaped.uploads.needsYou[0]!.nextCommand).not.toContain("'account' 'open'");
    expect(shaped.uploads.needsYou[0]!.nextCommand).toContain("'upload' 'done' 'upl_1' '--url' 'POST_URL'");
  });

  test("published uploads are newest first with views and a multiplier against the account median", () => {
    const { uploads, accounts } = shapeAccounts([account({ medianViews: 1000 }), account({ id: "acct_2", handle: "none", medianViews: null })], [
      upload({ id: "old", state: "published", publishedAt: 100, metrics: metrics(500) }),
      upload({ id: "hit", state: "published", publishedAt: 300, metrics: metrics(3000), postUrl: "https://www.instagram.com/reel/A/" }),
      upload({ id: "nostats", state: "published", publishedAt: 200 }),
      upload({ id: "nomedian", state: "published", publishedAt: 150, accountId: "acct_2", metrics: metrics(40) }),
    ], workspaces);
    expect(uploads.published.map((u) => u.id)).toEqual(["hit", "nostats", "nomedian", "old"]);
    const byId = Object.fromEntries(uploads.published.map((u) => [u.id, u]));
    expect(byId.hit).toMatchObject({ views: 3000, multiplier: 3, likes: 10, comments: 2, postUrl: "https://www.instagram.com/reel/A/" });
    expect(byId.old!.multiplier).toBe(0.5);
    expect(byId.nostats).toMatchObject({ views: null, multiplier: null });
    expect(byId.nomedian).toMatchObject({ views: 40, multiplier: null });
    expect(accounts[0]).toMatchObject({ profileUrl: "https://www.instagram.com/mind.notes/", workspace: "niche-lab" });
  });
});

describe("GET /api/accounts", () => {
  let tmp: TmpRoot;

  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-panel-accounts");
  });

  afterEach(() => {
    closeDomainDb();
    tmp.cleanup();
  });

  const handler = () => panelHandler({ dataRoot: tmp.dir, version: "test", trend: null, runCli: async () => ({}) });

  test("an empty library answers empty sections", async () => {
    const res = await handler()(new Request("http://127.0.0.1:4777/api/accounts", { headers: HOST }));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.accounts).toEqual([]);
    expect(body.uploads).toEqual({ needsYou: [], queued: { approved: [], waiting: [] }, uploading: [], published: [], failed: [] });
    expect(typeof body.serverTime).toBe("number");
  });

  test("covers every account and upload in the library, across Workspaces", async () => {
    const lab = createWorkspace({ slug: "niche-lab", name: "Niche lab" });
    const other = createWorkspace({ slug: "fitness-lab", name: "Fitness lab" });
    const file = path.join(tmp.dir, "clip.mp4");
    fs.writeFileSync(file, "synthetic video bytes");
    const media = async (workspaceId: string) => (await ingestObject({
      scope: { workspaceId }, sourcePath: file, originalName: "clip.mp4", mime: "video/mp4",
      storageClass: "durable", metadata: { upload: true }, transfer: "copy",
    })).id;
    const mind = addOwnedAccount({ workspaceId: lab.id, platform: "instagram", handle: "mind.notes", niche: "psychology", purpose: "test", connection: "browser" }).account;
    const fit = addOwnedAccount({ workspaceId: other.id, platform: "tiktok", handle: "fit.daily", niche: "fitness", connection: "browser" }).account;
    setAccountSession(mind.id, "ok", { platformUserId: "111" });
    const mindMedia = await media(lab.id);
    const fitMedia = await media(other.id);
    const enqueue = (workspaceId: string, accountId: string, mediaObjectId: string, approve: boolean) =>
      enqueueUpload({ workspaceId, accountId, mediaObjectId, caption: "", artifactRevisionId: null, approve, notBefore: null });

    const published = [1000, 3000, 200].map((views, i) => {
      const row = enqueue(lab.id, mind.id, mindMedia, true);
      claimNextUpload({ workspaceId: lab.id });
      markUploadSubmitted(row.id);
      finishUpload(row.id, { state: "published", postUrl: `https://www.instagram.com/reel/P${i}/`, postExternalId: `P${i}` });
      appendUploadMetrics({ uploadId: row.id, source: "browser", views, asOf: 10 });
      return row.id;
    });
    const waiting = enqueue(other.id, fit.id, fitMedia, false);
    const approved = enqueue(other.id, fit.id, fitMedia, false);
    approveUploads([approved.id]);
    cancelUpload(enqueue(lab.id, mind.id, mindMedia, false).id);

    const res = await handler()(new Request("http://127.0.0.1:4777/api/accounts", { headers: HOST }));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.accounts.map((a: any) => a.handle)).toEqual(["fit.daily", "mind.notes"]);
    expect(body.accounts[0]).toMatchObject({ workspace: "fitness-lab", profileUrl: "https://www.tiktok.com/@fit.daily", uploads: 2, published: 0, niche: "fitness" });
    expect(body.accounts[1]).toMatchObject({ workspace: "niche-lab", sessionState: "ok", published: 3, bestViews: 3000, medianViews: 1000 });

    const multipliers = Object.fromEntries(body.uploads.published.map((u: any) => [u.id, u.multiplier]));
    expect(multipliers).toEqual({ [published[0]!]: 1, [published[1]!]: 3, [published[2]!]: 0.2 });
    expect(body.uploads.queued.approved.map((u: any) => u.id)).toEqual([approved.id]);
    expect(body.uploads.queued.waiting.map((u: any) => u.id)).toEqual([waiting.id]);
    expect(body.uploads.queued.waiting[0].workspace).toBe("fitness-lab");
    const everything = JSON.stringify(body.uploads);
    expect(everything).not.toContain("cancelled");
    expect(accountsSnapshot().accounts).toHaveLength(2);
  });

  test("old actionable uploads survive more than 200 newer published rows", async () => {
    const workspace = createWorkspace({ slug: "busy", name: "Busy" });
    const a = addOwnedAccount({ workspaceId: workspace.id, platform: "instagram", handle: "busy", connection: "browser" }).account;
    const file = path.join(tmp.dir, "clip.mp4"); fs.writeFileSync(file, "fixture");
    const object = await ingestObject({ scope: { workspaceId: workspace.id }, sourcePath: file, originalName: "clip.mp4", mime: "video/mp4", storageClass: "durable", metadata: {}, transfer: "copy" });
    const waiting = enqueueUpload({ workspaceId: workspace.id, accountId: a.id, mediaObjectId: object.id });
    for (let i = 0; i < 205; i++) {
      const row = enqueueUpload({ workspaceId: workspace.id, accountId: a.id, mediaObjectId: object.id });
      // Manual fixture completion cannot invoke a browser or provider.
      const { completeUploadManually } = await import("../../cli/lib/store/uploads.js");
      completeUploadManually(row.id, `https://www.instagram.com/reel/F${i}/`);
    }
    const snapshot = accountsSnapshot();
    expect(snapshot.uploads.queued.waiting.map((u) => u.id)).toContain(waiting.id);
    expect(snapshot.uploads.published).toHaveLength(200);
    expect(snapshot.publishedTotal).toBe(205);
  });

  test("the endpoint is GET only", async () => {
    const res = await handler()(new Request("http://127.0.0.1:4777/api/accounts", { method: "POST", headers: HOST }));
    expect(res.status).toBe(405);
  });
});
