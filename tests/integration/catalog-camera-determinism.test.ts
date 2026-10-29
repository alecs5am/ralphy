// #567 — every camera recipe is deterministic under seek.
//
// Each recipe's preview composition is loaded in headless Chromium and the
// timeline is seeked to the same sample times in three orders: forward,
// reverse and a seeded shuffle, plus a fresh page per time for a subset (no
// seek history at all). The frame state (computed transform, transform origin,
// filter and opacity of the camera target and every layer, plus SVG blur
// attributes) must be identical in every order: a recipe that reads state
// carried between frames, wall-clock time or a random source would differ.
//
// State, not screenshots: headless Chromium picks a raster scale for a
// transformed layer from its transform history, so two screenshots of the SAME
// DOM state can differ by a few pixels after different seek orders. Rendered
// output identity is checked separately with two full renders (issue notes).
// GSAP loads from the pinned CDN URL once and is served from a temp cache; the
// test skips when Chromium or the network is unavailable.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CatalogManifestSchema } from "../../cli/lib/catalog/schema.ts";
import { buildPreviewHtml, previewTiming } from "../../cli/lib/catalog/harness.ts";

const REPO = path.resolve(import.meta.dir, "..", "..");
const manifest = CatalogManifestSchema.parse(JSON.parse(fs.readFileSync(path.join(REPO, "catalog", "manifest.json"), "utf-8")));
const cameras = manifest.items.filter((i) => i.kind === "camera");
const GSAP_URL = "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js";

type Browser = import("playwright").Browser;
let browser: Browser | null = null;
let gsapSource: string | null = null;
let tmp: string;
let skipReason: string | null = null;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-camdet-"));
  const cache = path.join(os.tmpdir(), "ralphy-gsap-3.14.2.min.js");
  try {
    if (fs.existsSync(cache)) gsapSource = fs.readFileSync(cache, "utf-8");
    else {
      const res = await fetch(GSAP_URL);
      if (res.ok) {
        gsapSource = await res.text();
        fs.writeFileSync(cache, gsapSource);
      }
    }
  } catch {
    gsapSource = null;
  }
  if (!gsapSource) skipReason = "GSAP not reachable";
  try {
    const { chromium } = await import("playwright");
    if (!fs.existsSync(chromium.executablePath())) skipReason = "no Chromium for Playwright";
    else if (!skipReason) browser = await chromium.launch();
  } catch {
    skipReason = "playwright unavailable";
  }
});

afterAll(async () => {
  await browser?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function lcgShuffle<T>(xs: T[], seed: number): T[] {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

async function openPage(file: string) {
  const page = await browser!.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.route(GSAP_URL, (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: gsapSource! }));
  await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean((window as unknown as { __timelines?: Record<string, unknown> }).__timelines?.main));
  return page;
}

/** Seek, then read the visual state of every camera element; identity transforms and neutral filters normalise to one spelling. */
async function frameState(page: Awaited<ReturnType<typeof openPage>>, t: number): Promise<string> {
  return page.evaluate((time) => {
    (window as unknown as { __timelines: Record<string, { totalTime: (t: number, s: boolean) => void }> }).__timelines.main.totalTime(time, false);
    const norm = (tr: string) => {
      if (tr === "none") return "I";
      const nums = (tr.match(/-?[\d.]+(e-?\d+)?/g) ?? []).map((n) => Math.round(parseFloat(n) * 1000) / 1000);
      const ident = nums.length === 6 && nums.join(",") === "1,0,0,1,0,0";
      return ident ? "I" : nums.join(",");
    };
    const filt = (f: string) => f.replace(/blur\(0px\)|brightness\(1\)|none/g, "").trim();
    const els = ["#cam-frame", "#cam-bg", "#cam-mid", "#cam-fg", "#cam-subject"].map((sel) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return "-";
      const c = getComputedStyle(el);
      const tr = norm(c.transform);
      return [tr, tr === "I" ? "" : c.transformOrigin, filt(c.filter), c.opacity].join("|");
    });
    const blurs = Array.from(document.querySelectorAll("feGaussianBlur")).map((n) => n.getAttribute("stdDeviation"));
    return els.join(" ; ") + " ; " + blurs.join(",");
  }, t);
}

describe("camera recipes are deterministic under seek (#567)", () => {
  test("12 recipes", () => {
    expect(cameras.length).toBe(12);
  });

  for (const item of cameras) {
    test(`${item.id}: forward, reverse, shuffled and fresh-page seeks give identical frame state`, async () => {
      if (skipReason || !browser) {
        console.warn(`skip ${item.id}: ${skipReason}`);
        return;
      }
      const dir = path.join(tmp, item.id);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, "index.html");
      fs.writeFileSync(file, buildPreviewHtml({ item, fragmentHtml: fs.readFileSync(path.join(REPO, "catalog", item.source), "utf-8"), sfxFile: null }));
      const { total } = previewTiming(item);
      const times = Array.from({ length: 10 }, (_, i) => Math.round(((total * (i + 0.5)) / 10) * 1000) / 1000);
      const page = await openPage(file);
      const forward = new Map<number, string>();
      for (const t of times) forward.set(t, await frameState(page, t));
      for (const t of [...times].reverse()) expect(await frameState(page, t)).toBe(forward.get(t)!);
      for (const t of lcgShuffle(times, 567)) expect(await frameState(page, t)).toBe(forward.get(t)!);
      await page.close();
      for (const t of [times[2]!, times[5]!, times[8]!]) {
        const fresh = await openPage(file);
        expect(await frameState(fresh, t)).toBe(forward.get(t)!);
        await fresh.close();
      }
      // The recipe actually moves the frame: the sampled frames are not all the same.
      expect(new Set(forward.values()).size).toBeGreaterThan(1);
    }, 60_000);
  }
});
