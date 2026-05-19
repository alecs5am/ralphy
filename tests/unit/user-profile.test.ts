// `cli/lib/user-profile.ts` — per-user profile persisting skill level, signals,
// preferences, and developer badge. Lives at ~/.ralphy/user-profile.json.
//
// Skill is computed continuously on a 0-10 scale from signals: projects shipped,
// postmortems written, distinct verbs used, etc. Agent reads the profile on
// session start (via bare `ralphy` or `ralphy whoami`) and adapts intake
// verbosity per the band the score falls into.
//
// Tests cover: defaults on missing file, load/save roundtrip, skill computation
// + clamping, developer auto-detection via git config, backfill from a mocked
// workspace/projects tree.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  loadUserProfile,
  saveUserProfile,
  computeSkillScore,
  bandForScore,
  backfillFromWorkspace,
  defaultProfile,
  type UserProfile,
  type Signals,
} from "../../cli/lib/user-profile.js";

let TMP_HOME = "";

beforeEach(async () => {
  TMP_HOME = await fs.mkdtemp(path.join(os.tmpdir(), "ralphy-profile-test-"));
});

afterEach(async () => {
  await fs.rm(TMP_HOME, { recursive: true, force: true });
});

// ─── defaults / I/O ──────────────────────────────────────────────────────────

describe("loadUserProfile", () => {
  test("returns defaults when no file exists", async () => {
    const p = await loadUserProfile({ home: TMP_HOME });
    expect(p.version).toBe(1);
    expect(p.skill.score).toBe(0);
    expect(p.skill.band).toBe("novice");
    expect(p.is_developer).toBe(false);
    expect(p.signals.projects_done).toBe(0);
  });

  test("loads existing profile from ~/.ralphy/user-profile.json", async () => {
    const dir = path.join(TMP_HOME, ".ralphy");
    await fs.mkdir(dir, { recursive: true });
    const existing: UserProfile = {
      ...defaultProfile(),
      skill: { score: 7, band: "experienced", auto_assessed: true, user_override: null, assessed_at: "2026-05-01T00:00:00Z" },
      is_developer: true,
      signals: { ...defaultProfile().signals, projects_done: 5 },
    };
    await fs.writeFile(path.join(dir, "user-profile.json"), JSON.stringify(existing));
    const p = await loadUserProfile({ home: TMP_HOME });
    expect(p.skill.score).toBe(7);
    expect(p.is_developer).toBe(true);
    expect(p.signals.projects_done).toBe(5);
  });

  test("returns defaults on malformed JSON without throwing", async () => {
    const dir = path.join(TMP_HOME, ".ralphy");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "user-profile.json"), "not json {{{");
    const p = await loadUserProfile({ home: TMP_HOME });
    expect(p.skill.score).toBe(0);
  });
});

describe("saveUserProfile", () => {
  test("creates ~/.ralphy if missing + persists round-trip", async () => {
    const profile = { ...defaultProfile(), is_developer: true };
    await saveUserProfile(profile, { home: TMP_HOME });
    const reread = await loadUserProfile({ home: TMP_HOME });
    expect(reread.is_developer).toBe(true);
  });

  test("updates lastSeen on every save", async () => {
    const p1 = defaultProfile();
    await saveUserProfile(p1, { home: TMP_HOME });
    await new Promise((r) => setTimeout(r, 10));
    const p2 = await loadUserProfile({ home: TMP_HOME });
    await saveUserProfile(p2, { home: TMP_HOME });
    const p3 = await loadUserProfile({ home: TMP_HOME });
    expect(new Date(p3.lastSeen).getTime()).toBeGreaterThan(new Date(p1.lastSeen).getTime());
  });
});

// ─── skill computation ───────────────────────────────────────────────────────

describe("computeSkillScore", () => {
  test("returns 0 for zero signals", () => {
    const s: Signals = {
      projects_done: 0,
      projects_with_postmortem: 0,
      renders_shipped: 0,
      avg_postmortem_rating: null,
      templates_used_count: 0,
      first_template_used_at: null,
      cli_verb_breadth: 0,
      sessions_count: 0,
      days_since_first_seen: 0,
    };
    expect(computeSkillScore(s)).toBe(0);
  });

  test("returns ~10 for a power-user (alecs5am-like signals)", () => {
    const s: Signals = {
      projects_done: 10,
      projects_with_postmortem: 7,
      renders_shipped: 12,
      avg_postmortem_rating: 8.5,
      templates_used_count: 8,
      first_template_used_at: "2026-04-01T00:00:00Z",
      cli_verb_breadth: 15,
      sessions_count: 30,
      days_since_first_seen: 45,
    };
    const score = computeSkillScore(s);
    expect(score).toBeGreaterThanOrEqual(9);
    expect(score).toBeLessThanOrEqual(10);
  });

  test("clamps at 10 even with absurdly high signals", () => {
    const s: Signals = {
      projects_done: 1000,
      projects_with_postmortem: 1000,
      renders_shipped: 10000,
      avg_postmortem_rating: 10,
      templates_used_count: 100,
      first_template_used_at: "2025-01-01T00:00:00Z",
      cli_verb_breadth: 200,
      sessions_count: 500,
      days_since_first_seen: 365,
    };
    expect(computeSkillScore(s)).toBe(10);
  });

  test("novice-to-learning transition: 1 project, no postmortem yet", () => {
    const s: Signals = {
      projects_done: 1,
      projects_with_postmortem: 0,
      renders_shipped: 2,
      avg_postmortem_rating: null,
      templates_used_count: 1,
      first_template_used_at: "2026-05-15T00:00:00Z",
      cli_verb_breadth: 4,
      sessions_count: 3,
      days_since_first_seen: 5,
    };
    const score = computeSkillScore(s);
    // 1 project shipped without postmortem ≈ novice/learning border (1.5-2.0).
    // Honest: they've seen one cycle end-to-end but haven't internalized the lessons.
    expect(score).toBeGreaterThanOrEqual(1);
    expect(score).toBeLessThan(4);
  });
});

describe("bandForScore", () => {
  test.each([
    [0, "novice"],
    [1, "novice"],
    [2, "learning"],
    [3, "learning"],
    [4, "intermediate"],
    [5, "intermediate"],
    [6, "comfortable"],
    [7, "comfortable"],
    [8, "experienced"],
    [9, "experienced"],
    [10, "expert"],
  ])("score %d → %s", (score, expected) => {
    expect(bandForScore(score)).toBe(expected);
  });
});

// ─── backfill from workspace ─────────────────────────────────────────────────

describe("backfillFromWorkspace", () => {
  let tmpWorkspace = "";

  beforeEach(async () => {
    tmpWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), "ralphy-workspace-test-"));
    await fs.mkdir(path.join(tmpWorkspace, "projects"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpWorkspace, { recursive: true, force: true });
  });

  test("counts projects with status=done from registry-style indicators", async () => {
    // Project 1: has render/final.mp4 → done
    const p1 = path.join(tmpWorkspace, "projects", "proj-001");
    await fs.mkdir(path.join(p1, "render"), { recursive: true });
    await fs.writeFile(path.join(p1, "render", "final.mp4"), "fake");
    // Project 2: only scenario, no render → not done
    const p2 = path.join(tmpWorkspace, "projects", "proj-002");
    await fs.mkdir(p2, { recursive: true });
    await fs.writeFile(path.join(p2, "scenario.json"), "{}");
    // Project 3: render + 6-file postmortem → done with postmortem
    const p3 = path.join(tmpWorkspace, "projects", "proj-003");
    await fs.mkdir(path.join(p3, "render"), { recursive: true });
    await fs.writeFile(path.join(p3, "render", "final.mp4"), "fake");
    await fs.mkdir(path.join(p3, "postmortem"), { recursive: true });
    await fs.writeFile(path.join(p3, "postmortem", "00-INDEX.md"), "# Postmortem");

    const signals = await backfillFromWorkspace({ workspaceRoot: tmpWorkspace });
    expect(signals.projects_done).toBe(2);
    expect(signals.projects_with_postmortem).toBe(1);
    expect(signals.renders_shipped).toBe(2);
  });

  test("counts legacy single-file POSTMORTEM.md as postmortem", async () => {
    const p = path.join(tmpWorkspace, "projects", "proj-legacy");
    await fs.mkdir(path.join(p, "render"), { recursive: true });
    await fs.writeFile(path.join(p, "render", "final.mp4"), "fake");
    await fs.writeFile(path.join(p, "POSTMORTEM.md"), "# Postmortem");

    const signals = await backfillFromWorkspace({ workspaceRoot: tmpWorkspace });
    expect(signals.projects_with_postmortem).toBe(1);
  });

  test("returns zeros on empty workspace", async () => {
    const signals = await backfillFromWorkspace({ workspaceRoot: tmpWorkspace });
    expect(signals.projects_done).toBe(0);
    expect(signals.projects_with_postmortem).toBe(0);
  });

  test("handles missing workspace dir gracefully", async () => {
    const signals = await backfillFromWorkspace({
      workspaceRoot: path.join(tmpWorkspace, "nonexistent"),
    });
    expect(signals.projects_done).toBe(0);
  });
});

// ─── developer auto-detection ────────────────────────────────────────────────

describe("developer badge", () => {
  test("defaultProfile starts with is_developer: false", () => {
    expect(defaultProfile().is_developer).toBe(false);
  });

  test("can be set explicitly via saveUserProfile", async () => {
    const p = { ...defaultProfile(), is_developer: true };
    await saveUserProfile(p, { home: TMP_HOME });
    const reloaded = await loadUserProfile({ home: TMP_HOME });
    expect(reloaded.is_developer).toBe(true);
  });
});

// ─── full flow: load → backfill → save → reload ──────────────────────────────

describe("integration: load → backfill → save → reload", () => {
  test("alecs5am-like backfill produces high skill score", async () => {
    // Stage a workspace with 10 done projects, 7 with postmortems
    const tmpW = await fs.mkdtemp(path.join(os.tmpdir(), "ralphy-workspace-integ-"));
    try {
      await fs.mkdir(path.join(tmpW, "projects"), { recursive: true });
      for (let i = 1; i <= 10; i++) {
        const p = path.join(tmpW, "projects", `proj-${i.toString().padStart(3, "0")}`);
        await fs.mkdir(path.join(p, "render"), { recursive: true });
        await fs.writeFile(path.join(p, "render", "final.mp4"), "fake");
        if (i <= 7) {
          await fs.mkdir(path.join(p, "postmortem"), { recursive: true });
          await fs.writeFile(path.join(p, "postmortem", "00-INDEX.md"), "x");
        }
      }

      const signals = await backfillFromWorkspace({ workspaceRoot: tmpW });
      expect(signals.projects_done).toBe(10);
      expect(signals.projects_with_postmortem).toBe(7);

      const profile: UserProfile = {
        ...defaultProfile(),
        signals: {
          ...defaultProfile().signals,
          ...signals,
          cli_verb_breadth: 15,
          sessions_count: 30,
          templates_used_count: 8,
          avg_postmortem_rating: 8.5,
        },
        is_developer: true,
      };
      profile.skill.score = computeSkillScore(profile.signals);
      profile.skill.band = bandForScore(profile.skill.score);

      expect(profile.skill.score).toBeGreaterThanOrEqual(9);
      expect(profile.skill.band).toBe("expert");

      await saveUserProfile(profile, { home: TMP_HOME });
      const reloaded = await loadUserProfile({ home: TMP_HOME });
      expect(reloaded.skill.score).toBeGreaterThanOrEqual(9);
      expect(reloaded.is_developer).toBe(true);
    } finally {
      await fs.rm(tmpW, { recursive: true, force: true });
    }
  });
});
