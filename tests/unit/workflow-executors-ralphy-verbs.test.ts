// Ralphy-verb node executors (#511) — zero-network unit tests.
//
// Mock seams (all established): ctx.resolveMediaConnector replaces the
// provider registry for ralphy-generate; ctx.hyperframesRender replaces the
// `bunx hyperframes render` spawn; RALPHY_FAKE_TRANSCRIBE_JSON short-circuits
// transcribe() (ralphy-captions); RALPHY_FAKE_CAPTION_JSON short-circuits the
// social-copy LLM draft. ralphy-eval runs the REAL runWorkspaceEval against a
// deterministic-only rubric (an unregistered validatorId is `na`, never a
// model call); ralphy-repair is deterministic by construction (#409).

import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, projectDir, runDir } from "../../cli/lib/paths.js";
import { recordApproval, recordRunApproval } from "../../cli/lib/spend.js";
import { createRun } from "../../cli/lib/run.js";
import { createUnit } from "../../cli/lib/unit.js";
import {
  getExecutor,
  registeredExecutorTypes,
  NodeExecutionError,
  type ExecutorContext,
  type ExecutorLogEntry,
} from "../../cli/lib/workflow/executors/index.js";
import { RunControlSignal } from "../../cli/lib/workflow/executors/control-flow.js";
import type {
  GenerateImageInput,
  GenerateResult,
  RalphyConnector,
} from "../../cli/lib/providers/types.js";
import type { WorkflowNode, WorkflowNodeType } from "../../cli/lib/schemas/workflow.js";

const WS = "test";
const PROJECT = "verbs-001";

let tmp: TmpRoot;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-verbs");
  const ws = workspaceDir(WS);
  fs.mkdirSync(path.join(ws, "projects", PROJECT, "artifacts"), { recursive: true });
  fs.writeFileSync(path.join(ws, "workspace.json"), JSON.stringify({ slug: WS }));
  for (const key of ["RALPHY_FAKE_TRANSCRIBE_JSON", "RALPHY_FAKE_CAPTION_JSON"]) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  tmp?.cleanup();
});

type TestCtx = ExecutorContext & { logs: ExecutorLogEntry[]; costs: number[] };

function makeCtx(over: Partial<ExecutorContext> = {}): TestCtx {
  const logs: ExecutorLogEntry[] = [];
  const costs: number[] = [];
  return {
    workspace: WS,
    workspaceDir: workspaceDir(WS),
    projectId: PROJECT,
    artifactsDir: path.join(tmp.dir, "run-artifacts"),
    inputs: {},
    log: async (e) => {
      logs.push(e);
    },
    reportCost: (u) => {
      costs.push(u);
    },
    logs,
    costs,
    ...over,
  };
}

function makeNode(
  type: WorkflowNodeType,
  params: Record<string, unknown>,
  over: Partial<WorkflowNode> = {},
): WorkflowNode {
  return {
    id: "n1",
    type,
    in: {},
    params,
    retry: { max: 0, backoff: "exponential" },
    on_fail: "halt",
    cache: "none",
    emit: true,
    ...over,
  };
}

function run(node: WorkflowNode, ctx: ExecutorContext) {
  const exec = getExecutor(node.type);
  if (!exec) throw new Error(`no executor for ${node.type}`);
  return exec(node, ctx);
}

/** A fixture image connector: writes the slot file, returns a result, no network. */
function mockImageConnector(costUsd = 0.02): {
  connector: RalphyConnector;
  calls: GenerateImageInput[];
} {
  const calls: GenerateImageInput[] = [];
  const connector = {
    id: "mock",
    label: "Mock",
    envVar: "MOCK_KEY",
    signupUrl: "",
    capabilities: ["image"],
    available: () => true,
    generateImage: async (input: GenerateImageInput): Promise<GenerateResult> => {
      calls.push(input);
      const dir = path.join(projectDir(input.projectId), "artifacts", "images");
      fs.mkdirSync(dir, { recursive: true });
      const localPath = path.join(dir, `${input.slot}.png`);
      fs.writeFileSync(localPath, "png-bytes");
      return { localPath, costUsd, latencyMs: 7, model: input.model ?? "mock/default-image" };
    },
  } as unknown as RalphyConnector;
  return { connector, calls };
}

// ─── Registry ────────────────────────────────────────────────────────────────

describe("ralphy-verb executor registry", () => {
  test("all seven ralphy-verb node types are registered", () => {
    const types = registeredExecutorTypes();
    for (const t of [
      "ralphy-generate",
      "ralphy-render",
      "ralphy-eval",
      "ralphy-repair",
      "ralphy-unit",
      "ralphy-captions",
      "ralphy-social-copy",
    ]) {
      expect(types).toContain(t as WorkflowNodeType);
    }
  });
});

// ─── ralphy-generate ─────────────────────────────────────────────────────────

describe("ralphy-generate executor", () => {
  test("image: in-port prompt wins, refs resolve project-relative, cost + gen-log + manifest land", async () => {
    // A ref in the standard resolution chain: <project>/artifacts/refs/.
    const refsDir = path.join(projectDir(PROJECT), "artifacts", "refs");
    fs.mkdirSync(refsDir, { recursive: true });
    fs.writeFileSync(path.join(refsDir, "master.png"), "ref");

    const { connector, calls } = mockImageConnector(0.05);
    const ctx = makeCtx({
      inputs: { prompt: "a neon fox, from the port" },
      resolveMediaConnector: () => connector,
    });
    const node = makeNode("ralphy-generate", {
      kind: "image",
      slot: "scene-01-bg",
      prompt: "params prompt (loses to the port)",
      refs: ["master.png"],
    });

    const res = await run(node, ctx);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.prompt).toBe("a neon fox, from the port");
    // Standard resolution order found the project-relative ref (absolute now).
    expect(calls[0]!.refs?.[0]).toBe(path.join(refsDir, "master.png"));
    // Auto-version contract: the connector receives overwrite=false, always.
    expect(calls[0]!.overwrite).toBe(false);

    const out = res.output as { slot: string; path: string; costUsd: number };
    expect(out.slot).toBe("scene-01-bg");
    expect(fs.existsSync(out.path)).toBe(true);
    expect(res.artifactPath).toBe(out.path);
    expect(ctx.costs).toEqual([0.05]);
    expect(ctx.logs[0]).toMatchObject({ provider: "mock", kind: "image", status: "ok" });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(projectDir(PROJECT), "asset-manifest.json"), "utf8"),
    );
    expect(manifest.slots["scene-01-bg"].kind).toBe("image");
    expect(manifest.slots["scene-01-bg"].path).toBe(out.path);
  });

  test("unknown kind and captions kind are structured params errors", async () => {
    const ctx = makeCtx({ resolveMediaConnector: () => mockImageConnector().connector });
    const bad = await run(makeNode("ralphy-generate", { kind: "hologram", slot: "s" }), ctx).catch(
      (e: unknown) => e,
    );
    expect(bad).toBeInstanceOf(NodeExecutionError);
    expect((bad as NodeExecutionError).code).toBe("params-invalid");

    const cap = await run(makeNode("ralphy-generate", { kind: "captions", slot: "s" }), ctx).catch(
      (e: unknown) => e,
    );
    expect((cap as NodeExecutionError).message).toContain("ralphy-captions");
  });

  test("missing prompt is a structured error", async () => {
    const ctx = makeCtx({ resolveMediaConnector: () => mockImageConnector().connector });
    const err = await run(
      makeNode("ralphy-generate", { kind: "image", slot: "scene-01" }),
      ctx,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NodeExecutionError);
    expect((err as NodeExecutionError).code).toBe("prompt-missing");
  });

  test("the #444 spend gate refuses BEFORE the call when the project cap is breached", async () => {
    // Actual spend $5 already in the gen-log; approved cap $1.
    const logsDir = path.join(projectDir(PROJECT), "logs");
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(
      path.join(logsDir, "generations.jsonl"),
      JSON.stringify({
        ts: new Date().toISOString(),
        provider: "openrouter",
        model: "m",
        endpoint: "m",
        kind: "image",
        status: "ok",
        cost_usd: 5,
      }) + "\n",
    );
    await recordApproval(PROJECT, { scope: "project", budgetCapUsd: 1, reason: "tiny cap" });

    const { connector, calls } = mockImageConnector();
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    const err = await run(
      makeNode("ralphy-generate", { kind: "image", slot: "scene-01", prompt: "x" }),
      ctx,
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NodeExecutionError);
    expect((err as NodeExecutionError).code).toBe("budget-exceeded");
    expect(calls).toHaveLength(0); // gate fired BEFORE the paid call
  });

  test("missing project is a structured error", async () => {
    const ctx = makeCtx({ projectId: undefined });
    const err = await run(makeNode("ralphy-generate", { kind: "image", slot: "s", prompt: "x" }), ctx).catch(
      (e: unknown) => e,
    );
    expect((err as NodeExecutionError).code).toBe("project-missing");
  });
});

// ─── ralphy-render ───────────────────────────────────────────────────────────

describe("ralphy-render executor", () => {
  test("missing composition is a structured failure naming the path", async () => {
    const ctx = makeCtx();
    const err = await run(makeNode("ralphy-render", {}), ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NodeExecutionError);
    expect((err as NodeExecutionError).code).toBe("composition-missing");
    expect((err as NodeExecutionError).message).toContain("index.html");
  });

  test("unfilled {{slots}} are a structured failure NAMING the slots", async () => {
    fs.writeFileSync(
      path.join(projectDir(PROJECT), "index.html"),
      "<h1>{{title}}</h1><p>{{cta_text}}</p><span>{{title}}</span>",
    );
    const ctx = makeCtx();
    const err = await run(
      makeNode("ralphy-render", { variables: { title: "filled" } }),
      ctx,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NodeExecutionError);
    expect((err as NodeExecutionError).code).toBe("unparametrized-slots");
    expect((err as NodeExecutionError).message).toContain("{{cta_text}}");
    expect((err as NodeExecutionError).message).not.toContain("{{title}}");
  });

  test("renders via the adapter seam, logs a gen-log row, archives the prior master", async () => {
    fs.writeFileSync(path.join(projectDir(PROJECT), "index.html"), "<h1>static</h1>");
    const rendered: string[] = [];
    const ctx = makeCtx({
      hyperframesRender: async (args) => {
        rendered.push(args.outputPath);
        fs.writeFileSync(args.outputPath, "mp4-bytes");
        return { exitCode: 0, stderr: "" };
      },
    });

    const res1 = await run(makeNode("ralphy-render", {}), ctx);
    const out1 = res1.output as { path: string; bytes: number };
    expect(out1.path).toBe(path.join(projectDir(PROJECT), "render", "final.mp4"));
    expect(fs.existsSync(out1.path)).toBe(true);
    expect(out1.bytes).toBeGreaterThan(0);

    // Append-only: a re-render archives the prior master to final.v1.mp4.
    await run(makeNode("ralphy-render", {}), ctx);
    expect(rendered).toHaveLength(2);
    expect(fs.existsSync(path.join(projectDir(PROJECT), "render", "final.v1.mp4"))).toBe(true);

    const genLog = fs.readFileSync(
      path.join(projectDir(PROJECT), "logs", "generations.jsonl"),
      "utf8",
    );
    expect(genLog).toContain("hyperframes-render");
  });

  test("a failing engine run is a structured render-failed error", async () => {
    fs.writeFileSync(path.join(projectDir(PROJECT), "index.html"), "<h1>x</h1>");
    const ctx = makeCtx({
      hyperframesRender: async () => ({ exitCode: 3, stderr: "boom: bad timeline" }),
    });
    const err = await run(makeNode("ralphy-render", {}), ctx).catch((e: unknown) => e);
    expect((err as NodeExecutionError).code).toBe("render-failed");
    expect((err as NodeExecutionError).message).toContain("bad timeline");
  });
});

// ─── ralphy-eval ─────────────────────────────────────────────────────────────

function seedEvaluators(criteria: Array<Record<string, unknown>>): void {
  fs.writeFileSync(
    path.join(workspaceDir(WS), "evaluators.json"),
    JSON.stringify({ version: "1.0", criteria }),
  );
}

describe("ralphy-eval executor", () => {
  test("a workspace without a rubric is a structured evaluators-missing failure", async () => {
    const ctx = makeCtx();
    const err = await run(makeNode("ralphy-eval", {}), ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NodeExecutionError);
    expect((err as NodeExecutionError).code).toBe("evaluators-missing");
  });

  test("deterministic rubric scores with ZERO model calls; scorecard persisted; verdict on top", async () => {
    seedEvaluators([
      {
        id: "fixture-check",
        label: "Fixture check",
        category: "style",
        check: "deterministic",
        validatorId: "no-such-validator-registered",
        severity: "warn",
        threshold: {},
      },
    ]);
    const ctx = makeCtx();
    const res = await run(makeNode("ralphy-eval", { gate: ["fixture-check"] }), ctx);

    const out = res.output as { verdict: string; criteria: Array<{ id: string }>; jsonPath: string };
    // Unregistered validator → criterion na at warn severity → overall ship.
    expect(out.verdict).toBe("ship");
    expect(out.criteria.map((c) => c.id)).toEqual(["fixture-check"]);
    expect(fs.existsSync(out.jsonPath)).toBe(true);
    expect(
      fs.existsSync(path.join(projectDir(PROJECT), "workspace-eval-report.md")),
    ).toBe(true);
    expect(res.artifactPath).toBe(out.jsonPath);
  });

  test("params.gate filters the rubric to the named criteria", async () => {
    seedEvaluators([
      { id: "a", label: "A", category: "c", check: "deterministic", validatorId: "nope-a", severity: "warn", threshold: {} },
      { id: "b", label: "B", category: "c", check: "deterministic", validatorId: "nope-b", severity: "warn", threshold: {} },
    ]);
    const ctx = makeCtx();
    const res = await run(makeNode("ralphy-eval", { gate: ["b"] }), ctx);
    const out = res.output as { criteria: Array<{ id: string }> };
    expect(out.criteria.map((c) => c.id)).toEqual(["b"]);
  });
});

// ─── ralphy-repair ───────────────────────────────────────────────────────────

function seedEvalJson(): void {
  const report = {
    schemaVersion: "1.0",
    meta: { projectId: PROJECT },
    findings: [
      {
        id: "F1",
        category: "audio.loudness",
        severity: "warn",
        sceneIndex: null,
        timestampSec: null,
        message: "too quiet",
        fixHint: "loudnorm",
        fixCommand: "ralphy render --loudnorm",
      },
      {
        id: "F2",
        category: "style.artifact",
        severity: "fail",
        sceneIndex: 2,
        timestampSec: 6,
        message: "melted hand",
        fixHint: "re-roll scene-02 keyframe",
        fixCommand: null,
      },
    ],
    scoring: { weights: {}, penalties: {}, score: 55, verdict: "fail" },
  };
  fs.writeFileSync(path.join(projectDir(PROJECT), "eval.json"), JSON.stringify(report));
}

describe("ralphy-repair executor", () => {
  test("builds the deterministic plan; free items auto-approve; paid stays pending outside a run", async () => {
    seedEvalJson();
    const ctx = makeCtx();
    const res = await run(makeNode("ralphy-repair", {}), ctx);
    const out = res.output as {
      items: number;
      freeApproved: number;
      paidItems: number;
      paidApproved: boolean;
      jsonPath: string;
    };
    expect(out.items).toBe(2);
    expect(out.freeApproved).toBe(1); // the editor loudnorm item is free
    expect(out.paidItems).toBe(1); // the art-director re-roll is paid
    expect(out.paidApproved).toBe(false);

    const plan = JSON.parse(fs.readFileSync(out.jsonPath, "utf8"));
    const byOwnerState = Object.fromEntries(
      plan.items.map((it: { owner: string; approvalState: string }) => [it.owner, it.approvalState]),
    );
    expect(byOwnerState["editor"]).toBe("approved");
    expect(byOwnerState["art-director"]).toBe("pending");
    expect(fs.existsSync(path.join(projectDir(PROJECT), "REPAIR_PLAN.md"))).toBe(true);
  });

  test("paid items inside a run with NO approval park the run (#473) with an inbox pack", async () => {
    seedEvalJson();
    await createRun({ id: "repair-run", workspace: WS, title: "repair run" });
    const ctx = makeCtx({ runId: "repair-run", runDir: runDir(WS, "repair-run") });
    const err = await run(makeNode("ralphy-repair", {}), ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RunControlSignal);
    expect((err as RunControlSignal).kind).toBe("park-approval");
    // The plan artifact survived the park; the inbox pack is visible.
    expect(fs.existsSync(path.join(projectDir(PROJECT), "repair-plan.json"))).toBe(true);
    const inbox = path.join(runDir(WS, "repair-run"), "agent-inbox");
    expect(fs.readdirSync(inbox).some((f) => f.endsWith(".json"))).toBe(true);
  });

  test("a recorded run approval unlocks paid items (approvalState approved)", async () => {
    seedEvalJson();
    await createRun({ id: "approved-run", workspace: WS, title: "approved run" });
    await recordRunApproval("approved-run", { budgetCapUsd: 5, reason: "go" });
    const ctx = makeCtx({ runId: "approved-run", runDir: runDir(WS, "approved-run") });
    const res = await run(makeNode("ralphy-repair", {}), ctx);
    const out = res.output as { paidApproved: boolean };
    expect(out.paidApproved).toBe(true);
  });

  test("no eval source anywhere is a structured eval-missing failure", async () => {
    const ctx = makeCtx();
    const err = await run(makeNode("ralphy-repair", {}), ctx).catch((e: unknown) => e);
    expect((err as NodeExecutionError).code).toBe("eval-missing");
  });
});

// ─── ralphy-unit ─────────────────────────────────────────────────────────────

describe("ralphy-unit executor", () => {
  function seedArtifacts(): void {
    const dir = path.join(projectDir(PROJECT), "artifacts", "images");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "cover-01.png"), "one");
    fs.writeFileSync(path.join(dir, "cover-02.png"), "two");
  }

  test("forms the unit from a glob + a wired port path; COPY semantics; publish-shaped output", async () => {
    seedArtifacts();
    const renderDir = path.join(projectDir(PROJECT), "render");
    fs.mkdirSync(renderDir, { recursive: true });
    fs.writeFileSync(path.join(renderDir, "final.mp4"), "mp4");

    const ctx = makeCtx({ inputs: { video: { path: path.join(renderDir, "final.mp4") } } });
    const res = await run(
      makeNode("ralphy-unit", { slug: "drop-01", format: "video", from: "artifacts/images/cover-*.png" }),
      ctx,
    );

    const out = res.output as { projectId: string; slug: string; dir: string; media: number };
    // Exactly the unit ref the publish node's resolveUnitRef consumes.
    expect(out.projectId).toBe(PROJECT);
    expect(out.slug).toBe("drop-01");
    expect(out.media).toBe(3); // 2 covers + the wired render path

    const unitDir = path.join(projectDir(PROJECT), "units", "drop-01");
    expect(fs.existsSync(path.join(unitDir, "unit.json"))).toBe(true);
    expect(fs.existsSync(path.join(unitDir, "cover-01.png"))).toBe(true);
    // COPY, never move: the sources are untouched.
    expect(fs.existsSync(path.join(projectDir(PROJECT), "artifacts", "images", "cover-01.png"))).toBe(true);
    expect(res.artifactPath).toBe(path.join(unitDir, "unit.json"));
  });

  test("re-creating an existing slug appends a .v2 dir (append-only), never overwrites", async () => {
    seedArtifacts();
    const ctx = makeCtx();
    const node = makeNode("ralphy-unit", { slug: "drop-01", format: "image", from: "artifacts/images/cover-*.png" });
    await run(node, ctx);
    const res2 = await run(node, ctx);
    const out2 = res2.output as { dir: string; versioned: boolean };
    expect(out2.dir).toBe("drop-01.v2");
    expect(out2.versioned).toBe(true);
    expect(fs.existsSync(path.join(projectDir(PROJECT), "units", "drop-01", "unit.json"))).toBe(true);
  });

  test("no matched media is a structured no-media failure", async () => {
    const ctx = makeCtx();
    const err = await run(
      makeNode("ralphy-unit", { slug: "empty-unit", format: "video", from: "artifacts/videos/*.mp4" }),
      ctx,
    ).catch((e: unknown) => e);
    expect((err as NodeExecutionError).code).toBe("no-media");
  });
});

// ─── ralphy-captions ─────────────────────────────────────────────────────────

describe("ralphy-captions executor", () => {
  test("transcribes (fake seam) and writes captions JSON + SRT append-only", async () => {
    const fake = path.join(tmp.dir, "fake-transcribe.json");
    fs.writeFileSync(
      fake,
      JSON.stringify({
        captions: [
          { text: "hello farm", startMs: 0, endMs: 800 },
          { text: "second line", startMs: 900, endMs: 1600 },
        ],
        audioDurationSec: 2,
        language: "eng",
      }),
    );
    process.env.RALPHY_FAKE_TRANSCRIBE_JSON = fake;

    const ctx = makeCtx({ inputs: { audio: path.join(tmp.dir, "vo.mp3") } });
    const res = await run(makeNode("ralphy-captions", {}), ctx);

    const srtPath = res.output as string;
    expect(srtPath.endsWith(path.join("artifacts", "captions", "captions-vo.srt"))).toBe(true);
    const srt = fs.readFileSync(srtPath, "utf8");
    expect(srt).toContain("hello farm");
    expect(srt).toContain("00:00:00,900 --> 00:00:01,600");
    const json = JSON.parse(fs.readFileSync(srtPath.replace(/\.srt$/, ".json"), "utf8"));
    expect(json.captions).toHaveLength(2);
    // The gen-log row landed on the project (existing captions path).
    const genLog = fs.readFileSync(path.join(projectDir(PROJECT), "logs", "generations.jsonl"), "utf8");
    expect(genLog).toContain("captions-vo");
  });

  test("missing audio is a structured params error", async () => {
    const ctx = makeCtx();
    const err = await run(makeNode("ralphy-captions", {}), ctx).catch((e: unknown) => e);
    expect((err as NodeExecutionError).code).toBe("params-invalid");
  });
});

// ─── ralphy-social-copy ──────────────────────────────────────────────────────

describe("ralphy-social-copy executor", () => {
  async function seedUnit(): Promise<void> {
    const dir = path.join(projectDir(PROJECT), "artifacts", "images");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "hero.png"), "img");
    await createUnit({
      projectId: PROJECT,
      slug: "drop-01",
      format: "image",
      sources: ["artifacts/images/hero.png"],
      title: "The Drop",
    });
  }

  test("drafts platform copy + hashtags into unit.json (fake LLM seam)", async () => {
    await seedUnit();
    const fake = path.join(tmp.dir, "fake-caption.json");
    fs.writeFileSync(
      fake,
      JSON.stringify({ tiktok: "hook line", reels: "fuller caption", shorts: "short title" }),
    );
    process.env.RALPHY_FAKE_CAPTION_JSON = fake;

    const ctx = makeCtx({ inputs: { unit: { projectId: PROJECT, slug: "drop-01" } } });
    const res = await run(makeNode("ralphy-social-copy", {}), ctx);

    const out = res.output as { caption: { tiktok: string }; hashtags: string[] };
    expect(out.caption.tiktok).toBe("hook line");
    expect(out.hashtags.length).toBeGreaterThan(0);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(projectDir(PROJECT), "units", "drop-01", "unit.json"), "utf8"),
    );
    expect(manifest.caption.platform.shorts).toBe("short title");

    // Append-only: a re-run WITHOUT force skips instead of clobbering.
    const res2 = await run(makeNode("ralphy-social-copy", {}), ctx);
    expect((res2.output as { skipped?: string }).skipped).toContain("caption exists");
  });

  test("a missing unit is a structured unit-not-found failure", async () => {
    const ctx = makeCtx({ inputs: { unit: { projectId: PROJECT, slug: "ghost-unit" } } });
    const err = await run(makeNode("ralphy-social-copy", {}), ctx).catch((e: unknown) => e);
    expect((err as NodeExecutionError).code).toBe("unit-not-found");
  });
});
