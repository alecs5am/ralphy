// Playwright screenshot helper for `browser-frame` overlays.
//
// Usage:
//   bunx tsx .agents/skills/audio-explainer/scripts/capture-screenshot.ts \
//     --url https://docs.anthropic.com/... \
//     --out .ralphy/workspaces/<ws>/projects/<id>/artifacts/screenshots/anthropic-docs.png \
//     [--width 1440] [--height 900] [--wait 1500]
//
// Why this script exists, not a `ralphy` verb: browser-frame overlays are
// project-specific captures that don't need to live in the global asset cache.
// If the same screenshot is reused across projects often enough to warrant a
// CLI verb, file an idea in `notes/ideas/`.
//
// The skill calls this via `bunx tsx`. Output is one PNG at the --out path.
// On failure (404, navigation timeout, blocked by Playwright detection), the
// script writes a placeholder PNG with the URL printed on it so the
// composition does not break — the user can swap the placeholder later.

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

interface Args {
  url: string;
  out: string;
  width: number;
  height: number;
  wait: number;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { width: 1440, height: 900, wait: 1500 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--url") args.url = value;
    else if (flag === "--out") args.out = value;
    else if (flag === "--width") args.width = Number(value);
    else if (flag === "--height") args.height = Number(value);
    else if (flag === "--wait") args.wait = Number(value);
  }
  if (!args.url) throw new Error("--url required");
  if (!args.out) throw new Error("--out required");
  return args as Args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(dirname(args.out), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      viewport: { width: args.width, height: args.height },
      deviceScaleFactor: 2,
      colorScheme: "dark",
    });
    const page = await ctx.newPage();
    await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(args.wait);
    await page.screenshot({ path: args.out, fullPage: false });
    console.log(JSON.stringify({ ok: true, path: args.out }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Placeholder fallback — composition stays renderable; user sees the gap.
    const placeholder = `<svg xmlns="http://www.w3.org/2000/svg" width="${args.width}" height="${args.height}">
      <rect width="100%" height="100%" fill="#1a1a1a"/>
      <text x="50%" y="50%" fill="#ff4757" font-family="monospace" font-size="24"
            text-anchor="middle">screenshot failed: ${args.url}</text>
    </svg>`;
    await writeFile(args.out.replace(/\.png$/, ".svg"), placeholder);
    console.log(JSON.stringify({ ok: false, path: args.out, error: message }));
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
