import { Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type WaveSurfer from "wavesurfer.js";
import { MAX_WAVEFORM_DECODE_BYTES, shouldDecodeWaveform } from "../../lib/audio-preview";
import { SnappySlider } from "../ui/SnappySlider";

interface AudioWaveformProps { src: string; name: string; sizeBytes: number; compact?: boolean; onReady?(): void; onError?(): void }
const formatTime = (seconds: number) => Number.isFinite(seconds) && seconds >= 0 ? `${Math.floor(seconds / 60)}:${(Math.floor(seconds) % 60).toString().padStart(2, "0")}` : "0:00";

function streamBars(name: string, count: number): number[] {
  let seed = Array.from(name).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 2166136261);
  return Array.from({ length: count }, () => { seed = (seed * 1664525 + 1013904223) >>> 0; return 20 + (seed % 76); });
}

function StreamingAudioPlayer({ src, name, compact, probing, onMetadata, onError }: { src: string; name: string; compact: boolean; probing: boolean; onMetadata?(duration: number): void; onError?(): void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bars = useMemo(() => streamBars(name, compact ? 44 : 96), [compact, name]);
  const progress = duration > 0 ? currentTime / duration : 0;
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const sync = () => { if (audioRef.current) setCurrentTime(audioRef.current.currentTime); frame = window.requestAnimationFrame(sync); };
    frame = window.requestAnimationFrame(sync);
    return () => window.cancelAnimationFrame(frame);
  }, [playing]);
  const seek = (next: number) => { if (!audioRef.current) return; audioRef.current.currentTime = Math.min(duration, Math.max(0, next)); setCurrentTime(audioRef.current.currentTime); };
  const toggle = () => { if (!audioRef.current) return; if (audioRef.current.paused) void audioRef.current.play().catch(() => setError(`“${name}” cannot be played.`)); else audioRef.current.pause(); };
  return <div className={`audio-waveform-player audio-stream-player${compact ? " is-compact" : ""}`}>
    <audio ref={audioRef} className="audio-stream-element" src={src} aria-label={name} preload="metadata"
      onLoadedMetadata={(event) => { const next = event.currentTarget.duration; setDuration(next); setVolume(event.currentTarget.volume); setMuted(event.currentTarget.muted); setReady(true); onMetadata?.(next); }}
      onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onVolumeChange={(event) => { setVolume(event.currentTarget.volume); setMuted(event.currentTarget.muted); }} onError={() => { setError(`“${name}” cannot be played.`); onError?.(); }} />
    <div className="audio-waveform-heading"><button className="audio-play-button" type="button" aria-label={`${playing ? "Pause" : "Play"} ${name}`} disabled={!ready || probing} onClick={toggle}>{playing ? <Pause size={compact ? 16 : 21} fill="currentColor" /> : <Play size={compact ? 16 : 21} fill="currentColor" />}</button><span><strong>{name}</strong><small>{probing ? "Checking audio…" : error ? "Preview unavailable" : ready ? `${formatTime(duration)} · streaming preview` : "Loading audio…"}</small></span></div>
    <div className="audio-stream-waveform"><div className="audio-stream-bars" aria-hidden="true">{bars.map((height, index) => <i className={index / bars.length <= progress ? "is-played" : ""} key={index} style={{ height: `${height}%` }} />)}</div><SnappySlider className="audio-stream-seek" value={currentTime} min={0} max={Math.max(duration, 0.1)} step={0.1} ariaLabel={`Position in ${name}`} disabled={!ready || probing} onValueChange={seek} /></div>
    {!compact && <div className="audio-waveform-controls"><span>{formatTime(currentTime)}</span><button type="button" aria-label={`Back 10 seconds in ${name}`} disabled={!ready} onClick={() => seek(currentTime - 10)}><RotateCcw size={15} /></button><button type="button" aria-label={`Forward 10 seconds in ${name}`} disabled={!ready} onClick={() => seek(currentTime + 10)}><RotateCw size={15} /></button><button type="button" aria-label={`${muted ? "Unmute" : "Mute"} ${name}`} disabled={!ready} onClick={() => { if (audioRef.current) audioRef.current.muted = !muted; }}>{muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}</button><SnappySlider className="volume-slider" value={muted ? 0 : volume} min={0} max={1} step={0.05} ariaLabel={`Volume for ${name}`} disabled={!ready} onValueChange={(next) => { if (!audioRef.current) return; audioRef.current.volume = next; audioRef.current.muted = false; }} /><span>{formatTime(duration)}</span></div>}
    {error && <span className="audio-waveform-error" role="alert">{error}</span>}
  </div>;
}

function DecodedAudioWaveform({ src, name, compact, onReady, onFallback }: { src: string; name: string; compact: boolean; onReady?(): void; onFallback(): void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<WaveSurfer | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let wave: WaveSurfer | null = null;
    setReady(false); setPlaying(false); setCurrentTime(0); setError(null);
    void import("wavesurfer.js").then(({ default: WaveSurfer }) => {
      if (disposed || !containerRef.current) return;
      wave = WaveSurfer.create({ container: containerRef.current, url: src, height: compact ? 56 : 164, waveColor: "#555555", progressColor: "#9b8df8", cursorColor: "#f4f4f4", cursorWidth: 1, barWidth: compact ? 2 : 3, barGap: compact ? 2 : 3, barRadius: 3, barMinHeight: 2, normalize: true, interact: true, dragToSeek: true, hideScrollbar: true, autoScroll: false });
      waveRef.current = wave;
      wave.on("ready", (next) => { setDuration(next); setReady(true); onReady?.(); });
      wave.on("timeupdate", setCurrentTime); wave.on("play", () => setPlaying(true)); wave.on("pause", () => setPlaying(false)); wave.on("finish", () => setPlaying(false)); wave.on("error", onFallback);
    }).catch(() => { if (!disposed) onFallback(); });
    return () => { disposed = true; if (waveRef.current === wave) waveRef.current = null; wave?.destroy(); };
  }, [compact, onFallback, src]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const sync = () => { if (waveRef.current) setCurrentTime(waveRef.current.getCurrentTime()); frame = window.requestAnimationFrame(sync); };
    frame = window.requestAnimationFrame(sync);
    return () => window.cancelAnimationFrame(frame);
  }, [playing]);
  const seek = (next: number) => { if (!waveRef.current) return; const bounded = Math.min(duration, Math.max(0, next)); waveRef.current.setTime(bounded); setCurrentTime(bounded); };
  const onTimelineKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowLeft: currentTime - 5, ArrowDown: currentTime - 5, ArrowRight: currentTime + 5, ArrowUp: currentTime + 5, PageDown: currentTime - 30, PageUp: currentTime + 30, Home: 0, End: duration };
    if (!(event.key in moves)) return; event.preventDefault(); seek(moves[event.key]);
  };
  const toggle = () => { void waveRef.current?.playPause().catch(() => setError(`“${name}” cannot be played.`)); };
  return <div className={`audio-waveform-player${compact ? " is-compact" : ""}`} aria-label={name}>
    <div className="audio-waveform-heading"><button className="audio-play-button" type="button" aria-label={`${playing ? "Pause" : "Play"} ${name}`} disabled={!ready} onClick={toggle}>{playing ? <Pause size={compact ? 16 : 21} fill="currentColor" /> : <Play size={compact ? 16 : 21} fill="currentColor" />}</button><span><strong>{name}</strong><small>{ready ? `${formatTime(duration)} audio` : error ? "Preview unavailable" : "Building waveform…"}</small></span></div>
    <div className="audio-waveform-canvas" ref={containerRef} role="slider" tabIndex={ready ? 0 : -1} aria-label={`Position in ${name}`} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={currentTime} aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`} aria-disabled={!ready} onKeyDown={onTimelineKeyDown} />
    {!compact && <div className="audio-waveform-controls"><span>{formatTime(currentTime)}</span><button type="button" aria-label={`Back 10 seconds in ${name}`} disabled={!ready} onClick={() => seek(currentTime - 10)}><RotateCcw size={15} /></button><button type="button" aria-label={`Forward 10 seconds in ${name}`} disabled={!ready} onClick={() => seek(currentTime + 10)}><RotateCw size={15} /></button><button type="button" aria-label={`${muted ? "Unmute" : "Mute"} ${name}`} disabled={!ready} onClick={() => { const next = !muted; waveRef.current?.setMuted(next); setMuted(next); }}>{muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}</button><SnappySlider className="volume-slider" value={muted ? 0 : volume} min={0} max={1} step={0.05} ariaLabel={`Volume for ${name}`} disabled={!ready} onValueChange={(next) => { waveRef.current?.setVolume(next); waveRef.current?.setMuted(false); setVolume(next); setMuted(false); }} /><span>{formatTime(duration)}</span></div>}
    {error && <span className="audio-waveform-error" role="alert">{error}</span>}
  </div>;
}

export function AudioWaveform({ src, name, sizeBytes, compact = false, onReady, onError }: AudioWaveformProps) {
  const [mode, setMode] = useState<"probing" | "waveform" | "streaming">(sizeBytes <= MAX_WAVEFORM_DECODE_BYTES ? "probing" : "streaming");
  const waveformSrc = `${src}${src.includes("?") ? "&" : "?"}purpose=waveform`;
  useEffect(() => setMode(sizeBytes <= MAX_WAVEFORM_DECODE_BYTES ? "probing" : "streaming"), [sizeBytes, src]);
  const fallbackToStream = useCallback(() => setMode("streaming"), []);
  if (mode === "waveform") return <DecodedAudioWaveform src={waveformSrc} name={name} compact={compact} onReady={onReady} onFallback={fallbackToStream} />;
  return <StreamingAudioPlayer src={src} name={name} compact={compact} probing={mode === "probing"} onError={onError} onMetadata={mode === "probing" ? (duration) => {
    if (shouldDecodeWaveform(sizeBytes, duration)) setMode("waveform");
    else { setMode("streaming"); onReady?.(); }
  } : onReady ? () => onReady() : undefined} />;
}
