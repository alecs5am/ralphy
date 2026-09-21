/* Scene CSS lint -- `bun scripts/lint-remocn-scenes.ts [--shard <name>]`
 *
 * The 17 `src/pages/marketplace/lib/scenes/<shard>.css` sheets are hand-authored and escape both
 * existing audits: `audit-architecture.mjs` collects only `.ts`/`.tsx` and `audit-style-hygiene.mjs`
 * walks only `src/app/styles`. This is that missing gate; it exits 1 with file:line per violation.
 * The load-bearing rule is `bare-duration`: every scene is seeked by pausing its animations at a
 * negative delay over one shared `--rv-run`, so a literal `1.2s` forks the clock and the frozen
 * card, the baked still and the live loop stop agreeing on which frame they show.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { SceneSpec } from "../src/pages/marketplace/lib/scenes/types";

const DIR = "src/pages/marketplace/lib/scenes";
const MAX_BLOCK = 60, MAX_FILE = 900;
const NAMED = "black|white|red|blue|green|yellow|gray|grey|silver|gold|orange|purple|pink|cyan|magenta|navy|teal|lime|olive|maroon|aqua|fuchsia|crimson|indigo|violet|coral|salmon";
// A named colour is only a colour when it stands alone: `one-red-shift` is an @keyframes name,
// not `red`, so the word boundary has to exclude a neighbouring hyphen as well as a letter.
const COLOUR = new RegExp(`#[0-9a-f]{3,8}\\b|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\\s*\\(|(?<![\\w-])(?:${NAMED})(?![\\w-])`, "i");
const TIME = /(?:^|[\s,(])(?:\d+\.?\d*|\.\d+)m?s\b/i;
const CQ = /\b[\d.]+cq(?:w|h|i|b|min|max)\b/i;

const only = process.argv.includes("--shard") ? process.argv[process.argv.indexOf("--shard") + 1] : undefined;
/** Rule 10 needs a stylesheet engine. Under bun/node there is none, so it is skipped, never failed. */
const dom = typeof CSS !== "undefined" && typeof CSS.supports === "function";

/** The specs export, found by shape: a shard may export helper arrays beside its scene list. */
const isSpecs = (value: unknown): value is SceneSpec[] =>
  Array.isArray(value) && value.every((s) => typeof (s as SceneSpec | undefined)?.id === "string" && typeof (s as SceneSpec).shard === "string");

type Finding = { file: string; line: number; rule: string; scene: string; hit: string; fix: string };
const found: Finding[] = [];
const fail = (file: string, line: number, rule: string, scene: string, hit: string, fix: string) => void found.push({ file, line, rule, scene, hit, fix });

/** One located declaration. `motion` is the spec's, so a static scene can be held to zero animations. */
function checkDecl(file: string, id: string, line: number, prop: string, value: string, motion?: SceneSpec["motion"]) {
  const bare = value.replace(/(["']).*?\1|url\([^)]*\)/g, "");
  // Custom-property NAMES are stripped before the colour and unit scans: `var(--p-gold)` names a
  // palette entry, it does not write a colour. A `var(--x, #fff)` fallback is still caught.
  const scan = bare.replace(/var\(\s*--[\w-]+/g, "var(");
  const timed = prop === "animation" || prop === "animation-duration";
  if (prop.startsWith("animation")) {
    if (motion?.kind === "static") fail(file, line, "static-animated", id, `${prop}: ${value}`, `Its spec declares motion { kind: "static" }, which asserts zero animation declarations. Drop this declaration, or give the spec a { kind: "loop" } / { kind: "cycle" } motion in ${id}'s shard .ts.`);
    if (prop === "animation-play-state") fail(file, line, "play-state", id, `${prop}: ${value}`, `shared.css owns pausing: \`.rv-scene:not([data-playing="true"]) * { animation-play-state: paused !important }\`. Setting it here is either a no-op or an attempt to defeat the freeze. Remove it.`);
    const literal = timed ? TIME.exec(bare) : null;
    if (literal) fail(file, line, "bare-duration", id, literal[0].trim(), `A literal duration forks the clock, so the frozen card, the baked still and the live loop stop showing the same frame. Write var(--rv-run), or var(--rv-run-<key>) after declaring <key> in the spec's motion.extra, or a calc() over them -- e.g. calc(var(--rv-run) * 0.25).`);
    if (timed && !/var\(\s*--rv-run/.test(bare)) fail(file, line, "no-run-var", id, `${prop}: ${value}`, `Every animation states its duration as var(--rv-run), var(--rv-run-<key>), or a calc() over them. Without one it has no duration and the scene never seeks. The shard form is: animation: ${id}-<name> var(--rv-run) linear infinite both;`);
    if (prop === "animation-delay" && !/var\(\s*--rv-seek\s*\)/.test(bare)) fail(file, line, "no-seek", id, `${prop}: ${value}`, `Seeking is animation-delay: var(--rv-seek). Without it this element ignores --rv-t and parks at frame 0 while the rest of the scene sits at its still. For a stagger write calc(var(--rv-seek) + var(--rv-own)) and emit --rv-own from the markup with at(index, ms).`);
  }
  const colour = COLOUR.exec(scan);
  if (colour) fail(file, line, "colour-literal", id, colour[0], `Scene CSS may not write a colour. Add it to "${id}"'s palette map in its shard .ts and read it here as var(--p-<key>) -- that is what lets the Customize panel and the paint engines see the same value. Only transparent, currentColor and inherit are allowed bare.`);
  const unit = CQ.exec(scan);
  if (unit) fail(file, line, "cq-unit", id, unit[0], `The reference stage owns scaling: 1em inside .rv-stage is exactly one authored stage pixel (spec.stage). Rewrite ${unit[0]} in em; for a font-size use calc(var(--rv-u) * N), never em.`);
  if (dom && !prop.startsWith("--") && !value.includes("var(") && !CSS.supports(prop, value)) fail(file, line, "unsupported", id, `${prop}: ${value}`, `CSS.supports() rejects this declaration, so the browser drops it silently. Check the property spelling and the value syntax.`);
}

/** Walk one `@scene` body: selectors, `@keyframes` names and declarations, with real line numbers. */
function checkBlock(file: string, id: string, body: string, startLine: number, motion?: SceneSpec["motion"]) {
  const prefix = `.rv-c-${id}`;
  const stack: { kf: boolean; scoped: boolean }[] = [];
  const top = () => stack[stack.length - 1] ?? { kf: false, scoped: false };
  let buf = "", line = startLine, at = startLine;
  const flush = () => {
    const text = buf.trim(), colon = text.indexOf(":");
    buf = "";
    if (colon > 0) checkDecl(file, id, at, text.slice(0, colon).trim().toLowerCase(), text.slice(colon + 1).trim(), motion);
  };
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === "/" && body[i + 1] === "*") {
      const end = body.indexOf("*/", i + 2) < 0 ? body.length : body.indexOf("*/", i + 2) + 2;
      line += (body.slice(i, end).match(/\n/g) ?? []).length;
      i = end - 1;
    } else if (ch === '"' || ch === "'") {
      const close = body.indexOf(ch, i + 1);
      if (!buf.trim()) at = line;
      buf += body.slice(i, (close < 0 ? body.length : close) + 1);
      i = close < 0 ? body.length : close;
    } else if (ch === "{") {
      const prelude = buf.trim();
      buf = "";
      const head = /^@(?:-\w+-)?keyframes\b/i.exec(prelude);
      if (head) {
        const name = prelude.slice(head[0].length).trim();
        if (name !== id && !name.startsWith(`${id}-`)) fail(file, at, "keyframes-global", id, `@keyframes ${name}`, `@keyframes names are global once the 17 shard sheets are concatenated, so two scenes naming the same animation silently overwrite one another -- exactly the "every card looks like its neighbour" bug this port exists to fix. Prefix it with the scene id: @keyframes ${id}-${name}.`);
        stack.push({ kf: true, scoped: true });
      } else if (prelude.startsWith("@")) {
        stack.push({ ...top() });
      } else {
        if (!top().kf && !top().scoped) for (const part of prelude.split(",").map((p) => p.trim()).filter(Boolean)) if (!part.startsWith(prefix) || /^[-\w]/.test(part.slice(prefix.length))) fail(file, at, "scene-scope", id, part, `Every selector in a scene block starts with ${prefix}, so a scene can never reach another component's markup. Prefix it -- "${prefix} ${part}" -- or nest it inside a ${prefix} rule.`);
        stack.push({ kf: top().kf, scoped: true });
      }
      at = line;
    } else if (ch === "}" || ch === ";") { flush(); if (ch === "}") stack.pop(); at = line; }
    else {
      if (ch === "\n") line += 1;
      if (!buf.trim()) at = line;
      buf += ch === "\n" ? " " : ch;
    }
  }
}

const app = process.cwd();
const shards = readdirSync(join(app, DIR)).filter((n) => n.endsWith(".css") && n !== "shared.css").map((n) => n.slice(0, -4)).sort();
const targets = only ? shards.filter((s) => s === only) : shards;
if (only && targets.length === 0) { console.error(`lint-remocn-scenes: unknown shard "${only}". Known shards: ${shards.join(", ")}`); process.exit(2); }

for (const shard of targets) {
  const file = `${DIR}/${shard}.css`;
  const css = readFileSync(join(app, file), "utf8");
  const total = css.trimEnd().split("\n").length;
  const lineAt = (index: number) => css.slice(0, index).split("\n").length;
  if (total > MAX_FILE) fail(file, total, "shard-too-long", "", `${total} lines`, `A shard CSS file is capped at ${MAX_FILE} lines so a bug can still be found by reading. Move scenes to another shard, or tighten the longest blocks.`);

  let specs: readonly SceneSpec[] = [];
  try {
    specs = Object.values((await import(join(app, DIR, `${shard}.ts`))) as Record<string, unknown>).find(isSpecs) ?? [];
  } catch (error) { fail(`${DIR}/${shard}.ts`, 1, "shard-unreadable", "", String(error), `The lint reads scene ids by importing the shard module. Make it import cleanly under bun -- no Vite-only specifiers such as "?raw".`); continue; }
  for (const spec of specs) if (spec.shard !== shard) fail(`${DIR}/${shard}.ts`, 1, "shard-mismatch", spec.id, `shard: "${spec.shard}"`, `This spec lives in ${shard}.ts but declares shard "${spec.shard}". Move the spec and its CSS block to ${spec.shard}, or correct the field.`);

  const blocks: { id: string; line: number; end: number; from: number; to: number }[] = [];
  let open: { id: string; line: number; from: number } | null = null;
  for (const marker of css.matchAll(/\/\*\s*@(?:scene\s+(\S+)|end)\s*\*\//g)) {
    const index = marker.index ?? 0, line = lineAt(index);
    if (marker[1]) {
      if (open) fail(file, open.line, "scene-unclosed", open.id, `/* @scene ${open.id} */`, `This block is never closed: the next marker opens "${marker[1]}". Add "/* @end */" after the last rule of "${open.id}" -- sceneRules() slices between the two markers to export one component on its own.`);
      open = { id: marker[1], line, from: index + marker[0].length };
    } else if (open) {
      blocks.push({ id: open.id, line: open.line, end: line, from: open.from, to: index });
      open = null;
    } else {
      fail(file, line, "stray-end", "", "/* @end */", `An "/* @end */" with no open "/* @scene <id> */" above it. Remove it, or add the opening marker.`);
    }
  }
  if (open) fail(file, open.line, "scene-unclosed", open.id, `/* @scene ${open.id} */`, `This block is never closed. Add "/* @end */" after the last rule of "${open.id}".`);

  // Blank the scene bodies and the comments in place (offsets stay valid): any brace left over is a
  // rule outside every block, which is unscoped and cannot be lifted out by sceneRules().
  let outside = css.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));
  for (const b of blocks) outside = outside.slice(0, b.from) + " ".repeat(b.to - b.from) + outside.slice(b.to);
  const loose = outside.indexOf("{");
  if (loose >= 0) fail(file, lineAt(loose), "outside-scene", "", css.slice(Math.max(0, loose - 48), loose + 1).split("\n").pop()!.trim(), `Every rule lives inside a "/* @scene <id> */ ... /* @end */" block. A rule outside one is unscoped and cannot be exported by sceneRules(). Move it into the owning scene's block.`);

  const ids = specs.map((s) => s.id);
  const seen = new Set<string>();
  for (const block of blocks) {
    if (seen.has(block.id)) fail(file, block.line, "scene-duplicate", block.id, `/* @scene ${block.id} */`, `"${block.id}" already has a block above. A scene has exactly one block; sceneRules() takes the first and the rest is dead CSS. Merge them.`);
    seen.add(block.id);
    if (!ids.includes(block.id)) fail(file, block.line, "scene-unknown", block.id, `/* @scene ${block.id} */`, `No spec with id "${block.id}" is exported from ${shard}.ts. The id is the upstream slug (motion) or name (foundations), verbatim. Fix the spelling, add the spec, or delete the block.`);
    if (!css.slice(block.from, block.to).includes("{")) fail(file, block.line, "scene-empty", block.id, `/* @scene ${block.id} */`, `The block holds no rules, so "${block.id}" renders unstyled markup. Author its rules, starting with .rv-c-${block.id}.`);
    if (block.end - block.line + 1 > MAX_BLOCK) fail(file, block.line, "scene-too-long", block.id, `${block.end - block.line + 1} lines`, `A scene block is capped at ${MAX_BLOCK} lines, marker to marker. Push repeated geometry into the markup as inline custom properties -- see at() and cells() in shared.ts -- instead of writing one rule per element.`);
  }
  for (const spec of specs) if (!seen.has(spec.id)) fail(file, total, "scene-missing", spec.id, `no /* @scene ${spec.id} */`, `${shard}.ts exports a spec with id "${spec.id}" but this sheet has no block for it, so the scene renders unstyled. Add "/* @scene ${spec.id} */ ... /* @end */" in spec order.`);

  const actual = blocks.map((b) => b.id).filter((id) => ids.includes(id));
  const expected = ids.filter((id) => seen.has(id));
  const wrong = actual.findIndex((id, index) => id !== expected[index]);
  if (wrong >= 0) fail(file, blocks.find((b) => b.id === actual[wrong])?.line ?? 1, "scene-order", actual[wrong], `/* @scene ${actual[wrong]} */`, `Blocks run in spec order so the sheet reads beside ${shard}.ts. Expected "${expected[wrong]}" here. Full order: ${expected.join(", ")}.`);

  for (const b of blocks) checkBlock(file, b.id, css.slice(b.from, b.to), b.line, specs.find((s) => s.id === b.id)?.motion);
}

for (const f of found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule))) console.log(`${f.file}:${f.line}  [${f.rule}]${f.scene ? ` scene "${f.scene}"` : ""}\n    ${f.hit}\n    ${f.fix}\n`);
console.log(`${found.length || "no"} violation(s) in ${targets.length} shard(s); CSS.supports ${dom ? "checked (DOM available)" : "skipped (no DOM in this runtime)"}.`);
process.exit(found.length ? 1 : 0);
