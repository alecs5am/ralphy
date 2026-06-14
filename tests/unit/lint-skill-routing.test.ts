// Unit tests for scripts/lint-skill-routing.ts (#405).
//
// The lint enforces the ROUTING SIGNAL of user-facing skills: a description
// must carry at least one actionable trigger cue (USE WHEN / TRIGGER / etc.),
// a `triggers:` array, or ≥2 quoted example utterances. Maintainer + no-namespace
// (HyperFrames) skills are exempt.

import { describe, test, expect } from "bun:test";
import path from "node:path";
import {
  isUserFacing,
  scoreRoutingSignal,
  lintSkillRouting,
  type RoutingSignal,
} from "../../scripts/lint-skill-routing.js";

const REPO = path.resolve(import.meta.dir, "..", "..");

describe("isUserFacing", () => {
  test("user namespace is held to the bar", () => {
    expect(isUserFacing({ namespace: "user", description: "x" })).toBe(true);
  });
  test("maintainer namespace is exempt", () => {
    expect(isUserFacing({ namespace: "maintainer", description: "x" })).toBe(false);
  });
  test("no namespace (HyperFrames render-engine skills) is exempt", () => {
    expect(isUserFacing({ description: "x" })).toBe(false);
  });
});

describe("scoreRoutingSignal", () => {
  const score = (desc: string, fm = ""): RoutingSignal =>
    scoreRoutingSignal({ name: "s", description: desc, namespace: "user" }, fm);

  test("passes on a USE WHEN cue", () => {
    expect(score("Some role exposition. USE WHEN the user asks for X.").ok).toBe(true);
  });

  test("passes on a TRIGGER cue", () => {
    expect(score("Does a thing. TRIGGER: install ralphy, bootstrap.").ok).toBe(true);
  });

  test("passes on a FIRES cue", () => {
    expect(score("FIRES on a generic poster brief.").ok).toBe(true);
  });

  test("passes on the `use this skill whenever` phrasing", () => {
    expect(score("Distil the session. Use this skill whenever the user types /postmortem.").ok).toBe(
      true,
    );
  });

  test("passes on a slash-command self-reference", () => {
    expect(score("Manage the inbox. Tag /dev-tasks to file a note.").ok).toBe(true);
  });

  test("passes on >=2 straight-quoted example utterances", () => {
    expect(score('Does X. Say "make a poster", "drop poster", "key art".').ok).toBe(true);
  });

  test("passes on >=2 curly-quoted example utterances", () => {
    expect(score("Does X. Say “make a poster”, “drop poster”.").ok).toBe(true);
  });

  test("passes on a `triggers:` block sequence in frontmatter", () => {
    const fm = 'name: s\nnamespace: user\ndescription: A flat blurb.\ntriggers:\n  - "make a poster"\n  - "drop poster"';
    expect(score("A flat blurb with no cue.", fm).ok).toBe(true);
  });

  test("passes on an inline `triggers:` flow sequence", () => {
    const fm = 'name: s\nnamespace: user\ntriggers: ["make a poster", "drop poster"]';
    expect(score("A flat blurb with no cue.", fm).ok).toBe(true);
  });

  test("FAILS on a flat blurb with no cue, no triggers, <2 utterances", () => {
    const r = score("A broad description that explains what the skill does, conflating several intents.");
    expect(r.ok).toBe(false);
    expect(r.hasCue).toBe(false);
    expect(r.hasTriggersArray).toBe(false);
    expect(r.utteranceCount).toBeLessThan(2);
  });

  test("FAILS on exactly one quoted utterance (below the threshold)", () => {
    expect(score('A blurb mentioning only "one thing" and nothing else.').ok).toBe(false);
  });
});

describe("lintSkillRouting against the live repo", () => {
  test("all current user-facing skills pass the routing bar", () => {
    const report = lintSkillRouting(REPO);
    expect(report.ok).toBe(true);
    expect(report.offenders).toEqual([]);
    // Sanity: we are actually scanning user-facing skills (not exempting all).
    expect(report.scanned).toBeGreaterThan(10);
  });
});
