import { Expand, FastForward, Pause, Play, Rewind, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SnappySlider } from "../ui/SnappySlider";

interface VideoPlayerProps { src: string; name: string; compact?: boolean; onError?(): void }

export const compactVideoStartTime = (duration: number, compact: boolean) => compact && duration > 4 ? 4 : 0;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remainder = whole % 60;
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}` : `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function VideoPlayer({ src, name, compact = false, onError }: VideoPlayerProps) {
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

  return <div className={`custom-video-player${compact ? " is-compact" : ""}`} ref={rootRef}>
    <video ref={videoRef} className="viewer-video" src={src} aria-label={name} preload="auto" playsInline onClick={togglePlayback} onDoubleClick={enterFullscreen}
      onCanPlay={() => setError(null)} onError={fail}
      onLoadedMetadata={(event) => { const startTime = compactVideoStartTime(event.currentTarget.duration, compact); event.currentTarget.currentTime = startTime; setDuration(event.currentTarget.duration); setCurrentTime(startTime); setVolume(event.currentTarget.volume); setMuted(event.currentTarget.muted); }}
      onDurationChange={(event) => setDuration(event.currentTarget.duration)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onVolumeChange={(event) => { setVolume(event.currentTarget.volume); setMuted(event.currentTarget.muted); }} />
    {error && <div className="video-player-error" role="alert">{error}</div>}
    <div className="video-controls">
      <button type="button" aria-label={`${playing ? "Pause" : "Play"} ${name}`} title={playing ? "Pause" : "Play"} onClick={togglePlayback}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
      {!compact && <><button type="button" aria-label={`Back 5 seconds in ${name}`} title="Back 5 seconds" onClick={() => skip(-5)}><Rewind size={15} /></button><button type="button" aria-label={`Forward 5 seconds in ${name}`} title="Forward 5 seconds" onClick={() => skip(5)}><FastForward size={15} /></button></>}
      <span className="video-time">{formatTime(currentTime)}</span>
      <SnappySlider className="video-seek-slider" value={currentTime} min={0} max={Math.max(duration, 0.1)} step={0.1} ariaLabel={`Position in ${name}`} onValueChange={(next) => { if (videoRef.current) videoRef.current.currentTime = next; setCurrentTime(next); }} />
      <span className="video-time">{formatTime(duration)}</span>
      {!compact && <>
        <button type="button" aria-label={`${muted ? "Unmute" : "Mute"} ${name}`} title={muted ? "Unmute" : "Mute"} onClick={() => { if (videoRef.current) videoRef.current.muted = !muted; }}>{muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
        <SnappySlider className="volume-slider" value={muted ? 0 : volume} min={0} max={1} step={0.05} ariaLabel={`Volume for ${name}`} onValueChange={(next) => { if (!videoRef.current) return; videoRef.current.volume = next; videoRef.current.muted = false; }} />
        <button type="button" aria-label={`Enter fullscreen for ${name}`} title="Fullscreen" onClick={enterFullscreen}><Expand size={15} /></button>
      </>}
    </div>
  </div>;
}
