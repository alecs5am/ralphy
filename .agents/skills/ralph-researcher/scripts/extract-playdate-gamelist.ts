import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";
import https from "https";

const args = process.argv.slice(2);
const urlArg = args[args.indexOf("--url") + 1] || "https://play.date/";
const outputArg = args[args.indexOf("--output") + 1];

if (!outputArg) {
  console.error("Usage: --url <URL> --output <DIR>");
  process.exit(1);
}

const OUTPUT = path.resolve(outputArg);

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.open(dest, "w").then((fh) => {
      https
        .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            fh.close();
            const next = res.headers.location.startsWith("http")
              ? res.headers.location
              : new URL(res.headers.location, url).href;
            downloadFile(next, dest).then(resolve).catch(reject);
            return;
          }
          const chunks: Buffer[] = [];
          res.on("data", (d: Buffer) => chunks.push(d));
          res.on("end", async () => {
            await fh.write(Buffer.concat(chunks));
            await fh.close();
            resolve();
          });
          res.on("error", reject);
        })
        .on("error", reject);
    });
  });
}

async function run() {
  await fs.mkdir(path.join(OUTPUT, "gamelist-covers"), { recursive: true });
  await fs.mkdir(path.join(OUTPUT, "hero-shots"), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  console.log(`Loading ${urlArg} ...`);
  await page.goto(urlArg, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(2500);

  // Full page screenshot for overall design context
  await page.screenshot({ path: path.join(OUTPUT, "fullpage-desktop.png"), fullPage: true });

  // Find the #gamelist anchor and screenshot the section + extract images
  const gamelist = page.locator("#gamelist").first();
  let gamelistFound = false;
  try {
    await gamelist.scrollIntoViewIfNeeded({ timeout: 5000 });
    await page.waitForTimeout(1500);
    await gamelist.screenshot({ path: path.join(OUTPUT, "gamelist-section.png") });
    gamelistFound = true;
    console.log("✓ #gamelist screenshot captured");
  } catch (e) {
    console.log("⚠ #gamelist not found, falling back to whole-page search");
  }

  // Extract all image URLs from #gamelist (or whole page if not found)
  const imgs = await page.evaluate((gridSelector) => {
    const root = document.querySelector(gridSelector) || document.body;
    const all: { src: string; srcset: string; alt: string }[] = [];
    root.querySelectorAll("img").forEach((el) => {
      const img = el as HTMLImageElement;
      all.push({
        src: img.currentSrc || img.src || "",
        srcset: img.srcset || "",
        alt: img.alt || "",
      });
    });
    // Also any background-image inside the section
    root.querySelectorAll("[style*='background-image']").forEach((el) => {
      const m = (el as HTMLElement).style.backgroundImage?.match(/url\(["']?([^"')]+)["']?\)/);
      if (m?.[1]) all.push({ src: m[1], srcset: "", alt: "background" });
    });
    return all;
  }, gamelistFound ? "#gamelist" : "body");

  console.log(`Found ${imgs.length} <img> elements in target`);

  // Pick highest-res variant from srcset when available
  const pickBest = (entry: { src: string; srcset: string }): string => {
    if (entry.srcset) {
      const parts = entry.srcset
        .split(",")
        .map((p) => p.trim())
        .map((p) => {
          const [url, w] = p.split(/\s+/);
          const n = w ? parseInt(w.replace(/[^\d]/g, "")) : 0;
          return { url, n };
        })
        .filter((p) => p.url)
        .sort((a, b) => b.n - a.n);
      if (parts.length) return parts[0].url;
    }
    return entry.src;
  };

  const downloaded: { name: string; url: string; alt: string }[] = [];
  for (let i = 0; i < imgs.length; i++) {
    const entry = imgs[i];
    let bestUrl = pickBest(entry);
    if (!bestUrl) continue;
    if (bestUrl.startsWith("//")) bestUrl = "https:" + bestUrl;
    if (bestUrl.startsWith("/")) bestUrl = new URL(bestUrl, urlArg).href;
    try {
      const u = new URL(bestUrl);
      let name = u.pathname.split("/").pop() || `img-${i}`;
      name = name.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 80);
      if (!path.extname(name)) name += ".jpg";
      const dest = path.join(OUTPUT, "gamelist-covers", `${String(i + 1).padStart(2, "0")}_${name}`);
      await downloadFile(bestUrl, dest);
      downloaded.push({ name: path.basename(dest), url: bestUrl, alt: entry.alt });
      process.stdout.write(".");
    } catch (e) {
      console.log(`\n  failed ${bestUrl}: ${(e as Error).message}`);
    }
  }
  console.log(`\nDownloaded ${downloaded.length} images`);

  // Also grab hero / hardware shots — scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUTPUT, "hero-shots", "hero-fold-1440.png") });

  // Write manifest
  await fs.writeFile(
    path.join(OUTPUT, "manifest.json"),
    JSON.stringify(
      {
        url: urlArg,
        captured_at: new Date().toISOString(),
        gamelist_section_screenshot: gamelistFound ? "gamelist-section.png" : null,
        fullpage_screenshot: "fullpage-desktop.png",
        hero_fold_screenshot: "hero-shots/hero-fold-1440.png",
        downloaded_count: downloaded.length,
        downloaded,
      },
      null,
      2,
    ),
  );

  await browser.close();
  console.log(`\nDone → ${OUTPUT}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
