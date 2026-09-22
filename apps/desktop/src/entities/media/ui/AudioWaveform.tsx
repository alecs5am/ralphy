import { Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "@/shared/ui/icons";
import { useEffect, useRef, useState } from "react";
import { audioTime } from "@/shared/lib/audio-peaks";
import { SnappySlider } from "@/shared/ui/SnappySlider";
import { WaveformTrack } from "@/shared/ui/WaveformTrack";
import { PLAYER_CHROME, PLAYER_CONTROL, PLAYER_INK, playerTone, type PlayerTone } from "../lib/tone";

interface AudioWaveformProps { src: string; name: string; compact?: boolean; tone?: PlayerTone; onReady?(): void; onError?(): void }

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

/**
 * One audio file, drawn as its own loudness.
 *
 * There used to be two players here: wavesurfer for anything small enough to decode, and a
 * pseudo-random bar pattern seeded from the file name for everything else. The second one was a
 * drawing of audio rather than a drawing of *this* audio, and which of the two an operator got
 * depended on the file size -- so the same voiceover looked like two different products between
 * the project grid and the shared library. `WaveformTrack` replaces both: real peaks when the
 * file can be decoded, a flat seek line when it cannot, and one shape everywhere either way.
 *
 * Playback stays here rather than moving into the wave: the wave draws and seeks, the element
 * below plays, and the transport is this component's own.
 */
export function AudioWaveform({ src, name, compact = false, tone, onReady, onError }: AudioWaveformProps) {
  const skin = playerTone(tone);
  const ink = PLAYER_INK[skin];
  const chrome = PLAYER_CHROME[skin];
  const control = `${PLAYER_CONTROL} size-7.5 ${chrome.control}`;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const content = <><div className={`${HEADING} ${compact ? "justify-center gap-2.25 [&>span]:max-w-[calc(100%_-_42px)]" : "gap-4"}`}><button className={`${skin === "surface" ? PLAY_SURFACE : PLAY} ${compact ? "size-8" : "size-13.5"}`} type="button" aria-label={`${playing ? "Pause" : "Play"} ${name}`} disabled={!ready} onClick={toggle}>{playing ? <Pause size={compact ? 16 : 21} fill="currentColor" /> : <Play size={compact ? 16 : 21} fill="currentColor" />}</button><span className="flex min-w-0 flex-col gap-0.75"><strong className={compact ? "hidden" : `${CLIP} type-xl ${ink.strong}`}>{name}</strong><small className={`${CLIP} ${compact ? "type-xs" : "type-sm"} ${ink.muted}`}>{error ? "Preview unavailable" : ready ? `${audioTime(duration)} audio` : "Loading audio…"}</small></span></div>
    <WaveformTrack className={`${compact ? "is-compact" : "is-tall"} ${skin === "instrument" ? "is-on-instrument" : ""} ${chrome.slider}`} src={src} name={name} position={currentTime} duration={duration} disabled={!ready} onSeek={seek} /></>;
  return <div className={`${PLAYER} ${compact ? PLAYER_COMPACT : PLAYER_WIDE}`} aria-label={name}>
    <audio ref={audioRef} className="audio-stream-element hidden" src={src} aria-label={name} preload="metadata"
      onLoadedMetadata={(event) => { const next = event.currentTarget.duration; setDuration(next); setVolume(event.currentTarget.volume); setMuted(event.currentTarget.muted); setReady(true); onReady?.(); }}
      onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onVolumeChange={(event) => { setVolume(event.currentTarget.volume); setMuted(event.currentTarget.muted); }} onError={fail} />
    {compact ? <div className="audio-compact-content grid w-full gap-3">{content}</div> : content}
    {!compact && <div className={`${TRANSPORT} ${chrome.read} ${chrome.slider}`}><span className="mr-auto">{audioTime(currentTime)}</span><button className={control} type="button" aria-label={`Back 10 seconds in ${name}`} disabled={!ready} onClick={() => seek(currentTime - 10)}><RotateCcw size={15} /></button><button className={control} type="button" aria-label={`Forward 10 seconds in ${name}`} disabled={!ready} onClick={() => seek(currentTime + 10)}><RotateCw size={15} /></button><button className={control} type="button" aria-label={`${muted ? "Unmute" : "Mute"} ${name}`} disabled={!ready} onClick={() => { if (audioRef.current) audioRef.current.muted = !muted; }}>{muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}</button><SnappySlider className="volume-slider" value={muted ? 0 : volume} min={0} max={1} step={0.05} ariaLabel={`Volume for ${name}`} disabled={!ready} onValueChange={(next) => { if (!audioRef.current) return; audioRef.current.volume = next; audioRef.current.muted = false; }} /><span>{audioTime(duration)}</span></div>}
    {error && <span className={`audio-waveform-error type-sm ${ink.strong}`} role="alert">{error}</span>}
  </div>;
}
