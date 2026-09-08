import { createHash } from "node:crypto";
import type { CanvasNode, WorkflowCanvas } from "../../shared/workflow-canvas";
import { parseCanvas } from "../../shared/workflow-canvas";
import { GENERATION_CANVAS_ID, GENERATION_INPUT_ROLES, type GenerationDraft, type GenerationModel } from "../../shared/generation-studio";
import type { CanvasCli } from "./runtime-cli";

export function generationSnapshot(draft: GenerationDraft, name = draft.modelId || "Generation"): WorkflowCanvas {
  const media: CanvasNode[] = draft.inputs.map(({ role, asset }, index) => ({ id: `input-${index}`, kind: "media", title: asset.name.slice(0, 160), value: "", x: 0, y: index * 300, config: { asset, operation: role } }));
  return { version: 2, id: GENERATION_CANVAS_ID, name: "Generation studio", nodes: [...media, { id: "generation", kind: "model", title: name.slice(0, 160), value: draft.prompt, x: 400, y: 0, config: { provider: draft.provider, modelId: draft.modelId, modality: draft.kind === "image" || draft.kind === "video" ? draft.kind : "audio", operation: draft.kind, parameters: draft.parameters, variants: draft.variants } }], edges: media.map((node) => ({ from: node.id, to: "generation", sourcePort: "media", targetPort: node.config?.asset?.kind === "video" ? "video" : "reference" })) };
}

/** Partial forms can be saved; complete catalog validation happens only at generation time. */
export function parseGenerationDraft(value: unknown): GenerationDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid generation draft");
  const draft = value as GenerationDraft;
  if (!["image", "video", "voiceover", "music", "sfx"].includes(draft.kind)
    || typeof draft.modelId !== "string" || draft.modelId.length > 256 || typeof draft.provider !== "string"
    || draft.provider.length > 128 || typeof draft.prompt !== "string" || draft.prompt.length > 20_000
    || ![1, 2, 3, 4].includes(draft.variants) || !Array.isArray(draft.inputs) || draft.inputs.length > 20
    || !draft.parameters || typeof draft.parameters !== "object" || Array.isArray(draft.parameters)) throw new Error("Invalid generation draft");
  for (const item of draft.inputs) if (!item || !GENERATION_INPUT_ROLES.includes(item.role as typeof GENERATION_INPUT_ROLES[number])) throw new Error("Invalid generation input role");
  // Reuse the persisted canvas trust boundary, while allowing incomplete form combinations.
  const snapshot = generationSnapshot(draft);
  const checked = parseCanvas({ ...snapshot, edges: [] });
  const config = checked.nodes.at(-1)!.config!;
  return { kind: draft.kind, modelId: config.modelId!, provider: config.provider!, prompt: checked.nodes.at(-1)!.value, variants: config.variants as GenerationDraft["variants"], parameters: config.parameters ?? {}, inputs: checked.nodes.slice(0, -1).map((node) => ({ role: node.config!.operation!, asset: node.config!.asset! })) };
}

export function validateGenerationDraft(draft: GenerationDraft, model: GenerationModel, mode: "preview" | "execute"): GenerationDraft {
  if (draft.kind !== model.kind || draft.modelId !== model.id || draft.provider !== model.provider) throw new Error("Choose a model from the current catalog");
  if (mode === "execute" && !model.available) throw new Error(`Connect ${model.provider} in provider settings before generating`);
  if (mode === "preview" && !model.previewSupported) throw new Error("Sound effect previews are not supported by the installed runtime");
  if (!draft.prompt.trim()) throw new Error(model.kind === "voiceover" ? "Enter your script first" : "Enter a prompt first");
  const voiceLimit = model.id === "eleven_v3" ? 5000 : model.id === "eleven_multilingual_v2" ? 10_000 : null;
  if (voiceLimit && draft.prompt.length > voiceLimit) throw new Error(`${model.name} accepts scripts up to ${voiceLimit.toLocaleString("en-US")} characters`);
  const parameters = { ...draft.parameters };
  for (const key of Object.keys(parameters)) if (!model.fields.some((field) => field.id === key)) throw new Error(`Unsupported model parameter: ${key}`);
  for (const field of model.fields) {
    const value = parameters[field.id] ?? field.default;
    if (value === undefined || value === "") { if (field.required) throw new Error(`${field.label} is required`); continue; }
    if (field.type === "toggle" && typeof value !== "boolean" || field.type === "text" && typeof value !== "string"
      || field.type === "choice" && !field.options?.some((option) => option.value === String(value))
      || field.type === "number" && (typeof value !== "number" || !Number.isFinite(value) || field.min !== undefined && value < field.min || field.max !== undefined && value > field.max)) throw new Error(`Choose a valid ${field.label.toLowerCase()}`);
    if (field.required && typeof value === "string" && !value.trim()) throw new Error(`${field.label} is required`);
    parameters[field.id] = value;
  }
  for (const item of draft.inputs) {
    const spec = model.inputs.find((input) => input.id === item.role);
    if (!spec || spec.kind !== item.asset.kind) throw new Error("This model does not accept that input");
  }
  for (const spec of model.inputs) {
    const count = draft.inputs.filter((item) => item.role === spec.id).length;
    if (count > spec.maxCount || spec.required && !count) throw new Error(`Choose ${spec.required ? "1" : "0"}–${spec.maxCount} ${spec.label.toLowerCase()}`);
  }
  return { ...draft, parameters };
}

export async function preflightGeneration(cli: CanvasCli, draft: GenerationDraft): Promise<void> {
  const args = ["models", "preflight", "--kind", draft.kind, "--model", draft.modelId, "--prompt-chars", String(draft.prompt.length), "--refs", String(draft.inputs.filter((item) => item.role === "refs").length)];
  for (const [parameter, flag] of [["duration", "--duration"], ["aspectRatio", "--aspect"], ["size", "--size"]]) if (draft.parameters[parameter!] !== undefined) args.push(flag!, String(draft.parameters[parameter!]));
  if (draft.parameters.audio === true) args.push("--audio");
  if (draft.inputs.some((item) => item.role === "firstFrame")) args.push("--first-frame");
  if (draft.inputs.some((item) => item.role === "lastFrame")) args.push("--last-frame");
  const result = await cli(args) as { ok?: boolean; violations?: { message?: string }[] };
  if (result?.ok !== true) throw new Error(result?.violations?.map((item) => item.message).filter(Boolean).join("\n") || "The runtime could not validate this generation");
}

export const generationRevision = (draft: GenerationDraft) => createHash("sha256").update(JSON.stringify(draft)).digest("hex");
