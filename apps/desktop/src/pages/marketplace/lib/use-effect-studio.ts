import { useEffect, useRef, type RefObject } from "react";
import { renderEffectFrame } from "./effect-rendering";
import type { effectStudio } from "./effect-settings";

export function useEffectStudio({ studio, before, after, amount, active, paused, manualPlay, compact, onPlaying, onError }: {
  studio: ReturnType<typeof effectStudio>;
  before: RefObject<HTMLCanvasElement | null>;
  after: RefObject<HTMLCanvasElement | null>;
  amount: number;
  active: boolean;
  paused: boolean;
  manualPlay: number;
  compact: boolean;
  onPlaying(playing: boolean): void;
  onError(): void;
}) {
  const latest = useRef({ amount, onPlaying, onError });
  latest.current = { amount, onPlaying, onError };
  const repaint = useRef<(() => void) | null>(null);
  useEffect(() => { repaint.current?.(); }, [amount]);

  useEffect(() => {
    if (!studio || !before.current || !after.current) return;
    const original = before.current;
    const result = after.current;
    const size = compact ? 320 : 640;
    original.width = result.width = size;
    original.height = result.height = size;
    const input = original.getContext("2d");
    const output = result.getContext("2d");
    if (!input || !output) { latest.current.onError(); return; }
    const scratch = document.createElement("canvas");
    const image = new Image();
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let request = 0;
    let frame = 0;
    let last = 0;
    let loaded = false;
    let disposed = false;
    let permitMotion = manualPlay > 0;
    const moving = () => active && !paused && (permitMotion || !preference?.matches);
    const draw = () => {
      if (!loaded || disposed) return;
      // One crop and camera pose feed both sides, so the split never compares different frames.
      const zoom = 1.04 + Math.sin(frame / 55) * 0.025;
      const scale = Math.max(size / image.width, size / image.height) * zoom;
      input.drawImage(image, (size - image.width * scale) / 2, (size - image.height * scale) / 2, image.width * scale, image.height * scale);
      try { renderEffectFrame(output, original, scratch, studio.id, latest.current.amount, frame); }
      catch { latest.current.onError(); }
    };
    repaint.current = draw;
    const tick = (now: number) => {
      if (!moving() || disposed) return;
      if (now - last >= 80) { frame++; draw(); last = now; }
      request = window.requestAnimationFrame(tick);
    };
    const update = () => {
      window.cancelAnimationFrame(request);
      draw();
      const playing = loaded && moving();
      latest.current.onPlaying(playing);
      if (playing) request = window.requestAnimationFrame(tick);
    };
    const motionChanged = () => { permitMotion = false; update(); };
    image.onload = () => { loaded = true; update(); };
    image.onerror = () => { if (!disposed) latest.current.onError(); };
    image.src = studio.sourceUrl;
    preference?.addEventListener?.("change", motionChanged);
    return () => {
      disposed = true;
      repaint.current = null;
      window.cancelAnimationFrame(request);
      preference?.removeEventListener?.("change", motionChanged);
      image.onload = image.onerror = null;
    };
  }, [studio?.id, studio?.sourceUrl, before, after, active, paused, manualPlay, compact]);
}
