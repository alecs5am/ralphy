import { Expand, FastForward, Pause, Play, Rewind, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SnappySlider } from "../ui/SnappySlider";
import { PLAYER_CHROME, PLAYER_CONTROL, playerTone, type PlayerTone } from "./tone";

interface VideoPlayerProps { src: string; name: string; compact?: boolean; tone?: PlayerTone; onError?(): void }

/* The frame is the media's own mat and stays the black media frame under either tone: a
   letterboxed video on a light plate reads as a broken image, not as a surface step. `tone`
   therefore chooses the transport pair, which is the half a caller used to reach in and repaint. */
const FRAME = "custom-video-player relative grid size-full min-h-0 min-w-0 place-items-center overflow-hidden bg-frame";
const VIDEO = "viewer-video block size-full min-h-0 min-w-0 cursor-pointer bg-frame object-contain";
/* The transport is a pill of controls floating over the picture. The sliders take their width
   from here rather than from their own class: SnappySlider's base states `w-full flex-none`, and a
   second width utility on the slider itself would be resolved by the generated order — which is
   how the seek and the volume bar both ended up 1060px wide inside a 1080px pill, overflowing it
   by 1332px. A descendant variant is (0,2,0) and always wins. */
const TRANSPORT = "video-controls absolute mx-auto flex max-w-270 items-center backdrop-blur-media [&_.video-seek-slider]:w-auto [&_.video-seek-slider]:min-w-20 [&_.video-seek-slider]:flex-1 [&_.volume-slider]:w-17 [&_.volume-slider]:flex-none";
const TRANSPORT_WIDE = "inset-x-4.5 bottom-4.5 h-12 gap-2 rounded-control px-2.5";
const TRANSPORT_COMPACT = "inset-x-2 bottom-2 h-9 gap-1.25 rounded-field px-1.25";
const READOUT = "video-time text-center font-code type-xs";
/* The alarm is the one colour on the palette besides the greys, and it has to be the bright step:
   `--danger` resolves to a near-white ink outside `.app-mode-work`, which is where this player
   sits when the asset modal portals it to the body. */
const ERROR = "video-player-error absolute top-1/2 left-1/2 max-w-video-error-measure -translate-x-1/2 -translate-y-1/2 rounded-field bg-instrument/92 px-3 py-2.25 type-sm text-center text-alert-bright";

export const compactVideoStartTime = (duration: number, compact: boolean) => compact && duration > 4 ? 4 : 0;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remainder = whole % 60;
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}` : `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function VideoPlayer({ src, name, compact = false, tone = "instrument", onError }: VideoPlayerProps) {
  const chrome = PLAYER_CHROME[playerTone(tone)];
  const control = `${PLAYER_CONTROL} ${compact ? "size-6.5" : "size-7.5"} ${chrome.control}`;
  const readout = `${READOUT} ${compact ? "min-w-7.5" : "min-w-8.5"} ${chrome.read}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setPlaying(false); setCurrentTime(0); setDuration(0); setError(null); }, [src]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const syncTime = () => { if (videoRef.current) setCurrentTime(videoRef.current.currentTime); frame = window.requestAnimationFrame(syncTime); };
    frame = window.requestAnimationFrame(syncTime);
    return () => window.cancelAnimationFrame(frame);
  }, [playing]);

  const fail = () => { setError(`“${name}” cannot be played.`); onError?.(); };
  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(fail);
    else video.pause();
  };
  const enterFullscreen = () => { void rootRef.current?.requestFullscreen().catch(() => setError("Fullscreen is unavailable.")); };
  const skip = (seconds: number) => { if (videoRef.current) videoRef.current.currentTime = Math.min(duration, Math.max(0, videoRef.current.currentTime + seconds)); };

  return <div className={`${FRAME}${compact ? " is-compact" : ""}`} ref={rootRef}>
    <video ref={videoRef} className={VIDEO} src={src} aria-label={name} preload="auto" playsInline onClick={togglePlayback} onDoubleClick={enterFullscreen}
      onCanPlay={() => setError(null)} onError={fail}
      onLoadedMetadata={(event) => { const startTime = compactVideoStartTime(event.currentTarget.duration, compact); event.currentTarget.currentTime = startTime; setDuration(event.currentTarget.duration); setCurrentTime(startTime); setVolume(event.currentTarget.volume); setMuted(event.currentTarget.muted); }}
      onDurationChange={(event) => setDuration(event.currentTarget.duration)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onVolumeChange={(event) => { setVolume(event.currentTarget.volume); setMuted(event.currentTarget.muted); }} />
    {error && <div className={ERROR} role="alert">{error}</div>}
    <div className={`${TRANSPORT} ${compact ? TRANSPORT_COMPACT : TRANSPORT_WIDE} ${chrome.plate} ${chrome.slider}`}>
      <button className={control} type="button" aria-label={`${playing ? "Pause" : "Play"} ${name}`} title={playing ? "Pause" : "Play"} onClick={togglePlayback}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
      {!compact && <><button className={control} type="button" aria-label={`Back 5 seconds in ${name}`} title="Back 5 seconds" onClick={() => skip(-5)}><Rewind size={15} /></button><button className={control} type="button" aria-label={`Forward 5 seconds in ${name}`} title="Forward 5 seconds" onClick={() => skip(5)}><FastForward size={15} /></button></>}
      <span className={readout}>{formatTime(currentTime)}</span>
      <SnappySlider className="video-seek-slider" value={currentTime} min={0} max={Math.max(duration, 0.1)} step={0.1} ariaLabel={`Position in ${name}`} onValueChange={(next) => { if (videoRef.current) videoRef.current.currentTime = next; setCurrentTime(next); }} />
      <span className={readout}>{formatTime(duration)}</span>
      {!compact && <>
        <button className={control} type="button" aria-label={`${muted ? "Unmute" : "Mute"} ${name}`} title={muted ? "Unmute" : "Mute"} onClick={() => { if (videoRef.current) videoRef.current.muted = !muted; }}>{muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
        <SnappySlider className="volume-slider" value={muted ? 0 : volume} min={0} max={1} step={0.05} ariaLabel={`Volume for ${name}`} onValueChange={(next) => { if (!videoRef.current) return; videoRef.current.volume = next; videoRef.current.muted = false; }} />
        <button className={control} type="button" aria-label={`Enter fullscreen for ${name}`} title="Fullscreen" onClick={enterFullscreen}><Expand size={15} /></button>
      </>}
    </div>
  </div>;
}
