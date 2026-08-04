// Auto-version invariant (#004). AGENTS.md invariant #14 promises that
// Legacy filesystem producers archive old bytes unless `--force-overwrite`
// is passed. Domain generation preserves every output as an immutable
// Artifact revision instead of inventing filename suffixes.
//
//  1. Behavioral: `protectExistingAsset()` correctly archives sequential
//     writes across every file extension the generators emit
//     (image=png, video=mp4, voiceover=mp3, music=mp3, sfx=mp3, captions=json,
//     hyperframes index=html). Same helper, six kinds, six asserts.
//
//  2. Behavioral: regenerating a domain slot appends Artifact revisions and
//     retains distinct immutable Objects.
//
//  3. Force-overwrite escape hatch: passing `overwrite=true` skips archiving
//     and replaces the file in place — confirmed for every extension.
//
// Origin: 6 of 10 postmortems traced lost artifacts to silent overwrite
// (noski-people-001, kbo-broadcast-001, odindoma-fb-ad-001, venom-bodywash-001,
// playdate-pixel-001, ralphy-carousel-001). The fix landed piecemeal across
// issues #010 (captions), #028 (index.html), #039 (voiceover) — this test is
// the catch-all guardrail that closes #004.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promises as fsp } from "node:fs";

import { protectExistingAsset } from "../../cli/lib/providers/shared.js";
import { archiveExistingMaster } from "../../cli/commands/render.js";
import { setRoot } from "../../cli/lib/paths.js";
import { listArtifactRevisions, listArtifacts } from "../../cli/lib/store/artifacts.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { completeArtifactRun, startRun, startRunAttempt } from "../../cli/lib/store/runs.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";

// ─── 1. Behavioral: per-kind extension matrix ─────────────────────────────────

const KIND_EXT_MATRIX: Array<{ kind: string; ext: string; payloads: [string, string, string] }> = [
  { kind: "image", ext: ".png", payloads: ["PNG-v1-bytes", "PNG-v2-bytes", "PNG-v3-bytes"] },
  { kind: "video", ext: ".mp4", payloads: ["MP4-v1-bytes", "MP4-v2-bytes", "MP4-v3-bytes"] },
  { kind: "voiceover", ext: ".mp3", payloads: ["VO-v1-bytes", "VO-v2-bytes", "VO-v3-bytes"] },
  { kind: "music", ext: ".mp3", payloads: ["MUSIC-v1-bytes", "MUSIC-v2-bytes", "MUSIC-v3-bytes"] },
  { kind: "sfx", ext: ".mp3", payloads: ["SFX-v1-bytes", "SFX-v2-bytes", "SFX-v3-bytes"] },
  { kind: "captions", ext: ".json", payloads: ['{"v":1}', '{"v":2}', '{"v":3}'] },
];

describe("auto-version invariant (#004): protectExistingAsset semantics per kind", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-auto-version-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  for (const { kind, ext, payloads } of KIND_EXT_MATRIX) {
    test(`${kind} (${ext}): regen → v2 alongside v1, then v3 alongside v1+v2`, async () => {
      const slot = "scene-01";
      const dest = path.join(tmp, `${slot}${ext}`);

      // First write — clean slate.
      await fsp.writeFile(dest, payloads[0]);

      // Second write: pre-flight protect → archive existing to v2, then write fresh.
      const archived1 = await protectExistingAsset(dest, false);
      expect(archived1).toBe(path.join(tmp, `${slot}.v1${ext}`));
      await fsp.writeFile(dest, payloads[1]);

      // Assert: original payload survives at v1, new payload is current.
      expect(fs.existsSync(archived1!)).toBe(true);
      expect(fs.readFileSync(archived1!, "utf8")).toBe(payloads[0]);
      expect(fs.readFileSync(dest, "utf8")).toBe(payloads[1]);

      // Third write: same path → archive becomes v2, v1 still on disk.
      const archived2 = await protectExistingAsset(dest, false);
      expect(archived2).toBe(path.join(tmp, `${slot}.v2${ext}`));
      await fsp.writeFile(dest, payloads[2]);

      expect(fs.existsSync(path.join(tmp, `${slot}.v1${ext}`))).toBe(true);
      expect(fs.existsSync(path.join(tmp, `${slot}.v2${ext}`))).toBe(true);
      expect(fs.readFileSync(path.join(tmp, `${slot}.v1${ext}`), "utf8")).toBe(payloads[0]);
      expect(fs.readFileSync(path.join(tmp, `${slot}.v2${ext}`), "utf8")).toBe(payloads[1]);
      expect(fs.readFileSync(dest, "utf8")).toBe(payloads[2]);
    });
  }

  test("version numbering picks max+1 even with gaps; never reuses holes", async () => {
    const slot = "scene-42";
    const ext = ".png";
    const dest = path.join(tmp, `${slot}${ext}`);

    // Seed disk with a non-contiguous archive history (v1, v3 — v2 missing).
    fs.writeFileSync(dest, "current");
    fs.writeFileSync(path.join(tmp, `${slot}.v1${ext}`), "old-v1");
    fs.writeFileSync(path.join(tmp, `${slot}.v3${ext}`), "old-v3");

    const archived = await protectExistingAsset(dest, false);
    // Next slot is v4 (max=3 + 1), NOT v2 (gap).
    expect(archived).toBe(path.join(tmp, `${slot}.v4${ext}`));
    expect(fs.existsSync(path.join(tmp, `${slot}.v1${ext}`))).toBe(true);
    expect(fs.existsSync(path.join(tmp, `${slot}.v3${ext}`))).toBe(true);
    expect(fs.existsSync(path.join(tmp, `${slot}.v4${ext}`))).toBe(true);
  });
});

describe("auto-version invariant (#004): --force-overwrite escape hatch", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-auto-version-force-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  for (const { kind, ext, payloads } of KIND_EXT_MATRIX) {
    test(`${kind} (${ext}): overwrite=true bypasses archiving (no .v1 file written)`, async () => {
      const slot = "scene-01";
      const dest = path.join(tmp, `${slot}${ext}`);
      await fsp.writeFile(dest, payloads[0]);

      // overwrite=true → protectExistingAsset returns null and leaves dest untouched
      // for the caller to overwrite in place.
      const archived = await protectExistingAsset(dest, true);
      expect(archived).toBeNull();
      // Caller now overwrites in place (mirrors fs.writeFile(dest, …) downstream).
      await fsp.writeFile(dest, payloads[1]);

      // No v1/v2 archive should exist — destructive overwrite was explicit.
      expect(fs.existsSync(path.join(tmp, `${slot}.v1${ext}`))).toBe(false);
      expect(fs.existsSync(path.join(tmp, `${slot}.v2${ext}`))).toBe(false);
      expect(fs.readFileSync(dest, "utf8")).toBe(payloads[1]);
    });
  }
});

// ─── 1b. Render master: `ralphy render` archives final.mp4 too (#118) ─────────
//
// The HyperFrames master (`render/final.mp4`) was written by the hyperframes
// subprocess (or a forceOverwrite:true post-render stage) directly, bypassing
// the versioning wrapper that protected the social sibling. A re-render then
// SILENTLY OVERWROTE the prior master while still archiving final-social.mp4 —
// asymmetric, append-only violation (AGENTS.md #14). `render.ts` now archives
// the existing master up front via `archiveExistingMaster` (a thin wrapper over
// the same `protectExistingAsset` helper). This case asserts the file-move +
// naming + force-overwrite bypass on a `render/final.mp4` layout, so a future
// refactor that drops the call fails here, not in a postmortem. The real
// subprocess + ffmpeg run is exercised by the integration/dry-run render tests.

describe("auto-version invariant (#118): render master archive", () => {
  let tmp: string;
  let renderDir: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-render-master-"));
    renderDir = path.join(tmp, "render");
    fs.mkdirSync(renderDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("re-render archives final.mp4 → final.v1.mp4, then final.v2.mp4", async () => {
    const master = path.join(renderDir, "final.mp4");

    // First render — clean slate.
    fs.writeFileSync(master, "MASTER-v1-bytes");

    // Re-render: archive existing master, then a fresh master is written.
    const archived1 = await archiveExistingMaster(master, false);
    expect(archived1).toBe(path.join(renderDir, "final.v1.mp4"));
    fs.writeFileSync(master, "MASTER-v2-bytes");

    // Prior master survives at v1; the social sibling is unaffected.
    expect(fs.existsSync(archived1!)).toBe(true);
    expect(fs.readFileSync(archived1!, "utf8")).toBe("MASTER-v1-bytes");
    expect(fs.readFileSync(master, "utf8")).toBe("MASTER-v2-bytes");

    // Third render: archive becomes v2, v1 still on disk.
    const archived2 = await archiveExistingMaster(master, false);
    expect(archived2).toBe(path.join(renderDir, "final.v2.mp4"));
    fs.writeFileSync(master, "MASTER-v3-bytes");

    expect(fs.readFileSync(path.join(renderDir, "final.v1.mp4"), "utf8")).toBe("MASTER-v1-bytes");
    expect(fs.readFileSync(path.join(renderDir, "final.v2.mp4"), "utf8")).toBe("MASTER-v2-bytes");
    expect(fs.readFileSync(master, "utf8")).toBe("MASTER-v3-bytes");
  });

  test("--force-overwrite (forceOverwrite=true) skips the archive — no final.v1.mp4", async () => {
    const master = path.join(renderDir, "final.mp4");
    fs.writeFileSync(master, "MASTER-v1-bytes");

    const archived = await archiveExistingMaster(master, true);
    expect(archived).toBeNull();
    // Caller overwrites the master in place (mirrors the subprocess writing it).
    fs.writeFileSync(master, "MASTER-v2-bytes");

    expect(fs.existsSync(path.join(renderDir, "final.v1.mp4"))).toBe(false);
    expect(fs.readFileSync(master, "utf8")).toBe("MASTER-v2-bytes");
  });

  test("no-op when no master exists yet (first render)", async () => {
    const master = path.join(renderDir, "final.mp4");
    const archived = await archiveExistingMaster(master, false);
    expect(archived).toBeNull();
    expect(fs.existsSync(path.join(renderDir, "final.v1.mp4"))).toBe(false);
  });
});

describe("generation revision invariant (#004)", () => {
  const repoRoot = path.resolve(import.meta.dir, "..", "..");
  let fixtureRoot: string;

  beforeEach(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-artifact-revision-"));
    setRoot(fixtureRoot);
    fs.mkdirSync(path.join(fixtureRoot, ".ralphy"), { recursive: true });
    openDomainDb();
  });

  afterEach(() => {
    closeDomainDb();
    setRoot(repoRoot);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  test("regenerating one slot appends immutable Artifact revisions instead of filename archives", async () => {
    const workspace = createWorkspace({ slug: "default", name: "Default" });
    const project = createProject({ workspaceId: workspace.id, slug: "fixture", name: "Fixture" });

    for (const contents of ["first-image", "second-image"]) {
      const run = startRun({ projectId: project.id, kind: "generate.image", label: "hero" });
      const attempt = startRunAttempt({ runId: run.id, provider: "fixture", model: "fixture/image" });
      const outputPath = path.join(fixtureRoot, ".ralphy", "tmp", run.id, "hero.png");
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, contents);
      await completeArtifactRun({
        runId: run.id,
        attemptId: attempt.id,
        finishedPath: outputPath,
        originalName: "hero.png",
        mime: "image/png",
        artifact: { slug: "hero", kind: "image", state: "candidate" },
      });
    }

    const context = { workspaceId: workspace.id, projectId: project.id };
    const artifacts = listArtifacts({ context, limit: 10 }).items;
    expect(artifacts).toHaveLength(1);
    const revisions = listArtifactRevisions({
      context,
      artifactId: artifacts[0]!.id,
      limit: 10,
    }).items;
    expect(revisions.map((revision) => revision.revisionNo)).toEqual([1, 2]);
    expect(new Set(revisions.map((revision) => revision.objectId)).size).toBe(2);
    expect(fs.existsSync(path.join(fixtureRoot, "hero.v1.png"))).toBe(false);
  });
});
