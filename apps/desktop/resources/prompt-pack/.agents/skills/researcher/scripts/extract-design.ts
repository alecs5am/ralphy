import { chromium, type Page, type Browser } from "playwright";
import fs from "fs/promises";
import path from "path";
import https from "https";
import http from "http";

// --- Config ---
const args = process.argv.slice(2);
const urlArg = args[args.indexOf("--url") + 1];
const outputArg = args[args.indexOf("--output") + 1];

if (!urlArg || !outputArg) {
  console.error("Usage: --url <URL> --output <DIR>");
  process.exit(1);
}

const BASE_URL = urlArg.replace(/\/$/, "");
const OUTPUT = path.resolve(outputArg);
const DOMAIN = new URL(BASE_URL).hostname.replace("www.", "");

// --- Helpers ---
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const file = fs.open(dest, "w").then((fh) => {
      client
        .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            fh.close();
            downloadFile(res.headers.location, dest).then(resolve).catch(reject);
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

function sanitizeFilename(url: string): string {
  const u = new URL(url);
  let name = u.pathname.split("/").pop() || "file";
  name = name.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 80);
  if (!path.extname(name)) name += ".bin";
  return name;
}

function resolveUrl(href: string): string {
  try {
    return new URL(href, BASE_URL).href;
  } catch {
    return "";
  }
}

// --- Main extraction ---
async function run() {
  await fs.mkdir(path.join(OUTPUT, "screenshots"), { recursive: true });
  await fs.mkdir(path.join(OUTPUT, "assets", "images"), { recursive: true });
  await fs.mkdir(path.join(OUTPUT, "assets", "fonts"), { recursive: true });
  await fs.mkdir(path.join(OUTPUT, "assets", "icons"), { recursive: true });
  await fs.mkdir(path.join(OUTPUT, "pages"), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  console.log(`\n=== Extracting: ${BASE_URL} ===\n`);

  // 1. Load homepage
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  // 2. Screenshots
  console.log("[1/7] Screenshots...");
  await page.screenshot({ path: path.join(OUTPUT, "screenshots", "desktop-1440.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUTPUT, "screenshots", "mobile-390.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);

  // 3. Discover internal links
  console.log("[2/7] Discovering pages...");
  const links = await page.$$eval("a[href]", (els) =>
    els.map((a) => a.getAttribute("href") || "")
  );

  const internalPaths = new Set<string>();
  internalPaths.add("/");
  for (const href of links) {
    try {
      const u = new URL(href, BASE_URL);
      if (u.hostname.replace("www.", "") === new URL(BASE_URL).hostname.replace("www.", "")) {
        const p = u.pathname.replace(/\/$/, "") || "/";
        if (!p.includes("#") && !p.match(/\.(png|jpg|svg|pdf|zip|mp4)$/i)) {
          internalPaths.add(p);
        }
      }
    } catch {}
  }
  console.log(`  Found ${internalPaths.size} pages: ${[...internalPaths].join(", ")}`);

  // 4. Extract design tokens from homepage
  console.log("[3/7] Design tokens...");
  const tokens = await page.evaluate(() => {
    const root = document.documentElement;
    const computed = getComputedStyle(root);

    // CSS custom properties
    const customProps: Record<string, string> = {};
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSStyleRule && rule.selectorText === ":root") {
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style[i];
              if (prop.startsWith("--")) {
                customProps[prop] = rule.style.getPropertyValue(prop).trim();
              }
            }
          }
        }
      } catch {}
    }

    // Collect all colors used
    const colorSet = new Set<string>();
    const fontSet = new Set<string>();
    const elements = document.querySelectorAll("*");
    const sample = Array.from(elements).slice(0, 500);
    for (const el of sample) {
      const s = getComputedStyle(el);
      colorSet.add(s.color);
      colorSet.add(s.backgroundColor);
      if (s.fontFamily) fontSet.add(s.fontFamily.split(",")[0].trim().replace(/['"]/g, ""));
    }

    // Body styles
    const bodyStyle = getComputedStyle(document.body);

    return {
      customProperties: customProps,
      colors: [...colorSet].filter(
        (c) => c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent"
      ),
      fonts: [...fontSet].filter(Boolean),
      bodyBackground: bodyStyle.backgroundColor,
      bodyColor: bodyStyle.color,
      bodyFontFamily: bodyStyle.fontFamily,
      bodyFontSize: bodyStyle.fontSize,
    };
  });

  // 5. Collect all image/asset URLs
  console.log("[4/7] Collecting assets...");
  const assetUrls = await page.evaluate(() => {
    const imgs: string[] = [];
    const svgs: string[] = [];
    const videos: string[] = [];

    document.querySelectorAll("img[src]").forEach((el) => {
      const src = (el as HTMLImageElement).src;
      if (src && !src.startsWith("data:")) imgs.push(src);
    });
    document.querySelectorAll("img[srcset]").forEach((el) => {
      const srcset = (el as HTMLImageElement).srcset;
      srcset.split(",").forEach((entry) => {
        const url = entry.trim().split(" ")[0];
        if (url && !url.startsWith("data:")) imgs.push(url);
      });
    });
    document.querySelectorAll('source[src], source[srcset]').forEach((el) => {
      const src = (el as HTMLSourceElement).src || (el as HTMLSourceElement).srcset;
      if (src && !src.startsWith("data:")) {
        if (src.match(/\.(mp4|webm|mov)/i)) videos.push(src);
        else imgs.push(src.split(",")[0].trim().split(" ")[0]);
      }
    });
    document.querySelectorAll("video[src]").forEach((el) => {
      const src = (el as HTMLVideoElement).src;
      if (src) videos.push(src);
    });
    document.querySelectorAll("svg").forEach((el) => {
      svgs.push(el.outerHTML);
    });
    // Background images from inline styles
    document.querySelectorAll("[style]").forEach((el) => {
      const match = (el as HTMLElement).style.backgroundImage?.match(/url\(["']?([^"')]+)["']?\)/);
      if (match?.[1] && !match[1].startsWith("data:")) imgs.push(match[1]);
    });

    return { imgs: [...new Set(imgs)], svgs, videos: [...new Set(videos)] };
  });
  console.log(`  Images: ${assetUrls.imgs.length}, SVGs: ${assetUrls.svgs.length}, Videos: ${assetUrls.videos.length}`);

  // 6. Extract page content (text, structure, meta)
  console.log("[5/7] Page content & meta...");
  const pageData = await page.evaluate(() => {
    const meta: Record<string, string> = {};
    document.querySelectorAll("meta[name], meta[property]").forEach((el) => {
      const key = el.getAttribute("name") || el.getAttribute("property") || "";
      const val = el.getAttribute("content") || "";
      if (key && val) meta[key] = val;
    });

    const headings: { tag: string; text: string }[] = [];
    document.querySelectorAll("h1, h2, h3").forEach((el) => {
      headings.push({ tag: el.tagName.toLowerCase(), text: (el as HTMLElement).innerText.trim() });
    });

    const buttons: string[] = [];
    document.querySelectorAll("button, a[class*='btn'], a[class*='button'], [role='button']").forEach((el) => {
      const text = (el as HTMLElement).innerText.trim();
      if (text && text.length < 100) buttons.push(text);
    });

    return {
      title: document.title,
      meta,
      headings,
      buttons: [...new Set(buttons)],
      bodyText: document.body.innerText.substring(0, 10000),
    };
  });

  // 7. Crawl subpages
  console.log("[6/7] Crawling subpages...");
  const subpages: Record<string, any> = {};
  for (const pagePath of internalPaths) {
    if (pagePath === "/") continue;
    const url = `${BASE_URL}${pagePath}`;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);

      // Screenshot
      const screenshotName = pagePath.replace(/\//g, "_").replace(/^_/, "") || "index";
      await page.screenshot({
        path: path.join(OUTPUT, "screenshots", `page-${screenshotName}.png`),
        fullPage: true,
      });

      // Extract subpage content
      const subData = await page.evaluate(() => {
        const headings: { tag: string; text: string }[] = [];
        document.querySelectorAll("h1, h2, h3").forEach((el) => {
          headings.push({ tag: el.tagName.toLowerCase(), text: (el as HTMLElement).innerText.trim() });
        });
        return {
          title: document.title,
          headings,
          bodyText: document.body.innerText.substring(0, 5000),
        };
      });

      // Collect more images from subpages
      const subImages = await page.$$eval("img[src]", (els) =>
        els.map((el) => (el as HTMLImageElement).src).filter((s) => !s.startsWith("data:"))
      );
      for (const img of subImages) {
        if (!assetUrls.imgs.includes(img)) assetUrls.imgs.push(img);
      }

      subpages[pagePath] = subData;
      console.log(`  ${pagePath}: ${subData.headings.length} headings`);
    } catch (e: any) {
      console.log(`  ${pagePath}: FAILED (${e.message?.substring(0, 50)})`);
    }
  }

  await browser.close();

  // --- Download assets via Playwright (handles CDN/cookies/CORS) ---
  console.log("[7/8] Downloading images & icons...");
  const dlBrowser = await chromium.launch({ headless: true });
  const dlContext = await dlBrowser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  });
  // Visit the site first so cookies/referer work
  const dlPage = await dlContext.newPage();
  await dlPage.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});

  let downloaded = 0;
  const seen = new Set<string>();

  for (const imgUrl of assetUrls.imgs) {
    if (seen.has(imgUrl)) continue;
    seen.add(imgUrl);
    try {
      let filename = sanitizeFilename(imgUrl);
      const ext = path.extname(filename).toLowerCase();
      // Detect type from URL patterns
      const isIcon = ext === ".svg" || imgUrl.includes("icon") || imgUrl.includes("logo");
      const subdir = isIcon ? "icons" : "images";

      // Deduplicate filenames
      let dest = path.join(OUTPUT, "assets", subdir, filename);
      try { await fs.access(dest); continue; } catch {}

      const resp = await dlContext.request.get(imgUrl, { timeout: 10000 });
      if (resp.ok()) {
        const body = await resp.body();
        if (body.length > 100) { // skip tiny/empty responses
          // Fix extension from content-type if needed
          const ct = resp.headers()["content-type"] || "";
          if (filename.endsWith(".bin") || !path.extname(filename)) {
            if (ct.includes("png")) filename = filename.replace(/\.[^.]+$/, ".png");
            else if (ct.includes("jpeg") || ct.includes("jpg")) filename = filename.replace(/\.[^.]+$/, ".jpg");
            else if (ct.includes("webp")) filename = filename.replace(/\.[^.]+$/, ".webp");
            else if (ct.includes("svg")) filename = filename.replace(/\.[^.]+$/, ".svg");
            dest = path.join(OUTPUT, "assets", subdir, filename);
          }
          await fs.writeFile(dest, body);
          downloaded++;
        }
      }
    } catch {}
  }

  // Save inline SVGs
  for (let i = 0; i < assetUrls.svgs.length; i++) {
    await fs.writeFile(
      path.join(OUTPUT, "assets", "icons", `inline-svg-${i}.svg`),
      assetUrls.svgs[i]
    );
  }

  // Download videos from the site
  console.log("[8/8] Downloading site videos...");
  await fs.mkdir(path.join(OUTPUT, "assets", "videos"), { recursive: true });
  let videosDl = 0;
  for (const vidUrl of assetUrls.videos) {
    try {
      const filename = sanitizeFilename(vidUrl);
      const dest = path.join(OUTPUT, "assets", "videos", filename);
      try { await fs.access(dest); continue; } catch {}

      const resp = await dlContext.request.get(vidUrl, { timeout: 30000 });
      if (resp.ok()) {
        await fs.writeFile(dest, await resp.body());
        videosDl++;
        console.log(`  Video: ${filename} (${Math.round((await resp.body()).length / 1024 / 1024 * 10) / 10} MB)`);
      }
    } catch (e: any) {
      console.log(`  Video failed: ${vidUrl.substring(0, 60)}... (${e.message?.substring(0, 40)})`);
    }
  }

  await dlBrowser.close();

  console.log(`  Images/icons: ${downloaded}, SVGs: ${assetUrls.svgs.length}, Videos: ${videosDl}`);

  // --- Save results ---

  // Design tokens
  await fs.writeFile(
    path.join(OUTPUT, "design-tokens.json"),
    JSON.stringify(
      {
        url: BASE_URL,
        domain: DOMAIN,
        extractedAt: new Date().toISOString(),
        colors: tokens.colors,
        customProperties: tokens.customProperties,
        fonts: tokens.fonts,
        bodyStyles: {
          background: tokens.bodyBackground,
          color: tokens.bodyColor,
          fontFamily: tokens.bodyFontFamily,
          fontSize: tokens.bodyFontSize,
        },
      },
      null,
      2
    )
  );

  // Site content / brand intel
  await fs.writeFile(
    path.join(OUTPUT, "site-content.json"),
    JSON.stringify(
      {
        url: BASE_URL,
        domain: DOMAIN,
        extractedAt: new Date().toISOString(),
        homepage: {
          title: pageData.title,
          meta: pageData.meta,
          headings: pageData.headings,
          buttons: pageData.buttons,
          bodyText: pageData.bodyText,
        },
        pages: Object.fromEntries(
          [...internalPaths].map((p) => [p, subpages[p] || { note: "homepage" }])
        ),
        assets: {
          imageCount: assetUrls.imgs.length,
          svgCount: assetUrls.svgs.length,
          videoCount: assetUrls.videos.length,
          videoUrls: assetUrls.videos,
        },
      },
      null,
      2
    )
  );

  // Summary
  const summary = {
    url: BASE_URL,
    pagesScraped: internalPaths.size,
    screenshots: internalPaths.size + 2, // +desktop +mobile
    imagesDownloaded: downloaded,
    videosDownloaded: videosDl,
    svgsSaved: assetUrls.svgs.length,
    colorsFound: tokens.colors.length,
    fontsFound: tokens.fonts.length,
    customPropsFound: Object.keys(tokens.customProperties).length,
  };

  await fs.writeFile(path.join(OUTPUT, "summary.json"), JSON.stringify(summary, null, 2));

  console.log(`\n=== Done ===`);
  console.log(JSON.stringify(summary, null, 2));
}

run().catch((e) => {
  console.error("Extraction failed:", e);
  process.exit(1);
});
