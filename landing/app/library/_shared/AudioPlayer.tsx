"use client";

// Designed <AudioPlayer> (#091) — replaces the browser-default <audio controls>
// for music asset blocks in the library. Matches the library register:
// pure-black surface (bg-tint, no borders), single --vio accent, mono type.
//
// What it is: a thin chrome around a HIDDEN native <audio> element (driven via a
// ref). All audio decoding/streaming is the browser's; this component only
// reflects the element's state (currentTime / duration / paused) into React and
// pushes user intent (play / pause / seek) back onto the element. No fetch, no
// Web Audio / FFT — works directly with the cross-origin Supabase Storage mp3
// URL as a plain <audio src>.
//
// Controls:
//   • play/pause toggle (PlayIcon / PauseIcon)
//   • seek/progress bar — click + drag (pointer capture) to scrub; the FILLED
//     portion is the --vio accent over a bg-tint pill track. A cheap, static
//     CSS-only "waveform-ish" bar treatment sits BEHIND the fill (decorative
//     repeating-linear-gradient — no audio analysis).
//   • current / total time (mm:ss)
//   • the track name (the block.name prop)
//
// Accessibility: the progress bar is role="slider" with aria-value*; Space
// toggles play/pause and ←/→ seek ±5s when the player root (or the slider) is
// focused. The play/pause button is labelled.
//
// SSR-safe: the audio element + listeners are wired in effects; no window access
// during render.
//
// No visible borders anywhere — separation is bg-tint + shadow + spacing only.

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PauseIcon, PlayIcon } from "./icons";

const SEEK_STEP = 5; // seconds for ←/→ keyboard seek

/** mm:ss from seconds; guards NaN/Infinity (duration before metadata loads). */
function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlayer({
  src,
  name,
  className,
}: {
  src: string;
  name: string;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);

  // Reflect the native element's state into React. Effects only (SSR-safe).
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onTime = () => {
      // While the user drags, the bar position is driven by the pointer, not
      // the element — don't fight the scrub.
      if (!scrubbing) setCurrent(el.currentTime);
    };
    const onMeta = () => setDuration(el.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
    };

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);

    // Metadata may already be available (cached) before listeners attach.
    if (el.readyState >= 1 && Number.isFinite(el.duration)) setDuration(el.duration);

    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, [scrubbing]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setPlaying(false));
    else el.pause();
  }, []);

  const seekTo = useCallback((t: number) => {
    const el = audioRef.current;
    if (!el) return;
    const dur = Number.isFinite(el.duration) ? el.duration : 0;
    const clamped = Math.max(0, Math.min(t, dur || t));
    el.currentTime = clamped;
    setCurrent(clamped);
  }, []);

  const seekBy = useCallback(
    (delta: number) => {
      const el = audioRef.current;
      if (!el) return;
      seekTo(el.currentTime + delta);
    },
    [seekTo],
  );

  // Map a clientX onto a 0..duration time using the bar's geometry.
  const timeFromClientX = useCallback(
    (clientX: number): number => {
      const bar = barRef.current;
      if (!bar || duration <= 0) return 0;
      const rect = bar.getBoundingClientRect();
      const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
      return Math.max(0, Math.min(1, ratio)) * duration;
    },
    [duration],
  );

  const onBarPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (duration <= 0) return;
      setScrubbing(true);
      barRef.current?.setPointerCapture(e.pointerId);
      setCurrent(timeFromClientX(e.clientX));
    },
    [duration, timeFromClientX],
  );

  const onBarPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!scrubbing) return;
      setCurrent(timeFromClientX(e.clientX));
    },
    [scrubbing, timeFromClientX],
  );

  const onBarPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!scrubbing) return;
      setScrubbing(false);
      barRef.current?.releasePointerCapture(e.pointerId);
      seekTo(timeFromClientX(e.clientX));
    },
    [scrubbing, timeFromClientX, seekTo],
  );

  // Keyboard on the root: Space = toggle, ←/→ = seek. Slider also handles arrows
  // (and stops them bubbling to avoid a double-seek).
  const onRootKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekBy(-SEEK_STEP);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seekBy(SEEK_STEP);
      }
    },
    [toggle, seekBy],
  );

  const onSliderKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        seekBy(-SEEK_STEP);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        seekBy(SEEK_STEP);
      } else if (e.key === "Home") {
        e.preventDefault();
        seekTo(0);
      } else if (e.key === "End") {
        e.preventDefault();
        if (duration > 0) seekTo(duration);
      }
    },
    [seekBy, seekTo, duration],
  );

  const pct = duration > 0 ? Math.max(0, Math.min(1, current / duration)) * 100 : 0;

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={cn("ap-root", className)}
      onKeyDown={onRootKeyDown}
      tabIndex={-1}
    >
      <button
        type="button"
        className="ap-toggle"
        onClick={toggle}
        aria-label={playing ? `Pause ${name}` : `Play ${name}`}
        aria-pressed={playing}
      >
        {playing ? <PauseIcon s={16} /> : <PlayIcon s={16} />}
      </button>

      <div className="ap-body">
        <div className="ap-topline">
          <span className="ap-name">{name}</span>
          <span className="ap-time">
            {fmtTime(current)} / {fmtTime(duration)}
          </span>
        </div>

        <div
          ref={barRef}
          className={cn("ap-bar", scrubbing && "is-scrubbing")}
          role="slider"
          tabIndex={0}
          aria-label={`Seek ${name}`}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration) || 0}
          aria-valuenow={Math.round(current)}
          aria-valuetext={`${fmtTime(current)} of ${fmtTime(duration)}`}
          aria-orientation="horizontal"
          onPointerDown={onBarPointerDown}
          onPointerMove={onBarPointerMove}
          onPointerUp={onBarPointerUp}
          onPointerCancel={onBarPointerUp}
          onKeyDown={onSliderKeyDown}
        >
          {/* Decorative static waveform-ish texture — CSS only, no analysis. */}
          <span className="ap-wave" aria-hidden />
          <span className="ap-fill" style={{ width: `${pct}%` }} aria-hidden />
          <span className="ap-thumb" style={{ left: `${pct}%` }} aria-hidden />
        </div>
      </div>

      {/* The hidden native engine — does all the decoding/streaming. */}
      <audio ref={audioRef} preload="metadata" src={src} className="ap-audio-hidden" />
    </div>
  );
}
