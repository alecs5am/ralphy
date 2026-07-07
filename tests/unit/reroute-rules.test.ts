// Filter-aware model rerouting (#514) — zero-network unit tests.
//
// Covers the issue's acceptance list:
//   • classification fixtures per provider payload shape (seedance / veo /
//     gemini / gpt-image / ElevenLabs) through the EXTENDED #450 taxonomy,
//   • rules-as-data matching (first match wins, model glob, trait tag,
//     mandatory source on every built-in),
//   • executor integration through the shared runMediaGeneration path: the
//     one-hop bound, the coverage-respecting park (#497), the park-for-human
//     inbox pack, the prompt_suggestion resubmit transform, the
//     `node-rerouted` journal event shape,
//   • workspace rule merge-over-builtin (`<ws>/reroute-rules.json`) + the
//     #502 bundle export carrying the file.

import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, projectDir, runDir } from "../../cli/lib/paths.js";
import { classifyFilterError, classifyError } from "../../cli/lib/errors/taxonomy.js";
import { TerminalProviderError } from "../../cli/lib/providers/shared.js";
import {
  BUILTIN_REROUTE_RULES,
  effectiveRerouteRules,
  extractPromptSuggestion,
  findRerouteRule,
  loadWorkspaceRerouteRules,
  matchesModelPattern,
  parseRerouteAction,
  REROUTE_RULES_FILE,
  type RerouteRule,
} from "../../cli/lib/providers/reroute-rules.js";
import {
  getExecutor,
  NodeExecutionError,
  type ExecutorContext,
  type ExecutorLogEntry,
} from "../../cli/lib/workflow/executors/index.js";
import { RunControlSignal } from "../../cli/lib/workflow/executors/control-flow.js";
import type { WorkflowNode, WorkflowNodeType } from "../../cli/lib/schemas/workflow.js";
import type {
  GenerateImageInput,
  GenerateMusicInput,
  GenerateResult,
  GenerateVideoInput,
  RalphyConnector,
} from "../../cli/lib/providers/types.js";

const WS = "test";
const PROJECT = "reroute-001";
const RUN_ID = "run-reroute-1";

let tmp: TmpRoot;

beforeEach(() => {
  tmp = makeTmpRoot("reroute");
  const ws = workspaceDir(WS);
  fs.mkdirSync(path.join(ws, "projects", PROJECT, "artifacts", "refs"), { recursive: true });
  fs.mkdirSync(path.join(ws, "runs", RUN_ID), { recursive: true });
  fs.writeFileSync(path.join(ws, "workspace.json"), JSON.stringify({ slug: WS }));
});

afterEach(() => {
  tmp?.cleanup();
});

// ─── Classification fixtures (real payload shapes from MODELS.md / memory) ───

describe("classifyFilterError (#514 refinement of #450)", () => {
  test("seedance photoreal-human input rejection → safety-input", () => {
    const c = classifyFilterError({
      message:
        "OpenRouter video failed: InputImageSensitiveContentDetected.PrivacyInformation — input image may contain real person",
      modelId: "bytedance/seedance-2.0",
      kind: "video",
    })!;
    expect(c.filterClass).toBe("safety-input");
    expect(c.class).toBe("moderation");
    expect(c.matched).toBe("input-privacy");
  });

  test("seedance output-stage copyright rejection → copyright", () => {
    const c = classifyFilterError({
      message: "OpenRouter video failed: output video may be related to copyright restrictions",
      modelId: "bytedance/seedance-2.0",
      kind: "video",
    })!;
    expect(c.filterClass).toBe("copyright");
    expect(c.matched).toBe("output-copyright");
  });

  test("veo Responsible AI prompt/frame rejection → safety-input", () => {
    const c = classifyFilterError({
      message:
        "google/veo-3.1 400: prompt contains sensitive words that violate Google's Responsible AI practices",
      modelId: "google/veo-3.1",
      kind: "video",
    })!;
    expect(c.filterClass).toBe("safety-input");
    expect(c.matched).toBe("responsible-ai-input");
  });

  test("gemini IMAGE_SAFETY (output filter) → safety-output", () => {
    const c = classifyFilterError({
      message:
        "google/gemini-3-pro-image-preview returned empty content, native_finish_reason: IMAGE_SAFETY",
      modelId: "google/gemini-3-pro-image-preview",
      kind: "image",
    })!;
    expect(c.filterClass).toBe("safety-output");
    expect(c.matched).toBe("image-safety");
  });

  test("gpt-image generic safety-system rejection → safety-input (generic moderation default)", () => {
    const c = classifyFilterError({
      message:
        "openai/gpt-5.4-image-2 400: your request was rejected by the safety system (content_policy_violation)",
      modelId: "openai/gpt-5.4-image-2",
      kind: "image",
    })!;
    expect(c.filterClass).toBe("safety-input");
  });

  test("ElevenLabs Music bad_prompt ToS → tos-content, still 'moderation' for #450 consumers", () => {
    const message =
      'ElevenLabs Music 400: {"detail":{"message":"bad_prompt"}}\n  prompt_suggestion: instrumental trap beat, 140 BPM, 808 sub-bass';
    const c = classifyFilterError({ message, kind: "music" })!;
    expect(c.filterClass).toBe("tos-content");
    expect(c.matched).toBe("music-tos");
    // The base #450 classification is unchanged for existing consumers.
    expect(classifyError({ message }).class).toBe("moderation");
  });

  test("transient blips classify as 'transient' (never reroute territory)", () => {
    const c = classifyFilterError({ message: "fetch failed: ECONNRESET socket hang up" })!;
    expect(c.filterClass).toBe("transient");
  });

  test("non-filter errors return null (constraint / auth / path never reroute)", () => {
    expect(
      classifyFilterError({ message: "kling 400: prompt is too long (prompt cap is 2500 chars)" }),
    ).toBeNull();
    expect(classifyFilterError({ message: "OpenRouter 401: Unauthorized" })).toBeNull();
    expect(classifyFilterError({ message: "ffmpeg: no such file or directory" })).toBeNull();
  });
});

// ─── Rules as data ───────────────────────────────────────────────────────────

describe("reroute-rules table (#514)", () => {
  test("every built-in rule cites a source and parses its action", () => {
    for (const rule of BUILTIN_REROUTE_RULES) {
      expect(rule.source.length).toBeGreaterThan(10);
      expect(parseRerouteAction(rule.action)).not.toBeNull();
      expect(rule.errorClass).not.toBe("transient");
    }
  });

  test("model glob matching", () => {
    expect(matchesModelPattern("bytedance/seedance-*", "bytedance/seedance-2.0")).toBe(true);
    expect(
      matchesModelPattern("bytedance/seedance-*", "bytedance/seedance-2.0/reference-to-video"),
    ).toBe(true);
    expect(matchesModelPattern("bytedance/seedance-*", "kwaivgi/kling-v3.0-pro")).toBe(false);
    expect(matchesModelPattern("*", undefined)).toBe(true);
    expect(matchesModelPattern("google/veo-*", undefined)).toBe(false);
  });

  test("the seeded production cases resolve to their documented actions", () => {
    const seedanceInput = findRerouteRule(BUILTIN_REROUTE_RULES, {
      model: "bytedance/seedance-2.0",
      capability: "video",
      errorClass: "safety-input",
    })!;
    expect(parseRerouteAction(seedanceInput.action)).toEqual({
      kind: "reroute",
      model: "kwaivgi/kling-v3.0-pro",
    });
    expect(seedanceInput.source).toContain("feedback_seedance_rejects_realistic_people");

    const seedanceCopyright = findRerouteRule(BUILTIN_REROUTE_RULES, {
      model: "bytedance/seedance-2.0",
      capability: "video",
      errorClass: "copyright",
    })!;
    expect(seedanceCopyright.source).toContain("feedback_seedance_copyright_filter_anime_lookalike");

    for (const errorClass of ["safety-input", "safety-output"] as const) {
      const veo = findRerouteRule(BUILTIN_REROUTE_RULES, {
        model: "google/veo-3.1",
        capability: "video",
        errorClass,
      })!;
      expect(veo.action).toBe("reroute:kwaivgi/kling-v3.0-pro");
      expect(veo.source).toContain("feedback_i2v_provider_filters");
    }

    const gemini = findRerouteRule(BUILTIN_REROUTE_RULES, {
      model: "google/gemini-3-pro-image-preview",
      capability: "image",
      errorClass: "safety-output",
    })!;
    expect(gemini.action).toBe("reroute:openai/gpt-5.4-image-2");
    expect(gemini.source).toContain("feedback_image_safety_thresholds");

    const music = findRerouteRule(BUILTIN_REROUTE_RULES, {
      model: undefined,
      capability: "music",
      errorClass: "tos-content",
    })!;
    expect(parseRerouteAction(music.action)).toEqual({
      kind: "resubmit-with",
      transform: "prompt-suggestion",
    });
    expect(music.source).toContain("feedback_elevenlabs_music_no_artist_names");
  });

  test("first match wins; a trait-tagged rule only fires when the node declares the trait", () => {
    const traitRule: RerouteRule = {
      id: "trait-first",
      modelPattern: "*",
      capability: "video",
      errorClass: "safety-input",
      trait: "photoreal-human",
      action: "park-for-human",
      source: "test",
      explanation: "trait-scoped",
    };
    const rules = [traitRule, ...BUILTIN_REROUTE_RULES];
    // Without the trait, the trait rule is skipped and the seedance built-in fires.
    expect(
      findRerouteRule(rules, {
        model: "bytedance/seedance-2.0",
        capability: "video",
        errorClass: "safety-input",
      })!.id,
    ).toBe("seedance-photoreal-human-input");
    // With the trait declared, the earlier rule wins.
    expect(
      findRerouteRule(rules, {
        model: "bytedance/seedance-2.0",
        capability: "video",
        errorClass: "safety-input",
        traits: ["photoreal-human"],
      })!.id,
    ).toBe("trait-first");
  });

  test("extractPromptSuggestion: structured field wins, message tail is the fallback", () => {
    const structured = new TerminalProviderError("ElevenLabs Music 400: bad_prompt", {
      promptSuggestion: "instrumental synthwave, 120 BPM",
    });
    expect(extractPromptSuggestion(structured)).toBe("instrumental synthwave, 120 BPM");
    expect(
      extractPromptSuggestion(
        new Error("ElevenLabs Music 400: bad_prompt\n  prompt_suggestion: dark minor-key piano stab"),
      ),
    ).toBe("dark minor-key piano stab");
    expect(extractPromptSuggestion(new Error("ElevenLabs Music 400: bad_prompt"))).toBeUndefined();
  });
});

// ─── Workspace extension ─────────────────────────────────────────────────────

describe("workspace reroute rules merge over built-ins (#514/#502)", () => {
  test("workspace rules come first and a same-id rule shadows the built-in; invalid entries drop", () => {
    const wsRule = {
      id: "seedance-photoreal-human-input", // shadows the built-in
      modelPattern: "bytedance/seedance-*",
      capability: "video",
      errorClass: "safety-input",
      action: "park-for-human",
      source: "workspace override for a client that bans kling",
      explanation: "client contract: no kling output",
    };
    const invalid = { id: "no-source", modelPattern: "*", capability: "video", errorClass: "safety-input", action: "park-for-human" };
    fs.writeFileSync(
      path.join(workspaceDir(WS), REROUTE_RULES_FILE),
      JSON.stringify({ rules: [wsRule, invalid] }, null, 2),
    );

    const loaded = loadWorkspaceRerouteRules(WS);
    expect(loaded.map((r) => r.id)).toEqual(["seedance-photoreal-human-input"]);

    const effective = effectiveRerouteRules(WS);
    // Shadowed built-in gone; every other built-in still present (merge, never replace).
    expect(effective.filter((r) => r.id === "seedance-photoreal-human-input")).toHaveLength(1);
    expect(effective[0]!.action).toBe("park-for-human");
    expect(effective.length).toBe(BUILTIN_REROUTE_RULES.length + 1 - 1);
    expect(effective.some((r) => r.id === "gemini-image-safety-output")).toBe(true);
  });

  test("no workspace file → built-ins only", () => {
    expect(effectiveRerouteRules(WS)).toEqual(BUILTIN_REROUTE_RULES);
  });
});

// ─── Executor integration (mocked connector through runMediaGeneration) ──────

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
    runId: RUN_ID,
    runDir: runDir(WS, RUN_ID),
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

/** A connector whose first N calls fail with the given errors, then succeeds. */
function failingConnector(failures: Error[], opts: { id?: string } = {}) {
  const videoCalls: GenerateVideoInput[] = [];
  const imageCalls: GenerateImageInput[] = [];
  const musicCalls: GenerateMusicInput[] = [];
  let failuresLeft = [...failures];
  const emit = (kind: string, slot: string, model: string | undefined, ext: string): GenerateResult => {
    const dir = path.join(projectDir(PROJECT), "artifacts", kind);
    fs.mkdirSync(dir, { recursive: true });
    const localPath = path.join(dir, `${slot}${ext}`);
    fs.writeFileSync(localPath, "bytes");
    return { localPath, costUsd: 0.02, latencyMs: 5, model: model ?? `mock/default-${kind}` };
  };
  const maybeFail = () => {
    const next = failuresLeft.shift();
    if (next) throw next;
  };
  const connector = {
    id: opts.id ?? "openrouter",
    label: "Mock",
    envVar: "MOCK_KEY",
    signupUrl: "",
    capabilities: ["image", "video", "voice", "music", "sfx"],
    available: () => true,
    generateImage: async (input: GenerateImageInput) => {
      imageCalls.push(input);
      maybeFail();
      return emit("images", input.slot, input.model, ".png");
    },
    generateVideo: async (input: GenerateVideoInput) => {
      videoCalls.push(input);
      maybeFail();
      return emit("videos", input.slot, input.model, ".mp4");
    },
    generateMusic: async (input: GenerateMusicInput) => {
      musicCalls.push(input);
      maybeFail();
      return emit("music", input.slot, undefined, ".mp3");
    },
  } as unknown as RalphyConnector;
  return { connector, videoCalls, imageCalls, musicCalls };
}

const SEEDANCE_PRIVACY = () =>
  new TerminalProviderError(
    "OpenRouter video failed: InputImageSensitiveContentDetected.PrivacyInformation — input image may contain real person",
  );

function journalEvents(): Array<Record<string, unknown>> {
  const file = path.join(runDir(WS, RUN_ID), "run-events.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe("executor integration (#514 through runMediaGeneration)", () => {
  test("i2v seedance safety-input reroutes ONCE to kling and journals node-rerouted", async () => {
    seedRef("anchor.png");
    const { connector, videoCalls } = failingConnector([SEEDANCE_PRIVACY()]);
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    const node = makeNode("i2v", {
      model: "bytedance/seedance-2.0",
      prompt: "photoreal walk cycle",
      durationSec: 5,
      first_frame: "anchor.png",
    });

    const res = await run(node, ctx);
    expect(videoCalls).toHaveLength(2);
    expect(videoCalls[0]!.model).toBe("bytedance/seedance-2.0");
    expect(videoCalls[1]!.model).toBe("kwaivgi/kling-v3.0-pro");
    // Non-model call shape is IDENTICAL on the retry.
    expect(videoCalls[1]!.prompt).toBe("photoreal walk cycle");
    expect(videoCalls[1]!.firstFrame).toBe(videoCalls[0]!.firstFrame);
    expect((res.output as { model: string }).model).toBe("kwaivgi/kling-v3.0-pro");

    // Journal event shape: kind / node / from / to / ruleId / errorClass / source / message.
    const ev = journalEvents().find((e) => e.kind === "node-rerouted")!;
    expect(ev).toMatchObject({
      kind: "node-rerouted",
      node: "n1",
      from: "bytedance/seedance-2.0",
      to: "kwaivgi/kling-v3.0-pro",
      ruleId: "seedance-photoreal-human-input",
      errorClass: "safety-input",
    });
    expect(String(ev.source)).toContain("feedback_seedance_rejects_realistic_people");
    expect(String(ev.message)).toContain("rerouted by rule");
  });

  test("one-hop bound: a second filter failure after the reroute propagates (normal on_fail), no third call", async () => {
    seedRef("anchor.png");
    const { connector, videoCalls } = failingConnector([
      SEEDANCE_PRIVACY(),
      new TerminalProviderError("kling 400: prompt violates content policy"),
    ]);
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    const node = makeNode("i2v", {
      model: "bytedance/seedance-2.0",
      prompt: "photoreal walk cycle",
      durationSec: 5,
      first_frame: "anchor.png",
    });

    const err = await run(node, ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TerminalProviderError);
    expect((err as Error).message).toContain("content policy");
    expect(videoCalls).toHaveLength(2); // exactly one reroute hop, never a second
  });

  test("transient failures are NOT rerouted (retry territory)", async () => {
    seedRef("anchor.png");
    const { connector, videoCalls } = failingConnector([
      new Error("fetch failed: ECONNRESET socket hang up"),
    ]);
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    const node = makeNode("i2v", {
      model: "bytedance/seedance-2.0",
      prompt: "walk",
      durationSec: 5,
      first_frame: "anchor.png",
    });
    const err = await run(node, ctx).catch((e: unknown) => e);
    expect((err as Error).message).toContain("ECONNRESET");
    expect(videoCalls).toHaveLength(1);
    expect(journalEvents().some((e) => e.kind === "node-rerouted")).toBe(false);
  });

  test("coverage-respecting reroute: kling can't express refs on openrouter → park, not a burned call", async () => {
    seedRef("a.png");
    const { connector, videoCalls } = failingConnector([SEEDANCE_PRIVACY()]);
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    // r2v passes coverageParams incl. "refs" — kling-v3.0-pro/openrouter lists
    // refs under unsupportedParams (#497), so the reroute must PARK instead.
    const node = makeNode("r2v", {
      model: "bytedance/seedance-2.0",
      prompt: "match the refs",
      durationSec: 5,
      refs: ["a.png"],
    });

    const err = await run(node, ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RunControlSignal);
    expect((err as RunControlSignal).kind).toBe("park-approval");
    expect((err as Error).message).toContain("refs");
    expect((err as Error).message).toContain("#497");
    expect(videoCalls).toHaveLength(1); // no second paid call

    // The park landed in the approval inbox with the rule's explanation.
    const inbox = path.join(runDir(WS, RUN_ID), "agent-inbox");
    const packs = fs.readdirSync(inbox).filter((f) => f.endsWith(".json"));
    expect(packs.length).toBe(1);
    const pack = JSON.parse(fs.readFileSync(path.join(inbox, packs[0]!), "utf8"));
    expect(pack.note).toContain("seedance-photoreal-human-input");
    expect(pack.note).toContain("kwaivgi/kling-v3.0-pro");
  });

  test("park-for-human rule writes the inbox pack with the rule's explanation and parks", async () => {
    // A workspace rule that parks instead of rerouting (merge-over-builtin in action).
    fs.writeFileSync(
      path.join(workspaceDir(WS), REROUTE_RULES_FILE),
      JSON.stringify([
        {
          id: "seedance-photoreal-human-input",
          modelPattern: "bytedance/seedance-*",
          capability: "video",
          errorClass: "safety-input",
          action: "park-for-human",
          source: "workspace policy: no automatic model swaps",
          explanation: "this universe locks every scene to seedance; a human picks the fallback",
        },
      ]),
    );
    seedRef("anchor.png");
    const { connector, videoCalls } = failingConnector([SEEDANCE_PRIVACY()]);
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    const node = makeNode("i2v", {
      model: "bytedance/seedance-2.0",
      prompt: "walk",
      durationSec: 5,
      first_frame: "anchor.png",
    });

    const err = await run(node, ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RunControlSignal);
    expect((err as RunControlSignal).kind).toBe("park-approval");
    expect(videoCalls).toHaveLength(1);

    const inbox = path.join(runDir(WS, RUN_ID), "agent-inbox");
    const pack = JSON.parse(
      fs.readFileSync(
        path.join(inbox, fs.readdirSync(inbox).find((f) => f.endsWith(".json"))!),
        "utf8",
      ),
    );
    expect(pack.note).toContain("a human picks the fallback");
    expect(pack.note).toContain("workspace policy: no automatic model swaps");
  });

  test("gemini IMAGE_SAFETY on t2i reroutes to gpt-5.4-image-2", async () => {
    const { connector, imageCalls } = failingConnector([
      new TerminalProviderError(
        "google/gemini-3-pro-image-preview returned empty content, native_finish_reason: IMAGE_SAFETY",
      ),
    ]);
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    const node = makeNode("t2i", {
      model: "google/gemini-3-pro-image-preview",
      prompt: "cryptid mid-transformation anchor frame",
    });

    const res = await run(node, ctx);
    expect(imageCalls).toHaveLength(2);
    expect(imageCalls[1]!.model).toBe("openai/gpt-5.4-image-2");
    expect((res.output as { model: string }).model).toBe("openai/gpt-5.4-image-2");
  });

  test("ElevenLabs Music ToS → resubmit ONCE with the provider's prompt_suggestion", async () => {
    const { connector, musicCalls } = failingConnector(
      [
        new TerminalProviderError('ElevenLabs Music 400: {"detail":{"message":"bad_prompt"}}', {
          promptSuggestion: "instrumental trap beat, 140 BPM, 808 sub-bass",
        }),
      ],
      { id: "elevenlabs" },
    );
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    const node = makeNode("music", { prompt: "a beat like Metro Boomin", durationSec: 30 });

    const res = await run(node, ctx);
    expect(musicCalls).toHaveLength(2);
    expect(musicCalls[0]!.prompt).toBe("a beat like Metro Boomin");
    expect(musicCalls[1]!.prompt).toBe("instrumental trap beat, 140 BPM, 808 sub-bass");
    expect(fs.existsSync((res.output as { path: string }).path)).toBe(true);

    const ev = journalEvents().find((e) => e.kind === "node-rerouted")!;
    expect(ev.ruleId).toBe("elevenlabs-music-tos-resubmit");
    expect(ev.transform).toBe("prompt-suggestion");
  });

  test("ToS rejection WITHOUT a prompt_suggestion is a normal failure (nothing to resubmit)", async () => {
    const { connector, musicCalls } = failingConnector(
      [new TerminalProviderError('ElevenLabs Music 400: {"detail":{"message":"bad_prompt"}}')],
      { id: "elevenlabs" },
    );
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    const node = makeNode("music", { prompt: "a beat like Metro Boomin", durationSec: 30 });
    const err = await run(node, ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TerminalProviderError);
    expect(musicCalls).toHaveLength(1);
  });

  test("no matching rule → the original error propagates untouched", async () => {
    // veo copyright has no built-in rule (only safety-input/-output).
    seedRef("anchor.png");
    const { connector, videoCalls } = failingConnector([
      new TerminalProviderError("output video may be related to copyright restrictions"),
    ]);
    const ctx = makeCtx({ resolveMediaConnector: () => connector });
    const node = makeNode("i2v", {
      model: "google/veo-3.1",
      prompt: "walk",
      durationSec: 5,
      first_frame: "anchor.png",
    });
    const err = await run(node, ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TerminalProviderError);
    expect((err as Error).message).toContain("copyright");
    expect(videoCalls).toHaveLength(1);
    expect(err).not.toBeInstanceOf(NodeExecutionError);
  });
});
