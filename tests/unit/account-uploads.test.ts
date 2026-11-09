// Owned accounts and the upload queue (#600) — zero-network, no browser.
//
// Covers the account registry (handle normalization, ambiguity across
// platforms, identity binding), the upload lifecycle (approval gate, claim
// rules, the `unknown` state after submit and its forced retry, manual
// completion, metric snapshots), the CSV import parser, the visible-counter
// parser, and the Instagram create-response check ported from
// social-auto-upload.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { parseAccountCsv } from "../../cli/commands/account";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db";
import { ingestObject } from "../../cli/lib/store/objects";
import { createWorkspace } from "../../cli/lib/store/scopes";
import {
  acquireAccountBrowserLease,
  addOwnedAccount,
  appendUploadMetrics,
  approveUploads,
  cancelUpload,
  claimNextUpload,
  completeUploadManually,
  enqueueUpload,
  finishUpload,
  getUpload,
  listOwnedAccounts,
  markUploadSubmitted,
  resolveOwnedAccount,
  retryUpload,
  setAccountPaused,
  setAccountSession,
} from "../../cli/lib/store/uploads";
import { verifyDomainStore } from "../../cli/lib/store/verify";
import { parseCount } from "../../cli/lib/uploads/browser";
import { instagramCreatedMedia, instagramPayload } from "../../cli/lib/uploads/platforms";

describe("owned accounts and uploads", () => {
  let tmp: TmpRoot;

  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-account-uploads-600");
  });

  afterEach(() => {
    closeDomainDb();
    tmp.cleanup();
  });

  async function seed() {
    const workspace = createWorkspace({ slug: "niche-lab", name: "Niche lab" });
    const { account } = addOwnedAccount({
      workspaceId: workspace.id,
      platform: "instagram",
      handle: "@Mind.Notes",
      displayName: null,
      niche: "psychology",
      purpose: "test",
      connection: "browser",
    });
    const file = path.join(tmp.dir, "clip.mp4");
    fs.writeFileSync(file, "synthetic video bytes");
    const media = await ingestObject({
      scope: { workspaceId: workspace.id },
      sourcePath: file,
      originalName: "clip.mp4",
      mime: "video/mp4",
      storageClass: "durable",
      metadata: { upload: true },
      transfer: "copy",
    });
    return { workspace, account, mediaObjectId: media.id };
  }

  test("accounts upsert by handle and resolve by id or handle", async () => {
    const { workspace, account } = await seed();
    expect(account.handle).toBe("mind.notes");
    const again = addOwnedAccount({ workspaceId: workspace.id, platform: "instagram", handle: "mind.notes", displayName: "Mind", niche: "psychology", connection: "browser" });
    expect(again.created).toBe(false);
    expect(again.account.id).toBe(account.id);
    expect(resolveOwnedAccount({ workspaceId: workspace.id, ref: "@mind.notes" }).id).toBe(account.id);

    addOwnedAccount({ workspaceId: workspace.id, platform: "tiktok", handle: "mind.notes", displayName: null, niche: "psychology", connection: "browser" });
    expect(() => resolveOwnedAccount({ workspaceId: workspace.id, ref: "mind.notes" })).toThrow(/pass --platform/);
    expect(resolveOwnedAccount({ workspaceId: workspace.id, ref: "mind.notes", platform: "tiktok" }).platform).toBe("tiktok");
    expect(listOwnedAccounts({ workspaceId: workspace.id, niche: "psychology", platform: "instagram" })).toHaveLength(1);
  });

  test("the first signed-in session binds the platform user; another user is refused", async () => {
    const { account } = await seed();
    expect(setAccountSession(account.id, "ok", { platformUserId: "111" }).platformUserId).toBe("111");
    expect(setAccountSession(account.id, "ok", { platformUserId: "111" }).sessionState).toBe("ok");
    expect(() => setAccountSession(account.id, "ok", { platformUserId: "222" })).toThrow(/bound to platform user 111/);
  });

  test("only approved, due uploads on signed-in, unpaused accounts are claimed", async () => {
    const { workspace, account, mediaObjectId } = await seed();
    const upload = enqueueUpload({ workspaceId: workspace.id, accountId: account.id, mediaObjectId, caption: "Why we procrastinate", artifactRevisionId: null, approve: false, notBefore: null });
    expect(claimNextUpload({ workspaceId: workspace.id })).toBeNull(); // not approved
    approveUploads([upload.id]);
    setAccountSession(account.id, "needs_login");
    expect(claimNextUpload({ workspaceId: workspace.id })).toBeNull(); // signed out
    setAccountSession(account.id, "ok", { platformUserId: "111" });
    setAccountPaused(account.id, true);
    expect(claimNextUpload({ workspaceId: workspace.id })).toBeNull(); // paused
    setAccountPaused(account.id, false);

    const claimed = claimNextUpload({ workspaceId: workspace.id });
    expect(claimed?.id).toBe(upload.id);
    expect(claimed?.state).toBe("uploading");
    expect(claimed?.attempts).toBe(1);

    const later = enqueueUpload({ workspaceId: workspace.id, accountId: account.id, mediaObjectId, caption: "", artifactRevisionId: null, approve: true, notBefore: Date.now() + 3_600_000 });
    expect(claimNextUpload({ workspaceId: workspace.id })).toBeNull(); // not due
    expect(cancelUpload(later.id).state).toBe("cancelled");
  });

  test("one active upload per account and submitted outcomes cannot become retryable", async () => {
    const { workspace, account, mediaObjectId } = await seed();
    const first = enqueueUpload({ workspaceId: workspace.id, accountId: account.id, mediaObjectId, approve: true });
    const second = enqueueUpload({ workspaceId: workspace.id, accountId: account.id, mediaObjectId, approve: true });
    expect(claimNextUpload({ id: first.id })?.id).toBe(first.id);
    expect(claimNextUpload({ id: second.id })).toBeNull();
    markUploadSubmitted(first.id);
    expect(() => finishUpload(first.id, { state: "failed", stage: "browser", error: "timeout" })).toThrow(/unknown/);
    expect(getUpload(first.id).state).toBe("unknown");
  });

  test("an active claim cannot be retried, cancelled or manually completed", async () => {
    const { workspace, account, mediaObjectId } = await seed();
    const row = enqueueUpload({ workspaceId: workspace.id, accountId: account.id, mediaObjectId, approve: true });
    claimNextUpload({ id: row.id });
    expect(() => retryUpload(row.id, { force: true })).toThrow();
    expect(() => cancelUpload(row.id)).toThrow();
    expect(() => completeUploadManually(row.id, "https://www.instagram.com/reel/X/")).toThrow();
  });

  test("two worker processes cannot claim two uploads on the same account", async () => {
    const { workspace, account, mediaObjectId } = await seed();
    enqueueUpload({ workspaceId: workspace.id, accountId: account.id, mediaObjectId, approve: true });
    enqueueUpload({ workspaceId: workspace.id, accountId: account.id, mediaObjectId, approve: true });
    const source = `import {setDataRoot} from ${JSON.stringify(path.resolve("cli/lib/paths.ts"))};
      import {claimNextUpload} from ${JSON.stringify(path.resolve("cli/lib/store/uploads.ts"))};
      setDataRoot(process.argv[1]); console.log(JSON.stringify(claimNextUpload()));`;
    const workers = [1, 2].map(() => Bun.spawn([process.execPath, "-e", source, path.join(tmp.dir, ".ralphy")], { stdout: "pipe", stderr: "pipe" }));
    const results = await Promise.all(workers.map(async (worker) => {
      const output = await new Response(worker.stdout).text();
      expect(await worker.exited, await new Response(worker.stderr).text()).toBe(0);
      return JSON.parse(output);
    }));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  test("profile leases exclude other operations and reclaim only dead owners", async () => {
    const { account } = await seed();
    const release = acquireAccountBrowserLease(account.id);
    expect(() => acquireAccountBrowserLease(account.id)).toThrow(/already open/);
    release();
    const releaseAgain = acquireAccountBrowserLease(account.id);
    release(); // an old release cannot remove the new owner's token
    expect(() => acquireAccountBrowserLease(account.id)).toThrow(/already open/);
    releaseAgain();
    openDomainDb().prepare("INSERT INTO account_browser_leases VALUES (?, 2147483647, 'dead')").run(account.id);
    acquireAccountBrowserLease(account.id)();
  });

  test("forced recovery requeues an abandoned claim but never an active worker", async () => {
    const { workspace, account, mediaObjectId } = await seed();
    const row = enqueueUpload({ workspaceId: workspace.id, accountId: account.id, mediaObjectId, approve: true });
    claimNextUpload({ id: row.id });
    expect(() => retryUpload(row.id, { force: true })).toThrow(/active worker/);
    openDomainDb().prepare("UPDATE uploads SET claim_owner_pid = 2147483647 WHERE id = ?").run(row.id);
    expect(() => retryUpload(row.id)).toThrow();
    expect(retryUpload(row.id, { force: true }).state).toBe("queued");
  });

  test("a failure after submit stays unknown and needs --force to retry", async () => {
    const { workspace, account, mediaObjectId } = await seed();
    setAccountSession(account.id, "ok", { platformUserId: "111" });
    const upload = enqueueUpload({ workspaceId: workspace.id, accountId: account.id, mediaObjectId, caption: "", artifactRevisionId: null, approve: true, notBefore: null });
    claimNextUpload({ workspaceId: workspace.id });
    expect(markUploadSubmitted(upload.id).state).toBe("unknown");
    const unknown = finishUpload(upload.id, { state: "unknown", stage: "wait-created", error: "no response" });
    expect(unknown.state).toBe("unknown");
    expect(listOwnedAccounts({ workspaceId: workspace.id })[0]!.needsUser).toBe(1);

    expect(() => retryUpload(upload.id)).toThrow();
    expect(retryUpload(upload.id, { force: true }).state).toBe("queued");
  });

  test("published uploads carry the post url and take metric snapshots", async () => {
    const { workspace, account, mediaObjectId } = await seed();
    setAccountSession(account.id, "ok", { platformUserId: "111" });
    const upload = enqueueUpload({ workspaceId: workspace.id, accountId: account.id, mediaObjectId, caption: "", artifactRevisionId: null, approve: true, notBefore: null });
    claimNextUpload({ workspaceId: workspace.id });
    markUploadSubmitted(upload.id);
    const published = finishUpload(upload.id, { state: "published", postUrl: "https://www.instagram.com/reel/ABC123/", postExternalId: "ABC123" });
    expect(published.state).toBe("published");
    expect(published.publishedAt).not.toBeNull();

    appendUploadMetrics({ uploadId: upload.id, source: "browser", views: 1200, asOf: 1 });
    appendUploadMetrics({ uploadId: upload.id, source: "browser", views: 5400, asOf: 2 });
    expect(getUpload(upload.id).metrics?.views).toBe(5400);
    const [summary] = listOwnedAccounts({ workspaceId: workspace.id });
    expect(summary!.published).toBe(1);
    expect(summary!.bestViews).toBe(5400);

    const manual = enqueueUpload({ workspaceId: workspace.id, accountId: account.id, mediaObjectId, caption: "", artifactRevisionId: null, approve: false, notBefore: null });
    expect(() => completeUploadManually(manual.id, "http://example.com/x")).toThrow();
    expect(() => completeUploadManually(manual.id, "https://example.com/reel/XYZ/")).toThrow();
    expect(completeUploadManually(manual.id, "https://www.instagram.com/reel/XYZ/")).toMatchObject({ state: "published", postExternalId: "XYZ" });
    const report = verifyDomainStore();
    expect(report.unreferencedObjects).toEqual([]);
    expect(report.integrity).toBe("ok");
  });
});

describe("account CSV import", () => {
  test("reads rows, skips the header and comments, keeps commas in names", () => {
    const rows = parseAccountCsv("platform,handle,niche,purpose,name\n# comment\ninstagram,mind.notes,psychology,test,Mind, notes\n\ntiktok,@fit.daily,fitness\n");
    expect(rows).toEqual([
      { platform: "instagram", handle: "mind.notes", niche: "psychology", purpose: "test", name: "Mind,notes" },
      { platform: "tiktok", handle: "@fit.daily", niche: "fitness" },
    ]);
  });
});

describe("visible counters", () => {
  test("parse platform abbreviations and reject other text", () => {
    expect(parseCount("12.5K")).toBe(12_500);
    expect(parseCount("1,234")).toBe(1234);
    expect(parseCount("3M")).toBe(3_000_000);
    expect(parseCount("Followers")).toBeNull();
    expect(parseCount("")).toBeNull();
    expect(parseCount(null)).toBeNull();
  });
});

describe("Instagram create response", () => {
  const media = { media: { id: "3456_111", code: "ABC123", user: { pk: 111 }, caption: { text: "Why we procrastinate" } }, status: "ok" };

  test("strips the anti-hijacking prefix", () => {
    expect(instagramPayload(`for (;;);${JSON.stringify(media)}`).status).toBe("ok");
    expect(instagramPayload(JSON.stringify(media)).status).toBe("ok");
  });

  test("accepts only the final media for this user and caption", () => {
    expect(instagramCreatedMedia(media, "111", "Why we procrastinate")).toEqual({ id: "3456_111", code: "ABC123" });
    expect(instagramCreatedMedia({ payload: media }, "111", "Why we procrastinate").code).toBe("ABC123");
    expect(() => instagramCreatedMedia(media, "222", "Why we procrastinate")).toThrow(/another user/);
    expect(() => instagramCreatedMedia(media, "111", "other caption")).toThrow(/caption/);
    expect(() => instagramCreatedMedia({ status: "ok" }, "111", "")).toThrow(/no media code/);
    expect(() => instagramCreatedMedia({ status: "fail", message: "Please wait" }, "111", "")).toThrow(/Please wait/);
  });
});
