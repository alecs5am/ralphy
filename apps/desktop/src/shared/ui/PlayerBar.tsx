import { createPortal } from "react-dom";
import { Pause, Play, Volume2, VolumeX, X } from "./icons";
import { IconButton } from "./IconButton";
import { SnappySlider } from "./SnappySlider";
import { WaveformTrack } from "./WaveformTrack";
import { audioTime } from "../lib/audio-peaks";
import { useOptionalInstrumentScroll } from "../lib/instrument-scroll";

/**
 * The transport for whatever is playing, docked at the foot of the content column.
 *
 * Explore drew this above its list, where it pushed the first rows down, moved as the page
 * scrolled and appeared in the middle of the screen -- the one place nobody looks for a player.
 * Every product that plays audio puts it along the bottom edge, so it goes there.
 *
 * It mounts into the desk column rather than the window, so it spans the content and not the
 * sidebar or the chat, and stands still while the list scrolls underneath. Without a column to
 * mount into -- a fixture, a page rendered outside the shell -- it draws where it was written,
 * which keeps it testable and keeps a bare page from losing its transport.
 */
export function PlayerBar({ src, name, meta, playing, position, duration, volume, error = false, onToggle, onSeek, onVolumeChange, onClose }: {
  src: string; name: string; meta?: string; playing: boolean; position: number; duration: number; volume: number;
  error?: boolean; onToggle(): void; onSeek(value: number): void; onVolumeChange(value: number): void; onClose(): void;
}) {
  const host = useOptionalInstrumentScroll()?.floatHost ?? null;
  const bar = <aside className="player-bar" aria-label="Now playing">
    <IconButton className="player-bar-toggle" label={`${playing ? "Pause" : "Play"} current sound ${name}`} disabled={error} onClick={onToggle}>
      {playing ? <Pause className="size-4.5" aria-hidden="true" /> : <Play className="size-4.5" aria-hidden="true" />}
    </IconButton>
    <span className="player-bar-identity flex min-w-0 flex-col">
      <strong className="truncate type-sm font-medium">{name}</strong>
      {meta && <small className="truncate type-xs text-muted">{error ? "Preview could not play. Try again." : meta}</small>}
    </span>
    <WaveformTrack className="is-compact" src={src} name={name} position={position} duration={duration} disabled={error} onSeek={onSeek} />
    <span className="player-bar-clock type-xs tabular-nums text-muted">{audioTime(position)} / {duration ? audioTime(duration) : "—"}</span>
    <IconButton className="player-bar-control" label={`${volume ? "Mute" : "Unmute"} ${name}`} onClick={() => onVolumeChange(volume ? 0 : 1)}>
      {volume ? <Volume2 className="size-4" aria-hidden="true" /> : <VolumeX className="size-4" aria-hidden="true" />}
    </IconButton>
    <div className="player-bar-volume"><SnappySlider min={0} max={1} step={0.05} value={volume} ariaLabel={`Volume for ${name}`} onValueChange={onVolumeChange} /></div>
    <IconButton className="player-bar-control" label={`Stop playing ${name}`} onClick={onClose}><X className="size-4" aria-hidden="true" /></IconButton>
  </aside>;
  return host ? createPortal(bar, host) : bar;
}
