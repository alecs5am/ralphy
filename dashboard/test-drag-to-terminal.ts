import { chromium, type Page } from "playwright";

const URL = process.env.URL || "http://localhost:5173";

async function dragAndDrop(
  page: Page,
  source: { x: number; y: number },
  target: { x: number; y: number }
) {
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  const steps = 15;
  for (let i = 1; i <= steps; i++) {
    const x = source.x + ((target.x - source.x) * i) / steps;
    const y = source.y + ((target.y - source.y) * i) / steps;
    await page.mouse.move(x, y);
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

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
  await page.waitForSelector('button:has-text("solutions-metal-001")', {
    timeout: 5000,
  });

  // Open solutions project (has media files)
  await page.locator('button:has-text("solutions-metal-001")').first().click();
  await page.waitForTimeout(500);

  // Click Assets tab
  await page.locator('button:has-text("Assets")').first().click();
  await page.waitForTimeout(500);

  // Find a draggable media element — any <img> inside a draggable wrapper
  const mediaTile = page.locator('[draggable="true"]:has(img)').first();
  const mtCount = await mediaTile.count();
  console.log("draggable media tiles found:", mtCount);

  if (mtCount === 0) {
    console.log("no media found — aborting");
    await browser.close();
    process.exit(1);
  }

  const mediaBox = await mediaTile.boundingBox();
  if (!mediaBox) throw new Error("media has no box");

  // Open terminal
  await page.locator('button[title^="Toggle Terminal"]').click();
  await page.waitForTimeout(600);

  // Find the xterm viewport/container
  const xtermLocator = page.locator(".xterm").first();
  const xtermBox = await xtermLocator.boundingBox();
  if (!xtermBox) throw new Error("xterm not visible");

  console.log("media tile box:", mediaBox);
  console.log("xterm box:", xtermBox);

  // Drag the media tile onto the xterm
  await dragAndDrop(
    page,
    {
      x: mediaBox.x + mediaBox.width / 2,
      y: mediaBox.y + mediaBox.height / 2,
    },
    {
      x: xtermBox.x + xtermBox.width / 2,
      y: xtermBox.y + xtermBox.height / 2,
    }
  );

  // Focus terminal and read its content — the path should now appear as input
  await xtermLocator.click();
  await page.waitForTimeout(300);

  const xtermContent = await page
    .locator(".xterm-rows")
    .first()
    .textContent();
  console.log("xterm content snippet:");
  console.log(xtermContent?.slice(0, 400));

  const hasPath = xtermContent?.includes("solutions-metal-001") ?? false;
  console.log("path appears in terminal prompt:", hasPath);

  await page.screenshot({
    path: "/tmp/dashboard-drag-to-term.png",
    fullPage: false,
  });

  if (errors.length) {
    console.log("\n--- page errors ---");
    for (const e of errors) console.log(e);
  }

  await browser.close();
  const ok = hasPath && errors.length === 0;
  console.log("\nresult:", ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
