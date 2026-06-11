// Unit tests for `ralphy memory distill` (#113) — postmortem → memory proposals.
//
// LLM is stubbed at the fetch level (NOT mock.module — see #072: module-mock
// leaks wedge the suite). Pins:
//   • candidates land in proposed/ staging of the right tier — never active
//   • --dry-run stages nothing
//   • guideline-routed candidates are surfaced but not staged
//   • idempotent re-run on the same slug versions up in proposed/
//   • missing postmortem dir raises the coded not-found error

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import { setRoot } from "../../cli/lib/paths.js";
import { distillPostmortem, NoPostmortemError } from "../../cli/lib/memory/distill.js";
import { listEntries } from "../../cli/lib/memory/store.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;
const originalCwd = process.cwd();
let tmpRoot: string;

const PROJECT = "pm-distill-001";

function llmResponse(candidates: unknown[]): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: { content: JSON.stringify({ candidates }) },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function stubLLM(candidates: unknown[]): void {
  globalThis.fetch = (async () => llmResponse(candidates)) as typeof fetch;
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-distill-"));
  setRoot(tmpRoot);
  process.env.OPENROUTER_API_KEY = "test-or-key";
  const pmDir = path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", PROJECT, "postmortem");
  fs.mkdirSync(pmDir, { recursive: true });
  fs.writeFileSync(path.join(pmDir, "02-lessons.md"), "# Lessons\n\nKling needs an explicit no-music clause.\n");
  fs.writeFileSync(path.join(pmDir, "05-workflow-fixes.md"), "# Workflow fixes\n\nSite-grounding before brand DNA.\n");
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  setRoot(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("memory distill (#113)", () => {
  test("stages tier-classified proposals; guideline-routed candidates are not staged", async () => {
    stubLLM([
      {
        slug: "kling-no-music",
        tier: "global",
        type: "craft",
        description: "Ban music in Kling prompts",
        rule: "Always ban music explicitly in Kling video prompts.",
        why: "Unprompted music collided with the ElevenLabs bed.",
        how_to_apply: "Every kling-v3.0-pro generate call.",
        does_not_apply_to: "Models without native audio.",
        route: "memory",
      },
      {
        slug: "client-rejects-neon",
        tier: "workspace",
        type: "client",
        description: "This client rejects neon grades",
        rule: "Never offer neon color grades to this client.",
        why: "Two rejected drafts in the postmortem.",
        how_to_apply: "Any grade/look proposal for this workspace.",
        does_not_apply_to: "Explicit user requests for neon.",
        route: "memory",
      },
      {
        slug: "vhs-noise-stack",
        tier: "global",
        type: "craft",
        description: "VHS noise overlay recipe",
        rule: "Use the layered VHS-noise ffmpeg stack for analog looks.",
        why: "Reusable artifact.",
        how_to_apply: "Analog-horror compositions.",
        does_not_apply_to: "Clean modern registers.",
        route: "guideline",
      },
    ]);

    const r = await distillPostmortem({ projectId: PROJECT });
    expect(r.sources).toEqual(["02-lessons.md", "05-workflow-fixes.md"]);
    expect(r.candidates.map((c) => c.slug)).toEqual(["kling-no-music", "client-rejects-neon"]);
    expect(r.routedToGuideline.map((c) => c.slug)).toEqual(["vhs-noise-stack"]);
    expect(r.staged).toHaveLength(2);

    // Right tiers, proposed/ only — nothing active.
    const globalProposed = await listEntries({ tier: "global" }, "proposed");
    expect(globalProposed.map((e) => e.slug)).toEqual(["kling-no-music"]);
    const wsProposed = await listEntries({ tier: "workspace", ws: "default" }, "proposed");
    expect(wsProposed.map((e) => e.slug)).toEqual(["client-rejects-neon"]);
    expect(await listEntries({ tier: "global" }, "active")).toHaveLength(0);

    // Body carries the negative-scope discipline + provenance.
    expect(globalProposed[0]!.body).toContain("**Does NOT apply to:** Models without native audio.");
    expect(globalProposed[0]!.source).toContain(`distill:${PROJECT}/postmortem`);
  });

  test("--dry-run prints candidates and stages nothing", async () => {
    stubLLM([
      {
        slug: "some-rule",
        tier: "global",
        type: "tooling",
        description: "d",
        rule: "Some durable rule.",
        why: "w",
        how_to_apply: "h",
        does_not_apply_to: "n",
        route: "memory",
      },
    ]);
    const r = await distillPostmortem({ projectId: PROJECT, dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.candidates).toHaveLength(1);
    expect(r.staged).toHaveLength(0);
    expect(await listEntries({ tier: "global" }, "proposed")).toHaveLength(0);
  });

  test("re-distilling the same slug versions up in proposed/ (idempotent, no overwrite)", async () => {
    const candidate = {
      slug: "same-lesson",
      tier: "global",
      type: "craft",
      description: "d",
      rule: "Same lesson, run twice.",
      why: "w",
      how_to_apply: "h",
      does_not_apply_to: "n",
      route: "memory",
    };
    stubLLM([candidate]);
    const r1 = await distillPostmortem({ projectId: PROJECT });
    stubLLM([candidate]);
    const r2 = await distillPostmortem({ projectId: PROJECT });
    expect(r1.staged[0]!.file).toBe("same-lesson.md");
    expect(r2.staged[0]!.file).toBe("same-lesson.v2.md");
    expect(fs.existsSync(r1.staged[0]!.path)).toBe(true); // v1 untouched
  });

  test("missing postmortem dir raises the coded not-found error", async () => {
    stubLLM([]);
    expect(distillPostmortem({ projectId: "no-such-project" })).rejects.toThrow(NoPostmortemError);
  });

  test("malformed candidates are dropped, invalid slugs auto-derived", async () => {
    stubLLM([
      { slug: "NOT a slug!!", tier: "global", type: "weird-type", rule: "Rule with bad slug and type." },
      { tier: "global", type: "craft" }, // no rule → dropped
    ]);
    const r = await distillPostmortem({ projectId: PROJECT, dryRun: true });
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]!.slug).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    expect(r.candidates[0]!.type).toBe("craft"); // unknown type falls back
  });
});
