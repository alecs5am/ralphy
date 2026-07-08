// Workspace export/import bundle (#502) — the deployable template zip.
//
// A workspace trained interactively (graph workflow + prompts + compositions +
// evaluators + calendar slots + refs) exports as one self-contained zip; a
// server deployment imports it, validates the manifest against installed
// connectors/keys and the #497 coverage matrix BEFORE materializing, and gets
// a new workspace. Format doc: docs/workspace-bundle.md; design:
// docs/architecture/farm-node-graph.md "Template bundle (the zip)".
//
// Bundle tree (manifest.yaml per the design tree; graph spec stays JSON per
// D-03 — pipeline.json for the primary graph, pipeline.<name>.json for
// additional graphs, both matching the design's `pipeline.*`):
//
//   manifest.yaml        name, version, ralphyVersionFloor,
//                        requiredConnectorKeys, requiredCoverage, trustDefault
//   pipeline.json        the graph spec (+ pipeline.<name>.json siblings)
//   subgraphs/           reusable named subgraphs (#517) — the whole workspace
//                        tier, verbatim; pipelines ship authored and re-expand
//                        on the import side
//   prompts/             slot-templated prompt files the graph references
//   compositions/        parametrized HyperFrames engines (when present)
//   evaluators/          STYLE_LOCK.md, evaluators.json, metrics-benchmarks.json
//   calendar.yaml        recurring slots ONLY (dated entries are per-workspace
//                        production state and are NEVER bundled — calendar.ts)
//   refs/                frozen style refs / cast masters (shared/refs, as-is)
//
// Media hygiene: project artifacts and logs are NEVER bundled — the bundle is
// know-how, not history. Export is READ-ONLY over the source workspace.
//
// Zip mechanism: the system `zip`/`unzip` binaries via spawnSync — same
// decision as cli/lib/unpack-zip.ts (#048): zero new deps, battle-tested
// zip64/encoding handling. Present by default on macOS + installable in the
// docker image; a missing binary is a clean E_DEP_MISSING at the command
// boundary (BundleError code "dep-missing" here).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { workspaceDir, workspacesDir, sharedDir, workflowsDir, subgraphsDir } from "./paths.js";
import { listFarmRuns, readFarmPid, isFarmAlive } from "./farm/runner.js";
import { trustAgreementPath, appendTrustAudit, readTrustConfig } from "./trust.js";
import { listWorkflowNames, workflowPath } from "./workflow.js";
import { lintWorkflowFile, type GraphIssue } from "./workflow-graph.js";
import {
  listSubgraphNames,
  subgraphPath,
  validateSubgraphDefinition,
  expandGraphSubgraphs,
  dirSubgraphResolver,
} from "./subgraph.js";
import {
  isWorkflowGraphDocument,
  parseWorkflowGraph,
  parseSubgraph,
  NODE_SIGNATURES,
  type WorkflowGraph,
  type WorkflowNode,
} from "./schemas/workflow.js";
import { readCalendar, calendarPath } from "./calendar/store.js";
import { parseCalendar } from "./schemas/calendar.js";
import { coverageFor } from "./providers/coverage.js";
import { listConnectors } from "./providers/registry.js";
import { readNotificationsConfig } from "./notifications.js";
import { readCadenceConfig } from "./cadence-config.js";
import { VERSION } from "./version.js";
import {
  parseBundleManifest,
  compareSemverIsh,
  type BundleManifest,
  type CoverageTriple,
} from "./schemas/bundle.js";

// ─── Errors ──────────────────────────────────────────────────────────────────

export type BundleErrorCode =
  | "dep-missing" // zip/unzip binary not on PATH → E_DEP_MISSING
  | "not-found" // workspace / zip file missing → E_NOT_FOUND / E_FILE_UNREADABLE
  | "already-exists" // target slug / out path collision → E_ALREADY_EXISTS
  | "not-ready" // export-readiness gaps → E_VALIDATION_FAILED
  | "invalid" // manifest / pipeline validation refusal → E_VALIDATION_FAILED
  | "missing-keys"; // required connector keys unset → E_ENV_KEY_MISSING

/**
 * Lib-level error carrying a machine code + structured details, mapped onto
 * the catalog by the command boundary (same pattern as LegacyLayoutError —
 * lib code never calls raiseError(), it process.exit()s).
 */
export class BundleError extends Error {
  constructor(
    readonly code: BundleErrorCode,
    message: string,
    readonly details: unknown[] = [],
  ) {
    super(message);
    this.name = "BundleError";
  }
}

function requireBinary(bin: "zip" | "unzip"): void {
  if (!Bun.which(bin)) {
    throw new BundleError("dep-missing", `required binary not found on PATH: ${bin}`, [bin]);
  }
}

// ─── Export readiness ────────────────────────────────────────────────────────

export interface BundleGap {
  /** Stable gap id: missing-evaluators | no-graph-workflow | workflow-lint-error | prompt-lint-error | subgraph-lint-error. */
  id: string;
  /** What the gap is, concretely. */
  detail: string;
  /** How to close it. */
  fix: string;
}

export interface ExportReadiness {
  ok: boolean;
  gaps: BundleGap[];
  /** The graph workflows that will be bundled (name + absolute path). */
  graphs: Array<{ name: string; path: string }>;
}

/**
 * Can this workspace export a bundle? Collects EVERY gap (does not stop at
 * the first) so the refusal names the whole repair list: a sibling
 * evaluators.json must exist (the bundle carries the file itself, not the
 * workspace.json fallback), at least one GRAPH workflow must exist (a
 * linear-only workspace refuses — the bundle's pipeline is the #498 node
 * graph), and every graph workflow must lint green.
 */
export function exportReadiness(ws: string): ExportReadiness {
  const dir = workspaceDir(ws);
  const gaps: BundleGap[] = [];
  const graphs: Array<{ name: string; path: string }> = [];

  if (!fs.existsSync(path.join(dir, "evaluators.json"))) {
    gaps.push({
      id: "missing-evaluators",
      detail: `no evaluators.json in workspace "${ws}" — the bundle must carry the workspace's quality bar`,
      fix: `author ${path.join(dir, "evaluators.json")} (see docs/workspace-evaluators.md)`,
    });
  }

  for (const name of listWorkflowNames(ws)) {
    const file = workflowPath(ws, name);
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (!isWorkflowGraphDocument(raw)) continue; // linear (#478) — not bundled
    } catch {
      continue; // unparseable files surface through lint below only if graph-shaped
    }
    const lint = lintWorkflowFile(file, ws);
    for (const issue of lint.errors) {
      // #515: error-level prompt-lint violations refuse export under their
      // own gap id (the issue names the file, the rule, and the fix).
      const isPromptLint = issue.code === "prompt-rule" || issue.code === "unknown-guideline";
      gaps.push({
        id: isPromptLint ? "prompt-lint-error" : "workflow-lint-error",
        detail: `workflow "${name}": ${issue.message}${issue.rule ? ` [rule: ${issue.rule}]` : ""}${issue.file ? ` [file: ${issue.file}]` : ""}`,
        fix: issue.fix,
      });
    }
    if (lint.ok) graphs.push({ name, path: file });
  }

  if (
    graphs.length === 0 &&
    !gaps.some((g) => g.id === "workflow-lint-error" || g.id === "prompt-lint-error")
  ) {
    gaps.push({
      id: "no-graph-workflow",
      detail: `workspace "${ws}" has no node-graph workflow (workflows/*.json with nodes[]) — a bundle needs at least one`,
      fix: `author a #498 graph workflow under ${workflowsDir(ws)} and lint it with: ralphy workflow lint ${ws}`,
    });
  }

  // #517: every authored subgraph must parse + pass its definition checks —
  // the whole subgraphs/ tier ships with the bundle, so a broken (even
  // unused) subgraph refuses export. Missing-subgraph REFS inside a workflow
  // already surface through the per-workflow lint above.
  for (const name of listSubgraphNames(ws)) {
    const file = subgraphPath(ws, name);
    try {
      const sub = parseSubgraph(JSON.parse(fs.readFileSync(file, "utf-8")));
      for (const issue of validateSubgraphDefinition(sub)) {
        gaps.push({
          id: "subgraph-lint-error",
          detail: `subgraph "${name}": ${issue.message}`,
          fix: issue.fix,
        });
      }
    } catch (e) {
      gaps.push({
        id: "subgraph-lint-error",
        detail: `subgraph "${name}" is unreadable: ${(e as Error).message}`,
        fix: `make ${file} valid JSON matching SubgraphSchema (cli/lib/schemas/workflow.ts)`,
      });
    }
  }

  return { ok: gaps.length === 0, gaps, graphs };
}

// ─── Requirement derivation ──────────────────────────────────────────────────

/** Connector env vars per ingestion/publish node type (connectors own the keys). */
const NODE_TYPE_ENV_VARS: Record<string, string[]> = {
  "web-scrape": ["FIRECRAWL_API_KEY"],
  actor: ["APIFY_TOKEN"],
  // Postiz has no canonical SaaS host, so the base URL is required config too (D-05).
  publish: ["POSTIZ_API_KEY", "POSTIZ_BASE_URL"],
  "x-post": ["POSTIZ_API_KEY", "POSTIZ_BASE_URL"],
};

/** LLM node types that default to the OpenRouter connector (D-04). */
const LLM_CONNECTOR_TYPES = new Set(["generate-text", "generate-object", "agent-loop"]);

function providerEnvVar(providerId: string): string | undefined {
  return listConnectors().find((c) => c.id === providerId)?.envVar;
}

export interface BundleRequirements {
  requiredConnectorKeys: string[];
  requiredCoverage: CoverageTriple[];
  /** #520: every `http` node's allowed_hosts unioned — declared in the
   *  manifest so import surfaces the graph's outbound-host surface. */
  httpAllowedHosts: string[];
}

/**
 * Derive the manifest's requiredConnectorKeys + requiredCoverage from the
 * graph's nodes: media nodes contribute their (model, capability, provider)
 * triple + the provider connector's env var; LLM nodes contribute their
 * provider's key (openrouter by default; coding-agent needs none); ingestion
 * and publish nodes contribute their connector env vars.
 */
export function deriveBundleRequirements(graphs: WorkflowGraph[]): BundleRequirements {
  const keys = new Set<string>();
  const triples = new Map<string, CoverageTriple>();
  const httpHosts = new Set<string>();

  const addKey = (v: string | undefined) => {
    if (v) keys.add(v);
  };

  for (const graph of graphs) {
    for (const node of graph.nodes as WorkflowNode[]) {
      const signature = NODE_SIGNATURES[node.type];
      const provider = typeof node.params.provider === "string" ? node.params.provider : undefined;
      const model = typeof node.params.model === "string" ? node.params.model : undefined;

      if (signature.capability && model && provider) {
        const t: CoverageTriple = { model, capability: signature.capability, provider };
        triples.set(`${t.model}|${t.capability}|${t.provider}`, t);
        addKey(providerEnvVar(provider));
      } else if (signature.category === "media" && provider) {
        addKey(providerEnvVar(provider));
      }

      if (LLM_CONNECTOR_TYPES.has(node.type)) {
        addKey(providerEnvVar(provider ?? "openrouter"));
      }

      for (const v of NODE_TYPE_ENV_VARS[node.type] ?? []) keys.add(v);

      // #520: the http node's outbound-host surface rides the manifest.
      if (node.type === "http" && Array.isArray(node.params.allowed_hosts)) {
        for (const h of node.params.allowed_hosts) {
          if (typeof h === "string" && h.length > 0) httpHosts.add(h);
        }
      }
    }
  }

  return {
    requiredConnectorKeys: [...keys].sort(),
    requiredCoverage: [...triples.values()].sort((a, b) =>
      `${a.model}|${a.capability}|${a.provider}`.localeCompare(
        `${b.model}|${b.capability}|${b.provider}`,
      ),
    ),
    httpAllowedHosts: [...httpHosts].sort(),
  };
}

// ─── Export ──────────────────────────────────────────────────────────────────

/** Evaluator files bundled under evaluators/ (evaluators.json is the required one). */
const EVALUATOR_FILES = ["STYLE_LOCK.md", "evaluators.json", "metrics-benchmarks.json"];

/**
 * Prompt-file refs a graph node carries (`prompt` / `prompt_file` params that
 * look like relative paths). Returned workspace-relative, deduped.
 */
export function collectPromptRefs(graphs: WorkflowGraph[]): string[] {
  const refs = new Set<string>();
  for (const graph of graphs) {
    for (const node of graph.nodes as WorkflowNode[]) {
      for (const key of ["prompt", "prompt_file"]) {
        const v = node.params[key];
        if (typeof v === "string" && v.includes("/") && !path.isAbsolute(v)) refs.add(v);
      }
    }
  }
  return [...refs].sort();
}

export interface ExportResult {
  workspace: string;
  out: string;
  manifest: BundleManifest;
  /** Bundle-relative paths of what landed in the zip (top-level entries). */
  contents: string[];
  sizeBytes: number;
  /** Workspace name of the graph bundled as pipeline.json (#516 one-tick estimate hook). */
  primaryWorkflow: string;
}

export interface ExportOptions {
  /** Bundle version written to the manifest (default "1.0.0"). */
  version?: string;
}

/**
 * Export a workspace as a bundle zip at `outPath`. Refuses (BundleError
 * "not-ready") when exportReadiness finds gaps — the error's `details` carry
 * the structured gap list. READ-ONLY over the source workspace; the zip is
 * assembled in a scratch staging dir. Never overwrites an existing outPath
 * (system `zip` would UPDATE it in place — refuse instead).
 */
export function exportWorkspaceBundle(
  ws: string,
  outPath: string,
  opts: ExportOptions = {},
): ExportResult {
  const dir = workspaceDir(ws);
  if (!fs.existsSync(dir)) {
    throw new BundleError("not-found", `workspace not found: ${ws}`, [ws]);
  }
  requireBinary("zip");

  const readiness = exportReadiness(ws);
  if (!readiness.ok) {
    throw new BundleError(
      "not-ready",
      `workspace "${ws}" is not export-ready: ${readiness.gaps.map((g) => g.detail).join("; ")}`,
      readiness.gaps,
    );
  }

  const out = path.resolve(outPath);
  if (fs.existsSync(out)) {
    throw new BundleError("already-exists", `bundle already exists: ${out} — pass a fresh --out`, [out]);
  }

  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-bundle-"));
  try {
    const contents: string[] = [];

    // 1. Graph workflows → pipeline.json (primary) + pipeline.<name>.json.
    //    Files ship in AUTHORED form (import re-expands); the in-memory graphs
    //    are #517-EXPANDED so requirement/prompt derivation below sees the
    //    subgraphs' inner nodes (models, connector keys, prompt files).
    const resolveSubgraph = dirSubgraphResolver(subgraphsDir(ws));
    const graphs: WorkflowGraph[] = [];
    readiness.graphs.forEach(({ name, path: file }, i) => {
      const graph = parseWorkflowGraph(JSON.parse(fs.readFileSync(file, "utf-8")));
      graphs.push(expandGraphSubgraphs(graph, resolveSubgraph).graph);
      const bundleName = i === 0 ? "pipeline.json" : `pipeline.${name}.json`;
      fs.copyFileSync(file, path.join(staging, bundleName));
      contents.push(bundleName);
    });

    // 1b. Subgraphs (#517): the whole subgraphs/ tier ships next to the
    //     pipelines (readiness already linted every definition). The import
    //     fall-through lands it verbatim at <workspace>/subgraphs/.
    const sgSrc = subgraphsDir(ws);
    if (fs.existsSync(sgSrc)) {
      fs.cpSync(sgSrc, path.join(staging, "subgraphs"), { recursive: true });
      contents.push("subgraphs/");
    }

    // 2. Evaluators (evaluators.json guaranteed by the readiness gate).
    fs.mkdirSync(path.join(staging, "evaluators"));
    for (const f of EVALUATOR_FILES) {
      const src = path.join(dir, f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(staging, "evaluators", f));
        contents.push(`evaluators/${f}`);
      }
    }

    // 2b. Workspace reroute rules (#514) — top-level, optional. The import
    //     side lands it verbatim under the workspace dir (the MAPPED_ENTRIES
    //     fall-through), which is exactly where loadWorkspaceRerouteRules reads.
    const rerouteSrc = path.join(dir, "reroute-rules.json");
    if (fs.existsSync(rerouteSrc)) {
      fs.copyFileSync(rerouteSrc, path.join(staging, "reroute-rules.json"));
      contents.push("reroute-rules.json");
    }

    // 3. Calendar: recurring slots ONLY — dated entries are production state.
    if (fs.existsSync(calendarPath(dir))) {
      const cal = readCalendar(dir);
      if (cal.slots.length > 0) {
        fs.writeFileSync(
          path.join(staging, "calendar.yaml"),
          stringifyYaml({ version: cal.version, slots: cal.slots }),
        );
        contents.push("calendar.yaml");
      }
    }

    // 4. Refs: shared/refs copied as-is (frozen style refs, cast masters).
    const refsSrc = path.join(sharedDir(ws), "refs");
    if (fs.existsSync(refsSrc)) {
      fs.cpSync(refsSrc, path.join(staging, "refs"), { recursive: true });
      contents.push("refs/");
    }

    // 5. Prompts: the workspace prompts/ dir when present, plus every prompt
    //    file the graph nodes reference (workspace-relative), preserving paths.
    const promptsSrc = path.join(dir, "prompts");
    if (fs.existsSync(promptsSrc)) {
      fs.cpSync(promptsSrc, path.join(staging, "prompts"), { recursive: true });
      contents.push("prompts/");
    }
    for (const rel of collectPromptRefs(graphs)) {
      const src = path.join(dir, rel);
      const dest = path.join(staging, rel);
      if (fs.existsSync(src) && !fs.existsSync(dest)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        if (!contents.includes(`${rel.split("/")[0]}/`)) contents.push(`${rel.split("/")[0]}/`);
      }
    }

    // 6. Compositions: workspace-level parametrized engines when present.
    const compSrc = path.join(dir, "compositions");
    if (fs.existsSync(compSrc)) {
      fs.cpSync(compSrc, path.join(staging, "compositions"), { recursive: true });
      contents.push("compositions/");
    }

    // #535 golden/ bundle inclusion — DELIBERATELY OUT OF THE BUNDLE (TODO if
    //   this changes): a workspace's golden/ dir (frozen inputs + the incumbent
    //   baseline scorecard) is DEPLOYMENT-LOCAL calibration state, not portable
    //   know-how. The baseline is captured against THIS deployment's bundle
    //   version and is promoted forward by `workspace upgrade` after a
    //   regression-checked apply; shipping it inside the bundle would (a) freeze
    //   one deployment's numbers into every import and (b) cross the upgrade
    //   know-how/runtime-state boundary (bundle.ts RUNTIME_STATE_PATHS). Each
    //   deployment refreshes its own via `ralphy workspace golden <ws> --refresh`.

    // 7. Manifest — requirements auto-derived from the graphs' nodes. The
    //    notifications DEFAULT carries only the event→channel mapping +
    //    digest time (never the secrets — chat id / URL / token stay per
    //    deployment, invariant #1).
    const requirements = deriveBundleRequirements(graphs);
    const notify = readNotificationsConfig(ws);
    const hasMapping = Object.keys(notify.events).length > 0;
    // #525: ship the workspace's cadence profiles (timing only, no secrets) so
    // the imported farm posts on human timing out of the box. Only when the
    // workspace actually enabled a cadence block.
    const cadence = readCadenceConfig(ws);
    // #521 lineage: reuse the workspace's stored bundleId across re-exports so
    // every version shares one id; mint + persist one on first export.
    const bundleId = ensureBundleId(ws);
    const manifest: BundleManifest = parseBundleManifest({
      name: ws,
      bundleId,
      version: opts.version ?? "1.0.0",
      ralphyVersionFloor: VERSION,
      ...requirements,
      trustDefault: "L0",
      ...(hasMapping ? { notificationsDefault: { events: notify.events, digestTime: notify.digestTime } } : {}),
      ...(cadence.enabled ? { cadenceDefault: cadence } : {}),
    });
    fs.writeFileSync(path.join(staging, "manifest.yaml"), stringifyYaml(manifest));
    contents.push("manifest.yaml");

    // 8. Zip the staging tree (relative paths, quiet, no extra attrs).
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const r = spawnSync("zip", ["-r", "-q", "-X", out, "."], { cwd: staging, encoding: "utf8" });
    if (r.status !== 0) {
      throw new BundleError("invalid", `zip failed (status ${r.status}): ${r.stderr || r.stdout}`);
    }

    return {
      workspace: ws,
      out,
      manifest,
      contents: contents.sort(),
      sizeBytes: fs.statSync(out).size,
      primaryWorkflow: readiness.graphs[0]!.name,
    };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

// ─── Import validation ───────────────────────────────────────────────────────

export interface ImportRefusal {
  /** manifest-invalid | version-floor | missing-keys | coverage-gap | pipeline-invalid | subgraph-invalid. */
  id: string;
  detail: string;
  fix: string;
}

export interface BundleValidation {
  ok: boolean;
  manifest: BundleManifest | null;
  refusals: ImportRefusal[];
  warnings: string[];
  /** Extracted pipeline files (absolute path + the graph's own name). */
  pipelines: Array<{ file: string; name: string }>;
  /** Connector keys from the manifest that are NOT set in the environment. */
  missingKeys: string[];
}

export interface ImportOptions {
  /** Target workspace slug (default: manifest.name). */
  as?: string;
  /** Proceed with WARNINGS when required connector keys are unset. */
  allowMissingKeys?: boolean;
  /** Proceed with WARNINGS when required coverage triples are unknown to the matrix. */
  allowCoverageGaps?: boolean;
}

const lintDetail = (name: string, issue: GraphIssue) => `pipeline "${name}": ${issue.message}`;

/**
 * Validate an EXTRACTED bundle dir — everything checked BEFORE any workspace
 * file is materialized: manifest parses, ralphyVersionFloor <= current
 * VERSION, every requiredConnectorKey is configured (missing keys NAMED;
 * `allowMissingKeys` downgrades to warnings), every requiredCoverage triple is
 * known to `coverageFor()` (gaps NAMED; `allowCoverageGaps` downgrades), and
 * every bundled pipeline is a graph workflow that lints green.
 */
export function validateBundle(extractedDir: string, opts: ImportOptions = {}): BundleValidation {
  const refusals: ImportRefusal[] = [];
  const warnings: string[] = [];
  let manifest: BundleManifest | null = null;
  const missingKeys: string[] = [];

  // 1. Manifest.
  const manifestPath = path.join(extractedDir, "manifest.yaml");
  try {
    manifest = parseBundleManifest(parseYaml(fs.readFileSync(manifestPath, "utf-8")));
  } catch (e) {
    refusals.push({
      id: "manifest-invalid",
      detail: `manifest.yaml is missing or malformed: ${(e as Error).message}`,
      fix: "re-export the bundle with `ralphy workspace export` — manifest.yaml must match cli/lib/schemas/bundle.ts",
    });
  }

  if (manifest) {
    // 2. Version floor.
    if (compareSemverIsh(manifest.ralphyVersionFloor, VERSION) > 0) {
      refusals.push({
        id: "version-floor",
        detail: `bundle requires ralphy >= ${manifest.ralphyVersionFloor}, current is ${VERSION}`,
        fix: "upgrade ralphy (`brew upgrade ralphy` / `npm update -g @alecs5am/ralphy`) and re-run the import",
      });
    }

    // 3. Required connector keys, each NAMED.
    for (const key of manifest.requiredConnectorKeys) {
      if (!process.env[key]) missingKeys.push(key);
    }
    if (missingKeys.length > 0) {
      if (opts.allowMissingKeys) {
        warnings.push(
          `proceeding without configured keys: ${missingKeys.join(", ")} — the farm cannot run those nodes until they are set`,
        );
      } else {
        refusals.push({
          id: "missing-keys",
          detail: `required connector keys not set: ${missingKeys.join(", ")}`,
          fix: "export the missing keys (or run `ralphy setup`), or pass --allow-missing-keys to import anyway with warnings",
        });
      }
    }

    // 4. Coverage triples, gaps NAMED.
    const gaps = manifest.requiredCoverage.filter(
      (t) => coverageFor(t.model, t.capability, t.provider) === undefined,
    );
    if (gaps.length > 0) {
      const named = gaps.map((t) => `(${t.model}, ${t.capability}, ${t.provider})`).join(", ");
      if (opts.allowCoverageGaps) {
        warnings.push(`coverage matrix has no entry for: ${named} — node params cannot be validated`);
      } else {
        refusals.push({
          id: "coverage-gap",
          detail: `coverage matrix has no entry for: ${named}`,
          fix: "check `ralphy provider matrix --model <id>` / update cli/lib/providers/coverage.ts, or pass --allow-coverage-gaps",
        });
      }
    }
  }

  // 5. Bundled subgraphs (#517): each must parse + pass its definition checks
  //    BEFORE the pipelines lint against them.
  const bundledSubgraphsDir = path.join(extractedDir, "subgraphs");
  if (fs.existsSync(bundledSubgraphsDir)) {
    for (const f of fs
      .readdirSync(bundledSubgraphsDir)
      .filter((f) => f.endsWith(".json"))
      .sort()) {
      try {
        const sub = parseSubgraph(
          JSON.parse(fs.readFileSync(path.join(bundledSubgraphsDir, f), "utf-8")),
        );
        for (const issue of validateSubgraphDefinition(sub)) {
          refusals.push({ id: "subgraph-invalid", detail: `subgraph "${f}": ${issue.message}`, fix: issue.fix });
        }
      } catch (e) {
        refusals.push({
          id: "subgraph-invalid",
          detail: `subgraph "${f}" is unreadable: ${(e as Error).message}`,
          fix: "re-export the bundle — subgraphs/*.json must match SubgraphSchema (cli/lib/schemas/workflow.ts)",
        });
      }
    }
  }

  // 6. Pipelines: at least one, all graph-shaped, all lint-green (subgraph
  //    refs resolve against the BUNDLE's subgraphs/ tier, #517).
  const pipelineFiles = fs.existsSync(extractedDir)
    ? fs
        .readdirSync(extractedDir)
        .filter((f) => f === "pipeline.json" || (f.startsWith("pipeline.") && f.endsWith(".json")))
        .sort()
    : [];
  const pipelines: Array<{ file: string; name: string }> = [];
  if (pipelineFiles.length === 0) {
    refusals.push({
      id: "pipeline-invalid",
      detail: "bundle carries no pipeline.json — a bundle needs at least one graph workflow",
      fix: "re-export from a workspace with a #498 graph workflow (`ralphy workflow lint <ws>` green)",
    });
  }
  for (const f of pipelineFiles) {
    const file = path.join(extractedDir, f);
    const lint = lintWorkflowFile(file, undefined, { subgraphsDir: bundledSubgraphsDir });
    if (lint.kind !== "graph") {
      refusals.push({
        id: "pipeline-invalid",
        detail: `${f} is not a node-graph workflow (kind: ${lint.kind})`,
        fix: "the bundle pipeline must be a #498 graph (nodes[]) — re-export from a graph workspace",
      });
      continue;
    }
    for (const issue of lint.errors) {
      refusals.push({ id: "pipeline-invalid", detail: lintDetail(f, issue), fix: issue.fix });
    }
    if (lint.ok) {
      const name = (JSON.parse(fs.readFileSync(file, "utf-8")) as { name?: string }).name || lint.name;
      pipelines.push({ file, name });
    }
  }

  return { ok: refusals.length === 0, manifest, refusals, warnings, pipelines, missingKeys };
}

// ─── Import ──────────────────────────────────────────────────────────────────

export interface ImportResult {
  workspace: string;
  path: string;
  bundle: { name: string; version: string; trustDefault: string };
  workflows: string[];
  warnings: string[];
}

/** Bundle top-level entries with a DEDICATED landing spot (not copied verbatim). */
const MAPPED_ENTRIES = new Set(["manifest.yaml", "calendar.yaml", "evaluators", "refs"]);

/**
 * Import a bundle zip as a NEW workspace. Extracts to scratch, runs the full
 * validateBundle() pass, refuses on any refusal (BundleError with the
 * structured list), refuses on a slug collision (never overwrites an existing
 * workspace — pass `as` to pick a fresh slug), then materializes:
 * workspace.json, workflows/<name>.json per pipeline, the evaluator files at
 * the workspace top level, calendar.json (slots only, entries start empty),
 * shared/refs/, and every other bundle dir (prompts/, compositions/, …)
 * verbatim under the workspace dir.
 */
export function importWorkspaceBundle(zipPath: string, opts: ImportOptions = {}): ImportResult {
  const zip = path.resolve(zipPath);
  if (!fs.existsSync(zip)) {
    throw new BundleError("not-found", `bundle zip not found: ${zip}`, [zip]);
  }
  requireBinary("unzip");

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-import-"));
  try {
    const r = spawnSync("unzip", ["-q", zip, "-d", scratch], { encoding: "utf8" });
    if (r.status !== 0) {
      throw new BundleError("invalid", `unzip failed (status ${r.status}): ${r.stderr || r.stdout}`);
    }

    const v = validateBundle(scratch, opts);
    if (!v.ok || !v.manifest) {
      const keysRefusal = v.refusals.find((x) => x.id === "missing-keys");
      if (keysRefusal && v.refusals.length === 1) {
        throw new BundleError("missing-keys", keysRefusal.detail, v.refusals);
      }
      throw new BundleError(
        "invalid",
        `bundle validation refused: ${v.refusals.map((x) => x.detail).join("; ")}`,
        v.refusals,
      );
    }

    const slug = opts.as ?? v.manifest.name;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      throw new BundleError("invalid", `'${slug}' is not a valid workspace slug (lowercase kebab-case)`);
    }
    const dest = workspaceDir(slug);
    if (fs.existsSync(dest)) {
      throw new BundleError(
        "already-exists",
        `workspace already exists: ${slug} — import never overwrites; pass --as <new-slug>`,
        [slug],
      );
    }

    // ── Materialize (all validation passed) ──────────────────────────────
    fs.mkdirSync(workspacesDir(), { recursive: true });
    for (const sub of ["shared", "projects", "templates", "batches", "workflows"]) {
      fs.mkdirSync(path.join(dest, sub), { recursive: true });
    }

    fs.writeFileSync(
      path.join(dest, "workspace.json"),
      JSON.stringify(
        {
          name: v.manifest.name,
          slug,
          created: new Date().toISOString(),
          description: `imported from bundle ${v.manifest.name} v${v.manifest.version}`,
          bundle: {
            name: v.manifest.name,
            version: v.manifest.version,
            // #521 lineage: carry the manifest's bundleId onto the deployed
            // workspace so a later same-lineage `workspace upgrade` recognizes
            // it (dropping it forced --allow-unknown-lineage on every upgrade).
            ...(v.manifest.bundleId ? { bundleId: v.manifest.bundleId } : {}),
            trustDefault: v.manifest.trustDefault,
            importedAt: new Date().toISOString(),
          },
          // #505: the manifest's trustDefault IS the imported workspace's
          // starting trust level (readTrustConfig fills the other defaults).
          trust: { level: v.manifest.trustDefault },
          // #518: the bundled notifications mapping lands QUIET (enabled false,
          // no channel secrets). The operator sets channels + enabled to switch
          // it on post-import (`ralphy` never bundles chat ids / URLs / tokens).
          ...(v.manifest.notificationsDefault
            ? {
                notifications: {
                  enabled: false,
                  events: v.manifest.notificationsDefault.events,
                  ...(v.manifest.notificationsDefault.digestTime
                    ? { digestTime: v.manifest.notificationsDefault.digestTime }
                    : {}),
                },
              }
            : {}),
          // #525: the bundled cadence profiles land as-is (timing only, no
          // secrets) and stay ENABLED — the imported farm posts on human
          // timing immediately.
          ...(v.manifest.cadenceDefault ? { cadence: v.manifest.cadenceDefault } : {}),
        },
        null,
        2,
      ) + "\n",
    );

    const workflows: string[] = [];
    for (const p of v.pipelines) {
      fs.copyFileSync(p.file, path.join(dest, "workflows", `${p.name}.json`));
      workflows.push(p.name);
    }

    const evalDir = path.join(scratch, "evaluators");
    if (fs.existsSync(evalDir)) {
      for (const f of fs.readdirSync(evalDir)) {
        fs.copyFileSync(path.join(evalDir, f), path.join(dest, f));
      }
    }

    const calFile = path.join(scratch, "calendar.yaml");
    if (fs.existsSync(calFile)) {
      const cal = parseCalendar({ ...(parseYaml(fs.readFileSync(calFile, "utf-8")) ?? {}), entries: [] });
      fs.writeFileSync(path.join(dest, "calendar.json"), JSON.stringify(cal, null, 2) + "\n");
    }

    const refsDir = path.join(scratch, "refs");
    if (fs.existsSync(refsDir)) {
      fs.cpSync(refsDir, path.join(dest, "shared", "refs"), { recursive: true });
    }

    // Everything else (prompts/, compositions/, graph-referenced files, …)
    // lands verbatim under the workspace dir. Pipeline files already handled.
    for (const entry of fs.readdirSync(scratch)) {
      if (MAPPED_ENTRIES.has(entry) || /^pipeline(\..+)?\.json$/.test(entry)) continue;
      fs.cpSync(path.join(scratch, entry), path.join(dest, entry), { recursive: true });
    }

    return {
      workspace: slug,
      path: dest,
      bundle: {
        name: v.manifest.name,
        version: v.manifest.version,
        trustDefault: v.manifest.trustDefault,
      },
      workflows: workflows.sort(),
      warnings: v.warnings,
    };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

// ─── Upgrade / rollback (#521) ───────────────────────────────────────────────
//
// The two-path loop: a deployed workspace picks up a NEWER version of the SAME
// bundle lineage WITHOUT losing accumulated runtime state. Know-how is
// replaced+versioned (append-only `<file>.v<N>.<ext>`); runtime state is
// untouched. The boundary is DOCUMENTED as a table in
// docs/architecture/farm-node-graph.md and enforced here.
//
//   KNOW-HOW (replaced, prior copy versioned):
//     workflows/*.json (graphs) · subgraphs/*.json · prompts/** · compositions/**
//     · evaluators (STYLE_LOCK.md, evaluators.json, metrics-benchmarks.json)
//     · reroute-rules.json · calendar SLOTS (calendar.json `slots`)
//   RUNTIME STATE (never touched):
//     calendar ENTRIES + calendar-events.jsonl · trust config + trust-audit.jsonl
//     + trust-agreement.jsonl · ingestion/ (dedup seen.jsonl + cursor.json) ·
//     cache/node-cache.jsonl · farm/dead-letter.jsonl · farm/webhook-tokens.json
//     · farm/*.pid · runs/ · projects/ · batches/ · logs · analytics · shared/
//     (except shared/refs, which the bundle carries as know-how)
//
// Atomicity: know-how lands in a scratch clone of the workspace, then the
// clone is swapped in via one rename (the prior dir is kept as `<ws>.prev` for
// rollback). Runtime-state paths are copied INTO the clone first so the swap
// preserves them.

/**
 * Workspace dirs/files that carry accumulated RUNTIME STATE — preserved across
 * an upgrade AND carried forward onto the snapshot on rollback. workspace.json
 * is handled specially (its `trust` block is runtime state but its `bundle`
 * version pointer must revert) — see rollbackWorkspace.
 */
const RUNTIME_STATE_PATHS = [
  "trust-audit.jsonl",
  "trust-agreement.jsonl",
  "calendar-events.jsonl",
  "ingestion", // seen.jsonl + cursor.json
  "cache", // node-cache.jsonl
  "farm", // dead-letter.jsonl, webhook-tokens.json, *.pid
  "runs",
  "projects",
  "batches",
  "ideas",
  "lifecycle.jsonl", // #521 upgrade/rollback history — survives a rollback
] as const;

/** Know-how classes the bundle replaces. `calendar` is special-cased (slots only). */
export type KnowHowClass =
  | "graph"
  | "subgraphs"
  | "prompts"
  | "compositions"
  | "evaluators"
  | "reroute-rules"
  | "calendar";

export interface KnowHowDiff {
  class: KnowHowClass;
  added: string[];
  changed: string[];
  removed: string[];
}

export interface UpgradePreview {
  workspace: string;
  fromVersion: string | null;
  toVersion: string;
  bundleId: string;
  diff: KnowHowDiff[];
  /** An evaluator change resets the agreement streak (#505 — the rubric changed). */
  evaluatorChanged: boolean;
}

/** Read the workspace's persisted bundle lineage id, minting + storing one if absent. */
export function ensureBundleId(ws: string): string {
  const p = workspaceManifestFile(ws);
  let manifest: Record<string, unknown> = {};
  try {
    manifest = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    /* no manifest yet */
  }
  const existing = (manifest.bundle as { bundleId?: unknown } | undefined)?.bundleId;
  if (typeof existing === "string" && existing.length > 0) return existing;
  const id = randomUUID();
  const bundle = { ...((manifest.bundle as object) ?? {}), bundleId: id };
  fs.mkdirSync(workspaceDir(ws), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ slug: ws, ...manifest, bundle }, null, 2) + "\n");
  return id;
}

function workspaceManifestFile(ws: string): string {
  return path.join(workspaceDir(ws), "workspace.json");
}

function readWsManifest(ws: string): Record<string, unknown> {
  try {
    const raw = JSON.parse(fs.readFileSync(workspaceManifestFile(ws), "utf8"));
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

/** The workspace's deployed bundle {bundleId, version}, or nulls when never imported. */
function deployedLineage(ws: string): { bundleId: string | null; version: string | null } {
  const b = (readWsManifest(ws).bundle as { bundleId?: unknown; version?: unknown } | undefined) ?? {};
  return {
    bundleId: typeof b.bundleId === "string" ? b.bundleId : null,
    version: typeof b.version === "string" ? b.version : null,
  };
}

/** Is a farm run active in this workspace? (a `running`/`parked` run OR a live daemon) */
export function hasActiveRun(ws: string): { active: boolean; reason: string } {
  const busy = listFarmRuns(ws).find(
    (r) => r.state.status === "running" || r.state.status === "parked-approval",
  );
  if (busy) {
    return { active: true, reason: `run "${busy.runId}" is ${busy.state.status} — park or finish it first` };
  }
  if (isFarmAlive(readFarmPid(ws))) {
    return { active: true, reason: `the farm daemon for "${ws}" is running — stop it first (\`ralphy farm stop --workspace ${ws}\`)` };
  }
  return { active: false, reason: "" };
}

/** Recursively list files under `dir`, returned as relative POSIX paths (sorted). */
function walkRel(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(child);
      else out.push(child);
    }
  };
  walk("");
  return out.sort();
}

/** Diff two file trees by relative path + byte content. */
function diffTrees(current: string, incoming: string): { added: string[]; changed: string[]; removed: string[] } {
  const cur = new Set(walkRel(current));
  const inc = walkRel(incoming);
  const added: string[] = [];
  const changed: string[] = [];
  for (const rel of inc) {
    if (!cur.has(rel)) {
      added.push(rel);
    } else if (!fs.readFileSync(path.join(current, rel)).equals(fs.readFileSync(path.join(incoming, rel)))) {
      changed.push(rel);
    }
    cur.delete(rel);
  }
  return { added, changed, removed: [...cur].sort() };
}

/** Map an extracted bundle to the workspace-relative know-how sources it carries. */
function bundleKnowHow(extractedDir: string): Array<{ cls: KnowHowClass; bundleSub: string; wsSub: string }> {
  const map: Array<{ cls: KnowHowClass; bundleSub: string; wsSub: string }> = [];
  const has = (p: string) => fs.existsSync(path.join(extractedDir, p));
  // Pipelines land as workflows/<name>.json — handled explicitly by the caller.
  if (has("subgraphs")) map.push({ cls: "subgraphs", bundleSub: "subgraphs", wsSub: "subgraphs" });
  if (has("prompts")) map.push({ cls: "prompts", bundleSub: "prompts", wsSub: "prompts" });
  if (has("compositions")) map.push({ cls: "compositions", bundleSub: "compositions", wsSub: "compositions" });
  if (has("evaluators")) map.push({ cls: "evaluators", bundleSub: "evaluators", wsSub: "" }); // files land at ws top level
  if (has("reroute-rules.json")) map.push({ cls: "reroute-rules", bundleSub: "reroute-rules.json", wsSub: "reroute-rules.json" });
  return map;
}

export interface UpgradeOptions {
  /** Import the bundle as this workspace even when lineage ids are absent on both sides. */
  allowUnknownLineage?: boolean;
  /** Downgrade missing-key / coverage refusals to warnings (same as import). */
  allowMissingKeys?: boolean;
  allowCoverageGaps?: boolean;
}

export interface UpgradeResult {
  workspace: string;
  preview: UpgradePreview;
  applied: boolean;
  /** Prior versioned know-how kept for rollback (the `<ws>.prev` snapshot dir). */
  rollbackSnapshot: string;
  streakReset: boolean;
  warnings: string[];
}

/** `<ws>.prev` — the prior-know-how snapshot the rollback restores. */
export function rollbackSnapshotDir(ws: string): string {
  return path.join(workspacesDir(), `${ws}.prev`);
}

/** `<ws>/lifecycle.jsonl` — APPEND-ONLY log of upgrade + rollback events. */
export function lifecycleLogPath(ws: string): string {
  return path.join(workspaceDir(ws), "lifecycle.jsonl");
}

function appendLifecycle(ws: string, event: Record<string, unknown>): void {
  fs.mkdirSync(workspaceDir(ws), { recursive: true });
  fs.appendFileSync(lifecycleLogPath(ws), JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n");
}

/**
 * Validate lineage + version + build the know-how diff WITHOUT touching the
 * workspace. Refuses (BundleError) on: missing workspace, unreadable bundle,
 * lineage mismatch, version regression, or (unless allowed) missing keys /
 * coverage gaps. The extracted bundle dir is left in place at `.extracted` for
 * the apply step; the caller owns cleanup.
 */
function planUpgrade(
  ws: string,
  extractedDir: string,
  opts: UpgradeOptions,
): { preview: UpgradePreview; validation: BundleValidation } {
  const dir = workspaceDir(ws);
  if (!fs.existsSync(dir)) {
    throw new BundleError("not-found", `workspace not found: ${ws}`, [ws]);
  }

  const validation = validateBundle(extractedDir, {
    allowMissingKeys: opts.allowMissingKeys,
    allowCoverageGaps: opts.allowCoverageGaps,
  });
  if (!validation.ok || !validation.manifest) {
    throw new BundleError(
      "invalid",
      `bundle validation refused: ${validation.refusals.map((r) => r.detail).join("; ")}`,
      validation.refusals,
    );
  }
  const manifest = validation.manifest;

  // Lineage gate.
  const deployed = deployedLineage(ws);
  const incomingId = manifest.bundleId ?? null;
  if (incomingId && deployed.bundleId) {
    if (incomingId !== deployed.bundleId) {
      throw new BundleError(
        "invalid",
        `lineage mismatch: bundle "${incomingId}" is not the lineage deployed at "${ws}" ("${deployed.bundleId}") — upgrade only applies a newer version of the SAME bundle`,
        [{ id: "lineage-mismatch", deployed: deployed.bundleId, incoming: incomingId }],
      );
    }
  } else if (!opts.allowUnknownLineage) {
    throw new BundleError(
      "invalid",
      `lineage unknown: ${!incomingId ? "the bundle has no bundleId (pre-#521 export)" : `workspace "${ws}" has no recorded bundleId`} — re-export both from #521, or pass --allow-unknown-lineage to upgrade in place`,
      [{ id: "lineage-unknown", deployed: deployed.bundleId, incoming: incomingId }],
    );
  }

  // Version gate — monotonic strictly greater.
  if (deployed.version && compareSemverIsh(manifest.version, deployed.version) <= 0) {
    throw new BundleError(
      "invalid",
      `version regression: bundle v${manifest.version} is not newer than the deployed v${deployed.version} — rollback is the sanctioned down-path`,
      [{ id: "version-regression", deployed: deployed.version, incoming: manifest.version }],
    );
  }

  // Build the diff per know-how class.
  const diff: KnowHowDiff[] = [];
  // Graphs (pipelines land as workflows/<name>.json): diff each pipeline against workflows/.
  const wfDir = path.join(dir, "workflows");
  const graphDiff: KnowHowDiff = { class: "graph", added: [], changed: [], removed: [] };
  for (const p of validation.pipelines) {
    const dest = path.join(wfDir, `${p.name}.json`);
    const rel = `workflows/${p.name}.json`;
    if (!fs.existsSync(dest)) graphDiff.added.push(rel);
    else if (!fs.readFileSync(p.file).equals(fs.readFileSync(dest))) graphDiff.changed.push(rel);
  }
  if (graphDiff.added.length || graphDiff.changed.length) diff.push(graphDiff);

  for (const { cls, bundleSub, wsSub } of bundleKnowHow(extractedDir)) {
    const inc = path.join(extractedDir, bundleSub);
    if (cls === "reroute-rules") {
      const dest = path.join(dir, wsSub);
      const d: KnowHowDiff = { class: cls, added: [], changed: [], removed: [] };
      if (!fs.existsSync(dest)) d.added.push(wsSub);
      else if (!fs.readFileSync(inc).equals(fs.readFileSync(dest))) d.changed.push(wsSub);
      if (d.added.length || d.changed.length) diff.push(d);
      continue;
    }
    const dest = wsSub ? path.join(dir, wsSub) : dir;
    // For evaluators (wsSub === "") only compare the bundled files, not the whole ws dir.
    const t = cls === "evaluators" ? diffEvaluators(dir, inc) : diffTrees(dest, inc);
    // diffTrees returns paths relative to `dest` (e.g. "script.md"); prefix the
    // class subdir so every diff path is WORKSPACE-relative. Without this the
    // apply loop's versionInPlace(path.join(dir, rel)) missed the real file
    // (dir/script.md vs dir/prompts/script.md) and silently skipped versioning
    // prompts/compositions/subgraphs. Evaluators (wsSub "") are already top-level.
    const rerel = (arr: string[]) => (wsSub ? arr.map((r) => `${wsSub}/${r}`) : arr);
    if (t.added.length || t.changed.length || t.removed.length) {
      diff.push({ class: cls, added: rerel(t.added), changed: rerel(t.changed), removed: rerel(t.removed) });
    }
  }

  // Calendar slots (know-how) vs the deployed calendar.json's slots.
  const calDiff = diffCalendarSlots(dir, extractedDir);
  if (calDiff) diff.push(calDiff);

  const evaluatorChanged = diff.some((d) => d.class === "evaluators");
  return {
    preview: {
      workspace: ws,
      fromVersion: deployed.version,
      toVersion: manifest.version,
      bundleId: incomingId ?? deployed.bundleId ?? "(none)",
      diff,
      evaluatorChanged,
    },
    validation,
  };
}

/** Diff only the evaluator files the bundle carries (they land at the workspace top level). */
function diffEvaluators(wsDir: string, bundleEvalDir: string): { added: string[]; changed: string[]; removed: string[] } {
  const added: string[] = [];
  const changed: string[] = [];
  for (const f of EVALUATOR_FILES) {
    const inc = path.join(bundleEvalDir, f);
    if (!fs.existsSync(inc)) continue;
    const dest = path.join(wsDir, f);
    if (!fs.existsSync(dest)) added.push(f);
    else if (!fs.readFileSync(inc).equals(fs.readFileSync(dest))) changed.push(f);
  }
  return { added, changed, removed: [] };
}

/** Diff the bundle's calendar SLOTS against the deployed calendar.json (slots only). */
function diffCalendarSlots(wsDir: string, extractedDir: string): KnowHowDiff | null {
  const calFile = path.join(extractedDir, "calendar.yaml");
  if (!fs.existsSync(calFile)) return null;
  const incoming = (parseYaml(fs.readFileSync(calFile, "utf8")) as { slots?: Array<{ id: string }> })?.slots ?? [];
  let current: Array<{ id: string }> = [];
  try {
    current = (JSON.parse(fs.readFileSync(path.join(wsDir, "calendar.json"), "utf8")).slots ?? []) as Array<{ id: string }>;
  } catch {
    /* no calendar yet — all incoming slots are additions */
  }
  const curById = new Map(current.map((s) => [s.id, s]));
  const d: KnowHowDiff = { class: "calendar", added: [], changed: [], removed: [] };
  const incIds = new Set<string>();
  for (const s of incoming) {
    incIds.add(s.id);
    const prev = curById.get(s.id);
    if (!prev) d.added.push(s.id);
    else if (JSON.stringify(prev) !== JSON.stringify(s)) d.changed.push(s.id);
  }
  for (const s of current) if (!incIds.has(s.id)) d.removed.push(s.id);
  if (!d.added.length && !d.changed.length && !d.removed.length) return null;
  d.added.sort();
  d.changed.sort();
  d.removed.sort();
  return d;
}

/**
 * Extract + parse the CANDIDATE pipeline graphs a bundle zip carries, WITHOUT
 * touching the workspace (#535 golden gate hook). Returns lint-clean graph
 * workflows only (each `WorkflowGraph`, subgraphs expanded against the bundle's
 * own subgraphs/ tier); an unvalidatable bundle returns []. Read-only.
 */
export function extractCandidateGraphs(zipPath: string): WorkflowGraph[] {
  const scratch = extractZip(zipPath);
  try {
    const bundledSubgraphs = path.join(scratch, "subgraphs");
    const resolve = fs.existsSync(bundledSubgraphs)
      ? dirSubgraphResolver(bundledSubgraphs)
      : dirSubgraphResolver(scratch);
    const graphs: WorkflowGraph[] = [];
    const files = fs
      .readdirSync(scratch)
      .filter((f) => f === "pipeline.json" || (f.startsWith("pipeline.") && f.endsWith(".json")))
      .sort();
    for (const f of files) {
      try {
        const graph = parseWorkflowGraph(JSON.parse(fs.readFileSync(path.join(scratch, f), "utf-8")));
        graphs.push(expandGraphSubgraphs(graph, resolve).graph);
      } catch {
        /* malformed pipeline — skip (validateBundle refuses it on the real path) */
      }
    }
    return graphs;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/** Preview an upgrade without applying it (`--dry-run`). Extracts, validates, diffs, cleans up. */
export function previewUpgrade(ws: string, zipPath: string, opts: UpgradeOptions = {}): UpgradePreview {
  const scratch = extractZip(zipPath);
  try {
    return planUpgrade(ws, scratch, opts).preview;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/** unzip a bundle into a fresh scratch dir (shared by preview + apply). */
function extractZip(zipPath: string): string {
  const zip = path.resolve(zipPath);
  if (!fs.existsSync(zip)) throw new BundleError("not-found", `bundle zip not found: ${zip}`, [zip]);
  requireBinary("unzip");
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-upgrade-"));
  const r = spawnSync("unzip", ["-q", zip, "-d", scratch], { encoding: "utf8" });
  if (r.status !== 0) {
    fs.rmSync(scratch, { recursive: true, force: true });
    throw new BundleError("invalid", `unzip failed (status ${r.status}): ${r.stderr || r.stdout}`);
  }
  return scratch;
}

/**
 * Upgrade a deployed workspace to a newer version of its bundle lineage.
 * Atomic: builds a scratch clone with runtime state preserved + know-how
 * replaced (prior copies versioned append-only), then swaps it in via rename
 * (keeping the prior tree as `<ws>.prev` for rollback). Refuses while a run is
 * active. An evaluator change resets the trust agreement streak (#505).
 */
export function upgradeWorkspace(ws: string, zipPath: string, opts: UpgradeOptions = {}): UpgradeResult {
  const active = hasActiveRun(ws);
  if (active.active) {
    throw new BundleError("invalid", `cannot upgrade "${ws}" while a run is active: ${active.reason}`, [
      { id: "run-active", detail: active.reason },
    ]);
  }

  const scratch = extractZip(zipPath);
  try {
    const { preview, validation } = planUpgrade(ws, scratch, opts);
    const manifest = validation.manifest!;
    const dir = workspaceDir(ws);

    // Version the prior know-how in place (append-only `<file>.v<N>.<ext>`) so
    // history survives even after the next upgrade overwrites `<ws>.prev`.
    // The `calendar` class carries slot IDs, not file paths (slots are merged,
    // not replaced whole), so it is excluded from per-file versioning.
    for (const d of preview.diff) {
      if (d.class === "calendar") continue;
      for (const rel of d.changed) versionInPlace(path.join(dir, rel));
    }

    // Snapshot the current KNOW-HOW for rollback (replaces any older snapshot).
    // Runtime-state paths are skipped — rollback re-adds them from the live
    // tree, so the snapshot stays lean (no project media copied twice).
    const snap = rollbackSnapshotDir(ws);
    fs.rmSync(snap, { recursive: true, force: true });
    const skip = new Set<string>(RUNTIME_STATE_PATHS as readonly string[]);
    fs.cpSync(dir, snap, {
      recursive: true,
      filter: (src) => {
        const rel = path.relative(dir, src);
        return rel === "" || !skip.has(rel.split(path.sep)[0]!);
      },
    });

    // Apply know-how onto the live tree (runtime state stays put — we only
    // touch the know-how paths).
    for (const p of validation.pipelines) {
      const dest = path.join(dir, "workflows", `${p.name}.json`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(p.file, dest);
    }
    for (const { cls, bundleSub, wsSub } of bundleKnowHow(scratch)) {
      const inc = path.join(scratch, bundleSub);
      if (cls === "evaluators") {
        for (const f of EVALUATOR_FILES) {
          const src = path.join(inc, f);
          if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, f));
        }
      } else if (cls === "reroute-rules") {
        fs.copyFileSync(inc, path.join(dir, wsSub));
      } else {
        fs.cpSync(inc, path.join(dir, wsSub), { recursive: true });
      }
    }
    // Calendar: replace SLOTS, keep ENTRIES (runtime state).
    applyCalendarSlots(dir, scratch);

    // Bump the recorded lineage/version in workspace.json (engine state).
    const wsm = readWsManifest(ws);
    const bundle = {
      ...((wsm.bundle as object) ?? {}),
      name: manifest.name,
      version: manifest.version,
      bundleId: preview.bundleId,
      trustDefault: manifest.trustDefault,
      upgradedAt: new Date().toISOString(),
    };
    fs.writeFileSync(workspaceManifestFile(ws), JSON.stringify({ slug: ws, ...wsm, bundle }, null, 2) + "\n");

    // #505: an evaluator change invalidates the accumulated agreement streak —
    // the rubric moved, so past verdict↔decision matches no longer vouch for
    // the new bar. Rename the agreement log aside (append-only preserved) so
    // the streak recomputes to 0; note it in the trust audit.
    let streakReset = false;
    if (preview.evaluatorChanged) {
      const agreement = trustAgreementPath(ws);
      if (fs.existsSync(agreement)) {
        fs.renameSync(agreement, `${agreement}.pre-v${manifest.version}`);
      }
      const level = readTrustConfig(ws).level;
      appendTrustAudit(ws, {
        kind: "demotion",
        level,
        surface: "workspace-upgrade",
        reason: `evaluator rubric changed on upgrade to v${manifest.version} — agreement streak reset (#505/#521)`,
      });
      streakReset = true;
    }

    appendLifecycle(ws, {
      event: "upgrade",
      fromVersion: preview.fromVersion,
      toVersion: manifest.version,
      bundleId: preview.bundleId,
      changedClasses: preview.diff.map((d) => d.class),
      evaluatorChanged: preview.evaluatorChanged,
      streakReset,
      rollbackSnapshot: snap,
    });

    return { workspace: ws, preview, applied: true, rollbackSnapshot: snap, streakReset, warnings: validation.warnings };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/** Append-only version: `foo.json` → keep it, copy to `foo.v2.json` (then v3…). */
function versionInPlace(file: string): void {
  if (!fs.existsSync(file)) return;
  const ext = path.extname(file);
  const base = file.slice(0, -ext.length || undefined);
  let n = 2;
  while (fs.existsSync(`${base}.v${n}${ext}`)) n++;
  fs.copyFileSync(file, `${base}.v${n}${ext}`);
}

/** Replace calendar.json's `slots` with the bundle's, KEEPING dated `entries`. */
function applyCalendarSlots(wsDir: string, extractedDir: string): void {
  const calFile = path.join(extractedDir, "calendar.yaml");
  if (!fs.existsSync(calFile)) return;
  const incoming = (parseYaml(fs.readFileSync(calFile, "utf8")) as { version?: string; slots?: unknown[] }) ?? {};
  let current: { entries?: unknown[]; version?: string } = {};
  try {
    current = JSON.parse(fs.readFileSync(path.join(wsDir, "calendar.json"), "utf8"));
  } catch {
    /* no calendar yet */
  }
  const merged = parseCalendar({
    version: incoming.version ?? current.version ?? "1.0",
    slots: incoming.slots ?? [],
    entries: current.entries ?? [], // runtime state — preserved verbatim
  });
  fs.writeFileSync(path.join(wsDir, "calendar.json"), JSON.stringify(merged, null, 2) + "\n");
}

export interface RollbackResult {
  workspace: string;
  restoredVersion: string | null;
  fromVersion: string | null;
  snapshot: string;
}

/**
 * Restore the prior versioned know-how set (the `<ws>.prev` snapshot the last
 * upgrade left). Refuses while a run is active or when there is no snapshot.
 * Runtime state written SINCE the upgrade is preserved by copying the live
 * runtime-state paths onto the restored tree before the swap.
 */
export function rollbackWorkspace(ws: string): RollbackResult {
  const active = hasActiveRun(ws);
  if (active.active) {
    throw new BundleError("invalid", `cannot roll back "${ws}" while a run is active: ${active.reason}`, [
      { id: "run-active", detail: active.reason },
    ]);
  }
  const snap = rollbackSnapshotDir(ws);
  if (!fs.existsSync(snap)) {
    throw new BundleError("not-found", `no rollback snapshot for "${ws}" — nothing to roll back (upgrade first)`, [ws]);
  }
  const dir = workspaceDir(ws);
  const fromVersion = deployedLineage(ws).version;

  // Carry live runtime state onto the snapshot (state accrued since the
  // upgrade must survive the rollback — only know-how reverts).
  for (const rel of RUNTIME_STATE_PATHS) {
    const live = path.join(dir, rel);
    if (!fs.existsSync(live)) continue;
    const dest = path.join(snap, rel);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(live, dest, { recursive: true });
  }
  // workspace.json: keep the snapshot's `bundle` (the version pointer reverts)
  // but adopt the live `trust` block (runtime state accrued since upgrade).
  try {
    const snapM = JSON.parse(fs.readFileSync(path.join(snap, "workspace.json"), "utf8"));
    const liveM = readWsManifest(ws);
    if (liveM.trust) snapM.trust = liveM.trust;
    fs.writeFileSync(path.join(snap, "workspace.json"), JSON.stringify(snapM, null, 2) + "\n");
  } catch {
    /* snapshot has no manifest — leave as-is */
  }
  // calendar.json is a mixed file: SLOTS are know-how (revert to the snapshot),
  // ENTRIES are runtime state (keep the live ones). Merge before the swap.
  try {
    const live = JSON.parse(fs.readFileSync(path.join(dir, "calendar.json"), "utf8"));
    let snapCal: { slots?: unknown[]; version?: string } = {};
    try {
      snapCal = JSON.parse(fs.readFileSync(path.join(snap, "calendar.json"), "utf8"));
    } catch {
      /* snapshot had no calendar — use the live one's shape */
    }
    const merged = parseCalendar({
      version: snapCal.version ?? live.version ?? "1.0",
      slots: snapCal.slots ?? [],
      entries: live.entries ?? [],
    });
    fs.writeFileSync(path.join(snap, "calendar.json"), JSON.stringify(merged, null, 2) + "\n");
  } catch {
    /* no live calendar — nothing to carry */
  }

  // Swap: live tree → discard, snapshot → live. Append the lifecycle event to
  // the RESTORED tree's log (the snapshot's log is the older copy).
  const restoredVersion = ((): string | null => {
    try {
      const b = JSON.parse(fs.readFileSync(path.join(snap, "workspace.json"), "utf8")).bundle;
      return typeof b?.version === "string" ? b.version : null;
    } catch {
      return null;
    }
  })();

  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(snap, dir);
  appendLifecycle(ws, { event: "rollback", fromVersion, restoredVersion, snapshot: snap });

  return { workspace: ws, restoredVersion, fromVersion, snapshot: snap };
}
