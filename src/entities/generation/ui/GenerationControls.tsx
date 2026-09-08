import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Minus, Plus } from "@/shared/ui/icons";
import type { GenerationField } from "../../../../shared/generation-studio";
import { SelectMenu } from "@/shared/ui/SelectMenu";
import { STUDIO_FIELD, STUDIO_LABEL } from "./generation-chrome";

export function GenerationStepper({ label, value, min, max, step = 1, unit, onChange }: {
  label: string; value: number | undefined; min: number; max: number; step?: number; unit?: string; onChange(value: number | undefined): void;
}) {
  const move = (direction: number) => onChange(Number(Math.min(max, Math.max(min, (value ?? min) + direction * step)).toFixed(6)));
  return <div className="generation-stepper" role="group" aria-label={label}>
    <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} disabled={value !== undefined && value <= min} onClick={() => move(-1)}><Minus size={12} /></button>
    <span><input aria-label={label} type="number" min={min} max={max} step={step} value={value ?? ""} onChange={(event) => onChange(event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value))} />{unit && <small>{unit}</small>}</span>
    <button type="button" aria-label={`Increase ${label.toLowerCase()}`} disabled={value !== undefined && value >= max} onClick={() => move(1)}><Plus size={12} /></button>
  </div>;
}

function AspectGlyph({ value }: { value: string }) {
  const [width, height] = value.split(":").map(Number);
  if (!width || !height) return null;
  const scale = 12 / Math.max(width, height);
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x={(14 - width * scale) / 2} y={(14 - height * scale) / 2} width={width * scale} height={height * scale} rx="1.5" stroke="currentColor" strokeWidth="1.4" /></svg>;
}

function GenerationChoices({ field, value, onChange }: { field: GenerationField; value: string; onChange(value: string): void }) {
  const container = useRef<HTMLDivElement>(null);
  const segments = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(false);
  const options = field.options ?? [];
  const compact = options.length > 5;
  useLayoutEffect(() => {
    if (compact || !container.current || !segments.current) return;
    const measure = () => setFits(segments.current!.scrollWidth <= container.current!.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container.current);
    observer.observe(segments.current);
    return () => observer.disconnect();
  }, [compact, options]);
  const showSegments = !compact && fits;
  const menuOptions = options.map((option) => ({ ...option, label: field.id === "aspectRatio" && option.value === "auto" ? "Auto" : option.label, icon: field.id === "aspectRatio" ? <AspectGlyph value={option.value} /> : undefined }));
  if (field.id === "aspectRatio") menuOptions.sort((a, b) => Number(b.value === "auto") - Number(a.value === "auto"));
  return <div ref={container} className="generation-choice-control">
    {!compact && <div ref={segments} id={`generation-${field.id}`} className="generation-choices" data-collapsed={!showSegments} aria-hidden={!showSegments || undefined} inert={!showSegments || undefined} role="group" aria-label={field.label}>{options.map((option) => <button key={option.value} type="button" tabIndex={showSegments ? 0 : -1} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{field.id === "aspectRatio" && <AspectGlyph value={option.value} />}<span>{option.label}</span></button>)}</div>}
    {!showSegments && <SelectMenu overlayOwner="generation.parameters" tone="caller" className={`${STUDIO_FIELD} generation-choice-select`} contentClassName={field.id === "aspectRatio" ? "generation-aspect-menu" : undefined} ariaLabel={field.label} value={value} options={menuOptions} onValueChange={onChange} />}
  </div>;
}

const poles: Record<string, [string, string]> = {
  stability: ["Expressive", "Steady"], similarityBoost: ["Loose", "Faithful"], style: ["Subtle", "Expressive"],
  promptInfluence: ["Loose", "Literal"], speed: ["Slower", "Faster"],
};

function GenerationRuler({ field, value, onChange }: { field: GenerationField; value: string | number | boolean | undefined; onChange(value: string | number): void }) {
  const options = field.type === "choice" ? field.options : undefined;
  const min = options ? 0 : field.min!, max = options ? options.length - 1 : field.max!, step = options ? 1 : field.step ?? 0.01;
  const raw = value ?? field.default;
  const current = options ? Math.max(0, options.findIndex((item) => item.value === String(raw))) : Number(raw ?? min);
  const progress = Math.min(1, Math.max(0, (current - min) / (max - min || 1)));
  const percentage = !options && min === 0 && max === 1;
  const duration = field.id === "duration";
  const displayed = raw === undefined ? "—" : percentage ? Math.round(Number(raw) * 100) : String(raw);
  const count = Math.round((max - min) / step);
  const tickCount = Math.min(24, count);
  const ticks = !percentage && field.id !== "speed" ? Array.from({ length: tickCount + 1 }, (_, index) => index / tickCount) : [];
  const labels = duration ? Array.from({ length: 5 }, (_, index) => {
    const position = Math.round(count * index / 4);
    return options ? options[position]?.label : Number((min + position * step).toFixed(2));
  }) : poles[field.id] ?? (percentage ? ["Less", "More"] : [String(min), String(max)]);
  return <div className="generation-parameter">
    <label className={STUDIO_LABEL} htmlFor={`generation-${field.id}`}>{duration ? "Duration" : field.label}<span className="generation-ruler-value"><strong>{displayed}</strong><small>{percentage ? "%" : duration ? "s" : field.id === "speed" ? "×" : ""}</small></span></label>
    <div className="generation-ruler" style={{ "--ruler-progress": progress } as CSSProperties}>
      <span className="generation-ruler-fill" aria-hidden="true" />
      <span className="generation-ruler-ticks" aria-hidden="true">{ticks.map((position, index) => <i key={index} data-major={index === 0 || index === tickCount || index % Math.max(1, Math.round(tickCount / 4)) === 0} data-filled={position < progress} style={{ left: `${position * 100}%` }} />)}</span>
      <input id={`generation-${field.id}`} aria-label={field.label} aria-valuetext={`${displayed}${percentage ? " percent" : duration ? " seconds" : field.id === "speed" ? " times" : ""}`} type="range" min={min} max={max} step={step} value={current} onChange={(event) => onChange(options ? options[Number(event.currentTarget.value)]!.value : Number(event.currentTarget.value))} />
    </div>
    <span className="generation-ruler-labels" aria-hidden="true">{labels.map((label, index) => <span key={index}>{label}</span>)}</span>
  </div>;
}

export function GenerationParameter({ field, value, onChange }: { field: GenerationField; value: string | number | boolean | undefined; onChange(value: string | number | boolean | undefined): void }) {
  const label = field.id === "duration" ? "Duration" : field.id === "aspectRatio" ? "Aspect" : field.id === "negative" ? "Avoid" : field.label;
  const current = value ?? field.default;
  if (field.type === "toggle") return <label className="generation-toggle"><span>{label}</span><input type="checkbox" checked={Boolean(current)} onChange={(event) => onChange(event.currentTarget.checked)} /><i aria-hidden="true" /></label>;
  const numericOptions = field.type === "choice" && (field.options?.length ?? 0) >= 10 && field.options?.every((item) => item.value.trim() && Number.isFinite(Number(item.value)));
  const bounded = field.type === "number" && field.min !== undefined && field.max !== undefined && field.max > field.min;
  if (numericOptions || bounded && field.max! - field.min! <= 100) return <GenerationRuler field={field} value={current} onChange={onChange} />;
  return <div className="generation-parameter">
    <label className={STUDIO_LABEL} htmlFor={`generation-${field.id}`}>{label}{field.type === "text" && <small>{field.required ? "Required" : "Optional"}</small>}</label>
    {field.type === "choice" ? <GenerationChoices field={field} value={String(current ?? "")} onChange={onChange} />
      : bounded ? <GenerationStepper label={field.label} value={current === undefined ? undefined : Number(current)} min={field.min!} max={field.max!} step={field.step} unit={field.id === "duration" ? "s" : undefined} onChange={onChange} />
        : <input id={`generation-${field.id}`} className={STUDIO_FIELD} type={field.type === "number" ? "number" : "text"} value={String(current ?? "")} min={field.min} max={field.max} step={field.step ?? "any"} required={field.required} maxLength={20000} placeholder={field.id === "negative" ? "Text, watermarks, unwanted details…" : "Optional"} onChange={(event) => onChange(event.currentTarget.value === "" ? undefined : field.type === "number" ? Number(event.currentTarget.value) : event.currentTarget.value)} />}
  </div>;
}
