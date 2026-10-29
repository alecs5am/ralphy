// Preview harness (#563). Turns one catalog fragment into a complete,
// standalone, parametrized 1080x1920 HyperFrames composition:
//
//   catalog/items/<kind>/<id>.html   fragment: <style data-catalog-css>,
//                                    <template data-catalog-markup>,
//                                    <script data-catalog-js> defining
//                                    `function catalog_<id>(tl, o)`
//   + manifest params                -> data-composition-variables on <html>
//   + demo stage (two scenes for a transition, a footage plate for an element)
//   + SFX cue                        -> <audio> at item start + sfx.at
//
// The fragment contract (`o`): transitions get `o.from` / `o.to` (outgoing and
// incoming scene selectors), `o.stage` (whole-frame wrapper) and `o.at` (start,
// seconds); elements get `o.layer` (overlay container) and `o.at`. Layouts
// (#564) get `o.layer` and draw the whole frame from their own markup. Caption
// presets (#565) get `o.layer`, `o.at` and `o.words` ([{ text, start, end }],
// composition seconds). Camera recipes (#567) get `o.target` (the element the
// camera moves), `o.layers` ({ bg, mid, fg } for parallax), `o.subject`,
// `o.track` (a ralphy.track/v1-shaped point track) and `o.trackStart`. Every
// param arrives on `o` by its id. Functions only add tweens to the passed
// timeline, never build their own, so they paste into any composition unchanged.
//
// Fonts: the pinned HyperFrames compiler caches Google Fonts by weight and style
// only, so a non-Latin subset can overwrite the Latin file. When the caller
// passes `fontFaces` (vendored files from catalog/fonts.json, #565) the harness
// declares them with @font-face, which makes the compiler skip its own fetch.

import type { CatalogItem } from "./schema.js";
import { captionSampleWords, type CaptionWord } from "./samples.js";

/** One vendored font file the preview declares (relative to the build dir). */
export type FontFaceSpec = { family: string; file: string; weight: string; style: string; format: "truetype" | "opentype" | "woff2" };

export function fontFaceCss(faces: FontFaceSpec[]): string {
  return faces
    .map(
      (f) =>
        `@font-face { font-family: "${f.family}"; src: url("${f.file}") format("${f.format}"); font-weight: ${f.weight}; font-style: ${f.style}; font-display: block; }`,
    )
    .join("\n");
}

export type FragmentParts = { css: string; markup: string; js: string };

export function parseFragment(html: string): FragmentParts {
  const pick = (re: RegExp) => (html.match(re)?.[1] ?? "").trim();
  return {
    css: pick(/<style\s+data-catalog-css[^>]*>([\s\S]*?)<\/style>/),
    markup: pick(/<template\s+data-catalog-markup[^>]*>([\s\S]*?)<\/template>/),
    js: pick(/<script\s+data-catalog-js[^>]*>([\s\S]*?)<\/script>/),
  };
}

/** Item start inside the preview: transitions swap at 1.1 s; elements enter at 0.4 s. */
export function previewTiming(item: CatalogItem): { at: number; total: number } {
  if (item.kind === "transition") {
    const at = 1.1;
    return { at, total: Math.round((at + item.duration + 1.2) * 10) / 10 };
  }
  if (item.kind === "layout") {
    const at = 0.3;
    return { at, total: Math.round((at + item.duration + 2.0) * 10) / 10 };
  }
  if (item.kind === "caption") {
    const at = 0.3;
    const words = captionSampleWords(at);
    return { at, total: Math.round((words[words.length - 1]!.end + 0.8) * 10) / 10 };
  }
  if (item.kind === "camera") {
    // A beat of static frame first, so the move reads as a move.
    const at = 0.6;
    return { at, total: Math.round(Math.max(2.4, at + item.duration + 0.9) * 10) / 10 };
  }
  const at = 0.4;
  return { at, total: Math.round((at + item.duration + 1.5) * 10) / 10 };
}

function attrJson(v: unknown): string {
  return JSON.stringify(v).replace(/&/g, "&amp;").replace(/'/g, "&#39;");
}

export const HARNESS_CSS = `
html, body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: #0b0f1e; }
body { font-family: "Inter", sans-serif; }
#stage { position: absolute; inset: 0; width: 1080px; height: 1920px; overflow: hidden; }
.scene { position: absolute; top: 0; left: 0; width: 1080px; height: 1920px; overflow: hidden; }
.scene-inner { position: absolute; inset: 0; }
.hx-glow { position: absolute; border-radius: 50%; }
.hx-ring { position: absolute; border-radius: 50%; border: 3px solid; }
.hx-grid { position: absolute; inset: -120px; background-size: 120px 120px; }
.hx-kicker { position: absolute; left: 96px; top: 300px; font-family: "Space Grotesk", sans-serif; font-weight: 700; font-size: 40px; line-height: 1; letter-spacing: 6px; text-transform: uppercase; }
.hx-title { position: absolute; left: 90px; right: 120px; top: 620px; font-family: "Anton", "Impact", sans-serif; font-weight: 400; font-size: 210px; line-height: 0.92; text-transform: uppercase; }
.hx-sub { position: absolute; left: 96px; right: 160px; top: 1180px; font-family: "Inter", sans-serif; font-weight: 500; font-size: 46px; line-height: 1.25; }
.hx-ghost { position: absolute; left: -40px; top: 1420px; font-family: "Anton", "Impact", sans-serif; font-size: 360px; line-height: 1; opacity: 0.07; white-space: nowrap; }
#sceneA { z-index: 1; background: #101733; color: #f4f1ea; }
#sceneA .hx-grid { background-image: radial-gradient(circle, rgba(244,241,234,0.16) 3px, rgba(244,241,234,0) 4px); }
#sceneA .hx-glow { width: 1300px; height: 1300px; left: 180px; top: -260px; background: radial-gradient(circle, rgba(92,124,255,0.55) 0%, rgba(92,124,255,0) 65%); }
#sceneA .hx-ring { width: 520px; height: 520px; left: 620px; top: 1180px; border-color: rgba(244,241,234,0.25); }
#sceneA .hx-kicker { color: #8fa4ff; }
#sceneB { z-index: 2; background: #f2552c; color: #1c0d08; opacity: 0; }
#sceneB .hx-grid { background-image: linear-gradient(rgba(28,13,8,0.12) 2px, rgba(28,13,8,0) 2px), linear-gradient(90deg, rgba(28,13,8,0.12) 2px, rgba(28,13,8,0) 2px); }
#sceneB .hx-glow { width: 1400px; height: 1400px; left: -520px; top: 900px; background: radial-gradient(circle, rgba(255,214,102,0.75) 0%, rgba(255,214,102,0) 62%); }
#sceneB .hx-ring { width: 380px; height: 380px; left: 640px; top: 300px; border-color: rgba(28,13,8,0.35); }
#sceneB .hx-kicker { color: #1c0d08; }
#plate { z-index: 1; background: #141826; }
#plate .pl-blob { position: absolute; border-radius: 50%; }
#plate .pl-a { width: 1200px; height: 1200px; left: -300px; top: 200px; background: radial-gradient(circle, rgba(64,140,170,0.65) 0%, rgba(64,140,170,0) 65%); }
#plate .pl-b { width: 1100px; height: 1100px; left: 300px; top: 900px; background: radial-gradient(circle, rgba(196,120,72,0.6) 0%, rgba(196,120,72,0) 65%); }
#plate .pl-c { width: 700px; height: 700px; left: 420px; top: -120px; background: radial-gradient(circle, rgba(230,226,214,0.28) 0%, rgba(230,226,214,0) 65%); }
#plate .pl-vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(8,10,18,0) 45%, rgba(8,10,18,0.75) 100%); }
#plate .pl-label { position: absolute; left: 96px; top: 250px; font-family: "Space Grotesk", sans-serif; font-weight: 600; font-size: 30px; line-height: 1; letter-spacing: 5px; color: rgba(240,236,226,0.55); text-transform: uppercase; }
#layer { position: absolute; inset: 0; z-index: 5; }
#cam-frame { z-index: 1; overflow: visible; }
.cam-layer { position: absolute; top: -240px; left: -540px; width: 2160px; height: 2400px; }
#cam-bg { background: linear-gradient(180deg, #1d2f5c 0%, #3d5a8f 46%, #e7a36b 72%, #6b3f2e 100%); }
#cam-bg .cam-dots { position: absolute; inset: 0; background-image: radial-gradient(circle, rgba(255,255,255,0.22) 3px, rgba(255,255,255,0) 4px); background-size: 90px 90px; }
#cam-bg .cam-sun { position: absolute; left: 1250px; top: 760px; width: 300px; height: 300px; border-radius: 50%; background: #ffd27a; box-shadow: 0 0 120px rgba(255,210,122,0.8); }
#cam-mid .cam-hill { position: absolute; border-radius: 50%; }
#cam-mid .cam-tower { position: absolute; width: 120px; background: #263048; }
#cam-fg .cam-grass { position: absolute; left: 0; top: 1900px; width: 2160px; height: 500px; background: #142016; }
#cam-fg .cam-post { position: absolute; top: 1480px; width: 60px; height: 900px; background: #0b120c; }
#cam-subject { position: absolute; left: 0; top: 0; width: 220px; height: 520px; }
#cam-subject .cs-head { position: absolute; left: 50px; top: 0; width: 120px; height: 150px; border-radius: 48% 48% 44% 44%; background: #f0c39c; }
#cam-subject .cs-body { position: absolute; left: 10px; top: 150px; width: 200px; height: 370px; border-radius: 90px 90px 20px 20px; background: #ff5a36; }
.cam-ruler { position: absolute; left: 0; width: 1080px; height: 24px; background: repeating-linear-gradient(90deg, rgba(255,255,255,0.75) 0px, rgba(255,255,255,0.75) 4px, rgba(255,255,255,0) 4px, rgba(255,255,255,0) 54px); }
.cam-label { position: absolute; left: 96px; top: 260px; font-family: "Space Grotesk", sans-serif; font-weight: 600; font-size: 30px; letter-spacing: 5px; color: rgba(255,255,255,0.8); text-transform: uppercase; }
.cam-reticle { position: absolute; left: 340px; top: 660px; width: 400px; height: 600px; border: 3px dashed rgba(255,255,255,0.45); border-radius: 12px; }
`;

function transitionStage(): string {
  return `
      <div id="sceneA" class="scene"><div class="scene-inner">
        <div class="hx-grid"></div><div class="hx-glow"></div><div class="hx-ring"></div>
        <div class="hx-kicker" id="a-kicker">01 / Before</div>
        <div class="hx-title" id="a-title">The old way</div>
        <div class="hx-sub" id="a-sub">Ten tabs, three exports, one tired editor.</div>
        <div class="hx-ghost">BEFORE BEFORE</div>
      </div></div>
      <div id="sceneB" class="scene"><div class="scene-inner">
        <div class="hx-grid"></div><div class="hx-glow"></div><div class="hx-ring"></div>
        <div class="hx-kicker" id="b-kicker">02 / After</div>
        <div class="hx-title" id="b-title">The new way</div>
        <div class="hx-sub" id="b-sub">One timeline. Every cut lands on the beat.</div>
        <div class="hx-ghost">AFTER AFTER</div>
      </div></div>`;
}

function elementStage(): string {
  return `
      <div id="plate" class="scene"><div class="scene-inner" id="plate-inner">
        <div class="pl-blob pl-a"></div><div class="pl-blob pl-b"></div><div class="pl-blob pl-c"></div>
        <div class="pl-vignette"></div>
        <div class="pl-label" data-safe-zone="ignore">Footage plate</div>
      </div></div>`;
}


function layoutStage(): string {
  return "";
}

function cameraStage(): string {
  return `
      <div id="cam-frame" class="scene">
        <div id="cam-bg" class="cam-layer"><div class="cam-dots"></div><div class="cam-sun"></div></div>
        <div id="cam-mid" class="cam-layer">
          <div class="cam-hill" style="left: -200px; top: 1500px; width: 1400px; height: 900px; background: #2f4a3a;"></div>
          <div class="cam-hill" style="left: 900px; top: 1580px; width: 1500px; height: 900px; background: #284034;"></div>
          <div class="cam-tower" style="left: 760px; top: 1080px; height: 560px;"></div>
          <div class="cam-tower" style="left: 1420px; top: 1180px; height: 460px;"></div>
        </div>
        <div id="cam-subject"><div class="cs-head"></div><div class="cs-body"></div></div>
        <div id="cam-fg" class="cam-layer">
          <div class="cam-grass"></div>
          <div class="cam-post" style="left: 380px;"></div><div class="cam-post" style="left: 1660px;"></div>
        </div>
      </div>`;
}

/**
 * Waypoints of the demo subject in the camera stage (frame px; the stage is
 * 1080 wide, the plate 2160). The preview animates the subject through them
 * and hands the camera the SAME path as a point track, the way
 * `ralphy track point` output would arrive (#559).
 */
export const CAMERA_SUBJECT_PATH = [
  { t: 0, x: 120, y: 1240 },
  { t: 1.0, x: 520, y: 1200 },
  { t: 2.0, x: 980, y: 1260 },
  { t: 3.0, x: 1420, y: 1210 },
  { t: 4.2, x: 1760, y: 1250 },
] as const;

/** Point-track document (ralphy.track/v1 keyframe shape) sampled from CAMERA_SUBJECT_PATH at 10 fps. */
export function cameraDemoTrack(): { schema: string; kind: string; source: { width: number; height: number; fps: number }; keyframes: Array<{ t: number; frame: number; x: number; y: number; confidence: number; lost: boolean }> } {
  const P = CAMERA_SUBJECT_PATH;
  const end = P[P.length - 1]!.t;
  const keyframes = [];
  for (let i = 0; i <= Math.round(end * 10); i++) {
    const t = i / 10;
    let j = 0;
    while (j < P.length - 2 && t > P[j + 1]!.t) j++;
    const a = P[j]!;
    const b = P[j + 1]!;
    const u = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
    // Subject anchor = head centre (110 px right of the subject's left edge).
    keyframes.push({ t, frame: i * 3, x: Math.round((a.x + (b.x - a.x) * u + 110) * 10) / 10, y: Math.round((a.y + (b.y - a.y) * u) * 10) / 10, confidence: 1, lost: false });
  }
  return { schema: "ralphy.track/v1", kind: "point", source: { width: 1080, height: 1920, fps: 30 }, keyframes };
}

function harnessTimeline(item: CatalogItem, at: number, total: number): string {
  if (item.kind === "layout") return "";
  if (item.kind === "camera") {
    // Only tracking / reframing recipes need a subject that walks across the plate.
    const walking = item.camera?.input === "track" || item.tags.includes("reframe");
    if (!walking) {
      return `
  tl.set("#cam-subject", { x: 430, y: 1180 }, 0);
  tl.fromTo("#cam-subject .cs-head", { y: 0 }, { y: -10, duration: ${total / 2}, ease: "sine.inOut" }, 0);
  tl.to("#cam-subject .cs-head", { y: 0, duration: ${total / 2}, ease: "sine.inOut" }, ${total / 2});`;
    }
    const segs = CAMERA_SUBJECT_PATH.slice(1)
      .map((p, i) => {
        const a = CAMERA_SUBJECT_PATH[i]!;
        return `  tl.to("#cam-subject", { x: ${p.x}, y: ${p.y}, duration: ${Math.round((p.t - a.t) * 1000) / 1000}, ease: "none" }, ${Math.round((at + a.t) * 1000) / 1000});`;
      })
      .join("\n");
    return `
  tl.set("#cam-subject", { x: ${CAMERA_SUBJECT_PATH[0].x}, y: ${CAMERA_SUBJECT_PATH[0].y} }, 0);
${segs}`;
  }
  if (item.kind === "transition") {
    return `
  tl.from("#a-kicker", { y: 40, opacity: 0, duration: 0.45, ease: "power3.out" }, 0.12);
  tl.from("#a-title", { y: 90, opacity: 0, duration: 0.6, ease: "expo.out" }, 0.2);
  tl.from("#a-sub", { x: -60, opacity: 0, duration: 0.5, ease: "power2.out" }, 0.38);
  tl.fromTo("#sceneA .hx-glow", { scale: 0.92 }, { scale: 1.08, duration: ${total}, ease: "sine.inOut" }, 0);
  tl.fromTo("#sceneB .hx-glow", { scale: 1.06 }, { scale: 0.94, duration: ${total}, ease: "sine.inOut" }, 0);
  tl.fromTo("#sceneA .hx-grid", { x: 0 }, { x: -60, duration: ${total}, ease: "none" }, 0);
  tl.fromTo("#sceneB .hx-grid", { y: 0 }, { y: -60, duration: ${total}, ease: "none" }, 0);
  tl.from("#b-sub", { y: 50, opacity: 0, duration: 0.5, ease: "back.out(1.6)" }, ${Math.round((at + item.duration + 0.05) * 100) / 100});`;
  }
  return `
  tl.fromTo("#plate-inner", { scale: 1.0 }, { scale: 1.07, duration: ${total}, ease: "sine.inOut" }, 0);
  tl.fromTo("#plate .pl-a", { x: 0, y: 0 }, { x: 120, y: -60, duration: ${total}, ease: "sine.inOut" }, 0);
  tl.fromTo("#plate .pl-b", { x: 0 }, { x: -140, duration: ${total}, ease: "sine.inOut" }, 0);`;
}

export type BuildInput = {
  item: CatalogItem;
  fragmentHtml: string;
  /** File name of the SFX copied next to index.html; null renders silent. */
  sfxFile: string | null;
  /** Vendored font files copied next to index.html (#565); omitted = compiler fetch. */
  fontFaces?: FontFaceSpec[];
};

function contextFor(item: CatalogItem, at: number): string {
  switch (item.kind) {
    case "transition":
      return `{ from: "#sceneA", to: "#sceneB", stage: "#stage", at: ${at} }`;
    case "caption":
      return `{ layer: "#layer", stage: "#stage", at: ${at}, words: ${JSON.stringify(captionSampleWords(at).map((w: CaptionWord) => ({ text: w.text, start: w.start, end: w.end })))} }`;
    case "camera":
      return `{ target: "#cam-frame", stage: "#stage", layers: { bg: "#cam-bg", mid: "#cam-mid", fg: "#cam-fg" }, subject: "#cam-subject", track: ${item.camera?.input === "track" ? JSON.stringify(cameraDemoTrack()) : "null"}, trackStart: ${at}, bounds: [-540, -240, 1620, 2160], at: ${at} }`;
    default:
      return `{ layer: "#layer", stage: "#stage", at: ${at} }`;
  }
}

function stageFor(item: CatalogItem): string {
  switch (item.kind) {
    case "transition":
      return transitionStage();
    case "layout":
      return layoutStage();
    case "camera":
      return cameraStage();
    default:
      return elementStage();
  }
}

export function buildPreviewHtml({ item, fragmentHtml, sfxFile, fontFaces }: BuildInput): string {
  const parts = parseFragment(fragmentHtml);
  if (!parts.js.includes(`function ${item.fn}(`)) {
    throw new Error(`${item.source}: fragment must define function ${item.fn}(tl, o)`);
  }
  const { at, total } = previewTiming(item);
  const variables = item.params.map((p) => ({
    id: p.id,
    type: p.type,
    label: p.label,
    default: p.default,
    ...(p.options ? { options: p.options } : {}),
  }));
  const defaults = Object.fromEntries(item.params.map((p) => [p.id, p.default]));
  const stage = stageFor(item);
  const ctx = contextFor(item, at);
  const fonts = fontFaces && fontFaces.length > 0 ? `\n/* ---- vendored fonts (catalog/fonts.json, #565) ---- */\n${fontFaceCss(fontFaces)}` : "";
  const audio =
    sfxFile && item.sfx
      ? `\n    <audio id="cat-sfx" data-start="${Math.max(0, Math.round((at + item.sfx.at) * 1000) / 1000)}" data-track-index="2"${item.sfx.trim ? ` data-duration="${item.sfx.trim}"` : ""} src="${sfxFile}" data-volume="${item.sfx.volume}"></audio>`
      : "";
  return `<!doctype html>
<!-- Generated by \`ralphy catalog build-previews\` from catalog/${item.source} (#563). Do not hand-edit; edit the fragment. -->
<html lang="en" data-composition-variables='${attrJson(variables)}'>
  <head>
    <meta charset="UTF-8" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>${HARNESS_CSS}${fonts}
/* ---- catalog item: ${item.id} ---- */
${parts.css}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-width="1080" data-height="1920" data-start="0" data-duration="${total}">
    <div id="stage">${stage}
      <div id="layer">
${parts.markup}
      </div>
    </div>${audio}
    </div>
    <script>
  window.__timelines = window.__timelines || {};
  var tl = gsap.timeline({ paused: true });
${harnessTimeline(item, at, total)}

  // ---- catalog item: ${item.id} ----
${parts.js}

  var catalogDefaults = ${JSON.stringify(defaults)};
  var catalogVars = (window.__hyperframes && typeof window.__hyperframes.getVariables === "function") ? window.__hyperframes.getVariables() : {};
  var catalogCtx = ${ctx};
  ${item.fn}(tl, Object.assign({}, catalogDefaults, catalogVars, catalogCtx));
  window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}
