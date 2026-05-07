"use client";

import { useEffect, useRef, useState } from "react";
import { clips } from "@/lib/site";

/* ──────────────────────────────────────────────────────────────────
   HeroPhone — clean device frame with a real AI video looping inside.
   No floating chat bubbles, no progress bars on top of the mascot.
   Just one well-framed render, the way it was meant to be seen.
   ────────────────────────────────────────────────────────────────── */

export function HeroPhone() {
  // Pick the first clip from the showcase profile
  const clip = clips[0];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.play()
      .then(() => setReady(true))
      .catch(() => setReady(true));
  }, []);

  const onMute = () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !muted;
    setMuted(next);
    v.muted = next;
  };

  return (
    <div className="relative mx-auto w-full max-w-[420px] md:mx-0">
      {/* The phone itself — 9:16 frame with a chunky bezel */}
      <div className="relative mx-auto w-full max-w-[320px]">
        {/* Outer device shell */}
        <div className="relative aspect-[9/16] rounded-[40px] border border-[var(--color-line-2)] bg-gradient-to-b from-[#0a1220] via-[#06090f] to-[#0a1220] p-2 shadow-[0_40px_120px_-40px_rgb(61_216_255/0.45)]">
          {/* Inner screen */}
          <div className="relative h-full w-full overflow-hidden rounded-[32px] bg-black">
            <video
              ref={videoRef}
              src={clip.src}
              poster={clip.poster}
              muted
              loop
              autoPlay
              playsInline
              preload="auto"
              className="absolute inset-0 h-full w-full object-cover"
            />

            {/* Top notch bar */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-2 text-[11px] text-white/85" style={{ fontFamily: "var(--font-pixel)", letterSpacing: "0.04em" }}>
              <span>11:42</span>
              <span className="h-4 w-16 rounded-full bg-black/60" aria-hidden />
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-cyan)]" style={{ boxShadow: "0 0 8px var(--color-cyan)" }} />
                live
              </span>
            </div>

            {/* Subtle bottom scrim so the title reads */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5"
              style={{
                background:
                  "linear-gradient(180deg, transparent 0%, rgb(0 0 0 / 0.85) 90%)",
              }}
            />

            {/* Bottom card — title + handle + sound toggle */}
            <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 p-4 pb-6">
              <div className="flex flex-col gap-1.5">
                <span
                  className="text-[11px] uppercase tracking-[0.06em] text-[var(--color-cyan)]"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  {clip.label}
                </span>
                <h3
                  className="max-w-[180px] text-[18px] italic leading-[1.15] text-white"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  &ldquo;{clip.title}&rdquo;
                </h3>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-white/70" style={{ fontFamily: "var(--font-pixel)", letterSpacing: "0.04em" }}>
                  <span className="inline-flex items-end gap-[2px]" aria-hidden>
                    <span className={`block w-[2px] bg-[var(--color-cyan)] ${ready ? "animate-[wav_0.7s_ease-in-out_infinite_alternate]" : ""}`} style={{ height: 8 }} />
                    <span className={`block w-[2px] bg-[var(--color-cyan)] ${ready ? "animate-[wav_0.7s_ease-in-out_infinite_alternate]" : ""}`} style={{ height: 12, animationDelay: "0.12s" }} />
                    <span className={`block w-[2px] bg-[var(--color-cyan)] ${ready ? "animate-[wav_0.7s_ease-in-out_infinite_alternate]" : ""}`} style={{ height: 6, animationDelay: "0.24s" }} />
                    <span className={`block w-[2px] bg-[var(--color-cyan)] ${ready ? "animate-[wav_0.7s_ease-in-out_infinite_alternate]" : ""}`} style={{ height: 10, animationDelay: "0.36s" }} />
                  </span>
                  <span>elevenlabs · multilingual v2</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onMute}
                aria-label={muted ? "Unmute" : "Mute"}
                aria-pressed={!muted}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-black/55 text-white/85 backdrop-blur-md transition hover:border-[var(--color-cyan)] hover:bg-[var(--color-cyan)] hover:text-[var(--color-ink)]"
              >
                {muted ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Soft cyan ground glow under the phone */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-10 -bottom-6 h-12 rounded-full"
          style={{
            background: "radial-gradient(60% 100% at 50% 0%, rgb(61 216 255 / 0.35), transparent 70%)",
            filter: "blur(8px)",
          }}
        />
      </div>

      {/* Caption underneath */}
      <p
        className="mt-6 flex items-center justify-center gap-2 text-center text-[11px] uppercase tracking-[0.12em] text-[var(--color-mute)]"
        style={{ fontFamily: "var(--font-pixel)" }}
      >
        <span className="pulse-dot" />
        live render · ralphy-showcase profile
      </p>
    </div>
  );
}
