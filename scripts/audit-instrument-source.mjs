import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(".");
const mockMarkers = [
  "mock-review", "TEST REVIEW SESSION · NOT SAVED", "ux-review-artifact-1", "ux-review-iteration-3",
  "mock-needs-work-fixture", "instrument-test-fixture", "ux-mock-render-1", "dynamic-island-mock",
];

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else files.push(path);
  }
  return files;
}

export async function auditInstrumentSource({ productionDist = resolve(root, "dist") } = {}) {
  const violations = [];
  const sourceFiles = (await filesUnder(resolve(root, "src"))).filter((path) => [".ts", ".tsx", ".css"].includes(extname(path)));
  for (const path of sourceFiles) {
    const text = await readFile(path, "utf8");
    const name = relative(root, path);
    if (name !== "src/shared/instrument/palette.ts" && name !== "src/app/styles/tokens.css" && /#[\da-f]{3,8}\b/i.test(text)) violations.push(`${name}: direct color literal`);
    if (text.includes('from "@radix-ui/react-dialog"') && name !== "src/shared/instrument/overlay-registry.tsx" && !text.includes("data-instrument-overlay")) violations.push(`${name}: raw dialog lacks Instrument registry marker`);
  }
  const main = await readFile(resolve(root, "src/app/main.tsx"), "utf8");
  const styleImports = [...main.matchAll(/import "\.\/styles\/[^\"]+";/g)].map((match) => match[0]);
  if (styleImports.at(-1) !== 'import "./styles/tailwind.css";') violations.push("src/main.tsx: Tailwind utilities must load last");
  const overlays = await readFile(resolve(root, "src/shared/instrument/overlay-registry.tsx"), "utf8");
  const scenarios = await readFile(resolve(root, "src/shared/instrument/production-screen-states.ts"), "utf8");
  for (const id of [...overlays.matchAll(/^\s*"([\w.-]+)": \{ kind:/gm)].map((match) => match[1])) {
    if (!scenarios.includes(`"${id}"`) && !new Set(["shared-select-menu", "workspace-picker", "agent-chat-recent-menu", "agent-chat-provider-menu", "agent-chat-model-menu", "agent-chat-mode-menu"]).has(id)) violations.push(`overlay ${id}: missing production registration`);
  }
  try {
    const production = await Promise.all((await filesUnder(productionDist)).map((path) => readFile(path).catch(() => Buffer.alloc(0))));
    const joined = Buffer.concat(production).toString("utf8");
    for (const marker of mockMarkers) if (joined.includes(marker)) violations.push(`production bundle contains ${marker}`);
  } catch { violations.push("production dist is missing"); }
  return { files: sourceFiles.map((path) => relative(root, path)), violations };
}

if (import.meta.main) {
  const result = await auditInstrumentSource();
  if (result.violations.length) throw new Error(result.violations.join("\n"));
  console.log(`INSTRUMENT_SOURCE_AUDIT_OK ${result.files.length}`);
}
