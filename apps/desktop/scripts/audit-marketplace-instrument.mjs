import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const legacyTokens = /var\(--(?:canvas|sunken|panel|panel-solid|raised|hover|selected|pressed|fg(?:-[234])?|accent(?:-soft|-fill|-line)?|ok|warn|line(?:-strong)?|field-[a-z-]+)\)/g;
const bannedEffects = /\b(?:box-shadow|backdrop-filter|-webkit-backdrop-filter)\s*:|(?:linear|radial|conic)-gradient\s*\(/g;
const colorLiteral = /#[0-9a-f]{3,8}\b/gi;

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? sourceFiles(join(directory, entry.name))
    : [join(directory, entry.name)]));
  return nested.flat().filter((file) => [".ts", ".tsx", ".css"].includes(extname(file)));
}

function matches(source, pattern, rule, file) {
  return [...source.matchAll(pattern)].map((match) => ({ file, rule, value: match[0] }));
}

export async function auditMarketplaceInstrument(base = root) {
  const files = [...await sourceFiles(join(base, "src/pages/marketplace")), join(base, "src/app/styles/marketplace.css")];
  const violations = [];
  for (const absolute of files) {
    const file = relative(base, absolute);
    const source = await readFile(absolute, "utf8");
    violations.push(...matches(source, colorLiteral, "raw-color", file));
    violations.push(...matches(source, bannedEffects, "depth-effect", file));
    violations.push(...matches(source, legacyTokens, "legacy-token", file));
    if (/from ["']@radix-ui\/react-dialog["']|\bcreatePortal\s*\(|<Dialog\./.test(source)) violations.push({ file, rule: "raw-overlay", value: "Use InstrumentOverlay" });
  }

  const [screen, workflows, header, css] = await Promise.all([
    readFile(join(base, "src/pages/marketplace/ui/MarketplaceScreen.tsx"), "utf8"),
    readFile(join(base, "src/pages/marketplace/ui/MarketplaceWorkflows.tsx"), "utf8"),
    readFile(join(base, "src/pages/marketplace/ui/MarketplaceHeader.tsx"), "utf8"),
    readFile(join(base, "src/app/styles/marketplace.css"), "utf8"),
  ]);
  if (!screen.includes("<InstrumentScreenRoot")) violations.push({ file: "src/pages/marketplace/ui/MarketplaceScreen.tsx", rule: "missing-root", value: "InstrumentScreenRoot" });
  if (!workflows.includes('id="target-chooser"')) violations.push({ file: "src/pages/marketplace/ui/MarketplaceWorkflows.tsx", rule: "missing-overlay", value: "target-chooser" });
  if (!header.includes('overlayOwner="marketplace.header"')) violations.push({ file: "src/pages/marketplace/ui/MarketplaceHeader.tsx", rule: "missing-overlay-owner", value: "marketplace.header" });
  if (!css.includes("@media (prefers-reduced-motion: reduce)")) violations.push({ file: "src/app/styles/marketplace.css", rule: "missing-reduced-motion", value: "prefers-reduced-motion" });
  return { files: files.map((file) => relative(base, file)).sort(), violations };
}

if (import.meta.main) {
  const result = await auditMarketplaceInstrument(root);
  if (result.violations.length) {
    for (const violation of result.violations) console.error(`${violation.file}: ${violation.rule}: ${violation.value}`);
    process.exitCode = 1;
  } else {
    console.log(`MARKETPLACE_INSTRUMENT_AUDIT_OK ${result.files.length}`);
  }
}
