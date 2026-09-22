import { Pause, Play } from "./icons";
import { useEffect, useRef, useState } from "react";
import { audioTime } from "../lib/audio-peaks";
import { WaveformTrack } from "./WaveformTrack";

/**
 * The small audio player: a play button, the wave, and the clock.
 *
 * Four surfaces used to mount a bare `<audio controls>` -- the canvas node and its runs panel, a
 * unit's source preview, the generic media preview. Each got the operating system's own player
 * bar, which is the one control in the app that does not belong to the app: a different shape on
 * every platform, a different colour from everything around it, and no relation to the wave the
 * same file draws one screen over.
 *
 * It stays in `shared/ui` rather than beside `AudioWaveform` because `MediaPreview` stands below
 * `entities`. `AudioWaveform` is the full-dress version: a title, a transport, volume.
 */
export function AudioTrack({ src, name, className = "" }: { src: string; name: string; className?: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const sync = () => { if (audio.current) setPosition(audio.current.currentTime); frame = window.requestAnimationFrame(sync); };
    frame = window.requestAnimationFrame(sync);
    return () => window.cancelAnimationFrame(frame);
  }, [playing]);
  const seek = (next: number) => { if (!audio.current) return; audio.current.currentTime = Math.min(duration, Math.max(0, next)); setPosition(audio.current.currentTime); };
  if (failed) return <span className="type-xs text-on-instrument-muted">Preview unavailable</span>;
  return <div className={`audio-track flex min-w-0 items-center gap-2.5 ${className}`}>
    <audio ref={audio} className="hidden" src={src} aria-label={name} preload="metadata"
      onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
      onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onError={() => setFailed(true)} />
    <button className="inline-grid size-7 flex-none place-items-center rounded-control bg-instrument-raised text-on-instrument not-disabled:hover:bg-instrument-hover" type="button"
      aria-label={`${playing ? "Pause" : "Play"} ${name}`}
      onClick={() => { if (!audio.current) return; if (audio.current.paused) void audio.current.play().catch(() => setFailed(true)); else audio.current.pause(); }}
    >{playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button>
    <WaveformTrack className="is-on-instrument" src={src} name={name} position={position} duration={duration} onSeek={seek} onDuration={setDuration} />
    <span className="flex-none font-code type-xs text-on-instrument-muted">{audioTime(duration - position)}</span>
  </div>;
}
