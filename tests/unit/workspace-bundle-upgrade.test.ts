// #521 — bundle lineage + deployed-workspace upgrade / rollback.
//
// Covers: manifest lineage (bundleId minted on export, reused on re-export),
// lineage-mismatch refusal, version-regression refusal, monotonic accept,
// know-how replaced + runtime state preserved (calendar entries / trust /
// dedup / cache / quarantine fixtures survive), append-only versioning of
// replaced know-how, rollback round-trip, active-run refusal, and the trust
// agreement-streak reset on an evaluator change (unchanged evaluator → streak
// kept). The zip round-trip uses the system zip/unzip (skipped when absent).

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, workspacesDir, runDir } from "../../cli/lib/paths.js";
import {
  exportWorkspaceBundle,
  upgradeWorkspace,
  previewUpgrade,
  rollbackWorkspace,
  ensureBundleId,
  BundleError,
} from "../../cli/lib/bundle.js";

const hasZip = Boolean(Bun.which("zip") && Bun.which("unzip"));

let tmp: TmpRoot | undefined;
const scratchFiles: string[] = [];
afterEach(() => {
  tmp?.cleanup();
  tmp = undefined;
  for (const f of scratchFiles.splice(0)) fs.rmSync(f, { recursive: true, force: true });
});

const GRAPH = {
  version: "2.0",
  name: "episode",
  nodes: [
    { id: "script", type: "generate-text", params: { model: "anthropic/claude-fable-5", provider: "openrouter", prompt: "prompts/hook.md" }, out: "script" },
    { id: "vo", type: "tts", in: { text: "script.script" }, params: { provider: "elevenlabs", model: "eleven_multilingual_v2", voiceId: "abc" }, out: "vo" },
    { id: "clip", type: "t2v", in: { prompt: "script.script" }, params: { provider: "openrouter", model: "kwaivgi/kling-v3.0-pro", durationSec: 5 }, out: "clip" },
  ],
};
const EVALUATORS = { criteria: [{ id: "hook", label: "Hook", category: "retention", check: "deterministic" }] };
const EVALUATORS_V2 = { criteria: [{ id: "hook", label: "Hook (tighter)", category: "retention", check: "deterministic" }] };

function scratchDir(prefix: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  scratchFiles.push(d);
  return d;
}

/** Seed an export-ready workspace; returns its dir. */
function seed(slug: string, evaluators: unknown = EVALUATORS): string {
  const dir = workspaceDir(slug);
  for (const sub of ["shared/refs", "projects", "workflows", "prompts"]) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ name: slug, slug }));
  fs.writeFileSync(path.join(dir, "workflows", "episode.json"), JSON.stringify(GRAPH, null, 2));
  fs.writeFileSync(path.join(dir, "evaluators.json"), JSON.stringify(evaluators, null, 2));
  fs.writeFileSync(path.join(dir, "prompts", "hook.md"), "Write the hook.\n");
  return dir;
}

/** Export a workspace to a bundle zip and return the zip path. */
function exportZip(slug: string, version: string): string {
  const out = path.join(scratchDir("ralphy-521-"), `${slug}-v${version}.zip`);
  exportWorkspaceBundle(slug, out, { version });
  return out;
}

/** Import a bundle as a deployed workspace (via the round-trip) so it has bundle provenance. */
function deploy(sourceSlug: string, version: string, deployedSlug: string): void {
  // Simplest deploy path: seed a workspace, export, then hand-write the
  // workspace.json bundle provenance the upgrade reads (mirrors import).
  const zip = exportZip(sourceSlug, version);
  const manifest = parseYaml(fs.readFileSync(extract(zip, "manifest.yaml"), "utf8")) as { bundleId: string };
  // Materialize the deployed workspace = a copy of the source + provenance.
  fs.cpSync(workspaceDir(sourceSlug), workspaceDir(deployedSlug), { recursive: true });
  const wsm = JSON.parse(fs.readFileSync(path.join(workspaceDir(deployedSlug), "workspace.json"), "utf8"));
  wsm.slug = deployedSlug;
  wsm.bundle = { name: sourceSlug, version, bundleId: manifest.bundleId, trustDefault: "L0" };
  fs.writeFileSync(path.join(workspaceDir(deployedSlug), "workspace.json"), JSON.stringify(wsm, null, 2) + "\n");
}

/** Read one file out of a zip into scratch (test helper). */
function extract(zip: string, rel: string): string {
  const d = scratchDir("ralphy-521-x-");
  Bun.spawnSync(["unzip", "-q", zip, rel, "-d", d]);
  return path.join(d, rel);
}

// ─── Manifest lineage ────────────────────────────────────────────────────────

describe.skipIf(!hasZip)("bundle lineage id", () => {
  test("export mints a bundleId and reuses it across re-exports", () => {
    tmp = makeTmpRoot();
    seed("chan");
    const z1 = exportZip("chan", "1.0.0");
    const z2 = exportZip("chan", "2.0.0");
    const m1 = parseYaml(fs.readFileSync(extract(z1, "manifest.yaml"), "utf8")) as { bundleId: string; version: string };
    const m2 = parseYaml(fs.readFileSync(extract(z2, "manifest.yaml"), "utf8")) as { bundleId: string; version: string };
    expect(m1.bundleId).toBeTruthy();
    expect(m1.bundleId).toBe(m2.bundleId); // same lineage
    expect(m1.version).toBe("1.0.0");
    expect(m2.version).toBe("2.0.0");
  });

  test("ensureBundleId is idempotent", () => {
    tmp = makeTmpRoot();
    seed("chan");
    const a = ensureBundleId("chan");
    const b = ensureBundleId("chan");
    expect(a).toBe(b);
  });
});

// ─── Lineage / version gating ────────────────────────────────────────────────

describe.skipIf(!hasZip)("upgrade lineage + version gating", () => {
  test("refuses a lineage mismatch", () => {
    tmp = makeTmpRoot();
    seed("src-a");
    seed("src-b");
    deploy("src-a", "1.0.0", "deployed"); // deployed carries src-a's lineage
    const otherZip = exportZip("src-b", "2.0.0"); // different bundleId
    try {
      previewUpgrade("deployed", otherZip);
      expect.unreachable("must refuse lineage mismatch");
    } catch (e) {
      expect((e as BundleError).code).toBe("invalid");
      expect((e as BundleError).message).toContain("lineage mismatch");
    }
  });

  test("refuses a version regression", () => {
    tmp = makeTmpRoot();
    seed("src");
    deploy("src", "2.0.0", "deployed");
    const older = exportZip("src", "1.0.0"); // same lineage, LOWER version
    try {
      previewUpgrade("deployed", older);
      expect.unreachable("must refuse regression");
    } catch (e) {
      expect((e as BundleError).message).toContain("version regression");
    }
  });

  test("accepts a monotonic-greater same-lineage bundle", () => {
    tmp = makeTmpRoot();
    seed("src");
    deploy("src", "1.0.0", "deployed");
    const newer = exportZip("src", "2.0.0");
    const preview = previewUpgrade("deployed", newer);
    expect(preview.fromVersion).toBe("1.0.0");
    expect(preview.toVersion).toBe("2.0.0");
  });
});

// ─── Know-how replaced + runtime state preserved ─────────────────────────────

describe.skipIf(!hasZip)("upgrade preserves runtime state, replaces know-how", () => {
  test("calendar entries / trust / dedup / cache / quarantine survive; know-how is versioned", () => {
    tmp = makeTmpRoot();
    seed("src");
    // Change the graph so v2 carries different know-how.
    deploy("src", "1.0.0", "deployed");
    const dep = workspaceDir("deployed");

    // Plant runtime state under the deployed workspace.
    fs.writeFileSync(
      path.join(dep, "calendar.json"),
      JSON.stringify({ version: "1.0", slots: [], entries: [{ id: "e1", unitType: "ugc-review", status: "published", at: "2026-07-01T09:00:00+00:00" }] }),
    );
    fs.writeFileSync(path.join(dep, "trust-agreement.jsonl"), JSON.stringify({ at: "x", decision: "approve", verdict: "ship", match: true }) + "\n");
    fs.mkdirSync(path.join(dep, "ingestion"), { recursive: true });
    fs.writeFileSync(path.join(dep, "ingestion", "seen.jsonl"), '{"hash":"abc"}\n');
    fs.mkdirSync(path.join(dep, "cache"), { recursive: true });
    fs.writeFileSync(path.join(dep, "cache", "node-cache.jsonl"), '{"key":"k"}\n');
    fs.mkdirSync(path.join(dep, "farm"), { recursive: true });
    fs.writeFileSync(path.join(dep, "farm", "dead-letter.jsonl"), '{"unit":"u"}\n');
    fs.writeFileSync(path.join(dep, "farm", "webhook-tokens.json"), '{"tok":"t"}');

    // Build a v2 bundle from src with a CHANGED graph (new know-how).
    const g2 = { ...GRAPH, nodes: GRAPH.nodes.map((n) => (n.id === "clip" ? { ...n, params: { ...n.params, durationSec: 6 } } : n)) };
    fs.writeFileSync(path.join(workspaceDir("src"), "workflows", "episode.json"), JSON.stringify(g2, null, 2));
    const z2 = exportZip("src", "2.0.0");

    const result = upgradeWorkspace("deployed", z2, { allowMissingKeys: true });
    expect(result.applied).toBe(true);
    expect(result.preview.diff.some((d) => d.class === "graph" && d.changed.includes("workflows/episode.json"))).toBe(true);

    // Know-how replaced + prior versioned append-only.
    const wf = JSON.parse(fs.readFileSync(path.join(dep, "workflows", "episode.json"), "utf8"));
    expect(wf.nodes.find((n: { id: string }) => n.id === "clip").params.durationSec).toBe(6);
    expect(fs.existsSync(path.join(dep, "workflows", "episode.v2.json"))).toBe(true);
    const prior = JSON.parse(fs.readFileSync(path.join(dep, "workflows", "episode.v2.json"), "utf8"));
    expect(prior.nodes.find((n: { id: string }) => n.id === "clip").params.durationSec).toBe(5);

    // Runtime state untouched.
    const cal = JSON.parse(fs.readFileSync(path.join(dep, "calendar.json"), "utf8"));
    expect(cal.entries).toHaveLength(1);
    expect(cal.entries[0].id).toBe("e1");
    expect(fs.readFileSync(path.join(dep, "trust-agreement.jsonl"), "utf8")).toContain("approve");
    expect(fs.readFileSync(path.join(dep, "ingestion", "seen.jsonl"), "utf8")).toContain("abc");
    expect(fs.readFileSync(path.join(dep, "cache", "node-cache.jsonl"), "utf8")).toContain("k");
    expect(fs.readFileSync(path.join(dep, "farm", "dead-letter.jsonl"), "utf8")).toContain("u");
    expect(fs.readFileSync(path.join(dep, "farm", "webhook-tokens.json"), "utf8")).toContain("t");

    // Version pointer bumped.
    const wsm = JSON.parse(fs.readFileSync(path.join(dep, "workspace.json"), "utf8"));
    expect(wsm.bundle.version).toBe("2.0.0");

    // Lifecycle log records the upgrade.
    expect(fs.readFileSync(path.join(dep, "lifecycle.jsonl"), "utf8")).toContain('"event":"upgrade"');
  });
});

// ─── Trust streak reset on evaluator change ──────────────────────────────────

describe.skipIf(!hasZip)("trust agreement streak", () => {
  test("resets when the evaluator changes; preserved when it does not", () => {
    tmp = makeTmpRoot();
    // Case A — evaluator changes.
    seed("src-a", EVALUATORS);
    deploy("src-a", "1.0.0", "dep-a");
    fs.writeFileSync(path.join(workspaceDir("dep-a"), "trust-agreement.jsonl"), JSON.stringify({ at: "1", match: true }) + "\n");
    fs.writeFileSync(path.join(workspaceDir("src-a"), "evaluators.json"), JSON.stringify(EVALUATORS_V2, null, 2));
    const za = exportZip("src-a", "2.0.0");
    const ra = upgradeWorkspace("dep-a", za, { allowMissingKeys: true });
    expect(ra.streakReset).toBe(true);
    expect(fs.existsSync(path.join(workspaceDir("dep-a"), "trust-agreement.jsonl"))).toBe(false);
    expect(fs.existsSync(path.join(workspaceDir("dep-a"), "trust-agreement.jsonl.pre-v2.0.0"))).toBe(true);
    expect(fs.readFileSync(path.join(workspaceDir("dep-a"), "trust-audit.jsonl"), "utf8")).toContain("agreement streak reset");

    // Case B — evaluator unchanged.
    seed("src-b", EVALUATORS);
    deploy("src-b", "1.0.0", "dep-b");
    fs.writeFileSync(path.join(workspaceDir("dep-b"), "trust-agreement.jsonl"), JSON.stringify({ at: "1", match: true }) + "\n");
    // change only the prompt (know-how) so the version differs but evaluator is identical.
    fs.writeFileSync(path.join(workspaceDir("src-b"), "prompts", "hook.md"), "Write the hook, v2.\n");
    const zb = exportZip("src-b", "2.0.0");
    const rb = upgradeWorkspace("dep-b", zb, { allowMissingKeys: true });
    expect(rb.streakReset).toBe(false);
    expect(fs.readFileSync(path.join(workspaceDir("dep-b"), "trust-agreement.jsonl"), "utf8")).toContain("match");
  });
});

// ─── Active-run refusal ──────────────────────────────────────────────────────

describe.skipIf(!hasZip)("upgrade refuses while a run is active", () => {
  test("a running farm-state run blocks the upgrade", () => {
    tmp = makeTmpRoot();
    seed("src");
    deploy("src", "1.0.0", "deployed");
    // Plant a running run.
    const rd = runDir("deployed", "run-001");
    fs.mkdirSync(rd, { recursive: true });
    fs.writeFileSync(path.join(rd, "farm-state.json"), JSON.stringify({ workflow: "episode", status: "running", updatedAt: "x" }));
    const z2 = exportZip("src", "2.0.0");
    try {
      upgradeWorkspace("deployed", z2, { allowMissingKeys: true });
      expect.unreachable("must refuse while a run is active");
    } catch (e) {
      expect((e as BundleError).message).toContain("while a run is active");
    }
  });
});

// ─── Rollback round-trip ─────────────────────────────────────────────────────

describe.skipIf(!hasZip)("rollback restores prior know-how", () => {
  test("upgrade then rollback restores the prior graph, keeps runtime state", () => {
    tmp = makeTmpRoot();
    seed("src");
    deploy("src", "1.0.0", "deployed");
    const dep = workspaceDir("deployed");

    // v2 with a changed graph.
    const g2 = { ...GRAPH, nodes: GRAPH.nodes.map((n) => (n.id === "clip" ? { ...n, params: { ...n.params, durationSec: 9 } } : n)) };
    fs.writeFileSync(path.join(workspaceDir("src"), "workflows", "episode.json"), JSON.stringify(g2, null, 2));
    const z2 = exportZip("src", "2.0.0");
    upgradeWorkspace("deployed", z2, { allowMissingKeys: true });
    expect(JSON.parse(fs.readFileSync(path.join(dep, "workflows", "episode.json"), "utf8")).nodes.find((n: { id: string }) => n.id === "clip").params.durationSec).toBe(9);

    // Runtime state written AFTER the upgrade must survive the rollback.
    fs.writeFileSync(path.join(dep, "calendar.json"), JSON.stringify({ version: "1.0", slots: [], entries: [{ id: "post-up", unitType: "ugc-review", status: "queued", at: "2026-07-05T09:00:00+00:00" }] }));

    const rb = rollbackWorkspace("deployed");
    expect(rb.restoredVersion).toBe("1.0.0");
    expect(rb.fromVersion).toBe("2.0.0");

    // Prior graph restored.
    expect(JSON.parse(fs.readFileSync(path.join(dep, "workflows", "episode.json"), "utf8")).nodes.find((n: { id: string }) => n.id === "clip").params.durationSec).toBe(5);
    // Post-upgrade runtime state carried forward.
    expect(JSON.parse(fs.readFileSync(path.join(dep, "calendar.json"), "utf8")).entries[0].id).toBe("post-up");
    // Version pointer reverted.
    expect(JSON.parse(fs.readFileSync(path.join(dep, "workspace.json"), "utf8")).bundle.version).toBe("1.0.0");
    // Lifecycle log has both events.
    const life = fs.readFileSync(path.join(dep, "lifecycle.jsonl"), "utf8");
    expect(life).toContain('"event":"upgrade"');
    expect(life).toContain('"event":"rollback"');
  });

  test("rollback refuses when there is no snapshot", () => {
    tmp = makeTmpRoot();
    seed("src");
    deploy("src", "1.0.0", "deployed");
    try {
      rollbackWorkspace("deployed");
      expect.unreachable("must refuse without a snapshot");
    } catch (e) {
      expect((e as BundleError).code).toBe("not-found");
    }
  });
});

// ─── Backward compat (no zip needed for the lineage-unknown gate) ────────────

describe.skipIf(!hasZip)("backward compat", () => {
  test("unknown lineage refuses unless --allow-unknown-lineage", () => {
    tmp = makeTmpRoot();
    seed("src");
    // Deploy WITHOUT a bundleId (pre-#521 workspace).
    fs.cpSync(workspaceDir("src"), workspaceDir("deployed"), { recursive: true });
    const z = exportZip("src", "2.0.0"); // this bundle HAS a bundleId
    // Deployed has no bundleId → unknown lineage.
    try {
      previewUpgrade("deployed", z);
      expect.unreachable("must refuse unknown lineage");
    } catch (e) {
      expect((e as BundleError).message).toContain("lineage unknown");
    }
    // With the opt-in it proceeds.
    const preview = previewUpgrade("deployed", z, { allowUnknownLineage: true });
    expect(preview.toVersion).toBe("2.0.0");
  });
});

// Keep the parseYaml + workspacesDir imports referenced for tooling.
void workspacesDir;
