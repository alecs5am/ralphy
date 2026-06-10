// Unit tests for cli/lib/path-resolution.ts — issue #025.
//
// Three behaviors under test:
//   1. cwd-first resolution with project-relative + refs/ fallback when
//      `--project` is set.
//   2. NBSP / U+00A0 / zero-width whitespace normalization at intake, with a
//      stderr warning when it triggered.
//   3. --prompt / --prompt-file symmetry through readPromptOrFile().
//
// We re-bind the ralphy `root()` to a temp directory via the existing
// `tests/helpers/tmp-root` so the project-relative fallback resolves against
// a sandbox, not the user's real workspace.
//
// All NBSP / zero-width literals are built via `String.fromCharCode` so the
// test source survives editor / clipboard round-trips that silently coerce
// invisible whitespace to ASCII.

import { describe, test, expect, spyOn, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  intakePath,
  normalizePathChars,
  readPromptOrFile,
  readRefsOrFile,
  resolveProjectPath,
} from "../../cli/lib/path-resolution.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const NBSP_NARROW = String.fromCharCode(0x202f); // macOS screenshot offender
const NBSP_WIDE = String.fromCharCode(0x00a0);
const ZW_SPACE = String.fromCharCode(0x200b);

let stderrBuf = "";
let consoleErrSpy: ReturnType<typeof spyOn> | null = null;

beforeEach(() => {
  stderrBuf = "";
  consoleErrSpy = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    stderrBuf += args.map((a) => (typeof a === "string" ? a : String(a))).join(" ") + "\n";
  });
});

afterEach(() => {
  consoleErrSpy?.mockRestore();
});

describe("normalizePathChars — NBSP / zero-width detection", () => {
  test("U+202F (macOS screenshot offender) is replaced with ASCII space", () => {
    const r = normalizePathChars(`Screenshot${NBSP_NARROW}2026-05-29.png`);
    expect(r.normalized).toBe(true);
    expect(r.path).toBe("Screenshot 2026-05-29.png");
  });

  test("U+00A0 NO-BREAK SPACE is replaced", () => {
    const r = normalizePathChars(`foo${NBSP_WIDE}bar.png`);
    expect(r.normalized).toBe(true);
    expect(r.path).toBe("foo bar.png");
  });

  test("U+200B ZERO-WIDTH SPACE is replaced", () => {
    const r = normalizePathChars(`hidden${ZW_SPACE}.png`);
    expect(r.normalized).toBe(true);
    expect(r.path).toBe("hidden .png");
  });

  test("vanilla ASCII path passes through unchanged", () => {
    const r = normalizePathChars("plain-old-path.png");
    expect(r.normalized).toBe(false);
    expect(r.path).toBe("plain-old-path.png");
  });
});

describe("intakePath — NBSP normalization + stderr warning", () => {
  test("NBSP in path triggers a stderr warning AND returns the cleaned path", () => {
    const got = intakePath(`ghosts${NBSP_NARROW}of${NBSP_NARROW}file.png`, undefined, "test");
    expect(stderrBuf).toContain("invisible whitespace");
    expect(got).not.toContain(NBSP_NARROW);
    expect(got).not.toContain(NBSP_WIDE);
    expect(got).not.toContain(ZW_SPACE);
  });

  test("URL inputs pass through unchanged and do NOT warn", () => {
    const got = intakePath("https://example.com/foo.png", "some-project", "ref");
    expect(got).toBe("https://example.com/foo.png");
    expect(stderrBuf).toBe("");
  });

  test("data: URI inputs pass through unchanged", () => {
    const got = intakePath("data:image/png;base64,XXX", undefined, "ref");
    expect(got).toBe("data:image/png;base64,XXX");
  });
});

describe("resolveProjectPath — cwd-first, project-relative fallback", () => {
  let tmp: TmpRoot;
  let prevCwd: string;
  let cwdSandbox: string;

  beforeEach(() => {
    tmp = makeTmpRoot("path-resolution");
    prevCwd = process.cwd();
    // macOS `os.tmpdir()` is `/var/...`; chdir resolves the symlink to
    // `/private/var/...`, so we realpath-normalize up-front for stable asserts.
    cwdSandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "path-cwd-")));
    process.chdir(cwdSandbox);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    try {
      fs.rmSync(cwdSandbox, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
    tmp.cleanup();
  });

  test("cwd-relative file wins when it exists (legacy happy path preserved)", () => {
    const fileName = "scene-01-master.png";
    fs.writeFileSync(path.join(cwdSandbox, fileName), "x");
    const got = resolveProjectPath(fileName, "some-project");
    expect(got).toBe(path.join(cwdSandbox, fileName));
  });

  test("cwd-miss → workspace/projects/<id>/<p> fallback", () => {
    const projectId = "test-001";
    const projectDir = path.join(tmp.dir, "workspace", "projects", projectId);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, "scene-01-master.png"), "x");

    const got = resolveProjectPath("scene-01-master.png", projectId);
    expect(got).toBe(path.join(projectDir, "scene-01-master.png"));
  });

  test("cwd-miss → workspace/projects/<id>/artifacts/refs/<p> fallback (#105 canonical location)", () => {
    const projectId = "test-002a";
    const refsDir = path.join(tmp.dir, "workspace", "projects", projectId, "artifacts", "refs");
    fs.mkdirSync(refsDir, { recursive: true });
    fs.writeFileSync(path.join(refsDir, "scene-01-master.png"), "x");

    const got = resolveProjectPath("scene-01-master.png", projectId);
    expect(got).toBe(path.join(refsDir, "scene-01-master.png"));
  });

  // #105 legacy fallback (removed by #106)
  test("cwd-miss → legacy workspace/projects/<id>/refs/<p> fallback (pre-#105 projects)", () => {
    const projectId = "test-002";
    const refsDir = path.join(tmp.dir, "workspace", "projects", projectId, "refs");
    fs.mkdirSync(refsDir, { recursive: true });
    fs.writeFileSync(path.join(refsDir, "scene-01-master.png"), "x");

    const got = resolveProjectPath("scene-01-master.png", projectId);
    expect(got).toBe(path.join(refsDir, "scene-01-master.png"));
  });

  test("artifacts/refs/ wins over legacy refs/ when the file exists in both (#105)", () => {
    const projectId = "test-002b";
    const newDir = path.join(tmp.dir, "workspace", "projects", projectId, "artifacts", "refs");
    const legacyDir = path.join(tmp.dir, "workspace", "projects", projectId, "refs");
    fs.mkdirSync(newDir, { recursive: true });
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(newDir, "dup.png"), "new");
    fs.writeFileSync(path.join(legacyDir, "dup.png"), "old");

    const got = resolveProjectPath("dup.png", projectId);
    expect(got).toBe(path.join(newDir, "dup.png"));
  });

  test("everything misses → returns the cwd-anchored absolute (lets downstream ENOENT name what the user typed)", () => {
    const got = resolveProjectPath("nope.png", "missing");
    expect(got).toBe(path.join(cwdSandbox, "nope.png"));
  });

  test("absolute paths pass through unchanged (no fallback chain)", () => {
    const got = resolveProjectPath("/etc/hosts", "test-003");
    expect(got).toBe("/etc/hosts");
  });

  test("URL / data: URI pass-through still works through resolveProjectPath", () => {
    expect(resolveProjectPath("https://example.com/x.png", "p")).toBe(
      "https://example.com/x.png",
    );
    expect(resolveProjectPath("data:image/png;base64,XXX", "p")).toBe(
      "data:image/png;base64,XXX",
    );
  });
});

describe("readPromptOrFile — symmetric --prompt / --prompt-file", () => {
  let tmp: TmpRoot;

  beforeEach(() => {
    tmp = makeTmpRoot("prompt-or-file");
  });

  afterEach(() => {
    tmp.cleanup();
  });

  test("inline --prompt wins when both are passed", async () => {
    const tmpFile = path.join(tmp.dir, "p.txt");
    fs.writeFileSync(tmpFile, "from-file");
    const r = await readPromptOrFile({ prompt: "inline", promptFile: tmpFile });
    expect(r).toBe("inline");
  });

  test("--prompt-file is read when --prompt is omitted (covers `generate image` use)", async () => {
    const tmpFile = path.join(tmp.dir, "p.txt");
    fs.writeFileSync(tmpFile, "from-file-payload");
    const r = await readPromptOrFile({ promptFile: tmpFile });
    expect(r).toBe("from-file-payload");
  });

  test("--prompt-file works for `generate video` use (same helper)", async () => {
    const tmpFile = path.join(tmp.dir, "video-prompt.txt");
    fs.writeFileSync(tmpFile, "slow push-in on a moving subject");
    const r = await readPromptOrFile({ promptFile: tmpFile });
    expect(r).toBe("slow push-in on a moving subject");
  });

  test("--prompt-file works for `generate music` use (same helper)", async () => {
    const tmpFile = path.join(tmp.dir, "music-prompt.txt");
    fs.writeFileSync(tmpFile, "lo-fi hip hop, 80 bpm, dusty piano");
    const r = await readPromptOrFile({ promptFile: tmpFile });
    expect(r).toBe("lo-fi hip hop, 80 bpm, dusty piano");
  });

  test("neither passed → returns null (caller decides whether to raise)", async () => {
    const r = await readPromptOrFile({});
    expect(r).toBeNull();
  });

  test("--prompt-file resolves project-relative when --project is set", async () => {
    const projectId = "proj-101";
    const projectDir = path.join(tmp.dir, "workspace", "projects", projectId);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, "prompt.txt"), "proj-relative-body");

    const r = await readPromptOrFile({
      promptFile: "prompt.txt",
      projectId,
    });
    expect(r).toBe("proj-relative-body");
  });
});

describe("readRefsOrFile — symmetric --ref / --ref-file", () => {
  let tmp: TmpRoot;

  beforeEach(() => {
    tmp = makeTmpRoot("ref-or-file");
  });

  afterEach(() => {
    tmp.cleanup();
  });

  test("inline --ref + --ref-file concatenate (inline first, file after)", async () => {
    const refFile = path.join(tmp.dir, "refs.txt");
    fs.writeFileSync(refFile, "/abs/from-file-a.png\n/abs/from-file-b.png\n");
    const r = await readRefsOrFile({
      refs: ["/abs/inline.png"],
      refFile,
    });
    expect(r).toEqual([
      "/abs/inline.png",
      "/abs/from-file-a.png",
      "/abs/from-file-b.png",
    ]);
  });

  test("blank lines and `#` comments are ignored in --ref-file", async () => {
    const refFile = path.join(tmp.dir, "refs.txt");
    fs.writeFileSync(
      refFile,
      "# header comment\n/abs/a.png\n\n# mid comment\n/abs/b.png\n",
    );
    const r = await readRefsOrFile({ refFile });
    expect(r).toEqual(["/abs/a.png", "/abs/b.png"]);
  });

  test("neither passed → returns undefined", async () => {
    const r = await readRefsOrFile({});
    expect(r).toBeUndefined();
  });
});
