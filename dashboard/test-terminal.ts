import { chromium, type Page } from "playwright";

const URL = process.env.URL || "http://localhost:5173";

async function dragAndDrop(
  page: Page,
  source: { x: number; y: number },
  target: { x: number; y: number }
) {
  // Playwright needs steps to trigger dragover on the way
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const x = source.x + ((target.x - source.x) * i) / steps;
    const y = source.y + ((target.y - source.y) * i) / steps;
    await page.mouse.move(x, y);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
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
  await page.waitForTimeout(400);

  // 1. Open a project tab from sidebar (Projects section opens by default)
  await page.waitForSelector('button:has-text("cluely")', { timeout: 5000 });
  const firstProj = page.locator('button:has-text("cluely")').first();
  await firstProj.click();
  await page.waitForTimeout(300);

  const tabsAfterOpen = await page.locator('[draggable="true"]').count();
  console.log("tabs after project open:", tabsAfterOpen);

  // 2. Open terminal
  await page.locator('button[title^="Toggle Terminal"]').click();
  await page.waitForTimeout(500);

  // Create a second terminal in the same group
  await page.locator('button[title="New Terminal"]').first().click();
  await page.waitForTimeout(400);

  const termCount = await page.locator(".xterm").count();
  console.log("terminals after +:", termCount);

  // 3. Type into active terminal to verify PTY works
  await page.locator(".xterm").last().click();
  await page.waitForTimeout(100);
  await page.keyboard.type("echo UGC_TEST");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);

  // 4. Middle-click close — close the project tab we just opened
  const projectTab = page.locator(
    '[draggable="true"]:has-text("cluely")'
  );
  const projTabCount1 = await projectTab.count();
  console.log("cluely tab count before middle-click:", projTabCount1);

  if (projTabCount1 > 0) {
    await projectTab.first().click({ button: "middle" });
    await page.waitForTimeout(300);
  }
  const projTabCount2 = await page.locator(
    '[draggable="true"]:has-text("cluely")'
  ).count();
  console.log("cluely tab count after middle-click:", projTabCount2);

  // 5. Drag one terminal tab to the TOP (editor area) — should move into editor
  // Open another view tab first so editor area has something
  await firstProj.click();
  await page.waitForTimeout(300);

  // Now drag the second terminal tab to the top tabstrip
  const termTabs = page.locator('[draggable="true"]:has(span:text("zsh"))');
  const termTabCount = await termTabs.count();
  console.log("terminal tab count:", termTabCount);

  if (termTabCount >= 2) {
    const srcBox = await termTabs.nth(1).boundingBox();
    // Target: topmost draggable tab area (editor tabstrip)
    const editorTab = page.locator('[draggable="true"]').first();
    const tgtBox = await editorTab.boundingBox();

    if (srcBox && tgtBox) {
      console.log("dragging terminal tab to editor tabstrip...");
      await dragAndDrop(
        page,
        { x: srcBox.x + srcBox.width / 2, y: srcBox.y + srcBox.height / 2 },
        { x: tgtBox.x + tgtBox.width + 30, y: tgtBox.y + tgtBox.height / 2 }
      );
      await page.waitForTimeout(500);
    }
  }

  // Count terminal tabs in editor area (top section) vs bottom
  const allTabs = await page.locator('[draggable="true"]').count();
  console.log("total tabs after drag:", allTabs);

  // 7. Edge-drop split: drag the cluely tab to the right edge of the editor area
  // to create a new group to the right.
  const groupCountBefore = await page.locator(".xterm").count();
  const clulyTab = page.locator('[draggable="true"]:has-text("cluely")').first();
  const clulyBox = await clulyTab.boundingBox();
  if (clulyBox) {
    // Editor area spans ~x=224..1400. Right edge zone is ~last 18% of that.
    await dragAndDrop(
      page,
      { x: clulyBox.x + clulyBox.width / 2, y: clulyBox.y + clulyBox.height / 2 },
      { x: 1350, y: 300 }
    );
    await page.waitForTimeout(500);
  }

  // Check we now have 2 editor groups: count tabstrips in top area
  // Use the resize handle count as a proxy for group count
  const resizeHandles = await page.locator('[data-panel-group-direction="horizontal"] [data-panel-resize-handle-enabled]').count();
  console.log("horizontal resize handles:", resizeHandles);

  // 6. Verify no console/page errors
  await page.screenshot({
    path: "/tmp/dashboard-terminal-v2.png",
    fullPage: false,
  });
  console.log("screenshot: /tmp/dashboard-terminal-v2.png");

  if (errors.length) {
    console.log("\n--- page errors ---");
    for (const e of errors) console.log(e);
  }
  if (consoleErrors.length) {
    console.log("\n--- console errors ---");
    for (const e of consoleErrors) console.log(e);
  }

  await browser.close();

  const ok =
    termCount >= 2 &&
    projTabCount1 >= 1 &&
    projTabCount2 === 0 &&
    errors.length === 0 &&
    consoleErrors.length === 0;
  console.log("\nresult:", ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
