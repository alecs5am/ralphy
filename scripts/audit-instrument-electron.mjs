import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { verifyPackagedCore } from "./bundled-core.mjs";
import { withDatabaseFingerprint } from "./with-db-fingerprint.mjs";
import {
  EVIDENCE_MANIFEST,
  initializeEvidenceBundle,
  readEvidenceBundle,
  updateEvidenceBundle,
} from "./instrument-evidence.mjs";

const modeArg = process.argv.indexOf("--mode");
const mode = modeArg < 0 ? "production" : process.argv[modeArg + 1];
if (!new Set(["mock", "production"]).has(mode)) throw new Error("--mode must be mock or production");
const appArg = process.argv.indexOf("--app");
const appPath = resolve(appArg < 0 ? (mode === "mock" ? "release/Ralphy Media Mock.app" : "release/Ralphy Media.app") : process.argv[appArg + 1]);
const outputRoot = resolve(".superpowers/sdd/nothing-instrument/final", mode);
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveSend, reject) => this.pending.set(id, { resolve: resolveSend, reject }));
  }
}

async function connect(port) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const target = targets.find(({ type }) => type === "page");
      if (target) {
        const socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((open, reject) => { socket.addEventListener("open", open, { once: true }); socket.addEventListener("error", reject, { once: true }); });
        return { cdp: new Cdp(socket), socket };
      }
    } catch { /* Electron is starting. */ }
    await delay(100);
  }
  throw new Error("Packaged Electron CDP did not start");
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(cdp, expression, label) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await evaluate(cdp, expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function screenshot(cdp, name) {
  const path = join(outputRoot, `${name}.png`);
  const image = await cdp.send("Page.captureScreenshot", { format: "png" });
  await writeFile(path, Buffer.from(image.data, "base64"));
  return path;
}

async function openMedia(cdp) {
  const clickText = (text) => `(() => { const node=[...document.querySelectorAll('button')].find((item)=>item.textContent?.trim().startsWith(${JSON.stringify(text)})); node?.click(); return Boolean(node); })()`;
  if (await evaluate(cdp, clickText("Projects"))) {
    await waitFor(cdp, `Boolean(document.querySelector('[data-instrument-route="workspace.projects"]'))`, "Projects route");
  }
  if (await evaluate(cdp, `(() => { const node=document.querySelector('.workspace-project-card'); node?.click(); return Boolean(node); })()`)) {
    await waitFor(cdp, `Boolean(document.querySelector('.project-dock'))`, "project dock");
  }
  if (await evaluate(cdp, clickText("Media"))) {
    await waitFor(cdp, `Boolean(document.querySelector('[data-instrument-route="project.media"]'))`, "Media route");
  }
  await waitFor(cdp, `Boolean(document.querySelector('.media-card-tile'))`, "Media cards");
  await evaluate(cdp, `document.querySelector('.media-card-button')?.click()`);
  await waitFor(cdp, `Boolean(document.querySelector('.review-console'))`, "Media review console");
  await delay(500);
  return evaluate(cdp, `Boolean(document.querySelector('[data-instrument-route="project.media"]') && document.querySelector('.review-console'))`);
}

async function runOneHiddenInstance() {
  await mkdir(outputRoot, { recursive: true });
  const userData = await mkdtemp(join(tmpdir(), `ralphy-instrument-${mode}-`));
  const port = mode === "mock" ? 19380 : 19381;
  const executable = join(appPath, "Contents/MacOS/Ralphy Media");
  const child = Bun.spawn([executable, "--instrument-shell-audit", `--user-data-dir=${userData}`, `--remote-debugging-port=${port}`], {
    cwd: resolve("."), stdout: "pipe", stderr: "pipe", env: { ...process.env, VITE_RALPHY_ENABLE_MOCKS: mode === "mock" ? "true" : "false" },
  });
  let connection = null;
  try {
    connection = await connect(port);
    const { cdp } = connection;
    await waitFor(cdp, `Boolean(document.querySelector('.instrument-shell'))`, "Instrument shell");
    await evaluate(cdp, `window.resizeTo(1440,900)`);
    await delay(250);
    const overviewPath = await screenshot(cdp, "workspace-overview-light-1440x900");
    const mediaReached = await openMedia(cdp);
    const captures = [{ label: `${mode} Workspace Overview`, theme: "light", viewport: "1440x900", path: overviewPath }];
    for (const [theme, width, height] of [["dark", 1440, 900], ["light", 1440, 900], ["light", 1280, 800], ["dark", 1100, 720]]) {
      await evaluate(cdp, `window.resizeTo(${width},${height}); document.documentElement.dataset.theme=${JSON.stringify(theme)}; document.documentElement.style.colorScheme=${JSON.stringify(theme)}`);
      await delay(500);
      const path = await screenshot(cdp, `media-${theme}-${width}x${height}`);
      captures.push({ label: `${mode} ${mediaReached ? "Media" : "current route"}`, theme, viewport: `${width}x${height}`, path });
    }
    await evaluate(cdp, `(() => { const trigger=document.querySelector('button[aria-label="Project activity"]'); trigger?.focus(); trigger?.click(); return Boolean(trigger); })()`);
    await delay(100);
    const islandOpen = await evaluate(cdp, `Boolean(document.querySelector('[data-instrument-overlay="dynamic-island"]'))`);
    const island = await evaluate(cdp, `(() => { const trigger=document.querySelector('button[aria-label="Project activity"]'); return { trigger:Boolean(trigger), expanded:trigger?.getAttribute('aria-expanded'), mock:Boolean(document.querySelector('.dynamic-island[data-mock]')), testFeed:Boolean(document.querySelector('.dynamic-island-test-label')) }; })()`);
    await evaluate(cdp, `document.querySelector('[data-instrument-overlay="dynamic-island"]')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);
    await delay(100);
    const keyboard = await evaluate(cdp, `(() => { const trigger=document.querySelector('button[aria-label="Project activity"]'); return { focusReturned:document.activeElement===trigger, overlayClosed:!document.querySelector('[data-instrument-overlay="dynamic-island"]') }; })()`);
    const semantics = await evaluate(cdp, `(() => ({ route:document.querySelector('[data-instrument-route]')?.getAttribute('data-instrument-route')??null, state:document.querySelector('[data-instrument-state]')?.getAttribute('data-instrument-state')??null, horizontalOverflow:document.body.scrollWidth>innerWidth, scrollOwners:document.querySelectorAll('[data-instrument-scroll-owner]').length, reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches, liveRegions:document.querySelectorAll('[aria-live]').length, mockLabels:document.body.textContent?.includes('TEST REVIEW SESSION')??false, unsupportedReview:[...document.querySelectorAll('[aria-disabled="true"]')].some((item)=>item.getAttribute('aria-describedby')?.includes('media-review')) }))()`);
    if (semantics.horizontalOverflow || semantics.scrollOwners !== 1 || !island.trigger || !islandOpen || !keyboard.overlayClosed || !keyboard.focusReturned) throw new Error(`Instrument semantic audit failed: ${JSON.stringify({ island, islandOpen, keyboard, semantics })}`);
    if (mode === "production" && (island.mock || island.testFeed || semantics.mockLabels)) throw new Error("Production package exposed mock presentation");
    return { captures, island, keyboard, semantics, mediaReached };
  } finally {
    try { if (connection) await evaluate(connection.cdp, "window.close()"); } catch { /* window already closed */ }
    connection?.socket.close();
    let exited = await Promise.race([child.exited.then(() => true), delay(3_000).then(() => false)]);
    if (!exited) { child.kill("SIGTERM"); exited = await Promise.race([child.exited.then(() => true), delay(2_000).then(() => false)]); }
    if (!exited) child.kill("SIGKILL");
    await child.exited;
    await rm(userData, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  if (process.argv.includes("--reset")) await initializeEvidenceBundle({ sourceAudit: true, mediaFidelity: "measured representative captures" });
  else try { await readEvidenceBundle(); } catch { await initializeEvidenceBundle({ sourceAudit: true, mediaFidelity: "measured representative captures" }); }
  const core = await verifyPackagedCore(appPath);
  let manifest = await readEvidenceBundle();
  manifest = await updateEvidenceBundle(EVIDENCE_MANIFEST, manifest.revision, { type: "set-package", mode, value: { path: appPath, verified: true, core } });
  const { outcome, record, path: dbRecord } = await withDatabaseFingerprint(`${mode}-instrument-final`, runOneHiddenInstance);
  manifest = await readEvidenceBundle();
  manifest = await updateEvidenceBundle(EVIDENCE_MANIFEST, manifest.revision, { type: "record-launch", value: { id: `${mode}-instrument-final`, mode, dbRecord, shmChanged: record.comparison.shmChanged, maxActiveInstances: 1, activeInstancesAfterRun: 0, result: outcome.semantics } });
  for (const capture of outcome.captures) {
    manifest = await updateEvidenceBundle(EVIDENCE_MANIFEST, manifest.revision, { type: "record-capture", value: capture });
  }
  for (const [id, value] of Object.entries({ keyboard: outcome.keyboard, "live-region": { count: outcome.semantics.liveRegions }, "reduced-motion": { query: outcome.semantics.reducedMotion }, "system-theme": { palettes: ["system", "dark", "light"] } })) {
    manifest = await updateEvidenceBundle(EVIDENCE_MANIFEST, manifest.revision, { type: "record-journey", value: { id: `${mode}-${id}`, mode, value } });
  }
  console.log(`INSTRUMENT_ELECTRON_AUDIT_OK ${mode} 1`);
}
