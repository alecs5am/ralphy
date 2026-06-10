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

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpHome: string;
let projectDir: string;
let audioPath: string;
let fakeRespPath: string;
const PROJECT_ID = "captions-test-001";

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
  // Create the project via the CLI so it lands in the registry properly.
  const r = ralphy(["project", "create", "--name", "captions test", "--id", PROJECT_ID]);
  if (r.exitCode !== 0) throw new Error(`project create failed: ${r.stderr}\n${r.stdout}`);
  projectDir = path.join(tmpHome, "workspace", "projects", PROJECT_ID);

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

describe("`ralphy generate captions` per-slot output (#010)", () => {
  test("--slot scene-01 writes to artifacts/captions/scene-01.json, NOT shared captions.json", () => {
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
    const expected = path.join(projectDir, "artifacts", "captions", "scene-01.json");
    expect(fs.existsSync(expected)).toBe(true);
    expect(r.json?.path).toBe(expected);
    // Shared legacy file must NOT exist on the default per-slot path.
    expect(fs.existsSync(path.join(projectDir, "captions.json"))).toBe(false);
  });

  test("SRT + drawtext.filter sidecars emitted next to JSON", () => {
    const jsonPath = path.join(projectDir, "artifacts", "captions", "scene-01.json");
    const srtPath = jsonPath.replace(/\.json$/, ".srt");
    const filterPath = jsonPath.replace(/\.json$/, ".drawtext.filter");
    expect(fs.existsSync(srtPath)).toBe(true);
    expect(fs.existsSync(filterPath)).toBe(true);
    const srt = fs.readFileSync(srtPath, "utf8");
    expect(srt).toContain("-->");
    const filter = fs.readFileSync(filterPath, "utf8");
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
    const jsonPath = path.join(projectDir, "artifacts", "captions", "scene-silent.json");
    const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(parsed.captions).toEqual([]);
    expect(parsed.low_confidence_words).toEqual([]);
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
      ],
      { RALPHY_FAKE_TRANSCRIBE_JSON: fakeRespPath },
    );
    expect(r.exitCode).toBe(0);
    const jsonPath = path.join(projectDir, "artifacts", "captions", "scene-02-brand.json");
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
    expect(fs.existsSync(path.join(projectDir, "artifacts", "captions", "parallel-a.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, "artifacts", "captions", "parallel-b.json"))).toBe(true);
    // No shared captions.json clobber.
    expect(fs.existsSync(path.join(projectDir, "captions.json"))).toBe(false);
  });
});
