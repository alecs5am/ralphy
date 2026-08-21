import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { withDatabaseFingerprint } from "./with-db-fingerprint.mjs";

export const SHELL_PANEL_CASES = [
  { id: "1440-default-light", viewport: "1440x900", theme: "light", left: true, right: "docked", bottom: false },
  { id: "1440-panels-dark", viewport: "1440x900", theme: "dark", left: false, right: "closed", bottom: true },
  { id: "1280-docked-light", viewport: "1280x800", theme: "light", left: true, right: "docked", bottom: false },
  { id: "1280-overlay-dark", viewport: "1280x800", theme: "dark", left: true, right: "overlay", bottom: true },
  { id: "1100-closed-light", viewport: "1100x720", theme: "light", left: true, right: "closed", bottom: false },
  { id: "1100-overlay-dark", viewport: "1100x720", theme: "dark", left: false, right: "overlay", bottom: true },
];

export function calibrateGeometry({ outer, inner }) { return { topInset: outer.height - inner.height, sideInset: outer.width - inner.width }; }

export function assertShellGeometry(value) {
  const innerWidth = value.innerWidth ?? value.inner?.width;
  if (value.bodyScrollWidth > innerWidth) throw new Error("horizontal overflow");
  if (value.scrollOwners !== 1) throw new Error("expected one vertical scroll owner");
  if (value.left && Math.abs(value.sidebarWidth - 240) > 1) throw new Error("sidebar must be 240px");
  if (value.right === "docked" && Math.abs(value.railWidth - 292) > 1) throw new Error("right rail must be 292px");
  if (value.trafficLightCopies !== 0) throw new Error("HTML traffic-light duplicate");
}

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

class Cdp {
  constructor(socket) { this.socket = socket; this.id = 0; this.pending = new Map(); socket.addEventListener("message", ({ data }) => { const message = JSON.parse(data); if (!message.id) return; const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); }); }
  send(method, params = {}) { const id = ++this.id; this.socket.send(JSON.stringify({ id, method, params })); return new Promise((resolveSend, reject) => this.pending.set(id, { resolve: resolveSend, reject })); }
}

async function connect(port) {
  let target;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json()); target = targets.find((item) => item.type === "page"); if (target) break; } catch { /* Electron is starting. */ }
    await delay(100);
  }
  if (!target) throw new Error(`Electron CDP did not start on ${port}`);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => { socket.addEventListener("open", resolveOpen, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  return { cdp: new Cdp(socket), socket, target };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function runCase(entry, index, outputRoot) {
  const [width, height] = entry.viewport.split("x").map(Number);
  const userData = await mkdtemp(resolve(tmpdir(), `ralphy-instrument-${entry.id}-`));
  const port = 19320 + index;
  const executable = resolve("node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
  const core = "/Users/maximovchinnikov/github/ralphy/ralphy-desktop/release/Ralphy Media.app/Contents/Resources/bin/ralphy";
  const child = Bun.spawn([executable, ".", "--instrument-shell-audit", `--user-data-dir=${userData}`, `--remote-debugging-port=${port}`], { cwd: resolve("."), env: { ...process.env, RALPHY_BIN: core, VITE_RALPHY_ENABLE_MOCKS: "true" }, stdout: "pipe", stderr: "pipe" });
  let auditControl = null;
  try {
    const { cdp, socket } = await connect(port);
    auditControl = { cdp, socket };
    await evaluate(cdp, `window.resizeTo(${width},${height})`);
    await delay(150);
    await evaluate(cdp, `document.documentElement.dataset.theme=${JSON.stringify(entry.theme)}`);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await evaluate(cdp, `Boolean(document.querySelector('.instrument-shell'))`)) break;
      await delay(100);
    }
    await evaluate(cdp, `(() => {
      const shell=document.querySelector('.instrument-shell');
      const left=Boolean(document.querySelector('.instrument-left-stack'));
      if (left!==${entry.left}) document.querySelector('button[aria-label="Toggle sidebar"]')?.click();
      const bottom=Boolean(document.querySelector('.instrument-bottom-panel'));
      if (bottom!==${entry.bottom}) document.querySelector('button[aria-label="Toggle bottom panel"]')?.click();
    })()`);
    await delay(200);
    await evaluate(cdp, `(() => {
      const shell=document.querySelector('.instrument-shell'); const mode=shell?.dataset.rightRailMode;
      if (mode!==${JSON.stringify(entry.right)}) document.querySelector('button[aria-label="Toggle right panel"]')?.click();
    })()`);
    await delay(250);
    const metrics = await evaluate(cdp, `(() => {
      const shell=document.querySelector('.instrument-shell'); const sidebar=document.querySelector('.instrument-left-stack'); const rail=document.querySelector('.instrument-right-rail:not([hidden])');
      return { innerWidth, innerHeight, bodyScrollWidth:document.body.scrollWidth, scrollOwners:document.querySelectorAll('[data-instrument-scroll-owner]').length, left:Boolean(sidebar), right:shell?.dataset.rightRailMode, bottom:Boolean(document.querySelector('.instrument-bottom-panel')), sidebarWidth:sidebar?.getBoundingClientRect().width??0, railWidth:rail?.getBoundingClientRect().width??0, trafficLightCopies:document.querySelectorAll('.traffic-light,.window-traffic-light').length, deviceScale:devicePixelRatio };
    })()`);
    assertShellGeometry(metrics);
    if (metrics.left !== entry.left || metrics.right !== entry.right || metrics.bottom !== entry.bottom) throw new Error(`${entry.id} panel state mismatch: ${JSON.stringify(metrics)}`);
    const nativeBounds = await evaluate(cdp, `({ width: outerWidth, height: outerHeight, x: screenX, y: screenY })`);
    const image = await cdp.send("Page.captureScreenshot", { format: "png" });
    await writeFile(resolve(outputRoot, `${entry.id}.png`), Buffer.from(image.data, "base64"));
    return { ...entry, nativeBounds, renderer: metrics, calibration: calibrateGeometry({ outer: nativeBounds, inner: { width: metrics.innerWidth, height: metrics.innerHeight } }), screenshot: resolve(outputRoot, `${entry.id}.png`) };
  } finally {
    try { if (auditControl) await evaluate(auditControl.cdp, "window.close()"); } catch { /* The window may already be closed. */ }
    auditControl?.socket.close();
    const exited = await Promise.race([child.exited.then(() => true), delay(3_000).then(() => false)]);
    if (!exited) {
      child.kill("SIGTERM");
      const terminated = await Promise.race([child.exited.then(() => true), delay(2_000).then(() => false)]);
      if (!terminated) child.kill("SIGKILL");
    }
    await child.exited;
    await rm(userData, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const outputRoot = resolve(".superpowers/sdd/nothing-instrument/shell");
  await mkdir(outputRoot, { recursive: true });
  const records = [];
  let activeInstances = 0;
  let maxActiveInstances = 0;
  for (const [index, entry] of SHELL_PANEL_CASES.entries()) {
    activeInstances += 1;
    maxActiveInstances = Math.max(maxActiveInstances, activeInstances);
    try {
      const { outcome } = await withDatabaseFingerprint(`foundation-shell-${entry.id}`, () => runCase(entry, index, outputRoot));
      records.push(outcome);
    } finally { activeInstances -= 1; }
  }
  if (activeInstances !== 0 || maxActiveInstances !== 1) throw new Error(`Electron audit instance leak: active=${activeInstances} max=${maxActiveInstances}`);
  const manifest = resolve(outputRoot, "manifest.json");
  await writeFile(manifest, `${JSON.stringify({ version: 1, maxActiveInstances, activeInstancesAfterRun: activeInstances, cases: records }, null, 2)}\n`);
  console.log(`INSTRUMENT_SHELL_AUDIT_OK ${records.length}`);
  console.log(manifest);
  process.exit(0);
}
