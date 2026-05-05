import { chromium } from "playwright";

const URL = process.env.URL || "http://localhost:5173";

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await ctx.newPage();

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Capture WS traffic to /pty to verify Shift+Enter actually sends ESC+CR
  const sentInputs: string[] = [];
  page.on("websocket", (ws) => {
    if (!ws.url().includes("/pty")) return;
    ws.on("framesent", (f) => {
      const payload = typeof f.payload === "string" ? f.payload : f.payload.toString("utf8");
      try {
        const msg = JSON.parse(payload);
        if (msg.type === "input") sentInputs.push(msg.data);
      } catch {}
    });
  });

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  // Open terminal
  await page.locator('button[title^="Toggle Terminal"]').click();
  await page.waitForSelector(".xterm", { timeout: 5000 });
  await page.waitForTimeout(500);

  // Focus terminal
  await page.locator(".xterm").first().click();
  await page.waitForTimeout(200);

  // Clear noise — drain prior inputs
  sentInputs.length = 0;

  // Type a char, then Shift+Enter, then another char
  await page.keyboard.type("a");
  await page.waitForTimeout(50);
  await page.keyboard.press("Shift+Enter");
  await page.waitForTimeout(50);
  await page.keyboard.type("b");
  await page.waitForTimeout(200);

  // Now plain Enter for comparison
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);

  console.log("inputs sent over WS:");
  for (const i of sentInputs) {
    console.log(" ", JSON.stringify(i));
  }

  const sawEscCr = sentInputs.some((d) => d === "\x1b\r");
  const sawPlainCr = sentInputs.some((d) => d === "\r");
  console.log("saw ESC+CR (Shift+Enter):", sawEscCr);
  console.log("saw plain CR (Enter):", sawPlainCr);

  await browser.close();
  const ok = sawEscCr && sawPlainCr && errors.length === 0;
  console.log("\nresult:", ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
