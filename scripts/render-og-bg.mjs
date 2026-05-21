import { chromium } from 'playwright';

const HTML_PATH = process.argv[2];
const OUT_PATH = process.argv[3];
const REMOVE_SELECTORS = (process.argv[4] || "").split(";").filter(Boolean);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto("file://" + HTML_PATH);
await page.waitForLoadState("networkidle");

if (REMOVE_SELECTORS.length > 0) {
  const removed = await page.evaluate((sels) => {
    const targets = [];
    for (const s of sels) {
      for (const el of document.querySelectorAll(s)) targets.push(el);
    }
    const uniq = [...new Set(targets)];
    for (const el of uniq) el.remove();
    return uniq.length;
  }, REMOVE_SELECTORS);
  console.log("removed", removed, "elements");
}

const card = await page.$(".dc-card");
if (!card) {
  console.error("no .dc-card found");
  process.exit(1);
}
await card.screenshot({ path: OUT_PATH, omitBackground: false });
console.log("wrote", OUT_PATH);
await browser.close();
