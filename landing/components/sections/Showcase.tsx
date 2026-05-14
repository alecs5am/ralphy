"use client";

import { useState } from "react";
import { clips, type Clip } from "@/lib/data";
import { VideoTile } from "../VideoTile";
import { Lightbox } from "../Lightbox";

export function Showcase() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const open = (clip: Clip) => setOpenIdx(clips.findIndex((c) => c.id === clip.id));
  const close = () => setOpenIdx(null);
  const prev = () => setOpenIdx((i) => (i == null ? 0 : (i - 1 + clips.length) % clips.length));
  const next = () => setOpenIdx((i) => (i == null ? 0 : (i + 1) % clips.length));
  const openClip = openIdx == null ? null : clips[openIdx];

  return (
    <section id="showcase" style={{ paddingTop: 56 }}>
      <div className="container">
        <div className="section-head" style={{ marginBottom: 24 }}>
          <div className="eyebrow">
            <span className="dot" />
            showcase
          </div>
          <h2 style={{ marginTop: 12 }}>
            Renders that <span className="acc">move the scroll.</span>
          </h2>
        </div>
        <div className="mosaic">
          {clips.map((c) => (
            <VideoTile key={c.id} clip={c} onOpen={open} />
          ))}
        </div>
        <p
          style={{
            marginTop: 14,
            fontSize: 12.5,
            color: "var(--mute)",
            fontFamily: "var(--font-mono)",
            textAlign: "center",
          }}
        >
          hover to preview · click for fullscreen · ← / → to navigate
        </p>
      </div>
      {openClip && <Lightbox clip={openClip} onClose={close} onPrev={prev} onNext={next} />}
    </section>
  );
}
