import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { SegmentedControl } from "@/shared/ui/SegmentedControl";
import { contrastRatio } from "@/shared/instrument/palette";
import { builtStylesheetLink } from "./style-sources";

test("segmented option ink and focus stay readable when selected and hovered in either theme", () => {
  const directory = mkdtempSync(join(tmpdir(), "ralphy-segmented-contrast-"));
  const resultPath = join(directory, "result.json");
  try {
    const markup = renderToStaticMarkup(<SegmentedControl value="sounds" options={[{ value: "all", label: "All" }, { value: "sounds", label: "Sounds", count: 3 }]} ariaLabel="Library category" onValueChange={() => {}} />);
    writeFileSync(join(directory, "index.html"), `<!doctype html><html><head>${builtStylesheetLink()}</head><body>${markup}</body></html>`);
    writeFileSync(join(directory, "package.json"), JSON.stringify({ main: "main.cjs" }));
    writeFileSync(join(directory, "main.cjs"), `
      const { app, BrowserWindow } = require("electron");
      app.whenReady().then(async () => {
        const win = new BrowserWindow({ show: false, width: 640, height: 200 });
        await win.loadFile(${JSON.stringify(join(directory, "index.html"))});
        win.webContents.debugger.attach("1.3");
        await win.webContents.debugger.sendCommand("DOM.enable");
        await win.webContents.debugger.sendCommand("CSS.enable");
        const root = (await win.webContents.debugger.sendCommand("DOM.getDocument")).root;
        const results = [];
        for (const theme of ["light", "dark"]) for (const state of ["rest", "hover", "focus"]) {
          await win.webContents.executeJavaScript('Object.assign(document.documentElement.dataset, ' + JSON.stringify({theme, state}) + ')');
          for (const value of ["all", "sounds"]) {
            const input = await win.webContents.debugger.sendCommand("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[value="' + value + '"]' });
            const option = await win.webContents.debugger.sendCommand("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[value="' + value + '"] + span' });
            await win.webContents.debugger.sendCommand("CSS.forcePseudoState", { nodeId: option.nodeId, forcedPseudoClasses: state === "hover" ? ["hover"] : [] });
            await win.webContents.debugger.sendCommand("CSS.forcePseudoState", { nodeId: input.nodeId, forcedPseudoClasses: state === "focus" ? ["focus-visible"] : [] });
          }
          results.push(...await win.webContents.executeJavaScript(${JSON.stringify(`[...document.querySelectorAll('input')].map(input => {
            const option = input.nextElementSibling, style = getComputedStyle(option);
            return { ...document.documentElement.dataset, selected: input.checked,
              ink: style.color, background: input.checked ? style.backgroundColor : getComputedStyle(option.closest('.segmented-control')).backgroundColor,
              countInk: option.querySelector('.segmented-control-count') ? getComputedStyle(option.querySelector('.segmented-control-count')).color : null,
              outline: style.outlineColor, outlineWidth: parseFloat(style.outlineWidth) };
          })`)}));
        }
        require("node:fs").writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify(results));
        app.quit();
      }).catch(error => { console.error(error); app.exit(1); });
    `);
    execFileSync(join(process.cwd(), "node_modules/.bin/electron"), [directory], { env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "true" }, timeout: 30_000 });
    const hex = (color: string) => `#${color.match(/[\d.]+/g)!.slice(0, 3).map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
    const results = JSON.parse(readFileSync(resultPath, "utf8")) as Array<{ theme: string; state: string; selected: boolean; ink: string; background: string; countInk: string | null; outline: string; outlineWidth: number }>;
    expect(results).toHaveLength(12);
    for (const result of results) {
      expect(contrastRatio(hex(result.ink), hex(result.background)), JSON.stringify(result)).toBeGreaterThanOrEqual(4.5);
      if (result.countInk) expect(contrastRatio(hex(result.countInk), hex(result.background))).toBeGreaterThanOrEqual(4.5);
      if (result.state === "focus") {
        expect(result.outlineWidth).toBeGreaterThanOrEqual(2);
        expect(contrastRatio(hex(result.outline), hex(result.background))).toBeGreaterThanOrEqual(3);
      }
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 40_000);
