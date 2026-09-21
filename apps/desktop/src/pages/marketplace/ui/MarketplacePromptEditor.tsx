import { promptVariables } from "../lib/prompt-variables";
import { promptDirections } from "../lib/prompt-directions";
import type { MarketplaceItemPresentation } from "../lib/presentation";
import { Check, ArrowUpRight } from "@/shared/ui/icons";

export function MarketplacePromptEditor({ item, source, prompt, values, onChange, onSelectDirection }: {
  item?: MarketplaceItemPresentation;
  source: string; prompt: string; values: Record<string, string>; onChange(values: Record<string, string>): void;
  onSelectDirection?(source: string, values: Record<string, string>): void;
}) {
  const fields = promptVariables(source);
  const directions = promptDirections(item);
  return <section className="explore-prompt-editor" aria-label="Customize prompt">
    {directions.length > 0 && onSelectDirection && <section className="explore-prompt-directions" aria-label="Prompt starting points">
      <div className="explore-inspector-heading"><h3>Try a direction</h3><span>{directions.length} starting points</span></div>
      <div className="explore-direction-choices">{directions.map((direction) => {
        const selected = prompt === direction.prompt;
        return <button key={direction.label} type="button" className="explore-direction-choice" aria-pressed={selected}
          onClick={() => onSelectDirection(direction.source, direction.values)}>
          <span><strong>{direction.label}</strong><small>{direction.intent}</small></span>
          {selected ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />}
        </button>;
      })}</div>
      <p className="explore-guide-note">These fill the prompt below. The sample image stays the same.</p>
    </section>}
    {fields.length > 0 && <div className="explore-prompt-fields">
      <div className="explore-inspector-heading"><h3>Make it yours</h3><button type="button" disabled={!Object.keys(values).length} onClick={() => onChange({})}>Clear fields</button></div>
      {fields.map((field) => <label key={field} className="explore-prompt-field">
        <span>{field[0]!.toUpperCase() + field.slice(1)}</span>
        <input type="text" value={values[field] ?? ""} placeholder={`Your ${field}`} maxLength={500}
          onInput={(event) => onChange({ ...values, [field]: event.currentTarget.value })} />
      </label>)}
    </div>}
    <div className="explore-prompt-document">
      <div className="explore-inspector-heading"><h3>Your prompt</h3><span>{prompt.split(/\s+/).filter(Boolean).length} words</span></div>
      <div className="explore-prompt-prose">{prompt.split(/\n\n+/).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph.split(/(\[[a-z][a-z\s-]{0,40}\])/gi).map((part, index) => part.startsWith("[") && part.endsWith("]") ? <mark key={index}>{part}</mark> : part)}</p>)}</div>
    </div>
  </section>;
}
