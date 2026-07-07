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
import { spawnSync } from "node:child_process";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { workspaceDir, workspacesDir, sharedDir, workflowsDir } from "./paths.js";
import { listWorkflowNames, workflowPath } from "./workflow.js";
import { lintWorkflowFile, type GraphIssue } from "./workflow-graph.js";
import {
  isWorkflowGraphDocument,
  parseWorkflowGraph,
  NODE_SIGNATURES,
  type WorkflowGraph,
  type WorkflowNode,
} from "./schemas/workflow.js";
import { readCalendar, calendarPath } from "./calendar/store.js";
import { parseCalendar } from "./schemas/calendar.js";
import { coverageFor } from "./providers/coverage.js";
import { listConnectors } from "./providers/registry.js";
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
  /** Stable gap id: missing-evaluators | no-graph-workflow | workflow-lint-error | prompt-lint-error. */
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
    }
  }

  return {
    requiredConnectorKeys: [...keys].sort(),
    requiredCoverage: [...triples.values()].sort((a, b) =>
      `${a.model}|${a.capability}|${a.provider}`.localeCompare(
        `${b.model}|${b.capability}|${b.provider}`,
      ),
    ),
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
    const graphs: WorkflowGraph[] = [];
    readiness.graphs.forEach(({ name, path: file }, i) => {
      const graph = parseWorkflowGraph(JSON.parse(fs.readFileSync(file, "utf-8")));
      graphs.push(graph);
      const bundleName = i === 0 ? "pipeline.json" : `pipeline.${name}.json`;
      fs.copyFileSync(file, path.join(staging, bundleName));
      contents.push(bundleName);
    });

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

    // 7. Manifest — requirements auto-derived from the graphs' nodes.
    const requirements = deriveBundleRequirements(graphs);
    const manifest: BundleManifest = parseBundleManifest({
      name: ws,
      version: opts.version ?? "1.0.0",
      ralphyVersionFloor: VERSION,
      ...requirements,
      trustDefault: "L0",
    });
    fs.writeFileSync(path.join(staging, "manifest.yaml"), stringifyYaml(manifest));
    contents.push("manifest.yaml");

    // 8. Zip the staging tree (relative paths, quiet, no extra attrs).
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const r = spawnSync("zip", ["-r", "-q", "-X", out, "."], { cwd: staging, encoding: "utf8" });
    if (r.status !== 0) {
      throw new BundleError("invalid", `zip failed (status ${r.status}): ${r.stderr || r.stdout}`);
    }

    return { workspace: ws, out, manifest, contents: contents.sort(), sizeBytes: fs.statSync(out).size };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

// ─── Import validation ───────────────────────────────────────────────────────

export interface ImportRefusal {
  /** manifest-invalid | version-floor | missing-keys | coverage-gap | pipeline-invalid. */
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

  // 5. Pipelines: at least one, all graph-shaped, all lint-green.
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
    const lint = lintWorkflowFile(file);
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
            trustDefault: v.manifest.trustDefault,
            importedAt: new Date().toISOString(),
          },
          // #505: the manifest's trustDefault IS the imported workspace's
          // starting trust level (readTrustConfig fills the other defaults).
          trust: { level: v.manifest.trustDefault },
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
