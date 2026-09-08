import { SelectMenu } from "@/shared/ui/SelectMenu";

export function CanvasNodeChoices({ label, ariaLabel, value, options, disabled, onChange }: {
  label: string;
  ariaLabel: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange(value: string): void;
}) {
  return <label className="flex min-w-0 flex-col gap-1.5"><span className="canvas-node-meta">{label}</span><fieldset className="nodrag nopan m-0 min-w-0 border-0 p-0 disabled:opacity-50" disabled={disabled}><SelectMenu overlayOwner="canvas.parameters" ariaLabel={ariaLabel} tone="caller" className="h-9 w-full rounded-field bg-field px-3 type-xs text-ink hover:bg-row-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink" value={value} options={options} onValueChange={onChange} /></fieldset></label>;
}
