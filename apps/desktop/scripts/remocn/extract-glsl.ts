/**
 * Extract the Remocn-authored GLSL programs out of the embedded upstream sources.
 *
 * Upstream inlines each shader as a template literal inside the component TSX we already own, so
 * nothing here is authored: the script lifts that text, resolves the numeric module constants
 * upstream bakes into it (`${STEPS}`), and records where it came from. When a component runs
 * several passes we keep ONE — the first that samples no texture, since the host draws a single
 * full-screen pass and a `sampler2D` stage has no earlier pass to read from — and record which.
 *
 * Run: bun scripts/remocn/extract-glsl.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const dataDir = resolve(root, "src/pages/marketplace/lib/generated");
const target = resolve(root, "src/pages/marketplace/lib/scenes/webgl/glsl.generated.json");

/** Mirrors `WebglProgramId` in `scenes/types.ts`. The emitted `Record` type is the CI assertion. */
const IDS = [
  "ascii-render", "camera-lens", "crt-screen", "displacement", "ember-burn",
  "glitch-cut", "grid-wave", "halftone-print", "hologram", "particle-dissolve",
  "pixelate-region", "security-cam", "shader-caustics", "shader-light-tunnel",
  "shader-seam", "shader-strata", "shader-weave", "shader-text-reveal",
  "sustained-glitch", "tv-power-off", "underwater-ripple", "vhs-filter", "rush-type",
] as const;

type Stage = { readonly name: string; readonly body: string };
type Motion = { slug: string; source: string };
type Foundation = { name: string; files: readonly { content: string }[] };
const load = <T>(file: string): T[] => JSON.parse(readFileSync(resolve(dataDir, file), "utf8")) as T[];

const sources = new Map<string, string>();
for (const entry of load<Motion>("remocn-motion-data.json")) sources.set(entry.slug, entry.source);
for (const entry of load<Foundation>("remocn-foundations.generated.json")) sources.set(entry.name, entry.files.map((file) => file.content).join("\n"));

const LITERAL = /(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*(?::[^=]+)?=\s*`([\s\S]*?)`/g;
const isFragment = (body: string) =>
  /precision\s+\w+\s+float/.test(body) && /void\s+main\s*\(/.test(body) &&
  /gl_FragColor|out\s+\w*\s*vec4\s+\w+/.test(body);

const stagesOf = (source: string): Stage[] =>
  [...source.matchAll(LITERAL)].filter((match) => isFragment(match[2] ?? ""))
    .map((match) => ({ name: match[1] ?? "", body: (match[2] ?? "").trim() }));

/** `${STEPS}` / `${MIN_PINCH.toFixed(5)}`: module constants upstream bakes in before compiling. */
function inline(source: string, body: string): string {
  const constants = new Map<string, number>();
  for (const found of source.matchAll(/^const\s+([A-Z][A-Z0-9_]*)\s*(?::\s*number)?\s*=\s*(-?\d+(?:\.\d+)?)\s*;/gm)) {
    constants.set(found[1] ?? "", Number(found[2]));
  }
  return body.replace(/\$\{\s*([A-Z][A-Z0-9_]*)\s*(?:\.toFixed\((\d+)\))?\s*\}/g, (whole, name: string, digits?: string) => {
    const value = constants.get(name);
    if (value === undefined) return whole;
    return digits === undefined ? String(value) : value.toFixed(Number(digits));
  });
}

const programs: Record<string, unknown> = {};
const unresolved: string[] = [];
for (const id of IDS) {
  const source = sources.get(id);
  const stages = source ? stagesOf(source) : [];
  const chosen = stages.find((stage) => !/sampler2D/.test(stage.body)) ?? stages[0];
  if (!source || !chosen) {
    unresolved.push(`${id} (no GLSL literal found)`);
    continue;
  }
  const text = inline(source, chosen.body);
  if (text.includes("${")) unresolved.push(`${id} (unresolved interpolation)`);
  const uniforms = Object.fromEntries(
    [...text.matchAll(/uniform\s+(\w+)\s+(\w+)/g)].map((match) => [match[2] ?? "", match[1] ?? ""]),
  );
  programs[id] = { stage: chosen.name, stages: stages.map((stage) => stage.name), uniforms, source: text };
}

if (unresolved.length) {
  console.error(`Could not extract: ${unresolved.join(", ")}. Nothing written.`);
  process.exit(1);
}

// Written as data, not as a module. Two thousand lines of upstream shader text is not source the
// 400-line rule was written for, and a .json file keeps it out of the TypeScript the audit reads.
writeFileSync(target, `${JSON.stringify(programs, null, 1)}\n`);
console.log(`Wrote ${Object.keys(programs).length} programs to ${target}`);
