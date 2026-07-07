// Node-graph workflow validation (#498) — the semantic half of the schema in
// cli/lib/schemas/workflow.ts.
//
// validateWorkflowGraph() runs AFTER the Zod parse and returns structured
// issues that name the node and the fix: duplicate ids, unknown in-ports,
// unresolved edges, port-type mismatches, on_fail route targets, cycles (the
// graph must be a DAG), and #497 provider-coverage checks on media nodes.
//
// Coverage semantics at graph import (D-02 / #498): an UNKNOWN (model,
// capability, provider) triple produces NO issue (no entry = no data, per
// coverage.ts); a param the entry declares in `unsupportedParams` is a HARD
// error — unlike the warn-only generate path (#497), a farm graph fails at
// import, before any spend. A param merely outside `supportedParams` (and not
// declared unsupported) stays a warning, mirroring coverageWarnings().
//
// lintWorkflowFile() is the offline file-level entry point behind
// `ralphy workflow lint`: it reads JSON or YAML (D-03 — JSON is the storage
// format; YAML is accepted at import/lint time), dispatches linear vs graph,
// and folds Zod errors into the same issue shape.

import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { ZodError } from "zod";
import {
  NODE_SIGNATURES,
  MEDIA_PORT_CONTRACTS,
  MEDIA_COVERAGE_PARAM_ALIASES,
  MEDIA_META_PARAM_KEYS,
  nodeCategory,
  nodeOutName,
  nodeOutType,
  portTypesMatch,
  parseWorkflowDocument,
  isWorkflowGraphDocument,
  type WorkflowGraph,
  type WorkflowNode,
} from "./schemas/workflow.js";
import { coverageFor, providersSupporting } from "./providers/coverage.js";
import { loadWorkspaceEvaluatorsSync } from "./workspace-evaluators.js";

// ─── Issue shape ─────────────────────────────────────────────────────────────

export type GraphIssueCode =
  | "schema" // Zod parse failure (shape)
  | "duplicate-node-id"
  | "unknown-in-port" // in-port name not in the node type's signature (closed signatures)
  | "unresolved-edge" // ref is not <node-id>.<out-name> of an existing node
  | "port-type-mismatch"
  | "route-target-missing" // on_fail: route:<id> points at no node
  | "cycle" // graph is not a DAG
  | "missing-required-port" // #512: a media signature's required in-port is neither wired nor param-fed
  | "coverage-unsupported-param" // HARD: param declared unsupported by the #497 matrix
  | "coverage-uncovered-param"; // warn: param outside declared coverage

export interface GraphIssue {
  level: "error" | "warning";
  code: GraphIssueCode;
  /** Node id the issue is about (null for graph-level issues like a cycle). */
  node: string | null;
  /** In-port name, when the issue is about a specific port/edge. */
  port?: string;
  message: string;
  /** The concrete fix, phrased for the workflow author. */
  fix: string;
}

export interface GraphValidation {
  ok: boolean;
  errors: GraphIssue[];
  warnings: GraphIssue[];
}

// ─── Edge grammar ────────────────────────────────────────────────────────────

// <node-id>.<out-name> — node ids are kebab-case (NODE_ID_RE), out names free-form.
const EDGE_RE = /^([a-z0-9][a-z0-9-]*)\.([A-Za-z0-9][A-Za-z0-9_-]*)$/;

/**
 * An in-port value that references an on-disk artifact instead of an upstream
 * node: the explicit `artifact:` scheme, or any path-looking value ("/").
 * Artifact refs are resolved by the runner (#499), not the graph checks.
 */
export function isArtifactRef(value: string): boolean {
  return value.startsWith("artifact:") || value.includes("/");
}

// ─── Graph validation ────────────────────────────────────────────────────────

/** Envelope keys inside media params that are the binding, not generation params. */
const MEDIA_BINDING_KEYS = new Set(["model", "provider"]);

/**
 * Validate a parsed WorkflowGraph. Pure — no I/O, ZERO model calls. Returns
 * every issue found (does not stop at the first), each naming the node and
 * the fix, so a lint run surfaces the whole repair list at once.
 */
export function validateWorkflowGraph(graph: WorkflowGraph): GraphValidation {
  const errors: GraphIssue[] = [];
  const warnings: GraphIssue[] = [];

  // 1. Unique node ids.
  const byId = new Map<string, WorkflowNode>();
  for (const node of graph.nodes) {
    if (byId.has(node.id)) {
      errors.push({
        level: "error",
        code: "duplicate-node-id",
        node: node.id,
        message: `node id "${node.id}" is used more than once`,
        fix: `rename one of the "${node.id}" nodes — ids must be unique in the graph`,
      });
    } else {
      byId.set(node.id, node);
    }
  }

  // 2. Edges: in-port names, resolution, port types. Collect data edges for the DAG check.
  const dataEdges = new Map<string, Set<string>>(); // producer id -> consumer ids
  for (const node of graph.nodes) {
    const signature = NODE_SIGNATURES[node.type];
    for (const [port, ref] of Object.entries(node.in)) {
      const declared = signature.inputs[port];
      if (declared === undefined && !signature.openInputs) {
        errors.push({
          level: "error",
          code: "unknown-in-port",
          node: node.id,
          port,
          message: `node "${node.id}" (${node.type}) has no in-port "${port}"`,
          fix:
            Object.keys(signature.inputs).length > 0
              ? `use one of the ${node.type} in-ports: ${Object.keys(signature.inputs).join(", ")}`
              : `${node.type} takes no in-ports — remove "${port}"`,
        });
        continue;
      }
      if (isArtifactRef(ref)) continue; // resolved by the runner, not typed here
      const m = EDGE_RE.exec(ref);
      if (!m) {
        errors.push({
          level: "error",
          code: "unresolved-edge",
          node: node.id,
          port,
          message: `node "${node.id}" in-port "${port}" ref "${ref}" is neither <node-id>.<out-name> nor an artifact ref`,
          fix: `wire "${port}" as "<node-id>.<out-name>" (e.g. "research.out") or an artifact ref ("artifact:<path>")`,
        });
        continue;
      }
      const [, producerId, outName] = m;
      const producer = byId.get(producerId!);
      if (!producer) {
        errors.push({
          level: "error",
          code: "unresolved-edge",
          node: node.id,
          port,
          message: `node "${node.id}" in-port "${port}" references missing node "${producerId}"`,
          fix: `add a node with id "${producerId}" or point "${port}" at an existing node (${[...byId.keys()].join(", ") || "none yet"})`,
        });
        continue;
      }
      const producerOut = nodeOutName(producer);
      if (outName !== producerOut) {
        errors.push({
          level: "error",
          code: "unresolved-edge",
          node: node.id,
          port,
          message: `node "${node.id}" in-port "${port}" references "${producerId}.${outName}" but node "${producerId}" outputs "${producerOut}"`,
          fix: `wire "${port}" to "${producerId}.${producerOut}"`,
        });
        continue;
      }
      const wantType = declared ?? "any";
      const gotType = nodeOutType(producer);
      if (!portTypesMatch(wantType, gotType)) {
        errors.push({
          level: "error",
          code: "port-type-mismatch",
          node: node.id,
          port,
          message: `node "${node.id}" in-port "${port}" expects ${wantType} but "${producerId}.${producerOut}" produces ${gotType}`,
          fix: `feed "${port}" a ${wantType} producer, or insert a converting node between "${producerId}" and "${node.id}"`,
        });
        continue;
      }
      if (producerId !== node.id) {
        if (!dataEdges.has(producerId!)) dataEdges.set(producerId!, new Set());
        dataEdges.get(producerId!)!.add(node.id);
      } else {
        errors.push({
          level: "error",
          code: "cycle",
          node: node.id,
          port,
          message: `node "${node.id}" consumes its own output ("${ref}")`,
          fix: `remove the self-edge on "${node.id}" — a node cannot feed itself`,
        });
      }
    }

    // 2b. #512 media port contracts: a required in-port must be wired or
    // satisfied by a params key (an inline path / prompt is as good as an
    // upstream edge). Violations fail at lint, not after a paid call.
    const contract = MEDIA_PORT_CONTRACTS[node.type];
    if (contract) {
      const satisfied = (port: string, fallbacks: string[]): boolean =>
        node.in[port] !== undefined || fallbacks.some((k) => node.params[k] !== undefined);
      for (const [port, fallbacks] of Object.entries(contract.required)) {
        if (satisfied(port, fallbacks)) continue;
        errors.push({
          level: "error",
          code: "missing-required-port",
          node: node.id,
          port,
          message: `node "${node.id}" (${node.type}) is missing its required "${port}" in-port`,
          fix: `wire "${port}" from an upstream node or set ${fallbacks.map((k) => `params.${k}`).join(" / ")}`,
        });
      }
      for (const group of contract.oneOf ?? []) {
        const names = Object.keys(group);
        if (names.some((p) => satisfied(p, group[p]!))) continue;
        errors.push({
          level: "error",
          code: "missing-required-port",
          node: node.id,
          message: `node "${node.id}" (${node.type}) needs at least one of the in-ports: ${names.join(", ")}`,
          fix: `wire one of ${names.map((n) => `"${n}"`).join(", ")} or set the matching param (${names.map((n) => `params.${group[n]![0]}`).join(" / ")})`,
        });
      }
    }

    // 3. on_fail route target.
    if (node.on_fail.startsWith("route:")) {
      const target = node.on_fail.slice("route:".length);
      if (!byId.has(target)) {
        errors.push({
          level: "error",
          code: "route-target-missing",
          node: node.id,
          message: `node "${node.id}" on_fail routes to missing node "${target}"`,
          fix: `add a node with id "${target}" or change on_fail to halt | skip | route:<existing-node-id>`,
        });
      }
    }

    // 4. #497 coverage matrix (media nodes with a resolved model+provider binding).
    if (signature.capability) {
      const model = typeof node.params.model === "string" ? node.params.model : undefined;
      const provider = typeof node.params.provider === "string" ? node.params.provider : undefined;
      if (model && provider) {
        const entry = coverageFor(model, signature.capability, provider);
        if (entry) {
          // Unknown triple (no entry) is silent by contract — unknown ≠ unsupported.
          // #512: media nodes are checked on params AND wired in-ports (a wired
          // `ref_videos` edge is a passed param), each mapped to its
          // connector-input spelling; plumbing-only keys are excluded.
          const paramKeys = Object.keys(node.params).filter(
            (k) => !MEDIA_BINDING_KEYS.has(k) && !MEDIA_META_PARAM_KEYS.has(k),
          );
          const portKeys = nodeCategory(node.type) === "media" ? Object.keys(node.in) : [];
          for (const key of [...new Set([...paramKeys, ...portKeys])]) {
            const covKey = MEDIA_COVERAGE_PARAM_ALIASES[key] ?? key;
            if (entry.supportedParams.includes(covKey)) continue;
            const alternatives = providersSupporting(covKey, signature.capability, entry.family)
              .concat(providersSupporting(covKey, signature.capability))
              .filter((e) => e.provider !== provider);
            const alt = alternatives[0];
            const altHint = alt
              ? `use provider "${alt.provider}" with model "${alt.model}", which supports it`
              : `drop "${key}" or pick a (model, provider) pair that covers it (see \`ralphy provider matrix --model ${model}\`)`;
            if (entry.unsupportedParams.includes(covKey)) {
              errors.push({
                level: "error",
                code: "coverage-unsupported-param",
                node: node.id,
                message: `node "${node.id}" passes param "${key}" which provider "${provider}" does NOT support for ${model}`,
                fix: altHint,
              });
            } else {
              warnings.push({
                level: "warning",
                code: "coverage-uncovered-param",
                node: node.id,
                message: `node "${node.id}" param "${key}" is outside provider "${provider}" declared coverage for ${model}`,
                fix: altHint,
              });
            }
          }
        }
      }
    }
  }

  // 5. DAG check over the data edges (route edges are failure routing, not flow).
  const cycle = findCycle(graph.nodes.map((n) => n.id), dataEdges);
  if (cycle) {
    errors.push({
      level: "error",
      code: "cycle",
      node: cycle[0] ?? null,
      message: `graph has a cycle: ${cycle.join(" -> ")}`,
      fix: `break the cycle — remove or rewire one of the in-port edges along ${cycle.join(" -> ")}`,
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** First cycle found via iterative DFS (white/grey/black), as a node-id path, or null. */
function findCycle(ids: string[], edges: Map<string, Set<string>>): string[] | null {
  const state = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 on stack, 2 done
  for (const start of ids) {
    if (state.get(start)) continue;
    const stack: Array<{ id: string; iter: Iterator<string> }> = [
      { id: start, iter: (edges.get(start) ?? new Set()).values() },
    ];
    state.set(start, 1);
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const next = top.iter.next();
      if (next.done) {
        state.set(top.id, 2);
        stack.pop();
        continue;
      }
      const child = next.value;
      const s = state.get(child) ?? 0;
      if (s === 1) {
        // Found a back edge — reconstruct the cycle path.
        const cyclePath = [child];
        for (let i = stack.length - 1; i >= 0; i--) {
          cyclePath.push(stack[i]!.id);
          if (stack[i]!.id === child) break;
        }
        return cyclePath.reverse();
      }
      if (s === 0) {
        state.set(child, 1);
        stack.push({ id: child, iter: (edges.get(child) ?? new Set()).values() });
      }
    }
  }
  return null;
}

// ─── File-level lint (behind `ralphy workflow lint`) ─────────────────────────

export type WorkflowFileFormat = "json" | "yaml";

export interface WorkflowLintResult {
  name: string;
  path: string;
  format: WorkflowFileFormat;
  /** linear (#478 steps) | graph (#498 nodes) | invalid (unreadable / unparseable). */
  kind: "linear" | "graph" | "invalid";
  /** Node count for graphs, step count for linear workflows. */
  size: number;
  ok: boolean;
  errors: GraphIssue[];
  warnings: GraphIssue[];
}

function zodIssues(e: ZodError): GraphIssue[] {
  return e.issues.map((i) => ({
    level: "error" as const,
    code: "schema" as const,
    node: null,
    message: `${i.path.join(".") || "(root)"}: ${i.message}`,
    fix: "fix the field to match the workflow schema (cli/lib/schemas/workflow.ts)",
  }));
}

/**
 * Lint one workflow file offline: read (JSON or YAML per extension — D-03),
 * parse, and for graphs run the full validateWorkflowGraph() pass; for legacy
 * linear workflows re-check the #478 contract (schema + gate criteria against
 * the workspace evaluators when `ws` is given). Never throws on content
 * problems — they come back as issues.
 */
export function lintWorkflowFile(filePath: string, ws?: string): WorkflowLintResult {
  const format: WorkflowFileFormat = /\.ya?ml$/.test(filePath) ? "yaml" : "json";
  const name = path.basename(filePath).replace(/\.(json|ya?ml)$/, "");
  const base = { name, path: filePath, format };

  let raw: unknown;
  try {
    const src = fs.readFileSync(filePath, "utf-8");
    raw = format === "yaml" ? parseYaml(src) : JSON.parse(src);
  } catch (e) {
    return {
      ...base,
      kind: "invalid",
      size: 0,
      ok: false,
      errors: [
        {
          level: "error",
          code: "schema",
          node: null,
          message: `cannot read/parse ${format.toUpperCase()}: ${(e as Error).message}`,
          fix: `make ${filePath} valid ${format.toUpperCase()}`,
        },
      ],
      warnings: [],
    };
  }

  const kind = isWorkflowGraphDocument(raw) ? "graph" : "linear";
  let doc;
  try {
    doc = parseWorkflowDocument(raw);
  } catch (e) {
    const errors = e instanceof ZodError ? zodIssues(e) : [
      {
        level: "error" as const,
        code: "schema" as const,
        node: null,
        message: (e as Error).message,
        fix: "fix the document to match the workflow schema (cli/lib/schemas/workflow.ts)",
      },
    ];
    return { ...base, kind, size: 0, ok: false, errors, warnings: [] };
  }

  if (doc.kind === "graph") {
    const v = validateWorkflowGraph(doc.graph);
    return { ...base, kind: "graph", size: doc.graph.nodes.length, ...v };
  }

  // Legacy linear workflow: the schema already parsed; re-run the #478 gate
  // criteria check against the workspace evaluators when we know the workspace.
  const errors: GraphIssue[] = [];
  if (ws) {
    const known = new Set((loadWorkspaceEvaluatorsSync(ws)?.criteria ?? []).map((c) => c.id));
    if (known.size > 0) {
      for (const step of doc.workflow.steps) {
        for (const g of step.gate) {
          if (!known.has(g)) {
            errors.push({
              level: "error",
              code: "schema",
              node: step.id,
              message: `step "${step.id}" gates on unknown criterion "${g}" — not in ${ws}/evaluators.json`,
              fix: `use one of: ${[...known].join(", ")}`,
            });
          }
        }
      }
    }
  }
  return {
    ...base,
    kind: "linear",
    size: doc.workflow.steps.length,
    ok: errors.length === 0,
    errors,
    warnings: [],
  };
}
