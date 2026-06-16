// Mode-guideline coverage tests — issue #417.
//
// #413 established WHICH modes are SUPPORTED; #417 requires every supported mode
// to carry mode-specific quality guidance — a linked register guideline OR a
// mode-level quality playbook (docs/playbooks/modes/<mode>.md). This file pins:
//
//   (1) the coverage lint passes — every SUPPORTED mode is covered;
//   (2) the lint has TEETH — a synthetic supported-mode-without-coverage FAILS
//       the per-mode coverage check (otherwise the lint is decorative);
//   (3) every #417 mode-level playbook carries the required sections, including
//       the mandatory "Does NOT apply to:" negative-scope section;
//   (4) deferred-gap modes are exempt (not held to the bar);
//   (5) the production plan (#407) lists the guidance it loaded for the chosen
//       mode in `guidelinesUsed` (the issue acceptance: "plans list which
//       guidelines they used").
//
// English-only on disk: every fixture string is plain English. The plan
// builder's LLM enrichment is STUBBED (no live network), mirroring
// tests/unit/mode-coverage.test.ts.

import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  supportedContentModes,
  unsupportedContentModes,
  modeGuidelineCoverage,
  modePlaybookPath,
  isModeSupported,
} from "../../cli/lib/content-modes.js";
import {
  lintModeGuidelines,
  scoreModeCoverage,
  referencedGuidelineSlugs,
  guidelineExists,
  modePlaybookExists,
} from "../../scripts/lint-mode-guidelines.js";
import { buildProductionPlan } from "../../cli/lib/plan/build.js";
import {
  parseProductionPlan,
  type LlmEnrichment,
} from "../../cli/lib/schemas/production-plan.js";

const REPO = path.resolve(import.meta.dir, "..", "..");

// The nine sections every #417 mode-level quality playbook must carry (the
// issue's required section list + the mandatory negative-scope line).
const REQUIRED_SECTIONS = [
  "## Creative objective",
  "## Required inputs",
  "## Reference requirements",
  "## Prompt spine",
  "## Model recommendations",
  "## Style / visual constraints",
  "## Common failure modes",
  "## Evaluation criteria",
  "## Does NOT apply to:",
];

function cannedEnrichment(over: Partial<LlmEnrichment> = {}): LlmEnrichment {
  return {
    targetAudienceLanguage: "English",
    register: "",
    sceneCount: 5,
    durationSec: 25,
    firstCheckpoint: "scene-01 anchor -> wait for go",
    vibe: "",
    ...over,
  };
}

// One representative brief per supported mode that classifies confidently to it
// (reused from the #413 fixtures so the plan resolves the right mode).
const MODE_BRIEFS: Record<string, string> = {
  "product-shot": "a clean studio product shot of my bottle on a white background",
  "lifestyle-scene": "a lifestyle scene photo of my product in a real life setting",
  "closeup-product-with-person": "a closeup of a person holding the product in hand, macro shot",
  "pinterest-pin": "a vertical pinterest pin for my recipe with a headline",
  "hero-banner": "a wide website hero banner with a headline and our product",
  "social-carousel": "a 10 slide instagram carousel swipe-through deck about our launch",
  "ad-creative-pack": "a meta ads creative matrix / ad pack for acme.example.com cold traffic",
  "conceptual-product": "a surreal conceptual product key visual for the campaign",
  restyle: "restyle this image as a watercolor, style transfer the look",
  "ugc-review": "a ugc review talking head testimonial of my serum",
  "tutorial-ugc": "a how-to tutorial video showing step by step how to use my app",
  "unboxing-ugc": "an unboxing video opening the box of my new gadget",
  "tv-ad": "a polished tv commercial spot, a broadcast ad for the brand",
  "cartoon-animation": "a 2d cartoon animation short with my mascot",
  "motion-design": "a kinetic motion graphics piece with logo animation",
  "typography-animation": "a kinetic typography animated text lyric piece",
  "podcast-video": "turn this podcast into a long form faceless video, audio to video",
  "infographic-animation": "make an animated infographic data visualization video of these stats",
};

// ─── (1) The coverage lint passes — every supported mode is covered ──────────

describe("mode-guideline coverage lint (#417)", () => {
  test("the repo passes the coverage lint (every supported mode covered)", () => {
    const report = lintModeGuidelines(REPO);
    expect(
      report.offenders,
      `uncovered supported modes: ${JSON.stringify(report.offenders.map((o) => o.mode))}`,
    ).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.scanned).toBe(supportedContentModes().length);
    // Deferred gaps are exempt from the bar.
    expect(report.exempt).toBe(unsupportedContentModes().length);
  });

  test("every supported mode has a guideline link OR a mode-level playbook", () => {
    for (const entry of supportedContentModes()) {
      const cov = scoreModeCoverage(REPO, entry);
      expect(
        cov.ok,
        `supported mode "${entry.mode}" has neither a linked guideline nor a mode playbook`,
      ).toBe(true);
      // Concretely: at least one linked guideline OR the mode playbook exists.
      const linkedOrPlaybook = cov.linkedGuidelines.length > 0 || cov.hasModePlaybook;
      expect(linkedOrPlaybook).toBe(true);
    }
  });

  test("no mode references a guideline slug that doesn't exist on disk", () => {
    // A dangling guideline reference would mean the registry points at a deleted
    // guideline — surface it even when a mode playbook keeps the mode covered.
    for (const entry of supportedContentModes()) {
      const cov = scoreModeCoverage(REPO, entry);
      for (const slug of cov.danglingGuidelines) {
        expect(
          guidelineExists(REPO, slug),
          `mode "${entry.mode}" references guidelines/${slug}/ which does not exist`,
        ).toBe(true);
      }
    }
  });
});

// ─── (2) The lint has TEETH — a synthetic uncovered mode FAILS ───────────────

describe("coverage check has teeth (#417)", () => {
  test("a synthetic supported mode with no guideline and no playbook FAILS the check", () => {
    // Build a fake supported-mode entry that references NO guideline and whose
    // mode-playbook path does not exist. The per-mode scorer must mark it
    // uncovered — proving the lint isn't a rubber stamp.
    const synthetic = {
      mode: "synthetic-uncovered-mode" as never,
      implementationUnit: { kind: "skill", skills: [], guidelines: [], cliVerbs: [], note: "" },
      guidelineOrStyleLock: { required: false, guidelineSlugs: [], note: "" },
    } as Parameters<typeof scoreModeCoverage>[1];

    const cov = scoreModeCoverage(REPO, synthetic);
    expect(cov.linkedGuidelines).toEqual([]);
    expect(cov.hasModePlaybook).toBe(false);
    expect(cov.ok).toBe(false); // the teeth: zero coverage → fails.
  });

  test("a mode covered ONLY by a (real) guideline link still passes; dropping it would fail", () => {
    // A guideline-backed mode with NO mode playbook on disk must pass coverage,
    // and removing the guideline reference must flip it to a failure. Use a
    // SYNTHETIC mode (a name with no playbook file) that references a real
    // guideline slug — robust to real modes gaining a playbook (#433/#434/#435
    // add production playbooks to the guideline-backed commercial modes too).
    const guidelineOnly = {
      mode: "synthetic-guideline-only-mode" as never,
      implementationUnit: {
        kind: "guideline-route",
        skills: [],
        guidelines: ["cgi-product-renders"],
        cliVerbs: ["generate image"],
        note: "",
      },
      guidelineOrStyleLock: { required: true, guidelineSlugs: ["cgi-product-renders"], note: "" },
    } as Parameters<typeof scoreModeCoverage>[1];

    const covered = scoreModeCoverage(REPO, guidelineOnly);
    expect(covered.linkedGuidelines.length).toBeGreaterThan(0);
    expect(covered.hasModePlaybook).toBe(false);
    expect(covered.ok).toBe(true);

    const stripped = {
      ...guidelineOnly,
      implementationUnit: { ...guidelineOnly.implementationUnit, guidelines: [] },
      guidelineOrStyleLock: { ...guidelineOnly.guidelineOrStyleLock, guidelineSlugs: [] },
    };
    const cov = scoreModeCoverage(REPO, stripped);
    expect(cov.ok).toBe(false); // no guideline, no playbook → uncovered.
  });
});

// ─── (3) Every #417 mode-level playbook has the required sections ────────────

describe("mode-level quality playbooks have the required sections (#417)", () => {
  // Every supported mode that ships a mode-level playbook on disk must carry the
  // required sections — whether or not it ALSO has a register guideline. #433+
  // added production playbooks to guideline-backed commercial modes too, and the
  // structural bar must hold for those docs as well.
  const playbookModes = supportedContentModes()
    .filter((e) => modePlaybookExists(REPO, e.mode))
    .map((e) => e.mode);

  test("there is at least one mode-level playbook (the #417 gaps were closed here)", () => {
    expect(playbookModes.length).toBeGreaterThan(0);
  });

  for (const mode of playbookModes) {
    test(`docs/playbooks/modes/${mode}.md exists and carries all required sections`, () => {
      const p = path.join(REPO, modePlaybookPath(mode));
      expect(fs.existsSync(p), `${modePlaybookPath(mode)} is missing`).toBe(true);
      const body = fs.readFileSync(p, "utf8");
      for (const section of REQUIRED_SECTIONS) {
        expect(body.includes(section), `${mode}.md is missing the "${section}" section`).toBe(true);
      }
      // The negative-scope section must have real content, not just a heading.
      const idx = body.indexOf("## Does NOT apply to:");
      const after = body.slice(idx + "## Does NOT apply to:".length).trim();
      expect(after.length).toBeGreaterThan(20);
    });
  }

  test("the modes/ README index links every mode-level playbook", () => {
    const readme = fs.readFileSync(path.join(REPO, "docs", "playbooks", "modes", "README.md"), "utf8");
    for (const mode of playbookModes) {
      expect(readme.includes(`${mode}.md`), `modes/README.md does not link ${mode}.md`).toBe(true);
    }
  });
});

// ─── (4) Deferred-gap modes are exempt; resolver consistency ─────────────────

describe("coverage resolver consistency (#417)", () => {
  test("modeGuidelineCoverage matches the lint's referenced slugs for every supported mode", () => {
    for (const entry of supportedContentModes()) {
      const cov = modeGuidelineCoverage(entry.mode)!;
      expect(cov.guidelineSlugs).toEqual(referencedGuidelineSlugs(entry));
      expect(cov.modePlaybook).toBe(modePlaybookPath(entry.mode));
    }
  });

  test("deferred-gap modes are NOT held to the coverage bar", () => {
    // The lint only scans supported modes; gaps are exempt by construction.
    const report = lintModeGuidelines(REPO);
    const scannedGapInOffenders = report.offenders.some((o) => !isModeSupported(o.mode));
    expect(scannedGapInOffenders).toBe(false);
  });

  test("modeGuidelineCoverage returns null for an unknown mode", () => {
    expect(modeGuidelineCoverage("not-a-real-mode")).toBeNull();
  });
});

// ─── (5) The plan lists the guidelines it used (#417 acceptance) ─────────────

describe("production plan lists guidelines used (#407 + #417)", () => {
  const enrich = async () => cannedEnrichment();

  for (const entry of supportedContentModes()) {
    const mode = entry.mode;
    test(`plan for "${mode}" populates guidelinesUsed from the mode coverage`, async () => {
      const { plan } = await buildProductionPlan(
        { projectId: `plan-${mode}`, brief: MODE_BRIEFS[mode]! },
        { candidates: [], enrich },
      );
      expect(plan.contentMode.mode).toBe(mode);
      expect(() => parseProductionPlan(plan)).not.toThrow();

      // guidelinesUsed is non-empty for every supported mode.
      expect(plan.guidelinesUsed.length).toBeGreaterThan(0);

      const cov = modeGuidelineCoverage(mode)!;
      if (cov.guidelineSlugs.length > 0) {
        // Guideline-backed mode → the plan lists the register guideline slugs.
        expect(plan.guidelinesUsed).toEqual(cov.guidelineSlugs);
      } else {
        // Playbook-backed mode → the plan lists the mode-playbook doc path.
        expect(plan.guidelinesUsed).toEqual([cov.modePlaybook]);
      }
    });
  }

  test("the rendered PRODUCTION_PLAN.md surfaces the guidelines-used line", async () => {
    const { renderPlanMarkdown } = await import("../../cli/lib/plan/build.js");
    const { plan } = await buildProductionPlan(
      { projectId: "plan-md", brief: MODE_BRIEFS["social-carousel"]! },
      { candidates: [], enrich },
    );
    const md = renderPlanMarkdown(plan);
    expect(md).toContain("Guidelines used (#417):");
    // social-carousel is playbook-backed → the doc path appears in the line.
    expect(md).toContain("docs/playbooks/modes/social-carousel.md");
  });

  test("an unclassified brief lists no guidelines (no over-promise)", async () => {
    const { plan } = await buildProductionPlan(
      { projectId: "plan-freeform", brief: "crispy midnight bleachers vibe" },
      { candidates: [], enrich },
    );
    // Nothing classified confidently → no guidance listed.
    if (plan.contentMode.mode === null || !isModeSupported(plan.contentMode.mode)) {
      expect(plan.guidelinesUsed).toEqual([]);
    }
  });
});
