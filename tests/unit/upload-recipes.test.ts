import { describe, expect, test } from "bun:test";
import type { Page } from "../../cli/lib/uploads/browser.js";
import { PLATFORM_RECIPES } from "../../cli/lib/uploads/platforms.js";

function pageFixture(platform: "youtube" | "tiktok", confirmed: boolean, newVideo = false) {
  let submitted = false;
  let current = platform === "youtube" ? "https://studio.youtube.com/channel/UCfixture" : "https://www.tiktok.com/";
  const locator = (selector: string): any => ({
    first() { return this; },
    locator,
    async count() { return 0; },
    async setInputFiles() {}, async fill() {}, async waitFor() {
      if (selector.includes("ytcp-video-share-dialog") && !confirmed) throw new Error("publication not confirmed");
    },
    async click() {}, async isVisible() { return true; },
    async getAttribute(name: string) { return name === "href" ? "https://youtu.be/fixture12345" : null; },
    async innerText() { return selector.includes("progress-label") ? "Checks complete" : "Video published"; },
    async evaluateAll() {
      return [{ href: `https://www.tiktok.com/@fixture/video/${newVideo && submitted ? "999999" : "123456"}`, views: "1", caption: "fixture caption" }];
    },
  });
  const page = {
    locator, async goto(url: string) { current = platform === "youtube" ? "https://studio.youtube.com/channel/UCfixture/videos/upload" : url; }, url: () => current,
    context: () => ({ cookies: async () => platform === "youtube" ? [{ name: "SAPISID", value: "fixture" }] : [{ name: "sessionid", value: "fixture" }, { name: "uid_tt", value: "111" }] }),
    async waitForTimeout() {}, async waitForURL() {},
    keyboard: { async press() {}, async insertText() {} },
  } as unknown as Page;
  return { page, onSubmit: () => { submitted = true; }, wasSubmitted: () => submitted };
}

describe("publication proof", () => {
  test("a YouTube details URL without a completed publish dialog is not success", async () => {
    const f = pageFixture("youtube", false);
    await expect(PLATFORM_RECIPES.youtube.upload!({ ...f, task: { handle: "fixture", videoPath: "/fixture.mp4", caption: "fixture caption" }, expectedUserId: "UCfixture" })).rejects.toThrow(/confirm|publish/i);
    expect(f.wasSubmitted()).toBe(true);
  });

  test("YouTube accepts a completed publish dialog for the exact uploaded video", async () => {
    const f = pageFixture("youtube", true);
    expect(await PLATFORM_RECIPES.youtube.upload!({ ...f, task: { handle: "fixture", videoPath: "/fixture.mp4", caption: "fixture caption" }, expectedUserId: "UCfixture" })).toEqual({ postUrl: "https://www.youtube.com/shorts/fixture12345", postExternalId: "fixture12345" });
    expect(f.wasSubmitted()).toBe(true);
  });

  test("TikTok accepts exactly one new video matching the submitted caption after redirect", async () => {
    const f = pageFixture("tiktok", true, true);
    expect(await PLATFORM_RECIPES.tiktok.upload!({ ...f, task: { handle: "fixture", videoPath: "/fixture.mp4", caption: "fixture caption" }, expectedUserId: "111" })).toEqual({ postUrl: "https://www.tiktok.com/@fixture/video/999999", postExternalId: "999999" });
  });

  test("TikTok refuses a different bound user before submitting", async () => {
    const f = pageFixture("tiktok", true, true);
    await expect(PLATFORM_RECIPES.tiktok.upload!({ ...f, task: { handle: "fixture", videoPath: "/fixture.mp4", caption: "fixture caption" }, expectedUserId: "222" })).rejects.toThrow(/bound account/);
    expect(f.wasSubmitted()).toBe(false);
  });

  test("TikTok cannot report the previous profile video as the new publication", async () => {
    const f = pageFixture("tiktok", true);
    await expect(PLATFORM_RECIPES.tiktok.upload!({ ...f, task: { handle: "fixture", videoPath: "/fixture.mp4", caption: "fixture caption" }, expectedUserId: "111" })).rejects.toThrow(/new|confirm/i);
  });
});
