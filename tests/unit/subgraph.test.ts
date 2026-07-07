// #517 — reusable named subgraphs: schema, definition checks, expansion
// (namespacing, edge rewiring across the boundary, overrides, boundary port
// typing), lintWorkflowFile integration over the workspace subgraphs/ tier,
// and workspace-level usage (unused = warning material).

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, workflowsDir, subgraphsDir } from "../../cli/lib/paths.js";
import {
  parseSubgraph,
  parseWorkflowGraph,
  type Subgraph,
} from "../../cli/lib/schemas/workflow.js";
import { validateWorkflowGraph, lintWorkflowFile } from "../../cli/lib/workflow-graph.js";
import {
  SUBGRAPH_ID_SEP,
  expandGraphSubgraphs,
  validateSubgraphDefinition,
  dirSubgraphResolver,
  subgraphUsage,
  listSubgraphNames,
  listSubgraphSummaries,
  type SubgraphResolver,
} from "../../cli/lib/subgraph.js";

let tmp: TmpRoot | undefined;
afterEach(() => {
  tmp?.cleanup();
  tmp = undefined;
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A lint-green short-branch: text entry → generate-text → t2v → video exit. */
const SHORT_BRANCH = {
  name: "short-branch",
  version: "1.0",
  entry: { script: { node: "write", port: "prompt", type: "text" } },
  exit: { out: { node: "clip", type: "video" } },
  params: { "video-model": { node: "clip", param: "model" } },
  nodes: [
    { id: "write", type: "generate-text", params: { prompt: "punch up the script" } },
    { id: "clip", type: "t2v", in: { prompt: "write.out" }, params: { prompt: "neon night drive" } },
  ],
};

const resolverFor = (subs: Record<string, unknown>): SubgraphResolver => {
  return (name) =>
    name in subs
      ? { sub: parseSubgraph(subs[name]) }
      : { error: { code: "subgraph-missing", message: `subgraph "${name}" not found` } };
};

const RESOLVE = resolverFor({ "short-branch": SHORT_BRANCH });

/** Outer graph: research → subgraph instance → publish consumer. */
const OUTER = {
  name: "pipeline",
  nodes: [
    { id: "research", type: "generate-text", params: { prompt: "find the topic" } },
    {
      id: "short",
      type: "subgraph",
      in: { script: "research.out" },
      params: { name: "short-branch", overrides: { "video-model": "kwaivgi/kling-v3.0-pro" } },
    },
    { id: "post", type: "youtube-upload", in: { video: "short.out" } },
  ],
};

// ─── Schema ──────────────────────────────────────────────────────────────────

describe("subgraph schema", () => {
  test("parses the fixture and applies defaults", () => {
    const sub = parseSubgraph(SHORT_BRANCH);
    expect(sub.version).toBe("1.0");
    expect(sub.name).toBe("short-branch");
    expect(sub.nodes).toHaveLength(2);
    const minimal = parseSubgraph({ name: "bare" });
    expect(minimal.entry).toEqual({});
    expect(minimal.exit).toEqual({});
    expect(minimal.params).toEqual({});
    expect(minimal.nodes).toEqual([]);
  });

  test("rejects bad names and bad port types", () => {
    expect(() => parseSubgraph({ name: "Bad_Name" })).toThrow();
    expect(() =>
      parseSubgraph({ name: "x", exit: { out: { node: "a", type: "not-a-type" } } }),
    ).toThrow();
  });
});

// ─── Definition checks ───────────────────────────────────────────────────────

describe("validateSubgraphDefinition", () => {
  test("a clean definition has no issues", () => {
    expect(validateSubgraphDefinition(parseSubgraph(SHORT_BRANCH))).toEqual([]);
  });

  test("nested subgraph is refused (one level only)", () => {
    const sub = parseSubgraph({
      name: "outer-branch",
      nodes: [{ id: "inner", type: "subgraph", params: { name: "short-branch" } }],
    });
    const issues = validateSubgraphDefinition(sub);
    expect(issues.some((i) => i.code === "subgraph-nested" && i.node === "inner")).toBe(true);
    expect(issues[0]!.message).toContain("one level of nesting");
  });

  test("entry/exit/param targets must exist and agree on types", () => {
    const sub = parseSubgraph({
      name: "broken-branch",
      entry: { script: { node: "ghost", port: "prompt", type: "text" } },
      exit: { out: { node: "clip", type: "audio" } }, // clip produces video
      params: { knob: { node: "nobody", param: "model" } },
      nodes: [{ id: "clip", type: "t2v", params: { prompt: "x" } }],
    });
    const issues = validateSubgraphDefinition(sub);
    expect(issues.filter((i) => i.code === "subgraph-invalid")).toHaveLength(3);
    expect(issues.some((i) => i.message.includes('missing inner node "ghost"'))).toBe(true);
    expect(issues.some((i) => i.message.includes("declares type audio") && i.message.includes("produces video"))).toBe(true);
    expect(issues.some((i) => i.message.includes('missing inner node "nobody"'))).toBe(true);
  });

  test("entry targeting an undeclared closed-signature port is refused", () => {
    const sub = parseSubgraph({
      name: "bad-port",
      entry: { img: { node: "clip", port: "screenplay", type: "text" } },
      nodes: [{ id: "clip", type: "t2v", params: { prompt: "x" } }],
    });
    const issues = validateSubgraphDefinition(sub);
    expect(issues.some((i) => i.code === "subgraph-invalid" && i.message.includes("does not declare"))).toBe(true);
  });
});

// ─── Expansion ───────────────────────────────────────────────────────────────

describe("expandGraphSubgraphs", () => {
  test("a graph without subgraph nodes passes through untouched", () => {
    const g = parseWorkflowGraph({ name: "plain", nodes: [{ id: "a", type: "template-string" }] });
    const r = expandGraphSubgraphs(g, RESOLVE);
    expect(r.graph).toBe(g);
    expect(r.issues).toEqual([]);
    expect(r.instances).toEqual([]);
  });

  test("expands ids, rewires edges across the boundary, applies overrides", () => {
    const r = expandGraphSubgraphs(parseWorkflowGraph(OUTER), RESOLVE);
    expect(r.issues).toEqual([]);
    expect(r.instances).toEqual(["short"]);

    const ids = r.graph.nodes.map((n) => n.id);
    // Inner nodes are namespaced with ":" at the instance's position; the
    // instance node itself is gone.
    expect(ids).toEqual(["research", "short:write", "short:clip", "post"]);
    expect(SUBGRAPH_ID_SEP).toBe(":");

    const byId = new Map(r.graph.nodes.map((n) => [n.id, n]));
    // Entry wiring: the outer producer ref lands on the declared inner port.
    expect(byId.get("short:write")!.in).toEqual({ prompt: "research.out" });
    // Inner edge rewired to the namespaced producer.
    expect(byId.get("short:clip")!.in).toEqual({ prompt: "short:write.out" });
    // Exit wiring: the consumer's ref points at the namespaced exit node.
    expect(byId.get("post")!.in).toEqual({ video: "short:clip.out" });
    // Override landed on the right inner node's param.
    expect(byId.get("short:clip")!.params.model).toBe("kwaivgi/kling-v3.0-pro");

    // The expanded graph validates green (cycles, edges, port types).
    const v = validateWorkflowGraph(r.graph);
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });

  test("expansion never mutates the input graph", () => {
    const g = parseWorkflowGraph(OUTER);
    const before = JSON.parse(JSON.stringify(g));
    expandGraphSubgraphs(g, RESOLVE);
    expect(g).toEqual(before);
  });

  test("inner on_fail routes are namespaced", () => {
    const sub = {
      ...SHORT_BRANCH,
      name: "routed-branch",
      nodes: [
        { id: "write", type: "generate-text", params: { prompt: "x" }, on_fail: "route:fallback" },
        { id: "clip", type: "t2v", in: { prompt: "write.out" }, params: { prompt: "y" } },
        { id: "fallback", type: "template-string", params: { prompt: "plan b" } },
      ],
    };
    const g = parseWorkflowGraph({
      name: "t",
      nodes: [{ id: "unit", type: "subgraph", params: { name: "routed-branch" } }],
    });
    const r = expandGraphSubgraphs(g, resolverFor({ "routed-branch": sub }));
    expect(r.issues).toEqual([]);
    const write = r.graph.nodes.find((n) => n.id === "unit:write")!;
    expect(write.on_fail).toBe("route:unit:fallback");
  });

  test("port mismatch at the entry boundary is a lint error", () => {
    const g = parseWorkflowGraph({
      name: "t",
      nodes: [
        { id: "hero", type: "t2i", params: { prompt: "x" } }, // image[]
        {
          id: "short",
          type: "subgraph",
          in: { script: "hero.out" }, // entry declares text
          params: { name: "short-branch" },
        },
      ],
    });
    const r = expandGraphSubgraphs(g, RESOLVE);
    const issue = r.issues.find((i) => i.code === "subgraph-port-mismatch")!;
    expect(issue).toBeDefined();
    expect(issue.node).toBe("short");
    expect(issue.message).toContain("expects text");
    expect(issue.message).toContain("produces image[]");
  });

  test("port mismatch at the exit boundary is a lint error", () => {
    const g = parseWorkflowGraph({
      name: "t",
      nodes: [
        { id: "research", type: "generate-text", params: { prompt: "x" } },
        { id: "short", type: "subgraph", in: { script: "research.out" }, params: { name: "short-branch" } },
        // tts.text declares text; the subgraph exit is video.
        { id: "vo", type: "tts", in: { text: "short.out" } },
      ],
    });
    const r = expandGraphSubgraphs(g, RESOLVE);
    const issue = r.issues.find((i) => i.code === "subgraph-port-mismatch")!;
    expect(issue.node).toBe("vo");
    expect(issue.message).toContain("expects text");
    expect(issue.message).toContain("produces video");
  });

  test("unknown override key is a lint error naming the declared surface", () => {
    const g = parseWorkflowGraph({
      name: "t",
      nodes: [
        {
          id: "short",
          type: "subgraph",
          params: { name: "short-branch", overrides: { "no-such-knob": 3 } },
        },
      ],
    });
    const r = expandGraphSubgraphs(g, RESOLVE);
    const issue = r.issues.find((i) => i.code === "subgraph-unknown-override")!;
    expect(issue.node).toBe("short");
    expect(issue.message).toContain('"no-such-knob"');
    expect(issue.message).toContain("video-model");
  });

  test("missing subgraph and missing params.name are lint errors", () => {
    const g = parseWorkflowGraph({
      name: "t",
      nodes: [
        { id: "a", type: "subgraph", params: { name: "ghost-branch" } },
        { id: "b", type: "subgraph", params: {} },
      ],
    });
    const r = expandGraphSubgraphs(g, RESOLVE);
    expect(r.issues.filter((i) => i.code === "subgraph-missing")).toHaveLength(2);
    // Failed instances stay in the graph (validation still covers the rest).
    expect(r.graph.nodes.map((n) => n.id)).toEqual(["a", "b"]);
  });

  test("wiring an undeclared entry / consuming an undeclared exit are lint errors", () => {
    const g = parseWorkflowGraph({
      name: "t",
      nodes: [
        { id: "research", type: "generate-text", params: { prompt: "x" } },
        {
          id: "short",
          type: "subgraph",
          in: { screenplay: "research.out" }, // not a declared entry
          params: { name: "short-branch" },
        },
        { id: "post", type: "youtube-upload", in: { video: "short.final" } }, // not a declared exit
      ],
    });
    const r = expandGraphSubgraphs(g, RESOLVE);
    const codes = r.issues.map((i) => i.code);
    expect(codes.filter((c) => c === "subgraph-unknown-port")).toHaveLength(2);
    expect(r.issues.some((i) => i.node === "short" && i.message.includes('"screenplay"'))).toBe(true);
    expect(r.issues.some((i) => i.node === "post" && i.message.includes("short.final"))).toBe(true);
  });

  test('an instance named "artifact" is refused (ref-scheme collision)', () => {
    const g = parseWorkflowGraph({
      name: "t",
      nodes: [{ id: "artifact", type: "subgraph", params: { name: "short-branch" } }],
    });
    const r = expandGraphSubgraphs(g, RESOLVE);
    expect(r.issues.some((i) => i.code === "subgraph-invalid" && i.message.includes("artifact:"))).toBe(true);
  });

  test("a broken definition is surfaced and never expanded", () => {
    const broken = {
      name: "nested-branch",
      nodes: [{ id: "inner", type: "subgraph", params: { name: "short-branch" } }],
    };
    const g = parseWorkflowGraph({
      name: "t",
      nodes: [{ id: "unit", type: "subgraph", params: { name: "nested-branch" } }],
    });
    const r = expandGraphSubgraphs(g, resolverFor({ "nested-branch": broken, "short-branch": SHORT_BRANCH }));
    expect(r.issues.some((i) => i.code === "subgraph-nested")).toBe(true);
    expect(r.instances).toEqual([]);
    expect(r.graph.nodes.map((n) => n.id)).toEqual(["unit"]);
  });

  test("two instances of the same subgraph expand collision-free", () => {
    const g = parseWorkflowGraph({
      name: "t",
      nodes: [
        { id: "research", type: "generate-text", params: { prompt: "x" } },
        { id: "short-a", type: "subgraph", in: { script: "research.out" }, params: { name: "short-branch" } },
        { id: "short-b", type: "subgraph", in: { script: "research.out" }, params: { name: "short-branch" } },
      ],
    });
    const r = expandGraphSubgraphs(g, RESOLVE);
    expect(r.issues).toEqual([]);
    expect(r.graph.nodes.map((n) => n.id)).toEqual([
      "research",
      "short-a:write",
      "short-a:clip",
      "short-b:write",
      "short-b:clip",
    ]);
    expect(validateWorkflowGraph(r.graph).ok).toBe(true);
  });
});

// ─── lintWorkflowFile integration (workspace subgraphs/ tier) ────────────────

describe("lintWorkflowFile with subgraphs", () => {
  function seedWorkspace(slug: string): void {
    tmp = makeTmpRoot("ralphy-subgraph-lint");
    fs.mkdirSync(workspaceDir(slug), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir(slug), "workspace.json"), JSON.stringify({ slug }));
    fs.mkdirSync(workflowsDir(slug), { recursive: true });
    fs.mkdirSync(subgraphsDir(slug), { recursive: true });
  }

  test("a workflow instantiating a workspace subgraph lints green; size stays authored", () => {
    seedWorkspace("sgws");
    fs.writeFileSync(
      path.join(subgraphsDir("sgws"), "short-branch.json"),
      JSON.stringify(SHORT_BRANCH),
    );
    const file = path.join(workflowsDir("sgws"), "pipeline.json");
    fs.writeFileSync(file, JSON.stringify(OUTER));
    const r = lintWorkflowFile(file, "sgws");
    expect(r.kind).toBe("graph");
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.size).toBe(3); // authored node count, not the expanded 4
  });

  test("a missing subgraph ref is a structured lint error", () => {
    seedWorkspace("sgws2");
    const file = path.join(workflowsDir("sgws2"), "pipeline.json");
    fs.writeFileSync(file, JSON.stringify(OUTER));
    const r = lintWorkflowFile(file, "sgws2");
    expect(r.ok).toBe(false);
    const issue = r.errors.find((e) => e.code === "subgraph-missing")!;
    expect(issue.node).toBe("short");
    expect(issue.message).toContain("short-branch");
  });

  test("no workspace context and no subgraphsDir → subgraph refs cannot resolve", () => {
    seedWorkspace("sgws3");
    const file = path.join(workflowsDir("sgws3"), "pipeline.json");
    fs.writeFileSync(file, JSON.stringify(OUTER));
    const r = lintWorkflowFile(file); // no ws, no opts
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "subgraph-missing")).toBe(true);
  });

  test("an explicit subgraphsDir wins (the #502 bundle-lint shape)", () => {
    seedWorkspace("sgws4");
    const altDir = path.join(workspaceDir("sgws4"), "alt-subgraphs");
    fs.mkdirSync(altDir, { recursive: true });
    fs.writeFileSync(path.join(altDir, "short-branch.json"), JSON.stringify(SHORT_BRANCH));
    const file = path.join(workflowsDir("sgws4"), "pipeline.json");
    fs.writeFileSync(file, JSON.stringify(OUTER));
    expect(lintWorkflowFile(file, "sgws4").ok).toBe(false); // ws tier is empty
    expect(lintWorkflowFile(file, "sgws4", { subgraphsDir: altDir }).ok).toBe(true);
  });
});

// ─── Workspace usage / summaries ─────────────────────────────────────────────

describe("subgraph usage + summaries", () => {
  test("usedBy maps instantiations; unused subgraphs are named", () => {
    tmp = makeTmpRoot("ralphy-subgraph-usage");
    const ws = "usews";
    fs.mkdirSync(workflowsDir(ws), { recursive: true });
    fs.mkdirSync(subgraphsDir(ws), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir(ws), "workspace.json"), JSON.stringify({ slug: ws }));
    fs.writeFileSync(path.join(subgraphsDir(ws), "short-branch.json"), JSON.stringify(SHORT_BRANCH));
    fs.writeFileSync(
      path.join(subgraphsDir(ws), "retired-branch.json"),
      JSON.stringify({ ...SHORT_BRANCH, name: "retired-branch" }),
    );
    fs.writeFileSync(path.join(workflowsDir(ws), "pipeline.json"), JSON.stringify(OUTER));

    expect(listSubgraphNames(ws)).toEqual(["retired-branch", "short-branch"]);
    const usage = subgraphUsage(ws);
    expect(usage.usedBy["short-branch"]).toEqual(["pipeline"]);
    expect(usage.unused).toEqual(["retired-branch"]);

    const rows = listSubgraphSummaries(ws);
    expect(rows.map((r) => r.name)).toEqual(["retired-branch", "short-branch"]);
    const short = rows.find((r) => r.name === "short-branch")!;
    expect(short.ok).toBe(true);
    expect(short.entry).toEqual({ script: "text" });
    expect(short.exit).toEqual({ out: "video" });
    expect(short.overrides).toEqual(["video-model"]);
    expect(short.usedBy).toEqual(["pipeline"]);
    expect(short.error).toBeNull();
  });

  test("a broken subgraph file summarizes ok:false with the error", () => {
    tmp = makeTmpRoot("ralphy-subgraph-broken");
    const ws = "brokenws";
    fs.mkdirSync(subgraphsDir(ws), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir(ws), "workspace.json"), JSON.stringify({ slug: ws }));
    fs.writeFileSync(path.join(subgraphsDir(ws), "bad.json"), "{ not json");
    const rows = listSubgraphSummaries(ws);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ok).toBe(false);
    expect(rows[0]!.error).toBeTruthy();
  });

  test("dirSubgraphResolver distinguishes missing from invalid", () => {
    tmp = makeTmpRoot("ralphy-subgraph-resolve");
    const dir = path.join(tmp.dir, "subgraphs");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "bad.json"), "{ not json");
    const resolve = dirSubgraphResolver(dir);
    const missing = resolve("ghost");
    expect("error" in missing && missing.error.code).toBe("subgraph-missing");
    const invalid = resolve("bad");
    expect("error" in invalid && invalid.error.code).toBe("subgraph-invalid");
    const none = dirSubgraphResolver(null)("anything");
    expect("error" in none && none.error.code).toBe("subgraph-missing");
  });
});
