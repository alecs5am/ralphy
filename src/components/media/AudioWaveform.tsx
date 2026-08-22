import { Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type WaveSurfer from "wavesurfer.js";
import { INSTRUMENT_PALETTE } from "../../instrument/palette";
import { useTheme } from "../../instrument/ThemeProvider";
import { MAX_WAVEFORM_DECODE_BYTES, shouldDecodeWaveform } from "../../lib/audio-preview";
import { SnappySlider } from "../ui/SnappySlider";
import { PLAYER_CHROME, PLAYER_CONTROL, PLAYER_INK, playerTone, type PlayerTone } from "./tone";

interface AudioWaveformProps { src: string; name: string; sizeBytes: number; compact?: boolean; tone?: PlayerTone; onReady?(): void; onError?(): void }

/* This player paints no plate of its own: it stands on whatever surface mounts it, black in the
   asset modal and on a media tile, light on the shared viewer's stage. That is why it is the one
   player whose `tone` decides its ink outright -- with the on-dark default on a light stage its
   title read #F2F2F0 on #E4E4E2, or 1.06:1. */
const PLAYER = "audio-waveform-player flex min-w-0 flex-col";
const PLAYER_WIDE = "w-audio-player gap-5.5 p-10";
const PLAYER_COMPACT = "is-compact size-full justify-center gap-0 p-3";
const HEADING = "audio-waveform-heading flex min-w-0 items-center";
const PLAY = "audio-play-button inline-grid flex-none place-items-center rounded-control bg-instrument-raised text-on-instrument not-disabled:hover:bg-instrument-hover disabled:text-on-instrument-muted-decorative";
const PLAY_SURFACE = "audio-play-button inline-grid flex-none place-items-center rounded-control bg-surface-hover text-ink not-disabled:hover:bg-surface-sunken disabled:text-muted-decorative";
const CLIP = "overflow-hidden text-ellipsis whitespace-nowrap";
/* The transport under the waveform carries no plate, so the volume slider takes its width here
   for the same reason the video transport does: SnappySlider's base states `w-full flex-none`. */
const TRANSPORT = "audio-waveform-controls flex h-10 items-center justify-end gap-1 font-code type-xs [&_.volume-slider]:w-17 [&_.volume-slider]:flex-none";
const formatTime = (seconds: number) => Number.isFinite(seconds) && seconds >= 0 ? `${Math.floor(seconds / 60)}:${(Math.floor(seconds) % 60).toString().padStart(2, "0")}` : "0:00";

// The seek bar sits on the waveform itself, so its track hugs the bottom edge and its thumb
// keeps only the horizontal centring the slider gives every thumb.
const STREAM_SEEK = "audio-stream-seek absolute inset-0 h-full [&_.snappy-slider-thumb]:-bottom-1 [&_.snappy-slider-thumb]:top-auto [&_.snappy-slider-thumb]:translate-y-0 [&_.snappy-slider-track]:bottom-0 [&_.snappy-slider-track]:top-auto";

/* The wavesurfer canvas is painted from JS, so the tone has to reach it as colours rather than as
   classes. The palette's waveform trio is the on-dark set in both themes; on a light stage the
   wave takes the theme's own decorative and primary inks instead. */
function waveformPaint(palette: (typeof INSTRUMENT_PALETTE)[keyof typeof INSTRUMENT_PALETTE], tone: PlayerTone) {
  if (tone === "surface") return { waveColor: palette.textMutedDecorative, progressColor: palette.textPrimary, cursorColor: palette.textPrimary };
  return { waveColor: palette.waveformWave, progressColor: palette.waveformProgress, cursorColor: palette.waveformCursor };
}

function streamBars(name: string, count: number): number[] {
  let seed = Array.from(name).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 2166136261);
  return Array.from({ length: count }, () => { seed = (seed * 1664525 + 1013904223) >>> 0; return 20 + (seed % 76); });
}

function StreamingAudioPlayer({ src, name, compact, probing, tone, onMetadata, onError }: { src: string; name: string; compact: boolean; probing: boolean; tone: PlayerTone; onMetadata?(duration: number): void; onError?(): void }) {
  const ink = PLAYER_INK[tone];
  const chrome = PLAYER_CHROME[tone];
  const control = `${PLAYER_CONTROL} size-7.5 ${chrome.control}`;
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
  const fail = () => { setError(`“${name}” cannot be played.`); onError?.(); };
  const toggle = () => { if (!audioRef.current) return; if (audioRef.current.paused) void audioRef.current.play().catch(fail); else audioRef.current.pause(); };
  const content = <><div className={`${HEADING} ${compact ? "justify-center gap-2.25 [&>span]:max-w-[calc(100%_-_42px)]" : "gap-4"}`}><button className={`${tone === "surface" ? PLAY_SURFACE : PLAY} ${compact ? "size-8" : "size-13.5"}`} type="button" aria-label={`${playing ? "Pause" : "Play"} ${name}`} disabled={!ready || probing} onClick={toggle}>{playing ? <Pause size={compact ? 16 : 21} fill="currentColor" /> : <Play size={compact ? 16 : 21} fill="currentColor" />}</button><span className="flex min-w-0 flex-col gap-0.75"><strong className={compact ? "hidden" : `${CLIP} type-xl ${ink.strong}`}>{name}</strong><small className={`${CLIP} ${compact ? "type-xs" : "type-sm"} ${ink.muted}`}>{probing ? "Checking audio…" : error ? "Preview unavailable" : ready ? `${formatTime(duration)} · streaming preview` : "Loading audio…"}</small></span></div>
    <div className={`audio-stream-waveform relative w-full ${compact ? "h-14" : "h-41"} ${chrome.slider}`}><div className={`audio-stream-bars absolute inset-0 flex items-center overflow-hidden ${compact ? "gap-0.5" : "gap-0.75"}`} aria-hidden="true">{bars.map((height, index) => <i className={`min-w-px flex-1 rounded-control [transition:background_var(--dur-fast)_linear] motion-reduce:[transition:none] ${index / bars.length <= progress ? `is-played ${chrome.wave.played}` : chrome.wave.rest}`} key={index} style={{ height: `${height}%` }} />)}</div><SnappySlider className={STREAM_SEEK} value={currentTime} min={0} max={Math.max(duration, 0.1)} step={0.1} ariaLabel={`Position in ${name}`} disabled={!ready || probing} onValueChange={seek} /></div></>;
  return <div className={`${PLAYER} audio-stream-player ${compact ? PLAYER_COMPACT : PLAYER_WIDE}`}>
    <audio ref={audioRef} className="audio-stream-element hidden" src={src} aria-label={name} preload="metadata"
      onLoadedMetadata={(event) => { const next = event.currentTarget.duration; setDuration(next); setVolume(event.currentTarget.volume); setMuted(event.currentTarget.muted); setReady(true); onMetadata?.(next); }}
      onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onVolumeChange={(event) => { setVolume(event.currentTarget.volume); setMuted(event.currentTarget.muted); }} onError={fail} />
    {compact ? <div className="audio-compact-content grid w-full gap-3">{content}</div> : content}
    {!compact && <div className={`${TRANSPORT} ${chrome.read} ${chrome.slider}`}><span className="mr-auto">{formatTime(currentTime)}</span><button className={control} type="button" aria-label={`Back 10 seconds in ${name}`} disabled={!ready} onClick={() => seek(currentTime - 10)}><RotateCcw size={15} /></button><button className={control} type="button" aria-label={`Forward 10 seconds in ${name}`} disabled={!ready} onClick={() => seek(currentTime + 10)}><RotateCw size={15} /></button><button className={control} type="button" aria-label={`${muted ? "Unmute" : "Mute"} ${name}`} disabled={!ready} onClick={() => { if (audioRef.current) audioRef.current.muted = !muted; }}>{muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}</button><SnappySlider className="volume-slider" value={muted ? 0 : volume} min={0} max={1} step={0.05} ariaLabel={`Volume for ${name}`} disabled={!ready} onValueChange={(next) => { if (!audioRef.current) return; audioRef.current.volume = next; audioRef.current.muted = false; }} /><span>{formatTime(duration)}</span></div>}
    {error && <span className={`audio-waveform-error type-sm ${ink.strong}`} role="alert">{error}</span>}
  </div>;
}

function DecodedAudioWaveform({ src, name, compact, tone, onReady, onFallback }: { src: string; name: string; compact: boolean; tone: PlayerTone; onReady?(): void; onFallback(): void }) {
  const ink = PLAYER_INK[tone];
  const chrome = PLAYER_CHROME[tone];
  const control = `${PLAYER_CONTROL} size-7.5 ${chrome.control}`;
  const { resolved } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<WaveSurfer | null>(null);
  const themeRef = useRef(resolved);
  themeRef.current = resolved;
  const toneRef = useRef(tone);
  toneRef.current = tone;
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    let disposed = false;
    let wave: WaveSurfer | null = null;
    setReady(false); setPlaying(false); setCurrentTime(0);
    void import("wavesurfer.js").then(({ default: WaveSurfer }) => {
      if (disposed || !containerRef.current) return;
      try {
        const wavePaint = waveformPaint(INSTRUMENT_PALETTE[themeRef.current], toneRef.current);
        wave = WaveSurfer.create({ container: containerRef.current, url: src, height: compact ? 56 : 164, ...wavePaint, cursorWidth: 1, barWidth: compact ? 2 : 3, barGap: compact ? 2 : 3, barRadius: 3, barMinHeight: 2, normalize: true, interact: true, dragToSeek: true, hideScrollbar: true, autoScroll: false });
      } catch {
        onFallback();
        return;
      }
      waveRef.current = wave;
      wave.on("ready", (next) => { setDuration(next); setReady(true); onReady?.(); });
      wave.on("timeupdate", setCurrentTime); wave.on("play", () => setPlaying(true)); wave.on("pause", () => setPlaying(false)); wave.on("finish", () => setPlaying(false)); wave.on("error", onFallback);
    }).catch(() => { if (!disposed) onFallback(); });
    return () => { disposed = true; if (waveRef.current === wave) waveRef.current = null; wave?.destroy(); };
  }, [compact, onFallback, src]);
  useEffect(() => {
    waveRef.current?.setOptions(waveformPaint(INSTRUMENT_PALETTE[resolved], tone));
  }, [resolved, tone]);
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
  const toggle = () => { void waveRef.current?.playPause().catch(onFallback); };
  const content = <><div className={`${HEADING} ${compact ? "justify-center gap-2.25 [&>span]:max-w-[calc(100%_-_42px)]" : "gap-4"}`}><button className={`${tone === "surface" ? PLAY_SURFACE : PLAY} ${compact ? "size-8" : "size-13.5"}`} type="button" aria-label={`${playing ? "Pause" : "Play"} ${name}`} disabled={!ready} onClick={toggle}>{playing ? <Pause size={compact ? 16 : 21} fill="currentColor" /> : <Play size={compact ? 16 : 21} fill="currentColor" />}</button><span className="flex min-w-0 flex-col gap-0.75"><strong className={compact ? "hidden" : `${CLIP} type-xl ${ink.strong}`}>{name}</strong><small className={`${CLIP} ${compact ? "type-xs" : "type-sm"} ${ink.muted}`}>{ready ? `${formatTime(duration)} audio` : "Building waveform…"}</small></span></div>
    {/* The timeline is a focusable slider, so it needs a ring: the sheet set `outline: 0` on it and
        then only a radius on :focus-visible, which left the control with no visible focus at all. */}
    <div className={`audio-waveform-canvas w-full min-w-0 cursor-pointer focus-visible:rounded-field ${chrome.ring}`} ref={containerRef} role="slider" tabIndex={ready ? 0 : -1} aria-label={`Position in ${name}`} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={currentTime} aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`} aria-disabled={!ready} onKeyDown={onTimelineKeyDown} /></>;
  return <div className={`${PLAYER} ${compact ? PLAYER_COMPACT : PLAYER_WIDE}`} aria-label={name}>
    {compact ? <div className="audio-compact-content grid w-full gap-3">{content}</div> : content}
    {!compact && <div className={`${TRANSPORT} ${chrome.read} ${chrome.slider}`}><span className="mr-auto">{formatTime(currentTime)}</span><button className={control} type="button" aria-label={`Back 10 seconds in ${name}`} disabled={!ready} onClick={() => seek(currentTime - 10)}><RotateCcw size={15} /></button><button className={control} type="button" aria-label={`Forward 10 seconds in ${name}`} disabled={!ready} onClick={() => seek(currentTime + 10)}><RotateCw size={15} /></button><button className={control} type="button" aria-label={`${muted ? "Unmute" : "Mute"} ${name}`} disabled={!ready} onClick={() => { const next = !muted; waveRef.current?.setMuted(next); setMuted(next); }}>{muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}</button><SnappySlider className="volume-slider" value={muted ? 0 : volume} min={0} max={1} step={0.05} ariaLabel={`Volume for ${name}`} disabled={!ready} onValueChange={(next) => { waveRef.current?.setVolume(next); waveRef.current?.setMuted(false); setVolume(next); setMuted(false); }} /><span>{formatTime(duration)}</span></div>}
  </div>;
}

export function AudioWaveform({ src, name, sizeBytes, compact = false, tone, onReady, onError }: AudioWaveformProps) {
  const skin = playerTone(tone);
  const [mode, setMode] = useState<"probing" | "waveform" | "streaming">(sizeBytes <= MAX_WAVEFORM_DECODE_BYTES ? "probing" : "streaming");
  const waveformSrc = `${src}${src.includes("?") ? "&" : "?"}purpose=waveform`;
  useEffect(() => setMode(sizeBytes <= MAX_WAVEFORM_DECODE_BYTES ? "probing" : "streaming"), [sizeBytes, src]);
  const fallbackToStream = useCallback(() => setMode("streaming"), []);
  if (mode === "waveform") return <DecodedAudioWaveform src={waveformSrc} name={name} compact={compact} tone={skin} onReady={onReady} onFallback={fallbackToStream} />;
  return <StreamingAudioPlayer src={src} name={name} compact={compact} tone={skin} probing={mode === "probing"} onError={onError} onMetadata={mode === "probing" ? (duration) => {
    if (shouldDecodeWaveform(sizeBytes, duration)) setMode("waveform");
    else { setMode("streaming"); onReady?.(); }
  } : onReady ? () => onReady() : undefined} />;
}
