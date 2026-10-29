// `ralphy editor lint-safe-zones` end to end (#564).
//
// A tiny composition with a stub timeline (no GSAP, no network): seeking moves
// the caption in and out of the platform bottom block, a clip window hides a
// top-bar label outside its window, a tagged face sits under the right rail and
// an ignored decoration sits in the top bar. The probe runs in headless
// Chromium (Playwright); the case skips when no Chromium is installed.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const PROVIDER_KEYS = ["OPENROUTER_API_KEY", "ELEVENLABS_API_KEY", "FAL_KEY", "FIRECRAWL_API_KEY", "APIFY_TOKEN"];

let tmp: string;
let comp: string;
let chromium = false;

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
html, body { margin: 0; width: 1080px; height: 1920px; }
#root { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; background: #222; font: 700 60px sans-serif; color: #fff; }
.abs { position: absolute; }
</style></head><body>
<div id="root" data-composition-id="main" data-width="1080" data-height="1920" data-start="0" data-duration="2">
  <div id="cap" class="abs caption" style="left: 120px; top: 1600px; width: 800px;">Tap the link below</div>
  <div id="late" class="abs" data-start="1" data-duration="1" data-track-index="1" style="left: 200px; top: 40px;">Top bar label</div>
  <div id="face" class="abs" data-safe-zone="face" style="left: 880px; top: 700px; width: 200px; height: 260px; background: #e0b090;"></div>
  <div id="ghost" class="abs" data-safe-zone="ignore" style="left: 100px; top: 20px;">Decorative</div>
</div>
<script>
  window.__timelines = { main: {
    totalTime: function (t) { document.getElementById("cap").style.top = (t < 1 ? 1600 : 1200) + "px"; },
    duration: function () { return 2; }
  } };
</script>
</body></html>`;

function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of PROVIDER_KEYS) delete env[k];
  return env;
}

function ralphy(args: string[]) {
  const r = spawnSync("bun", ["run", CLI, "--json", "--cwd", tmp, ...args], { cwd: tmp, encoding: "utf8", env: childEnv(), timeout: 120_000 });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

type Finding = { platform: string; zone: string; severity: string; role: string; selector: string; firstSeen: number; lastSeen: number };

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-safezones-"));
  comp = path.join(tmp, "comp");
  fs.mkdirSync(comp);
  fs.writeFileSync(path.join(comp, "index.html"), HTML);
  try {
    const { chromium: c } = await import("playwright");
    chromium = fs.existsSync(c.executablePath());
  } catch {
    chromium = false;
  }
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("ralphy editor lint-safe-zones (#564)", () => {
  test("flags the caption only at the sample where the timeline puts it under the UI", () => {
    if (!chromium) return;
    const r = ralphy(["editor", "lint-safe-zones", comp, "--at", "0.5,1.5"]);
    expect(r.code).toBe(1);
    const out = JSON.parse(r.stdout) as { ok: boolean; samples: number[]; findings: Finding[]; errorCount: number };
    expect(out.ok).toBe(false);
    expect(out.samples).toEqual([0.5, 1.5]);
    const cap = out.findings.filter((f) => f.selector === "#cap");
    expect(cap.map((f) => f.platform).sort()).toEqual(["reels", "shorts", "tiktok"]);
    expect(cap.every((f) => f.zone === "bottom-block" && f.role === "caption" && f.firstSeen === 0.5 && f.lastSeen === 0.5)).toBe(true);
    // The clip window hides the label at 0.5 s; at 1.5 s it sits in the top bar.
    const late = out.findings.filter((f) => f.selector === "#late");
    expect(late.length).toBe(3);
    expect(late.every((f) => f.zone === "top-bar" && f.firstSeen === 1.5)).toBe(true);
    // The tagged face is mostly under the rail; the ignored decoration is never reported.
    expect(out.findings.some((f) => f.selector === "#face" && f.zone === "right-rail" && f.severity === "error")).toBe(true);
    expect(out.findings.some((f) => f.selector === "#ghost")).toBe(false);
  }, 120_000);

  test("one platform, one clean sample: only the face remains", () => {
    if (!chromium) return;
    const r = ralphy(["editor", "lint-safe-zones", comp, "--at", "0.5", "--platform", "reels"]);
    const out = JSON.parse(r.stdout) as { findings: Finding[]; platforms: Array<{ platform: string }> };
    expect(out.platforms.map((p) => p.platform)).toEqual(["reels"]);
    expect(out.findings.every((f) => f.platform === "reels")).toBe(true);
    expect(out.findings.some((f) => f.selector === "#late")).toBe(false);
  }, 120_000);

  test("rejects an unknown platform before launching a browser", () => {
    const r = ralphy(["editor", "lint-safe-zones", comp, "--platform", "snapchat"]);
    expect(r.code).not.toBe(0);
    expect(r.stdout + r.stderr).toContain("E_FLAG_UNKNOWN");
  });
});
