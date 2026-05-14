"use client";

import { useEffect, useRef, useState } from "react";
import { I } from "./Icons";
import type { Clip } from "@/lib/data";

const SPAN_CLASS: Record<Clip["span"], string> = {
  v1: "t-v1",
  v2: "t-v2",
  h2: "t-h2",
  h3: "t-h3",
  sq: "t-sq",
};

export function VideoTile({ clip, onOpen }: { clip: Clip; onOpen: (c: Clip) => void }) {
  const ref = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hot, setHot] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setHot(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setHot(true);
            io.disconnect();
          }
        });
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (hovering) {
      v.muted = true;
      v.currentTime = 0;
      v.play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    } else {
      v.pause();
      setPlaying(false);
    }
  }, [hovering, hot]);

  return (
    <article
      ref={ref}
      className={`tile-v ${SPAN_CLASS[clip.span] || "t-v1"}`}
      onClick={() => onOpen(clip)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(clip);
        }
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
      tabIndex={0}
      role="button"
      aria-label={`Play ${clip.title}`}
    >
      <img src={clip.poster} alt={clip.title} style={{ opacity: playing ? 0 : 1, transition: "opacity 300ms ease" }} />
      {hot && (
        <video
          ref={videoRef}
          src={clip.src}
          poster={clip.poster}
          muted
          loop
          playsInline
          preload="metadata"
          style={{ opacity: playing ? 1 : 0, transition: "opacity 300ms ease" }}
        />
      )}
      <div className="overlay" />
      <span className="label">{clip.label}</span>
      <div className="play">
        <span>
          <I.play />
        </span>
      </div>
    </article>
  );
}
