import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";

const args = process.argv.slice(2);
const outputArg = args[args.indexOf("--output") + 1];
if (!outputArg) {
  console.error("Usage: --output <DIR>");
  process.exit(1);
}
const OUT = path.resolve(outputArg);

async function run() {
  await fs.mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  await page.goto("https://play.date/", { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(2000);

  // Find each section by heading text — h2 anchors
  const sections = await page.evaluate(() => {
    const h2s = Array.from(document.querySelectorAll("h1, h2, h3"));
    return h2s.map((h) => ({
      tag: h.tagName,
      text: (h as HTMLElement).innerText.trim(),
      id: h.id || h.parentElement?.id || "",
    }));
  });
  console.log("Headings found:", JSON.stringify(sections, null, 2));

  // Try to screenshot the section containing "The Crank"
  const crankHandle = page
    .locator('h1, h2, h3', { hasText: /^The Crank/i })
    .first();
  if (await crankHandle.count()) {
    // Scroll its parent section into view and grab a wide screenshot
    const box = await crankHandle.evaluate((el) => {
      const section = el.closest("section") || el.parentElement?.parentElement || el.parentElement;
      const rect = section?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y + window.scrollY, w: rect.width, h: rect.height } : null;
    });
    if (box) {
      await page.evaluate((y) => window.scrollTo(0, y - 50), box.y);
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(OUT, "crank-section.png"),
        clip: { x: Math.max(0, box.x), y: 50, width: Math.min(1440, box.w), height: Math.min(900, box.h) },
      });
      console.log("✓ crank section captured");
    }
  } else {
    console.log("⚠ no 'The Crank' heading found");
  }

  // Footer hands-on shot — scroll to bottom of page
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "footer-hands.png") });

  // The Idea / Who Made It device close-up (search for "The Idea" heading)
  const ideaH = page.locator('h1, h2, h3', { hasText: /^The Idea/i }).first();
  if (await ideaH.count()) {
    const box = await ideaH.evaluate((el) => {
      const section = el.closest("section") || el.parentElement?.parentElement;
      const rect = section?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y + window.scrollY, w: rect.width, h: rect.height } : null;
    });
    if (box) {
      await page.evaluate((y) => window.scrollTo(0, y - 50), box.y);
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(OUT, "idea-section.png"),
        clip: { x: Math.max(0, box.x), y: 50, width: Math.min(1440, box.w), height: Math.min(900, box.h) },
      });
      console.log("✓ idea section captured");
    }
  }

  // Also try to extract all <picture><source srcset> inside the entire page → catches game covers and any other lazy-loaded refs
  const pictureSources = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll("picture source[srcset]").forEach((el) => {
      const ss = el.getAttribute("srcset") || "";
      ss.split(",").forEach((part) => {
        const url = part.trim().split(/\s+/)[0];
        if (url && !url.startsWith("data:")) out.push(url);
      });
    });
    document.querySelectorAll("img[src]").forEach((el) => {
      const src = (el as HTMLImageElement).src;
      if (src && !src.startsWith("data:")) out.push(src);
    });
    return Array.from(new Set(out));
  });
  await fs.writeFile(path.join(OUT, "all-picture-urls.json"), JSON.stringify(pictureSources, null, 2));
  console.log(`extracted ${pictureSources.length} picture URLs`);

  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
