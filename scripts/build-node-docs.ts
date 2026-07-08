#!/usr/bin/env tsx
// scripts/build-node-docs.ts — #524
//
// Generates the workflow-node reference under docs-mintlify/reference/nodes/,
// one page per node CATEGORY. The SOURCE OF TRUTH is the Zod schema
// (cli/lib/schemas/workflow.ts) + the live executor registry
// (cli/lib/workflow/executors/index.ts): the generator INTROSPECTS, it keeps
// no node tables of its own. Per node type each page shows:
//
//   • description   — the per-type JSDoc comment on its NODE_SIGNATURES entry;
//                     a MISSING description is a generator WARNING (the honest
//                     inventory the issue asked for).
//   • param table   — name / type / default / required, from the category's
//                     Zod params schema (PARAMS_BY_CATEGORY); param docs from
//                     the inline JSDoc on the schema fields.
//   • port contract — in/out port types from NODE_SIGNATURES + the required-
//                     port rules from MEDIA_PORT_CONTRACTS (#512).
//   • executor      — executable (registered) vs schema-only, from the live
//                     registry (registeredExecutorTypes()).
//   • spend class   — paid vs free, from CONTENT_HASH_DEFAULT_NODE_TYPES (#513).
//   • example       — a minimal graph snippet that PARSES + VALIDATES (the
//                     generator test feeds every emitted snippet through the
//                     graph validator).
//
// CLI:
//   bun run docs:nodes          → regen the .mdx files
//   bun run docs:nodes:check     → exit 1 if committed pages are stale
//
// Idempotent — re-running on a clean tree produces byte-identical output.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  WORKFLOW_NODE_TYPES,
  NODE_SIGNATURES,
  MEDIA_PORT_CONTRACTS,
  PARAMS_BY_CATEGORY,
  CONTENT_HASH_DEFAULT_NODE_TYPES,
  nodeCategory,
  type WorkflowNodeType,
  type WorkflowNodeCategory,
} from "../cli/lib/schemas/workflow.js";
import { registeredExecutorTypes } from "../cli/lib/workflow/executors/index.js";

// ─── Category ordering + titles ──────────────────────────────────────────────

const CATEGORY_ORDER: WorkflowNodeCategory[] = [
  "ingestion",
  "llm",
  "media",
  "ralphy-verb",
  "control-flow",
  "data",
  "publish",
];

const CATEGORY_TITLE: Record<WorkflowNodeCategory, string> = {
  ingestion: "Ingestion nodes",
  llm: "LLM nodes",
  media: "Media nodes",
  "ralphy-verb": "Ralphy verb nodes",
  "control-flow": "Control-flow nodes",
  data: "Data nodes",
  publish: "Publish nodes",
};

const CATEGORY_SLUG: Record<WorkflowNodeCategory, string> = {
  ingestion: "ingestion",
  llm: "llm",
  media: "media",
  "ralphy-verb": "ralphy-verb",
  "control-flow": "control-flow",
  data: "data",
  publish: "publish",
};

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ParamField {
  name: string;
  type: string;
  default: string;
  required: boolean;
  description: string;
}

export interface NodeDoc {
  type: WorkflowNodeType;
  category: WorkflowNodeCategory;
  description: string; // "" when the schema carries no per-type JSDoc
  inputs: Record<string, string>;
  openInputs: boolean;
  output: string;
  requiredPorts: string[];
  oneOfPorts: string[][];
  executable: boolean;
  spend: "paid" | "free";
  params: ParamField[];
  example: string;
}

export interface BuildResult {
  pages: Map<string, string>; // filename -> mdx
  warnings: string[];
}

// ─── Source introspection: per-type JSDoc + per-param JSDoc ──────────────────

const SCHEMA_SRC_PATH = path.join("cli", "lib", "schemas", "workflow.ts");

/**
 * The per-node-type description: the contiguous `//` comment block directly
 * above a `<type>: sig(...)` entry in NODE_SIGNATURES. A bare category-section
 * header (`// A. …` … `// G. …`) describes the CATEGORY, not the type, so it
 * is NOT counted as a per-type description — those types warn as missing.
 */
export function parseNodeDescriptions(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = src.split("\n");
  const start = lines.findIndex((l) => l.includes("export const NODE_SIGNATURES"));
  if (start < 0) return out;
  let end = lines.findIndex((l, i) => i > start && l.trim() === "};");
  if (end < 0) end = lines.length;
  const ENTRY = /^\s*"?([a-z0-9-]+)"?:\s*sig\(/;
  const SECTION = /^[A-Z]\.\s/; // "A. …" … "G. …" — a category header
  for (let i = start + 1; i < end; i++) {
    const m = ENTRY.exec(lines[i]!);
    if (!m) continue;
    const cmt: string[] = [];
    let j = i - 1;
    while (j > start && lines[j]!.trim().startsWith("//")) {
      cmt.unshift(lines[j]!.trim().replace(/^\/\/\s?/, ""));
      j--;
    }
    const text = cmt.join(" ").trim();
    if (text && !SECTION.test(text)) out.set(m[1]!, text);
  }
  return out;
}

/** Per-param JSDoc for a params schema, keyed by field name. */
export function parseParamDescriptions(src: string, schemaName: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = src.split("\n");
  const start = lines.findIndex((l) => l.includes(`const ${schemaName} = z`));
  if (start < 0) return out;
  // The schema object ends at the `.passthrough()` / `})` closing its z.object.
  let end = lines.findIndex(
    (l, i) => i > start && /^\s*\}\)/.test(l),
  );
  if (end < 0) end = lines.length;
  const FIELD = /^\s*([A-Za-z_][A-Za-z0-9_]*):\s*z\./;
  let pending: string[] = [];
  for (let i = start + 1; i <= end; i++) {
    const line = lines[i] ?? "";
    const t = line.trim();
    if (t.startsWith("/**")) {
      // Single- or multi-line block comment.
      const buf: string[] = [];
      let k = i;
      while (k <= end) {
        const raw = lines[k]!.trim().replace(/^\/\*\*?/, "").replace(/\*\/\s*$/, "").replace(/^\*\s?/, "");
        if (raw.trim()) buf.push(raw.trim());
        if (lines[k]!.includes("*/")) break;
        k++;
      }
      pending = [buf.join(" ").trim()];
      i = k;
      continue;
    }
    if (t.startsWith("//")) {
      pending.push(t.replace(/^\/\/\s?/, ""));
      continue;
    }
    const m = FIELD.exec(line);
    if (m) {
      if (pending.length) out.set(m[1]!, pending.join(" ").trim());
      pending = [];
      continue;
    }
    if (t) pending = [];
  }
  return out;
}

// ─── Zod introspection: param name / type / default / required ───────────────

function friendlyType(schema: z.ZodTypeAny): string {
  const def: any = schema._def;
  switch (def.typeName) {
    case "ZodString":
      return "string";
    case "ZodNumber":
      return "number";
    case "ZodBoolean":
      return "boolean";
    case "ZodArray":
      return `${friendlyType(def.type)}[]`;
    case "ZodEnum":
      return def.values.join(" | ");
    case "ZodRecord":
      return "object";
    case "ZodObject":
      return "object";
    case "ZodUnknown":
      return "unknown";
    case "ZodAny":
      return "any";
    default:
      return def.typeName ? String(def.typeName).replace(/^Zod/, "").toLowerCase() : "unknown";
  }
}

/** Introspect a category params schema into ordered ParamField rows. */
export function introspectParams(
  schema: z.ZodTypeAny,
  docs: Map<string, string>,
): ParamField[] {
  // Unwrap ZodDefault → ZodObject (the passthrough object under it).
  let s: any = schema;
  while (s._def.typeName === "ZodDefault" || s._def.typeName === "ZodOptional") {
    s = s._def.innerType;
  }
  if (s._def.typeName !== "ZodObject") return []; // ZodRecord (lenient) — no typed fields
  const shape = s._def.shape();
  const fields: ParamField[] = [];
  for (const [name, raw] of Object.entries<z.ZodTypeAny>(shape)) {
    let cur: any = raw;
    let required = true;
    let def: unknown;
    while (cur._def.typeName === "ZodOptional" || cur._def.typeName === "ZodDefault") {
      if (cur._def.typeName === "ZodOptional") required = false;
      if (cur._def.typeName === "ZodDefault") {
        required = false;
        def = cur._def.defaultValue();
      }
      cur = cur._def.innerType;
    }
    fields.push({
      name,
      type: friendlyType(cur),
      default: def === undefined ? "—" : JSON.stringify(def),
      required,
      description: docs.get(name) ?? "",
    });
  }
  return fields;
}

// ─── Minimal graph-snippet example per node type ─────────────────────────────
//
// Every emitted snippet must PARSE + VALIDATE — the generator test feeds each
// one through parseWorkflowGraph + validateWorkflowGraph. So the snippet
// satisfies the node's required in-ports: strict-input media/publish nodes get
// a producer wired ahead of them; open-input nodes stand alone. Media nodes
// also need a (model, provider) that clears the #497 coverage matrix, so we
// leave those OFF the example and feed ports/params inline where the port
// contract allows a param to satisfy a required port without a wired edge.

/** A tiny upstream producer for a port type, or null when none is needed. */
function producerFor(portType: string): { id: string; type: WorkflowNodeType; params: Record<string, unknown> } | null {
  if (portType.startsWith("image")) return { id: "src-image", type: "t2i", params: { prompt: "a cat" } };
  if (portType === "video") return { id: "src-video", type: "t2v", params: { prompt: "a cat walking" } };
  if (portType === "audio") return { id: "src-audio", type: "tts", params: { text: "hello" } };
  if (portType === "text") return { id: "src-text", type: "generate-text", params: { prompt: "hi" } };
  if (portType === "unit") return { id: "src-unit", type: "ralphy-unit", params: { project: "demo-001" } };
  if (portType === "source-item[]") return { id: "src-feed", type: "rss", params: { feeds: ["https://example.com/feed"] } };
  if (portType.startsWith("object:eval")) return { id: "src-eval", type: "ralphy-eval", params: { project: "demo-001" } };
  return null;
}

/** Build a minimal, valid graph object for one node type; render it as JSON. */
export function buildExampleGraph(type: WorkflowNodeType): Record<string, unknown> {
  const sig = NODE_SIGNATURES[type];
  const contract = MEDIA_PORT_CONTRACTS[type];
  const nodes: Array<Record<string, unknown>> = [];
  const inn: Record<string, string> = {};
  const params: Record<string, unknown> = {};

  // Media/publish nodes need their required ports satisfied. Prefer a param
  // (inline) over a wired edge, else wire a small upstream producer.
  const requiredPorts = contract ? Object.keys(contract.required) : [];
  const oneOfGroups = contract?.oneOf ?? [];

  const satisfyPort = (port: string, satisfiers: string[]) => {
    const portType = sig.inputs[port] ?? "any";
    // A param-satisfier that is NOT the port name → set it inline in params.
    const paramSatisfier = satisfiers.find((s) => s !== port);
    if (paramSatisfier && paramSatisfier !== "images" && paramSatisfier !== "refs") {
      // prompt / text via a param key.
      if (paramSatisfier.endsWith("_file")) params[paramSatisfier] = `prompts/${port}.txt`;
      else params[paramSatisfier] = "example";
      return;
    }
    // Otherwise wire an upstream producer that outputs the port type.
    const prod = producerFor(portType);
    if (prod) {
      if (!nodes.some((n) => n.id === prod.id)) {
        nodes.push({ id: prod.id, type: prod.type, params: prod.params, provider: undefined });
      }
      inn[port] = `${prod.id}.out`;
    }
  };

  for (const port of requiredPorts) satisfyPort(port, contract!.required[port]!);
  for (const group of oneOfGroups) {
    const [port, satisfiers] = Object.entries(group)[0]!;
    satisfyPort(port, satisfiers);
  }

  // Media + LLM nodes carry model/provider inside params; the coverage matrix
  // only checks media nodes with a model set, so we leave model UNSET on media
  // examples (an unbound media node is valid — coverage only fires when bound).
  if (type === "generate-text" || type === "generate-object") params.prompt = "hi";
  // The #520 http node refuses every request without an explicit host allowlist.
  if (type === "http") params.allowed_hosts = ["api.example.com"];

  const node: Record<string, unknown> = { id: type, type };
  if (Object.keys(inn).length) node.in = inn;
  if (Object.keys(params).length) node.params = params;
  nodes.push(node);

  // Strip the placeholder `provider: undefined` we may have added.
  for (const n of nodes) delete (n as Record<string, unknown>).provider;

  return { version: "2.0", name: `${type}-example`, nodes };
}

export function renderExampleSnippet(type: WorkflowNodeType): string {
  return JSON.stringify(buildExampleGraph(type), null, 2);
}

// ─── MDX rendering ───────────────────────────────────────────────────────────

const HEADER_SENTINEL =
  "{/* Auto-generated — edit `cli/lib/schemas/workflow.ts` + the executor registry instead. Regenerate via `bun run docs:nodes`. */}";

/**
 * Escape MDX-hostile characters outside backtick spans: `<`/`>` (parsed as JSX
 * tags) and `{`/`}` (parsed as JS expressions, e.g. a JSDoc `{{slot}}`). Inside
 * backticks MDX skips parsing, so those stay literal.
 */
export function escapeMdxAngles(s: string): string {
  let out = "";
  let inCode = false;
  for (const ch of s) {
    if (ch === "`") {
      inCode = !inCode;
      out += ch;
    } else if (!inCode && ch === "<") out += "&lt;";
    else if (!inCode && ch === ">") out += "&gt;";
    else if (!inCode && ch === "{") out += "&#123;";
    else if (!inCode && ch === "}") out += "&#125;";
    else out += ch;
  }
  return out;
}

function cell(s: string): string {
  return escapeMdxAngles(s.replace(/\|/g, "\\|"));
}

function renderNode(doc: NodeDoc): string[] {
  const l: string[] = [];
  l.push(`### \`${doc.type}\``);
  l.push("");
  const badges = [
    doc.executable ? "executable" : "schema-only",
    doc.spend === "paid" ? "paid" : "free",
  ];
  l.push(`**Status:** ${badges.join(" · ")}`);
  l.push("");
  if (doc.description) {
    l.push(escapeMdxAngles(doc.description));
  } else {
    l.push(`_No schema description yet._`);
  }
  l.push("");

  // Ports.
  l.push("**Ports**");
  l.push("");
  l.push("| Direction | Port | Type |");
  l.push("|---|---|---|");
  const inEntries = Object.entries(doc.inputs);
  if (inEntries.length === 0 && !doc.openInputs) {
    l.push(`| in | — | — |`);
  }
  for (const [port, ptype] of inEntries) {
    const req = doc.requiredPorts.includes(port) ? " (required)" : "";
    l.push(`| in | \`${port}\`${req} | ${cell(ptype)} |`);
  }
  if (doc.openInputs) l.push(`| in | \`*\` (open) | any |`);
  for (const group of doc.oneOfPorts) {
    l.push(`| in | one of: ${group.map((p) => `\`${p}\``).join(", ")} | — |`);
  }
  l.push(`| out | \`out\` | ${cell(doc.output)} |`);
  l.push("");

  // Params.
  if (doc.params.length > 0) {
    l.push("**Params**");
    l.push("");
    l.push("| Name | Type | Default | Required |");
    l.push("|---|---|---|---|");
    for (const p of doc.params) {
      l.push(
        `| \`${p.name}\` | ${cell(p.type)} | ${cell(p.default)} | ${p.required ? "yes" : "no"} |`,
      );
    }
    l.push("");
    const documented = doc.params.filter((p) => p.description);
    if (documented.length > 0) {
      for (const p of documented) {
        l.push(`- \`${p.name}\` — ${escapeMdxAngles(p.description)}`);
      }
      l.push("");
    }
  } else {
    l.push(
      "**Params** — passthrough (typed once the executor lands; any key is accepted).",
    );
    l.push("");
  }

  // Example.
  l.push("**Example**");
  l.push("");
  l.push("```json");
  l.push(doc.example);
  l.push("```");
  l.push("");
  return l;
}

export function renderCategoryPage(
  category: WorkflowNodeCategory,
  docs: NodeDoc[],
  sectionIntro: string,
): string {
  const l: string[] = [];
  const title = CATEGORY_TITLE[category];
  l.push("---");
  l.push(`title: "${title}"`);
  const desc = `Workflow-graph ${title.toLowerCase()}: ports, params, executor status, and spend class.`;
  l.push(`description: "${desc.slice(0, 160)}"`);
  l.push("---");
  l.push("");
  l.push(HEADER_SENTINEL);
  l.push("");
  const intro = sectionIntro
    ? escapeMdxAngles(sectionIntro)
    : `The ${title.toLowerCase()} in the workflow-graph taxonomy.`;
  l.push(intro);
  l.push("");
  l.push(
    "Facts on this page are introspected from `cli/lib/schemas/workflow.ts` and the live executor registry — never hand-edited.",
  );
  l.push("");
  for (const d of docs) l.push(...renderNode(d));
  l.push("## Related");
  l.push("");
  l.push(
    "- [Farm node-graph architecture](https://github.com/alecs5am/ralphy/blob/main/docs/architecture/farm-node-graph.md) — the design rationale behind these node types",
  );
  l.push("- [`ralphy workflow`](/reference/cli/workflow) — lint and inspect a workspace's graphs");
  l.push("");
  return l.join("\n");
}

// ─── Category section-intro text (the `// A. …` headers) ─────────────────────

export function parseCategoryIntros(src: string): Map<WorkflowNodeCategory, string> {
  // Map the first section header found within each category's block to the
  // category. We reuse the per-type parse: the FIRST type of a category is the
  // one that sits right under the `// A. …` header.
  const out = new Map<WorkflowNodeCategory, string>();
  const lines = src.split("\n");
  const start = lines.findIndex((l) => l.includes("export const NODE_SIGNATURES"));
  if (start < 0) return out;
  let end = lines.findIndex((l, i) => i > start && l.trim() === "};");
  if (end < 0) end = lines.length;
  const ENTRY = /^\s*"?([a-z0-9-]+)"?:\s*sig\(/;
  const SECTION = /^[A-Z]\.\s/;
  for (let i = start + 1; i < end; i++) {
    const m = ENTRY.exec(lines[i]!);
    if (!m) continue;
    const cmt: string[] = [];
    let j = i - 1;
    while (j > start && lines[j]!.trim().startsWith("//")) {
      cmt.unshift(lines[j]!.trim().replace(/^\/\/\s?/, ""));
      j--;
    }
    const text = cmt.join(" ").trim();
    if (text && SECTION.test(text)) {
      const cat = nodeCategory(m[1]! as WorkflowNodeType);
      if (!out.has(cat)) out.set(cat, text);
    }
  }
  return out;
}

// ─── Build ─────────────────────────────────────────────────────────────────

export function build(schemaSrc: string): BuildResult {
  const nodeDescs = parseNodeDescriptions(schemaSrc);
  const intros = parseCategoryIntros(schemaSrc);
  const paramDocs = {
    llm: parseParamDescriptions(schemaSrc, "LlmParamsSchema"),
    media: parseParamDescriptions(schemaSrc, "MediaParamsSchema"),
  };
  const registered = new Set(registeredExecutorTypes());
  const warnings: string[] = [];

  // Group node docs by category.
  const byCategory = new Map<WorkflowNodeCategory, NodeDoc[]>();
  for (const type of WORKFLOW_NODE_TYPES) {
    const category = nodeCategory(type);
    const sig = NODE_SIGNATURES[type];
    const contract = MEDIA_PORT_CONTRACTS[type];
    const description = nodeDescs.get(type) ?? "";
    if (!description) warnings.push(`no schema description for node type "${type}"`);

    const docsForCat =
      category === "llm" ? paramDocs.llm : category === "media" ? paramDocs.media : new Map<string, string>();
    const params = introspectParams(PARAMS_BY_CATEGORY[category], docsForCat);

    const doc: NodeDoc = {
      type,
      category,
      description,
      inputs: sig.inputs,
      openInputs: sig.openInputs,
      output: sig.output,
      requiredPorts: contract ? Object.keys(contract.required) : [],
      oneOfPorts: (contract?.oneOf ?? []).map((g) => Object.keys(g)),
      executable: registered.has(type),
      spend: CONTENT_HASH_DEFAULT_NODE_TYPES.has(type) ? "paid" : "free",
      params,
      example: renderExampleSnippet(type),
    };
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category)!.push(doc);
  }

  const pages = new Map<string, string>();
  for (const category of CATEGORY_ORDER) {
    const docs = byCategory.get(category);
    if (!docs || docs.length === 0) continue;
    const page = renderCategoryPage(category, docs, intros.get(category) ?? "");
    pages.set(`${CATEGORY_SLUG[category]}.mdx`, page);
  }
  return { pages, warnings };
}

// ─── CLI entry point ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const repo = path.resolve(import.meta.dir, "..");
  const schemaSrc = fs.readFileSync(path.join(repo, SCHEMA_SRC_PATH), "utf8");
  const { pages, warnings } = build(schemaSrc);
  const targetDir = path.join(repo, "docs-mintlify", "reference", "nodes");
  const checkMode = process.argv.includes("--check");

  for (const w of warnings) process.stderr.write(`warning: ${w}\n`);

  if (checkMode) {
    let stale = 0;
    for (const [filename, expected] of pages) {
      const target = path.join(targetDir, filename);
      const actual = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
      if (actual.trim() !== expected.trim()) {
        process.stderr.write(`stale: docs-mintlify/reference/nodes/${filename}\n`);
        stale++;
      }
    }
    if (stale > 0) {
      process.stderr.write(`\n${stale} stale page(s). Run \`bun run docs:nodes\` and commit.\n`);
      process.exit(1);
    }
    process.stdout.write(JSON.stringify({ ok: true, pages: pages.size, warnings: warnings.length }) + "\n");
    process.exit(0);
  }

  fs.mkdirSync(targetDir, { recursive: true });
  for (const [filename, content] of pages) {
    fs.writeFileSync(path.join(targetDir, filename), content);
  }
  process.stdout.write(
    JSON.stringify({ ok: true, wrote: targetDir, pages: pages.size, warnings: warnings.length }) + "\n",
  );
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("build-node-docs.ts") || process.argv[1].endsWith("build-node-docs.js"));
if (isDirect) {
  void main();
}
