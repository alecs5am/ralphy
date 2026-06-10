// Unit tests for the #105 per-project artifact layout helpers in
// cli/lib/paths.ts. The contract:
//
//   - WRITE targets always live under `artifacts/<kind>/` (artifactKindDir).
//   - READ resolution prefers `artifacts/<kind>/` and falls back to the legacy
//     `assets/<kind>/` (or sibling `refs/`) location until #106 migrates the
//     existing projects. The legacy branch is tagged
//     `#105 legacy fallback (removed by #106)` in source.
//   - Directory SCANS see BOTH trees (mid-migration projects hold files in
//     each), artifacts/ first.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ARTIFACT_KINDS,
  artifactKindDir,
  artifactsDir,
  legacyArtifactKindDir,
  legacyAssetsRootDir,
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

describe("#105 artifact layout — write-side helpers", () => {
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

  test("legacy mapping: refs is a project-root sibling, other kinds live under assets/", () => {
    const base = projectDir(PROJECT);
    expect(legacyAssetsRootDir(PROJECT)).toBe(path.join(base, "assets"));
    expect(legacyArtifactKindDir(PROJECT, "videos")).toBe(path.join(base, "assets", "videos"));
    expect(legacyArtifactKindDir(PROJECT, "refs")).toBe(path.join(base, "refs"));
  });

  test("global registry refsDir() is NOT per-project — new scheme: active workspace shared/refs (#108)", () => {
    // Empty tmp root → "ralphy" layout mode → registry entity refs live in
    // the active workspace's shared/ tree.
    expect(refsDir()).toBe(
      path.join(tmp, ".ralphy", "workspaces", "default", "shared", "refs"),
    );
  });

  test("global registry refsDir() — legacy roots keep workspace/.ralph/refs (#108 legacy fallback)", () => {
    fs.mkdirSync(path.join(tmp, "workspace", ".ralph"), { recursive: true });
    setRoot(tmp); // re-detect layout mode against the legacy fixture tree
    expect(refsDir()).toBe(path.join(tmp, "workspace", ".ralph", "refs"));
  });
});

describe("#105 artifact layout — read-side resolution (legacy fallback, removed by #106)", () => {
  test("resolveArtifactPath prefers artifacts/, falls back to legacy, defaults to artifacts/", () => {
    const newPath = path.join(artifactKindDir(PROJECT, "images"), "a.png");
    const legacyPath = path.join(legacyArtifactKindDir(PROJECT, "images"), "a.png");

    // Neither exists → write target (artifacts/).
    expect(resolveArtifactPath(PROJECT, "images", "a.png")).toBe(newPath);

    // Only legacy exists → legacy.
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, "old");
    expect(resolveArtifactPath(PROJECT, "images", "a.png")).toBe(legacyPath);

    // Both exist → artifacts/ wins.
    fs.mkdirSync(path.dirname(newPath), { recursive: true });
    fs.writeFileSync(newPath, "new");
    expect(resolveArtifactPath(PROJECT, "images", "a.png")).toBe(newPath);
  });

  test("resolveArtifactKindDir prefers artifacts/, then legacy, then artifacts/ as default", () => {
    const newDir = artifactKindDir(PROJECT, "music");
    const legacyDir = legacyArtifactKindDir(PROJECT, "music");

    expect(resolveArtifactKindDir(PROJECT, "music")).toBe(newDir);

    fs.mkdirSync(legacyDir, { recursive: true });
    expect(resolveArtifactKindDir(PROJECT, "music")).toBe(legacyDir);

    fs.mkdirSync(newDir, { recursive: true });
    expect(resolveArtifactKindDir(PROJECT, "music")).toBe(newDir);
  });

  test("resolveArtifactKindDirs returns every existing tree (artifacts/ first) for scans", () => {
    const newDir = artifactKindDir(PROJECT, "videos");
    const legacyDir = legacyArtifactKindDir(PROJECT, "videos");

    // Neither exists → the write target only.
    expect(resolveArtifactKindDirs(PROJECT, "videos")).toEqual([newDir]);

    fs.mkdirSync(legacyDir, { recursive: true });
    expect(resolveArtifactKindDirs(PROJECT, "videos")).toEqual([legacyDir]);

    fs.mkdirSync(newDir, { recursive: true });
    expect(resolveArtifactKindDirs(PROJECT, "videos")).toEqual([newDir, legacyDir]);
  });

  test("refs kind resolves against the legacy project-root refs/ sibling", () => {
    const legacyRefs = path.join(projectDir(PROJECT), "refs");
    fs.mkdirSync(legacyRefs, { recursive: true });
    fs.writeFileSync(path.join(legacyRefs, "hero.png"), "x");
    expect(resolveArtifactPath(PROJECT, "refs", "hero.png")).toBe(
      path.join(legacyRefs, "hero.png"),
    );
  });
});
