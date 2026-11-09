// Browser sessions for owned accounts (#600).
//
// Every account gets its own persistent profile under
// `<data-root>/browser-profiles/<account-id>/`, so accounts never share
// cookies, storage or a fingerprint. Profiles run through patchright (a
// Playwright build patched against automation detection) on the installed
// Google Chrome, headed, without stealth scripts — the setup patchright and
// dreammis/social-auto-upload recommend. Playwright's own Chromium is the
// fallback when Chrome or patchright is missing. The owner signs in by hand
// (`ralphy account login`); Ralphy never handles a password.

import fs from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "patchright";
import { parseCount as parseMetricCount } from "../analytics/metric-parse.js";
import { acquireAccountBrowserLease } from "../store/uploads.js";
import { ralphDir } from "../paths.js";

export type { BrowserContext, Page };

/** `<data-root>/browser-profiles/<account-id>/` — never inside a project, never exported. */
export function profileDir(accountId: string, dataRoot = ralphDir()): string {
  if (!/^acct_[0-9a-f-]{36}$/.test(accountId)) throw new Error(`Invalid account id: ${accountId}`);
  return path.join(dataRoot, "browser-profiles", accountId);
}

export function hasProfile(accountId: string, dataRoot = ralphDir()): boolean {
  return fs.existsSync(profileDir(accountId, dataRoot));
}

type Chromium = {
  launchPersistentContext(dir: string, options: Record<string, unknown>): Promise<BrowserContext>;
};

async function loadChromium(): Promise<{ chromium: Chromium; patched: boolean }> {
  try {
    const { chromium } = await import("patchright");
    return { chromium: chromium as unknown as Chromium, patched: true };
  } catch {
    try {
      const { chromium } = await import("playwright");
      return { chromium: chromium as unknown as Chromium, patched: false };
    } catch {
      throw new Error("patchright / playwright not installed. Run: bun install");
    }
  }
}

export async function openAccountBrowser(
  accountId: string,
  options: { headless?: boolean; proxy?: string | null } = {},
): Promise<BrowserContext> {
  const release = acquireAccountBrowserLease(accountId);
  try {
    const { chromium, patched } = await loadChromium();
    const dir = profileDir(accountId);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const launch = (channel?: string) =>
      chromium.launchPersistentContext(dir, {
        ...(channel ? { channel } : {}),
        headless: options.headless ?? false,
        // A real window instead of a fixed viewport; patchright's guidance.
        viewport: null,
        locale: "en-US",
        ...(options.proxy ? { proxy: { server: options.proxy } } : {}),
        ...(patched ? {} : { args: ["--disable-blink-features=AutomationControlled"], ignoreDefaultArgs: ["--enable-automation"] }),
      });
    try {
      const context = await launch("chrome");
      context.once("close", release);
      return context;
    } catch (error) {
      const message = String((error as Error)?.message ?? error);
      // A locked profile (already open elsewhere) must surface, not silently fall back.
      if (/ProcessSingleton|in use|lock/i.test(message)) {
        throw new Error(`The browser profile for ${accountId} is already open; close that window first`);
      }
      if (!/chrome|executable|distribution/i.test(message)) throw error;
      const context = await launch();
      context.once("close", release);
      return context;
    }
  } catch (error) {
    release();
    throw error;
  }
}

export async function firstPage(context: BrowserContext): Promise<Page> {
  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(30_000);
  return page;
}

/** Resolves when the owner closes the last window of the context. */
export function waitForClose(context: BrowserContext): Promise<void> {
  return new Promise((resolve) => context.on("close", () => resolve()));
}

/** A visible counter ("12.5K", "1,234") as an integer; null when the page shows something else. */
export function parseCount(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  try {
    return parseMetricCount(raw.trim());
  } catch {
    return null;
  }
}
