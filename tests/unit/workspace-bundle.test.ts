// #502 — workspace export/import bundle.
//
// Covers: manifest schema (defaults + semver-ish rejection), export-readiness
// refusal listing every gap, requiredKeys/requiredCoverage derivation from
// graph nodes, import version-floor refusal, missing-key refusal +
// allowMissingKeys downgrade, coverage-gap refusal + allowCoverageGaps,
// collision refusal + `as`, and the full zip round-trip (export from root A,
// import into a SECOND scratch root as a new slug, lint green, refs/
// evaluators/calendar slots present, dated entries + project dirs absent).
//
// Zip mechanism is the system `zip`/`unzip` binaries (cli/lib/bundle.ts, same
// decision as unpack-zip.ts) — the zip-touching tests skip with a note when
// the binaries are not on PATH.

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir } from "../../cli/lib/paths.js";
import {
  parseBundleManifest,
  compareSemverIsh,
} from "../../cli/lib/schemas/bundle.js";
import {
  exportReadiness,
  deriveBundleRequirements,
  collectPromptRefs,
  exportWorkspaceBundle,
  importWorkspaceBundle,
  validateBundle,
  BundleError,
} from "../../cli/lib/bundle.js";
import { parseWorkflowGraph } from "../../cli/lib/schemas/workflow.js";
import { lintWorkflowFile } from "../../cli/lib/workflow-graph.js";
import { VERSION } from "../../cli/lib/version.js";

const hasZip = Boolean(Bun.which("zip") && Bun.which("unzip"));

let tmp: TmpRoot | undefined;
const scratchFiles: string[] = [];
afterEach(() => {
  tmp?.cleanup();
  tmp = undefined;
  for (const f of scratchFiles.splice(0)) fs.rmSync(f, { recursive: true, force: true });
});

// ─── Fixture builders ────────────────────────────────────────────────────────

/** A small lint-green graph: tts (elevenlabs) + t2v (openrouter kling) + render. */
const GRAPH = {
  version: "2.0",
  name: "episode",
  nodes: [
    {
      id: "script",
      type: "generate-text",
      params: { model: "anthropic/claude-fable-5", provider: "openrouter", prompt: "prompts/script.md" },
      out: "script",
    },
    {
      id: "vo",
      type: "tts",
      in: { text: "script.script" },
      params: { provider: "elevenlabs", model: "eleven_multilingual_v2", voiceId: "abc" },
      out: "vo",
    },
    {
      id: "clip",
      type: "t2v",
      in: { prompt: "script.script" },
      params: { provider: "openrouter", model: "kwaivgi/kling-v3.0-pro", durationSec: 5 },
      out: "clip",
    },
  ],
};

const EVALUATORS = {
  criteria: [{ id: "hook-strength", label: "Hook strength", category: "retention", check: "deterministic" }],
};

const CALENDAR = {
  version: "1.0",
  slots: [
    {
      id: "slot-mon-0900",
      weekday: "mon",
      time: "09:00",
      timezone: "UTC",
      unitType: "ugc-review",
      targetPlatforms: ["tiktok"],
    },
  ],
  entries: [
    { id: "entry-1", unitType: "ugc-review", status: "published", at: "2026-07-01T09:00:00+00:00" },
  ],
};

/** Seed a full export-ready workspace fixture under the CURRENT root. */
function seedWorkspace(slug: string): string {
  const dir = workspaceDir(slug);
  for (const sub of ["shared/refs", "projects", "workflows", "prompts"]) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ name: slug, slug }));
  fs.writeFileSync(path.join(dir, "workflows", "episode.json"), JSON.stringify(GRAPH, null, 2));
  fs.writeFileSync(path.join(dir, "evaluators.json"), JSON.stringify(EVALUATORS, null, 2));
  fs.writeFileSync(path.join(dir, "STYLE_LOCK.md"), "# Style lock\n\nCrude PS1 register.\n");
  fs.writeFileSync(path.join(dir, "calendar.json"), JSON.stringify(CALENDAR, null, 2));
  fs.writeFileSync(path.join(dir, "shared", "refs", "cast-master.png"), "png-bytes");
  fs.writeFileSync(path.join(dir, "prompts", "script.md"), "Write the VO for {{topic}}.\n");
  // Workspace-level #514 reroute rules — bundled top-level, optional.
  fs.writeFileSync(
    path.join(dir, "reroute-rules.json"),
    JSON.stringify([
      {
        id: "ws-park-everything",
        modelPattern: "*",
        capability: "video",
        errorClass: "safety-input",
        action: "park-for-human",
        source: "workspace fixture",
        explanation: "fixture rule",
      },
    ]),
  );
  // Project state that must NEVER be bundled.
  const project = path.join(dir, "projects", "ep-001");
  fs.mkdirSync(path.join(project, "artifacts", "videos"), { recursive: true });
  fs.mkdirSync(path.join(project, "logs"), { recursive: true });
  fs.writeFileSync(path.join(project, "artifacts", "videos", "final.mp4"), "mp4");
  fs.writeFileSync(path.join(project, "logs", "generations.jsonl"), "{}\n");
  return dir;
}

function scratchDir(prefix: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  scratchFiles.push(d);
  return d;
}

/** Write an extracted-bundle dir by hand (validation tests need no zip). */
function seedExtracted(manifest: Record<string, unknown>, opts: { pipeline?: unknown } = {}): string {
  const dir = scratchDir("ralphy-extracted-");
  fs.writeFileSync(path.join(dir, "manifest.yaml"), stringifyYaml(manifest));
  fs.writeFileSync(
    path.join(dir, "pipeline.json"),
    JSON.stringify(opts.pipeline ?? GRAPH, null, 2),
  );
  return dir;
}

const BASE_MANIFEST = {
  name: "tech-news",
  version: "1.0.0",
  ralphyVersionFloor: "0.1.0",
  requiredConnectorKeys: [],
  requiredCoverage: [],
  trustDefault: "L0",
};

// ─── Manifest schema ─────────────────────────────────────────────────────────

describe("bundle manifest schema", () => {
  test("parses a full manifest and applies defaults", () => {
    const m = parseBundleManifest({ name: "x", version: "1.0", ralphyVersionFloor: "0.3.0" });
    expect(m.requiredConnectorKeys).toEqual([]);
    expect(m.requiredCoverage).toEqual([]);
    expect(m.trustDefault).toBe("L0");
  });

  test("rejects a non-semver-ish version and a bad trust level", () => {
    expect(() => parseBundleManifest({ ...BASE_MANIFEST, version: "latest" })).toThrow();
    expect(() => parseBundleManifest({ ...BASE_MANIFEST, trustDefault: "L9" })).toThrow();
    expect(() =>
      parseBundleManifest({
        ...BASE_MANIFEST,
        requiredCoverage: [{ model: "m", capability: "teleport", provider: "p" }],
      }),
    ).toThrow();
  });

  test("compareSemverIsh orders versions numerically", () => {
    expect(compareSemverIsh("0.3.0", "0.3.0")).toBe(0);
    expect(compareSemverIsh("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareSemverIsh("1.0", "1.0.1")).toBeLessThan(0);
    expect(compareSemverIsh("2.0.0-beta.1", "2.0.0")).toBe(0);
  });
});

// ─── Export readiness ────────────────────────────────────────────────────────

describe("export readiness", () => {
  test("a bare workspace lists BOTH gaps: missing evaluators + no graph workflow", () => {
    tmp = makeTmpRoot();
    const dir = workspaceDir("bare");
    fs.mkdirSync(path.join(dir, "workflows"), { recursive: true });
    // A linear (#478) workflow does NOT count as a bundle pipeline.
    fs.writeFileSync(
      path.join(dir, "workflows", "linear.json"),
      JSON.stringify({ version: "1.0", name: "linear", steps: [] }),
    );
    const r = exportReadiness("bare");
    expect(r.ok).toBe(false);
    expect(r.gaps.map((g) => g.id).sort()).toEqual(["missing-evaluators", "no-graph-workflow"]);
    // Every gap names a concrete fix.
    for (const g of r.gaps) expect(g.fix.length).toBeGreaterThan(0);
  });

  test("a lint-broken graph surfaces workflow-lint-error gaps", () => {
    tmp = makeTmpRoot();
    seedWorkspace("broken");
    fs.writeFileSync(
      path.join(workspaceDir("broken"), "workflows", "episode.json"),
      JSON.stringify({
        version: "2.0",
        name: "episode",
        nodes: [{ id: "clip", type: "t2v", in: { prompt: "ghost.out" }, params: {} }],
      }),
    );
    const r = exportReadiness("broken");
    expect(r.ok).toBe(false);
    expect(r.gaps.some((g) => g.id === "workflow-lint-error")).toBe(true);
    expect(r.gaps.some((g) => g.detail.includes("ghost"))).toBe(true);
  });

  test("the seeded fixture workspace is export-ready", () => {
    tmp = makeTmpRoot();
    seedWorkspace("ready");
    const r = exportReadiness("ready");
    expect(r.ok).toBe(true);
    expect(r.graphs.map((g) => g.name)).toEqual(["episode"]);
  });

  test("a broken subgraph surfaces a subgraph-lint-error gap (#517)", () => {
    tmp = makeTmpRoot();
    seedWorkspace("sg-broken");
    fs.mkdirSync(path.join(workspaceDir("sg-broken"), "subgraphs"), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceDir("sg-broken"), "subgraphs", "short-branch.json"),
      JSON.stringify({
        name: "short-branch",
        exit: { out: { node: "ghost", type: "video" } }, // targets a missing inner node
        nodes: [{ id: "clip", type: "t2v", params: { prompt: "x" } }],
      }),
    );
    const r = exportReadiness("sg-broken");
    expect(r.ok).toBe(false);
    const gap = r.gaps.find((g) => g.id === "subgraph-lint-error")!;
    expect(gap.detail).toContain("short-branch");
    expect(gap.detail).toContain("ghost");
  });

  test("a workflow referencing a missing subgraph is not export-ready (#517)", () => {
    tmp = makeTmpRoot();
    seedWorkspace("sg-missing");
    fs.writeFileSync(
      path.join(workspaceDir("sg-missing"), "workflows", "episode.json"),
      JSON.stringify({
        version: "2.0",
        name: "episode",
        nodes: [{ id: "unit", type: "subgraph", params: { name: "ghost-branch" } }],
      }),
    );
    const r = exportReadiness("sg-missing");
    expect(r.ok).toBe(false);
    expect(r.gaps.some((g) => g.id === "workflow-lint-error" && g.detail.includes("ghost-branch"))).toBe(true);
  });
});

// ─── Requirement derivation ──────────────────────────────────────────────────

describe("requirement derivation", () => {
  test("derives connector keys + coverage triples from graph nodes", () => {
    const graph = parseWorkflowGraph(GRAPH);
    const req = deriveBundleRequirements([graph]);
    // generate-text (openrouter) + tts (elevenlabs) + t2v (openrouter).
    expect(req.requiredConnectorKeys).toEqual(["ELEVENLABS_API_KEY", "OPENROUTER_API_KEY"]);
    expect(req.requiredCoverage).toEqual([
      { model: "eleven_multilingual_v2", capability: "voice", provider: "elevenlabs" },
      { model: "kwaivgi/kling-v3.0-pro", capability: "video", provider: "openrouter" },
    ]);
  });

  test("ingestion + publish nodes contribute their connector env vars", () => {
    const graph = parseWorkflowGraph({
      name: "farm",
      nodes: [
        { id: "trends", type: "web-scrape", params: { query: "ai" } },
        { id: "tweets", type: "actor", params: { actor_id: "x-scraper" } },
        { id: "post", type: "publish", params: { targets: ["tiktok"] } },
      ],
    });
    const req = deriveBundleRequirements([graph]);
    expect(req.requiredConnectorKeys).toEqual([
      "APIFY_TOKEN",
      "FIRECRAWL_API_KEY",
      "POSTIZ_API_KEY",
      "POSTIZ_BASE_URL",
    ]);
    expect(req.requiredCoverage).toEqual([]);
  });

  test("collectPromptRefs picks relative prompt-file params only", () => {
    const graph = parseWorkflowGraph({
      name: "p",
      nodes: [
        { id: "a", type: "generate-text", params: { prompt: "prompts/script.md" } },
        { id: "b", type: "generate-text", params: { prompt: "inline text, not a path" } },
        { id: "c", type: "coding-agent", params: { prompt_file: "/abs/never.md" } },
      ],
    });
    expect(collectPromptRefs([graph])).toEqual(["prompts/script.md"]);
  });
});

// ─── Subgraph fixtures (#517) ────────────────────────────────────────────────

/** A lint-green subgraph; the video model arrives via the override surface. */
const SUBGRAPH = {
  name: "short-branch",
  version: "1.0",
  entry: { script: { node: "write", port: "prompt", type: "text" } },
  exit: { out: { node: "clip", type: "video" } },
  params: { "video-model": { node: "clip", param: "model" } },
  nodes: [
    { id: "write", type: "generate-text", params: { prompt: "tighten the script" } },
    { id: "clip", type: "t2v", in: { prompt: "write.out" }, params: { provider: "openrouter", prompt: "neon night drive, one take" } },
  ],
};

/** A second pipeline that instantiates the subgraph with a model override. */
const SUBGRAPH_PIPELINE = {
  version: "2.0",
  name: "farm",
  nodes: [
    {
      id: "research",
      type: "generate-text",
      params: { model: "anthropic/claude-fable-5", provider: "openrouter", prompt: "prompts/script.md" },
      out: "script",
    },
    {
      id: "short",
      type: "subgraph",
      in: { script: "research.script" },
      params: { name: "short-branch", overrides: { "video-model": "kwaivgi/kling-v3.0-pro" } },
    },
  ],
};

// ─── Import validation (no zip needed — operates on an extracted dir) ────────

describe("import validation", () => {
  test("refuses when ralphyVersionFloor is above the current version", () => {
    tmp = makeTmpRoot();
    const dir = seedExtracted({ ...BASE_MANIFEST, ralphyVersionFloor: "99.0.0" });
    const v = validateBundle(dir);
    expect(v.ok).toBe(false);
    expect(v.refusals.map((r) => r.id)).toContain("version-floor");
    expect(v.refusals.find((r) => r.id === "version-floor")!.detail).toContain("99.0.0");
    expect(v.refusals.find((r) => r.id === "version-floor")!.detail).toContain(VERSION);
  });

  test("names missing connector keys; --allow-missing-keys downgrades to a warning", () => {
    tmp = makeTmpRoot();
    const key = "RALPHY_TEST_BUNDLE_KEY_NEVER_SET";
    delete process.env[key];
    const dir = seedExtracted({ ...BASE_MANIFEST, requiredConnectorKeys: [key] });

    const refused = validateBundle(dir);
    expect(refused.ok).toBe(false);
    expect(refused.missingKeys).toEqual([key]);
    expect(refused.refusals.find((r) => r.id === "missing-keys")!.detail).toContain(key);

    const allowed = validateBundle(dir, { allowMissingKeys: true });
    expect(allowed.ok).toBe(true);
    expect(allowed.warnings.join(" ")).toContain(key);
  });

  test("names coverage gaps; --allow-coverage-gaps downgrades to a warning", () => {
    tmp = makeTmpRoot();
    const dir = seedExtracted({
      ...BASE_MANIFEST,
      requiredCoverage: [
        { model: "kwaivgi/kling-v3.0-pro", capability: "video", provider: "openrouter" }, // known
        { model: "unknown/model-x", capability: "video", provider: "openrouter" }, // gap
      ],
    });

    const refused = validateBundle(dir);
    expect(refused.ok).toBe(false);
    const gap = refused.refusals.find((r) => r.id === "coverage-gap")!;
    expect(gap.detail).toContain("unknown/model-x");
    expect(gap.detail).not.toContain("kling-v3.0-pro"); // known triple is not a gap

    const allowed = validateBundle(dir, { allowCoverageGaps: true });
    expect(allowed.ok).toBe(true);
    expect(allowed.warnings.join(" ")).toContain("unknown/model-x");
  });

  test("pipelines lint against the bundle's own subgraphs tier (#517)", () => {
    tmp = makeTmpRoot();
    // Without the subgraphs/ dir the pipeline's ref cannot resolve → refusal.
    const bare = seedExtracted(BASE_MANIFEST, { pipeline: SUBGRAPH_PIPELINE });
    const v1 = validateBundle(bare);
    expect(v1.ok).toBe(false);
    expect(v1.refusals.some((r) => r.id === "pipeline-invalid" && r.detail.includes("short-branch"))).toBe(true);

    // With subgraphs/short-branch.json in the bundle, the same pipeline is green.
    const dir = seedExtracted(BASE_MANIFEST, { pipeline: SUBGRAPH_PIPELINE });
    fs.mkdirSync(path.join(dir, "subgraphs"));
    fs.writeFileSync(path.join(dir, "subgraphs", "short-branch.json"), JSON.stringify(SUBGRAPH));
    const v2 = validateBundle(dir);
    expect(v2.refusals).toEqual([]);
    expect(v2.ok).toBe(true);
  });

  test("a malformed bundled subgraph refuses import with subgraph-invalid (#517)", () => {
    tmp = makeTmpRoot();
    const dir = seedExtracted(BASE_MANIFEST);
    fs.mkdirSync(path.join(dir, "subgraphs"));
    fs.writeFileSync(path.join(dir, "subgraphs", "bad.json"), "{ not json");
    fs.writeFileSync(
      path.join(dir, "subgraphs", "nested.json"),
      JSON.stringify({
        name: "nested",
        nodes: [{ id: "inner", type: "subgraph", params: { name: "short-branch" } }],
      }),
    );
    const v = validateBundle(dir);
    expect(v.ok).toBe(false);
    const subRefusals = v.refusals.filter((r) => r.id === "subgraph-invalid");
    expect(subRefusals.some((r) => r.detail.includes("bad.json"))).toBe(true);
    expect(subRefusals.some((r) => r.detail.includes("one level of nesting"))).toBe(true);
  });

  test("refuses a malformed manifest and a lint-broken pipeline", () => {
    tmp = makeTmpRoot();
    const dir = seedExtracted(
      { name: "x" }, // missing version + floor
      {
        pipeline: {
          version: "2.0",
          name: "bad",
          nodes: [{ id: "clip", type: "t2v", in: { prompt: "ghost.out" }, params: {} }],
        },
      },
    );
    const v = validateBundle(dir);
    expect(v.ok).toBe(false);
    expect(v.refusals.map((r) => r.id)).toContain("manifest-invalid");
    expect(v.refusals.map((r) => r.id)).toContain("pipeline-invalid");
  });
});

// ─── Zip round-trip + collision (system zip/unzip; skipped when absent) ──────

describe.skipIf(!hasZip)("bundle round-trip (system zip/unzip)", () => {
  test("export refuses to overwrite an existing out path", () => {
    tmp = makeTmpRoot();
    seedWorkspace("tech-news");
    const out = path.join(scratchDir("ralphy-zip-"), "bundle.zip");
    fs.writeFileSync(out, "existing");
    expect(() => exportWorkspaceBundle("tech-news", out)).toThrow(BundleError);
    try {
      exportWorkspaceBundle("tech-news", out);
    } catch (e) {
      expect((e as BundleError).code).toBe("already-exists");
    }
  });

  test("export refusal on a not-ready workspace carries the structured gap list", () => {
    tmp = makeTmpRoot();
    fs.mkdirSync(path.join(workspaceDir("empty-ws"), "workflows"), { recursive: true });
    const out = path.join(scratchDir("ralphy-zip-"), "bundle.zip");
    try {
      exportWorkspaceBundle("empty-ws", out);
      expect.unreachable("export must refuse");
    } catch (e) {
      const err = e as BundleError;
      expect(err.code).toBe("not-ready");
      const ids = (err.details as Array<{ id: string }>).map((g) => g.id).sort();
      expect(ids).toEqual(["missing-evaluators", "no-graph-workflow"]);
    }
    expect(fs.existsSync(out)).toBe(false); // nothing written on refusal
  });

  test("full round-trip: export -> import into a second root as a new slug", () => {
    // Root A: build + export.
    tmp = makeTmpRoot();
    seedWorkspace("tech-news");
    const out = path.join(scratchDir("ralphy-zip-"), "tech-news-v1.zip");
    const exported = exportWorkspaceBundle("tech-news", out, { version: "1.2.0" });

    expect(exported.manifest.name).toBe("tech-news");
    expect(exported.manifest.version).toBe("1.2.0");
    expect(exported.manifest.ralphyVersionFloor).toBe(VERSION);
    expect(exported.manifest.requiredConnectorKeys).toEqual([
      "ELEVENLABS_API_KEY",
      "OPENROUTER_API_KEY",
    ]);
    expect(exported.contents).toContain("pipeline.json");
    expect(exported.contents).toContain("calendar.yaml");
    expect(exported.contents).toContain("evaluators/evaluators.json");
    expect(exported.contents).toContain("reroute-rules.json");

    // Source workspace untouched (read-only export): project + logs still there.
    expect(
      fs.existsSync(path.join(workspaceDir("tech-news"), "projects", "ep-001", "logs", "generations.jsonl")),
    ).toBe(true);

    // Root B: import as a NEW slug. allowMissingKeys so the test is
    // environment-independent (the dev machine may lack the derived keys).
    tmp.cleanup();
    tmp = makeTmpRoot();
    const result = importWorkspaceBundle(out, { as: "my-channel", allowMissingKeys: true });
    expect(result.workspace).toBe("my-channel");
    expect(result.workflows).toEqual(["episode"]);

    const dest = workspaceDir("my-channel");

    // Workflow materialized + lints green in the new root.
    const wf = path.join(dest, "workflows", "episode.json");
    const lint = lintWorkflowFile(wf, "my-channel");
    expect(lint.ok).toBe(true);
    expect(lint.kind).toBe("graph");

    // Evaluators + style lock at the workspace top level.
    expect(JSON.parse(fs.readFileSync(path.join(dest, "evaluators.json"), "utf-8"))).toEqual(EVALUATORS);
    expect(fs.readFileSync(path.join(dest, "STYLE_LOCK.md"), "utf-8")).toContain("Style lock");

    // Calendar: slots survived, dated entries did NOT.
    const cal = JSON.parse(fs.readFileSync(path.join(dest, "calendar.json"), "utf-8"));
    expect(cal.slots.map((s: { id: string }) => s.id)).toEqual(["slot-mon-0900"]);
    expect(cal.entries).toEqual([]);

    // Refs + prompts survived.
    expect(fs.readFileSync(path.join(dest, "shared", "refs", "cast-master.png"), "utf-8")).toBe("png-bytes");
    expect(fs.readFileSync(path.join(dest, "prompts", "script.md"), "utf-8")).toContain("{{topic}}");

    // Workspace reroute rules landed at the workspace top level (#514) —
    // exactly where loadWorkspaceRerouteRules reads them.
    const rerouteRules = JSON.parse(fs.readFileSync(path.join(dest, "reroute-rules.json"), "utf-8"));
    expect(rerouteRules[0]).toMatchObject({ id: "ws-park-everything", action: "park-for-human" });

    // Project artifacts + logs were NEVER bundled.
    expect(fs.readdirSync(path.join(dest, "projects"))).toEqual([]);
    expect(fs.existsSync(path.join(dest, "logs"))).toBe(false);
    expect(fs.existsSync(path.join(dest, "artifacts"))).toBe(false);

    // workspace.json records the bundle provenance.
    const manifest = JSON.parse(fs.readFileSync(path.join(dest, "workspace.json"), "utf-8"));
    expect(manifest.slug).toBe("my-channel");
    expect(manifest.bundle).toMatchObject({ name: "tech-news", version: "1.2.0", trustDefault: "L0" });
  });

  test("round-trip carries the subgraphs tier; requirements derive through expansion (#517)", () => {
    tmp = makeTmpRoot();
    seedWorkspace("tech-news");
    fs.mkdirSync(path.join(workspaceDir("tech-news"), "subgraphs"), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceDir("tech-news"), "subgraphs", "short-branch.json"),
      JSON.stringify(SUBGRAPH),
    );
    fs.writeFileSync(
      path.join(workspaceDir("tech-news"), "workflows", "farm.json"),
      JSON.stringify(SUBGRAPH_PIPELINE),
    );

    const out = path.join(scratchDir("ralphy-zip-"), "sg.zip");
    const exported = exportWorkspaceBundle("tech-news", out);
    expect(exported.contents).toContain("subgraphs/");
    // The kling binding lives INSIDE the subgraph (model via override) — it
    // only reaches the manifest because requirements derive from the
    // EXPANDED graphs.
    expect(exported.manifest.requiredCoverage).toContainEqual({
      model: "kwaivgi/kling-v3.0-pro",
      capability: "video",
      provider: "openrouter",
    });

    tmp.cleanup();
    tmp = makeTmpRoot();
    const result = importWorkspaceBundle(out, { as: "sg-channel", allowMissingKeys: true });
    expect(result.workflows).toEqual(["episode", "farm"]);
    const dest = workspaceDir("sg-channel");
    // The subgraphs tier landed verbatim and the workflow lints green in place.
    expect(
      JSON.parse(fs.readFileSync(path.join(dest, "subgraphs", "short-branch.json"), "utf-8")).name,
    ).toBe("short-branch");
    const lint = lintWorkflowFile(path.join(dest, "workflows", "farm.json"), "sg-channel");
    expect(lint.ok).toBe(true);
  });

  test("import refuses an existing slug and never overwrites it", () => {
    tmp = makeTmpRoot();
    seedWorkspace("tech-news");
    const out = path.join(scratchDir("ralphy-zip-"), "b.zip");
    exportWorkspaceBundle("tech-news", out);

    // The manifest name collides with the source workspace in the SAME root.
    const marker = path.join(workspaceDir("tech-news"), "workspace.json");
    const before = fs.readFileSync(marker, "utf-8");
    try {
      importWorkspaceBundle(out, { allowMissingKeys: true });
      expect.unreachable("import must refuse the collision");
    } catch (e) {
      expect((e as BundleError).code).toBe("already-exists");
    }
    expect(fs.readFileSync(marker, "utf-8")).toBe(before); // untouched

    // --as with a fresh slug proceeds.
    const r = importWorkspaceBundle(out, { as: "tech-news-2", allowMissingKeys: true });
    expect(r.workspace).toBe("tech-news-2");
    expect(fs.existsSync(path.join(workspaceDir("tech-news-2"), "workflows", "episode.json"))).toBe(true);
  });
});
