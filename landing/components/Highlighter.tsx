"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { annotate } from "rough-notation";

type RoughAnnotationType =
  | "underline"
  | "box"
  | "circle"
  | "highlight"
  | "strike-through"
  | "crossed-off"
  | "bracket";

function useAccent() {
  const read = () =>
    (typeof window !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue("--vio").trim()
      : "") || "#FFA630";
  const [val, setVal] = useState<string>(read);
  useEffect(() => {
    const html = document.documentElement;
    const update = () => {
      const next = read();
      setVal((prev) => (prev === next ? prev : next));
    };
    update();
    const mo = new MutationObserver(update);
    mo.observe(html, { attributes: true, attributeFilter: ["style", "class"] });
    return () => mo.disconnect();
  }, []);
  return val;
}

type HighlighterProps = {
  children: ReactNode;
  action?: RoughAnnotationType;
  color?: string;
  strokeWidth?: number;
  animationDuration?: number;
  iterations?: number;
  padding?: number;
  multiline?: boolean;
};

export function Highlighter({
  children,
  action = "underline",
  color,
  strokeWidth = 2,
  animationDuration = 700,
  iterations = 2,
  padding = 2,
  multiline = true,
}: HighlighterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const liveAccent = useAccent();
  const accent = color || liveAccent;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const annotation = annotate(el, {
      type: action,
      color: accent,
      strokeWidth,
      animationDuration,
      iterations,
      padding,
      multiline,
    });
    annotation.show();

    const ro = new ResizeObserver(() => {
      annotation.hide();
      annotation.show();
    });
    ro.observe(el);
    ro.observe(document.body);

    return () => {
      annotation.remove();
      ro.disconnect();
    };
  }, [action, accent, strokeWidth, animationDuration, iterations, padding, multiline]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-block", background: "transparent" }}>
      {children}
    </span>
  );
}
