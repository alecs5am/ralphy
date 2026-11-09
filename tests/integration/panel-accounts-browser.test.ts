// Opt-in real Chromium smoke; isolated library and loopback traffic only.
import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { makeTmpRoot } from "../helpers/tmp-root.js";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import { addOwnedAccount, appendUploadMetrics, claimNextUpload, enqueueUpload, finishUpload, markUploadSubmitted } from "../../cli/lib/store/uploads.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import { startPanelServer } from "../../cli/lib/panel/server.js";

test.skipIf(process.env.RALPHY_BROWSER_TESTS !== "1")("Accounts onboarding, scoped copy and keyboard work in a narrow browser", async () => {
  const tmp = makeTmpRoot("ralphy-panel-browser");
  const dataRoot = path.join(tmp.dir, ".ralphy");
  const workspace = createWorkspace({ slug: "psychology-lab", name: "Psychology lab" });
  const other = createWorkspace({ slug: "fitness-lab", name: "Fitness lab" });
  const server = startPanelServer({ dataRoot, port: 0, version: "browser-fixture" });
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.RALPHY_BROWSER_CHANNEL ? { channel: process.env.RALPHY_BROWSER_CHANNEL } : {}) });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => new URL(route.request().url()).origin === new URL(server.url).origin ? route.continue() : route.abort());
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text: string) => { (window as any).__copied = text; } } });
    });
    await page.clock.install();
    await page.goto(`${server.url}#/accounts`);
    await page.getByText("No owned accounts yet.", { exact: true }).waitFor();
    const onboarding = await page.locator("#acclist").innerText();
    expect(onboarding).toContain("'--root' '" + dataRoot + "'");
    expect(onboarding).toContain("'--workspace' 'WORKSPACE_ID'");
    expect(onboarding).toContain("'workspace' 'list'");

    const first = addOwnedAccount({ workspaceId: workspace.id, platform: "instagram", handle: "same.handle", niche: "psychology" }).account;
    const second = addOwnedAccount({ workspaceId: other.id, platform: "instagram", handle: "same.handle", niche: "fitness" }).account;
    const source = path.join(tmp.dir, "fixture.mp4");
    fs.writeFileSync(source, "fixture bytes");
    const media = async (workspaceId: string) => (await ingestObject({ scope: { workspaceId }, sourcePath: source, originalName: "fixture.mp4", mime: "video/mp4", storageClass: "durable", transfer: "copy" })).id;
    const unknown = enqueueUpload({ workspaceId: workspace.id, accountId: first.id, mediaObjectId: await media(workspace.id), caption: "Check the outcome", approve: true });
    claimNextUpload({ id: unknown.id });
    markUploadSubmitted(unknown.id);
    finishUpload(unknown.id, { state: "unknown", stage: "after-submit", error: "Fixture confirmation lost" });
    const secondMedia = await media(other.id);
    enqueueUpload({ workspaceId: other.id, accountId: second.id, mediaObjectId: secondMedia, caption: "Waiting for review" });
    const published = enqueueUpload({ workspaceId: other.id, accountId: second.id, mediaObjectId: secondMedia, caption: "Published fixture", approve: true });
    claimNextUpload({ id: published.id });
    markUploadSubmitted(published.id);
    finishUpload(published.id, { state: "published", postUrl: "https://www.instagram.com/reel/FIXTURE/", postExternalId: "FIXTURE" });
    appendUploadMetrics({ uploadId: published.id, source: "fixture", views: 1200, asOf: Date.now() - 2 * 86_400_000 });
    await page.reload();
    await page.locator("tr[data-kind=account]").first().waitFor();
    expect(await page.locator("tr[data-kind=account]").count()).toBe(2);
    expect(await page.locator(`[data-id="${published.id}"]`).innerText()).toContain("stale");
    expect(await page.locator(`[data-id="${published.id}"] a.title`).getAttribute("href")).toBe("https://www.instagram.com/reel/FIXTURE/");
    await page.keyboard.press("/");
    expect(await page.locator("#aq").evaluate((input) => input === document.activeElement)).toBe(true);
    await page.locator("#aq").fill("psychology");
    expect(await page.locator("tr[data-kind=account]").count()).toBe(1);
    const refreshed = page.waitForResponse((response) => response.url().endsWith("/api/accounts"));
    await page.clock.fastForward(10_001);
    await refreshed;
    expect(await page.locator("#aq").inputValue()).toBe("psychology");
    expect(await page.locator("#aq").evaluate((input) => input === document.activeElement)).toBe(true);
    await page.keyboard.press("Escape");
    expect(await page.locator("#aq").inputValue()).toBe("");
    expect(await page.locator("tr[data-kind=account]").count()).toBe(2);
    await page.locator(`tr[data-id="${first.id}"] [data-act=copy-account]`).click();
    await page.waitForFunction(() => Boolean((window as any).__copied));
    const copied = await page.evaluate(() => (window as any).__copied as string);
    expect(copied).toContain(`'--root' '${dataRoot}' '--workspace' '${workspace.id}'`);
    expect(copied).toContain(`'account' 'login' '${first.id}'`);
    expect(copied).not.toContain(other.id);
    await page.locator(`[data-id="${unknown.id}"] [data-act=copy-upload]`).click();
    await page.waitForFunction(() => ((window as any).__copied as string).startsWith("Publication outcome unknown."));
    const recovery = await page.evaluate(() => (window as any).__copied as string);
    expect(recovery).toContain(`'--workspace' '${workspace.id}' 'upload' 'show' '${unknown.id}'`);
    expect(recovery).toContain(`'account' 'open' '${first.id}'`);
    expect(recovery).not.toContain("'upload' 'retry'");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    if (process.env.RALPHY_BROWSER_EVIDENCE_DIR) {
      fs.mkdirSync(process.env.RALPHY_BROWSER_EVIDENCE_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.RALPHY_BROWSER_EVIDENCE_DIR, "accounts-narrow.png"), fullPage: true });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.screenshot({ path: path.join(process.env.RALPHY_BROWSER_EVIDENCE_DIR, "accounts-wide.png"), fullPage: true });
    }
  } finally {
    await browser?.close();
    server.stop();
    closeDomainDb();
    tmp.cleanup();
  }
}, 45_000);
