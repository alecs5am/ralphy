import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronDown, Mic, Pause, Play, RefreshCw } from "@/shared/ui/icons";
import { bridge } from "@/shared/api/ipc";
import { GENERATION_PROVIDERS_CHANGED_EVENT, type GenerationVoice } from "../../../../shared/generation-studio";
import { STUDIO_BUTTON, STUDIO_FIELD, STUDIO_ICON } from "./generation-chrome";
import { GenerationPickerMenu } from "./GenerationPickerMenu";

export function GenerationVoicePicker({ workspaceId, connected, value, onChange }: { workspaceId: string; connected: boolean; value: string; onChange(value: string): void }) {
  const [voices, setVoices] = useState<GenerationVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [custom, setCustom] = useState(value);
  const [reload, setReload] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const refresh = () => setReload((count) => count + 1);
    window.addEventListener(GENERATION_PROVIDERS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(GENERATION_PROVIDERS_CHANGED_EVENT, refresh);
  }, []);
  useEffect(() => { setPlaying(false); }, [value, connected]);
  useEffect(() => {
    if (!connected) { setVoices([]); setLoading(false); setError(null); return; }
    let current = true;
    setVoices([]); setLoading(true); setError(null);
    void bridge.loadGenerationVoices(workspaceId).then((items) => { if (current) setVoices(items); }).catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : String(cause)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [workspaceId, connected, reload]);
  const selected = voices.find((voice) => voice.id === value);
  const filtered = voices.filter((voice) => query.toLocaleLowerCase().split(/\s+/).every((word) => `${voice.name} ${voice.description}`.toLocaleLowerCase().includes(word)));
  const choose = (id: string) => { if (id.trim()) { onChange(id.trim()); setExpanded(false); } };
  return <Dialog.Root open={expanded} modal={false} onOpenChange={(open) => { setExpanded(open); if (open) { setQuery(""); setCustom(value); } }}><div className="generation-voice-picker flex min-w-0 flex-col gap-2">
    <div className="generation-model-row generation-voice-row">
      {selected?.previewUrl && connected ? <button className="generation-model-tile" type="button" aria-label={`${playing ? "Pause" : "Play"} ${selected.name} preview`} onClick={() => { if (playing) audio.current?.pause(); else void audio.current?.play().catch(() => { setError("Voice preview unavailable. You can still use this voice."); setPlaying(false); }); }}>{playing ? <Pause size={16} /> : <Play size={16} />}</button> : <span className="generation-model-tile"><Mic size={18} /></span>}
      <Dialog.Trigger asChild><button ref={trigger} id="generation-voice" type="button" className="generation-voice-trigger" aria-label="Choose a voice"><span className="generation-row-copy"><strong>{loading ? "Loading account voices…" : selected?.name ?? (value ? "Custom voice" : "Choose a voice")}</strong><small>{selected?.description || (connected ? value && !selected ? value : "From your ElevenLabs" : "Connection needed")}</small></span><ChevronDown size={12} /></button></Dialog.Trigger>
    </div>
    {selected?.previewUrl && connected && <audio ref={audio} key={selected.id} hidden src={selected.previewUrl} preload="none" onPlay={() => { setError(null); setPlaying(true); }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => { setPlaying(false); setError("Voice preview unavailable. You can still use this voice."); }} />}
    {expanded && <GenerationPickerMenu kind="voice" opener={trigger.current} query={query} onQuery={setQuery} onClose={() => setExpanded(false)} actions={<button type="button" className={STUDIO_ICON} disabled={loading || !connected} aria-label="Refresh voices" onClick={() => setReload((count) => count + 1)}><RefreshCw size={12} /></button>} footer={<div className="generation-picker-footer">
      {error && <p className="m-0 type-xs leading-relaxed text-muted" role="status">{error}</p>}
      <details open={!connected || (!loading && !voices.length)} className="generation-custom-voice type-xs text-muted"><summary>Use a voice ID</summary><div className="mt-2 flex items-center gap-2"><input id="generation-custom-voice" aria-label="ElevenLabs voice ID" className={STUDIO_FIELD} type="text" value={custom} maxLength={256} placeholder="Paste a voice ID" onChange={(event) => setCustom(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); choose(custom); } }} /><button type="button" className={`${STUDIO_BUTTON} shrink-0`} disabled={!custom.trim()} onClick={() => choose(custom)}>Use voice</button></div></details>
    </div>}>
      <div className="px-2 py-2 font-code type-mono-xs text-muted" role="status">{loading ? "Loading account voices…" : `${filtered.length} ${filtered.length === 1 ? "voice" : "voices"}`}</div>
      {filtered.map((voice) => <button type="button" key={voice.id} title={voice.name} className="generation-model-option group" aria-pressed={value === voice.id} onClick={() => choose(voice.id)}><span className="generation-model-tile"><Mic size={18} /></span><span className="generation-row-copy"><strong>{voice.name}</strong><small>{voice.description || "ElevenLabs voice"}</small></span><Check size={12} className="shrink-0 opacity-0 group-aria-pressed:opacity-100" aria-hidden="true" /></button>)}
      {!loading && !filtered.length && <p className="px-2 py-3 type-xs text-muted">{query ? "No matching voices." : connected ? "No account voices available. Enter a voice ID below." : "Connect ElevenLabs to browse your voices, or enter a voice ID below."}</p>}
    </GenerationPickerMenu>}
    {error && !expanded && <span className="type-xs leading-relaxed text-muted" role="status">{error}</span>}
  </div></Dialog.Root>;
}
