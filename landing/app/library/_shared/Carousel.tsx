"use client";

// Shared horizontal <Carousel> (#090) — the scroll mechanism for the library
// recommendation rails. Self-contained, ZERO new dependencies: built on native
// CSS scroll-snap + a scroll-container ref (the shadcn carousel base is normally
// embla-carousel-react, but this environment's package registry is flaky, so we
// hand-build the same UX on the platform primitives instead).
//
// Renders ARBITRARY children in a horizontal scroll-snap track. <UnitRail> wraps
// each child in a fixed-width item wrapper (re-supplying the old `.relrail .utile`
// width) so compact cards keep their size. Affordances:
//   - prev/next discs (bg-tint + shadow, accent on hover — NO visible borders;
//     style-matched to the existing `.lb-nav` / OpenIcon chevrons)
//   - scroll-snap (x mandatory, items snap-align: start)
//   - drag-to-scroll (pointer events) + keyboard (←/→ when the track is focused)
//   - wheel passthrough (native horizontal scroll)
//   - end-detection: buttons auto-disable at the ends; both hide when everything
//     already fits (no overflow) — graceful wrap on small counts
//
// SSR-safe: all DOM/measurement runs inside effects + a mount gate; the first
// paint renders the track with both controls hidden, then the mounted effect
// reveals + wires them.

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PrevIcon, NextIcon } from "./icons";

export interface CarouselProps {
  children: React.ReactNode;
  className?: string;
  /** Accessible label for the scroll region. */
  label?: string;
}

export function Carousel({ children, className, label = "Recommendations" }: CarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  // overflows = content is wider than the viewport, so controls are meaningful.
  const [overflows, setOverflows] = useState(false);

  // Re-measure scroll position → control enabled/visible state.
  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const overflowing = max > 1;
    setOverflows(overflowing);
    setCanPrev(el.scrollLeft > 1);
    setCanNext(el.scrollLeft < max - 1);
  }, []);

  // Mount gate — only touch window/document after mount (SSR-safe).
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const el = trackRef.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [mounted, measure, children]);

  // Step ≈ one item width (first child) so prev/next advance card-by-card; fall
  // back to ~80% of the viewport when no child is measurable.
  const step = useCallback((dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const itemW = first ? first.offsetWidth : el.clientWidth * 0.8;
    const gap = parseFloat(getComputedStyle(el).columnGap || "16") || 16;
    el.scrollBy({ left: dir * (itemW + gap), behavior: "smooth" });
  }, []);

  // Keyboard nav when the track region is focused.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      }
    },
    [step],
  );

  // Drag-to-scroll via pointer events. Track a small movement threshold so a
  // click on a card link still works (we only block clicks after a real drag).
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: false });
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only primary button / touch / pen; ignore clicks on the control discs.
    if (e.button !== 0) return;
    const el = trackRef.current;
    if (!el) return;
    drag.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    const el = trackRef.current;
    if (!el) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) {
      if (!d.moved) {
        d.moved = true;
        el.setPointerCapture(e.pointerId);
        el.classList.add("crsl-dragging");
      }
      el.scrollLeft = d.startScroll - dx;
    }
  }, []);

  const endDrag = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    const el = trackRef.current;
    if (d.active && d.moved && el) {
      el.classList.remove("crsl-dragging");
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer may already be released */
      }
    }
    drag.current = { active: false, startX: 0, startScroll: 0, moved: false };
  }, []);

  // Swallow the click that ends a real drag so the underlying card link doesn't
  // navigate when the user was scrubbing the rail.
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const showControls = mounted && overflows;

  return (
    <div className={cn("crsl", className)}>
      <button
        type="button"
        className="crsl-nav prev"
        aria-label="Scroll back"
        hidden={!showControls}
        disabled={!canPrev}
        onClick={() => step(-1)}
      >
        <PrevIcon />
      </button>

      <div
        ref={trackRef}
        className="crsl-track"
        role="region"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>

      <button
        type="button"
        className="crsl-nav next"
        aria-label="Scroll forward"
        hidden={!showControls}
        disabled={!canNext}
        onClick={() => step(1)}
      >
        <NextIcon />
      </button>
    </div>
  );
}
