// Style / benchmark grounding tests — STYLE_LOCK.md artifact (#408).
//
// Covers:
//   (a) auto-discovery — discoverStyleLock walks up from a render/ video path to
//       the project root and finds STYLE_LOCK.md; returns null without it.
//   (b) refusal — `project style-lock <id> --check --mode <covered>` on a project
//       WITHOUT the lock exits non-zero / refuse:true; with the lock → ok.
//   (c) requiresStyleLock matches the #412 `guidelineOrStyleLock.required` flags.
//   (d) the verb writes STYLE_LOCK.md (--no-llm) + auto-versions on re-run.
//
// No live LLM / network — every CLI smoke uses --no-llm. No mock.module on a
// shared lib (#072). English-only-on-disk: all fixture slugs / briefs are plain
// English.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import {
  styleLockPath,
  hasStyleLock,
  requiresStyleLock,
  discoverStyleLock,
  deterministicStyleLock,
  mergeStyleLockContent,
  renderStyleLockScaffold,
} from "../../cli/lib/style-lock";
import { CONTENT_MODES, CONTENT_MODES_LIST } from "../../cli/lib/content-modes";
import { projectDir } from "../../cli/lib/paths";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const PROJECT = "style-lock-fixture-408";

let tmp: TmpRoot;

function writeArtifact(rel: string, contents = "x") {
  const abs = path.join(projectDir(PROJECT), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
}

function seedRegistry() {
  const regPath = path.join(tmp.dir, ".ralphy", "registry.json");
  fs.mkdirSync(path.dirname(regPath), { recursive: true });
  fs.writeFileSync(
    regPath,
    JSON.stringify({ projects: { [PROJECT]: { id: PROJECT, name: "Style Lock Fixture", workspace: "default" } } }),
  );
  fs.mkdirSync(projectDir(PROJECT), { recursive: true });
}

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-style-lock-408");
});

afterEach(() => {
  tmp.cleanup();
});

// ─── (c) requiresStyleLock wiring to #412 ─────────────────────────────────────

describe("requiresStyleLock — composed with #412 guidelineOrStyleLock.required", () => {
  test("matches the registry `required` flag for every mode (no hardcoded list)", () => {
    for (const mode of CONTENT_MODES_LIST) {
      expect(requiresStyleLock(mode)).toBe(CONTENT_MODES[mode].guidelineOrStyleLock.required);
    }
  });

  test("covered modes from the #408 scope report required:true", () => {
    // ad-creative-pack, social-carousel, tv-ad (multi-scene video),
    // cartoon-animation, and restyle/remix (flipped in #408).
    for (const mode of ["ad-creative-pack", "social-carousel", "tv-ad", "cartoon-animation", "restyle"]) {
      expect(requiresStyleLock(mode)).toBe(true);
    }
  });

  test("unknown / null mode is never covered (does not block generation)", () => {
    expect(requiresStyleLock(null)).toBe(false);
    expect(requiresStyleLock(undefined)).toBe(false);
    expect(requiresStyleLock("not-a-real-mode")).toBe(false);
    expect(requiresStyleLock("")).toBe(false);
  });
});

// ─── (a) eval auto-discovery ──────────────────────────────────────────────────

describe("discoverStyleLock — walk-up from a video path", () => {
  test("finds STYLE_LOCK.md from a render/ video path when the project carries it", () => {
    seedRegistry();
    // A project root that looks like one (has production-plan.json marker) + a lock.
    writeArtifact("production-plan.json", "{}");
    writeArtifact("STYLE_LOCK.md", "# Style Lock\n");
    const videoPath = path.join(projectDir(PROJECT), "render", "final.mp4");
    fs.mkdirSync(path.dirname(videoPath), { recursive: true });
    fs.writeFileSync(videoPath, "fakevideo");

    const found = discoverStyleLock(videoPath);
    expect(found).not.toBeNull();
    expect(found).toBe(styleLockPath(PROJECT));
  });

  test("returns null when the project has no STYLE_LOCK.md", () => {
    seedRegistry();
    writeArtifact("production-plan.json", "{}");
    const videoPath = path.join(projectDir(PROJECT), "render", "final.mp4");
    fs.mkdirSync(path.dirname(videoPath), { recursive: true });
    fs.writeFileSync(videoPath, "fakevideo");

    expect(discoverStyleLock(videoPath)).toBeNull();
  });

  test("accepts a project DIRECTORY path too (not just a file)", () => {
    seedRegistry();
    writeArtifact("BRIEF.md", "# brief\n");
    writeArtifact("STYLE_LOCK.md", "# Style Lock\n");
    expect(discoverStyleLock(projectDir(PROJECT))).toBe(styleLockPath(PROJECT));
  });

  test("does NOT match a STYLE_LOCK.md in a dir that is not a project root", () => {
    // A bare temp dir (no project markers) with a STYLE_LOCK.md should not match —
    // the walk-up only returns a lock that sits in a project-shaped directory.
    const lone = path.join(tmp.dir, "lonely");
    fs.mkdirSync(lone, { recursive: true });
    fs.writeFileSync(path.join(lone, "STYLE_LOCK.md"), "# orphan\n");
    const video = path.join(lone, "clip.mp4");
    fs.writeFileSync(video, "x");
    expect(discoverStyleLock(video)).toBeNull();
  });

  test("non-existent path is safe (returns null)", () => {
    expect(discoverStyleLock(path.join(tmp.dir, "nope", "missing.mp4"))).toBeNull();
  });
});

// ─── deterministic scaffold + merge (pure) ────────────────────────────────────

describe("deterministicStyleLock + mergeStyleLockContent + renderStyleLockScaffold", () => {
  test("deterministic scaffold seeds register/vibe/aspect from context", () => {
    const c = deterministicStyleLock({
      projectId: PROJECT,
      register: "PS1 horror",
      vibe: "dread, crude polygons",
      aspect: "9:16",
      templateSlug: "choose-path-001",
      guidelineSlugs: ["broadcast-realism-aspect"],
    });
    expect(c.visualRegister).toContain("PS1 horror");
    expect(c.visualRegister).toContain("choose-path-001");
    expect(c.benchmarkRefs).toContain("broadcast-realism-aspect");
    // Unfilled fields carry an explicit TODO, never silent fabrication.
    expect(c.doNotDo).toContain("TODO");
  });

  test("merge: non-empty LLM fields win, blanks keep the fallback", () => {
    const fallback = deterministicStyleLock({ projectId: PROJECT });
    const merged = mergeStyleLockContent(fallback, {
      doNotDo: "No neon. No beauty-filter skin. No static holds.",
      pacing: "",
    });
    expect(merged.doNotDo).toBe("No neon. No beauty-filter skin. No static holds.");
    // Empty enrichment value falls back to the deterministic one.
    expect(merged.pacing).toBe(fallback.pacing);
    expect(merged.visualRegister).toBe(fallback.visualRegister);
  });

  test("render: covered mode states the lock is REQUIRED + cites the contract", () => {
    const body = renderStyleLockScaffold(
      { projectId: PROJECT, contentMode: "tv-ad", required: true, brief: "a broadcast spot" },
      deterministicStyleLock({ projectId: PROJECT }),
    );
    expect(body).toContain("Style Lock — " + PROJECT);
    expect(body).toContain("phase-6");
    expect(body).toContain("style lock REQUIRED for this mode");
    expect(body).toContain("a broadcast spot");
  });

  test("render: routes URL benchmarks through researcher / site-grounding", () => {
    const ctx = { projectId: PROJECT, benchmarkSource: "https://example.com/brand" };
    const c = deterministicStyleLock(ctx);
    expect(c.benchmarkRefs).toContain("researcher");
    const body = renderStyleLockScaffold(ctx, c);
    expect(body).toContain("site-grounding");
  });
});

// ─── (d) the verb writes + auto-versions (CLI smoke, --no-llm) ────────────────

describe("ralphy project style-lock <id> --no-llm (CLI smoke)", () => {
  function seedPlan(mode: string) {
    seedRegistry();
    writeArtifact(
      "production-plan.json",
      JSON.stringify({
        version: 1,
        projectId: PROJECT,
        brief: "a 5-slide carousel about cold plunge recovery",
        contentMode: { mode, confidence: 0.5, ambiguous: false, alternatives: [] },
        formatTemplate: { format: "carousel", templateSlug: "carousel-general", confidence: 0.4, source: "keyword" },
        register: "clean DTC wellness",
        vibe: "calm, evidence-led",
        aspect: "4:5",
        platform: "instagram",
        benchmarkSource: null,
      }),
    );
  }

  function run(args: string[]) {
    return spawnSync("bun", ["run", CLI, "--cwd", tmp.dir, "--json", "project", "style-lock", ...args], {
      cwd: tmp.dir,
      encoding: "utf8",
      env: { ...process.env },
    });
  }

  test("writes STYLE_LOCK.md seeded from the plan, no LLM", () => {
    seedPlan("social-carousel");
    const r = run([PROJECT, "--no-llm"]);
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.project).toBe(PROJECT);
    expect(json.mode).toBe("social-carousel");
    expect(json.required).toBe(true);
    expect(json.llmEnriched).toBe(false);
    expect(hasStyleLock(PROJECT)).toBe(true);
    const body = fs.readFileSync(styleLockPath(PROJECT), "utf8");
    expect(body).toContain("clean DTC wellness");
    expect(body).toContain("carousel-general");
  });

  test("re-run auto-versions (preserves the first as .v1) and never overwrites", () => {
    seedPlan("social-carousel");
    run([PROJECT, "--no-llm"]);
    const first = fs.readFileSync(styleLockPath(PROJECT), "utf8");
    const r2 = run([PROJECT, "--no-llm"]);
    expect(r2.status).toBe(0);
    const json2 = JSON.parse(r2.stdout);
    expect(json2.archived).toContain("STYLE_LOCK.v1.md");
    // The .v1 archive holds the ORIGINAL content unchanged (append-only #14).
    const v1 = fs.readFileSync(path.join(projectDir(PROJECT), "STYLE_LOCK.v1.md"), "utf8");
    expect(v1).toBe(first);
    expect(fs.existsSync(styleLockPath(PROJECT))).toBe(true);
  });
});

// ─── (b) the --check refusal contract (CLI smoke) ─────────────────────────────

describe("ralphy project style-lock <id> --check (refusal gate)", () => {
  function run(args: string[]) {
    return spawnSync("bun", ["run", CLI, "--cwd", tmp.dir, "--json", "project", "style-lock", ...args], {
      cwd: tmp.dir,
      encoding: "utf8",
      env: { ...process.env },
    });
  }

  test("covered mode, NO lock → refuse:true, exit non-zero", () => {
    seedRegistry();
    const r = run([PROJECT, "--check", "--mode", "tv-ad"]);
    expect(r.status).not.toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.required).toBe(true);
    expect(json.hasLock).toBe(false);
    expect(json.ok).toBe(false);
    expect(json.refuse).toBe(true);
    expect(json.reason).toContain("requires a locked STYLE_LOCK.md");
    // The gate writes nothing.
    expect(hasStyleLock(PROJECT)).toBe(false);
  });

  test("covered mode, WITH lock → ok:true, exit 0", () => {
    seedRegistry();
    writeArtifact("STYLE_LOCK.md", "# Style Lock\n");
    const r = run([PROJECT, "--check", "--mode", "tv-ad"]);
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.required).toBe(true);
    expect(json.hasLock).toBe(true);
    expect(json.ok).toBe(true);
    expect(json.refuse).toBe(false);
  });

  test("non-covered mode, NO lock → ok:true, exit 0 (never blocks)", () => {
    seedRegistry();
    const r = run([PROJECT, "--check", "--mode", "personal-clipper"]);
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.required).toBe(false);
    expect(json.refuse).toBe(false);
  });

  test("--check reads the content mode from production-plan.json when --mode omitted", () => {
    seedRegistry();
    writeArtifact(
      "production-plan.json",
      JSON.stringify({ contentMode: { mode: "ad-creative-pack" } }),
    );
    const r = run([PROJECT, "--check"]);
    expect(r.status).not.toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.mode).toBe("ad-creative-pack");
    expect(json.required).toBe(true);
    expect(json.refuse).toBe(true);
  });
});
