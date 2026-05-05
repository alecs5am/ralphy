import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";

const URL = process.env.URL || "http://localhost:5173";
const PROJECT_ID = "cluely"; // Stable existing project
const PROJECT_DIR =
  "/Users/maximovchinnikov/github/ugc-cli/workspace/projects/" + PROJECT_ID;

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await ctx.newPage();

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[console.error]", m.text());
  });

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector(`button:has-text("${PROJECT_ID}")`, {
    timeout: 5000,
  });
  await page.locator(`button:has-text("${PROJECT_ID}")`).first().click();
  await page.waitForTimeout(500);

  // Open Assets sub-tab
  await page.locator('button:has-text("Assets")').first().click();
  await page.waitForTimeout(500);

  // Capture initial asset count from the "Assets (N)" label
  const getCount = async () => {
    const txt = await page
      .locator('button:has-text("Assets")')
      .first()
      .innerText();
    const m = txt.match(/\((\d+)\)/);
    return m ? parseInt(m[1], 10) : 0;
  };

  const before = await getCount();
  console.log("asset count before:", before);

  // Create a new image file in the project dir to trigger a watcher event.
  const testDir = path.join(PROJECT_DIR, "live-test");
  await fs.mkdir(testDir, { recursive: true });
  const testFile = path.join(testDir, `live-${Date.now()}.png`);
  // Minimal valid PNG (1x1 transparent)
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c636000020000000500017d7c72d40000000049454e44ae426082",
    "hex"
  );
  await fs.writeFile(testFile, png);

  // Wait for watcher (stabilityThreshold 500ms + debounce 300ms + our 250ms)
  await page.waitForTimeout(2000);

  const after = await getCount();
  console.log("asset count after:", after);

  // Also verify the new image rendered
  const imgs = await page.locator('img[alt^="live-"]').count();
  console.log("new image present in DOM:", imgs >= 1);

  await page.screenshot({
    path: "/tmp/dashboard-live-refresh.png",
    fullPage: false,
  });

  // Cleanup test file
  await fs.unlink(testFile).catch(() => {});
  await fs.rmdir(testDir).catch(() => {});

  if (errors.length) {
    console.log("\npage errors:", errors);
  }

  await browser.close();
  const ok = after > before && imgs >= 1 && errors.length === 0;
  console.log("\nresult:", ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
