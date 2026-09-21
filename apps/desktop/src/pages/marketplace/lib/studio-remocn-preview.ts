import { studioRemocnPreviewCss } from "./studio-remocn-preview-css";
import type { MarketplaceStudioExample } from "./presentation-types";
import type { VisualFormat, VisualSettings, VisualVariant } from "./studio-visual-scenes";

export type RemocnVisual = NonNullable<MarketplaceStudioExample["remocnVisual"]>;

const sceneKeywords: [RegExp, string][] = [
  [/\bascii\b/, "ascii"], [/\bbar chart\b/, "bar-chart"], [/\bline chart\b/, "line-chart"], [/\b(counter|number|count)\b/, "counter"],
  [/\b(hand|write|draw|scribble)\b/, "handwrite"], [/\b(glitch|scramble|shuffle)\b/, "glitch"], [/\b(blur|focus)\b/, "blur"],
  [/\b(split|slice)\b/, "split"], [/\broll\b/, "roll"], [/\b(wave|curve)\b/, "wave"], [/\b(bounce|spring)\b/, "bounce"],
  [/\b(scale|zoom|grow)\b/, "scale"], [/\b(fade|reveal|appear)\b/, "reveal"], [/\bwipe\b/, "wipe"], [/\b(slide|push)\b/, "slide"],
  [/\b(clock|radial|iris|circle)\b/, "radial"], [/\b(pixel|mosaic)\b/, "pixel"], [/\b(mask|clip)\b/, "mask"],
  [/\bcheck list\b|\btodo\b/, "check-list"], [/\bpolaroid\b/, "polaroid"], [/\b(reel|carousel)\b/, "reel"],
  [/\b(button|cta)\b/, "button"], [/\btabs?\b/, "tabs"], [/\b(menu|nav)\b/, "menu"], [/\b(input|field|form)\b/, "form"],
  [/\b(toggle|switch)\b/, "toggle"], [/\b(progress|loader|spinner)\b/, "progress"], [/\b(toast|notification|alert)\b/, "toast"],
  [/\b(card|profile|post|tweet|comment)\b/, "card"], [/\b(grid|bento|masonry)\b/, "grid"], [/\bstack\b/, "stack"],
  [/\b(terminal|prompt|code)\b/, "terminal"], [/\b(paper|craft|tape|stamp)\b/, "paper"], [/\b(guide|timeline|storyboard)\b/, "guide"],
];

const componentSceneGroups = new Set(["layout", "effects", "shaders", "filters", "social", "compositions", "ai", "templates"]);

const sceneFallback: Record<string, string> = {
  typography: "type", layout: "layout", ui: "interface", "ui-blocks": "block",
  transitions: "wipe", effects: "effect", shaders: "shader", filters: "filter",
  social: "card", compositions: "composition", ai: "terminal", craft: "paper",
  templates: "template", guides: "guide",
};

export function remocnVisualDefinition(entry: { id: string; slug?: string; name?: string; title: string; summary: string; group: string }): RemocnVisual {
  const slug = entry.slug ?? entry.name ?? entry.id;
  const normalized = `${slug} ${entry.title}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const componentScene = slug.toLowerCase().replace(/^shader-/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const scene = componentSceneGroups.has(entry.group)
    ? componentScene
    : sceneKeywords.find(([pattern]) => pattern.test(normalized))?.[1] ?? sceneFallback[entry.group] ?? "motion";
  return { id: entry.id, slug, group: entry.group, scene, title: entry.title, summary: entry.summary };
}

const palettes = [
  ["#f0efe7", "#203a33", "#f26b46"], ["#11131a", "#f5f1e8", "#8c7cff"],
  ["#e7e5ff", "#25214f", "#ff7557"], ["#102c2d", "#eaf7e7", "#72d9b2"],
  ["#f4d95f", "#2c2140", "#ff6f91"], ["#241821", "#fff3dc", "#e88952"],
] as const;

const hash = (value: string) => [...value].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 7);
const bounded = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const color = (value: unknown, fallback: string) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/\"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function remocnVisualAppearance(visual: RemocnVisual, settings?: VisualSettings) {
  const palette = palettes[hash(visual.id) % palettes.length]!;
  return {
    backgroundColor: color(settings?.backgroundColor, palette[0]),
    textColor: color(settings?.textColor, palette[1]),
    accentColor: color(settings?.accentColor, palette[2]),
    fontWeight: Math.round(bounded(settings?.fontWeight, 650, 300, 800) / 100) * 100,
    fontScale: bounded(settings?.fontScale, 1, 0.7, 1.25),
  };
}

export const remocnVisualSpeed = (settings?: VisualSettings) => bounded(settings?.speed, 1, 0.5, 2);
export const remocnVisualTitle = (visual: RemocnVisual, settings?: VisualSettings) => typeof settings?.title === "string" ? settings.title.slice(0, 60) : visual.title;
export const remocnVisualFormat = (_visual: RemocnVisual, settings?: VisualSettings): VisualFormat => settings?.format === "wide" || settings?.format === "square" || settings?.format === "portrait" ? settings.format : "portrait";

export function remocnVisualStyleVariables(visual: RemocnVisual, settings?: VisualSettings) {
  const appearance = remocnVisualAppearance(visual, settings);
  const format = remocnVisualFormat(visual, settings);
  const seed = hash(visual.id);
  return {
    "--rv-speed": remocnVisualSpeed(settings), "--rv-font-scale": appearance.fontScale,
    "--rv-font-weight": appearance.fontWeight, "--rv-text": appearance.textColor,
    "--rv-bg": appearance.backgroundColor, "--rv-accent": appearance.accentColor,
    "--rv-aspect": format === "wide" ? 16 / 9 : format === "portrait" ? 9 / 16 : 1,
    "--rv-turn": `${(seed % 13) - 6}deg`, "--rv-shift": `${12 + seed % 24}%`,
  };
}

export function remocnVisualVariantSettings(visual: RemocnVisual, variant: VisualVariant): VisualSettings {
  const original = remocnVisualAppearance(visual);
  if (variant === "original") return { ...original, fontScale: 1 };
  return variant === "night"
    ? { backgroundColor: "#11151b", textColor: "#f4f0e8", accentColor: original.accentColor, fontScale: 0.95, fontWeight: 600 }
    : { backgroundColor: "#f0eadc", textColor: "#302a24", accentColor: "#d85f42", fontScale: 1.05, fontWeight: 500 };
}

const indexed = (text: string) => Array.from(text).slice(0, 22).map((character, index) => `<span style="--i:${index}">${escape(character === " " ? "\u00a0" : character)}</span>`).join("");
const photo = () => `${import.meta.env.BASE_URL}explore/studio/editorial-portrait.png`;
const bars = (visual: RemocnVisual) => Array.from({ length: 7 }, (_, index) => `<i style="--i:${index};--level:${28 + (hash(`${visual.id}:${index}`) % 66)}%"></i>`).join("");

function interfaceMarkup(visual: RemocnVisual, title: string) {
  if (visual.scene === "check-list") return `<div class="rv-check-list"><strong>${title}</strong><ul><li><i></i>Structure the scene</li><li><i></i>Set the rhythm</li><li><i></i>Polish the motion</li></ul></div>`;
  if (visual.scene === "tabs") return `<div class="rv-tabs"><nav><b>Motion</b><span>Layout</span><span>Style</span></nav><main><strong>${title}</strong><i></i><i></i><i></i></main></div>`;
  if (visual.scene === "toggle") return `<div class="rv-toggle"><strong>${title}</strong><button><i></i></button><small>Motion enabled</small></div>`;
  if (visual.scene === "progress") return `<div class="rv-progress"><strong>${title}</strong>${[36, 72, 54].map((level) => `<i style="--level:${level}%"><b></b></i>`).join("")}</div>`;
  if (visual.scene === "polaroid") return `<figure class="rv-polaroid"><img src="${photo()}" alt=""><figcaption>${title}</figcaption></figure>`;
  if (visual.scene === "button") return `<div class="rv-button-demo"><span>${title}</span><button>Continue <i>→</i></button></div>`;
  return `<div class="rv-interface rv-ui-${escape(visual.scene)}"><header><i></i><span>${title}</span><button>Open</button></header><main><b>${title}</b><p>${escape(visual.summary)}</p><div><i></i><i></i><i></i></div></main></div>`;
}

function aiMarkup(visual: RemocnVisual, title: string) {
  if (visual.scene.includes("code") || visual.scene === "opencode") return `<div class="rv-ai rv-ai-code"><header><i></i><span>${title}</span></header><pre>$ compose --preview<br><b>Generating scene…</b><i></i></pre><footer>esc cancel <span>↵ send</span></footer></div>`;
  return `<div class="rv-ai rv-ai-chat"><header><i></i><strong>${title}</strong><i></i></header><main><p>Build a cinematic launch sequence</p><span>Design the first frame, then animate it.</span></main><footer><span>Ask anything</span><button>↑</button></footer></div>`;
}

function socialMarkup(visual: RemocnVisual, title: string) {
  if (visual.scene.includes("stars")) return `<div class="rv-social rv-social-stars"><strong>12,482</strong><span>★ GitHub stars</span><div>${Array.from({ length: 9 }, (_, index) => `<i style="--i:${index}"></i>`).join("")}</div></div>`;
  if (visual.scene.includes("sponsors")) return `<div class="rv-social rv-social-sponsors"><strong>♥</strong><span>${title}</span><div>${Array.from({ length: 12 }, (_, index) => `<i style="--i:${index}"></i>`).join("")}</div></div>`;
  if (visual.scene.includes("logo")) return `<div class="rv-social rv-social-logos">${["R", "M", "C", "N"].map((letter, index) => `<i style="--i:${index}">${letter}</i>`).join("")}<strong>${title}</strong></div>`;
  return `<div class="rv-social rv-social-follow"><header><i></i><span><strong>@motionstudio</strong><small>Creative tools</small></span><button>Follow</button></header><p>${title}</p><footer><b>48.2K</b> followers</footer></div>`;
}

const shaderMarkup = (visual: RemocnVisual, title: string) => `<div class="rv-shader rv-shader-${escape(visual.scene)}"><i></i><i></i><i></i><i></i><i></i><i></i></div><strong class="rv-title">${title}</strong>`;

export function remocnVisualSceneMarkup(visual: RemocnVisual, settings?: VisualSettings): string {
  const title = remocnVisualTitle(visual, settings);
  const safeTitle = escape(title);
  const label = `<span class="rv-kicker">REMOCN / ${escape(visual.group)}</span>`;
  let body: string;
  if (visual.scene === "bar-chart") body = `<div class="rv-chart rv-bar-chart"><strong>${safeTitle}</strong><section>${bars(visual)}</section></div>`;
  else if (visual.scene === "line-chart") body = `<div class="rv-chart rv-line-chart"><strong>${safeTitle}</strong><svg viewBox="0 0 320 180" aria-hidden="true"><path d="M8 156 C54 122 68 146 104 98 S166 126 196 70 S258 96 312 20"/><circle cx="312" cy="20" r="7"/></svg></div>`;
  else if (visual.scene === "ascii") body = `<div class="rv-ascii"><strong>${safeTitle}</strong><pre>${Array.from({ length: 8 }, (_, row) => Array.from({ length: 16 }, (_, column) => " .:-=+*#%@"[(hash(visual.id) + row * 7 + column * 3) % 10]).join("")).join("\n")}</pre></div>`;
  else if (visual.scene === "counter") body = `<div class="rv-counter"><small>${safeTitle}</small><strong>${String(hash(visual.id) % 100).padStart(2, "0")}</strong><i></i></div>`;
  else if (visual.group === "typography") body = `<div class="rv-word rv-word-${escape(visual.scene)}">${indexed(title)}</div><i class="rv-rule"></i>`;
  else if (visual.group === "transitions") body = `<div class="rv-transition rv-transition-${escape(visual.scene)}"><section><b>01</b><span>${safeTitle}</span></section><section><b>02</b><span>NEXT FRAME</span></section><i></i></div>`;
  else if (visual.group === "shaders") body = shaderMarkup(visual, safeTitle);
  else if (["effects", "filters"].includes(visual.group)) body = `<div class="rv-media rv-media-${escape(visual.scene)}"><img src="${photo()}" alt=""><i class="rv-effect-a"></i><i class="rv-effect-b"></i></div><strong class="rv-title">${safeTitle}</strong>`;
  else if (["layout", "compositions", "templates"].includes(visual.group)) body = `<div class="rv-layout rv-layout-${escape(visual.scene)}">${Array.from({ length: 6 }, (_, index) => `<i style="--i:${index}"><span>${String(index + 1).padStart(2, "0")}</span></i>`).join("")}</div><strong class="rv-title">${safeTitle}</strong>`;
  else if (visual.group === "social") body = socialMarkup(visual, safeTitle);
  else if (["ui", "ui-blocks"].includes(visual.group)) body = interfaceMarkup(visual, safeTitle);
  else if (visual.group === "ai") body = aiMarkup(visual, safeTitle);
  else if (visual.group === "guides") body = `<div class="rv-guide rv-guide-${escape(visual.scene)}"><ol><li>Define</li><li>Compose</li><li>Animate</li></ol><pre>&gt; ${safeTitle}<i></i></pre></div>`;
  else if (visual.group === "craft") body = `<div class="rv-paper rv-paper-${escape(visual.scene)}"><small>FIELD NOTE 0${hash(visual.id) % 9 + 1}</small><strong>${safeTitle}</strong><i></i></div>`;
  else body = `<div class="rv-motion"><i></i><i></i><i></i></div><strong class="rv-title">${safeTitle}</strong>`;
  return `${label}<div class="rv-content">${body}</div><span class="rv-caption">${escape(visual.summary)}</span><span class="rv-index">${String(hash(visual.id) % 99).padStart(2, "0")}</span>`;
}

export function remocnVisualArtifact(visual: RemocnVisual, settings?: VisualSettings, sourceArtifact?: string): string {
  const style = Object.entries(remocnVisualStyleVariables(visual, settings)).map(([key, value]) => `${key}:${value}`).join(";");
  const source = sourceArtifact ? `<template id="remocn-source-adapter">${escape(sourceArtifact)}</template>` : "";
  return `<!doctype html>\n<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(remocnVisualTitle(visual, settings))}</title><style>html,body{margin:0;width:100%;height:100%;display:grid;place-items:center;background:#151515}${studioRemocnPreviewCss}.rv-scene{width:min(100vw,calc(100vh * var(--rv-aspect)))}</style><body><main class="rv-scene rv-${escape(visual.group)}" data-remocn-id="${escape(visual.id)}" data-remocn-scene="${escape(visual.scene)}" data-format="${remocnVisualFormat(visual, settings)}" style="${style}">${remocnVisualSceneMarkup(visual, settings)}</main>${source}</body></html>`;
}
