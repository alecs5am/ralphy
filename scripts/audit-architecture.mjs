// Architecture audit: the layout rules from AGENTS.md, as a check rather than a suggestion.
//
// A convention nobody can run is a convention that decays. Everything here is mechanical --
// which layer may import which, which imports address a slice's public API, where relative
// paths are allowed, how long a file may get, and which values a class string may hard-code --
// so a change that breaks a rule fails before review rather than after.
//
// Exit code 1 on any violation. `--json` prints the raw findings.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const SRC = "src";

/** Import direction: a layer may reach only the layers below it. */
const LAYERS = ["shared", "entities", "features", "widgets", "pages", "app"];
/** Layers whose direct children are slices. `app` and `shared` hold segments directly. */
const SLICED = new Set(["pages", "widgets", "features", "entities"]);
/** The segments a slice may hold, plus its public API. */
const SEGMENTS = new Set(["ui", "model", "lib", "api"]);
/** How long a file may get before it stops being readable in one sitting. */
const MAX_LINES = Number(process.env.ARCH_MAX_LINES ?? 400);
/**
 * The two files the limit is measured against but not enforced on yet, with the reason. Each
 * one is a split still to do, not a file that has earned an exemption -- delete the entry when
 * the split lands. Nothing may be added here.
 */
const OVERSIZE_DEBT = {};
/**
 * What the renderer may read from outside `src/`.
 *
 * `shared/` at the repo root exists for exactly this: code both the main process and the
 * renderer run. `package.json` is where the app version comes from. An `electron/<area>/types`
 * module is the IPC contract itself, so the renderer reads it whole -- a bound the two sides
 * have to agree on is part of that contract, not a type. Everything else under `electron/` is
 * main-process code and may only be imported for its types, except the two named helpers: pure
 * prompt and parse functions both sides run, which would otherwise be a second copy. A third
 * entry here is a signal that the helper belongs in `shared/`, not a precedent.
 */
const OUTSIDE_SRC_ALLOWED = [
  /^shared\//,
  /^package\.json$/,
  /^electron\/[a-z-]+\/types$/,
  /^electron\/agent\/title$/,
  /^electron\/agent\/context-page$/,
];

const findings = [];
const report = (rule, file, detail, line) => findings.push({ rule, file, detail, line });

function files(dir, out = []) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files(path, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** `pages/project`, `shared`, `app` -- the unit that moves together. */
function sliceOf(path) {
  const parts = path.replace(/^src\//, "").split("/");
  return SLICED.has(parts[0]) ? `${parts[0]}/${parts[1]}` : parts[0];
}
const layerOf = (path) => path.replace(/^src\//, "").split("/")[0];

const SPECIFIER = /(?:from\s*|import\s*\(|import\s+|require\()(["'])((?:@\/|\.\.?\/)[^"']+)\1/g;

/**
 * Whether the import ending here erases at build time. A multi-line `import type { … }` puts the
 * specifier on the closing line, so the statement has to be read from its own `import` keyword
 * rather than from the line the path happens to sit on.
 */
function typeOnly(source, index) {
  const head = source.lastIndexOf("import", index);
  if (head === -1) return false;
  const statement = source.slice(head, index);
  if (/^import\s+type\b/.test(statement)) return true;
  const braces = /\{([^}]*)\}/.exec(statement);
  return Boolean(braces) && braces[1].split(",").filter((part) => part.trim()).every((part) => /^type\s/.test(part.trim()));
}

// --- layout --------------------------------------------------------------------------------
for (const entry of readdirSync(join(ROOT, SRC), { withFileTypes: true })) {
  if (entry.name.startsWith(".")) continue;
  if (!entry.isDirectory()) { report("layout", `${SRC}/${entry.name}`, "src/ holds layers only, not files"); continue; }
  if (!LAYERS.includes(entry.name)) report("layout", `${SRC}/${entry.name}`, `not a layer; expected one of ${LAYERS.join(", ")}`);
}
for (const layer of LAYERS.filter((name) => SLICED.has(name))) {
  for (const slice of readdirSync(join(ROOT, SRC, layer), { withFileTypes: true })) {
    if (!slice.isDirectory()) { report("layout", `${SRC}/${layer}/${slice.name}`, "a sliced layer holds slices only"); continue; }
    const children = readdirSync(join(ROOT, SRC, layer, slice.name));
    if (!children.includes("index.ts")) report("public-api", `${SRC}/${layer}/${slice.name}`, "slice has no index.ts public API");
    for (const child of children) {
      if (child === "index.ts") continue;
      if (!SEGMENTS.has(child)) report("segments", `${SRC}/${layer}/${slice.name}/${child}`, `not a segment; expected ${[...SEGMENTS].join(", ")}`);
    }
  }
}

// --- per-file ------------------------------------------------------------------------------
for (const file of files(SRC)) {
  const source = readFileSync(join(ROOT, file), "utf8");
  const lines = source.split("\n");

  const budget = OVERSIZE_DEBT[file] ?? MAX_LINES;
  if (lines.length > budget) report("file-size", file, `${lines.length} lines over the ${budget} limit`);

  const fileLayer = layerOf(file);
  const fileSlice = sliceOf(file);
  const rank = LAYERS.indexOf(fileLayer);

  for (const match of source.matchAll(SPECIFIER)) {
    const specifier = match[2];
    const line = source.slice(0, match.index).split("\n").length;
    const targetPath = specifier.startsWith("@/")
      ? `src/${specifier.slice(2)}`
      : relative(ROOT, resolve(ROOT, dirname(file), specifier));
    if (!targetPath.startsWith("src/")) {
      if (!OUTSIDE_SRC_ALLOWED.some((pattern) => pattern.test(targetPath)) && !typeOnly(source, match.index))
        report("outside-src", file, `reaches ${specifier}, which is neither a type nor shared code`, line);
      continue;
    }
    const targetLayer = layerOf(targetPath);
    const targetSlice = sliceOf(targetPath);
    const targetRank = LAYERS.indexOf(targetLayer);

    if (targetSlice === fileSlice) {
      if (specifier.startsWith("@/")) report("alias", file, `${specifier} stays inside ${fileSlice}; use a relative path`, line);
      continue;
    }
    if (!specifier.startsWith("@/")) report("alias", file, `${specifier} leaves ${fileSlice}; use the @/ alias`, line);
    if (targetRank === -1) { report("layout", file, `imports ${specifier}, which is in no layer`, line); continue; }
    if (targetRank === rank) report("slice-isolation", file, `${fileSlice} imports sibling slice ${targetSlice}`, line);
    else if (targetRank > rank) report("layer-order", file, `${fileLayer} imports upward from ${targetLayer} (${specifier})`, line);
    else if (SLICED.has(targetLayer) && specifier.replace("@/", "").split("/").length > 2)
      report("public-api", file, `${specifier} reaches inside ${targetSlice}; import the slice`, line);
  }

  // --- magic values in class strings --------------------------------------------------------
  lines.forEach((text, index) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(text)) return;
    for (const [, utility] of text.matchAll(/(?:^|[\s"'`{])(z-\d+)(?=[\s"'`}]|$)/g))
      report("magic-value", file, `${utility}: stacking is a --z-* token, never a bare number`, index + 1);
    for (const [, utility] of text.matchAll(/(?:^|[\s"'`{])((?:-?[a-z@][\w-]*:)*-?[a-z][a-z-]*-\[(?:-?[\d.]+(?:px|rem|em|s|ms|deg)|calc\()[^\]]*\])/g))
      report("magic-value", file, `${utility}: a literal length or duration belongs in a token`, index + 1);
  });
}

// --- output --------------------------------------------------------------------------------
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(findings, null, 2));
} else {
  const order = ["layout", "layer-order", "slice-isolation", "public-api", "alias", "segments", "outside-src", "file-size", "magic-value"];
  for (const rule of order) {
    const group = findings.filter((finding) => finding.rule === rule);
    console.log(`\n## ${rule} (${group.length})`);
    if (!group.length) { console.log("none"); continue; }
    for (const finding of group) console.log(`  ${finding.file}${finding.line ? `:${finding.line}` : ""} — ${finding.detail}`);
  }
  console.log(`\n${findings.length} violation${findings.length === 1 ? "" : "s"}`);
}
process.exit(findings.length ? 1 : 0);
