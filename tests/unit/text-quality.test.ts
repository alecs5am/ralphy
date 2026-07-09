// Deterministic text-quality evaluators (#526) — cli/lib/eval/text-quality.ts.
//
// Each of the four pure scorers (keyword-coverage / structure / reading-level /
// length-window) FIRES a warn on a violating fixture and PASSES clean on a good
// one. Plus: the workspace-validator wrappers resolve the article body from a
// tmp project tree and degrade to an `info` finding when no body is present, and
// the four validators register under `registerBuiltinWorkspaceValidators()`.
//
// tmp-root + env/cwd hygiene per #545: no process.env / process.chdir mutation;
// the only filesystem writes are under an isolated makeTmpRoot() dir.
//
// English-only on disk: every fixture body is plain English.

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import {
  scoreKeywordCoverage,
  scoreStructure,
  scoreReadingLevel,
  scoreLengthWindow,
  resolveArticleBody,
  fleschReadingEase,
  wordCount,
  headingCount,
  hasFaqBlock,
  linkCount,
  __testHooks,
} from "../../cli/lib/eval/text-quality.js";
import { hasWorkspaceValidator } from "../../cli/lib/eval/workspace-evaluators.js";
import type { WorkspaceValidatorContext } from "../../cli/lib/eval/workspace-evaluators.js";
import { registerBuiltinWorkspaceValidators } from "../../cli/lib/eval/workspace-criteria.js";
import type { WorkspaceCriterion } from "../../cli/lib/schemas/workspace-evaluators.js";

let tmp: TmpRoot | undefined;
afterEach(() => {
  tmp?.cleanup();
  tmp = undefined;
});

// A clean, GEO-shaped article: 3 headings, an FAQ block, a link, ~plenty of
// short plain sentences (high reading ease), well inside the length window.
function goodArticle(): string {
  const intro = [
    "# Ralphy turns your coding agent into a content farm.",
    "",
    "Ralphy is a video studio for AI agents. It lets an agent make a video from a plain brief. The agent runs the CLI. You just chat with it.",
    "",
    "See the [docs](https://example.com/docs) for the full flow.",
    "",
    "## What is Ralphy?",
    "",
    "Ralphy is a command line tool. It drives model calls, quality gates, and renders. An agent uses it to ship content. The agent does the work. You do the review.",
    "",
    "## How does it work?",
    "",
    "You give the agent a brief. The agent picks a mode. It runs the pipeline. It renders the video. It scores the result. It ships the unit.",
    "",
    "## FAQ",
    "",
    "### How fast is a cold start?",
    "",
    "A single video renders in under eight minutes cold. That is the speed target. Most runs beat it.",
    "",
    "### Does it cost a lot?",
    "",
    "No. Text is nearly free. Video costs a few dollars. You see the estimate first.",
  ].join("\n");
  // Pad with more short plain sentences to clear the length floor.
  const body = Array.from({ length: 40 }, (_, i) => `Point ${i + 1} is short and clear and easy to read.`).join(" ");
  return `${intro}\n\n${body}\n`;
}

describe("plain-text helpers (deterministic)", () => {
  test("wordCount / headingCount / hasFaqBlock / linkCount on the good article", () => {
    const md = goodArticle();
    expect(wordCount(md)).toBeGreaterThan(100);
    expect(headingCount(md)).toBeGreaterThanOrEqual(3);
    expect(hasFaqBlock(md)).toBe(true);
    expect(linkCount(md)).toBeGreaterThanOrEqual(1);
  });

  test("fleschReadingEase rewards short simple sentences over long dense ones", () => {
    const simple = "The cat sat. The dog ran. We had fun.";
    const dense =
      "The aforementioned epistemological framework necessitates a comprehensive reconsideration of the interrelated methodological presuppositions.";
    expect(fleschReadingEase(simple)).toBeGreaterThan(fleschReadingEase(dense));
  });
});

// ─── (1) keyword-coverage ────────────────────────────────────────────────────

describe("scoreKeywordCoverage (#526)", () => {
  test("fires when coverage is below the bar", () => {
    const findings = scoreKeywordCoverage({
      body: "This article is about cooking pasta at home.",
      keywords: ["ralphy", "content farm", "ai agent"],
      minCoveragePct: 70,
    });
    expect(findings.length).toBe(1);
    expect(findings[0]!.severity).toBe("warn");
    expect(findings[0]!.category).toContain("keyword-coverage");
  });

  test("passes clean when the body covers the keywords", () => {
    const findings = scoreKeywordCoverage({
      body: "Ralphy is a content farm for an ai agent — it makes videos.",
      keywords: ["ralphy", "content farm", "ai agent"],
      minCoveragePct: 70,
    });
    expect(findings).toEqual([]);
  });

  test("no keywords supplied → an info finding (not scored)", () => {
    const findings = scoreKeywordCoverage({ body: "anything", keywords: [] });
    expect(findings[0]!.severity).toBe("info");
  });
});

// ─── (2) structure ───────────────────────────────────────────────────────────

describe("scoreStructure (#526)", () => {
  test("fires on a flat body with no headings, no FAQ, no links", () => {
    const findings = scoreStructure({ body: "Just one flat paragraph of prose with nothing else at all." });
    const cats = findings.map((f) => f.category);
    expect(cats.some((c) => c.includes("headings"))).toBe(true);
    expect(cats.some((c) => c.includes("faq"))).toBe(true);
    expect(cats.some((c) => c.includes("links"))).toBe(true);
    expect(findings.every((f) => f.severity === "warn")).toBe(true);
  });

  test("passes clean on the GEO-shaped article", () => {
    expect(scoreStructure({ body: goodArticle() })).toEqual([]);
  });
});

// ─── (3) reading-level ───────────────────────────────────────────────────────

describe("scoreReadingLevel (#526)", () => {
  test("fires on dense academic prose below the ease floor", () => {
    const dense = Array.from(
      { length: 8 },
      () =>
        "The aforementioned epistemological framework necessitates a comprehensive reconsideration of the interrelated methodological presuppositions underpinning the paradigm.",
    ).join(" ");
    const findings = scoreReadingLevel({ body: dense, minEase: 45 });
    expect(findings.length).toBe(1);
    expect(findings[0]!.category).toContain("too-dense");
  });

  test("passes clean on plain approachable prose", () => {
    expect(scoreReadingLevel({ body: goodArticle(), minEase: 45 })).toEqual([]);
  });
});

// ─── (4) length-window ───────────────────────────────────────────────────────

describe("scoreLengthWindow (#526)", () => {
  test("fires when too short", () => {
    const findings = scoreLengthWindow({ body: "Ten short words here make a tiny body indeed today.", minWords: 600 });
    expect(findings[0]!.category).toContain("too-short");
  });

  test("fires when too long", () => {
    const long = Array.from({ length: 3000 }, () => "word").join(" ");
    const findings = scoreLengthWindow({ body: long, minWords: 600, maxWords: 2500 });
    expect(findings[0]!.category).toContain("too-long");
  });

  test("passes clean inside the window", () => {
    const body = Array.from({ length: 800 }, () => "word").join(" ");
    expect(scoreLengthWindow({ body, minWords: 600, maxWords: 2500 })).toEqual([]);
  });
});

// ─── body resolution + workspace-validator wrappers ──────────────────────────

function seedProject(): { projectDir: string } {
  tmp = makeTmpRoot("ralphy-texteval");
  const projectDir = path.join(tmp.dir, "proj");
  fs.mkdirSync(projectDir, { recursive: true });
  return { projectDir };
}

function criterionCtx(projectDir: string, threshold: Record<string, unknown>): WorkspaceValidatorContext {
  return {
    criterion: { threshold } as unknown as WorkspaceCriterion,
    projectId: "text-001",
    projectDir,
    videoPath: null,
    config: { version: "1.0", criteria: [] } as never,
  };
}

describe("resolveArticleBody (#526)", () => {
  test("reads an explicit threshold.bodyFile", () => {
    const { projectDir } = seedProject();
    fs.mkdirSync(path.join(projectDir, "artifacts"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "artifacts", "draft.md"), "# Hello\n\nbody");
    const body = resolveArticleBody(projectDir, "artifacts/draft.md");
    expect(body).toContain("# Hello");
  });

  test("falls back to the first markdown under artifacts/", () => {
    const { projectDir } = seedProject();
    fs.mkdirSync(path.join(projectDir, "artifacts"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "artifacts", "article.md"), "# Auto\n\nfound me");
    expect(resolveArticleBody(projectDir, null)).toContain("found me");
  });

  test("reads the body of a formed article unit", () => {
    const { projectDir } = seedProject();
    const unitDir = path.join(projectDir, "units", "my-article");
    fs.mkdirSync(unitDir, { recursive: true });
    fs.writeFileSync(path.join(unitDir, "body.md"), "# Unit body\n\ncited");
    fs.writeFileSync(
      path.join(unitDir, "unit.json"),
      JSON.stringify({ slug: "my-article", format: "article", media: ["body.md"], article: { body: "body.md" } }),
    );
    expect(resolveArticleBody(projectDir, null)).toContain("Unit body");
  });

  test("returns null when no body exists", () => {
    const { projectDir } = seedProject();
    expect(resolveArticleBody(projectDir, null)).toBeNull();
  });
});

describe("workspace-validator wrappers (#526)", () => {
  test("the four text validators register under registerBuiltinWorkspaceValidators()", () => {
    registerBuiltinWorkspaceValidators();
    for (const id of ["text-keyword-coverage", "text-structure", "text-reading-level", "text-length-window"]) {
      expect(hasWorkspaceValidator(id)).toBe(true);
    }
  });

  test("a validator degrades to an info finding when no body is present", () => {
    const { projectDir } = seedProject();
    const findings = __testHooks.structureValidator(criterionCtx(projectDir, {}));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("info");
    expect(findings[0]!.category).toContain("no-body");
  });

  test("the structure validator fires on a flat article body in the project tree", () => {
    const { projectDir } = seedProject();
    fs.mkdirSync(path.join(projectDir, "artifacts"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "artifacts", "draft.md"), "one flat paragraph, no headings, no faq, no links");
    const findings = __testHooks.structureValidator(criterionCtx(projectDir, {}));
    expect(findings.some((f) => f.severity === "warn")).toBe(true);
  });

  test("the keyword-coverage validator reads threshold.keywords + minCoveragePct", () => {
    const { projectDir } = seedProject();
    fs.mkdirSync(path.join(projectDir, "artifacts"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "artifacts", "draft.md"), "an article about pasta and nothing about the product");
    const findings = __testHooks.keywordCoverageValidator(
      criterionCtx(projectDir, { keywords: ["ralphy", "content farm"], minCoveragePct: 70 }),
    );
    expect(findings.some((f) => f.category.includes("keyword-coverage"))).toBe(true);
  });
});
