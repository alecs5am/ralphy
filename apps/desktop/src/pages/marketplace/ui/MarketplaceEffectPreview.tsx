import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "@/shared/ui/icons";
import { RulerSlider } from "@/shared/ui/RulerSlider";
import { effectAmount, effectPixelSize, effectStudio, type EffectSettings } from "../lib/effect-settings";
import { useEffectStudio } from "../lib/use-effect-studio";
import { usePreviewPlayback, type PreviewMedia } from "./MarketplaceItemPreview";

type EffectMedia = PreviewMedia & { before?: PreviewMedia; label?: string };

/** A visual comparison uses one shared frame; audio remains a single A/B player. */
export function MarketplaceEffectPreview({ media, name, effectId, settings, onSettingsChange, active = true, compact = false, showControls = true, onUnavailable }: {
  media: EffectMedia;
  name: string;
  effectId?: string;
  settings?: EffectSettings;
  onSettingsChange?(settings: EffectSettings): void;
  active?: boolean;
  compact?: boolean;
  showControls?: boolean;
  onUnavailable?(): void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const afterVideo = useRef<HTMLVideoElement>(null);
  const beforeVideo = useRef<HTMLVideoElement>(null);
  const afterCanvas = useRef<HTMLCanvasElement>(null);
  const beforeCanvas = useRef<HTMLCanvasElement>(null);
  const studio = effectStudio(effectId);
  const [localSettings, setLocalSettings] = useState<EffectSettings>(studio?.defaultSettings ?? { amount: 50 });
  const amount = effectAmount(settings?.amount ?? localSettings.amount);
  const [failed, setFailed] = useState(false);
  const [beforeFailed, setBeforeFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [manualPlay, setManualPlay] = useState(0);
  const before = studio ? { url: studio.sourceUrl, kind: "image" as const } : !beforeFailed && media.before?.kind !== "audio" && media.before?.url !== media.url ? media.before : undefined;
  const hasVideo = Boolean(studio) || media.kind === "video" || before?.kind === "video";
  usePreviewPlayback(afterVideo, active && !paused && !failed, media.url, manualPlay > 0);
  usePreviewPlayback(beforeVideo, active && !paused && !failed, before?.url, manualPlay > 0);
  useEffectStudio({ studio, before: beforeCanvas, after: afterCanvas, amount, active: active && !failed, paused, manualPlay, compact, onPlaying: setPlaying, onError: () => { setFailed(true); onUnavailable?.(); } });

  useEffect(() => setLocalSettings(effectStudio(effectId)?.defaultSettings ?? { amount: 50 }), [effectId]);

  useEffect(() => {
    setFailed(false);
    setBeforeFailed(false);
    setPaused(false);
    setManualPlay(0);
    stage.current?.style.removeProperty("--explore-compare-position");
  }, [media.url, media.before?.url]);

  const sync = () => {
    const after = afterVideo.current;
    const source = beforeVideo.current;
    if (!after || !source || !Number.isFinite(source.duration) || source.duration <= 0) return;
    const position = after.currentTime % source.duration;
    if (Math.abs(source.currentTime - position) > 0.05) source.currentTime = position;
  };

  const mediaFailed = (original: boolean) => {
    if (original) setBeforeFailed(true);
    else { setFailed(true); onUnavailable?.(); }
  };
  const renderMedia = (value: PreviewMedia, original: boolean) => value.kind === "video"
    ? <video ref={original ? beforeVideo : afterVideo} className="explore-effect-media" src={value.url} poster={value.posterUrl} muted loop playsInline preload="metadata" controlsList="nodownload"
      aria-label={`${original ? "Before" : before ? "After" : "Effect"} preview for ${name}`}
      onError={() => mediaFailed(original)} onLoadedData={sync} onTimeUpdate={!original ? sync : undefined}
      onPlay={() => { if (!original || media.kind !== "video") setPlaying(true); sync(); }} onPause={() => { if (!original || media.kind !== "video") setPlaying(false); }} />
    : <img className="explore-effect-media" src={value.url} alt={`${original ? "Before" : before ? "After" : "Effect"} preview for ${name}`} referrerPolicy="no-referrer" onError={() => mediaFailed(original)} />;

  return <div className="explore-effect-studio min-w-0">
    <div ref={stage} className={`explore-effect-preview${compact ? " explore-effect-preview-compact" : ""}`}>
    {failed ? <p className="explore-effect-error type-sm" role="status">This preview could not load.</p> : <>
      {studio ? <canvas ref={afterCanvas} className="explore-effect-media" role="img" aria-label={`After preview for ${name}`} /> : renderMedia(media, false)}
      {before && <>
        <div className="explore-effect-before">{studio ? <canvas ref={beforeCanvas} className="explore-effect-media" role="img" aria-label={`Before preview for ${name}`} /> : renderMedia(before, true)}</div>
        <span className="explore-effect-label explore-effect-label-before type-xs">Before</span>
        <span className="explore-effect-label explore-effect-label-after type-xs">After</span>
        <input className="explore-effect-range" type="range" min="0" max="100" step="1" defaultValue="50" aria-label={`Preview comparison for ${name}`}
          aria-valuetext="50% original visible" onInput={(event) => {
            const percent = event.currentTarget.value;
            stage.current?.style.setProperty("--explore-compare-position", `${percent}%`);
            event.currentTarget.setAttribute("aria-valuetext", `${percent}% original visible`);
          }} />
        <span className="explore-effect-divider" aria-hidden="true"><span className="explore-effect-handle"><ChevronLeft className="size-3" /><ChevronRight className="size-3" /></span></span>
      </>}
      {hasVideo && <button type="button" className="explore-effect-play" aria-label={`${playing ? "Pause" : "Play"} preview for ${name}`} title={playing ? "Pause preview" : "Play preview"} onClick={() => {
        setPaused(playing);
        setManualPlay((request) => playing ? 0 : request + 1);
        if (!playing) for (const player of [afterVideo.current, beforeVideo.current]) void player?.play?.()?.catch(() => {});
      }}>{playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</button>}
      {media.label && !studio && <span className="explore-effect-sample type-meta">{media.label}</span>}
    </>}
    </div>
    {showControls && studio && !compact && !failed && <MarketplaceEffectControls effectId={effectId} name={name} settings={{ amount }} onSettingsChange={(next) => {
      setLocalSettings(next); onSettingsChange?.(next);
    }} />}
  </div>;
}

export function MarketplaceEffectControls({ effectId, name, settings, onSettingsChange }: {
  effectId?: string;
  name: string;
  settings?: EffectSettings;
  onSettingsChange?(settings: EffectSettings): void;
}) {
  const controlId = useId();
  const studio = effectStudio(effectId);
  if (!studio) return null;
  const amount = effectAmount(settings?.amount ?? studio.defaultSettings.amount);
  const pixelated = studio.id === "voxel-dither";
  return <div className="explore-effect-settings grid min-w-0 gap-2 text-ink">
    <div className="flex items-baseline justify-between gap-3">
      <label className="type-xs" htmlFor={controlId}>{studio.label}</label>
      <output className="type-sm tabular-nums" htmlFor={controlId}>{pixelated ? `${effectPixelSize(amount)} px` : `${amount}%`}</output>
    </div>
    <RulerSlider id={controlId} min={0} max={100} step={1} value={amount} defaultValue={studio.defaultSettings.amount}
      ariaLabel={`${studio.label} for ${name}`} ariaValueText={pixelated ? `${effectPixelSize(amount)} pixels` : `${amount} percent`}
      onValueChange={(value) => onSettingsChange?.({ amount: effectAmount(value) })} />
  </div>;
}
