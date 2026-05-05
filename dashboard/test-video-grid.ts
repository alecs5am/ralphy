import { chromium } from "playwright";

const URL = process.env.URL || "http://localhost:5173";
const PROJECT = process.env.PROJECT || "cluely";

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await ctx.newPage();

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector(`button:has-text("${PROJECT}")`, { timeout: 5000 });
  await page.locator(`button:has-text("${PROJECT}")`).first().click();
  await page.waitForTimeout(400);
  await page.locator('button:has-text("Assets")').first().click();
  await page.waitForTimeout(500);

  // Inspect first video tile: its wrapper should have aspect-video, filename label visible
  const videoTiles = page.locator('[draggable="true"]:has(video)');
  const count = await videoTiles.count();
  console.log("video tiles:", count);

  if (count > 0) {
    const tile = videoTiles.first();
    const box = await tile.boundingBox();
    console.log("first tile size:", box);
    const label = await tile.locator("div.absolute.bottom-0 div").first().textContent();
    console.log("filename overlay:", JSON.stringify(label));
  }

  await page.screenshot({ path: "/tmp/dashboard-video-grid.png", fullPage: false });
  console.log("screenshot: /tmp/dashboard-video-grid.png");
  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
