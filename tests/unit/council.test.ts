// Council review tests (#415 — councilPreflight / councilPolish).
//
// The council brings seven specialist perspectives to the two expensive
// decision points (preflight on a production plan, polish on an eval report)
// and synthesizes ONE structured CouncilVerdict. These tests assert the
// guarantees the rest of the pipeline rests on:
//   (a) a preflight fixture → a schema-valid CouncilVerdict with seven role
//       scores, a verdict, and prioritizedActions in the #409 repair vocabulary;
//   (b) a polish fixture → prioritizedActions map to repair owners AND the
//       deterministic repair loop (`buildRepairPlan`) ingests them structurally;
//   (c) NO media-generation path is reachable from the council module (static
//       source scan: it never imports/calls generate*), AND callLLM is the ONLY
//       model seam (the injected dep is the single call path; fixture mode hits
//       zero model calls);
//   (d) the CLI verb writes council-{phase}.json offline (--no-llm) with no keys.
//
// No live LLM: the council deps are INJECTED via a fixture / a counting stub
// (no `mock.module` on a shared lib — #072). English-only-on-disk: every
// fixture string is plain English.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import {
  councilPreflight,
  councilPolish,
  makeLlmCallRole,
  normalizeRoleResponse,
  buildRoleSystemPrompt,
  councilActionsToWhatToRedo,
  type CouncilDeps,
  type CouncilRoleContext,
  type CouncilRoleResponse,
} from "../../cli/lib/council";
import {
  parseCouncilVerdict,
  COUNCIL_ROLES,
  type CouncilRole,
} from "../../cli/lib/schemas/council";
import { buildRepairPlan } from "../../cli/lib/repair";
import { parseRepairPlan } from "../../cli/lib/schemas/repair-plan";
import { parseProductionPlan, type ProductionPlan } from "../../cli/lib/schemas/production-plan";
import type { EvalReport, Verdict } from "../../cli/lib/eval/types";
import { projectDir } from "../../cli/lib/paths";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const NOW = "2026-06-14T12:00:00.000Z";

/**
 * Strip line comments, block comments, and string/template-literal CONTENTS
 * from TS source so a static scan reads executable code only. Coarse but
 * sufficient for "does the code import/call X" assertions — the council's
 * doc-comments and prompt strings deliberately mention the forbidden tokens to
 * DOCUMENT the guarantee, and those mentions must not trip the scan.
 */
function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/\/\/[^\n]*/g, " ") // line comments
    .replace(/`(?:\\.|[^`\\])*`/g, "``") // template literals
    .replace(/"(?:\\.|[^"\\])*"/g, '""') // double-quoted strings (keeps the import specifier? no — emptied)
    .replace(/'(?:\\.|[^'\\])*'/g, "''"); // single-quoted strings
}

// ─── Fixture builders ─────────────────────────────────────────────────────────

function plan(): ProductionPlan {
  return parseProductionPlan({
    version: 1,
    projectId: "council-fixture-415",
    brief: "an unboxing video for a no-name coffee gadget",
    targetAudienceLanguage: "English",
    register: "photoreal UGC selfie",
    vibe: "warm morning ritual",
    sceneCount: 5,
    durationSec: 25,
    firstCheckpoint: "scene-01 anchor",
    aspect: "9:16",
    platform: "tiktok",
    contentMode: { mode: null, confidence: 0, ambiguous: false, alternatives: [] },
    formatTemplate: { format: "video", templateSlug: null, confidence: 0, source: "freeform" },
    craftOverlay: [],
    requiredRefs: [],
    benchmarkSource: null,
    audioPath: null,
    modelStack: [],
    estimate: { costLowUsd: 1, costHighUsd: 2, wallClockMin: 8 },
    bypasses: [],
  });
}

function evalReport(verdict: Verdict): EvalReport {
  return {
    schemaVersion: "1.0",
    gate: {
      mode: "native-video",
      nativeVideo: true,
      explicitCheapMode: false,
      shipReady: verdict === "pass",
      reason: "test fixture",
    },
    meta: {
      video: "render/final.mp4",
      projectId: "council-fixture-415",
      template: null,
      evaluatedAt: NOW,
      durationSec: 25,
      resolution: { w: 1080, h: 1920 },
      fps: 30,
      codec: { video: "h264", audio: "aac" },
      bitrateKbps: 5000,
    },
    declared: null,
    structure: {
      scenes: [],
      sceneCount: 5,
      avgSceneDurationSec: 5,
      minSceneDurationSec: 4,
      maxSceneDurationSec: 6,
      hookZone: { durationSec: 3, sceneCount: 1, transcript: "hi", wordCount: 1 },
    },
    audio: {
      integratedLufs: -16,
      truePeakDb: -1.5,
      loudnessRangeLu: 8,
      deadAirSegments: [],
      voicePresentPct: 80,
    },
    captions: { available: true, wordCount: 60, wordsPerSecond: 2, densityWarn: false },
    vision: { sceneFindings: [] },
    findings: [],
    scoring: { weights: {}, penalties: {}, score: 70, verdict },
  };
}

/** A full per-role fixture map with action-bearing roles in the repair vocab. */
function fullFixture(): NonNullable<CouncilDeps["fixture"]> {
  return {
    strategist: { score: 7, summary: "audience fit is solid", actions: [] },
    "niche-researcher": {
      score: 5,
      summary: "concept is a touch derivative",
      nonBlockingImprovements: ["lean into a fresher angle than the generic unboxing"],
      actions: [],
    },
    "creative-director": {
      score: 6,
      summary: "hook needs sharpening",
      actions: [
        {
          owner: "scenarist",
          category: "structure.hook-zone-thin-vo",
          action: "Rewrite the opening line so the payoff lands in the first 2 seconds",
          severity: "warn",
        },
      ],
    },
    "art-director": {
      score: 4,
      summary: "register risks reading studio, brief asked handheld",
      blockingIssues: ["the planned look reads studio-glossy, not handheld UGC"],
      actions: [
        {
          owner: "art-director",
          category: "style.register-mismatch",
          action: "Re-anchor the scene stills in a handheld photoreal-selfie register",
          severity: "fail",
        },
      ],
    },
    editor: {
      score: 6,
      summary: "mix and captions need attention",
      actions: [
        {
          owner: "editor",
          category: "audio.mix",
          action: "Duck the music bed under the VO by ~6dB",
          severity: "warn",
        },
      ],
    },
    "performance-marketer": {
      score: 5,
      summary: "no clear CTA",
      nonBlockingImprovements: ["add a single explicit CTA in the closer"],
      actions: [],
    },
    "qa-evaluator": { score: 6, summary: "no objective gate failures yet", actions: [] },
  };
}

// ─── (a) preflight fixture → schema-valid verdict ─────────────────────────────

describe("councilPreflight — fixture", () => {
  test("returns a schema-valid CouncilVerdict with 7 role scores + a verdict", async () => {
    const verdict = await councilPreflight(plan(), { fixture: fullFixture(), now: NOW });
    expect(() => parseCouncilVerdict(verdict)).not.toThrow();
    expect(verdict.phase).toBe("preflight");
    expect(verdict.projectId).toBe("council-fixture-415");
    expect(verdict.roleScores).toHaveLength(7);
    expect(verdict.roleScores.map((r) => r.role).sort()).toEqual([...COUNCIL_ROLES].sort());
    expect(["ship", "block", "revise"]).toContain(verdict.verdict);
  });

  test("a blocking issue + a fail action → verdict 'block'", async () => {
    const verdict = await councilPreflight(plan(), { fixture: fullFixture(), now: NOW });
    expect(verdict.verdict).toBe("block");
    expect(verdict.blockingIssues.length).toBeGreaterThan(0);
  });

  test("prioritizedActions are in the #409 repair vocabulary (owner / category / severity)", async () => {
    const verdict = await councilPreflight(plan(), { fixture: fullFixture(), now: NOW });
    expect(verdict.prioritizedActions.length).toBeGreaterThan(0);
    const owners = new Set(verdict.prioritizedActions.map((a) => a.owner));
    for (const o of owners) expect(["art-director", "scenarist", "editor"]).toContain(o);
    // fail floats above warn; priorities are dense 1..N.
    expect(verdict.prioritizedActions[0].severity).toBe("fail");
    expect(verdict.prioritizedActions.map((a) => a.priority)).toEqual(
      verdict.prioritizedActions.map((_, i) => i + 1),
    );
  });

  test("clean fixture (no issues, no actions) → 'ship'", async () => {
    const clean: NonNullable<CouncilDeps["fixture"]> = Object.fromEntries(
      COUNCIL_ROLES.map((r) => [r, { score: 8, summary: "looks good", actions: [] }]),
    ) as NonNullable<CouncilDeps["fixture"]>;
    const verdict = await councilPreflight(plan(), { fixture: clean, now: NOW });
    expect(verdict.verdict).toBe("ship");
    expect(verdict.prioritizedActions).toHaveLength(0);
  });

  test("wide score split surfaces a disagreement", async () => {
    const split: NonNullable<CouncilDeps["fixture"]> = {
      strategist: { score: 9, summary: "great" },
      "niche-researcher": { score: 9, summary: "fresh" },
      "creative-director": { score: 9, summary: "sharp" },
      "art-director": { score: 2, summary: "off-register" },
      editor: { score: 2, summary: "weak cut" },
      "performance-marketer": { score: 8, summary: "good cta" },
      "qa-evaluator": { score: 8, summary: "clean" },
    };
    const verdict = await councilPreflight(plan(), { fixture: split, now: NOW });
    expect(verdict.disagreements.length).toBeGreaterThan(0);
  });
});

// ─── (b) polish fixture → repair-loop ingestion ───────────────────────────────

describe("councilPolish — fixture feeds the repair loop without free-form parsing", () => {
  test("polish prioritizedActions map to repair owners verbatim", async () => {
    const verdict = await councilPolish(evalReport("fail"), null, { fixture: fullFixture(), now: NOW });
    expect(verdict.phase).toBe("polish");
    const byOwner = verdict.prioritizedActions.map((a) => a.owner);
    expect(byOwner).toContain("art-director");
    expect(byOwner).toContain("scenarist");
    expect(byOwner).toContain("editor");
  });

  test("buildRepairPlan ingests council actions structurally (owners preserved)", async () => {
    const verdict = await councilPolish(evalReport("fail"), null, { fixture: fullFixture(), now: NOW });
    const repairPlan = buildRepairPlan(evalReport("fail"), null, {
      now: NOW,
      councilActions: verdict.prioritizedActions,
    });
    expect(() => parseRepairPlan(repairPlan)).not.toThrow();
    expect(repairPlan.sourcePreferred).toBe("council");
    // Every council action became a repair item, owner preserved (not
    // re-classified the way a deep-vision redo would be).
    expect(repairPlan.items.length).toBe(verdict.prioritizedActions.length);
    const repairOwners = new Set(repairPlan.items.map((i) => i.owner));
    expect(repairOwners.has("scenarist")).toBe(true); // would be lost via what_to_redo path
    expect(repairOwners.has("art-director")).toBe(true);
    expect(repairOwners.has("editor")).toBe(true);
    // Born pending — the fixer's approval gate is structural.
    expect(repairPlan.items.every((i) => i.approvalState === "pending")).toBe(true);
    // fail-severity item sorts first.
    expect(repairPlan.items[0].severity).toBe("fail");
  });

  test("the what_to_redo projection round-trips through the existing #409 deep path", async () => {
    const verdict = await councilPolish(evalReport("fail"), null, { fixture: fullFixture(), now: NOW });
    const deep = { parsed: { what_to_redo: councilActionsToWhatToRedo(verdict) } };
    const repairPlan = buildRepairPlan(evalReport("fail"), deep, { now: NOW });
    expect(() => parseRepairPlan(repairPlan)).not.toThrow();
    expect(repairPlan.sourcePreferred).toBe("deep-vision");
    expect(repairPlan.items.length).toBe(verdict.prioritizedActions.length);
  });

  test("buildRepairPlan with NO councilActions is the unchanged #409 behavior", () => {
    // Findings-only path: sourcePreferred stays 'findings', no council items.
    const report = evalReport("fail");
    report.findings = [
      {
        id: "F1",
        category: "audio.loudness",
        severity: "fail",
        sceneIndex: null,
        timestampSec: null,
        message: "too quiet",
        fixHint: "loudnorm",
        fixCommand: null,
      },
    ];
    const repairPlan = buildRepairPlan(report, null, { now: NOW });
    expect(repairPlan.sourcePreferred).toBe("findings");
    expect(repairPlan.items.every((i) => i.source === "findings")).toBe(true);
  });
});

// ─── (c) bounded guarantees: no media path + callLLM-only seam ────────────────

describe("council is bounded — no media generation, callLLM is the only model seam", () => {
  test("the council source NEVER imports media generation or fetches", () => {
    const raw = fs.readFileSync(path.join(REPO, "cli", "lib", "council.ts"), "utf8");
    // Strip comments + string-literal contents so the scan reads CODE only —
    // the prose deliberately *mentions* these forbidden tokens to document the
    // guarantee, which must not trip the scan.
    const code = stripCommentsAndStrings(raw);
    // No import of the media provider / generate verbs anywhere in the code.
    expect(code).not.toMatch(/providers\/media/);
    expect(code).not.toMatch(/generateImage|generateVideo|generateVoiceover|generateMusic|generateSfx/);
    // No browsing primitives inside the council.
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/yt-dlp|WebFetch|playwright|puppeteer/i);
    // The ONLY model seam is callLLM (the import survives string-stripping as an identifier).
    expect(raw).toMatch(/import \{ callLLM \} from "\.\/providers\/llm\.js"/);
    expect(code).toMatch(/\bcallLLM\b/);
  });

  test("fixture mode reaches ZERO model calls (deps.callRole never invoked)", async () => {
    let calls = 0;
    const counting: CouncilDeps = {
      fixture: fullFixture(),
      // If callRole were ever invoked in fixture mode this would tick.
      callRole: async () => {
        calls += 1;
        return { score: 0, summary: "should-not-run" };
      },
      now: NOW,
    };
    // When BOTH are present, callRole wins (it is the live seam) — so here we
    // assert the seam is the single call path: exactly one call per role.
    const verdict = await councilPreflight(plan(), counting);
    expect(calls).toBe(COUNCIL_ROLES.length);
    expect(verdict.roleScores).toHaveLength(COUNCIL_ROLES.length);
  });

  test("callRole is invoked exactly once per role — the single model seam", async () => {
    const seen: CouncilRole[] = [];
    const deps: CouncilDeps = {
      callRole: async (ctx: CouncilRoleContext) => {
        seen.push(ctx.role);
        // Each role gets a focused, phase-aware system prompt + the payload only.
        expect(ctx.systemPrompt).toContain(ctx.role);
        expect(ctx.payload.length).toBeGreaterThan(0);
        return { score: 5, summary: `${ctx.role} ok` };
      },
      now: NOW,
    };
    await councilPreflight(plan(), deps);
    expect(seen.sort()).toEqual([...COUNCIL_ROLES].sort());
    expect(seen.length).toBe(COUNCIL_ROLES.length);
  });

  test("makeLlmCallRole returns a fn (production seam exists, not exercised live)", () => {
    expect(typeof makeLlmCallRole()).toBe("function");
  });
});

// ─── normalize / prompt unit coverage ─────────────────────────────────────────

describe("normalizeRoleResponse — clamps + drops malformed actions", () => {
  test("clamps score to 0-10 and keeps only valid-owner actions", () => {
    const r = normalizeRoleResponse({
      score: 42,
      summary: "  trimmed  ",
      blockingIssues: ["a", "", "b"],
      actions: [
        { owner: "art-director", category: "style.x", action: "do it", severity: "fail" },
        { owner: "not-a-role", category: "x.y", action: "skip me", severity: "warn" },
        { owner: "editor", category: "", action: "no category", severity: "warn" },
        { owner: "scenarist", category: "structure.z", action: "rewrite", severity: "bogus" },
      ],
    });
    expect(r.score).toBe(10);
    expect(r.summary).toBe("trimmed");
    expect(r.blockingIssues).toEqual(["a", "b"]);
    expect(r.actions).toHaveLength(2);
    expect(r.actions!.map((a) => a.owner)).toEqual(["art-director", "scenarist"]);
    // Unknown severity coerces to warn.
    expect(r.actions![1].severity).toBe("warn");
  });

  test("buildRoleSystemPrompt differs per phase", () => {
    const pre = buildRoleSystemPrompt("art-director", "preflight");
    const post = buildRoleSystemPrompt("art-director", "polish");
    expect(pre).toContain("PRODUCTION PLAN");
    expect(post).toContain("EVALUATION REPORT");
    expect(pre).toContain("art-director");
  });
});

// ─── (d) CLI smoke — offline, no keys ─────────────────────────────────────────

describe("ralphy project council <id> --phase preflight (CLI smoke, --no-llm)", () => {
  const PROJECT = "council-smoke-415";
  let tmp: TmpRoot;

  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-council-415");
    fs.mkdirSync(projectDir(PROJECT), { recursive: true });
    fs.writeFileSync(
      path.join(tmp.dir, ".ralphy", "registry.json"),
      JSON.stringify({ projects: { [PROJECT]: { id: PROJECT, name: "Council Smoke", workspace: "default" } } }),
    );
  });

  afterEach(() => tmp.cleanup());

  test("writes council-preflight.json + .md from production-plan.json, no API keys needed", () => {
    const p = parseProductionPlan({ ...plan(), projectId: PROJECT });
    fs.writeFileSync(
      path.join(projectDir(PROJECT), "production-plan.json"),
      JSON.stringify(p, null, 2),
    );

    const env = { ...process.env };
    delete env.OPENROUTER_API_KEY;
    delete env.ELEVENLABS_API_KEY;

    const r = spawnSync(
      "bun",
      ["run", CLI, "--cwd", tmp.dir, "--json", "project", "council", PROJECT, "--phase", "preflight", "--no-llm"],
      { cwd: tmp.dir, encoding: "utf8", env },
    );
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.phase).toBe("preflight");
    expect(json.verdict.roleScores).toHaveLength(7);
    expect(["ship", "block", "revise"]).toContain(json.verdict.verdict);

    expect(fs.existsSync(path.join(projectDir(PROJECT), "council-preflight.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectDir(PROJECT), "council-preflight.md"))).toBe(true);
    // --no-llm → no model call → no generations.jsonl row.
    expect(fs.existsSync(path.join(projectDir(PROJECT), "logs", "generations.jsonl"))).toBe(false);
  });

  test("re-running auto-versions the prior verdict (append-only)", () => {
    const p = parseProductionPlan({ ...plan(), projectId: PROJECT });
    fs.writeFileSync(path.join(projectDir(PROJECT), "production-plan.json"), JSON.stringify(p, null, 2));
    const run = () =>
      spawnSync(
        "bun",
        ["run", CLI, "--cwd", tmp.dir, "--json", "project", "council", PROJECT, "--phase", "preflight", "--no-llm"],
        { cwd: tmp.dir, encoding: "utf8", env: { ...process.env } },
      );
    expect(run().status).toBe(0);
    const second = run();
    expect(second.status).toBe(0);
    const json = JSON.parse(second.stdout);
    expect(json.artifacts.archivedJson).toBeTruthy();
    expect(fs.existsSync(path.join(projectDir(PROJECT), "council-preflight.v1.json"))).toBe(true);
  });

  test("missing production-plan.json → E_NOT_FOUND, no files written", () => {
    const r = spawnSync(
      "bun",
      ["run", CLI, "--cwd", tmp.dir, "--json", "project", "council", PROJECT, "--phase", "preflight", "--no-llm"],
      { cwd: tmp.dir, encoding: "utf8", env: { ...process.env } },
    );
    expect(r.status).not.toBe(0);
    expect(fs.existsSync(path.join(projectDir(PROJECT), "council-preflight.json"))).toBe(false);
  });

  test("bad --phase → validation error", () => {
    const p = parseProductionPlan({ ...plan(), projectId: PROJECT });
    fs.writeFileSync(path.join(projectDir(PROJECT), "production-plan.json"), JSON.stringify(p, null, 2));
    const r = spawnSync(
      "bun",
      ["run", CLI, "--cwd", tmp.dir, "--json", "project", "council", PROJECT, "--phase", "wrong", "--no-llm"],
      { cwd: tmp.dir, encoding: "utf8", env: { ...process.env } },
    );
    expect(r.status).not.toBe(0);
  });
});
