// Unit tests for `ralphy lessons route` (#425) — the failure-lessons router.
//
// LLM is stubbed at the fetch level (NOT mock.module — see #072). Pins:
//   • the 8-way route enum is honored; an unknown route collapses to "drop"
//   • memory/guideline proposals carry the mandatory negative scope
//   • ONLY route=memory stages into proposed/ (the right tier); no other route writes
//   • an overlapping live memory slug is flagged as existingSlug
//   • --dry-run stages nothing
//   • all best-effort inputs (postmortem + eval + gen-log error rows) are assembled

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import { setRoot } from "../../cli/lib/paths.js";
import { routeFailureLessons, NoLessonSourcesError } from "../../cli/lib/lessons/router.js";
import { listEntries, writeEntry } from "../../cli/lib/memory/store.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;
const originalCwd = process.cwd();
let tmpRoot: string;

const PROJECT = "lessons-001";

function stubLLM(proposals: unknown[]): void {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ proposals }) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-lessons-"));
  setRoot(tmpRoot);
  process.env.OPENROUTER_API_KEY = "test-or-key";
  const projDir = path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", PROJECT);
  fs.mkdirSync(path.join(projDir, "postmortem"), { recursive: true });
  fs.mkdirSync(path.join(projDir, "logs"), { recursive: true });
  fs.writeFileSync(path.join(projDir, "postmortem", "02-lessons.md"), "# Lessons\n\nKling needs an explicit no-music clause.\n");
  fs.writeFileSync(path.join(projDir, "eval.json"), JSON.stringify({ findings: [{ id: "f1", category: "audio.loudness", message: "too quiet" }] }));
  // Two failed model calls + one ok row (the ok row must be ignored).
  const rows = [
    { timestamp: "t", provider: "openrouter", endpoint: "ep", model: "m", kind: "video", input: { slot: "scene-01" }, status: "error", error: "moderation", failureClass: "moderation" },
    { timestamp: "t", provider: "openrouter", endpoint: "ep", model: "m", kind: "image", input: { slot: "scene-02" }, status: "ok" },
  ];
  fs.writeFileSync(path.join(projDir, "logs", "generations.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  setRoot(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("lessons route (#425)", () => {
  test("classifies into the 8-way enum; stages only memory; carries negative scope; no other route writes", async () => {
    stubLLM([
      {
        route: "memory",
        title: "Ban music in Kling prompts",
        detail: "Always ban music explicitly in kling-v3.0-pro prompts.",
        provenance: "lessons-001 / 02-lessons.md",
        confidence: "high",
        does_not_apply_to: "Models without native audio.",
        tier: "global",
        slug: "kling-no-music",
      },
      {
        route: "guideline",
        title: "Anti-slop image cluster",
        detail: "Add the anti-AI-slop negative cluster.",
        provenance: "lessons-001 / eval.json",
        confidence: "medium",
        does_not_apply_to: "Stylized cartoon registers.",
        slug: "anti-slop-cluster",
      },
      {
        route: "MODELS.md",
        title: "Seedance blocks photoreal human anchors",
        detail: "Route human i2v to kling.",
        provenance: "lessons-001 / generations.jsonl error rows",
        confidence: "high",
      },
      {
        route: "cli-issue",
        title: "generate skipped a slot silently",
        detail: "File a CLI gap.",
        provenance: "lessons-001 / repair-plan.json",
        confidence: "low",
      },
      // Unknown route → drop.
      { route: "totally-made-up", title: "Should collapse to drop", detail: "", provenance: "x", confidence: "low" },
    ]);

    const r = await routeFailureLessons({ projectId: PROJECT });

    // Inputs assembled best-effort (postmortem + eval + error rows).
    expect(r.sources).toContain("postmortem/02-lessons.md");
    expect(r.sources).toContain("eval.json");
    expect(r.sources).toContain("generations.jsonl (error rows)");

    // All five proposals present; the unknown route collapsed to drop.
    expect(r.proposals).toHaveLength(5);
    expect(r.proposals.find((p) => p.title === "Should collapse to drop")!.route).toBe("drop");
    expect(new Set(r.proposals.map((p) => p.route))).toEqual(
      new Set(["memory", "guideline", "MODELS.md", "cli-issue", "drop"]),
    );

    // Negative scope present on memory + guideline; absent on the others.
    expect(r.proposals.find((p) => p.route === "memory")!.does_not_apply_to).toBe("Models without native audio.");
    expect(r.proposals.find((p) => p.route === "guideline")!.does_not_apply_to).toBe("Stylized cartoon registers.");
    expect(r.proposals.find((p) => p.route === "MODELS.md")!.does_not_apply_to).toBeUndefined();

    // ONLY the memory proposal staged, into the global proposed/ tier.
    expect(r.staged).toHaveLength(1);
    const globalProposed = await listEntries({ tier: "global" }, "proposed");
    expect(globalProposed.map((e) => e.slug)).toEqual(["kling-no-music"]);
    expect(globalProposed[0]!.body).toContain("**Does NOT apply to:** Models without native audio.");
    expect(globalProposed[0]!.source).toContain(`lessons:${PROJECT}`);

    // No guideline / MODELS.md / cli-issue artifact was written anywhere.
    expect(fs.existsSync(path.join(tmpRoot, "guidelines", "anti-slop-cluster"))).toBe(false);
    expect(await listEntries({ tier: "global" }, "active")).toHaveLength(0);
  });

  test("flags an overlapping existing memory slug for re-note", async () => {
    // Seed an active memory entry the new proposal overlaps.
    await writeEntry({
      text: "Kling prompts must ban music explicitly.",
      ref: { tier: "global" },
      status: "active",
      slug: "kling-music-ban",
      description: "Kling music ban",
    });
    stubLLM([
      {
        route: "memory",
        title: "Kling music ban (refined)",
        detail: "Ban music in kling prompts.",
        provenance: "lessons-001 / 02-lessons.md",
        confidence: "high",
        does_not_apply_to: "Models without native audio.",
        tier: "global",
        slug: "kling-music-ban",
      },
    ]);
    const r = await routeFailureLessons({ projectId: PROJECT, dryRun: true });
    expect(r.proposals[0]!.existingSlug).toBe("kling-music-ban");
  });

  test("--dry-run stages nothing", async () => {
    stubLLM([
      {
        route: "memory",
        title: "A durable rule",
        detail: "Do the thing.",
        provenance: "lessons-001 / 02-lessons.md",
        confidence: "high",
        does_not_apply_to: "n",
        tier: "global",
        slug: "a-durable-rule",
      },
    ]);
    const r = await routeFailureLessons({ projectId: PROJECT, dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.proposals).toHaveLength(1);
    expect(r.staged).toHaveLength(0);
    expect(await listEntries({ tier: "global" }, "proposed")).toHaveLength(0);
  });

  test("no lesson sources raises the coded not-found error", async () => {
    stubLLM([]);
    expect(routeFailureLessons({ projectId: "no-such-project" })).rejects.toThrow(NoLessonSourcesError);
  });
});
