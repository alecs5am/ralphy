// Domain-backed integration coverage for ordinary `ralphy ref pull`.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setRoot } from "../../cli/lib/paths.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { artifactRevisionObjectPath, seedDomainProject, type DomainProjectFixture } from "../helpers/domain-media.js";
import { spawnCli, type CliResult } from "../helpers/spawn-cli.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpRoot: string;
let fixtureMp4: string;
let fixtureDir: string;
let domain: DomainProjectFixture;

beforeAll(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-ref-ws-fixture-"));
  fixtureMp4 = path.join(fixtureDir, "tiny.mp4");
  const result = spawnSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=black:s=64x64:d=0.5",
    "-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono",
    "-shortest", "-t", "0.5", "-pix_fmt", "yuv420p", fixtureMp4,
  ], { stdio: "ignore" });
  if (result.status !== 0) throw new Error("failed to build tiny mp4 fixture (ffmpeg required)");
});

afterAll(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-ref-ws-"));
  domain = seedDomainProject(tmpRoot, "ordinary-pull");
});

afterEach(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

function ralphy(args: string[]): Promise<CliResult> {
  return spawnCli([CLI, "--cwd", tmpRoot, ...args], { cwd: tmpRoot, timeoutMs: 30_000 });
}

function ralphyWithEnv(args: string[], env: NodeJS.ProcessEnv): Promise<CliResult> {
  return spawnCli([CLI, "--cwd", tmpRoot, ...args], {
    cwd: tmpRoot,
    timeoutMs: 30_000,
    env: { ...process.env, ...env },
  });
}

describe("`ralphy ref pull` domain storage", () => {
  test("Project destination returns three durable Artifact revisions and no legacy paths", async () => {
    const result = await ralphy([
      "ref", "pull", "fixture-label", "--local", fixtureMp4, "--slug", "reel-001",
      "--project", domain.projectId,
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.json.runId).toMatch(/^run_/);
    expect(result.json.artifacts).toHaveLength(3);
    for (const artifact of result.json.artifacts as Array<{ revisionId: string }>) {
      expect(fs.existsSync(artifactRevisionObjectPath(tmpRoot, domain, artifact.revisionId))).toBe(true);
    }
    expect(JSON.stringify(result.json)).not.toContain(tmpRoot);
    expect(fs.existsSync(path.join(tmpRoot, ".ralphy", "references", "reel-001"))).toBe(false);
  });

  test("Workspace destination creates shared Artifact revisions without a legacy shared/refs tree", async () => {
    const result = await ralphy([
      "ref", "pull", "fixture-label", "--local", fixtureMp4, "--slug", "reel-002",
      "--workspace", domain.workspaceId,
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.json.artifacts).toHaveLength(3);
    expect(JSON.stringify(result.json)).not.toContain(tmpRoot);
    expect(fs.existsSync(path.join(tmpRoot, ".ralphy", "workspaces", "default", "shared", "refs")))
      .toBe(false);
  });

  test("requires an explicit domain destination", async () => {
    const result = await ralphy([
      "ref", "pull", "fixture-label", "--local", fixtureMp4, "--slug", "reel-003",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("requires exactly one of --project <id> or --workspace <id>");
  });

  test("rejects the legacy --global write mode", async () => {
    const result = await ralphy([
      "ref", "pull", "fixture-label", "--local", fixtureMp4, "--slug", "reel-004",
      "--project", domain.projectId, "--global",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("does not write the legacy global references tree");
  });

  test("pull then frames resolves the latest domain video without restoring source.mp4", async () => {
    const pulled = await ralphy([
      "ref", "pull", "fixture-label", "--local", fixtureMp4, "--slug", "frames-domain",
      "--project", domain.projectId,
    ]);
    expect(pulled.exitCode).toBe(0);

    const framed = await ralphy([
      "ref", "frames", "frames-domain", "--project", domain.projectId,
      "--fps", "10", "--max", "1", "--width", "32",
    ]);
    expect({ exitCode: framed.exitCode, stderr: framed.stderr }).toMatchObject({ exitCode: 0 });
    expect(framed.json.count).toBe(1);
    expect(framed.json.sourceRevisionId).toMatch(/^arev_/);
    expect(JSON.stringify(framed.json)).not.toContain(tmpRoot);
    expect(fs.existsSync(path.join(tmpRoot, ".ralphy", "references", "frames-domain", "source.mp4")))
      .toBe(false);
    expect(fs.existsSync(path.join(tmpRoot, ".ralphy", "references", "frames-domain"))).toBe(false);
  });

  test("pull then transcribe resolves the latest domain audio without restoring source.mp3", async () => {
    const pulled = await ralphy([
      "ref", "pull", "fixture-label", "--local", fixtureMp4, "--slug", "transcribe-domain",
      "--project", domain.projectId,
    ]);
    expect(pulled.exitCode).toBe(0);
    const fakeTranscript = path.join(tmpRoot, "fake-transcript.json");
    fs.writeFileSync(fakeTranscript, JSON.stringify({
      captions: [{ text: "hello", startMs: 0, endMs: 100 }],
      audioDurationSec: 0.5,
      language: "eng",
      backend: "gemini",
      model: "google/gemini-2.5-flash",
      durationMs: 321,
      usage: { prompt_tokens: 120, completion_tokens: 2, cost: 0.123 },
    }));

    const transcribed = await ralphyWithEnv([
      "ref", "transcribe", "transcribe-domain", "--project", domain.projectId,
      "--backend", "gemini", "--language", "en",
    ], { RALPHY_FAKE_TRANSCRIBE_JSON: fakeTranscript });
    expect({ exitCode: transcribed.exitCode, stderr: transcribed.stderr }).toMatchObject({ exitCode: 0 });
    expect(transcribed.json.captions).toBe(1);
    expect(transcribed.json.sourceRevisionId).toMatch(/^arev_/);
    expect(JSON.stringify(transcribed.json)).not.toContain(tmpRoot);
    expect(fs.existsSync(path.join(tmpRoot, ".ralphy", "references", "transcribe-domain", "source.mp3")))
      .toBe(false);
    expect(fs.existsSync(path.join(tmpRoot, ".ralphy", "references", "transcribe-domain"))).toBe(false);

    setRoot(tmpRoot);
    const db = openDomainDb();
    const attempt = db.query<{
      id: string;
      provider: string | null;
      model: string | null;
      costUsd: number | null;
      response: string | null;
    }, [string]>(`
      SELECT id, provider, model, cost_usd AS costUsd, response_json AS response
      FROM run_attempts WHERE run_id = ? ORDER BY attempt_no DESC LIMIT 1
    `).get(transcribed.json.runId)!;
    const activity = db.query<{ payload: string }, [string]>(`
      SELECT payload_json AS payload FROM activity_events
      WHERE entity_id = ? AND action = 'run.attempt_finished'
      ORDER BY id DESC LIMIT 1
    `).get(attempt.id)!;
    const objectMetadata = db.query<{ metadata: string | null }, [string]>(`
      SELECT object.metadata_json AS metadata
      FROM run_results result
      JOIN artifact_revisions revision ON revision.id = result.entity_id
      JOIN objects object ON object.id = revision.object_id
      WHERE result.run_id = ? ORDER BY result.position LIMIT 1
    `).get(transcribed.json.runId)!;
    closeDomainDb();
    setRoot(REPO);

    expect(attempt.provider).toBe("openrouter");
    expect(attempt.model).toBe("google/gemini-2.5-flash");
    expect(attempt.costUsd).toBe(0.123);
    expect(JSON.parse(attempt.response ?? "null")).toMatchObject({
      model: "google/gemini-2.5-flash",
      latencyMs: 321,
    });
    expect(JSON.parse(objectMetadata.metadata ?? "null")).toMatchObject({
      provider: "openrouter",
      model: "google/gemini-2.5-flash",
    });
    expect(JSON.parse(activity.payload)).toMatchObject({ costUsd: 0.123 });
  });
});
