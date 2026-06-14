// Auto-version invariant (#004). AGENTS.md invariant #14 promises that
// regenerating a slot writes `.<slot>.v2.<ext>` (then v3, v4…) and NEVER
// destroys the prior file unless `--force-overwrite` is passed. This test
// locks that contract on two layers:
//
//  1. Behavioral: `protectExistingAsset()` correctly archives sequential
//     writes across every file extension the generators emit
//     (image=png, video=mp4, voiceover=mp3, music=mp3, sfx=mp3, captions=json,
//     hyperframes index=html). Same helper, six kinds, six asserts.
//
//  2. Audit (static): every concrete generator entry-point in
//     `cli/lib/providers/{openrouter,elevenlabs}.ts` AND the captions writer in
//     `cli/commands/generate.ts` calls `protectExistingAsset(<dest>, …)`
//     *before* its `fs.writeFile(<dest>, …)`. Static source-level check so a
//     future refactor that loses the call fails this test, not a postmortem.
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

// ─── 2. Static audit: every generator function routes through the helper ────

/**
 * Brace-balanced extraction of an exported async function body. Returns the
 * substring between (and including) the `export async function <name>` header
 * and the matching closing brace. Used to scope the static audit to a single
 * generator at a time so unrelated writers (audio-isolation upload, ffmpeg
 * concat list-file, etc.) don't bleed in.
 */
function extractFunctionBody(source: string, fnName: string): string {
  const headerRx = new RegExp(`export\\s+async\\s+function\\s+${fnName}\\b`);
  const headerMatch = headerRx.exec(source);
  if (!headerMatch) throw new Error(`extractFunctionBody: ${fnName} not found`);
  const startIdx = headerMatch.index;
  // Find the first `{` after the header.
  const openIdx = source.indexOf("{", startIdx);
  if (openIdx === -1) throw new Error(`extractFunctionBody: no { for ${fnName}`);
  let depth = 1;
  let i = openIdx + 1;
  while (i < source.length && depth > 0) {
    const ch = source[i]!;
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  if (depth !== 0) throw new Error(`extractFunctionBody: unbalanced braces in ${fnName}`);
  return source.slice(startIdx, i);
}

/**
 * Within a single function body, assert that for every `fs.writeFile(<var>, …)`
 * targeting a slot-asset destination variable, there is a matching
 * `protectExistingAsset(<var>, …)` call somewhere in the same body (the
 * function-scope guarantee — the helper does not have to be on the line above,
 * just somewhere upstream in the same call frame, since retry loops legitimately
 * separate the two).
 *
 * Returns `{ writes, unprotected }` so the test can both assert at-least-one
 * write exists AND assert none are unprotected.
 */
function auditFunctionBody(
  body: string,
  destVarsRx: RegExp,
): { writes: string[]; unprotected: string[] } {
  const writes: string[] = [];
  const unprotected: string[] = [];
  const writeRx = new RegExp(
    `\\bfs\\.writeFile\\(\\s*(${destVarsRx.source})\\b`,
    "g",
  );
  let m: RegExpExecArray | null;
  while ((m = writeRx.exec(body)) !== null) {
    const destVar = m[1]!;
    writes.push(destVar);
    const escaped = destVar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const protectRx = new RegExp(`protectExistingAsset\\(\\s*${escaped}\\b`);
    if (!protectRx.test(body)) unprotected.push(destVar);
  }
  return { writes, unprotected };
}

describe("auto-version invariant (#004): static audit per generator function", () => {
  const REPO_ROOT = path.resolve(__dirname, "..", "..");
  const OPENROUTER = fs.readFileSync(
    path.join(REPO_ROOT, "cli/lib/providers/openrouter.ts"),
    "utf8",
  );
  const ELEVENLABS = fs.readFileSync(
    path.join(REPO_ROOT, "cli/lib/providers/elevenlabs.ts"),
    "utf8",
  );
  const GENERATE_CMD = fs.readFileSync(
    path.join(REPO_ROOT, "cli/commands/generate.ts"),
    "utf8",
  );

  test("generateImage: every fs.writeFile/writeImageFromUrlOrDataUri slot write routes through protectExistingAsset", () => {
    const body = extractFunctionBody(OPENROUTER, "generateImage");
    // Image writes go through the shared.ts helper, not fs.writeFile directly.
    // Audit both forms — the slot dest var is `imgDest` here.
    const writes: string[] = [];
    const unprotected: string[] = [];
    const writeRx = /(?:fs\.writeFile|writeImageFromUrlOrDataUri)\(\s*(?:[^,]+,\s*)?(imgDest|dest|localPath)\b/g;
    let m: RegExpExecArray | null;
    while ((m = writeRx.exec(body)) !== null) {
      const destVar = m[1]!;
      writes.push(destVar);
      const protectRx = new RegExp(`protectExistingAsset\\(\\s*${destVar}\\b`);
      if (!protectRx.test(body)) unprotected.push(destVar);
    }
    expect(writes.length).toBeGreaterThanOrEqual(1);
    expect(unprotected).toEqual([]);
  });

  test("generateVideo: every fs.writeFile of a slot var routes through protectExistingAsset", () => {
    const body = extractFunctionBody(OPENROUTER, "generateVideo");
    const { writes, unprotected } = auditFunctionBody(body, /imgDest|dest|localPath/);
    expect(writes.length).toBeGreaterThanOrEqual(1);
    expect(unprotected).toEqual([]);
  });

  test("generateVoiceover: every fs.writeFile of a slot var routes through protectExistingAsset", () => {
    const body = extractFunctionBody(ELEVENLABS, "generateVoiceover");
    const { writes, unprotected } = auditFunctionBody(body, /localPath|dest/);
    expect(writes.length).toBeGreaterThanOrEqual(1);
    expect(unprotected).toEqual([]);
  });

  test("generateMusic: every fs.writeFile of a slot var routes through protectExistingAsset", () => {
    const body = extractFunctionBody(ELEVENLABS, "generateMusic");
    const { writes, unprotected } = auditFunctionBody(body, /localPath|dest/);
    expect(writes.length).toBeGreaterThanOrEqual(1);
    expect(unprotected).toEqual([]);
  });

  test("generateSfx: every fs.writeFile of a slot var routes through protectExistingAsset", () => {
    const body = extractFunctionBody(ELEVENLABS, "generateSfx");
    const { writes, unprotected } = auditFunctionBody(body, /localPath|dest/);
    expect(writes.length).toBeGreaterThanOrEqual(1);
    expect(unprotected).toEqual([]);
  });

  test("captions writer in generate.ts: outPath/srtPath/drawtextPath share a protectExistingAsset(outPath)", () => {
    // Captions handler writes the slot JSON at outPath, plus sibling files
    // (srtPath, drawtextPath) derived from the same base. The protect-pass on
    // outPath versions the SLOT (the JSON); the sibling .srt / .drawtext.filter
    // are rebuilt from it. So we audit the JSON-write specifically.
    const handlerStart = GENERATE_CMD.indexOf('.command("captions")');
    expect(handlerStart).toBeGreaterThan(0);
    // Cap the slice at the next .command( so we don't pick up the next handler.
    const nextCmd = GENERATE_CMD.indexOf(".command(", handlerStart + 1);
    const handler = GENERATE_CMD.slice(handlerStart, nextCmd === -1 ? undefined : nextCmd);
    const { writes, unprotected } = auditFunctionBody(handler, /outPath/);
    expect(writes.length).toBeGreaterThanOrEqual(1);
    expect(unprotected).toEqual([]);
  });

  test("generate.ts captions handler uses --force-overwrite as the explicit bypass", () => {
    // Mirrors the image/video/voiceover/music/sfx command surface. Lint catches
    // an accidental rename of the flag (e.g. → --overwrite) so the AGENTS.md
    // invariant #14 wording stays accurate.
    expect(GENERATE_CMD).toMatch(/--force-overwrite/);
    // All 6 generate sub-commands wire the flag through to the connector.
    const occurrences = (GENERATE_CMD.match(/--force-overwrite/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(6);
  });
});
