/**
 * The scene registry: 17 shard modules merged into one id -> spec map, plus the accessors the
 * preview, the artifact and the still baker all share.
 *
 * Shard modules are islands. Nothing here knows what any individual component looks like, and a
 * shard never imports another shard, so 17 authors can work without touching a common file.
 */
import sharedCss from "./shared.css?raw";
import type { SceneContext, SceneSpec } from "./types";
import { chrome, resolvePalette, runSeconds, sceneContext, stage, stillFraction } from "./shared";

import { aiSocial } from "./ai-social";
import { effects } from "./effects";
import { filters } from "./filters";
import { shadersA } from "./shaders-a";
import { shadersB } from "./shaders-b";
import { templatesCraftComp } from "./templates-craft-comp";
import { transitionsA } from "./transitions-a";
import { transitionsB } from "./transitions-b";
import { typographyA1 } from "./typography-a1";
import { typographyA2 } from "./typography-a2";
import { typographyB1 } from "./typography-b1";
import { typographyB2 } from "./typography-b2";
import { uiA1 } from "./ui-a1";
import { uiA2 } from "./ui-a2";
import { uiB1 } from "./ui-b1";
import { uiB2 } from "./ui-b2";
import { uiBlocksLayout } from "./ui-blocks-layout";

import aiSocialCss from "./ai-social.css?raw";
import effectsCss from "./effects.css?raw";
import filtersCss from "./filters.css?raw";
import shadersACss from "./shaders-a.css?raw";
import shadersBCss from "./shaders-b.css?raw";
import templatesCraftCompCss from "./templates-craft-comp.css?raw";
import transitionsACss from "./transitions-a.css?raw";
import transitionsBCss from "./transitions-b.css?raw";
import typographyA1Css from "./typography-a1.css?raw";
import typographyA2Css from "./typography-a2.css?raw";
import typographyB1Css from "./typography-b1.css?raw";
import typographyB2Css from "./typography-b2.css?raw";
import uiA1Css from "./ui-a1.css?raw";
import uiA2Css from "./ui-a2.css?raw";
import uiB1Css from "./ui-b1.css?raw";
import uiB2Css from "./ui-b2.css?raw";
import uiBlocksLayoutCss from "./ui-blocks-layout.css?raw";

const shards: readonly (readonly SceneSpec[])[] = [
  typographyA1, typographyA2, typographyB1, typographyB2,
  uiA1, uiA2, uiB1, uiB2, uiBlocksLayout,
  transitionsA, transitionsB, shadersA, shadersB,
  filters, effects, aiSocial, templatesCraftComp,
];

const shardCss: readonly string[] = [
  typographyA1Css, typographyA2Css, typographyB1Css, typographyB2Css,
  uiA1Css, uiA2Css, uiB1Css, uiB2Css, uiBlocksLayoutCss,
  transitionsACss, transitionsBCss, shadersACss, shadersBCss,
  filtersCss, effectsCss, aiSocialCss, templatesCraftCompCss,
];

const registry = new Map<string, SceneSpec>();
for (const shard of shards) for (const spec of shard) registry.set(spec.id, spec);

/** Every ported component, in registry order. */
export const allScenes = (): readonly SceneSpec[] => [...registry.values()];

/** The spec for an upstream slug (motion) or name (foundations), or undefined if not yet ported. */
export const sceneFor = (id: string | undefined): SceneSpec | undefined => (id ? registry.get(id) : undefined);

/** Mechanism CSS plus every shard's rules. Loaded once by the preview and inlined in an artifact. */
export const sceneShardCss = (): string => [sharedCss, ...shardCss].join("\n");

/**
 * Just one component's rules, for an exported artifact. Shard CSS carries `@scene <id>` / `@end`
 * markers so a single block can be lifted without a second source of truth.
 */
const ruleCache = new Map<string, string>();
export function sceneRules(id: string): string {
  const cached = ruleCache.get(id);
  if (cached !== undefined) return cached;
  const opening = `/* @scene ${id} */`;
  let found = "";
  for (const css of shardCss) {
    const start = css.indexOf(opening);
    if (start < 0) continue;
    const end = css.indexOf("/* @end */", start);
    found = css.slice(start + opening.length, end < 0 ? undefined : end).trim();
    break;
  }
  ruleCache.set(id, found);
  return found;
}

export type SceneRenderOptions = {
  title: string;
  summary: string;
  format: SceneContext["format"];
  base?: string;
};

/**
 * The class list every renderer must put on the scene root.
 *
 * `rv-c-<id>` is the one that matters: a shard's rules are all scoped to it, so a scene's CSS can
 * never reach another component. The group and legacy scene classes stay beside it because older
 * selectors and tests still name them.
 */
export const sceneRootClass = (spec: SceneSpec, scene?: string): string =>
  ["rv-scene", `rv-${spec.group}`, scene ? `rv-${scene}` : "", `rv-c-${spec.id}`].filter(Boolean).join(" ");

/** The complete inner HTML of `.rv-scene`: the stage a shard authored, plus the shared chrome. */
export function sceneMarkup(spec: SceneSpec, options: SceneRenderOptions): string {
  const context = sceneContext(spec, { title: options.title, format: options.format, base: options.base });
  const body = spec.markup(context, spec.params);
  return `${body.includes("rv-stage") ? body : stage(body)}${chrome(spec, options.summary)}`;
}

/** The custom properties that drive the clock, the stage and the palette. */
export function sceneStyleVariables(spec: SceneSpec, settings?: Record<string, unknown>): Record<string, string | number> {
  const bounded = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  const motion = spec.motion;
  const variables: Record<string, string | number> = {
    "--rv-speed": bounded(settings?.speed, 1, 0.5, 2),
    "--rv-cycle": `${motion.kind === "static" ? 1 : motion.seconds}s`,
    "--rv-hold": `${motion.kind === "cycle" ? motion.hold : 0}s`,
    "--rv-still": stillFraction(spec),
    "--rv-stage-wn": spec.stage.w,
    "--rv-stage-hn": spec.stage.h,
    "--rv-font-scale": bounded(settings?.fontScale, 1, 0.7, 1.25),
    "--rv-font-weight": Math.round(bounded(settings?.fontWeight, 600, 300, 800) / 100) * 100,
  };
  if (motion.kind !== "static" && motion.extra) {
    for (const [key, seconds] of Object.entries(motion.extra)) variables[`--rv-run-${key}`] = `calc(${seconds}s / var(--rv-speed))`;
  }
  for (const [key, value] of Object.entries(resolvePalette(spec, settings))) variables[`--p-${key}`] = value;
  return variables;
}

export { runSeconds, stillFraction };
export type { SceneSpec, SceneContext };
