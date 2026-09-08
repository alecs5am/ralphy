import type { CanvasModelDescriptor } from "../../../../shared/canvas-runtime";
import type { GenerationField } from "../../../../shared/generation-studio";

export function canvasModelFields(model?: CanvasModelDescriptor): GenerationField[] {
  if (!model) return [];
  const fields: GenerationField[] = [];
  const choice = (id: string, label: string, values?: (string | number)[]) => {
    if (values?.length) fields.push({ id, label, type: "choice", default: "auto", options: [{ value: "auto", label: "Auto" }, ...values.filter((value) => String(value) !== "auto").map((value) => ({ value: String(value), label: `${value}${id === "duration" ? "s" : ""}` }))] });
  };
  choice("aspectRatio", "Aspect ratio", model.parameters.aspects);
  choice(model.modality === "image" ? "size" : "resolution", "Resolution", model.parameters.resolutions);
  choice("duration", "Duration", model.parameters.durations);
  if (model.modality === "video") fields.push({ id: "audio", label: "Generate audio", type: "toggle" });
  return fields;
}
