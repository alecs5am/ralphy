import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { SettingsScreen } from "../src/screens/SettingsScreen";
import { Segmented } from "../src/screens/settings/rows";
import type { ThemePreference } from "../src/instrument/types";
import { createReactHost, type HostNode } from "./react-host";
import { builtStylesheetLink } from "./style-sources";

type FocusResult = {
  theme: "bare" | "light" | "dark";
  button: "System" | "Dark" | "Light";
  outlineStyle: string;
  outlineWidth: number;
  outlineColor: string;
  backgroundColor: string;
  contrast: number;
  before: { x: number; y: number; width: number; height: number };
  after: { x: number; y: number; width: number; height: number };
};

async function electronFocusResults(): Promise<FocusResult[]> {
  const directory = mkdtempSync(join(tmpdir(), "ralphy-settings-focus-"));
  try {
    const links = builtStylesheetLink();
    // The control styles itself in markup, so the probe renders the real component rather than
    // a hand-written fragment: a stand-in would stop measuring what the app ships.
    const segmented = renderToStaticMarkup(
      <Segmented label="Theme" value="Dark" options={["System", "Dark", "Light"] as const} onChange={() => undefined} />,
    );
    writeFileSync(join(directory, "settings.html"), `<!doctype html><html><head>${links}</head><body>${segmented}</body></html>`);
    writeFileSync(join(directory, "package.json"), JSON.stringify({ main: "main.cjs" }));
    writeFileSync(join(directory, "main.cjs"), `
      const { app, BrowserWindow } = require("electron");
      app.commandLine.appendSwitch("disable-gpu");
      app.whenReady().then(async () => {
        const win = new BrowserWindow({ show: false, width: 600, height: 300 });
        await win.loadFile(${JSON.stringify(join(directory, "settings.html"))});
        win.webContents.debugger.attach("1.3");
        await win.webContents.debugger.sendCommand("DOM.enable");
        await win.webContents.debugger.sendCommand("CSS.enable");
        const documentNode = await win.webContents.debugger.sendCommand("DOM.getDocument");
        const results = [];
        for (const theme of ["bare", "light", "dark"]) {
          await win.webContents.executeJavaScript(theme === "bare" ? "delete document.documentElement.dataset.theme" : "document.documentElement.dataset.theme = " + JSON.stringify(theme));
          for (const [button, selector] of [["System", "[aria-label=Theme] > button:nth-of-type(1)"], ["Dark", "[aria-label=Theme] > button:nth-of-type(2)"], ["Light", "[aria-label=Theme] > button:nth-of-type(3)"]]) {
            const focusNode = await win.webContents.debugger.sendCommand("DOM.querySelector", { nodeId: documentNode.root.nodeId, selector });
            await win.webContents.debugger.sendCommand("CSS.forcePseudoState", { nodeId: focusNode.nodeId, forcedPseudoClasses: [] });
            const before = await win.webContents.executeJavaScript("(() => { const r = document.querySelector(" + JSON.stringify(selector) + ").getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; })()");
            await win.webContents.debugger.sendCommand("CSS.forcePseudoState", { nodeId: focusNode.nodeId, forcedPseudoClasses: ["focus-visible"] });
            results.push(await win.webContents.executeJavaScript(\`(() => {
            const target = document.querySelector(\${JSON.stringify(selector)}), style = getComputedStyle(target);
            const parse = (value) => { const parts = (value.match(/[\\\\d.]+/g) || []).map(Number), srgb = value.startsWith("color(srgb"); return { rgb: parts.slice(0, 3).map((part) => part * (srgb ? 255 : 1)), alpha: parts[3] ?? 1 }; };
            const composite = (top, bottom) => ({ rgb: top.rgb.map((part, index) => part * top.alpha + bottom.rgb[index] * (1 - top.alpha)), alpha: top.alpha + bottom.alpha * (1 - top.alpha) });
            let background = parse(getComputedStyle(target.parentElement).backgroundColor), parent = target.parentElement.parentElement;
            while (background.alpha < 1 && parent) { background = composite(background, parse(getComputedStyle(parent).backgroundColor)); parent = parent.parentElement; }
            const luminance = (rgb) => rgb.map((part) => part / 255).map((part) => part <= .04045 ? part / 12.92 : ((part + .055) / 1.055) ** 2.4).reduce((sum, part, index) => sum + part * [.2126,.7152,.0722][index], 0);
            const outline = luminance(parse(style.outlineColor).rgb), surface = luminance(background.rgb), rect = target.getBoundingClientRect();
            return { outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth), outlineColor: style.outlineColor, backgroundColor: getComputedStyle(target.parentElement).backgroundColor, contrast: (Math.max(outline, surface) + .05) / (Math.min(outline, surface) + .05), after: { x:rect.x, y:rect.y, width:rect.width, height:rect.height } };
          })()\`).then((result) => ({ ...result, theme, button, before })));
          }
        }
        process.stdout.write("SETTINGS_FOCUS=" + JSON.stringify(results) + "\\n");
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
      child.once("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`Settings Electron focus probe failed (${code}): ${stderr}`)));
    });
    const line = output.split("\n").find((candidate) => candidate.startsWith("SETTINGS_FOCUS="));
    if (!line) throw new Error(`Settings Electron focus probe returned no results: ${output}`);
    return JSON.parse(line.slice("SETTINGS_FOCUS=".length)) as FocusResult[];
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function button(container: HostNode, label: string): HostNode {
  const match = container
    .querySelectorAll("button")
    .find((candidate) => candidate.textContent.trim() === label);
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

describe("instrument settings theme", () => {
  test("shows a non-shifting 3:1 focus ring in bare, light, and dark Electron themes", async () => {
    const results = await electronFocusResults();
    expect(results.map(({ theme, button }) => `${theme}:${button}`)).toEqual([
      "bare:System", "bare:Dark", "bare:Light",
      "light:System", "light:Dark", "light:Light",
      "dark:System", "dark:Dark", "dark:Light",
    ]);
    for (const result of results) {
      expect(result.outlineStyle).toBe("solid");
      expect(result.outlineWidth).toBeGreaterThanOrEqual(2);
      expect(result.contrast, JSON.stringify(result)).toBeGreaterThanOrEqual(3);
      expect(result.after).toEqual(result.before);
    }
  });

  test("shows the controlled three-state theme value", async () => {
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const changes: ThemePreference[] = [];
    const render = (theme: ThemePreference) => root.render(
      <SettingsScreen
        rootPath="/tmp/ux-testing-lab"
        theme={theme}
        onThemeChange={(value) => changes.push(value)}
        onBack={() => undefined}
      />,
    );

    try {
      await act(async () => render("light"));
      await act(async () => button(host.container, "Appearance").dispatchEvent(new Event("click", { bubbles: true })));

      // The design ships appearance as a segmented control, so the selected value is the
      // pressed segment inside the group labelled Theme rather than a select trigger.
      const group = host.container.querySelectorAll("[role=\"group\"]")
        .find((candidate) => candidate.getAttribute("aria-label") === "Theme");
      expect(group, "theme segmented group").toBeDefined();
      expect(button(host.container, "Light").getAttribute("aria-pressed")).toBe("true");
      expect(button(host.container, "Dark").getAttribute("aria-pressed")).toBe("false");
      expect(changes).toEqual([]);

      await act(async () => render("dark"));
      expect(button(host.container, "Dark").getAttribute("aria-pressed")).toBe("true");
      expect(button(host.container, "Light").getAttribute("aria-pressed")).toBe("false");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });
});
