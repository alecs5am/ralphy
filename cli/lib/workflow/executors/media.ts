// Media-signature node executors (#512) — category B of the farm node graph
// (docs/architecture/farm-node-graph.md): nodes typed by I/O SIGNATURE, with
// the (model, provider) pair a binding INSIDE the node.
//
// THE RULE (AGENTS.md invariant #2): every executor here is a thin typed
// front over the SAME generation lib `ralphy generate` uses — all paid calls
// run through `runMediaGeneration()` (ralphy-verbs.ts), which owns the #444
// spend gate, connector resolution (`resolveConnector` + the
// `resolveMediaConnector` test seam), the #497 coverage check, auto-versioned
// output (overwrite=false, invariant #14), the run + project gen-log rows,
// and the asset-manifest slot update. No hardcoded model ids: `params.model`
// resolves through `resolveModelAlias`, and an absent model falls to the
// connector's own default (the same source the CLI uses).
//
// Signatures (port contracts live in MEDIA_PORT_CONTRACTS,
// cli/lib/schemas/workflow.ts — enforced at `workflow lint` AND re-checked
// here at execution time):
//   • t2i        — prompt → image (generateImage)
//   • i2i        — images + prompt → image (generateImage with refs)
//   • t2v        — prompt → video (generateVideo)
//   • i2v        — first_frame (+ optional last_frame) + prompt → video
//   • r2v        — refs[] (+ optional ref_videos) + prompt → video
//   • v2v        — video + prompt → video (fal seedance r2v video_urls route)
//   • lipsync    — image + audio → video (connector `generateLipsync` seam;
//                  no first-party connector implements it yet — structured
//                  provider-unsupported error until one does)
//   • tts        — text + voiceId → audio (generateVoiceover)
//   • music      — prompt + durationSec → audio (generateMusic)
//   • sfx        — prompt → audio (generateSfx)
//   • transcribe — audio|video → object:transcript (the transcribe() lib —
//                  the same multi-backend path ralphy-captions rides)
// Deterministic post-ops (ffmpeg/Playwright-backed existing lib code, $0):
//   • remove-bg  — flood-fill cutout (default; preserves die-cut outlines) or
//                  chromakey (cli/lib/image/cutout.ts)
//   • reframe    — centre-crop to 9:16 (VERTICAL_916_VF, the `ralphy clip
//                  --vertical` chain from cli/lib/ffmpeg-recipes.ts)
//   • crunch     — authentic PS1 crunch (ps1Crunch, `ralphy image crunch`)
//
// INTENTIONALLY EXCLUDED (no executor registered):
//   • voice-design — training-path-only by design: its output is a preview
//     set a HUMAN picks a voice from by EAR (memory
//     feedback_character_voice_design_previews_user_pick — the agent cannot
//     hear). A headless farm node would freeze a voice nobody auditioned.
//     Production uses the frozen voice_id through the `tts` node instead.
//   • upscale — no existing lib implementation to wire (invariant #2: propose
//     the `ralphy` verb first, never inline a new model/ffmpeg path here).
//     The schema signature + port contract already exist, so registering an
//     executor later is additive.

import fs from "node:fs/promises";
import path from "node:path";
import { artifactKindDir } from "../../paths.js";
import { logGeneration } from "../../gen-log.js";
import { protectExistingAsset } from "../../providers/shared.js";
import { intakePath, readPromptOrFile } from "../../path-resolution.js";
import { resolveModelAlias } from "../../model-aliases.js";
import { transcribe, type TranscribeBackend, type TranscribeLanguage } from "../../transcribe.js";
import { floodFillCutout, chromakey, ps1Crunch, runFfmpeg } from "../../image/cutout.js";
import { VERTICAL_916_VF } from "../../ffmpeg-recipes.js";
import { NodeExecutionError } from "./types.js";
import type { ExecutorContext, ExecutorResult, NodeExecutor } from "./types.js";
import {
  runMediaGeneration,
  resolveProject,
  pathFromValue,
  requireSlot,
  stringList,
  updateManifestSlot,
} from "./ralphy-verbs.js";
import type { WorkflowNode } from "../../schemas/workflow.js";

// ─── Port / param intake helpers ─────────────────────────────────────────────

/** Every file path carried by a port value (string, object, or array of either). */
function portPathList(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(portPathList);
  const p = pathFromValue(v);
  return p ? [p] : [];
}

/** Media slot: params.slot wins, else the node id (already lowercase kebab). */
function mediaSlot(node: WorkflowNode): string {
  return requireSlot(node, (node.params.slot as string | undefined) ?? node.id);
}

/**
 * A single required file input: the wired in-port wins, else the params key,
 * each resolved through the standard intake order (cwd → <project>/ →
 * artifacts/refs/ → workspace shared/). Missing → structured port-missing.
 */
function requirePortPath(
  node: WorkflowNode,
  ctx: ExecutorContext,
  project: string,
  port: string,
): string {
  const p = optionalPortPath(node, ctx, project, port);
  if (!p) {
    throw new NodeExecutionError(
      "port-missing",
      `${node.type} node "${node.id}" is missing its required "${port}" input — wire the \`${port}\` in-port or set params.${port}`,
    );
  }
  return p;
}

function optionalPortPath(
  node: WorkflowNode,
  ctx: ExecutorContext,
  project: string,
  port: string,
): string | undefined {
  const raw = portPathList(ctx.inputs[port])[0] ?? (node.params[port] as string | undefined);
  return raw ? intakePath(raw, project, port) : undefined;
}

/** A required list input (refs, images): port values + params, intake-resolved. */
function requirePortPathList(
  node: WorkflowNode,
  ctx: ExecutorContext,
  project: string,
  port: string,
  paramKeys: string[],
): string[] {
  const list = optionalPortPathList(node, ctx, project, port, paramKeys);
  if (list.length === 0) {
    throw new NodeExecutionError(
      "port-missing",
      `${node.type} node "${node.id}" is missing its required "${port}" input — wire the \`${port}\` in-port or set params.${paramKeys[0]}`,
    );
  }
  return list;
}

function optionalPortPathList(
  node: WorkflowNode,
  ctx: ExecutorContext,
  project: string,
  port: string,
  paramKeys: string[],
): string[] {
  const raw = [
    ...portPathList(ctx.inputs[port]),
    ...paramKeys.flatMap((k) => stringList(node.params[k])),
  ];
  return [...new Set(raw)].map((r) => intakePath(r, project, port));
}

/** Prompt / text: the wired in-port wins, else params inline / file ref. */
async function requireText(
  node: WorkflowNode,
  ctx: ExecutorContext,
  project: string,
  port: "prompt" | "text",
): Promise<string> {
  const fromPort = ctx.inputs[port];
  if (typeof fromPort === "string" && fromPort.trim().length > 0) return fromPort;
  const text = await readPromptOrFile({
    prompt: node.params[port] as string | undefined,
    promptFile: node.params[`${port}_file`] as string | undefined,
    projectId: project,
  });
  if (!text) {
    throw new NodeExecutionError(
      "prompt-missing",
      `${node.type} node "${node.id}" has no ${port} — wire the \`${port}\` in-port or set params.${port} / params.${port}_file`,
    );
  }
  return text;
}

function aliasedModel(node: WorkflowNode): string | undefined {
  const m = node.params.model as string | undefined;
  return m ? (resolveModelAlias(m) ?? m) : undefined;
}

function requireDuration(node: WorkflowNode): number {
  const d = node.params.durationSec;
  if (typeof d !== "number" || !(d > 0)) {
    throw new NodeExecutionError(
      "params-invalid",
      `${node.type} node "${node.id}" requires params.durationSec (seconds)`,
    );
  }
  return d;
}

function optionalNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

// ─── Shared video call shape ─────────────────────────────────────────────────

type VideoExtras = {
  firstFrame?: string;
  lastFrame?: string;
  refs?: string[];
  refVideos?: string[];
};

/** One generateVideo call through the shared core, per-signature extras. */
async function runVideoCall(
  node: WorkflowNode,
  ctx: ExecutorContext,
  extras: VideoExtras,
): Promise<ExecutorResult> {
  const project = resolveProject(node, ctx);
  const slot = mediaSlot(node);
  const prompt = await requireText(node, ctx, project, "prompt");
  const model = aliasedModel(node);
  const durationSec = requireDuration(node);
  const p = node.params as {
    provider?: string;
    aspectRatio?: string;
    resolution?: string;
    generateAudio?: boolean;
    mode?: string;
    note?: string;
  };
  return runMediaGeneration(node, ctx, project, slot, {
    kind: "video",
    model,
    provider: p.provider,
    durationSec,
    mode: p.mode,
    note: p.note,
    enforceCoverage: true,
    coverageParams: [
      "prompt",
      "durationSec",
      ...(p.aspectRatio ? ["aspectRatio"] : []),
      ...(p.resolution ? ["resolution"] : []),
      ...(p.generateAudio ? ["generateAudio"] : []),
      ...(extras.firstFrame ? ["firstFrame"] : []),
      ...(extras.lastFrame ? ["lastFrame"] : []),
      ...(extras.refs && extras.refs.length > 0 ? ["refs"] : []),
      ...(extras.refVideos && extras.refVideos.length > 0 ? ["refVideos"] : []),
    ],
    invoke: (conn, common, o) =>
      conn.generateVideo!({
        ...common,
        prompt: o?.prompt ?? prompt,
        model: o?.model ?? model,
        durationSec,
        aspectRatio: p.aspectRatio as never,
        resolution: p.resolution as never,
        generateAudio: p.generateAudio,
        ...extras,
      }),
  });
}

// ─── A. Generative signatures ────────────────────────────────────────────────

/** t2i: text → image. */
export const t2iExecutor: NodeExecutor = async (node, ctx) => {
  const project = resolveProject(node, ctx);
  const slot = mediaSlot(node);
  const prompt = await requireText(node, ctx, project, "prompt");
  const model = aliasedModel(node);
  const p = node.params as { provider?: string; size?: string; negativePrompt?: string; mode?: string; note?: string };
  return runMediaGeneration(node, ctx, project, slot, {
    kind: "image",
    model,
    provider: p.provider,
    mode: p.mode,
    note: p.note,
    enforceCoverage: true,
    coverageParams: [
      "prompt",
      ...(p.size ? ["size"] : []),
      ...(p.negativePrompt ? ["negativePrompt"] : []),
    ],
    invoke: (conn, common, o) =>
      conn.generateImage!({
        ...common,
        prompt: o?.prompt ?? prompt,
        model: o?.model ?? model,
        size: p.size,
        negativePrompt: p.negativePrompt,
      }),
  });
};

/** i2i: image(s) + text → image (edit / restyle / ref-guided). */
export const i2iExecutor: NodeExecutor = async (node, ctx) => {
  const project = resolveProject(node, ctx);
  const slot = mediaSlot(node);
  const refs = requirePortPathList(node, ctx, project, "images", ["images", "refs"]);
  const prompt = await requireText(node, ctx, project, "prompt");
  const model = aliasedModel(node);
  const p = node.params as { provider?: string; size?: string; negativePrompt?: string; mode?: string; note?: string };
  return runMediaGeneration(node, ctx, project, slot, {
    kind: "image",
    model,
    provider: p.provider,
    mode: p.mode,
    note: p.note,
    enforceCoverage: true,
    coverageParams: [
      "prompt",
      "refs",
      ...(p.size ? ["size"] : []),
      ...(p.negativePrompt ? ["negativePrompt"] : []),
    ],
    invoke: (conn, common, o) =>
      conn.generateImage!({
        ...common,
        prompt: o?.prompt ?? prompt,
        model: o?.model ?? model,
        refs,
        size: p.size,
        negativePrompt: p.negativePrompt,
      }),
  });
};

/** t2v: text → video. */
export const t2vExecutor: NodeExecutor = async (node, ctx) => runVideoCall(node, ctx, {});

/** i2v: first_frame (+ optional last_frame) + text → video. */
export const i2vExecutor: NodeExecutor = async (node, ctx) => {
  const project = resolveProject(node, ctx);
  return runVideoCall(node, ctx, {
    firstFrame: requirePortPath(node, ctx, project, "first_frame"),
    lastFrame: optionalPortPath(node, ctx, project, "last_frame"),
  });
};

/** r2v: reference images (+ optional reference videos) + text → video. */
export const r2vExecutor: NodeExecutor = async (node, ctx) => {
  const project = resolveProject(node, ctx);
  const refVideos = optionalPortPathList(node, ctx, project, "ref_videos", ["ref_videos"]);
  return runVideoCall(node, ctx, {
    refs: requirePortPathList(node, ctx, project, "refs", ["refs"]),
    refVideos: refVideos.length > 0 ? refVideos : undefined,
  });
};

/** v2v: source video + text → video (extend / restyle via the video-refs route). */
export const v2vExecutor: NodeExecutor = async (node, ctx) => {
  const project = resolveProject(node, ctx);
  return runVideoCall(node, ctx, {
    refVideos: [requirePortPath(node, ctx, project, "video")],
  });
};

/** lipsync: image + audio → video, via the connector generateLipsync seam. */
export const lipsyncExecutor: NodeExecutor = async (node, ctx) => {
  const project = resolveProject(node, ctx);
  const slot = mediaSlot(node);
  const image = requirePortPath(node, ctx, project, "image");
  const audio = requirePortPath(node, ctx, project, "audio");
  const model = aliasedModel(node);
  const p = node.params as { provider?: string; prompt?: string; durationSec?: number; mode?: string; note?: string };
  return runMediaGeneration(node, ctx, project, slot, {
    kind: "video",
    model,
    provider: p.provider,
    durationSec: optionalNumber(p.durationSec),
    mode: p.mode,
    note: p.note,
    enforceCoverage: true,
    coverageParams: [],
    invoke: (conn, common, o) => {
      if (!conn.generateLipsync) {
        throw new NodeExecutionError(
          "provider-unsupported",
          `lipsync node "${node.id}": provider "${conn.id}" has no lipsync route — no registered connector implements generateLipsync yet (the HeyGen talking-photo flow is raw-API only; fal avatar routes are unregistered). Bind params.provider to a connector that does.`,
        );
      }
      return conn.generateLipsync({
        ...common,
        model: o?.model ?? model,
        image,
        audio,
        prompt: o?.prompt ?? p.prompt,
      });
    },
  });
};

/** tts: text → audio (generateVoiceover — the ElevenLabs connector path). */
export const ttsExecutor: NodeExecutor = async (node, ctx) => {
  const project = resolveProject(node, ctx);
  const slot = mediaSlot(node);
  const text = await requireText(node, ctx, project, "text");
  const model = aliasedModel(node);
  const p = node.params as {
    provider?: string;
    voiceId?: string;
    stability?: number;
    similarityBoost?: number;
    style?: number;
    speed?: number;
    speakerBoost?: boolean;
    mode?: string;
    note?: string;
  };
  if (!p.voiceId) {
    throw new NodeExecutionError(
      "params-invalid",
      `tts node "${node.id}" requires params.voiceId (the frozen production voice id)`,
    );
  }
  const sliders = ["stability", "similarityBoost", "style", "speed", "speakerBoost"] as const;
  return runMediaGeneration(node, ctx, project, slot, {
    kind: "voiceover",
    model,
    provider: p.provider,
    mode: p.mode,
    note: p.note,
    enforceCoverage: true,
    coverageParams: ["text", "voiceId", ...sliders.filter((k) => p[k] !== undefined)],
    invoke: (conn, common, o) =>
      conn.generateVoiceover!({
        ...common,
        text: o?.prompt ?? text,
        voiceId: String(p.voiceId),
        modelId: o?.model ?? model,
        voiceSettings: {
          stability: p.stability,
          similarity_boost: p.similarityBoost,
          style: p.style,
          speed: p.speed,
          use_speaker_boost: p.speakerBoost,
        },
      }),
  });
};

/** music: text → audio (generateMusic). */
export const musicExecutor: NodeExecutor = async (node, ctx) => {
  const project = resolveProject(node, ctx);
  const slot = mediaSlot(node);
  const prompt = await requireText(node, ctx, project, "prompt");
  const model = aliasedModel(node);
  const durationSec = requireDuration(node);
  const p = node.params as { provider?: string; forceInstrumental?: boolean; mode?: string; note?: string };
  return runMediaGeneration(node, ctx, project, slot, {
    kind: "music",
    model,
    provider: p.provider,
    durationSec,
    mode: p.mode,
    note: p.note,
    enforceCoverage: true,
    coverageParams: ["prompt", "durationSec", "forceInstrumental"],
    invoke: (conn, common, o) =>
      conn.generateMusic!({
        ...common,
        prompt: o?.prompt ?? prompt,
        durationSec,
        forceInstrumental: p.forceInstrumental !== false,
      }),
  });
};

/** sfx: text → audio (generateSfx). */
export const sfxExecutor: NodeExecutor = async (node, ctx) => {
  const project = resolveProject(node, ctx);
  const slot = mediaSlot(node);
  const prompt = await requireText(node, ctx, project, "prompt");
  const model = aliasedModel(node);
  const p = node.params as { provider?: string; durationSec?: number; promptInfluence?: number; mode?: string; note?: string };
  return runMediaGeneration(node, ctx, project, slot, {
    kind: "sfx",
    model,
    provider: p.provider,
    durationSec: optionalNumber(p.durationSec),
    mode: p.mode,
    note: p.note,
    enforceCoverage: true,
    coverageParams: [
      "prompt",
      ...(p.durationSec !== undefined ? ["durationSec"] : []),
      ...(p.promptInfluence !== undefined ? ["promptInfluence"] : []),
    ],
    invoke: (conn, common, o) =>
      conn.generateSfx!({
        ...common,
        prompt: o?.prompt ?? prompt,
        durationSec: optionalNumber(p.durationSec),
        promptInfluence: p.promptInfluence,
      }),
  });
};

/** transcribe: audio|video → object:transcript (the scribe-first invariant as a node). */
export const transcribeExecutor: NodeExecutor = async (node, ctx) => {
  const project = resolveProject(node, ctx);
  const src =
    optionalPortPath(node, ctx, project, "audio") ?? optionalPortPath(node, ctx, project, "video");
  if (!src) {
    throw new NodeExecutionError(
      "port-missing",
      `transcribe node "${node.id}" needs a source — wire the \`audio\` or \`video\` in-port (or set params.audio / params.video)`,
    );
  }
  const p = node.params as { slot?: string; language?: string; backend?: string };
  const slot = requireSlot(
    node,
    p.slot ?? `transcript-${path.basename(src, path.extname(src))}`,
  );

  const t0 = Date.now();
  // The existing transcription path (same lib as `ralphy ref transcribe` /
  // ralphy-captions): Scribe word-level by default.
  const result = await transcribe({
    audioPath: src,
    language: (p.language ?? "auto") as TranscribeLanguage,
    backend: (p.backend ?? "elevenlabs") as TranscribeBackend,
  });

  const payload = {
    captions: result.captions,
    language: result.language,
    languageProbability: result.languageProbability,
    durationSec: result.audioDurationSec,
    slot,
    model: result.model,
    backend: result.backend,
  };

  // Persist the word-level transcript under artifacts/captions/, auto-versioned.
  const outDir = artifactKindDir(project, "captions");
  await fs.mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `${slot}.json`);
  await protectExistingAsset(jsonPath, false);
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");

  await logGeneration(project, {
    provider: result.backend === "elevenlabs" ? "elevenlabs" : "openrouter",
    model: result.model,
    endpoint: result.model,
    kind: "text",
    slot,
    input: { slot, project, audio: src, backend: result.backend, node: node.id },
    output: { local: jsonPath, bytes: result.captions.length },
    status: "ok",
    latency_ms: Date.now() - t0,
    cost_usd: result.costUsd,
    note: `workflow node ${node.id}`,
  });
  ctx.reportCost(result.costUsd);
  await updateManifestSlot(project, slot, {
    kind: "captions",
    path: jsonPath,
    model: result.model,
    costUsd: result.costUsd,
  });

  return { output: payload, artifactPath: jsonPath };
};

// ─── B. Deterministic post-ops (existing lib code, $0, no spend gate) ────────

/** Prepare an auto-versioned destination under the project artifacts tree. */
async function postOpDst(
  project: string,
  kind: "images" | "videos",
  slot: string,
  ext: string,
): Promise<string> {
  const dir = artifactKindDir(project, kind);
  await fs.mkdir(dir, { recursive: true });
  const dst = path.join(dir, `${slot}${ext}`);
  await protectExistingAsset(dst, false); // invariant #14 — archive, never clobber
  return dst;
}

function postOpResult(
  ctx: ExecutorContext,
  node: WorkflowNode,
  project: string,
  slot: string,
  dst: string,
  provider: string,
  t0: number,
): Promise<ExecutorResult> {
  return ctx
    .log({
      provider,
      model: node.type,
      endpoint: node.type,
      kind: "image",
      status: "ok",
      input: { node: node.id, project, slot },
      output: { local: dst },
      latency_ms: Date.now() - t0,
      cost_usd: 0,
    })
    .then(() => ({ output: { projectId: project, slot, path: dst }, artifactPath: dst }));
}

/** remove-bg: flood-fill cutout (default) or chromakey — cli/lib/image/cutout.ts. */
export const removeBgExecutor: NodeExecutor = async (node, ctx) => {
  const project = resolveProject(node, ctx);
  const slot = mediaSlot(node);
  const src = requirePortPath(node, ctx, project, "image");
  const p = node.params as {
    method?: string;
    color?: string;
    tolerance?: number;
    similarity?: number;
    feather?: number;
    despill?: boolean;
  };
  const method = p.method ?? "flood";
  if (method !== "flood" && method !== "chromakey") {
    throw new NodeExecutionError(
      "params-invalid",
      `remove-bg node "${node.id}": params.method must be "flood" (die-cut-preserving flood-fill, default) or "chromakey" (got "${method}")`,
    );
  }
  const dst = await postOpDst(project, "images", slot, ".png");
  const note = `workflow node ${node.id}`;
  const t0 = Date.now();
  if (method === "flood") {
    await floodFillCutout({ src, dst, color: p.color, tolerance: p.tolerance, projectId: project, note });
  } else {
    await chromakey({
      src,
      dst,
      color: p.color,
      similarity: p.similarity,
      feather: p.feather,
      despill: p.despill,
      projectId: project,
      note,
    });
  }
  return postOpResult(ctx, node, project, slot, dst, method === "flood" ? "playwright" : "ffmpeg", t0);
};

/** reframe: centre-crop to a 9:16 vertical frame (the `ralphy clip --vertical` chain). */
export const reframeExecutor: NodeExecutor = async (node, ctx) => {
  const project = resolveProject(node, ctx);
  const slot = mediaSlot(node);
  const image = optionalPortPath(node, ctx, project, "image");
  const video = optionalPortPath(node, ctx, project, "video");
  if (!image && !video) {
    throw new NodeExecutionError(
      "port-missing",
      `reframe node "${node.id}" needs a source — wire the \`image\` or \`video\` in-port (or set params.image / params.video)`,
    );
  }
  if (image && video) {
    throw new NodeExecutionError(
      "params-invalid",
      `reframe node "${node.id}" got BOTH an image and a video source — wire exactly one`,
    );
  }
  const aspect = (node.params.aspect as string | undefined) ?? "9:16";
  if (aspect !== "9:16") {
    throw new NodeExecutionError(
      "params-invalid",
      `reframe node "${node.id}": only the "9:16" aspect is implemented (got "${aspect}")`,
    );
  }
  const note = `workflow node ${node.id}`;
  const t0 = Date.now();
  let dst: string;
  if (image) {
    dst = await postOpDst(project, "images", slot, ".png");
    await runFfmpeg(["-i", image, "-vf", VERTICAL_916_VF, "-frames:v", "1", dst], {
      endpoint: "ffmpeg/reframe",
      input: { src: image, dst, aspect },
      opts: { projectId: project, note },
    });
  } else {
    dst = await postOpDst(project, "videos", slot, path.extname(video!) || ".mp4");
    await runFfmpeg(
      [
        "-i", video!,
        "-vf", VERTICAL_916_VF,
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        dst,
      ],
      { endpoint: "ffmpeg/reframe", input: { src: video!, dst, aspect }, opts: { projectId: project, note } },
    );
  }
  return postOpResult(ctx, node, project, slot, dst, "ffmpeg", t0);
};

/** crunch: authentic PS1 downsample (the `ralphy image crunch` recipe). */
export const crunchExecutor: NodeExecutor = async (node, ctx) => {
  const project = resolveProject(node, ctx);
  const slot = mediaSlot(node);
  const src = requirePortPath(node, ctx, project, "image");
  const p = node.params as { scale?: number; noise?: number };
  const dst = await postOpDst(project, "images", slot, ".png");
  const t0 = Date.now();
  await ps1Crunch({
    src,
    dst,
    scale: p.scale,
    noise: p.noise,
    projectId: project,
    note: `workflow node ${node.id}`,
  });
  return postOpResult(ctx, node, project, slot, dst, "ffmpeg", t0);
};
