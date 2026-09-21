/**
 * Helpers every shard reuses. Nothing here reads a clock, touches the DOM or calls `Math.random`:
 * a scene's markup must be a pure function of its id, params and context so that the baked still
 * and the first live frame are the same pixels.
 */
import type { SceneContext, SceneParams, SceneSpec } from "./types";

/** FNV-1a over a string, normalised to [0,1). The only randomness in the system. */
export function hash01(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0x100000000;
}

export const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Per-item custom properties, baked inline so no rule ever needs `nth-child`. */
export const at = (index: number, delayMs?: number) =>
  `--i:${index}${delayMs === undefined ? "" : `;--rv-own:${Math.round(delayMs)}ms`}`;

/** One span per character. `stagger` is milliseconds between neighbours at speed 1. */
export const chars = (text: string, stagger = 0) =>
  Array.from(text)
    .map((character, index) =>
      `<span class="rv-ch" style="${at(index, stagger && index * stagger)}">${character === " " ? "&nbsp;" : esc(character)}</span>`)
    .join("");

/** One span per whitespace-separated word, with the separating spaces preserved between them. */
export const words = (text: string, stagger = 0) =>
  text.split(/\s+/).filter(Boolean)
    .map((word, index) => `<span class="rv-w" style="${at(index, stagger && index * stagger)}">${esc(word)}</span>`)
    .join(" ");

/** One span per line. Split on "/" so the shared title control can author line breaks. */
export const lines = (text: string, stagger = 0) =>
  text.split("/").map((line) => line.trim()).filter(Boolean)
    .map((line, index) => `<span class="rv-ln" style="${at(index, stagger && index * stagger)}">${esc(line)}</span>`)
    .join("");

/** A constant cell grid in stage space, carrying column and row indices for per-cell rules. */
export const cells = (columns: number, rows: number, stagger = 0) =>
  Array.from({ length: columns * rows }, (_, index) => {
    const x = index % columns;
    const y = Math.floor(index / columns);
    return `<i class="rv-cell" style="--i:${index};--x:${x};--y:${y}${stagger ? `;--rv-own:${Math.round((x + y) * stagger)}ms` : ""}"></i>`;
  }).join("");

/** Bars whose heights are deterministic for a given scene id. */
export const bars = (count: number, rand: SceneContext["rand"], stagger = 0) =>
  Array.from({ length: count }, (_, index) =>
    `<i class="rv-bar" style="${at(index, stagger && index * stagger)};--level:${Math.round(24 + rand(`bar:${index}`) * 68)}%"></i>`).join("");

/** A CSS-drawn stand-in for photographic content: no bitmap, so it scales and stays deterministic. */
export const plate = (kind: string, ctx: SceneContext) =>
  `<div class="rv-plate rv-plate-${esc(kind)}" style="--plate-seed:${ctx.rand(`plate:${kind}`).toFixed(4)}"><i></i><i></i><i></i></div>`;

export const caret = () => `<i class="rv-caret"></i>`;

/** The reference stage. Everything a scene draws lives inside it, authored in `spec.stage` px. */
export const stage = (inner: string) => `<div class="rv-stage">${inner}</div>`;

/** Kicker, caption and index. Stripped before the distinctness hash so it can never fake variety. */
export const chrome = (spec: SceneSpec, summary: string) =>
  `<span class="rv-kicker">REMOCN / ${esc(spec.group)}</span>` +
  `<span class="rv-caption">${esc(summary)}</span>` +
  `<span class="rv-index">${String(Math.floor(hash01(spec.id) * 99)).padStart(2, "0")}</span>`;

/** Build the per-scene context. `title` arrives already trimmed by the caller. */
export function sceneContext(spec: SceneSpec, options: { title: string; format: SceneContext["format"]; base?: string }): SceneContext {
  const base = options.base ?? "";
  return {
    title: esc(options.title),
    rand: (key: string) => hash01(`${spec.id}:${key}`),
    esc,
    asset: (path: string) => `${base}${path.replace(/^\//, "")}`,
    format: options.format,
  };
}

/**
 * Scene colours. A scene names its colours in `palette`; user settings may override the three
 * the Customize panel exposes. Both the CSS path and the paint engines read this, so a colour
 * change reaches a shader and a keyframe alike.
 */
export function resolvePalette(spec: SceneSpec, settings?: Record<string, unknown>): Record<string, string> {
  const valid = (value: unknown) => typeof value === "string" && /^#[\da-f]{3,8}$/i.test(value);
  const resolved: Record<string, string> = { ...spec.palette };
  for (const [key, override] of [["text", settings?.textColor], ["bg", settings?.backgroundColor], ["accent", settings?.accentColor]] as const) {
    if (valid(override) && key in resolved) resolved[key] = override as string;
  }
  return resolved;
}

/** Seconds of one whole run: the motion plus the parked hold. Denominator for every percentage. */
export const runSeconds = (spec: SceneSpec) =>
  spec.motion.kind === "static" ? 1 : spec.motion.kind === "loop" ? spec.motion.seconds : spec.motion.seconds + spec.motion.hold;

/** Where a scene parks when it is not playing. */
export const stillFraction = (spec: SceneSpec) =>
  spec.reduced === "end" ? 0.999 : typeof spec.reduced === "number" ? spec.reduced : spec.still;

export type { SceneParams };
