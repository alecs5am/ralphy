// Media scrim audit: proves --instrument-media-plate keeps on-dark ink readable over whatever
// media happens to be behind it.
//
// The backdrop is measured, not modelled. Each case is captured three times in real Chromium --
// once as it renders, once with every mark's ink forced transparent, once with the plate itself
// removed -- so the audit can tell ink from plate from bare media by pixel. What it reports is
// the declared ink against the lightest fully covered point of the plate inside the mark's own
// box: the worst spot that mark could land on. Pure white is the bound, because no sRGB media
// can be brighter, and a photograph with a blown-out sun is there to show the bound is real.
//
//   bun run build:renderer && node scripts/audit-media-scrim.mjs
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { deflateSync } from "node:zlib";
import { extname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const PORT = Number(process.env.SCRIM_AUDIT_PORT ?? 9821);
const CDP_PORT = Number(process.env.SCRIM_AUDIT_CDP_PORT ?? 9412);
const SHOTS = join(ROOT, ".scrim-audit");
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

if (!existsSync(join(DIST, "assets"))) throw new Error("Run `bun run build:renderer` first: this audit reads the shipped stylesheet.");
const cssFile = readdirSync(join(DIST, "assets")).find((name) => name.endsWith(".css"));

// Every site that lays a mark over media, as the exact class string the source carries. `source`
// is the file it was copied from; the guard below fails if the two drift apart, because a probe
// that no longer matches the app measures nothing.
const MARKS = [
  { id: "calendar-format", role: "label", source: "src/pages/calendar/ui/CalendarScreen.tsx",
    cls: "absolute left-2.5 top-2.5 flex h-5 items-center rounded-chip bg-media-plate px-2 font-code type-mono-md text-on-instrument",
    html: (c) => `<span class="${c}" data-mark>image</span>` },
  { id: "shared-format", role: "label", source: "src/pages/shared-library/ui/SharedLibraryScreen.tsx",
    cls: "pointer-events-none absolute bottom-2 left-2 z-3 h-5 rounded-chip bg-media-plate px-1.75 py-1 font-code type-mono-sm text-on-instrument",
    html: (c) => `<span class="${c}" data-mark>PNG</span>` },
  { id: "shared-preview", role: "label", source: "src/pages/shared-library/ui/SharedLibraryScreen.tsx",
    cls: "absolute right-2 bottom-2 z-4 inline-flex h-6 items-center gap-1.25 rounded-control bg-media-plate px-2 type-mono-md text-on-instrument [&_svg]:size-2.75",
    html: (c) => `<button class="${c}" data-mark type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6"/></svg>Preview</button>` },
  { id: "artifact-step", role: "glyph", source: "src/pages/shared-library/ui/SharedArtifactViewer.tsx",
    cls: "absolute top-1/2 z-sticky grid size-8.5 -mt-4.25 place-items-center rounded-full bg-media-plate text-on-instrument [&_svg]:size-3.75",
    html: (c) => `<button class="${c}" data-mark style="left:24px" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button>` },
  { id: "artifact-fit", role: "label", source: "src/pages/shared-library/ui/SharedArtifactViewer.tsx",
    cls: "pointer-events-none absolute bottom-3 left-3 h-5.5 rounded-chip bg-media-plate px-2 py-1.25 font-code type-mono-sm tracking-label text-on-instrument",
    html: (c) => `<span class="${c}" data-mark>FIT</span>` },
  { id: "units-kind", role: "label", source: "src/pages/project/ui/UnitsPanel.tsx",
    cls: "unit-card-preview relative grid aspect-video min-h-0 w-full content-center place-items-center gap-1.75 overflow-hidden rounded-cell text-on-instrument-muted [&>em]:absolute [&>em]:left-2 [&>em]:top-2 [&>em]:h-4.5 [&>em]:rounded-control [&>em]:bg-media-plate [&>em]:px-1.75 [&>em]:font-code [&>em]:type-mono-sm [&>em]:leading-4.5 [&>em]:not-italic [&>em]:text-on-instrument",
    html: (c) => `<span class="${c}"><em data-mark>REEL</em></span>` },
  { id: "social-nav", role: "glyph", source: "src/pages/project/ui/UnitSocialPreview.tsx",
    cls: "absolute left-2 top-1/2 z-3 grid size-6.5 -translate-y-1/2 place-items-center rounded-full bg-media-plate text-on-instrument [&_svg]:size-3.75",
    html: (c) => `<button class="${c}" data-mark type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button>` },
  { id: "social-count", role: "label", source: "src/pages/project/ui/UnitSocialPreview.tsx",
    cls: "unit-stage-slide-count absolute right-2 top-2 z-3 h-5 rounded-control bg-media-plate px-2 font-code type-meta leading-5 text-on-instrument",
    html: (c) => `<span class="${c}" data-mark>2 / 5</span>` },
  { id: "social-safe", role: "label", source: "src/pages/project/ui/UnitSocialPreview.tsx",
    cls: "unit-safe-area pointer-events-none absolute bottom-safe-bottom left-safe-x right-safe-x top-safe-top z-6 rounded-cell outline-1 outline-dashed outline-on-instrument/32",
    html: (c) => `<span class="${c}"><em class="absolute -top-2 left-2.5 bg-media-plate px-1 py-0.5 font-code type-mono-xs not-italic tracking-caps text-on-instrument/72" data-mark>SAFE AREA</em></span>` },
  { id: "social-play", role: "glyph", source: "src/pages/project/ui/UnitSocialPreview.tsx",
    cls: "unit-youtube-play absolute left-1/2 top-1/2 size-14.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-media-plate p-4.5",
    html: (c) => `<svg class="${c}" data-mark viewBox="0 0 24 24" fill="currentColor" style="color:var(--instrument-text-on-dark-primary)"><path d="M6 3l14 9-14 9z"/></svg>` },
  { id: "social-duration", role: "label", source: "src/pages/project/ui/UnitSocialPreview.tsx",
    cls: "absolute bottom-2.5 right-2.5 rounded-control bg-media-plate px-1.75 py-1 font-code type-mono-md text-on-instrument",
    html: (c) => `<span class="${c}" data-mark>00:24</span>` },
  { id: "asset-extension", role: "label", source: "src/pages/project/ui/VirtualAssetGrid.tsx",
    cls: "asset-extension type-image min-h-5 rounded-chip bg-media-plate px-1.75 type-xs text-on-instrument-muted",
    html: (c) => `<span class="${c}" data-mark>image</span>` },
  { id: "hero-copy", role: "label", source: "src/widgets/sidebar/ui/WorkspacePicker.tsx",
    cls: "workspace-hero-scrim pointer-events-none absolute inset-x-0 bottom-0 h-14.5 bg-media-plate",
    html: (c) => `<span class="${c}" data-scrim></span><span class="workspace-hero-copy absolute inset-x-4 bottom-3.25 flex min-w-0 flex-col gap-1.25"><strong class="truncate type-title text-on-instrument" data-mark>Ellyanalytics</strong><small class="truncate font-display type-sm font-extrabold tracking-figure text-on-instrument-muted" data-mark>12 PROJ &middot; 48 UNITS</small></span>` },
  { id: "workflow-veil", role: "veil", source: "src/pages/shared-library/ui/SharedLibraryWorkflows.tsx",
    cls: "absolute inset-0 bg-media-veil",
    html: (c) => `<span class="${c}" data-mark></span>` },
];

const BACKDROPS = [
  { id: "photo", css: "background:#000 center/cover url(./photo.png)" },
  { id: "white", css: "background:#FFFFFF" },
  { id: "poster", css: "background:#E4E4E2" },
  { id: "shot", css: "background:#000 center/cover url(./shot.png)" },
];

// A mark whose backdrop is bounded says so: the app cannot put arbitrary media behind it, so the
// white bound is not its worst case and reading it there would measure a case that cannot happen.
const BOUNDED = {
  // The kind badge renders only for an empty frame (`{!source && ...}`), so what sits behind it
  // is always the opaque media frame, never a preview.
  "asset-extension": { id: "frame", css: "background:var(--instrument-media-frame)" },
  // The workspace hero stands on its own generated dither; #C2989A is the lightest of the eight
  // identity highlights it can paint.
  "hero-copy": { id: "dither", css: "background:#C2989A" },
};

// --- the guard: a probe that has drifted from the source proves nothing about the app ----------
const drift = [];
for (const mark of MARKS) {
  const source = await readFile(join(ROOT, mark.source), "utf8");
  // Compare the plate and the ink rather than the whole string, so unrelated layout edits in the
  // source do not fail the guard.
  for (const needle of mark.cls.match(/(?:\[&[^\]]*\]:)?(?:bg-media-(?:plate|veil)|text-on-instrument(?:-muted)?)/g) ?? []) {
    if (!source.includes(needle)) drift.push(`${mark.id}: "${needle}" is no longer in ${mark.source}`);
  }
}
if (drift.length) {
  console.error(`Probe drift -- the audit no longer matches the app:\n${drift.map((line) => `  ${line}`).join("\n")}`);
  process.exit(2);
}

// --- the adversarial backdrop: a bright photograph, written without a PNG encoder --------------
const stage = await mkdtemp(join(tmpdir(), "ralphy-scrim-"));
function png(width, height, pixel) {
  const crc = (buffer) => {
    let value = ~0;
    for (const byte of buffer) { value ^= byte; for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xEDB88320 & -(value & 1)); }
    return ~value >>> 0;
  };
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "ascii");
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, tail]);
  };
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const at = y * (width * 3 + 1) + 1 + x * 3;
    const [r, g, b] = pixel(x, y);
    raw[at] = r; raw[at + 1] = g; raw[at + 2] = b;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
let seed = 7;
const noise = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const clamp = (value) => Math.max(0, Math.min(255, value));
await writeFile(join(stage, "photo.png"), png(480, 320, (x, y) => {
  // Sky over pale sand, with a sun blown out to pure white: the worst case a photograph reaches.
  const sun = Math.max(0, 1 - Math.hypot(x - 150, y - 70) / 120);
  const horizon = y / 320;
  const base = horizon < 0.55 ? [150 + 90 * horizon, 185 + 65 * horizon, 225 + 25 * horizon] : [232, 222, 198];
  const grain = (noise() - 0.5) * 14;
  return [clamp(base[0] + sun * 255 + grain), clamp(base[1] + sun * 255 + grain), clamp(base[2] + sun * 240 + grain)];
}));
await writeFile(join(stage, "shot.png"), await readFile(join(ROOT, "ds-bundle/_screenshots/screens__LibraryScreen.png")));

const tiles = MARKS.map((mark) => `
  <figure data-probe="${mark.id}">
    <div class="probe-stage" data-stage${BOUNDED[mark.id] ? ` data-bound="${BOUNDED[mark.id].css}"` : ""}>${
      mark.html(mark.cls).includes("data-scrim") ? mark.html(mark.cls) : mark.html(mark.cls).replace("data-mark", "data-mark data-scrim")
    }</div>
    <figcaption>${mark.id}</figcaption>
  </figure>`).join("");

await writeFile(join(stage, "probe.html"), `<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/${cssFile}">
<style>
  body { margin:0; padding:24px; background:#777; display:grid; grid-template-columns:repeat(4, 300px); gap:24px; }
  figure { margin:0; }
  .probe-stage { position:relative; width:300px; height:190px; overflow:hidden; border-radius:12px; }
  figcaption { font:11px/1.6 ui-monospace, monospace; color:#fff; padding-top:6px; }
  /* Tailwind runs in important mode and its utilities sit in @layer utilities. An important
     declaration inside a layer beats an important one outside every layer, so overriding
     the color property from here would lose -- -webkit-text-fill-color is a property no utility sets, and
     the scrim-off rule joins the utilities layer so it can win on specificity. */
  html.ink-off [data-mark], html.ink-off [data-mark] * { -webkit-text-fill-color: transparent !important; fill: transparent !important; stroke: transparent !important; }
</style>
<style>
  @layer utilities {
    html.scrim-off [data-scrim] { background-color: transparent !important; background-image: none !important; }
  }
</style></head><body>${tiles}</body></html>`);

// --- serve the probe beside the shipped bundle, so the real fonts and the real CSS both load ---
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".woff2": "font/woff2", ".ttf": "font/ttf", ".svg": "image/svg+xml" };
const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
  for (const root of [stage, DIST]) {
    try {
      const body = await readFile(join(root, path));
      return response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(body);
    } catch { /* try the next root */ }
  }
  response.writeHead(404).end();
});
await new Promise((ready) => server.listen(PORT, "127.0.0.1", ready));

// --- Electron + CDP ----------------------------------------------------------------------------
await writeFile(join(stage, "package.json"), JSON.stringify({ name: "scrim-probe", main: "main.js" }));
await writeFile(join(stage, "main.js"), `const { app, BrowserWindow } = require("electron");
app.commandLine.appendSwitch("remote-debugging-port", process.env.PROBE_PORT);
app.whenReady().then(() => new BrowserWindow({ width: 1400, height: 1000, show: false }).loadURL(process.env.PROBE_URL));
app.on("window-all-closed", () => app.quit());
`);
const PROBE_URL = `http://127.0.0.1:${PORT}/probe.html`;
const child = spawn(join(ROOT, "node_modules/.bin/electron"), [stage], {
  env: { ...process.env, PROBE_PORT: String(CDP_PORT), PROBE_URL }, stdio: ["ignore", "pipe", "pipe"],
});
child.stderr.on("data", () => {});

class Cdp {
  constructor(socket) {
    this.socket = socket; this.id = 0; this.pending = new Map();
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
    return new Promise((done, reject) => this.pending.set(id, { resolve: done, reject }));
  }
}
async function connect() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((response) => response.json());
      // Match on the probe's own URL: another Electron on this machine must never be mistaken
      // for this one, and driving the developer's running app would be worse than failing.
      const target = targets.find(({ type, url }) => type === "page" && url.startsWith(PROBE_URL));
      if (target) {
        const socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((open, bad) => { socket.addEventListener("open", open, { once: true }); socket.addEventListener("error", bad, { once: true }); });
        return new Cdp(socket);
      }
    } catch { /* Electron is starting */ }
    await delay(100);
  }
  throw new Error("Probe Electron did not start");
}
const cdp = await connect();
const evaluate = async (expression) => {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
await cdp.send("Page.enable");
await delay(500);
await evaluate("document.fonts.ready.then(() => 1)");

const MEASURE = `(async (normalData, plateData, bareData) => {
  const decode = async (base64) => {
    // Electron blocks fetch() on a data: URL, so the capture is decoded straight from base64.
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    return { context: canvas.getContext("2d"), width: bitmap.width };
  };
  const normal = await decode(normalData), plate = await decode(plateData), bare = await decode(bareData);
  const ratio = normal.width / document.documentElement.clientWidth;
  const channel = (value) => { const v = value / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const contrast = (a, b) => { const [x, y] = [luminance(a) + 0.05, luminance(b) + 0.05]; return x > y ? x / y : y / x; };
  const swatch = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
  const out = [];
  for (const node of document.querySelectorAll("[data-mark]")) {
    const probe = node.closest("[data-probe]").dataset.probe;
    const style = getComputedStyle(node);
    const size = parseFloat(style.fontSize), weight = Number(style.fontWeight) || 400;
    const text = (node.textContent ?? "").trim().length > 0;
    const required = !text ? 3 : (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3 : 4.5;
    const box = node.getBoundingClientRect();
    // Clamp to the stage: a mark the stage clips -- the safe-area label overhangs its own box by
    // design -- would otherwise count the page behind the stage as its backdrop.
    const frame = node.closest("[data-stage]").getBoundingClientRect();
    const left = Math.max(box.left, frame.left), top = Math.max(box.top, frame.top);
    const right = Math.min(box.right, frame.right), bottom = Math.min(box.bottom, frame.bottom);
    if (right - left < 1 || bottom - top < 1) { out.push({ probe, clipped: true }); continue; }
    const x0 = Math.round(left * ratio), y0 = Math.round(top * ratio);
    const w = Math.round((right - left) * ratio), h = Math.round((bottom - top) * ratio);
    const a = normal.context.getImageData(x0, y0, w, h).data;
    const b = plate.context.getImageData(x0, y0, w, h).data;
    const c = bare.context.getImageData(x0, y0, w, h).data;
    const mean = [0, 1, 2].map((channelIndex) => { let total = 0; for (let at = channelIndex; at < b.length; at += 4) total += b[at]; return Math.round(total / (b.length / 4)); });
    // How much of the plate covers a pixel, independent of what is behind it. A plate painted at
    // CSS alpha k composites to plate = k*frame + (1-k)*bare, so (bare - plate)/(bare - frame)
    // recovers k -- the same number over the sun, over sand, over a flat tint. Pixels on a chip's
    // feathered corner return less and drop out, which is what keeps a hair of compositing noise
    // at a rounded edge from being read as the backdrop behind the ink.
    const FRAME = 6;
    const average = (data, at) => (data[at] + data[at + 1] + data[at + 2]) / 3;
    const coverage = (at) => { const bareAt = average(c, at); return bareAt - FRAME < 30 ? null : (bareAt - average(b, at)) / (bareAt - FRAME); };
    const inkAt = (at) => Math.max(Math.abs(a[at] - b[at]), Math.abs(a[at + 1] - b[at + 1]), Math.abs(a[at + 2] - b[at + 2]));
    let peak = 0, coverPeak = 0, measurable = 0;
    for (let at = 0; at < a.length; at += 4) {
      if (inkAt(at) > peak) peak = inkAt(at);
      const k = coverage(at);
      if (k === null) continue;
      measurable += 1;
      if (k > coverPeak) coverPeak = k;
    }
    if (peak < 12) { out.push({ probe, mean: "rgb(" + mean.join(",") + ")", noInk: true }); continue; }
    // Over a backdrop too dark to measure coverage against, the plate can only darken what is
    // already dark, so every pixel of the box counts.
    const dark = measurable === 0 || coverPeak < 0.05;
    let worst = null, worstL = -1;
    for (let at = 0; at < a.length; at += 4) {
      const k = coverage(at);
      if (!dark && (k === null || k < coverPeak * 0.98)) continue;
      const back = [b[at], b[at + 1], b[at + 2]];
      const l = luminance(back);
      if (l > worstL) { worstL = l; worst = back; }
    }
    if (!worst) { out.push({ probe, mean: "rgb(" + mean.join(",") + ")", noPlate: true }); continue; }
    // The ink is the declared colour, resolved through a canvas so oklab() and any alpha come
    // back as plain sRGB. Reading it off the capture instead would measure antialiasing: small
    // mono text has no fully covered pixel, so the painted glyph is always a blend.
    swatch.clearRect(0, 0, 1, 1);
    swatch.fillStyle = style.color;
    swatch.fillRect(0, 0, 1, 1);
    const [ir, ig, ib, ia] = swatch.getImageData(0, 0, 1, 1).data;
    const alpha = ia / 255;
    const effective = [ir, ig, ib].map((value, index) => alpha * value + (1 - alpha) * worst[index]);
    out.push({ probe, text, required, ratio: Number(contrast(effective, worst).toFixed(2)), ink: style.color, worst: "rgb(" + worst.join(",") + ")", mean: "rgb(" + mean.join(",") + ")" });
  }
  return out;
})`;

const keep = process.env.SCRIM_AUDIT_SHOTS === "1";
if (keep) await mkdir(SHOTS, { recursive: true });
const rows = [];
for (const theme of ["light", "dark"]) for (const backdrop of BACKDROPS) {
  await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)};
    for (const node of document.querySelectorAll("[data-stage]")) node.style.cssText = node.dataset.bound || ${JSON.stringify(backdrop.css)};
    1`);
  await delay(220);
  const capture = () => cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const normal = await capture();
  await evaluate(`document.documentElement.classList.add("ink-off"), 1`);
  await delay(120);
  const plate = await capture();
  await evaluate(`document.documentElement.classList.add("scrim-off"), 1`);
  await delay(120);
  const bare = await capture();
  await evaluate(`document.documentElement.classList.remove("ink-off", "scrim-off"), 1`);
  if (keep) await writeFile(join(SHOTS, `${theme}-${backdrop.id}.png`), Buffer.from(normal.data, "base64"));
  for (const entry of await evaluate(`${MEASURE}("${normal.data}","${plate.data}","${bare.data}")`)) {
    rows.push({ theme, backdrop: BOUNDED[entry.probe]?.id ?? backdrop.id, ...entry });
  }
}
server.close();
child.kill("SIGTERM");
await rm(stage, { recursive: true, force: true });

// --- report ---------------------------------------------------------------------------------
const role = Object.fromEntries(MARKS.map((mark) => [mark.id, mark.role]));
const asserted = rows.filter((row) => role[row.probe] !== "veil" && row.ratio !== undefined);
const failures = asserted.filter((row) => row.ratio < row.required);
const worstOf = new Map();
for (const row of asserted) if (!worstOf.has(row.probe) || row.ratio < worstOf.get(row.probe).ratio) worstOf.set(row.probe, row);

console.log("# Media scrim contrast\n");
console.log(`${MARKS.length - 1} marks x 2 themes x ${BACKDROPS.length} backdrops, read against the pixels each mark lands on.\n`);
console.log(`  ${"mark".padEnd(18)}${"kind".padEnd(7)}${"worst".padEnd(8)}${"need".padEnd(6)}${"where".padEnd(16)}`);
for (const mark of MARKS) {
  if (role[mark.id] === "veil") continue;
  const row = worstOf.get(mark.id);
  if (!row) { console.log(`  ${mark.id.padEnd(18)}not measured`); continue; }
  console.log(`  ${mark.id.padEnd(18)}${(row.text ? "text" : "glyph").padEnd(7)}${String(row.ratio).padEnd(8)}${String(row.required).padEnd(6)}${`${row.theme}/${row.backdrop}`.padEnd(16)}${row.ratio < row.required ? "FAIL" : "ok"}`);
}
console.log(`\nBelow the required ratio: ${failures.length} of ${asserted.length} readings`);
for (const row of failures) console.log(`  ${row.probe} ${row.theme}/${row.backdrop}: ${row.ratio}:1 needs ${row.required} -- ink ${row.ink} on ${row.worst}`);
const veils = rows.filter((row) => role[row.probe] === "veil");
if (veils.length) {
  console.log("\nVeils carry no ink, so they are reported and not asserted:");
  for (const row of veils) console.log(`  ${row.probe} ${row.theme}/${row.backdrop}: composites to ${row.mean}`);
}
if (keep) console.log(`\nCaptures: ${SHOTS}`);
process.exit(failures.length ? 1 : 0);
