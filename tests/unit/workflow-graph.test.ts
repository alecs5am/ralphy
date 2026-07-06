// #498 — node-graph workflow schema + validation + lint plumbing.
//
// Covers: envelope defaults, one parse per node CATEGORY, cycle detection,
// unresolved edges, port-type mismatch, #497 coverage hard-fail (naming node
// + fix), unknown-model tolerance, and legacy linear (#478) compatibility via
// the real on-disk fixture shape.

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, workflowsDir } from "../../cli/lib/paths.js";
import {
  parseWorkflow,
  parseWorkflowGraph,
  parseWorkflowDocument,
  WORKFLOW_NODE_TYPES,
  NODE_SIGNATURES,
  nodeOutName,
  nodeOutType,
  portTypesMatch,
  type WorkflowNode,
} from "../../cli/lib/schemas/workflow.js";
import { validateWorkflowGraph, lintWorkflowFile } from "../../cli/lib/workflow-graph.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const LEGACY_FIXTURE = path.join(FIXTURES, "workflow-linear-legacy.json");
const GRAPH_FIXTURE = path.join(FIXTURES, "workflow-graph-tech-news.json");

let tmp: TmpRoot | undefined;
afterEach(() => {
  tmp?.cleanup();
  tmp = undefined;
});

/** Shorthand: a graph doc around the given nodes. */
const graph = (nodes: unknown[]) => parseWorkflowGraph({ name: "t", nodes });

describe("node envelope", () => {
  test("fills defaults on a minimal node", () => {
    const g = graph([{ id: "hero", type: "t2i" }]);
    const n = g.nodes[0]!;
    expect(g.version).toBe("2.0");
    expect(n.in).toEqual({});
    expect(n.params).toEqual({});
    expect(n.retry).toEqual({ max: 0, backoff: "exponential" });
    expect(n.on_fail).toBe("halt");
    expect(n.budget).toBeUndefined();
    expect(n.cache).toBe("none");
    expect(n.emit).toBe(true);
    expect(nodeOutName(n)).toBe("out");
    expect(nodeOutType(n)).toBe("image[]");
  });

  test("accepts the full envelope, including route on_fail and explicit typed out", () => {
    const g = graph([
      { id: "fallback", type: "approval" },
      {
        id: "hero",
        type: "transform",
        in: { seed: "artifact:refs/seed.json" },
        out: { name: "picked", type: "object:pick" },
        params: { expr: ".items[0]" },
        retry: { max: 3, backoff: "linear" },
        on_fail: "route:fallback",
        budget: { max_usd: 0.1 },
        cache: "content-hash",
        emit: false,
      },
    ]);
    const n = g.nodes[1]!;
    expect(n.on_fail).toBe("route:fallback");
    expect(nodeOutName(n)).toBe("picked");
    expect(nodeOutType(n)).toBe("object:pick");
    expect(validateWorkflowGraph(g).ok).toBe(true);
  });

  test("rejects bad envelope values", () => {
    expect(() => graph([{ id: "Bad_Id", type: "t2i" }])).toThrow();
    expect(() => graph([{ id: "x", type: "not-a-node-type" }])).toThrow();
    expect(() => graph([{ id: "x", type: "t2i", on_fail: "explode" }])).toThrow();
    expect(() => graph([{ id: "x", type: "t2i", cache: "always" }])).toThrow();
    expect(() => graph([{ id: "x", type: "t2i", out: { name: "o", type: "not-a-type" } }])).toThrow();
  });

  test("all 48 node types have a signature and parse", () => {
    expect(WORKFLOW_NODE_TYPES.length).toBe(48);
    for (const type of WORKFLOW_NODE_TYPES) {
      expect(NODE_SIGNATURES[type]).toBeDefined();
      const g = graph([{ id: "n", type }]);
      expect(g.nodes[0]!.type).toBe(type);
    }
  });
});

describe("one parse per node category", () => {
  test("llm: generate-object types its output port from params.schema", () => {
    const g = graph([
      {
        id: "research",
        type: "generate-object",
        params: { model: "anthropic/claude-opus-4-8", schema: "research-facts", temperature: 0.2 },
        out: "research-facts",
      },
    ]);
    expect(nodeOutType(g.nodes[0]!)).toBe("object:research-facts");
  });

  test("media: t2v carries the (model, provider) binding in params", () => {
    const g = graph([
      { id: "clip", type: "t2v", params: { model: "kwaivgi/kling-v3.0-pro", provider: "openrouter", durationSec: 10 } },
    ]);
    expect(g.nodes[0]!.params.provider).toBe("openrouter");
    expect(nodeOutType(g.nodes[0]!)).toBe("video");
  });

  test("ralphy-verb: ralphy-unit emits a unit", () => {
    const g = graph([{ id: "pack", type: "ralphy-unit", params: { slug: "ep-001" } }]);
    expect(nodeOutType(g.nodes[0]!)).toBe("unit");
  });

  test("ingestion: trend-watch emits source-item[]", () => {
    const g = graph([{ id: "trends", type: "trend-watch", params: { topics: ["ai"] } }]);
    expect(nodeOutType(g.nodes[0]!)).toBe("source-item[]");
  });

  test("publish: publish consumes a unit", () => {
    const g = graph([
      { id: "pack", type: "ralphy-unit" },
      { id: "post", type: "publish", in: { unit: "pack.out" }, params: { targets: ["tiktok"] } },
    ]);
    expect(validateWorkflowGraph(g).ok).toBe(true);
  });

  test("control-flow: gate consumes an eval verdict", () => {
    const g = graph([
      { id: "score", type: "ralphy-eval" },
      { id: "ship-gate", type: "gate", in: { verdict: "score.out" }, params: { threshold: 7 } },
    ]);
    expect(validateWorkflowGraph(g).ok).toBe(true);
  });

  test("data: template-string emits text", () => {
    const g = graph([{ id: "prompt", type: "template-string", params: { template: "prompts/vo.md" } }]);
    expect(nodeOutType(g.nodes[0]!)).toBe("text");
  });
});

describe("graph validation", () => {
  test("detects a cycle and names the path", () => {
    const g = graph([
      { id: "a", type: "transform", in: { x: "c.out" } },
      { id: "b", type: "transform", in: { x: "a.out" } },
      { id: "c", type: "transform", in: { x: "b.out" } },
    ]);
    const v = validateWorkflowGraph(g);
    expect(v.ok).toBe(false);
    const cycle = v.errors.find((e) => e.code === "cycle");
    expect(cycle).toBeDefined();
    expect(cycle!.message).toMatch(/->/);
    expect(cycle!.fix).toContain("break the cycle");
  });

  test("flags a self-edge", () => {
    const g = graph([{ id: "loop", type: "transform", in: { x: "loop.out" } }]);
    const v = validateWorkflowGraph(g);
    expect(v.errors.some((e) => e.code === "cycle" && e.node === "loop")).toBe(true);
  });

  test("unresolved edge names the node, the port, and the fix", () => {
    const g = graph([{ id: "vo", type: "tts", in: { text: "ghost.out" } }]);
    const v = validateWorkflowGraph(g);
    expect(v.ok).toBe(false);
    const issue = v.errors.find((e) => e.code === "unresolved-edge")!;
    expect(issue.node).toBe("vo");
    expect(issue.port).toBe("text");
    expect(issue.message).toContain('missing node "ghost"');
    expect(issue.fix).toContain("ghost");
  });

  test("edge to the wrong out-name is unresolved with the correct wiring in the fix", () => {
    const g = graph([
      { id: "script", type: "generate-text", out: "script" },
      { id: "vo", type: "tts", in: { text: "script.text" } },
    ]);
    const v = validateWorkflowGraph(g);
    const issue = v.errors.find((e) => e.code === "unresolved-edge")!;
    expect(issue.fix).toContain("script.script");
  });

  test("artifact refs skip edge resolution", () => {
    const g = graph([{ id: "vo", type: "tts", in: { text: "artifact:prompts/vo.txt" } }]);
    expect(validateWorkflowGraph(g).ok).toBe(true);
    const g2 = graph([{ id: "anchor", type: "i2v", in: { first_frame: "refs/hero.png" } }]);
    expect(validateWorkflowGraph(g2).ok).toBe(true);
  });

  test("port type mismatch: image[] into a text port", () => {
    const g = graph([
      { id: "hero", type: "t2i" },
      { id: "vo", type: "tts", in: { text: "hero.out" } },
    ]);
    const v = validateWorkflowGraph(g);
    expect(v.ok).toBe(false);
    const issue = v.errors.find((e) => e.code === "port-type-mismatch")!;
    expect(issue.node).toBe("vo");
    expect(issue.message).toContain("expects text");
    expect(issue.message).toContain("produces image[]");
  });

  test("object:* from an unschema'd generate-object matches any object port", () => {
    expect(portTypesMatch("object:eval", "object:*")).toBe(true);
    expect(portTypesMatch("object:eval", "object:transcript")).toBe(false);
    const g = graph([
      { id: "loose", type: "generate-object" },
      { id: "ship-gate", type: "gate", in: { verdict: "loose.out" } },
    ]);
    expect(validateWorkflowGraph(g).ok).toBe(true);
  });

  test("unknown in-port on a closed media signature is an error", () => {
    const g = graph([
      { id: "src", type: "template-string" },
      { id: "clip", type: "t2v", in: { screenplay: "src.out" } },
    ]);
    const v = validateWorkflowGraph(g);
    const issue = v.errors.find((e) => e.code === "unknown-in-port")!;
    expect(issue.node).toBe("clip");
    expect(issue.fix).toContain("prompt");
  });

  test("duplicate node ids and missing route targets are errors", () => {
    const dup = graph([
      { id: "a", type: "transform" },
      { id: "a", type: "transform" },
    ]);
    expect(validateWorkflowGraph(dup).errors.some((e) => e.code === "duplicate-node-id")).toBe(true);

    const route = graph([{ id: "clip", type: "t2v", on_fail: "route:nowhere" }]);
    const v = validateWorkflowGraph(route);
    const issue = v.errors.find((e) => e.code === "route-target-missing")!;
    expect(issue.node).toBe("clip");
    expect(issue.message).toContain("nowhere");
  });
});

describe("#497 coverage matrix at import", () => {
  test("declared-unsupported param is a HARD error naming the node and the fix", () => {
    // OR kling declares refs unsupported (coverage.ts); fal covers refs for video.
    const g = graph([
      {
        id: "clip",
        type: "t2v",
        params: { model: "kwaivgi/kling-v3.0-pro", provider: "openrouter", refs: ["hero.png"] },
      },
    ]);
    const v = validateWorkflowGraph(g);
    expect(v.ok).toBe(false);
    const issue = v.errors.find((e) => e.code === "coverage-unsupported-param")!;
    expect(issue.level).toBe("error");
    expect(issue.node).toBe("clip");
    expect(issue.message).toContain('"refs"');
    expect(issue.message).toContain("openrouter");
    // The fix names a provider that DOES support the param.
    expect(issue.fix).toContain("fal");
  });

  test("param outside declared coverage (but not declared unsupported) is a warning", () => {
    const g = graph([
      {
        id: "clip",
        type: "t2v",
        params: { model: "kwaivgi/kling-v3.0-pro", provider: "openrouter", loop: true },
      },
    ]);
    const v = validateWorkflowGraph(g);
    expect(v.ok).toBe(true);
    expect(v.warnings.some((w) => w.code === "coverage-uncovered-param" && w.node === "clip")).toBe(true);
  });

  test("unknown (model, provider) triple is tolerated — no entry, no issue", () => {
    const g = graph([
      {
        id: "clip",
        type: "t2v",
        params: { model: "acme/brand-new-video-9", provider: "openrouter", weirdKnob: 3 },
      },
    ]);
    const v = validateWorkflowGraph(g);
    expect(v.ok).toBe(true);
    expect(v.warnings).toEqual([]);
  });

  test("media node without a resolved binding skips the coverage check", () => {
    const g = graph([{ id: "clip", type: "t2v", params: { durationSec: 10 } }]);
    expect(validateWorkflowGraph(g).ok).toBe(true);
  });
});

describe("legacy linear compatibility", () => {
  test("the real #478 on-disk fixture still parses through parseWorkflow", () => {
    const raw = JSON.parse(fs.readFileSync(LEGACY_FIXTURE, "utf-8"));
    const wf = parseWorkflow(raw);
    expect(wf.version).toBe("1.0");
    expect(wf.steps.map((s) => s.phase)).toEqual([
      "intake",
      "style-lock",
      "scenario",
      "assets",
      "render",
      "eval",
    ]);
    const doc = parseWorkflowDocument(raw);
    expect(doc.kind).toBe("linear");
  });

  test("parseWorkflow refuses a graph document instead of silently reading steps: []", () => {
    const raw = JSON.parse(fs.readFileSync(GRAPH_FIXTURE, "utf-8"));
    expect(() => parseWorkflow(raw)).toThrow(/node-graph/);
    const doc = parseWorkflowDocument(raw);
    expect(doc.kind).toBe("graph");
    if (doc.kind === "graph") expect(doc.graph.nodes.length).toBe(7);
  });
});

describe("lintWorkflowFile", () => {
  function seedWorkspaceDir(slug: string): string {
    tmp = makeTmpRoot("ralphy-wf-lint");
    const dir = workspaceDir(slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ slug }));
    fs.mkdirSync(workflowsDir(slug), { recursive: true });
    return workflowsDir(slug);
  }

  test("clean graph fixture lints green (json)", () => {
    const r = lintWorkflowFile(GRAPH_FIXTURE);
    expect(r.kind).toBe("graph");
    expect(r.format).toBe("json");
    expect(r.size).toBe(7);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  test("legacy linear fixture lints green", () => {
    const r = lintWorkflowFile(LEGACY_FIXTURE);
    expect(r.kind).toBe("linear");
    expect(r.size).toBe(6);
    expect(r.ok).toBe(true);
  });

  test("YAML is accepted at lint time (D-03)", () => {
    const dir = seedWorkspaceDir("yamlws");
    const file = path.join(dir, "draft.yaml");
    fs.writeFileSync(
      file,
      [
        "name: draft",
        "nodes:",
        "  - id: prompt",
        "    type: template-string",
        "  - id: clip",
        "    type: t2v",
        "    in:",
        "      prompt: prompt.out",
      ].join("\n"),
    );
    const r = lintWorkflowFile(file, "yamlws");
    expect(r.format).toBe("yaml");
    expect(r.kind).toBe("graph");
    expect(r.ok).toBe(true);
  });

  test("a broken graph reports structured issues instead of throwing", () => {
    const dir = seedWorkspaceDir("brokews");
    const file = path.join(dir, "broken.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        name: "broken",
        nodes: [
          { id: "a", type: "transform", in: { x: "b.out" } },
          { id: "b", type: "transform", in: { x: "a.out" } },
        ],
      }),
    );
    const r = lintWorkflowFile(file, "brokews");
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "cycle")).toBe(true);
  });

  test("unreadable file reports kind invalid", () => {
    const dir = seedWorkspaceDir("badws");
    const file = path.join(dir, "bad.json");
    fs.writeFileSync(file, "{ not json");
    const r = lintWorkflowFile(file, "badws");
    expect(r.kind).toBe("invalid");
    expect(r.ok).toBe(false);
    expect(r.errors[0]!.code).toBe("schema");
  });
});
