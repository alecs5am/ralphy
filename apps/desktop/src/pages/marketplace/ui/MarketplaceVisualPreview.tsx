import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Pause, Play } from "@/shared/ui/icons";
import { RulerSlider } from "@/shared/ui/RulerSlider";
import { SelectMenu } from "@/shared/ui/SelectMenu";
import type { MarketplaceItemPresentation } from "../lib/presentation-types";
import { visualAppearance, visualFormat, visualSceneMarkup, visualSpeed, visualStyleVariables, visualTitle, visualVariantSettings, type VisualSettings, type VisualVariant } from "../lib/studio-visual-scenes";
import { studioVisualCss } from "../lib/studio-visual-styles";
import { remocnVisualAppearance, remocnVisualFormat, remocnVisualSceneMarkup, remocnVisualSpeed, remocnVisualStyleVariables, remocnVisualTitle, remocnVisualVariantSettings } from "../lib/studio-remocn-preview";
import { studioRemocnPreviewCss } from "../lib/studio-remocn-preview-css";
import "../lib/studio-visual-preview.css";

export function MarketplaceVisualControls({ item, settings, onSettingsChange }: {
  item: MarketplaceItemPresentation;
  settings?: VisualSettings;
  onSettingsChange(settings: VisualSettings): void;
}) {
  const id = item.studio?.visualId;
  const remocn = item.studio?.remocnVisual;
  if (!id && !remocn) return null;
  const selected = settings ?? item.studio?.settings ?? {};
  const speed = id ? visualSpeed(selected) : remocnVisualSpeed(selected);
  const appearance = id ? visualAppearance(id, selected) : remocnVisualAppearance(remocn!, selected);
  const format = id ? visualFormat(id, selected) : remocnVisualFormat(remocn!, selected);
  const update = (next: VisualSettings) => onSettingsChange({ ...item.studio?.settings, ...selected, ...next });
  const variants: { id: VisualVariant; name: string }[] = [{ id: "original", name: "Original" }, { id: "night", name: id === "split-reveal" ? "Soft type" : "Night" }, { id: "paper", name: id === "split-reveal" ? "Bold type" : "Paper" }];
  return <div className="explore-visual-settings">
    <div className="flex items-center justify-between gap-3"><h3 className="type-title font-medium">Customize</h3><button type="button" className="type-xs text-muted hover:text-ink" onClick={() => onSettingsChange({ ...item.studio?.settings })}>Reset</button></div>
    <div className="explore-visual-variants" role="group" aria-label={`Style variants for ${item.name}`}>
      {variants.map((variant) => {
        const preset = id ? visualVariantSettings(id, variant.id) : remocnVisualVariantSettings(remocn!, variant.id);
        const current = Object.entries(preset).every(([key, value]) => (appearance as Record<string, string | number>)[key] === value);
        return <button key={variant.id} type="button" className="explore-visual-variant" aria-pressed={current} onClick={() => update(preset)}>
          <span className="explore-visual-variant-sample" style={{ color: preset.textColor as string, backgroundColor: preset.backgroundColor as string, fontWeight: preset.fontWeight as number }} aria-hidden="true">Aa</span>
          <span>{variant.name}</span>
        </button>;
      })}
    </div>
    <div className="explore-visual-fields">
      <label className="explore-visual-field explore-visual-title">Title
        <input aria-label={`Title for ${item.name}`} value={id ? visualTitle(id, selected) : remocnVisualTitle(remocn!, selected)} maxLength={60} onChange={(event) => update({ title: event.currentTarget.value })} />
        <span className="type-meta text-muted">Use / for a new line.</span>
      </label>
      <div className="explore-visual-field">Format
        <div className="explore-visual-format" role="group" aria-label={`Format for ${item.name}`}>
          {([{ id: "wide", label: "16:9", name: "Wide" }, { id: "square", label: "1:1", name: "Square" }, { id: "portrait", label: "9:16", name: "Portrait" }] as const).map((option) =>
            <button key={option.id} type="button" aria-label={`${option.name} format for ${item.name}`} aria-pressed={format === option.id} onClick={() => update({ format: option.id })}><i data-format={option.id} aria-hidden="true" /><span>{option.label}</span></button>)}
        </div>
      </div>
      <VisualSlider label="Text size" itemName={item.name} value={Math.round(appearance.fontScale * 100)} min={70} max={125} step={5} defaultValue={100} suffix="%" onChange={(value) => update({ fontScale: value / 100 })} />
      <div className="explore-visual-field">Font weight
        <SelectMenu ariaLabel={`Font weight for ${item.name}`} overlayOwner="marketplace.visual" tone="caller" value={String(appearance.fontWeight)}
          options={[[300, "Light"], [400, "Regular"], [500, "Medium"], [600, "Semibold"], [700, "Bold"], [800, "Extra bold"]].map(([value, label]) => ({ value: String(value), label: String(label) }))}
          onValueChange={(value) => update({ fontWeight: Number(value) })} />
      </div>
      <VisualColor label="Text color" itemName={item.name} value={appearance.textColor} onChange={(value) => update({ textColor: value })} />
      {id !== "split-reveal" && <VisualColor label="Background" itemName={item.name} value={appearance.backgroundColor} onChange={(value) => update({ backgroundColor: value })} />}
      <VisualSlider label="Motion speed" itemName={item.name} value={speed} min={0.5} max={2} step={0.25} defaultValue={1} suffix="×" onChange={(value) => update({ speed: value })} />
    </div>
  </div>;
}

function VisualSlider({ label, itemName, value, min, max, step, defaultValue, suffix, onChange }: {
  label: string; itemName: string; value: number; min: number; max: number; step: number; defaultValue: number; suffix: string; onChange(value: number): void;
}) {
  return <div className="explore-visual-field"><div className="flex items-center justify-between gap-3"><span>{label}</span><output className="tabular-nums text-muted">{value}{suffix}</output></div>
    <RulerSlider min={min} max={max} step={step} value={value} defaultValue={defaultValue} tickCount={7} ariaLabel={`${label} for ${itemName}`} ariaValueText={`${value}${suffix}`} onValueChange={onChange} />
  </div>;
}

function VisualColor({ label, itemName, value, onChange }: { label: string; itemName: string; value: string; onChange(value: string): void }) {
  return <label className="explore-visual-field">{label}<span className="explore-visual-color"><input type="color" aria-label={`${label} for ${itemName}`} value={value} onChange={(event) => onChange(event.currentTarget.value)} /><span className="font-mono type-xs">{value.toUpperCase()}</span></span></label>;
}

export function MarketplaceVisualPreview({ item, compact = false, active = true, settings, onSettingsChange, showControls = true, onUnavailable }: {
  item: MarketplaceItemPresentation;
  compact?: boolean;
  active?: boolean;
  settings?: VisualSettings;
  onSettingsChange?(settings: VisualSettings): void;
  showControls?: boolean;
  onUnavailable?(): void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [localSettings, setLocalSettings] = useState<VisualSettings>(item.studio?.settings ?? { speed: 1 });
  const [visible, setVisible] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [paused, setPaused] = useState(false);
  const [manual, setManual] = useState(false);
  const [failed, setFailed] = useState(false);
  const id = item.studio?.visualId;
  const remocn = item.studio?.remocnVisual;
  const title = id ? visualTitle(id, settings ?? localSettings) : remocn ? remocnVisualTitle(remocn, settings ?? localSettings) : "";
  const selected = settings ?? localSettings;
  const format = id ? visualFormat(id, selected) : remocn ? remocnVisualFormat(remocn, selected) : "portrait";
  const style = id ? visualStyleVariables(id, selected) as CSSProperties : remocn ? remocnVisualStyleVariables(remocn, selected) as CSSProperties : undefined;
  // Keep the clicked image mounted when focus starts playback before the click completes.
  const markup = useMemo(() => ({ __html: id ? visualSceneMarkup(id, undefined, { title }) : remocn ? remocnVisualSceneMarkup(remocn, { title }) : "" }), [id, remocn, title]);
  const playing = active && visible && !hidden && !paused && (!reduced || manual);

  useEffect(() => {
    setLocalSettings(item.studio?.settings ?? { speed: 1 });
    setPaused(false); setManual(false); setFailed(false);
  }, [item.key]);
  useEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const motion = () => { setReduced(preference?.matches ?? false); setManual(false); };
    const visibility = () => setHidden(document.visibilityState === "hidden");
    motion(); visibility();
    preference?.addEventListener?.("change", motion);
    document.addEventListener("visibilitychange", visibility);
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), { threshold: 0.05 });
    if (stage.current) observer?.observe(stage.current);
    return () => { observer?.disconnect(); preference?.removeEventListener?.("change", motion); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  if (!id && !remocn) return null;
  return <div className={`explore-visual-preview${compact ? " explore-visual-preview-compact" : ""}`}>
    <style href="ralphy-studio-visuals" precedence="default">{studioVisualCss}</style>
    <style href="ralphy-remocn-visuals" precedence="default">{studioRemocnPreviewCss}</style>
    <div ref={stage} className="explore-visual-stage" data-format={format} style={style} onErrorCapture={() => { if (!failed) { setFailed(true); onUnavailable?.(); } }}>
      {failed ? <p className="grid size-full place-items-center type-sm text-muted" role="status">This visual could not load.</p>
        : <div className={id ? `sv-scene sv-${id}` : `rv-scene rv-${remocn!.group}`} role="img" aria-label={`${item.name} motion preview`} data-remocn-id={remocn?.id} data-remocn-scene={remocn?.scene} data-format={format} data-playing={playing ? "true" : "false"} data-motion={manual ? "manual" : "auto"} style={style} dangerouslySetInnerHTML={markup} />}
      {!compact && !failed && <button type="button" className="explore-effect-play" aria-label={`${playing ? "Pause" : "Play"} preview for ${item.name}`} onClick={() => { setPaused(playing); if (!playing) setManual(true); }}>
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </button>}
    </div>
    {!compact && showControls && <MarketplaceVisualControls item={item} settings={settings ?? localSettings} onSettingsChange={(next) => { setLocalSettings(next); onSettingsChange?.(next); }} />}
  </div>;
}
