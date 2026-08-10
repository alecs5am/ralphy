// Integration test for `ralphy generate captions` (issue #010).
// Covers four sub-gaps:
//   1. --slot <X> writes per-slot, never to shared captions.json
//   2. empty transcript → captions=[] with exit 0 (no throw)
//   3. SRT + drawtext.filter sidecars emitted next to JSON
//   4. brand-spelling substitution from <project>/brand-spelling.json
// Plus the postmortem-driving concurrency case:
//   5. two parallel calls with different --slot both succeed, no clobber
//
// Uses RALPHY_FAKE_TRANSCRIBE_JSON to short-circuit live HTTP traffic.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { seedLegacyProject } from "../helpers/legacy-project.js";
import { setRoot } from "../../cli/lib/paths.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import { readGenerationInput } from "../../cli/lib/generation-input.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpHome: string;
let projectDir: string;
let audioPath: string;
let fakeRespPath: string;
let PROJECT_ID: string;

type RalphyResult = { exitCode: number; stdout: string; stderr: string; json: any };

function ralphy(args: string[], extraEnv: Record<string, string> = {}): RalphyResult {
  const r = spawnSync("bun", ["run", CLI, ...args], {
    cwd: tmpHome,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: tmpHome,
      RALPHY_HOME: tmpHome,
      // Keys must be set; transcribe() still calls pickBackend() before the
      // fake hook resolves. Test hook short-circuits HTTP traffic.
      ELEVENLABS_API_KEY: "test-key",
      OPENROUTER_API_KEY: "test-key",
      ...extraEnv,
    },
  });
  let json: any = null;
  try { json = JSON.parse(r.stdout); } catch { /* not JSON */ }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

beforeAll(() => {
  // realpath: on macOS /var → /private/var symlink; the CLI normalizes paths,
  // so the test must too or the toBe() comparisons mismatch.
  tmpHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-captions-it-")));
  setRoot(tmpHome);
  fs.mkdirSync(path.join(tmpHome, ".ralphy"), { recursive: true });
  openDomainDb();
  const workspace = createWorkspace({ slug: "default", name: "Default" });
  PROJECT_ID = createProject({
    workspaceId: workspace.id,
    slug: "captions-test-001",
    name: "captions test",
  }).id;
  closeDomainDb();
  setRoot(REPO);
  seedLegacyProject(tmpHome, PROJECT_ID, { name: "captions test" });
  projectDir = path.join(tmpHome, ".ralphy", "workspaces", "default", "projects", PROJECT_ID);

  // Stub audio file (4 bytes — transcribe() only checks existence + ≤25MB).
  audioPath = path.join(projectDir, "vo.mp3");
  fs.writeFileSync(audioPath, Buffer.from([0xff, 0xfb, 0x90, 0x44]));

  // Fake transcribe response file.
  fakeRespPath = path.join(tmpHome, "fake-transcribe.json");
  fs.writeFileSync(
    fakeRespPath,
    JSON.stringify({
      captions: [
        { text: "Ralfy", startMs: 0, endMs: 500, timestampMs: 250, confidence: 0.95 },
        { text: "ships", startMs: 600, endMs: 1100, timestampMs: 850, confidence: 0.95 },
      ],
      audioDurationSec: 1.5,
      language: "eng",
      languageProbability: 0.99,
      lowConfidenceWords: [],
    }),
  );
});

afterAll(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe("`ralphy generate captions` domain output", () => {
  test("--slot scene-01 creates an Artifact revision without legacy files", () => {
    const r = ralphy(
      [
        "generate", "captions",
        "--project", PROJECT_ID,
        "--audio", audioPath,
        "--slot", "scene-01",
        "--backend", "elevenlabs",
      ],
      { RALPHY_FAKE_TRANSCRIBE_JSON: fakeRespPath },
    );
    expect(r.exitCode).toBe(0);
    expect(r.json?.artifactId).toMatch(/^art_/);
    expect(r.json?.revisionId).toMatch(/^arev_/);
    expect(r.json?.runId).toMatch(/^run_/);
    expect(r.json?.artifacts).toEqual([
      expect.objectContaining({ kind: "captions", mime: "application/json" }),
      expect.objectContaining({ kind: "captions", mime: "application/x-subrip" }),
      expect.objectContaining({ kind: "data", mime: "text/plain" }),
    ]);
    expect(JSON.stringify(r.json)).not.toContain(tmpHome);

    setRoot(tmpHome);
    const db = openDomainDb();
    const results = db.query<{
      position: number;
      slug: string;
      kind: string;
      mime: string;
    }, [string]>(`
      SELECT result.position, artifact.slug, artifact.kind, object.mime
      FROM run_results result
      JOIN artifact_revisions revision ON revision.id = result.entity_id
      JOIN artifacts artifact ON artifact.id = revision.artifact_id
      JOIN objects object ON object.id = revision.object_id
      WHERE result.run_id = ? ORDER BY result.position
    `).all(r.json.runId);
    const scratchFiles = fs.existsSync(path.join(tmpHome, ".ralphy", "tmp", r.json.runId))
      ? fs.readdirSync(path.join(tmpHome, ".ralphy", "tmp", r.json.runId))
      : [];
    const persisted = db.query<{ value: string | null }, []>(`
      SELECT metadata_json AS value FROM artifact_revisions
      UNION ALL SELECT metadata_json FROM objects
      UNION ALL SELECT request_json FROM run_attempts
      UNION ALL SELECT response_json FROM run_attempts
      UNION ALL SELECT metadata_json FROM run_objects
      UNION ALL SELECT payload_json FROM activity_events
    `).all().map((row) => row.value ?? "").join("\n");
    const attempt = db.query<{ request: string | null }, [string]>(
      "SELECT request_json AS request FROM run_attempts WHERE run_id = ?",
    ).get(r.json.runId);
    closeDomainDb();
    setRoot(REPO);

    expect(results).toEqual([
      { position: 0, slug: "scene-01", kind: "captions", mime: "application/json" },
      { position: 1, slug: "scene-01-srt", kind: "captions", mime: "application/x-subrip" },
      { position: 2, slug: "scene-01-drawtext", kind: "data", mime: "text/plain" },
    ]);
    expect(scratchFiles).toEqual([]);
    expect(readGenerationInput(JSON.parse(attempt?.request ?? "null"))).toEqual({
      version: 1,
      texts: [],
      parameters: [
        { name: "language", value: "auto" },
        { name: "backend", value: "elevenlabs" },
      ],
    });
    expect(persisted).not.toContain(audioPath);
    expect(fs.existsSync(path.join(projectDir, "artifacts", "captions", "scene-01.json"))).toBe(false);
    expect(fs.existsSync(path.join(projectDir, "captions.json"))).toBe(false);
  });

  test("--legacy-output is the explicit compatibility path for JSON and sidecars", () => {
    const r = ralphy(
      ["generate", "captions", "--project", PROJECT_ID, "--audio", audioPath,
        "--slot", "legacy", "--backend", "elevenlabs", "--legacy-output"],
      { RALPHY_FAKE_TRANSCRIBE_JSON: fakeRespPath },
    );
    expect(r.exitCode).toBe(0);
    const jsonPath = path.join(projectDir, "captions.json");
    const srt = fs.readFileSync(jsonPath.replace(/\.json$/, ".srt"), "utf8");
    expect(srt).toContain("-->");
    const filter = fs.readFileSync(jsonPath.replace(/\.json$/, ".drawtext.filter"), "utf8");
    expect(filter).toContain("drawtext=");
    expect(filter).toContain("between(t,");
  });

  test("empty transcript → captions=[] with exit 0", () => {
    const emptyRespPath = path.join(tmpHome, "fake-empty.json");
    fs.writeFileSync(emptyRespPath, JSON.stringify({ captions: [], audioDurationSec: 5 }));
    const r = ralphy(
      [
        "generate", "captions",
        "--project", PROJECT_ID,
        "--audio", audioPath,
        "--slot", "scene-silent",
        "--backend", "elevenlabs",
      ],
      { RALPHY_FAKE_TRANSCRIBE_JSON: emptyRespPath },
    );
    expect(r.exitCode).toBe(0);
    expect(r.json?.captions).toBe(0);
    expect(r.json?.artifactId).toMatch(/^art_/);
  });

  test("brand-spelling.json overrides built-in dict", () => {
    fs.writeFileSync(
      path.join(projectDir, "brand-spelling.json"),
      JSON.stringify({ ships: "🚢ships" }),
    );
    const r = ralphy(
      [
        "generate", "captions",
        "--project", PROJECT_ID,
        "--audio", audioPath,
        "--slot", "scene-02-brand",
        "--backend", "elevenlabs",
        "--legacy-output",
      ],
      { RALPHY_FAKE_TRANSCRIBE_JSON: fakeRespPath },
    );
    expect(r.exitCode).toBe(0);
    const jsonPath = path.join(projectDir, "captions.json");
    const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const tokens = parsed.captions.map((c: { text: string }) => c.text);
    // "Ralfy" → "Ralphy" via built-in.
    expect(tokens[0]).toBe("Ralphy");
    // "ships" → "🚢ships" via project override.
    expect(tokens[1]).toBe("🚢ships");
  });

  test("two parallel calls with different --slot both succeed, no clobber", async () => {
    const callOne = new Promise<RalphyResult>((resolve) => {
      setImmediate(() => {
        resolve(ralphy(
          [
            "generate", "captions",
            "--project", PROJECT_ID,
            "--audio", audioPath,
            "--slot", "parallel-a",
            "--backend", "elevenlabs",
          ],
          { RALPHY_FAKE_TRANSCRIBE_JSON: fakeRespPath },
        ));
      });
    });
    const callTwo = new Promise<RalphyResult>((resolve) => {
      setImmediate(() => {
        resolve(ralphy(
          [
            "generate", "captions",
            "--project", PROJECT_ID,
            "--audio", audioPath,
            "--slot", "parallel-b",
            "--backend", "elevenlabs",
          ],
          { RALPHY_FAKE_TRANSCRIBE_JSON: fakeRespPath },
        ));
      });
    });
    const [a, b] = await Promise.all([callOne, callTwo]);
    expect(a.exitCode).toBe(0);
    expect(b.exitCode).toBe(0);
    expect(a.json?.revisionId).toMatch(/^arev_/);
    expect(b.json?.revisionId).toMatch(/^arev_/);
    expect(a.json?.revisionId).not.toBe(b.json?.revisionId);
  });
});
