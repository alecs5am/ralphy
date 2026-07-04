import { afterAll, beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { startStudio } from "../server/index.js";

let app: ReturnType<typeof startStudio>;
let browser: Browser;
let tmpRoot: string;

function seed(root: string) {
  const ws = path.join(root, ".ralphy", "workspaces", "default");
  const project = path.join(ws, "projects", "studio-ui-001");
  fs.mkdirSync(path.join(project, "artifacts", "images"), { recursive: true });
  fs.mkdirSync(path.join(ws, "shared"), { recursive: true });

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==",
    "base64",
  );
  fs.writeFileSync(path.join(project, "artifacts", "images", "scene-01.png"), png);
  fs.writeFileSync(path.join(ws, "shared", "hero.png"), png);
  fs.writeFileSync(path.join(ws, "shared", "story.css"), ".demo{padding:16px;color:white;background:#111}");
  fs.writeFileSync(path.join(ws, "workspace.json"), JSON.stringify({ name: "Default", slug: "default" }));
  fs.writeFileSync(
    path.join(ws, "component-stories.mjs"),
    [
      `export const cssPaths = [{ path: "shared/story.css", assetBase: "shared" }];`,
      `export const stories = [{`,
      `  id: "badge/red",`,
      `  component: "badge",`,
      `  title: "Red badge",`,
      `  variant: "red",`,
      `  params: { label: "Primary", tone: "red" },`,
      `  controls: { label: { type: "text" }, tone: { type: "select", options: ["red", "blue"] } },`,
      `  variants: [{ id: "blue", label: "Blue", params: { tone: "blue" } }],`,
      `  animated: true,`,
      `  render: (p) => '<div class="demo ' + p.tone + '"><img src="shared/hero.png">' + p.label + '</div>',`,
      `}];`,
      ``,
    ].join("\n"),
  );
}

beforeAll(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "studio-ui-smoke-"));
  seed(tmpRoot);
  const build = Bun.spawnSync({
    cmd: ["bun", "run", "build"],
    cwd: path.join(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (!build.success) {
    throw new Error(`studio build failed\n${build.stdout.toString()}\n${build.stderr.toString()}`);
  }
  app = startStudio({ port: 0, rootStartDir: tmpRoot });
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
  app.stop();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test("Studio main surface is rendered by the Preact app", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await page.goto(`http://127.0.0.1:${app.server.port}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("#ws option").length > 0);
  expect(await page.locator("[data-preact-studio]").count()).toBe(1);
  expect(await page.locator("#projects .proj").count()).toBeGreaterThan(0);
  await page.locator("#projects .proj").first().click();
  await page.waitForSelector(".tile");
  expect(await page.locator(".tile").count()).toBeGreaterThan(0);
  await page.close();
});

test("Storybook renders stories, variants, and controls from the workspace", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await page.goto(`http://127.0.0.1:${app.server.port}/storybook.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-preact-storybook]");
  await page.waitForFunction(() => document.querySelectorAll(".sb-tree button").length > 0);

  expect(await page.locator(".sb-tree button").count()).toBeGreaterThan(0);
  expect(await page.locator(".sb-variants button").count()).toBeGreaterThan(0);
  expect(await page.locator(".sb-controls label").count()).toBeGreaterThan(0);
  await page.close();
});
