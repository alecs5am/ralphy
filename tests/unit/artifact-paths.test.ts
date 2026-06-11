// Unit tests for the #105 per-project artifact layout helpers in
// cli/lib/paths.ts. The contract (single-path since #106):
//
//   - ALL targets live under `artifacts/<kind>/` (artifactKindDir).
//   - resolveArtifactPath / resolveArtifactKindDir / resolveArtifactKindDirs
//     survive from the dual-scan era so call sites stay stable, but they
//     resolve artifacts/ ONLY — the legacy `assets/<kind>/` (+ sibling
//     `refs/`) tree was migrated by `ralphy migrate` and is never read.
//   - A legacy root fails fast with LegacyLayoutError (#106).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ARTIFACT_KINDS,
  artifactKindDir,
  artifactsDir,
  LegacyLayoutError,
  projectDir,
  projectRefsDir,
  refsDir,
  resolveArtifactKindDir,
  resolveArtifactKindDirs,
  resolveArtifactPath,
  setRoot,
  root,
} from "../../cli/lib/paths.js";

const PROJECT = "paths-105-test";

let tmp: string;
let prevRoot: string;

beforeEach(() => {
  prevRoot = root();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-artifact-paths-"));
  setRoot(tmp);
});

afterEach(() => {
  setRoot(prevRoot);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("#105 artifact layout — single-path helpers", () => {
  test("ARTIFACT_KINDS covers the 8 kinds incl. refs", () => {
    expect([...ARTIFACT_KINDS].sort()).toEqual(
      ["captions", "fonts", "images", "music", "refs", "sfx", "videos", "voiceover"].sort(),
    );
  });

  test("artifactsDir / artifactKindDir / projectRefsDir compose under the project dir", () => {
    const base = projectDir(PROJECT);
    expect(artifactsDir(PROJECT)).toBe(path.join(base, "artifacts"));
    expect(artifactKindDir(PROJECT, "images")).toBe(path.join(base, "artifacts", "images"));
    expect(projectRefsDir(PROJECT)).toBe(path.join(base, "artifacts", "refs"));
  });

  test("global registry refsDir() is NOT per-project — active workspace shared/refs (#108)", () => {
    expect(refsDir()).toBe(
      path.join(tmp, ".ralphy", "workspaces", "default", "shared", "refs"),
    );
  });
});

describe("#106 resolution is single-path (artifacts/ only, no legacy fallback)", () => {
  test("resolveArtifactPath always returns artifacts/<kind>/<file>, existing or not", () => {
    const newPath = path.join(artifactKindDir(PROJECT, "images"), "a.png");
    const legacyPath = path.join(projectDir(PROJECT), "assets", "images", "a.png");

    // Doesn't exist → still the artifacts/ path (it is the write target).
    expect(resolveArtifactPath(PROJECT, "images", "a.png")).toBe(newPath);

    // A stale legacy copy is invisible to resolution.
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, "old");
    expect(resolveArtifactPath(PROJECT, "images", "a.png")).toBe(newPath);

    fs.mkdirSync(path.dirname(newPath), { recursive: true });
    fs.writeFileSync(newPath, "new");
    expect(resolveArtifactPath(PROJECT, "images", "a.png")).toBe(newPath);
  });

  test("resolveArtifactKindDir always returns artifacts/<kind>", () => {
    const newDir = artifactKindDir(PROJECT, "music");
    const legacyDir = path.join(projectDir(PROJECT), "assets", "music");

    expect(resolveArtifactKindDir(PROJECT, "music")).toBe(newDir);
    fs.mkdirSync(legacyDir, { recursive: true });
    expect(resolveArtifactKindDir(PROJECT, "music")).toBe(newDir);
  });

  test("resolveArtifactKindDirs returns exactly [artifacts/<kind>] for scans", () => {
    const newDir = artifactKindDir(PROJECT, "videos");
    const legacyDir = path.join(projectDir(PROJECT), "assets", "videos");

    expect(resolveArtifactKindDirs(PROJECT, "videos")).toEqual([newDir]);
    fs.mkdirSync(legacyDir, { recursive: true });
    expect(resolveArtifactKindDirs(PROJECT, "videos")).toEqual([newDir]);
    fs.mkdirSync(newDir, { recursive: true });
    expect(resolveArtifactKindDirs(PROJECT, "videos")).toEqual([newDir]);
  });

  test("refs kind resolves ONLY against artifacts/refs/ — never the project-root refs/ sibling", () => {
    const legacyRefs = path.join(projectDir(PROJECT), "refs");
    fs.mkdirSync(legacyRefs, { recursive: true });
    fs.writeFileSync(path.join(legacyRefs, "hero.png"), "x");
    expect(resolveArtifactPath(PROJECT, "refs", "hero.png")).toBe(
      path.join(projectRefsDir(PROJECT), "hero.png"),
    );
  });
});

describe("#106 legacy root fail-fast", () => {
  test("a workspace/-only root throws LegacyLayoutError from every artifact helper", () => {
    const legacyTmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-artifact-legacy-"));
    try {
      fs.mkdirSync(path.join(legacyTmp, "workspace", ".ralph"), { recursive: true });
      setRoot(legacyTmp);
      expect(() => refsDir()).toThrow(LegacyLayoutError);
      expect(() => projectDir(PROJECT)).toThrow(LegacyLayoutError);
      expect(() => artifactsDir(PROJECT)).toThrow(LegacyLayoutError);
      expect(() => resolveArtifactPath(PROJECT, "images", "a.png")).toThrow(LegacyLayoutError);
    } finally {
      setRoot(prevRoot);
      fs.rmSync(legacyTmp, { recursive: true, force: true });
    }
  });
});
