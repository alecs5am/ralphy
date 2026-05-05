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
  // hover at target to let state update
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(200);
}

async function countPanelGroups(page: Page, dir: "horizontal" | "vertical") {
  return page.locator(`[data-panel-group-direction="${dir}"]`).count();
}

async function countResizeHandles(page: Page) {
  // Count enabled resize handles
  return page.locator("[data-panel-resize-handle-enabled]").count();
}

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await ctx.newPage();

  const errors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector('button:has-text("cluely")', { timeout: 5000 });

  // Open 2 project tabs
  await page.locator('button:has-text("cluely")').first().click();
  await page.waitForTimeout(200);
  await page.locator('button:has-text("lyadov-podcast-001")').first().click();
  await page.waitForTimeout(300);

  console.log("opened 2 tabs, handles:", await countResizeHandles(page));

  // 1) Horizontal split: drag the cluely tab to RIGHT half (>50%) of the content
  const clulyTab = page.locator('[draggable="true"]:has-text("cluely")').first();
  const cb = await clulyTab.boundingBox();
  if (!cb) throw new Error("no cluely tab");

  // Content area is below tabstrip. Grab approximate center.
  // Sidebar ~224px wide. Content starts at 224. Viewport 1400.
  // Right edge target: x = 224 + 0.75 * (1400-224) = ~1106
  await dragAndDrop(
    page,
    { x: cb.x + cb.width / 2, y: cb.y + cb.height / 2 },
    { x: 1200, y: 400 }
  );

  let hSplits = await countPanelGroups(page, "horizontal");
  let vSplits = await countPanelGroups(page, "vertical");
  console.log(
    "after right-drop — horizontal groups:",
    hSplits,
    "vertical groups:",
    vSplits
  );

  // 2) Vertical split: drag lyadov tab to BOTTOM half of the right group
  const lyadov = page.locator('[draggable="true"]:has-text("lyadov")').first();
  const lb = await lyadov.boundingBox();
  if (lb) {
    // Target: bottom area of first column group
    await dragAndDrop(
      page,
      { x: lb.x + lb.width / 2, y: lb.y + lb.height / 2 },
      { x: 500, y: 700 }
    );
  }

  hSplits = await countPanelGroups(page, "horizontal");
  vSplits = await countPanelGroups(page, "vertical");
  console.log(
    "after bottom-drop — horizontal groups:",
    hSplits,
    "vertical groups:",
    vSplits
  );

  // 3) Open a terminal and drag it to the top half of one of the editor groups
  await page.locator('button[title^="Toggle Terminal"]').click();
  await page.waitForTimeout(500);

  const termTab = page.locator('[draggable="true"]:has(span:text("zsh"))').first();
  const tb = await termTab.boundingBox();
  if (tb) {
    await dragAndDrop(
      page,
      { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 },
      { x: 1200, y: 150 }
    );
  }

  hSplits = await countPanelGroups(page, "horizontal");
  vSplits = await countPanelGroups(page, "vertical");
  console.log(
    "after terminal drop to top — horizontal:",
    hSplits,
    "vertical:",
    vSplits
  );

  await page.screenshot({ path: "/tmp/dashboard-splits.png", fullPage: false });
  console.log("screenshot: /tmp/dashboard-splits.png");

  if (errors.length) {
    console.log("\n--- page errors ---");
    for (const e of errors) console.log(e);
  }
  if (consoleErrors.length) {
    console.log("\n--- console errors ---");
    for (const e of consoleErrors) console.log(e);
  }

  await browser.close();

  // We expect at least one horizontal split and one vertical split after all operations
  const ok =
    hSplits >= 1 &&
    vSplits >= 1 &&
    errors.length === 0 &&
    consoleErrors.length === 0;
  console.log("\nresult:", ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
