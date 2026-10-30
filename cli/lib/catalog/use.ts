// `ralphy catalog use` (#594): put one motion-catalog item into a project's
// HyperFrames composition, and record that it was used.
//
// A use writes, inside the project tree:
//   compositions/catalog/<id>.html  the item as a HyperFrames sub-composition
//                                   (registry block layout: 1080x1920, its own paused
//                                   timeline, loaded through data-composition-src).
//                                   The directory cannot collide with the
//                                   `compositions/v<N>.html` snapshots. One copy
//                                   serves every use of the item; a copy whose bytes
//                                   differ from what this catalog version writes (the
//                                   user edited it, or the catalog changed) is never
//                                   overwritten: the next free `<id>.v<N>.html` is
//                                   written instead, and an identical one is reused.
//   index.html                      gains one host <div data-composition-src> on a
//                                   free track, with its own data-composition-id
//                                   (`catalog-<id>-<n>`); the typed params and a
//                                   `catalogContext` string (host selectors, word
//                                   timings) travel in data-variable-values.
//   artifacts/sfx/<sfx-id>.<ext>    the item's SFX copied from the local pack, plus an
//                                   <audio> clip at start + cue.
//   logs/catalog-uses.jsonl         one append-only record per use (item, content
//                                   hash, params, start, duration) for the motion eval.
//
// Why sub-compositions: fragments use fixed element ids (`#fw-flash`), so two
// uses pasted into one document would collide. HyperFrames scopes each
// sub-composition instance by its host's data-composition-id (scoped document
// queries and CSS), so the same file can be used any number of times as long
// as every host id is unique. The file therefore carries no composition id of
// its own: the pinned render compiler (hyperframes 0.6.31, `compileForRender`)
// does not rename duplicate host ids, so two hosts sharing one id would share
// one scope and one timeline key (verified with a real render). The script
// registers its timeline under its host's id, and reads its params from the
// host's data-variable-values because that compiler does not hand per-instance
// values to getVariables().
//
// Transitions and camera recipes act on HOST elements (scenes, the camera
// target), which a scoped instance cannot select. Their wrapper therefore
// resolves the host selectors against the whole page, lets `document.
// querySelector(el)` pass an element through, and injects the fragment CSS as a
// page-level style (mask-wipe adds a class to the incoming scene). Elements,
// captions and layouts only draw their own markup, so their CSS stays a scoped
// <style> the compiler can read (it embeds the fonts that CSS names).
//
// Everything here is pure (strings in, strings out) except the small file
// helpers at the bottom; the command in cli/commands/catalog.ts does the I/O.

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parseFragment } from "./harness.js";
import type { CatalogItem, CatalogParam } from "./schema.js";

export type ParamValue = string | number | boolean;

/** A user input the verb refuses; the command maps it to E_INPUT_INVALID. */
export class CatalogUseInputError extends Error {
  constructor(
    readonly field: string,
    readonly detail: string,
  ) {
    super(`${field}: ${detail}`);
  }
}

/** Where the fragment copies live, relative to the project tree. */
export const CATALOG_COPY_DIR = "compositions/catalog";
/** The append-only usage log, relative to the project tree. */
export const CATALOG_USES_LOG = "logs/catalog-uses.jsonl";
/** Every catalog item is authored for this frame (`aspect: "9:16"`). */
export const ITEM_WIDTH = 1080;
export const ITEM_HEIGHT = 1920;
/** Catalog clips sit above the scenes; edit the host style to restack. */
export const CLIP_Z_INDEX = 50;
/** Caption clips stay up this long after the last word ends (the fragments' own tail). */
export const CAPTION_TAIL_SEC = 0.6;

/** Kinds whose fragment tweens host elements (scenes, the camera target). */
export function actsOnHost(item: CatalogItem): boolean {
  return item.kind === "transition" || item.kind === "camera";
}

export function compositionIdFor(item: CatalogItem): string {
  return `catalog-${item.id}`;
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function sha256(text: string | Uint8Array): string {
  return createHash("sha256").update(text).digest("hex");
}

// ─── params ─────────────────────────────────────────────────────────────────

function coerceParam(p: CatalogParam, raw: string, field = `param ${p.id}`): ParamValue {
  switch (p.type) {
    case "number": {
      const n = raw.trim() === "" ? Number.NaN : Number(raw);
      if (!Number.isFinite(n)) throw new CatalogUseInputError(field, `expected a number, got '${raw}'`);
      if (p.min !== undefined && n < p.min) throw new CatalogUseInputError(field, `${n} is below the minimum ${p.min}`);
      if (p.max !== undefined && n > p.max) throw new CatalogUseInputError(field, `${n} is above the maximum ${p.max}`);
      return n;
    }
    case "color":
      if (!/^#[0-9a-fA-F]{6}$/.test(raw)) throw new CatalogUseInputError(field, `expected a #rrggbb colour, got '${raw}'`);
      return raw;
    case "boolean":
      if (raw === "true") return true;
      if (raw === "false") return false;
      throw new CatalogUseInputError(field, `expected true or false, got '${raw}'`);
    case "enum": {
      const allowed = (p.options ?? []).map((o) => o.value);
      if (!allowed.includes(raw)) throw new CatalogUseInputError(field, `'${raw}' is not one of ${allowed.join(", ")}`);
      return raw;
    }
    default:
      return raw;
  }
}

/**
 * Every declared param, defaults overridden by `--param k=v` (validated
 * against the manifest's type, min / max, enum options, #rrggbb colours).
 */
export function resolveParams(item: CatalogItem, raw: readonly string[]): { values: Record<string, ParamValue>; explicit: Set<string> } {
  const values: Record<string, ParamValue> = Object.fromEntries(item.params.map((p) => [p.id, p.default]));
  const explicit = new Set<string>();
  for (const pair of raw) {
    const eq = pair.indexOf("=");
    if (eq <= 0) throw new CatalogUseInputError("param", `expected key=value, got '${pair}'`);
    const key = pair.slice(0, eq).trim();
    const param = item.params.find((p) => p.id === key);
    if (!param) {
      const known = item.params.map((p) => p.id).join(", ") || "none";
      throw new CatalogUseInputError(`param ${key}`, `${item.id} has no param '${key}' (params: ${known})`);
    }
    values[key] = coerceParam(param, pair.slice(eq + 1));
    explicit.add(key);
  }
  return { values, explicit };
}

/** Validate a value for one param outside `--param` (e.g. `--duration` driving `duration`). */
export function coerceParamValue(item: CatalogItem, id: string, raw: string, field: string): ParamValue {
  const param = item.params.find((p) => p.id === id);
  if (!param) throw new CatalogUseInputError(field, `${item.id} has no param '${id}'`);
  return coerceParam(param, raw, field);
}

// ─── caption word timings ───────────────────────────────────────────────────

export type Word = { text: string; start: number; end: number };

/**
 * Word timings for a caption preset, in seconds from the clip start. Accepts
 * `[{ text, start, end }]` (seconds), `[{ text, startMs, endMs }]`, or an
 * object holding either under `words` / `captions` (`ralphy generate captions`
 * output). Throws a plain Error with a reason on anything else.
 */
export function parseWordTimings(doc: unknown): Word[] {
  const list = Array.isArray(doc)
    ? doc
    : doc && typeof doc === "object"
      ? ((doc as Record<string, unknown>).words ?? (doc as Record<string, unknown>).captions)
      : undefined;
  if (!Array.isArray(list)) throw new Error("expected an array of words, or an object with a words / captions array");
  const words: Word[] = [];
  list.forEach((entry, i) => {
    const w = entry as Record<string, unknown>;
    const text = typeof w?.text === "string" ? w.text.trim() : "";
    const ms = typeof w?.startMs === "number" || typeof w?.endMs === "number";
    const start = ms ? Number(w.startMs) / 1000 : Number(w?.start);
    const end = ms ? Number(w.endMs) / 1000 : Number(w?.end);
    if (!text) throw new Error(`word ${i}: text must be a non-empty string`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
      throw new Error(`word ${i} ('${text}'): needs 0 <= start <= end (seconds, or startMs / endMs)`);
    }
    words.push({ text, start: round3(start), end: round3(end) });
  });
  if (words.length === 0) throw new Error("no words");
  return words.sort((a, b) => a.start - b.start);
}

// ─── reading the host composition ───────────────────────────────────────────

export type ClipInfo = {
  id: string | null;
  tag: string;
  start: number | null;
  duration: number | null;
  track: number | null;
  /** Set on clips `catalog use` inserted (host divs and their SFX <audio>). */
  catalogUse: string | null;
};

export type CompositionInfo = {
  root: { compositionId: string; duration: number | null; width: number | null; height: number | null } | null;
  /** Timed elements inside the root composition (outside <template>), root excluded. */
  clips: ClipInfo[];
  /** Every element id in the document. */
  ids: Set<string>;
  /** Every data-composition-id value in the document (a use's id must be new to both). */
  compositionIds: Set<string>;
};

function num(v: string | null): number | null {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** The root composition (first data-composition-id outside a <template>) and its timed clips. */
export function inspectComposition(html: string): CompositionInfo {
  const info: CompositionInfo = { root: null, clips: [], ids: new Set(), compositionIds: new Set() };
  let templateDepth = 0;
  let inRoot = false;
  new HTMLRewriter()
    .on("*", {
      element(el) {
        const id = el.getAttribute("id");
        if (id) info.ids.add(id);
        const compositionId = el.getAttribute("data-composition-id");
        if (compositionId) info.compositionIds.add(compositionId);
        if (el.tagName === "template") {
          templateDepth += 1;
          el.onEndTag(() => {
            templateDepth -= 1;
          });
          return;
        }
        if (templateDepth > 0) return;
        if (info.root === null && el.hasAttribute("data-composition-id")) {
          info.root = {
            compositionId: el.getAttribute("data-composition-id") ?? "",
            duration: num(el.getAttribute("data-duration")),
            width: num(el.getAttribute("data-width")),
            height: num(el.getAttribute("data-height")),
          };
          inRoot = true;
          el.onEndTag(() => {
            inRoot = false;
          });
          return;
        }
        if (inRoot && el.hasAttribute("data-start")) {
          info.clips.push({
            id,
            tag: el.tagName,
            start: num(el.getAttribute("data-start")),
            duration: num(el.getAttribute("data-duration")),
            track: num(el.getAttribute("data-track-index")),
            catalogUse: el.getAttribute("data-catalog-use"),
          });
        }
      },
    })
    .transform(html);
  return info;
}

/** Composition length: the root data-duration, else the latest known clip end. */
export function compositionLength(info: CompositionInfo): number | null {
  if (info.root?.duration != null && info.root.duration > 0) return info.root.duration;
  let end = 0;
  for (const c of info.clips) if (c.start !== null && c.duration !== null) end = Math.max(end, c.start + c.duration);
  return end > 0 ? end : null;
}

/** Append markup at the end of the root composition element. */
export function insertIntoRoot(html: string, lines: string[]): string {
  const rootId = inspectComposition(html).root?.compositionId;
  if (rootId === undefined) throw new Error("no root composition");
  // Indent like the root's children: the root open tag's line indent + 2.
  const at = html.indexOf(`data-composition-id="${rootId}"`);
  const lineStart = at < 0 ? 0 : html.lastIndexOf("\n", at) + 1;
  const indent = /^[ \t]*/.exec(html.slice(lineStart))?.[0] ?? "";
  const block = lines.map((l) => `  ${l}\n${indent}`).join("");
  let templateDepth = 0;
  let done = false;
  return new HTMLRewriter()
    .on("*", {
      element(el) {
        if (el.tagName === "template") {
          templateDepth += 1;
          el.onEndTag(() => {
            templateDepth -= 1;
          });
          return;
        }
        if (done || templateDepth > 0 || !el.hasAttribute("data-composition-id")) return;
        done = true;
        el.append(block, { html: true });
      },
    })
    .transform(html);
}

// ─── timing ─────────────────────────────────────────────────────────────────

type Interval = { track: number; start: number; end: number; id: string | null };

function intervals(info: CompositionInfo, length: number): Interval[] {
  return info.clips
    .filter((c) => c.start !== null && c.track !== null)
    .map((c) => ({
      track: c.track!,
      start: c.start!,
      // Media without data-duration plays to its own end: assume the composition end.
      end: c.duration !== null ? c.start! + c.duration : length,
      id: c.id,
    }));
}

/** One above every track a non-catalog clip uses (0 for an empty composition). */
export function catalogBaseTrack(info: CompositionInfo): number {
  let max = -1;
  for (const c of info.clips) if (c.catalogUse === null && c.track !== null) max = Math.max(max, c.track);
  return max + 1;
}

function overlapping(list: Interval[], track: number, start: number, end: number): Interval | undefined {
  const eps = 1e-6;
  return list.find((iv) => iv.track === track && iv.start < end - eps && start < iv.end - eps);
}

function firstFreeTrack(list: Interval[], from: number, start: number, end: number): number {
  let track = from;
  while (overlapping(list, track, start, end)) track += 1;
  return track;
}

export type ClipPlan = { start: number; duration: number; end: number; track: number };

/**
 * Where the clip lands. `--at` defaults to the end of the last clip on the
 * target track (0 when that track is empty), so repeated uses append back to
 * back. `--track` defaults to the first track at or above the catalog base
 * track (one above every non-catalog clip) that is free for the clip's window.
 */
export function planClip(input: {
  info: CompositionInfo;
  length: number;
  duration: number;
  at?: number;
  track?: number;
}): ClipPlan {
  const list = intervals(input.info, input.length);
  const base = catalogBaseTrack(input.info);
  const lastEnd = (track: number) => list.filter((iv) => iv.track === track).reduce((m, iv) => Math.max(m, iv.end), 0);
  const start = round3(input.at ?? lastEnd(input.track ?? base));
  const duration = round3(input.duration);
  const end = round3(start + duration);
  if (start >= input.length) {
    throw new CatalogUseInputError(
      "at",
      input.at === undefined
        ? `track ${input.track ?? base} is full up to ${start}s, the composition length (${input.length}s); pass --at or --track`
        : `--at ${start} is past the composition length (${input.length}s)`,
    );
  }
  if (end > input.length + 1e-6) {
    throw new CatalogUseInputError("duration", `the clip [${start}s, ${end}s) ends past the composition length (${input.length}s); pass a shorter --duration or an earlier --at`);
  }
  let track: number;
  if (input.track !== undefined) {
    const clash = overlapping(list, input.track, start, end);
    if (clash) throw new CatalogUseInputError("track", `track ${input.track} already has ${clash.id ?? "a clip"} at [${round3(clash.start)}s, ${round3(clash.end)}s); same-track clips cannot overlap (pass another --track or --at)`);
    track = input.track;
  } else {
    track = firstFreeTrack(list, base, start, end);
  }
  return { start, duration, end, track };
}

/** A free track for the SFX <audio>, above the clip's own track. */
export function planSfxTrack(info: CompositionInfo, length: number, clip: ClipPlan, start: number, end: number): number {
  const list = [...intervals(info, length), { track: clip.track, start: clip.start, end: clip.end, id: null }];
  return firstFreeTrack(list, clip.track + 1, start, end);
}

/** `catalog-<id>-<n>`, the first n free in the document. */
export function nextUseId(info: CompositionInfo, item: CatalogItem): string {
  let n = 1;
  const taken = (id: string) => info.ids.has(id) || info.compositionIds.has(id);
  while (taken(`catalog-${item.id}-${n}`)) n += 1;
  return `catalog-${item.id}-${n}`;
}

// ─── markup ─────────────────────────────────────────────────────────────────

function attrJson(v: unknown): string {
  return JSON.stringify(v).replace(/&/g, "&amp;").replace(/'/g, "&#39;");
}

function attrText(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** The host <div> that loads the sub-composition at the planned time. */
export function clipMarkup(input: {
  useId: string;
  item: CatalogItem;
  src: string;
  clip: ClipPlan;
  values: Record<string, ParamValue>;
  context: Record<string, unknown>;
}): string {
  const vars = { ...input.values, catalogContext: JSON.stringify(input.context) };
  return [
    `<div id="${input.useId}"`,
    // Unique per use: the pinned render compiler scopes each instance by this id.
    `data-composition-id="${input.useId}"`,
    `data-composition-src="${attrText(input.src)}"`,
    `data-start="${input.clip.start}"`,
    `data-duration="${input.clip.duration}"`,
    `data-track-index="${input.clip.track}"`,
    `data-width="${ITEM_WIDTH}" data-height="${ITEM_HEIGHT}"`,
    `data-catalog-item="${input.item.id}" data-catalog-use="${input.useId}"`,
    `data-variable-values='${attrJson(vars)}'`,
    `style="position: absolute; left: 0; top: 0; width: ${ITEM_WIDTH}px; height: ${ITEM_HEIGHT}px; z-index: ${CLIP_Z_INDEX}; pointer-events: none;"></div>`,
  ].join(" ");
}

export function sfxMarkup(input: { useId: string; src: string; start: number; duration: number; track: number; volume: number }): string {
  return `<audio id="${input.useId}-sfx" data-start="${input.start}" data-duration="${input.duration}" data-track-index="${input.track}" src="${attrText(input.src)}" data-volume="${input.volume}" data-catalog-use="${input.useId}"></audio>`;
}

// ─── the sub-composition file ───────────────────────────────────────────────

/** The `catalogContext` keys a kind accepts (host selectors are resolved against the page). */
export const CONTEXT_KEYS: Record<CatalogItem["kind"], readonly string[]> = {
  transition: ["from", "to", "stage"],
  camera: ["target", "subject", "bg", "mid", "fg", "stage"],
  caption: ["words", "stage"],
  element: ["stage"],
  layout: ["stage"],
};

/**
 * The item as a standalone HyperFrames sub-composition. Deterministic in the
 * item and its fragment, so every use of one catalog version shares one copy.
 */
export function buildSubComposition(item: CatalogItem, fragmentHtml: string): string {
  const parts = parseFragment(fragmentHtml);
  if (!parts.js.includes(`function ${item.fn}(`)) {
    throw new Error(`${item.source}: fragment must define function ${item.fn}(tl, o)`);
  }
  const compId = compositionIdFor(item);
  const variables = [
    ...item.params.map((p) => ({ id: p.id, type: p.type, label: p.label, default: p.default, ...(p.options ? { options: p.options } : {}) })),
    { id: "catalogContext", type: "string", label: "Catalog context (JSON, written by ralphy catalog use)", default: "{}" },
  ];
  const defaults = Object.fromEntries(item.params.map((p) => [p.id, p.default]));
  const host = actsOnHost(item);
  const cssKey = `${item.id}@${sha256(parts.css).slice(0, 12)}`;
  const scopedStyle = host || !parts.css ? "" : `\n        <style>\n${parts.css}\n        </style>`;
  const pageStyle = host && parts.css
    ? `
    // This kind restyles host elements (mask-wipe classes the incoming scene),
    // which scoped sub-composition CSS cannot reach: add the CSS to the page once.
    if (!page.querySelector('style[data-catalog-css="${cssKey}"]')) {
      var css = page.createElement("style");
      css.setAttribute("data-catalog-css", "${cssKey}");
      css.textContent = ${JSON.stringify(parts.css).replace(/<\//g, "<\\/")};
      page.head.appendChild(css);
    }`
    : "";
  return `<!doctype html>
<!-- Installed by \`ralphy catalog use\` from catalog/${item.source} (#594).
     A HyperFrames sub-composition: index.html loads it through data-composition-src and
     passes the params plus a catalogContext (host selectors, word timings) in
     data-variable-values. The template has no data-composition-id of its own: each host
     in index.html carries a unique one, so one copy serves any number of uses (the pinned
     render compiler scopes instances by that id and does not rename duplicates).
     \`catalog use\` never overwrites an edited copy; it writes the next ${item.id}.v<N>.html
     instead. -->
<html lang="en" data-composition-variables='${attrJson(variables)}'>
  <body>
    <template id="${compId}-template">${scopedStyle}
      <div class="catalog-layer" style="position: absolute; left: 0; top: 0; width: ${ITEM_WIDTH}px; height: ${ITEM_HEIGHT}px; overflow: hidden;">
${parts.markup}
      </div>
      <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
      <script>
  window.__timelines = window.__timelines || {};
  (function (scoped) {
    var page = window.document;
    // Per-instance values: getVariables() when the runtime offers it, then the
    // host's own data-variable-values (read directly, so a script that runs
    // before the runtime is ready still gets this instance's params).
    var hf = (typeof __hyperframes !== "undefined" && __hyperframes) || window.__hyperframes;
    var vars = hf && typeof hf.getVariables === "function" ? hf.getVariables() : {};
    var layerEl = scoped.querySelector(".catalog-layer");
    var hostEl = layerEl && layerEl.closest ? layerEl.closest("[data-variable-values]") : null;
    try { vars = Object.assign({}, vars, JSON.parse((hostEl && hostEl.getAttribute("data-variable-values")) || "{}")); } catch (e) { /* defaults */ }
    var ctx = {};
    try { ctx = JSON.parse(vars.catalogContext || "{}") || {}; } catch (e) { ctx = {}; }
    // Host selectors (scenes, the camera target) resolve against the whole page;
    // a selector that matches nothing stays a string for the scoped lookup.
    function onPage(sel) { return typeof sel === "string" && sel ? page.querySelector(sel) || sel : null; }
    // Fragments call document.querySelector(o.to); let an element pass through.
    var document = new Proxy(scoped, {
      get: function (target, prop) {
        if (prop === "querySelector" || prop === "querySelectorAll") {
          return function (sel) { return typeof sel === "string" ? target[prop](sel) : prop === "querySelector" ? sel : [sel]; };
        }
        var value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });${pageStyle}
    var tl = gsap.timeline({ paused: true });

    // ---- catalog item: ${item.id} (catalog/${item.source}) ----
${parts.js}

    var o = Object.assign({}, ${JSON.stringify(defaults)}, vars);
    delete o.catalogContext;
    o.at = 0;
    o.layer = layerEl;
    ["from", "to", "target", "subject"].forEach(function (k) { if (ctx[k]) o[k] = onPage(ctx[k]); });
    if (ctx.bg || ctx.mid || ctx.fg) o.layers = { bg: onPage(ctx.bg), mid: onPage(ctx.mid), fg: onPage(ctx.fg) };
    if (ctx.words) o.words = ctx.words;
    o.stage = onPage(ctx.stage) || (o.from && o.from.parentElement) || (o.target && o.target.parentElement) || o.layer;
    ${item.fn}(tl, o);
    // Register under this instance's composition id (the host's), which HyperFrames
    // nests into the root timeline at the host's data-start.
    var compEl = layerEl && layerEl.closest ? layerEl.closest("[data-composition-id]") : null;
    window.__timelines[(compEl && compEl.getAttribute("data-composition-id")) || "${compId}"] = tl;
  })(document);
      </script>
    </template>
  </body>
</html>
`;
}

// ─── append-only file placement ─────────────────────────────────────────────

async function fileSha256(file: string): Promise<string | null> {
  try {
    return sha256(await fs.readFile(file));
  } catch {
    return null;
  }
}

/**
 * Where content with this hash goes: `<base><ext>`, else `<base>.v2<ext>`, ...
 * An existing file with the same bytes is reused; a different one is never
 * touched. Names stay visible (no leading dot) so the #591 project-tree
 * Composition records them as sources.
 */
export async function placeVersioned(dir: string, base: string, ext: string, wanted: string): Promise<{ name: string; action: "write" | "reuse" }> {
  for (let n = 1; n < 10_000; n++) {
    const name = n === 1 ? `${base}${ext}` : `${base}.v${n}${ext}`;
    const have = await fileSha256(path.join(dir, name));
    if (have === null) return { name, action: "write" };
    if (have === wanted) return { name, action: "reuse" };
  }
  throw new Error(`too many versions of ${base}${ext} in ${dir}`);
}

/**
 * The tree-only snapshot of index.html: `compositions/v<N>.html`, append-only.
 * When the newest snapshot already holds these bytes it is reused.
 */
export async function planFileSnapshot(projectDir: string, indexHtml: string): Promise<{ path: string; action: "write" | "reuse" }> {
  const dir = path.join(projectDir, "compositions");
  let max = 0;
  try {
    for (const name of await fs.readdir(dir)) {
      const m = /^v(\d+)\.html$/.exec(name);
      if (m) max = Math.max(max, Number(m[1]));
    }
  } catch {
    /* no compositions/ yet */
  }
  if (max > 0 && (await fileSha256(path.join(dir, `v${max}.html`))) === sha256(indexHtml)) {
    return { path: `compositions/v${max}.html`, action: "reuse" };
  }
  return { path: `compositions/v${max + 1}.html`, action: "write" };
}

/** Write a file that must not exist yet (append-only placement). */
export async function writeNew(file: string, data: string | Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data, { flag: "wx" });
}
