import { useEffect, useRef, useState } from "react";
import { ArrowLeft, AudioLines, MessageCircle, Music2, Package, Pause, Play, Repeat, Volume2, VolumeX, Waves } from "@/shared/ui/icons";
import { IconButton } from "@/shared/ui/IconButton";
import { SegmentedControl } from "@/shared/ui/SegmentedControl";
import { SnappySlider } from "@/shared/ui/SnappySlider";
import { WINDOW_PLATE } from "@/shared/ui/Window";
import type { MarketplaceItemPresentation } from "../lib/presentation";
import { marketplaceItemDomId } from "./MarketplaceBrowse";
import { marketplacePreview } from "./MarketplaceItemPreview";
import { WaveformTrack } from "@/shared/ui/WaveformTrack";
import { audioTime } from "@/shared/lib/audio-peaks";

export interface MarketplaceSoundsProps {
  items: MarketplaceItemPresentation[];
  archivedKeys?: string[];
  showFilters?: boolean;
  onOpenItem(key: string): void;
  onUse?(item: MarketplaceItemPresentation): void;
  onUnavailable?(item: MarketplaceItemPresentation): void;
}

const soundGroups = [
  { value: "music", label: "Music beds", icon: Music2, tags: ["music", "bed"] },
  { value: "ambience", label: "Ambience", icon: Waves, tags: ["ambient", "ambience", "room-tone"] },
  { value: "one-shots", label: "One-shots", icon: AudioLines, tags: ["sfx", "one-shot", "oneshot"] },
  { value: "loops", label: "Loops", icon: Repeat, tags: ["loop", "loops"] },
];

const itemPack = (item: MarketplaceItemPresentation) => item.studio?.pack;
const popularPicks = [
  ["voiceover-pack-fighter", "Arcade Mode"], ["interface-sounds", "Click 001"], ["rpg-audio", "Belt Handle1"],
  ["casino-audio", "Card Fan 1"], ["ui-audio", "Click1"], ["sci-fi-sounds", "Computer Noise 000"],
  ["voiceover-pack", "Female Congratulations"], ["impact-sounds", "Footstep Carpet 000"],
] as const;

/** One audio element owns listening, including when the list is filtered or replaced. */
export function MarketplaceSounds({ items, archivedKeys = [], showFilters = true, onOpenItem, onUse, onUnavailable }: MarketplaceSoundsProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const startAt = useRef(0);
  const playbackVersion = useRef(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [volume, setVolume] = useState(1);
  const [error, setError] = useState(false);
  const [group, setGroup] = useState("all");
  const [packId, setPackId] = useState<string | null>(null);
  const explicitPacks = [...new Map(items.flatMap((item) => {
    const pack = itemPack(item);
    return pack ? [[pack.id, pack] as const] : [];
  })).values()];
  const packMode = showFilters && explicitPacks.length > 0;
  const packs = packMode ? [
    ...explicitPacks.map((pack) => ({ ...pack, items: items.filter((item) => itemPack(item)?.id === pack.id) })),
    ...(items.some((item) => !itemPack(item)) ? [{ id: "ralphy-originals", name: "Ralphy originals", publisher: "Ralphy", items: items.filter((item) => !itemPack(item)) }] : []),
  ] : [];
  const activePack = packs.find((pack) => pack.id === packId);
  const packItems = activePack?.items ?? (packMode ? [] : items);
  const curatedPopular = packMode ? popularPicks.flatMap(([packId, name]) => {
    const pack = packs.find((entry) => entry.id === packId);
    return pack?.items.find((item) => item.name === name) ?? pack?.items[0] ?? [];
  }) : [];
  const popular = packMode ? [...curatedPopular, ...packs.flatMap((pack) => pack.items.slice(0, 1))]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.key === item.key) === index).slice(0, 8) : [];
  const groups = soundGroups.map((entry) => ({ ...entry, items: packItems.filter((item) => item.tags.some((tag) => entry.tags.includes(tag.toLowerCase()))) })).filter((entry) => entry.items.length);
  const activeGroup = showFilters && groups.length > 1 ? groups.find((entry) => entry.value === group) : undefined;
  const displayed = activeGroup?.items ?? packItems;
  const listed = packMode && !activePack ? popular : displayed;
  const selected = listed.find((item) => item.key === selectedKey && !archivedKeys.includes(item.key));
  const media = selected ? marketplacePreview(selected) : null;
  const src = media?.kind === "audio" ? media.url : undefined;
  const duration = selectedKey ? durations[selectedKey] ?? 0 : 0;

  useEffect(() => {
    const pauseForOtherAudio = (event: Event) => {
      const player = audio.current;
      if ((event.target as Element | null)?.tagName === "AUDIO" && event.target !== player && player && !player.paused) {
        playbackVersion.current++;
        player.pause?.();
      }
    };
    document.addEventListener("play", pauseForOtherAudio, true);
    return () => document.removeEventListener("play", pauseForOtherAudio, true);
  }, []);

  useEffect(() => {
    const player = audio.current;
    if (!player) return;
    const version = ++playbackVersion.current;
    setPlaying(false); setPosition(0); setError(false);
    if (!src && selectedKey) setSelectedKey(null);
    if (src) void player.play?.()?.catch(() => { if (version === playbackVersion.current) setError(true); });
    return () => { playbackVersion.current++; player.pause?.(); };
  }, [src, selectedKey]);

  const toggle = () => {
    if (!audio.current) return;
    if (audio.current.paused) {
      const version = playbackVersion.current;
      setError(false);
      void audio.current.play?.()?.catch(() => { if (version === playbackVersion.current) setError(true); });
    } else { playbackVersion.current++; audio.current.pause?.(); }
  };
  const seek = (next: number) => {
    if (!audio.current || !duration) return;
    audio.current.currentTime = Math.min(duration, Math.max(0, next));
    setPosition(audio.current.currentTime);
  };
  const changeVolume = (next: number) => {
    if (audio.current) audio.current.volume = next;
    setVolume(next);
  };

  return <section className="explore-sounds flex min-w-0 flex-col" aria-label="Sound library">
    {packMode && !activePack && <header className="explore-sound-section-heading"><span><strong>Popular sounds</strong><small>Ready to preview</small></span></header>}
    {activePack && <div className="mb-2 flex min-w-0 items-center gap-2">
      <IconButton className="size-8 rounded-control hover:bg-surface-hover" label="All sound packs" onClick={() => { setPackId(null); setGroup("all"); }}><ArrowLeft className="size-4" aria-hidden="true" /></IconButton>
      <span className="flex min-w-0 flex-col"><strong className="truncate type-sm font-medium">{activePack.name}</strong><small className="type-xs text-muted">{activePack.publisher} · {activePack.items.length} sounds</small></span>
    </div>}
    {(!packMode || activePack) && showFilters && groups.length > 1 && <div className="flex min-w-0 pb-2">
      <SegmentedControl value={activeGroup?.value ?? "all"} ariaLabel="Sound type" onValueChange={setGroup}
        options={[{ value: "all", label: "All sounds", count: packItems.length }, ...groups.map(({ value, label, icon: Icon, items: matching }) => ({ value, label, icon: <Icon className="size-3.5" />, count: matching.length }))]} />
    </div>}
    <audio ref={audio} src={src} preload="metadata" className="hidden" aria-label="Sound preview"
      onLoadedMetadata={(event) => {
        const next = event.currentTarget.duration;
        if (selectedKey && Number.isFinite(next) && next > 0) {
          setDurations((current) => ({ ...current, [selectedKey]: next }));
          event.currentTarget.currentTime = Math.min(next, startAt.current);
          setPosition(event.currentTarget.currentTime);
          startAt.current = 0;
        }
      }}
      onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onError={() => { if (src && selected) { setPlaying(false); setError(true); onUnavailable?.(selected); } }}
    />
    {selected && <aside className="explore-sound-player" aria-label="Now playing">
      <IconButton className="size-7 rounded-control hover:bg-surface-hover" label={`${playing ? "Pause" : "Play"} current sound ${selected.name}`} disabled={error} onClick={toggle}>
        {playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
      </IconButton>
      <span className="min-w-0 flex-1 truncate type-sm font-medium">{selected.name}</span>
      <span className="type-xs tabular-nums text-muted">{audioTime(position)} / {duration ? audioTime(duration) : "—"}</span>
      <IconButton className="size-7 rounded-control hover:bg-surface-hover" label={`${volume ? "Mute" : "Unmute"} ${selected.name}`} onClick={() => changeVolume(volume ? 0 : 1)}>
        {volume ? <Volume2 className="size-4" aria-hidden="true" /> : <VolumeX className="size-4" aria-hidden="true" />}
      </IconButton>
      <div className="explore-sound-player-volume"><SnappySlider min={0} max={1} step={0.05} value={volume} ariaLabel={`Volume for ${selected.name}`} onValueChange={changeVolume} /></div>
    </aside>}
    {listed.length > 0 && <ol className="explore-sound-list m-0 flex list-none flex-col gap-1 p-0" aria-label={packMode && !activePack ? "Popular sounds" : "Sounds"}>
      {listed.map((item) => {
        const preview = marketplacePreview(item);
        const pack = itemPack(item);
        const packCredit = item.studio?.mediaCredit?.split(" · ").filter((part) => part !== pack?.publisher) ?? [];
        const metadata = pack ? [pack.publisher, pack.name, ...packCredit].join(" · ") : item.tags.join(" · ") || item.summary;
        const playable = preview?.kind === "audio" && !archivedKeys.includes(item.key);
        const active = selected?.key === item.key;
        return <li className={`explore-sound-row ${active ? "is-selected" : ""}`} key={item.key}>
          <div className="explore-sound-artwork" aria-hidden="true">
            {preview?.posterUrl ? <img src={preview.posterUrl} alt="" loading="lazy" /> : <AudioLines className="size-5 text-muted" />}
          </div>
          <IconButton className="explore-sound-play" disabled={!playable}
            label={`${active && playing ? "Pause" : "Play"} ${item.name}`} title={playable ? item.name : "Audio preview unavailable"}
            onClick={() => { if (active) toggle(); else { startAt.current = 0; setSelectedKey(item.key); } }}>
            {active && playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
          </IconButton>
          <button className="explore-sound-copy flex min-w-0 flex-col gap-1 text-left" type="button"
            id={marketplaceItemDomId(item.key)} data-marketplace-item-key={item.key}
            aria-label={`View ${item.name}`} onClick={() => onOpenItem(item.key)}>
            <strong className="w-full truncate type-sm font-medium">{item.name}</strong>
            <span className="w-full truncate type-xs text-muted" role={active && error ? "status" : undefined}
              title={active && error ? "Preview could not play. Try again." : undefined}>
              {active && error ? "Preview could not play. Try again." : playable ? metadata : "Archived · audio preview unavailable"}
            </span>
          </button>
          <div className="explore-sound-timeline">
            {playable && preview && <WaveformTrack src={preview.url} name={item.name} position={active ? position : 0} eager={!packMode || active}
              duration={durations[item.key] ?? 0} disabled={active && error} onUnavailable={() => onUnavailable?.(item)} onSeek={(next) => {
                if (active) seek(next);
                else { startAt.current = next; setSelectedKey(item.key); }
              }}
              onDuration={(next) => setDurations((current) => current[item.key] === next ? current : { ...current, [item.key]: next })} />}
          </div>
          <span className="explore-sound-duration type-xs tabular-nums text-muted">
            <span>{audioTime(active ? position : 0)}</span><span aria-hidden="true"> / </span><span>{durations[item.key] ? audioTime(durations[item.key]) : "—"}</span>
          </span>
          <div className="explore-sound-actions flex items-center gap-1">
            {onUse && <IconButton className="size-8 rounded-control hover:bg-surface-hover" label={`Use ${item.name} in chat`} title="Use in chat" disabled={!playable} onClick={() => onUse(item)}><MessageCircle className="size-4" aria-hidden="true" /></IconButton>}
          </div>
        </li>;
      })}
    </ol>}
    {packMode && !activePack && <>
      <header className="explore-sound-section-heading"><span><strong>Categories &amp; playlists</strong><small>Browse complete packs</small></span></header>
      <div className="explore-sound-packs grid min-w-0 gap-2" aria-label="Sound packs">
        {packs.map((pack) => {
          const cover = marketplacePreview(pack.items[0]!)?.posterUrl;
          return <button className="explore-sound-pack grid min-w-0 overflow-hidden rounded-window bg-panel text-ink" type="button" key={pack.id}
            aria-label={`Open ${pack.name} pack`} onClick={() => { setGroup("all"); setPackId(pack.id); }}>
            <span className={`explore-sound-pack-cover grid h-full w-full place-items-center ${WINDOW_PLATE}`}>
              {cover ? <img src={cover} alt="" loading="lazy" /> : <Package className="size-7 text-muted" aria-hidden="true" />}
            </span>
            <span className="flex min-w-0 flex-col justify-center gap-0.5 px-3 py-2 text-left"><strong className="truncate type-sm font-medium">{pack.name}</strong><small className="truncate type-xs text-muted">{pack.publisher} · {pack.items.length} sounds</small></span>
          </button>;
        })}
      </div>
    </>}
  </section>;
}
