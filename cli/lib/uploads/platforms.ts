// Per-platform browser recipes for owned accounts (#600).
//
// Each platform knows its login page, how to tell a signed-in session from a
// signed-out one (and which platform user it is signed in as), how to read
// the account's public counters, and — where implemented — how to upload one
// video. Recipes drive the platform's own web UI, so they break when that UI
// changes: every step is named, and a failure ends the run at that step with
// a screenshot for the owner or an agent to finish in the same profile.
//
// The Instagram recipe is a port of dreammis/social-auto-upload
// (uploader/meta_uploader/insgraph_uploader/main.py, MIT, 2026-10-23): success
// is the platform's own create response, never a UI toast, and the publish
// click happens once (`onSubmit` marks the upload `unknown` right before it).

import type { BrowserContext, Page, Response } from "patchright";
import { parseCount } from "./browser.js";
import type { OwnedPlatform, SessionState } from "../store/uploads.js";

export type UploadTask = { handle: string; videoPath: string; caption: string };

export type UploadContext = {
  page: Page;
  task: UploadTask;
  /** Platform user id the account is bound to; the recipe refuses another signed-in user. */
  expectedUserId: string | null;
  /** Call exactly once, immediately before the irreversible publish click. */
  onSubmit: () => void;
};

export type UploadResult = { postUrl: string; postExternalId: string | null };
export type SessionInfo = { state: SessionState; userId: string | null };
export type ProfileStats = { followers: number | null; following: number | null; posts: number | null };
export type PostStats = { caption?: string; externalId: string; url: string; views: number | null; likes: number | null; comments: number | null };

export class RecipeStepError extends Error {
  constructor(readonly stage: string, message: string) {
    super(message);
  }
}

export type PlatformRecipe = {
  label: string;
  home: string;
  loginUrl: string;
  profileUrl(handle: string): string;
  session(context: BrowserContext, page: Page): Promise<SessionInfo>;
  profileStats(page: Page, handle: string): Promise<ProfileStats>;
  /** Absent when the platform has no scripted upload yet; the run hands off instead. */
  upload?(ctx: UploadContext): Promise<UploadResult>;
  /** Recent posts with their visible counters, newest first. */
  recentPosts?(page: Page, handle: string): Promise<PostStats[]>;
  /** Caption limit enforced before the browser opens. */
  captionLimit: number;
};

/** Run one named step; any failure becomes a RecipeStepError at that stage. */
export async function step<T>(stage: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof RecipeStepError) throw error;
    throw new RecipeStepError(stage, String((error as Error)?.message ?? error).split("\n")[0]!.slice(0, 500));
  }
}

const challengeUrl = (url: string) => /\/(challenge|checkpoint|suspended|accounts\/disabled)\b/i.test(url);

async function cookie(context: BrowserContext, url: string, name: string): Promise<string | null> {
  const found = (await context.cookies(url)).find((entry) => entry.name === name && entry.value);
  return found?.value ?? null;
}

async function metaContent(page: Page, selector: string): Promise<string> {
  return (await page.locator(selector).first().getAttribute("content", { timeout: 10_000 }).catch(() => null)) ?? "";
}

/** Close a known optional prompt if it shows up within a short window; absent is fine. */
async function dismissOptional(guide: ReturnType<Page["locator"]>, button: ReturnType<Page["locator"]>): Promise<boolean> {
  try {
    await guide.waitFor({ state: "visible", timeout: 1_500 });
  } catch {
    return false;
  }
  await button.click();
  await guide.waitFor({ state: "hidden" });
  return true;
}

async function waitForCount(locator: ReturnType<Page["locator"]>, count: number, timeout = 30_000): Promise<void> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const actual = await locator.count();
    if (actual === count) return;
    if (Date.now() > deadline) throw new Error(`expected ${count} element(s), found ${actual}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function waitForTextChange(locator: ReturnType<Page["locator"]>, previous: string, timeout = 60_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while ((await locator.innerText().catch(() => previous)) === previous) {
    if (Date.now() > deadline) throw new Error(`step did not advance past "${previous}"`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function requireBoundSession(recipe: PlatformRecipe, page: Page, expectedUserId: string | null): Promise<void> {
  const session = await recipe.session(page.context(), page);
  if (session.state !== "ok" || !expectedUserId || session.userId !== expectedUserId) {
    throw new RecipeStepError("identity", "Cannot confirm the bound account before publication");
  }
}

// ─── Instagram ─────────────────────────────────────────────────────────────

const IG_HOME = "https://www.instagram.com/";
// The create dialog's media input accepts video/mp4; the cover input in the
// edit step accepts only image/jpeg,image/png, so this excludes it.
const IG_MEDIA_INPUT = 'input[type="file"][accept*="video/mp4"]';
// `_ac76` is the wizard header shared by the crop, edit and caption steps; the
// primary action has no svg, the back button does.
const IG_PRIMARY_ACTION = '._ac76 [role="button"]:not(:has(svg))';
const IG_CAPTION = '[contenteditable="true"][role="textbox"][data-lexical-editor="true"]';

/** Meta prefixes JSON with `for (;;);` against JSON hijacking. */
export function instagramPayload(body: string): Record<string, any> {
  return JSON.parse(body.startsWith("for (;;);") ? body.slice("for (;;);".length) : body) as Record<string, any>;
}

/** Accept only the final create response for this user and this caption; 202 and bare 200 are not success. */
export function instagramCreatedMedia(payload: Record<string, any>, ownerId: string, caption: string): { id: string; code: string } {
  const body = payload.payload ?? payload;
  if (payload.error || (body.status !== undefined && body.status !== "ok") || ("statusCode" in body && body.statusCode !== 200)) {
    throw new Error(`Instagram create failed: ${body.message ?? body.statusCode ?? body.status}`);
  }
  const media = body.media ?? {};
  if (!media.code || !media.id) throw new Error("Instagram create response has no media code");
  if (String(media.user?.pk) !== ownerId) throw new Error("Instagram create response belongs to another user");
  if ((media.caption?.text ?? "") !== caption) throw new Error("Instagram create response caption does not match");
  return { id: String(media.id), code: String(media.code) };
}

const instagram: PlatformRecipe = {
  label: "Instagram",
  home: IG_HOME,
  loginUrl: `${IG_HOME}accounts/login/`,
  profileUrl: (handle) => `${IG_HOME}${handle}/`,
  captionLimit: 2200,

  async session(context, page) {
    if (challengeUrl(page.url())) return { state: "checkpoint", userId: null };
    // No session cookie is conclusive; with one, wait for an explicit signed-in
    // or signed-out marker (a timeout is an error, never "signed out"). The
    // login form's field names change (username -> email in 2026), so the
    // signed-out marker is any password field or the sign-up link.
    if (!(await cookie(context, IG_HOME, "sessionid"))) return { state: "needs_login", userId: null };
    const outcomes = page.locator(
      'a[href^="/direct/inbox/"], input[type="password"], a[href^="/accounts/login/"], a[href^="/accounts/emailsignup/"]',
    );
    await outcomes.first().waitFor({ state: "attached", timeout: 60_000 });
    if (challengeUrl(page.url())) return { state: "checkpoint", userId: null };
    if (!(await page.locator('a[href^="/direct/inbox/"]').count())) return { state: "needs_login", userId: null };
    return { state: "ok", userId: await cookie(context, IG_HOME, "ds_user_id") };
  },

  async profileStats(page, handle) {
    await page.goto(instagram.profileUrl(handle), { waitUntil: "domcontentloaded" });
    // "1,234 Followers, 56 Following, 78 Posts - …"
    const text = await metaContent(page, 'meta[property="og:description"], meta[name="description"]');
    const pick = (label: string) => parseCount(text.match(new RegExp(`([\\d.,]+[KMB]?)\\s+${label}`, "i"))?.[1]);
    return { followers: pick("Followers"), following: pick("Following"), posts: pick("Posts") };
  },

  async upload({ page, task, expectedUserId, onSubmit }) {
    await step("open-home", () => page.goto(IG_HOME, { waitUntil: "domcontentloaded", timeout: 120_000 }));
    const userId = await step("identity", async () => {
      const session = await instagram.session(page.context(), page);
      if (session.state !== "ok" || !session.userId) throw new Error(`session is ${session.state}`);
      if (expectedUserId && session.userId !== expectedUserId) {
        throw new Error(`signed in as user ${session.userId}, account is bound to ${expectedUserId}`);
      }
      return session.userId;
    });

    await step("open-create", async () => {
      // The notifications prompt can appear late and cover the nav; dismiss it
      // whenever it shows up while we act.
      const notifications = page.getByRole("dialog").filter({ has: page.locator('img[src^="/images/instagram/xig/ico/xxhdpi_launcher.png"]') });
      await page.addLocatorHandler(notifications, async () => {
        await dismissOptional(notifications, notifications.locator("._a9-z > button").nth(1));
      });
      try {
        // Four nav popups in order: notifications, create, settings, Meta.
        const popups = page.locator('a._a6hd[href="#"]').filter({ has: page.locator("[aria-selected]") });
        await waitForCount(popups, 4);
        await popups.nth(1).click();
      } finally {
        await page.removeLocatorHandler(notifications);
      }
    });

    await step("attach-video", async () => {
      const dialog = page.getByRole("dialog");
      await waitForCount(dialog, 1);
      const input = dialog.locator(IG_MEDIA_INPUT);
      await waitForCount(input, 1);
      await input.setInputFiles(task.videoPath);
      const reelsIntro = page.getByRole("dialog").filter({ has: page.locator('img[src^="/images/instagram/clips/reels_nux_icon.png"]') });
      await dismissOptional(reelsIntro, reelsIntro.locator("._a9-z div > button"));
      await waitForCount(dialog.locator(IG_PRIMARY_ACTION), 1, 60_000);
    });

    // Crop, then edit: each click must change the wizard heading.
    for (const stage of ["crop-next", "edit-next"]) {
      await step(stage, async () => {
        const dialog = page.getByRole("dialog");
        const heading = dialog.locator('._ac76 [role="heading"]');
        await waitForCount(heading, 1);
        const previous = await heading.innerText();
        const action = dialog.locator(IG_PRIMARY_ACTION);
        await waitForCount(action, 1);
        await action.click();
        await waitForTextChange(heading, previous);
      });
    }

    const caption = task.caption;
    await step("caption", async () => {
      const editor = page.getByRole("dialog").locator(IG_CAPTION);
      await waitForCount(editor, 1);
      if (caption) {
        await editor.fill(caption);
        const typed = (await editor.innerText()).trim();
        if (typed !== caption.trim()) throw new Error("caption editor does not hold the caption");
      }
    });

    // Listen before clicking: a Reel answers 202 first, then the final media.
    const responses: Response[] = [];
    let wake: (() => void) | null = null;
    const onResponse = (response: Response) => {
      const request = response.request();
      if (request.method() === "POST" && new URL(response.url()).pathname.startsWith("/api/v1/media/configure")) {
        responses.push(response);
        wake?.();
      }
    };
    page.on("response", onResponse);
    try {
      const action = page.getByRole("dialog").locator(IG_PRIMARY_ACTION);
      await step("share", async () => {
        await waitForCount(action, 1);
        if (!(await action.isEnabled())) throw new Error("Share is disabled");
      });
      onSubmit();
      await action.click();
      const media = await step("wait-created", async () => {
        const deadline = Date.now() + 180_000;
        for (;;) {
          while (responses.length === 0) {
            const remaining = deadline - Date.now();
            if (remaining <= 0) throw new Error("submitted, but no final create response within 180 s");
            await new Promise<void>((resolve) => {
              wake = resolve;
              setTimeout(resolve, Math.min(remaining, 5_000));
            });
          }
          const payload = instagramPayload(await responses.shift()!.text());
          if ((payload.payload ?? payload).statusCode === 202) continue;
          return instagramCreatedMedia(payload, userId, caption);
        }
      });
      return { postUrl: `${IG_HOME}reel/${media.code}/`, postExternalId: media.code };
    } finally {
      page.off("response", onResponse);
    }
  },

  async recentPosts(page, handle) {
    await page.goto(`${IG_HOME}${handle}/reels/`, { waitUntil: "domcontentloaded" });
    await page.locator('a[href*="/reel/"]').first().waitFor({ state: "attached", timeout: 20_000 });
    const tiles = await page.locator('a[href*="/reel/"]').evaluateAll((anchors) =>
      anchors.map((anchor) => ({ href: (anchor as HTMLAnchorElement).href, text: (anchor as HTMLElement).innerText ?? "" })),
    );
    const seen = new Set<string>();
    const posts: PostStats[] = [];
    for (const tile of tiles) {
      const code = tile.href.match(/\/reel\/([A-Za-z0-9_-]+)/)?.[1];
      if (!code || seen.has(code)) continue;
      seen.add(code);
      // The reels grid overlay shows the play count; likes/comments only on hover.
      const numbers = tile.text.split(/\s+/).map((part) => parseCount(part)).filter((n): n is number => n !== null);
      posts.push({ externalId: code, url: `${IG_HOME}reel/${code}/`, views: numbers[0] ?? null, likes: null, comments: null });
    }
    return posts;
  },
};

// ─── TikTok ────────────────────────────────────────────────────────────────
// Selectors and the upload-finished signal (Post button loses `disabled`)
// follow social-auto-upload's tk_uploader; the studio page may render inside
// an iframe, so every locator goes through `root`.

const tiktok: PlatformRecipe = {
  label: "TikTok",
  home: "https://www.tiktok.com/",
  loginUrl: "https://www.tiktok.com/login",
  profileUrl: (handle) => `https://www.tiktok.com/@${handle}`,
  captionLimit: 2200,

  async session(context, page) {
    if (challengeUrl(page.url())) return { state: "checkpoint", userId: null };
    const session = await cookie(context, "https://www.tiktok.com/", "sessionid");
    return session
      ? { state: "ok", userId: await cookie(context, "https://www.tiktok.com/", "uid_tt") }
      : { state: "needs_login", userId: null };
  },

  async profileStats(page, handle) {
    await page.goto(tiktok.profileUrl(handle), { waitUntil: "domcontentloaded" });
    const read = async (key: string) =>
      parseCount(await page.locator(`[data-e2e="${key}"]`).first().innerText({ timeout: 15_000 }).catch(() => null));
    return { followers: await read("followers-count"), following: await read("following-count"), posts: null };
  },

  async upload({ page, task, expectedUserId, onSubmit }) {
    await requireBoundSession(tiktok, page, expectedUserId);
    const previousIds = new Set((await tiktok.recentPosts!(page, task.handle)).map((post) => post.externalId));
    await step("open-upload", () => page.goto("https://www.tiktok.com/tiktokstudio/upload", { waitUntil: "domcontentloaded", timeout: 120_000 }));
    if (/\/login/.test(page.url())) throw new RecipeStepError("identity", "TikTok session is signed out");
    const frame = page.locator('iframe[data-tt="Upload_index_iframe"]');
    const root = (await frame.count()) ? page.frameLocator('iframe[data-tt="Upload_index_iframe"]') : page;
    await step("attach-video", () => root.locator('input[type="file"]').first().setInputFiles(task.videoPath, { timeout: 60_000 }));
    {
      await step("caption", async () => {
        const editor = root.locator('div[contenteditable="true"]').first();
        await editor.click({ timeout: 60_000 });
        // The editor is prefilled with the file name; replace it.
        await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
        await page.keyboard.press("Delete");
        await page.keyboard.insertText(task.caption);
      });
    }
    const post = root.locator('button[data-e2e="post_video_button"], div.button-group > button:has-text("Post")').first();
    await step("wait-processed", async () => {
      const deadline = Date.now() + 10 * 60_000;
      while ((await post.getAttribute("disabled").catch(() => "")) !== null || (await post.getAttribute("aria-disabled").catch(() => null)) === "true") {
        if (Date.now() > deadline) throw new Error("video was not processed within 10 minutes");
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    });
    await requireBoundSession(tiktok, page, expectedUserId);
    onSubmit();
    await post.click();
    await step("wait-posted", () => page.waitForURL(/tiktokstudio\/content/, { timeout: 5 * 60_000 }));
    const latest = await step("find-post-url", async () => {
      const posts = await tiktok.recentPosts!(page, task.handle);
      const candidates = posts.filter((post) => !previousIds.has(post.externalId)
        && post.caption === task.caption
        && new URL(post.url).pathname.startsWith(`/@${task.handle}/video/`));
      if (candidates.length !== 1) throw new Error("Cannot confirm one new video with the submitted caption on the bound profile");
      return candidates[0]!;
    });
    return { postUrl: latest.url, postExternalId: latest.externalId };
  },

  async recentPosts(page, handle) {
    await page.goto(tiktok.profileUrl(handle), { waitUntil: "domcontentloaded" });
    await page.locator('[data-e2e="user-post-item-list"]').first().waitFor({ state: "attached", timeout: 20_000 });
    const tiles = await page.locator('[data-e2e="user-post-item"]').evaluateAll((items) =>
      items.map((item) => ({
        href: (item.querySelector('a[href*="/video/"]') as HTMLAnchorElement | null)?.href ?? "",
        views: (item.querySelector('[data-e2e="video-views"]') as HTMLElement | null)?.innerText ?? "",
        caption: item.querySelector("img")?.getAttribute("alt") ?? "",
      })),
    );
    const posts: PostStats[] = [];
    for (const tile of tiles) {
      const code = tile.href.match(/\/video\/(\d+)/)?.[1];
      if (code) posts.push({ externalId: code, url: tile.href.split("?")[0]!, views: parseCount(tile.views), caption: tile.caption, likes: null, comments: null });
    }
    return posts;
  },
};

// ─── YouTube ───────────────────────────────────────────────────────────────
// Studio flow from social-auto-upload's youtube_uploader: fill() (not typing)
// so #hashtags do not open autocomplete, Next until the visibility radios,
// and wait for processing before Done — publishing mid-upload kills it.

const youtube: PlatformRecipe = {
  label: "YouTube",
  home: "https://studio.youtube.com/",
  loginUrl: "https://accounts.google.com/ServiceLogin?service=youtube&continue=https://studio.youtube.com/",
  profileUrl: (handle) => `https://www.youtube.com/@${handle}/shorts`,
  captionLimit: 5000,

  async session(context, page) {
    if (challengeUrl(page.url())) return { state: "checkpoint", userId: null };
    if (!(await cookie(context, "https://www.youtube.com/", "SAPISID"))) return { state: "needs_login", userId: null };
    const channel = page.url().match(/\/channel\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
    return { state: "ok", userId: channel };
  },

  async profileStats(page, handle) {
    await page.goto(`https://www.youtube.com/@${handle}`, { waitUntil: "domcontentloaded" });
    const text = await page.locator("#page-header, yt-page-header-renderer").first().innerText({ timeout: 15_000 }).catch(() => "");
    return {
      followers: parseCount(text.match(/([\d.,]+[KMB]?)\s+subscribers/i)?.[1]),
      following: null,
      posts: parseCount(text.match(/([\d.,]+[KMB]?)\s+videos/i)?.[1]),
    };
  },

  async upload({ page, task, expectedUserId, onSubmit }) {
    await requireBoundSession(youtube, page, expectedUserId);
    await step("open-upload", () => page.goto("https://www.youtube.com/upload", { waitUntil: "domcontentloaded", timeout: 120_000 }));
    await step("attach-video", () => page.locator('input[type="file"]').first().setInputFiles(task.videoPath, { timeout: 60_000 }));
    const [title, ...rest] = task.caption.split("\n");
    await step("title", async () => {
      await page.locator("#title-textarea").waitFor({ state: "visible", timeout: 120_000 });
      await page.locator("#title-textarea #textbox").fill((title || "Short").slice(0, 100));
      if (rest.join("\n").trim()) await page.locator("#description-textarea #textbox").fill(rest.join("\n").trim());
    });
    await step("not-for-kids", () => page.locator('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]').click());
    await step("next-to-visibility", async () => {
      for (let i = 0; i < 5 && !(await page.locator('tp-yt-paper-radio-button[name="PUBLIC"]').isVisible()); i++) {
        await page.locator("#next-button").click();
        await page.waitForTimeout(1_000);
      }
      await page.locator('tp-yt-paper-radio-button[name="PUBLIC"]').click();
    });
    await step("wait-processed", async () => {
      const deadline = Date.now() + 30 * 60_000;
      for (;;) {
        const label = (await page.locator(".progress-label").first().innerText().catch(() => "")).toLowerCase();
        if (/abandoned|failed|error/.test(label)) throw new Error(`processing failed: ${label}`);
        if (/checks complete|processing complete|upload complete|finished processing/.test(label)) return;
        if (Date.now() > deadline) throw new Error(`upload still processing: ${label}`);
        await page.waitForTimeout(5_000);
      }
    });
    const link = await page.locator('a[href*="youtu.be"], a[href*="/shorts/"], a[href*="watch?v="]').first().getAttribute("href").catch(() => null);
    await requireBoundSession(youtube, page, expectedUserId);
    onSubmit();
    await page.locator("#done-button").click();
    await step("confirm-published", async () => {
      const dialog = page.locator("ytcp-video-share-dialog");
      await dialog.waitFor({ state: "visible", timeout: 120_000 });
      const text = await dialog.innerText();
      if (!/video published/i.test(text)) throw new Error("YouTube did not confirm Video published");
      const confirmedLink = await dialog.locator('a[href*="youtu.be"], a[href*="watch?v="], a[href*="/shorts/"]').first().getAttribute("href");
      const idOf = (value: string | null) => value?.match(/(?:youtu\.be\/|shorts\/|v=)([A-Za-z0-9_-]{6,})/)?.[1];
      if (!idOf(link) || idOf(confirmedLink) !== idOf(link)) throw new Error("Published dialog does not confirm this video's id");
    });
    const url = await step("find-post-url", async () => {
      if (!link) throw new Error("no video link on the details page");
      return link;
    });
    const id = url.match(/(?:youtu\.be\/|shorts\/|v=)([A-Za-z0-9_-]{6,})/)?.[1] ?? null;
    return { postUrl: id ? `https://www.youtube.com/shorts/${id}` : url, postExternalId: id };
  },
};

// ─── X: session and counters only; upload hands off ────────────────────────

const x: PlatformRecipe = {
  label: "X",
  home: "https://x.com/home",
  loginUrl: "https://x.com/i/flow/login",
  profileUrl: (handle) => `https://x.com/${handle}`,
  captionLimit: 280,
  async session(context, page) {
    if (challengeUrl(page.url())) return { state: "checkpoint", userId: null };
    if (!(await cookie(context, "https://x.com/", "auth_token"))) return { state: "needs_login", userId: null };
    const twid = await cookie(context, "https://x.com/", "twid");
    return { state: "ok", userId: twid ? decodeURIComponent(twid).replace(/^u=/, "") : null };
  },
  async profileStats(page, handle) {
    await page.goto(x.profileUrl(handle), { waitUntil: "domcontentloaded" });
    const read = async (suffix: string) =>
      parseCount(await page.locator(`a[href="/${handle}/${suffix}"] span`).first().innerText({ timeout: 15_000 }).catch(() => null));
    return { followers: await read("followers"), following: await read("following"), posts: null };
  },
};

export const PLATFORM_RECIPES: Record<OwnedPlatform, PlatformRecipe> = { instagram, tiktok, youtube, x };
