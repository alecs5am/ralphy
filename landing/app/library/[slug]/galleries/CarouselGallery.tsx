"use client";

// CarouselGallery — one tile per style (issue 060). Each style is a `group`
// whose outputs are its ordered slides. The grid shows each style's cover
// (slide 1) with a slide-count badge; clicking a cover opens an in-place
// swipeable slide-by-slide viewer for THAT style (prev/next + dots + keyboard +
// touch swipe) — no navigation. No visible borders: the viewer separates via a
// bg-tint panel + shadow + spacing.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ShowcaseOutput } from "@/lib/showcase-loader";

interface Series {
  id: string;
  title: string;
  slides: ShowcaseOutput[];
}

function toSeries(outputs: ShowcaseOutput[]): Series[] {
  const order: string[] = [];
  const byId = new Map<string, Series>();
  for (const o of outputs) {
    const id = o.group ?? "series";
    if (!byId.has(id)) {
      byId.set(id, { id, title: o.groupTitle ?? "Series", slides: [] });
      order.push(id);
    }
    byId.get(id)!.slides.push(o);
  }
  return order.map((id) => byId.get(id)!);
}

export function CarouselGallery({ outputs }: { outputs: ShowcaseOutput[] }) {
  const series = toSeries(outputs);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = series.find((s) => s.id === activeId) ?? null;

  return (
    <>
      <div className="grid grid-cols-4 gap-[18px] max-[1100px]:grid-cols-3 max-[760px]:grid-cols-2 max-[460px]:grid-cols-1">
        {series.map((s) => {
          const cover = s.slides[0];
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveId(s.id)}
              className="group/cs block text-left bg-bg-1 hover:bg-bg-2 rounded-[20px] overflow-hidden border-0 cursor-pointer p-0 transition-[background,transform,box-shadow] duration-[220ms] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgb(0_0_0/0.3)] shadow-[0_1px_2px_rgb(0_0_0/0.25)]"
            >
              <div className="relative w-full overflow-hidden" style={{ aspectRatio: cover?.aspect ?? "4 / 5" }}>
                {cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cover.src}
                    alt={s.title}
                    className="w-full h-full object-cover bg-[#050506] transition-transform duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/cs:scale-[1.03]"
                  />
                )}
                <span className="absolute top-3 left-3 font-mono text-[10.5px] tracking-[0.08em] uppercase text-bg bg-ink/85 backdrop-blur-sm px-2.5 py-1 rounded-full">
                  {s.slides.length} slides
                </span>
                <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.08em] uppercase text-ink-3 bg-bg-2/90 backdrop-blur-sm px-2.5 py-1 rounded-full">
                  Open deck
                </span>
              </div>
              <div className="px-4 py-3.5">
                <h3 className="font-display text-[17px] leading-[1.15] m-0 font-semibold text-ink tracking-[-0.01em]">
                  {s.title}
                </h3>
                {cover?.caption && (
                  <p className="text-[12.5px] leading-[1.45] text-ink-3 m-0 mt-1 overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
                    {cover.caption}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {active && <SwipeViewer series={active} onClose={() => setActiveId(null)} />}
    </>
  );
}

function SwipeViewer({ series, onClose }: { series: Series; onClose: () => void }) {
  const [i, setI] = useState(0);
  const total = series.slides.length;
  const go = useCallback(
    (next: number) => setI((c) => Math.min(Math.max(next, 0), total - 1)),
    [total],
  );

  // Scroll the viewer into view + lock scroll-position keyboard nav.
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, go, onClose]);

  // Touch swipe.
  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1);
    touchX.current = null;
  };

  const slide = series.slides[i];

  return (
    <div ref={ref} className="mt-6 bg-bg-1 rounded-[22px] p-4 max-[640px]:p-3 shadow-[0_1px_2px_rgb(0_0_0/0.25)]">
      <div className="flex items-center justify-between gap-3 mb-3.5 px-1">
        <h3 className="font-display text-[18px] leading-[1.15] m-0 font-semibold text-ink tracking-[-0.01em]">
          {series.title}
          <span className="font-mono text-[12px] text-mute tracking-[0.08em] ml-2.5 tabular-nums">
            {i + 1} / {total}
          </span>
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[11px] tracking-[0.1em] uppercase text-ink-3 bg-bg-2 hover:bg-bg-3 hover:text-ink px-3 py-1.5 rounded-full border-0 cursor-pointer transition-colors"
        >
          Close
        </button>
      </div>

      <div
        className="relative grid place-items-center bg-[#050506] rounded-[16px] overflow-hidden"
        style={{ aspectRatio: slide?.aspect ?? "4 / 5", maxHeight: "78vh" }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {slide && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slide.src} alt={slide.caption ?? `Slide ${i + 1}`} className="w-full h-full object-contain" />
        )}
        {i > 0 && (
          <button
            type="button"
            onClick={() => go(i - 1)}
            aria-label="Previous slide"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center rounded-full bg-bg-2/85 backdrop-blur-sm text-ink hover:bg-bg-3 border-0 cursor-pointer transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M11 4.5L6.5 9l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
        {i < total - 1 && (
          <button
            type="button"
            onClick={() => go(i + 1)}
            aria-label="Next slide"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center rounded-full bg-bg-2/85 backdrop-blur-sm text-ink hover:bg-bg-3 border-0 cursor-pointer transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 4.5L11.5 9 7 13.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
      </div>

      {/* Dots */}
      <div className="flex items-center justify-center gap-2 mt-3.5 flex-wrap">
        {series.slides.map((s, idx) => (
          <button
            key={s.id}
            type="button"
            onClick={() => go(idx)}
            aria-label={`Go to slide ${idx + 1}`}
            className={`h-2 rounded-full border-0 cursor-pointer transition-all duration-[200ms] ${
              idx === i ? "w-6 bg-vio" : "w-2 bg-bg-3 hover:bg-mute"
            }`}
          />
        ))}
      </div>

      {slide?.caption && (
        <p className="text-[13px] leading-[1.5] text-ink-3 text-center m-0 mt-3 px-2">{slide.caption}</p>
      )}
    </div>
  );
}
