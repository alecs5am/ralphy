"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { VideoClip } from "@/lib/site";

/* ──────────────────────────────────────────────
   VideoCard — TikTok-feed card that ALWAYS plays
   when it scrolls into view (muted by default).
   Click sound icon to unmute one card at a time.
   ────────────────────────────────────────────── */

export function VideoCard({ clip, eager = false }: { clip: VideoClip; eager?: boolean }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hot, setHot] = useState(eager);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  // Mount video when within 400px of viewport, then auto-play / pause
  // based on whether at least 35% of the card is visible.
  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setHot(true);
      return;
    }

    const mountIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setHot(true);
            mountIO.disconnect();
          }
        });
      },
      { rootMargin: "400px 0px" }
    );
    mountIO.observe(node);
    return () => mountIO.disconnect();
  }, []);

  // Once mounted, auto-play / pause as the card moves in/out of view
  useEffect(() => {
    if (!hot) return;
    const node = wrapRef.current;
    const v = videoRef.current;
    if (!node || !v) return;

    const playIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            v.muted = muted;
            v.play()
              .then(() => setPlaying(true))
              .catch(() => setPlaying(false));
          } else {
            v.pause();
            setPlaying(false);
          }
        });
      },
      { threshold: [0, 0.35, 1] }
    );
    playIO.observe(node);
    return () => playIO.disconnect();
  }, [hot, muted]);

  const toggleMute = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const v = videoRef.current;
    const next = !muted;
    setMuted(next);
    if (v) v.muted = next;
  };

  return (
    <article
      ref={wrapRef}
      tabIndex={0}
      aria-label={`${clip.label} — ${clip.title}`}
      className="group relative block aspect-[9/16] cursor-default overflow-hidden rounded-[20px] border border-[var(--color-line)] bg-black transition-all duration-300 will-change-transform hover:-translate-y-1 hover:border-[var(--color-line-2)] hover:shadow-[0_24px_60px_-24px_rgb(61_216_255/0.4)] focus-visible:border-[var(--color-cyan)] focus-visible:outline-none"
    >
      {/* Poster — only visible until video starts playing */}
      <Image
        src={clip.poster}
        alt={clip.title}
        fill
        sizes="(max-width: 640px) 80vw, (max-width: 1024px) 33vw, 22vw"
        priority={eager}
        className={`object-cover transition-opacity duration-500 ${playing ? "opacity-0" : "opacity-100"}`}
      />

      {/* Video — auto-plays when in view */}
      {hot && (
        <video
          ref={videoRef}
          src={clip.src}
          poster={clip.poster}
          muted={muted}
          loop
          playsInline
          preload="metadata"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${playing ? "opacity-100" : "opacity-0"}`}
        />
      )}

      {/* Subtle vignette so HUD overlays read clearly */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgb(0 0 0 / 0.55) 0%, rgb(0 0 0 / 0) 28%, rgb(0 0 0 / 0) 55%, rgb(0 0 0 / 0.85) 100%)",
        }}
      />

      {/* Top row — duration pill (left) + sound toggle (right) */}
      <div className="absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-black/55 px-2 py-1 text-[11px] text-white backdrop-blur-md"
          style={{ fontFamily: "var(--font-pixel)", letterSpacing: "0.04em" }}
        >
          {playing ? (
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-cyan)]" style={{ boxShadow: "0 0 8px var(--color-cyan)" }} />
          ) : null}
          {clip.duration}
        </span>

        {hot && (
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            aria-pressed={!muted}
            className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/55 text-white/85 backdrop-blur-md transition hover:border-[var(--color-cyan)] hover:bg-[var(--color-cyan)] hover:text-[var(--color-ink)]"
          >
            {muted ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Right rail — TikTok-style action stats */}
      <ul className="absolute inset-y-0 right-3 z-10 my-auto flex h-fit flex-col items-center gap-3 self-center text-[11px] text-white">
        <Stat icon={<HeartIcon />} value={clip.stats.likes} />
        <Stat icon={<CommentIcon />} value={clip.stats.comments} />
        <Stat icon={<ShareIcon />} value={clip.stats.shares} />
      </ul>

      {/* Bottom — handle + caption + ratio pill */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 px-4 pb-4">
        <div className="flex items-center gap-2">
          <span
            className="text-[12px] text-white/85"
            style={{ fontFamily: "var(--font-pixel)", letterSpacing: "0.04em" }}
          >
            @ralphy
          </span>
          <span
            className="rounded border border-white/15 bg-black/55 px-1.5 py-[2px] text-[10px] text-[var(--color-cyan-2)] backdrop-blur"
            style={{ fontFamily: "var(--font-pixel)", letterSpacing: "0.04em" }}
          >
            {clip.ratio}
          </span>
        </div>

        <div
          className="text-[12px] text-[var(--color-cyan)]"
          style={{ fontFamily: "var(--font-pixel)", letterSpacing: "0.04em" }}
        >
          {clip.label}
        </div>

        <h3
          className="line-clamp-2 text-[18px] italic leading-[1.15] text-white"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          &ldquo;{clip.title}&rdquo;
        </h3>

        <div className="mt-1 flex items-center gap-2 text-[10px] text-white/70">
          <span className="inline-flex items-end gap-[2px]" aria-hidden>
            <span className={`block w-[2px] bg-[var(--color-cyan)] ${playing ? "animate-[wav_0.7s_ease-in-out_infinite_alternate]" : ""}`} style={{ height: 8 }} />
            <span className={`block w-[2px] bg-[var(--color-cyan)] ${playing ? "animate-[wav_0.7s_ease-in-out_infinite_alternate]" : ""}`} style={{ height: 12, animationDelay: "0.12s" }} />
            <span className={`block w-[2px] bg-[var(--color-cyan)] ${playing ? "animate-[wav_0.7s_ease-in-out_infinite_alternate]" : ""}`} style={{ height: 6, animationDelay: "0.24s" }} />
            <span className={`block w-[2px] bg-[var(--color-cyan)] ${playing ? "animate-[wav_0.7s_ease-in-out_infinite_alternate]" : ""}`} style={{ height: 10, animationDelay: "0.36s" }} />
          </span>
          <span style={{ fontFamily: "var(--font-pixel)", letterSpacing: "0.04em" }}>
            elevenlabs · multilingual v2
          </span>
        </div>
      </div>
    </article>
  );
}

function Stat({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <li className="flex flex-col items-center gap-1">
      <span className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/55 text-white/90 backdrop-blur-md transition hover:border-[var(--color-cyan)] hover:text-[var(--color-cyan)]">
        {icon}
      </span>
      <span style={{ fontFamily: "var(--font-pixel)", letterSpacing: "0.04em" }}>{value}</span>
    </li>
  );
}

function HeartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21s-7-4.35-9.5-9.04C.96 8.78 2.43 5 6 5c2.07 0 3.5 1.18 4.5 2.5C11.5 6.18 12.93 5 15 5c3.57 0 5.04 3.78 3.5 6.96C19 16.65 12 21 12 21z" />
    </svg>
  );
}
function CommentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
