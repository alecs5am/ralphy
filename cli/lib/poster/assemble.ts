// Poster-collage assembler (#598): the pure half of `ralphy editor poster`.
//
// A poster-collage composition is three embedded pieces plus one scenes file:
//   shell.html           page, fonts, CSS for every item class, GSAP and
//                        lottie-web script tags, {{...}} placeholders
//   engine.js            builds every scene from SCENES and registers one
//                        paused GSAP timeline (render-safety notes in its header)
//   oswald700-adv.json   Oswald 700 advance widths, em per character; the
//                        engine fits titles from it synchronously
//   <scenes file>.js     the project's own `const ASSETS = {...}` and
//                        `const SCENES = [...]` (plus any helpers it defines)
//
// The assembler fills the shell in one pass, so text inside the scenes, the
// engine or the Lottie data is never read as a placeholder, and a `$` in it is
// never read as a replacement pattern. It appends OSWALD_ADV and LOTTIE_DATA
// (the parsed JSON of every Lottie the scenes reference, keyed by its ASSETS
// path) to the scenes code, because a `path` load is async and misses early
// frames in parallel render workers.
//
// The scenes file is JavaScript, so it is validated by running it: a fresh
// node:vm context with only COMP_ID and DURATION defined, a short timeout, and
// one appended expression that reads back ASSETS and SCENES. It is the
// project's own file and runs in the render browser anyway; the vm is for
// isolation from the CLI's globals, not a security boundary.
//
// The enumerations the validator checks against (item types, entrance
// presets, icon names, transitions, backgrounds) are read from the embedded
// engine and shell, so they cannot drift from what the engine draws.

import vm from "node:vm";
import engineSource from "./engine.js" with { type: "text" };
import shellSource from "./shell.html" with { type: "text" };
import advanceSource from "./oswald700-adv.json" with { type: "text" };

// `with { type: "text" }` makes Bun (and a compiled binary) hand over the file
// text. The type checker still describes the default loaders (an HTMLBundle
// for .html, the parsed object for .json), hence the casts.
export const POSTER_ENGINE: string = engineSource;
export const POSTER_SHELL: string = shellSource as unknown as string;
/** The advance table as a JSON object literal (ASCII, \u escapes for Cyrillic). */
export const OSWALD_ADVANCE: string = (advanceSource as unknown as string).trim();

export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1920;

/** The fonts the shell declares, as `fonts/<file>`; copied from the licensed catalog fonts (#565). */
export const POSTER_FONTS = [
  { id: "oswald", family: "Oswald", file: "oswald.ttf" },
  { id: "caveat", family: "Caveat", file: "caveat.ttf" },
  { id: "inter", family: "Inter", file: "inter.ttf" },
] as const;

/** The shell placeholders, filled by {@link buildPosterHtml}. */
export const SHELL_PLACEHOLDERS = ["LANG", "TITLE", "COMP_ID", "DURATION", "AUDIO", "DATA", "ENGINE"] as const;
type Placeholder = (typeof SHELL_PLACEHOLDERS)[number];

// ─── engine-derived enumerations ────────────────────────────────────────────

function objectKeys(source: string, opener: string): string[] {
  const start = source.indexOf(opener);
  const end = start < 0 ? -1 : source.indexOf("\n  };", start);
  if (start < 0 || end < 0) throw new Error(`poster engine: block ${opener} not found`);
  return [...source.slice(start + opener.length, end).matchAll(/^ {4}(\w+):/gm)].map((m) => m[1]!);
}

/** Item `type` values build() dispatches on. */
export const ITEM_TYPES: readonly string[] = [...POSTER_ENGINE.matchAll(/T === "(\w+)"/g)].map((m) => m[1]!);
/** Entrance presets for an item's `anim` (plus "none"). */
export const ENTER_PRESETS: readonly string[] = objectKeys(POSTER_ENGINE, "const ENTER = {");
/** Built-in SVG icons (icon `name`, burst `icon`, orbit `icons`, card `badge`). */
export const ICON_NAMES: readonly string[] = objectKeys(POSTER_ENGINE, "const ICONS = {");
/** Scene `enter` transitions; anything else falls back to zoomcut. */
export const SCENE_TRANSITIONS: readonly string[] = ["zoomcut", ...[...POSTER_ENGINE.matchAll(/en === "(\w+)"/g)].map((m) => m[1]!)];
/** Scene `bg` values the shell styles. */
export const BACKGROUNDS: readonly string[] = [...POSTER_SHELL.matchAll(/^\.bg-([a-z]+)\{/gm)].map((m) => m[1]!);
/** Title `reveal` modes: per-letter scatter / drop / type, or a whole-line entrance preset. */
export const TITLE_REVEALS: readonly string[] = ["scatter", "drop", "type", ...ENTER_PRESETS];

/** Item types that hold child items. */
const CONTAINERS = new Set(["group", "paper", "scroll"]);
/** Item types whose element build() returns, so an `id` can name them as a shatter target. */
const SHATTERABLE = new Set(["img", "card", "box", "paper", "group"]);
/** Item types timed per entry (bubble, tile, path) rather than by the item's own `at`. */
const PER_ENTRY_TIMES = new Set(["bubbles", "grid", "arcs"]);

/** Whether the engine reads the item's own `at` (a title whose lines all carry `at` does not; nor does a still group). */
function readsOwnAt(type: string, it: PosterItem): boolean {
  if (PER_ENTRY_TIMES.has(type)) return false;
  if (type === "title") return (it.lines as unknown[]).some((l) => typeof l === "string");
  if (type === "group") return Boolean(it.rays) || (it.anim !== undefined && it.anim !== "none");
  return true;
}

/** Fields the engine reads without a default, per item type. */
const REQUIRED: Record<string, ReadonlyArray<{ field: string; kind: "string" | "number" | "array" }>> = {
  title: [{ field: "lines", kind: "array" }],
  kick: [{ field: "text", kind: "string" }],
  script: [{ field: "text", kind: "string" }],
  stamp: [{ field: "text", kind: "string" }],
  img: [{ field: "src", kind: "string" }],
  lottie: [{ field: "src", kind: "string" }],
  card: [{ field: "src", kind: "string" }],
  icon: [{ field: "name", kind: "string" }],
  bubbles: [{ field: "list", kind: "array" }],
  grid: [{ field: "tiles", kind: "array" }, { field: "cols", kind: "number" }, { field: "cell", kind: "number" }, { field: "gap", kind: "number" }],
  counter: [{ field: "to", kind: "number" }],
  people: [{ field: "n", kind: "number" }, { field: "size", kind: "number" }],
  arcs: [{ field: "paths", kind: "array" }],
  orbit: [{ field: "icons", kind: "array" }, { field: "cx", kind: "number" }, { field: "cy", kind: "number" }, { field: "r", kind: "number" }],
  paper: [{ field: "w", kind: "number" }, { field: "h", kind: "number" }],
  scroll: [{ field: "w", kind: "number" }, { field: "h", kind: "number" }],
};

// ─── scenes file ────────────────────────────────────────────────────────────

/** A defect in the scenes file; the command reports it as E_FILE_MALFORMED. */
export class PosterScenesError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "PosterScenesError";
  }
}

export type PosterItem = Record<string, unknown> & { type?: unknown };
export type PosterScene = Record<string, unknown> & { t?: unknown; items?: unknown };
export type PosterScenes = { assets: Record<string, string>; scenes: PosterScene[] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Run the scenes file and read back ASSETS and SCENES. COMP_ID and DURATION
 * are defined first, as in the page. Throws PosterScenesError when the code
 * fails or either constant is missing or has the wrong shape.
 */
export function evaluateScenes(code: string, globals: { compositionId: string; duration: number }): PosterScenes {
  const probe = `\n;({ ASSETS: typeof ASSETS === "undefined" ? undefined : ASSETS, SCENES: typeof SCENES === "undefined" ? undefined : SCENES });\n`;
  let result: unknown;
  try {
    result = vm.runInNewContext(code + probe, { COMP_ID: globals.compositionId, DURATION: globals.duration }, { timeout: 2000, filename: "scenes.js" });
  } catch (e) {
    throw new PosterScenesError(`the scenes code failed to run: ${String((e as Error)?.message ?? e).slice(0, 300)}`);
  }
  const { ASSETS, SCENES } = (result ?? {}) as { ASSETS?: unknown; SCENES?: unknown };
  if (ASSETS === undefined) throw new PosterScenesError("ASSETS is not defined (expected `const ASSETS = { key: \"artifacts/...\" }`)");
  if (SCENES === undefined) throw new PosterScenesError("SCENES is not defined (expected `const SCENES = [{ t: 0, items: [...] }, ...]`)");
  if (!isObject(ASSETS)) throw new PosterScenesError("ASSETS must be an object of key -> project-relative path");
  for (const [key, value] of Object.entries(ASSETS)) {
    if (typeof value !== "string" || value.length === 0) throw new PosterScenesError(`ASSETS.${key} must be a non-empty path string`);
  }
  if (!Array.isArray(SCENES) || SCENES.length === 0) throw new PosterScenesError("SCENES must be a non-empty array");
  return { assets: ASSETS as Record<string, string>, scenes: SCENES as PosterScene[] };
}

/** One ASSETS entry the scenes use, and where. */
export type AssetUse = { key: string; path: string | null; uses: string[] };

export type ScenesCheck = {
  sceneCount: number;
  itemCount: number;
  /** Every ASSETS key the scenes use (src fields, plus `paper` when a paper background or sheet shows it). */
  referenced: AssetUse[];
  /** ASSETS keys the scenes never use. */
  unused: string[];
  /** Keys of the referenced assets that lottie items load. */
  lottieKeys: string[];
  warnings: string[];
};

function where(scene: number, t: unknown, chain: string[]): string {
  return `scene ${scene} (t=${typeof t === "number" ? t : "?"})${chain.length ? " " + chain.join(" > ") : ""}`;
}

/**
 * Check SCENES against the engine: known item types, the fields the engine
 * reads without a default, icon names, ascending scene times. Structural
 * defects throw PosterScenesError; silently ignored values (an unknown
 * background, transition or entrance, a shatter target that is not there)
 * are warnings. Asset existence is the caller's job (it needs the disk).
 */
export function checkScenes(parsed: PosterScenes, opts: { duration: number }): ScenesCheck {
  const { assets, scenes } = parsed;
  const warnings: string[] = [];
  const uses = new Map<string, string[]>();
  const lottieKeys = new Set<string>();
  let itemCount = 0;
  let paperShown = false;
  const use = (key: unknown, at: string, field: string) => {
    if (typeof key !== "string" || key.length === 0) throw new PosterScenesError(`${at}: ${field} must be an ASSETS key`);
    const list = uses.get(key) ?? [];
    list.push(at);
    uses.set(key, list);
  };
  const icon = (name: unknown, at: string, field: string) => {
    if (typeof name !== "string" || !ICON_NAMES.includes(name)) {
      throw new PosterScenesError(`${at}: ${field} '${String(name)}' is not a built-in icon (${ICON_NAMES.join(", ")})`);
    }
  };

  const time = (v: unknown, at: string, field: string) => {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new PosterScenesError(`${at}: ${field} must be a number of seconds`);
  };
  // The engine defaults `at` only for scene-level items; a nested item without
  // one would land at the end of the timeline built so far.
  const visit = (items: unknown, scene: number, t: unknown, chain: string[], ids: Map<string, string>) => {
    if (items === undefined) return;
    const nested = chain.length > 0;
    if (!Array.isArray(items)) throw new PosterScenesError(`${where(scene, t, chain)}: items must be an array`);
    items.forEach((raw, index) => {
      const label = `item ${index + 1}`;
      if (!isObject(raw)) throw new PosterScenesError(`${where(scene, t, [...chain, label])}: an item must be an object`);
      const it = raw as PosterItem;
      const type = typeof it.type === "string" ? it.type : "";
      const here = [...chain, `${label} (${type || "?"})`];
      const at = where(scene, t, here);
      itemCount++;
      if (!ITEM_TYPES.includes(type)) throw new PosterScenesError(`${at}: unknown type '${String(it.type)}' (${ITEM_TYPES.join(", ")})`);
      for (const req of REQUIRED[type] ?? []) {
        const v = it[req.field];
        const okKind = req.kind === "array" ? Array.isArray(v) && v.length > 0 : req.kind === "number" ? typeof v === "number" && Number.isFinite(v) : typeof v === "string";
        if (!okKind) throw new PosterScenesError(`${at}: ${req.field} must be ${req.kind === "array" ? "a non-empty array" : `a ${req.kind}`}`);
      }
      if (it.at !== undefined || (nested && readsOwnAt(type, it))) time(it.at, at, nested && it.at === undefined ? "at (required inside a group, paper or scroll)" : "at");
      if (it.anim !== undefined && it.anim !== "none" && !ENTER_PRESETS.includes(String(it.anim))) {
        warnings.push(`${at}: anim '${String(it.anim)}' is not an entrance preset (${ENTER_PRESETS.join(", ")}, none); it has no entrance`);
      }
      if (type === "title") {
        (it.lines as unknown[]).forEach((line, k) => {
          const text = typeof line === "string" ? line : isObject(line) ? line.t : undefined;
          if (typeof text !== "string" || text.length === 0) throw new PosterScenesError(`${at}: lines[${k}] must be a string or { t, at }`);
          if (isObject(line)) time(line.at, at, `lines[${k}].at`);
        });
        if (it.reveal !== undefined && !TITLE_REVEALS.includes(String(it.reveal))) {
          warnings.push(`${at}: reveal '${String(it.reveal)}' is unknown (${TITLE_REVEALS.join(", ")}); it falls back to slam`);
        }
      }
      if (type === "img" || type === "lottie" || type === "card") use(it.src, at, "src");
      if (type === "lottie") lottieKeys.add(String(it.src));
      if (type === "grid") {
        (it.tiles as unknown[]).forEach((tile, k) => {
          if (!isObject(tile)) throw new PosterScenesError(`${at}: tiles[${k}] must be an object`);
          use(tile.src, at, `tiles[${k}].src`);
          time(tile.at, at, `tiles[${k}].at`);
        });
      }
      if (type === "bubbles") {
        (it.list as unknown[]).forEach((b, k) => {
          if (!isObject(b) || typeof b.text !== "string") throw new PosterScenesError(`${at}: list[${k}].text must be a string`);
          time(b.at, at, `list[${k}].at`);
        });
      }
      if (type === "arcs") {
        (it.paths as unknown[]).forEach((p, k) => {
          if (!isObject(p) || typeof p.d !== "string") throw new PosterScenesError(`${at}: paths[${k}].d must be an SVG path string`);
          time(p.at, at, `paths[${k}].at`);
        });
      }
      if (type === "icon") icon(it.name, at, "name");
      if (type === "burst" && it.icon !== undefined) icon(it.icon, at, "icon");
      if (type === "card" && it.badge !== undefined) icon(it.badge, at, "badge");
      if (type === "orbit") (it.icons as unknown[]).forEach((n, k) => icon(n, at, `icons[${k}]`));
      if (type === "paper") paperShown = true;
      if (typeof it.id === "string" && SHATTERABLE.has(type)) ids.set(it.id, type);
      if (CONTAINERS.has(type)) visit(it.items, scene, t, here, ids);
    });
  };

  let previous = -Infinity;
  scenes.forEach((raw, i) => {
    const n = i + 1;
    if (!isObject(raw)) throw new PosterScenesError(`scene ${n}: a scene must be an object`);
    const s = raw as PosterScene;
    if (typeof s.t !== "number" || !Number.isFinite(s.t) || s.t < 0) throw new PosterScenesError(`scene ${n}: t must be a non-negative number of seconds`);
    if (s.t < previous) throw new PosterScenesError(`scene ${n} (t=${s.t}): SCENES must be sorted by t (the previous scene starts at ${previous})`);
    if (i === 0 && s.t !== 0) warnings.push(`scene 1 starts at ${s.t}s; the frames before it are empty`);
    if (s.t >= opts.duration) warnings.push(`scene ${n} starts at ${s.t}s, at or past the ${opts.duration}s duration; it never shows`);
    previous = s.t;
    if (s.bg !== undefined && !BACKGROUNDS.includes(String(s.bg))) {
      warnings.push(`scene ${n}: bg '${String(s.bg)}' is not a shell background (${BACKGROUNDS.join(", ")}); the scene is transparent`);
    }
    if (s.bg === "paper" || s.bg === "white") paperShown = true;
    if (s.enter !== undefined && !SCENE_TRANSITIONS.includes(String(s.enter))) {
      warnings.push(`scene ${n}: enter '${String(s.enter)}' is unknown (${SCENE_TRANSITIONS.join(", ")}); it falls back to zoomcut`);
    }
    for (const field of ["shake", "punch", "flash"] as const) {
      const v = s[field];
      if (v !== undefined && (!Array.isArray(v) || v.some((x) => typeof x !== "number"))) throw new PosterScenesError(`scene ${n}: ${field} must be an array of times in seconds`);
    }
    const ids = new Map<string, string>();
    visit(s.items, n, s.t, [], ids);
    if (s.shatter !== undefined) {
      if (!Array.isArray(s.shatter)) throw new PosterScenesError(`scene ${n}: shatter must be an array of { target, at }`);
      for (const sh of s.shatter) {
        if (!isObject(sh) || typeof sh.at !== "number") throw new PosterScenesError(`scene ${n}: shatter entries need { target, at }`);
        if (typeof sh.target !== "string" || !ids.has(sh.target)) {
          warnings.push(`scene ${n}: shatter target '${String(sh.target)}' is not the id of an img, card, box, paper or group in this scene; skipped`);
        }
      }
    }
  });

  if (paperShown && typeof assets.paper === "string") {
    const list = uses.get("paper") ?? [];
    list.push("paper background / sheet texture");
    uses.set("paper", list);
  }
  const referenced: AssetUse[] = [...uses.entries()]
    .map(([key, at]) => ({ key, path: Object.prototype.hasOwnProperty.call(assets, key) ? assets[key]! : null, uses: at }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const unused = Object.keys(assets).filter((k) => !uses.has(k)).sort();
  return { sceneCount: scenes.length, itemCount, referenced, unused, lottieKeys: [...lottieKeys].sort(), warnings };
}

// ─── HTML ───────────────────────────────────────────────────────────────────

/** Seconds as the shell writes them (millisecond precision, no trailing zeros). */
export function formatSeconds(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** JSON safe inside an inline <script>: `<` is escaped, so no `</script>` or `<!--` can appear. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** Fill every {{NAME}} of the shell in one pass; an unknown or missing placeholder is a bug. */
export function fillShell(shell: string, values: Record<Placeholder, string>): string {
  return shell.replace(/\{\{([A-Z_]+)\}\}/g, (_m, key: string) => {
    if (!(SHELL_PLACEHOLDERS as readonly string[]).includes(key)) throw new Error(`poster shell: unknown placeholder {{${key}}}`);
    return values[key as Placeholder];
  });
}

export type PosterHtmlInput = {
  /** The scenes file as written (defines ASSETS and SCENES). */
  scenesSource: string;
  /** ASSETS path -> parsed Lottie JSON, for the referenced Lottie files only. */
  lottie: Record<string, unknown>;
  compositionId: string;
  duration: number;
  lang: string;
  title: string;
  /** Project-relative audio source for the single <audio> track. */
  audioSrc: string;
};

/** The assembled index.html (the build.py port). */
export function buildPosterHtml(input: PosterHtmlInput): string {
  if (/<\/script/i.test(input.scenesSource)) {
    throw new PosterScenesError("the scenes code contains `</script`, which would end the inline script early; split the string (e.g. \"<\" + \"/script\")");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(input.compositionId)) throw new Error(`poster: composition id '${input.compositionId}' must match [A-Za-z0-9_-]+`);
  const duration = formatSeconds(input.duration);
  const data =
    input.scenesSource +
    "\nconst OSWALD_ADV = " + OSWALD_ADVANCE + ";\n" +
    "\nconst LOTTIE_DATA = " + scriptJson(input.lottie) + ";\n";
  const audio =
    `  <audio id="track" data-start="0" data-duration="${duration}" data-track-index="1" ` +
    `data-volume="1" src="${escapeHtml(input.audioSrc)}"></audio>`;
  return fillShell(POSTER_SHELL, {
    LANG: escapeHtml(input.lang),
    TITLE: escapeHtml(input.title),
    COMP_ID: input.compositionId,
    DURATION: duration,
    AUDIO: audio,
    DATA: data,
    ENGINE: POSTER_ENGINE,
  });
}
