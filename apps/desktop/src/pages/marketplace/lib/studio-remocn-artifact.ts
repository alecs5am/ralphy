/**
 * The standalone HyperFrames document exported for one Remocn scene.
 *
 * One builder replaces the two ad-hoc templates the Remocn catalogs carried. The document is the
 * scene itself rather than a stand-in for it: `shared.css` and the scene's own rules are inlined
 * verbatim, so the card, the detail view and the export are the same declarations at three sizes.
 *
 * It renders with JavaScript disabled — the CSS clock plays the scene as an infinite loop. The
 * script only adds seeking for a host that wants a frame-accurate scrub.
 */
import licenseNotice from "./generated/remocn-foundations.MIT.txt?raw";
import { runSeconds, sceneMarkup, sceneRules, sceneStyleVariables, sceneRootClass } from "./scenes";
import { esc } from "./scenes/shared";
import sharedCss from "./scenes/shared.css?raw";
import type { SceneContext, SceneSpec } from "./scenes/types";

export interface RemocnArtifactOptions {
  /** Catalog entry id, emitted as `data-remocn-id`. Defaults to the scene id. */
  readonly id?: string;
  readonly title: string;
  readonly summary: string;
  readonly format?: SceneContext["format"];
  /** Upstream group, emitted as `data-remocn-adapter`. Defaults to `spec.group`. */
  readonly adapter?: string;
  /** Pinned upstream blob URL for the component this scene was read from. */
  readonly reference: string;
  /** Path of that file inside the upstream repository. */
  readonly sourcePath: string;
  readonly dependencies?: readonly string[];
  readonly registryDependencies?: readonly string[];
  /** The entry's settings: they drive the clock, the palette overrides and the provenance block. */
  readonly settings?: Record<string, unknown>;
  /** Prefix for scene assets. Absolute in an export, since there is no app `BASE_URL` here. */
  readonly assetBase?: string;
}

/** `.rv-scene` needs one positioned, sized ancestor; it paints `--p-bg` across it, so no colour here. */
const HOST_CSS = "html,body{margin:0;height:100%}.rv-host{position:relative;width:100vw;height:100vh;overflow:hidden}";

const NOTE = "Independent CSS reimplementation. The upstream Remocn code is reference input, not executed here.";

/**
 * CSS comments are documentation for the shard author, not payload for every exported document.
 * A comment separates the tokens around it, so it collapses to a space and not to nothing: a
 * shorthand whose two values are divided only by a comment has to stay two values.
 */
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s*\n\s*/g, "\n").trim();

/** `--` ends an HTML comment, so it never survives into one. */
const comment = (text: string) => text.replace(/--+/g, "-");

const inlineStyle = (variables: Record<string, string | number>) =>
  Object.entries(variables).map(([key, value]) => `${key}:${value}`).join(";");

/** JSON safe to drop between tags: no `<` survives to open one. */
const jsonBlock = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c");

/**
 * Seeking, and nothing else. `--rv-t` is the only thing that moves: every scene rule already reads
 * it through `--rv-seek`, so one property write repositions the whole scene.
 */
const seekScript = (run: number) => `<script>
(() => {
  const root = document.querySelector(".rv-scene");
  if (!root) return;
  const run = ${run};
  window.__hfSeek = (t) => root.style.setProperty("--rv-t", String(t));
  // A seek only reads true once the CSS clock is parked: a paused animation at a negative delay IS
  // the frame at --rv-t, but a running one has already moved past it.
  const park = () => { root.dataset.playing = "false"; };
  const cursor = { t: 0 };
  const clock = window.gsap
    ? window.gsap.timeline({ paused: true, onUpdate: () => { park(); window.__hfSeek(cursor.t); } })
        .to(cursor, { t: 1, duration: run, ease: "none" })
    : root.animate([{ opacity: 1 }, { opacity: 1 }], { duration: run * 1000, easing: "linear", fill: "both" });
  if (!window.gsap) clock.pause();
  window.__hfClock = clock;
  window.__hfScrub = (t) => {
    if (window.gsap) { clock.time(t * run); return; }
    clock.currentTime = t * run * 1000;
    park();
    window.__hfSeek(t);
  };
})();
</script>`;

/**
 * A paint engine needs the desktop host (a canvas 2D field, a WebGL program or a paper shader), and
 * none of those exist in a single file. Such a document is the scene's frozen still frame plus, when
 * the component ships one, the upstream-authored no-WebGL fallback that `shared.css` reveals on its
 * own because `data-gl` is never set here.
 */
function paintNotice(spec: SceneSpec): string {
  const paint = spec.paint;
  if (!paint) return "";
  const fallback = paint.engine === "webgl" && paint.fallback ? ` plus the upstream-authored ${paint.fallback} content` : "";
  return `\n<!-- Paint engine "${paint.engine}" needs the desktop host, which a standalone document has no way to run.
This is the frozen still frame at the scene's own still point${comment(fallback)}. -->`;
}

/** The complete exported document for one scene. Synchronous and pure: same spec, same bytes. */
export function remocnSceneArtifact(spec: SceneSpec, options: RemocnArtifactOptions): string {
  const format = options.format ?? "portrait";
  const variables = sceneStyleVariables(spec, options.settings);
  const markup = sceneMarkup(spec, { title: options.title, summary: options.summary, format, base: options.assetBase });
  const provenance = jsonBlock({
    component: spec.id,
    group: spec.group,
    settings: options.settings ?? spec.params,
    dependencies: options.dependencies ?? [],
    registryDependencies: options.registryDependencies ?? [],
    upstream: options.reference,
    sourcePath: options.sourcePath,
    note: NOTE,
  });
  const attributes = [
    `data-remocn-id="${esc(options.id ?? spec.id)}"`,
    `data-remocn-scene="${esc(spec.id)}"`,
    `data-remocn-adapter="${esc(options.adapter ?? spec.group)}"`,
    `data-format="${format}"`,
    // A paint scene has nothing to play without its host, so it parks; everything else loops.
    `data-playing="${spec.paint ? "false" : "true"}"`,
  ].join(" ");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(options.title)} · Remocn</title>
<style>${strip(sharedCss)}
${strip(sceneRules(spec.id))}
${HOST_CSS}</style></head>
<body><main class="rv-host"><div class="${sceneRootClass(spec)}" ${attributes} style="${inlineStyle(variables)}">${markup}</div></main>
<template id="remocn-license">${esc(licenseNotice)}</template>
<script type="application/json" id="remocn-source">${provenance}</script>
${seekScript(runSeconds(spec) / (Number(variables["--rv-speed"]) || 1))}${paintNotice(spec)}
<!-- Remocn · MIT — local license: /explore/remocn/motion/LICENSE
Source: ${comment(options.reference)}
Upstream path: ${comment(options.sourcePath)}
${NOTE} -->
</body></html>`;
}

const cache = new Map<string, { options: string; document: string }>();
/**
 * Memoised per id. The catalog hangs this off a lazy `artifact` getter, so opening one card never
 * builds the other two hundred documents.
 *
 * The entry also remembers which options produced it, because every one of them reaches the bytes:
 * a settings change in the Customize panel has to re-export, not hand back the previous document.
 * One entry per id keeps the table bounded while a slider is being dragged.
 */
export function remocnSceneArtifactFor(spec: SceneSpec, options: RemocnArtifactOptions): string {
  const key = options.id ?? spec.id;
  const signature = JSON.stringify(options);
  const hit = cache.get(key);
  if (hit && hit.options === signature) return hit.document;
  const document = remocnSceneArtifact(spec, options);
  cache.set(key, { options: signature, document });
  return document;
}
