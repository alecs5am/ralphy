import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerGenerationIpc } from "../electron/canvas/generation-ipc";
import { loadGenerationCatalog } from "../electron/canvas/generation-catalog";
import { parseGenerationDraft, validateGenerationDraft } from "../electron/canvas/generation-draft";
import { importCanvasFile } from "../electron/canvas/runtime-files";
import { loadCanvases } from "../electron/canvas/store";
import type { RuntimeDependencies } from "../electron/canvas/runtime";
import { MEDIA_CHANNELS } from "../electron/media/types";
import { generationDraftFromRun, type GenerationDraft } from "../shared/generation-studio";
import type { CanvasRunPage, CanvasRun } from "../shared/canvas-runtime";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const providers = [{ id: "openrouter", label: "OpenRouter", available: true, capabilities: ["image", "video"] }, { id: "elevenlabs", label: "ElevenLabs", available: true, capabilities: ["voice", "music", "sfx"] }, { id: "fal", label: "fal.ai", available: true, capabilities: ["video"] }];
const entries = [
  { provider: "fal", model: "bytedance/seedance-2.0/reference-to-video", capability: "video", supportedParams: ["firstFrame", "lastFrame", "refs", "refVideos", "generateAudio"] },
  { provider: "fal", model: "fal-ai/kling-video/o3/pro/reference-to-video", capability: "video", supportedParams: ["firstFrame", "lastFrame", "refs", "generateAudio"] },
  ...["eleven_multilingual_v2", "eleven_v3"].map((model) => ({ provider: "elevenlabs", model, capability: "voice" })),
  { provider: "elevenlabs", model: "elevenlabs-music", capability: "music" }, { provider: "elevenlabs", model: "elevenlabs-sfx", capability: "sfx" },
];
const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "image/test", name: "Image Test", architecture: { input_modalities: ["text", "image"], output_modalities: ["image"] } }] }))) as unknown as typeof fetch;
const draft = (): GenerationDraft => ({ kind: "image", modelId: "image/test", provider: "openrouter", prompt: "An abstract paper landscape", parameters: { aspectRatio: "16:9" }, inputs: [], variants: 1 });

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "generation-runtime-")); roots.push(root);
  const cli = vi.fn(async (args: string[], _signal?: AbortSignal): Promise<unknown> => {
    if (args[0] === "provider") return args[1] === "matrix" ? { entries } : { providers };
    if (args[0] === "models") return args[1] === "preflight" ? { ok: true } : { models: [] };
    return { dryRun: true, cost_estimate_usd: 0.04 };
  });
  const runtime: RuntimeDependencies = { root, workspaceId: "workspace", cli, request: vi.fn(), mint: async () => ({ url: "ralphy-media://asset/checked" }), assertCurrent() {} };
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const capture = vi.fn(async () => runtime), destination = join(root, "export.png");
  registerGenerationIpc({ handle: (channel, handler) => handlers.set(channel, handler), capture, fetcher, chooseExport: async () => destination });
  const call = (channel: keyof typeof MEDIA_CHANNELS, ...args: unknown[]) => Promise.resolve().then(() => handlers.get(MEDIA_CHANNELS[channel])!("workspace", ...args));
  const finished = async () => {
    for (let i = 0; i < 100; i++) {
      const { items: runs } = await call("loadGenerationRuns") as CanvasRunPage;
      if (runs[0] && ["succeeded", "failed", "cancelled"].includes(runs[0].status)) return runs[0];
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Generation did not finish");
  };
  return { root, runtime, cli, call, finished, capture, destination };
}

test("catalog exposes provider-specific audio choices and inputs without claiming SFX preview", async () => {
  const { cli } = await setup();
  const catalog = await loadGenerationCatalog(cli, fetcher);
  expect(catalog.models.map((model) => model.kind)).toEqual(["image", "video", "video", "voiceover", "voiceover", "music", "sfx"]);
  const seedance = catalog.models.find((model) => model.id === "bytedance/seedance-2.0/reference-to-video")!;
  expect(seedance.inputs.map((input) => input.id)).toEqual(["refs"]);
  const kling = catalog.models.find((model) => model.id === "fal-ai/kling-video/o3/pro/reference-to-video")!;
  expect(kling.inputs.map((input) => input.id)).toEqual(["refs", "firstFrame", "lastFrame"]);
  expect(kling.fields.some((field) => field.id === "resolution")).toBe(false);
  expect(() => validateGenerationDraft({ ...draft(), kind: "video", modelId: seedance.id, provider: seedance.provider, parameters: {}, inputs: [{ role: "refVideos", asset: { path: "/local/video.mp4", name: "Video", kind: "video" } }] }, seedance, "preview")).toThrow(/does not accept/);
  expect(catalog.models.find((model) => model.kind === "sfx")!.previewSupported).toBe(false);
  const model = catalog.models[0]!;
  const v3 = catalog.models.find((item) => item.id === "eleven_v3")!;
  expect(v3.fields.map((field) => field.id)).toEqual(["voice", "stability"]);
  expect(() => validateGenerationDraft({ ...draft(), kind: "voiceover", modelId: v3.id, provider: v3.provider, parameters: { voice: "test", stability: 0.55 } }, v3, "execute")).toThrow(/valid delivery/);
  expect(() => validateGenerationDraft({ ...draft(), parameters: { "no-budget": "yes" } }, model, "execute")).toThrow(/Unsupported/);
  expect(() => validateGenerationDraft(draft(), { ...model, available: false }, "execute")).toThrow(/Connect/);
  expect(() => parseGenerationDraft({ ...draft(), parameters: { apiKey: "private" } })).toThrow(/Credentials/);
});

test("reference roles survive preview and history without creating a saved canvas", async () => {
  const { root, cli, call, finished } = await setup();
  const source = join(root, "anchor.png"); await writeFile(source, "image fixture");
  const asset = await importCanvasFile(root, "workspace", source);
  const video: GenerationDraft = { ...draft(), kind: "video", provider: "fal", modelId: "fal-ai/kling-video/o3/pro/reference-to-video", parameters: { duration: "5", aspectRatio: "16:9" }, inputs: [{ role: "refs", asset }, { role: "lastFrame", asset }], variants: 2 };
  await call("startGeneration", video, "preview");
  const run = await finished();
  expect(run.status).toBe("succeeded");
  const generated = cli.mock.calls.filter(([args]) => args[0] === "generate");
  expect(generated).toHaveLength(2);
  for (const [args] of generated) { expect(args).toContain("--ref"); expect(args).toContain("--last-frame"); expect(args).not.toContain("--first-frame"); expect(args).toContain("--dry-run"); }
  expect(run.nodes.at(-1)!.estimatedCostUsd).toBe(0.08);
  expect(generationDraftFromRun(run)?.inputs).toEqual(video.inputs);
  expect(await loadCanvases(root, "workspace")).toEqual([]);
});

test("native execution runs preflight, rejects failed checks and unsupported inputs before spend", async () => {
  const { root, runtime, cli, call, finished, destination } = await setup();
  const original = cli.getMockImplementation()!;
  cli.mockImplementation(async (args, signal) => args[1] === "preflight" ? { ok: false, violations: [{ message: "Unsupported combination" }] } : original(args, signal));
  await expect(call("startGeneration", draft(), "execute")).rejects.toThrow(/Unsupported combination/);
  expect(cli.mock.calls.some(([args]) => args[0] === "generate")).toBe(false);
  const sfx: GenerationDraft = { ...draft(), kind: "sfx", provider: "elevenlabs", modelId: "elevenlabs-sfx", parameters: { duration: 4 } };
  await expect(call("startGeneration", sfx, "preview")).rejects.toThrow(/previews are not supported/);
  const source = join(root, "result.png"); await writeFile(source, "generated fixture bytes");
  cli.mockImplementation(async (args, signal) => args[0] === "generate" ? { path: source } : original(args, signal));
  await expect(call("startGeneration", { ...draft(), inputs: [{ role: "refs", asset: { path: source, name: "result.png", kind: "image" } }] }, "execute")).rejects.toThrow(/Import/);
  await call("startGeneration", draft(), "execute");
  const run = await finished(), asset = run.nodes.at(-1)!.results[0]!.asset!;
  expect(run.status).toBe("succeeded"); expect(asset.path).not.toBe(source);
  expect(await call("exportGenerationAsset", asset)).toBe(true);
  expect(await readFile(destination, "utf8")).toBe("generated fixture bytes");
  runtime.assertCurrent = () => { throw new Error("Root changed"); };
  await expect(call("exportGenerationAsset", asset)).rejects.toThrow(/Root changed/);
});

test("draft saves preserve call order despite delayed captures and retain the last completed edit", async () => {
  const { runtime, call, capture } = await setup();
  let release!: (value: RuntimeDependencies) => void;
  capture.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const first = call("saveGenerationDraft", { ...draft(), prompt: "First" });
  await Promise.resolve();
  const second = call("saveGenerationDraft", { ...draft(), prompt: "Second" });
  const readWhileSaving = call("loadGenerationDraft");
  release(runtime);
  await Promise.all([first, second]);
  expect((await readWhileSaving as GenerationDraft).prompt).toBe("Second");
  expect((await call("loadGenerationDraft") as GenerationDraft).prompt).toBe("Second");
  runtime.assertCurrent = () => { throw new Error("Root changed"); };
  await expect(call("saveGenerationDraft", { ...draft(), prompt: "Stale" })).rejects.toThrow(/Root changed/);
  runtime.assertCurrent = () => undefined;
  expect((await call("loadGenerationDraft") as GenerationDraft).prompt).toBe("Second");
});

test("generation cancellation remains scoped to its history and settles the reused runtime", async () => {
  const { cli, call } = await setup();
  const original = cli.getMockImplementation()!;
  cli.mockImplementation(async (args, signal) => args[0] === "generate" ? new Promise((_resolve, reject) => {
    if (signal?.aborted) reject(signal.reason);
    else signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  }) : original(args, signal));
  const run = await call("startGeneration", draft(), "execute") as CanvasRun;
  await expect(call("cancelGenerationRun", "some-other-run")).rejects.toThrow(/no longer available/);
  expect((await call("cancelGenerationRun", run.id) as CanvasRun).status).toBe("cancelled");
  expect((await call("loadGenerationRuns") as CanvasRunPage).items[0]!.status).toBe("cancelled");
});

test("music and voice use distinct CLI flags, while SFX execution has no model flag", async () => {
  const { root, cli, call, finished } = await setup();
  const original = cli.getMockImplementation()!;
  for (const kind of ["music", "voiceover", "sfx"] as const) {
    const source = join(root, `${kind}.mp3`); await writeFile(source, "audio fixture");
    cli.mockImplementation(async (args, signal) => args[0] === "generate" ? { path: source } : original(args, signal));
    const audio: GenerationDraft = { ...draft(), kind, modelId: kind === "voiceover" ? "eleven_multilingual_v2" : `elevenlabs-${kind}`, provider: "elevenlabs", parameters: kind === "voiceover" ? { voice: "my-voice", speakerBoost: false } : kind === "music" ? { duration: 10, withVocals: true } : { duration: 4, promptInfluence: 0.6 } };
    await call("startGeneration", audio, "execute");
    expect((await finished()).status).toBe("succeeded");
    const args = cli.mock.calls.filter(([argv]) => argv[0] === "generate").at(-1)![0];
    expect(args[1]).toBe(kind);
    if (kind === "voiceover") { expect(args).toContain("--text"); expect(args).toContain("--no-speaker-boost"); }
    else { expect(args).not.toContain("--model"); expect(args).toContain(kind === "music" ? "--with-vocals" : "--prompt-influence"); }
  }
});

test("account voice listing uses the installed CLI shape and never exposes unexpected preview URLs", async () => {
  const { cli, call } = await setup();
  const original = cli.getMockImplementation()!;
  cli.mockImplementation(async (args, signal) => args[0] === "voice" ? { count: 2, voices: [{ voice_id: "voice_123", name: "Warm narrator", category: "cloned", labels: { accent: "British", age: "middle aged" }, preview_url: "file:///private/secret" }, { voice_id: "../escape" }] } : original(args, signal));
  expect(await call("loadGenerationVoices")).toEqual([{ id: "voice_123", name: "Warm narrator", description: "cloned · British · middle aged" }]);
  cli.mockImplementation(async () => ({ providers: [{ id: "elevenlabs", available: false }] }));
  await expect(call("loadGenerationVoices")).rejects.toThrow(/Connect ElevenLabs/);
});
