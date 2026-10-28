// `ralphy generate image --import <file>` (#572).
//
// Host-native image tools (Codex / Claude) produced 120 untracked images in the
// #562 baseline, then 167 hand-written `project log-asset` calls. The import
// path registers such a file into a slot in ONE call, with the same domain
// evidence a provider generation writes:
//
//   1. Append-only: every import is a NEW Artifact revision with its own Object;
//      earlier revisions and the caller's source file are never touched
//      (AGENTS.md invariant #14). `--force-overwrite` behaves exactly as on a
//      provider generation: domain revisions are immutable, so it still appends.
//   2. The generation record (Run kind `generate.image` + Run Attempt) carries
//      zero cost and the provenance: source (Attempt provider), host model,
//      prompt (generation input), `operation: "import"`.
//   3. The Artifact store (the domain asset manifest) holds the slot, and the
//      cost rollup (`actualSpendUsd` / media generation detail) counts it at $0.
//   4. No provider connector is ever called.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { generateCmd } from "../../cli/commands/generate.js";
import { readGenerationInput } from "../../cli/lib/generation-input.js";
import { sniffImage } from "../../cli/lib/image-import.js";
import { setRoot } from "../../cli/lib/paths.js";
import { openrouterConnector } from "../../cli/lib/providers/openrouter.js";
import { actualSpendUsd } from "../../cli/lib/spend.js";
import { listArtifactRevisions, listArtifacts } from "../../cli/lib/store/artifacts.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import {
  finishRun,
  finishRunAttempt,
  getMediaGenerationDetail,
  listRuns,
  projectRunAttemptSpendUsd,
  startRun,
  startRunAttempt,
} from "../../cli/lib/store/runs.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import { setMode } from "../../cli/lib/ui.js";
import { seedLegacyProject } from "../helpers/legacy-project.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let fixtureRoot: string;
let providerCalls = 0;
let originalGenerateImage: typeof openrouterConnector.generateImage;
let originalAvailable: typeof openrouterConnector.available;

function pngBytes(tag: string): Buffer {
  return Buffer.concat([PNG_SIGNATURE, Buffer.from(`fixture-${tag}`)]);
}

function writeSource(name: string, bytes: Buffer): string {
  const file = path.join(fixtureRoot, "host-output", name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return file;
}

/** Run `generate image ...` in-process and return the parsed JSON it printed. */
async function generateImage(args: string[]): Promise<any> {
  const printed: string[] = [];
  const originalLog = console.log;
  console.log = (...parts: unknown[]) => printed.push(parts.map(String).join(" "));
  try {
    await generateCmd().parseAsync(["image", ...args], { from: "user" });
  } finally {
    console.log = originalLog;
  }
  return JSON.parse(printed.join("\n"));
}

function objectBytes(objectId: string): Buffer {
  const row = openDomainDb()
    .query<{ bucket: string; key: string }, [string]>("SELECT bucket, key FROM objects WHERE id = ?")
    .get(objectId)!;
  return fs.readFileSync(path.join(fixtureRoot, ".ralphy", row.bucket, row.key));
}

function attemptRow(runId: string) {
  return openDomainDb()
    .query<{
      provider: string | null;
      model: string | null;
      cost: number | null;
      state: string;
      request: string | null;
      response: string | null;
    }, [string]>(
      `SELECT provider, model, cost_usd AS cost, state, request_json AS request, response_json AS response
       FROM run_attempts WHERE run_id = ?`,
    )
    .get(runId)!;
}

function runRow(runId: string) {
  return openDomainDb()
    .query<{ kind: string; label: string; state: string; metadata: string | null }, [string]>(
      "SELECT kind, label, state, metadata_json AS metadata FROM runs WHERE id = ?",
    )
    .get(runId)!;
}

function revisionMetadata(revisionId: string): unknown {
  const row = openDomainDb()
    .query<{ metadata: string | null }, [string]>(
      "SELECT metadata_json AS metadata FROM artifact_revisions WHERE id = ?",
    )
    .get(revisionId)!;
  return row.metadata === null ? null : JSON.parse(row.metadata);
}

function seedProject(slug: string) {
  const workspace = createWorkspace({ slug: "default", name: "Default" });
  const project = createProject({ workspaceId: workspace.id, slug, name: slug });
  const legacyDir = seedLegacyProject(fixtureRoot, project.id);
  return { workspace, project, legacyDir, context: { workspaceId: workspace.id, projectId: project.id } };
}

beforeEach(() => {
  setMode("json");
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-image-import-"));
  setRoot(fixtureRoot);
  fs.mkdirSync(path.join(fixtureRoot, ".ralphy"), { recursive: true });
  openDomainDb();
  providerCalls = 0;
  originalGenerateImage = openrouterConnector.generateImage;
  originalAvailable = openrouterConnector.available;
  openrouterConnector.available = () => true;
  openrouterConnector.generateImage = async () => {
    providerCalls += 1;
    throw new Error("import must not call a provider");
  };
});

afterEach(() => {
  openrouterConnector.generateImage = originalGenerateImage;
  openrouterConnector.available = originalAvailable;
  setMode("auto");
  closeDomainDb();
  setRoot(REPO);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("sniffImage", () => {
  test("recognizes PNG, JPEG and WebP by magic bytes and rejects anything else", () => {
    expect(sniffImage(pngBytes("x"))).toEqual({ mime: "image/png", extension: ".png" });
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ mime: "image/jpeg", extension: ".jpg" });
    expect(sniffImage(Buffer.from("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ", "latin1")))
      .toEqual({ mime: "image/webp", extension: ".webp" });
    expect(sniffImage(Buffer.from("plain text, not an image"))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});

describe("generate image --import (#572): append-only revisions", () => {
  test("each import appends a new revision; earlier revisions and the source file are never overwritten", async () => {
    const { project, legacyDir, context } = seedProject("import-versions");
    const first = writeSource("hero-a.png", pngBytes("a"));
    const second = writeSource("hero-b.png", pngBytes("b"));
    const third = writeSource("hero-c.png", pngBytes("c"));

    const r1 = await generateImage(["--import", first, "--project", project.id, "--slot", "hero"]);
    const r2 = await generateImage(["--import", second, "--project", project.id, "--slot", "hero"]);
    // --force-overwrite matches a provider generation: revisions are immutable,
    // so the escape hatch still appends rather than destroying revision 2.
    const r3 = await generateImage(["--import", third, "--project", project.id, "--slot", "hero", "--force-overwrite"]);

    expect([r1.revisionNo, r2.revisionNo, r3.revisionNo]).toEqual([1, 2, 3]);
    expect(new Set([r1.artifactId, r2.artifactId, r3.artifactId]).size).toBe(1);
    for (const result of [r1, r2, r3]) {
      expect(result.mode).toBe("import");
      expect(result.slot).toBe("hero");
      expect(result.costUsd).toBe(0);
    }

    const artifacts = listArtifacts({ context, limit: 10 }).items;
    expect(artifacts.map((artifact) => [artifact.slug, artifact.kind])).toEqual([["hero", "image"]]);
    const revisions = listArtifactRevisions({ context, artifactId: artifacts[0]!.id, limit: 10 }).items;
    expect(revisions.map((revision) => revision.revisionNo)).toEqual([1, 2, 3]);
    expect(new Set(revisions.map((revision) => revision.objectId)).size).toBe(3);
    expect(objectBytes(r1.objectId)).toEqual(pngBytes("a"));
    expect(objectBytes(r2.objectId)).toEqual(pngBytes("b"));
    expect(objectBytes(r3.objectId)).toEqual(pngBytes("c"));

    // Copy, never move: the host's files are still there, byte-identical.
    expect(fs.readFileSync(first)).toEqual(pngBytes("a"));
    expect(fs.readFileSync(second)).toEqual(pngBytes("b"));
    expect(fs.readFileSync(third)).toEqual(pngBytes("c"));

    // Same domain-only evidence as a provider generation: no legacy files.
    expect(fs.existsSync(path.join(legacyDir, "asset-manifest.json"))).toBe(false);
    expect(fs.existsSync(path.join(legacyDir, "logs", "generations.jsonl"))).toBe(false);
    expect(providerCalls).toBe(0);
  });

  test("--dry-run validates the file and writes nothing", async () => {
    const { project, context } = seedProject("import-dry-run");
    const source = writeSource("dry.png", pngBytes("dry"));
    const result = await generateImage(["--import", source, "--project", project.id, "--slot", "dry", "--dry-run"]);
    expect(result).toMatchObject({ dryRun: true, mode: "import", slot: "dry", cost_estimate_usd: 0, would_call: [] });
    expect(listArtifacts({ context, limit: 10 }).items).toHaveLength(0);
    expect(listRuns({ context, limit: 10 }).items).toHaveLength(0);
  });
});

describe("generate image --import (#572): generation record and provenance", () => {
  test("the Run Attempt records zero spend, the source, the host model and the prompt", async () => {
    const { project } = seedProject("import-provenance");
    const source = writeSource("host.png", pngBytes("host"));

    const result = await generateImage([
      "--import", source, "--project", project.id, "--slot", "scene-01-bg",
      "--prompt", "a lighthouse at dusk, film grain", "--model", "gpt-image-1",
    ]);
    expect(result).toMatchObject({ source: "host-native", model: "gpt-image-1", mime: "image/png", costUsd: 0 });

    expect(runRow(result.runId)).toEqual({
      kind: "generate.image",
      label: "scene-01-bg",
      state: "succeeded",
      metadata: JSON.stringify({ operation: "import", source: "host-native" }),
    });
    const attempt = attemptRow(result.runId);
    expect(attempt.provider).toBe("host-native");
    expect(attempt.model).toBe("gpt-image-1");
    expect(attempt.cost).toBe(0);
    expect(attempt.state).toBe("succeeded");
    expect(readGenerationInput(JSON.parse(attempt.request!))).toEqual({
      version: 1,
      texts: [{ role: "prompt", value: "a lighthouse at dusk, film grain", truncated: false }],
      parameters: [],
    });
    expect(JSON.parse(attempt.response!)).toEqual({
      operation: "import", source: "host-native", model: "gpt-image-1", mime: "image/png",
    });
    expect(revisionMetadata(result.revisionId)).toEqual({
      operation: "import", source: "host-native", model: "gpt-image-1",
    });
  });

  test("an unknown host model stays null (the provider default is never recorded) and --source is honored", async () => {
    const { project } = seedProject("import-unknown-model");
    const source = writeSource("photo.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));

    const result = await generateImage(["--import", source, "--project", project.id, "--slot", "user-photo", "--source", "user"]);
    expect(result).toMatchObject({ source: "user", model: null, mime: "image/jpeg" });
    const attempt = attemptRow(result.runId);
    expect(attempt.provider).toBe("user");
    expect(attempt.model).toBeNull();
    expect(attempt.cost).toBe(0);
    expect(readGenerationInput(JSON.parse(attempt.request!))).toEqual({ version: 1, texts: [], parameters: [] });
  });

  test("a workspace destination lands in the shared tier", async () => {
    const workspace = createWorkspace({ slug: "default", name: "Default" });
    const source = writeSource("logo.png", pngBytes("logo"));
    const result = await generateImage(["--import", source, "--workspace", workspace.id, "--slot", "brand-logo"]);
    const artifacts = listArtifacts({ context: { workspaceId: workspace.id }, limit: 10 }).items;
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.id).toBe(result.artifactId);
    expect(artifacts[0]!.projectId).toBeNull();
    expect(attemptRow(result.runId).cost).toBe(0);
  });
});

describe("generate image --import (#572): cost rollup", () => {
  test("the rollup includes the import at $0 next to a paid generation", async () => {
    const { project, context } = seedProject("import-rollup");
    const paid = startRun({ projectId: project.id, kind: "generate.image", label: "paid" });
    const paidAttempt = startRunAttempt({ runId: paid.id, provider: "fixture", model: "fixture/image" });
    finishRunAttempt(paidAttempt.id, { state: "succeeded", costUsd: 0.75 });
    finishRun(paid.id, { state: "succeeded" });

    const source = writeSource("free.png", pngBytes("free"));
    const result = await generateImage(["--import", source, "--project", project.id, "--slot", "free"]);

    expect(projectRunAttemptSpendUsd(project.id)).toBeCloseTo(0.75, 6);
    expect(await actualSpendUsd(project.id)).toBeCloseTo(0.75, 6);
    const detail = getMediaGenerationDetail({
      context,
      target: { type: "artifact-revision", id: result.revisionId },
      limit: 10,
    });
    expect(detail.status).toBe("generation");
    if (detail.status !== "generation") throw new Error("expected a generation detail");
    expect(detail.cost).toEqual({ knownUsd: 0, complete: true });
    expect(detail.attempts.items.map((attempt) => [attempt.provider, attempt.costUsd])).toEqual([["host-native", 0]]);
  });
});

describe("generate image --import (#572): refusals", () => {
  function cli(args: string[]) {
    const child = Bun.spawnSync(
      [process.execPath, "run", CLI, "--json", "--root", path.join(fixtureRoot, ".ralphy"), "generate", "image", ...args],
      { cwd: fixtureRoot, env: { ...process.env, NO_COLOR: "1" }, stdout: "pipe", stderr: "pipe" },
    );
    return { exitCode: child.exitCode, stderr: child.stderr.toString() };
  }

  test("a non-image file and --variants are refused before any record is written", () => {
    const { project, context } = seedProject("import-refusals");
    const text = writeSource("notes.txt", Buffer.from("not an image"));
    const png = writeSource("ok.png", pngBytes("ok"));

    const notImage = cli(["--import", text, "--project", project.id, "--slot", "notes"]);
    expect(notImage.exitCode).toBe(2);
    expect(notImage.stderr).toContain("E_INPUT_INVALID");
    expect(notImage.stderr).toContain("is not a PNG, JPEG or WebP image");

    const variants = cli(["--import", png, "--project", project.id, "--slot", "ok", "--variants", "3"]);
    expect(variants.exitCode).toBe(2);
    expect(variants.stderr).toContain("--variants cannot be combined with --import");

    expect(listRuns({ context, limit: 10 }).items).toHaveLength(0);
    expect(fs.readFileSync(png)).toEqual(pngBytes("ok"));
  });
});
