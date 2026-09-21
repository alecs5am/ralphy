import type { GenerationDraft, GenerationField, GenerationModel } from "../../../../shared/generation-studio";
import { GenerationStepper } from "@/entities/generation";
import { SelectMenu } from "@/shared/ui/SelectMenu";

export const quickGenerationField = (field: GenerationField) => field.type === "choice" && ["aspect", "aspectRatio", "resolution", "duration"].includes(field.id);

export function GenerationQuickControls({ model, draft, onChange }: { model: GenerationModel; draft: GenerationDraft; onChange(draft: GenerationDraft): void }) {
  return <>
    {model.fields.filter(quickGenerationField).map((field) => <SelectMenu key={field.id} overlayOwner="generation.parameters" tone="caller" className="generation-quick-select" ariaLabel={field.label} prefix={!(draft.parameters[field.id] ?? field.default) ? field.label : undefined} side="top" value={String(draft.parameters[field.id] ?? field.default ?? "")} options={field.options ?? []} onValueChange={(value) => onChange({ ...draft, parameters: { ...draft.parameters, [field.id]: value } })} />)}
    <GenerationStepper label="Variations" min={1} max={4} value={draft.variants} onChange={(value) => { if (value && Number.isInteger(value) && value >= 1 && value <= 4) onChange({ ...draft, variants: value as GenerationDraft["variants"] }); }} />
  </>;
}
