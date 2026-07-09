// Reference SEO-article graph runs headless through the runner (#526).
//
// The article production route — research (generate-object) -> outline
// (generate-text) -> draft (generate-text) -> ralphy-eval (the deterministic
// text-structure gate) -> gate -> ralphy-unit (format article) — executes end to
// end with ZERO network and ZERO paid calls:
//   • research / outline / draft are MOCKED via deps.executorOverrides (the draft
//     mock writes the article body into the project tree, the way a real
//     generate-text would land its artifact — here into <project>/artifacts/).
//   • ralphy-eval / gate / ralphy-unit are the REAL registered executors, so the
//     deterministic text-quality validator, the gate verdict, and article-unit
//     formation are all exercised for real.
//
// tmp-root + env/cwd hygiene per #545: an isolated makeTmpRoot(), no process.env
// / process.chdir mutation. English-only on disk.

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, runDir } from "../../cli/lib/paths.js";
import { fireTick } from "../../cli/lib/farm/runner.js";
import { parseWorkflowGraph } from "../../cli/lib/schemas/workflow.js";
import type { NodeExecutor } from "../../cli/lib/workflow/executors/types.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const WS = "test";
const PROJECT = "seo-article-graph-526";

let tmp: TmpRoot | undefined;
afterEach(() => {
  tmp?.cleanup();
  tmp = undefined;
});

function readEvents(runId: string): Array<Record<string, unknown>> {
  const p = path.join(runDir(WS, runId), "run-events.jsonl");
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}
function completedOrder(runId: string): string[] {
  return readEvents(runId)
    .filter((e) => e.kind === "node-completed")
    .map((e) => String(e.node));
}

/** A GEO-shaped article body: 3+ headings, an FAQ block, a link, plain prose. */
function articleBody(): string {
  const lines = [
    "# Ralphy turns your coding agent into a content farm",
    "",
    "Ralphy is a video studio for AI agents. It makes a video from a plain brief. See the [docs](https://example.com).",
    "",
    "## What is it",
    "",
    "Ralphy is a CLI. It drives model calls and gates. An agent uses it to ship content.",
    "",
    "## How it works",
    "",
    "You give a brief. The agent picks a mode. It renders and scores. It ships the unit.",
    "",
    "## FAQ",
    "",
    "### How fast is it",
    "",
    "A single video renders in under eight minutes cold. Most runs beat the target.",
  ].join("\n");
  const pad = Array.from({ length: 40 }, (_, i) => `Point ${i + 1} is short and clear and easy to read.`).join(" ");
  return `${lines}\n\n${pad}\n`;
}

function seed(): { projDir: string } {
  tmp = makeTmpRoot("ralphy-seo-article");
  const dir = workspaceDir(WS);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ slug: WS }));
  // A workspace rubric with ONE deterministic text criterion (zero model calls).
  fs.writeFileSync(
    path.join(dir, "evaluators.json"),
    JSON.stringify({
      version: "1.0",
      criteria: [
        {
          id: "article-structure",
          label: "Article structure",
          category: "structure",
          check: "deterministic",
          validatorId: "text-structure",
          severity: "warn",
          threshold: { minHeadings: 3, requireFaq: true, minLinks: 1 },
        },
      ],
    }),
  );
  const projDir = path.join(dir, "projects", PROJECT);
  fs.mkdirSync(path.join(projDir, "artifacts"), { recursive: true });
  return { projDir };
}

describe("reference SEO-article graph runs headless with mocked LLM (#526)", () => {
  test("research -> outline -> draft -> eval -> gate -> unit, ZERO paid calls", async () => {
    const { projDir } = seed();

    const graph = parseWorkflowGraph(
      JSON.parse(fs.readFileSync(path.join(REPO, "tests", "fixtures", "workflow-graph-seo-article.json"), "utf8")),
    );

    // Mocked LLM seams — no network. The draft mock writes the article body into
    // the project tree so the real text-quality validator + ralphy-unit --from
    // can pick it up (mirrors how a real generate-text lands its artifact).
    const research: NodeExecutor = async () => ({ output: { topic: "ralphy", keywords: ["ralphy", "content farm"] } });
    const outline: NodeExecutor = async () => ({ output: "# heading\n## FAQ\n" });
    const draft: NodeExecutor = async () => {
      fs.writeFileSync(path.join(projDir, "artifacts", "article.md"), articleBody());
      return { output: path.join(projDir, "artifacts", "article.md") };
    };

    const draftOrOutline: NodeExecutor = async (node, ctx) => {
      // generate-text is used by BOTH outline and draft — dispatch by node id.
      if (node.id === "draft") return draft(node, ctx);
      return outline(node, ctx);
    };

    const outcome = await fireTick(WS, "seo-article", graph, {
      sleep: async () => {},
      executorOverrides: { "generate-object": research, "generate-text": draftOrOutline },
    });

    expect(outcome.status).toBe("complete");
    expect(completedOrder(outcome.runId)).toEqual([
      "tick",
      "research",
      "outline",
      "draft",
      "score",
      "quality",
      "unit",
    ]);

    // The eval verdict rode the journal (a clean article → ship).
    const evalEvent = readEvents(outcome.runId).find((e) => e.kind === "node-completed" && e.node === "score");
    expect((evalEvent?.output as { verdict?: string })?.verdict).toBe("ship");

    // The article unit was formed with the article format + body.
    const manifest = JSON.parse(fs.readFileSync(path.join(projDir, "units", "ralphy-article", "unit.json"), "utf8"));
    expect(manifest.format).toBe("article");
    expect(manifest.media).toContain("article.md");
    expect(manifest.article?.body).toBe("article.md");
    expect(fs.existsSync(path.join(projDir, "units", "ralphy-article", "article.md"))).toBe(true);
  });
});
