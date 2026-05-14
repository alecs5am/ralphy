"use client";

import { useEffect, useState } from "react";

const PX: Record<string, string | null> = {
  ".": null,
  O: "#F5F5F4",
  E: "#0A0A0B",
  T: "var(--vio)",
  t: "var(--vio-3)",
};

const FRAMES: Record<string, string[]> = {
  faceIdle: [
    "...............",
    "....OOOOOOO....",
    "..OOOOOOOOOOO..",
    ".OOOOOOOOOOOOO.",
    ".OOOOOOOOOOOOO.",
    "OOOOOOOOOOOOOOO",
    "OOOEEOOOOOEEOOO",
    "OOOEEOOOOOEEOOO",
    "OOOOOOOOOOOOOOO",
    "OOOOOEEEEEOOOOO",
    "OOOOOOOOOOOOOOO",
    ".OOOOOOOOOOOOO.",
    ".OOOOOOOOOOOOO.",
    "..OOOOOOOOOOO..",
    "....OOOOOOO....",
  ],
  faceBlink: [
    "...............",
    "....OOOOOOO....",
    "..OOOOOOOOOOO..",
    ".OOOOOOOOOOOOO.",
    ".OOOOOOOOOOOOO.",
    "OOOOOOOOOOOOOOO",
    "OOOOOOOOOOOOOOO",
    "OOOEEOOOOOEEOOO",
    "OOOOOOOOOOOOOOO",
    "OOOOOEEEEEOOOOO",
    "OOOOOOOOOOOOOOO",
    ".OOOOOOOOOOOOO.",
    ".OOOOOOOOOOOOO.",
    "..OOOOOOOOOOO..",
    "....OOOOOOO....",
  ],
  body: [
    "..................",
    "..........T.......",
    "..........T.......",
    "..........t.......",
    "....OOOOOOOOOO....",
    "..OOOOOOOOOOOOOO..",
    ".OOOOOOOOOOOOOOOO.",
    "OOOOOOOOOOOOOOOOOO",
    "OOOOEEOOOOOOEEOOOO",
    "OOOOEEOOOOOOEEOOOO",
    "OOOOOOOOOOOOOOOOOO",
    "OOOOOOOOOOOOOOOOOO",
    "OOOOOOEEEEEEOOOOOO",
    "OOOOOOOOOOOOOOOOOO",
    ".OOOOOOOOOOOOOOOO.",
    "..OOOOOOOOOOOOOO..",
    "....OOOOOOOOOO....",
    "..................",
  ],
};

export function PixelFrame({ frame, size = 24 }: { frame: keyof typeof FRAMES; size?: number }) {
  const rows = FRAMES[frame] || FRAMES.faceIdle;
  const H = rows.length;
  const W = rows[0].length;
  const rects: React.JSX.Element[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = rows[y][x];
      const color = PX[ch];
      if (!color) continue;
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={color} />);
    }
  }
  return (
    <svg
      className="mascot-svg"
      viewBox={`0 0 ${W} ${H}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-label="Ralphy"
    >
      {rects}
    </svg>
  );
}

export function MascotGlyph({ size = 64 }: { size?: number }) {
  const [frame, setFrame] = useState<keyof typeof FRAMES>("faceIdle");
  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const tick = () => {
      if (!alive) return;
      const wait = 3000 + Math.random() * 3000;
      const t = setTimeout(() => {
        if (!alive) return;
        setFrame("faceBlink");
        const back = setTimeout(() => {
          if (!alive) return;
          setFrame("faceIdle");
          tick();
        }, 140);
        timers.push(back);
      }, wait);
      timers.push(t);
    };
    tick();
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, []);
  return <PixelFrame frame={frame} size={size} />;
}
