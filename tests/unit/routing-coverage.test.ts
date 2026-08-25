// Routing-coverage fixture tests — #405 (harden agent routing + skill activation).
//
// There is no runtime router in Ralphy: routing is the LLM reading AGENTS.md and
// then `Read`-ing the matched playbook / SKILL.md. So this is a STATIC coverage
// test. For each key user utterance it asserts the routing SURFACE covers it —
// i.e. the expected target file EXISTS, and a matching fragment of the utterance
// appears either:
//   (a) in the AGENTS.md routing-table row that links to that target, OR
//   (b) in the target SKILL.md's frontmatter description / triggers.
//
// "A key intent has no routing surface" is a test FAILURE — per the issue,
// missed routing is a defect. If a future edit moves a route off AGENTS.md and
// out of the skill description, the corresponding fixture goes red here.

import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "../../scripts/lint-skills.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const AGENTS_MD = fs.readFileSync(path.join(REPO, "AGENTS.md"), "utf8");

// ─── Routing-surface helpers ────────────────────────────────────────────────

/**
 * Return the text of every AGENTS.md line (routing-table row or prose) that
 * links to `target`. A row that points at the target is part of its surface.
 */
function agentsRowsLinkingTo(target: string): string[] {
  const needle = `(${target})`;
  return AGENTS_MD.split("\n").filter((line) => line.includes(needle));
}

/** Description text of a skill (full, multi-paragraph folded blocks included). */
function skillDescription(skillTarget: string): string {
  const abs = path.join(REPO, skillTarget);
  if (!fs.existsSync(abs)) return "";
  const fm = parseFrontmatter(fs.readFileSync(abs, "utf8"));
  return fm?.description ?? "";
}

/**
 * The full routing surface for a target = the AGENTS.md rows that link to it,
 * PLUS (when it is a SKILL.md) its frontmatter description. Lower-cased for
 * case-insensitive fragment matching.
 */
function routingSurface(target: string): string {
  const parts = [...agentsRowsLinkingTo(target)];
  if (target.endsWith("SKILL.md")) parts.push(skillDescription(target));
  return parts.join("\n").toLowerCase();
}

// ─── Fixture table: utterance → expected target + matching fragments ─────────

interface Fixture {
  /** Human label for the intent. */
  intent: string;
  /** Representative user utterance(s). */
  utterances: string[];
  /** Expected routing target (playbook or SKILL.md, repo-relative path). */
  target: string;
  /**
   * Fragments — at least one must appear in the target's routing surface.
   * These are lower-cased substrings drawn from the utterance vocabulary.
   */
  fragments: string[];
}

const FIXTURES: Fixture[] = [
  {
    intent: "new video / new project request",
    utterances: ["make a video about X", "launch project Y", "I want one like this + <url>"],
    target: ".agents/skills/intake/SKILL.md",
    fragments: ["new project request", "make a video about x", "intake"],
  },
  {
    intent: "URL research / competitor breakdown",
    utterances: ["analyze @handle", "break down this TikTok", "what's trending in <niche>"],
    target: ".agents/skills/researcher/SKILL.md",
    fragments: ["analyze @handle", "break down", "trending", "competitor", "research"],
  },
  {
    intent: "rendered-mp4 evaluation / QA",
    utterances: ["evaluate this video", "is this ready to ship", "score the render"],
    target: ".agents/skills/evaluator/SKILL.md",
    fragments: ["evaluate", "is this ready to ship", "score the render", "qa"],
  },
  {
    intent: "repair request — scenario rework",
    utterances: ["rework scene 3", "rewrite the hook", "tighten the VO"],
    target: ".agents/skills/scenarist/SKILL.md",
    fragments: ["rework scene", "rewrite hook", "tighten vo", "shorten / lengthen"],
  },
  {
    intent: "repair request — find issues in a render",
    utterances: ["find issues in this video", "what's wrong with this video"],
    target: ".agents/skills/evaluator/SKILL.md",
    fragments: ["find issues in", "what's wrong with", "find issues / problems / artifacts"],
  },
  {
    intent: "batch / content-farm request",
    utterances: ["make 10 videos", "make video end-to-end", "review batch", "cost rollup"],
    target: ".agents/skills/producer/SKILL.md",
    fragments: ["batch", "make video end-to-end", "review batch", "cost rollup"],
  },
  {
    intent: "still poster / key art",
    utterances: ["make a poster for X", "drop poster", "key art", "hype graphic"],
    target: ".agents/skills/poster/SKILL.md",
    fragments: ["poster", "key art", "hype graphic", "flyer"],
  },
  {
    intent: "multi-slide carousel",
    utterances: ["make an IG carousel", "5-slide deck", "swipe-through"],
    target: ".agents/skills/carousel/SKILL.md",
    fragments: ["carousel", "swipe-through", "multi-slide", "5-slide"],
  },
  {
    intent: "FB / Meta ad pack",
    utterances: ["make 32 FB creatives", "ad pack for <site>", "creative matrix"],
    target: ".agents/skills/fb-creatives/SKILL.md",
    fragments: ["ad pack", "fb creatives", "creative matrix", "meta ads", "performance creatives"],
  },
  {
    intent: "publish / form a unit (publish copy)",
    utterances: [
      "publish this to the library",
      "save this as a unit",
      "ship this to the site",
    ],
    target: ".agents/skills/templater/SKILL.md",
    fragments: ["publish", "save this as a template", "reproduce", "extract"],
  },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("routing-coverage: every key intent has a routing surface (#405)", () => {
  for (const fx of FIXTURES) {
    test(`"${fx.intent}" routes to ${fx.target}`, () => {
      // 1. The target file must exist (a route to a missing file is a defect).
      const abs = path.join(REPO, fx.target);
      expect(fs.existsSync(abs)).toBe(true);

      // 2. AGENTS.md must actually link to the target somewhere — the route
      //    surface is reachable from the always-on router. (Skill targets are
      //    linked in routing-table rows; playbook targets likewise.)
      expect(agentsRowsLinkingTo(fx.target).length).toBeGreaterThan(0);

      // 3. At least one utterance fragment must appear in the routing surface
      //    (the linking AGENTS.md row(s) and/or the SKILL.md description).
      const surface = routingSurface(fx.target);
      const matched = fx.fragments.filter((f) => surface.includes(f.toLowerCase()));
      expect(
        matched.length,
        `no utterance fragment for "${fx.intent}" found in the routing surface of ${fx.target}. ` +
          `Tried: ${JSON.stringify(fx.fragments)}. ` +
          `Either the route was dropped from AGENTS.md or the skill description no longer carries the trigger vocabulary — missed routing is a defect.`,
      ).toBeGreaterThan(0);
    });
  }
});

describe("routing-coverage: skill targets exist and carry a trigger signal", () => {
  // Every SKILL.md referenced by a fixture must carry the trigger vocabulary
  // its routing depends on. This guards the activation half of the issue: a
  // route can exist in AGENTS.md while the skill description is too broad to
  // fire — the lint catches that globally, this pins it for the key intents.
  const skillTargets = [...new Set(FIXTURES.map((f) => f.target))].filter((t) =>
    t.endsWith("SKILL.md"),
  );
  for (const target of skillTargets) {
    test(`${target} description carries an actionable trigger cue`, () => {
      const desc = skillDescription(target);
      expect(desc.length).toBeGreaterThan(0);
      const hasCue =
        /USE WHEN|USE THIS|TRIGGER|FIRES?|ALSO FIRE/i.test(desc) ||
        (desc.match(/"[^"]{3,}"|“[^”]{3,}”/g) ?? []).length >= 2;
      expect(hasCue, `${target} description has no USE WHEN / TRIGGER cue or example utterances`).toBe(
        true,
      );
    });
  }
});
