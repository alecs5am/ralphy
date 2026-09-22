import type { GenerationInputSpec, GenerationModel } from "../../../../shared/generation-studio";
import type { GenerationHandoff } from "@/shared/model/generation-handoff";

/**
 * Which of a model's reference slots a handed-over file belongs in.
 *
 * "Animate this still" means the picture is where the shot starts, so it goes to the opening
 * frame when the model has one. Everything else is a reference. A model that has neither takes
 * nothing, and the page says so rather than dropping the file into whatever slot came first.
 */
export function handoffRole(model: GenerationModel | undefined, kind: GenerationInputSpec["kind"], intent: GenerationHandoff["intent"]): string | null {
  const accepts = model?.inputs.filter((input) => input.kind === kind) ?? [];
  const opening = accepts.find((input) => input.id === "firstFrame");
  if (intent === "animate" && opening) return opening.id;
  return (accepts.find((input) => input.id === "refs" || input.id === "refVideos") ?? accepts[0])?.id ?? null;
}
