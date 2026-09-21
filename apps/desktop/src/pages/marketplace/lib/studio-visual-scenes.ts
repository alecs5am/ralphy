import { studioVisualCss } from "./studio-visual-styles";
import type { MarketplaceStudioExample } from "./presentation-types";

export type StudioVisualId = NonNullable<MarketplaceStudioExample["visualId"]>;
export type VisualSettings = Record<string, number | string | boolean>;
export type VisualVariant = "original" | "night" | "paper";
export type VisualFormat = "wide" | "square" | "portrait";
export function visualFormat(_id: StudioVisualId, settings?: VisualSettings): VisualFormat {
  return settings?.format === "wide" || settings?.format === "square" || settings?.format === "portrait" ? settings.format
    : "portrait";
}
const appearance: Record<StudioVisualId, { backgroundColor: string; textColor: string; fontWeight: number }> = {
  "photo-orbit": { backgroundColor: "#ecece3", textColor: "#243c32", fontWeight: 600 },
  "cascading-stack": { backgroundColor: "#d8bda6", textColor: "#36291f", fontWeight: 600 },
  filmstrip: { backgroundColor: "#252e37", textColor: "#f1eddb", fontWeight: 600 },
  "split-reveal": { backgroundColor: "#292729", textColor: "#eeeae2", fontWeight: 500 },
  "contact-sheet": { backgroundColor: "#e8ebde", textColor: "#273323", fontWeight: 400 },
  "type-opener": { backgroundColor: "#e9e9dc", textColor: "#213b2a", fontWeight: 700 },
  "aurora-field": { backgroundColor: "#99bbb2", textColor: "#183d38", fontWeight: 400 },
  "orbit-mark": { backgroundColor: "#e4e8df", textColor: "#243c3c", fontWeight: 400 },
};
const bounded = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const color = (value: unknown, fallback: string) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
export function visualAppearance(id: StudioVisualId, settings?: VisualSettings) {
  const original = appearance[id];
  return {
    backgroundColor: color(settings?.backgroundColor, original.backgroundColor),
    textColor: color(settings?.textColor, original.textColor),
    fontWeight: Math.round(bounded(settings?.fontWeight, original.fontWeight, 300, 800) / 100) * 100,
    fontScale: bounded(settings?.fontScale, 1, 0.7, 1.25),
  };
}
export function visualVariantSettings(id: StudioVisualId, variant: VisualVariant): VisualSettings {
  if (variant === "original") return { ...appearance[id], fontScale: 1 };
  if (id === "split-reveal") return { ...appearance[id], fontScale: variant === "night" ? 0.85 : 1.1, fontWeight: variant === "night" ? 300 : 700 };
  return variant === "night"
    ? { backgroundColor: "#182421", textColor: "#f0eddd", fontScale: 0.9, fontWeight: 500 }
    : { backgroundColor: "#efe9de", textColor: "#312c26", fontScale: 1.05, fontWeight: 400 };
}
export function visualStyleVariables(id: StudioVisualId, settings?: VisualSettings) {
  const selected = visualAppearance(id, settings);
  const format = visualFormat(id, settings);
  return { "--sv-speed": visualSpeed(settings), "--sv-font-scale": selected.fontScale, "--sv-font-weight": selected.fontWeight, "--sv-text-color": selected.textColor, "--sv-bg-color": selected.backgroundColor, "--sv-aspect": format === "wide" ? 16 / 9 : format === "portrait" ? 9 / 16 : 1 };
}
export const visualSpeed = (settings?: VisualSettings) => Math.min(2, Math.max(0.5, typeof settings?.speed === "number" && Number.isFinite(settings.speed) ? settings.speed : 1));
const photos = ["fashion-editorial", "editorial-portrait", "chrome-product", "mountain-story", "night-city", "botanical-study"];
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const asset = (name: string) => `${import.meta.env.BASE_URL}explore/studio/${name}.png`;
const titles: Record<StudioVisualId, string> = { "photo-orbit": "A different / perspective.", "cascading-stack": "One frame / at a time.", filmstrip: "Never / stand still.", "split-reveal": "Two sides. / One story.", "contact-sheet": "Collected / moments.", "type-opener": "Make / it move.", "aurora-field": "Quiet / motion.", "orbit-mark": "Everything / is connected." };
export const visualTitle = (id: StudioVisualId, settings?: VisualSettings) => typeof settings?.title === "string" ? settings.title.slice(0, 60) : titles[id];

/** Only authored presets and bundled asset paths enter this markup; no library or user HTML is rendered. */
export function visualSceneMarkup(id: StudioVisualId, resolveUrl: (url: string) => string = (url) => url, settings?: VisualSettings): string {
  const lines = visualTitle(id, settings).split("/", 2).map((line) => escape(line.trim()));
  const title = lines.length > 1 ? `${lines[0]}<br><em>${lines[1]}</em>` : lines[0];
  const image = (index: number, className = "", extra = "") => `<img class="sv-photo ${className}" src="${escape(resolveUrl(asset(photos[index % photos.length]!)))}" alt="" draggable="false" ${extra}>`;
  if (id === "photo-orbit") return `<span class="sv-eyebrow">SELECTED WORK / 01—05</span><div class="sv-orbit">${photos.slice(0, 5).map((_, index) => `<figure class="sv-orbit-photo" style="--sv-index:${index}">${image(index)}</figure>`).join("")}</div><div class="sv-orbit-title">${title}</div><span class="sv-footnote">A PHOTO ORBIT</span>`;
  if (id === "cascading-stack") return `<span class="sv-eyebrow">FROM THE ARCHIVE</span><div class="sv-stack">${[4, 1, 5, 0].map((index, order) => `<figure class="sv-stack-photo" style="--sv-index:${order}">${image(index)}<figcaption>STUDY ${String(order + 1).padStart(2, "0")}</figcaption></figure>`).join("")}</div><div class="sv-bottom-title">${title}</div>`;
  if (id === "filmstrip") return `<span class="sv-eyebrow">A SEQUENCE OF SMALL MOMENTS</span><div class="sv-film-title">${title}</div><div class="sv-film-window"><div class="sv-film-track">${[...photos, ...photos].map((_, index) => `<figure>${image(index)}<figcaption>${String(index % photos.length + 1).padStart(2, "0")} — STUDIO NOTES</figcaption></figure>`).join("")}</div></div><span class="sv-footnote">CONTINUOUS / 06 FRAMES</span>`;
  if (id === "split-reveal") return `<span class="sv-split-background">${image(0)}</span><span class="sv-split-cover">${image(1)}</span><div class="sv-split-copy"><span>FORM / FEELING</span><strong>${title}</strong><small>A MOVING EDITORIAL DIPTYCH</small></div>`;
  if (id === "contact-sheet") return `<span class="sv-eyebrow">FIELD NOTES / VOLUME 01</span><div class="sv-contact">${photos.map((_, index) => `<figure style="--sv-index:${index}">${image(index)}<figcaption>${String(index + 1).padStart(2, "0")}</figcaption></figure>`).join("")}</div><div class="sv-contact-title">${title}</div>`;
  if (id === "type-opener") return `<span class="sv-eyebrow">A NOTE FROM THE STUDIO</span><div class="sv-type"><span><b>${lines[0]}</b></span><span><b>${lines[1] ?? ""}</b></span></div><div class="sv-type-rule"></div><span class="sv-footnote">GOOD WORK DESERVES A LITTLE MOTION.</span>`;
  if (id === "aurora-field") return `<div class="sv-aurora"><i></i><i></i><i></i></div><div class="sv-aurora-type"><span>SOFT GRADIENT STUDY</span><strong>${title}</strong><small>LIGHT / COLOR / ATMOSPHERE</small></div>`;
  return `<span class="sv-eyebrow">ORBITAL STUDY / 003</span><div class="sv-orbital"><div class="sv-ring sv-ring-one"></div><div class="sv-ring sv-ring-two"></div><div class="sv-ring sv-ring-three"></div><div class="sv-orbital-core"></div><div class="sv-satellite"></div></div><div class="sv-orbital-caption">${title}</div>`;
}

export function visualArtifact(id: StudioVisualId, settings?: VisualSettings, resolveUrl?: (url: string) => string): string {
  const style = Object.entries(visualStyleVariables(id, settings)).map(([key, value]) => `${key}:${value}`).join(";");
  return `<!doctype html>\n<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ralphy studio visual</title>\n<style>html,body{margin:0;width:100%;height:100%;background:#151515}body{display:grid;place-items:center}\n${studioVisualCss}\n.sv-scene{width:min(100vw,calc(100vh * var(--sv-aspect)))}\n</style>\n<body><main class="sv-scene sv-${id}" data-format="${visualFormat(id, settings)}" style="${style}" aria-label="Animated visual composition">${visualSceneMarkup(id, resolveUrl, settings)}</main></body></html>`;
}
