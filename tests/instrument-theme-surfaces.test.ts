import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

type Theme = "light" | "dark";

type SurfaceProbe = {
  maxActive: number;
  theme: Theme;
  colors: Record<string, string>;
};

const EXPECTED_LIGHT = {
  settingsDesk: "rgb(226, 228, 234)",
  settingsSidebar: "rgb(20, 20, 20)",
  settingsMain: "rgb(226, 228, 234)",
  settingsWidget: "rgb(241, 242, 246)",
  settingsText: "rgb(20, 20, 20)",
  memoryDesk: "rgb(226, 228, 234)",
  memoryWidget: "rgb(241, 242, 246)",
  memoryText: "rgb(20, 20, 20)",
  marketplaceDesk: "rgb(226, 228, 234)",
  marketplaceWidget: "rgb(241, 242, 246)",
  marketplaceText: "rgb(20, 20, 20)",
  mediaDesk: "rgb(226, 228, 234)",
  mediaControl: "rgb(241, 242, 246)",
  mediaText: "rgb(20, 20, 20)",
  mediaFrame: "rgb(6, 6, 6)",
} as const;

async function electronSurfaceResults(): Promise<SurfaceProbe[]> {
  const directory = mkdtempSync(join(tmpdir(), "ralphy-theme-surfaces-"));
  const resultPath = join(directory, "harness-result.json");
  try {
    const assets = join(process.cwd(), "dist", "assets");
    if (!existsSync(assets)) execFileSync("bun", ["run", "build:renderer"], { cwd: process.cwd(), stdio: "ignore" });
    let stylesheet = readdirSync(assets).find((file) => /^index-.+\.css$/.test(file));
    if (!stylesheet) {
      execFileSync("bun", ["run", "build:renderer"], { cwd: process.cwd(), stdio: "ignore" });
      stylesheet = readdirSync(assets).find((file) => /^index-.+\.css$/.test(file));
    }
    if (!stylesheet) throw new Error("Renderer build produced no application stylesheet");
    const links = `<link rel="stylesheet" href="${pathToFileURL(join(assets, stylesheet)).href}">`;
    writeFileSync(join(directory, "surfaces.html"), `<!doctype html><html><head>${links}</head><body>
      <div data-instrument-overlay="settings"><div data-instrument-screen-root><div class="settings-screen bg-desk text-ink" data-probe="settingsDesk">
        <aside class="settings-sidebar bg-instrument" data-probe="settingsSidebar"></aside>
        <main class="settings-main bg-desk" data-probe="settingsMain"><header class="settings-main-header"><h1 class="text-ink" data-probe="settingsText">Settings</h1></header><section class="settings-group bg-surface" data-probe="settingsWidget"></section></main>
      </div></div></div>
      <div class="instrument-shell bg-desk"><div class="instrument-desk-column bg-desk" data-probe="marketplaceDesk"><div class="instrument-desk-scroll"><div class="main-content-stage">
        <div class="app-mode-surface app-mode-work bg-desk text-ink">
          <main class="main-region memory-region bg-desk" data-probe="memoryDesk"><article class="memory-rule bg-surface" data-probe="memoryWidget"><span class="memory-rule-head"><strong class="text-ink" data-probe="memoryText">Memory</strong></span></article></main>
          <section class="project-domain-body is-media"><div class="media-panel bg-desk" data-probe="mediaDesk"><div class="media-domain-toolbar"><button class="select-menu-trigger bg-surface" data-probe="mediaControl"><span class="text-ink" data-probe="mediaText">Type</span></button></div><button class="media-card-tile"><span class="asset-preview bg-[var(--instrument-media-frame)]" data-probe="mediaFrame"></span></button></div></section>
        </div>
        <div class="app-mode-surface app-mode-marketplace"><main class="marketplace-screen bg-desk text-ink"><header class="marketplace-header bg-surface" data-probe="marketplaceWidget"><h1 class="text-ink" data-probe="marketplaceText">Marketplace</h1></header></main></div>
      </div></div></div></div>
    </body></html>`);
    writeFileSync(join(directory, "package.json"), JSON.stringify({ main: "main.cjs" }));
    writeFileSync(join(directory, "main.cjs"), `
      const RESULT_PATH = ${JSON.stringify(resultPath)};
      const { app, BrowserWindow } = require("electron");
      app.commandLine.appendSwitch("disable-gpu");
      app.whenReady().then(async () => {
        let active = 0, maxActive = 0;
        const win = new BrowserWindow({ show: false, width: 1100, height: 720, webPreferences: { backgroundThrottling: false } });
        active += 1; maxActive = Math.max(maxActive, active);
        win.once("closed", () => { active -= 1; });
        await win.loadFile(${JSON.stringify(join(directory, "surfaces.html"))});
        const results = [];
        for (const theme of ["light", "dark"]) {
          results.push(await win.webContents.executeJavaScript(\`(() => {
            document.documentElement.dataset.theme = \${JSON.stringify(theme)};
            document.documentElement.style.colorScheme = \${JSON.stringify(theme)};
            const colors = {};
            for (const node of document.querySelectorAll("[data-probe]")) {
              const style = getComputedStyle(node);
              colors[node.dataset.probe] = node.dataset.probe.endsWith("Text") ? style.color : style.backgroundColor;
            }
            const workDesk = getComputedStyle(document.querySelector(".app-mode-work")).backgroundColor;
            colors.memoryDesk = workDesk;
            colors.mediaDesk = workDesk;
            return { theme: \${JSON.stringify(theme)}, colors };
          })()\`));
        }
        await new Promise((resolve) => { win.once("closed", resolve); win.close(); });
        require("node:fs").writeFileSync(RESULT_PATH, JSON.stringify(results.map((result) => ({ ...result, maxActive }))));
        app.quit();
      }).catch((error) => { console.error(error); app.exit(1); });
    `);

    const electron = join(process.cwd(), "node_modules", ".bin", "electron");
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(electron, [directory], { env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "true" } });
      let stdout = "", stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("error", reject);
      child.once("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`Theme surface Electron probe failed (${code}): ${stderr}`)));
    });
    // Results travel through a file: a large JSON line on a pipe is truncated when several
    // Electron children run at once, which made this harness flake only in the full suite.
    if (!existsSync(resultPath)) throw new Error(`Theme surface probe returned no results: ${output}`);
    return JSON.parse(readFileSync(resultPath, "utf8")) as SurfaceProbe[];
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("instrument computed theme surfaces", () => {
  test("renders Settings, Memory, Marketplace, and Media through one hidden Electron window", async () => {
    const results = await electronSurfaceResults();
    expect(results.map(({ theme }) => theme)).toEqual(["light", "dark"]);
    expect(results.every(({ maxActive }) => maxActive === 1)).toBe(true);
    expect(results[0]!.colors).toMatchObject(EXPECTED_LIGHT);

    const dark = results[1]!.colors;
    const firstChannel = (value: string) => Number(value.match(/[\d.]+/)?.[0] ?? 255);
    for (const name of Object.keys(EXPECTED_LIGHT)) {
      if (name.endsWith("Text")) expect(firstChannel(dark[name]!), name).toBeGreaterThan(128);
      else expect(firstChannel(dark[name]!), name).toBeLessThan(128);
    }
    expect(dark.mediaFrame).toBe("rgb(6, 6, 6)");
  }, 20_000);
});
