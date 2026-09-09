import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { expect, test } from "vitest";
import { builtStylesheetLink } from "./style-sources";

// Sample the real Chromium transitions: a pill radius can look right at both ends while
// clipping the whole expanding panel into an oval for every frame between them.
async function measureMotion(reduced = false) {
  const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const settle = async () => { await frame(); await frame(); };
  const results = [];
  for (const populated of [false, true]) {
    (window as unknown as { renderNotch(value: boolean): void }).renderNotch(populated);
    await settle();
    await document.fonts.ready;
    await settle();
    const shell = document.querySelector<HTMLElement>(".dynamic-island-shell")!;
    const trigger = document.querySelector<HTMLButtonElement>(".dynamic-island-trigger")!;
    const detail = document.querySelector<HTMLElement>(".dynamic-island-detail")!;
    const read = () => {
      const rect = shell.getBoundingClientRect();
      return { width: rect.width, height: rect.height, right: rect.right, top: rect.top, radius: parseFloat(getComputedStyle(shell).borderTopLeftRadius), opacity: Number(getComputedStyle(detail.firstElementChild!).opacity) };
    };
    const closed = read();
    const samples = async () => {
      await settle();
      const animations = shell.getAnimations({ subtree: true }).filter((animation) => animation instanceof CSSTransition);
      animations.forEach((animation) => animation.pause());
      const duration = Math.max(0, ...animations.map((animation) => Number(animation.effect!.getComputedTiming().endTime)));
      const values = [];
      for (const progress of [0, .1, .25, .5, .75, 1]) {
        animations.forEach((animation) => { animation.currentTime = duration * progress; });
        values.push(read());
      }
      animations.forEach((animation) => animation.finish());
      await settle();
      return { duration, values };
    };
    trigger.click();
    const opening = await samples();
    const focusedOnOpen = document.activeElement === detail;
    detail.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    const closing = await samples();
    const restored = read();
    const focusedOnClose = document.activeElement === trigger;
    const interrupted = [];
    if (!reduced) {
      trigger.click();
      const start = performance.now();
      let reversal = 0;
      do {
        await frame();
        const elapsed = performance.now() - start;
        if (reversal < 3 && elapsed >= [70, 130, 180][reversal]) { trigger.click(); reversal++; }
        interrupted.push(read());
      } while (performance.now() - start < 700 || reversal < 3);
      await settle();
      await Promise.all(shell.getAnimations({ subtree: true }).filter((animation) => animation instanceof CSSTransition).map((animation) => animation.finished.catch(() => {})));
      interrupted.push(read());
    }
    results.push({ populated, closed, opening, closing, restored, focusedOnOpen, focusedOnClose, inert: detail.inert, interrupted, viewportHeight: innerHeight });
  }
  return results;
}

test("notch morphs continuously from its pill without oval clipping or width jumps", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ralphy-notch-motion-"));
  const resultPath = join(directory, "result.json");
  try {
    await build({ stdin: { contents: `
      import { createRoot } from 'react-dom/client';
      import { Notch } from '@/widgets/dynamic-island';
      const root = createRoot(document.getElementById('root'));
      window.renderNotch = (populated) => root.render(<Notch key={String(populated)}
        context={{ label: populated ? 'UX Testing Lab' : 'Workspace', detail: populated ? 'Create' : null, identity: null, count: null }}
        feed={{ projectStatus: { status: 'unavailable', reason: 'Not reported' }, activeTask: populated ? { id: 'task', label: 'Preparing the next production review', status: 'running', progress: .68 } : null,
          notifications: { status: 'ready', value: populated ? Array.from({ length: 4 }, (_, i) => ({ id: String(i), title: 'A new generation is ready for review', severity: 'info', timestamp: 0, unread: true })) : [] } }}
        projectName={null} mock={false} onNavigate={() => {}} />);
    `, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, format: "iife", outfile: join(directory, "fixture.js"), jsx: "automatic", logLevel: "silent" });
    writeFileSync(join(directory, "index.html"), `<!doctype html><html><head>${builtStylesheetLink()}</head><body><div id="root" style="display:flex;justify-content:flex-end;align-items:flex-start;padding:8px"></div><script src="fixture.js"></script></body></html>`);
    writeFileSync(join(directory, "main.cjs"), `
      const { app, BrowserWindow } = require('electron');
      app.whenReady().then(async () => {
        const win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { backgroundThrottling: false } });
        await win.loadFile(${JSON.stringify(join(directory, "index.html"))});
        const normal = await win.webContents.executeJavaScript(${JSON.stringify(`(${measureMotion.toString()})()`)});
        await win.webContents.executeJavaScript("document.getElementById('root').className = 'instrument-top-row'; document.getElementById('root').setAttribute('data-page-controls', 'true')");
        const canvas = await win.webContents.executeJavaScript(${JSON.stringify(`(${measureMotion.toString()})()`)});
        await win.webContents.executeJavaScript("document.getElementById('root').removeAttribute('data-page-controls')");
        win.setContentSize(640, 360);
        const small = await win.webContents.executeJavaScript(${JSON.stringify(`(${measureMotion.toString()})()`)});
        win.webContents.debugger.attach('1.3');
        await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        const reduced = await win.webContents.executeJavaScript(${JSON.stringify(`(${measureMotion.toString()})(true)`)});
        require('node:fs').writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify({ normal, small, reduced, canvas }));
        app.quit();
      }).catch(error => { console.error(error); app.exit(1); });
    `);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(join(process.cwd(), "node_modules/.bin/electron"), [join(directory, "main.cjs")], { env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "true" } });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      const timeout = setTimeout(() => { child.kill(); reject(new Error("Notch motion harness timed out")); }, 20000);
      child.once("error", (error) => { clearTimeout(timeout); reject(error); });
      child.once("close", (code) => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(stderr)); });
    });
    const results: Record<"normal" | "small" | "reduced" | "canvas", Awaited<ReturnType<typeof measureMotion>>> = JSON.parse(readFileSync(resultPath, "utf8"));
    if (process.env.NOTCH_MOTION_EVIDENCE) writeFileSync(process.env.NOTCH_MOTION_EVIDENCE, JSON.stringify(results, null, 2));
    for (const result of [...results.normal, ...results.small, ...results.canvas]) {
      expect(result.closed.height).toBeCloseTo(32, 0);
      expect(result.opening.duration).toBeGreaterThan(0);
      expect(result.opening.values[0].width).toBeCloseTo(result.closed.width, 0);
      expect(result.closing.values.at(-1)!.width).toBeCloseTo(result.closed.width, 0);
      for (const value of [...result.opening.values, ...result.closing.values, ...result.interrupted]) {
        expect(value.radius, JSON.stringify(value)).toBeLessThanOrEqual(32);
        expect(value.top).toBeCloseTo(result.closed.top, 0);
        expect(value.right).toBeCloseTo(result.closed.right, 0);
        expect(value.height).toBeLessThanOrEqual(result.viewportHeight - 16);
        expect(value.height).toBeGreaterThanOrEqual(result.closed.height);
      }
      expect(result.restored.height).toBeCloseTo(result.closed.height, 0);
      expect(result.focusedOnOpen).toBe(true);
      expect(result.focusedOnClose).toBe(true);
      expect(result.inert).toBe(true);
      expect(result.interrupted.at(-1)!.height).toBeCloseTo(result.closed.height, 0);
      expect(result.interrupted.at(-1)!.width).toBeCloseTo(result.closed.width, 0);
    }
    for (const result of results.reduced) {
      expect(result.opening.duration).toBe(0);
      expect(result.closing.duration).toBe(0);
      expect(result.opening.values[0].opacity).toBe(1);
      expect(result.restored.height).toBeCloseTo(32, 0);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 30000);
