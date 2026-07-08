// Unit tests for scripts/build-node-docs.ts (#524).
//
// The generator introspects the workflow-node schema + the live executor
// registry and emits one .mdx page per node CATEGORY under
// docs-mintlify/reference/nodes/. These tests pin the load-bearing contracts:
//
//   • Every EMITTED graph snippet parses + validates through the graph
//     validator (a snippet that doesn't parse fails the build).
//   • The output is non-empty and every registered node type appears.
//   • JSDoc-missing node types surface as generator warnings.
//   • The committed pages are fresh (docs:nodes:check passes).

import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  build,
  buildExampleGraph,
  introspectParams,
  parseNodeDescriptions,
  parseParamDescriptions,
} from "../../scripts/build-node-docs.js";
import {
  WORKFLOW_NODE_TYPES,
  PARAMS_BY_CATEGORY,
  parseWorkflowGraph,
  nodeCategory,
} from "../../cli/lib/schemas/workflow.js";
import { validateWorkflowGraph } from "../../cli/lib/workflow-graph.js";
import { registeredExecutorTypes } from "../../cli/lib/workflow/executors/index.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const SCHEMA_SRC = fs.readFileSync(
  path.join(REPO, "cli", "lib", "schemas", "workflow.ts"),
  "utf8",
);

describe("example snippets", () => {
  test("every emitted graph snippet parses + validates", () => {
    const failures: string[] = [];
    for (const type of WORKFLOW_NODE_TYPES) {
      const graph = buildExampleGraph(type);
      try {
        const parsed = parseWorkflowGraph(graph);
        const v = validateWorkflowGraph(parsed);
        if (!v.ok) failures.push(`${type}: ${v.errors.map((e) => e.code).join(",")}`);
      } catch (e) {
        failures.push(`${type}: parse threw ${(e as Error).message.slice(0, 80)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("each snippet names the node type it documents", () => {
    for (const type of WORKFLOW_NODE_TYPES) {
      const graph = buildExampleGraph(type) as { nodes: Array<{ type: string }> };
      expect(graph.nodes.some((n) => n.type === type)).toBe(true);
    }
  });
});

describe("build()", () => {
  const result = build(SCHEMA_SRC);

  test("emits a non-empty page per category", () => {
    expect(result.pages.size).toBeGreaterThanOrEqual(7);
    for (const [name, content] of result.pages) {
      expect(name.endsWith(".mdx")).toBe(true);
      expect(content.trim().length).toBeGreaterThan(0);
      expect(content).toContain("Auto-generated");
    }
  });

  test("every registered node type appears in some page", () => {
    const all = [...result.pages.values()].join("\n");
    for (const type of registeredExecutorTypes()) {
      expect(all).toContain(`### \`${type}\``);
    }
  });

  test("every node type (incl. schema-only) appears in some page", () => {
    const all = [...result.pages.values()].join("\n");
    for (const type of WORKFLOW_NODE_TYPES) {
      expect(all).toContain(`### \`${type}\``);
    }
  });

  test("schema-only node types are labelled schema-only, not executable", () => {
    const registered = new Set(registeredExecutorTypes());
    const all = [...result.pages.values()].join("\n");
    // voice-design + upscale are schema-only by design (media.ts header).
    expect(registered.has("voice-design")).toBe(false);
    expect(all).toContain("**Status:** schema-only");
  });

  test("JSDoc-missing node types surface as warnings", () => {
    expect(result.warnings.length).toBeGreaterThan(0);
    // Every warning names a real node type.
    for (const w of result.warnings) {
      const m = /node type "([a-z0-9-]+)"/.exec(w);
      expect(m).toBeTruthy();
      expect(WORKFLOW_NODE_TYPES).toContain(m![1] as (typeof WORKFLOW_NODE_TYPES)[number]);
    }
    // A node type with a real per-type comment (generate-object) does NOT warn;
    // one that only inherits a section header (agent-loop) DOES.
    const warned = new Set(result.warnings.map((w) => /node type "([a-z0-9-]+)"/.exec(w)![1]));
    expect(warned.has("agent-loop")).toBe(true);
    expect(warned.has("generate-object")).toBe(false);
  });

  test("build is deterministic", () => {
    const a = build(SCHEMA_SRC);
    const b = build(SCHEMA_SRC);
    expect([...a.pages]).toEqual([...b.pages]);
  });
});

describe("introspection", () => {
  test("parses per-type descriptions, skipping section headers", () => {
    const descs = parseNodeDescriptions(SCHEMA_SRC);
    // A real per-type comment is captured.
    expect(descs.get("generate-object")).toContain("Output type is dynamic");
    expect(descs.get("webhook-trigger")).toContain("inbound-event trigger");
    // A bare section header ("A. LLM — …") is NOT a per-type description.
    expect(descs.has("generate-text")).toBe(false);
  });

  test("parses per-param JSDoc for the LLM schema", () => {
    const docs = parseParamDescriptions(SCHEMA_SRC, "LlmParamsSchema");
    expect(docs.get("prompt")).toContain("interpolation");
    expect(docs.get("schema")).toContain("output port");
  });

  test("introspects param name / type / default / required from the zod schema", () => {
    const docs = parseParamDescriptions(SCHEMA_SRC, "LlmParamsSchema");
    const fields = introspectParams(PARAMS_BY_CATEGORY.llm, docs);
    const byName = new Map(fields.map((f) => [f.name, f]));
    expect(byName.get("model")?.type).toBe("string");
    expect(byName.get("model")?.required).toBe(false);
    expect(byName.get("tools")?.type).toBe("string[]");
    expect(byName.get("temperature")?.type).toBe("number");
  });

  test("lenient (record) param categories introspect to zero typed fields", () => {
    // ralphy-verb / control-flow / data / publish / ingestion use LenientParamsSchema.
    for (const cat of ["ralphy-verb", "control-flow", "data", "publish", "ingestion"] as const) {
      expect(introspectParams(PARAMS_BY_CATEGORY[cat], new Map())).toEqual([]);
    }
  });
});

describe("freshness (docs:nodes:check)", () => {
  test("committed pages match a fresh regen", () => {
    const { pages } = build(SCHEMA_SRC);
    const dir = path.join(REPO, "docs-mintlify", "reference", "nodes");
    for (const [filename, expected] of pages) {
      const target = path.join(dir, filename);
      expect(fs.existsSync(target)).toBe(true);
      expect(fs.readFileSync(target, "utf8").trim()).toBe(expected.trim());
    }
  });
});

describe("category coverage", () => {
  test("every category with node types produces a page", () => {
    const cats = new Set(WORKFLOW_NODE_TYPES.map((t) => nodeCategory(t)));
    const { pages } = build(SCHEMA_SRC);
    // 7 categories in the taxonomy.
    expect(cats.size).toBe(pages.size);
  });
});
