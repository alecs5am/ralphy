import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SnappySlider } from "./SnappySlider";
import { loadAudioPeaks, waveformPeaks, type AudioPeaks } from "../lib/audio-peaks";

/**
 * One audio file drawn as its own loudness, with a seek surface laid over it.
 *
 * It began in Explore and now serves every surface that shows audio, which is why it is here
 * rather than in `entities/media`: `shared/ui/MediaPreview` stands below entities and could not
 * reach it there, and the player bar is a widget and could not reach it inside a page.
 *
 * Height is `--waveform-height` rather than a number, so a 9:16 tile and a full row can ask for
 * the same component at the size each has room for.
 */
export function WaveformTrack({ src, name, position, duration, onSeek, onDuration, onUnavailable, className = "", disabled = false, eager = true }: {
  src: string; name: string; position: number; duration: number; onSeek(value: number): void;
  onDuration?(value: number): void; onUnavailable?(): void; className?: string; disabled?: boolean; eager?: boolean;
}) {
  const [armed, setArmed] = useState(eager);
  const [wave, setWave] = useState<AudioPeaks | null>(null);
  const [width, setWidth] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const gradient = useId();
  const durationCallback = useRef(onDuration);
  durationCallback.current = onDuration;
  const unavailableCallback = useRef(onUnavailable);
  unavailableCallback.current = onUnavailable;
  useEffect(() => {
    if (eager) { setArmed(true); return; }
    const node = root.current;
    if (!node || typeof IntersectionObserver === "undefined") { setArmed(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setArmed(true);
      observer.disconnect();
    }, { rootMargin: "160px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [eager, src]);
  useEffect(() => {
    if (!armed) return;
    if (!root.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [armed]);
  useEffect(() => {
    if (!armed) return;
    let current = true;
    let probe: HTMLAudioElement | undefined;
    const releaseProbe = () => {
      if (!probe) return;
      probe.onloadedmetadata = null; probe.onerror = null;
      probe.removeAttribute("src"); probe.load();
      probe = undefined;
    };
    setWave(null);
    void loadAudioPeaks(src).then((next) => {
      if (!current) return;
      setWave(next);
      if (next) durationCallback.current?.(next.duration);
      else if (typeof Audio !== "undefined") {
        // Waveform decoding can fail for valid large or cross-origin media.
        // Only the native metadata check decides whether the preview is missing.
        probe = new Audio();
        probe.preload = "metadata";
        probe.onloadedmetadata = () => {
          if (current && probe && Number.isFinite(probe.duration) && probe.duration > 0) durationCallback.current?.(probe.duration);
          releaseProbe();
        };
        probe.onerror = () => { if (current) unavailableCallback.current?.(); releaseProbe(); };
        probe.src = src;
      }
    });
    return () => { current = false; releaseProbe(); };
  }, [armed, src]);
  const path = useMemo(() => {
    if (!wave || !width) return "";
    const peaks = waveformPeaks([Float32Array.from(wave.peaks)], Math.max(1, Math.min(wave.peaks.length, Math.floor(width / 3))));
    return peaks.map((peak, index) => {
      const x = ((index + 0.5) * width / peaks.length).toFixed(2);
      return `M${x},72V${(72 - Math.max(1, peak * 68)).toFixed(2)}`;
    }).join("");
  }, [wave, width]);
  const length = duration || wave?.duration || 0;
  const progress = length ? Math.min(1, Math.max(0, position / length)) : 0;
  return <div ref={root} className={`waveform-track ${wave ? "has-peaks" : "is-loading"} ${className}`} onPointerEnter={() => setArmed(true)} onFocusCapture={() => setArmed(true)}>
    {path && <svg className="waveform-track-bars" viewBox={`0 0 ${width} 100`} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="0" x2={width}>
        <stop className="waveform-track-played" offset={progress} />
        <stop className="waveform-track-unplayed" offset={progress} />
      </linearGradient></defs>
      <g fill="none" stroke={`url(#${gradient})`} strokeWidth="2" strokeLinecap="butt" shapeRendering="crispEdges">
        <path d={path} vectorEffect="non-scaling-stroke" />
        <path className="waveform-track-reflection" d={path} transform="translate(0 94) scale(1 -.28)" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>}
    <SnappySlider className="waveform-track-seek absolute inset-0 h-full [&_.snappy-slider-thumb]:w-px [&_.snappy-slider-thumb]:h-full [&_.snappy-slider-thumb]:rounded-none" min={0} max={length || 1} step={0.1} value={Math.min(position, length)}
      disabled={disabled || !length} ariaLabel={`Position in ${name}`} onValueChange={onSeek} />
  </div>;
}
