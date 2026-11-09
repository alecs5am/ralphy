// Account sessions and the upload runner (#600). Each function opens the
// account's own browser profile, does one job, records the outcome in the
// store and closes the profile.

import fs from "node:fs";
import path from "node:path";
import { ralphDir } from "../paths.js";
import { ingestObject } from "../store/objects.js";
import {
  appendAccountSnapshot,
  appendUploadMetrics,
  finishUpload,
  listUploads,
  markUploadSubmitted,
  setAccountSession,
  uploadObjectPath,
  isOwnedPlatform,
  type OwnedAccountDto,
  type SessionState,
  type UploadDto,
} from "../store/uploads.js";
import { firstPage, openAccountBrowser, waitForClose, type BrowserContext, type Page } from "./browser.js";
import { PLATFORM_RECIPES, RecipeStepError, type PlatformRecipe, type ProfileStats, type SessionInfo } from "./platforms.js";

export function recipeFor(platform: string): PlatformRecipe {
  if (!isOwnedPlatform(platform)) throw new Error(`No browser recipe for platform ${platform}`);
  return PLATFORM_RECIPES[platform];
}

async function readStats(recipe: PlatformRecipe, page: Page, account: OwnedAccountDto): Promise<ProfileStats | null> {
  try {
    const stats = await recipe.profileStats(page, account.handle);
    appendAccountSnapshot({ accountId: account.id, source: "browser", ...stats });
    return stats;
  } catch {
    return null;
  }
}

/**
 * Record a detected session. The first signed-in check binds the account to
 * the platform user id; a later session for another user is `restricted`
 * (wrong account in this profile) and never posts.
 */
function recordSession(account: OwnedAccountDto, session: SessionInfo): SessionState {
  try {
    setAccountSession(account.id, session.state, session.userId ? { platformUserId: session.userId } : {});
    return session.state;
  } catch {
    setAccountSession(account.id, "restricted");
    return "restricted";
  }
}

const SESSION_UNKNOWN: SessionInfo = { state: "unknown", userId: null };

/**
 * Open the account's profile at the login page and wait for the owner to sign
 * in. Resolves when the session is detected or when the owner closes the window.
 */
export async function loginAccount(account: OwnedAccountDto, options: { timeoutMs?: number } = {}): Promise<{ state: SessionState; stats: ProfileStats | null }> {
  const recipe = recipeFor(account.platform);
  const context = await openAccountBrowser(account.id);
  let closed = false;
  void waitForClose(context).then(() => { closed = true; });
  let session = SESSION_UNKNOWN;
  let stats: ProfileStats | null = null;
  let state: SessionState = "unknown";
  try {
    const page = await firstPage(context);
    await page.goto(recipe.home, { waitUntil: "domcontentloaded" }).catch(() => {});
    session = await recipe.session(context, page).catch(() => SESSION_UNKNOWN);
    if (session.state !== "ok") await page.goto(recipe.loginUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    const deadline = Date.now() + (options.timeoutMs ?? 15 * 60_000);
    while (!closed && session.state !== "ok" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const current = context.pages()[0];
      if (closed || !current) break;
      // Login pages never show the signed-in marker; probe the home page only
      // once the platform has redirected away from them.
      if (/login|signin|accounts\.google/i.test(current.url())) continue;
      session = await recipe.session(context, current).catch(() => session);
    }
    state = recordSession(account, session);
    if (state === "ok" && !closed) stats = await readStats(recipe, await firstPage(context), account);
  } finally {
    if (state === "unknown") setAccountSession(account.id, "needs_login");
    await context.close().catch(() => {});
  }
  return { state: state === "unknown" ? "needs_login" : state, stats };
}

/** Detect the session and read the public counters without user interaction. */
export async function checkAccount(account: OwnedAccountDto, options: { headless?: boolean } = {}): Promise<{ state: SessionState; stats: ProfileStats | null }> {
  const recipe = recipeFor(account.platform);
  const context = await openAccountBrowser(account.id, { headless: options.headless ?? true });
  try {
    const page = await firstPage(context);
    await page.goto(recipe.home, { waitUntil: "domcontentloaded" });
    const state = recordSession(account, await recipe.session(context, page));
    const stats = state === "ok" ? await readStats(recipe, page, account) : null;
    return { state, stats };
  } finally {
    await context.close().catch(() => {});
  }
}

/** Open the account's profile for the owner (or an agent) and wait until it is closed. */
export async function openAccount(account: OwnedAccountDto, url?: string): Promise<void> {
  const recipe = recipeFor(account.platform);
  const context = await openAccountBrowser(account.id);
  const page = await firstPage(context);
  await page.goto(url ?? recipe.profileUrl(account.handle), { waitUntil: "domcontentloaded" }).catch(() => {});
  await waitForClose(context);
}

/** Screenshot plus page HTML, stored as one diagnostic object (the screenshot) and its sibling HTML object. */
async function captureEvidence(page: Page, upload: UploadDto, label: string): Promise<string | null> {
  const dir = path.join(ralphDir(), "tmp", "uploads", upload.id);
  const stamp = Date.now();
  const store = async (file: string, mime: string) =>
    (await ingestObject({
      scope: { workspaceId: upload.workspaceId },
      sourcePath: file,
      originalName: path.basename(file),
      mime,
      storageClass: "diagnostic",
      metadata: { upload: upload.id, label, url: page.url() },
      transfer: "move",
    })).id;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const html = path.join(dir, `${label}-${stamp}.html`);
    fs.writeFileSync(html, await page.content().catch(() => ""));
    await store(html, "text/html").catch(() => null);
    const shot = path.join(dir, `${label}-${stamp}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    return await store(shot, "image/png");
  } catch {
    return null;
  }
}

/**
 * Run one claimed upload in its account's profile. The caller has already
 * moved it to `uploading` (claimNextUpload); this records the outcome.
 *
 * Before the publish click the recipe calls `onSubmit`, which moves the upload
 * to `unknown`. Any failure after that point stays `unknown`: the post may
 * exist, so it is never retried blindly (`upload retry --force` after the
 * owner checks the profile).
 */
export async function runClaimedUpload(upload: UploadDto, account: OwnedAccountDto): Promise<UploadDto> {
  const recipe = recipeFor(account.platform);
  if (!recipe.upload || account.connection !== "browser") {
    return finishUpload(upload.id, {
      state: "needs_user",
      stage: "no-recipe",
      error: `${recipe.label} ${account.connection === "browser" ? "has no scripted upload yet" : `account is connected via ${account.connection}`}; post it by hand (ralphy account open ${account.id}) and record it with ralphy upload done ${upload.id} --url <post-url>`,
    });
  }
  if (upload.caption.length > recipe.captionLimit) {
    return finishUpload(upload.id, { state: "failed", stage: "caption", error: `caption is ${upload.caption.length} characters; ${recipe.label} allows ${recipe.captionLimit}` });
  }
  let context: BrowserContext | null = null;
  let submitted = false;
  try {
    context = await openAccountBrowser(account.id);
    const page = await firstPage(context);
    await page.goto(recipe.home, { waitUntil: "domcontentloaded" });
    let sessionError = "";
    const session = await recipe.session(context, page).catch((error) => {
      sessionError = String((error as Error)?.message ?? error).split("\n")[0]!;
      return SESSION_UNKNOWN;
    });
    const state = recordSession(account, session);
    if (state !== "ok") {
      return finishUpload(upload.id, {
        state: "needs_user",
        stage: "session",
        error: sessionError
          ? `could not tell whether @${account.handle} is signed in (${sessionError}); open it with ralphy account open ${account.id}`
          : `@${account.handle} is ${state}; run ralphy account login ${account.id}`,
        evidenceObjectId: await captureEvidence(page, upload, "session"),
      });
    }
    try {
      const result = await recipe.upload({
        page,
        task: { handle: account.handle, videoPath: uploadObjectPath(upload.mediaObjectId), caption: upload.caption },
        expectedUserId: account.platformUserId,
        onSubmit: () => {
          if (submitted) throw new Error("recipe submitted twice");
          markUploadSubmitted(upload.id);
          submitted = true;
        },
      });
      return finishUpload(upload.id, {
        state: "published",
        postUrl: result.postUrl,
        postExternalId: result.postExternalId,
        evidenceObjectId: await captureEvidence(page, upload, "published"),
      });
    } catch (error) {
      const stage = error instanceof RecipeStepError ? error.stage : submitted ? "after-submit" : "upload";
      const message = String((error as Error)?.message ?? error);
      return finishUpload(upload.id, {
        state: submitted ? "unknown" : "needs_user",
        stage,
        error: submitted
          ? `${message}. The post may exist: check ${recipe.profileUrl(account.handle)}, then ralphy upload done ${upload.id} --url <post-url> or ralphy upload retry ${upload.id} --force`
          : message,
        evidenceObjectId: await captureEvidence(page, upload, stage),
      });
    }
  } catch (error) {
    return finishUpload(upload.id, {
      state: submitted ? "unknown" : "failed",
      stage: "browser",
      error: String((error as Error)?.message ?? error),
    });
  } finally {
    await context?.close().catch(() => {});
  }
}

/**
 * Read the visible counters of the account's recent posts and append a metric
 * snapshot to every published upload they match (by post id). Also refreshes
 * the account's follower snapshot.
 */
export async function syncAccount(account: OwnedAccountDto): Promise<{ matched: number; posts: number; stats: ProfileStats | null }> {
  const recipe = recipeFor(account.platform);
  const context = await openAccountBrowser(account.id, { headless: true });
  try {
    const page = await firstPage(context);
    const stats = await readStats(recipe, page, account);
    if (!recipe.recentPosts) return { matched: 0, posts: 0, stats };
    const posts = await recipe.recentPosts(page, account.handle);
    const byId = new Map(posts.map((post) => [post.externalId, post]));
    let matched = 0;
    for (const upload of listUploads({ accountId: account.id, states: ["published"], limit: 1000 })) {
      const post = upload.postExternalId ? byId.get(upload.postExternalId) : undefined;
      if (!post) continue;
      appendUploadMetrics({ uploadId: upload.id, source: "browser", views: post.views, likes: post.likes, comments: post.comments });
      matched += 1;
    }
    return { matched, posts: posts.length, stats };
  } finally {
    await context.close().catch(() => {});
  }
}
