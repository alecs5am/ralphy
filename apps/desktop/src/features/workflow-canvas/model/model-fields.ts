import type { CanvasModelDescriptor } from "../../../../shared/canvas-runtime";
import type { GenerationField } from "../../../../shared/generation-studio";

export function canvasModelFields(model?: CanvasModelDescriptor): GenerationField[] {
  if (!model) return [];
  if (model.operation === "music") return [{ id: "duration", label: "Duration (seconds)", type: "number", min: 3, max: 600, step: 1, default: 30 }, { id: "withVocals", label: "Allow vocals", type: "toggle", default: false }];
  if (model.operation === "sfx") return [{ id: "duration", label: "Duration (seconds)", type: "number", min: 0.5, max: 22, step: 0.5, default: 4 }, { id: "promptInfluence", label: "Prompt influence", type: "number", min: 0, max: 1, step: 0.01, default: 0.4 }];
  const fields: GenerationField[] = [];
  const choice = (id: string, label: string, values?: (string | number)[]) => {
    if (values?.length) fields.push({ id, label, type: "choice", default: "auto", options: [{ value: "auto", label: "Auto" }, ...values.filter((value) => String(value) !== "auto").map((value) => ({ value: String(value), label: `${value}${id === "duration" ? "s" : ""}` }))] });
  };
  choice("aspectRatio", "Aspect ratio", model.parameters.aspects);
  if (model.id !== "fal-ai/kling-video/o3/pro/reference-to-video") choice(model.modality === "image" ? "size" : "resolution", "Resolution", model.parameters.resolutions);
  choice("duration", "Duration", model.parameters.durations);
  if (model.modality === "video" && model.supportedParams?.includes("generateAudio")) fields.push({ id: "audio", label: "Generate audio", type: "toggle" });
  return fields;
}
