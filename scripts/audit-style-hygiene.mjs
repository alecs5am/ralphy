// Style hygiene audit: reports raw values that duplicate a design token and stylesheets
// grown past the point where a bug can be located by reading.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const STYLE_DIR = join(ROOT, "src/styles");
const MAX_LINES = Number(process.env.STYLE_MAX_LINES ?? 700);

// Properties whose values the token layer already owns, and the token family that owns
// them. Matching is per-family so a 12px radius never "matches" a 12px font-size token.
const TOKENISED = {
  "border-radius": "radius",
  "transition-duration": "duration",
  "animation-duration": "duration",
  "z-index": "layer",
  "font-family": "font",
  "font-size": "text",
};
const FAMILY = {
  radius: /^--radius-/,
  duration: /^--dur/,
  layer: /^--z-/,
  font: /^--font-/,
  text: /^--text-/,
};

function tokenValues() {
  const source = readFileSync(join(STYLE_DIR, "tokens.css"), "utf8");
  const families = Object.fromEntries(Object.keys(FAMILY).map((key) => [key, new Map()]));
  for (const [, name, value] of source.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    const trimmed = value.trim();
    for (const [family, pattern] of Object.entries(FAMILY)) {
      if (pattern.test(name) && !families[family].has(trimmed)) families[family].set(trimmed, name);
    }
  }
  return families;
}

function declarations(source) {
  const out = [];
  let line = 1;
  for (const part of source.split("\n")) {
    for (const [, prop, value] of part.matchAll(/([-a-z]+)\s*:\s*([^;{}]+)[;}]?/g)) {
      out.push({ line, prop: prop.trim(), value: value.trim() });
    }
    line += 1;
  }
  return out;
}

const tokens = tokenValues();
function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function stylesheets(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return stylesheets(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}
const files = stylesheets(STYLE_DIR).sort();
const findings = [];
const oversized = [];

for (const path of files) {
  const name = relative(STYLE_DIR, path);
  const source = readFileSync(path, "utf8");
  const lines = source.split("\n").length;
  if (lines > MAX_LINES) oversized.push({ file: relative(ROOT, path), lines });
  if (name === "tokens.css") continue;
  const exempt = new Set(source.split("\n").flatMap((text, index) => text.includes("raw-value:") ? [index + 2] : []));
  for (const { line, prop, value } of declarations(source)) {
    const kind = TOKENISED[prop];
    if (!kind) continue;
    if (value.includes("var(") || value === "inherit" || value === "0" || value === "none") continue;
    // Local stacking inside one component is ordering, not a design decision. Layer
    // tokens are required from --z-header (20) upward.
    if (kind === "layer" && Number(value) < 20) continue;
    // A motion reset and relative/derived sizes are not scale values.
    if (kind === "duration" && /^0m?s$/.test(value.replace(/\s*!important$/, ""))) continue;
    if (/(?:\d(?:em|rem|ch|%)|max\(|min\(|clamp\()/.test(value)) continue;
    // Tailwind's functional-utility syntax names a theme namespace, not a value.
    if (value.startsWith("--value(")) continue;
    // Explicitly reviewed content or illustration geometry.
    if (exempt.has(line) || exempt.has(line - 1)) continue;
    const token = tokens[kind]?.get(value) ?? null;
    findings.push({ file: relative(ROOT, path), line, prop, value, kind, token: token ?? null });
  }
}

const duplicated = findings.filter(({ token }) => token);
const untokenised = findings.filter(({ token }) => !token);

console.log(`# Style hygiene\n`);
console.log(`Stylesheets: ${files.length} · declarations audited: ${findings.length}\n`);
console.log(`## Oversized stylesheets (> ${MAX_LINES} lines)`);
if (oversized.length === 0) console.log("none\n");
else for (const { file, lines } of oversized.sort((a, b) => b.lines - a.lines)) console.log(`  ${lines.toString().padStart(5)}  ${file}`);
console.log(`\n## Raw values that duplicate an existing token (${duplicated.length})`);
const byToken = new Map();
for (const finding of duplicated) {
  const key = `${finding.prop}: ${finding.value} -> var(${finding.token})`;
  byToken.set(key, (byToken.get(key) ?? 0) + 1);
}
for (const [key, count] of [...byToken].sort((a, b) => b[1] - a[1])) console.log(`  ${count.toString().padStart(4)}  ${key}`);
console.log(`\n## Raw values with no matching token (${untokenised.length})`);
const byValue = new Map();
for (const finding of untokenised) {
  const key = `${finding.prop}: ${finding.value}`;
  byValue.set(key, (byValue.get(key) ?? 0) + 1);
}
for (const [key, count] of [...byValue].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${count.toString().padStart(4)}  ${key}`);
if (process.env.STYLE_AUDIT_SITES === "1") {
  console.log("\n## Sites");
  for (const { file, line, prop, value } of [...duplicated, ...untokenised]) console.log(`  ${file}:${line}  ${prop}: ${value}`);
}

const defined = new Set([...readFileSync(join(STYLE_DIR, "tokens.css"), "utf8").matchAll(/(--[\w-]+):/g)].map(([, name]) => name));
const themed = new Set([...readFileSync(join(STYLE_DIR, "tailwind.css"), "utf8").matchAll(/(--[\w-]+):/g)].map(([, name]) => name));
// Locally-scoped custom properties are legitimate as long as something assigns them:
// a rule in any stylesheet, or an inline style in a component.
const assigned = new Set(files.flatMap((path) => [...readFileSync(path, "utf8").matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name)));
for (const path of sources(join(ROOT, "src"))) {
  for (const [, name] of readFileSync(path, "utf8").matchAll(/"(--[\w-]+)"\s*:/g)) assigned.add(name);
}
const dangling = new Map();
for (const path of files) {
  for (const [, name] of readFileSync(path, "utf8").matchAll(/var\((--[\w-]+)/g)) {
    if (defined.has(name) || themed.has(name) || assigned.has(name) || name.startsWith("--radix-")) continue;
    dangling.set(name, (dangling.get(name) ?? 0) + 1);
  }
}
console.log(`\n## Undefined tokens referenced (${dangling.size})`);
if (dangling.size === 0) console.log("none");
else for (const [name, count] of [...dangling].sort((a, b) => b[1] - a[1])) console.log(`  ${count.toString().padStart(4)}  var(${name})`);

// Components: arbitrary values for a scale the tokens already name, and rules unreachable from
// any component. Both are how a stylesheet stops describing what renders.
const SCALED = /(?:^|[\s"'`:])(?:[a-z-]+:)*(text|rounded|tracking)-\[([^\]]+)\]/g;
const arbitrary = new Map();
for (const path of sources(join(ROOT, "src"))) {
  const source = readFileSync(path, "utf8");
  for (const [, kind, value] of source.matchAll(SCALED)) {
    if (/^(?:var|calc|min|max|clamp)\(/.test(value)) continue;
    const key = `${kind}-[${value}]`;
    arbitrary.set(key, (arbitrary.get(key) ?? 0) + 1);
  }
}
console.log(`\n## Component values that bypass a named scale (${[...arbitrary.values()].reduce((sum, n) => sum + n, 0)})`);
if (arbitrary.size === 0) console.log("none");
else for (const [key, count] of [...arbitrary].sort((a, b) => b[1] - a[1])) console.log(`  ${count.toString().padStart(4)}  ${key}`);

// A component builds some class names at runtime, so every interpolated prefix keeps its family
// alive; a rule whose every compound names a dead class can never match anything.
const componentSource = sources(join(ROOT, "src")).map((path) => readFileSync(path, "utf8")).join("\n");
const words = new Set([...componentSource.matchAll(/[\w-]+/g)].map(([word]) => word));
const prefixes = [...new Set([...componentSource.matchAll(/([a-z][\w-]*-)\$\{/g)].map(([, prefix]) => prefix))];
const liveClass = (name) => words.has(name) || prefixes.some((prefix) => name.startsWith(prefix));
const compoundDead = (group) => {
  const compounds = group.replace(/:(?:has|is|where|not)\([^)]*\)/g, "").split(/[\s>+~]+/).filter(Boolean);
  let sawClass = false;
  for (const compound of compounds) {
    const names = [...compound.matchAll(/\.([a-z][\w-]*)/g)].map(([, name]) => name);
    if (names.length === 0) continue;
    sawClass = true;
    if (names.some((name) => !liveClass(name))) return true;
  }
  return sawClass ? false : false;
};
const unreachable = [];
for (const path of files) {
  const source = readFileSync(path, "utf8");
  for (const [, selector] of source.matchAll(/(?:^|\})\s*([^{}@][^{}]*?)\s*\{/gm)) {
    const groups = selector.split(",").map((group) => group.trim()).filter(Boolean);
    if (groups.length > 0 && groups.every(compoundDead)) unreachable.push(`${relative(ROOT, path)}  ${selector.replace(/\s+/g, " ").trim()}`);
  }
}
console.log(`\n## Rules no component can reach (${unreachable.length})`);
if (unreachable.length === 0) console.log("none");
else for (const row of unreachable.slice(0, 30)) console.log(`  ${row}`);

const failed = oversized.length > 0 || duplicated.length > 0 || dangling.size > 0
  || arbitrary.size > 0 || unreachable.length > 0;
if (process.env.STYLE_AUDIT_STRICT === "1" && failed) process.exit(1);
