"use client";

import { useEffect, useState } from "react";
import { clips, type Clip } from "@/lib/data";
import { VideoTile } from "../VideoTile";
import { Lightbox } from "../Lightbox";

// Weight (height / width) per aspect class — drives greedy column packing.
const SPAN_WEIGHT: Record<Clip["span"], number> = {
  v1: 16 / 9,
  v2: 16 / 9,
  sq: 1,
  h2: 9 / 16,
  h3: 9 / 16,
};

function packIntoColumns(items: Clip[], n: number): Clip[][] {
  // LPT (Longest-Processing-Time): heavy items first, each into the
  // currently-shortest column. Stable on equal-weight ties so the
  // input order still controls vertical position among same-aspect
  // tiles (the "noski up / playdate down" intent).
  const indexed = items.map((c, i) => ({ c, i, w: SPAN_WEIGHT[c.span] }));
  indexed.sort((a, b) => b.w - a.w || a.i - b.i);

  const cols: Clip[][] = Array.from({ length: n }, () => []);
  const heights = new Array(n).fill(0);
  for (const { c, w } of indexed) {
    let shortest = 0;
    for (let i = 1; i < n; i++) if (heights[i] < heights[shortest]) shortest = i;
    cols[shortest].push(c);
    heights[shortest] += w;
  }
  return cols;
}

export function Showcase() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [cols, setCols] = useState(3);
  const open = (clip: Clip) => setOpenIdx(clips.findIndex((c) => c.id === clip.id));
  const close = () => setOpenIdx(null);
  const prev = () => setOpenIdx((i) => (i == null ? 0 : (i - 1 + clips.length) % clips.length));
  const next = () => setOpenIdx((i) => (i == null ? 0 : (i + 1) % clips.length));
  const openClip = openIdx == null ? null : clips[openIdx];

  useEffect(() => {
    const mqlMd = window.matchMedia("(max-width: 720px)");
    const mqlSm = window.matchMedia("(max-width: 480px)");
    const update = () => setCols(mqlSm.matches ? 1 : mqlMd.matches ? 2 : 3);
    update();
    mqlMd.addEventListener("change", update);
    mqlSm.addEventListener("change", update);
    return () => {
      mqlMd.removeEventListener("change", update);
      mqlSm.removeEventListener("change", update);
    };
  }, []);

  const columns = packIntoColumns(clips, cols);

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
        <div className="mosaic mosaic-marquee">
          {columns.map((col, i) => {
            // Per-column duration scales with content height so all columns
            // feel like they're moving at the same speed regardless of how
            // many tiles ended up in each.
            const weight = col.reduce((s, c) => s + SPAN_WEIGHT[c.span], 0);
            const duration = Math.max(40, Math.round(weight * 18));
            const direction = i % 2 === 1 ? "down" : "up";
            return (
              <div className={`mosaic-col mosaic-col--marquee dir-${direction}`} key={i}>
                <div className="mosaic-col-track" style={{ animationDuration: `${duration}s` }}>
                  {[...col, ...col].map((c, j) => (
                    <VideoTile key={`${c.id}-${j}`} clip={c} onOpen={open} />
                  ))}
                </div>
              </div>
            );
          })}
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
          hover a column to pause · click a tile for fullscreen · ← / → to navigate
        </p>
      </div>
      {openClip && <Lightbox clip={openClip} onClose={close} onPrev={prev} onNext={next} />}
    </section>
  );
}
