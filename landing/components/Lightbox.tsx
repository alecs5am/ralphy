"use client";

import { useEffect, useRef, useState } from "react";
import { I } from "./Icons";
import type { Clip } from "@/lib/data";

type Props = {
  clip: Clip;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
};

export function Lightbox({ clip, onClose, onPrev, onNext }: Props) {
  const v = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, onPrev, onNext]);

  return (
    <div
      className="fixed inset-0 z-[200] bg-[rgb(0_0_0/0.95)] backdrop-blur-[10px] grid place-items-center p-7 animate-[fadeOnly_220ms_ease]"
      onClick={onClose}
    >
      <button
        className="absolute top-6 right-6 w-11 h-11 rounded-full grid place-items-center bg-bg-2 text-ink shadow-[inset_0_0_0_1px_var(--color-line-2)]"
        onClick={onClose}
        aria-label="Close"
      >
        <I.close />
      </button>
      <button
        className="absolute top-1/2 -translate-y-1/2 left-6 w-11 h-11 rounded-full grid place-items-center bg-bg-2 text-ink shadow-[inset_0_0_0_1px_var(--color-line-2)]"
        onClick={(e) => {
          e.stopPropagation();
          onPrev();
        }}
        aria-label="Previous"
      >
        <I.chevL />
      </button>
      <button
        className="absolute top-1/2 -translate-y-1/2 right-6 w-11 h-11 rounded-full grid place-items-center bg-bg-2 text-ink shadow-[inset_0_0_0_1px_var(--color-line-2)]"
        onClick={(e) => {
          e.stopPropagation();
          onNext();
        }}
        aria-label="Next"
      >
        <I.chevR />
      </button>
      <div
        className="relative inline-block max-w-[min(95vw,1280px)] max-h-[90vh] rounded-[20px] overflow-hidden bg-black leading-none shadow-[inset_0_0_0_1px_var(--color-line-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <video
          ref={v}
          key={clip.id}
          src={clip.src}
          poster={clip.poster}
          autoPlay
          loop
          muted={muted}
          playsInline
          className="block max-w-[min(95vw,1280px)] max-h-[90vh] w-auto h-auto object-contain"
        />
        <button
          className="absolute top-4 left-4 z-[4] w-10 h-10 grid place-items-center rounded-full bg-[rgb(0_0_0/0.55)] text-white text-[16px] cursor-pointer backdrop-blur-[6px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)] transition-[background,transform] duration-[180ms] hover:bg-[rgb(0_0_0/0.75)] hover:scale-105"
          onClick={() => {
            setMuted((m) => !m);
            if (v.current) v.current.muted = !muted;
          }}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <div className="absolute left-0 right-0 bottom-0 pt-16 px-6 pb-5 pointer-events-none text-ink [background:linear-gradient(to_top,rgb(0_0_0/0.78)_0%,rgb(0_0_0/0.45)_55%,transparent_100%)]">
          <div className="font-mono text-[11px] tracking-[0.08em] uppercase text-vio-2 mb-2">{clip.label}</div>
          <div className="font-display font-extrabold uppercase text-[18px] tracking-[-0.005em] leading-[1.15] text-white">{clip.title}</div>
        </div>
      </div>
    </div>
  );
}
