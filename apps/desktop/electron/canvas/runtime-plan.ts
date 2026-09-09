import type { CanvasNode } from "../../shared/workflow-canvas";
import type { CanvasRunResult } from "../../shared/canvas-runtime";

const PARAMETERS: Record<string, Record<string, string>> = {
  image: { aspectRatio: "--aspect", size: "--size", negative: "--negative" },
  video: { duration: "--duration", durationSec: "--duration", aspectRatio: "--aspect-ratio", resolution: "--resolution", audio: "--audio" },
  voiceover: { voice: "--voice", stability: "--stability", similarityBoost: "--similarity-boost", style: "--style", speed: "--speed", speakerBoost: "--no-speaker-boost" },
  music: { duration: "--duration", withVocals: "--with-vocals" },
  sfx: { duration: "--duration", promptInfluence: "--prompt-influence" },
};

export { selectedCanvasNodes } from "../../shared/workflow-canvas";

export function modelPrompt(node: CanvasNode, inputs: CanvasRunResult[]): string {
  const connected = inputs.filter((result) => result.kind === "text");
  return connected.length ? connected.map((result) => result.text ?? "").join("\n\n") : node.value;
}

export function generationArguments(node: CanvasNode, inputs: CanvasRunResult[], slot: string, roles = new Map<string, string>()): string[] {
  const config = node.config, modality = config?.modality;
  if (!modality || modality === "text") throw new Error("Choose an image, video or voice model");
  const task = modality === "audio" ? config?.operation ?? "voiceover" : modality;
  if (!PARAMETERS[task]) throw new Error("Choose a supported generation task");
  const provider = config?.provider ?? (modality === "audio" ? "elevenlabs" : "openrouter");
  if (!(["openrouter", "elevenlabs", "fal"]).includes(provider)) throw new Error("This provider is not supported by the installed runtime");
  if (!config?.modelId || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,255}$/.test(config.modelId)) throw new Error("Choose a model before running this node");
  const prompt = modelPrompt(node, inputs);
  if (!prompt.trim()) throw new Error("Connect a prompt or enter instructions before running this model");
  if (prompt.length > 100_000) throw new Error("Combined model instructions are too long");
  const args = ["generate", task, "--slot", slot, "--provider", provider, ...(["music", "sfx"].includes(task) ? [] : ["--model", config.modelId]), task === "voiceover" ? "--text" : "--prompt", prompt];
  for (const [key, value] of Object.entries(config.parameters ?? {})) {
    const flag = PARAMETERS[task]?.[key];
    if (!flag) throw new Error(`Unsupported ${modality} parameter: ${key}`);
    if (["audio", "withVocals", "speakerBoost"].includes(key)) { if (typeof value !== "boolean") throw new Error(`${key} must be enabled or disabled`); if (key === "speakerBoost" ? !value : value) args.push(flag); continue; }
    if (typeof value === "boolean" || (typeof value === "string" && (value.length > 20_000 || value.includes("\0")))) throw new Error(`Invalid ${key}`);
    args.push(flag, String(value));
  }
  if (task === "voiceover" && !config.parameters?.voice) throw new Error("Choose an ElevenLabs voice ID for this voiceover");
  if (roles.size) {
    const flags: Record<string, string> = { refs: "--ref", firstFrame: "--first-frame", lastFrame: "--last-frame", refVideos: "--ref-video" };
    for (const role of new Set(roles.values())) {
      if (!flags[role]) throw new Error("Unsupported generation input role");
      const paths = inputs.filter((item) => roles.get(item.nodeId) === role && item.asset).map((item) => item.asset!.path);
      if (paths.length) args.push(flags[role]!, ...paths);
    }
    return args;
  }
  const images = inputs.filter((result) => result.asset?.kind === "image").map((result) => result.asset!.path);
  const videos = inputs.filter((result) => result.asset?.kind === "video").map((result) => result.asset!.path);
  if (modality === "image" && images.length) args.push("--ref", ...images);
  if (modality === "video") {
    if (images.length) args.push("--first-frame", images[0]!);
    if (images.length > 1) args.push("--ref", ...images.slice(1));
    if (videos.length) args.push("--ref-video", ...videos);
  }
  return args;
}
