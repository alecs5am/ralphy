import { useEffect, useRef, useState } from "react";
import { AudioLines, Pause, Play, Volume2, VolumeX } from "@/shared/ui/icons";
import { IconButton } from "@/shared/ui/IconButton";
import { audioTime } from "../lib/audio-waveform";
import type { PreviewMedia } from "./MarketplaceItemPreview";
import { MarketplaceWaveform } from "./MarketplaceWaveform";

export function MarketplaceAudioCompare({ media, name, compact = false, onUnavailable }: {
  media: PreviewMedia & { before?: PreviewMedia; label?: string }; name: string; compact?: boolean; onUnavailable?(): void;
}) {
  const player = useRef<HTMLAudioElement>(null);
  const playbackVersion = useRef(0);
  const resumeAt = useRef(0);
  const [side, setSide] = useState<"before" | "after" | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const before = media.before?.kind === "audio" ? media.before : undefined;
  const src = side === "before" ? before?.url : side === "after" ? media.url : undefined;

  useEffect(() => {
    setSide(null); setPosition(0); resumeAt.current = 0; setFailed([]);
  }, [media.url, before?.url]);
  useEffect(() => {
    const other = (event: Event) => {
      if ((event.target as Element | null)?.tagName === "AUDIO" && event.target !== player.current && player.current && !player.current.paused) {
        playbackVersion.current++; player.current.pause?.();
      }
    };
    document.addEventListener("play", other, true);
    return () => document.removeEventListener("play", other, true);
  }, []);
  useEffect(() => {
    const audio = player.current;
    const version = ++playbackVersion.current;
    setPlaying(false); setError(false);
    if (src) void audio?.play?.()?.catch(() => { if (version === playbackVersion.current) setError(true); });
    return () => { playbackVersion.current++; audio?.pause?.(); };
  }, [src]);

  const toggle = (next: "before" | "after") => {
    if (next !== side) { resumeAt.current = position; setSide(next); return; }
    const audio = player.current;
    if (!audio) return;
    if (!audio.paused) { playbackVersion.current++; audio.pause?.(); return; }
    const version = playbackVersion.current;
    setError(false);
    void audio.play?.()?.catch(() => { if (version === playbackVersion.current) setError(true); });
  };
  const seek = (next: number) => {
    if (!player.current) return;
    player.current.currentTime = next;
    resumeAt.current = next;
    setPosition(next);
  };
  const versions = before ? [{ id: "before" as const, label: "Original", media: before }, { id: "after" as const, label: "Effect", media }]
    : [{ id: "after" as const, label: "Preview", media }];

  return <section className={`explore-audio-compare ${compact ? "is-compact" : ""}`} aria-label={`Audio preview of ${name}`}>
    <audio className="hidden" ref={player} src={src} loop preload="metadata" aria-label={`${name} comparison`}
      onLoadedMetadata={(event) => {
        const audio = event.currentTarget;
        if (src && Number.isFinite(audio.duration) && audio.duration > 0) {
          setDurations((current) => ({ ...current, [src]: audio.duration }));
          audio.currentTime = Math.min(resumeAt.current, audio.duration);
          setPosition(audio.currentTime);
        }
      }}
      onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onError={() => {
        if (!src) return;
        setPlaying(false); setFailed((current) => [...current, src]);
        if (side === "after") onUnavailable?.();
      }} />
    <div className="explore-audio-compare-heading">
      <span><AudioLines className="size-4" aria-hidden="true" />{before ? "Listen & compare" : "Listen"}</span>
      <IconButton className="size-7 rounded-control hover:bg-surface-hover" label={`${muted ? "Unmute" : "Mute"} ${name}`} onClick={() => {
        if (player.current) player.current.muted = !muted;
        setMuted(!muted);
      }}>{muted ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}</IconButton>
    </div>
    <div className="explore-audio-versions">
      {versions.map((version) => {
        const active = version.id === side;
        const unavailable = failed.includes(version.media.url);
        const duration = durations[version.media.url] ?? 0;
        return <div className={`explore-audio-version ${active ? "is-selected" : ""}`} key={version.id}>
          <span className="explore-audio-version-label type-xs font-medium">{version.label}</span>
          <MarketplaceWaveform src={version.media.url} name={`${name} ${version.label.toLowerCase()}`} position={position}
            duration={duration} disabled={unavailable} onUnavailable={() => {
              setFailed((current) => current.includes(version.media.url) ? current : [...current, version.media.url]);
              if (version.id === "after") onUnavailable?.();
            }} onSeek={(next) => {
              if (active) seek(next);
              else { resumeAt.current = next; setPosition(next); setSide(version.id); }
            }}
            onDuration={(next) => setDurations((current) => ({ ...current, [version.media.url]: next }))} />
          <div className="explore-audio-version-controls">
            <IconButton className="explore-audio-version-play" label={`${active && playing ? "Pause" : "Play"} ${version.label.toLowerCase()} ${name}`}
              disabled={unavailable} onClick={() => toggle(version.id)}>
              {active && playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
            </IconButton>
            <span className="type-meta text-muted tabular-nums">{unavailable ? "Unavailable" : `${audioTime(Math.min(position, duration || position))} / ${duration ? audioTime(duration) : "—"}`}</span>
          </div>
        </div>;
      })}
    </div>
    <span className="explore-audio-compare-caption type-xs text-muted" role={error ? "status" : undefined}>{error ? "Preview could not play. Try again." : before ? "Switch sides at the same moment." : "Play to hear the preview."}</span>
  </section>;
}
