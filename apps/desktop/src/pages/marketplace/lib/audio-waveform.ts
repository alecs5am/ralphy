import { MAX_WAVEFORM_DECODE_BYTES } from "@/entities/media";

export type AudioPeaks = { peaks: number[]; duration: number };
const cache = new Map<string, Promise<AudioPeaks | null>>();

/** Each bar is the loudest actual sample in that part of the clip. */
export function waveformPeaks(channels: Float32Array[], count = 1024): number[] {
  const length = channels[0]?.length ?? 0;
  const peaks = Array.from({ length: count }, (_, bar) => {
    const start = Math.floor(bar * length / count);
    const end = Math.floor((bar + 1) * length / count);
    let peak = 0;
    for (const channel of channels) for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(channel[i] ?? 0));
    return peak;
  });
  const maximum = Math.max(...peaks);
  return maximum ? peaks.map((peak) => peak / maximum) : peaks;
}

export function loadAudioPeaks(src: string): Promise<AudioPeaks | null> {
  const found = cache.get(src);
  if (found) return found;
  const pending = (async () => {
    if (typeof OfflineAudioContext === "undefined") return null;
    try {
      const response = await fetch(src, { credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
      if (!response.ok || Number(response.headers.get("content-length")) > MAX_WAVEFORM_DECODE_BYTES) return null;
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > MAX_WAVEFORM_DECODE_BYTES) return null;
      const decoded = await new OfflineAudioContext(1, 1, 22050).decodeAudioData(bytes);
      return {
        duration: decoded.duration,
        peaks: waveformPeaks(Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index))),
      };
    } catch { return null; }
  })();
  // Keep only small peak summaries, not decoded buffers or an unbounded library cache.
  if (cache.size >= 64) cache.delete(cache.keys().next().value!);
  cache.set(src, pending);
  void pending.then((value) => { if (!value && cache.get(src) === pending) cache.delete(src); });
  return pending;
}

export const audioTime = (seconds: number) => Number.isFinite(seconds) && seconds >= 0
  ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}` : "0:00";
