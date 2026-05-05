import { chromium } from "playwright";

const URL = process.env.URL || "http://localhost:5173";

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await ctx.newPage();

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector('button:has-text("cluely")', { timeout: 5000 });
  await page.locator('button:has-text("cluely")').first().click();
  await page.waitForTimeout(400);
  await page.locator('button:has-text("Assets")').first().click();
  await page.waitForTimeout(600);

  const tiles = await page.locator('[draggable="true"]:has(img)').count();
  console.log("image tiles:", tiles);

  // Inspect first tile — it must render a filename overlay with a non-empty label
  const firstTile = page.locator('[draggable="true"]:has(img)').first();
  const overlayText = await firstTile
    .locator("div.absolute.bottom-0 div")
    .first()
    .textContent();
  console.log("first tile filename overlay:", JSON.stringify(overlayText));

  await page.screenshot({ path: "/tmp/dashboard-filenames.png", fullPage: false });

  await browser.close();
  const ok = tiles > 0 && !!overlayText && /\.[a-z0-9]+$/i.test(overlayText);
  console.log("result:", ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
