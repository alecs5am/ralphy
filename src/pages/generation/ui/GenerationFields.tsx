import { SlidersHorizontal } from "lucide-react";
import type { GenerationDraft, GenerationModel } from "../../../../shared/generation-studio";
import { STUDIO_LABEL } from "@/entities/generation"
import { GenerationParameter, GenerationStepper } from "@/entities/generation"

export function GenerationFields({ model, draft, onChange }: { model: GenerationModel; draft: GenerationDraft; onChange(draft: GenerationDraft): void }) {
  const fields = model.fields.filter((field) => field.id !== "voice");
  const tuning = draft.kind === "voiceover" && model.id !== "eleven_v3";
  const controls = fields.map((field) => <GenerationParameter key={field.id} field={field} value={draft.parameters[field.id]} onChange={(value) => {
    const parameters = { ...draft.parameters };
    if (value === undefined) delete parameters[field.id]; else parameters[field.id] = value;
    onChange({ ...draft, parameters });
  }} />);
  return <div className="generation-fields">
    {tuning && fields.length ? <details className="generation-tuning"><summary><SlidersHorizontal size={13} />Voice tuning<span className="generation-count">{fields.length}</span></summary><div className="generation-fields">{controls}</div></details> : controls}
    <div className="generation-variations"><span className={STUDIO_LABEL}>Variations</span><GenerationStepper label="Variations" min={1} max={4} value={draft.variants} onChange={(value) => { if (value && Number.isInteger(value) && value >= 1 && value <= 4) onChange({ ...draft, variants: value as GenerationDraft["variants"] }); }} /></div>
  </div>;
}
