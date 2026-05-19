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
    <div className="lightbox" onClick={onClose}>
      <button className="lb-close" onClick={onClose} aria-label="Close">
        <I.close />
      </button>
      <button
        className="nav-btn nav-prev"
        onClick={(e) => {
          e.stopPropagation();
          onPrev();
        }}
        aria-label="Previous"
      >
        <I.chevL />
      </button>
      <button
        className="nav-btn nav-next"
        onClick={(e) => {
          e.stopPropagation();
          onNext();
        }}
        aria-label="Next"
      >
        <I.chevR />
      </button>
      <div className="stage" onClick={(e) => e.stopPropagation()}>
        <video ref={v} key={clip.id} src={clip.src} poster={clip.poster} autoPlay loop muted={muted} playsInline />
        <button
          className="lb-mute"
          onClick={() => {
            setMuted((m) => !m);
            if (v.current) v.current.muted = !muted;
          }}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <div className="lb-meta">
          <div className="lb-meta-label">{clip.label}</div>
          <div className="lb-meta-title">{clip.title}</div>
        </div>
      </div>
    </div>
  );
}
