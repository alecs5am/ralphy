// Reusable named subgraphs (#517) — load, definition checks, and expansion.
//
// Storage: `.ralphy/workspaces/<ws>/subgraphs/<name>.json` (subgraphsDir —
// the sibling tier of `workflows/`). Schema: SubgraphSchema in
// cli/lib/schemas/workflow.ts (typed entry/exit ports + param surface + the
// inner #498 nodes).
//
// Expansion is DETERMINISTIC and happens BEFORE anything semantic sees the
// graph: `lintWorkflowFile` expands before validateWorkflowGraph (so cycle /
// port / coverage checks run on the expanded graph) and the farm runner's
// loadGraphWorkflows expands before execution (so journal records, #510
// branch scoping, and resume all operate on the expanded flat graph — the
// runner needs no subgraph awareness at all).
//
// Namespacing: an inner node id becomes `<instance-id>:<inner-id>`.
//   • ":" cannot appear in an authored id (NODE_ID_RE is kebab-case), so the
//     namespaced form never collides with a top-level node.
//   • ":" composes with the #510 branch suffix: `<inst>:<inner>@<branch>`.
//   • "/" was rejected as the separator because isArtifactRef() treats any
//     "/"-containing in-port value as an artifact path. The one residual
//     ambiguity of ":" — the `artifact:<path>` ref scheme — is closed by
//     refusing a subgraph instance node named "artifact" (lint error).
//
// ONE LEVEL OF NESTING ONLY: a subgraph definition may not contain a
// `subgraph` node (subgraph-nested lint error) — mirrors the #510
// nested-fan-out constraint. A subgraph MAY contain a `fan-out`; instantiate
// it at the top level only (expanding it inside another fan-out's branch
// still halts with the #510 nested-fan-out error, as before).

import fs from "node:fs";
import path from "node:path";
import { subgraphsDir } from "./paths.js";
import { listWorkflowNames, workflowPath } from "./workflow.js";
import {
  NODE_SIGNATURES,
  nodeOutName,
  nodeOutType,
  portTypesMatch,
  parseSubgraph,
  parseWorkflowDocument,
  type Subgraph,
  type WorkflowGraph,
  type WorkflowNode,
} from "./schemas/workflow.js";
import type { GraphIssue } from "./workflow-graph.js";

/** The namespacing separator: `<instance-id>:<inner-id>` (see header). */
export const SUBGRAPH_ID_SEP = ":";

const SUBGRAPH_EXT = ".json";

// Authored (pre-expansion) edge grammar — expansion runs before any
// namespaced id exists inside a single graph document, so one ":" segment is
// never expected here.
const EDGE_RE = /^([a-z0-9][a-z0-9-]*)\.([A-Za-z0-9][A-Za-z0-9_-]*)$/;

/** Entry/exit port names ride the edge grammar's out-name slot. */
const PORT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

// ─── Storage ─────────────────────────────────────────────────────────────────

export function subgraphPath(ws: string, name: string): string {
  return path.join(subgraphsDir(ws), `${name}${SUBGRAPH_EXT}`);
}

/** Names of the subgraphs authored in a workspace (basenames, sorted). */
export function listSubgraphNames(ws: string): string[] {
  try {
    return fs
      .readdirSync(subgraphsDir(ws))
      .filter((f) => f.endsWith(SUBGRAPH_EXT))
      .map((f) => f.slice(0, -SUBGRAPH_EXT.length))
      .sort();
  } catch {
    return [];
  }
}

// ─── Resolution ──────────────────────────────────────────────────────────────

export type SubgraphResolution =
  | { sub: Subgraph }
  | { error: { code: "subgraph-missing" | "subgraph-invalid"; message: string } };

export type SubgraphResolver = (name: string) => SubgraphResolution;

/**
 * Resolver over a directory of `<name>.json` subgraph files. `dir: null`
 * resolves nothing (every lookup is subgraph-missing) — the shape a lint run
 * takes when no workspace / bundle subgraph tier is available.
 */
export function dirSubgraphResolver(dir: string | null): SubgraphResolver {
  return (name) => {
    if (!dir) {
      return {
        error: {
          code: "subgraph-missing",
          message: `no subgraphs directory available to resolve subgraph "${name}"`,
        },
      };
    }
    const file = path.join(dir, `${name}${SUBGRAPH_EXT}`);
    let src: string;
    try {
      src = fs.readFileSync(file, "utf-8");
    } catch {
      return {
        error: { code: "subgraph-missing", message: `subgraph "${name}" not found at ${file}` },
      };
    }
    try {
      return { sub: parseSubgraph(JSON.parse(src)) };
    } catch (e) {
      return {
        error: {
          code: "subgraph-invalid",
          message: `subgraph "${name}" (${file}) does not parse: ${(e as Error).message}`,
        },
      };
    }
  };
}

// ─── Definition checks ───────────────────────────────────────────────────────

const issue = (
  code: GraphIssue["code"],
  node: string | null,
  message: string,
  fix: string,
): GraphIssue => ({ level: "error", code, node, message, fix });

/**
 * Validate a parsed subgraph DEFINITION: no nested `subgraph` node (one level
 * only), entry/exit/param targets exist, declared boundary types agree with
 * the inner nodes' signatures, and port names fit the edge grammar. Deep
 * graph checks (cycles, inner edge resolution, coverage) run POST-EXPANSION
 * on every instantiating workflow via validateWorkflowGraph.
 */
export function validateSubgraphDefinition(sub: Subgraph): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const byId = new Map(sub.nodes.map((n) => [n.id, n] as const));

  for (const n of sub.nodes) {
    if (n.type === "subgraph") {
      issues.push(
        issue(
          "subgraph-nested",
          n.id,
          `subgraph "${sub.name}" contains a subgraph node "${n.id}" — one level of nesting only (mirrors the #510 fan-out constraint)`,
          `inline the inner subgraph's nodes into "${sub.name}", or instantiate both subgraphs side by side at the workflow level`,
        ),
      );
    }
  }

  for (const [portName, e] of Object.entries(sub.entry)) {
    if (!PORT_NAME_RE.test(portName)) {
      issues.push(
        issue(
          "subgraph-invalid",
          null,
          `subgraph "${sub.name}" entry port "${portName}" is not a valid port name`,
          `rename the entry port to match ${PORT_NAME_RE}`,
        ),
      );
    }
    const target = byId.get(e.node);
    if (!target) {
      issues.push(
        issue(
          "subgraph-invalid",
          null,
          `subgraph "${sub.name}" entry "${portName}" targets missing inner node "${e.node}"`,
          `point the entry at one of the inner nodes: ${[...byId.keys()].join(", ") || "none yet"}`,
        ),
      );
      continue;
    }
    const sig = NODE_SIGNATURES[target.type];
    const declared = sig.inputs[e.port] ?? (sig.openInputs ? "any" : undefined);
    if (declared === undefined) {
      issues.push(
        issue(
          "subgraph-invalid",
          e.node,
          `subgraph "${sub.name}" entry "${portName}" targets "${e.node}" in-port "${e.port}", which ${target.type} does not declare`,
          `use one of the ${target.type} in-ports: ${Object.keys(sig.inputs).join(", ") || "none"}`,
        ),
      );
    } else if (!portTypesMatch(e.type, declared)) {
      issues.push(
        issue(
          "subgraph-invalid",
          e.node,
          `subgraph "${sub.name}" entry "${portName}" declares type ${e.type} but inner port "${e.node}.${e.port}" is ${declared}`,
          `declare the entry as ${declared}, or target a port of type ${e.type}`,
        ),
      );
    }
  }

  for (const [exitName, x] of Object.entries(sub.exit)) {
    if (!PORT_NAME_RE.test(exitName)) {
      issues.push(
        issue(
          "subgraph-invalid",
          null,
          `subgraph "${sub.name}" exit port "${exitName}" is not a valid port name`,
          `rename the exit port to match ${PORT_NAME_RE}`,
        ),
      );
    }
    const target = byId.get(x.node);
    if (!target) {
      issues.push(
        issue(
          "subgraph-invalid",
          null,
          `subgraph "${sub.name}" exit "${exitName}" targets missing inner node "${x.node}"`,
          `point the exit at one of the inner nodes: ${[...byId.keys()].join(", ") || "none yet"}`,
        ),
      );
      continue;
    }
    const produced = nodeOutType(target);
    if (!portTypesMatch(x.type, produced)) {
      issues.push(
        issue(
          "subgraph-invalid",
          x.node,
          `subgraph "${sub.name}" exit "${exitName}" declares type ${x.type} but inner node "${x.node}" produces ${produced}`,
          `declare the exit as ${produced}, or expose a node that produces ${x.type}`,
        ),
      );
    }
  }

  for (const [key, p] of Object.entries(sub.params)) {
    if (!byId.get(p.node)) {
      issues.push(
        issue(
          "subgraph-invalid",
          null,
          `subgraph "${sub.name}" param surface key "${key}" targets missing inner node "${p.node}"`,
          `point the param at one of the inner nodes: ${[...byId.keys()].join(", ") || "none yet"}`,
        ),
      );
    }
  }

  return issues;
}

// ─── Expansion ───────────────────────────────────────────────────────────────

export interface SubgraphExpansion {
  /** The expanded graph (identical to the input when it has no subgraph nodes). */
  graph: WorkflowGraph;
  /** Expansion-time lint issues (all error-level). */
  issues: GraphIssue[];
  /** Instance node ids that were expanded away. */
  instances: string[];
}

/**
 * Expand every `subgraph` node into the flat graph:
 *   • inner ids namespaced `<instance>:<inner>`, inner edges + on_fail routes
 *     rewritten to the namespaced form;
 *   • declared entry ports wired to the instance's in-port refs (boundary
 *     type checked against the outer producer — subgraph-port-mismatch);
 *   • consumers of `<instance>.<exit>` rewired to the namespaced inner exit
 *     node (boundary type checked against the consumer's declared port);
 *   • `params.overrides` applied through the declared param surface (unknown
 *     key — subgraph-unknown-override).
 * A failing instance (missing/invalid definition, reserved id) is KEPT
 * unexpanded so the caller still validates the rest; its issues are errors.
 * Deterministic — same inputs, same ids — which is what makes resume across
 * the expansion free (#503/#510 journals key the namespaced ids).
 */
export function expandGraphSubgraphs(
  graph: WorkflowGraph,
  resolve: SubgraphResolver,
): SubgraphExpansion {
  if (!graph.nodes.some((n) => n.type === "subgraph")) {
    return { graph, issues: [], instances: [] };
  }

  const issues: GraphIssue[] = [];
  const nodes: WorkflowNode[] = structuredClone(graph.nodes);
  const byId = new Map(nodes.map((n) => [n.id, n] as const));

  // 1. Resolve + definition-check every instance.
  const resolved = new Map<string, Subgraph>();
  for (const inst of nodes) {
    if (inst.type !== "subgraph") continue;
    const name =
      typeof inst.params.name === "string" && inst.params.name.length > 0
        ? inst.params.name
        : null;
    if (!name) {
      issues.push(
        issue(
          "subgraph-missing",
          inst.id,
          `subgraph node "${inst.id}" has no params.name — a subgraph node instantiates a named subgraph`,
          `set params.name to a subgraph under the workspace's subgraphs/ tier`,
        ),
      );
      continue;
    }
    if (inst.id === "artifact") {
      issues.push(
        issue(
          "subgraph-invalid",
          inst.id,
          `a subgraph instance may not be named "artifact" — the expanded "artifact:<inner>" ids would collide with the artifact:<path> ref scheme`,
          `rename the "${inst.id}" node`,
        ),
      );
      continue;
    }
    const r = resolve(name);
    if ("error" in r) {
      issues.push(
        issue(
          r.error.code,
          inst.id,
          r.error.message,
          r.error.code === "subgraph-missing"
            ? `author subgraphs/${name}.json in the workspace (see SubgraphSchema in cli/lib/schemas/workflow.ts) or fix params.name on "${inst.id}"`
            : `fix the subgraph file to match SubgraphSchema (cli/lib/schemas/workflow.ts)`,
        ),
      );
      continue;
    }
    const defIssues = validateSubgraphDefinition(r.sub);
    if (defIssues.length > 0) {
      issues.push(...defIssues);
      continue; // a broken definition is never expanded
    }
    resolved.set(inst.id, r.sub);
  }

  /** Declared out type of an outer producer ref (instances answer with exit types). */
  const producerType = (ref: string): string | null => {
    const m = EDGE_RE.exec(ref);
    if (!m) return null;
    const p = byId.get(m[1]!);
    if (!p) return null;
    const sub = resolved.get(p.id);
    if (sub) return sub.exit[m[2]!]?.type ?? null;
    return m[2] === nodeOutName(p) ? nodeOutType(p) : null;
  };

  const ns = (inst: string, inner: string) => `${inst}${SUBGRAPH_ID_SEP}${inner}`;

  // 2. Replace each resolved instance with its namespaced inner nodes.
  const out: WorkflowNode[] = [];
  for (const node of nodes) {
    const sub = resolved.get(node.id);
    if (!sub) {
      out.push(node); // regular node, or a failed instance kept as-is
      continue;
    }

    // Overrides → per-inner-node param assignments through the declared surface.
    const rawOverrides = (node.params as { overrides?: unknown }).overrides;
    const overrides =
      rawOverrides && typeof rawOverrides === "object" && !Array.isArray(rawOverrides)
        ? Object.entries(rawOverrides as Record<string, unknown>)
        : [];
    const ovByInner = new Map<string, Array<[string, unknown]>>();
    for (const [key, value] of overrides) {
      const target = sub.params[key];
      if (!target) {
        issues.push(
          issue(
            "subgraph-unknown-override",
            node.id,
            `node "${node.id}" overrides unknown key "${key}" — subgraph "${sub.name}" declares: ${Object.keys(sub.params).join(", ") || "none"}`,
            `use a declared override key, or add "${key}" to the subgraph's param surface`,
          ),
        );
        continue;
      }
      ovByInner.set(target.node, [...(ovByInner.get(target.node) ?? []), [target.param, value]]);
    }

    const innerIds = new Set(sub.nodes.map((n) => n.id));
    const clones = new Map<string, WorkflowNode>();
    for (const inner of sub.nodes) {
      const clone: WorkflowNode = structuredClone(inner);
      clone.id = ns(node.id, inner.id);
      const rewired: Record<string, string> = {};
      for (const [port, ref] of Object.entries(clone.in)) {
        const m = EDGE_RE.exec(ref);
        rewired[port] = m && innerIds.has(m[1]!) ? `${ns(node.id, m[1]!)}.${m[2]}` : ref;
      }
      clone.in = rewired;
      if (clone.on_fail.startsWith("route:")) {
        const target = clone.on_fail.slice("route:".length);
        if (innerIds.has(target)) clone.on_fail = `route:${ns(node.id, target)}`;
      }
      for (const [param, value] of ovByInner.get(inner.id) ?? []) {
        clone.params = { ...clone.params, [param]: value };
      }
      clones.set(inner.id, clone);
      out.push(clone);
    }

    // Entry wiring: the instance's in-port refs land on the declared inner ports.
    for (const [port, ref] of Object.entries(node.in)) {
      const entry = sub.entry[port];
      if (!entry) {
        issues.push(
          issue(
            "subgraph-unknown-port",
            node.id,
            `node "${node.id}" wires in-port "${port}" but subgraph "${sub.name}" declares no such entry (entries: ${Object.keys(sub.entry).join(", ") || "none"})`,
            `wire one of the declared entry ports, or declare "${port}" in the subgraph's entry map`,
          ),
        );
        continue;
      }
      const target = clones.get(entry.node)!;
      target.in = { ...target.in, [entry.port]: ref };
      const got = producerType(ref);
      if (got && !portTypesMatch(entry.type, got)) {
        issues.push(
          issue(
            "subgraph-port-mismatch",
            node.id,
            `node "${node.id}" entry "${port}" expects ${entry.type} but "${ref}" produces ${got}`,
            `feed "${port}" a ${entry.type} producer, or insert a converting node before "${node.id}"`,
          ),
        );
      }
    }
  }

  // 3. Exit rewiring: every surviving ref to `<instance>.<exit>` points at the
  //    namespaced inner exit node. Namespaced refs from step 2 contain ":" and
  //    never match the authored edge grammar, so they pass through untouched.
  for (const node of out) {
    const rewired: Record<string, string> = {};
    for (const [port, ref] of Object.entries(node.in)) {
      const m = EDGE_RE.exec(ref);
      const sub = m ? resolved.get(m[1]!) : undefined;
      if (!m || !sub) {
        rewired[port] = ref;
        continue;
      }
      const [, instId, exitName] = m;
      const exit = sub.exit[exitName!];
      if (!exit) {
        issues.push(
          issue(
            "subgraph-unknown-port",
            node.id,
            `node "${node.id}" in-port "${port}" references "${instId}.${exitName}" but subgraph "${sub.name}" declares exits: ${Object.keys(sub.exit).join(", ") || "none"}`,
            `wire "${port}" to one of the declared exits, or declare "${exitName}" in the subgraph's exit map`,
          ),
        );
        rewired[port] = ref;
        continue;
      }
      const exitNode = sub.nodes.find((n) => n.id === exit.node)!;
      rewired[port] = `${ns(instId!, exit.node)}.${nodeOutName(exitNode)}`;
      const sig = NODE_SIGNATURES[node.type];
      const declared = sig.inputs[port] ?? (sig.openInputs ? "any" : null);
      if (declared && !portTypesMatch(declared, exit.type)) {
        issues.push(
          issue(
            "subgraph-port-mismatch",
            node.id,
            `node "${node.id}" in-port "${port}" expects ${declared} but subgraph exit "${instId}.${exitName}" produces ${exit.type}`,
            `consume a ${declared} exit, or insert a converting node between "${instId}" and "${node.id}"`,
          ),
        );
      }
    }
    node.in = rewired;
  }

  return { graph: { ...graph, nodes: out }, issues, instances: [...resolved.keys()] };
}

// ─── Workspace-level usage (the `workflow subgraphs` verb + unused lint) ─────

export interface SubgraphUsage {
  /** Subgraph name → the workflow names that instantiate it. */
  usedBy: Record<string, string[]>;
  /** Authored subgraphs no workflow instantiates (lint WARNING, never an error). */
  unused: string[];
}

/** Scan a workspace's graph workflows for `subgraph` instantiations. */
export function subgraphUsage(ws: string): SubgraphUsage {
  const usedBy: Record<string, string[]> = {};
  for (const name of listSubgraphNames(ws)) usedBy[name] = [];
  for (const wfName of listWorkflowNames(ws)) {
    try {
      const raw = JSON.parse(fs.readFileSync(workflowPath(ws, wfName), "utf-8"));
      const doc = parseWorkflowDocument(raw);
      if (doc.kind !== "graph") continue;
      for (const n of doc.graph.nodes) {
        if (n.type !== "subgraph") continue;
        const ref = typeof n.params.name === "string" ? n.params.name : null;
        if (!ref) continue;
        usedBy[ref] = usedBy[ref] ?? [];
        if (!usedBy[ref]!.includes(wfName)) usedBy[ref]!.push(wfName);
      }
    } catch {
      /* malformed workflow file — `ralphy workflow lint` is the diagnosis path */
    }
  }
  const unused = listSubgraphNames(ws).filter((n) => (usedBy[n] ?? []).length === 0);
  return { usedBy, unused };
}

/** Row shape behind `ralphy workflow subgraphs <ws>` (out() contract). */
export interface SubgraphSummary {
  name: string;
  version: string | null;
  ok: boolean;
  nodes: number;
  entry: Record<string, string>;
  exit: Record<string, string>;
  overrides: string[];
  usedBy: string[];
  path: string;
  error: string | null;
}

/** Summarize every authored subgraph in a workspace (broken files included, ok:false). */
export function listSubgraphSummaries(ws: string): SubgraphSummary[] {
  const usage = subgraphUsage(ws);
  return listSubgraphNames(ws).map((name) => {
    const file = subgraphPath(ws, name);
    try {
      const sub = parseSubgraph(JSON.parse(fs.readFileSync(file, "utf-8")));
      const defIssues = validateSubgraphDefinition(sub);
      return {
        name,
        version: sub.version,
        ok: defIssues.length === 0,
        nodes: sub.nodes.length,
        entry: Object.fromEntries(Object.entries(sub.entry).map(([p, e]) => [p, e.type])),
        exit: Object.fromEntries(Object.entries(sub.exit).map(([x, e]) => [x, e.type])),
        overrides: Object.keys(sub.params),
        usedBy: usage.usedBy[name] ?? [],
        path: file,
        error: defIssues[0]?.message ?? null,
      };
    } catch (e) {
      return {
        name,
        version: null,
        ok: false,
        nodes: 0,
        entry: {},
        exit: {},
        overrides: [],
        usedBy: usage.usedBy[name] ?? [],
        path: file,
        error: (e as Error).message,
      };
    }
  });
}
