// #515 — prompt-pack lint + guideline folding.
//
// Covers, per the issue's acceptance list:
//   • each seed rule fires on a violating fixture and stays quiet on a clean
//     one (pure lintPromptText — char cap READ from the #445 constraints
//     table, kling no-music clause, ElevenLabs artist-name detector,
//     photoreal negative cluster),
//   • the workflow scan: issues name the file, the rule, and the fix;
//     unknown `params.guidelines` slug = lint error; `lintWorkflowFile`
//     surfaces prompt issues in the same errors/warnings arrays,
//   • export refuses on error-level violations (`prompt-lint-error` gap),
//   • folding: the resolved prompt reaches the connector with the STYLE RULES
//     block appended AND is journaled (gen-log via ctx.log outside a run,
//     run-events.jsonl inside one); voiceover text is NEVER folded; an
//     unknown slug at execution is a structured failure.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, projectDir, runDir } from "../../cli/lib/paths.js";
import { createRun } from "../../cli/lib/run.js";
import {
  PROMPT_LINT_RULES,
  lintPromptText,
  lintGraphPrompts,
  lintWorkspacePrompts,
} from "../../cli/lib/prompt-lint.js";
import { foldGuidelinesIntoPrompt, guidelineFoldHeader, loadGuideline } from "../../cli/lib/guidelines.js";
import { lintWorkflowFile } from "../../cli/lib/workflow-graph.js";
import { parseWorkflowGraph } from "../../cli/lib/schemas/workflow.js";
import { exportReadiness, exportWorkspaceBundle, BundleError } from "../../cli/lib/bundle.js";
import {
  getExecutor,
  NodeExecutionError,
  type ExecutorContext,
  type ExecutorLogEntry,
} from "../../cli/lib/workflow/executors/index.js";
import type { WorkflowNode, WorkflowNodeType } from "../../cli/lib/schemas/workflow.js";
import type {
  GenerateImageInput,
  GenerateResult,
  GenerateVoiceoverInput,
  RalphyConnector,
} from "../../cli/lib/providers/types.js";

const WS = "test";
const PROJECT = "prompt-001";
const KLING = "kwaivgi/kling-v3.0-pro";

let tmp: TmpRoot;

beforeEach(() => {
  tmp = makeTmpRoot("prompt-lint");
  const ws = workspaceDir(WS);
  fs.mkdirSync(path.join(ws, "projects", PROJECT, "artifacts", "refs"), { recursive: true });
  fs.mkdirSync(path.join(ws, "workflows"), { recursive: true });
  fs.mkdirSync(path.join(ws, "prompts"), { recursive: true });
  fs.writeFileSync(path.join(ws, "workspace.json"), JSON.stringify({ slug: WS }));
});

afterEach(() => {
  tmp?.cleanup();
});

/** Seed a guideline under the tmp root's guidelines/ tree. */
function seedGuideline(slug: string, opts: { tags?: string[]; body?: string } = {}): void {
  const dir = path.join(tmp.dir, "guidelines", slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "guideline.json"),
    JSON.stringify({ slug, name: slug, kind: "image-prompt", tags: opts.tags ?? [] }),
  );
  fs.writeFileSync(path.join(dir, "guideline.md"), opts.body ?? `# ${slug}\n\nAlways name a real camera and lens.\n`);
}

// ─── Seed rule table invariants ──────────────────────────────────────────────

describe("PROMPT_LINT_RULES table (#515)", () => {
  test("every rule carries a mandatory non-empty source citation", () => {
    for (const rule of PROMPT_LINT_RULES) {
      expect(rule.source.length, `rule ${rule.id} must cite its origin`).toBeGreaterThan(10);
    }
  });

  test("the kling char cap is NOT duplicated here — it reads the #445 table", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "cli", "lib", "prompt-lint.ts"), "utf-8");
    expect(src).not.toMatch(/\b2500\b/);
  });
});

// ─── Rule: model-prompt-char-cap ─────────────────────────────────────────────

describe("model-prompt-char-cap (via the #445 constraints table)", () => {
  const over = "x".repeat(2501);
  const under = "x".repeat(2500);

  test("fires on a kling video prompt over the cap", () => {
    const findings = lintPromptText(over, { kind: "video", model: KLING, photoreal: false });
    const f = findings.find((x) => x.rule === "model-prompt-char-cap");
    expect(f).toBeDefined();
    expect(f!.level).toBe("error");
    expect(f!.message).toMatch(/2500/);
  });

  test("stays quiet at exactly the cap", () => {
    const findings = lintPromptText(under, { kind: "video", model: KLING, photoreal: false });
    expect(findings.find((x) => x.rule === "model-prompt-char-cap")).toBeUndefined();
  });

  test("stays quiet for a model with no cap in the table", () => {
    const findings = lintPromptText(over, {
      kind: "video",
      model: "bytedance/seedance-2.0",
      photoreal: false,
    });
    expect(findings.find((x) => x.rule === "model-prompt-char-cap")).toBeUndefined();
  });
});

// ─── Rule: kling-vo-music-ban ────────────────────────────────────────────────

describe("kling-vo-music-ban", () => {
  const voPrompt = 'The host looks into the camera and says "this changed everything for me".';

  test("warns when a kling VO prompt has no no-music clause", () => {
    const findings = lintPromptText(voPrompt, { kind: "video", model: KLING, photoreal: false });
    const f = findings.find((x) => x.rule === "kling-vo-music-ban");
    expect(f).toBeDefined();
    expect(f!.level).toBe("warning");
  });

  test("stays quiet when the ban clause is present", () => {
    const findings = lintPromptText(`${voPrompt} No background music, only diegetic SFX.`, {
      kind: "video",
      model: KLING,
      photoreal: false,
    });
    expect(findings.find((x) => x.rule === "kling-vo-music-ban")).toBeUndefined();
  });

  test("stays quiet on a non-kling model and on a speechless prompt", () => {
    expect(
      lintPromptText(voPrompt, { kind: "video", model: "google/veo-3.1", photoreal: false }).find(
        (x) => x.rule === "kling-vo-music-ban",
      ),
    ).toBeUndefined();
    expect(
      lintPromptText("Slow dolly through an empty fog-lit corridor.", {
        kind: "video",
        model: KLING,
        photoreal: false,
      }).find((x) => x.rule === "kling-vo-music-ban"),
    ).toBeUndefined();
  });
});

// ─── Rule: elevenlabs-music-artist-name ──────────────────────────────────────

describe("elevenlabs-music-artist-name", () => {
  const ctx = { kind: "music" as const, model: undefined, photoreal: false };

  test('errors on "in the style of <Proper Noun>"', () => {
    const f = lintPromptText("Epic orchestral score in the style of Hans Zimmer", ctx).find(
      (x) => x.rule === "elevenlabs-music-artist-name",
    );
    expect(f).toBeDefined();
    expect(f!.level).toBe("error");
    expect(f!.message).toMatch(/bad_prompt/);
  });

  test('errors on "<Proper Noun> type beat" and on a #006 known name', () => {
    expect(
      lintPromptText("Overwerk type beat, heavy sidechain", ctx).find(
        (x) => x.rule === "elevenlabs-music-artist-name" && x.level === "error",
      ),
    ).toBeDefined();
    expect(
      lintPromptText("dark trap, drake vibes, 808 sub", ctx).find(
        (x) => x.rule === "elevenlabs-music-artist-name" && x.level === "error",
      ),
    ).toBeDefined();
  });

  test('downgrades the ambiguous "like <Proper Noun>" shape to a warning', () => {
    const f = lintPromptText("hazy downtempo like Tycho sunset sets", ctx).find(
      (x) => x.rule === "elevenlabs-music-artist-name",
    );
    expect(f).toBeDefined();
    expect(f!.level).toBe("warning");
  });

  test("stays quiet on genre + tempo + instrumentation prompts", () => {
    for (const clean of [
      "dark ambient drone, 60 bpm, analog synth pads, tape hiss, instrumental",
      "in the style of lo-fi hip hop, dusty drums, mellow keys",
    ]) {
      expect(
        lintPromptText(clean, ctx).find((x) => x.rule === "elevenlabs-music-artist-name"),
      ).toBeUndefined();
    }
  });
});

// ─── Rule: photoreal-negative-cluster ────────────────────────────────────────

describe("photoreal-negative-cluster", () => {
  const bare = "Portrait of a barista behind the counter, warm window light, Sony A7 IV, 85mm.";

  test("warns on a photoreal-tagged prompt with no negative cluster", () => {
    const f = lintPromptText(bare, { kind: "image", model: undefined, photoreal: true }).find(
      (x) => x.rule === "photoreal-negative-cluster",
    );
    expect(f).toBeDefined();
    expect(f!.level).toBe("warning");
  });

  test("stays quiet with a ban clause present, and on untagged prompts", () => {
    expect(
      lintPromptText(`${bare} No beauty filter, no skin smoothing.`, {
        kind: "image",
        model: undefined,
        photoreal: true,
      }).find((x) => x.rule === "photoreal-negative-cluster"),
    ).toBeUndefined();
    expect(
      lintPromptText(bare, { kind: "image", model: undefined, photoreal: false }).find(
        (x) => x.rule === "photoreal-negative-cluster",
      ),
    ).toBeUndefined();
  });
});

// ─── Workflow scan ───────────────────────────────────────────────────────────

function writeWorkflow(name: string, nodes: unknown[]): string {
  const file = path.join(workspaceDir(WS), "workflows", `${name}.json`);
  fs.writeFileSync(file, JSON.stringify({ version: "2.0", name, nodes }, null, 2));
  return file;
}

describe("lintGraphPrompts / lintWorkflowFile integration", () => {
  test("a prompt_file violation names the file, the rule, and the fix", () => {
    fs.writeFileSync(path.join(workspaceDir(WS), "prompts", "long.md"), "y".repeat(2600));
    const file = writeWorkflow("episode", [
      {
        id: "clip",
        type: "t2v",
        params: { model: KLING, prompt_file: "prompts/long.md", durationSec: 5 },
      },
    ]);
    const lint = lintWorkflowFile(file, WS);
    expect(lint.ok).toBe(false);
    const issue = lint.errors.find((e) => e.code === "prompt-rule");
    expect(issue).toBeDefined();
    expect(issue!.file).toBe("prompts/long.md");
    expect(issue!.rule).toBe("model-prompt-char-cap");
    expect(issue!.fix.length).toBeGreaterThan(10);
    expect(issue!.node).toBe("clip");
  });

  test("unknown params.guidelines slug is a lint error; a real slug is clean", () => {
    seedGuideline("real-style");
    const graph = parseWorkflowGraph({
      name: "g",
      nodes: [
        { id: "a", type: "t2i", params: { prompt: "no gloss, avoid slop", guidelines: ["real-style"] } },
        { id: "b", type: "t2i", params: { prompt: "no gloss, avoid slop", guidelines: ["nope"] } },
      ],
    });
    const issues = lintGraphPrompts(graph, { workspace: WS });
    const unknown = issues.filter((i) => i.code === "unknown-guideline");
    expect(unknown).toHaveLength(1);
    expect(unknown[0]!.level).toBe("error");
    expect(unknown[0]!.node).toBe("b");
    expect(unknown[0]!.message).toMatch(/"nope"/);
  });

  test("a photoreal-tagged guideline drives the negative-cluster rule", () => {
    seedGuideline("photoreal-x", { tags: ["photoreal"] });
    const graph = parseWorkflowGraph({
      name: "g",
      nodes: [
        {
          id: "hero",
          type: "t2i",
          params: { prompt: "Portrait, warm light, 85mm.", guidelines: ["photoreal-x"] },
        },
      ],
    });
    const issues = lintGraphPrompts(graph, { workspace: WS });
    expect(issues.find((i) => i.rule === "photoreal-negative-cluster")).toBeDefined();
  });

  test("a wired prompt in-port has no static text — skipped, not flagged", () => {
    const graph = parseWorkflowGraph({
      name: "g",
      nodes: [
        { id: "script", type: "generate-text", params: { prompt: "write it" }, out: "script" },
        {
          id: "clip",
          type: "t2v",
          in: { prompt: "script.script" },
          params: { model: KLING, durationSec: 5 },
        },
      ],
    });
    expect(lintGraphPrompts(graph, { workspace: WS })).toHaveLength(0);
  });

  test("ralphy-generate nodes lint by their params.kind", () => {
    const graph = parseWorkflowGraph({
      name: "g",
      nodes: [
        {
          id: "bed",
          type: "ralphy-generate",
          params: { kind: "music", slot: "bed", prompt: "in the style of Hans Zimmer", duration: 30 },
        },
      ],
    });
    const issues = lintGraphPrompts(graph, { workspace: WS });
    expect(issues.find((i) => i.rule === "elevenlabs-music-artist-name")).toBeDefined();
  });

  test("lintWorkspacePrompts aggregates per-workflow counts", () => {
    fs.writeFileSync(path.join(workspaceDir(WS), "prompts", "long.md"), "y".repeat(2600));
    writeWorkflow("episode", [
      { id: "clip", type: "t2v", params: { model: KLING, prompt_file: "prompts/long.md", durationSec: 5 } },
    ]);
    writeWorkflow("clean", [
      { id: "still", type: "t2i", params: { prompt: "clean poster, no gloss" } },
    ]);
    const result = lintWorkspacePrompts(WS);
    expect(result.ok).toBe(false);
    expect(result.errorCount).toBe(1);
    expect(result.workflows.map((w) => w.workflow).sort()).toEqual(["clean", "episode"]);
  });
});

// ─── Export refusal (#502 readiness gap) ─────────────────────────────────────

describe("workspace export refuses on error-level prompt-lint violations", () => {
  function seedExportWorkspace(prompt: string): void {
    const ws = workspaceDir(WS);
    fs.writeFileSync(
      path.join(ws, "evaluators.json"),
      JSON.stringify({ criteria: [{ id: "hook", label: "Hook", category: "retention", check: "deterministic" }] }),
    );
    writeWorkflow("episode", [
      {
        id: "clip",
        type: "t2v",
        params: { model: KLING, provider: "openrouter", prompt, durationSec: 5 },
      },
    ]);
  }

  test("exportReadiness surfaces a prompt-lint-error gap naming the rule", () => {
    seedExportWorkspace("z".repeat(2600));
    const readiness = exportReadiness(WS);
    expect(readiness.ok).toBe(false);
    const gap = readiness.gaps.find((g) => g.id === "prompt-lint-error");
    expect(gap).toBeDefined();
    expect(gap!.detail).toMatch(/model-prompt-char-cap/);
    expect(readiness.gaps.find((g) => g.id === "no-graph-workflow")).toBeUndefined();
  });

  test.skipIf(!Bun.which("zip"))("exportWorkspaceBundle throws not-ready", () => {
    seedExportWorkspace("z".repeat(2600));
    const out = path.join(tmp.dir, "bundle.zip");
    expect(() => exportWorkspaceBundle(WS, out)).toThrow(BundleError);
    try {
      exportWorkspaceBundle(WS, out);
    } catch (e) {
      expect((e as BundleError).code).toBe("not-ready");
    }
  });

  test("warn-level findings do NOT refuse export", () => {
    // kling VO prompt without a music ban → warning only.
    seedExportWorkspace('She says "take the deal tonight" straight to camera.');
    const readiness = exportReadiness(WS);
    expect(readiness.gaps.find((g) => g.id === "prompt-lint-error")).toBeUndefined();
    expect(readiness.ok).toBe(true);
  });
});

// ─── Guideline folding at execution (#511/#512 shared path) ──────────────────

type TestCtx = ExecutorContext & { logs: ExecutorLogEntry[] };

function makeCtx(over: Partial<ExecutorContext> = {}): TestCtx {
  const logs: ExecutorLogEntry[] = [];
  return {
    workspace: WS,
    workspaceDir: workspaceDir(WS),
    projectId: PROJECT,
    artifactsDir: path.join(tmp.dir, "run-artifacts"),
    inputs: {},
    log: async (e) => {
      logs.push(e);
    },
    reportCost: () => {},
    logs,
    ...over,
  };
}

function makeNode(type: WorkflowNodeType, params: Record<string, unknown>): WorkflowNode {
  return {
    id: "n1",
    type,
    in: {},
    params,
    retry: { max: 0, backoff: "exponential" },
    on_fail: "halt",
    cache: "none",
    emit: true,
  };
}

function mockConnector(): {
  connector: RalphyConnector;
  calls: { image: GenerateImageInput[]; voice: GenerateVoiceoverInput[] };
} {
  const calls = { image: [] as GenerateImageInput[], voice: [] as GenerateVoiceoverInput[] };
  const emit = (kind: string, slot: string, ext: string): GenerateResult => {
    const dir = path.join(projectDir(PROJECT), "artifacts", kind);
    fs.mkdirSync(dir, { recursive: true });
    const localPath = path.join(dir, `${slot}${ext}`);
    fs.writeFileSync(localPath, "bytes");
    return { localPath, costUsd: 0.01, latencyMs: 5, model: "mock/model" };
  };
  const connector = {
    id: "mock",
    label: "Mock",
    envVar: "MOCK_KEY",
    signupUrl: "",
    capabilities: ["image", "voice"],
    available: () => true,
    generateImage: async (input: GenerateImageInput) => {
      calls.image.push(input);
      return emit("images", input.slot, ".png");
    },
    generateVoiceover: async (input: GenerateVoiceoverInput) => {
      calls.voice.push(input);
      return emit("voiceover", input.slot, ".mp3");
    },
  } as unknown as RalphyConnector;
  return { connector, calls };
}

function run(node: WorkflowNode, ctx: ExecutorContext) {
  const exec = getExecutor(node.type);
  if (!exec) throw new Error(`no executor for ${node.type}`);
  return exec(node, ctx);
}

describe("guideline folding (#515)", () => {
  test("foldGuidelinesIntoPrompt appends delimited STYLE RULES blocks in order", () => {
    seedGuideline("a-style", { body: "Rule A." });
    seedGuideline("b-style", { body: "Rule B." });
    const folded = foldGuidelinesIntoPrompt("hero shot", [
      loadGuideline("a-style")!,
      loadGuideline("b-style")!,
    ]);
    expect(folded.startsWith("hero shot\n\n")).toBe(true);
    expect(folded.indexOf(guidelineFoldHeader("a-style"))).toBeLessThan(
      folded.indexOf(guidelineFoldHeader("b-style")),
    );
    expect(folded).toContain("Rule A.");
    expect(folded).toContain("Rule B.");
  });

  test("t2i folds the guideline into the connector prompt and journals it via ctx.log", async () => {
    seedGuideline("test-style", { body: "Always name a real camera and lens." });
    const { connector, calls } = mockConnector();
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    await run(makeNode("t2i", { slot: "hero", prompt: "hero shot", guidelines: ["test-style"] }), ctx);

    expect(calls.image).toHaveLength(1);
    const sent = calls.image[0]!.prompt;
    expect(sent).toContain("hero shot");
    expect(sent).toContain(guidelineFoldHeader("test-style"));
    expect(sent).toContain("Always name a real camera and lens.");

    // Journaled for reproducibility (gen-log path outside a farm run).
    const fold = ctx.logs.find((e) => e.endpoint === "guideline-fold");
    expect(fold).toBeDefined();
    expect((fold!.output as { resolvedPrompt: string }).resolvedPrompt).toBe(sent);
    // The source prompt stays clean — nothing under prompts/ was written.
    expect(fs.readdirSync(path.join(workspaceDir(WS), "prompts"))).toHaveLength(0);
  });

  test("inside a farm run the resolved prompt lands in run-events.jsonl", async () => {
    seedGuideline("test-style");
    await createRun({ id: "fold-run", workspace: WS, title: "fold run" });
    const { connector, calls } = mockConnector();
    const ctx = makeCtx({
      resolveMediaConnector: () => connector,
      runId: "fold-run",
      runDir: runDir(WS, "fold-run"),
    });
    await run(makeNode("t2i", { slot: "hero", prompt: "hero shot", guidelines: ["test-style"] }), ctx);

    const events = fs
      .readFileSync(path.join(runDir(WS, "fold-run"), "run-events.jsonl"), "utf-8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const resolved = events.find((e) => e.kind === "prompt-resolved");
    expect(resolved).toBeDefined();
    expect(resolved.node).toBe("n1");
    expect(resolved.guidelines).toEqual(["test-style"]);
    expect(resolved.resolvedPrompt).toBe(calls.image[0]!.prompt);
  });

  test("ralphy-generate folds prompts but NEVER voiceover text", async () => {
    seedGuideline("test-style");
    const { connector, calls } = mockConnector();
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    await run(
      makeNode("ralphy-generate", {
        kind: "image",
        slot: "poster",
        prompt: "poster shot",
        guidelines: ["test-style"],
      }),
      ctx,
    );
    expect(calls.image[0]!.prompt).toContain(guidelineFoldHeader("test-style"));

    await run(
      makeNode("ralphy-generate", {
        kind: "voiceover",
        slot: "vo",
        text: "Hello there, welcome back.",
        voice: "v1",
        guidelines: ["test-style"],
      }),
      ctx,
    );
    expect(calls.voice[0]!.text).toBe("Hello there, welcome back.");
  });

  test("an unknown slug at execution is a structured guideline-unknown failure", async () => {
    const { connector, calls } = mockConnector();
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    const node = makeNode("t2i", { slot: "hero", prompt: "hero shot", guidelines: ["missing"] });
    await expect(run(node, ctx)).rejects.toThrow(NodeExecutionError);
    await expect(run(node, ctx)).rejects.toThrow(/unknown guideline "missing"/);
    expect(calls.image).toHaveLength(0); // failed BEFORE any paid call
  });

  test("no guidelines param → prompt passes through untouched, nothing journaled", async () => {
    const { connector, calls } = mockConnector();
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    await run(makeNode("t2i", { slot: "hero", prompt: "plain shot" }), ctx);
    expect(calls.image[0]!.prompt).toBe("plain shot");
    expect(ctx.logs.find((e) => e.endpoint === "guideline-fold")).toBeUndefined();
  });
});
