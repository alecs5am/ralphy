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
        <div className="lb-meta">
          <div>
            <div style={{ color: "var(--vio-2)" }}>{clip.label}</div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                textTransform: "uppercase",
                fontSize: 18,
                color: "var(--ink)",
                marginTop: 6,
                letterSpacing: "-0.005em",
              }}
            >
              {clip.title}
            </div>
          </div>
          <button
            className="btn"
            style={{ padding: "6px 12px", fontSize: 12 }}
            onClick={() => {
              setMuted((m) => !m);
              if (v.current) v.current.muted = !muted;
            }}
          >
            {muted ? "🔇 unmute" : "🔊 mute"}
          </button>
        </div>
      </div>
    </div>
  );
}
