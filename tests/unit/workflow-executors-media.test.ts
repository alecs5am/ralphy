// Media-signature node executors (#512) — zero-network unit tests.
//
// Covers, per the issue's acceptance list:
//   • per-signature PORT CONTRACTS at lint time (missing anchor → structured
//     `missing-required-port` error; wrong ref type → the existing
//     port-type-mismatch check),
//   • #497 coverage-matrix enforcement at lint time (declared-unsupported
//     param / wired port → hard error NAMING a provider that supports it) AND
//     at execution time (structured refusal BEFORE the connector call),
//   • mocked-provider execution per signature family via the established
//     ctx.resolveMediaConnector seam (same plumbing as #511: spend gate,
//     auto-version overwrite=false, run gen-log row, manifest slot update),
//   • post-op determinism: remove-bg / reframe / crunch run their EXISTING
//     lib code (cli/lib/image/cutout.ts, VERTICAL_916_VF) against a tiny
//     lavfi-generated PNG fixture — same pattern as image-convert.test.ts;
//     ffmpeg-backed cases are skipIf-guarded on the binary.

import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, projectDir } from "../../cli/lib/paths.js";
import { recordApproval } from "../../cli/lib/spend.js";
import {
  getExecutor,
  registeredExecutorTypes,
  NodeExecutionError,
  type ExecutorContext,
  type ExecutorLogEntry,
} from "../../cli/lib/workflow/executors/index.js";
import { validateWorkflowGraph } from "../../cli/lib/workflow-graph.js";
import { parseWorkflowGraph } from "../../cli/lib/schemas/workflow.js";
import type { WorkflowNode, WorkflowNodeType } from "../../cli/lib/schemas/workflow.js";
import type {
  GenerateImageInput,
  GenerateLipsyncInput,
  GenerateResult,
  GenerateSfxInput,
  GenerateMusicInput,
  GenerateVideoInput,
  GenerateVoiceoverInput,
  RalphyConnector,
} from "../../cli/lib/providers/types.js";

const WS = "test";
const PROJECT = "media-001";

function hasFfmpeg(): boolean {
  return (
    spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0 &&
    spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0
  );
}
const HAS_FFMPEG = hasFfmpeg();

let tmp: TmpRoot;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmp = makeTmpRoot("media-exec");
  const ws = workspaceDir(WS);
  fs.mkdirSync(path.join(ws, "projects", PROJECT, "artifacts", "refs"), { recursive: true });
  fs.writeFileSync(path.join(ws, "workspace.json"), JSON.stringify({ slug: WS }));
  for (const key of ["RALPHY_FAKE_TRANSCRIBE_JSON"]) {
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

function seedRef(name: string): string {
  const p = path.join(projectDir(PROJECT), "artifacts", "refs", name);
  fs.writeFileSync(p, "ref-bytes");
  return p;
}

/** A fixture connector serving every capability, recording every call. */
function mockConnector(opts: { id?: string; lipsync?: boolean; costUsd?: number } = {}): {
  connector: RalphyConnector;
  calls: {
    image: GenerateImageInput[];
    video: GenerateVideoInput[];
    voice: GenerateVoiceoverInput[];
    music: GenerateMusicInput[];
    sfx: GenerateSfxInput[];
    lipsync: GenerateLipsyncInput[];
  };
} {
  const costUsd = opts.costUsd ?? 0.02;
  const calls = { image: [], video: [], voice: [], music: [], sfx: [], lipsync: [] } as ReturnType<
    typeof mockConnector
  >["calls"];
  const emit = (kind: string, slot: string, model: string | undefined, ext: string): GenerateResult => {
    const dir = path.join(projectDir(PROJECT), "artifacts", kind);
    fs.mkdirSync(dir, { recursive: true });
    const localPath = path.join(dir, `${slot}${ext}`);
    fs.writeFileSync(localPath, "bytes");
    return { localPath, costUsd, latencyMs: 5, model: model ?? `mock/default-${kind}` };
  };
  const connector = {
    id: opts.id ?? "mock",
    label: "Mock",
    envVar: "MOCK_KEY",
    signupUrl: "",
    capabilities: ["image", "video", "voice", "music", "sfx"],
    available: () => true,
    generateImage: async (input: GenerateImageInput) => {
      calls.image.push(input);
      return emit("images", input.slot, input.model, ".png");
    },
    generateVideo: async (input: GenerateVideoInput) => {
      calls.video.push(input);
      return emit("videos", input.slot, input.model, ".mp4");
    },
    generateVoiceover: async (input: GenerateVoiceoverInput) => {
      calls.voice.push(input);
      return emit("voiceover", input.slot, input.modelId, ".mp3");
    },
    generateMusic: async (input: GenerateMusicInput) => {
      calls.music.push(input);
      return emit("music", input.slot, undefined, ".mp3");
    },
    generateSfx: async (input: GenerateSfxInput) => {
      calls.sfx.push(input);
      return emit("sfx", input.slot, undefined, ".mp3");
    },
    ...(opts.lipsync
      ? {
          generateLipsync: async (input: GenerateLipsyncInput) => {
            calls.lipsync.push(input);
            return emit("videos", input.slot, input.model, ".mp4");
          },
        }
      : {}),
  } as unknown as RalphyConnector;
  return { connector, calls };
}

const graph = (nodes: unknown[]) => parseWorkflowGraph({ name: "t", nodes });

// ─── Registry ────────────────────────────────────────────────────────────────

describe("media executor registry (#512)", () => {
  test("all fourteen media-signature node types are registered", () => {
    const types = registeredExecutorTypes();
    for (const t of [
      "t2i",
      "i2i",
      "t2v",
      "i2v",
      "r2v",
      "v2v",
      "lipsync",
      "tts",
      "music",
      "sfx",
      "transcribe",
      "remove-bg",
      "reframe",
      "crunch",
    ]) {
      expect(types).toContain(t as WorkflowNodeType);
    }
  });

  test("voice-design (training-path-only) and upscale (no lib) stay unregistered", () => {
    expect(getExecutor("voice-design")).toBeUndefined();
    expect(getExecutor("upscale")).toBeUndefined();
  });
});

// ─── Port contracts at lint time ─────────────────────────────────────────────

describe("media port contracts at lint time (#512)", () => {
  test("i2v without an anchor is a missing-required-port lint ERROR naming the port", () => {
    const g = graph([{ id: "clip", type: "i2v", params: { prompt: "x" } }]);
    const v = validateWorkflowGraph(g);
    expect(v.ok).toBe(false);
    const issue = v.errors.find((e) => e.code === "missing-required-port")!;
    expect(issue.node).toBe("clip");
    expect(issue.port).toBe("first_frame");
    expect(issue.fix).toContain("params.first_frame");
  });

  test("params can satisfy a required port without a wired edge", () => {
    const g = graph([
      { id: "clip", type: "i2v", params: { prompt: "x", first_frame: "refs/hero.png" } },
    ]);
    expect(validateWorkflowGraph(g).ok).toBe(true);
  });

  test("lipsync requires BOTH image and audio", () => {
    const g = graph([
      { id: "talk", type: "lipsync", in: { image: "refs/face.png" }, params: {} },
    ]);
    const v = validateWorkflowGraph(g);
    const missing = v.errors.filter((e) => e.code === "missing-required-port");
    expect(missing.map((e) => e.port)).toEqual(["audio"]);
  });

  test("transcribe needs at least one of audio | video (oneOf group)", () => {
    const bad = validateWorkflowGraph(graph([{ id: "scribe", type: "transcribe" }]));
    const issue = bad.errors.find((e) => e.code === "missing-required-port")!;
    expect(issue.message).toContain("audio");
    expect(issue.message).toContain("video");

    const ok = validateWorkflowGraph(
      graph([{ id: "scribe", type: "transcribe", in: { audio: "refs/vo.mp3" } }]),
    );
    expect(ok.ok).toBe(true);
  });

  test("post-ops enforce their source port (remove-bg, crunch)", () => {
    for (const type of ["remove-bg", "crunch"] as const) {
      const v = validateWorkflowGraph(graph([{ id: "op", type }]));
      expect(v.errors.some((e) => e.code === "missing-required-port" && e.port === "image")).toBe(
        true,
      );
    }
  });

  test("wrong ref type into an anchor port is the existing port-type-mismatch error", () => {
    const g = graph([
      { id: "script", type: "generate-text", params: { prompt: "x" } },
      { id: "clip", type: "i2v", in: { first_frame: "script.out", prompt: "script.out" } },
    ]);
    const v = validateWorkflowGraph(g);
    const issue = v.errors.find((e) => e.code === "port-type-mismatch")!;
    expect(issue.port).toBe("first_frame");
    expect(issue.message).toContain("expects image[]");
    expect(issue.message).toContain("produces text");
  });
});

// ─── #497 coverage enforcement ───────────────────────────────────────────────

describe("coverage-matrix enforcement (#512 over #497)", () => {
  test("lint: ref_videos param on OR seedance is a HARD error naming the fal route", () => {
    const g = graph([
      {
        id: "clip",
        type: "r2v",
        params: {
          model: "bytedance/seedance-2.0",
          provider: "openrouter",
          prompt: "x",
          refs: ["refs/a.png"],
          ref_videos: ["refs/v.mp4"],
        },
      },
    ]);
    const v = validateWorkflowGraph(g);
    expect(v.ok).toBe(false);
    const issue = v.errors.find((e) => e.code === "coverage-unsupported-param")!;
    expect(issue.node).toBe("clip");
    expect(issue.message).toContain('"ref_videos"');
    expect(issue.fix).toContain("fal");
  });

  test("lint: a WIRED unsupported port counts as a passed param", () => {
    const g = graph([
      { id: "prev", type: "ralphy-render" },
      {
        id: "clip",
        type: "r2v",
        in: { refs: "refs/a.png", ref_videos: "prev.out" },
        params: { model: "bytedance/seedance-2.0", provider: "openrouter", prompt: "x" },
      },
    ]);
    const v = validateWorkflowGraph(g);
    const issue = v.errors.find((e) => e.code === "coverage-unsupported-param")!;
    expect(issue.node).toBe("clip");
    expect(issue.fix).toContain("fal");
  });

  test("lint: supported anchor ports on OR seedance lint clean (aliases map to firstFrame/lastFrame)", () => {
    const g = graph([
      {
        id: "clip",
        type: "i2v",
        params: {
          model: "bytedance/seedance-2.0",
          provider: "openrouter",
          prompt: "x",
          first_frame: "refs/a.png",
          last_frame: "refs/b.png",
        },
      },
    ]);
    const v = validateWorkflowGraph(g);
    expect(v.ok).toBe(true);
    expect(v.warnings).toEqual([]);
  });

  test("execution: an unsupported param for the RESOLVED binding refuses BEFORE the paid call", async () => {
    seedRef("clip.mp4");
    const { connector, calls } = mockConnector({ id: "openrouter" });
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    const node = makeNode("v2v", {
      model: "bytedance/seedance-2.0",
      prompt: "extend it",
      durationSec: 10,
      video: "clip.mp4",
    });
    const err = await run(node, ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NodeExecutionError);
    expect((err as NodeExecutionError).code).toBe("coverage-unsupported-param");
    expect((err as NodeExecutionError).message).toContain("refVideos");
    expect((err as NodeExecutionError).message).toContain("fal");
    expect(calls.video).toHaveLength(0); // refused before spend
  });
});

// ─── Execution per signature family (mocked provider) ────────────────────────

describe("media executor execution (mocked provider)", () => {
  test("t2i: prompt port wins, cost + run log + manifest land, overwrite stays false", async () => {
    const { connector, calls } = mockConnector({ costUsd: 0.05 });
    const ctx = makeCtx({
      inputs: { prompt: "a neon fox" },
      resolveMediaConnector: () => connector,
    });
    const res = await run(makeNode("t2i", { slot: "scene-01-bg", size: "1080x1920" }), ctx);

    expect(calls.image).toHaveLength(1);
    expect(calls.image[0]!.prompt).toBe("a neon fox");
    expect(calls.image[0]!.size).toBe("1080x1920");
    expect(calls.image[0]!.overwrite).toBe(false);

    const out = res.output as { slot: string; path: string };
    expect(out.slot).toBe("scene-01-bg");
    expect(fs.existsSync(out.path)).toBe(true);
    expect(ctx.costs).toEqual([0.05]);
    expect(ctx.logs[0]).toMatchObject({ provider: "mock", kind: "image", status: "ok" });
    const manifest = JSON.parse(
      fs.readFileSync(path.join(projectDir(PROJECT), "asset-manifest.json"), "utf8"),
    );
    expect(manifest.slots["scene-01-bg"].kind).toBe("image");
  });

  test("t2i without a prompt is a structured prompt-missing error", async () => {
    const ctx = makeCtx({ resolveMediaConnector: () => mockConnector().connector });
    const err = await run(makeNode("t2i", {}), ctx).catch((e: unknown) => e);
    expect((err as NodeExecutionError).code).toBe("prompt-missing");
  });

  test("i2i: source images resolve through the standard ref order into refs", async () => {
    const master = seedRef("master.png");
    const { connector, calls } = mockConnector();
    const ctx = makeCtx({
      inputs: { images: ["master.png"] },
      resolveMediaConnector: () => connector,
    });
    await run(makeNode("i2i", { prompt: "restyle it" }), ctx);
    expect(calls.image[0]!.refs).toEqual([master]);
  });

  test("i2v: first_frame resolves project-relative; slot defaults to the node id", async () => {
    const anchor = seedRef("anchor.png");
    const { connector, calls } = mockConnector();
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    const res = await run(
      makeNode("i2v", { prompt: "walk forward", durationSec: 5, first_frame: "anchor.png" }),
      ctx,
    );
    expect(calls.video[0]!.firstFrame).toBe(anchor);
    expect(calls.video[0]!.lastFrame).toBeUndefined();
    expect(calls.video[0]!.durationSec).toBe(5);
    expect((res.output as { slot: string }).slot).toBe("n1");
  });

  test("i2v without an anchor is a structured port-missing error (execution mirror of the lint gate)", async () => {
    const ctx = makeCtx({ resolveMediaConnector: () => mockConnector().connector });
    const err = await run(
      makeNode("i2v", { prompt: "walk", durationSec: 5 }),
      ctx,
    ).catch((e: unknown) => e);
    expect((err as NodeExecutionError).code).toBe("port-missing");
    expect((err as NodeExecutionError).message).toContain("first_frame");
  });

  test("video signatures require durationSec", async () => {
    const ctx = makeCtx({ resolveMediaConnector: () => mockConnector().connector });
    const err = await run(makeNode("t2v", { prompt: "clip" }), ctx).catch((e: unknown) => e);
    expect((err as NodeExecutionError).code).toBe("params-invalid");
    expect((err as NodeExecutionError).message).toContain("durationSec");
  });

  test("r2v: refs + ref_videos pass through to the connector call", async () => {
    const a = seedRef("a.png");
    const v = seedRef("v.mp4");
    const { connector, calls } = mockConnector();
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    await run(
      makeNode("r2v", { prompt: "match the refs", durationSec: 10, refs: ["a.png"], ref_videos: ["v.mp4"] }),
      ctx,
    );
    expect(calls.video[0]!.refs).toEqual([a]);
    expect(calls.video[0]!.refVideos).toEqual([v]);
  });

  test("v2v: the source video rides the video-refs route", async () => {
    const src = seedRef("src.mp4");
    const { connector, calls } = mockConnector();
    const ctx = makeCtx({
      inputs: { video: { path: src } },
      resolveMediaConnector: () => connector,
    });
    await run(makeNode("v2v", { prompt: "extend", durationSec: 15 }), ctx);
    expect(calls.video[0]!.refVideos).toEqual([src]);
  });

  test("lipsync: routes image + audio through the connector generateLipsync seam", async () => {
    const face = seedRef("face.png");
    const vo = seedRef("vo.mp3");
    const { connector, calls } = mockConnector({ lipsync: true });
    const ctx = makeCtx({
      inputs: { image: face, audio: vo },
      resolveMediaConnector: () => connector,
    });
    const res = await run(makeNode("lipsync", {}), ctx);
    expect(calls.lipsync[0]!.image).toBe(face);
    expect(calls.lipsync[0]!.audio).toBe(vo);
    expect(fs.existsSync((res.output as { path: string }).path)).toBe(true);
  });

  test("lipsync on a connector without the route is a structured provider-unsupported error", async () => {
    seedRef("face.png");
    seedRef("vo.mp3");
    const { connector } = mockConnector({ lipsync: false });
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    const err = await run(
      makeNode("lipsync", { image: "face.png", audio: "vo.mp3" }),
      ctx,
    ).catch((e: unknown) => e);
    expect((err as NodeExecutionError).code).toBe("provider-unsupported");
    expect((err as NodeExecutionError).message).toContain("generateLipsync");
  });

  test("tts: text port + voiceId; sliders map into voiceSettings", async () => {
    const { connector, calls } = mockConnector();
    const ctx = makeCtx({
      inputs: { text: "hello farm" },
      resolveMediaConnector: () => connector,
    });
    await run(
      makeNode("tts", { voiceId: "voice-123", stability: 0.5, similarityBoost: 0.7, speakerBoost: true }),
      ctx,
    );
    const call = calls.voice[0]!;
    expect(call.text).toBe("hello farm");
    expect(call.voiceId).toBe("voice-123");
    expect(call.voiceSettings).toMatchObject({
      stability: 0.5,
      similarity_boost: 0.7,
      use_speaker_boost: true,
    });
  });

  test("tts without a voiceId is a structured params error", async () => {
    const ctx = makeCtx({
      inputs: { text: "hello" },
      resolveMediaConnector: () => mockConnector().connector,
    });
    const err = await run(makeNode("tts", {}), ctx).catch((e: unknown) => e);
    expect((err as NodeExecutionError).code).toBe("params-invalid");
    expect((err as NodeExecutionError).message).toContain("voiceId");
  });

  test("music: durationSec is required; instrumental is the default", async () => {
    const { connector, calls } = mockConnector();
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    const err = await run(makeNode("music", { prompt: "lofi bed" }), ctx).catch((e: unknown) => e);
    expect((err as NodeExecutionError).code).toBe("params-invalid");

    await run(makeNode("music", { prompt: "lofi bed", durationSec: 30 }), ctx);
    expect(calls.music[0]!.forceInstrumental).toBe(true);
    expect(calls.music[0]!.durationSec).toBe(30);
  });

  test("sfx: prompt through, optional duration + influence forwarded", async () => {
    const { connector, calls } = mockConnector();
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    await run(makeNode("sfx", { prompt: "sabre draw", durationSec: 3, promptInfluence: 0.8 }), ctx);
    expect(calls.sfx[0]!.prompt).toBe("sabre draw");
    expect(calls.sfx[0]!.durationSec).toBe(3);
    expect(calls.sfx[0]!.promptInfluence).toBe(0.8);
  });

  test("transcribe: fake seam → object:transcript output + persisted word-level JSON + manifest", async () => {
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

    const vo = seedRef("vo.mp3");
    const ctx = makeCtx({ inputs: { audio: vo } });
    const res = await run(makeNode("transcribe", {}), ctx);

    const out = res.output as { captions: unknown[]; language: string; slot: string };
    expect(out.captions).toHaveLength(2);
    expect(out.language).toBe("eng");
    expect(out.slot).toBe("transcript-vo");
    expect(res.artifactPath).toContain(path.join("artifacts", "captions", "transcript-vo.json"));
    expect(fs.existsSync(res.artifactPath!)).toBe(true);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(projectDir(PROJECT), "asset-manifest.json"), "utf8"),
    );
    expect(manifest.slots["transcript-vo"].kind).toBe("captions");
  });

  test("transcribe with no source is a structured port-missing error", async () => {
    const ctx = makeCtx();
    const err = await run(makeNode("transcribe", {}), ctx).catch((e: unknown) => e);
    expect((err as NodeExecutionError).code).toBe("port-missing");
  });

  test("the #444 spend gate refuses BEFORE the media call when the project cap is breached", async () => {
    const logsDir = path.join(projectDir(PROJECT), "logs");
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(
      logsDir + "/generations.jsonl",
      JSON.stringify({
        ts: new Date().toISOString(),
        provider: "openrouter",
        model: "m",
        endpoint: "m",
        kind: "video",
        status: "ok",
        cost_usd: 5,
      }) + "\n",
    );
    await recordApproval(PROJECT, { scope: "project", budgetCapUsd: 1, reason: "tiny cap" });

    const { connector, calls } = mockConnector();
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    const err = await run(
      makeNode("t2v", { prompt: "clip", durationSec: 10 }),
      ctx,
    ).catch((e: unknown) => e);
    expect((err as NodeExecutionError).code).toBe("budget-exceeded");
    expect(calls.video).toHaveLength(0);
  });
});

// ─── Post-ops: existing lib code on a real fixture (ffmpeg-backed) ───────────

describe("media post-ops (#512)", () => {
  /** Solid-colour PNG fixture via lavfi (same pattern as image-convert.test.ts). */
  function writePngFixture(file: string, w: number, h: number): void {
    spawnSync(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=red:s=${w}x${h}:d=0.04:r=25`, "-frames:v", "1", file],
      { stdio: "ignore" },
    );
  }

  function probeDims(file: string): { w: number; h: number } {
    const r = spawnSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", file],
      { encoding: "utf-8" },
    );
    const m = (r.stdout ?? "").trim().match(/^(\d+)x(\d+)$/);
    if (!m) throw new Error(`could not probe "${file}"`);
    return { w: parseInt(m[1]!, 10), h: parseInt(m[2]!, 10) };
  }

  test("reframe rejects an unimplemented aspect and a double source (no ffmpeg needed)", async () => {
    seedRef("a.png");
    seedRef("b.mp4");
    const ctx = makeCtx();
    const bad = await run(
      makeNode("reframe", { image: "a.png", aspect: "1:1" }),
      ctx,
    ).catch((e: unknown) => e);
    expect((bad as NodeExecutionError).code).toBe("params-invalid");

    const both = await run(
      makeNode("reframe", { image: "a.png", video: "b.mp4" }),
      ctx,
    ).catch((e: unknown) => e);
    expect((both as NodeExecutionError).code).toBe("params-invalid");
  });

  test.skipIf(!HAS_FFMPEG)(
    "crunch runs the existing ps1Crunch recipe: dimensions preserved, project gen-log row, append-only re-run",
    async () => {
      const src = path.join(projectDir(PROJECT), "artifacts", "refs", "still.png");
      writePngFixture(src, 200, 100);
      const ctx = makeCtx();
      const node = makeNode("crunch", { image: "still.png", slot: "crunched" });

      const res = await run(node, ctx);
      const out = res.output as { path: string };
      expect(out.path).toBe(path.join(projectDir(PROJECT), "artifacts", "images", "crunched.png"));
      expect(probeDims(out.path)).toEqual({ w: 200, h: 100 });
      const genLog = fs.readFileSync(
        path.join(projectDir(PROJECT), "logs", "generations.jsonl"),
        "utf8",
      );
      expect(genLog).toContain("ffmpeg/ps1-crunch");

      // Invariant #14: a re-run archives the prior output to .v1, never clobbers.
      await run(node, ctx);
      expect(
        fs.existsSync(path.join(projectDir(PROJECT), "artifacts", "images", "crunched.v1.png")),
      ).toBe(true);
    },
  );

  test.skipIf(!HAS_FFMPEG)(
    "reframe centre-crops a still to the 9:16 canvas via the existing VERTICAL_916_VF chain",
    async () => {
      const src = path.join(projectDir(PROJECT), "artifacts", "refs", "wide.png");
      writePngFixture(src, 320, 180);
      const ctx = makeCtx();
      const res = await run(makeNode("reframe", { image: "wide.png", slot: "vertical" }), ctx);
      const out = res.output as { path: string };
      expect(probeDims(out.path)).toEqual({ w: 1080, h: 1920 });
    },
  );

  test.skipIf(!HAS_FFMPEG)(
    "remove-bg (chromakey method) runs the existing cutout recipe and emits a PNG",
    async () => {
      const src = path.join(projectDir(PROJECT), "artifacts", "refs", "green.png");
      writePngFixture(src, 64, 64);
      const ctx = makeCtx();
      const res = await run(
        makeNode("remove-bg", { image: "green.png", method: "chromakey", color: "#ff0000" }),
        ctx,
      );
      const out = res.output as { path: string };
      expect(fs.existsSync(out.path)).toBe(true);
      expect(out.path.endsWith(".png")).toBe(true);
      const genLog = fs.readFileSync(
        path.join(projectDir(PROJECT), "logs", "generations.jsonl"),
        "utf8",
      );
      expect(genLog).toContain("ffmpeg/chromakey");
    },
  );

  test("remove-bg rejects an unknown method with a structured error", async () => {
    seedRef("x.png");
    const ctx = makeCtx();
    const err = await run(
      makeNode("remove-bg", { image: "x.png", method: "u2net" }),
      ctx,
    ).catch((e: unknown) => e);
    expect((err as NodeExecutionError).code).toBe("params-invalid");
    expect((err as NodeExecutionError).message).toContain("flood");
  });
});
